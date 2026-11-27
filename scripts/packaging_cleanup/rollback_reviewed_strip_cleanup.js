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

const MANIFEST_PATH = path.resolve(__dirname, '../../reports/packaging_audit_post_fix/reviewed_strip_cleanup_manifest.json');
const args = process.argv.slice(2);
const execute = args.includes('--execute');
const scopeArg = (args.find((a) => a.startsWith('--scope=')) || '--scope=high40').split('=')[1];

(async () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const targets =
    scopeArg === 'high40+medium314'
      ? [...manifest.highConfidence40, ...manifest.mediumConfidence314]
      : [...manifest.highConfidence40];

  const prisma = new PrismaClient(dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined);
  try {
    if (!execute) {
      const currentRows = await prisma.medicinePack.findMany({
        where: { id: { in: targets.map((t) => t.packId) } },
        select: { id: true, stripUnits: true },
      });
      console.log(JSON.stringify({
        mode: 'ROLLBACK_DRY_RUN',
        scope: scopeArg,
        targetCount: targets.length,
        currentlyNullCount: currentRows.filter((r) => r.stripUnits === null).length,
        databaseModified: false,
      }, null, 2));
      return;
    }

    const restoredCount = await prisma.$transaction(
      async (tx) => {
        let count = 0;
        for (const t of targets) {
          const res = await tx.medicinePack.updateMany({
            where: {
              id: t.packId,
              brandId: t.brandId,
              packUnits: t.oldValue.packUnits,
              stripUnits: null,
            },
            data: { stripUnits: t.oldValue.stripUnits },
          });
          if (res.count !== 1) {
            throw new Error(`Expected 1 row restored for packId=${t.packId}, got ${res.count}; rolling back.`);
          }
          count += res.count;
        }
        return count;
      },
      { maxWait: 15000, timeout: 60000 },
    );

    console.log(JSON.stringify({
      mode: 'ROLLED_BACK',
      scope: scopeArg,
      restoredCount,
      databaseModified: true,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
