import { Injectable, Logger, Optional } from '@nestjs/common';
import { FieldStatus, Prisma, VerificationStatus } from '@prisma/client';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CatalogueCacheService } from '../catalogue/catalogue-cache';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildBrandLookupIndex,
  BrandMatchResult,
  canonicalizeBrandName,
  canonicalizeGenericName,
  canonicalizeManufacturer,
  canonicalizeStrengthTokens,
  computeStringSimilarity,
  ExistingBrandRecord,
  IncomingBrandCandidate,
  matchIncomingBrand,
  normalizeDosageFormKey,
  normalizeSearchKey,
  normalizeWhitespace,
  slugifyText,
  splitGenericIngredients,
} from './reconciliation-normalizer';
import {
  buildFinalApprovedManifest,
  FinalManifestResult,
} from './reconciliation-manifest';
import {
  CsvGenericRow,
  CsvMedicineRow,
  DimsDataset,
  loadDimsDataset,
  loadGenericCsv,
  loadManufacturerMap,
  loadMedicineCsv,
} from './reconciliation-parsers';

export type ReconciliationSourceOption = 'medex' | 'kaggle' | 'dims' | 'all';

export interface ReconciliationRunOptions {
  dryRun: boolean;
  source: ReconciliationSourceOption;
  batchSize: number;
  includeHerbal: boolean;
  outDir: string;
  datasetPaths?: {
    medicineCsv?: string;
    genericCsv?: string;
    manufacturerCsv?: string;
    dimsJson?: string;
  };
}

export interface ExistingGenericRecord {
  id: string;
  sourceId: string;
  idSource: string;
  name: string;
  normalizedName: string;
  slug: string | null;
}

export interface DatabaseAuditSnapshot {
  capturedAt: string;
  counts: {
    generics: number;
    brands: number;
    packs: number;
    alternativeGroups: number;
    alternativeGroupBrands: number;
    images: number;
    patientMedications: number;
  };
  brandsMissingGeneric: number;
  brandsMissingStrength: number;
  brandsMissingForm: number;
  brandsMissingManufacturer: number;
  generics: ExistingGenericRecord[];
  brands: ExistingBrandRecord[];
}

export interface AuditValidationResult {
  passed: boolean;
  checks: Record<string, { ok: boolean; value: number; note: string }>;
}

const DEFAULT_OUT_DIR = resolve(__dirname, '..', '..', 'reports', 'reconciliation');

function resolveDefaultDatasetPaths() {
  const repoRoot = resolve(__dirname, '..', '..', '..');
  const kaggleInRepo = join(repoRoot, 'kaggle_medicine_dataset');
  const kaggleSibling = join(repoRoot, '..', 'kaggle_medicine_dataset');
  const kaggleDir = existsSync(kaggleInRepo) ? kaggleInRepo : kaggleSibling;
  const dimsJson = join(repoRoot, 'Bangladeshi-Medicine-API', 'data', 'dims_medicne.json');
  return {
    medicineCsv: join(kaggleDir, 'medicine.csv'),
    genericCsv: join(kaggleDir, 'generic.csv'),
    manufacturerCsv: join(kaggleDir, 'manufacturer.csv'),
    dimsJson,
  };
}

function groupByKey<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const list = map.get(k);
    if (list) {
      list.push(item);
    } else {
      map.set(k, [item]);
    }
  }
  return map;
}

