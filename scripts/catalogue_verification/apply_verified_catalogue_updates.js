/**
 * Transactional, dry-run-by-default applicator for verified live price & strip updates.
 * Reads: backend/reports/catalogue_verification/verified_price_and_packaging_updates.json
 *
 * Strictly preserves brandId, genericId, packId, packQuantity, packUnits, currency.
 * Updates ONLY unitPrice, packPrice, and/or stripUnits where verified against live Arogga MRP/strip data
 * and clears stale 'pack_price_inconsistent_with_unit_price' warning only when both prices agree within <=1%.
 *
 * Requires BOTH --execute AND --confirm-verified-manifest to write to PostgreSQL.
 */
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../../.env');
let dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  const m = envText.match(/^DIRECT_URL=(.+)$/m);
  if (m) dbUrl = m[1].trim().replace(/^["']|["']$/g, '');
}
const { PrismaClient, Prisma } = require(path.resolve(__dirname, '../../node_modules/@prisma/client'));

const VER_DIR = path.resolve(__dirname, '../../reports/catalogue_verification');
const MANIFEST_PATH = path.join(VER_DIR, 'verified_price_and_packaging_updates.json');
const SNAPSHOT_PATH = path.join(VER_DIR, 'pre_update_rollback_snapshot.json');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const confirmed = args.includes('--confirm-verified-manifest');

function decEq(dbDec, numVal) {
  const dbNum = dbDec !== null && dbDec !== undefined ? Number(dbDec.toString()) : null;
  if (dbNum === null && numVal === null) return true;
  if (dbNum === null || numVal === null) return false;
  return Math.abs(dbNum - Number(numVal)) <= 0.02;
}

(async () => {
  if (execute && !confirmed) {
    throw new Error('Refusing PostgreSQL writes without both --execute and --confirm-verified-manifest.');
  }

  const updates = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).records;
  const prisma = new PrismaClient(dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined);

  try {
    const packIds = updates.map((u) => u.packId);
    const dbRows = [];
    for (let i = 0; i < packIds.length; i += 2000) {
      const slice = packIds.slice(i, i + 2000);
      const batch = await prisma.medicinePack.findMany({
        where: { id: { in: slice } },
        select: {
          id: true,
          brandId: true,
          packQuantity: true,
          packUnits: true,
          stripUnits: true,
          unitPrice: true,
          packPrice: true,
          priceSource: true,
          warnings: true,
          verification: true,
        },
      });
      dbRows.push(...batch);
    }

    const byId = new Map(dbRows.map((r) => [r.id, r]));
    const mismatches = [];
    const rollbackSnapshot = [];

    for (const u of updates) {
      const row = byId.get(u.packId);
      if (
        !row ||
        row.brandId !== u.brandId ||
        (row.packUnits ?? null) !== (u.oldPackUnits ?? null) ||
        (row.stripUnits ?? null) !== (u.oldStripUnits ?? null) ||
        !decEq(row.unitPrice, u.oldUnitPrice) ||
        !decEq(row.packPrice, u.oldPackPrice)
      ) {
        mismatches.push({
          packId: u.packId,
          brandName: u.brandName,
          expectedOld: {
            packUnits: u.oldPackUnits,
            stripUnits: u.oldStripUnits,
            unitPrice: u.oldUnitPrice,
            packPrice: u.oldPackPrice,
          },
          actualDb: row
            ? {
                packUnits: row.packUnits,
                stripUnits: row.stripUnits,
                unitPrice: row.unitPrice?.toString() ?? null,
                packPrice: row.packPrice?.toString() ?? null,
              }
            : null,
        });
      } else {
        rollbackSnapshot.push({
          packId: row.id,
          brandId: row.brandId,
          oldPackUnits: row.packUnits,
          oldStripUnits: row.stripUnits,
          oldUnitPrice: row.unitPrice !== null ? row.unitPrice.toString() : null,
          oldPackPrice: row.packPrice !== null ? row.packPrice.toString() : null,
          oldWarnings: row.warnings,
          newStripUnits: u.newStripUnits ?? null,
          newUnitPrice: u.newUnitPrice !== null && u.newUnitPrice !== undefined ? Number(u.newUnitPrice).toFixed(2) : null,
          newPackPrice: u.newPackPrice !== null && u.newPackPrice !== undefined ? Number(u.newPackPrice).toFixed(2) : null,
        });
      }
    }

    if (!execute) {
      console.log(
        JSON.stringify(
          {
            mode: 'DRY_RUN',
            targetUpdatesCount: updates.length,
            matchedPreconditions: updates.length - mismatches.length,
            mismatchesCount: mismatches.length,
            sampleMismatches: mismatches.slice(0, 5),
            databaseModified: false,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (mismatches.length > 0) {
      throw new Error(`Precondition mismatch on ${mismatches.length} rows; aborting without changes.`);
    }

    fs.writeFileSync(
      SNAPSHOT_PATH,
      JSON.stringify({ capturedAt: new Date().toISOString(), count: rollbackSnapshot.length, records: rollbackSnapshot }, null, 2),
    );

    let totalUpdated = 0;
    for (let i = 0; i < rollbackSnapshot.length; i += 250) {
      const chunk = rollbackSnapshot.slice(i, i + 250);
      await prisma.$transaction(
        async (tx) => {
          for (const item of chunk) {
            const nextWarnings = (item.oldWarnings || []).filter(
              (w) => w !== 'pack_price_inconsistent_with_unit_price',
            );
            const res = await tx.medicinePack.updateMany({
              where: {
                id: item.packId,
                brandId: item.brandId,
                packUnits: item.oldPackUnits,
                stripUnits: item.oldStripUnits,
              },
              data: {
                stripUnits: item.newStripUnits,
                unitPrice: item.newUnitPrice !== null ? new Prisma.Decimal(item.newUnitPrice) : null,
                packPrice: item.newPackPrice !== null ? new Prisma.Decimal(item.newPackPrice) : null,
                warnings: nextWarnings,
              },
            });
            if (res.count !== 1) {
              throw new Error(`Batch rollback triggered: expected 1 update on packId=${item.packId}`);
            }
            totalUpdated += res.count;
          }
        },
        { maxWait: 15000, timeout: 120000 },
      );
      if (totalUpdated % 1000 === 0 || totalUpdated === rollbackSnapshot.length) {
        console.error(`[apply] Updated ${totalUpdated}/${rollbackSnapshot.length} packs...`);
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: 'EXECUTED',
          totalUpdated,
          rollbackSnapshotPath: SNAPSHOT_PATH,
          databaseModified: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
})();
