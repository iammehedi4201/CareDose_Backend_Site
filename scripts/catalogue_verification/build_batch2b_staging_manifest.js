/**
 * Strictly READ-ONLY builder for Batch 2B + Quick Fixes staged manifest.
 * Reads:
 *   - backend/reports/consolidated_remediation/proposed_batch2a_review.json
 *   - backend/reports/batch2a_remediation_execution/batch2a_execution_report.json
 *   - live PostgreSQL (READ ONLY RepeatableRead)
 * Writes (staging artifacts only, zero PostgreSQL mutations):
 *   - backend/reports/batch2b_staging/proposed_batch2b_and_quickfixes_manifest.json
 *   - backend/reports/batch2b_staging/batch2b_staging_report.md
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const envText = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8');
const m = envText.match(/^DIRECT_URL=(.+)$/m);
const dbUrl = m ? m[1].trim().replace(/^["']|["']$/g, '') : process.env.DATABASE_URL;
const { PrismaClient, Prisma } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const STAGING_DIR = path.join(REPO, 'backend/reports/batch2b_staging');
fs.mkdirSync(STAGING_DIR, { recursive: true });

// Live MedEx HTTP-200 verified Tier 3 price map (checked 2026-11-25 against medex.com.bd)
const TIER3_A1_MEDEX_200 = {
  '1d05c010-8033-4f39-a85b-c1fbcda41328': {
    field: 'packPrice',
    newVal: '58005.00',
    liveMedexUrl: 'https://medex.com.bd/brands/15150/trastunix-440-mg-iv-infusion',
    liveMedexText: '440 mg vial: ৳ 58,005.00',
    note: 'Live MedEx revised MRP down from historical Kaggle/Arogga 80,000.00.',
  },
  '235c06ac-1b2c-49aa-98b1-9bd53b27b36b': {
    field: 'packPrice',
    newVal: '3028.00',
    liveMedexUrl: 'https://medex.com.bd/brands/5868/solu-medrol-1-gm-imiv-injection',
    liveMedexText: '1 gm vial: ৳ 3,028.00',
    note: 'Live MedEx current MRP (between historical Kaggle 2,050 and Arogga 3,360.36).',
  },
  '3f8c8c05-5006-4b78-9fdb-d93df9ca99ef': {
    field: 'packPrice',
    newVal: '5950.00',
    liveMedexUrl: 'https://medex.com.bd/brands/14952/zoledron-5-mg-iv-infusion',
    liveMedexText: '100 ml bottle: ৳ 5,950.00',
    note: 'Live MedEx matches historical Kaggle 5,950.00 (Arogga 5,967.89).',
  },
  '57f1158b-1641-4ada-8882-0307fbfdfb7e': {
    field: 'packPrice',
    newVal: '2500.00',
    liveMedexUrl: 'https://medex.com.bd/brands/30204/tocoban-375-mg-iv-infusion',
    liveMedexText: '5 ml vial: ৳ 2,500.00',
    note: '3-way exact match: Live MedEx 2,500 == Arogga #44656 2,500 == Kaggle 2,500.',
  },
  '5d0ea507-c469-40a4-ba6d-9c2b231421ba': {
    field: 'packPrice',
    newVal: '9285.00',
    liveMedexUrl: 'https://medex.com.bd/brands/32012/zavicefta-2-gm-iv-infusion',
    liveMedexText: "2.5 gm vial: ৳ 9,285.00 (1 x 10: ৳ 92,850.00)",
    note: 'Live MedEx revised MRP up from historical Kaggle/Arogga 6,460.00.',
  },
  '75285c7a-6a23-4499-995e-3e443108da58': {
    field: 'packPrice',
    newVal: '92850.00',
    liveMedexUrl: 'https://medex.com.bd/brands/32012/zavicefta-2-gm-iv-infusion',
    liveMedexText: "2.5 gm vial: ৳ 9,285.00 (1 x 10: ৳ 92,850.00)",
    note: "Live MedEx 1x10 pack MRP 92,850.00 (10 * 9,285.00); preserves unitPrice=null to match Moxin pattern.",
  },
  '79d09fdd-067f-4bbf-9597-0a92625574f1': {
    field: 'packPrice',
    newVal: '2410.00',
    liveMedexUrl: 'https://medex.com.bd/brands/34200/diapamiro-370-mg-injection',
    liveMedexText: '100 ml vial: ৳ 2,410.00',
    note: 'Old /brands/21062 slug 404s; canonical MedEx 100 ml page /brands/34200 & Arogga #43848 (stock=1) confirm 2,410.00.',
  },
  '7a3c76f4-da30-4919-9a14-79122dc972b4': {
    field: 'packPrice',
    newVal: '8500.00',
    liveMedexUrl: 'https://medex.com.bd/brands/31899/tolosa-80-mg-iv-infusion',
    liveMedexText: '4 ml vial: ৳ 8,500.00',
    note: '3-way exact match: Live MedEx 8,500 == Arogga 8,500 == Kaggle 8,500.',
  },
  '882b6259-a0a4-44a5-ad62-664b6bc6034e': {
    field: 'packPrice',
    newVal: '1810.00',
    liveMedexUrl: 'https://medex.com.bd/brands/15196/sandostatin-50-mcg-injection',
    liveMedexText: '1 ml ampoule: ৳ 362.00 (1 x 5: ৳ 1,810.00)',
    note: "Live MedEx Novartis revised MRP down to 362/amp (1,810/5's box vs old 7,025.66); preserves unitPrice=null.",
  },
  '8fb9f807-eae5-4515-afe0-7b2373d2b130': {
    field: 'packPrice',
    newVal: '7800.00',
    liveMedexUrl: 'https://medex.com.bd/brands/17283/zerlinda-4-mg-iv-infusion',
    liveMedexText: '4 mg vial: ৳ 7,800.00',
    note: '3-way exact match: Live MedEx 7,800 == Arogga 7,800 == Kaggle 7,800.',
  },
  'a8d1816e-e81c-45fa-9634-2f603c5757d4': {
    field: 'packPrice',
    newVal: '143195.00',
    liveMedexUrl: 'https://medex.com.bd/brands/15164/simulect-20-mg-iv-infusion',
    liveMedexText: '20 mg vial: ৳ 143,195.00',
    note: 'Live MedEx Novartis revised MRP up from historical 103,273.56 / 103,273.',
  },
  'ac2fd04a-f109-486f-9bc2-cb314a05d226': {
    field: 'unitPrice',
    newVal: '475.00',
    liveMedexUrl: 'https://medex.com.bd/brands/15127/tasigna-200-mg-capsule',
    liveMedexText: 'Unit Price: ৳ 475.00 (2 x 14: ৳ 13,300.00) Strip Price: ৳ 6,650.00',
    note: 'Live MedEx Novartis revised unit MRP down from historical 3,051.50 to 475.00; DB comma-truncated 3,051.50 to 3.',
  },
  'ac84743b-ac1c-4821-a276-7d1d62c75b72': {
    field: 'packPrice',
    newVal: '2636.00',
    liveMedexUrl: 'https://medex.com.bd/brands/34198/amidol-370-mg-injection',
    liveMedexText: '100 ml vial: ৳ 2,636.00',
    note: 'Old /brands/28431 slug 404s; canonical MedEx 100 ml page /brands/34198 == Arogga #27390 == Kaggle 2,636.00.',
  },
  'c4d0923b-d557-4108-a69c-772c84dfd4bf': {
    field: 'packPrice',
    newVal: '7000.00',
    liveMedexUrl: 'https://medex.com.bd/brands/25437/zoltero-5-mg-iv-infusion',
    liveMedexText: '100 ml bottle: ৳ 7,000.00',
    note: '3-way exact match: Live MedEx 7,000 == Arogga 7,000 == Kaggle 7,000.',
  },
  'd1499929-fedf-4f25-bc31-0f300c5c8236': {
    field: 'packPrice',
    newVal: '6000.00',
    liveMedexUrl: 'https://medex.com.bd/brands/17269/xoleron-4-mg-iv-infusion',
    liveMedexText: '4 mg vial: ৳ 6,000.00',
    note: '2-way live match: Live MedEx 6,000 == Live Arogga 6,000 (revised up from Kaggle 5,000).',
  },
  'fa72a730-3016-406a-8ee2-50e2df6ad9a7': {
    field: 'packPrice',
    newVal: '10182.92',
    liveMedexUrl: 'https://medex.com.bd/brands/14949/zometa-4-mg-iv-infusion',
    liveMedexText: '4 mg vial: ৳ 10,182.92',
    note: 'Live MedEx Novartis revised MRP down to 10,182.92 (vs historical Kaggle 30,113.60 / Arogga 26,122).',
  },
};

const TIER3_A2_MULTI_PHARMACY_MEDEX_404 = {
  'b98aec67-7bc5-43cf-a79d-ab5b8d58e97c': {
    field: 'packPrice',
    newVal: '43500.00',
    medexStatus: 'HTTP 404 on /brands/29458 (cold-chain distributor SKU unlisted on public MedEx)',
    confirmingSources: ['Kaggle MedEx export: 20 ml vial: ৳ 43,500.00', 'Arogga #32383: 43,500', 'MedEasy: ৳ 43,500 MRP'],
  },
  'c5cc6d1b-8059-49cf-9ce5-9094bf7125d2': {
    field: 'packPrice',
    newVal: '65500.00',
    medexStatus: 'HTTP 404 on /brands/26086 (cold-chain Radiant distributor SKU unlisted on public MedEx)',
    confirmingSources: ['Kaggle MedEx export: 1400 mg vial: ৳ 65,500.00', 'Arogga #36110: 65,500', 'OsudPotro: ৳ 62,225 (exact 5% off 65,500)'],
  },
};

const TIER4_C1_STRIP_MAP = {
  '0493326d-ce7d-4dbe-8791-25733fd79657': {
    newStripUnits: 6,
    reason: "Live MedEx /brands/17259 ('3 x 6: ৳ 7,200.00', Strip ৳2,400) & Arogga confirm Linamide 25 mg 18's pack is 3x6; stripUnits=7 was inherited from 21's pack.",
    liveMedexText: 'Unit Price: ৳ 400.00 (3 x 6: ৳ 7,200.00) Strip Price: ৳ 2,400.00',
  },
  '46e2b822-87fb-4bdc-88c5-df93de4a11bd': {
    newStripUnits: null,
    reason: 'Live MedEx /brands/253 confirms single-blister 25 x 1 box (Strip Price ৳5.00 = Unit Price); clear stripUnits=1 to NULL per stock-calculator >1 rule.',
    liveMedexText: 'Unit Price: ৳ 5.00 (25 x 1: ৳ 125.00) Strip Price: ৳ 5.00',
  },
  '496da6df-df74-461f-afca-949fba59393e': {
    newStripUnits: null,
    reason: 'Live MedEx /brands/297 confirms single-blister 25 x 1 box (Strip Price ৳5.01 = Unit Price); clear stripUnits=1 to NULL.',
    liveMedexText: 'Unit Price: ৳ 5.01 (25 x 1: ৳ 125.25) Strip Price: ৳ 5.01',
  },
  '8af3d2d8-dfa5-4ccb-894d-a4d061a74d85': {
    newStripUnits: null,
    reason: 'Live MedEx /brands/286 confirms single-blister 50 x 1 box (Strip Price ৳5.00 = Unit Price); clear stripUnits=1 to NULL.',
    liveMedexText: 'Unit Price: ৳ 5.00 (50 x 1: ৳ 250.00) Strip Price: ৳ 5.00',
  },
  '991def77-b06d-443b-9628-538030ae8d01': {
    newStripUnits: null,
    reason: 'Live MedEx /brands/274 confirms single-blister 25 x 1 box (Strip Price ৳4.00 = Unit Price); clear stripUnits=1 to NULL.',
    liveMedexText: 'Unit Price: ৳ 4.00 (25 x 1: ৳ 100.00) Strip Price: ৳ 4.00',
  },
  'd2c195bf-7144-43d4-8dbf-9c37989c77df': {
    newStripUnits: null,
    reason: 'Live MedEx /brands/272 confirms single-blister 25 x 1 box (Strip Price ৳5.00 = Unit Price); clear stripUnits=1 to NULL.',
    liveMedexText: 'Unit Price: ৳ 5.00 (25 x 1: ৳ 125.00) Strip Price: ৳ 5.00',
  },
  'd7b6f44a-4688-4aca-8d3a-0c46641de22f': {
    newStripUnits: null,
    reason: 'Live MedEx /brands/312 confirms single-blister 25 x 1 box; clear stripUnits=1 to NULL. (Separate follow-up price note: DB 3.35/83.75 vs Live MedEx 4.50/112.50.)',
    liveMedexText: 'Unit Price: ৳ 4.50 (25 x 1: ৳ 112.50) Strip Price: ৳ 4.50',
  },
  'e847ab4a-22c4-4a83-a179-f1c56abe43a1': {
    newStripUnits: null,
    reason: 'Live MedEx /brands/252 confirms single-blister 48 x 1 box (Strip Price ৳4.50 = Unit Price); clear stripUnits=1 to NULL.',
    liveMedexText: 'Unit Price: ৳ 4.50 (48 x 1: ৳ 216.00) Strip Price: ৳ 4.50',
  },
  'd0ce48a4-9c0a-485e-94b3-6fbfeb419fcb': {
    newStripUnits: null,
    reason: "Per reviewed bVit4Investigation & stock-calculator stripUnits<=100 cap: Live MedEx /brands/13766 confirms '200 tablet strip: ৳ 86.00' vs '45 tablet pot: ৳ 27.00'; clearing stripUnits 200->NULL treats it safely as 200-tab bulk dispenser pack.",
    liveMedexText: '200 tablet strip: ৳ 86.00 45 tablet pot: ৳ 27.00',
  },
};

const ZERO_PACK_D1_INSERTS = {
  '6d37b544-d880-4a77-9741-0512b488eb09': {
    packQuantity: '250 ml bottle (with dispenser)',
    packUnits: null,
    stripUnits: null,
    unitPrice: null,
    packPrice: '150.00',
    unitPriceLabel: null,
    priceSource: 'brand_page',
    sourceUrl: 'https://medex.com.bd/brands/28858/sanityza-clear-05-70-hand-rub',
    liveMedexText: '250 ml bottle (with dispenser): ৳ 150.00',
    aroggaConfirm: 'Arogga #47952 (stock=1, mrp=150)',
  },
  '75f5e741-a439-487e-b4cc-0cf8416eadf2': {
    packQuantity: '3 x 10',
    packUnits: 30,
    stripUnits: 10,
    unitPrice: '20.00',
    packPrice: '600.00',
    unitPriceLabel: 'Unit Price',
    priceSource: 'brand_page',
    sourceUrl: 'https://medex.com.bd/brands/33106/turmeric-1000-mg-capsule',
    liveMedexText: 'Unit Price: ৳ 20.00 (3 x 10: ৳ 600.00) Strip Price: ৳ 200.00',
    aroggaConfirm: 'Arogga #39716 (stock=1, mrp=20, multipliers=[1,10,30])',
  },
  '9f02bd88-2f65-4ff0-aaf6-7a48ef3a9a3c': {
    packQuantity: '8 x 4',
    packUnits: 32,
    stripUnits: 4,
    unitPrice: '18.00',
    packPrice: '576.00',
    unitPriceLabel: 'Unit Price',
    priceSource: 'brand_page',
    sourceUrl: 'https://medex.com.bd/brands/33129/urican-400-mg-capsule',
    liveMedexText: 'Unit Price: ৳ 18.00 (8 x 4: ৳ 576.00) Strip Price: ৳ 72.00',
    aroggaConfirm: 'Arogga #39740 (stock=1, mrp=18, multipliers=[1,4,32])',
  },
  'f476f611-d8e2-4fb9-aa34-ebdc0633c3e9': {
    packQuantity: '3 x 10',
    packUnits: 30,
    stripUnits: 10,
    unitPrice: '210.00',
    packPrice: '6300.00',
    unitPriceLabel: 'Unit Price',
    priceSource: 'brand_page',
    sourceUrl: 'https://medex.com.bd/brands/33103/veneta-50-mg-tablet',
    liveMedexText: 'Unit Price: ৳ 210.00 (3 x 10: ৳ 6,300.00) Strip Price: ৳ 2,100.00',
    aroggaConfirm: 'Arogga #34038 (stock=1, mrp=210, multipliers=[1,10,30])',
  },
  'df58acdc-48f3-4e2f-bd08-4e577542b1fd': {
    packQuantity: '3 x 10',
    packUnits: 30,
    stripUnits: 10,
    unitPrice: '410.00',
    packPrice: '12300.00',
    unitPriceLabel: 'Unit Price',
    priceSource: 'brand_page',
    sourceUrl: 'https://medex.com.bd/brands/33102/veneta-100-mg-tablet',
    liveMedexText: 'Unit Price: ৳ 410.00 (3 x 10: ৳ 12,300.00) Strip Price: ৳ 4,100.00',
    aroggaConfirm: 'Arogga #39004 (stock=1, mrp=410, multipliers=[1,10,30])',
  },
  '818fbf6a-9033-4df5-adce-37d837647b48': {
    packQuantity: '1 x 10',
    packUnits: 10,
    stripUnits: 10,
    unitPrice: '50.00',
    packPrice: '500.00',
    unitPriceLabel: 'Unit Price',
    priceSource: 'brand_page',
    sourceUrl: 'https://medex.com.bd/brands/32783/viera-50-mg-tablet',
    liveMedexText: 'Unit Price: ৳ 50.00 (1 x 10: ৳ 500.00) Strip Price: ৳ 500.00',
    aroggaConfirm: 'Arogga #33922 (stock=1, mrp=50, multipliers=[1,10])',
  },
  'de4a18a0-374b-49a8-a3fd-ae6b2bd0a4ce': {
    packQuantity: '1 x 8',
    packUnits: 8,
    stripUnits: 8,
    unitPrice: '130.00',
    packPrice: '1040.00',
    unitPriceLabel: 'Unit Price',
    priceSource: 'brand_page',
    sourceUrl: 'https://medex.com.bd/brands/32782/viera-200-mg-tablet',
    liveMedexText: 'Unit Price: ৳ 130.00 (1 x 8: ৳ 1,040.00) Strip Price: ৳ 1,040.00',
    aroggaConfirm: 'Arogga #33921 (stock=1, mrp=130, multipliers=[1,8])',
  },
};

(async () => {
  const reviewDoc = JSON.parse(
    fs.readFileSync(path.join(REPO, 'backend/reports/consolidated_remediation/proposed_batch2a_review.json'), 'utf8'),
  );
  const b2aReport = JSON.parse(
    fs.readFileSync(path.join(REPO, 'backend/reports/batch2a_remediation_execution/batch2a_execution_report.json'), 'utf8'),
  );

  const staleWarnIds = b2aReport.records.filter((r) => (r.warnings || []).length > 0).map((r) => r.packId);
  const carvaId = '06e61d13-23c9-4c91-9a5b-1f23fc5d213d';
  const sultolin3514BrandId = 'd3186950-0749-4bd1-bec5-9bf554e59c65';

  const allPackIds = [
    ...Object.keys(TIER3_A1_MEDEX_200),
    ...Object.keys(TIER3_A2_MULTI_PHARMACY_MEDEX_404),
    ...staleWarnIds,
    ...Object.keys(TIER4_C1_STRIP_MAP),
    carvaId,
  ];
  const allZeroBrandIds = [...Object.keys(ZERO_PACK_D1_INSERTS), sultolin3514BrandId];

  const prisma = new PrismaClient(dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined);
  try {
    const dbState = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const [generics, brands, packs] = await Promise.all([
          tx.medicineGeneric.count(),
          tx.medicineBrand.count(),
          tx.medicinePack.count(),
        ]);
        const dbPacks = await tx.medicinePack.findMany({
          where: { id: { in: allPackIds } },
          include: {
            brand: { include: { generic: { select: { name: true } } } },
          },
        });
        const dbZeroBrands = await tx.medicineBrand.findMany({
          where: { id: { in: allZeroBrandIds } },
          include: { packs: true, generic: { select: { name: true } } },
        });
        const siblingsFollowup = await tx.medicinePack.findMany({
          where: {
            id: {
              in: [
                '406d9928-29d8-4313-91a8-06eafde14489', // Sandostatin 1 ml ampoule
                '74da2ebc-d200-4822-81c4-56983a95c17e', // Tasigna 28's pack
                '8309197e-59a9-4304-b151-dc34becb012f', // Diapamiro 370 mg/100 ml
                '3e5f0bda-df07-4c57-b87b-025a045d41ed', // Amidol 370 mg/100 ml
              ],
            },
          },
          include: { brand: true },
        });
        return { counts: { generics, brands, packs }, dbPacks, dbZeroBrands, siblingsFollowup };
      },
      { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 60000 },
    );

    const packById = new Map(dbState.dbPacks.map((p) => [p.id, p]));
    const zById = new Map(dbState.dbZeroBrands.map((b) => [b.id, b]));
    const reviewById = new Map(reviewDoc.records.map((r) => [r.packId, r]));

    const subbatchA1 = Object.entries(TIER3_A1_MEDEX_200).map(([packId, cfg]) => {
      const p = packById.get(packId);
      const rev = reviewById.get(packId);
      if (!p) throw new Error(`Missing A1 pack ${packId}`);
      return {
        priorityRank: rev?.priorityRank ?? null,
        packId: p.id,
        brandId: p.brandId,
        sourceId: p.brand.sourceId,
        brandName: p.brand.name,
        genericName: p.brand.generic?.name ?? rev?.genericName,
        strength: p.brand.strength,
        dosageForm: p.brand.dosageForm,
        manufacturer: p.brand.manufacturer,
        packQuantity: p.packQuantity,
        packUnits: p.packUnits,
        stripUnits: p.stripUnits,
        currentValues: {
          unitPrice: p.unitPrice !== null ? p.unitPrice.toString() : null,
          packPrice: p.packPrice !== null ? p.packPrice.toString() : null,
          currency: p.currency,
          verification: p.verification,
          warnings: p.warnings,
        },
        proposedValues: { [cfg.field]: cfg.newVal },
        confidence: 'HIGH_LIVE_MEDEX_HTTP_200_VERIFIED',
        evidence: {
          liveMedexUrl: cfg.liveMedexUrl,
          liveMedexText: cfg.liveMedexText,
          kaggleContainerString: rev?.evidence?.kaggleContainerString ?? null,
          aroggaExpectedPackPrice: rev?.evidence?.aroggaExpectedPackPrice ?? null,
          note: cfg.note,
        },
      };
    });

    const subbatchA2 = Object.entries(TIER3_A2_MULTI_PHARMACY_MEDEX_404).map(([packId, cfg]) => {
      const p = packById.get(packId);
      const rev = reviewById.get(packId);
      return {
        priorityRank: rev?.priorityRank ?? null,
        packId: p.id,
        brandId: p.brandId,
        sourceId: p.brand.sourceId,
        brandName: p.brand.name,
        genericName: p.brand.generic?.name ?? rev?.genericName,
        strength: p.brand.strength,
        dosageForm: p.brand.dosageForm,
        manufacturer: p.brand.manufacturer,
        packQuantity: p.packQuantity,
        packUnits: p.packUnits,
        stripUnits: p.stripUnits,
        currentValues: {
          unitPrice: p.unitPrice !== null ? p.unitPrice.toString() : null,
          packPrice: p.packPrice !== null ? p.packPrice.toString() : null,
          currency: p.currency,
          verification: p.verification,
          warnings: p.warnings,
        },
        proposedValues: { [cfg.field]: cfg.newVal },
        confidence: 'MEDIUM_HIGH_MULTI_PHARMACY_CONFIRMED_MEDEX_404',
        holdReason: cfg.medexStatus,
        confirmingSources: cfg.confirmingSources,
      };
    });

    const subbatchB = staleWarnIds.map((packId) => {
      const p = packById.get(packId);
      if (!p) throw new Error(`Missing B pack ${packId}`);
      if (p.unitPrice === null || p.packPrice === null || !p.packUnits) {
        throw new Error(`Unexpected null price/packUnits on warning cleanup ${packId}`);
      }
      const dUnit = new Prisma.Decimal(p.unitPrice.toString());
      const dUnits = new Prisma.Decimal(p.packUnits);
      const dPack = new Prisma.Decimal(p.packPrice.toString());
      if (!dUnit.mul(dUnits).eq(dPack)) {
        throw new Error(`Arithmetic mismatch on stale warning candidate ${packId}`);
      }
      return {
        packId: p.id,
        brandId: p.brandId,
        sourceId: p.brand.sourceId,
        brandName: p.brand.name,
        genericName: p.brand.generic?.name,
        strength: p.brand.strength,
        dosageForm: p.brand.dosageForm,
        manufacturer: p.brand.manufacturer,
        packQuantity: p.packQuantity,
        packUnits: p.packUnits,
        stripUnits: p.stripUnits,
        currentValues: {
          unitPrice: p.unitPrice.toString(),
          packPrice: p.packPrice.toString(),
          currency: p.currency,
          verification: p.verification,
          warnings: p.warnings,
        },
        proposedValues: { warnings: [] },
        decimalVerification: `${p.unitPrice} * ${p.packUnits} = ${p.packPrice} (exact)`,
        confidence: 'HIGH_METADATA_HYGIENE',
      };
    });

    const subbatchC1 = Object.entries(TIER4_C1_STRIP_MAP).map(([packId, cfg]) => {
      const p = packById.get(packId);
      const rev = reviewById.get(packId);
      return {
        priorityRank: rev?.priorityRank ?? null,
        packId: p.id,
        brandId: p.brandId,
        sourceId: p.brand.sourceId,
        brandName: p.brand.name,
        genericName: p.brand.generic?.name ?? rev?.genericName,
        strength: p.brand.strength,
        dosageForm: p.brand.dosageForm,
        manufacturer: p.brand.manufacturer,
        packQuantity: p.packQuantity,
        packUnits: p.packUnits,
        currentValues: {
          stripUnits: p.stripUnits,
          unitPrice: p.unitPrice !== null ? p.unitPrice.toString() : null,
          packPrice: p.packPrice !== null ? p.packPrice.toString() : null,
          currency: p.currency,
          verification: p.verification,
          warnings: p.warnings,
        },
        proposedValues: { stripUnits: cfg.newStripUnits },
        confidence: 'HIGH_LIVE_MEDEX_VERIFIED_PACKAGING',
        evidence: {
          medexUrl: p.sourceUrl,
          liveMedexText: cfg.liveMedexText,
          rationale: cfg.reason,
        },
      };
    });

    const carvaP = packById.get(carvaId);
    const carvaHold = {
      priorityRank: 74,
      packId: carvaP.id,
      brandId: carvaP.brandId,
      sourceId: carvaP.brand.sourceId,
      brandName: carvaP.brand.name,
      genericName: carvaP.brand.generic?.name,
      strength: carvaP.brand.strength,
      dosageForm: carvaP.brand.dosageForm,
      manufacturer: carvaP.brand.manufacturer,
      currentValues: {
        packQuantity: carvaP.packQuantity,
        packUnits: carvaP.packUnits,
        stripUnits: carvaP.stripUnits,
        unitPrice: carvaP.unitPrice.toString(),
        packPrice: carvaP.packPrice.toString(),
        warnings: carvaP.warnings,
      },
      confidence: 'HOLD_PACK_MIGRATION_DECISION',
      liveMedexObservation: 'Unit Price: ৳ 0.80 (13 x 15: ৳ 156.00) Strip Price: ৳ 12.00',
      aroggaObservation: 'Arogga #3349 holds both historical 200 Box (20x10) and active 195 Box (13x15 @ ৳0.80).',
      options: {
        optionA_structuralOnlyOnLegacy200Pack: { stripUnits: 10 },
        optionB_fullLiveMedexMigration: {
          packQuantity: '13 x 15',
          packUnits: 195,
          stripUnits: 15,
          unitPrice: '0.80',
          packPrice: '156.00',
        },
      },
    };

    const subbatchD1 = Object.entries(ZERO_PACK_D1_INSERTS).map(([brandId, cfg]) => {
      const b = zById.get(brandId);
      if (!b) throw new Error(`Missing zero-pack brand ${brandId}`);
      if (b.packs.length !== 0) throw new Error(`Expected 0 packs on ${brandId}, found ${b.packs.length}`);
      return {
        brandId: b.id,
        sourceId: b.sourceId,
        brandName: b.name,
        genericName: b.generic?.name,
        strength: b.strength,
        dosageForm: b.dosageForm,
        manufacturer: b.manufacturer,
        existingPackCount: b.packs.length,
        proposedInsertPack: {
          brandId: b.id,
          packQuantity: cfg.packQuantity,
          packUnits: cfg.packUnits,
          stripUnits: cfg.stripUnits,
          unitPrice: cfg.unitPrice,
          packPrice: cfg.packPrice,
          currency: 'BDT',
          unitPriceLabel: cfg.unitPriceLabel,
          priceSource: cfg.priceSource,
          sourceUrl: cfg.sourceUrl,
          verification: 'UNVERIFIED',
          warnings: [],
        },
        confidence: 'HIGH_LIVE_MEDEX_AND_AROGGA_CONFIRMED',
        evidence: {
          liveMedexUrl: cfg.sourceUrl,
          liveMedexText: cfg.liveMedexText,
          aroggaConfirm: cfg.aroggaConfirm,
        },
      };
    });

    const sultolinB = zById.get(sultolin3514BrandId);
    const sultolinHold = {
      brandId: sultolinB.id,
      sourceId: sultolinB.sourceId,
      brandName: sultolinB.name,
      strength: sultolinB.strength,
      dosageForm: sultolinB.dosageForm,
      manufacturer: sultolinB.manufacturer,
      existingPackCount: sultolinB.packs.length,
      confidence: 'HOLD_DUPLICATE_BRAND_OR_REFILL_DECISION',
      finding:
        'Duplicate sibling MedicineBrand 0804bf0f-69bb-43b1-9197-a2cf6089c6bb (sourceId 3513) already has 200 metered doses @ ৳250.00. Live MedEx /brands/3514 returns 404 because Refill (৳220.00) is now listed under /brands/3513/sultolin-100-mcg-inhaler alongside Arogga #29018 Sultolin Refill.',
      options: {
        optionA_backfillRefillOn3514: {
          packQuantity: '200 metered doses (Refill)',
          packPrice: '220.00',
          sourceUrl: 'https://medex.com.bd/brands/3513/sultolin-100-mcg-inhaler',
        },
        optionB_keep3514EmptyOrAddRefillTo3513: 'Add Refill pack to active brand #3513 and leave/retire deprecated #3514 separately.',
      },
    };

    const manifest = {
      generatedAt: new Date().toISOString(),
      databaseBaselineCounts: dbState.counts,
      summary: {
        subbatchA1_liveMedex200PricesCount: subbatchA1.length,
        subbatchA2_multiPharmacyMedex404BiologicsCount: subbatchA2.length,
        subbatchB_staleWarningCleanupsCount: subbatchB.length,
        subbatchC1_verifiedStripHygieneCount: subbatchC1.length,
        heldC2_carvaMigrationDecisionCount: 1,
        subbatchD1_verifiedZeroPackBackfillsCount: subbatchD1.length,
        heldD2_sultolinRefillDuplicateDecisionCount: 1,
        defaultReadyExecutableTotal:
          subbatchA1.length + subbatchB.length + subbatchC1.length + subbatchD1.length,
        optionalWithA2BiologicsTotal:
          subbatchA1.length + subbatchA2.length + subbatchB.length + subbatchC1.length + subbatchD1.length,
      },
      subbatchA1_liveMedex200Prices_16: subbatchA1,
      subbatchA2_rocheBiologicsMultiPharmacyConfirmed_2: subbatchA2,
      subbatchB_staleWarningCleanups_3: subbatchB,
      subbatchC1_verifiedStripHygiene_9: subbatchC1,
      heldC2_carvaPackMigrationDecision_1: carvaHold,
      subbatchD1_verifiedZeroPackBackfills_7: subbatchD1,
      heldD2_sultolinRefillOrDuplicateDecision_1: sultolinHold,
      adjacentOutOfScopeObservations: [
        ...dbState.siblingsFollowup.map((s) => ({
          packId: s.id,
          brandName: `${s.brand.name} ${s.brand.strength}`,
          packQuantity: s.packQuantity,
          currentUnitPrice: s.unitPrice?.toString() ?? null,
          currentPackPrice: s.packPrice?.toString() ?? null,
          note:
            s.id === '406d9928-29d8-4313-91a8-06eafde14489'
              ? 'Sibling Sandostatin 1 ml ampoule currently has packPrice=1 vs Live MedEx ৳362.00 (comma-truncated from historical 1,405.13).'
              : s.id === '74da2ebc-d200-4822-81c4-56983a95c17e'
                ? "Sibling Tasigna 28's pack currently has 3051.50 / 85442.00 vs Live MedEx 475.00 / 13300.00."
                : 'Separate 370 mg/100 ml contrast brand row holds 50 ml vial = 1203; queue for contrast SKU deduplication review.',
        })),
        {
          packId: 'd7b6f44a-4688-4aca-8d3a-0c46641de22f',
          brandName: 'Elmin 400 mg',
          packQuantity: '25 x 1',
          currentUnitPrice: '3.35',
          currentPackPrice: '83.75',
          note: 'Sub-batch C1 clears only stripUnits 1->NULL; Live MedEx /brands/312 now shows ৳4.50 / ৳112.50 (future price revision candidate).',
        },
      ],
    };

    const jsonPath = path.join(STAGING_DIR, 'proposed_batch2b_and_quickfixes_manifest.json');
    fs.writeFileSync(jsonPath, JSON.stringify(manifest, null, 2));

    // Write concise Markdown review report
    const mdLines = [
      '# CareDose — Staged Batch 2B & Option 1 Quick Fixes Review (Read-Only Staging)',
      '',
      `Generated: ${manifest.generatedAt} | DB Baseline: ${dbState.counts.generics} generics, ${dbState.counts.brands} brands, ${dbState.counts.packs} packs`,
      '',
      '## Staging Scope Summary',
      `- **Sub-batch A1 (16 Price Fixes — Live MedEx HTTP 200 Confirmed):** Ready`,
      `- **Sub-batch A2 (2 Roche Biologics — MedEx 404, 3-Way Pharmacy Confirmed):** Separate opt-in (\`--include-roche-a2\`)`,
      `- **Sub-batch B (3 Stale Warning Cleanups):** Ready (Decimal arithmetic exact)`,
      `- **Sub-batch C1 (9 Strip Hygiene Updates):** Ready (Linamide 7->6, 7x Nx1 1->NULL, B-Vit 4 200->NULL)`,
      `- **Held C2 (1 SKU — Carva 75 mg):** Held pending decision between \`200's\` strip \`15->10\` vs Live MedEx \`13 x 15 @ ৳0.80 / ৳156\``,
      `- **Sub-batch D1 (7 Zero-Pack Brand Inserts):** Ready (Sanityza Clear, Turmeric, Urican, Veneta 50/100, Viera 50/200)`,
      `- **Held D2 (1 SKU — Sultolin 100 mcg/puff #3514):** Held duplicate/refill decision (#3513 already active @ ৳250; #3514 maps to Refill ৳220)`,
      '',
      '## Sub-batch A1 — 16 Live MedEx Confirmed Tier 3 Price Corrections',
      '| Rank | Brand | Pack | Old Price | New MedEx MRP | Live Source Note |',
      '|---:|---|---|---:|---:|---|',
      ...subbatchA1.map((x) => {
        const oldP = x.currentValues.packPrice ?? x.currentValues.unitPrice;
        const newP = x.proposedValues.packPrice ?? x.proposedValues.unitPrice;
        return `| #${x.priorityRank} | ${x.brandName} ${x.strength} | ${x.packQuantity ?? '(unit)'} | ৳${oldP} | **৳${newP}** | ${x.evidence.note} |`;
      }),
      '',
      '## Sub-batch A2 — 2 Cold-Chain Biologics (MedEx 404, Multi-Pharmacy Confirmed)',
      '| Rank | Brand | Pack | Old Price | Proposed MRP | Confirming Sources |',
      '|---:|---|---|---:|---:|---|',
      ...subbatchA2.map((x) => `| #${x.priorityRank} | ${x.brandName} ${x.strength} | ${x.packQuantity} | ৳${x.currentValues.packPrice} | **৳${x.proposedValues.packPrice}** | ${x.confirmingSources.join('; ')} |`),
      '',
      '## Sub-batch B — 3 Stale Warning Cleanups',
      ...subbatchB.map((x) => `- **${x.brandName} ${x.strength}**: \`${x.decimalVerification}\` -> remove \`pack_price_inconsistent_with_unit_price\``),
      '',
      '## Sub-batch C1 — 9 Verified Strip Cleanups (+ Held Carva)',
      ...subbatchC1.map((x) => `- **#${x.priorityRank} ${x.brandName} ${x.strength}** (\`${x.packQuantity}\`): \`stripUnits ${x.currentValues.stripUnits} -> ${x.proposedValues.stripUnits}\` — ${x.evidence.rationale}`),
      `- **HELD #74 Carva 75 mg** (\`200's pack\`, \`stripUnits=15\`, \`0.63/126\`): Live MedEx now shows \`13 x 15: ৳156.00 (৳0.80/tab)\`. Choose Option A (\`stripUnits 15->10\` on \`200's\`) or Option B (full refresh to \`13 x 15\`, \`pu=195, su=15, 0.80/156\`).`,
      '',
      '## Sub-batch D1 — 7 Verified Zero-Pack Inserts (+ Held Sultolin #3514)',
      '| Brand | Pack | Pack Units | Strip Units | Unit Price | Pack Price | Confirmation |',
      '|---|---|---:|---:|---:|---:|---|',
      ...subbatchD1.map((x) => `| ${x.brandName} ${x.strength} | ${x.proposedInsertPack.packQuantity} | ${x.proposedInsertPack.packUnits ?? '-'} | ${x.proposedInsertPack.stripUnits ?? '-'} | ${x.proposedInsertPack.unitPrice ?? '-'} | **৳${x.proposedInsertPack.packPrice}** | ${x.evidence.aroggaConfirm} |`),
      `- **HELD Sultolin 100 mcg/puff (\`#3514\`, brandId \`${sultolinHold.brandId}\`)**: Sibling \`#3513\` already has \`200 metered doses @ ৳250\`. Decide whether to backfill \`200 metered doses (Refill) @ ৳220.00\` on \`#3514\` or consolidate onto \`#3513\`.`,
      '',
    ];
    fs.writeFileSync(path.join(STAGING_DIR, 'batch2b_staging_report.md'), mdLines.join('\n'));

    console.log(JSON.stringify({ status: 'STAGED_MANIFEST_WRITTEN', summary: manifest.summary, jsonPath }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
