import { FieldStatus, VerificationStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  CatalogueDatasetValidationError,
  mapFieldStatus,
  mapVerificationStatus,
  normalizeOptionalText,
  normalizeSearchText,
  parsePositiveDecimal,
  RawCatalogueDataset,
  validateCatalogueDataset,
} from './catalogue-dataset.types';
import { ImportsService } from './imports.service';
import type { PrismaService } from '../prisma/prisma.service';

function createInMemoryImportPrisma() {
  let seq = 1;
  const nextId = () => `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;

  const batches: Array<Record<string, unknown>> = [];
  const generics: Array<{ id: string; sourceId: string; [key: string]: unknown }> = [];
  const brands: Array<{ id: string; sourceId: string; [key: string]: unknown }> = [];
  const packs: Array<Record<string, unknown>> = [];
  const images: Array<{ brandId: string; imageUrl: string; [key: string]: unknown }> = [];
  const altGroups: Array<{ id: string; sourceGroupId: string; [key: string]: unknown }> = [];
  const altLinks: Array<{ alternativeGroupId: string; brandId: string }> = [];

  const mock = {
    batches,
    generics,
    brands,
    packs,
    images,
    altGroups,
    altLinks,
    catalogueImportBatch: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: nextId(), ...data };
        batches.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const found = batches.find((b) => b.id === where.id);
        if (found) Object.assign(found, data);
        return found;
      },
    },
    medicineGeneric: {
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: Array<{ sourceId: string } & Record<string, unknown>>;
        skipDuplicates?: boolean;
      }) => {
        let count = 0;
        for (const item of data) {
          if (skipDuplicates && generics.some((g) => g.sourceId === item.sourceId)) {
            continue;
          }
          generics.push({ id: nextId(), ...item });
          count += 1;
        }
        return { count };
      },
      findMany: async () => generics.map((g) => ({ id: g.id, sourceId: g.sourceId })),
    },
    medicineBrand: {
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: Array<{ sourceId: string } & Record<string, unknown>>;
        skipDuplicates?: boolean;
      }) => {
        let count = 0;
        for (const item of data) {
          if (skipDuplicates && brands.some((b) => b.sourceId === item.sourceId)) {
            continue;
          }
          brands.push({ id: nextId(), ...item });
          count += 1;
        }
        return { count };
      },
      findMany: async () => brands.map((b) => ({ id: b.id, sourceId: b.sourceId })),
    },
    medicinePack: {
      findMany: async () => packs,
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        for (const item of data) {
          packs.push({ id: nextId(), ...item });
        }
        return { count: data.length };
      },
    },
    medicineImage: {
      findMany: async () => images,
      createMany: async ({ data }: { data: Array<{ brandId: string; imageUrl: string }> }) => {
        for (const item of data) {
          images.push({ id: nextId(), ...item });
        }
        return { count: data.length };
      },
    },
    alternativeGroup: {
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: Array<{ sourceGroupId: string } & Record<string, unknown>>;
        skipDuplicates?: boolean;
      }) => {
        let count = 0;
        for (const item of data) {
          if (skipDuplicates && altGroups.some((g) => g.sourceGroupId === item.sourceGroupId)) {
            continue;
          }
          altGroups.push({ id: nextId(), ...item });
          count += 1;
        }
        return { count };
      },
      findMany: async () =>
        altGroups.map((g) => ({ id: g.id, sourceGroupId: g.sourceGroupId })),
    },
    alternativeGroupBrand: {
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: Array<{ alternativeGroupId: string; brandId: string }>;
        skipDuplicates?: boolean;
      }) => {
        let count = 0;
        for (const item of data) {
          if (
            skipDuplicates &&
            altLinks.some(
              (l) =>
                l.alternativeGroupId === item.alternativeGroupId &&
                l.brandId === item.brandId,
            )
          ) {
            continue;
          }
          altLinks.push(item);
          count += 1;
        }
        return { count };
      },
    },
  };

  return mock;
}

describe('Catalogue dataset normalization & validation', () => {
  it('normalizes text, field statuses, verification flags, and exact decimal values', () => {
    expect(normalizeSearchText('  Aceclofenac   100 mg ')).toBe('aceclofenac 100 mg');
    expect(normalizeOptionalText('   ')).toBeNull();
    expect(normalizeOptionalText(' ACI Limited ')).toBe('ACI Limited');

    expect(mapVerificationStatus('unverified')).toBe(VerificationStatus.UNVERIFIED);
    expect(mapVerificationStatus('verified')).toBe(VerificationStatus.VERIFIED);
    expect(mapVerificationStatus('needs_review')).toBe(VerificationStatus.NEEDS_REVIEW);

    expect(mapFieldStatus('missing', false)).toBe(FieldStatus.MISSING);
    expect(mapFieldStatus('invalid', true)).toBe(FieldStatus.INVALID);
    expect(mapFieldStatus('present', false)).toBe(FieldStatus.MISSING);
    expect(mapFieldStatus('present', true)).toBe(FieldStatus.PRESENT);

    expect(parsePositiveDecimal(4.01)?.toFixed(2)).toBe('4.01');
    expect(parsePositiveDecimal(0)).toBeNull();
    expect(parsePositiveDecimal(-5)).toBeNull();
    expect(parsePositiveDecimal('not-a-price')).toBeNull();
  });

  it('rejects malformed or unsupported schema versions cleanly', () => {
    expect(() => validateCatalogueDataset(null)).toThrow(CatalogueDatasetValidationError);
    expect(() =>
      validateCatalogueDataset({
        meta: { schema_version: '9.9' },
        generics: [],
        brands: [],
        packs: [],
        alternative_groups: [],
      }),
    ).toThrow(/Unsupported catalogue schema_version/);

    expect(() =>
      validateCatalogueDataset({
        meta: { schema_version: '2.0' },
        generics: [],
        brands: [],
        packs: [],
        alternative_groups: [],
      }),
    ).toThrow(/cannot have empty generics or brands/i);
  });
});

describe('ImportsService (batch ingestion & idempotency)', () => {
  it('imports generics, brands with missing strength, packs, Arogga images, and alternative groups without duplicating on re-import', async () => {
    const prismaMock = createInMemoryImportPrisma();
    const service = new ImportsService(prismaMock as unknown as PrismaService);

    const sampleDataset: RawCatalogueDataset = {
      meta: {
        schema_version: '2.0',
        generated_at: '2026-11-21T09:53:22Z',
        source: { name: 'MedEx Bangladesh', base_url: 'https://medex.com.bd' },
      },
      generics: [
        {
          generic_id: '3',
          id_source: 'site',
          name: 'Aceclofenac',
          slug: 'aceclofenac',
          verification: 'unverified',
        },
        {
          generic_id: '179',
          id_source: 'listing_text',
          name: 'Dextrose + Lactated Ringer',
          verification: 'unverified',
        },
      ],
      brands: [
        {
          brand_id: '1',
          name: 'Celofen',
          generic_id: '3',
          strength: '100 mg',
          strength_norm: '100mg',
          dosage_form: 'Tablet',
          dosage_form_norm: 'tablet',
          manufacturer: 'ACI Limited',
          field_status: {
            generic_id: 'present',
            strength: 'present',
            dosage_form: 'present',
            manufacturer: 'present',
            price: 'present',
          },
          verification: 'unverified',
          image_url: 'https://cdn2.arogga.com/sample-celofen.jpg',
        },
        {
          brand_id: '2',
          name: 'Flexi',
          generic_id: '3',
          strength: '100 mg',
          strength_norm: '100mg',
          dosage_form: 'Tablet',
          dosage_form_norm: 'tablet',
          manufacturer: 'Square Pharmaceuticals PLC',
          verification: 'unverified',
        },
        {
          brand_id: '358',
          name: 'Dextrolac',
          generic_id: '179',
          strength: '',
          strength_norm: null,
          dosage_form: 'IV Infusion',
          dosage_form_norm: 'iv infusion',
          manufacturer: 'Orion Infusion Ltd.',
          field_status: {
            strength: 'missing',
            price: 'invalid',
          },
          warnings: ['possible_duplicate_of:359'],
          verification: 'unverified',
        },
      ],
      packs: [
        {
          brand_id: '1',
          pack_quantity: '5 x 10',
          pack_units: 50,
          unit_price: 4.01,
          pack_price: 200.5,
          currency: 'BDT',
          warnings: [],
        },
        {
          brand_id: '358',
          pack_quantity: '500 ml bottle',
          pack_units: null,
          unit_price: null,
          pack_price: 95,
          currency: 'BDT',
          warnings: ['pack_price_inconsistent_with_unit_price'],
        },
      ],
      alternative_groups: [
        {
          group_id: 'grp-1',
          generic_id: '3',
          strength_norm: '100mg',
          dosage_form_norm: 'tablet',
          brand_ids: ['1', '2'],
          is_combination: false,
          requires_review_reasons: ['unverified_data'],
        },
      ],
    };

    const first = await service.importDataset(sampleDataset, { batchSize: 2 });
    expect(first.status).toBe('COMPLETED');
    expect(first.genericsInserted).toBe(2);
    expect(first.brandsInserted).toBe(3);
    expect(first.packsInserted).toBe(2);
    expect(first.imagesInserted).toBe(1);
    expect(first.groupsInserted).toBe(1);
    expect(first.groupLinksInserted).toBe(2);

    const dextrolac = prismaMock.brands.find((b) => b.sourceId === '358');
    expect(dextrolac?.strength).toBeNull();
    expect(dextrolac?.strengthFieldStatus).toBe(FieldStatus.MISSING);
    expect(dextrolac?.priceFieldStatus).toBe(FieldStatus.INVALID);
    expect(dextrolac?.warnings).toEqual(['possible_duplicate_of:359']);

    // Run identical import again — must insert 0 duplicate rows
    const second = await service.importDataset(sampleDataset, { batchSize: 2 });
    expect(second.genericsInserted).toBe(0);
    expect(second.brandsInserted).toBe(0);
    expect(second.packsInserted).toBe(0);
    expect(second.imagesInserted).toBe(0);
    expect(second.groupsInserted).toBe(0);
    expect(second.groupLinksInserted).toBe(0);
  });
});
