/**
 * Controlled multi-transaction applicator (DRY-RUN BY DEFAULT) for Batch 2B + Option 1 Quick Fixes.
 * Reads:  backend/reports/batch2b_staging/proposed_batch2b_and_quickfixes_manifest.json
 * Writes (on --execute ONLY): backend/reports/batch2b_remediation_execution/
 *
 * Flags:
 *   (default, no write flags): Strictly READ-ONLY precondition verification across all staged sub-batches.
 *   --include-roche-a2:        Also include Sub-batch A2 (Actemra 400 + Mabthera 1400).
 *   --execute --confirm-batch2b: Execute PostgreSQL mutations (requires verified backup file present).
 *
 * Separate Serializable transactions per mutation kind:
 *   Tx1: Price corrections (A1 16, or A1+A2 18 if --include-roche-a2) — updates ONLY explicitly proposed price fields
 *   Tx2: Stale warning cleanups (B: 3 packs) — verifies exact Decimal arithmetic & removes only pack_price_inconsistent_with_unit_price
 *   Tx3: Packaging stripUnits updates (C1: 9 packs) — updates ONLY stripUnits
 *   Tx4: Zero-pack MedicinePack inserts (D1: 7 brands) — verifies 0 existing packs on each target brandId before insert
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const envText = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8');
const m = envText.match(/^DIRECT_URL=(.+)$/m);
const dbUrl = m ? m[1].trim().replace(/^["']|["']$/g, '') : process.env.DATABASE_URL;
const { PrismaClient, Prisma } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const MANIFEST_PATH = path.join(REPO, 'backend/reports/batch2b_staging/proposed_batch2b_and_quickfixes_manifest.json');
const BACKUP_PATH = path.join(REPO, 'care_dose_pre_batch2b_backup.dump');
const EXEC_DIR = path.join(REPO, 'backend/reports/batch2b_remediation_execution');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const confirmed = args.includes('--confirm-batch2b');
const includeRocheA2 = args.includes('--include-roche-a2');

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
    throw new Error('Refusing PostgreSQL writes without both --execute and --confirm-batch2b.');
  }
  const man = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  const priceTargets = includeRocheA2
    ? [...man.subbatchA1_liveMedex200Prices_16, ...man.subbatchA2_rocheBiologicsMultiPharmacyConfirmed_2]
    : [...man.subbatchA1_liveMedex200Prices_16];
  const warnTargets = man.subbatchB_staleWarningCleanups_3;
  const stripTargets = man.subbatchC1_verifiedStripHygiene_9;
  const zeroBrandTargets = man.subbatchD1_verifiedZeroPackBackfills_7;

  // Disjointness check across packIds
  const priceSet = new Set(priceTargets.map((x) => x.packId));
  const warnSet = new Set(warnTargets.map((x) => x.packId));
  const stripSet = new Set(stripTargets.map((x) => x.packId));
  for (const id of priceSet) {
    if (warnSet.has(id) || stripSet.has(id)) throw new Error(`Overlapping packId across sub-batches: ${id}`);
  }
  for (const id of warnSet) {
    if (stripSet.has(id)) throw new Error(`Overlapping packId across B and C1: ${id}`);
  }

  const allPackIds = [...priceSet, ...warnSet, ...stripSet];
  const zeroBrandIds = zeroBrandTargets.map((x) => x.brandId);

  const prisma = new PrismaClient(dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined);
  try {
    const precheck = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const [generics, brands, packs] = await Promise.all([
          tx.medicineGeneric.count(),
          tx.medicineBrand.count(),
          tx.medicinePack.count(),
        ]);
        const dbPacks = await tx.medicinePack.findMany({
          where: { id: { in: allPackIds } },
          select: {
            id: true, brandId: true, packQuantity: true, packUnits: true, stripUnits: true,
            unitPrice: true, packPrice: true, currency: true, verification: true, warnings: true,
          },
        });
        const dbBrands = await tx.medicineBrand.findMany({
          where: { id: { in: zeroBrandIds } },
          include: { packs: { select: { id: true } } },
        });
        return { counts: { generics, brands, packs }, dbPacks, dbBrands };
      },
      { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 60000 },
    );

    const pMap = new Map(precheck.dbPacks.map((p) => [p.id, p]));
    const bMap = new Map(precheck.dbBrands.map((b) => [b.id, b]));
    const mismatches = [];

    for (const item of priceTargets) {
      const row = pMap.get(item.packId);
      const ok =
        row &&
        row.brandId === item.brandId &&
        (row.packQuantity ?? null) === (item.packQuantity ?? null) &&
        (row.packUnits ?? null) === (item.packUnits ?? null) &&
        (row.stripUnits ?? null) === (item.stripUnits ?? null) &&
        row.currency === item.currentValues.currency &&
        row.verification === item.currentValues.verification &&
        decEqRaw(row.unitPrice, item.currentValues.unitPrice) &&
        decEqRaw(row.packPrice, item.currentValues.packPrice) &&
        arrEq(row.warnings, item.currentValues.warnings);
      if (!ok) mismatches.push({ group: 'PRICE', packId: item.packId, brand: item.brandName, expected: item.currentValues, actual: row });
    }

    for (const item of warnTargets) {
      const row = pMap.get(item.packId);
      let decExact = false;
      if (row && row.unitPrice !== null && row.packPrice !== null && row.packUnits) {
        decExact = new Prisma.Decimal(row.unitPrice.toString())
          .mul(new Prisma.Decimal(row.packUnits))
          .eq(new Prisma.Decimal(row.packPrice.toString()));
      }
      const ok =
        row &&
        decExact &&
        row.brandId === item.brandId &&
        decEqRaw(row.unitPrice, item.currentValues.unitPrice) &&
        decEqRaw(row.packPrice, item.currentValues.packPrice) &&
        arrEq(row.warnings, ['pack_price_inconsistent_with_unit_price']);
      if (!ok) mismatches.push({ group: 'WARNING', packId: item.packId, brand: item.brandName, decExact, actual: row });
    }

    for (const item of stripTargets) {
      const row = pMap.get(item.packId);
      const ok =
        row &&
        row.brandId === item.brandId &&
        (row.packQuantity ?? null) === (item.packQuantity ?? null) &&
        (row.packUnits ?? null) === (item.packUnits ?? null) &&
        (row.stripUnits ?? null) === (item.currentValues.stripUnits ?? null) &&
        decEqRaw(row.unitPrice, item.currentValues.unitPrice) &&
        decEqRaw(row.packPrice, item.currentValues.packPrice) &&
        arrEq(row.warnings, item.currentValues.warnings);
      if (!ok) mismatches.push({ group: 'STRIP', packId: item.packId, brand: item.brandName, expected: item.currentValues, actual: row });
    }

    for (const item of zeroBrandTargets) {
      const b = bMap.get(item.brandId);
      const ok = b && b.name === item.brandName && b.strength === item.strength && b.packs.length === 0;
      if (!ok) mismatches.push({ group: 'ZERO_PACK_INSERT', brandId: item.brandId, brand: item.brandName, actualPacks: b?.packs?.length });
    }

    if (mismatches.length > 0) {
      console.error(JSON.stringify({ status: 'PRECONDITION_ABORTED', mismatches }, null, 2));
      process.exit(1);
    }

    const dryRunReport = {
      mode: 'DRY_RUN_PRECONDITIONS_ONLY',
      databaseModified: false,
      databaseCounts: precheck.counts,
      includeRocheA2,
      preconditionChecks: {
        subbatchA_priceUpdates: { expected: priceTargets.length, matched: priceTargets.length, mismatches: 0 },
        subbatchB_staleWarnings: { expected: warnTargets.length, matched: warnTargets.length, decimalVerified: warnTargets.length, mismatches: 0 },
        subbatchC1_stripHygiene: { expected: stripTargets.length, matched: stripTargets.length, mismatches: 0 },
        subbatchD1_zeroPackInserts: { expected: zeroBrandTargets.length, matched: zeroBrandTargets.length, mismatches: 0 },
      },
      totalMatchedPreconditions: priceTargets.length + warnTargets.length + stripTargets.length + zeroBrandTargets.length,
      totalMismatches: 0,
      heldOutForDecision: {
        subbatchA2_rocheBiologicsCount: includeRocheA2 ? 0 : 2,
        heldC2_carvaMigrationCount: 1,
        heldD2_sultolinRefillDuplicateCount: 1,
      },
    };

    if (!execute) {
      console.log(JSON.stringify(dryRunReport, null, 2));
      return;
    }

    if (!fs.existsSync(BACKUP_PATH)) {
      throw new Error(`Required PostgreSQL backup missing: ${BACKUP_PATH}`);
    }
    fs.mkdirSync(EXEC_DIR, { recursive: true });

    const rollbackDoc = {
      generatedAt: new Date().toISOString(),
      backupPath: BACKUP_PATH,
      includeRocheA2,
      priceUpdates: priceTargets.map((item) => ({
        packId: item.packId,
        restoreUnitPrice: item.currentValues.unitPrice,
        restorePackPrice: item.currentValues.packPrice,
        applied: item.proposedValues,
      })),
      warningCleanups: warnTargets.map((item) => ({
        packId: item.packId,
        restoreWarnings: item.currentValues.warnings,
        appliedWarnings: [],
      })),
      stripCleanups: stripTargets.map((item) => ({
        packId: item.packId,
        restoreStripUnits: item.currentValues.stripUnits,
        appliedStripUnits: item.proposedValues.stripUnits,
      })),
      zeroPackInsertsToDeleteOnRollback: zeroBrandTargets.map((item) => ({
        brandId: item.brandId,
        brandName: `${item.brandName} ${item.strength}`,
      })),
    };

    const preSnapshotPath = path.join(EXEC_DIR, 'batch2b_pre_execution_snapshot_and_rollback.json');
    fs.writeFileSync(preSnapshotPath, JSON.stringify(rollbackDoc, null, 2));

    const tx1 = await prisma.$transaction(
      async (tx) => {
        let count = 0;
        for (const item of priceTargets) {
          const data = {};
          if (Object.prototype.hasOwnProperty.call(item.proposedValues, 'unitPrice')) {
            data.unitPrice = new Prisma.Decimal(item.proposedValues.unitPrice);
          }
          if (Object.prototype.hasOwnProperty.call(item.proposedValues, 'packPrice')) {
            data.packPrice = new Prisma.Decimal(item.proposedValues.packPrice);
          }
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
              unitPrice: item.currentValues.unitPrice !== null ? new Prisma.Decimal(item.currentValues.unitPrice) : null,
              packPrice: item.currentValues.packPrice !== null ? new Prisma.Decimal(item.currentValues.packPrice) : null,
            },
            data,
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
        let count = 0;
        for (const item of warnTargets) {
          const res = await tx.medicinePack.updateMany({
            where: {
              id: item.packId,
              brandId: item.brandId,
              packQuantity: item.packQuantity,
              packUnits: item.packUnits,
              stripUnits: item.stripUnits,
              currency: item.currentValues.currency,
              verification: item.currentValues.verification,
              unitPrice: new Prisma.Decimal(item.currentValues.unitPrice),
              packPrice: new Prisma.Decimal(item.currentValues.packPrice),
              warnings: { equals: ['pack_price_inconsistent_with_unit_price'] },
            },
            data: { warnings: { set: [] } },
          });
          if (res.count !== 1) throw new Error(`Tx2 abort on ${item.packId}`);
          count += res.count;
        }
        return count;
      },
      { isolationLevel: 'Serializable', maxWait: 20000, timeout: 120000 },
    );

    const tx3 = await prisma.$transaction(
      async (tx) => {
        let count = 0;
        for (const item of stripTargets) {
          const res = await tx.medicinePack.updateMany({
            where: {
              id: item.packId,
              brandId: item.brandId,
              packQuantity: item.packQuantity,
              packUnits: item.packUnits,
              stripUnits: item.currentValues.stripUnits,
              currency: item.currentValues.currency,
              verification: item.currentValues.verification,
              warnings: { equals: item.currentValues.warnings },
              unitPrice: item.currentValues.unitPrice !== null ? new Prisma.Decimal(item.currentValues.unitPrice) : null,
              packPrice: item.currentValues.packPrice !== null ? new Prisma.Decimal(item.currentValues.packPrice) : null,
            },
            data: { stripUnits: item.proposedValues.stripUnits },
          });
          if (res.count !== 1) throw new Error(`Tx3 abort on ${item.packId}`);
          count += res.count;
        }
        return count;
      },
      { isolationLevel: 'Serializable', maxWait: 20000, timeout: 120000 },
    );

    const insertedPacks = [];
    const tx4 = await prisma.$transaction(
      async (tx) => {
        for (const item of zeroBrandTargets) {
          const existing = await tx.medicinePack.count({ where: { brandId: item.brandId } });
          if (existing !== 0) throw new Error(`Tx4 abort: brand ${item.brandId} already has ${existing} packs`);
          const ins = item.proposedInsertPack;
          const created = await tx.medicinePack.create({
            data: {
              brandId: ins.brandId,
              packQuantity: ins.packQuantity,
              packUnits: ins.packUnits,
              stripUnits: ins.stripUnits,
              unitPrice: ins.unitPrice !== null ? new Prisma.Decimal(ins.unitPrice) : null,
              packPrice: new Prisma.Decimal(ins.packPrice),
              currency: ins.currency,
              unitPriceLabel: ins.unitPriceLabel,
              priceSource: ins.priceSource,
              sourceUrl: ins.sourceUrl,
              collectedAt: new Date(),
              verification: ins.verification,
              warnings: ins.warnings,
            },
          });
          insertedPacks.push({
            packId: created.id,
            brandId: created.brandId,
            brandName: item.brandName,
            strength: item.strength,
            packQuantity: ins.packQuantity,
            packUnits: ins.packUnits,
            stripUnits: ins.stripUnits,
            unitPrice: ins.unitPrice,
            packPrice: ins.packPrice,
          });
        }
        return insertedPacks.length;
      },
      { isolationLevel: 'Serializable', maxWait: 20000, timeout: 120000 },
    );

    rollbackDoc.insertedPackIds = insertedPacks;
    fs.writeFileSync(path.join(EXEC_DIR, 'batch2b_rollback_manifest.json'), JSON.stringify(rollbackDoc, null, 2));
    fs.writeFileSync(
      path.join(EXEC_DIR, 'batch2b_execution_report.json'),
      JSON.stringify({
        status: 'EXECUTED',
        executedAt: new Date().toISOString(),
        backupPath: BACKUP_PATH,
        includeRocheA2,
        tx1_prices: tx1,
        tx2_warnings: tx2,
        tx3_strips: tx3,
        tx4_inserts: tx4,
        priceUpdates: priceTargets,
        warningCleanups: warnTargets,
        stripCleanups: stripTargets,
        insertedPacks,
      }, null, 2),
    );
    const csvEsc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csvLines = [
      'subBatch,operation,packId,brandId,brandName,strength,packQuantity,beforeValue,afterValue',
      ...priceTargets.map((x) => {
        const b = `unit=${x.currentValues.unitPrice ?? ''};pack=${x.currentValues.packPrice ?? ''}`;
        const a = `unit=${x.proposedValues.unitPrice ?? x.currentValues.unitPrice ?? ''};pack=${x.proposedValues.packPrice ?? x.currentValues.packPrice ?? ''}`;
        return ['A_PRICE', 'UPDATE_PRICE', x.packId, x.brandId, x.brandName, x.strength, x.packQuantity ?? '', b, a].map(csvEsc).join(',');
      }),
      ...warnTargets.map((x) =>
        ['B_WARNING', 'CLEAR_STALE_WARNING', x.packId, x.brandId, x.brandName, x.strength, x.packQuantity ?? '', JSON.stringify(x.currentValues.warnings), '[]'].map(csvEsc).join(','),
      ),
      ...stripTargets.map((x) =>
        ['C1_STRIP', 'UPDATE_STRIP_UNITS', x.packId, x.brandId, x.brandName, x.strength, x.packQuantity ?? '', x.currentValues.stripUnits, x.proposedValues.stripUnits ?? 'null'].map(csvEsc).join(','),
      ),
      ...insertedPacks.map((x) =>
        ['D1_ZERO_PACK', 'INSERT_PACK', x.packId, x.brandId, x.brandName, x.strength, x.packQuantity, 'NO_PACK', `pu=${x.packUnits ?? ''};su=${x.stripUnits ?? ''};u=${x.unitPrice ?? ''};pp=${x.packPrice}`].map(csvEsc).join(','),
      ),
    ];
    fs.writeFileSync(path.join(EXEC_DIR, 'batch2b_before_after_comparison.csv'), csvLines.join('\n') + '\n');
    console.log(JSON.stringify({ status: 'BATCH_2B_EXECUTED', tx1, tx2, tx3, tx4, totalOperations: tx1 + tx2 + tx3 + tx4 }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
