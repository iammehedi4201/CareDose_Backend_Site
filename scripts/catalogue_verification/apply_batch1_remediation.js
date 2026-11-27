/**
 * Controlled, dual-transaction applicator for High-Confidence Remediation Batch 1 (85 records total):
 *   - Transaction 1 (Batch 1A-1C): 15 price corrections (batch1_priceUpdatesHighConfidence)
 *   - Transaction 2 (Batch 1D):    70 stale warning cleanups (batch1d_staleWarningCleanupHighConfidence)
 *
 * Reads:  backend/reports/consolidated_remediation/proposed_next_batch.json
 * Writes: backend/reports/batch1_remediation_execution/
 *           - batch1_price_rollback_manifest.json
 *           - batch1_warning_rollback_manifest.json
 *           - batch1_rollback_manifest.json
 *           - batch1_price_execution_report.json
 *           - batch1_warning_cleanup_report.json
 *
 * Dry-run by default (0 writes). Requires --execute --confirm-batch1-85 to mutate PostgreSQL.
 * Never executes Batch 2 or any medium-confidence updates.
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = 'F:/My Projects/CareDose';
const envPath = path.join(REPO_ROOT, 'backend/.env');
let dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  const m = envText.match(/^DIRECT_URL=(.+)$/m);
  if (m) dbUrl = m[1].trim().replace(/^["']|["']$/g, '');
}
const { PrismaClient, Prisma } = require(path.join(REPO_ROOT, 'backend/node_modules/@prisma/client'));

const MANIFEST_PATH = path.join(REPO_ROOT, 'backend/reports/consolidated_remediation/proposed_next_batch.json');
const BACKUP_PATH = path.join(REPO_ROOT, 'care_dose_pre_batch1_remediation_backup.dump');
const EXEC_DIR = path.join(REPO_ROOT, 'backend/reports/batch1_remediation_execution');
fs.mkdirSync(EXEC_DIR, { recursive: true });

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const confirmed = args.includes('--confirm-batch1-85');

function strOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

function decEqRaw(dbDec, rawVal) {
  const targetStr = strOrNull(rawVal);
  if (dbDec === null || dbDec === undefined) return targetStr === null;
  if (targetStr === null) return false;
  return new Prisma.Decimal(dbDec.toString()).eq(new Prisma.Decimal(targetStr));
}

function arrEq(a, b) {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}

(async () => {
  if (execute && !confirmed) {
    throw new Error('Refusing PostgreSQL writes without both --execute and --confirm-batch1-85.');
  }

  const nextBatchDoc = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const priceUpdates = nextBatchDoc.batch1_priceUpdatesHighConfidence || [];
  const warningCleanups = nextBatchDoc.batch1d_staleWarningCleanupHighConfidence || [];

  // Scope validation
  if (priceUpdates.length !== 15) {
    throw new Error(`Expected exactly 15 Batch 1A-1C price updates, found ${priceUpdates.length}`);
  }
  if (warningCleanups.length !== 70) {
    throw new Error(`Expected exactly 70 Batch 1D warning cleanups, found ${warningCleanups.length}`);
  }
  const priceIds = new Set(priceUpdates.map((r) => r.packId));
  const warnIds = new Set(warningCleanups.map((r) => r.packId));
  if (priceIds.size !== 15 || warnIds.size !== 70) {
    throw new Error('Duplicate packId detected inside Batch 1 manifest!');
  }
  for (const pid of priceIds) {
    if (warnIds.has(pid)) throw new Error(`Overlap detected between 15 price and 70 warning packIds: ${pid}`);
  }

  for (const p of priceUpdates) {
    if (p.confidence !== 'HIGH') throw new Error(`Non-HIGH confidence item in batch1_priceUpdatesHighConfidence: ${p.packId}`);
    const keys = Object.keys(p.proposedValues || {});
    if (!keys.length || !keys.every((k) => k === 'unitPrice' || k === 'packPrice')) {
      throw new Error(`Invalid proposedValues keys on price record ${p.packId}: ${JSON.stringify(keys)}`);
    }
  }
  for (const w of warningCleanups) {
    if (w.confidence !== 'HIGH_METADATA_HYGIENE') throw new Error(`Unexpected confidence in batch1d: ${w.packId}`);
    if (!arrEq(w.currentValues?.warnings, ['pack_price_inconsistent_with_unit_price'])) {
      throw new Error(`Unexpected manifest warning on ${w.packId}: ${JSON.stringify(w.currentValues?.warnings)}`);
    }
    if (!arrEq(w.proposedValues?.warnings, [])) {
      throw new Error(`Expected empty proposed warnings on ${w.packId}`);
    }
  }

  const prisma = new PrismaClient(dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined);
  try {
    const allIds = [...priceIds, ...warnIds];
    const dbRows = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        return tx.medicinePack.findMany({
          where: { id: { in: allIds } },
          select: {
            id: true,
            brandId: true,
            packQuantity: true,
            packUnits: true,
            stripUnits: true,
            unitPrice: true,
            packPrice: true,
            currency: true,
            priceSource: true,
            sourceUrl: true,
            verification: true,
            warnings: true,
          },
        });
      },
      { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 60000 },
    );

    const byId = new Map(dbRows.map((r) => [r.id, r]));

    const priceMismatches = [];
    const stagedPricePlan = [];
    for (const u of priceUpdates) {
      const row = byId.get(u.packId);
      const ok =
        row &&
        row.brandId === u.brandId &&
        (row.packQuantity ?? '') === (u.packQuantity ?? '') &&
        (row.packUnits ?? null) === (u.packUnits ?? null) &&
        (row.stripUnits ?? null) === (strOrNull(u.stripUnits) !== null ? Number(u.stripUnits) : null) &&
        (row.currency ?? 'BDT') === 'BDT' &&
        decEqRaw(row.unitPrice, u.currentValues?.unitPrice) &&
        decEqRaw(row.packPrice, u.currentValues?.packPrice) &&
        arrEq(row.warnings, u.currentValues?.warnings || []);

      if (!ok) {
        priceMismatches.push({ packId: u.packId, brandName: u.brandName, expected: u.currentValues, actual: row });
      } else {
        const updateData = {};
        if (Object.prototype.hasOwnProperty.call(u.proposedValues, 'unitPrice')) {
          updateData.unitPrice = new Prisma.Decimal(u.proposedValues.unitPrice);
        }
        if (Object.prototype.hasOwnProperty.call(u.proposedValues, 'packPrice')) {
          updateData.packPrice = new Prisma.Decimal(u.proposedValues.packPrice);
        }
        stagedPricePlan.push({
          packId: row.id,
          brandId: row.brandId,
          sourceId: u.sourceId,
          brandName: u.brandName,
          genericName: u.genericName,
          strength: u.strength,
          dosageForm: u.dosageForm,
          manufacturer: u.manufacturer,
          batchGroup: u.batchGroup,
          packQuantity: row.packQuantity,
          packUnits: row.packUnits,
          stripUnits: row.stripUnits,
          currency: row.currency,
          verification: row.verification,
          warnings: row.warnings,
          oldUnitPriceRaw: row.unitPrice !== null ? row.unitPrice.toString() : null,
          oldPackPriceRaw: row.packPrice !== null ? row.packPrice.toString() : null,
          fieldsToUpdate: Object.keys(updateData),
          newUnitPrice: Object.prototype.hasOwnProperty.call(u.proposedValues, 'unitPrice') ? u.proposedValues.unitPrice : null,
          newPackPrice: Object.prototype.hasOwnProperty.call(u.proposedValues, 'packPrice') ? u.proposedValues.packPrice : null,
          evidence: u.evidence,
        });
      }
    }

    const warningMismatches = [];
    const decimalArithmeticFailures = [];
    const stagedWarningPlan = [];
    for (const u of warningCleanups) {
      const row = byId.get(u.packId);
      const baseOk =
        row &&
        row.brandId === u.brandId &&
        (row.packQuantity ?? '') === (u.packQuantity ?? '') &&
        (row.packUnits ?? null) === (u.packUnits ?? null) &&
        (row.stripUnits ?? null) === (strOrNull(u.stripUnits) !== null ? Number(u.stripUnits) : null) &&
        (row.currency ?? 'BDT') === 'BDT' &&
        decEqRaw(row.unitPrice, u.currentValues?.unitPrice) &&
        decEqRaw(row.packPrice, u.currentValues?.packPrice) &&
        arrEq(row.warnings, ['pack_price_inconsistent_with_unit_price']);

      let decArithExact = false;
      if (row && row.unitPrice !== null && row.packPrice !== null && row.packUnits !== null && row.packUnits > 0) {
        const dUnit = new Prisma.Decimal(row.unitPrice.toString());
        const dPack = new Prisma.Decimal(row.packPrice.toString());
        const dUnits = new Prisma.Decimal(row.packUnits);
        decArithExact = dUnit.mul(dUnits).eq(dPack);
        if (!decArithExact) {
          decimalArithmeticFailures.push({
            packId: u.packId,
            brandName: u.brandName,
            unitPrice: row.unitPrice.toString(),
            packUnits: row.packUnits,
            packPrice: row.packPrice.toString(),
            computedProduct: dUnit.mul(dUnits).toString(),
          });
        }
      } else {
        decimalArithmeticFailures.push({ packId: u.packId, brandName: u.brandName, issue: 'MISSING_PRICE_OR_PACK_UNITS' });
      }

      if (!baseOk || !decArithExact) {
        warningMismatches.push({ packId: u.packId, brandName: u.brandName, baseOk, decArithExact, actualWarnings: row?.warnings });
      } else {
        const cleanedWarnings = row.warnings.filter((w) => w !== 'pack_price_inconsistent_with_unit_price');
        stagedWarningPlan.push({
          packId: row.id,
          brandId: row.brandId,
          sourceId: u.sourceId,
          brandName: u.brandName,
          genericName: u.genericName,
          strength: u.strength,
          dosageForm: u.dosageForm,
          manufacturer: u.manufacturer,
          batchGroup: u.batchGroup,
          packQuantity: row.packQuantity,
          packUnits: row.packUnits,
          stripUnits: row.stripUnits,
          unitPriceRaw: row.unitPrice.toString(),
          packPriceRaw: row.packPrice.toString(),
          currency: row.currency,
          verification: row.verification,
          oldWarnings: row.warnings,
          newWarnings: cleanedWarnings,
          evidence: u.evidence,
        });
      }
    }

    if (priceMismatches.length > 0 || warningMismatches.length > 0 || decimalArithmeticFailures.length > 0) {
      console.error(JSON.stringify({
        status: 'PRECONDITION_ABORTED',
        priceMismatches,
        warningMismatches,
        decimalArithmeticFailures,
      }, null, 2));
      process.exit(1);
    }

    const dryRunResult = {
      mode: 'DRY_RUN_PRECONDITIONS',
      databaseModified: false,
      manifestPath: MANIFEST_PATH,
      batch1PriceScope: {
        expected: 15,
        matched: stagedPricePlan.length,
        mismatches: priceMismatches.length,
        byBatchGroup: {
          BATCH_1A_COMMA_TRUNCATED_WEB_VERIFIED: stagedPricePlan.filter((x) => x.batchGroup === 'BATCH_1A_COMMA_TRUNCATED_WEB_VERIFIED').length,
          BATCH_1B_WEB_VERIFIED_DELTA_2: stagedPricePlan.filter((x) => x.batchGroup === 'BATCH_1B_WEB_VERIFIED_DELTA_2').length,
          BATCH_1C_EXCLUDED_61_ROUNDING_VERIFIED_4: stagedPricePlan.filter((x) => x.batchGroup === 'BATCH_1C_EXCLUDED_61_ROUNDING_VERIFIED_4').length,
        },
      },
      batch1WarningScope: {
        expected: 70,
        matched: stagedWarningPlan.length,
        mismatches: warningMismatches.length,
        decimalArithmeticVerifiedExactCount: stagedWarningPlan.length,
        decimalArithmeticFailuresCount: decimalArithmeticFailures.length,
      },
      totalMatchedPreconditions: stagedPricePlan.length + stagedWarningPlan.length,
      totalMismatches: 0,
    };

    if (!execute) {
      console.log(JSON.stringify(dryRunResult, null, 2));
      return;
    }

    if (!fs.existsSync(BACKUP_PATH)) {
      throw new Error(`Required PostgreSQL backup missing: ${BACKUP_PATH}`);
    }

    // Write rollback manifests BEFORE PostgreSQL mutations
    const priceRollbackDoc = {
      generatedAt: new Date().toISOString(),
      batch: 'Batch 1A-1C (15 Price Corrections)',
      manifestSource: MANIFEST_PATH,
      count: stagedPricePlan.length,
      instructions: 'Restores ONLY modified MedicinePack price fields (unitPrice and/or packPrice as recorded) back to exact pre-execution raw Decimal/null strings.',
      records: stagedPricePlan.map((s) => ({
        packId: s.packId,
        brandId: s.brandId,
        sourceId: s.sourceId,
        brandName: s.brandName,
        batchGroup: s.batchGroup,
        packQuantity: s.packQuantity,
        packUnits: s.packUnits,
        stripUnits: s.stripUnits,
        verification: s.verification,
        warnings: s.warnings,
        fieldsModified: s.fieldsToUpdate,
        restoreUnitPrice: s.oldUnitPriceRaw,
        restorePackPrice: s.oldPackPriceRaw,
        appliedUnitPrice: s.newUnitPrice,
        appliedPackPrice: s.newPackPrice,
      })),
    };

    const warningRollbackDoc = {
      generatedAt: new Date().toISOString(),
      batch: 'Batch 1D (70 Stale Warning Cleanups)',
      manifestSource: MANIFEST_PATH,
      count: stagedWarningPlan.length,
      instructions: 'Restores MedicinePack.warnings back to ["pack_price_inconsistent_with_unit_price"] for all 70 packIds.',
      records: stagedWarningPlan.map((s) => ({
        packId: s.packId,
        brandId: s.brandId,
        sourceId: s.sourceId,
        brandName: s.brandName,
        packQuantity: s.packQuantity,
        packUnits: s.packUnits,
        stripUnits: s.stripUnits,
        unitPrice: s.unitPriceRaw,
        packPrice: s.packPriceRaw,
        verification: s.verification,
        restoreWarnings: s.oldWarnings,
        appliedWarnings: s.newWarnings,
      })),
    };

    const combinedRollbackDoc = {
      generatedAt: new Date().toISOString(),
      backupPath: BACKUP_PATH,
      totalRecords: stagedPricePlan.length + stagedWarningPlan.length,
      priceCorrectionsRollback_15: priceRollbackDoc,
      warningCleanupRollback_70: warningRollbackDoc,
    };

    const priceRollbackPath = path.join(EXEC_DIR, 'batch1_price_rollback_manifest.json');
    const warnRollbackPath = path.join(EXEC_DIR, 'batch1_warning_rollback_manifest.json');
    const combinedRollbackPath = path.join(EXEC_DIR, 'batch1_rollback_manifest.json');
    fs.writeFileSync(priceRollbackPath, JSON.stringify(priceRollbackDoc, null, 2));
    fs.writeFileSync(warnRollbackPath, JSON.stringify(warningRollbackDoc, null, 2));
    fs.writeFileSync(combinedRollbackPath, JSON.stringify(combinedRollbackDoc, null, 2));

    // ── TRANSACTION 1: 15 Price Corrections ONLY ──
    const tx1Started = new Date().toISOString();
    const tx1Count = await prisma.$transaction(
      async (tx) => {
        let count = 0;
        for (const item of stagedPricePlan) {
          const data = {};
          if (item.fieldsToUpdate.includes('unitPrice')) {
            data.unitPrice = new Prisma.Decimal(item.newUnitPrice);
          }
          if (item.fieldsToUpdate.includes('packPrice')) {
            data.packPrice = new Prisma.Decimal(item.newPackPrice);
          }
          const res = await tx.medicinePack.updateMany({
            where: {
              id: item.packId,
              brandId: item.brandId,
              packQuantity: item.packQuantity,
              packUnits: item.packUnits,
              stripUnits: item.stripUnits,
              currency: item.currency,
              verification: item.verification,
              warnings: { equals: item.warnings },
              unitPrice: item.oldUnitPriceRaw !== null ? new Prisma.Decimal(item.oldUnitPriceRaw) : null,
              packPrice: item.oldPackPriceRaw !== null ? new Prisma.Decimal(item.oldPackPriceRaw) : null,
            },
            data,
          });
          if (res.count !== 1) {
            throw new Error(`Tx1 Atomic Abort: expected 1 row updated for packId=${item.packId}, got ${res.count}`);
          }
          count += res.count;
        }
        if (count !== 15) {
          throw new Error(`Tx1 Atomic Abort: expected 15 updates total, got ${count}`);
        }
        return count;
      },
      { isolationLevel: 'Serializable', maxWait: 20000, timeout: 120000 },
    );
    const tx1Finished = new Date().toISOString();

    const priceExecReport = {
      status: 'EXECUTED_COMMITTED_SINGLE_TRANSACTION',
      transactionIsolationLevel: 'Serializable',
      startedAt: tx1Started,
      finishedAt: tx1Finished,
      manifestPath: MANIFEST_PATH,
      backupPath: BACKUP_PATH,
      rollbackManifestPath: priceRollbackPath,
      combinedRollbackManifestPath: combinedRollbackPath,
      preconditionsMatched: stagedPricePlan.length,
      totalUpdated: tx1Count,
      byBatchGroup: dryRunResult.batch1PriceScope.byBatchGroup,
      fieldsAllowedToModify: ['unitPrice', 'packPrice'],
      fieldsPreserved: ['packQuantity', 'packUnits', 'stripUnits', 'currency', 'verification', 'warnings', 'brandId', 'MedicineBrand', 'MedicineGeneric'],
      records: stagedPricePlan,
    };
    fs.writeFileSync(path.join(EXEC_DIR, 'batch1_price_execution_report.json'), JSON.stringify(priceExecReport, null, 2));

    // ── TRANSACTION 2: 70 Stale Warning Cleanups ONLY (SEPARATE TRANSACTION) ──
    const tx2Started = new Date().toISOString();
    const tx2Count = await prisma.$transaction(
      async (tx) => {
        let count = 0;
        for (const item of stagedWarningPlan) {
          const res = await tx.medicinePack.updateMany({
            where: {
              id: item.packId,
              brandId: item.brandId,
              packQuantity: item.packQuantity,
              packUnits: item.packUnits,
              stripUnits: item.stripUnits,
              currency: item.currency,
              verification: item.verification,
              unitPrice: new Prisma.Decimal(item.unitPriceRaw),
              packPrice: new Prisma.Decimal(item.packPriceRaw),
              warnings: { equals: ['pack_price_inconsistent_with_unit_price'] },
            },
            data: {
              warnings: { set: item.newWarnings },
            },
          });
          if (res.count !== 1) {
            throw new Error(`Tx2 Atomic Abort: expected 1 row updated for packId=${item.packId}, got ${res.count}`);
          }
          count += res.count;
        }
        if (count !== 70) {
          throw new Error(`Tx2 Atomic Abort: expected 70 updates total, got ${count}`);
        }
        return count;
      },
      { isolationLevel: 'Serializable', maxWait: 20000, timeout: 180000 },
    );
    const tx2Finished = new Date().toISOString();

    const warningExecReport = {
      status: 'EXECUTED_COMMITTED_SEPARATE_TRANSACTION',
      transactionIsolationLevel: 'Serializable',
      startedAt: tx2Started,
      finishedAt: tx2Finished,
      manifestPath: MANIFEST_PATH,
      backupPath: BACKUP_PATH,
      rollbackManifestPath: warnRollbackPath,
      combinedRollbackManifestPath: combinedRollbackPath,
      preconditionsMatched: stagedWarningPlan.length,
      decimalArithmeticVerifiedExactCount: stagedWarningPlan.length,
      totalUpdated: tx2Count,
      warningRemoved: 'pack_price_inconsistent_with_unit_price',
      fieldsPreserved: ['unitPrice', 'packPrice', 'packQuantity', 'packUnits', 'stripUnits', 'currency', 'verification', 'brandId', 'MedicineBrand', 'MedicineGeneric'],
      records: stagedWarningPlan,
    };
    fs.writeFileSync(path.join(EXEC_DIR, 'batch1_warning_cleanup_report.json'), JSON.stringify(warningExecReport, null, 2));

    console.log(JSON.stringify({
      status: 'BATCH_1_EXECUTION_COMPLETED',
      transaction1_priceUpdates: tx1Count,
      transaction2_warningCleanups: tx2Count,
      executionDirectory: EXEC_DIR,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
