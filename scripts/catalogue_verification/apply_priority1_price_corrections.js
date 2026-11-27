/**
 * Controlled, single-transaction applicator for the 104 approved Priority-1 price corrections.
 * Reads:  backend/reports/priority1_price_conflict_audit/proposed_price_corrections.json
 * Writes: backend/reports/priority1_price_corrections_execution/
 *           - rollback_manifest.json
 *           - execution_summary.json
 *           - before_after_price_comparison.csv
 *
 * Dry-run by default. Requires BOTH --execute AND --confirm-p1-104 to modify PostgreSQL.
 * Strictly updates ONLY MedicinePack.unitPrice and MedicinePack.packPrice inside ONE transaction.
 * Preserves packUnits, stripUnits, packQuantity, currency, brandId, verification, warnings, and all other tables.
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const envPath = path.join(REPO_ROOT, 'backend/.env');
let dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  const m = envText.match(/^DIRECT_URL=(.+)$/m);
  if (m) dbUrl = m[1].trim().replace(/^["']|["']$/g, '');
}
const { PrismaClient, Prisma } = require(path.join(REPO_ROOT, 'backend/node_modules/@prisma/client'));

const MANIFEST_PATH = path.join(REPO_ROOT, 'backend/reports/priority1_price_conflict_audit/proposed_price_corrections.json');
const AUDIT_PATH = path.join(REPO_ROOT, 'backend/reports/priority1_price_conflict_audit/priority1_price_conflict_audit.json');
const EXEC_DIR = path.join(REPO_ROOT, 'backend/reports/priority1_price_corrections_execution');
fs.mkdirSync(EXEC_DIR, { recursive: true });

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const confirmed = args.includes('--confirm-p1-104');

function decEq(dbDec, numVal) {
  const dbNum = dbDec !== null && dbDec !== undefined ? Number(dbDec.toString()) : null;
  if (dbNum === null && (numVal === null || numVal === undefined)) return true;
  if (dbNum === null || numVal === null || numVal === undefined) return false;
  return Math.abs(dbNum - Number(numVal)) <= 0.005;
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

(async () => {
  if (execute && !confirmed) {
    throw new Error('Refusing PostgreSQL writes without both --execute and --confirm-p1-104.');
  }

  const manifestDoc = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const updates = manifestDoc.records;
  const auditDoc = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'));

  // Validate exact approved scope: 104 total = 75 benchmark + 28 1-BDT + 1 Diazox swap
  if (updates.length !== 104) {
    throw new Error(`Expected exactly 104 manifest records, found ${updates.length}`);
  }
  const uniquePids = new Set(updates.map((u) => u.packId));
  if (uniquePids.size !== 104) {
    throw new Error(`Duplicate packIds detected in manifest (${uniquePids.size} unique of 104)`);
  }
  const bucketCounts = {};
  for (const u of updates) {
    bucketCounts[u.triageBucket] = (bucketCounts[u.triageBucket] || 0) + 1;
  }
  if (
    bucketCounts.STALE_SYNTHETIC_BENCHMARK_280_300 !== 75 ||
    bucketCounts.CORRUPT_DB_PRICE_1_BDT !== 28 ||
    bucketCounts.UNIT_PRICE_STORED_AS_STRIP_PRICE_SWAP !== 1
  ) {
    throw new Error(`Unexpected manifest bucket breakdown: ${JSON.stringify(bucketCounts)}`);
  }

  const excludedAudit = auditDoc.records.filter((r) => r.classification !== 'VERIFIED_CORRECTION_CANDIDATE');
  if (excludedAudit.length !== 176) {
    throw new Error(`Expected 176 excluded P1 records, found ${excludedAudit.length}`);
  }

  const prisma = new PrismaClient(dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined);
  try {
    const dbRows = await prisma.medicinePack.findMany({
      where: { id: { in: updates.map((u) => u.packId) } },
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

    const byId = new Map(dbRows.map((r) => [r.id, r]));
    const mismatches = [];
    const stagedPlan = [];

    for (const u of updates) {
      const row = byId.get(u.packId);
      const ok =
        row &&
        row.brandId === u.brandId &&
        (row.packQuantity ?? '') === (u.packQuantity ?? '') &&
        (row.packUnits ?? null) === (u.oldPackUnits ?? null) &&
        (row.stripUnits ?? null) === (u.oldStripUnits ?? null) &&
        (row.currency ?? 'BDT') === (u.currency ?? 'BDT') &&
        decEq(row.unitPrice, u.oldUnitPrice) &&
        decEq(row.packPrice, u.oldPackPrice);

      if (!ok) {
        mismatches.push({
          packId: u.packId,
          brandName: u.brandName,
          expected: {
            brandId: u.brandId,
            packQuantity: u.packQuantity,
            packUnits: u.oldPackUnits,
            stripUnits: u.oldStripUnits,
            unitPrice: u.oldUnitPrice,
            packPrice: u.oldPackPrice,
            currency: u.currency,
          },
          actual: row
            ? {
                brandId: row.brandId,
                packQuantity: row.packQuantity,
                packUnits: row.packUnits,
                stripUnits: row.stripUnits,
                unitPrice: row.unitPrice !== null ? row.unitPrice.toString() : null,
                packPrice: row.packPrice !== null ? row.packPrice.toString() : null,
                currency: row.currency,
              }
            : null,
        });
      } else {
        stagedPlan.push({
          packId: row.id,
          brandId: row.brandId,
          sourceId: u.sourceId,
          brandName: u.brandName,
          strength: u.strength,
          dosageForm: u.dosageForm,
          manufacturer: u.manufacturer,
          triageBucket: u.triageBucket,
          patternClassification: u.patternClassification,
          packQuantity: row.packQuantity,
          packUnits: row.packUnits,
          stripUnits: row.stripUnits,
          currency: row.currency,
          verification: row.verification,
          warnings: row.warnings,
          oldUnitPriceRaw: row.unitPrice !== null ? row.unitPrice.toString() : null,
          oldPackPriceRaw: row.packPrice !== null ? row.packPrice.toString() : null,
          oldUnitPriceNum: u.oldUnitPrice,
          oldPackPriceNum: u.oldPackPrice,
          newUnitPrice: u.newUnitPrice !== null && u.newUnitPrice !== undefined ? Number(u.newUnitPrice).toFixed(2) : null,
          newPackPrice: u.newPackPrice !== null && u.newPackPrice !== undefined ? Number(u.newPackPrice).toFixed(2) : null,
          aroggaProductId: u.aroggaProductId,
          medexSourceUrl: u.medexSourceUrl,
        });
      }
    }

    if (mismatches.length > 0) {
      throw new Error(`Precondition mismatch on ${mismatches.length} rows; aborting without modifications. First: ${JSON.stringify(mismatches[0])}`);
    }

    if (!execute) {
      console.log(JSON.stringify({
        mode: 'DRY_RUN',
        manifestPath: MANIFEST_PATH,
        approvedScopeCount: updates.length,
        bucketBreakdown: bucketCounts,
        excludedPriority1Count: excludedAudit.length,
        matchedPreconditions: stagedPlan.length,
        mismatchesCount: mismatches.length,
        fieldsToUpdate: ['unitPrice', 'packPrice'],
        fieldsPreserved: ['packUnits', 'stripUnits', 'packQuantity', 'currency', 'brandId', 'verification', 'warnings'],
        databaseModified: false,
      }, null, 2));
      return;
    }

    // Save rollback manifest BEFORE PostgreSQL mutation
    const rollbackManifestPath = path.join(EXEC_DIR, 'rollback_manifest.json');
    fs.writeFileSync(
      rollbackManifestPath,
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        manifestSource: MANIFEST_PATH,
        count: stagedPlan.length,
        instructions: 'Restores MedicinePack.unitPrice and MedicinePack.packPrice back to exact pre-execution raw Decimal/null strings for all 104 packIds.',
        records: stagedPlan.map((s) => ({
          packId: s.packId,
          brandId: s.brandId,
          sourceId: s.sourceId,
          brandName: s.brandName,
          strength: s.strength,
          dosageForm: s.dosageForm,
          packQuantity: s.packQuantity,
          packUnits: s.packUnits,
          stripUnits: s.stripUnits,
          verification: s.verification,
          warnings: s.warnings,
          restoreUnitPrice: s.oldUnitPriceRaw,
          restorePackPrice: s.oldPackPriceRaw,
          appliedUnitPrice: s.newUnitPrice,
          appliedPackPrice: s.newPackPrice,
        })),
      }, null, 2),
    );

    // Single atomic transaction updating ONLY unitPrice and packPrice
    const startedAt = new Date().toISOString();
    const updatedCount = await prisma.$transaction(
      async (tx) => {
        let count = 0;
        for (const item of stagedPlan) {
          const whereClause = {
            id: item.packId,
            brandId: item.brandId,
            packQuantity: item.packQuantity,
            packUnits: item.packUnits,
            stripUnits: item.stripUnits,
            verification: item.verification,
            unitPrice: item.oldUnitPriceRaw !== null ? new Prisma.Decimal(item.oldUnitPriceRaw) : null,
            packPrice: item.oldPackPriceRaw !== null ? new Prisma.Decimal(item.oldPackPriceRaw) : null,
          };
          const res = await tx.medicinePack.updateMany({
            where: whereClause,
            data: {
              unitPrice: item.newUnitPrice !== null ? new Prisma.Decimal(item.newUnitPrice) : null,
              packPrice: item.newPackPrice !== null ? new Prisma.Decimal(item.newPackPrice) : null,
            },
          });
          if (res.count !== 1) {
            throw new Error(`Atomic rollback triggered: expected 1 update on packId=${item.packId}, got ${res.count}`);
          }
          count += res.count;
        }
        if (count !== 104) {
          throw new Error(`Atomic rollback triggered: expected 104 updates total, got ${count}`);
        }
        return count;
      },
      { isolationLevel: 'Serializable', maxWait: 20000, timeout: 300000 },
    );
    const finishedAt = new Date().toISOString();

    // Generate before_after_price_comparison.csv
    const csvHeaders = [
      'packId', 'brandId', 'sourceId', 'brandName', 'strength', 'dosageForm', 'manufacturer',
      'triageBucket', 'patternClassification', 'packQuantity', 'packUnits', 'stripUnits',
      'beforeUnitPrice', 'afterUnitPrice', 'beforePackPrice', 'afterPackPrice', 'currency',
      'aroggaProductId', 'medexSourceUrl', 'verificationPreserved',
    ];
    const csvLines = [csvHeaders.join(',')];
    for (const item of stagedPlan) {
      csvLines.push([
        item.packId, item.brandId, item.sourceId, item.brandName, item.strength, item.dosageForm, item.manufacturer,
        item.triageBucket, item.patternClassification, item.packQuantity, item.packUnits ?? '', item.stripUnits ?? '',
        item.oldUnitPriceRaw ?? '', item.newUnitPrice ?? '', item.oldPackPriceRaw ?? '', item.newPackPrice ?? '', item.currency,
        item.aroggaProductId, item.medexSourceUrl, item.verification,
      ].map(csvEscape).join(','));
    }
    fs.writeFileSync(path.join(EXEC_DIR, 'before_after_price_comparison.csv'), csvLines.join('\n') + '\n', 'utf8');

    // Generate execution_summary.json
    const execSummary = {
      status: 'EXECUTED_COMMITTED_SINGLE_TRANSACTION',
      startedAt,
      finishedAt,
      manifestPath: MANIFEST_PATH,
      backupPath: path.join(REPO_ROOT, 'care_dose_pre_p1_corrections_backup.dump'),
      rollbackManifestPath,
      approvedScope: {
        total: 104,
        buckets: bucketCounts,
      },
      excludedPriority1Counts: {
        totalExcluded: excludedAudit.length,
        WRONG_PACKAGE_VARIANT: excludedAudit.filter((r) => r.classification === 'WRONG_PACKAGE_VARIANT').length,
        SOURCE_CONFLICT: excludedAudit.filter((r) => r.classification === 'SOURCE_CONFLICT').length,
        EXISTING_VALUE_CORRECT: excludedAudit.filter((r) => r.classification === 'EXISTING_VALUE_CORRECT').length,
      },
      preconditionChecks: {
        matchedPreconditions: stagedPlan.length,
        mismatchesCount: mismatches.length,
      },
      executionResult: {
        transactionIsolationLevel: 'Serializable',
        singleTransaction: true,
        totalUpdated: updatedCount,
        fieldsModified: ['unitPrice', 'packPrice'],
        fieldsPreserved: [
          'packUnits', 'stripUnits', 'packQuantity', 'currency', 'brandId',
          'verification', 'warnings', 'MedicineBrand', 'MedicineGeneric',
          'PatientMedication', 'InventoryTransaction', 'Purchase', 'MedicationSchedule',
        ],
      },
    };
    fs.writeFileSync(path.join(EXEC_DIR, 'execution_summary.json'), JSON.stringify(execSummary, null, 2), 'utf8');

    console.log(JSON.stringify(execSummary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
