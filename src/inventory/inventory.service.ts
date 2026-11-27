import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryTransactionType, Prisma } from '@prisma/client';
import { formatDecimalFixed, normalizeOptionalText } from '../imports/catalogue-dataset.types';
import { computeIsLowStock } from '../medications/medications.serializers';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto, ListInventoryQueryDto } from './dto/inventory.dto';
import {
  SerializedInventoryLedgerResponse,
  SerializedStockAdjustmentResult,
  serializeInventoryTransaction,
} from './inventory.serializers';

interface InventoryCursorPayload {
  createdAt: string;
  id: string;
}

function encodeInventoryCursor(payload: InventoryCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeInventoryCursor(raw?: string): InventoryCursorPayload | null {
  if (!raw || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw.trim(), 'base64url').toString('utf8'),
    ) as Partial<InventoryCursorPayload>;
    if (
      typeof parsed.createdAt === 'string' &&
      typeof parsed.id === 'string' &&
      parsed.id.trim().length > 0 &&
      !Number.isNaN(new Date(parsed.createdAt).getTime())
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    // Fall through to validation error
  }
  throw new BadRequestException('Invalid inventory pagination cursor.');
}

function resolveAdjustmentTransactionType(dto: AdjustStockDto): InventoryTransactionType {
  if (dto.transactionType === 'WASTAGE') {
    return InventoryTransactionType.WASTAGE;
  }
  if (dto.transactionType === 'ADJUSTMENT') {
    return InventoryTransactionType.ADJUSTMENT;
  }
  const cleanReason = (dto.reason ?? '').toLowerCase();
  if (dto.mode === 'DEDUCT' || /wast|damag|expir|spoil/.test(cleanReason)) {
    return InventoryTransactionType.WASTAGE;
  }
  return InventoryTransactionType.ADJUSTMENT;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listForMedication(
    medicationId: string,
    query: ListInventoryQueryDto,
  ): Promise<SerializedInventoryLedgerResponse> {
    const med = await this.prisma.patientMedication.findUnique({
      where: { id: medicationId },
      select: {
        id: true,
        status: true,
        stockRemaining: true,
        stockUnit: true,
        lowStockThreshold: true,
      },
    });
    if (!med) {
      throw new NotFoundException('Patient medication not found');
    }

    const limit = Math.min(Math.max(query.limit ?? 30, 1), 100);
    const cursor = decodeInventoryCursor(query.cursor);

    const conditions: Prisma.InventoryTransactionWhereInput[] = [
      { patientMedicationId: medicationId },
    ];
    if (query.type) {
      conditions.push({ type: query.type });
    }
    if (cursor) {
      const cursorDate = new Date(cursor.createdAt);
      conditions.push({
        OR: [
          { createdAt: { lt: cursorDate } },
          { AND: [{ createdAt: cursorDate }, { id: { lt: cursor.id } }] },
        ],
      });
    }

    const rows = await this.prisma.inventoryTransaction.findMany({
      where: { AND: conditions },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = pageRows[pageRows.length - 1];

    return {
      medicationId: med.id,
      stockRemaining: formatDecimalFixed(med.stockRemaining) ?? '0.00',
      stockUnit: med.stockUnit,
      lowStockThreshold: formatDecimalFixed(med.lowStockThreshold) ?? '0.00',
      isLowStock: computeIsLowStock(med.status, med.stockRemaining, med.lowStockThreshold),
      items: pageRows.map(serializeInventoryTransaction),
      nextCursor:
        hasMore && lastRow
          ? encodeInventoryCursor({
              createdAt: lastRow.createdAt.toISOString(),
              id: lastRow.id,
            })
          : null,
    };
  }

  async adjustForMedication(
    medicationId: string,
    dto: AdjustStockDto,
  ): Promise<SerializedStockAdjustmentResult> {
    const qtyDec = new Prisma.Decimal(dto.quantity).toDecimalPlaces(2);
    if ((dto.mode === 'ADD' || dto.mode === 'DEDUCT') && qtyDec.lte(0)) {
      throw new BadRequestException('Adjustment quantity must be greater than 0.');
    }

    const resolvedEnteredUnit = normalizeOptionalText(dto.enteredUnit);
    const resolvedEnteredQty =
      dto.enteredQuantity !== undefined
        ? new Prisma.Decimal(dto.enteredQuantity).toDecimalPlaces(2)
        : qtyDec;
    const cleanReason =
      normalizeOptionalText(dto.reason) ??
      (dto.mode === 'ADD'
        ? 'Stock added'
        : dto.mode === 'DEDUCT'
          ? 'Damaged / wasted'
          : 'Physical count');
    const cleanNote = normalizeOptionalText(dto.note);
    const txType = resolveAdjustmentTransactionType(dto);

    return this.prisma.$transaction(async (tx) => {
      const med = await tx.patientMedication.findUnique({
        where: { id: medicationId },
        select: {
          id: true,
          status: true,
          stockRemaining: true,
          stockUnit: true,
          lowStockThreshold: true,
        },
      });
      if (!med) {
        throw new NotFoundException('Patient medication not found');
      }

      const currentDec = new Prisma.Decimal(med.stockRemaining.toString()).toDecimalPlaces(2);
      let deltaDec: Prisma.Decimal;
      let nextBalanceDec: Prisma.Decimal;

      if (dto.mode === 'ADD') {
        deltaDec = qtyDec;
        nextBalanceDec = currentDec.add(qtyDec).toDecimalPlaces(2);
      } else if (dto.mode === 'DEDUCT') {
        deltaDec = qtyDec.neg();
        nextBalanceDec = currentDec.sub(qtyDec).toDecimalPlaces(2);
        if (nextBalanceDec.lt(0)) {
          throw new BadRequestException(
            'Deduction exceeds current stock remaining. Use Set balance to set stock to 0.',
          );
        }
      } else {
        nextBalanceDec = qtyDec;
        deltaDec = nextBalanceDec.sub(currentDec).toDecimalPlaces(2);
      }

      const effectiveNote =
        cleanNote ??
        (resolvedEnteredUnit && resolvedEnteredUnit !== med.stockUnit
          ? `${resolvedEnteredQty.toString()} ${resolvedEnteredUnit} -> ${qtyDec.toString()} ${med.stockUnit}`
          : null);

      const updatedMed = await tx.patientMedication.update({
        where: { id: med.id },
        data: { stockRemaining: nextBalanceDec },
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
          type: txType,
          enteredQuantity: resolvedEnteredQty,
          enteredUnit: resolvedEnteredUnit ?? med.stockUnit,
          baseUnit: med.stockUnit,
          quantityDelta: deltaDec,
          balanceAfter: nextBalanceDec,
          reason: cleanReason,
          note: effectiveNote,
        },
      });

      return {
        medicationId: updatedMed.id,
        stockRemaining: formatDecimalFixed(updatedMed.stockRemaining) ?? '0.00',
        stockUnit: updatedMed.stockUnit,
        lowStockThreshold: formatDecimalFixed(updatedMed.lowStockThreshold) ?? '0.00',
        isLowStock: computeIsLowStock(
          updatedMed.status,
          updatedMed.stockRemaining,
          updatedMed.lowStockThreshold,
        ),
        transaction: serializeInventoryTransaction(createdTx),
      };
    });
  }
}
