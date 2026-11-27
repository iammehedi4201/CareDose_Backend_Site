/**
 * Normalization and multi-tier identity matching utilities for CareDose medicine reconciliation.
 *
 * IMPORTANT: Canonical/normalized keys produced here are strictly for matching and deduplication
 * checks. They must NEVER replace original display names, dosage forms, or generic labels.
 */

const CORPORATE_SUFFIX_RE =
  /\b(ltd|limited|plc|inc|corp|co|laboratories|laboratory|lab|pharma|pharmaceuticals|pharmaceutical|healthcare|drug|drugs|industries|chemical|works)\b\.?/gi;

const RELEASE_MARKER_RE =
  /\b(SR|XR|XL|ER|CR|MR|PR|DR|LA|ODT|MUPS)\b|\bretard\b|\bdepot\b/i;

/**
 * Normalizes Unicode (NFKC) and collapses whitespace without altering letter case or punctuation.
 */
export function normalizeWhitespace(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.normalize('NFKC').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Produces a lowercase, whitespace-collapsed string matching CareDose's `normalizedName` column.
 */
export function normalizeSearchKey(value: string | null | undefined): string {
  return normalizeWhitespace(value).toLowerCase();
}

/**
 * Produces a punctuation-stripped canonical key (`A Cal`, `A-Cal`, `ACal` -> `acal`) for matching only.
 */
export function canonicalizeBrandName(value: string | null | undefined): string {
  const norm = normalizeWhitespace(value).toLowerCase().replace(/&/g, ' and ');
  return norm.replace(/[^a-z0-9]+/g, '');
}

/**
 * Normalizes a numeric decimal literal inside strengths (e.g. `0.50%` -> `0.5%`, `20.0mg` -> `20mg`).
 */
function trimNumericToken(numStr: string): string {
  const num = Number(numStr);
  if (!Number.isFinite(num)) {
    return numStr;
  }
  return String(num);
}

/**
 * Normalizes medicine strength strings into a comparable key while preserving combination constituents.
 * Example: `'20 mg'` -> `'20mg'`, `'0.50%'` -> `'0.5%'`, `'500 mg + 125 mg'` -> `'500mg+125mg'`.
 */
export function normalizeStrengthKey(value: string | null | undefined): string {
  const cleaned = normalizeWhitespace(value).toLowerCase();
  if (!cleaned) {
    return '';
  }
  const compact = cleaned.replace(/\s+/g, '');
  return compact.replace(/\d+\.\d+/g, (match) => trimNumericToken(match));
}

/**
 * Canonicalizes strength tokens order-independently for combination comparison (e.g. `A+B` vs `B+A`).
 */
export function canonicalizeStrengthTokens(value: string | null | undefined): string {
  const key = normalizeStrengthKey(value);
  if (!key) {
    return '';
  }
  if (key.includes('+') && !key.includes('/')) {
    return key.split('+').filter(Boolean).sort().join('+');
  }
  return key;
}

const DOSAGE_FORM_SYNONYM_GROUPS: ReadonlyArray<{ family: string; patterns: RegExp[] }> = [
  {
    family: 'ophthalmic_solution',
    patterns: [/^eye\s*drops?$/i, /^ophthalmic\s+solution$/i],
  },
  {
    family: 'ophthalmic_ointment',
    patterns: [/^eye\s*ointment$/i, /^ophthalmic\s+ointment$/i],
  },
  {
    family: 'ophthalmic_gel',
    patterns: [/^eye\s*gel$/i, /^ophthalmic\s+gel$/i],
  },
  {
    family: 'delayed_release_capsule',
    patterns: [/^capsule\s*\((?:delayed\s+release|enteric\s+coated)\)$/i],
  },
  {
    family: 'delayed_release_tablet',
    patterns: [/^tablet\s*\((?:delayed\s+release|enteric\s+coated)\)$/i],
  },
  {
    family: 'pediatric_drops',
    patterns: [/^p(?:a)?ediatric\s+drops?$/i],
  },
  {
    family: 'oral_suspension',
    patterns: [/^(?:oral\s+)?suspension$/i],
  },
  {
    family: 'injection_generic',
    patterns: [/^(?:iv|im|sc|iv\/im|im\/iv)?\s*injection$/i],
  },
];

/**
 * Normalizes dosage form text (`normalizeSearchKey`) and maps known equivalent form families
 * for verification without merging distinct dosage forms automatically.
 */
export function normalizeDosageFormKey(value: string | null | undefined): string {
  return normalizeSearchKey(value);
}

/**
 * Maps a dosage form into a broader semantic family (used only in Tier 4 dosage-form verification).
 */
export function getDosageFormFamily(value: string | null | undefined): string {
  const norm = normalizeDosageFormKey(value);
  if (!norm) {
    return '';
  }
  for (const entry of DOSAGE_FORM_SYNONYM_GROUPS) {
    if (entry.patterns.some((re) => re.test(norm))) {
      return entry.family;
    }
  }
  return norm.replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Extracts modified-release marker (`SR`, `XR`, `MUPS`, etc.) from a brand name if present.
 */
export function extractReleaseMarker(brandName: string | null | undefined): string | null {
  const text = normalizeWhitespace(brandName);
  if (!text) {
    return null;
  }
  const match = text.match(RELEASE_MARKER_RE);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Normalizes manufacturer names by stripping legal/corporate suffixes for comparison only.
 */
export function canonicalizeManufacturer(value: string | null | undefined): string {
  const base = normalizeWhitespace(value)
    .toLowerCase()
    .replace(CORPORATE_SUFFIX_RE, ' ');
  return base.replace(/[^a-z0-9]+/g, '');
}

/**
 * Splits a generic name into constituent active ingredients if it is a combination (`+`),
 * preserving individual ingredient names.
 */
export function splitGenericIngredients(value: string | null | undefined): string[] {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) {
    return [];
  }
  return cleaned
    .split(/\s*\+\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Canonicalizes a generic name for comparison (`normalizeWhitespace` + lowercase + collapsed punctuation).
 * Combination ingredients remain separated by `+`.
 */
export function canonicalizeGenericName(value: string | null | undefined): string {
  const parts = splitGenericIngredients(value);
  if (parts.length === 0) {
    return '';
  }
  return parts
    .map((p) => p.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
    .join(' + ');
}

/**
 * Converts a string into a MedEx-compatible slug (`a-z0-9-`).
 */
export function slugifyText(value: string | null | undefined): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Computes normalized Levenshtein similarity in `[0, 1]` for fuzzy review candidate detection.
 */
export function computeStringSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) {
    prev[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    const chA = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const cost = chA === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = curr[j];
    }
  }

  return 1 - prev[b.length] / maxLen;
}

export interface ExistingBrandRecord {
  id: string;
  sourceId: string;
  name: string;
  normalizedName: string;
  genericId: string | null;
  genericName: string | null;
  genericNormalizedName: string | null;
  strength: string | null;
  strengthNorm: string | null;
  dosageForm: string | null;
  dosageFormNorm: string | null;
  manufacturer: string | null;
  category: string;
  releaseMarker: string | null;
}

export interface IncomingBrandCandidate {
  source: 'kaggle_medicine_csv' | 'dims_json' | 'medex';
  sourceId: string;
  name: string;
  genericName: string | null;
  genericSourceId: string | null;
  strength: string | null;
  dosageForm: string | null;
  manufacturer: string | null;
  category: string;
}

export type BrandMatchClassification =
  | 'EXACT_SOURCE_ID_MATCH'
  | 'SOURCE_ID_COLLISION'
  | 'EXACT_ATTRIBUTE_MATCH'
  | 'NORMALIZED_ATTRIBUTE_MATCH'
  | 'DOSAGE_FORM_EQUIVALENT_REVIEW'
  | 'LEGITIMATE_FORM_VARIATION'
  | 'FUZZY_POTENTIAL_DUPLICATE'
  | 'GENUINELY_MISSING';

export interface BrandMatchResult {
  classification: BrandMatchClassification;
  tier: 1 | 2 | 3 | 4 | 5 | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  matchedBrand: ExistingBrandRecord | null;
  relatedBrands: ExistingBrandRecord[];
  reason: string;
  recommendedAction:
    | 'SKIP_ALREADY_PRESENT'
    | 'SAFE_INSERT_NEW_BRAND'
    | 'MANUAL_REVIEW_COLLISION'
    | 'MANUAL_REVIEW_POTENTIAL_DUPLICATE'
    | 'MANUAL_REVIEW_FORM_EQUIVALENT';
}

export interface BrandLookupIndex {
  bySourceId: Map<string, ExistingBrandRecord>;
  byExactAttr: Map<string, ExistingBrandRecord[]>;
  byCanonicalAttr: Map<string, ExistingBrandRecord[]>;
  byCanonicalNameStrength: Map<string, ExistingBrandRecord[]>;
  byCanonicalName: Map<string, ExistingBrandRecord[]>;
  byStrengthCanonicalGeneric: Map<string, ExistingBrandRecord[]>;
}

function pushMap<K, V>(map: Map<K, V[]>, key: K, val: V): void {
  const arr = map.get(key);
  if (arr) {
    arr.push(val);
  } else {
    map.set(key, [val]);
  }
}

function exactAttrKey(name: string, strength: string | null, form: string | null): string {
  return `${normalizeSearchKey(name)}|${normalizeSearchKey(strength)}|${normalizeSearchKey(form)}`;
}

function canonicalAttrKey(name: string, strength: string | null, form: string | null): string {
  return `${canonicalizeBrandName(name)}|${canonicalizeStrengthTokens(strength)}|${normalizeDosageFormKey(form)}`;
}

function canonicalNameStrengthKey(name: string, strength: string | null): string {
  return `${canonicalizeBrandName(name)}|${canonicalizeStrengthTokens(strength)}`;
}

/**
 * Builds multi-key in-memory lookup indexes over existing PostgreSQL `MedicineBrand` records
 * for deterministic O(1)/O(k) matching across all 5 priority tiers.
 */
export function buildBrandLookupIndex(brands: ExistingBrandRecord[]): BrandLookupIndex {
  const bySourceId = new Map<string, ExistingBrandRecord>();
  const byExactAttr = new Map<string, ExistingBrandRecord[]>();
  const byCanonicalAttr = new Map<string, ExistingBrandRecord[]>();
  const byCanonicalNameStrength = new Map<string, ExistingBrandRecord[]>();
  const byCanonicalName = new Map<string, ExistingBrandRecord[]>();
  const byStrengthCanonicalGeneric = new Map<string, ExistingBrandRecord[]>();

  for (const b of brands) {
    bySourceId.set(b.sourceId, b);
    pushMap(byExactAttr, exactAttrKey(b.name, b.strength, b.dosageForm), b);
    pushMap(byCanonicalAttr, canonicalAttrKey(b.name, b.strengthNorm ?? b.strength, b.dosageFormNorm ?? b.dosageForm), b);
    pushMap(byCanonicalNameStrength, canonicalNameStrengthKey(b.name, b.strengthNorm ?? b.strength), b);
    pushMap(byCanonicalName, canonicalizeBrandName(b.name), b);
    if (b.genericName) {
      pushMap(
        byStrengthCanonicalGeneric,
        `${canonicalizeStrengthTokens(b.strengthNorm ?? b.strength)}|${canonicalizeGenericName(b.genericName)}`,
        b,
      );
    }
  }

  return {
    bySourceId,
    byExactAttr,
    byCanonicalAttr,
    byCanonicalNameStrength,
    byCanonicalName,
    byStrengthCanonicalGeneric,
  };
}

function manufacturersCompatible(a: string | null, b: string | null): boolean {
  const ca = canonicalizeManufacturer(a);
  const cb = canonicalizeManufacturer(b);
  if (!ca || !cb) return true;
  return ca === cb || ca.includes(cb) || cb.includes(ca);
}

function strengthsCompatible(a: string | null, b: string | null): boolean {
  return canonicalizeStrengthTokens(a) === canonicalizeStrengthTokens(b);
}

/**
 * Matches an incoming brand record against the PostgreSQL lookup index using strict 5-tier priority.
 * Never merges different dosage forms or different strengths automatically.
 */
export function matchIncomingBrand(
  incoming: IncomingBrandCandidate,
  index: BrandLookupIndex,
  options?: { trustSourceIdSpace?: boolean },
): BrandMatchResult {
  const trustSourceIdSpace = options?.trustSourceIdSpace ?? true;
  const incCanonName = canonicalizeBrandName(incoming.name);
  const incStrengthNorm = canonicalizeStrengthTokens(incoming.strength);
  const incFormNorm = normalizeDosageFormKey(incoming.dosageForm);
  const incFormFamily = getDosageFormFamily(incoming.dosageForm);

  // Tier 1: Exact sourceId match (only when source shares MedEx ID namespace)
  if (trustSourceIdSpace) {
    const byId = index.bySourceId.get(incoming.sourceId);
    if (byId) {
      const dbCanonName = canonicalizeBrandName(byId.name);
      const nameSimilar =
        dbCanonName === incCanonName || computeStringSimilarity(dbCanonName, incCanonName) >= 0.8;
      if (nameSimilar) {
        return {
          classification: 'EXACT_SOURCE_ID_MATCH',
          tier: 1,
          confidence: 'HIGH',
          matchedBrand: byId,
          relatedBrands: [],
          reason: `Matched existing sourceId "${incoming.sourceId}" (${byId.name})`,
          recommendedAction: 'SKIP_ALREADY_PRESENT',
        };
      }
      return {
        classification: 'SOURCE_ID_COLLISION',
        tier: 1,
        confidence: 'HIGH',
        matchedBrand: byId,
        relatedBrands: [],
        reason: `sourceId "${incoming.sourceId}" maps to "${byId.name}" in DB vs "${incoming.name}" in ${incoming.source}`,
        recommendedAction: 'MANUAL_REVIEW_COLLISION',
      };
    }
  }

  // Tier 2: Exact brandName + strength + dosageForm
  const exactMatches = index.byExactAttr.get(
    exactAttrKey(incoming.name, incoming.strength, incoming.dosageForm),
  );
  if (exactMatches && exactMatches.length > 0) {
    const mfrMatch = exactMatches.find((b) => manufacturersCompatible(b.manufacturer, incoming.manufacturer));
    const chosen = mfrMatch ?? exactMatches[0];
    return {
      classification: 'EXACT_ATTRIBUTE_MATCH',
      tier: 2,
      confidence: mfrMatch ? 'HIGH' : 'MEDIUM',
      matchedBrand: chosen,
      relatedBrands: exactMatches,
      reason: mfrMatch
        ? `Exact name + strength + dosageForm + manufacturer match under DB sourceId "${chosen.sourceId}"`
        : `Exact name + strength + dosageForm match under DB sourceId "${chosen.sourceId}" (manufacturer differs: "${chosen.manufacturer}" vs "${incoming.manufacturer}")`,
      recommendedAction: mfrMatch ? 'SKIP_ALREADY_PRESENT' : 'MANUAL_REVIEW_POTENTIAL_DUPLICATE',
    };
  }

  // Tier 3: Normalized canonicalName + strengthNorm + dosageFormNorm
  const normMatches = index.byCanonicalAttr.get(
    canonicalAttrKey(incoming.name, incoming.strength, incoming.dosageForm),
  );
  if (normMatches && normMatches.length > 0) {
    const mfrMatch = normMatches.find((b) => manufacturersCompatible(b.manufacturer, incoming.manufacturer));
    const chosen = mfrMatch ?? normMatches[0];
    return {
      classification: 'NORMALIZED_ATTRIBUTE_MATCH',
      tier: 3,
      confidence: mfrMatch ? 'HIGH' : 'MEDIUM',
      matchedBrand: chosen,
      relatedBrands: normMatches,
      reason: `Normalized name ("${incoming.name}" ~ "${chosen.name}") + strength + dosageForm match`,
      recommendedAction: mfrMatch ? 'SKIP_ALREADY_PRESENT' : 'MANUAL_REVIEW_POTENTIAL_DUPLICATE',
    };
  }

  // Tier 4: Brand name + strength with dosage-form verification
  const sameNameStrength =
    index.byCanonicalNameStrength.get(canonicalNameStrengthKey(incoming.name, incoming.strength)) ?? [];
  if (sameNameStrength.length > 0) {
    const familyMatches = sameNameStrength.filter(
      (b) => getDosageFormFamily(b.dosageFormNorm ?? b.dosageForm) === incFormFamily && incFormFamily !== '',
    );
    if (familyMatches.length > 0) {
      const mfrMatch = familyMatches.find((b) => manufacturersCompatible(b.manufacturer, incoming.manufacturer));
      const chosen = mfrMatch ?? familyMatches[0];
      return {
        classification: 'DOSAGE_FORM_EQUIVALENT_REVIEW',
        tier: 4,
        confidence: 'MEDIUM',
        matchedBrand: chosen,
        relatedBrands: familyMatches,
        reason: `Same brand & strength with equivalent dosage-form family ("${incoming.dosageForm}" vs DB "${chosen.dosageForm}")`,
        recommendedAction: 'MANUAL_REVIEW_FORM_EQUIVALENT',
      };
    }

    // Distinct dosage forms (e.g., AZ 250 mg Tablet vs AZ 250 mg Capsule) must remain separate!
    return {
      classification: 'LEGITIMATE_FORM_VARIATION',
      tier: 4,
      confidence: 'HIGH',
      matchedBrand: null,
      relatedBrands: sameNameStrength,
      reason: `Legitimate distinct dosage form "${incoming.dosageForm}" for existing brand+strength "${incoming.name} ${incoming.strength ?? ''}" (DB has: ${sameNameStrength.map((b) => b.dosageForm).join(', ')})`,
      recommendedAction: 'SAFE_INSERT_NEW_BRAND',
    };
  }

  // Tier 5: Fuzzy matching for potential spelling/formatting variants requiring manual review
  if (incoming.genericName) {
    const genStrKey = `${incStrengthNorm}|${canonicalizeGenericName(incoming.genericName)}`;
    const sameGenStr = index.byStrengthCanonicalGeneric.get(genStrKey) ?? [];
    for (const candidate of sameGenStr) {
      const dbCanon = canonicalizeBrandName(candidate.name);
      const sim = computeStringSimilarity(incCanonName, dbCanon);
      const sameForm =
        normalizeDosageFormKey(candidate.dosageFormNorm ?? candidate.dosageForm) === incFormNorm ||
        getDosageFormFamily(candidate.dosageFormNorm ?? candidate.dosageForm) === incFormFamily;
      if (sim >= 0.82 && sameForm && strengthsCompatible(candidate.strengthNorm ?? candidate.strength, incoming.strength)) {
        return {
          classification: 'FUZZY_POTENTIAL_DUPLICATE',
          tier: 5,
          confidence: 'LOW',
          matchedBrand: candidate,
          relatedBrands: [candidate],
          reason: `Fuzzy brand match (${(sim * 100).toFixed(1)}%): "${incoming.name}" vs DB "${candidate.name}" sharing generic+strength+form`,
          recommendedAction: 'MANUAL_REVIEW_POTENTIAL_DUPLICATE',
        };
      }
    }
  }

  // Also check same brand name with different strengths (informational variation, still genuinely missing strength)
  const sameNameDifferentStrength = index.byCanonicalName.get(incCanonName) ?? [];
  return {
    classification: 'GENUINELY_MISSING',
    tier: null,
    confidence: 'HIGH',
    matchedBrand: null,
    relatedBrands: sameNameDifferentStrength,
    reason:
      sameNameDifferentStrength.length > 0
        ? `Brand name exists in DB under different strength/form (${sameNameDifferentStrength.map((b) => `${b.strength ?? 'N/A'} ${b.dosageForm ?? ''}`).slice(0, 3).join('; ')}); this specific variant is missing`
        : 'No matching brand, sourceId, or fuzzy candidate found in DB',
    recommendedAction: 'SAFE_INSERT_NEW_BRAND',
  };
}
