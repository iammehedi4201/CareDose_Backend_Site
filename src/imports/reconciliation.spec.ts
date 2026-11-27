import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { buildFinalApprovedManifest } from './reconciliation-manifest';
import {
  buildBrandLookupIndex,
  canonicalizeBrandName,
  canonicalizeGenericName,
  ExistingBrandRecord,
  matchIncomingBrand,
  normalizeStrengthKey,
  splitGenericIngredients,
} from './reconciliation-normalizer';
import { parseCsvPriceBlock, parseCsvRecords } from './reconciliation-parsers';
import { ReconciliationService } from './reconciliation.service';

function makeBrand(overrides: Partial<ExistingBrandRecord>): ExistingBrandRecord {
  return {
    id: 'uuid-1',
    sourceId: '100',
    name: 'A-Cal',
    normalizedName: 'a-cal',
    genericId: 'gen-1',
    genericName: 'Calcium Carbonate',
    genericNormalizedName: 'calcium carbonate',
    strength: '500 mg',
    strengthNorm: '500mg',
    dosageForm: 'Tablet',
    dosageFormNorm: 'tablet',
    manufacturer: 'ACME Laboratories Ltd.',
    category: 'allopathic',
    releaseMarker: null,
    ...overrides,
  };
}

describe('reconciliation-normalizer', () => {
  it('canonicalizes spacing and hyphens for matching while preserving display names', () => {
    expect(canonicalizeBrandName('A Cal')).toBe('acal');
    expect(canonicalizeBrandName('A-Cal')).toBe('acal');
    expect(canonicalizeBrandName('ACal')).toBe('acal');
    expect(normalizeStrengthKey('0.50%')).toBe('0.5%');
    expect(normalizeStrengthKey('20 mg')).toBe('20mg');
  });

  it('preserves combination generic ingredients and never collapses A+B into A', () => {
    expect(splitGenericIngredients('Amoxicillin + Clavulanic Acid')).toEqual([
      'Amoxicillin',
      'Clavulanic Acid',
    ]);
    expect(canonicalizeGenericName('Amoxicillin + Clavulanic Acid')).toBe(
      'amoxicillin + clavulanic acid',
    );
    expect(canonicalizeGenericName('Amoxicillin')).not.toBe(
      canonicalizeGenericName('Amoxicillin + Clavulanic Acid'),
    );
  });

  it('detects sourceId collisions instead of silently treating them as matches', () => {
    const idx = buildBrandLookupIndex([
      makeBrand({ sourceId: '17229', name: 'Anxit', strength: '0.5 mg+10 mg', strengthNorm: '0.5mg+10mg' }),
    ]);

    const res = matchIncomingBrand(
      {
        source: 'kaggle_medicine_csv',
        sourceId: '17229',
        name: 'Thixtra',
        genericName: 'Flupentixol + Melitracen',
        genericSourceId: 'listing:flupentixol-melitracen',
        strength: '0.5 mg+10 mg',
        dosageForm: 'Tablet',
        manufacturer: 'Delta Pharma Ltd.',
        category: 'allopathic',
      },
      idx,
      { trustSourceIdSpace: true },
    );

    expect(res.classification).toBe('SOURCE_ID_COLLISION');
    expect(res.recommendedAction).toBe('MANUAL_REVIEW_COLLISION');
  });

  it('matches formatting differences like A Cal vs A-Cal in Tier 3 without merging DIMS IDs', () => {
    const idx = buildBrandLookupIndex([makeBrand({ sourceId: '200', name: 'A-Cal' })]);

    const res = matchIncomingBrand(
      {
        source: 'dims_json',
        sourceId: 'dims:200',
        name: 'A Cal',
        genericName: 'Calcium Carbonate',
        genericSourceId: 'dims:10',
        strength: '500mg',
        dosageForm: 'Tablet',
        manufacturer: 'ACME Laboratories',
        category: 'allopathic',
      },
      idx,
      { trustSourceIdSpace: false },
    );

    expect(res.classification).toBe('NORMALIZED_ATTRIBUTE_MATCH');
    expect(res.recommendedAction).toBe('SKIP_ALREADY_PRESENT');
  });

  it('keeps distinct dosage forms separate (AZ 250 mg Tablet vs AZ 250 mg Capsule)', () => {
    const idx = buildBrandLookupIndex([
      makeBrand({
        sourceId: '8558',
        name: 'AZ',
        normalizedName: 'az',
        strength: '250 mg',
        strengthNorm: '250mg',
        dosageForm: 'Tablet',
        dosageFormNorm: 'tablet',
      }),
    ]);

    const res = matchIncomingBrand(
      {
        source: 'kaggle_medicine_csv',
        sourceId: '8559',
        name: 'AZ',
        genericName: 'Azithromycin',
        genericSourceId: 'listing:azithromycin',
        strength: '250 mg',
        dosageForm: 'Capsule',
        manufacturer: 'ACME Laboratories Ltd.',
        category: 'allopathic',
      },
      idx,
      { trustSourceIdSpace: true },
    );

    expect(res.classification).toBe('LEGITIMATE_FORM_VARIATION');
    expect(res.recommendedAction).toBe('SAFE_INSERT_NEW_BRAND');
  });

  it('flags equivalent dosage-form families (Delayed Release vs Enteric Coated) for manual review', () => {
    const idx = buildBrandLookupIndex([
      makeBrand({
        sourceId: '2030',
        name: 'Esonix',
        normalizedName: 'esonix',
        strength: '20 mg',
        strengthNorm: '20mg',
        dosageForm: 'Capsule (Enteric Coated)',
        dosageFormNorm: 'capsule (enteric coated)',
      }),
    ]);

    const res = matchIncomingBrand(
      {
        source: 'kaggle_medicine_csv',
        sourceId: '99999',
        name: 'Esonix',
        genericName: 'Esomeprazole',
        genericSourceId: 'listing:esomeprazole',
        strength: '20 mg',
        dosageForm: 'Capsule (Delayed Release)',
        manufacturer: 'Incepta Pharmaceuticals Ltd.',
        category: 'allopathic',
      },
      idx,
      { trustSourceIdSpace: true },
    );

    expect(res.classification).toBe('DOSAGE_FORM_EQUIVALENT_REVIEW');
    expect(res.recommendedAction).toBe('MANUAL_REVIEW_FORM_EQUIVALENT');
  });
});

