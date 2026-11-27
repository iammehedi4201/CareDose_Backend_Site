import type { SerializedPurchaseItem } from '../purchases/purchases.serializers';

export interface SerializedMonthlySpendPoint {
  month: string;
  shortLabel: string;
  yearLabel: string;
  totalSpent: string;
  purchaseCount: number;
  isSelected: boolean;
}

export interface SerializedMedicationSpendBreakdownItem {
  medicationId: string;
  medicationName: string;
  strength: string | null;
  dosageForm: string | null;
  stockUnit: string;
  totalSpent: string;
  totalUnitsAdded: string;
  purchaseCount: number;
}

export interface SerializedEstimatedMedicationCostItem {
  medicationId: string;
  medicationName: string;
  strength: string | null;
  estimatedCost: string;
  monthlyUnits: string;
  stockUnit: string;
  unitPriceUsed: string;
  priceSource: 'confirmed_purchase' | 'catalogue_reference';
  scheduleSummary: string;
}

export interface SerializedEstimatedMedicationExcludedItem {
  medicationId: string;
  medicationName: string;
  reason: string;
}

export interface SerializedExpensesSummaryResponse {
  patientId: string;
  timezone: string;
  selectedMonth: string;
  currency: string;
  actualSpent: string;
  monthlyBudget: string | null;
  budgetRemaining: string | null;
  budgetUtilizationPercent: number | null;
  monthlySeries: SerializedMonthlySpendPoint[];
  medicationBreakdown: SerializedMedicationSpendBreakdownItem[];
  recentPurchases: SerializedPurchaseItem[];
  estimatedMonthlyCost: {
    hasEstimate: boolean;
    totalEstimatedCost: string | null;
    includedCount: number;
    excludedCount: number;
    disclaimer: string;
    items: SerializedEstimatedMedicationCostItem[];
    excludedItems: SerializedEstimatedMedicationExcludedItem[];
  };
}
