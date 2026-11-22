import { MedicationSchedule, ScheduleStatus } from '@prisma/client';
import { formatDecimalFixed } from '../imports/catalogue-dataset.types';
import { format24HourTo12Hour, formatLocalDateYmd } from './schedule-time.util';

export type MedicationScheduleWithMed = MedicationSchedule & {
  patientMedication?: {
    id: string;
    patientId: string;
    name: string;
    strength: string | null;
    dosageForm: string | null;
    stockUnit: string;
    personalInstructions: string;
  };
};

export interface SerializedMedicationSchedule {
  id: string;
  patientMedicationId: string;
  doseAmount: string;
  doseUnit: string;
  frequency: string;
  scheduledTimes: string[];
  scheduledTimes12h: string[];
  startDate: string;
  startDateYmd: string;
  endDate: string | null;
  endDateYmd: string | null;
  instructions: string | null;
  remindersEnabled: boolean;
  status: ScheduleStatus;
  createdAt: string;
  updatedAt: string;
  medication?: {
    id: string;
    patientId: string;
    name: string;
    strength: string | null;
    dosageForm: string | null;
    stockUnit: string;
    personalInstructions: string;
  };
}

export function inferDefaultDoseUnit(stockUnit?: string | null): string {
  const norm = (stockUnit ?? '').trim().toLowerCase();
  if (norm === 'tablets') return 'tablet';
  if (norm === 'capsules') return 'capsule';
  if (norm === 'vials') return 'vial';
  if (norm === 'puffs') return 'puff';
  if (norm === 'ml') return 'ml';
  if (norm === 'bottle') return 'drop';
  return norm || 'tablet';
}

export function serializeSchedule(
  schedule: MedicationScheduleWithMed,
  timeZone = 'Asia/Dhaka',
): SerializedMedicationSchedule {
  const scheduledTimes = [...schedule.scheduledTimes].sort();
  return {
    id: schedule.id,
    patientMedicationId: schedule.patientMedicationId,
    doseAmount: formatDecimalFixed(schedule.doseAmount) ?? '1.00',
    doseUnit: schedule.doseUnit,
    frequency: schedule.frequency,
    scheduledTimes,
    scheduledTimes12h: scheduledTimes.map(format24HourTo12Hour),
    startDate: schedule.startDate.toISOString(),
    startDateYmd: formatLocalDateYmd(schedule.startDate, timeZone),
    endDate: schedule.endDate ? schedule.endDate.toISOString() : null,
    endDateYmd: schedule.endDate ? formatLocalDateYmd(schedule.endDate, timeZone) : null,
    instructions: schedule.instructions,
    remindersEnabled: schedule.remindersEnabled,
    status: schedule.status,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
    ...(schedule.patientMedication
      ? {
          medication: {
            id: schedule.patientMedication.id,
            patientId: schedule.patientMedication.patientId,
            name: schedule.patientMedication.name,
            strength: schedule.patientMedication.strength,
            dosageForm: schedule.patientMedication.dosageForm,
            stockUnit: schedule.patientMedication.stockUnit,
            personalInstructions: schedule.patientMedication.personalInstructions,
          },
        }
      : {}),
  };
}
