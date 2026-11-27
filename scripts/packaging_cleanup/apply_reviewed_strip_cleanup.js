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
const confirmed = args.includes('--confirm-reviewed-manifest');
const scopeArg = (args.find((a) => a.startsWith('--scope=')) || '--scope=high40').split('=')[1];

(async () => {
  if (scopeArg !== 'high40' && scopeArg !== 'high40+medium314') {
    throw new Error(`Invalid --scope="${scopeArg}". Allowed: high40, high40+medium314.`);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const targets =
    scopeArg === 'high40+medium314'
      ? [...manifest.highConfidence40, ...manifest.mediumConfidence314]
      : [...manifest.highConfidence40];

  if (scopeArg === 'high40' && targets.length !== 40) {
    throw new Error(`Expected exactly 40 targets for --scope=high40, got ${targets.length}`);
  }

  if (execute && !confirmed) {
    throw new Error('Refusing to mutate PostgreSQL without both --execute and --confirm-reviewed-manifest.');
  }

  const prisma = new PrismaClient(dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined);
  try {
    const currentRows = await prisma.medicinePack.findMany({
      where: { id: { in: targets.map((t) => t.packId) } },
      select: { id: true, brandId: true, packUnits: true, stripUnits: true },
    });
    const byId = new Map(currentRows.map((row) => [row.id, row]));

    const mismatches = [];
    for (const t of targets) {
      const row = byId.get(t.packId);
      if (!row || row.brandId !== t.brandId || row.packUnits !== t.oldValue.packUnits || row.stripUnits !== t.oldValue.stripUnits) {
        mismatches.push({ packId: t.packId, expected: t.oldValue, actual: row ?? null });
      }
    }

    if (!execute) {
      console.log(JSON.stringify({
        mode: 'DRY_RUN',
        scope: scopeArg,
        targetCount: targets.length,
        matchedCount: targets.length - mismatches.length,
        mismatches,
        databaseModified: false,
      }, null, 2));
      return;
    }

    if (mismatches.length > 0) {
      throw new Error(`Pre-flight state check failed for ${mismatches.length} rows; aborting without changes.`);
    }

    const updatedCount = await prisma.$transaction(
      async (tx) => {
        let count = 0;
        for (const t of targets) {
          const res = await tx.medicinePack.updateMany({
            where: {
              id: t.packId,
              brandId: t.brandId,
              packUnits: t.oldValue.packUnits,
              stripUnits: t.oldValue.stripUnits,
            },
            data: { stripUnits: null },
          });
          if (res.count !== 1) {
            throw new Error(`Expected 1 row updated for packId=${t.packId}, got ${res.count}; rolling back.`);
          }
          count += res.count;
        }
        if (count !== targets.length) {
          throw new Error(`Expected ${targets.length} total updates, got ${count}; rolling back.`);
        }
        return count;
      },
      { maxWait: 15000, timeout: 60000 },
    );

    console.log(JSON.stringify({
      mode: 'EXECUTED',
      scope: scopeArg,
      updatedCount,
      databaseModified: true,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
