import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { normalizeWhitespace } from './reconciliation-normalizer';

export interface CsvMedicineRow {
  brandId: string;
  brandName: string;
  type: string;
  slug: string;
  dosageForm: string;
  generic: string;
  strength: string;
  manufacturer: string;
  packageContainer: string;
  packageSize: string;
}

export interface CsvGenericRow {
  genericId: string;
  genericName: string;
  slug: string;
  monographLink: string;
  drugClass: string;
  indication: string;
}

export interface DimsBrandRecord {
  brand_id: string;
  generic_id: string;
  company_id: string;
  brand_name: string;
  form: string;
  strength: string;
  price: string;
  packsize: string;
}

export interface DimsGenericRecord {
  generic_id: string;
  generic_name: string;
}

export interface DimsCompanyRecord {
  company_id: string;
  company_name: string;
}

export interface DimsDataset {
  brands: DimsBrandRecord[];
  generics: DimsGenericRecord[];
  companies: DimsCompanyRecord[];
}

export interface ParsedPackEntry {
  packQuantity: string | null;
  packUnits: number | null;
  stripUnits: number | null;
  unitPrice: number | null;
  packPrice: number | null;
  warnings: string[];
}

/**
 * RFC-4180 compliant CSV parser supporting quoted fields, embedded newlines, and escaped quotes.
 */
export function parseCsvRecords(content: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((h) => h.trim());
  const records: Array<Record<string, string>> = [];
  for (let r = 1; r < rows.length; r += 1) {
    const vals = rows[r];
    if (vals.length === 1 && vals[0].trim() === '') {
      continue;
    }
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c += 1) {
      obj[headers[c]] = vals[c] ?? '';
    }
    records.push(obj);
  }
  return records;
}

const PACK_CONTAINER_RE = '(?:pack|strip|blister|can|tin|pot|box|kit|combipack)';
const UNIT_NOUN_RE = '(?:tablets?|tabs?|capsules?|caps?|amps?|ampoules?|vials?|sachets?)';

/**
 * Extracts discrete unit counts from pack labels (returns null for volume/weight labels).
 */
export function parsePackUnits(label: string | null | undefined): number | null {
  const clean = (label ?? '').trim();
  if (!clean) return null;

  const multMatch = clean.match(
    new RegExp(`^(\\d+)\\s*x\\s*(\\d+)(?:'s|’s)?(?:\\s+${PACK_CONTAINER_RE})?$`, 'i'),
  );
  if (multMatch) {
    return Number(multMatch[1]) * Number(multMatch[2]);
  }

  const xTailMatch = clean.match(
    new RegExp(`^.+\\bx\\s*(\\d+)(?:'s|’s)(?:\\s+${PACK_CONTAINER_RE})?$`, 'i'),
  );
  if (xTailMatch) {
    return Number(xTailMatch[1]);
  }

  const plainCountMatch = clean.match(
    new RegExp(`^(\\d+)(?:(?:'s|’s)(?:\\s+${PACK_CONTAINER_RE})?)?$`, 'i'),
  );
  if (plainCountMatch) {
    return Number(plainCountMatch[1]);
  }

  const nounMatch = clean.match(
    new RegExp(`^(\\d+)\\s+${UNIT_NOUN_RE}(?:\\s+${PACK_CONTAINER_RE})?$`, 'i'),
  );
  if (nounMatch) {
    return Number(nounMatch[1]);
  }

  const piecesMatch = clean.match(/^(\d+)\s+pieces?(?:\s+foil)?\s+pack$/i);
  return piecesMatch ? Number(piecesMatch[1]) : null;
}

/**
 * Extracts explicit strip units from MedEx pack quantities (e.g. `3 x 10's pack` -> `10`).
 */
