/**
 * Controlled single-transaction applicator for Batch 2A Tier 1 + Tier 2 (46 web-verified price updates, incl. Loxodol 8 mg).
 * Reads:  backend/reports/consolidated_remediation/proposed_batch2a_review.json
 * Writes: backend/reports/batch2a_remediation_execution/
 *           - batch2a_rollback_manifest.json
 *           - batch2a_execution_report.json
 *           - batch2a_before_after_price_comparison.csv
 *
 * Dry-run by default. Requires --execute --confirm-batch2a-46 to modify PostgreSQL.
 * Modifies ONLY explicitly proposed unitPrice / packPrice fields; preserves packUnits, stripUnits, packQuantity, currency, verification, warnings, and all other tables.
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

const MANIFEST_PATH = path.join(REPO_ROOT, 'backend/reports/consolidated_remediation/proposed_batch2a_review.json');
const BACKUP_PATH = path.join(REPO_ROOT, 'care_dose_pre_batch2a_46_backup.dump');
const EXEC_DIR = path.join(REPO_ROOT, 'backend/reports/batch2a_remediation_execution');
fs.mkdirSync(EXEC_DIR, { recursive: true });

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const confirmed = args.includes('--confirm-batch2a-46');

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

function csvEsc(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

(async () => {
  if (execute && !confirmed) {
    throw new Error('Refusing PostgreSQL writes without both --execute and --confirm-batch2a-46.');
  }

  const reviewDoc = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const targetTiers = new Set(['TIER1_WEB_AROGGA_MFR_3WAY_CONFIRMED_PRICE', 'TIER2_LIVE_MEDEX_MRP_OVERRIDE_PRICE']);
  const updates = (reviewDoc.records || []).filter((r) => targetTiers.has(r.tierGroup));

  if (updates.length !== 46) {
    throw new Error(`Expected exactly 46 Tier 1+2 records, found ${updates.length}`);
  }
  const uniquePids = new Set(updates.map((u) => u.packId));
  if (uniquePids.size !== 46) {
    throw new Error('Duplicate packIds in Batch 2A Tier 1+2 manifest!');
  }

  for (const u of updates) {
    if (u.confidence !== 'HIGH_STAGED_FOR_REVIEW') {
      throw new Error(`Unexpected confidence on ${u.packId}: ${u.confidence}`);
    }
    const keys = Object.keys(u.proposedValues || {});
    if (!keys.length || !keys.every((k) => k === 'unitPrice' || k === 'packPrice')) {
      throw new Error(`Invalid proposedValues keys on ${u.packId}: ${JSON.stringify(keys)}`);
    }
  }

  const prisma = new PrismaClient(dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined);
  try {
    const dbRows = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        return tx.medicinePack.findMany({
          where: { id: { in: [...uniquePids] } },
          select: {
            id: true, brandId: true, packQuantity: true, packUnits: true, stripUnits: true,
            unitPrice: true, packPrice: true, currency: true, priceSource: true, sourceUrl: true,
            verification: true, warnings: true,
          },
        });
      },
      { isolationLevel: 'RepeatableRead', maxWait: 20000, timeout: 60000 },
    );

    const byId = new Map(dbRows.map((r) => [r.id, r]));
    const mismatches = [];
    const stagedPlan = [];

    for (const u of updates) {
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
        mismatches.push({ packId: u.packId, brandName: u.brandName, expected: u.currentValues, actual: row });
      } else {
        const fieldsToUpdate = [];
        if (Object.prototype.hasOwnProperty.call(u.proposedValues, 'unitPrice')) fieldsToUpdate.push('unitPrice');
        if (Object.prototype.hasOwnProperty.call(u.proposedValues, 'packPrice')) fieldsToUpdate.push('packPrice');
        stagedPlan.push({
          packId: row.id,
          brandId: row.brandId,
          sourceId: u.sourceId,
          brandName: u.brandName,
          genericName: u.genericName,
          strength: u.strength,
          dosageForm: u.dosageForm,
          manufacturer: u.manufacturer,
          tierGroup: u.tierGroup,
          packQuantity: row.packQuantity,
          packUnits: row.packUnits,
          stripUnits: row.stripUnits,
          currency: row.currency,
          verification: row.verification,
          warnings: row.warnings,
          oldUnitPriceRaw: row.unitPrice !== null ? row.unitPrice.toString() : null,
          oldPackPriceRaw: row.packPrice !== null ? row.packPrice.toString() : null,
          fieldsToUpdate,
          newUnitPrice: fieldsToUpdate.includes('unitPrice') ? u.proposedValues.unitPrice : null,
          newPackPrice: fieldsToUpdate.includes('packPrice') ? u.proposedValues.packPrice : null,
          evidence: u.evidence,
        });
      }
    }

    if (mismatches.length > 0) {
      console.error(JSON.stringify({ status: 'PRECONDITION_ABORTED', mismatches }, null, 2));
      process.exit(1);
    }

    const drySummary = {
      mode: 'DRY_RUN_PRECONDITIONS',
      databaseModified: false,
      manifestPath: MANIFEST_PATH,
      tierBreakdown: {
        TIER1_WEB_AROGGA_MFR_3WAY_CONFIRMED_PRICE: stagedPlan.filter((x) => x.tierGroup === 'TIER1_WEB_AROGGA_MFR_3WAY_CONFIRMED_PRICE').length,
        TIER2_LIVE_MEDEX_MRP_OVERRIDE_PRICE: stagedPlan.filter((x) => x.tierGroup === 'TIER2_LIVE_MEDEX_MRP_OVERRIDE_PRICE').length,
      },
      matchedPreconditions: stagedPlan.length,
      mismatchesCount: mismatches.length,
      noteRecordsAlreadyHoldingStaleArithWarning: stagedPlan.filter((x) => x.warnings.length > 0).map((x) => ({
        packId: x.packId,
        brandName: `${x.brandName} ${x.strength}`,
        existingWarnings: x.warnings,
      })),
    };

    if (!execute) {
      console.log(JSON.stringify(drySummary, null, 2));
      return;
    }

    if (!fs.existsSync(BACKUP_PATH)) {
      throw new Error(`Required PostgreSQL backup missing: ${BACKUP_PATH}`);
    }

    // Write rollback manifest BEFORE PostgreSQL mutations
    const rollbackPath = path.join(EXEC_DIR, 'batch2a_rollback_manifest.json');
    fs.writeFileSync(rollbackPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      backupPath: BACKUP_PATH,
      manifestSource: MANIFEST_PATH,
      count: stagedPlan.length,
      instructions: 'Restores ONLY modified MedicinePack price fields back to exact pre-execution raw Decimal/null strings for all 46 packIds.',
      records: stagedPlan.map((s) => ({
        packId: s.packId,
        brandId: s.brandId,
        sourceId: s.sourceId,
        brandName: s.brandName,
        strength: s.strength,
        tierGroup: s.tierGroup,
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
    }, null, 2));

    // Single atomic transaction updating ONLY specified price fields
    const startedAt = new Date().toISOString();
    const updatedCount = await prisma.$transaction(
      async (tx) => {
        let count = 0;
        for (const item of stagedPlan) {
          const data = {};
          if (item.fieldsToUpdate.includes('unitPrice')) data.unitPrice = new Prisma.Decimal(item.newUnitPrice);
          if (item.fieldsToUpdate.includes('packPrice')) data.packPrice = new Prisma.Decimal(item.newPackPrice);
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
            throw new Error(`Atomic Rollback Triggered: expected 1 update for packId=${item.packId}, got ${res.count}`);
          }
          count += res.count;
        }
        if (count !== 46) {
          throw new Error(`Atomic Rollback Triggered: expected 46 total updates, got ${count}`);
        }
        return count;
      },
      { isolationLevel: 'Serializable', maxWait: 20000, timeout: 180000 },
    );
    const finishedAt = new Date().toISOString();

    const csvHeaders = [
      'packId', 'brandId', 'sourceId', 'brandName', 'strength', 'dosageForm', 'manufacturer',
      'tierGroup', 'packQuantity', 'packUnits', 'stripUnits',
      'beforeUnitPrice', 'afterUnitPrice', 'beforePackPrice', 'afterPackPrice', 'currency',
      'verificationPreserved', 'warningsPreserved',
    ];
    const csvLines = [csvHeaders.join(',')];
    for (const item of stagedPlan) {
      csvLines.push([
        item.packId, item.brandId, item.sourceId, item.brandName, item.strength, item.dosageForm, item.manufacturer,
        item.tierGroup, item.packQuantity, item.packUnits ?? '', item.stripUnits ?? '',
        item.oldUnitPriceRaw ?? '', item.newUnitPrice ?? '', item.oldPackPriceRaw ?? '', item.newPackPrice ?? '', item.currency,
        item.verification, JSON.stringify(item.warnings),
      ].map(csvEsc).join(','));
    }
    fs.writeFileSync(path.join(EXEC_DIR, 'batch2a_before_after_price_comparison.csv'), csvLines.join('\n') + '\n', 'utf8');

    fs.writeFileSync(path.join(EXEC_DIR, 'batch2a_execution_report.json'), JSON.stringify({
      status: 'EXECUTED_COMMITTED_SINGLE_TRANSACTION',
      transactionIsolationLevel: 'Serializable',
      startedAt,
      finishedAt,
      backupPath: BACKUP_PATH,
      rollbackManifestPath: rollbackPath,
      preconditionsMatched: stagedPlan.length,
      totalUpdated: updatedCount,
      tierBreakdown: drySummary.tierBreakdown,
      fieldsModified: ['unitPrice', 'packPrice'],
      fieldsPreserved: ['packQuantity', 'packUnits', 'stripUnits', 'currency', 'verification', 'warnings', 'brandId', 'MedicineBrand', 'MedicineGeneric'],
      records: stagedPlan,
    }, null, 2));

    console.log(JSON.stringify({
      status: 'BATCH_2A_TIER1_2_EXECUTION_COMPLETED',
      totalUpdated: updatedCount,
      executionDirectory: EXEC_DIR,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
