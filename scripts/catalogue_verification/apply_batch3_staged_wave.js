/**
 * Controlled dual-transaction applicator (DRY-RUN BY DEFAULT) for Batch 3 Staged Wave:
 *   Tx1 (55 updates across 3A-3E): Price / strip / commercial-pack updates verified against live MedEx HTTP 200.
 *   Tx2 (11 warning cleanups when --clear-warnings-11 is passed): Removes ONLY 'pack_price_inconsistent_with_unit_price'
 *       on the 11 3D/3E records whose post-Tx1 Decimal arithmetic or container-only unitPrice=null is verified valid.
 *
 * Requires --execute --confirm-batch3 (plus verified care_dose_pre_batch3_backup.dump).
 */
const fs = require('fs');
const path = require('path');

const REPO = 'F:/My Projects/CareDose';
const envText = fs.readFileSync(path.join(REPO, 'backend/.env'), 'utf8');
const dbUrl = envText.match(/^DIRECT_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const { PrismaClient, Prisma } = require(path.join(REPO, 'backend/node_modules/@prisma/client'));

const MANIFEST_PATH = path.join(REPO, 'backend/reports/batch3_staging/proposed_batch3_wave_manifest.json');
const BACKUP_PATH = path.join(REPO, 'care_dose_pre_batch3_backup.dump');
const EXEC_DIR = path.join(REPO, 'backend/reports/batch3_remediation_execution');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const confirmed = args.includes('--confirm-batch3');
const clearWarnings11 = args.includes('--clear-warnings-11');

const ALLOWED_KEYS = new Set(['packQuantity', 'packUnits', 'stripUnits', 'unitPrice', 'packPrice']);

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

function csvEsc(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

(async () => {
  if (execute && !confirmed) {
    throw new Error('Refusing Batch 3 writes without both --execute and --confirm-batch3.');
  }

  const man = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const groups = {
    '3A': man.subbatch3A_adjacentVerifiedPrices,
    '3B': man.subbatch3B_tier5SameBoxFixes,
    '3C': man.subbatch3C_tier5CommercialBoxMigrations,
    '3D': man.subbatch3D_rem187SameBoxPriceFixes,
    '3E': man.subbatch3E_rem187PackAndPriceMigrations,
  };

  const allItems = Object.entries(groups).flatMap(([g, arr]) => arr.map((x) => ({ group: g, ...x })));
  if (allItems.length !== 55) throw new Error(`Expected 55 Batch 3 records, found ${allItems.length}`);
  const uniqueIds = new Set(allItems.map((x) => x.packId));
  if (uniqueIds.size !== 55) throw new Error('Duplicate packId in Batch 3!');

  for (const item of allItems) {
    const ks = Object.keys(item.proposedValues || {});
    if (!ks.length || !ks.every((k) => ALLOWED_KEYS.has(k))) {
      throw new Error(`Invalid proposedValues keys on ${item.packId}: ${JSON.stringify(ks)}`);
    }
  }

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const pre = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const [generics, brands, packs] = await Promise.all([
          tx.medicineGeneric.count(),
          tx.medicineBrand.count(),
          tx.medicinePack.count(),
        ]);
        const rows = await tx.medicinePack.findMany({
          where: { id: { in: [...uniqueIds] } },
          select: {
            id: true, brandId: true, packQuantity: true, packUnits: true, stripUnits: true,
            unitPrice: true, packPrice: true, currency: true, verification: true, warnings: true,
          },
        });
        return { counts: { generics, brands, packs }, rows };
      },
      { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 60000 },
    );

    const byId = new Map(pre.rows.map((r) => [r.id, r]));
    const mismatches = [];
    const warningsToClear = [];

    for (const item of allItems) {
      const r = byId.get(item.packId);
      const curPQ = item.currentValues.packQuantity !== undefined ? item.currentValues.packQuantity : item.packQuantity;
      const curPU = item.currentValues.packUnits !== undefined ? item.currentValues.packUnits : item.packUnits;
      const curSU = item.currentValues.stripUnits !== undefined ? item.currentValues.stripUnits : item.stripUnits;
      const ok =
        r &&
        r.brandId === item.brandId &&
        (r.packQuantity ?? null) === (curPQ ?? null) &&
        (r.packUnits ?? null) === (curPU ?? null) &&
        (r.stripUnits ?? null) === (curSU ?? null) &&
        r.currency === 'BDT' &&
        r.verification === 'UNVERIFIED' &&
        decEqRaw(r.unitPrice, item.currentValues.unitPrice) &&
        decEqRaw(r.packPrice, item.currentValues.packPrice) &&
        arrEq(r.warnings, item.currentValues.warnings);
      if (!ok) {
        mismatches.push({ group: item.group, packId: item.packId, brandName: item.brandName, expected: item.currentValues, actual: r });
      } else if (arrEq(r.warnings, ['pack_price_inconsistent_with_unit_price'])) {
        const pv = item.proposedValues;
        const postPU = Object.prototype.hasOwnProperty.call(pv, 'packUnits') ? pv.packUnits : r.packUnits;
        const postU = Object.prototype.hasOwnProperty.call(pv, 'unitPrice') ? pv.unitPrice : (r.unitPrice?.toString() ?? null);
        const postP = Object.prototype.hasOwnProperty.call(pv, 'packPrice') ? pv.packPrice : (r.packPrice?.toString() ?? null);
        const arithValidOrContainerOnly =
          postU === null ||
          (postPU && postP !== null && new Prisma.Decimal(String(postU)).mul(new Prisma.Decimal(postPU)).eq(new Prisma.Decimal(String(postP))));
        if (!arithValidOrContainerOnly) {
          mismatches.push({ group: 'WARN_POST_CHECK', packId: r.id, brandName: item.brandName, postU, postPU, postP });
        } else {
          warningsToClear.push({
            packId: r.id,
            brandId: r.brandId,
            brandName: item.brandName,
            strength: item.strength,
            group: item.group,
            postUnitPrice: postU,
            postPackUnits: postPU,
            postPackPrice: postP,
            verificationMode: postU === null ? 'CONTAINER_OR_PACK_ONLY_UNIT_PRICE_NULL' : `EXACT_DECIMAL_${postU}*${postPU}=${postP}`,
          });
        }
      } else if ((r.warnings || []).length > 0) {
        mismatches.push({ group: 'UNEXPECTED_WARNING', packId: r.id, warnings: r.warnings });
      }
    }

    if (mismatches.length > 0) {
      console.error(JSON.stringify({ status: 'PRECONDITION_ABORTED', mismatches }, null, 2));
      process.exit(1);
    }

    const drySummary = {
      mode: 'DRY_RUN_PRECONDITIONS_ONLY',
      databaseModified: false,
      databaseCounts: pre.counts,
      clearWarnings11Flag: clearWarnings11,
      subbatchCounts: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])),
      totalMatchedPreconditions: allItems.length,
      warningsQualifiedForCleanupCount: warningsToClear.length,
      warningsQualifiedDetails: warningsToClear,
      totalMismatches: 0,
    };

    if (!execute) {
      console.log(JSON.stringify(drySummary, null, 2));
      return;
    }

    if (!fs.existsSync(BACKUP_PATH)) throw new Error(`Required PostgreSQL backup missing: ${BACKUP_PATH}`);
    if (clearWarnings11 && warningsToClear.length !== 11) {
      throw new Error(`Expected 11 warnings to clear, found ${warningsToClear.length}`);
    }
    fs.mkdirSync(EXEC_DIR, { recursive: true });

    const rollbackDoc = {
      generatedAt: new Date().toISOString(),
      backupPath: BACKUP_PATH,
      clearWarnings11,
      packUpdates55: allItems.map((item) => {
        const curPQ = item.currentValues.packQuantity !== undefined ? item.currentValues.packQuantity : item.packQuantity;
        const curPU = item.currentValues.packUnits !== undefined ? item.currentValues.packUnits : item.packUnits;
        const curSU = item.currentValues.stripUnits !== undefined ? item.currentValues.stripUnits : item.stripUnits;
        return {
          group: item.group,
          packId: item.packId,
          brandId: item.brandId,
          brandName: item.brandName,
          restore: {
            packQuantity: curPQ ?? null,
            packUnits: curPU ?? null,
            stripUnits: curSU ?? null,
            unitPrice: item.currentValues.unitPrice,
            packPrice: item.currentValues.packPrice,
          },
          applied: item.proposedValues,
        };
      }),
      warningCleanups11: clearWarnings11
        ? warningsToClear.map((w) => ({ packId: w.packId, brandName: w.brandName, restoreWarnings: ['pack_price_inconsistent_with_unit_price'], appliedWarnings: [] }))
        : [],
    };
    fs.writeFileSync(path.join(EXEC_DIR, 'batch3_pre_execution_snapshot_and_rollback.json'), JSON.stringify(rollbackDoc, null, 2));

    // Tx1: 55 field updates (excluding warnings)
    const tx1Count = await prisma.$transaction(
      async (tx) => {
        let count = 0;
        for (const item of allItems) {
          const r = byId.get(item.packId);
          const data = {};
          const pv = item.proposedValues;
          if (Object.prototype.hasOwnProperty.call(pv, 'packQuantity')) data.packQuantity = pv.packQuantity;
          if (Object.prototype.hasOwnProperty.call(pv, 'packUnits')) data.packUnits = pv.packUnits;
          if (Object.prototype.hasOwnProperty.call(pv, 'stripUnits')) data.stripUnits = pv.stripUnits;
          if (Object.prototype.hasOwnProperty.call(pv, 'unitPrice')) data.unitPrice = pv.unitPrice !== null ? new Prisma.Decimal(pv.unitPrice) : null;
          if (Object.prototype.hasOwnProperty.call(pv, 'packPrice')) data.packPrice = pv.packPrice !== null ? new Prisma.Decimal(pv.packPrice) : null;

          const res = await tx.medicinePack.updateMany({
            where: {
              id: r.id,
              brandId: r.brandId,
              packQuantity: r.packQuantity,
              packUnits: r.packUnits,
              stripUnits: r.stripUnits,
              currency: r.currency,
              verification: r.verification,
              warnings: { equals: r.warnings },
              unitPrice: r.unitPrice !== null ? new Prisma.Decimal(r.unitPrice.toString()) : null,
              packPrice: r.packPrice !== null ? new Prisma.Decimal(r.packPrice.toString()) : null,
            },
            data,
          });
          if (res.count !== 1) throw new Error(`Tx1 abort on packId=${r.id} (${item.brandName})`);
          count += res.count;
        }
        if (count !== 55) throw new Error(`Tx1 abort: expected 55 updates, got ${count}`);
        return count;
      },
      { isolationLevel: 'Serializable', maxWait: 20000, timeout: 180000 },
    );

    // Tx2 (separate transaction): Clear the 11 stale arithmetic warnings
    let tx2Count = 0;
    if (clearWarnings11) {
      tx2Count = await prisma.$transaction(
        async (tx) => {
          let count = 0;
          for (const w of warningsToClear) {
            const whereClause = {
              id: w.packId,
              brandId: w.brandId,
              packUnits: w.postPackUnits,
              unitPrice: w.postUnitPrice !== null ? new Prisma.Decimal(String(w.postUnitPrice)) : null,
              packPrice: w.postPackPrice !== null ? new Prisma.Decimal(String(w.postPackPrice)) : null,
              warnings: { equals: ['pack_price_inconsistent_with_unit_price'] },
            };
            const res = await tx.medicinePack.updateMany({
              where: whereClause,
              data: { warnings: { set: [] } },
            });
            if (res.count !== 1) throw new Error(`Tx2 abort on warning cleanup packId=${w.packId} (${w.brandName})`);
            count += res.count;
          }
          if (count !== 11) throw new Error(`Tx2 abort: expected 11 warning cleanups, got ${count}`);
          return count;
        },
        { isolationLevel: 'Serializable', maxWait: 20000, timeout: 120000 },
      );
    }

    fs.writeFileSync(path.join(EXEC_DIR, 'batch3_rollback_manifest.json'), JSON.stringify(rollbackDoc, null, 2));
    fs.writeFileSync(
      path.join(EXEC_DIR, 'batch3_execution_report.json'),
      JSON.stringify({
        status: 'EXECUTED',
        executedAt: new Date().toISOString(),
        backupPath: BACKUP_PATH,
        tx1_packUpdates: tx1Count,
        tx2_warningCleanups: tx2Count,
        subbatchCounts: drySummary.subbatchCounts,
        updates: allItems,
        warningCleanups: clearWarnings11 ? warningsToClear : [],
      }, null, 2),
    );

    const csvLines = [
      'subBatch,packId,brandId,brandName,strength,beforePackQty,afterPackQty,beforePackUnits,afterPackUnits,beforeStripUnits,afterStripUnits,beforeUnitPrice,afterUnitPrice,beforePackPrice,afterPackPrice,warningCleared',
      ...allItems.map((x) => {
        const curPQ = x.currentValues.packQuantity !== undefined ? x.currentValues.packQuantity : x.packQuantity;
        const curPU = x.currentValues.packUnits !== undefined ? x.currentValues.packUnits : x.packUnits;
        const curSU = x.currentValues.stripUnits !== undefined ? x.currentValues.stripUnits : x.stripUnits;
        const pv = x.proposedValues;
        const aPQ = Object.prototype.hasOwnProperty.call(pv, 'packQuantity') ? pv.packQuantity : curPQ;
        const aPU = Object.prototype.hasOwnProperty.call(pv, 'packUnits') ? pv.packUnits : curPU;
        const aSU = Object.prototype.hasOwnProperty.call(pv, 'stripUnits') ? pv.stripUnits : curSU;
        const aU = Object.prototype.hasOwnProperty.call(pv, 'unitPrice') ? pv.unitPrice : x.currentValues.unitPrice;
        const aP = Object.prototype.hasOwnProperty.call(pv, 'packPrice') ? pv.packPrice : x.currentValues.packPrice;
        const wCleared = clearWarnings11 && warningsToClear.some((w) => w.packId === x.packId);
        return [x.group, x.packId, x.brandId, x.brandName, x.strength ?? '', curPQ ?? '', aPQ ?? '', curPU ?? '', aPU ?? '', curSU ?? '', aSU ?? '', x.currentValues.unitPrice ?? '', aU ?? '', x.currentValues.packPrice ?? '', aP ?? '', wCleared].map(csvEsc).join(',');
      }),
    ];
    fs.writeFileSync(path.join(EXEC_DIR, 'batch3_before_after_comparison.csv'), csvLines.join('\n') + '\n');

    console.log(JSON.stringify({ status: 'BATCH3_EXECUTED', tx1_packUpdates: tx1Count, tx2_warningCleanups: tx2Count }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
