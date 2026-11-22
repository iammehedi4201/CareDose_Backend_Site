import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FieldStatus, Prisma, VerificationStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const SAMPLE_GENERICS = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    sourceId: '3',
    idSource: 'site',
    name: 'Aceclofenac',
    normalizedName: 'aceclofenac',
    slug: 'aceclofenac',
    sourceUrl: null,
    collectedAt: new Date('2026-07-09T00:00:00Z'),
    verification: VerificationStatus.UNVERIFIED,
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    sourceId: '179',
    idSource: 'listing_text',
    name: 'Dextrose + Ringer Lactate',
    normalizedName: 'dextrose + ringer lactate',
    slug: 'dextrose-ringer-lactate',
    sourceUrl: null,
    collectedAt: new Date('2026-07-09T00:00:00Z'),
    verification: VerificationStatus.UNVERIFIED,
  },
];

const SAMPLE_BRANDS = [
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    sourceId: '1',
    name: 'Celofen',
    normalizedName: 'celofen',
    genericId: SAMPLE_GENERICS[0].id,
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
    generic: SAMPLE_GENERICS[0],
    packs: [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
        brandId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
        packQuantity: '5 x 10',
        packUnits: 50,
        unitPrice: new Prisma.Decimal('4.01'),
        packPrice: new Prisma.Decimal('200.50'),
        currency: 'BDT',
        unitPriceLabel: 'Unit Price',
        priceSource: 'brand_page',
        sourceUrl: null,
        collectedAt: null,
        verification: VerificationStatus.UNVERIFIED,
        warnings: [],
        createdAt: new Date('2026-11-21T00:00:00Z'),
      },
    ],
    images: [],
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    sourceId: '358',
    name: 'Dextrolac',
    normalizedName: 'dextrolac',
    genericId: SAMPLE_GENERICS[1].id,
    strength: null,
    strengthNorm: null,
    dosageForm: 'IV Infusion',
    dosageFormNorm: 'iv infusion',
    manufacturer: 'Orion Infusion Ltd.',
    manufacturerSourceId: '173',
    category: 'allopathic',
    releaseMarker: null,
    productUrl: 'https://medex.com.bd/brands/358/dextrolac-injection',
    collectedAt: new Date('2026-07-09T11:52:04Z'),
    verification: VerificationStatus.UNVERIFIED,
    genericFieldStatus: FieldStatus.PRESENT,
    strengthFieldStatus: FieldStatus.MISSING,
    formFieldStatus: FieldStatus.PRESENT,
    mfrFieldStatus: FieldStatus.PRESENT,
    priceFieldStatus: FieldStatus.INVALID,
    warnings: [],
    importBatchId: null,
    createdAt: new Date('2026-11-21T00:00:00Z'),
    updatedAt: new Date('2026-11-21T00:00:00Z'),
    generic: SAMPLE_GENERICS[1],
    packs: [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
        brandId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
        packQuantity: '500 ml bottle',
        packUnits: null,
        unitPrice: null,
        packPrice: new Prisma.Decimal('95.00'),
        currency: 'BDT',
        unitPriceLabel: null,
        priceSource: 'brand_page',
        sourceUrl: null,
        collectedAt: null,
        verification: VerificationStatus.UNVERIFIED,
        warnings: ['pack_price_inconsistent_with_unit_price'],
        createdAt: new Date('2026-11-21T00:00:00Z'),
      },
    ],
    images: [],
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
    sourceId: '2',
    name: 'Flexi',
    normalizedName: 'flexi',
    genericId: SAMPLE_GENERICS[0].id,
    strength: '100 mg',
    strengthNorm: '100mg',
    dosageForm: 'Tablet',
    dosageFormNorm: 'tablet',
    manufacturer: 'Square Pharmaceuticals PLC',
    manufacturerSourceId: '1',
    category: 'allopathic',
    releaseMarker: null,
    productUrl: 'https://medex.com.bd/brands/2/flexi-100-mg-tablet',
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
    generic: SAMPLE_GENERICS[0],
    packs: [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
        brandId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
        packQuantity: "100's pack",
        packUnits: 100,
        unitPrice: new Prisma.Decimal('7.00'),
        packPrice: new Prisma.Decimal('700.00'),
        currency: 'BDT',
        unitPriceLabel: 'Unit Price',
        priceSource: 'brand_page',
        sourceUrl: null,
        collectedAt: null,
        verification: VerificationStatus.UNVERIFIED,
        warnings: [],
        createdAt: new Date('2026-11-21T00:00:00Z'),
      },
    ],
    images: [
      {
        id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
        brandId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
        imageUrl: 'https://cdn2.arogga.com/flexi.jpg',
        sourceName: 'Arogga',
        sourcePageUrl: null,
        permissionStatus: 'UNRECORDED',
        matchStatus: VerificationStatus.UNVERIFIED,
        checkedAt: new Date('2026-11-21T00:00:00Z'),
      },
    ],
  },
];

