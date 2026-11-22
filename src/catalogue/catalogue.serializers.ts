import {
  AlternativeGroup,
  FieldStatus,
  MedicineBrand,
  MedicineGeneric,
  MedicineImage,
  MedicinePack,
  Prisma,
  VerificationStatus,
} from '@prisma/client';
import { formatDecimalFixed, normalizeSearchText } from '../imports/catalogue-dataset.types';

export const CATALOGUE_UNVERIFIED_NOTICE =
  'Catalogue product details and prices are unverified source records. Confirm strength, form, and price on the medicine package or with a clinician.';

export const ALTERNATIVE_NON_SUBSTITUTION_WARNING =
  'Potential matching brands only. Sharing the same generic, strength, and dosage form does not mean brands are automatically interchangeable. Always consult a qualified doctor or pharmacist before changing medicine brands.';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SerializedPack {
  id: string;
  packQuantity: string | null;
  packUnits: number | null;
  stripUnits: number | null;
  unitPrice: string | null;
  packPrice: string | null;
  currency: string;
  unitPriceLabel: string | null;
  priceSource: string;
  sourceUrl: string | null;
  collectedAt: string | null;
  verification: VerificationStatus;
  warnings: string[];
  hasPriceWarning: boolean;
}

export interface SerializedImage {
  id: string;
  imageUrl: string;
  sourceName: string;
  sourcePageUrl: string | null;
  permissionStatus: string;
  matchStatus: VerificationStatus;
  checkedAt: string;
}

export interface SerializedFieldStatus {
  generic: FieldStatus;
  strength: FieldStatus;
  dosageForm: FieldStatus;
  manufacturer: FieldStatus;
  price: FieldStatus;
}

export interface SerializedBrandSummary {
  id: string;
  sourceId: string;
  name: string;
  strength: string | null;
  strengthNorm: string | null;
  dosageForm: string | null;
  dosageFormNorm: string | null;
  manufacturer: string | null;
  category: string;
  releaseMarker: string | null;
  verification: VerificationStatus;
  fieldStatus: SerializedFieldStatus;
  warnings: string[];
  hasPriceWarning: boolean;
  generic: {
    id: string;
    sourceId: string;
    name: string;
    slug: string | null;
  } | null;
  primaryPack: SerializedPack | null;
  primaryImageUrl: string | null;
  primaryImageStatus: {
    sourceName: string;
    permissionStatus: string;
    matchStatus: VerificationStatus;
  } | null;
}

export interface SerializedBrandDetail extends SerializedBrandSummary {
  productUrl: string | null;
  collectedAt: string | null;
  packs: SerializedPack[];
  images: SerializedImage[];
  safetyNotice: string;
}

export type BrandWithRelations = MedicineBrand & {
  generic: Pick<MedicineGeneric, 'id' | 'sourceId' | 'name' | 'slug'> | null;
  packs: MedicinePack[];
  images: MedicineImage[];
};

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function computeBrandSearchRank(
  brandNormalizedName: string,
  normalizedQuery: string,
): number {
  if (!normalizedQuery) return 0;
  if (brandNormalizedName === normalizedQuery) return 0;
  if (brandNormalizedName.startsWith(normalizedQuery)) return 1;
  if (brandNormalizedName.includes(normalizedQuery)) return 2;
  return 3;
}

export function resolveDosageFormSqlCondition(
  rawForm?: string | null,
): Prisma.Sql | null {
  if (!rawForm) {
    return null;
  }
  const form = normalizeSearchText(rawForm);
  if (!form || form === 'all') {
    return null;
  }
  if (form === 'tablet') {
    return Prisma.sql`LOWER(COALESCE(b."dosageFormNorm", '')) LIKE '%tablet%'`;
  }
  if (form === 'capsule') {
    return Prisma.sql`LOWER(COALESCE(b."dosageFormNorm", '')) LIKE '%capsule%'`;
  }
  if (form === 'syrup') {
    return Prisma.sql`(
      LOWER(COALESCE(b."dosageFormNorm", '')) LIKE '%syrup%'
      OR LOWER(COALESCE(b."dosageFormNorm", '')) LIKE '%suspension%'
      OR LOWER(COALESCE(b."dosageFormNorm", '')) LIKE '%drops%'
    )`;
  }
  if (form === 'injection') {
    return Prisma.sql`(
      LOWER(COALESCE(b."dosageFormNorm", '')) LIKE '%injection%'
      OR LOWER(COALESCE(b."dosageFormNorm", '')) LIKE '%infusion%'
    )`;
  }
  return Prisma.sql`LOWER(COALESCE(b."dosageFormNorm", '')) = ${form}`;
}

