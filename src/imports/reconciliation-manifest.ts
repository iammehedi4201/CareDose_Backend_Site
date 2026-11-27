import {
  canonicalizeBrandName,
  canonicalizeManufacturer,
  canonicalizeStrengthTokens,
  ExistingBrandRecord,
  extractReleaseMarker,
  normalizeDosageFormKey,
  normalizeSearchKey,
  normalizeStrengthKey,
  normalizeWhitespace,
  slugifyText,
  splitGenericIngredients,
} from './reconciliation-normalizer';
import { CsvMedicineRow, parseCsvPriceBlock } from './reconciliation-parsers';
import type { ExistingGenericRecord } from './reconciliation.service';

export interface ApprovedGenericManifestItem {
  sourceId: string;
  idSource: 'listing_text';
  name: string;
  normalizedName: string;
  slug: string;
  isCombination: boolean;
  ingredients: string[];
  referencedByBrandCount: number;
}

export interface ApprovedBrandManifestItem {
  sourceId: string;
  name: string;
  normalizedName: string;
  genericResolution:
    | 'EXISTING_EXACT'
    | 'EXISTING_DUPLICATE_GROUP_SITE_PREFERRED'
    | 'EXISTING_EQUIVALENT_MAPPED'
    | 'NEW_VERIFIED_GENERIC';
  targetGenericSourceId: string;
  targetGenericName: string;
  strength: string | null;
  strengthNorm: string | null;
  dosageForm: string;
  dosageFormNorm: string;
  manufacturer: string;
  manufacturerSourceId: string | null;
  category: string;
  releaseMarker: string | null;
  productUrl: string;
  isDistinctDosageFormVariation: boolean;
}

export interface ApprovedPackManifestItem {
  brandSourceId: string;
  brandName: string;
  packQuantity: string | null;
  packUnits: number | null;
  stripUnits: number | null;
  unitPrice: string | null;
  packPrice: string | null;
  currency: 'BDT';
  unitPriceLabel: string | null;
  priceSource: 'brand_page';
  sourceUrl: string;
}

export interface ExcludedManifestItem {
  brandId: string;
  brandName: string;
  strength: string;
  dosageForm: string;
  generic: string;
  manufacturer: string;
  exclusionCategory:
    | 'BORDERLINE_FORM_EQUIVALENT'
    | 'INTRA_CSV_SAME_MFR_DUPLICATE'
    | 'UNCERTAIN_GENERIC_RELATIONSHIP'
    | 'MISSING_REQUIRED_FIELD';
  reason: string;
  relatedDbOrIncomingInfo?: unknown;
}

export interface FinalManifestResult {
  approvedBrands: ApprovedBrandManifestItem[];
  approvedGenerics: ApprovedGenericManifestItem[];
  approvedPacks: ApprovedPackManifestItem[];
  excludedRecords: ExcludedManifestItem[];
  summary: {
    inputCandidates: number;
    approvedBrandsCount: number;
    approvedDistinctFormVariationsCount: number;
    approvedBlankStrengthCount: number;
    approvedNewGenericsCount: number;
    approvedExistingExactGenericLinksCount: number;
    approvedExistingDupGroupSiteLinksCount: number;
    approvedExistingEquivalentMappedLinksCount: number;
    approvedPacksCount: number;
    brandsWithoutPacksCount: number;
    excludedBrandsCount: number;
    excludedBreakdown: Record<string, number>;
    duplicatePacksSkippedCount: number;
    packWarningsSkippedCount: number;
  };
}

const BORDERLINE_FORM_FAMILIES = new Map<string, string>([
  ['inhaler', 'inhaler_mdi'],
  ['metered-dose inhaler (mdi)', 'inhaler_mdi'],
  ['respirator solution', 'nebuliser_solution'],
  ['nebuliser solution', 'nebuliser_solution'],
  ['oral suspension', 'liquid_oral_suspension_syrup'],
  ['syrup', 'liquid_oral_suspension_syrup'],
]);

const KNOWN_SAFE_EQUIVALENT_GENERICS: ReadonlyArray<{
  csvName: string;
  dbNormalizedName: string;
}> = [
  {
    csvName: 'Amino Acid + D-Sorbitol + Electrolytes',
    dbNormalizedName: 'amino acid, d-sorbitol & electrolytes',
  },
  {
    csvName: 'Ispaghula [Psyllium] Husk',
    dbNormalizedName: 'ispaghula husk [psyllium]',
  },
];

