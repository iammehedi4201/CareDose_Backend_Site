import { Injectable, Logger } from '@nestjs/common';
import { Prisma, VerificationStatus } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import {
  formatDecimalFixed,
  mapFieldStatus,
  mapVerificationStatus,
  normalizeOptionalText,
  normalizeSearchText,
  parseOptionalDate,
  parsePositiveDecimal,
  RawCatalogueDataset,
  validateCatalogueDataset,
} from './catalogue-dataset.types';

export interface ImportCatalogueOptions {
  batchSize?: number;
  notes?: string;
}

export interface CatalogueImportResult {
  batchId: string;
  status: string;
  sourceName: string;
  schemaVersion: string;
  genericsProcessed: number;
  genericsInserted: number;
  brandsProcessed: number;
  brandsInserted: number;
  packsProcessed: number;
  packsInserted: number;
  imagesProcessed: number;
  imagesInserted: number;
  groupsProcessed: number;
  groupsInserted: number;
  groupLinksInserted: number;
  durationMs: number;
}

const DEFAULT_BATCH_SIZE = 400;

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error('Batch size must be positive.');
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildPackFingerprint(
  brandId: string,
  packQuantity: string | null,
  packUnits: number | null,
  unitPrice: string | null,
  packPrice: string | null,
): string {
  return `${brandId}|${packQuantity ?? ''}|${packUnits ?? ''}|${unitPrice ?? ''}|${packPrice ?? ''}`;
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async importFromFile(
    filePath: string,
    options?: ImportCatalogueOptions,
  ): Promise<CatalogueImportResult> {
    this.logger.log(`Reading catalogue dataset from ${filePath}`);
    const content = await readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(content);
    const dataset = validateCatalogueDataset(parsed);
    return this.importDataset(dataset, options);
  }

  async importDataset(
    dataset: RawCatalogueDataset,
    options?: ImportCatalogueOptions,
  ): Promise<CatalogueImportResult> {
    const validated = validateCatalogueDataset(dataset);
    const startedAt = Date.now();
    const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;

    const sourceName =
      normalizeOptionalText(validated.meta?.source?.name) ?? 'MedEx Bangladesh';
    const sourceBaseUrl = normalizeOptionalText(validated.meta?.source?.base_url);
    const schemaVersion =
      normalizeOptionalText(validated.meta?.schema_version) ?? '2.0';
    const generatedAt = parseOptionalDate(validated.meta?.generated_at);

    const batch = await this.prisma.catalogueImportBatch.create({
      data: {
        sourceName,
        sourceBaseUrl,
        schemaVersion,
        generatedAt,
        status: 'IN_PROGRESS',
        notes: options?.notes ?? normalizeOptionalText(validated.meta?.verification?.note),
      },
    });

    try {
      // 1. Import Generics
      const genericRows: Prisma.MedicineGenericCreateManyInput[] = validated.generics.map((g) => ({
        sourceId: g.generic_id.trim(),
        idSource: normalizeOptionalText(g.id_source) ?? 'site',
        name: g.name.trim(),
        normalizedName: normalizeSearchText(g.name),
        slug: normalizeOptionalText(g.slug),
        sourceUrl: normalizeOptionalText(g.source_url),
        collectedAt: parseOptionalDate(g.collected_at),
        verification: mapVerificationStatus(g.verification),
        importBatchId: batch.id,
      }));

      let genericsInserted = 0;
      for (const chunk of chunkArray(genericRows, batchSize)) {
        const res = await this.prisma.medicineGeneric.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        genericsInserted += res.count;
      }

      const existingGenerics = await this.prisma.medicineGeneric.findMany({
        select: { id: true, sourceId: true },
      });
      const genericIdMap = new Map<string, string>();
      for (const row of existingGenerics) {
        genericIdMap.set(row.sourceId, row.id);
      }

      // 2. Import Brands
      const brandRows: Prisma.MedicineBrandCreateManyInput[] = validated.brands.map((b) => {
        const rawGenericId = normalizeOptionalText(b.generic_id);
        const mappedGenericId = rawGenericId ? (genericIdMap.get(rawGenericId) ?? null) : null;
        const strength = normalizeOptionalText(b.strength);
        const strengthNorm = normalizeOptionalText(b.strength_norm);
        const dosageForm = normalizeOptionalText(b.dosage_form);
        const dosageFormNorm =
          normalizeOptionalText(b.dosage_form_norm) ??
          (dosageForm ? normalizeSearchText(dosageForm) : null);
        const manufacturer = normalizeOptionalText(b.manufacturer);
        const fs = b.field_status;

        return {
          sourceId: b.brand_id.trim(),
          name: b.name.trim(),
          normalizedName: normalizeSearchText(b.name),
          genericId: mappedGenericId,
          strength,
          strengthNorm,
          dosageForm,
          dosageFormNorm,
          manufacturer,
          manufacturerSourceId: normalizeOptionalText(b.manufacturer_id),
          category: normalizeOptionalText(b.category) ?? 'allopathic',
          releaseMarker: normalizeOptionalText(b.release_marker),
          productUrl: normalizeOptionalText(b.product_url),
          collectedAt: parseOptionalDate(b.collected_at),
          verification: mapVerificationStatus(b.verification),
          genericFieldStatus: mapFieldStatus(fs?.generic_id, Boolean(mappedGenericId)),
          strengthFieldStatus: mapFieldStatus(fs?.strength, Boolean(strength)),
          formFieldStatus: mapFieldStatus(fs?.dosage_form, Boolean(dosageForm)),
          mfrFieldStatus: mapFieldStatus(fs?.manufacturer, Boolean(manufacturer)),
          priceFieldStatus: mapFieldStatus(fs?.price, true),
          warnings: Array.isArray(b.warnings) ? b.warnings : [],
          importBatchId: batch.id,
        };
      });

      let brandsInserted = 0;
      for (const chunk of chunkArray(brandRows, batchSize)) {
        const res = await this.prisma.medicineBrand.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        brandsInserted += res.count;
      }

      const existingBrands = await this.prisma.medicineBrand.findMany({
        select: { id: true, sourceId: true },
      });
      const brandIdMap = new Map<string, string>();
      for (const row of existingBrands) {
        brandIdMap.set(row.sourceId, row.id);
      }

      // 3. Import Packs idempotently
      const existingPacks = await this.prisma.medicinePack.findMany({
        select: {
          brandId: true,
          packQuantity: true,
          packUnits: true,
          unitPrice: true,
          packPrice: true,
        },
      });
      const existingPackKeys = new Set<string>();
      for (const p of existingPacks) {
        existingPackKeys.add(
          buildPackFingerprint(
            p.brandId,
            p.packQuantity,
            p.packUnits,
            formatDecimalFixed(p.unitPrice),
            formatDecimalFixed(p.packPrice),
          ),
        );
      }

      const packRowsToInsert: Prisma.MedicinePackCreateManyInput[] = [];
      for (const p of validated.packs) {
        const resolvedBrandId = brandIdMap.get(String(p.brand_id).trim());
        if (!resolvedBrandId) {
          continue;
        }
        const packQuantity = normalizeOptionalText(p.pack_quantity);
        const packUnits =
          typeof p.pack_units === 'number' && Number.isInteger(p.pack_units) && p.pack_units > 0
            ? p.pack_units
            : null;
        const unitPrice = parsePositiveDecimal(p.unit_price);
        const packPrice = parsePositiveDecimal(p.pack_price);

        const fingerprint = buildPackFingerprint(
          resolvedBrandId,
          packQuantity,
          packUnits,
          formatDecimalFixed(unitPrice),
          formatDecimalFixed(packPrice),
        );
        if (existingPackKeys.has(fingerprint)) {
          continue;
        }
        existingPackKeys.add(fingerprint);

        packRowsToInsert.push({
          brandId: resolvedBrandId,
          packQuantity,
          packUnits,
          unitPrice,
          packPrice,
          currency: normalizeOptionalText(p.currency) ?? 'BDT',
          unitPriceLabel: normalizeOptionalText(p.unit_price_label),
          priceSource: normalizeOptionalText(p.price_source) ?? 'brand_page',
          sourceUrl: normalizeOptionalText(p.source_url),
          collectedAt: parseOptionalDate(p.collected_at),
          verification: mapVerificationStatus(p.verification),
          warnings: Array.isArray(p.warnings) ? p.warnings : [],
        });
      }

      let packsInserted = 0;
      for (const chunk of chunkArray(packRowsToInsert, batchSize)) {
        const res = await this.prisma.medicinePack.createMany({
          data: chunk,
        });
        packsInserted += res.count;
      }

      // 4. Import Medicine Packaging Images idempotently
      const existingImages = await this.prisma.medicineImage.findMany({
        select: { brandId: true, imageUrl: true },
      });
      const existingImageKeys = new Set<string>(
        existingImages.map((img) => `${img.brandId}|${img.imageUrl}`),
      );

      const imageRowsToInsert: Prisma.MedicineImageCreateManyInput[] = [];
      let imagesProcessed = 0;
      for (const b of validated.brands) {
        const imageUrl = normalizeOptionalText(b.image_url);
        if (!imageUrl) {
          continue;
        }
        imagesProcessed += 1;
        const resolvedBrandId = brandIdMap.get(b.brand_id.trim());
        if (!resolvedBrandId) {
          continue;
        }
        const key = `${resolvedBrandId}|${imageUrl}`;
        if (existingImageKeys.has(key)) {
          continue;
        }
        existingImageKeys.add(key);

        imageRowsToInsert.push({
          brandId: resolvedBrandId,
          imageUrl,
          sourceName: 'Arogga',
          sourcePageUrl: normalizeOptionalText(b.product_url),
          permissionStatus: 'UNRECORDED',
          matchStatus: VerificationStatus.UNVERIFIED,
        });
      }

      let imagesInserted = 0;
      for (const chunk of chunkArray(imageRowsToInsert, batchSize)) {
        const res = await this.prisma.medicineImage.createMany({
          data: chunk,
        });
        imagesInserted += res.count;
      }

      // 5. Import Alternative Groups & Brand Links
      const altGroupRows: Prisma.AlternativeGroupCreateManyInput[] = [];
      for (const grp of validated.alternative_groups) {
        const resolvedGenericId = genericIdMap.get(grp.generic_id.trim());
        if (!resolvedGenericId) {
          continue;
        }
        altGroupRows.push({
          sourceGroupId: grp.group_id.trim(),
          genericId: resolvedGenericId,
          strengthNorm: normalizeOptionalText(grp.strength_norm) ?? 'unknown',
          dosageFormNorm: normalizeOptionalText(grp.dosage_form_norm) ?? 'unknown',
          releaseMarker: normalizeOptionalText(grp.release_marker),
          isCombination: Boolean(grp.is_combination),
          requiresReviewReasons: Array.isArray(grp.requires_review_reasons)
            ? grp.requires_review_reasons
            : ['unverified_data'],
        });
      }

      let groupsInserted = 0;
      for (const chunk of chunkArray(altGroupRows, batchSize)) {
        const res = await this.prisma.alternativeGroup.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        groupsInserted += res.count;
      }

      const existingGroups = await this.prisma.alternativeGroup.findMany({
        select: { id: true, sourceGroupId: true },
      });
      const groupIdMap = new Map<string, string>();
      for (const grp of existingGroups) {
        groupIdMap.set(grp.sourceGroupId, grp.id);
      }

      const linkRows: Prisma.AlternativeGroupBrandCreateManyInput[] = [];
      for (const grp of validated.alternative_groups) {
        const resolvedGroupId = groupIdMap.get(grp.group_id.trim());
        if (!resolvedGroupId) {
          continue;
        }
        for (const rawBrandId of grp.brand_ids) {
          const resolvedBrandId = brandIdMap.get(String(rawBrandId).trim());
          if (!resolvedBrandId) {
            continue;
          }
          linkRows.push({
            alternativeGroupId: resolvedGroupId,
            brandId: resolvedBrandId,
          });
        }
      }

      let groupLinksInserted = 0;
      for (const chunk of chunkArray(linkRows, batchSize)) {
        const res = await this.prisma.alternativeGroupBrand.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        groupLinksInserted += res.count;
      }

      await this.prisma.catalogueImportBatch.update({
        where: { id: batch.id },
        data: {
          status: 'COMPLETED',
          genericsCount: validated.generics.length,
          brandsCount: validated.brands.length,
          packsCount: validated.packs.length,
          groupsCount: validated.alternative_groups.length,
        },
      });

      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `Catalogue import complete in ${durationMs}ms: +${genericsInserted} generics, +${brandsInserted} brands, +${packsInserted} packs, +${imagesInserted} images, +${groupsInserted} groups (+${groupLinksInserted} links).`,
      );

      return {
        batchId: batch.id,
        status: 'COMPLETED',
        sourceName,
        schemaVersion,
        genericsProcessed: validated.generics.length,
        genericsInserted,
        brandsProcessed: validated.brands.length,
        brandsInserted,
        packsProcessed: validated.packs.length,
        packsInserted,
        imagesProcessed,
        imagesInserted,
        groupsProcessed: validated.alternative_groups.length,
        groupsInserted,
        groupLinksInserted,
        durationMs,
      };
    } catch (error) {
      await this.prisma.catalogueImportBatch.update({
        where: { id: batch.id },
        data: {
          status: 'FAILED',
          notes: error instanceof Error ? error.message.slice(0, 500) : 'Import failed',
        },
      });
      throw error;
    }
  }
}
