import { DoseEventStatus } from '@prisma/client';
import {
  DoseDisplayStatus,
  SchedulePeriodGroup,
} from '../schedules/schedule-time.util';

export interface SerializedScheduledDoseItem {
  occurrenceKey: string;
  doseEventId: string | null;
  scheduleId: string;
  patientMedicationId: string;
  medicineName: string;
  strength: string | null;
  dosageForm: string | null;
  imageUrl?: string | null;
  doseAmount: string;
  doseUnit: string;
  doseInstruction: string;
  scheduledDateYmd: string;
  scheduledTime24: string;
  scheduledTime12: string;
  scheduledFor: string;
  period: SchedulePeriodGroup;
  status: DoseDisplayStatus;
  recordedAt: string | null;
  note: string | null;
}

export interface SerializedScheduleDayBucket {
  date: string;
  totalCount: number;
  takenCount: number;
  skippedCount: number;
  pendingCount: number;
  items: SerializedScheduledDoseItem[];
}

export interface SerializedDailyDosesResponse {
  startDate: string;
  daysCount: number;
  timezone: string;
  days: SerializedScheduleDayBucket[];
  summary: {
    total: number;
    taken: number;
    skipped: number;
    remaining: number;
  };
  nextDose: SerializedScheduledDoseItem | null;
}

export interface SerializedDoseHistoryItem {
  id: string;
  scheduleId: string;
  patientMedicationId: string;
  medicineName: string;
  strength: string | null;
  dosageForm: string | null;
  imageUrl?: string | null;
  doseAmount: string;
  doseUnit: string;
  scheduledDateYmd: string;
  scheduledTime12: string;
  scheduledFor: string;
  recordedAt: string | null;
  status: 'taken' | 'skipped' | 'missed';
  note: string | null;
}

export interface SerializedDoseHistoryResponse {
  items: SerializedDoseHistoryItem[];
  counts: {
    all: number;
    taken: number;
    skipped: number;
    missed: number;
  };
  hasMore: boolean;
  nextCursor: string | null;
}

export interface SerializedRecordDoseResult {
  doseEventId: string;
  scheduleId: string;
  patientMedicationId: string;
  scheduledFor: string;
  status: DoseEventStatus;
  recordedAt: string | null;
  stockDeducted: boolean;
  deductedQuantity: string;
  newStockRemaining: string;
  stockUnit: string;
  idempotentReplay: boolean;
}
