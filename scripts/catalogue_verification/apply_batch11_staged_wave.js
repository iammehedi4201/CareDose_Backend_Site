/**
 * Controlled applicator for Batch 11 Staged Wave (STRICTLY DRY-RUN BY DEFAULT).
 * Usage:
 *   node apply_batch11_staged_wave.js                                             # dry-run precondition check (0 writes)
 *   node apply_batch11_staged_wave.js --execute --confirm-batch11                 # applies 155 updates (holds Deltasone 250's)
 *   node apply_batch11_staged_wave.js --execute --confirm-batch11 --delete-obsolete-deltasone250  # also deletes obsolete Deltasone 250's (0 txn refs)
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const rawDbUrl = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8').match(/^DIRECT_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const dbUrl = rawDbUrl.includes('keepalives=')
  ? rawDbUrl
  : `${rawDbUrl}${rawDbUrl.includes('?') ? '&' : '?'}keepalives=1&keepalives_idle=10&keepalives_interval=5&keepalives_count=10`;
const { PrismaClient, Prisma } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const MANIFEST_PATH = path.join(REPO, 'backend/reports/batch11_staging/proposed_batch11_wave_manifest.json');
const BACKUP_PATH = path.join(REPO, 'care_dose_pre_batch11_backup.dump');
const EXEC_DIR = path.join(REPO, 'backend/reports/batch11_remediation_execution');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const confirmed = args.includes('--confirm-batch11');
const deleteObsolete = args.includes('--delete-obsolete-deltasone250');

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
    throw new Error('Refusing PostgreSQL writes without both --execute and --confirm-batch11.');
  }
  if (execute && (!fs.existsSync(BACKUP_PATH) || fs.statSync(BACKUP_PATH).size < 100000)) {
    throw new Error(`Missing or invalid pre-Batch-11 backup dump at ${BACKUP_PATH}`);
  }

  const man = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const updates = man.batch11Updates;
  const optDeletes = deleteObsolete ? man.optionalObsolete2PackDeletes : [];

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const pre = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [generics, brands, packs, dbPacks, dbDelPacks] = await Promise.all([
        tx.medicineGeneric.count(),
        tx.medicineBrand.count(),
        tx.medicinePack.count(),
        tx.medicinePack.findMany({
          where: { id: { in: updates.map((u) => u.packId) } },
          select: {
            id: true, brandId: true, packQuantity: true, packUnits: true, stripUnits: true,
            unitPrice: true, packPrice: true, warnings: true,
          },
        }),
        tx.medicinePack.findMany({
          where: { id: { in: optDeletes.map((d) => d.packId) } },
          include: { _count: { select: { inventoryTransactions: true } } },
        }),
      ]);
      return { counts: { generics, brands, packs }, dbPacks, dbDelPacks };
    }, { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 120000 });

    const pMap = new Map(pre.dbPacks.map((p) => [p.id, p]));
    const dMap = new Map(pre.dbDelPacks.map((p) => [p.id, p]));
    const mismatches = [];

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
      if (!ok) mismatches.push({ kind: 'UPDATE', packId: u.packId, brandName: u.brandName, actual: p });
    }

    for (const d of optDeletes) {
      const p = dMap.get(d.packId);
      const ok =
        p &&
        p.brandId === d.brandId &&
        p._count.inventoryTransactions === 0 &&
        (p.packQuantity ?? null) === (d.currentValues.packQuantity ?? null) &&
        decEqRaw(p.unitPrice, d.currentValues.unitPrice) &&
        decEqRaw(p.packPrice, d.currentValues.packPrice);
      if (!ok) mismatches.push({ kind: 'OPT_DELETE', packId: d.packId, brandName: d.brandName, actual: p });
    }

    if (mismatches.length > 0) {
      throw new Error(`Precondition check failed with ${mismatches.length} mismatches: ${JSON.stringify(mismatches.slice(0, 5))}`);
    }

    if (!execute) {
      console.log(JSON.stringify({
        mode: 'DRY_RUN',
        databaseModified: false,
        baselineCounts: pre.counts,
        preconditionMismatches: 0,
        plannedUpdates: updates.length,
        deleteObsoleteDeltasoneFlag: deleteObsolete,
        plannedOptionalDeletes: optDeletes.length,
        optionalObsoleteDeletesAvailableIfFlagPassed: man.optionalObsolete2PackDeletes.length,
        note: 'Dry-run passed cleanly. Re-run with --execute --confirm-batch11 (and optional --delete-obsolete-deltasone250) after backup & approval.',
      }, null, 2));
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      let updatedCount = 0;
      for (const u of updates) {
        const pv = u.proposedValues;
        await tx.medicinePack.update({
          where: { id: u.packId },
          data: {
            packQuantity: pv.packQuantity,
            packUnits: pv.packUnits,
            stripUnits: pv.stripUnits,
            unitPrice: pv.unitPrice === null ? null : new Prisma.Decimal(String(pv.unitPrice)),
            packPrice: new Prisma.Decimal(String(pv.packPrice)),
            warnings: pv.warnings,
          },
        });
        updatedCount++;
      }

      const deleted = [];
      for (const d of optDeletes) {
        await tx.medicinePack.delete({ where: { id: d.packId } });
        deleted.push({
          packId: d.packId,
          brandId: d.brandId,
          brandName: d.brandName,
          strength: d.strength,
          currentValues: d.currentValues,
        });
      }

      return { updatedCount, deletedCount: deleted.length, deleted };
    }, { maxWait: 30000, timeout: 300000 });

    fs.mkdirSync(EXEC_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(EXEC_DIR, 'batch11_execution_report.json'),
      JSON.stringify({
        executedAt: new Date().toISOString(),
        backupPath: BACKUP_PATH,
        deleteObsoleteDeltasone250: deleteObsolete,
        ...result,
        updates,
      }, null, 2),
    );
    const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvRows = [
      ['subKind', 'op', 'brandName', 'strength', 'packId', 'before_pq', 'before_pu', 'before_su', 'before_u', 'before_pp', 'after_pq', 'after_pu', 'after_su', 'after_u', 'after_pp'].join(','),
      ...updates.map((u) => [
        u.subKind, 'UPDATE', u.brandName, u.strength ?? '', u.packId,
        u.currentValues.packQuantity, u.currentValues.packUnits, u.currentValues.stripUnits, u.currentValues.unitPrice, u.currentValues.packPrice,
        u.proposedValues.packQuantity, u.proposedValues.packUnits, u.proposedValues.stripUnits, u.proposedValues.unitPrice, u.proposedValues.packPrice,
      ].map(csvEscape).join(',')),
      ...result.deleted.map((d) => [
        'OBSOLETE_2PACK_DELETE', 'DELETE', d.brandName, d.strength ?? '', d.packId,
        d.currentValues.packQuantity, d.currentValues.packUnits, d.currentValues.stripUnits, d.currentValues.unitPrice, d.currentValues.packPrice,
        '', '', '', '', '',
      ].map(csvEscape).join(',')),
    ];
    fs.writeFileSync(path.join(EXEC_DIR, 'batch11_before_after_comparison.csv'), csvRows.join('\n'));
    console.log(JSON.stringify({
      mode: 'EXECUTED',
      databaseModified: true,
      updatedCount: result.updatedCount,
      deletedCount: result.deletedCount,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
