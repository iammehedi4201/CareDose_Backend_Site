import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { FieldStatus, Prisma, VerificationStatus } from '@prisma/client';
import { formatDecimalFixed, normalizeSearchText } from '../imports/catalogue-dataset.types';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogueCacheService } from './catalogue-cache';
import {
  ALTERNATIVE_NON_SUBSTITUTION_WARNING,
  CATALOGUE_UNVERIFIED_NOTICE,
  computeBrandSearchRank,
  escapeLikePattern,
  resolveDosageFormFilter,
  resolveDosageFormSqlCondition,
  serializeAlternativeGroupMeta,
  serializeBrandDetail,
  serializeBrandSummary,
  SerializedBrandDetail,
  SerializedBrandSummary,
  SerializedImage,
  SerializedPack,
  UUID_REGEX,
} from './catalogue.serializers';
import {
  GenericBrandsQueryDto,
  SearchAlternativesDto,
  SearchCatalogueDto,
  SearchGenericsDto,
} from './dto/search-catalogue.dto';

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}

const DEFAULT_PAGE_LIMIT = 20;

const BRAND_RELATIONS_INCLUDE = {
  generic: {
    select: {
      id: true,
      sourceId: true,
      name: true,
      slug: true,
    },
  },
  packs: {
    orderBy: [{ packUnits: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  images: {
    orderBy: { checkedAt: 'desc' as const },
  },
} satisfies Prisma.MedicineBrandInclude;

interface RawSqlBrandRow {
  id: string;
  sourceId: string;
  name: string;
  strength: string | null;
  strengthNorm: string | null;
  dosageForm: string | null;
  dosageFormNorm: string | null;
  manufacturer: string | null;
  category: string;
  releaseMarker: string | null;
  verification: VerificationStatus;
  genericFieldStatus: FieldStatus;
  strengthFieldStatus: FieldStatus;
  formFieldStatus: FieldStatus;
  mfrFieldStatus: FieldStatus;
  priceFieldStatus: FieldStatus;
  warnings: string[];
  generic_id: string | null;
  generic_source_id: string | null;
  generic_name: string | null;
  generic_slug: string | null;
  pack_id: string | null;
  pack_quantity: string | null;
  pack_units: number | null;
  pack_strip_units: number | null;
  unit_price: string | null;
  pack_price: string | null;
  pack_currency: string | null;
  unit_price_label: string | null;
  price_source: string | null;
  pack_source_url: string | null;
  pack_collected_at: Date | string | null;
  pack_verification: VerificationStatus | null;
  pack_warnings: string[] | null;
  any_pack_has_warning: boolean;
  image_url: string | null;
  image_source_name: string | null;
  image_permission_status: string | null;
  image_match_status: VerificationStatus | null;
}

interface RawSqlSearchBrandRow extends RawSqlBrandRow {
  total_count: number;
}

interface RawSqlBrandDetailRow {
  id: string;
  sourceId: string;
  name: string;
  strength: string | null;
  strengthNorm: string | null;
  dosageForm: string | null;
  dosageFormNorm: string | null;
  manufacturer: string | null;
  category: string;
  releaseMarker: string | null;
  productUrl: string | null;
  collectedAt: Date | string | null;
  verification: VerificationStatus;
  genericFieldStatus: FieldStatus;
  strengthFieldStatus: FieldStatus;
  formFieldStatus: FieldStatus;
  mfrFieldStatus: FieldStatus;
  priceFieldStatus: FieldStatus;
  warnings: string[];
  generic_id: string | null;
  generic_source_id: string | null;
  generic_name: string | null;
  generic_slug: string | null;
  packs_json: Array<{
    id: string;
    packQuantity: string | null;
    packUnits: number | null;
    stripUnits: number | null;
    unitPrice: string | null;
    packPrice: string | null;
    currency: string;
    unitPriceLabel: string | null;
    priceSource: string;
    sourceUrl: string | null;
    collectedAt: string | null;
    verification: VerificationStatus;
    warnings: string[] | null;
  }>;
  images_json: Array<{
    id: string;
    imageUrl: string;
    sourceName: string;
    sourcePageUrl: string | null;
    permissionStatus: string;
    matchStatus: VerificationStatus;
    checkedAt: string;
  }>;
}

interface RawSqlAlternativeRow extends RawSqlBrandRow {
  group_id: string;
  sourceGroupId: string;
  ag_strength_norm: string;
  ag_dosage_form_norm: string;
  ag_release_marker: string | null;
  isCombination: boolean;
  requiresReviewReasons: string[];
  ag_generic_id: string;
  ag_generic_source_id: string;
  ag_generic_name: string;
  ag_generic_slug: string | null;
  total_brands_in_group: number;
}

function toIsoString(val: Date | string | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  const parsed = new Date(val);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapSqlRowToBrandSummary(row: RawSqlBrandRow): SerializedBrandSummary {
  const packWarnings = Array.isArray(row.pack_warnings) ? row.pack_warnings : [];
  const primaryPack: SerializedPack | null = row.pack_id
    ? {
        id: row.pack_id,
        packQuantity: row.pack_quantity,
        packUnits: row.pack_units,
        stripUnits: row.pack_strip_units ?? null,
        unitPrice: formatDecimalFixed(row.unit_price),
        packPrice: formatDecimalFixed(row.pack_price),
        currency: row.pack_currency ?? 'BDT',
        unitPriceLabel: row.unit_price_label,
        priceSource: row.price_source ?? 'brand_page',
        sourceUrl: row.pack_source_url,
        collectedAt: toIsoString(row.pack_collected_at),
        verification: row.pack_verification ?? VerificationStatus.UNVERIFIED,
        warnings: packWarnings,
        hasPriceWarning: packWarnings.length > 0,
      }
    : null;

  return {
    id: row.id,
    sourceId: row.sourceId,
    name: row.name,
    strength: row.strength,
    strengthNorm: row.strengthNorm,
    dosageForm: row.dosageForm,
    dosageFormNorm: row.dosageFormNorm,
    manufacturer: row.manufacturer,
    category: row.category,
    releaseMarker: row.releaseMarker,
    verification: row.verification,
    fieldStatus: {
      generic: row.genericFieldStatus,
      strength: row.strengthFieldStatus,
      dosageForm: row.formFieldStatus,
      manufacturer: row.mfrFieldStatus,
      price: row.priceFieldStatus,
    },
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
    hasPriceWarning:
      row.priceFieldStatus === FieldStatus.INVALID || Boolean(row.any_pack_has_warning),
    generic: row.generic_id
      ? {
          id: row.generic_id,
          sourceId: row.generic_source_id ?? '',
          name: row.generic_name ?? '',
          slug: row.generic_slug,
        }
      : null,
    primaryPack,
    primaryImageUrl: row.image_url,
    primaryImageStatus: row.image_url
      ? {
          sourceName: row.image_source_name ?? 'Arogga',
          permissionStatus: row.image_permission_status ?? 'UNRECORDED',
          matchStatus: row.image_match_status ?? VerificationStatus.UNVERIFIED,
        }
      : null,
  };
}

@Injectable()
export class CatalogueService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogueService.name);
  private readonly cache: CatalogueCacheService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() injectedCache?: CatalogueCacheService,
  ) {
    this.cache = injectedCache ?? new CatalogueCacheService();
  }

  onApplicationBootstrap(): void {
    if (
      typeof this.prisma.$queryRaw !== 'function' ||
      !process.env.DATABASE_URL?.trim() ||
      process.env.SKIP_DB_CONNECT_ON_INIT === 'true'
    ) {
      return;
    }

    // Fire-and-forget prewarm of hot Explore views so initial screen load is instant
    void Promise.allSettled([
      this.getSummary(),
      this.searchBrands({ limit: 15 }),
      this.searchBrands({ limit: 20 }),
    ]).catch((err) => {
      this.logger.debug(
        `Catalogue prewarm skipped: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    });
  }

  async getSummary() {
    const cacheKey = 'catalogue:summary';
    const cached = this.cache.get<Awaited<ReturnType<CatalogueService['computeSummary']>>>(
      cacheKey,
    );
    if (cached) {
      return cached;
    }
    const result = await this.computeSummary();
    return this.cache.set(cacheKey, result);
  }

  private async computeSummary() {
    if (typeof this.prisma.$queryRaw === 'function') {
      const rows = await this.prisma.$queryRaw<
        Array<{
          generics: number;
          brands: number;
          packs: number;
          alternativeGroups: number;
          brandsWithImages: number;
          manufacturers: number;
          sourceName: string | null;
          schemaVersion: string | null;
          generatedAt: Date | null;
          importedAt: Date | null;
        }>
      >(Prisma.sql`
        SELECT
          (SELECT COUNT(*)::int FROM "MedicineGeneric") AS generics,
          (SELECT COUNT(*)::int FROM "MedicineBrand") AS brands,
          (SELECT COUNT(*)::int FROM "MedicinePack") AS packs,
          (SELECT COUNT(*)::int FROM "AlternativeGroup") AS "alternativeGroups",
          (SELECT COUNT(*)::int FROM "MedicineImage") AS "brandsWithImages",
          (SELECT COUNT(DISTINCT manufacturer)::int FROM "MedicineBrand" WHERE manufacturer IS NOT NULL) AS manufacturers,
          b."sourceName",
          b."schemaVersion",
          b."generatedAt",
          b."importedAt"
        FROM (SELECT 1) dummy
        LEFT JOIN LATERAL (
          SELECT "sourceName", "schemaVersion", "generatedAt", "importedAt"
          FROM "CatalogueImportBatch"
          WHERE status = 'COMPLETED'
          ORDER BY "importedAt" DESC
          LIMIT 1
        ) b ON TRUE
      `);

      const row = rows[0];
      return {
        sourceName: row?.sourceName ?? 'MedEx Bangladesh',
        schemaVersion: row?.schemaVersion ?? '2.0',
        generatedAt: row?.generatedAt ? row.generatedAt.toISOString() : null,
        importedAt: row?.importedAt ? row.importedAt.toISOString() : null,
        verificationNotice: CATALOGUE_UNVERIFIED_NOTICE,
        counts: {
          generics: row?.generics ?? 0,
          brands: row?.brands ?? 0,
          packs: row?.packs ?? 0,
          alternativeGroups: row?.alternativeGroups ?? 0,
          manufacturers: row?.manufacturers ?? 0,
          brandsWithImages: row?.brandsWithImages ?? 0,
        },
      };
    }

    const [
      latestBatch,
      generics,
      brands,
      packs,
      alternativeGroups,
      brandsWithImages,
      manufacturers,
    ] = await Promise.all([
      this.prisma.catalogueImportBatch.findFirst({
        where: { status: 'COMPLETED' },
        orderBy: { importedAt: 'desc' },
      }),
      this.prisma.medicineGeneric.count(),
      this.prisma.medicineBrand.count(),
      this.prisma.medicinePack.count(),
      this.prisma.alternativeGroup.count(),
      this.prisma.medicineImage.count(),
      this.prisma.medicineBrand.findMany({
        where: { manufacturer: { not: null } },
        distinct: ['manufacturer'],
        select: { manufacturer: true },
      }),
    ]);

    return {
      sourceName: latestBatch?.sourceName ?? 'MedEx Bangladesh',
      schemaVersion: latestBatch?.schemaVersion ?? '2.0',
      generatedAt: latestBatch?.generatedAt ? latestBatch.generatedAt.toISOString() : null,
      importedAt: latestBatch?.importedAt ? latestBatch.importedAt.toISOString() : null,
      verificationNotice: CATALOGUE_UNVERIFIED_NOTICE,
      counts: {
        generics,
        brands,
        packs,
        alternativeGroups,
        manufacturers: manufacturers.length,
        brandsWithImages,
      },
    };
  }

  async searchBrands(
    dto: SearchCatalogueDto,
  ): Promise<PaginatedResult<SerializedBrandSummary>> {
    const limit = dto.limit ?? DEFAULT_PAGE_LIMIT;
    const queryText = dto.q ? normalizeSearchText(dto.q) : '';
    const cacheKey = `catalogue:search:${JSON.stringify({
      q: queryText,
      form: dto.form?.trim().toLowerCase() ?? '',
      mfr: dto.manufacturer?.trim().toLowerCase() ?? '',
      gen: dto.genericId?.trim() ?? '',
      cursor: dto.cursor ?? '',
      limit,
    })}`;

    const cached = this.cache.get<PaginatedResult<SerializedBrandSummary>>(cacheKey);
    if (cached) {
      return cached;
    }

    const result =
      typeof this.prisma.$queryRaw === 'function'
        ? await this.searchBrandsSingleSql(dto, queryText, limit)
        : await this.searchBrandsPrismaFallback(dto, queryText, limit);

    return this.cache.set(cacheKey, result);
  }

  private async searchBrandsSingleSql(
    dto: SearchCatalogueDto,
    queryText: string,
    limit: number,
  ): Promise<PaginatedResult<SerializedBrandSummary>> {
    const hasQuery = queryText.length > 0;
    const escaped = hasQuery ? escapeLikePattern(queryText) : '';
    const prefixPattern = `${escaped}%`;
    const containsPattern = `%${escaped}%`;

    const whereClauses: Prisma.Sql[] = [];
    if (hasQuery) {
      whereClauses.push(Prisma.sql`(
        b."normalizedName" LIKE ${containsPattern}
        OR COALESCE(b.strength, '') ILIKE ${containsPattern}
        OR COALESCE(b.manufacturer, '') ILIKE ${containsPattern}
        OR COALESCE(g."normalizedName", '') LIKE ${containsPattern}
      )`);
    }

    const formSql = resolveDosageFormSqlCondition(dto.form);
    if (formSql) {
      whereClauses.push(formSql);
    }

    const mfrText = dto.manufacturer?.trim();
    if (mfrText && mfrText.length > 0) {
      const mfrPattern = `%${escapeLikePattern(mfrText)}%`;
      whereClauses.push(Prisma.sql`COALESCE(b.manufacturer, '') ILIKE ${mfrPattern}`);
    }

    const genericRef = dto.genericId?.trim();
    if (genericRef && genericRef.length > 0) {
      if (UUID_REGEX.test(genericRef)) {
        whereClauses.push(Prisma.sql`b."genericId" = ${genericRef}`);
      } else {
        whereClauses.push(Prisma.sql`g."sourceId" = ${genericRef}`);
      }
    }

    const combinedWhere =
      whereClauses.length > 0 ? Prisma.join(whereClauses, ' AND ') : Prisma.sql`TRUE`;

    const rankExpr = hasQuery
      ? Prisma.sql`CASE
          WHEN b."normalizedName" = ${queryText} THEN 0
          WHEN b."normalizedName" LIKE ${prefixPattern} THEN 1
          WHEN b."normalizedName" LIKE ${containsPattern} THEN 2
          ELSE 3
        END`
      : Prisma.sql`0`;

    let cursorClause = Prisma.sql`TRUE`;
    if (dto.cursor) {
      const cursorBrand = await this.prisma.medicineBrand.findUnique({
        where: { id: dto.cursor },
        select: { id: true, normalizedName: true },
      });
      if (cursorBrand) {
        const cursorRank = hasQuery
          ? computeBrandSearchRank(cursorBrand.normalizedName, queryText)
          : 0;
        cursorClause = Prisma.sql`(
          r.match_rank > ${cursorRank}
          OR (r.match_rank = ${cursorRank} AND r."normalizedName" > ${cursorBrand.normalizedName})
          OR (r.match_rank = ${cursorRank} AND r."normalizedName" = ${cursorBrand.normalizedName} AND r.id > ${cursorBrand.id})
        )`;
      }
    }

    const takeCount = limit + 1;
    const rows = await this.prisma.$queryRaw<RawSqlSearchBrandRow[]>(Prisma.sql`
      WITH ranked AS (
        SELECT
          b.id,
          b."sourceId",
          b.name,
          b."normalizedName",
          b."genericId",
          b.strength,
          b."strengthNorm",
          b."dosageForm",
          b."dosageFormNorm",
          b.manufacturer,
          b.category,
          b."releaseMarker",
          b.verification,
          b."genericFieldStatus",
          b."strengthFieldStatus",
          b."formFieldStatus",
          b."mfrFieldStatus",
          b."priceFieldStatus",
          b.warnings,
          g.id AS generic_id,
          g."sourceId" AS generic_source_id,
          g.name AS generic_name,
          g.slug AS generic_slug,
          ${rankExpr} AS match_rank
        FROM "MedicineBrand" b
        LEFT JOIN "MedicineGeneric" g ON g.id = b."genericId"
        WHERE ${combinedWhere}
      ),
      counted AS (
        SELECT COUNT(*)::int AS total_count FROM ranked
      ),
      page AS (
        SELECT r.*, c.total_count
        FROM ranked r
        CROSS JOIN counted c
        WHERE ${cursorClause}
        ORDER BY r.match_rank ASC, r."normalizedName" ASC, r.id ASC
        LIMIT ${takeCount}
      )
      SELECT
        p.*,
        pk.id AS pack_id,
        pk."packQuantity" AS pack_quantity,
        pk."packUnits" AS pack_units,
        pk."stripUnits" AS pack_strip_units,
        pk."unitPrice"::text AS unit_price,
        pk."packPrice"::text AS pack_price,
        pk.currency AS pack_currency,
        pk."unitPriceLabel" AS unit_price_label,
        pk."priceSource" AS price_source,
        pk."sourceUrl" AS pack_source_url,
        pk."collectedAt" AS pack_collected_at,
        pk.verification AS pack_verification,
        pk.warnings AS pack_warnings,
        EXISTS (
          SELECT 1 FROM "MedicinePack" px
          WHERE px."brandId" = p.id AND COALESCE(array_length(px.warnings, 1), 0) > 0
        ) AS any_pack_has_warning,
        img."imageUrl" AS image_url,
        img."sourceName" AS image_source_name,
        img."permissionStatus" AS image_permission_status,
        img."matchStatus" AS image_match_status
      FROM page p
      LEFT JOIN LATERAL (
        SELECT *
        FROM "MedicinePack" mp
        WHERE mp."brandId" = p.id
        ORDER BY mp."packUnits" ASC NULLS LAST, mp."createdAt" ASC
        LIMIT 1
      ) pk ON TRUE
      LEFT JOIN LATERAL (
        SELECT *
        FROM "MedicineImage" mi
        WHERE mi."brandId" = p.id
        ORDER BY mi."checkedAt" DESC
        LIMIT 1
      ) img ON TRUE
      ORDER BY p.match_rank ASC, p."normalizedName" ASC, p.id ASC
    `);

    const totalCount = rows[0]?.total_count ?? 0;
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map(mapSqlRowToBrandSummary);
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    return {
      items,
      totalCount,
      limit,
      hasMore,
      nextCursor,
    };
  }

  private async searchBrandsPrismaFallback(
    dto: SearchCatalogueDto,
    queryText: string,
    limit: number,
  ): Promise<PaginatedResult<SerializedBrandSummary>> {
    const conditions: Prisma.MedicineBrandWhereInput[] = [];

    if (queryText.length > 0) {
      conditions.push({
        OR: [
          { normalizedName: { contains: queryText, mode: 'insensitive' } },
          { strength: { contains: queryText, mode: 'insensitive' } },
          { manufacturer: { contains: queryText, mode: 'insensitive' } },
          { generic: { normalizedName: { contains: queryText, mode: 'insensitive' } } },
        ],
      });
    }

    const formCondition = resolveDosageFormFilter(dto.form);
    if (formCondition) {
      conditions.push(formCondition);
    }

    const mfrText = dto.manufacturer?.trim();
    if (mfrText && mfrText.length > 0) {
      conditions.push({
        manufacturer: { contains: mfrText, mode: 'insensitive' },
      });
    }

    const genericRef = dto.genericId?.trim();
    if (genericRef && genericRef.length > 0) {
      if (UUID_REGEX.test(genericRef)) {
        conditions.push({ genericId: genericRef });
      } else {
        conditions.push({ generic: { sourceId: genericRef } });
      }
    }

    const where: Prisma.MedicineBrandWhereInput =
      conditions.length > 0 ? { AND: conditions } : {};

    if (queryText.length > 0) {
      const allMatched = await this.prisma.medicineBrand.findMany({
        where,
        include: BRAND_RELATIONS_INCLUDE,
        orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
      });
      const ranked = allMatched.sort((a, b) => {
        const ra = computeBrandSearchRank(a.normalizedName, queryText);
        const rb = computeBrandSearchRank(b.normalizedName, queryText);
        if (ra !== rb) return ra - rb;
        return a.normalizedName.localeCompare(b.normalizedName) || a.id.localeCompare(b.id);
      });
      let startIdx = 0;
      if (dto.cursor) {
        const idx = ranked.findIndex((b) => b.id === dto.cursor);
        startIdx = idx >= 0 ? idx + 1 : 0;
      }
      const pageRows = ranked.slice(startIdx, startIdx + limit);
      const hasMore = startIdx + limit < ranked.length;
      const nextCursor = hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null;
      return {
        items: pageRows.map(serializeBrandSummary),
        totalCount: ranked.length,
        limit,
        hasMore,
        nextCursor,
      };
    }

    const [rows, totalCount] = await Promise.all([
      this.prisma.medicineBrand.findMany({
        where,
        include: BRAND_RELATIONS_INCLUDE,
        orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
        take: limit + 1,
        ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      }),
      this.prisma.medicineBrand.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null;

    return {
      items: pageRows.map(serializeBrandSummary),
      totalCount,
      limit,
      hasMore,
      nextCursor,
    };
  }

  async getBrandById(brandIdOrSourceId: string): Promise<SerializedBrandDetail> {
    const clean = brandIdOrSourceId.trim();
    const cacheKey = `catalogue:brand:${clean}`;
    const cached = this.cache.get<SerializedBrandDetail>(cacheKey);
    if (cached) {
      return cached;
    }

    if (typeof this.prisma.$queryRaw === 'function') {
      const lookupClause = UUID_REGEX.test(clean)
        ? Prisma.sql`b.id = ${clean}`
        : Prisma.sql`b."sourceId" = ${clean}`;

      const rows = await this.prisma.$queryRaw<RawSqlBrandDetailRow[]>(Prisma.sql`
        SELECT
          b.id,
          b."sourceId",
          b.name,
          b.strength,
          b."strengthNorm",
          b."dosageForm",
          b."dosageFormNorm",
          b.manufacturer,
          b.category,
          b."releaseMarker",
          b."productUrl",
          b."collectedAt",
          b.verification,
          b."genericFieldStatus",
          b."strengthFieldStatus",
          b."formFieldStatus",
          b."mfrFieldStatus",
          b."priceFieldStatus",
          b.warnings,
          g.id AS generic_id,
          g."sourceId" AS generic_source_id,
          g.name AS generic_name,
          g.slug AS generic_slug,
          COALESCE((
            SELECT json_agg(p_row)
            FROM (
              SELECT
                mp.id,
                mp."packQuantity",
                mp."packUnits",
                mp."stripUnits",
                mp."unitPrice"::text AS "unitPrice",
                mp."packPrice"::text AS "packPrice",
                mp.currency,
                mp."unitPriceLabel",
                mp."priceSource",
                mp."sourceUrl",
                mp."collectedAt",
                mp.verification,
                mp.warnings
              FROM "MedicinePack" mp
              WHERE mp."brandId" = b.id
              ORDER BY mp."packUnits" ASC NULLS LAST, mp."createdAt" ASC
            ) p_row
          ), '[]'::json) AS packs_json,
          COALESCE((
            SELECT json_agg(i_row)
            FROM (
              SELECT
                mi.id,
                mi."imageUrl",
                mi."sourceName",
                mi."sourcePageUrl",
                mi."permissionStatus",
                mi."matchStatus",
                mi."checkedAt"
              FROM "MedicineImage" mi
              WHERE mi."brandId" = b.id
              ORDER BY mi."checkedAt" DESC
            ) i_row
          ), '[]'::json) AS images_json
        FROM "MedicineBrand" b
        LEFT JOIN "MedicineGeneric" g ON g.id = b."genericId"
        WHERE ${lookupClause}
        LIMIT 1
      `);

      const row = rows[0];
      if (!row) {
        throw new NotFoundException(`Catalogue brand "${clean}" not found`);
      }

      const packs: SerializedPack[] = (Array.isArray(row.packs_json) ? row.packs_json : []).map(
        (p) => {
          const warnings = Array.isArray(p.warnings) ? p.warnings : [];
          return {
            id: p.id,
            packQuantity: p.packQuantity,
            packUnits: p.packUnits,
            stripUnits: p.stripUnits ?? null,
            unitPrice: formatDecimalFixed(p.unitPrice),
            packPrice: formatDecimalFixed(p.packPrice),
            currency: p.currency ?? 'BDT',
            unitPriceLabel: p.unitPriceLabel,
            priceSource: p.priceSource ?? 'brand_page',
            sourceUrl: p.sourceUrl,
            collectedAt: toIsoString(p.collectedAt),
            verification: p.verification ?? VerificationStatus.UNVERIFIED,
            warnings,
            hasPriceWarning: warnings.length > 0,
          };
        },
      );

      const images: SerializedImage[] = (Array.isArray(row.images_json) ? row.images_json : []).map(
        (img) => ({
          id: img.id,
          imageUrl: img.imageUrl,
          sourceName: img.sourceName,
          sourcePageUrl: img.sourcePageUrl,
          permissionStatus: img.permissionStatus,
          matchStatus: img.matchStatus,
          checkedAt: toIsoString(img.checkedAt) ?? new Date().toISOString(),
        }),
      );

      const primaryPack = packs[0] ?? null;
      const primaryImage = images[0] ?? null;
      const detail: SerializedBrandDetail = {
        id: row.id,
        sourceId: row.sourceId,
        name: row.name,
        strength: row.strength,
        strengthNorm: row.strengthNorm,
        dosageForm: row.dosageForm,
        dosageFormNorm: row.dosageFormNorm,
        manufacturer: row.manufacturer,
        category: row.category,
        releaseMarker: row.releaseMarker,
        verification: row.verification,
        fieldStatus: {
          generic: row.genericFieldStatus,
          strength: row.strengthFieldStatus,
          dosageForm: row.formFieldStatus,
          manufacturer: row.mfrFieldStatus,
          price: row.priceFieldStatus,
        },
        warnings: Array.isArray(row.warnings) ? row.warnings : [],
        hasPriceWarning:
          row.priceFieldStatus === FieldStatus.INVALID ||
          packs.some((p) => p.hasPriceWarning),
        generic: row.generic_id
          ? {
              id: row.generic_id,
              sourceId: row.generic_source_id ?? '',
              name: row.generic_name ?? '',
              slug: row.generic_slug,
            }
          : null,
        primaryPack,
        primaryImageUrl: primaryImage ? primaryImage.imageUrl : null,
        primaryImageStatus: primaryImage
          ? {
              sourceName: primaryImage.sourceName,
              permissionStatus: primaryImage.permissionStatus,
              matchStatus: primaryImage.matchStatus,
            }
          : null,
        productUrl: row.productUrl,
        collectedAt: toIsoString(row.collectedAt),
        packs,
        images,
        safetyNotice: CATALOGUE_UNVERIFIED_NOTICE,
      };

      return this.cache.set(cacheKey, detail);
    }

    const brand = await this.findBrandEntityOrThrow(clean);
    return this.cache.set(cacheKey, serializeBrandDetail(brand));
  }

  private async findBrandEntityOrThrow(brandIdOrSourceId: string) {
    const clean = brandIdOrSourceId.trim();
    const where: Prisma.MedicineBrandWhereUniqueInput = UUID_REGEX.test(clean)
      ? { id: clean }
      : { sourceId: clean };

    const brand = await this.prisma.medicineBrand.findUnique({
      where,
      include: BRAND_RELATIONS_INCLUDE,
    });
    if (!brand) {
      throw new NotFoundException(`Catalogue brand "${clean}" not found`);
    }
    return brand;
  }

  async searchGenerics(dto: SearchGenericsDto) {
    const limit = dto.limit ?? DEFAULT_PAGE_LIMIT;
    const queryText = dto.q ? normalizeSearchText(dto.q) : '';
    const cacheKey = `catalogue:generics:${queryText}:${dto.cursor ?? ''}:${limit}`;
    const cached = this.cache.get<Awaited<ReturnType<CatalogueService['computeSearchGenerics']>>>(
      cacheKey,
    );
    if (cached) return cached;

    const result = await this.computeSearchGenerics(queryText, dto.cursor, limit);
    return this.cache.set(cacheKey, result);
  }

  private async computeSearchGenerics(
    queryText: string,
    cursor: string | undefined,
    limit: number,
  ) {
    const where: Prisma.MedicineGenericWhereInput =
      queryText.length > 0
        ? { normalizedName: { contains: queryText, mode: 'insensitive' } }
        : {};

    const [rows, totalCount] = await Promise.all([
      this.prisma.medicineGeneric.findMany({
        where,
        include: {
          _count: {
            select: { brands: true },
          },
        },
        orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      this.prisma.medicineGeneric.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null;

    return {
      items: pageRows.map((g) => ({
        id: g.id,
        sourceId: g.sourceId,
        name: g.name,
        slug: g.slug,
        verification: g.verification,
        brandsCount: g._count.brands,
      })),
      totalCount,
      limit,
      hasMore,
      nextCursor,
    };
  }

  async getGenericById(genericIdOrSourceId: string, query: GenericBrandsQueryDto) {
    const clean = genericIdOrSourceId.trim();
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const cacheKey = `catalogue:generic:${clean}:${query.cursor ?? ''}:${limit}`;
    const cached = this.cache.get<Awaited<ReturnType<CatalogueService['computeGenericById']>>>(
      cacheKey,
    );
    if (cached) return cached;

    const result = await this.computeGenericById(clean, query, limit);
    return this.cache.set(cacheKey, result);
  }

  private async computeGenericById(
    clean: string,
    query: GenericBrandsQueryDto,
    limit: number,
  ) {
    let generic = null;
    if (UUID_REGEX.test(clean)) {
      generic = await this.prisma.medicineGeneric.findUnique({ where: { id: clean } });
    } else {
      generic =
        (await this.prisma.medicineGeneric.findUnique({ where: { sourceId: clean } })) ??
        (await this.prisma.medicineGeneric.findFirst({ where: { slug: clean } }));
    }

    if (!generic) {
      throw new NotFoundException(`Catalogue generic "${clean}" not found`);
    }

    const [brandRows, totalCount] = await Promise.all([
      this.prisma.medicineBrand.findMany({
        where: { genericId: generic.id },
        include: BRAND_RELATIONS_INCLUDE,
        orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.prisma.medicineBrand.count({ where: { genericId: generic.id } }),
    ]);

    const hasMore = brandRows.length > limit;
    const pageRows = hasMore ? brandRows.slice(0, limit) : brandRows;
    const nextCursor = hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null;

    return {
      generic: {
        id: generic.id,
        sourceId: generic.sourceId,
        name: generic.name,
        slug: generic.slug,
        sourceUrl: generic.sourceUrl,
        collectedAt: generic.collectedAt ? generic.collectedAt.toISOString() : null,
        verification: generic.verification,
      },
      brands: {
        items: pageRows.map(serializeBrandSummary),
        totalCount,
        limit,
        hasMore,
        nextCursor,
      },
      warningNotice: ALTERNATIVE_NON_SUBSTITUTION_WARNING,
    };
  }

  async getBrandAlternatives(brandIdOrSourceId: string) {
    const clean = brandIdOrSourceId.trim();
    const cacheKey = `catalogue:brand-alts:${clean}`;
    const cached = this.cache.get<Awaited<ReturnType<CatalogueService['computeBrandAlternatives']>>>(
      cacheKey,
    );
    if (cached) return cached;

    const result = await this.computeBrandAlternatives(clean);
    return this.cache.set(cacheKey, result);
  }

  private async computeBrandAlternatives(clean: string) {
    if (typeof this.prisma.$queryRaw === 'function') {
      const targetDetail = await this.getBrandById(clean);

      const rows = await this.prisma.$queryRaw<RawSqlAlternativeRow[]>(Prisma.sql`
        SELECT
          ag.id AS group_id,
          ag."sourceGroupId",
          ag."strengthNorm" AS ag_strength_norm,
          ag."dosageFormNorm" AS ag_dosage_form_norm,
          ag."releaseMarker" AS ag_release_marker,
          ag."isCombination",
          ag."requiresReviewReasons",
          agg.id AS ag_generic_id,
          agg."sourceId" AS ag_generic_source_id,
          agg.name AS ag_generic_name,
          agg.slug AS ag_generic_slug,
          (
            SELECT COUNT(*)::int
            FROM "AlternativeGroupBrand" ab_cnt
            WHERE ab_cnt."alternativeGroupId" = ag.id
          ) AS total_brands_in_group,
          b.id,
          b."sourceId",
          b.name,
          b.strength,
          b."strengthNorm",
          b."dosageForm",
          b."dosageFormNorm",
          b.manufacturer,
          b.category,
          b."releaseMarker",
          b.verification,
          b."genericFieldStatus",
          b."strengthFieldStatus",
          b."formFieldStatus",
          b."mfrFieldStatus",
          b."priceFieldStatus",
          b.warnings,
          bg.id AS generic_id,
          bg."sourceId" AS generic_source_id,
          bg.name AS generic_name,
          bg.slug AS generic_slug,
          pk.id AS pack_id,
          pk."packQuantity" AS pack_quantity,
          pk."packUnits" AS pack_units,
          pk."stripUnits" AS pack_strip_units,
          pk."unitPrice"::text AS unit_price,
          pk."packPrice"::text AS pack_price,
          pk.currency AS pack_currency,
          pk."unitPriceLabel" AS unit_price_label,
          pk."priceSource" AS price_source,
          pk."sourceUrl" AS pack_source_url,
          pk."collectedAt" AS pack_collected_at,
          pk.verification AS pack_verification,
          pk.warnings AS pack_warnings,
          EXISTS (
            SELECT 1 FROM "MedicinePack" px
            WHERE px."brandId" = b.id AND COALESCE(array_length(px.warnings, 1), 0) > 0
          ) AS any_pack_has_warning,
          img."imageUrl" AS image_url,
          img."sourceName" AS image_source_name,
          img."permissionStatus" AS image_permission_status,
          img."matchStatus" AS image_match_status
        FROM "AlternativeGroupBrand" self_link
        INNER JOIN "AlternativeGroup" ag ON ag.id = self_link."alternativeGroupId"
        INNER JOIN "MedicineGeneric" agg ON agg.id = ag."genericId"
        LEFT JOIN "AlternativeGroupBrand" cand_link
          ON cand_link."alternativeGroupId" = ag.id AND cand_link."brandId" <> self_link."brandId"
        LEFT JOIN "MedicineBrand" b ON b.id = cand_link."brandId"
        LEFT JOIN "MedicineGeneric" bg ON bg.id = b."genericId"
        LEFT JOIN LATERAL (
          SELECT * FROM "MedicinePack" mp
          WHERE mp."brandId" = b.id
          ORDER BY mp."packUnits" ASC NULLS LAST, mp."createdAt" ASC
          LIMIT 1
        ) pk ON b.id IS NOT NULL
        LEFT JOIN LATERAL (
          SELECT * FROM "MedicineImage" mi
          WHERE mi."brandId" = b.id
          ORDER BY mi."checkedAt" DESC
          LIMIT 1
        ) img ON b.id IS NOT NULL
        WHERE self_link."brandId" = ${targetDetail.id}
        ORDER BY ag.id ASC, b."normalizedName" ASC
      `);

      const groupMap = new Map<
        string,
        {
          id: string;
          sourceGroupId: string;
          strengthNorm: string;
          dosageFormNorm: string;
          releaseMarker: string | null;
          isCombination: boolean;
          requiresReviewReasons: string[];
          generic: { id: string; sourceId: string; name: string; slug: string | null };
          totalBrandsInGroup: number;
          candidateBrands: SerializedBrandSummary[];
        }
      >();

      for (const row of rows) {
        let entry = groupMap.get(row.group_id);
        if (!entry) {
          entry = {
            id: row.group_id,
            sourceGroupId: row.sourceGroupId,
            strengthNorm: row.ag_strength_norm,
            dosageFormNorm: row.ag_dosage_form_norm,
            releaseMarker: row.ag_release_marker,
            isCombination: row.isCombination,
            requiresReviewReasons: Array.isArray(row.requiresReviewReasons)
              ? row.requiresReviewReasons
              : [],
            generic: {
              id: row.ag_generic_id,
              sourceId: row.ag_generic_source_id,
              name: row.ag_generic_name,
              slug: row.ag_generic_slug,
            },
            totalBrandsInGroup: row.total_brands_in_group,
            candidateBrands: [],
          };
          groupMap.set(row.group_id, entry);
        }

        if (row.id) {
          entry.candidateBrands.push(mapSqlRowToBrandSummary(row));
        }
      }

      return {
        brand: targetDetail,
        groups: [...groupMap.values()],
        warningNotice: ALTERNATIVE_NON_SUBSTITUTION_WARNING,
      };
    }

    const targetBrand = await this.findBrandEntityOrThrow(clean);

    const groupLinks = await this.prisma.alternativeGroupBrand.findMany({
      where: { brandId: targetBrand.id },
      include: {
        alternativeGroup: {
          include: {
            generic: {
              select: { id: true, sourceId: true, name: true, slug: true },
            },
            brands: {
              include: {
                brand: {
                  include: BRAND_RELATIONS_INCLUDE,
                },
              },
            },
          },
        },
      },
    });

    const groups = groupLinks.map((link) => {
      const grp = link.alternativeGroup;
      const candidateBrands = grp.brands
        .map((member) => member.brand)
        .filter((b) => b.id !== targetBrand.id)
        .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName))
        .map(serializeBrandSummary);

      return {
        ...serializeAlternativeGroupMeta(grp),
        totalBrandsInGroup: grp.brands.length,
        candidateBrands,
      };
    });

    return {
      brand: serializeBrandSummary(targetBrand),
      groups,
      warningNotice: ALTERNATIVE_NON_SUBSTITUTION_WARNING,
    };
  }

  async searchAlternativeGroups(dto: SearchAlternativesDto) {
    const limit = dto.limit ?? DEFAULT_PAGE_LIMIT;
    const queryText = dto.q ? normalizeSearchText(dto.q) : '';
    const cacheKey = `catalogue:alt-groups:${queryText}:${dto.cursor ?? ''}:${limit}`;
    const cached = this.cache.get<Awaited<ReturnType<CatalogueService['computeAltGroups']>>>(
      cacheKey,
    );
    if (cached) return cached;

    const result = await this.computeAltGroups(queryText, dto.cursor, limit);
    return this.cache.set(cacheKey, result);
  }

  private async computeAltGroups(
    queryText: string,
    cursor: string | undefined,
    limit: number,
  ) {
    const where: Prisma.AlternativeGroupWhereInput =
      queryText.length > 0
        ? {
            OR: [
              { generic: { normalizedName: { contains: queryText, mode: 'insensitive' } } },
              {
                brands: {
                  some: {
                    brand: {
                      OR: [
                        { normalizedName: { contains: queryText, mode: 'insensitive' } },
                        { manufacturer: { contains: queryText, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {};

    const [rows, totalCount] = await Promise.all([
      this.prisma.alternativeGroup.findMany({
        where,
        include: {
          generic: {
            select: { id: true, sourceId: true, name: true, slug: true },
          },
          brands: {
            include: {
              brand: {
                include: BRAND_RELATIONS_INCLUDE,
              },
            },
          },
        },
        orderBy: [{ generic: { normalizedName: 'asc' } }, { id: 'asc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      this.prisma.alternativeGroup.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null;

    return {
      items: pageRows.map((grp) => ({
        ...serializeAlternativeGroupMeta(grp),
        brands: grp.brands
          .map((m) => m.brand)
          .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName))
          .map(serializeBrandSummary),
      })),
      totalCount,
      limit,
      hasMore,
      nextCursor,
      warningNotice: ALTERNATIVE_NON_SUBSTITUTION_WARNING,
    };
  }
}
