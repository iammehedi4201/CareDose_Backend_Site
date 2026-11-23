import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryTransactionType,
  MedicationStatus,
  Prisma,
} from '@prisma/client';
import { isValidUuid } from '../common/utils/uuid.util';
import { normalizeOptionalText } from '../imports/catalogue-dataset.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMedicationDto,
  ListMedicationsQueryDto,
  UpdateMedicationDto,
} from './dto/medication.dto';
import {
  computeIsLowStock,
  inferDefaultStockUnit,
  serializePatientMedication,
  serializePatientMedicationDetail,
  SerializedPatientMedication,
  SerializedPatientMedicationDetail,
} from './medications.serializers';

const CATALOGUE_BRAND_INCLUDE = {
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

const MEDICATION_LIST_INCLUDE = {
  catalogueBrand: {
    include: CATALOGUE_BRAND_INCLUDE,
  },
  _count: {
    select: {
      schedules: true,
      purchases: true,
    },
  },
} satisfies Prisma.PatientMedicationInclude;

@Injectable()
export class MedicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForPatient(
    patientId: string,
    query: ListMedicationsQueryDto,
  ): Promise<SerializedPatientMedication[]> {
    const conditions: Prisma.PatientMedicationWhereInput[] = [{ patientId }];

    if (query.status === 'ACTIVE') {
      conditions.push({ status: MedicationStatus.ACTIVE });
    } else if (query.status === 'ARCHIVED') {
      conditions.push({ status: MedicationStatus.ARCHIVED });
    } else if (query.lowStock === 'true') {
      conditions.push({ status: MedicationStatus.ACTIVE });
    }

    const q = query.q?.trim();
    if (q && q.length > 0) {
      conditions.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { genericName: { contains: q, mode: 'insensitive' } },
          { strength: { contains: q, mode: 'insensitive' } },
          { dosageForm: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const rows = await this.prisma.patientMedication.findMany({
      where: { AND: conditions },
      include: MEDICATION_LIST_INCLUDE,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });

    const filtered =
      query.lowStock === 'true'
        ? rows.filter((m) =>
            computeIsLowStock(m.status, m.stockRemaining, m.lowStockThreshold),
          )
        : rows;

    return filtered.map(serializePatientMedication);
  }

  async createForPatient(
    patientId: string,
    dto: CreateMedicationDto,
  ): Promise<SerializedPatientMedication> {
    const cleanInstructions = (dto.personalInstructions ?? '').trim();

    let resolvedCatalogueBrandId: string | null = null;
    let catalogueBrandRecord = null;
    const rawBrandRef = normalizeOptionalText(dto.catalogueBrandId);
    if (rawBrandRef) {
      catalogueBrandRecord = await this.prisma.medicineBrand.findUnique({
        where: isValidUuid(rawBrandRef) ? { id: rawBrandRef } : { sourceId: rawBrandRef },
        include: {
          generic: { select: { name: true } },
        },
      });
      if (!catalogueBrandRecord) {
        throw new NotFoundException(`Catalogue brand "${rawBrandRef}" not found`);
      }
      resolvedCatalogueBrandId = catalogueBrandRecord.id;
    }

    let resolvedPackId: string | null = null;
    const rawPackRef = normalizeOptionalText(dto.selectedPackId);
    if (rawPackRef && resolvedCatalogueBrandId && isValidUuid(rawPackRef)) {
      const matchedPack = await this.prisma.medicinePack.findFirst({
        where: { id: rawPackRef, brandId: resolvedCatalogueBrandId },
        select: { id: true },
      });
      resolvedPackId = matchedPack?.id ?? null;
    }

    const resolvedName =
      normalizeOptionalText(dto.name) ?? catalogueBrandRecord?.name ?? null;
    if (!resolvedName) {
      throw new BadRequestException(
        'Medicine name is required when not linking a catalogue brand.',
      );
    }

    const resolvedGenericName =
      normalizeOptionalText(dto.genericName) ?? catalogueBrandRecord?.generic?.name ?? null;
    const resolvedStrength =
      normalizeOptionalText(dto.strength) ?? catalogueBrandRecord?.strength ?? null;
    const resolvedForm =
      normalizeOptionalText(dto.dosageForm) ?? catalogueBrandRecord?.dosageForm ?? null;
    const resolvedManufacturer =
      normalizeOptionalText(dto.manufacturer) ?? catalogueBrandRecord?.manufacturer ?? null;

    const startingStockVal = dto.startingStock ?? 0;
    const thresholdVal = dto.lowStockThreshold ?? 5;
    const stockDec = new Prisma.Decimal(startingStockVal).toDecimalPlaces(2);
    const thresholdDec = new Prisma.Decimal(thresholdVal).toDecimalPlaces(2);
    const resolvedStockUnit =
      normalizeOptionalText(dto.stockUnit) ?? inferDefaultStockUnit(resolvedForm);
    const resolvedEnteredQty =
      dto.enteredQuantity !== undefined
        ? new Prisma.Decimal(dto.enteredQuantity).toDecimalPlaces(2)
        : stockDec;
    const resolvedEnteredUnit =
      normalizeOptionalText(dto.enteredUnit) ?? resolvedStockUnit;
    const conversionNote =
      resolvedEnteredUnit !== resolvedStockUnit
        ? `${resolvedEnteredQty.toString()} ${resolvedEnteredUnit} entered -> ${stockDec.toString()} ${resolvedStockUnit}`
        : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const med = await tx.patientMedication.create({
        data: {
          patientId,
          catalogueBrandId: resolvedCatalogueBrandId,
          name: resolvedName,
          genericName: resolvedGenericName,
          strength: resolvedStrength,
          dosageForm: resolvedForm,
          manufacturer: resolvedManufacturer,
          personalInstructions: cleanInstructions,
          stockRemaining: stockDec,
          stockUnit: resolvedStockUnit,
          lowStockThreshold: thresholdDec,
          status: MedicationStatus.ACTIVE,
        },
        include: MEDICATION_LIST_INCLUDE,
      });

      let initialPurchaseId: string | null = null;
      if (dto.purchaseDetails) {
        const pd = dto.purchaseDetails;
        const parsedDate = pd.purchaseDate ? new Date(pd.purchaseDate) : new Date();
        const validDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
        const packCount =
          pd.packCount ??
          (resolvedEnteredQty.gt(0) && resolvedEnteredQty.isInteger()
            ? Math.max(1, resolvedEnteredQty.toNumber())
            : 1);
        const derivedUnitsPerPack =
          pd.unitsPerPack ??
          (stockDec.gt(0)
            ? Number(stockDec.div(packCount).toDecimalPlaces(2).toString())
            : 1);

        const purchaseRow = await tx.purchase.create({
          data: {
            patientId,
            patientMedicationId: med.id,
            purchaseDate: validDate,
            packCount,
            unitsPerPack: new Prisma.Decimal(derivedUnitsPerPack).toDecimalPlaces(2),
            totalUnitsAdded: stockDec,
            amountPaid: new Prisma.Decimal(pd.amountPaid).toDecimalPlaces(2),
            vendor: normalizeOptionalText(pd.vendor),
            note: normalizeOptionalText(pd.note),
          },
        });
        initialPurchaseId = purchaseRow.id;
      }

      if (stockDec.gt(0)) {
        await tx.inventoryTransaction.create({
          data: {
            patientMedicationId: med.id,
            purchaseId: initialPurchaseId,
            cataloguePackId: resolvedPackId,
            type: InventoryTransactionType.OPENING_STOCK,
            enteredQuantity: resolvedEnteredQty,
            enteredUnit: resolvedEnteredUnit,
            baseUnit: resolvedStockUnit,
            quantityDelta: stockDec,
            balanceAfter: stockDec,
            reason: 'Opening stock',
            note: conversionNote,
          },
        });
      }

      return initialPurchaseId
        ? {
            ...med,
            _count: {
              ...med._count,
              purchases: (med._count?.purchases ?? 0) + 1,
            },
          }
        : med;
    });

    return serializePatientMedication(created);
  }

  async getById(medicationId: string): Promise<SerializedPatientMedicationDetail> {
    const med = await this.prisma.patientMedication.findUnique({
      where: { id: medicationId },
      include: {
        catalogueBrand: {
          include: CATALOGUE_BRAND_INCLUDE,
        },
        schedules: {
          orderBy: { createdAt: 'asc' },
        },
        purchases: {
          orderBy: { purchaseDate: 'desc' },
          take: 5,
        },
        doseEvents: {
          orderBy: { scheduledFor: 'desc' },
          take: 5,
        },
        inventoryTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!med) {
      throw new NotFoundException('Patient medication not found');
    }

    return serializePatientMedicationDetail(med);
  }

  async updateById(
    medicationId: string,
    dto: UpdateMedicationDto,
  ): Promise<SerializedPatientMedication> {
    const data: Prisma.PatientMedicationUpdateInput = {};

    if (dto.name !== undefined) {
      const cleanName = dto.name.trim();
      if (!cleanName) {
        throw new BadRequestException('Medicine name cannot be empty.');
      }
      data.name = cleanName;
    }

    if (dto.personalInstructions !== undefined) {
      data.personalInstructions = dto.personalInstructions.trim();
    }

    if (dto.genericName !== undefined) {
      data.genericName = normalizeOptionalText(dto.genericName);
    }
    if (dto.strength !== undefined) {
      data.strength = normalizeOptionalText(dto.strength);
    }
    if (dto.dosageForm !== undefined) {
      data.dosageForm = normalizeOptionalText(dto.dosageForm);
    }
    if (dto.manufacturer !== undefined) {
      data.manufacturer = normalizeOptionalText(dto.manufacturer);
    }
    if (dto.stockUnit !== undefined) {
      const cleanUnit = dto.stockUnit.trim();
      if (!cleanUnit) {
        throw new BadRequestException('Stock unit cannot be empty.');
      }
      data.stockUnit = cleanUnit;
    }
    if (dto.lowStockThreshold !== undefined) {
      data.lowStockThreshold = new Prisma.Decimal(dto.lowStockThreshold).toDecimalPlaces(2);
    }

    const updated = await this.prisma.patientMedication.update({
      where: { id: medicationId },
      data,
      include: MEDICATION_LIST_INCLUDE,
    });

    return serializePatientMedication(updated);
  }

  async archiveById(medicationId: string): Promise<SerializedPatientMedication> {
    const updated = await this.prisma.patientMedication.update({
      where: { id: medicationId },
      data: { status: MedicationStatus.ARCHIVED },
      include: MEDICATION_LIST_INCLUDE,
    });
    return serializePatientMedication(updated);
  }

  async restoreById(medicationId: string): Promise<SerializedPatientMedication> {
    const updated = await this.prisma.patientMedication.update({
      where: { id: medicationId },
      data: { status: MedicationStatus.ACTIVE },
      include: MEDICATION_LIST_INCLUDE,
    });
    return serializePatientMedication(updated);
  }
}
