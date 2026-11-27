import { InventoryTransaction, InventoryTransactionType } from '@prisma/client';
import { formatDecimalFixed } from '../imports/catalogue-dataset.types';

export interface SerializedInventoryTransactionItem {
  id: string;
  patientMedicationId: string;
  doseEventId: string | null;
  purchaseId: string | null;
  cataloguePackId: string | null;
  type: InventoryTransactionType;
  enteredQuantity: string | null;
  enteredUnit: string | null;
  baseUnit: string | null;
  quantityDelta: string;
  balanceAfter: string;
  reason: string | null;
  note: string | null;
  createdAt: string;
}

export interface SerializedInventoryLedgerResponse {
  medicationId: string;
  stockRemaining: string;
  stockUnit: string;
  lowStockThreshold: string;
  isLowStock: boolean;
  items: SerializedInventoryTransactionItem[];
  nextCursor: string | null;
}

export interface SerializedStockAdjustmentResult {
  medicationId: string;
  stockRemaining: string;
  stockUnit: string;
  lowStockThreshold: string;
  isLowStock: boolean;
  transaction: SerializedInventoryTransactionItem;
}

export function serializeInventoryTransaction(
  tx: InventoryTransaction,
): SerializedInventoryTransactionItem {
  return {
    id: tx.id,
    patientMedicationId: tx.patientMedicationId,
    doseEventId: tx.doseEventId ?? null,
    purchaseId: tx.purchaseId ?? null,
    cataloguePackId: tx.cataloguePackId ?? null,
    type: tx.type,
    enteredQuantity: tx.enteredQuantity != null ? formatDecimalFixed(tx.enteredQuantity) : null,
    enteredUnit: tx.enteredUnit ?? null,
    baseUnit: tx.baseUnit ?? null,
    quantityDelta: formatDecimalFixed(tx.quantityDelta) ?? '0.00',
    balanceAfter: formatDecimalFixed(tx.balanceAfter) ?? '0.00',
    reason: tx.reason ?? null,
    note: tx.note ?? null,
    createdAt: tx.createdAt.toISOString(),
  };
}