describe('reconciliation-parsers', () => {
  it('parses RFC-4180 CSV rows with quoted fields and commas', () => {
    const csv = 'brand id,brand name,package container\n29894,Sergel MUPS,"Unit Price: ৳ 14.00,(30\'s pack: ৳ 420.00),"';
    const rows = parseCsvRecords(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]['brand id']).toBe('29894');
    expect(rows[0]['package container']).toBe("Unit Price: ৳ 14.00,(30's pack: ৳ 420.00),");
  });

  it('parses CSV price blocks with commas between unit and pack prices', () => {
    const packs = parseCsvPriceBlock("Unit Price: ৳ 14.00,(30's pack: ৳ 420.00),");
    expect(packs).toHaveLength(1);
    expect(packs[0]).toMatchObject({
      packQuantity: "30's pack",
      packUnits: 30,
      unitPrice: 14,
      packPrice: 420,
    });
  });
});

describe('reconciliation-manifest', () => {
  it('excludes borderline form renames, intra-CSV duplicates, and uncertain generic overlaps while preferring site generics', () => {
    const existingGenerics = [
      { id: 'g1', sourceId: '1060', idSource: 'site', name: 'Tetracycline Hydrochloride', normalizedName: 'tetracycline hydrochloride', slug: 'tetracycline-hydrochloride' },
      { id: 'g2', sourceId: 'listing:tetracycline-hydrochloride', idSource: 'listing_text', name: 'Tetracycline Hydrochloride', normalizedName: 'tetracycline hydrochloride', slug: 'tetracycline-hydrochloride' },
      { id: 'g3', sourceId: 'listing:gatifloxacin', idSource: 'listing_text', name: 'Gatifloxacin', normalizedName: 'gatifloxacin', slug: 'gatifloxacin' },
    ];
    const existingBrands = [
      makeBrand({ sourceId: '3442', name: 'Azmasol', normalizedName: 'azmasol', strength: '100 mcg/puff', strengthNorm: '100mcg/puff', dosageForm: 'Metered-Dose Inhaler (MDI)', dosageFormNorm: 'metered-dose inhaler (mdi)' }),
      makeBrand({ sourceId: '8558', name: 'AZ', normalizedName: 'az', strength: '250 mg', strengthNorm: '250mg', dosageForm: 'Tablet', dosageFormNorm: 'tablet' }),
    ];

    const manifest = buildFinalApprovedManifest({
      candidates: [
        // 1. Borderline Inhaler vs MDI -> excluded
        { brandId: '3443', brandName: 'Azmasol', type: 'allopathic', slug: 'azmasol', dosageForm: 'Inhaler', generic: 'Tetracycline Hydrochloride', strength: '100 mcg/puff', manufacturer: 'Beximco', packageContainer: '', packageSize: '' },
        // 2. Uncertain generic route split -> excluded
        { brandId: '5001', brandName: 'Gatioral', type: 'allopathic', slug: 'gatioral', dosageForm: 'Tablet', generic: 'Gatifloxacin (Oral)', strength: '400 mg', manufacturer: 'Square', packageContainer: 'Unit Price: ৳ 25.00', packageSize: '' },
        // 3. Intra-CSV same-mfr duplicate -> both excluded
        { brandId: '21053', brandName: 'Lopidam', type: 'allopathic', slug: 'lopidam-1', dosageForm: 'Injection', generic: 'Alfacalcidol', strength: '370 mg/ml', manufacturer: 'Beximco', packageContainer: '100 ml vial: ৳ 2,643.92', packageSize: '' },
        { brandId: '21054', brandName: 'Lopidam', type: 'allopathic', slug: 'lopidam-2', dosageForm: 'Injection', generic: 'Alfacalcidol', strength: '370 mg/ml', manufacturer: 'Beximco', packageContainer: '50 ml vial: ৳ 1,322.55', packageSize: '' },
        // 4. Approved brand linking to duplicate DB generic -> picks site ID '1060'
        { brandId: '6001', brandName: 'Tetramed', type: 'allopathic', slug: 'tetramed', dosageForm: 'Capsule', generic: 'Tetracycline Hydrochloride', strength: '500 mg', manufacturer: 'ACME', packageContainer: "Unit Price: ৳ 2.00,(100's pack: ৳ 200.00),", packageSize: '' },
        // 5. Approved distinct dosage form with clean new generic -> approved
        { brandId: '8559', brandName: 'AZ', type: 'allopathic', slug: 'az-cap', dosageForm: 'Capsule', generic: 'Celecoxib', strength: '250 mg', manufacturer: 'ACME', packageContainer: "Unit Price: ৳ 35.00,(10's pack: ৳ 350.00),", packageSize: '' },
      ],
      existingBrands,
      existingGenerics,
      manufacturerIds: new Map([['ACME', '3']]),
    });

    expect(manifest.excludedRecords.map((e) => e.brandId).sort()).toEqual(['21053', '21054', '3443', '5001']);
    expect(manifest.approvedBrands).toHaveLength(2);
    expect(manifest.approvedBrands.find((b) => b.sourceId === '6001')?.targetGenericSourceId).toBe('1060');
    expect(manifest.approvedGenerics.map((g) => g.name)).toEqual(['Celecoxib']);
    expect(manifest.approvedPacks).toHaveLength(2);
  });
});