export function parseMedexStripUnits(packQuantity: string | null | undefined): number | null {
  const clean = (packQuantity ?? '').trim();
  if (!clean) return null;

  const mult = clean.match(
    /^(\d+)\s*x\s*(\d+)(?:'s|’s)?(?:\s+(?:pack|strip|blister|box|pot|tin))?$/i,
  );
  if (mult && Number(mult[2]) > 0) {
    return Number(mult[2]);
  }

  const stripNoun = clean.match(
    /^(\d+)\s+(?:tablets?|tabs?|capsules?|caps?|suppositories?|supp)\s+(?:strip|blister)$/i,
  );
  if (stripNoun && Number(stripNoun[1]) > 0) {
    return Number(stripNoun[1]);
  }

  const stripCount = clean.match(/^(\d+)(?:'s|’s)\s+(?:strip|blister)$/i);
  if (stripCount && Number(stripCount[1]) > 0) {
    return Number(stripCount[1]);
  }
  return null;
}

function parsePriceFloat(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : null;
}

/**
 * Cleans Kaggle MedEx CSV `package container` strings and extracts structured pack records.
 */
export function parseCsvPriceBlock(rawPrice: string | null | undefined): ParsedPackEntry[] {
  if (!rawPrice) return [];

  let cleaned = rawPrice.trim().replace(/^,+|,+$/g, '');
  if (!cleaned) return [];

  cleaned = cleaned
    .replace(/(Unit Price:\s*৳\s*[\d,]+(?:\.\d+)?)\s*,+\s*(\()/g, '$1 $2')
    .replace(/\)\s*,+/g, ') ')
    .replace(/,+\s*(?=Unit Price:|Strip Price:|[A-Za-z0-9])/g, ' ');
  cleaned = normalizeWhitespace(cleaned);

  const packs: ParsedPackEntry[] = [];
  const numPattern = '[\\d,]+(?:\\.\\d+)?';
  const stripRe = new RegExp(`Strip Price:?\\s*৳\\s*(${numPattern})`, 'i');
  cleaned = cleaned.replace(stripRe, ' ');

  const packRe = new RegExp(
    `(?:Unit Price:\\s*৳\\s*(${numPattern})\\s*)?\\(\\s*([^():]+?)\\s*:\\s*৳\\s*(${numPattern})\\s*\\)`,
    'g',
  );

  let rest = cleaned;
  for (const m of cleaned.matchAll(packRe)) {
    const unitPrice = parsePriceFloat(m[1]);
    const packQuantity = normalizeWhitespace(m[2]) || null;
    const packPrice = parsePriceFloat(m[3]);
    const packUnits = parsePackUnits(packQuantity);
    const warnings: string[] = [];
    if (unitPrice && packPrice && packUnits && Math.abs(unitPrice * packUnits - packPrice) / packPrice > 0.03) {
      warnings.push('pack_price_inconsistent_with_unit_price');
    }
    packs.push({
      packQuantity,
      packUnits,
      stripUnits: parseMedexStripUnits(packQuantity),
      unitPrice,
      packPrice,
      warnings,
    });
  }
  rest = rest.replace(packRe, ' ');

  const unitRe = new RegExp(`Unit Price:\\s*৳\\s*(${numPattern})`, 'g');
  for (const m of rest.matchAll(unitRe)) {
    const unitPrice = parsePriceFloat(m[1]);
    if (unitPrice) {
      packs.push({
        packQuantity: null,
        packUnits: null,
        stripUnits: null,
        unitPrice,
        packPrice: null,
        warnings: [],
      });
    }
  }
  rest = rest.replace(unitRe, ' ');

  const labelRe = new RegExp(`([A-Za-z0-9][A-Za-z0-9 .'’/x-]*?)\\s*:\\s*৳\\s*(${numPattern})`, 'g');
  for (const m of rest.matchAll(labelRe)) {
    const label = normalizeWhitespace(m[1]) || null;
    const packPrice = parsePriceFloat(m[2]);
    if (label || packPrice) {
      packs.push({
        packQuantity: label,
        packUnits: parsePackUnits(label),
        stripUnits: parseMedexStripUnits(label),
        unitPrice: null,
        packPrice,
        warnings: [],
      });
    }
  }

  return packs;
}

export async function loadMedicineCsv(filePath: string): Promise<CsvMedicineRow[]> {
  const raw = await readFile(filePath, 'utf8');
  return parseCsvRecords(raw).map((r) => ({
    brandId: normalizeWhitespace(r['brand id']),
    brandName: normalizeWhitespace(r['brand name']),
    type: normalizeWhitespace(r['type']).toLowerCase() || 'allopathic',
    slug: normalizeWhitespace(r['slug']),
    dosageForm: normalizeWhitespace(r['dosage form']),
    generic: normalizeWhitespace(r['generic']),
    strength: normalizeWhitespace(r['strength']),
    manufacturer: normalizeWhitespace(r['manufacturer']),
    packageContainer: r['package container'] ?? '',
    packageSize: normalizeWhitespace(r['Package Size']),
  }));
}

export async function loadGenericCsv(filePath: string): Promise<CsvGenericRow[]> {
  const raw = await readFile(filePath, 'utf8');
  return parseCsvRecords(raw).map((r) => ({
    genericId: normalizeWhitespace(r['generic id']),
    genericName: normalizeWhitespace(r['generic name']),
    slug: normalizeWhitespace(r['slug']),
    monographLink: normalizeWhitespace(r['monograph link']),
    drugClass: normalizeWhitespace(r['drug class']),
    indication: normalizeWhitespace(r['indication']),
  }));
}

export async function loadManufacturerMap(filePath: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!existsSync(filePath)) {
    return map;
  }
  const raw = await readFile(filePath, 'utf8');
  for (const r of parseCsvRecords(raw)) {
    const name = normalizeWhitespace(r['manufacturer name']);
    const id = normalizeWhitespace(r['manufacturer id']);
    if (name && id) {
      map.set(name, id);
    }
  }
  return map;
}

export async function loadDimsDataset(filePath: string): Promise<DimsDataset> {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<DimsDataset>;
  return {
    brands: Array.isArray(parsed.brands) ? parsed.brands : [],
    generics: Array.isArray(parsed.generics) ? parsed.generics : [],
    companies: Array.isArray(parsed.companies) ? parsed.companies : [],
  };
}
