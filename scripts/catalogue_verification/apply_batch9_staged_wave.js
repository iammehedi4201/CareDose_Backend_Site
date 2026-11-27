/**
 * Controlled applicator for Batch 9 Staged Wave (STRICTLY DRY-RUN BY DEFAULT).
 * Usage:
 *   node apply_batch9_staged_wave.js                         # dry-run precondition check (0 writes)
 *   node apply_batch9_staged_wave.js --execute --confirm-batch9
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const dbUrl = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8').match(/^DIRECT_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const { PrismaClient, Prisma } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const MANIFEST_PATH = path.join(REPO, 'backend/reports/batch9_staging/proposed_batch9_wave_manifest.json');
const BACKUP_PATH = path.join(REPO, 'care_dose_pre_batch9_backup.dump');
const EXEC_DIR = path.join(REPO, 'backend/reports/batch9_remediation_execution');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const confirmed = args.includes('--confirm-batch9');

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
    throw new Error('Refusing PostgreSQL writes without both --execute and --confirm-batch9.');
  }
  if (execute && (!fs.existsSync(BACKUP_PATH) || fs.statSync(BACKUP_PATH).size < 100000)) {
    throw new Error(`Missing or invalid pre-Batch-9 backup dump at ${BACKUP_PATH}`);
  }

  const man = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const updates = man.batch9Updates;

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const pre = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [generics, brands, packs, dbPacks] = await Promise.all([
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
      ]);
      return { counts: { generics, brands, packs }, dbPacks };
    }, { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 60000 });

    const pMap = new Map(pre.dbPacks.map((p) => [p.id, p]));
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
      if (!ok) mismatches.push({ packId: u.packId, brandName: u.brandName, actual: p });
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
        plannedTotalUpdates: updates.length,
        plannedWarningsCleared: man.summary.warningsClearedCount,
        note: 'Dry-run passed cleanly. Re-run with --execute --confirm-batch9 after backup & approval.',
      }, null, 2));
      return;
    }

    const updatedCount = await prisma.$transaction(async (tx) => {
      let count = 0;
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
        count++;
      }
      return count;
    }, { maxWait: 30000, timeout: 300000 });

    fs.mkdirSync(EXEC_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(EXEC_DIR, 'batch9_execution_report.json'),
      JSON.stringify({ executedAt: new Date().toISOString(), backupPath: BACKUP_PATH, updatedCount, updates }, null, 2),
    );
    const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvRows = [
      ['subKind', 'brandName', 'strength', 'packId', 'before_pq', 'before_pu', 'before_su', 'before_u', 'before_pp', 'after_pq', 'after_pu', 'after_su', 'after_u', 'after_pp'].join(','),
      ...updates.map((u) => [
        u.subKind, u.brandName, u.strength ?? '', u.packId,
        u.currentValues.packQuantity, u.currentValues.packUnits, u.currentValues.stripUnits, u.currentValues.unitPrice, u.currentValues.packPrice,
        u.proposedValues.packQuantity, u.proposedValues.packUnits, u.proposedValues.stripUnits, u.proposedValues.unitPrice, u.proposedValues.packPrice,
      ].map(csvEscape).join(',')),
    ];
    fs.writeFileSync(path.join(EXEC_DIR, 'batch9_before_after_comparison.csv'), csvRows.join('\n'));
    console.log(JSON.stringify({ mode: 'EXECUTED', databaseModified: true, updatedCount }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
