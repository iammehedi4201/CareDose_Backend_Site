import { FieldStatus, Prisma, VerificationStatus } from '@prisma/client';

export interface RawDatasetMeta {
  schema_version?: string;
  generated_at?: string | null;
  source?: {
    name?: string | null;
    base_url?: string | null;
  } | null;
  verification?: {
    live_site_verified?: boolean;
    note?: string | null;
  } | null;
  permission?: {
    authorization_recorded?: boolean;
    scope?: string | null;
    note?: string | null;
  } | null;
  record_counts?: {
    generics?: number;
    brands?: number;
    packs?: number;
    alternative_groups?: number;
  } | null;
}

export interface RawDatasetGeneric {
  generic_id: string;
  id_source?: string | null;
  name: string;
  slug?: string | null;
  source_url?: string | null;
  collected_at?: string | null;
  verification?: string | null;
}

export interface RawDatasetFieldStatus {
  generic_id?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  manufacturer?: string | null;
  price?: string | null;
  image_url?: string | null;
}

export interface RawDatasetBrand {
  brand_id: string;
  name: string;
  generic_id?: string | null;
  strength?: string | null;
  strength_norm?: string | null;
  dosage_form?: string | null;
  dosage_form_norm?: string | null;
  manufacturer?: string | null;
  manufacturer_id?: string | null;
  category?: string | null;
  release_marker?: string | null;
  product_url?: string | null;
  collected_at?: string | null;
  field_status?: RawDatasetFieldStatus | null;
  verification?: string | null;
  warnings?: string[] | null;
  image_url?: string | null;
}

export interface RawDatasetPack {
  brand_id: string;
  pack_quantity?: string | null;
  pack_units?: number | null;
  unit_price?: number | string | null;
  pack_price?: number | string | null;
  currency?: string | null;
  unit_price_label?: string | null;
  price_source?: string | null;
  source_url?: string | null;
  collected_at?: string | null;
  verification?: string | null;
  warnings?: string[] | null;
}

export interface RawDatasetAlternativeGroup {
  group_id: string;
  generic_id: string;
  strength_norm?: string | null;
  dosage_form_norm?: string | null;
  release_marker?: string | null;
  brand_ids: string[];
  is_combination?: boolean;
  requires_review_reasons?: string[] | null;
}

export interface RawCatalogueDataset {
  meta?: RawDatasetMeta | null;
  generics: RawDatasetGeneric[];
  brands: RawDatasetBrand[];
  packs: RawDatasetPack[];
  alternative_groups: RawDatasetAlternativeGroup[];
}

export class CatalogueDatasetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueDatasetValidationError';
  }
}

export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeOptionalText(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseOptionalDate(value?: string | null): Date | null {
  const text = normalizeOptionalText(value);
  if (!text) {
    return null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function mapVerificationStatus(value?: string | null): VerificationStatus {
  const norm = normalizeOptionalText(value)?.toLowerCase();
  if (norm === 'verified') {
    return VerificationStatus.VERIFIED;
  }
  if (norm === 'needs_review') {
    return VerificationStatus.NEEDS_REVIEW;
  }
  return VerificationStatus.UNVERIFIED;
}

export function mapFieldStatus(
  value?: string | null,
  hasNonEmptyValue?: boolean,
): FieldStatus {
  const norm = normalizeOptionalText(value)?.toLowerCase();
  if (norm === 'present') {
    return hasNonEmptyValue === false ? FieldStatus.MISSING : FieldStatus.PRESENT;
  }
  if (norm === 'missing') {
    return FieldStatus.MISSING;
  }
  if (norm === 'unavailable') {
    return FieldStatus.UNAVAILABLE;
  }
  if (norm === 'invalid') {
    return FieldStatus.INVALID;
  }
  return hasNonEmptyValue ? FieldStatus.PRESENT : FieldStatus.MISSING;
}

export function parsePositiveDecimal(
  value: number | string | null | undefined,
): Prisma.Decimal | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const str = String(value).trim();
  if (!str) {
    return null;
  }
  try {
    const dec = new Prisma.Decimal(str);
    if (!dec.isFinite() || dec.lte(0)) {
      return null;
    }
    return dec.toDecimalPlaces(2);
  } catch {
    return null;
  }
}

export function formatDecimalFixed(
  value: Prisma.Decimal | string | number | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    return new Prisma.Decimal(value.toString()).toFixed(2);
  } catch {
    return null;
  }
}

export function validateCatalogueDataset(raw: unknown): RawCatalogueDataset {
  if (!raw || typeof raw !== 'object') {
    throw new CatalogueDatasetValidationError('Dataset root must be a JSON object.');
  }
  const record = raw as Record<string, unknown>;

  if (record.meta && typeof record.meta === 'object') {
    const schemaVersion = (record.meta as Record<string, unknown>).schema_version;
    if (
      schemaVersion !== undefined &&
      schemaVersion !== null &&
      String(schemaVersion).trim() !== '2.0'
    ) {
      throw new CatalogueDatasetValidationError(
        `Unsupported catalogue schema_version "${String(schemaVersion)}". Expected "2.0".`,
      );
    }
  }

  for (const key of ['generics', 'brands', 'packs', 'alternative_groups'] as const) {
    if (!Array.isArray(record[key])) {
      throw new CatalogueDatasetValidationError(
        `Dataset must contain a valid "${key}" array.`,
      );
    }
  }

  const generics = record.generics as RawDatasetGeneric[];
  const brands = record.brands as RawDatasetBrand[];
  const packs = record.packs as RawDatasetPack[];
  const alternativeGroups = record.alternative_groups as RawDatasetAlternativeGroup[];

  if (generics.length === 0 || brands.length === 0) {
    throw new CatalogueDatasetValidationError(
      'Dataset cannot have empty generics or brands collections.',
    );
  }

  for (let i = 0; i < generics.length; i += 1) {
    const g = generics[i];
    if (!g || !normalizeOptionalText(g.generic_id) || !normalizeOptionalText(g.name)) {
      throw new CatalogueDatasetValidationError(
        `Generic record at index ${i} is missing required generic_id or name.`,
      );
    }
  }

  for (let i = 0; i < brands.length; i += 1) {
    const b = brands[i];
    if (!b || !normalizeOptionalText(b.brand_id) || !normalizeOptionalText(b.name)) {
      throw new CatalogueDatasetValidationError(
        `Brand record at index ${i} is missing required brand_id or name.`,
      );
    }
  }

  for (let i = 0; i < alternativeGroups.length; i += 1) {
    const grp = alternativeGroups[i];
    if (
      !grp ||
      !normalizeOptionalText(grp.group_id) ||
      !normalizeOptionalText(grp.generic_id) ||
      !Array.isArray(grp.brand_ids)
    ) {
      throw new CatalogueDatasetValidationError(
        `Alternative group at index ${i} is missing group_id, generic_id, or brand_ids.`,
      );
    }
  }

  return {
    meta: (record.meta as RawDatasetMeta | null | undefined) ?? null,
    generics,
    brands,
    packs,
    alternative_groups: alternativeGroups,
  };
}
