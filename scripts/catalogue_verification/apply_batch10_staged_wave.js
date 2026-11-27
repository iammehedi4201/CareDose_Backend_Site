/**
 * Controlled applicator for Batch 10 Staged Wave (STRICTLY DRY-RUN BY DEFAULT).
 * Usage:
 *   node apply_batch10_staged_wave.js                                              # dry-run precondition check (0 writes)
 *   node apply_batch10_staged_wave.js --execute --confirm-batch10                  # executes 128 pack updates + 3 zero-pack inserts (holds 2 obsolete 2nd packs)
 *   node apply_batch10_staged_wave.js --execute --confirm-batch10 --delete-obsolete-2packs  # also deletes obsolete Detonix 50's & Ecosprin 100's (0 txn refs)
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const rawDbUrl = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8').match(/^DIRECT_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const dbUrl = rawDbUrl.includes('keepalives=')
  ? rawDbUrl
  : `${rawDbUrl}${rawDbUrl.includes('?') ? '&' : '?'}keepalives=1&keepalives_idle=10&keepalives_interval=5&keepalives_count=10`;
const { PrismaClient, Prisma } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const MANIFEST_PATH = path.join(REPO, 'backend/reports/batch10_staging/proposed_batch10_wave_manifest.json');
const BACKUP_PATH = path.join(REPO, 'care_dose_pre_batch10_backup.dump');
const EXEC_DIR = path.join(REPO, 'backend/reports/batch10_remediation_execution');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const confirmed = args.includes('--confirm-batch10');
const deleteObsolete2Packs = args.includes('--delete-obsolete-2packs');

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
    throw new Error('Refusing PostgreSQL writes without both --execute and --confirm-batch10.');
  }
  if (execute && (!fs.existsSync(BACKUP_PATH) || fs.statSync(BACKUP_PATH).size < 100000)) {
    throw new Error(`Missing or invalid pre-Batch-10 backup dump at ${BACKUP_PATH}`);
  }

  const man = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const updates = man.batch10Updates;
  const zeroInserts = man.batch10ZeroPackInserts;
  const optDeletes = deleteObsolete2Packs ? man.optionalObsolete2PackDeletes : [];

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const pre = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [generics, brands, packs, dbPacks, dbDelPacks, dbZeroBrands] = await Promise.all([
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
        tx.medicineBrand.findMany({
          where: { id: { in: zeroInserts.map((z) => z.brandId) } },
          include: { packs: { select: { id: true } } },
        }),
      ]);
      return { counts: { generics, brands, packs }, dbPacks, dbDelPacks, dbZeroBrands };
    }, { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 120000 });

    const pMap = new Map(pre.dbPacks.map((p) => [p.id, p]));
    const dMap = new Map(pre.dbDelPacks.map((p) => [p.id, p]));
    const zMap = new Map(pre.dbZeroBrands.map((b) => [b.id, b]));
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

    for (const z of zeroInserts) {
      const b = zMap.get(z.brandId);
      const ok =
        b &&
        b.packs.length === 0 &&
        b.priceFieldStatus === z.currentPriceFieldStatus;
      if (!ok) mismatches.push({ kind: 'ZERO_INSERT', brandId: z.brandId, brandName: z.brandName, actual: b });
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
        plannedZeroPackInserts: zeroInserts.length,
        deleteObsolete2PacksFlag: deleteObsolete2Packs,
        plannedOptionalDeletes: optDeletes.length,
        optionalObsolete2PacksAvailableIfFlagPassed: man.optionalObsolete2PackDeletes.length,
        note: 'Dry-run passed cleanly. Re-run with --execute --confirm-batch10 (and optional --delete-obsolete-2packs) after backup & approval.',
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

      const inserted = [];
      for (const z of zeroInserts) {
        const created = await tx.medicinePack.create({
          data: {
            brandId: z.brandId,
            packQuantity: z.proposedInsert.packQuantity,
            packUnits: z.proposedInsert.packUnits,
            stripUnits: z.proposedInsert.stripUnits,
            unitPrice: new Prisma.Decimal(String(z.proposedInsert.unitPrice)),
            packPrice: new Prisma.Decimal(String(z.proposedInsert.packPrice)),
            currency: 'BDT',
            unitPriceLabel: z.proposedInsert.unitPriceLabel,
            priceSource: 'brand_page',
            sourceUrl: z.sourceUrl,
            verification: 'UNVERIFIED',
            warnings: [],
          },
          select: { id: true, brandId: true, packQuantity: true, unitPrice: true, packPrice: true },
        });
        await tx.medicineBrand.update({
          where: { id: z.brandId },
          data: { priceFieldStatus: z.proposedPriceFieldStatus },
        });
        inserted.push({ ...created, brandName: z.brandName, strength: z.strength });
      }

      const deleted = [];
      for (const d of optDeletes) {
        await tx.medicinePack.delete({ where: { id: d.packId } });
        deleted.push({ packId: d.packId, brandId: d.brandId, brandName: d.brandName, strength: d.strength, currentValues: d.currentValues });
      }

      return { updatedCount, insertedCount: inserted.length, deletedCount: deleted.length, inserted, deleted };
    }, { maxWait: 30000, timeout: 300000 });

    fs.mkdirSync(EXEC_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(EXEC_DIR, 'batch10_execution_report.json'),
      JSON.stringify({
        executedAt: new Date().toISOString(),
        backupPath: BACKUP_PATH,
        deleteObsolete2Packs,
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
      ...zeroInserts.map((z, idx) => [
        'ZERO_PACK_INSERT', 'INSERT', z.brandName, z.strength ?? '', result.inserted[idx]?.id ?? '',
        '', '', '', '', '',
        z.proposedInsert.packQuantity, z.proposedInsert.packUnits, z.proposedInsert.stripUnits, z.proposedInsert.unitPrice, z.proposedInsert.packPrice,
      ].map(csvEscape).join(',')),
      ...result.deleted.map((d) => [
        'OBSOLETE_2PACK_DELETE', 'DELETE', d.brandName, d.strength ?? '', d.packId,
        d.currentValues.packQuantity, d.currentValues.packUnits, d.currentValues.stripUnits, d.currentValues.unitPrice, d.currentValues.packPrice,
        '', '', '', '', '',
      ].map(csvEscape).join(',')),
    ];
    fs.writeFileSync(path.join(EXEC_DIR, 'batch10_before_after_comparison.csv'), csvRows.join('\n'));
    console.log(JSON.stringify({
      mode: 'EXECUTED',
      databaseModified: true,
      updatedCount: result.updatedCount,
      insertedCount: result.insertedCount,
      deletedCount: result.deletedCount,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
