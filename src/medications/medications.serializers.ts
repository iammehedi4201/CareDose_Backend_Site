import {
  DoseEvent,
  InventoryTransaction,
  MedicationSchedule,
  MedicationStatus,
  PatientMedication,
  Prisma,
  Purchase,
} from '@prisma/client';
import {
  BrandWithRelations,
  serializeBrandSummary,
  SerializedBrandSummary,
} from '../catalogue/catalogue.serializers';
import { formatDecimalFixed } from '../imports/catalogue-dataset.types';

export type PatientMedicationWithCatalogue = PatientMedication & {
  catalogueBrand?: BrandWithRelations | null;
  _count?: {
    schedules: number;
    purchases: number;
  };
};

export type PatientMedicationFullDetail = PatientMedicationWithCatalogue & {
  schedules: MedicationSchedule[];
  purchases: Purchase[];
  doseEvents: DoseEvent[];
  inventoryTransactions: InventoryTransaction[];
};

export interface SerializedPatientMedication {
  id: string;
  patientId: string;
  catalogueBrandId: string | null;
  name: string;
  genericName: string | null;
  strength: string | null;
  dosageForm: string | null;
  manufacturer: string | null;
  personalInstructions: string;
  stockRemaining: string;
  stockUnit: string;
  lowStockThreshold: string;
  status: MedicationStatus;
  isLowStock: boolean;
  schedulesCount: number;
  purchasesCount: number;
  catalogueBrand: SerializedBrandSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedPatientMedicationDetail extends SerializedPatientMedication {
  schedules: Array<{
    id: string;
    doseAmount: string;
    doseUnit: string;
    frequency: string;
    scheduledTimes: string[];
    startDate: string;
    endDate: string | null;
    instructions: string | null;
    remindersEnabled: boolean;
    status: string;
  }>;
  recentPurchases: Array<{
    id: string;
    purchaseDate: string;
    packCount: number;
    unitsPerPack: string;
    totalUnitsAdded: string;
    amountPaid: string;
    currency: string;
    vendor: string | null;
  }>;
  recentDoseEvents: Array<{
    id: string;
    scheduledFor: string;
    status: string;
    recordedAt: string | null;
    note: string | null;
  }>;
  recentInventoryTransactions: Array<{
    id: string;
    type: string;
    quantityDelta: string;
    balanceAfter: string;
    reason: string | null;
    createdAt: string;
  }>;
}

export function inferDefaultStockUnit(dosageForm?: string | null): string {
  const norm = (dosageForm ?? '').trim().toLowerCase();
  if (norm.includes('capsule')) return 'capsules';
  if (norm.includes('syrup') || norm.includes('suspension')) return 'ml';
  if (norm.includes('drop')) return 'bottle';
  if (norm.includes('injection') || norm.includes('infusion') || norm.includes('vial')) {
    return 'vials';
  }
  if (norm.includes('cream') || norm.includes('ointment') || norm.includes('gel')) {
    return 'tube';
  }
  if (norm.includes('inhaler') || norm.includes('spray')) return 'puffs';
  return 'tablets';
}

export function computeIsLowStock(
  status: MedicationStatus,
  stockRemaining: Prisma.Decimal | string | number,
  lowStockThreshold: Prisma.Decimal | string | number,
): boolean {
  if (status !== MedicationStatus.ACTIVE) {
    return false;
  }
  const stock = new Prisma.Decimal(stockRemaining.toString());
  const threshold = new Prisma.Decimal(lowStockThreshold.toString());
  return stock.lte(threshold);
}

export function serializePatientMedication(
  med: PatientMedicationWithCatalogue,
): SerializedPatientMedication {
  const stockRemaining = formatDecimalFixed(med.stockRemaining) ?? '0.00';
  const lowStockThreshold = formatDecimalFixed(med.lowStockThreshold) ?? '0.00';

  return {
    id: med.id,
    patientId: med.patientId,
    catalogueBrandId: med.catalogueBrandId,
    name: med.name,
    genericName: med.genericName,
    strength: med.strength,
    dosageForm: med.dosageForm,
    manufacturer: med.manufacturer,
    personalInstructions: med.personalInstructions,
    stockRemaining,
    stockUnit: med.stockUnit,
    lowStockThreshold,
    status: med.status,
    isLowStock: computeIsLowStock(med.status, med.stockRemaining, med.lowStockThreshold),
    schedulesCount: med._count?.schedules ?? 0,
    purchasesCount: med._count?.purchases ?? 0,
    catalogueBrand: med.catalogueBrand ? serializeBrandSummary(med.catalogueBrand) : null,
    createdAt: med.createdAt.toISOString(),
    updatedAt: med.updatedAt.toISOString(),
  };
}

export function serializePatientMedicationDetail(
  med: PatientMedicationFullDetail,
): SerializedPatientMedicationDetail {
  const base = serializePatientMedication(med);
  return {
    ...base,
    schedulesCount: med.schedules.length,
    purchasesCount: med.purchases.length,
    schedules: med.schedules.map((s) => ({
      id: s.id,
      doseAmount: formatDecimalFixed(s.doseAmount) ?? '1.00',
      doseUnit: s.doseUnit,
      frequency: s.frequency,
      scheduledTimes: s.scheduledTimes,
      startDate: s.startDate.toISOString(),
      endDate: s.endDate ? s.endDate.toISOString() : null,
      instructions: s.instructions,
      remindersEnabled: s.remindersEnabled,
      status: s.status,
    })),
    recentPurchases: med.purchases.map((p) => ({
      id: p.id,
      purchaseDate: p.purchaseDate.toISOString(),
      packCount: p.packCount,
      unitsPerPack: formatDecimalFixed(p.unitsPerPack) ?? '0.00',
      totalUnitsAdded: formatDecimalFixed(p.totalUnitsAdded) ?? '0.00',
      amountPaid: formatDecimalFixed(p.amountPaid) ?? '0.00',
      currency: p.currency,
      vendor: p.vendor,
    })),
    recentDoseEvents: med.doseEvents.map((e) => ({
      id: e.id,
      scheduledFor: e.scheduledFor.toISOString(),
      status: e.status,
      recordedAt: e.recordedAt ? e.recordedAt.toISOString() : null,
      note: e.note,
    })),
    recentInventoryTransactions: med.inventoryTransactions.map((t) => ({
      id: t.id,
      type: t.type,
      quantityDelta: formatDecimalFixed(t.quantityDelta) ?? '0.00',
      balanceAfter: formatDecimalFixed(t.balanceAfter) ?? '0.00',
      reason: t.reason,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}
