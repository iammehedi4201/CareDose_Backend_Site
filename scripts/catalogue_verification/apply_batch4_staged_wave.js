/**
 * Controlled applicator for Batch 4 Staged Wave (STRICTLY DRY-RUN BY DEFAULT).
 * Usage:
 *   node apply_batch4_staged_wave.js                                   # dry-run precondition check (0 writes)
 *   node apply_batch4_staged_wave.js --execute --confirm-batch4        # execute 61 core operations (with verified backup)
 *   node apply_batch4_staged_wave.js --execute --confirm-batch4 --include-salmolin-refill --clear-hpylori-kit-strips
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const dbUrl = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8').match(/^DIRECT_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const { PrismaClient, Prisma } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const MANIFEST_PATH = path.join(REPO, 'backend/reports/batch4_staging/proposed_batch4_wave_manifest.json');
const BACKUP_PATH = path.join(REPO, 'care_dose_pre_batch4_backup.dump');
const EXEC_DIR = path.join(REPO, 'backend/reports/batch4_remediation_execution');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const confirmed = args.includes('--confirm-batch4');
const includeSalmolin = args.includes('--include-salmolin-refill');
const clearHpyloriKits = args.includes('--clear-hpylori-kit-strips');

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

function buildUpdateData(proposedValues) {
  const data = {};
  if ('packQuantity' in proposedValues) data.packQuantity = proposedValues.packQuantity;
  if ('packUnits' in proposedValues) data.packUnits = proposedValues.packUnits;
  if ('stripUnits' in proposedValues) data.stripUnits = proposedValues.stripUnits;
  if ('unitPrice' in proposedValues) {
    data.unitPrice = proposedValues.unitPrice === null ? null : new Prisma.Decimal(String(proposedValues.unitPrice));
  }
  if ('packPrice' in proposedValues) {
    data.packPrice = proposedValues.packPrice === null ? null : new Prisma.Decimal(String(proposedValues.packPrice));
  }
  if ('warnings' in proposedValues) data.warnings = proposedValues.warnings;
  return data;
}

(async () => {
  if (execute && !confirmed) {
    throw new Error('Refusing PostgreSQL writes without both --execute and --confirm-batch4.');
  }
  if (execute && (!fs.existsSync(BACKUP_PATH) || fs.statSync(BACKUP_PATH).size < 100000)) {
    throw new Error(`Missing or invalid pre-Batch-4 backup dump at ${BACKUP_PATH}`);
  }

  const man = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const inserts = [
    ...man.subbatch4A_zeroPackInserts.map((x) => ({ ...x, group: '4A' })),
    ...(includeSalmolin ? [{
      brandId: man.optional4A_duplicateSiblingInhaler.brandId,
      brandName: man.optional4A_duplicateSiblingInhaler.brandName,
      sourceUrl: man.optional4A_duplicateSiblingInhaler.sourceUrl,
      proposedInsert: {
        ...man.optional4A_duplicateSiblingInhaler.proposedInsert,
        currency: 'BDT',
        unitPriceLabel: null,
        priceSource: 'brand_page',
        verification: 'UNVERIFIED',
        warnings: [],
      },
      group: '4A-Opt',
    }] : []),
  ];

  const updates = [
    ...man.subbatch4B_unblockedRem187Fixes.map((x) => ({ ...x, group: '4B' })),
    ...man.subbatch4C_verifyReq55StripAndPriceRepairs.map((x) => ({ ...x, group: '4C' })),
  ];
  const kitClears = clearHpyloriKits
    ? man.heldVerifyReq55.filter((x) => x.kind === 'H_PYLORI_KIT')
    : [];

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const pre = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [generics, brands, packs] = await Promise.all([
        tx.medicineGeneric.count(),
        tx.medicineBrand.count(),
        tx.medicinePack.count(),
      ]);
      const dbBrands = await tx.medicineBrand.findMany({
        where: { id: { in: inserts.map((x) => x.brandId) } },
        include: { packs: { select: { id: true } } },
      });
      const dbPacks = await tx.medicinePack.findMany({
        where: { id: { in: [...updates.map((x) => x.packId), ...kitClears.map((x) => x.packId)] } },
        select: {
          id: true, brandId: true, packQuantity: true, packUnits: true, stripUnits: true,
          unitPrice: true, packPrice: true, warnings: true,
        },
      });
      return { counts: { generics, brands, packs }, dbBrands, dbPacks };
    }, { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 60000 });

    const bMap = new Map(pre.dbBrands.map((b) => [b.id, b]));
    const pMap = new Map(pre.dbPacks.map((p) => [p.id, p]));
    const mismatches = [];

    for (const ins of inserts) {
      const b = bMap.get(ins.brandId);
      if (!b || b.packs.length !== 0) {
        mismatches.push({ kind: 'INSERT', group: ins.group, brandId: ins.brandId, reason: `Expected 0 existing packs, found ${b?.packs?.length}` });
      }
    }

    for (const u of updates) {
      const p = pMap.get(u.packId);
      const ok =
        p &&
        p.brandId === u.brandId &&
        (p.packQuantity ?? null) === (u.currentValues.packQuantity ?? null) &&
        (p.packUnits ?? null) === (u.currentValues.packUnits ?? null) &&
        (p.stripUnits ?? null) === (u.currentValues.stripUnits ?? null) &&
        decEqRaw(p.unitPrice, u.currentValues.unitPrice) &&
        decEqRaw(p.packPrice, u.currentValues.packPrice) &&
        arrEq(p.warnings, u.currentValues.warnings);
      if (!ok) {
        mismatches.push({ kind: 'UPDATE', group: u.group, packId: u.packId, actual: p });
      }
    }

    const kitSpecs = [];
    for (const k of kitClears) {
      const p = pMap.get(k.packId);
      const ok = p && p.stripUnits === 4 && (p.packUnits === 7 || p.packUnits === 14) && arrEq(p.warnings, []);
      if (!ok) {
        mismatches.push({ kind: 'KIT_CLEAR', packId: k.packId, actual: p });
      } else {
        kitSpecs.push({
          ...k,
          before: { packQuantity: p.packQuantity, packUnits: p.packUnits, stripUnits: p.stripUnits, packPrice: p.packPrice?.toString() ?? null },
        });
      }
    }

    if (mismatches.length > 0) {
      throw new Error(`Precondition check failed with ${mismatches.length} mismatches: ${JSON.stringify(mismatches.slice(0, 5))}`);
    }

    if (!execute) {
      console.log(JSON.stringify({
        mode: 'DRY_RUN',
        databaseModified: false,
        includeSalmolinRefill: includeSalmolin,
        clearHpyloriKits,
        baselineCounts: pre.counts,
        preconditionMismatches: 0,
        plannedInserts: inserts.length,
        plannedUpdates: updates.length,
        plannedKitStripClears: kitSpecs.length,
        plannedTotalOperations: inserts.length + updates.length + kitSpecs.length,
        note: 'Dry-run passed cleanly. Re-run with --execute --confirm-batch4 after backup & approval.',
      }, null, 2));
      return;
    }

    const execSummary = await prisma.$transaction(async (tx) => {
      const inserted = [];
      for (const ins of inserts) {
        const created = await tx.medicinePack.create({
          data: {
            brandId: ins.brandId,
            packQuantity: ins.proposedInsert.packQuantity,
            packUnits: ins.proposedInsert.packUnits,
            stripUnits: ins.proposedInsert.stripUnits,
            unitPrice: ins.proposedInsert.unitPrice === null ? null : new Prisma.Decimal(String(ins.proposedInsert.unitPrice)),
            packPrice: new Prisma.Decimal(String(ins.proposedInsert.packPrice)),
            currency: 'BDT',
            unitPriceLabel: null,
            priceSource: 'brand_page',
            sourceUrl: ins.sourceUrl,
            verification: 'UNVERIFIED',
            warnings: [],
          },
          select: { id: true, brandId: true, packQuantity: true, packPrice: true },
        });
        inserted.push({ ...created, group: ins.group, brandName: ins.brandName, proposedInsert: ins.proposedInsert });
      }

      let updatedCount = 0;
      for (const u of updates) {
        await tx.medicinePack.update({
          where: { id: u.packId },
          data: buildUpdateData(u.proposedValues),
        });
        updatedCount++;
      }

      let kitClearedCount = 0;
      for (const ks of kitSpecs) {
        await tx.medicinePack.update({
          where: { id: ks.packId },
          data: { stripUnits: null },
        });
        kitClearedCount++;
      }

      return { insertedCount: inserted.length, updatedCount, kitClearedCount, inserted };
    }, { maxWait: 20000, timeout: 120000 });

    fs.mkdirSync(EXEC_DIR, { recursive: true });
    const report = {
      executedAt: new Date().toISOString(),
      backupPath: BACKUP_PATH,
      includeSalmolinRefill: includeSalmolin,
      clearHpyloriKits,
      insertedCount: execSummary.insertedCount,
      updatedCount: execSummary.updatedCount,
      kitClearedCount: execSummary.kitClearedCount,
      totalOperationsExecuted: execSummary.insertedCount + execSummary.updatedCount + execSummary.kitClearedCount,
      inserted: execSummary.inserted,
      updates,
      hpyloriKitClears: kitSpecs,
    };
    fs.writeFileSync(path.join(EXEC_DIR, 'batch4_execution_report.json'), JSON.stringify(report, null, 2));

    const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvRows = [
      ['group', 'op', 'brandName', 'strength', 'packId', 'before_pq', 'before_pu', 'before_su', 'before_u', 'before_pp', 'after_pq', 'after_pu', 'after_su', 'after_u', 'after_pp', 'warning_action'].join(','),
      ...execSummary.inserted.map((x) => [
        x.group, 'INSERT', x.brandName, '', x.id,
        '', '', '', '', '',
        x.proposedInsert.packQuantity, x.proposedInsert.packUnits, x.proposedInsert.stripUnits, x.proposedInsert.unitPrice, x.proposedInsert.packPrice, 'none',
      ].map(csvEscape).join(',')),
      ...updates.map((u) => [
        u.group, 'UPDATE', u.brandName, u.strength ?? '', u.packId,
        u.currentValues.packQuantity, u.currentValues.packUnits, u.currentValues.stripUnits, u.currentValues.unitPrice, u.currentValues.packPrice,
        'packQuantity' in u.proposedValues ? u.proposedValues.packQuantity : u.currentValues.packQuantity,
        'packUnits' in u.proposedValues ? u.proposedValues.packUnits : u.currentValues.packUnits,
        'stripUnits' in u.proposedValues ? u.proposedValues.stripUnits : u.currentValues.stripUnits,
        'unitPrice' in u.proposedValues ? u.proposedValues.unitPrice : u.currentValues.unitPrice,
        'packPrice' in u.proposedValues ? u.proposedValues.packPrice : u.currentValues.packPrice,
        u.clearsStaleInconsistentWarning ? 'cleared_inconsistent_warning' : 'unchanged',
      ].map(csvEscape).join(',')),
      ...kitSpecs.map((k) => [
        '4D-Kit', 'UPDATE', k.name, '', k.packId,
        k.before.packQuantity, k.before.packUnits, k.before.stripUnits, '', k.before.packPrice,
        k.before.packQuantity, k.before.packUnits, '', '', k.before.packPrice, 'cleared_stripUnits_to_null',
      ].map(csvEscape).join(',')),
    ];
    fs.writeFileSync(path.join(EXEC_DIR, 'batch4_before_after_comparison.csv'), csvRows.join('\n'));

    console.log(JSON.stringify({
      mode: 'EXECUTED',
      databaseModified: true,
      insertedCount: execSummary.insertedCount,
      updatedCount: execSummary.updatedCount,
      kitClearedCount: execSummary.kitClearedCount,
      totalOperationsExecuted: execSummary.insertedCount + execSummary.updatedCount + execSummary.kitClearedCount,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