const SAMPLE_ALT_GROUP = {
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
  sourceGroupId: 'grp-aceclofenac-100-tab',
  genericId: SAMPLE_GENERICS[0].id,
  strengthNorm: '100mg',
  dosageFormNorm: 'tablet',
  releaseMarker: null,
  isCombination: false,
  requiresReviewReasons: ['unverified_data'],
  generic: SAMPLE_GENERICS[0],
  brands: [
    { brandId: SAMPLE_BRANDS[0].id, brand: SAMPLE_BRANDS[0] },
    { brandId: SAMPLE_BRANDS[2].id, brand: SAMPLE_BRANDS[2] },
  ],
};

function matchesBrandWhere(
  brand: (typeof SAMPLE_BRANDS)[number],
  where: Record<string, unknown> | undefined,
): boolean {
  if (!where || Object.keys(where).length === 0) return true;
  if (Array.isArray(where.AND)) {
    return (where.AND as Array<Record<string, unknown>>).every((c) => matchesBrandWhere(brand, c));
  }
  if (Array.isArray(where.OR)) {
    return (where.OR as Array<Record<string, unknown>>).some((c) => matchesBrandWhere(brand, c));
  }
  for (const [k, v] of Object.entries(where)) {
    if (k === 'genericId' && brand.genericId !== v) return false;
    if (k === 'dosageFormNorm' && typeof v === 'object' && v !== null) {
      const cond = v as { contains?: string; equals?: string };
      const val = (brand.dosageFormNorm ?? '').toLowerCase();
      if (cond.contains && !val.includes(cond.contains.toLowerCase())) return false;
      if (cond.equals && val !== cond.equals.toLowerCase()) return false;
    }
    if (k === 'normalizedName' && typeof v === 'object' && v !== null) {
      const cond = v as { contains?: string };
      if (cond.contains && !brand.normalizedName.includes(cond.contains.toLowerCase())) {
        return false;
      }
    }
    if (k === 'strength' && typeof v === 'object' && v !== null) {
      const cond = v as { contains?: string };
      if (cond.contains && !(brand.strength ?? '').toLowerCase().includes(cond.contains.toLowerCase())) {
        return false;
      }
    }
    if (k === 'manufacturer' && typeof v === 'object' && v !== null) {
      const cond = v as { contains?: string };
      if (cond.contains && !(brand.manufacturer ?? '').toLowerCase().includes(cond.contains.toLowerCase())) {
        return false;
      }
    }
    if (k === 'generic' && typeof v === 'object' && v !== null) {
      const cond = v as { normalizedName?: { contains?: string }; sourceId?: string };
      if (cond.sourceId && brand.generic.sourceId !== cond.sourceId) return false;
      if (
        cond.normalizedName?.contains &&
        !brand.generic.normalizedName.includes(cond.normalizedName.contains.toLowerCase())
      ) {
        return false;
      }
    }
  }
  return true;
}

