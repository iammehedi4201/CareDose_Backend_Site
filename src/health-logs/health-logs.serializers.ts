import { GlucoseUnit, HealthReading, ReadingContext } from '@prisma/client';
import { formatDecimalFixed, normalizeOptionalText } from '../imports/catalogue-dataset.types';
import {
  format24HourTo12Hour,
  formatLocalDateYmd,
  formatLocalTime24,
} from '../schedules/schedule-time.util';

export const HEALTH_LOG_NON_INTERPRETATION_DISCLAIMER =
  'Readings are stored exactly as entered for personal tracking. CareDose does not diagnose or interpret blood glucose values.';

const MG_DL_PER_MMOL_L = 18.0182;

export function formatGlucoseUnitLabel(unit: GlucoseUnit): 'mg/dL' | 'mmol/L' {
  return unit === GlucoseUnit.MMOL_L ? 'mmol/L' : 'mg/dL';
}

export function formatReadingContextLabel(
  context: ReadingContext,
): 'Fasting' | 'Before meal' | 'After meal' | 'Other' {
  switch (context) {
    case ReadingContext.FASTING:
      return 'Fasting';
    case ReadingContext.BEFORE_MEAL:
      return 'Before meal';
    case ReadingContext.AFTER_MEAL:
      return 'After meal';
    case ReadingContext.OTHER:
    default:
      return 'Other';
  }
}

export function formatCompactNumericDisplay(raw: number | string): string {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return '0';
  const fixed2 = Number(num.toFixed(2));
  if (Number.isInteger(fixed2)) {
    return String(fixed2);
  }
  return String(fixed2);
}

/**
 * Converts a blood glucose reading between mg/dL and mmol/L (1 mmol/L = 18.0182 mg/dL)
 * for uniform chart axis scaling while preserving the original entered value on each log row.
 */
export function convertGlucoseValue(
  value: number,
  fromUnit: GlucoseUnit,
  toUnit: GlucoseUnit,
): number {
  if (!Number.isFinite(value)) return 0;
  if (fromUnit === toUnit) {
    return Number(value.toFixed(2));
  }
  if (fromUnit === GlucoseUnit.MMOL_L && toUnit === GlucoseUnit.MG_DL) {
    return Math.round(value * MG_DL_PER_MMOL_L);
  }
  return Number((value / MG_DL_PER_MMOL_L).toFixed(1));
}

export interface SerializedHealthReadingItem {
  id: string;
  patientId: string;
  value: string;
  displayValue: string;
  unit: GlucoseUnit;
  unitLabel: 'mg/dL' | 'mmol/L';
  context: ReadingContext;
  contextLabel: 'Fasting' | 'Before meal' | 'After meal' | 'Other';
  measuredAt: string;
  measuredDateYmd: string;
  measuredTime24: string;
  measuredTime12: string;
  note: string | null;
  createdAt: string;
}

export interface SerializedHealthChartPoint {
  id: string;
  measuredDateYmd: string;
  shortDateLabel: string;
  measuredTime12: string;
  contextLabel: string;
  originalValue: string;
  originalUnitLabel: 'mg/dL' | 'mmol/L';
  convertedValue: number;
  unitLabel: 'mg/dL' | 'mmol/L';
}

export interface SerializedHealthReadingsResponse {
  patientId: string;
  timezone: string;
  preferredUnit: GlucoseUnit;
  preferredUnitLabel: 'mg/dL' | 'mmol/L';
  items: SerializedHealthReadingItem[];
  latestReading: SerializedHealthReadingItem | null;
  chartPoints: SerializedHealthChartPoint[];
  totalCount: number;
  nextCursor: string | null;
  disclaimer: string;
}

export function serializeHealthReading(
  reading: HealthReading,
  timeZone = 'Asia/Dhaka',
): SerializedHealthReadingItem {
  const fixedValue = formatDecimalFixed(reading.value) ?? '0.00';
  const measuredTime24 = formatLocalTime24(reading.measuredAt, timeZone);

  return {
    id: reading.id,
    patientId: reading.patientId,
    value: fixedValue,
    displayValue: formatCompactNumericDisplay(fixedValue),
    unit: reading.unit,
    unitLabel: formatGlucoseUnitLabel(reading.unit),
    context: reading.context,
    contextLabel: formatReadingContextLabel(reading.context),
    measuredAt: reading.measuredAt.toISOString(),
    measuredDateYmd: formatLocalDateYmd(reading.measuredAt, timeZone),
    measuredTime24,
    measuredTime12: format24HourTo12Hour(measuredTime24),
    note: normalizeOptionalText(reading.note),
    createdAt: reading.createdAt.toISOString(),
  };
}

export function buildHealthChartPoints(
  recentReadingsNewestFirst: HealthReading[],
  preferredUnit: GlucoseUnit,
  timeZone = 'Asia/Dhaka',
): SerializedHealthChartPoint[] {
  const preferredUnitLabel = formatGlucoseUnitLabel(preferredUnit);
  return [...recentReadingsNewestFirst]
    .slice(0, 7)
    .reverse()
    .map((reading) => {
      const serialized = serializeHealthReading(reading, timeZone);
      const rawNum = Number(serialized.value);
      const convertedValue = convertGlucoseValue(
        rawNum,
        reading.unit,
        preferredUnit,
      );
      return {
        id: serialized.id,
        measuredDateYmd: serialized.measuredDateYmd,
        shortDateLabel: serialized.measuredDateYmd.slice(5),
        measuredTime12: serialized.measuredTime12,
        contextLabel: serialized.contextLabel,
        originalValue: serialized.displayValue,
        originalUnitLabel: serialized.unitLabel,
        convertedValue,
        unitLabel: preferredUnitLabel,
      };
    });
}
