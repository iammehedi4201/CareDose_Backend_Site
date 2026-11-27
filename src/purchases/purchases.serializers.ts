import { Prisma, Purchase } from '@prisma/client';
import { formatDecimalFixed } from '../imports/catalogue-dataset.types';
import { SerializedInventoryTransactionItem } from '../inventory/inventory.serializers';

export type PurchaseWithMedication = Purchase & {
  patientMedication?: {
    id: string;
    name: string;
    strength: string | null;
    dosageForm: string | null;
    stockUnit: string;
  } | null;
};

export interface SerializedPurchaseItem {
  id: string;
  patientId: string;
  patientMedicationId: string;
  purchaseDate: string;
  purchaseDateYmd: string;
  packCount: number;
  unitsPerPack: string;
  totalUnitsAdded: string;
  amountPaid: string;
  unitPrice: string | null;
  currency: string;
  vendor: string | null;
  note: string | null;
  createdAt: string;
  medication: {
    id: string;
    name: string;
    strength: string | null;
    dosageForm: string | null;
    stockUnit: string;
  } | null;
}

export interface SerializedPurchaseListResponse {
  items: SerializedPurchaseItem[];
  summary: {
    totalCount: number;
    totalAmountPaid: string;
    currency: string;
  };
  nextCursor: string | null;
}

export interface SerializedRecordPurchaseResult {
  purchase: SerializedPurchaseItem;
  medicationId: string;
  newStockRemaining: string;
  stockUnit: string;
  isLowStock: boolean;
  inventoryTransaction: SerializedInventoryTransactionItem;
}

function formatYmdInTimezone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function serializePurchase(
  purchase: PurchaseWithMedication,
  timeZone = 'Asia/Dhaka',
): SerializedPurchaseItem {
  const totalUnitsDec = new Prisma.Decimal(purchase.totalUnitsAdded.toString());
  const amountPaidDec = new Prisma.Decimal(purchase.amountPaid.toString());
  const unitPrice =
    totalUnitsDec.gt(0) && amountPaidDec.gte(0)
      ? amountPaidDec.div(totalUnitsDec).toDecimalPlaces(2).toFixed(2)
      : null;

  return {
    id: purchase.id,
    patientId: purchase.patientId,
    patientMedicationId: purchase.patientMedicationId,
    purchaseDate: purchase.purchaseDate.toISOString(),
    purchaseDateYmd: formatYmdInTimezone(purchase.purchaseDate, timeZone),
    packCount: purchase.packCount,
    unitsPerPack: formatDecimalFixed(purchase.unitsPerPack) ?? '0.00',
    totalUnitsAdded: formatDecimalFixed(purchase.totalUnitsAdded) ?? '0.00',
    amountPaid: formatDecimalFixed(purchase.amountPaid) ?? '0.00',
    unitPrice,
    currency: purchase.currency,
    vendor: purchase.vendor ?? null,
    note: purchase.note ?? null,
    createdAt: purchase.createdAt.toISOString(),
    medication: purchase.patientMedication
      ? {
          id: purchase.patientMedication.id,
          name: purchase.patientMedication.name,
          strength: purchase.patientMedication.strength ?? null,
          dosageForm: purchase.patientMedication.dosageForm ?? null,
          stockUnit: purchase.patientMedication.stockUnit,
        }
      : null,
  };
}
