/**
 * Controlled applicator for Zero-Pack Brand priceFieldStatus Sync (STRICTLY DRY-RUN BY DEFAULT).
 * Usage:
 *   node apply_zero_pack_price_status_sync.js                                   # dry-run precondition check (0 writes)
 *   node apply_zero_pack_price_status_sync.js --execute --confirm-zero-pack-status  # updates 16 brands PRESENT -> UNAVAILABLE
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const rawDbUrl = fs
  .readFileSync(path.join(REPO, 'backend/.env'), 'utf8')
  .match(/^DIRECT_URL=(.+)$/m)[1]
  .trim()
  .replace(/^["']|["']$/g, '');
const dbUrl = rawDbUrl.includes('keepalives=')
  ? rawDbUrl
  : `${rawDbUrl}${rawDbUrl.includes('?') ? '&' : '?'}keepalives=1&keepalives_idle=10&keepalives_interval=5&keepalives_count=10`;
const { PrismaClient } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const MANIFEST_PATH = path.join(REPO, 'backend/reports/zero_pack_status_sync/proposed_zero_pack_status_manifest.json');
const BACKUP_PATH = path.join(REPO, 'care_dose_pre_zero_pack_status_backup.dump');
const EXEC_DIR = path.join(REPO, 'backend/reports/zero_pack_status_sync');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const confirmed = args.includes('--confirm-zero-pack-status');

(async () => {
  if (execute && !confirmed) {
    throw new Error('Refusing PostgreSQL writes without both --execute and --confirm-zero-pack-status.');
  }
  if (execute && (!fs.existsSync(BACKUP_PATH) || fs.statSync(BACKUP_PATH).size < 4000000)) {
    throw new Error(`Missing or invalid pre-zero-pack-status backup dump at ${BACKUP_PATH}`);
  }

  const man = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const updates = man.brandStatusUpdates;
  const alreadyUnavailable = man.alreadyUnavailableZeroPackBrands;

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const pre = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const [generics, brands, packs, zeroPackBrands] = await Promise.all([
          tx.medicineGeneric.count(),
          tx.medicineBrand.count(),
          tx.medicinePack.count(),
          tx.medicineBrand.findMany({
            where: { packs: { none: {} } },
            select: {
              id: true,
              sourceId: true,
              name: true,
              strength: true,
              priceFieldStatus: true,
              _count: { select: { packs: true } },
            },
          }),
        ]);
        return { counts: { generics, brands, packs }, zeroPackBrands };
      },
      { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 120000 },
    );

    const zeroMap = new Map(pre.zeroPackBrands.map((b) => [b.id, b]));
    const mismatches = [];

    if (pre.zeroPackBrands.length !== updates.length + alreadyUnavailable.length) {
      mismatches.push({
        issue: 'ZERO_PACK_COUNT_MISMATCH',
        expected: updates.length + alreadyUnavailable.length,
        actual: pre.zeroPackBrands.length,
      });
    }

    for (const u of updates) {
      const b = zeroMap.get(u.brandId);
      if (!b || b.priceFieldStatus !== u.currentValues.priceFieldStatus || b._count.packs !== 0) {
        mismatches.push({ kind: 'UPDATE', brandId: u.brandId, brandName: u.brandName, actual: b || null });
      }
    }

    for (const a of alreadyUnavailable) {
      const b = zeroMap.get(a.brandId);
      if (!b || b.priceFieldStatus !== 'UNAVAILABLE' || b._count.packs !== 0) {
        mismatches.push({ kind: 'ALREADY_UNAVAILABLE', brandId: a.brandId, brandName: a.brandName, actual: b || null });
      }
    }

    if (mismatches.length > 0) {
      throw new Error(`Precondition check failed with ${mismatches.length} mismatches: ${JSON.stringify(mismatches.slice(0, 5))}`);
    }

    if (!execute) {
      console.log(
        JSON.stringify(
          {
            mode: 'DRY_RUN',
            databaseModified: false,
            baselineCounts: pre.counts,
            zeroPackBrandsFound: pre.zeroPackBrands.length,
            preconditionMismatches: 0,
            plannedUpdates: updates.length,
            alreadyUnavailableCount: alreadyUnavailable.length,
            note: 'Dry-run passed cleanly. Re-run with --execute --confirm-zero-pack-status after verified pg_dump backup.',
          },
          null,
          2,
        ),
      );
      return;
    }

    const updated = await prisma.$transaction(
      async (tx) => {
        const res = [];
        for (const u of updates) {
          await tx.medicineBrand.update({
            where: { id: u.brandId },
            data: { priceFieldStatus: u.proposedValues.priceFieldStatus },
          });
          res.push(u);
        }
        return res;
      },
      { maxWait: 30000, timeout: 120000 },
    );

    fs.mkdirSync(EXEC_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(EXEC_DIR, 'zero_pack_status_execution_report.json'),
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          backupPath: BACKUP_PATH,
          updatedCount: updated.length,
          alreadyUnavailableCount: alreadyUnavailable.length,
          updates: updated,
        },
        null,
        2,
      ),
    );

    const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvRows = [
      ['brandId', 'sourceId', 'brandName', 'strength', 'manufacturer', 'exclusionCategory', 'before_priceFieldStatus', 'after_priceFieldStatus'].join(','),
      ...updated.map((u) =>
        [
          u.brandId,
          u.sourceId,
          u.brandName,
          u.strength ?? '',
          u.manufacturer,
          u.exclusionCategory,
          u.currentValues.priceFieldStatus,
          u.proposedValues.priceFieldStatus,
        ]
          .map(csvEscape)
          .join(','),
      ),
    ];
    fs.writeFileSync(path.join(EXEC_DIR, 'zero_pack_status_before_after.csv'), csvRows.join('\n'));

    console.log(
      JSON.stringify(
        {
          mode: 'EXECUTED',
          databaseModified: true,
          updatedCount: updated.length,
          alreadyUnavailableCount: alreadyUnavailable.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
})();