function createTransactionalReconciliationPrisma(options?: { failOnBrandCreateCall?: number }) {
  let seq = 1;
  const nextId = () => `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;

  interface Row extends Record<string, unknown> {
    id: string;
  }

  let state = {
    batches: [] as Row[],
    generics: [
      {
        id: 'existing-gen-1',
        sourceId: '1060',
        idSource: 'site',
        name: 'Tetracycline Hydrochloride',
        normalizedName: 'tetracycline hydrochloride',
        importBatchId: 'pre-existing-batch',
      },
    ] as Row[],
    brands: [
      {
        id: 'existing-brand-1',
        sourceId: '999',
        name: 'ExistingMed',
        normalizedName: 'existingmed',
        genericId: 'existing-gen-1',
        importBatchId: 'pre-existing-batch',
      },
    ] as Row[],
    packs: [
      {
        id: 'existing-pack-1',
        brandId: 'existing-brand-1',
        packQuantity: "10's pack",
        packUnits: 10,
        unitPrice: '5.00',
        packPrice: '50.00',
      },
    ] as Row[],
  };

  let brandCreateCalls = 0;

  const makeTxClient = (store: typeof state) => ({
    catalogueImportBatch: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: nextId(), ...data };
        store.batches.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const found = store.batches.find((b) => b.id === where.id);
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
          if (skipDuplicates && store.generics.some((g) => g.sourceId === item.sourceId)) continue;
          store.generics.push({ id: nextId(), ...item });
          count += 1;
        }
        return { count };
      },
      findMany: async () => store.generics.map((g) => ({ id: g.id, sourceId: g.sourceId })),
    },
    medicineBrand: {
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: Array<{ sourceId: string } & Record<string, unknown>>;
        skipDuplicates?: boolean;
      }) => {
        brandCreateCalls += 1;
        if (options?.failOnBrandCreateCall && brandCreateCalls === options.failOnBrandCreateCall) {
          throw new Error('Simulated batch failure on brand chunk');
        }
        let count = 0;
        for (const item of data) {
          if (skipDuplicates && store.brands.some((b) => b.sourceId === item.sourceId)) continue;
          store.brands.push({ id: nextId(), ...item });
          count += 1;
        }
        return { count };
      },
      findMany: async ({ where }: { where?: { sourceId?: { in?: string[] } } }) => {
        const list = where?.sourceId?.in
          ? store.brands.filter((b) => where.sourceId!.in!.includes(String(b.sourceId)))
          : store.brands;
        return list.map((b) => ({ id: b.id, sourceId: b.sourceId }));
      },
    },
    medicinePack: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        for (const item of data) {
          store.packs.push({ id: nextId(), ...item });
        }
        return { count: data.length };
      },
      findMany: async ({ where }: { where?: { brandId?: { in?: string[] } } }) => {
        if (!where?.brandId?.in) return store.packs;
        return store.packs.filter((p) => where.brandId!.in!.includes(String(p.brandId)));
      },
    },
  });

  const rootClient = {
    ...makeTxClient(state),
    getState: () => state,
    $transaction: async <T>(fn: (tx: ReturnType<typeof makeTxClient>) => Promise<T>): Promise<T> => {
      const cloned: typeof state = JSON.parse(JSON.stringify(state));
      const result = await fn(makeTxClient(cloned));
      state = cloned;
      return result;
    },
  };

  return rootClient;
}

describe('reconciliation transaction, idempotency, and rollback safety', () => {
  const sampleManifest = buildFinalApprovedManifest({
    candidates: [
      {
        brandId: '7001',
        brandName: 'SafeBrandA',
        type: 'allopathic',
        slug: 'safebranda',
        dosageForm: 'Tablet',
        generic: 'Celecoxib',
        strength: '200 mg',
        manufacturer: 'ACME',
        packageContainer: "Unit Price: ৳ 12.00,(10's pack: ৳ 120.00),",
        packageSize: '',
      },
      {
        brandId: '7002',
        brandName: 'SafeBrandB',
        type: 'allopathic',
        slug: 'safebrandb',
        dosageForm: 'Capsule',
        generic: 'Tetracycline Hydrochloride',
        strength: '500 mg',
        manufacturer: 'ACME',
        packageContainer: "Unit Price: ৳ 3.00,(50's pack: ৳ 150.00),",
        packageSize: '',
      },
    ],
    existingBrands: [],
    existingGenerics: [
      {
        id: 'existing-gen-1',
        sourceId: '1060',
        idSource: 'site',
        name: 'Tetracycline Hydrochloride',
        normalizedName: 'tetracycline hydrochloride',
        slug: 'tetracycline-hydrochloride',
      },
    ],
    manufacturerIds: new Map([['ACME', '3']]),
  });

  it('rolls back all batches atomically on partial failure and recovers cleanly on retry', async () => {
    const prismaMock = createTransactionalReconciliationPrisma({ failOnBrandCreateCall: 2 });
    const service = new ReconciliationService(prismaMock as unknown as PrismaService);

    await expect(
      service.applyVerifiedManifest({
        manifest: sampleManifest,
        source: 'kaggle',
        batchSize: 1,
      }),
    ).rejects.toThrow('Simulated batch failure on brand chunk');

    // Atomic rollback: zero partial generics, brands, or packs remain; existing records untouched
    const afterFail = prismaMock.getState();
    expect(afterFail.generics).toHaveLength(1);
    expect(afterFail.brands).toHaveLength(1);
    expect(afterFail.packs).toHaveLength(1);
    expect(afterFail.batches[0].status).toBe('FAILED');

    // Retry succeeds cleanly across all chunks
    const retryRes = await service.applyVerifiedManifest({
      manifest: sampleManifest,
      source: 'kaggle',
      batchSize: 1,
    });
    expect(retryRes.insertedGenerics).toBe(1);
    expect(retryRes.insertedBrands).toBe(2);
    expect(retryRes.insertedPacks).toBe(2);

    const afterRetry = prismaMock.getState();
    expect(afterRetry.generics).toHaveLength(2);
    expect(afterRetry.brands).toHaveLength(3);
    expect(afterRetry.packs).toHaveLength(3);
  });

  it('is strictly idempotent on rerun, tags every inserted row with unique importBatchId, and never mutates existing rows', async () => {
    const prismaMock = createTransactionalReconciliationPrisma();
    const service = new ReconciliationService(prismaMock as unknown as PrismaService);

    const run1 = await service.applyVerifiedManifest({
      manifest: sampleManifest,
      source: 'kaggle',
      batchSize: 500,
    });
    expect(run1.insertedGenerics).toBe(1);
    expect(run1.insertedBrands).toBe(2);
    expect(run1.insertedPacks).toBe(2);

    // Every newly inserted generic and brand carries run1.batchId; pre-existing records keep original batchId
    const stateAfter1 = prismaMock.getState();
    const newGenerics = stateAfter1.generics.filter((g) => g.importBatchId === run1.batchId);
    const newBrands = stateAfter1.brands.filter((b) => b.importBatchId === run1.batchId);
    expect(newGenerics).toHaveLength(1);
    expect(newBrands).toHaveLength(2);
    expect(stateAfter1.generics.find((g) => g.id === 'existing-gen-1')?.importBatchId).toBe(
      'pre-existing-batch',
    );
    expect(stateAfter1.brands.find((b) => b.id === 'existing-brand-1')?.importBatchId).toBe(
      'pre-existing-batch',
    );

    // Rerun same manifest -> inserts 0 generics, 0 brands, 0 packs
    const run2 = await service.applyVerifiedManifest({
      manifest: sampleManifest,
      source: 'kaggle',
      batchSize: 500,
    });
    expect(run2.batchId).not.toBe(run1.batchId);
    expect(run2.insertedGenerics).toBe(0);
    expect(run2.insertedBrands).toBe(0);
    expect(run2.insertedPacks).toBe(0);

    const stateAfter2 = prismaMock.getState();
    expect(stateAfter2.generics).toHaveLength(2);
    expect(stateAfter2.brands).toHaveLength(3);
    expect(stateAfter2.packs).toHaveLength(3);
  });
});