describe('Phase 4 Catalogue Search, Detail & Alternatives API (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.SKIP_DB_CONNECT_ON_INIT = 'true';

    const prismaMock = {
      onModuleInit: vi.fn(),
      onModuleDestroy: vi.fn(),
      checkConnection: vi.fn().mockResolvedValue({ connected: true }),
      catalogueImportBatch: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'batch-1',
          sourceName: 'MedEx Bangladesh (medex.com.bd)',
          schemaVersion: '2.0',
          generatedAt: new Date('2026-11-21T09:53:22Z'),
          importedAt: new Date('2026-11-22T03:10:00Z'),
        }),
      },
      medicineGeneric: {
        count: vi.fn().mockResolvedValue(SAMPLE_GENERICS.length),
        findMany: vi.fn().mockImplementation(async ({ where }: { where?: Record<string, unknown> }) => {
          const cond = (where?.normalizedName as { contains?: string } | undefined)?.contains;
          const filtered = cond
            ? SAMPLE_GENERICS.filter((g) => g.normalizedName.includes(cond.toLowerCase()))
            : SAMPLE_GENERICS;
          return filtered.map((g) => ({
            ...g,
            _count: { brands: SAMPLE_BRANDS.filter((b) => b.genericId === g.id).length },
          }));
        }),
        findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id?: string; sourceId?: string } }) =>
          SAMPLE_GENERICS.find((g) => (where.id ? g.id === where.id : g.sourceId === where.sourceId)) ?? null,
        ),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      medicineBrand: {
        count: vi.fn().mockImplementation(async ({ where }: { where?: Record<string, unknown> } = {}) =>
          SAMPLE_BRANDS.filter((b) => matchesBrandWhere(b, where)).length,
        ),
        findMany: vi
          .fn()
          .mockImplementation(
            async ({
              where,
              take,
              cursor,
              skip,
              distinct,
            }: {
              where?: Record<string, unknown>;
              take?: number;
              cursor?: { id: string };
              skip?: number;
              distinct?: string[];
            }) => {
              if (distinct?.includes('manufacturer')) {
                return SAMPLE_BRANDS.map((b) => ({ manufacturer: b.manufacturer }));
              }
              const sorted = SAMPLE_BRANDS.filter((b) => matchesBrandWhere(b, where)).sort(
                (a, b) => a.normalizedName.localeCompare(b.normalizedName) || a.id.localeCompare(b.id),
              );
              let start = 0;
              if (cursor?.id) {
                const idx = sorted.findIndex((b) => b.id === cursor.id);
                start = idx >= 0 ? idx + (skip ?? 0) : 0;
              }
              return take !== undefined ? sorted.slice(start, start + take) : sorted.slice(start);
            },
          ),
        findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id?: string; sourceId?: string } }) =>
          SAMPLE_BRANDS.find((b) => (where.id ? b.id === where.id : b.sourceId === where.sourceId)) ?? null,
        ),
      },
      medicinePack: {
        count: vi.fn().mockResolvedValue(3),
      },
      alternativeGroup: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([SAMPLE_ALT_GROUP]),
      },
      alternativeGroupBrand: {
        findMany: vi.fn().mockImplementation(async ({ where }: { where: { brandId: string } }) =>
          SAMPLE_ALT_GROUP.brands.some((m) => m.brandId === where.brandId)
            ? [{ alternativeGroup: SAMPLE_ALT_GROUP }]
            : [],
        ),
      },
      medicineImage: {
        count: vi.fn().mockResolvedValue(1),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns live imported counts and disclaimer via /catalogue/summary', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/catalogue/summary').expect(200);
    expect(res.body.counts).toEqual({
      generics: 2,
      brands: 3,
      packs: 3,
      alternativeGroups: 1,
      manufacturers: 3,
      brandsWithImages: 1,
    });
    expect(res.body.verificationNotice).toMatch(/unverified/i);
  });

  it('supports paginated search, cursor navigation, dosage form filtering, and validates limit <= 50', async () => {
    await request(app.getHttpServer()).get('/api/v1/catalogue/search?limit=100').expect(400);

    const page1 = await request(app.getHttpServer())
      .get('/api/v1/catalogue/search?limit=2')
      .expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.totalCount).toBe(3);
    expect(page1.body.hasMore).toBe(true);
    expect(typeof page1.body.nextCursor).toBe('string');

    const page2 = await request(app.getHttpServer())
      .get(`/api/v1/catalogue/search?limit=2&cursor=${page1.body.nextCursor}`)
      .expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.hasMore).toBe(false);
    expect(page2.body.nextCursor).toBeNull();

    const injectionFilter = await request(app.getHttpServer())
      .get('/api/v1/catalogue/search?form=injection')
      .expect(200);
    expect(injectionFilter.body.items).toHaveLength(1);
    expect(injectionFilter.body.items[0].name).toBe('Dextrolac');
    expect(injectionFilter.body.items[0].strength).toBeNull();
    expect(injectionFilter.body.items[0].hasPriceWarning).toBe(true);

    const genericSearchPage1 = await request(app.getHttpServer())
      .get('/api/v1/catalogue/search?q=Aceclofenac&limit=1')
      .expect(200);
    expect(genericSearchPage1.body.totalCount).toBe(2);
    expect(genericSearchPage1.body.items[0].name).toBe('Celofen');
    expect(genericSearchPage1.body.hasMore).toBe(true);

    const genericSearchPage2 = await request(app.getHttpServer())
      .get(`/api/v1/catalogue/search?q=Aceclofenac&limit=1&cursor=${genericSearchPage1.body.nextCursor}`)
      .expect(200);
    expect(genericSearchPage2.body.items[0].name).toBe('Flexi');
    expect(genericSearchPage2.body.hasMore).toBe(false);
  });

  it('returns full brand details, generic details, and candidate alternative brands with safety warnings', async () => {
    const brandRes = await request(app.getHttpServer())
      .get('/api/v1/catalogue/brands/1')
      .expect(200);
    expect(brandRes.body.name).toBe('Celofen');
    expect(brandRes.body.primaryPack.unitPrice).toBe('4.01');
    expect(brandRes.body.primaryPack.packPrice).toBe('200.50');

    await request(app.getHttpServer()).get('/api/v1/catalogue/brands/999999').expect(404);

    const altRes = await request(app.getHttpServer())
      .get('/api/v1/catalogue/brands/1/alternatives')
      .expect(200);
    expect(altRes.body.warningNotice).toMatch(/doctor or pharmacist/i);
    expect(altRes.body.groups).toHaveLength(1);
    expect(altRes.body.groups[0].candidateBrands).toHaveLength(1);
    expect(altRes.body.groups[0].candidateBrands[0].name).toBe('Flexi');
    expect(altRes.body.groups[0].candidateBrands[0].primaryImageUrl).toBe(
      'https://cdn2.arogga.com/flexi.jpg',
    );

    const genericRes = await request(app.getHttpServer())
      .get('/api/v1/catalogue/generics/3')
      .expect(200);
    expect(genericRes.body.generic.name).toBe('Aceclofenac');
    expect(genericRes.body.brands.items).toHaveLength(2);
  });
});
