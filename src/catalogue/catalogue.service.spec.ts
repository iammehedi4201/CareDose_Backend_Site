import { FieldStatus, VerificationStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  computeBrandSearchRank,
  escapeLikePattern,
  resolveDosageFormFilter,
  serializeBrandDetail,
  serializeBrandSummary,
  BrandWithRelations,
} from './catalogue.serializers';

function makeSampleBrand(overrides: Partial<BrandWithRelations> = {}): BrandWithRelations {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    sourceId: '1',
    name: 'Celofen',
    normalizedName: 'celofen',
    genericId: '22222222-2222-4222-8222-222222222222',
    strength: '100 mg',
    strengthNorm: '100mg',
    dosageForm: 'Tablet',
    dosageFormNorm: 'tablet',
    manufacturer: 'ACI Limited',
    manufacturerSourceId: '2',
    category: 'allopathic',
    releaseMarker: null,
    productUrl: 'https://medex.com.bd/brands/1/celofen-100-mg-tablet',
    collectedAt: new Date('2026-07-09T11:45:24Z'),
    verification: VerificationStatus.UNVERIFIED,
    genericFieldStatus: FieldStatus.PRESENT,
    strengthFieldStatus: FieldStatus.PRESENT,
    formFieldStatus: FieldStatus.PRESENT,
    mfrFieldStatus: FieldStatus.PRESENT,
    priceFieldStatus: FieldStatus.PRESENT,
    warnings: [],
    importBatchId: null,
    createdAt: new Date('2026-11-21T00:00:00Z'),
    updatedAt: new Date('2026-11-21T00:00:00Z'),
    generic: {
      id: '22222222-2222-4222-8222-222222222222',
      sourceId: '3',
      name: 'Aceclofenac',
      slug: 'aceclofenac',
    },
    packs: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        brandId: '11111111-1111-4111-8111-111111111111',
        packQuantity: '5 x 10',
        packUnits: 50,
        stripUnits: 10,
        unitPrice: '4.01' as unknown as BrandWithRelations['packs'][number]['unitPrice'],
        packPrice: '200.5' as unknown as BrandWithRelations['packs'][number]['packPrice'],
        currency: 'BDT',
        unitPriceLabel: 'Unit Price',
        priceSource: 'brand_page',
        sourceUrl: 'https://medex.com.bd/brands/1/celofen-100-mg-tablet',
        collectedAt: new Date('2026-07-09T11:45:24Z'),
        verification: VerificationStatus.UNVERIFIED,
        warnings: [],
        createdAt: new Date('2026-11-21T00:00:00Z'),
      },
    ],
    images: [],
    ...overrides,
  };
}

describe('Catalogue serializers & filters', () => {
  it('resolves form filters for tablet, capsule, syrup, and injection families', () => {
    expect(resolveDosageFormFilter('all')).toBeNull();
    expect(resolveDosageFormFilter('   ')).toBeNull();
    expect(resolveDosageFormFilter('tablet')).toEqual({
      dosageFormNorm: { contains: 'tablet', mode: 'insensitive' },
    });
    expect(resolveDosageFormFilter('syrup')).toHaveProperty('OR');
    expect(resolveDosageFormFilter('injection')).toHaveProperty('OR');
    expect(resolveDosageFormFilter('cream')).toEqual({
      dosageFormNorm: { equals: 'cream', mode: 'insensitive' },
    });
  });

  it('formats decimal prices to 2 decimal places and preserves missing strength & image status', () => {
    const summary = serializeBrandSummary(makeSampleBrand());
    expect(summary.primaryPack?.unitPrice).toBe('4.01');
    expect(summary.primaryPack?.packPrice).toBe('200.50');
    expect(summary.primaryPack?.stripUnits).toBe(10);
    expect(summary.primaryImageUrl).toBeNull();
    expect(summary.hasPriceWarning).toBe(false);

    const missingDetail = serializeBrandDetail(
      makeSampleBrand({
        strength: null,
        strengthNorm: null,
        strengthFieldStatus: FieldStatus.MISSING,
        priceFieldStatus: FieldStatus.INVALID,
        packs: [
          {
            ...makeSampleBrand().packs[0],
            unitPrice: null,
            packPrice: '255.06' as unknown as BrandWithRelations['packs'][number]['packPrice'],
            warnings: ['pack_price_inconsistent_with_unit_price'],
          },
        ],
      }),
    );

    expect(missingDetail.strength).toBeNull();
    expect(missingDetail.fieldStatus.strength).toBe(FieldStatus.MISSING);
    expect(missingDetail.hasPriceWarning).toBe(true);
    expect(missingDetail.safetyNotice).toMatch(/unverified/i);
  });

  it('ranks exact and prefix brand matches before substring and generic matches and escapes LIKE wildcards', () => {
    expect(computeBrandSearchRank('napa', 'napa')).toBe(0);
    expect(computeBrandSearchRank('napa extra', 'napa')).toBe(1);
    expect(computeBrandSearchRank('pranapa', 'napa')).toBe(2);
    expect(computeBrandSearchRank('aexidal', 'napa')).toBe(3);

    expect(escapeLikePattern('100% pure_test\\x')).toBe('100\\% pure\\_test\\\\x');
  });
});
