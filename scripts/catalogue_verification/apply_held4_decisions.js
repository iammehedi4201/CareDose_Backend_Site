/**
 * Controlled applicator (DRY-RUN BY DEFAULT) for the 4 user-approved Held Decisions:
 *   Tx1 (2 prices): Sub-batch A2 (Actemra 400 mg -> 43500.00, Mabthera 1400 mg -> 65500.00)
 *   Tx2 (1 pack+price migration): Carva 75 mg Option B (200's pack @ 0.63/126 -> 13 x 15, pu=195, su=15, unit=0.80, pack=156.00)
 *   Tx3 (1 zero-pack insert): Sultolin 100 mcg/puff #3514 ('200 metered doses (Refill)', packPrice=220.00)
 *
 * Requires --execute --confirm-held4 and verified care_dose_pre_batch2b_held4_backup.dump.
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const envText = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8');
const dbUrl = envText.match(/^DIRECT_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const { PrismaClient, Prisma } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const MANIFEST_PATH = path.join(REPO, 'backend/reports/batch2b_staging/proposed_batch2b_and_quickfixes_manifest.json');
const BACKUP_PATH = path.join(REPO, 'care_dose_pre_batch2b_held4_backup.dump');
const EXEC_DIR = path.join(REPO, 'backend/reports/batch2b_held4_execution');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const confirmed = args.includes('--confirm-held4');

function decEqRaw(dbDec, rawVal) {
  const s = rawVal === null || rawVal === undefined || rawVal === '' ? null : String(rawVal);
  if (dbDec === null || dbDec === undefined) return s === null;
  if (s === null) return false;
  return new Prisma.Decimal(dbDec.toString()).eq(new Prisma.Decimal(s));
}

function arrEq(a, b) {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}

(async () => {
  if (execute && !confirmed) {
    throw new Error('Refusing PostgreSQL writes without both --execute and --confirm-held4.');
  }

  const man = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const a2Targets = man.subbatchA2_rocheBiologicsMultiPharmacyConfirmed_2;
  const carvaTarget = man.heldC2_carvaPackMigrationDecision_1;
  const sultolinTarget = man.heldD2_sultolinRefillOrDuplicateDecision_1;

  if (a2Targets.length !== 2) throw new Error(`Expected 2 Sub-batch A2 records, found ${a2Targets.length}`);

  const carvaProposed = carvaTarget.options.optionB_fullLiveMedexMigration;
  const sultolinInsert = {
    brandId: sultolinTarget.brandId,
    packQuantity: sultolinTarget.options.optionA_backfillRefillOn3514.packQuantity,
    packUnits: null,
    stripUnits: null,
    unitPrice: null,
    packPrice: sultolinTarget.options.optionA_backfillRefillOn3514.packPrice,
    currency: 'BDT',
    unitPriceLabel: null,
    priceSource: 'brand_page',
    sourceUrl: sultolinTarget.options.optionA_backfillRefillOn3514.sourceUrl,
    verification: 'UNVERIFIED',
    warnings: [],
  };

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const pre = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const [generics, brands, packs] = await Promise.all([
          tx.medicineGeneric.count(),
          tx.medicineBrand.count(),
          tx.medicinePack.count(),
        ]);
        const targetPacks = await tx.medicinePack.findMany({
          where: { id: { in: [...a2Targets.map((x) => x.packId), carvaTarget.packId] } },
          select: {
            id: true, brandId: true, packQuantity: true, packUnits: true, stripUnits: true,
            unitPrice: true, packPrice: true, currency: true, verification: true, warnings: true,
          },
        });
        const sultolinBrand = await tx.medicineBrand.findUnique({
          where: { id: sultolinTarget.brandId },
          include: { packs: { select: { id: true } } },
        });
        return { counts: { generics, brands, packs }, targetPacks, sultolinBrand };
      },
      { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 60000 },
    );

    const pMap = new Map(pre.targetPacks.map((r) => [r.id, r]));
    const mismatches = [];

    for (const item of a2Targets) {
      const r = pMap.get(item.packId);
      const ok =
        r &&
        r.brandId === item.brandId &&
        (r.packQuantity ?? null) === (item.packQuantity ?? null) &&
        (r.packUnits ?? null) === (item.packUnits ?? null) &&
        (r.stripUnits ?? null) === (item.stripUnits ?? null) &&
        r.currency === item.currentValues.currency &&
        r.verification === item.currentValues.verification &&
        decEqRaw(r.unitPrice, item.currentValues.unitPrice) &&
        decEqRaw(r.packPrice, item.currentValues.packPrice) &&
        arrEq(r.warnings, item.currentValues.warnings);
      if (!ok) mismatches.push({ group: 'A2', packId: item.packId, actual: r });
    }

    const cRow = pMap.get(carvaTarget.packId);
    const carvaOk =
      cRow &&
      cRow.brandId === carvaTarget.brandId &&
      cRow.packQuantity === carvaTarget.currentValues.packQuantity &&
      cRow.packUnits === carvaTarget.currentValues.packUnits &&
      cRow.stripUnits === carvaTarget.currentValues.stripUnits &&
      cRow.currency === 'BDT' &&
      cRow.verification === 'UNVERIFIED' &&
      decEqRaw(cRow.unitPrice, carvaTarget.currentValues.unitPrice) &&
      decEqRaw(cRow.packPrice, carvaTarget.currentValues.packPrice) &&
      arrEq(cRow.warnings, carvaTarget.currentValues.warnings) &&
      new Prisma.Decimal(carvaProposed.unitPrice).mul(new Prisma.Decimal(carvaProposed.packUnits)).eq(new Prisma.Decimal(carvaProposed.packPrice));
    if (!carvaOk) mismatches.push({ group: 'CARVA_OPTION_B', packId: carvaTarget.packId, actual: cRow });

    const sOk =
      pre.sultolinBrand &&
      pre.sultolinBrand.name === 'Sultolin' &&
      pre.sultolinBrand.strength === '100 mcg/puff' &&
      pre.sultolinBrand.packs.length === 0;
    if (!sOk) mismatches.push({ group: 'SULTOLIN_3514', brandId: sultolinTarget.brandId, actual: pre.sultolinBrand });

    if (mismatches.length > 0) {
      console.error(JSON.stringify({ status: 'PRECONDITION_ABORTED', mismatches }, null, 2));
      process.exit(1);
    }

    const dryReport = {
      mode: 'DRY_RUN_PRECONDITIONS_ONLY',
      databaseModified: false,
      databaseCounts: pre.counts,
      matchedPreconditions: 4,
      mismatchesCount: 0,
      breakdown: {
        subbatchA2_rocheBiologics: 2,
        carva75_optionB_fullMedexRefresh: 1,
        sultolin3514_refillInsert: 1,
      },
      carvaArithmeticCheck: `${carvaProposed.unitPrice} * ${carvaProposed.packUnits} = ${carvaProposed.packPrice} (exact)`,
    };

    if (!execute) {
      console.log(JSON.stringify(dryReport, null, 2));
      return;
    }

    if (!fs.existsSync(BACKUP_PATH)) throw new Error(`Required PostgreSQL backup missing: ${BACKUP_PATH}`);
    fs.mkdirSync(EXEC_DIR, { recursive: true });

    const rollbackDoc = {
      generatedAt: new Date().toISOString(),
      backupPath: BACKUP_PATH,
      a2PriceUpdates: a2Targets.map((item) => ({
        packId: item.packId,
        restoreUnitPrice: item.currentValues.unitPrice,
        restorePackPrice: item.currentValues.packPrice,
        applied: item.proposedValues,
      })),
      carvaOptionBRefresh: {
        packId: carvaTarget.packId,
        restore: carvaTarget.currentValues,
        applied: carvaProposed,
      },
      sultolin3514InsertToDeleteOnRollback: {
        brandId: sultolinTarget.brandId,
        brandName: `${sultolinTarget.brandName} ${sultolinTarget.strength}`,
      },
    };
    fs.writeFileSync(path.join(EXEC_DIR, 'held4_pre_execution_snapshot_and_rollback.json'), JSON.stringify(rollbackDoc, null, 2));

    const tx1 = await prisma.$transaction(
      async (tx) => {
        let count = 0;
        for (const item of a2Targets) {
          const res = await tx.medicinePack.updateMany({
            where: {
              id: item.packId,
              brandId: item.brandId,
              packQuantity: item.packQuantity,
              packUnits: item.packUnits,
              stripUnits: item.stripUnits,
              currency: item.currentValues.currency,
              verification: item.currentValues.verification,
              warnings: { equals: item.currentValues.warnings },
              unitPrice: null,
              packPrice: new Prisma.Decimal(item.currentValues.packPrice),
            },
            data: { packPrice: new Prisma.Decimal(item.proposedValues.packPrice) },
          });
          if (res.count !== 1) throw new Error(`Tx1 abort on ${item.packId}`);
          count += res.count;
        }
        return count;
      },
      { isolationLevel: 'Serializable', maxWait: 20000, timeout: 120000 },
    );

    const tx2 = await prisma.$transaction(
      async (tx) => {
        const res = await tx.medicinePack.updateMany({
          where: {
            id: carvaTarget.packId,
            brandId: carvaTarget.brandId,
            packQuantity: carvaTarget.currentValues.packQuantity,
            packUnits: carvaTarget.currentValues.packUnits,
            stripUnits: carvaTarget.currentValues.stripUnits,
            currency: 'BDT',
            verification: 'UNVERIFIED',
            warnings: { equals: [] },
            unitPrice: new Prisma.Decimal(carvaTarget.currentValues.unitPrice),
            packPrice: new Prisma.Decimal(carvaTarget.currentValues.packPrice),
          },
          data: {
            packQuantity: carvaProposed.packQuantity,
            packUnits: carvaProposed.packUnits,
            stripUnits: carvaProposed.stripUnits,
            unitPrice: new Prisma.Decimal(carvaProposed.unitPrice),
            packPrice: new Prisma.Decimal(carvaProposed.packPrice),
          },
        });
        if (res.count !== 1) throw new Error(`Tx2 abort on Carva ${carvaTarget.packId}`);
        return res.count;
      },
      { isolationLevel: 'Serializable', maxWait: 20000, timeout: 120000 },
    );

    let insertedSultolin = null;
    const tx3 = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.medicinePack.count({ where: { brandId: sultolinInsert.brandId } });
        if (existing !== 0) throw new Error(`Tx3 abort: Sultolin #3514 already has ${existing} packs`);
        const created = await tx.medicinePack.create({
          data: {
            brandId: sultolinInsert.brandId,
            packQuantity: sultolinInsert.packQuantity,
            packUnits: null,
            stripUnits: null,
            unitPrice: null,
            packPrice: new Prisma.Decimal(sultolinInsert.packPrice),
            currency: 'BDT',
            unitPriceLabel: null,
            priceSource: 'brand_page',
            sourceUrl: sultolinInsert.sourceUrl,
            collectedAt: new Date(),
            verification: 'UNVERIFIED',
            warnings: [],
          },
        });
        insertedSultolin = { packId: created.id, brandId: created.brandId, packQuantity: created.packQuantity, packPrice: created.packPrice.toString() };
        return 1;
      },
      { isolationLevel: 'Serializable', maxWait: 20000, timeout: 120000 },
    );

    rollbackDoc.insertedSultolinPack = insertedSultolin;
    fs.writeFileSync(path.join(EXEC_DIR, 'held4_rollback_manifest.json'), JSON.stringify(rollbackDoc, null, 2));
    fs.writeFileSync(
      path.join(EXEC_DIR, 'held4_execution_report.json'),
      JSON.stringify({
        status: 'EXECUTED',
        executedAt: new Date().toISOString(),
        backupPath: BACKUP_PATH,
        tx1_a2Prices: tx1,
        tx2_carvaOptionB: tx2,
        tx3_sultolinRefillInsert: tx3,
        a2Targets,
        carvaOptionB: { packId: carvaTarget.packId, before: carvaTarget.currentValues, after: carvaProposed },
        insertedSultolin,
      }, null, 2),
    );
    const csvLines = [
      'subBatch,operation,packId,brandId,brandName,strength,beforeValue,afterValue',
      ...a2Targets.map((x) => `A2_ROCHE_BIOLOGIC,UPDATE_PRICE,${x.packId},${x.brandId},${x.brandName},${x.strength},pack=${x.currentValues.packPrice},pack=${x.proposedValues.packPrice}`),
      `C2_CARVA_OPTION_B,UPDATE_PACK_AND_PRICE,${carvaTarget.packId},${carvaTarget.brandId},Carva,75 mg,"pq=200's pack;pu=200;su=15;u=0.63;pp=126","pq=13 x 15;pu=195;su=15;u=0.80;pp=156.00"`,
      `D2_SULTOLIN_3514,INSERT_PACK,${insertedSultolin.packId},${sultolinInsert.brandId},Sultolin,100 mcg/puff,NO_PACK,"pq=200 metered doses (Refill);pp=220.00"`,
    ];
    fs.writeFileSync(path.join(EXEC_DIR, 'held4_before_after_comparison.csv'), csvLines.join('\n') + '\n');
    console.log(JSON.stringify({ status: 'HELD4_EXECUTED', tx1, tx2, tx3, totalOperations: tx1 + tx2 + tx3, insertedSultolin }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
