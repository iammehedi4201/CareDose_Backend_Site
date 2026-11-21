import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeSearchText } from '../imports/catalogue-dataset.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALTERNATIVE_NON_SUBSTITUTION_WARNING,
  CATALOGUE_UNVERIFIED_NOTICE,
  resolveDosageFormFilter,
  serializeAlternativeGroupMeta,
  serializeBrandDetail,
  serializeBrandSummary,
  SerializedBrandDetail,
  SerializedBrandSummary,
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

@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [latestBatch, generics, brands, packs, alternativeGroups, brandsWithImages, manufacturers] =
      await Promise.all([
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
    const conditions: Prisma.MedicineBrandWhereInput[] = [];

    const queryText = dto.q ? normalizeSearchText(dto.q) : '';
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

  async getBrandById(brandIdOrSourceId: string): Promise<SerializedBrandDetail> {
    const brand = await this.findBrandEntityOrThrow(brandIdOrSourceId);
    return serializeBrandDetail(brand);
  }

  async searchGenerics(dto: SearchGenericsDto) {
    const limit = dto.limit ?? DEFAULT_PAGE_LIMIT;
    const queryText = dto.q ? normalizeSearchText(dto.q) : '';
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
        ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
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

    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
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
    const targetBrand = await this.findBrandEntityOrThrow(brandIdOrSourceId);

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
        ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
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
