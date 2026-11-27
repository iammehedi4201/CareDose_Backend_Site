import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryTransactionType, Prisma } from '@prisma/client';
import { isValidUuid } from '../common/utils/uuid.util';
import { formatDecimalFixed, normalizeOptionalText } from '../imports/catalogue-dataset.types';
import { serializeInventoryTransaction } from '../inventory/inventory.serializers';
import { computeIsLowStock } from '../medications/medications.serializers';
import { PrismaService } from '../prisma/prisma.service';
import {
  getLocalDayRangeUtc,
  zonedDateTimeToUtc,
} from '../schedules/schedule-time.util';
import { CreatePurchaseDto, ListPurchasesQueryDto } from './dto/purchase.dto';
import {
  SerializedPurchaseListResponse,
  SerializedRecordPurchaseResult,
  serializePurchase,
} from './purchases.serializers';

interface PurchaseCursorPayload {
  purchaseDate: string;
  id: string;
}

const PURCHASE_MEDICATION_INCLUDE = {
  patientMedication: {
    select: {
      id: true,
      name: true,
      strength: true,
      dosageForm: true,
      stockUnit: true,
    },
  },
} satisfies Prisma.PurchaseInclude;

function encodePurchaseCursor(payload: PurchaseCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePurchaseCursor(raw?: string): PurchaseCursorPayload | null {
  if (!raw || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw.trim(), 'base64url').toString('utf8'),
    ) as Partial<PurchaseCursorPayload>;
    if (
      typeof parsed.purchaseDate === 'string' &&
      typeof parsed.id === 'string' &&
      parsed.id.trim().length > 0 &&
      !Number.isNaN(new Date(parsed.purchaseDate).getTime())
    ) {
      return { purchaseDate: parsed.purchaseDate, id: parsed.id };
    }
  } catch {
    // Fall through to validation error
  }
  throw new BadRequestException('Invalid purchases pagination cursor.');
}

