/**
 * Restores pre-update MedicinePack values from pre_update_rollback_snapshot.json in fast transactional chunks.
 * Dry-run by default; requires --execute to mutate PostgreSQL.
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
const { PrismaClient } = require(path.resolve(__dirname, '../../node_modules/@prisma/client'));

const SNAPSHOT_PATH = path.resolve(__dirname, '../../reports/catalogue_verification/pre_update_rollback_snapshot.json');
const execute = process.argv.includes('--execute');

(async () => {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error(`Rollback snapshot not found at ${SNAPSHOT_PATH}`);
  }
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')).records;
  if (!execute) {
    console.log(JSON.stringify({ mode: 'ROLLBACK_DRY_RUN', snapshotCount: snapshot.length, databaseModified: false }, null, 2));
    return;
  }

  const prisma = new PrismaClient(dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined);
  try {
    let restored = 0;
    for (let i = 0; i < snapshot.length; i += 500) {
      const chunk = snapshot.slice(i, i + 500).map((s) => ({
        id: s.packId,
        brand_id: s.brandId,
        old_su: s.oldStripUnits,
        old_up: s.oldUnitPrice,
        old_pp: s.oldPackPrice,
        old_warn: s.oldWarnings ?? [],
      }));
      const payload = JSON.stringify(chunk);
      const affected = await prisma.$transaction(
        async (tx) => tx.$executeRaw`
          UPDATE "MedicinePack" AS p
          SET
            "stripUnits" = v."old_su",
            "unitPrice" = v."old_up"::numeric(12,2),
            "packPrice" = v."old_pp"::numeric(12,2),
            "warnings" = ARRAY(SELECT jsonb_array_elements_text(v."old_warn"))
          FROM jsonb_to_recordset(${payload}::jsonb) AS v(
            "id" text,
            "brand_id" text,
            "old_su" int,
            "old_up" text,
            "old_pp" text,
            "old_warn" jsonb
          )
          WHERE p."id" = v."id" AND p."brandId" = v."brand_id"
        `,
        { maxWait: 15000, timeout: 60000 },
      );
      restored += Number(affected);
    }
    console.log(JSON.stringify({ mode: 'ROLLED_BACK', restored, databaseModified: true }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