function stripParensAndBrackets(value: string): string {
  return value.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenizeAlphaNum(value: string): string[] {
  return (stripParensAndBrackets(value).toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(Boolean);
}

/**
 * Checks whether an unmatched generic has a potential equivalence, route-split, salt, or token
 * overlap with an existing DB generic that requires holding it out for manual review.
 */
function findGenericOverlapCandidates(
  csvGeneric: string,
  dbGenerics: ExistingGenericRecord[],
): Array<{ sourceId: string; name: string }> {
  const incBase = stripParensAndBrackets(csvGeneric).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const incTokens = new Set(tokenizeAlphaNum(csvGeneric));
  const incIngredients = splitGenericIngredients(csvGeneric);
  const hits: Array<{ sourceId: string; name: string }> = [];

  for (const dbg of dbGenerics) {
    const dbBase = stripParensAndBrackets(dbg.name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const dbTokens = new Set(tokenizeAlphaNum(dbg.name));
    const dbIngredients = splitGenericIngredients(dbg.name);

    // 1. Base-name exact match (e.g. Gatifloxacin (Oral) vs Gatifloxacin, Biphasic Insulin Aspart [rDNA] vs Biphasic Insulin Aspart)
    if (incBase && incBase === dbBase) {
      hits.push({ sourceId: dbg.sourceId, name: dbg.name });
      continue;
    }

    // 2. Identical token set regardless of order (e.g. Ethinyl Estradiol + Drospirenone vs Drospirenone + Ethinyl Estradiol)
    if (incTokens.size > 0 && incTokens.size === dbTokens.size && [...incTokens].every((t) => dbTokens.has(t))) {
      hits.push({ sourceId: dbg.sourceId, name: dbg.name });
      continue;
    }

    // 3. Single-ingredient substring/salt overlap (e.g. Neratinib vs Neratinib Maleate)
    if (incIngredients.length === 1 && dbIngredients.length === 1 && incTokens.size === 1 && dbTokens.size === 1) {
      const a = [...incTokens][0];
      const b = [...dbTokens][0];
      if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) {
        hits.push({ sourceId: dbg.sourceId, name: dbg.name });
        continue;
      }
    }

    // 4. Multi-token subset overlap with <= 1 extra qualifier word (e.g. Hepatitis A Vaccine vs Inactivated Hepatitis A vaccine, Folinic Acid)
    if (
      incIngredients.length === dbIngredients.length &&
      incTokens.size >= 2 &&
      dbTokens.size >= 2
    ) {
      const incInDb = [...incTokens].every((t) => dbTokens.has(t)) && dbTokens.size - incTokens.size <= 1;
      const dbInInc = [...dbTokens].every((t) => incTokens.has(t)) && incTokens.size - dbTokens.size <= 1;
      if (incInDb || dbInInc) {
        hits.push({ sourceId: dbg.sourceId, name: dbg.name });
        continue;
      }
    }

    // 5. Known synonym bracketed name (e.g. Calcium Folinate [Folinic Acid] -> Folinic Acid)
    const bracketMatches = csvGeneric.match(/\[([^\]]+)\]/g) ?? [];
    for (const br of bracketMatches) {
      const inner = br.slice(1, -1).toLowerCase().trim();
      if (inner.length >= 5 && dbg.normalizedName === inner) {
        hits.push({ sourceId: dbg.sourceId, name: dbg.name });
        break;
      }
    }
  }

  return hits;
}

/**
 * Resolves the exact verified generic mapping for a candidate brand, preferring `idSource: 'site'`
 * for existing DB duplicate generic groups and rejecting any uncertain generic relationships.
 */
function resolveGenericStrict(
  csvGenericName: string,
  dbGenericsByNorm: Map<string, ExistingGenericRecord[]>,
  allDbGenerics: ExistingGenericRecord[],
):
  | {
      status: 'APPROVED';
      resolution: ApprovedBrandManifestItem['genericResolution'];
      sourceId: string;
      name: string;
      isNew: boolean;
    }
  | {
      status: 'UNCERTAIN';
      reason: string;
      candidates: Array<{ sourceId: string; name: string }>;
    } {
  const norm = normalizeSearchKey(csvGenericName);
  const exactHits = dbGenericsByNorm.get(norm);
  if (exactHits && exactHits.length > 0) {
    if (exactHits.length === 1) {
      return {
        status: 'APPROVED',
        resolution: 'EXISTING_EXACT',
        sourceId: exactHits[0].sourceId,
        name: exactHits[0].name,
        isNew: false,
      };
    }
    // Prefer idSource === 'site' among existing DB duplicate generic groups (never merge existing rows)
    const sorted = [...exactHits].sort((a, b) => {
      if (a.idSource === 'site' && b.idSource !== 'site') return -1;
      if (a.idSource !== 'site' && b.idSource === 'site') return 1;
      return a.sourceId.localeCompare(b.sourceId);
    });
    return {
      status: 'APPROVED',
      resolution: 'EXISTING_DUPLICATE_GROUP_SITE_PREFERRED',
      sourceId: sorted[0].sourceId,
      name: sorted[0].name,
      isNew: false,
    };
  }

  // Check explicit 1-to-1 formatting equivalents
  for (const eq of KNOWN_SAFE_EQUIVALENT_GENERICS) {
    if (norm === normalizeSearchKey(eq.csvName)) {
      const eqHits = dbGenericsByNorm.get(eq.dbNormalizedName);
      if (eqHits && eqHits.length > 0) {
        const chosen = eqHits.find((g) => g.idSource === 'site') ?? eqHits[0];
        return {
          status: 'APPROVED',
          resolution: 'EXISTING_EQUIVALENT_MAPPED',
          sourceId: chosen.sourceId,
          name: chosen.name,
          isNew: false,
        };
      }
    }
  }

  // Reject any unmatched generic with potential DB overlap / route-split / salt-variant ambiguity
  const overlaps = findGenericOverlapCandidates(csvGenericName, allDbGenerics);
  if (overlaps.length > 0) {
    return {
      status: 'UNCERTAIN',
      reason: `Potential equivalent, route-qualified, salt, or word-order variant of existing DB generic(s): ${overlaps.map((o) => `${o.name} [${o.sourceId}]`).slice(0, 3).join('; ')}`,
      candidates: overlaps.slice(0, 5),
    };
  }

  return {
    status: 'APPROVED',
    resolution: 'NEW_VERIFIED_GENERIC',
    sourceId: `listing:${slugifyText(csvGenericName)}`,
    name: csvGenericName,
    isNew: true,
  };
}

/**
 * Builds the strictly verified final pre-execution manifest from safe allopathic candidates,
 * ensuring zero ambiguous generics, zero borderline form renames, zero intra-batch duplicates,
 * and zero inconsistent packs.
 */
export function buildFinalApprovedManifest(params: {
  candidates: CsvMedicineRow[];
  existingBrands: ExistingBrandRecord[];
  existingGenerics: ExistingGenericRecord[];
  manufacturerIds: Map<string, string>;
}): FinalManifestResult {
  const { candidates, existingBrands, existingGenerics, manufacturerIds } = params;

  const dbGenericsByNorm = new Map<string, ExistingGenericRecord[]>();
  for (const g of existingGenerics) {
    const list = dbGenericsByNorm.get(g.normalizedName) ?? [];
    list.push(g);
    dbGenericsByNorm.set(g.normalizedName, list);
  }

  const dbBrandsByNameStrength = new Map<string, ExistingBrandRecord[]>();
  for (const b of existingBrands) {
    const key = `${canonicalizeBrandName(b.name)}|${canonicalizeStrengthTokens(b.strengthNorm ?? b.strength)}`;
    const list = dbBrandsByNameStrength.get(key) ?? [];
    list.push(b);
    dbBrandsByNameStrength.set(key, list);
  }

  // Detect intra-CSV same-manufacturer duplicates among candidates
  const intraCsvGroups = new Map<string, CsvMedicineRow[]>();
  for (const row of candidates) {
    const key = `${canonicalizeBrandName(row.brandName)}|${canonicalizeStrengthTokens(row.strength)}|${normalizeDosageFormKey(row.dosageForm)}|${canonicalizeManufacturer(row.manufacturer)}`;
    const list = intraCsvGroups.get(key) ?? [];
    list.push(row);
    intraCsvGroups.set(key, list);
  }
  const intraDuplicateIds = new Set<string>();
  for (const group of intraCsvGroups.values()) {
    if (group.length > 1) {
      for (const item of group) {
        intraDuplicateIds.add(item.brandId);
      }
    }
  }

  const approvedBrands: ApprovedBrandManifestItem[] = [];
  const approvedGenericsMap = new Map<string, ApprovedGenericManifestItem>();
  const approvedPacks: ApprovedPackManifestItem[] = [];
  const excludedRecords: ExcludedManifestItem[] = [];
  const excludedBreakdown: Record<string, number> = {};

  let approvedDistinctFormVariationsCount = 0;
  let approvedBlankStrengthCount = 0;
  let approvedExistingExactGenericLinksCount = 0;
  let approvedExistingDupGroupSiteLinksCount = 0;
  let approvedExistingEquivalentMappedLinksCount = 0;
  let brandsWithoutPacksCount = 0;
  let duplicatePacksSkippedCount = 0;
  let packWarningsSkippedCount = 0;

  const recordExclusion = (item: ExcludedManifestItem) => {
    excludedRecords.push(item);
    excludedBreakdown[item.exclusionCategory] = (excludedBreakdown[item.exclusionCategory] ?? 0) + 1;
  };

  for (const row of candidates) {
    if (!row.brandId || !row.brandName || !row.dosageForm || !row.generic || !row.manufacturer) {
      recordExclusion({
        brandId: row.brandId,
        brandName: row.brandName,
        strength: row.strength,
        dosageForm: row.dosageForm,
        generic: row.generic,
        manufacturer: row.manufacturer,
        exclusionCategory: 'MISSING_REQUIRED_FIELD',
        reason: 'Missing required brandId, brandName, dosageForm, generic, or manufacturer',
      });
      continue;
    }

    // 1. Exclude intra-CSV same-manufacturer collisions (e.g. Lopidam 50ml/100ml, Orabex 2ml/10ml, Ryzodeg PenFill/FlexTouch)
    if (intraDuplicateIds.has(row.brandId)) {
      const k = `${canonicalizeBrandName(row.brandName)}|${canonicalizeStrengthTokens(row.strength)}|${normalizeDosageFormKey(row.dosageForm)}|${canonicalizeManufacturer(row.manufacturer)}`;
      recordExclusion({
        brandId: row.brandId,
        brandName: row.brandName,
        strength: row.strength,
        dosageForm: row.dosageForm,
        generic: row.generic,
        manufacturer: row.manufacturer,
        exclusionCategory: 'INTRA_CSV_SAME_MFR_DUPLICATE',
        reason: 'Multiple MedEx CSV records share identical brand + strength + dosageForm + manufacturer (differ only by container/device)',
        relatedDbOrIncomingInfo: (intraCsvGroups.get(k) ?? []).map((x) => ({
          brandId: x.brandId,
          packageContainer: x.packageContainer,
        })),
      });
      continue;
    }

    // 2. Check borderline dosage-form equivalence against existing DB brands with same name+strength
    const nsKey = `${canonicalizeBrandName(row.brandName)}|${canonicalizeStrengthTokens(row.strength)}`;
    const sameNameStrDb = dbBrandsByNameStrength.get(nsKey) ?? [];
    const incFormFamily = BORDERLINE_FORM_FAMILIES.get(normalizeDosageFormKey(row.dosageForm));
    const borderlineHit = incFormFamily
      ? sameNameStrDb.find(
          (b) =>
            BORDERLINE_FORM_FAMILIES.get(normalizeDosageFormKey(b.dosageFormNorm ?? b.dosageForm)) ===
            incFormFamily,
        )
      : undefined;

    if (borderlineHit) {
      recordExclusion({
        brandId: row.brandId,
        brandName: row.brandName,
        strength: row.strength,
        dosageForm: row.dosageForm,
        generic: row.generic,
        manufacturer: row.manufacturer,
        exclusionCategory: 'BORDERLINE_FORM_EQUIVALENT',
        reason: `Dosage form "${row.dosageForm}" likely represents a MedEx label rename of existing DB form "${borderlineHit.dosageForm}" (${borderlineHit.sourceId})`,
        relatedDbOrIncomingInfo: {
          dbSourceId: borderlineHit.sourceId,
          dbDosageForm: borderlineHit.dosageForm,
          dbManufacturer: borderlineHit.manufacturer,
        },
      });
      continue;
    }

    // 3. Strict Generic Verification
    const genRes = resolveGenericStrict(row.generic, dbGenericsByNorm, existingGenerics);
    if (genRes.status === 'UNCERTAIN') {
      recordExclusion({
        brandId: row.brandId,
        brandName: row.brandName,
        strength: row.strength,
        dosageForm: row.dosageForm,
        generic: row.generic,
        manufacturer: row.manufacturer,
        exclusionCategory: 'UNCERTAIN_GENERIC_RELATIONSHIP',
        reason: genRes.reason,
        relatedDbOrIncomingInfo: genRes.candidates,
      });
      continue;
    }

    if (genRes.isNew) {
      const existingNew = approvedGenericsMap.get(genRes.sourceId);
      if (existingNew) {
        existingNew.referencedByBrandCount += 1;
      } else {
        const ingredients = splitGenericIngredients(genRes.name);
        approvedGenericsMap.set(genRes.sourceId, {
          sourceId: genRes.sourceId,
          idSource: 'listing_text',
          name: genRes.name,
          normalizedName: normalizeSearchKey(genRes.name),
          slug: slugifyText(genRes.name),
          isCombination: ingredients.length > 1,
          ingredients,
          referencedByBrandCount: 1,
        });
      }
    } else if (genRes.resolution === 'EXISTING_EXACT') {
      approvedExistingExactGenericLinksCount += 1;
    } else if (genRes.resolution === 'EXISTING_DUPLICATE_GROUP_SITE_PREFERRED') {
      approvedExistingDupGroupSiteLinksCount += 1;
    } else if (genRes.resolution === 'EXISTING_EQUIVALENT_MAPPED') {
      approvedExistingEquivalentMappedLinksCount += 1;
    }

    const strength = normalizeWhitespace(row.strength) || null;
    const isDistinctVariation = sameNameStrDb.length > 0;
    if (isDistinctVariation) approvedDistinctFormVariationsCount += 1;
    if (!strength) approvedBlankStrengthCount += 1;

    const productUrl = row.slug
      ? `https://medex.com.bd/brands/${row.brandId}/${row.slug}`
      : `https://medex.com.bd/brands/${row.brandId}`;

    approvedBrands.push({
      sourceId: row.brandId,
      name: row.brandName,
      normalizedName: normalizeSearchKey(row.brandName),
      genericResolution: genRes.resolution,
      targetGenericSourceId: genRes.sourceId,
      targetGenericName: genRes.name,
      strength,
      strengthNorm: normalizeStrengthKey(strength) || null,
      dosageForm: row.dosageForm,
      dosageFormNorm: normalizeDosageFormKey(row.dosageForm),
      manufacturer: row.manufacturer,
      manufacturerSourceId: manufacturerIds.get(row.manufacturer) ?? null,
      category: 'allopathic',
      releaseMarker: extractReleaseMarker(row.brandName),
      productUrl,
      isDistinctDosageFormVariation: isDistinctVariation,
    });

    // 4. Strict Pack Verification (no guessed/inferred stripUnits; deduplicate identical packs)
    const parsedPacks = parseCsvPriceBlock(row.packageContainer);
    const seenPackKeys = new Set<string>();
    let brandPackCount = 0;

    for (const pk of parsedPacks) {
      if (pk.warnings.length > 0) {
        packWarningsSkippedCount += 1;
        continue;
      }
      if (pk.unitPrice === null && pk.packPrice === null && !pk.packQuantity) {
        continue;
      }
      const unitStr = pk.unitPrice !== null ? pk.unitPrice.toFixed(2) : null;
      const packStr = pk.packPrice !== null ? pk.packPrice.toFixed(2) : null;
      const pkKey = `${row.brandId}|${pk.packQuantity ?? ''}|${pk.packUnits ?? ''}|${unitStr ?? ''}|${packStr ?? ''}`;
      if (seenPackKeys.has(pkKey)) {
        duplicatePacksSkippedCount += 1;
        continue;
      }
      seenPackKeys.add(pkKey);
      brandPackCount += 1;

      approvedPacks.push({
        brandSourceId: row.brandId,
        brandName: row.brandName,
        packQuantity: pk.packQuantity,
        packUnits: pk.packUnits,
        stripUnits: pk.stripUnits,
        unitPrice: unitStr,
        packPrice: packStr,
        currency: 'BDT',
        unitPriceLabel: unitStr !== null ? 'Unit Price' : null,
        priceSource: 'brand_page',
        sourceUrl: productUrl,
      });
    }

    if (brandPackCount === 0) {
      brandsWithoutPacksCount += 1;
    }
  }

  const approvedGenerics = Array.from(approvedGenericsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return {
    approvedBrands,
    approvedGenerics,
    approvedPacks,
    excludedRecords,
    summary: {
      inputCandidates: candidates.length,
      approvedBrandsCount: approvedBrands.length,
      approvedDistinctFormVariationsCount,
      approvedBlankStrengthCount,
      approvedNewGenericsCount: approvedGenerics.length,
      approvedExistingExactGenericLinksCount,
      approvedExistingDupGroupSiteLinksCount,
      approvedExistingEquivalentMappedLinksCount,
      approvedPacksCount: approvedPacks.length,
      brandsWithoutPacksCount,
      excludedBrandsCount: excludedRecords.length,
      excludedBreakdown,
      duplicatePacksSkippedCount,
      packWarningsSkippedCount,
    },
  };
}