export function resolveDosageFormFilter(
  rawForm?: string | null,
): Prisma.MedicineBrandWhereInput | null {
  if (!rawForm) {
    return null;
  }
  const form = normalizeSearchText(rawForm);
  if (!form || form === 'all') {
    return null;
  }
  if (form === 'tablet') {
    return { dosageFormNorm: { contains: 'tablet', mode: 'insensitive' } };
  }
  if (form === 'capsule') {
    return { dosageFormNorm: { contains: 'capsule', mode: 'insensitive' } };
  }
  if (form === 'syrup') {
    return {
      OR: [
        { dosageFormNorm: { contains: 'syrup', mode: 'insensitive' } },
        { dosageFormNorm: { contains: 'suspension', mode: 'insensitive' } },
        { dosageFormNorm: { contains: 'drops', mode: 'insensitive' } },
      ],
    };
  }
  if (form === 'injection') {
    return {
      OR: [
        { dosageFormNorm: { contains: 'injection', mode: 'insensitive' } },
        { dosageFormNorm: { contains: 'infusion', mode: 'insensitive' } },
      ],
    };
  }
  return { dosageFormNorm: { equals: form, mode: 'insensitive' } };
}

export function serializePack(pack: MedicinePack): SerializedPack {
  const warnings = Array.isArray(pack.warnings) ? pack.warnings : [];
  return {
    id: pack.id,
    packQuantity: pack.packQuantity,
    packUnits: pack.packUnits,
    stripUnits: pack.stripUnits ?? null,
    unitPrice: formatDecimalFixed(pack.unitPrice),
    packPrice: formatDecimalFixed(pack.packPrice),
    currency: pack.currency,
    unitPriceLabel: pack.unitPriceLabel,
    priceSource: pack.priceSource,
    sourceUrl: pack.sourceUrl,
    collectedAt: pack.collectedAt ? pack.collectedAt.toISOString() : null,
    verification: pack.verification,
    warnings,
    hasPriceWarning: warnings.length > 0,
  };
}

export function serializeImage(image: MedicineImage): SerializedImage {
  return {
    id: image.id,
    imageUrl: image.imageUrl,
    sourceName: image.sourceName,
    sourcePageUrl: image.sourcePageUrl,
    permissionStatus: image.permissionStatus,
    matchStatus: image.matchStatus,
    checkedAt: image.checkedAt.toISOString(),
  };
}

export function serializeBrandSummary(brand: BrandWithRelations): SerializedBrandSummary {
  const serializedPacks = (brand.packs ?? []).map(serializePack);
  const primaryPack = serializedPacks[0] ?? null;
  const primaryImage = brand.images?.[0] ?? null;
  const warnings = Array.isArray(brand.warnings) ? brand.warnings : [];
  const hasPriceWarning =
    brand.priceFieldStatus === FieldStatus.INVALID ||
    serializedPacks.some((p) => p.hasPriceWarning);

  return {
    id: brand.id,
    sourceId: brand.sourceId,
    name: brand.name,
    strength: brand.strength,
    strengthNorm: brand.strengthNorm,
    dosageForm: brand.dosageForm,
    dosageFormNorm: brand.dosageFormNorm,
    manufacturer: brand.manufacturer,
    category: brand.category,
    releaseMarker: brand.releaseMarker,
    verification: brand.verification,
    fieldStatus: {
      generic: brand.genericFieldStatus,
      strength: brand.strengthFieldStatus,
      dosageForm: brand.formFieldStatus,
      manufacturer: brand.mfrFieldStatus,
      price: brand.priceFieldStatus,
    },
    warnings,
    hasPriceWarning,
    generic: brand.generic
      ? {
          id: brand.generic.id,
          sourceId: brand.generic.sourceId,
          name: brand.generic.name,
          slug: brand.generic.slug,
        }
      : null,
    primaryPack,
    primaryImageUrl: primaryImage ? primaryImage.imageUrl : null,
    primaryImageStatus: primaryImage
      ? {
          sourceName: primaryImage.sourceName,
          permissionStatus: primaryImage.permissionStatus,
          matchStatus: primaryImage.matchStatus,
        }
      : null,
  };
}

export function serializeBrandDetail(brand: BrandWithRelations): SerializedBrandDetail {
  const summary = serializeBrandSummary(brand);
  return {
    ...summary,
    productUrl: brand.productUrl,
    collectedAt: brand.collectedAt ? brand.collectedAt.toISOString() : null,
    packs: (brand.packs ?? []).map(serializePack),
    images: (brand.images ?? []).map(serializeImage),
    safetyNotice: CATALOGUE_UNVERIFIED_NOTICE,
  };
}

export function serializeAlternativeGroupMeta(
  group: AlternativeGroup & {
    generic: Pick<MedicineGeneric, 'id' | 'sourceId' | 'name' | 'slug'>;
  },
) {
  return {
    id: group.id,
    sourceGroupId: group.sourceGroupId,
    strengthNorm: group.strengthNorm,
    dosageFormNorm: group.dosageFormNorm,
    releaseMarker: group.releaseMarker,
    isCombination: group.isCombination,
    requiresReviewReasons: group.requiresReviewReasons,
    generic: {
      id: group.generic.id,
      sourceId: group.generic.sourceId,
      name: group.generic.name,
      slug: group.generic.slug,
    },
  };
}