function parsePurchaseDate(raw?: string, timeZone = 'Asia/Dhaka'): Date {
  if (!raw || raw.trim().length === 0) {
    return new Date();
  }
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    try {
      return zonedDateTimeToUtc(trimmed, '12:00', timeZone);
    } catch {
      throw new BadRequestException(`Invalid purchaseDate "${raw}".`);
    }
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(
      `Invalid purchaseDate "${raw}". Expected YYYY-MM-DD or ISO timestamp.`,
    );
  }
  return parsed;
}

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  async recordForMedication(
    medicationId: string,
    dto: CreatePurchaseDto,
  ): Promise<SerializedRecordPurchaseResult> {
    const packCount = dto.packCount;
    const unitsPerPackDec = new Prisma.Decimal(dto.unitsPerPack).toDecimalPlaces(2);
    const totalUnitsAddedDec = new Prisma.Decimal(packCount)
      .mul(unitsPerPackDec)
      .toDecimalPlaces(2);
    if (totalUnitsAddedDec.lte(0)) {
      throw new BadRequestException('Total added units must be greater than 0.');
    }

    const amountPaidDec = new Prisma.Decimal(dto.amountPaid).toDecimalPlaces(2);
    const currency = dto.currency?.trim().toUpperCase() || 'BDT';
    const cleanVendor = normalizeOptionalText(dto.vendor);
    const cleanNote = normalizeOptionalText(dto.note);
    const cleanEnteredUnit = normalizeOptionalText(dto.enteredUnit) ?? 'packs';

    const existingMedMeta = await this.prisma.patientMedication.findUnique({
      where: { id: medicationId },
      select: {
        id: true,
        patientId: true,
        catalogueBrandId: true,
        patient: {
          select: { timezone: true },
        },
      },
    });
    if (!existingMedMeta) {
      throw new NotFoundException('Patient medication not found');
    }

    const timeZone = existingMedMeta.patient?.timezone ?? 'Asia/Dhaka';
    const purchaseDate = parsePurchaseDate(dto.purchaseDate, timeZone);

    let resolvedPackId: string | null = null;
    const rawPackRef = normalizeOptionalText(dto.cataloguePackId);
    if (rawPackRef && existingMedMeta.catalogueBrandId && isValidUuid(rawPackRef)) {
      const pack = await this.prisma.medicinePack.findFirst({
        where: { id: rawPackRef, brandId: existingMedMeta.catalogueBrandId },
        select: { id: true },
      });
      resolvedPackId = pack?.id ?? null;
    }

    return this.prisma.$transaction(async (tx) => {
      const med = await tx.patientMedication.findUnique({
        where: { id: medicationId },
        select: {
          id: true,
          patientId: true,
          name: true,
          strength: true,
          dosageForm: true,
          stockRemaining: true,
          stockUnit: true,
          lowStockThreshold: true,
          status: true,
        },
      });
      if (!med) {
        throw new NotFoundException('Patient medication not found');
      }

      const currentStockDec = new Prisma.Decimal(med.stockRemaining.toString()).toDecimalPlaces(2);
      const nextStockDec = currentStockDec.add(totalUnitsAddedDec).toDecimalPlaces(2);

      const createdPurchase = await tx.purchase.create({
        data: {
          patientId: med.patientId,
          patientMedicationId: med.id,
          purchaseDate,
          packCount,
          unitsPerPack: unitsPerPackDec,
          totalUnitsAdded: totalUnitsAddedDec,
          amountPaid: amountPaidDec,
          currency,
          vendor: cleanVendor,
          note: cleanNote,
        },
        include: PURCHASE_MEDICATION_INCLUDE,
      });

      const updatedMed = await tx.patientMedication.update({
        where: { id: med.id },
        data: { stockRemaining: nextStockDec },
        select: {
          id: true,
          status: true,
          stockRemaining: true,
          stockUnit: true,
          lowStockThreshold: true,
        },
      });

      const createdTx = await tx.inventoryTransaction.create({
        data: {
          patientMedicationId: med.id,
          purchaseId: createdPurchase.id,
          cataloguePackId: resolvedPackId,
          type: InventoryTransactionType.PURCHASE,
          enteredQuantity: new Prisma.Decimal(packCount).toDecimalPlaces(2),
          enteredUnit: cleanEnteredUnit,
          baseUnit: med.stockUnit,
          quantityDelta: totalUnitsAddedDec,
          balanceAfter: nextStockDec,
          reason: 'Purchase recorded',
          note:
            cleanNote ??
            `${packCount} ${cleanEnteredUnit} x ${unitsPerPackDec.toString()} ${med.stockUnit}`,
        },
      });

      return {
        purchase: serializePurchase(createdPurchase, timeZone),
        medicationId: updatedMed.id,
        newStockRemaining: formatDecimalFixed(updatedMed.stockRemaining) ?? '0.00',
        stockUnit: updatedMed.stockUnit,
        isLowStock: computeIsLowStock(
          updatedMed.status,
          updatedMed.stockRemaining,
          updatedMed.lowStockThreshold,
        ),
        inventoryTransaction: serializeInventoryTransaction(createdTx),
      };
    });
  }

  async listForPatient(
    patientId: string,
    timeZone: string,
    query: ListPurchasesQueryDto,
  ): Promise<SerializedPurchaseListResponse> {
    if (query.medicationId && !isValidUuid(query.medicationId)) {
      throw new BadRequestException('Invalid medicationId UUID filter.');
    }

    return this.queryPurchases(
      {
        patientId,
        medicationId: query.medicationId,
        from: query.from,
        to: query.to,
        limit: query.limit,
        cursor: query.cursor,
      },
      timeZone,
    );
  }

  async listForMedication(
    medicationId: string,
    query: ListPurchasesQueryDto,
  ): Promise<SerializedPurchaseListResponse> {
    const med = await this.prisma.patientMedication.findUnique({
      where: { id: medicationId },
      select: {
        id: true,
        patientId: true,
        patient: { select: { timezone: true } },
      },
    });
    if (!med) {
      throw new NotFoundException('Patient medication not found');
    }

    return this.queryPurchases(
      {
        patientId: med.patientId,
        medicationId: med.id,
        from: query.from,
        to: query.to,
        limit: query.limit,
        cursor: query.cursor,
      },
      med.patient?.timezone ?? 'Asia/Dhaka',
    );
  }

  private async queryPurchases(
    filters: {
      patientId: string;
      medicationId?: string;
      from?: string;
      to?: string;
      limit?: number;
      cursor?: string;
    },
    timeZone: string,
  ): Promise<SerializedPurchaseListResponse> {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
    const cursor = decodePurchaseCursor(filters.cursor);

    const baseConditions: Prisma.PurchaseWhereInput[] = [{ patientId: filters.patientId }];
    if (filters.medicationId) {
      baseConditions.push({ patientMedicationId: filters.medicationId });
    }
    if (filters.from) {
      try {
        const { startUtc } = getLocalDayRangeUtc(filters.from, timeZone);
        baseConditions.push({ purchaseDate: { gte: startUtc } });
      } catch {
        throw new BadRequestException(`Invalid from date "${filters.from}".`);
      }
    }
    if (filters.to) {
      try {
        const { endUtc } = getLocalDayRangeUtc(filters.to, timeZone);
        baseConditions.push({ purchaseDate: { lt: endUtc } });
      } catch {
        throw new BadRequestException(`Invalid to date "${filters.to}".`);
      }
    }

    const baseWhere: Prisma.PurchaseWhereInput = { AND: baseConditions };
    const pagedConditions: Prisma.PurchaseWhereInput[] = [...baseConditions];
    if (cursor) {
      const cursorDate = new Date(cursor.purchaseDate);
      pagedConditions.push({
        OR: [
          { purchaseDate: { lt: cursorDate } },
          { AND: [{ purchaseDate: cursorDate }, { id: { lt: cursor.id } }] },
        ],
      });
    }

    const [matchingAmounts, rows] = await Promise.all([
      this.prisma.purchase.findMany({
        where: baseWhere,
        select: { amountPaid: true },
      }),
      this.prisma.purchase.findMany({
        where: { AND: pagedConditions },
        include: PURCHASE_MEDICATION_INCLUDE,
        orderBy: [{ purchaseDate: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
    ]);

    const totalAmountPaidDec = matchingAmounts.reduce(
      (sum, row) => sum.add(new Prisma.Decimal(row.amountPaid.toString())),
      new Prisma.Decimal(0),
    );

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = pageRows[pageRows.length - 1];

    return {
      items: pageRows.map((row) => serializePurchase(row, timeZone)),
      summary: {
        totalCount: matchingAmounts.length,
        totalAmountPaid: totalAmountPaidDec.toDecimalPlaces(2).toFixed(2),
        currency: 'BDT',
      },
      nextCursor:
        hasMore && lastRow
          ? encodePurchaseCursor({
              purchaseDate: lastRow.purchaseDate.toISOString(),
              id: lastRow.id,
            })
          : null,
    };
  }
}