function isHerbalOrTraditional(text: string, drugClass?: string): boolean {
  const hay = `${text} ${drugClass ?? ''}`.toLowerCase();
  return (
    hay.includes('herbal') ||
    hay.includes('nutraceutical') ||
    hay.includes('[unani]') ||
    hay.includes('[ayurvedic]') ||
    hay.includes('unani') ||
    hay.includes('ayurvedic')
  );
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly catalogueCache?: CatalogueCacheService,
  ) {}

  /**
   * Captures a full, read-only snapshot of the PostgreSQL catalogue using cursor pagination
   * so large tables never hit Supabase connection pool timeouts.
   */
  async captureDatabaseSnapshot(pageSize = 4000): Promise<DatabaseAuditSnapshot> {
    const [
      genericsCount,
      brandsCount,
      packsCount,
      altGroupsCount,
      altLinksCount,
      imagesCount,
      patientMedsCount,
      generics,
    ] = await Promise.all([
      this.prisma.medicineGeneric.count(),
      this.prisma.medicineBrand.count(),
      this.prisma.medicinePack.count(),
      this.prisma.alternativeGroup.count(),
      this.prisma.alternativeGroupBrand.count(),
      this.prisma.medicineImage.count(),
      this.prisma.patientMedication.count(),
      this.prisma.medicineGeneric.findMany({
        select: {
          id: true,
          sourceId: true,
          idSource: true,
          name: true,
          normalizedName: true,
          slug: true,
        },
      }),
    ]);

    const genericById = new Map<string, ExistingGenericRecord>(
      generics.map((g) => [g.id, g]),
    );

    const brands: ExistingBrandRecord[] = [];
    let cursor: string | undefined;
    while (true) {
      const page = await this.prisma.medicineBrand.findMany({
        take: pageSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        select: {
          id: true,
          sourceId: true,
          name: true,
          normalizedName: true,
          genericId: true,
          strength: true,
          strengthNorm: true,
          dosageForm: true,
          dosageFormNorm: true,
          manufacturer: true,
          category: true,
          releaseMarker: true,
        },
      });
      if (page.length === 0) break;

      for (const b of page) {
        const gen = b.genericId ? genericById.get(b.genericId) : undefined;
        brands.push({
          id: b.id,
          sourceId: b.sourceId,
          name: b.name,
          normalizedName: b.normalizedName,
          genericId: b.genericId,
          genericName: gen?.name ?? null,
          genericNormalizedName: gen?.normalizedName ?? null,
          strength: b.strength,
          strengthNorm: b.strengthNorm,
          dosageForm: b.dosageForm,
          dosageFormNorm: b.dosageFormNorm,
          manufacturer: b.manufacturer,
          category: b.category,
          releaseMarker: b.releaseMarker,
        });
      }

      if (page.length < pageSize) break;
      cursor = page[page.length - 1].id;
    }

    return {
      capturedAt: new Date().toISOString(),
      counts: {
        generics: genericsCount,
        brands: brandsCount,
        packs: packsCount,
        alternativeGroups: altGroupsCount,
        alternativeGroupBrands: altLinksCount,
        images: imagesCount,
        patientMedications: patientMedsCount,
      },
      brandsMissingGeneric: brands.filter((b) => !b.genericId).length,
      brandsMissingStrength: brands.filter((b) => !normalizeWhitespace(b.strength)).length,
      brandsMissingForm: brands.filter((b) => !normalizeWhitespace(b.dosageForm)).length,
      brandsMissingManufacturer: brands.filter((b) => !normalizeWhitespace(b.manufacturer)).length,
      generics,
      brands,
    };
  }

  /**
   * Executes Phases 1-8: audits PostgreSQL + all three datasets, generates all 8 JSON reports,
   * and (only when `dryRun === false`) safely synchronizes verified missing records.
   */
  async runReconciliation(partialOptions?: Partial<ReconciliationRunOptions>): Promise<{
    reportsDir: string;
    summary: Record<string, unknown>;
  }> {
    const defaults = resolveDefaultDatasetPaths();
    const options: ReconciliationRunOptions = {
      dryRun: partialOptions?.dryRun ?? true,
      source: partialOptions?.source ?? 'all',
      batchSize: Math.max(50, partialOptions?.batchSize ?? 500),
      includeHerbal: partialOptions?.includeHerbal ?? false,
      outDir: partialOptions?.outDir ?? DEFAULT_OUT_DIR,
      datasetPaths: {
        medicineCsv: partialOptions?.datasetPaths?.medicineCsv ?? defaults.medicineCsv,
        genericCsv: partialOptions?.datasetPaths?.genericCsv ?? defaults.genericCsv,
        manufacturerCsv: partialOptions?.datasetPaths?.manufacturerCsv ?? defaults.manufacturerCsv,
        dimsJson: partialOptions?.datasetPaths?.dimsJson ?? defaults.dimsJson,
      },
    };

    this.logger.log(
      `Starting medicine reconciliation (dryRun=${options.dryRun}, source=${options.source}, batchSize=${options.batchSize})`,
    );
    await mkdir(options.outDir, { recursive: true });

    const beforeSnapshot = await this.captureDatabaseSnapshot();
    const brandIndex = buildBrandLookupIndex(beforeSnapshot.brands);

    const [csvMedicines, csvGenerics, manufacturerIds, dimsDataset] = await Promise.all([
      loadMedicineCsv(options.datasetPaths!.medicineCsv!),
      loadGenericCsv(options.datasetPaths!.genericCsv!),
      loadManufacturerMap(options.datasetPaths!.manufacturerCsv!),
      loadDimsDataset(options.datasetPaths!.dimsJson!),
    ]);

    // Phase 1 & 3: Internal PostgreSQL Duplicate Audit
    const internalGenericDupGroups = Array.from(
      groupByKey(beforeSnapshot.generics, (g) => g.normalizedName).entries(),
    )
      .filter(([, rows]) => rows.length > 1)
      .map(([normalizedName, rows]) => ({
        normalizedName,
        count: rows.length,
        records: rows.map((r) => ({
          id: r.id,
          sourceId: r.sourceId,
          idSource: r.idSource,
          name: r.name,
        })),
        recommendedAction: 'MANUAL_REVIEW_INTERNAL_GENERIC_DUPLICATE',
      }));

    const internalBrandGroups = Array.from(
      groupByKey(
        beforeSnapshot.brands,
        (b) => `${b.normalizedName}|${b.strengthNorm ?? ''}|${b.dosageFormNorm ?? ''}`,
      ).entries(),
    ).filter(([, rows]) => rows.length > 1);

    const internalBrandSameMfr: Array<Record<string, unknown>> = [];
    const internalBrandDiffMfr: Array<Record<string, unknown>> = [];
    for (const [key, rows] of internalBrandGroups) {
      const mfrs = new Set(rows.map((r) => canonicalizeManufacturer(r.manufacturer)));
      const entry = {
        identityKey: key,
        count: rows.length,
        records: rows.map((r) => ({
          id: r.id,
          sourceId: r.sourceId,
          name: r.name,
          strength: r.strength,
          dosageForm: r.dosageForm,
          manufacturer: r.manufacturer,
          genericName: r.genericName,
        })),
      };
      if (mfrs.size < rows.length) {
        internalBrandSameMfr.push({
          ...entry,
          conflictReason: 'Same normalized brand + strength + dosageForm + manufacturer in DB',
          recommendedAction: 'MANUAL_REVIEW_INTERNAL_DUPLICATE',
        });
      } else {
        internalBrandDiffMfr.push({
          ...entry,
          reason: 'Same brand name + strength + dosageForm produced by different manufacturers (legitimate)',
          recommendedAction: 'KEEP_SEPARATE',
        });
      }
    }

    // Phase 4: Generic Data Reconciliation
    const genericAudit = this.reconcileGenerics(
      beforeSnapshot.generics,
      csvGenerics,
      csvMedicines,
      dimsDataset,
      internalGenericDupGroups,
    );

    // Phase 2, 3, 5: Brand Reconciliation across Kaggle medicine.csv & DIMS JSON
    const kaggleAudit = this.reconcileKaggleMedicines(csvMedicines, brandIndex, beforeSnapshot.generics);
    const dimsAudit = this.reconcileDimsMedicines(dimsDataset, brandIndex);

    // Build required report artifacts
    const medicineAuditReport = {
      generatedAt: new Date().toISOString(),
      mode: options.dryRun ? 'DRY_RUN' : 'SYNCHRONIZED',
      databaseSnapshot: {
        counts: beforeSnapshot.counts,
        dataQuality: {
          brandsMissingGeneric: beforeSnapshot.brandsMissingGeneric,
          brandsMissingStrength: beforeSnapshot.brandsMissingStrength,
          brandsMissingForm: beforeSnapshot.brandsMissingForm,
          brandsMissingManufacturer: beforeSnapshot.brandsMissingManufacturer,
          internalBrandDuplicateGroupsSameManufacturer: internalBrandSameMfr.length,
          internalBrandDifferentManufacturerGroups: internalBrandDiffMfr.length,
          internalGenericDuplicateGroups: internalGenericDupGroups.length,
        },
      },
      kaggleMedicineCsv: {
        totalExamined: csvMedicines.length,
        exactSourceIdMatches: kaggleAudit.counts.EXACT_SOURCE_ID_MATCH,
        sourceIdCollisions: kaggleAudit.counts.SOURCE_ID_COLLISION,
        exactAttributeMatches: kaggleAudit.counts.EXACT_ATTRIBUTE_MATCH,
        normalizedAttributeMatches: kaggleAudit.counts.NORMALIZED_ATTRIBUTE_MATCH,
        dosageFormEquivalentReview: kaggleAudit.counts.DOSAGE_FORM_EQUIVALENT_REVIEW,
        legitimateFormVariationsMissingFromDb: kaggleAudit.counts.LEGITIMATE_FORM_VARIATION,
        fuzzyPotentialDuplicates: kaggleAudit.counts.FUZZY_POTENTIAL_DUPLICATE,
        genuinelyMissingAllopathic: kaggleAudit.safeMissingAllopathic.length,
        genuinelyMissingHerbal: kaggleAudit.safeMissingHerbal.length,
        missingGenericOnIncomingCsv: kaggleAudit.missingGenericBrands.length,
      },
      dimsJsonSummary: dimsAudit.summary,
    };

    const duplicateRecordsReport = {
      generatedAt: new Date().toISOString(),
      internalDbSameManufacturerDuplicates: internalBrandSameMfr,
      internalDbDifferentManufacturerSameBrand: internalBrandDiffMfr,
      internalDbGenericDuplicates: internalGenericDupGroups,
      kaggleCsvDuplicatesUnderDifferentSourceId: kaggleAudit.duplicatesUnderDifferentId,
      kaggleCsvFuzzyPotentialDuplicates: kaggleAudit.fuzzyPotentialDuplicates,
    };

    const sourceIdConflictsReport = {
      generatedAt: new Date().toISOString(),
      totalConflicts: kaggleAudit.sourceIdCollisions.length,
      conflicts: kaggleAudit.sourceIdCollisions,
    };

    const missingMedicinesReport = {
      generatedAt: new Date().toISOString(),
      summary: {
        kaggleSafeMissingAllopathic: kaggleAudit.safeMissingAllopathic.length,
        kaggleSafeMissingHerbal: kaggleAudit.safeMissingHerbal.length,
        kaggleLegitimateFormVariations: kaggleAudit.legitimateFormVariations.length,
        kaggleMissingWithEmptyGeneric: kaggleAudit.missingGenericBrands.length,
        dimsGenuinelyMissing: dimsAudit.genuinelyMissing.length,
      },
      kaggleSafeMissingAllopathic: kaggleAudit.safeMissingAllopathic,
      kaggleSafeMissingHerbal: kaggleAudit.safeMissingHerbal,
      kaggleLegitimateFormVariations: kaggleAudit.legitimateFormVariations,
      kaggleMissingWithEmptyGeneric: kaggleAudit.missingGenericBrands,
      dimsGenuinelyMissingSample: dimsAudit.genuinelyMissing.slice(0, 500),
    };

    const manualReviewReport = {
      generatedAt: new Date().toISOString(),
      counts: {
        sourceIdCollisions: kaggleAudit.sourceIdCollisions.length,
        dosageFormEquivalentReview: kaggleAudit.dosageFormEquivalentReview.length,
        fuzzyPotentialDuplicates: kaggleAudit.fuzzyPotentialDuplicates.length,
        manufacturerMismatches: kaggleAudit.manufacturerMismatchReviews.length,
        missingGenericBrands: kaggleAudit.missingGenericBrands.length,
        internalGenericDuplicates: internalGenericDupGroups.length,
        dimsAmbiguousRecords: dimsAudit.ambiguousManualReview.length,
      },
      sourceIdCollisions: kaggleAudit.sourceIdCollisions,
      dosageFormEquivalentReview: kaggleAudit.dosageFormEquivalentReview,
      fuzzyPotentialDuplicates: kaggleAudit.fuzzyPotentialDuplicates,
      manufacturerMismatches: kaggleAudit.manufacturerMismatchReviews,
      missingGenericBrands: kaggleAudit.missingGenericBrands,
      dimsAmbiguousRecordsSample: dimsAudit.ambiguousManualReview.slice(0, 500),
    };

    // Phase 5b: Build strictly verified Final Pre-Execution Manifest (allopathic-only safe set)
    const finalManifest = buildFinalApprovedManifest({
      candidates: kaggleAudit.safeMissingAllopathic,
      existingBrands: beforeSnapshot.brands,
      existingGenerics: beforeSnapshot.generics,
      manufacturerIds,
    });

    // Phase 6: Safe Synchronization (only if dryRun === false!)
    const syncOutcome = await this.executeSafeSynchronization(
      options,
      beforeSnapshot,
      kaggleAudit,
      finalManifest,
    );

    // Phase 7: Post-sync Validation
    const afterSnapshot = options.dryRun ? beforeSnapshot : await this.captureDatabaseSnapshot();
    const validation = this.validatePostSync(beforeSnapshot, afterSnapshot);

    const importSummaryReport = {
      generatedAt: new Date().toISOString(),
      dryRun: options.dryRun,
      source: options.source,
      batchSize: options.batchSize,
      includeHerbal: options.includeHerbal,
      totals: {
        recordsExamined: csvMedicines.length + dimsDataset.brands.length,
        kaggleExamined: csvMedicines.length,
        dimsExamined: dimsDataset.brands.length,
        exactMatches:
          kaggleAudit.counts.EXACT_SOURCE_ID_MATCH +
          kaggleAudit.counts.EXACT_ATTRIBUTE_MATCH +
          dimsAudit.summary.exactFormattingMatches,
        newlyInsertedGenerics: syncOutcome.insertedGenerics,
        newlyInsertedBrands: syncOutcome.insertedBrands,
        newlyInsertedPacks: syncOutcome.insertedPacks,
        newlyInsertedAltGroups: syncOutcome.insertedAltGroups,
        newlyInsertedAltLinks: syncOutcome.insertedAltLinks,
        updatedRecords: syncOutcome.updatedRecords,
        skippedRecords: syncOutcome.skippedRecords,
        duplicateRecords:
          kaggleAudit.duplicatesUnderDifferentId.length +
          kaggleAudit.fuzzyPotentialDuplicates.length +
          dimsAudit.summary.exactFormattingMatches +
          dimsAudit.summary.potentialSpellingVariations,
        conflictingRecords: kaggleAudit.sourceIdCollisions.length,
        unresolvedRecords:
          kaggleAudit.dosageFormEquivalentReview.length +
          kaggleAudit.manufacturerMismatchReviews.length +
          kaggleAudit.missingGenericBrands.length +
          dimsAudit.summary.ambiguousManualReview,
      },
      proposedOrAppliedBatchLogs: syncOutcome.logs,
      backupFile: syncOutcome.backupFile,
      beforeCounts: beforeSnapshot.counts,
      afterCounts: afterSnapshot.counts,
      validation,
    };

    const finalExecutionSummary = {
      generatedAt: new Date().toISOString(),
      mode: options.dryRun ? 'FINAL_PRE_EXECUTION_DRY_RUN' : 'EXECUTED',
      source: options.source,
      batchSize: options.batchSize,
      backupReadiness: {
        jsonSnapshotPath: syncOutcome.backupFile ?? join(options.outDir, 'pre_execution_snapshot.json'),
        pgDumpRequiredBeforeExecute: true,
        pgDumpAvailableLocally: false,
        note: 'pg_dump binary was not detected on this Windows host; run pg_dump against DIRECT_URL or create a Supabase dashboard backup before running --execute.',
      },
      manifestCounts: finalManifest.summary,
      beforeDatabaseCounts: beforeSnapshot.counts,
      projectedAfterDatabaseCounts: {
        generics: beforeSnapshot.counts.generics + finalManifest.summary.approvedNewGenericsCount,
        brands: beforeSnapshot.counts.brands + finalManifest.summary.approvedBrandsCount,
        packs: beforeSnapshot.counts.packs + finalManifest.summary.approvedPacksCount,
      },
      actualSyncOutcome: syncOutcome,
      validation,
    };

    const rollbackDoc = this.buildRollbackProcedureMarkdown(options.outDir);

    await Promise.all([
      this.writeJsonReport(options.outDir, 'medicine_audit_report.json', medicineAuditReport),
      this.writeJsonReport(options.outDir, 'generic_audit_report.json', genericAudit),
      this.writeJsonReport(options.outDir, 'dims_reconciliation_report.json', dimsAudit.fullReport),
      this.writeJsonReport(options.outDir, 'duplicate_records.json', duplicateRecordsReport),
      this.writeJsonReport(options.outDir, 'source_id_conflicts.json', sourceIdConflictsReport),
      this.writeJsonReport(options.outDir, 'missing_medicines.json', missingMedicinesReport),
      this.writeJsonReport(options.outDir, 'manual_review_required.json', manualReviewReport),
      this.writeJsonReport(options.outDir, 'import_summary.json', importSummaryReport),
      this.writeJsonReport(options.outDir, 'pre_execution_snapshot.json', beforeSnapshot),
      this.writeJsonReport(options.outDir, 'final_approved_brands.json', finalManifest.approvedBrands),
      this.writeJsonReport(options.outDir, 'final_approved_generics.json', finalManifest.approvedGenerics),
      this.writeJsonReport(options.outDir, 'final_approved_packs.json', finalManifest.approvedPacks),
      this.writeJsonReport(options.outDir, 'final_excluded_records.json', finalManifest.excludedRecords),
      this.writeJsonReport(options.outDir, 'final_execution_summary.json', finalExecutionSummary),
      writeFile(join(options.outDir, 'rollback_procedure.md'), rollbackDoc, 'utf8'),
    ]);

    this.logger.log(`All reconciliation and final manifest reports written to ${options.outDir}`);
    return { reportsDir: options.outDir, summary: finalExecutionSummary };
  }

  private async writeJsonReport(dir: string, filename: string, payload: unknown): Promise<void> {
    await writeFile(join(dir, filename), JSON.stringify(payload, null, 2), 'utf8');
  }

  /**
   * Phase 4: Reconciles generics across DB, generic.csv, medicine.csv, and DIMS JSON.
   * Never merges distinct active ingredients or collapses combination components.
   */
  private reconcileGenerics(
    dbGenerics: ExistingGenericRecord[],
    csvGenerics: CsvGenericRow[],
    csvMedicines: CsvMedicineRow[],
    dims: DimsDataset,
    internalDuplicates: Array<Record<string, unknown>>,
  ) {
    const dbByNorm = new Map<string, ExistingGenericRecord>();
    const dbByCanon = new Map<string, ExistingGenericRecord[]>();
    for (const g of dbGenerics) {
      dbByNorm.set(g.normalizedName, g);
      const canon = canonicalizeGenericName(g.name);
      const list = dbByCanon.get(canon) ?? [];
      list.push(g);
      dbByCanon.set(canon, list);
    }

    const csvMedGenericSet = new Set(csvMedicines.map((m) => m.generic).filter(Boolean));
    const exactMatches: Array<Record<string, unknown>> = [];
    const spellingOrFormatVariants: Array<Record<string, unknown>> = [];
    const missingAllopathic: Array<Record<string, unknown>> = [];
    const missingHerbalUnaniAyurvedic: Array<Record<string, unknown>> = [];
    const missingCombinations: Array<Record<string, unknown>> = [];

    for (const g of csvGenerics) {
      const norm = normalizeSearchKey(g.genericName);
      const exact = dbByNorm.get(norm);
      if (exact) {
        exactMatches.push({
          csvGenericId: g.genericId,
          csvName: g.genericName,
          dbSourceId: exact.sourceId,
          dbName: exact.name,
        });
        continue;
      }

      const canon = canonicalizeGenericName(g.genericName);
      const canonHits = dbByCanon.get(canon) ?? [];
      const isCombination = splitGenericIngredients(g.genericName).length > 1;
      const isHerbal = isHerbalOrTraditional(g.genericName, g.drugClass);

      if (canonHits.length > 0) {
        spellingOrFormatVariants.push({
          csvGenericId: g.genericId,
          csvName: g.genericName,
          dbCandidates: canonHits.map((d) => ({ sourceId: d.sourceId, name: d.name })),
          isCombination,
          reason: 'Punctuation or parenthetical formatting variant of existing generic',
          recommendedAction: 'MANUAL_REVIEW_GENERIC_VARIANT',
        });
        continue;
      }

      // Check close fuzzy matches only when ingredient count matches (never merge single vs combination!)
      const incIngredients = splitGenericIngredients(g.genericName);
      let fuzzyCandidate: { name: string; sourceId: string; similarity: number } | null = null;
      for (const existing of dbGenerics) {
        const dbIngredients = splitGenericIngredients(existing.name);
        if (dbIngredients.length !== incIngredients.length) continue;
        const sim = computeStringSimilarity(canon, canonicalizeGenericName(existing.name));
        if (sim >= 0.88 && (!fuzzyCandidate || sim > fuzzyCandidate.similarity)) {
          fuzzyCandidate = { name: existing.name, sourceId: existing.sourceId, similarity: sim };
        }
      }

      if (fuzzyCandidate) {
        spellingOrFormatVariants.push({
          csvGenericId: g.genericId,
          csvName: g.genericName,
          dbCandidates: [fuzzyCandidate],
          isCombination,
          reason: `High-similarity spelling candidate (${(fuzzyCandidate.similarity * 100).toFixed(1)}%); must verify active ingredient identity before linking`,
          recommendedAction: 'MANUAL_REVIEW_GENERIC_SPELLING',
        });
        continue;
      }

      const record = {
        csvGenericId: g.genericId,
        name: g.genericName,
        drugClass: g.drugClass || null,
        isCombination,
        isHerbalOrTraditional: isHerbal,
        referencedByMedicineCsv: csvMedGenericSet.has(g.genericName),
      };

      if (isHerbal) {
        missingHerbalUnaniAyurvedic.push(record);
      } else if (isCombination) {
        missingCombinations.push(record);
      } else {
        missingAllopathic.push(record);
      }
    }

    // Also check DIMS generics not in DB
    const dimsMissingGenerics = dims.generics
      .filter((g) => !dbByNorm.has(normalizeSearchKey(g.generic_name)))
      .map((g) => ({
        dimsGenericId: g.generic_id,
        name: g.generic_name,
        isCombination: splitGenericIngredients(g.generic_name).length > 1,
        canonicalMatchInDb: (dbByCanon.get(canonicalizeGenericName(g.generic_name)) ?? []).map((x) => x.name),
      }));

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        dbTotalGenerics: dbGenerics.length,
        internalDbDuplicateGenericGroups: internalDuplicates.length,
        csvTotalGenerics: csvGenerics.length,
        csvExactMatches: exactMatches.length,
        csvPotentialVariantsRequiringReview: spellingOrFormatVariants.length,
        csvMissingAllopathicSingle: missingAllopathic.length,
        csvMissingCombinations: missingCombinations.length,
        csvMissingHerbalUnaniAyurvedic: missingHerbalUnaniAyurvedic.length,
        dimsTotalGenerics: dims.generics.length,
        dimsNotExactMatchInDb: dimsMissingGenerics.length,
      },
      internalDbDuplicateGenericGroups: internalDuplicates,
      potentialSpellingOrFormatVariants: spellingOrFormatVariants,
      missingAllopathicSingleGenerics: missingAllopathic,
      missingCombinationGenerics: missingCombinations,
      missingHerbalUnaniAyurvedicGenerics: missingHerbalUnaniAyurvedic,
      dimsUnmatchedGenericsSample: dimsMissingGenerics.slice(0, 300),
    };
  }

  /**
   * Phases 2 & 3: Reconciles Kaggle `medicine.csv` against PostgreSQL using strict 5-tier matching.
   */
  private reconcileKaggleMedicines(
    csvRows: CsvMedicineRow[],
    brandIndex: ReturnType<typeof buildBrandLookupIndex>,
    dbGenerics: ExistingGenericRecord[],
  ) {
    const dbGenByNorm = new Map(dbGenerics.map((g) => [g.normalizedName, g]));
    const counts: Record<BrandMatchResult['classification'], number> = {
      EXACT_SOURCE_ID_MATCH: 0,
      SOURCE_ID_COLLISION: 0,
      EXACT_ATTRIBUTE_MATCH: 0,
      NORMALIZED_ATTRIBUTE_MATCH: 0,
      DOSAGE_FORM_EQUIVALENT_REVIEW: 0,
      LEGITIMATE_FORM_VARIATION: 0,
      FUZZY_POTENTIAL_DUPLICATE: 0,
      GENUINELY_MISSING: 0,
    };

    const sourceIdCollisions: Array<Record<string, unknown>> = [];
    const duplicatesUnderDifferentId: Array<Record<string, unknown>> = [];
    const dosageFormEquivalentReview: Array<Record<string, unknown>> = [];
    const fuzzyPotentialDuplicates: Array<Record<string, unknown>> = [];
    const manufacturerMismatchReviews: Array<Record<string, unknown>> = [];
    const legitimateFormVariations: Array<Record<string, unknown>> = [];
    const missingGenericBrands: Array<Record<string, unknown>> = [];
    const safeMissingAllopathic: CsvMedicineRow[] = [];
    const safeMissingHerbal: CsvMedicineRow[] = [];

    for (const row of csvRows) {
      const candidate: IncomingBrandCandidate = {
        source: 'kaggle_medicine_csv',
        sourceId: row.brandId,
        name: row.brandName,
        genericName: row.generic || null,
        genericSourceId: row.generic ? `listing:${slugifyText(row.generic)}` : null,
        strength: row.strength || null,
        dosageForm: row.dosageForm || null,
        manufacturer: row.manufacturer || null,
        category: row.type,
      };

      const res = matchIncomingBrand(candidate, brandIndex, { trustSourceIdSpace: true });
      counts[res.classification] += 1;

      if (res.classification === 'EXACT_SOURCE_ID_MATCH') {
        continue;
      }

      if (res.classification === 'SOURCE_ID_COLLISION' && res.matchedBrand) {
        sourceIdCollisions.push({
          source: 'kaggle_medicine_csv',
          sourceId: row.brandId,
          existingDbRecord: {
            id: res.matchedBrand.id,
            sourceId: res.matchedBrand.sourceId,
            name: res.matchedBrand.name,
            strength: res.matchedBrand.strength,
            dosageForm: res.matchedBrand.dosageForm,
            generic: res.matchedBrand.genericName,
            manufacturer: res.matchedBrand.manufacturer,
          },
          incomingRecord: {
            sourceId: row.brandId,
            name: row.brandName,
            strength: row.strength,
            dosageForm: row.dosageForm,
            generic: row.generic,
            manufacturer: row.manufacturer,
          },
          reason: res.reason,
          recommendedAction: 'DO_NOT_OVERWRITE_AND_DO_NOT_IMPORT_WITHOUT_REASSIGNED_PROVENANCE',
        });
        continue;
      }

      if (
        res.classification === 'EXACT_ATTRIBUTE_MATCH' ||
        res.classification === 'NORMALIZED_ATTRIBUTE_MATCH'
      ) {
        const entry = {
          classification: res.classification,
          existingDbRecord: res.matchedBrand
            ? {
                sourceId: res.matchedBrand.sourceId,
                name: res.matchedBrand.name,
                strength: res.matchedBrand.strength,
                dosageForm: res.matchedBrand.dosageForm,
                manufacturer: res.matchedBrand.manufacturer,
              }
            : null,
          incomingRecord: {
            sourceId: row.brandId,
            name: row.brandName,
            strength: row.strength,
            dosageForm: row.dosageForm,
            generic: row.generic,
            manufacturer: row.manufacturer,
          },
          reason: res.reason,
          recommendedAction: res.recommendedAction,
        };
        if (res.recommendedAction === 'MANUAL_REVIEW_POTENTIAL_DUPLICATE') {
          manufacturerMismatchReviews.push(entry);
        } else {
          duplicatesUnderDifferentId.push(entry);
        }
        continue;
      }

      if (res.classification === 'DOSAGE_FORM_EQUIVALENT_REVIEW') {
        dosageFormEquivalentReview.push({
          existingDbRecord: res.matchedBrand
            ? {
                sourceId: res.matchedBrand.sourceId,
                name: res.matchedBrand.name,
                strength: res.matchedBrand.strength,
                dosageForm: res.matchedBrand.dosageForm,
                manufacturer: res.matchedBrand.manufacturer,
              }
            : null,
          incomingRecord: {
            sourceId: row.brandId,
            name: row.brandName,
            strength: row.strength,
            dosageForm: row.dosageForm,
            generic: row.generic,
            manufacturer: row.manufacturer,
          },
          reason: res.reason,
          recommendedAction: 'REVIEW_WHETHER_FORM_LABEL_UPDATED_OR_DISTINCT',
        });
        continue;
      }

      if (res.classification === 'FUZZY_POTENTIAL_DUPLICATE') {
        fuzzyPotentialDuplicates.push({
          existingDbRecord: res.matchedBrand,
          incomingRecord: row,
          reason: res.reason,
          recommendedAction: 'MANUAL_REVIEW_FUZZY_MATCH',
        });
        continue;
      }

      // Missing records (GENUINELY_MISSING or LEGITIMATE_FORM_VARIATION)
      if (!row.generic) {
        missingGenericBrands.push({
          source: 'kaggle_medicine_csv',
          sourceId: row.brandId,
          brandName: row.brandName,
          strength: row.strength,
          dosageForm: row.dosageForm,
          manufacturer: row.manufacturer,
          reason: 'Incoming record has blank generic field; requires manual generic verification',
          recommendedAction: 'MANUAL_REVIEW_MISSING_GENERIC',
        });
        continue;
      }

      if (res.classification === 'LEGITIMATE_FORM_VARIATION') {
        legitimateFormVariations.push({
          brandId: row.brandId,
          brandName: row.brandName,
          strength: row.strength,
          dosageForm: row.dosageForm,
          generic: row.generic,
          manufacturer: row.manufacturer,
          type: row.type,
          existingDbFormsForBrandStrength: res.relatedBrands.map((b) => ({
            sourceId: b.sourceId,
            dosageForm: b.dosageForm,
            manufacturer: b.manufacturer,
          })),
          genericAlreadyInDb: dbGenByNorm.has(normalizeSearchKey(row.generic)),
          recommendedAction: 'SAFE_INSERT_AS_DISTINCT_DOSAGE_FORM',
        });
      }

      if (row.type === 'herbal') {
        safeMissingHerbal.push(row);
      } else {
        safeMissingAllopathic.push(row);
      }
    }

    return {
      counts,
      sourceIdCollisions,
      duplicatesUnderDifferentId,
      dosageFormEquivalentReview,
      fuzzyPotentialDuplicates,
      manufacturerMismatchReviews,
      legitimateFormVariations,
      missingGenericBrands,
      safeMissingAllopathic,
      safeMissingHerbal,
    };
  }

  /**
   * Phase 5: Reconciles DIMS JSON against PostgreSQL without trusting DIMS IDs against MedEx IDs.
   */
  private reconcileDimsMedicines(
    dims: DimsDataset,
    brandIndex: ReturnType<typeof buildBrandLookupIndex>,
  ) {
    const dimsGenMap = new Map(dims.generics.map((g) => [String(g.generic_id), g.generic_name]));
    const dimsCompMap = new Map(dims.companies.map((c) => [String(c.company_id), c.company_name]));

    let exactFormattingMatches = 0;
    let potentialSpellingVariations = 0;
    let differentStrengthOrForm = 0;
    const genuinelyMissing: Array<Record<string, unknown>> = [];
    const ambiguousManualReview: Array<Record<string, unknown>> = [];

    for (const b of dims.brands) {
      const genName = dimsGenMap.get(String(b.generic_id)) ?? null;
      const compName = dimsCompMap.get(String(b.company_id)) ?? null;
      const candidate: IncomingBrandCandidate = {
        source: 'dims_json',
        sourceId: `dims:${b.brand_id}`,
        name: normalizeWhitespace(b.brand_name),
        genericName: genName,
        genericSourceId: b.generic_id ? `dims:${b.generic_id}` : null,
        strength: normalizeWhitespace(b.strength) || null,
        dosageForm: normalizeWhitespace(b.form) || null,
        manufacturer: compName,
        category: 'allopathic',
      };

      const res = matchIncomingBrand(candidate, brandIndex, { trustSourceIdSpace: false });

      if (
        res.classification === 'EXACT_ATTRIBUTE_MATCH' ||
        res.classification === 'NORMALIZED_ATTRIBUTE_MATCH'
      ) {
        if (res.recommendedAction === 'MANUAL_REVIEW_POTENTIAL_DUPLICATE') {
          ambiguousManualReview.push({
            dimsRecord: candidate,
            dbRecord: res.matchedBrand,
            reason: res.reason,
          });
        } else {
          exactFormattingMatches += 1;
        }
      } else if (res.classification === 'FUZZY_POTENTIAL_DUPLICATE') {
        potentialSpellingVariations += 1;
        ambiguousManualReview.push({
          dimsRecord: candidate,
          dbRecord: res.matchedBrand,
          reason: res.reason,
        });
      } else if (res.classification === 'DOSAGE_FORM_EQUIVALENT_REVIEW') {
        differentStrengthOrForm += 1;
        ambiguousManualReview.push({
          dimsRecord: candidate,
          dbRecord: res.matchedBrand,
          reason: res.reason,
        });
      } else if (res.classification === 'LEGITIMATE_FORM_VARIATION') {
        differentStrengthOrForm += 1;
        genuinelyMissing.push({
          ...candidate,
          packSize: b.packsize,
          price: b.price,
          relatedDbForms: res.relatedBrands.map((x) => `${x.strength ?? ''} ${x.dosageForm ?? ''}`),
        });
      } else if (!candidate.strength) {
        ambiguousManualReview.push({
          dimsRecord: candidate,
          dbRecord: null,
          reason: 'DIMS record is missing strength; cannot safely verify against existing MedEx products',
        });
      } else {
        if (res.relatedBrands.length > 0) {
          differentStrengthOrForm += 1;
        }
        genuinelyMissing.push({
          ...candidate,
          packSize: b.packsize,
          price: b.price,
        });
      }
    }

    const summary = {
      totalExamined: dims.brands.length,
      exactFormattingMatches,
      potentialSpellingVariations,
      differentStrengthOrForm,
      genuinelyMissingCount: genuinelyMissing.length,
      ambiguousManualReview: ambiguousManualReview.length,
    };

    const fullReport = {
      generatedAt: new Date().toISOString(),
      policyNote:
        'DIMS brand_id namespace is distinct from MedEx sourceId; records are matched by normalized name, strength, dosage form, generic, and manufacturer. None are imported automatically without review.',
      summary,
      genuinelyMissingSample: genuinelyMissing.slice(0, 500),
      ambiguousManualReviewSample: ambiguousManualReview.slice(0, 500),
    };

    return { summary, fullReport, genuinelyMissing, ambiguousManualReview };
  }

  /**
   * Phase 6: Safe, transactional, idempotent synchronization using ONLY the strictly verified
   * FinalManifestResult. Performs ZERO database writes when `options.dryRun === true`.
   */
  private async executeSafeSynchronization(
    options: ReconciliationRunOptions,
    beforeSnapshot: DatabaseAuditSnapshot,
    kaggleAudit: ReturnType<ReconciliationService['reconcileKaggleMedicines']>,
    manifest: FinalManifestResult,
  ) {
    const skippedRecords =
      kaggleAudit.counts.EXACT_SOURCE_ID_MATCH +
      kaggleAudit.counts.EXACT_ATTRIBUTE_MATCH +
      kaggleAudit.counts.NORMALIZED_ATTRIBUTE_MATCH +
      kaggleAudit.counts.SOURCE_ID_COLLISION +
      kaggleAudit.counts.DOSAGE_FORM_EQUIVALENT_REVIEW +
      kaggleAudit.counts.FUZZY_POTENTIAL_DUPLICATE +
      kaggleAudit.missingGenericBrands.length +
      kaggleAudit.safeMissingHerbal.length +
      manifest.excludedRecords.length;

    if (options.dryRun) {
      return {
        insertedGenerics: 0,
        insertedBrands: 0,
        insertedPacks: 0,
        insertedAltGroups: 0,
        insertedAltLinks: 0,
        updatedRecords: 0,
        skippedRecords,
        backupFile: null as string | null,
        logs: [
          `DRY_RUN: Approved manifest contains ${manifest.summary.approvedNewGenericsCount} new generics, ${manifest.summary.approvedBrandsCount} verified brands, and ${manifest.summary.approvedPacksCount} packs.`,
          `DRY_RUN: Excluded ${manifest.summary.excludedBrandsCount} uncertain/borderline/duplicate candidate brands.`,
          `DRY_RUN: Zero database writes executed.`,
        ],
      };
    }

    // Write pre-import JSON snapshot backup alongside pg_dump backup requirement (Rule 9)
    const backupFile = join(
      options.outDir,
      `pre_import_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    await writeFile(backupFile, JSON.stringify(beforeSnapshot), 'utf8');

    const logs: string[] = [`Saved pre-import JSON snapshot to ${backupFile}`];
    if (options.source === 'dims' || manifest.approvedBrands.length === 0) {
      logs.push('No approved candidate records selected for import.');
      return {
        insertedGenerics: 0,
        insertedBrands: 0,
        insertedPacks: 0,
        insertedAltGroups: 0,
        insertedAltLinks: 0,
        updatedRecords: 0,
        skippedRecords,
        backupFile,
        logs,
      };
    }

    const applied = await this.applyVerifiedManifest({
      manifest,
      source: options.source,
      batchSize: options.batchSize,
    });

    return {
      ...applied,
      skippedRecords,
      backupFile,
      logs: [...logs, ...applied.logs],
    };
  }

  /**
   * Executes the approved manifest inside a single atomic PostgreSQL transaction across all batches.
   * On any partial failure in any batch, all generic/brand/pack inserts roll back cleanly and
   * the batch record is marked FAILED. Re-running with the same manifest is strictly idempotent.
   */
  async applyVerifiedManifest(params: {
    manifest: FinalManifestResult;
    source: ReconciliationSourceOption;
    batchSize: number;
  }) {
    const { manifest, source, batchSize } = params;
    const batchRecord = await this.prisma.catalogueImportBatch.create({
      data: {
        sourceName: `CareDose Verified Reconciliation (${source})`,
        sourceBaseUrl: 'https://medex.com.bd',
        schemaVersion: '2.0',
        status: 'IN_PROGRESS',
        notes: `Verified manifest sync: +${manifest.summary.approvedNewGenericsCount} generics, +${manifest.summary.approvedBrandsCount} brands, +${manifest.summary.approvedPacksCount} packs`,
      },
    });

    try {
      const txOutcome = await this.prisma.$transaction(
        async (tx) => {
          const genInputs: Prisma.MedicineGenericCreateManyInput[] =
            manifest.approvedGenerics.map((g) => ({
              sourceId: g.sourceId,
              idSource: g.idSource,
              name: g.name,
              normalizedName: g.normalizedName,
              slug: g.slug || null,
              verification: VerificationStatus.UNVERIFIED,
              importBatchId: batchRecord.id,
            }));

          let insertedGenerics = 0;
          for (let i = 0; i < genInputs.length; i += batchSize) {
            const chunk = genInputs.slice(i, i + batchSize);
            const res = await tx.medicineGeneric.createMany({
              data: chunk,
              skipDuplicates: true,
            });
            insertedGenerics += res.count;
          }

          const allGenericsNow = await tx.medicineGeneric.findMany({
            select: { id: true, sourceId: true },
          });
          const genericIdBySourceId = new Map(allGenericsNow.map((g) => [g.sourceId, g.id]));

          const brandInputs: Prisma.MedicineBrandCreateManyInput[] =
            manifest.approvedBrands.map((b) => {
              const mappedGenericId = genericIdBySourceId.get(b.targetGenericSourceId) ?? null;
              if (!mappedGenericId) {
                throw new Error(
                  `Foreign key guard failed: targetGenericSourceId "${b.targetGenericSourceId}" not found for brand "${b.sourceId}".`,
                );
              }
              return {
                sourceId: b.sourceId,
                name: b.name,
                normalizedName: b.normalizedName,
                genericId: mappedGenericId,
                strength: b.strength,
                strengthNorm: b.strengthNorm,
                dosageForm: b.dosageForm,
                dosageFormNorm: b.dosageFormNorm,
                manufacturer: b.manufacturer,
                manufacturerSourceId: b.manufacturerSourceId,
                category: b.category,
                releaseMarker: b.releaseMarker,
                productUrl: b.productUrl,
                collectedAt: new Date(),
                verification: VerificationStatus.UNVERIFIED,
                genericFieldStatus: FieldStatus.PRESENT,
                strengthFieldStatus: b.strength ? FieldStatus.PRESENT : FieldStatus.MISSING,
                formFieldStatus: FieldStatus.PRESENT,
                mfrFieldStatus: FieldStatus.PRESENT,
                priceFieldStatus: FieldStatus.PRESENT,
                warnings: [],
                importBatchId: batchRecord.id,
              };
            });

          let insertedBrands = 0;
          for (let i = 0; i < brandInputs.length; i += batchSize) {
            const chunk = brandInputs.slice(i, i + batchSize);
            const res = await tx.medicineBrand.createMany({
              data: chunk,
              skipDuplicates: true,
            });
            insertedBrands += res.count;
          }

          const approvedSourceIds = manifest.approvedBrands.map((b) => b.sourceId);
          const brandIdBySourceId = new Map<string, string>();
          for (let i = 0; i < approvedSourceIds.length; i += 2000) {
            const rows = await tx.medicineBrand.findMany({
              where: { sourceId: { in: approvedSourceIds.slice(i, i + 2000) } },
              select: { id: true, sourceId: true },
            });
            for (const r of rows) {
              brandIdBySourceId.set(r.sourceId, r.id);
            }
          }

          const targetBrandIds = Array.from(brandIdBySourceId.values());
          const existingPackKeys = new Set<string>();
          for (let i = 0; i < targetBrandIds.length; i += 2000) {
            const existingPacks = await tx.medicinePack.findMany({
              where: { brandId: { in: targetBrandIds.slice(i, i + 2000) } },
              select: {
                brandId: true,
                packQuantity: true,
                packUnits: true,
                unitPrice: true,
                packPrice: true,
              },
            });
            for (const p of existingPacks) {
              const u = p.unitPrice !== null && p.unitPrice !== undefined ? Number(p.unitPrice).toFixed(2) : '';
              const pp = p.packPrice !== null && p.packPrice !== undefined ? Number(p.packPrice).toFixed(2) : '';
              existingPackKeys.add(`${p.brandId}|${p.packQuantity ?? ''}|${p.packUnits ?? ''}|${u}|${pp}`);
            }
          }

          const packInputs: Prisma.MedicinePackCreateManyInput[] = [];
          for (const pk of manifest.approvedPacks) {
            const brandUuid = brandIdBySourceId.get(pk.brandSourceId);
            if (!brandUuid) {
              throw new Error(
                `Foreign key guard failed: brandSourceId "${pk.brandSourceId}" not found for pack.`,
              );
            }
            const pkKey = `${brandUuid}|${pk.packQuantity ?? ''}|${pk.packUnits ?? ''}|${pk.unitPrice ?? ''}|${pk.packPrice ?? ''}`;
            if (existingPackKeys.has(pkKey)) continue;
            existingPackKeys.add(pkKey);

            packInputs.push({
              brandId: brandUuid,
              packQuantity: pk.packQuantity,
              packUnits: pk.packUnits,
              stripUnits: pk.stripUnits,
              unitPrice: pk.unitPrice !== null ? new Prisma.Decimal(pk.unitPrice) : null,
              packPrice: pk.packPrice !== null ? new Prisma.Decimal(pk.packPrice) : null,
              currency: pk.currency,
              unitPriceLabel: pk.unitPriceLabel,
              priceSource: pk.priceSource,
              sourceUrl: pk.sourceUrl,
              collectedAt: new Date(),
              verification: VerificationStatus.UNVERIFIED,
              warnings: [],
            });
          }

          let insertedPacks = 0;
          for (let i = 0; i < packInputs.length; i += batchSize) {
            const chunk = packInputs.slice(i, i + batchSize);
            const res = await tx.medicinePack.createMany({ data: chunk });
            insertedPacks += res.count;
          }

          await tx.catalogueImportBatch.update({
            where: { id: batchRecord.id },
            data: {
              status: 'COMPLETED',
              genericsCount: insertedGenerics,
              brandsCount: insertedBrands,
              packsCount: insertedPacks,
            },
          });

          return { insertedGenerics, insertedBrands, insertedPacks };
        },
        { maxWait: 15000, timeout: 120000 },
      );

      this.catalogueCache?.invalidateAll();

      return {
        batchId: batchRecord.id,
        insertedGenerics: txOutcome.insertedGenerics,
        insertedBrands: txOutcome.insertedBrands,
        insertedPacks: txOutcome.insertedPacks,
        insertedAltGroups: 0,
        insertedAltLinks: 0,
        updatedRecords: 0,
        logs: [
          `COMPLETED atomic batch ${batchRecord.id}: +${txOutcome.insertedGenerics} generics, +${txOutcome.insertedBrands} brands, +${txOutcome.insertedPacks} packs.`,
        ],
      };
    } catch (error) {
      await this.prisma.catalogueImportBatch.update({
        where: { id: batchRecord.id },
        data: {
          status: 'FAILED',
          notes: error instanceof Error ? error.message.slice(0, 500) : 'Reconciliation failed',
        },
      });
      throw error;
    }
  }

  private buildRollbackProcedureMarkdown(outDir: string): string {
    return [
      '# PostgreSQL Pre-Execution Backup & Rollback Procedure',
      '',
      '## 1. Pre-Execution Full Database Backup (`pg_dump`)',
      '',
      'Before running `--execute`, create and verify a full PostgreSQL dump using `DIRECT_URL` from `backend/.env`:',
      '',
      '```powershell',
      '# Custom-format dump (recommended for pg_restore verification)',
      'pg_dump --format=custom --no-owner --no-acl --file="caredose_pre_sync.dump" "<DIRECT_URL>"',
      'pg_restore --list "caredose_pre_sync.dump" | Select-Object -First 20',
      '',
      '# Or plain SQL dump',
      'pg_dump --no-owner --no-acl --file="caredose_pre_sync.sql" "<DIRECT_URL>"',
      '```',
      '',
      '> Alternatively, create a manual snapshot/backup in the Supabase Dashboard (Database -> Backups) before running `--execute`.',
      '',
      '## 2. Batch-Level Surgical Rollback (By `importBatchId`)',
      '',
      'Every inserted `MedicineBrand` and `MedicineGeneric` is tagged with the `CatalogueImportBatch.id` (`<BATCH_ID>`). `MedicinePack` cascades on brand deletion (`onDelete: Cascade`).',
      '',
      '```sql',
      'BEGIN;',
      '-- 1. Verify no PatientMedication links depend on this batch first:',
      'SELECT COUNT(*) FROM "PatientMedication" pm',
      'JOIN "MedicineBrand" mb ON mb."id" = pm."catalogueBrandId"',
      'WHERE mb."importBatchId" = \'<BATCH_ID>\';',
      '',
      '-- 2. Remove only brands/packs/generics created by this specific batch:',
      'DELETE FROM "MedicineBrand" WHERE "importBatchId" = \'<BATCH_ID>\';',
      'DELETE FROM "MedicineGeneric" WHERE "importBatchId" = \'<BATCH_ID>\';',
      'UPDATE "CatalogueImportBatch" SET "status" = \'ROLLED_BACK\' WHERE "id" = \'<BATCH_ID>\';',
      'COMMIT;',
      '```',
      '',
      '## 3. Full Database Restore (If Needed)',
      '',
      '```powershell',
      'pg_restore --clean --if-exists --no-owner --no-acl --dbname="<DIRECT_URL>" "caredose_pre_sync.dump"',
      '```',
      '',
      `JSON pre-execution snapshot is also preserved at \`${join(outDir, 'pre_execution_snapshot.json')}\`.`,
      '',
    ].join('\n');
  }

  /**
   * Phase 7: Post-sync validation comparing before/after snapshots and checking relational integrity.
   */
  private validatePostSync(
    before: DatabaseAuditSnapshot,
    after: DatabaseAuditSnapshot,
  ): AuditValidationResult {
    const noDeletesOccurred =
      after.counts.brands >= before.counts.brands &&
      after.counts.generics >= before.counts.generics &&
      after.counts.packs >= before.counts.packs;

    const missingNames = after.brands.filter((b) => !normalizeWhitespace(b.name)).length;
    const missingForms = after.brands.filter((b) => !normalizeWhitespace(b.dosageForm)).length;

    const sameMfrDupGroups = Array.from(
      groupByKey(
        after.brands,
        (b) =>
          `${canonicalizeBrandName(b.name)}|${canonicalizeStrengthTokens(b.strengthNorm ?? b.strength)}|${normalizeDosageFormKey(b.dosageFormNorm ?? b.dosageForm)}|${canonicalizeManufacturer(b.manufacturer)}`,
      ).values(),
    ).filter((g) => g.length > 1).length;

    const checks: AuditValidationResult['checks'] = {
      noAccidentalDeletions: {
        ok: noDeletesOccurred,
        value: after.counts.brands - before.counts.brands,
        note: `Net brand delta: ${after.counts.brands - before.counts.brands}`,
      },
      missingBrandNames: {
        ok: missingNames === 0,
        value: missingNames,
        note: 'All brands must have non-empty names',
      },
      missingDosageForms: {
        ok: missingForms === 0,
        value: missingForms,
        note: 'All brands should have dosage forms',
      },
      brandsMissingGeneric: {
        ok: after.brandsMissingGeneric <= before.brandsMissingGeneric,
        value: after.brandsMissingGeneric,
        note: `Brands with null genericId (before=${before.brandsMissingGeneric}, after=${after.brandsMissingGeneric})`,
      },
      sameManufacturerCanonicalDuplicateGroups: {
        ok: true,
        value: sameMfrDupGroups,
        note: 'Informational count of existing+new same-manufacturer canonical duplicate groups',
      },
    };

    const passed = Object.values(checks).every((c) => c.ok);
    return { passed, checks };
  }
}
