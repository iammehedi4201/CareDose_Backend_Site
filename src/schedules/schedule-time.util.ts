export type SchedulePeriodGroup = 'Morning' | 'Afternoon' | 'Evening' | 'Bedtime';
export type DoseDisplayStatus = 'upcoming' | 'due' | 'missed' | 'taken' | 'skipped';

const FREQUENCY_ALIAS_MAP: Record<string, string> = {
  daily: 'DAILY',
  once_daily: 'DAILY',
  'once daily': 'DAILY',
  twice_daily: 'TWICE_DAILY',
  'twice daily': 'TWICE_DAILY',
  three_times_daily: 'THREE_TIMES_DAILY',
  'three times daily': 'THREE_TIMES_DAILY',
  '3 times daily': 'THREE_TIMES_DAILY',
  thrice_daily: 'THREE_TIMES_DAILY',
  custom_times: 'CUSTOM_TIMES',
  'custom times': 'CUSTOM_TIMES',
  custom: 'CUSTOM_TIMES',
  every_x_hours: 'EVERY_X_HOURS',
  'every x hours': 'EVERY_X_HOURS',
  every_8_hours: 'EVERY_8_HOURS',
  'every 8 hours': 'EVERY_8_HOURS',
  alternate_days: 'ALTERNATE_DAYS',
  every_2_days: 'ALTERNATE_DAYS',
  'every 2 days': 'ALTERNATE_DAYS',
  'alternate days': 'ALTERNATE_DAYS',
  selected_weekdays: 'SELECTED_WEEKDAYS',
  'selected weekdays': 'SELECTED_WEEKDAYS',
  weekdays: 'SELECTED_WEEKDAYS',
  weekly: 'WEEKLY',
  as_needed: 'AS_NEEDED',
  'as needed': 'AS_NEEDED',
};

const UNIT_CANONICAL_MAP: Record<string, string> = {
  tablet: 'tablet',
  tablets: 'tablet',
  tab: 'tablet',
  tabs: 'tablet',
  capsule: 'capsule',
  capsules: 'capsule',
  cap: 'capsule',
  caps: 'capsule',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  vial: 'vial',
  vials: 'vial',
  ampoule: 'vial',
  ampoules: 'vial',
  puff: 'puff',
  puffs: 'puff',
  sachet: 'sachet',
  sachets: 'sachet',
  suppository: 'suppository',
  suppositories: 'suppository',
  piece: 'piece',
  pieces: 'piece',
  syringe: 'syringe',
  syringes: 'syringe',
  bag: 'bag',
  bags: 'bag',
  pen: 'pen',
  pens: 'pen',
  cartridge: 'cartridge',
  cartridges: 'cartridge',
  drop: 'drop',
  drops: 'drop',
  bottle: 'bottle',
  bottles: 'bottle',
  tube: 'tube',
  tubes: 'tube',
  patch: 'patch',
  patches: 'patch',
  unit: 'unit',
  units: 'unit',
};

export function normalizeScheduleFrequency(raw?: string | null): string {
  const cleaned = (raw ?? '').trim().toLowerCase();
  if (!cleaned) {
    return 'DAILY';
  }
  const direct = FREQUENCY_ALIAS_MAP[cleaned];
  if (direct) {
    return direct;
  }
  throw new Error(
    `Unsupported schedule frequency "${raw}". Use DAILY, TWICE_DAILY, THREE_TIMES_DAILY, CUSTOM_TIMES, EVERY_X_HOURS, EVERY_8_HOURS, ALTERNATE_DAYS, SELECTED_WEEKDAYS, WEEKLY, or AS_NEEDED.`,
  );
}

export function normalizeWeekdaysList(weekdays?: number[] | null): number[] {
  if (!Array.isArray(weekdays)) return [];
  const unique = new Set<number>();
  for (const day of weekdays) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error(`Invalid weekday "${day}". Expected integer 0 (Sun) through 6 (Sat).`);
    }
    unique.add(day);
  }
  return [...unique].sort((a, b) => a - b);
}

export function resolveIntervalHours(
  frequency: string,
  intervalHours?: number | null,
): number | null {
  const upper = frequency.toUpperCase();
  if (upper === 'EVERY_X_HOURS') {
    if (
      intervalHours === undefined ||
      intervalHours === null ||
      !Number.isInteger(intervalHours) ||
      intervalHours < 1 ||
      intervalHours > 24
    ) {
      throw new Error('Interval hours must be a whole number between 1 and 24.');
    }
    return intervalHours;
  }
  if (upper === 'EVERY_8_HOURS') {
    return intervalHours ?? 8;
  }
  return null;
}

export function normalizeScheduledTimeTo24Hour(raw: string): string {
  const value = raw.trim().toUpperCase();
  const match12 = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (match12) {
    let hours = Number(match12[1]);
    const mins = Number(match12[2]);
    const meridiem = match12[3];
    if (hours < 1 || hours > 12 || mins < 0 || mins > 59) {
      throw new Error(`Invalid scheduled time "${raw}".`);
    }
    if (meridiem === 'AM') {
      hours = hours === 12 ? 0 : hours;
    } else if (hours !== 12) {
      hours += 12;
    }
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  const match24 = value.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = Number(match24[1]);
    const mins = Number(match24[2]);
    if (hours < 0 || hours > 23 || mins < 0 || mins > 59) {
      throw new Error(`Invalid scheduled time "${raw}".`);
    }
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  throw new Error(`Invalid scheduled time "${raw}". Expected HH:mm or hh:mm AM/PM.`);
}

export function normalizeScheduledTimesList(times: string[]): string[] {
  if (!Array.isArray(times) || times.length === 0) {
    throw new Error('At least one scheduled time is required.');
  }
  const unique = new Set<string>();
  for (const t of times) {
    unique.add(normalizeScheduledTimeTo24Hour(t));
  }
  return [...unique].sort();
}

export function format24HourTo12Hour(time24: string): string {
  const norm = normalizeScheduledTimeTo24Hour(time24);
  const [hStr, mStr] = norm.split(':');
  const h = Number(hStr);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${mStr} ${meridiem}`;
}

export function classifySchedulePeriod(time24Or12: string): SchedulePeriodGroup {
  const norm = normalizeScheduledTimeTo24Hour(time24Or12);
  const hour = Number(norm.slice(0, 2));
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 21) return 'Evening';
  return 'Bedtime';
}

export function parseYmdDateString(ymd: string): { year: number; month: number; day: number } {
  const trimmed = ymd.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid date "${ymd}". Expected YYYY-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date "${ymd}".`);
  }
  return { year, month, day };
}

export function parseScheduleDateInputToYmd(raw: string, timeZone = 'Asia/Dhaka'): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    parseYmdDateString(trimmed);
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value "${raw}".`);
  }
  return formatLocalDateYmd(parsed, timeZone);
}

export function addDaysToYmd(ymd: string, deltaDays: number): string {
  const { year, month, day } = parseYmdDateString(ymd);
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function diffYmdDays(fromYmd: string, toYmd: string): number {
  const a = parseYmdDateString(fromYmd);
  const b = parseYmdDateString(toYmd);
  const msA = Date.UTC(a.year, a.month - 1, a.day);
  const msB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((msB - msA) / 86_400_000);
}

export function formatLocalDateYmd(date: Date, timeZone = 'Asia/Dhaka'): string {
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

export function formatLocalTime24(date: Date, timeZone = 'Asia/Dhaka'): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour === '24' ? '00' : hour}:${minute}`;
}

export function getTimeZoneOffsetMs(utcInstant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(utcInstant);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  const rawHour = read('hour');
  const localAsUtcMs = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    rawHour === 24 ? 0 : rawHour,
    read('minute'),
    read('second'),
  );
  // Strip sub-second precision from utcInstant to keep exact integer minute offsets
  const utcSecMs = Math.floor(utcInstant.getTime() / 1000) * 1000;
  return localAsUtcMs - utcSecMs;
}

export function zonedDateTimeToUtc(
  ymd: string,
  time24: string,
  timeZone = 'Asia/Dhaka',
): Date {
  const { year, month, day } = parseYmdDateString(ymd);
  const normTime = normalizeScheduledTimeTo24Hour(time24);
  const [hourStr, minStr] = normTime.split(':');
  const targetLocalAsUtcMs = Date.UTC(
    year,
    month - 1,
    day,
    Number(hourStr),
    Number(minStr),
    0,
    0,
  );

  // Two-pass convergence handles DST transitions cleanly
  const firstGuess = new Date(targetLocalAsUtcMs - getTimeZoneOffsetMs(new Date(targetLocalAsUtcMs), timeZone));
  const secondOffset = getTimeZoneOffsetMs(firstGuess, timeZone);
  return new Date(targetLocalAsUtcMs - secondOffset);
}

export function getLocalDayRangeUtc(
  ymd: string,
  timeZone = 'Asia/Dhaka',
): { startUtc: Date; endUtc: Date } {
  const startUtc = zonedDateTimeToUtc(ymd, '00:00', timeZone);
  const nextYmd = addDaysToYmd(ymd, 1);
  const endUtc = zonedDateTimeToUtc(nextYmd, '00:00', timeZone);
  return { startUtc, endUtc };
}

export function isScheduleActiveOnLocalDate(
  schedule: {
    status: string;
    frequency: string;
    startDate: Date;
    endDate: Date | null;
    weekdays?: number[] | null;
  },
  targetYmd: string,
  timeZone = 'Asia/Dhaka',
): boolean {
  if (schedule.status !== 'ACTIVE') {
    return false;
  }
  const freq = schedule.frequency.toUpperCase();
  if (freq === 'AS_NEEDED') {
    return false;
  }

  const startYmd = formatLocalDateYmd(schedule.startDate, timeZone);
  if (targetYmd < startYmd) {
    return false;
  }
  if (schedule.endDate) {
    const endYmd = formatLocalDateYmd(schedule.endDate, timeZone);
    if (targetYmd > endYmd) {
      return false;
    }
  }

  const dayDiff = diffYmdDays(startYmd, targetYmd);
  if (dayDiff < 0) return false;
  if (freq === 'ALTERNATE_DAYS') {
    return dayDiff % 2 === 0;
  }
  if (freq === 'WEEKLY') {
    return dayDiff % 7 === 0;
  }
  if (freq === 'SELECTED_WEEKDAYS') {
    const allowed = Array.isArray(schedule.weekdays) ? schedule.weekdays : [];
    if (allowed.length === 0) return false;
    const { year, month, day } = parseYmdDateString(targetYmd);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return allowed.includes(weekday);
  }
  return true;
}

export function getScheduleTimesForLocalDate(
  schedule: {
    status: string;
    frequency: string;
    startDate: Date;
    endDate: Date | null;
    scheduledTimes: string[];
    intervalHours?: number | null;
    weekdays?: number[] | null;
  },
  targetYmd: string,
  timeZone = 'Asia/Dhaka',
): string[] {
  if (!isScheduleActiveOnLocalDate(schedule, targetYmd, timeZone)) {
    return [];
  }
  const freq = schedule.frequency.toUpperCase();
  const baseTimes = [
    ...new Set(schedule.scheduledTimes.map(normalizeScheduledTimeTo24Hour)),
  ].sort();
  if (baseTimes.length === 0) {
    return [];
  }

  if (
    freq === 'EVERY_X_HOURS' ||
    (freq === 'EVERY_8_HOURS' && baseTimes.length === 1)
  ) {
    const stepHours = schedule.intervalHours ?? 8;
    const stepMins = Math.max(1, stepHours) * 60;
    const [hStr, mStr] = baseTimes[0].split(':');
    const firstMin = Number(hStr) * 60 + Number(mStr);
    const startYmd = formatLocalDateYmd(schedule.startDate, timeZone);
    const diff = diffYmdDays(startYmd, targetYmd);
    const dayStartMin = diff * 1440;
    const dayEndMin = (diff + 1) * 1440;
    const kStart = Math.max(0, Math.ceil((dayStartMin - firstMin) / stepMins));

    const expanded = new Set<string>();
    for (let k = kStart; ; k += 1) {
      const absMin = firstMin + k * stepMins;
      if (absMin >= dayEndMin) break;
      const minOfDay = absMin - dayStartMin;
      const hh = Math.floor(minOfDay / 60);
      const mm = minOfDay % 60;
      expanded.add(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    }
    return [...expanded].sort();
  }

  return baseTimes;
}

export function normalizeStockUnitToken(unit?: string | null): string {
  const cleaned = (unit ?? '').trim().toLowerCase();
  return UNIT_CANONICAL_MAP[cleaned] ?? cleaned;
}

export function canDeductDoseUnitFromStockUnit(
  doseUnit?: string | null,
  stockUnit?: string | null,
): boolean {
  const d = normalizeStockUnitToken(doseUnit);
  const s = normalizeStockUnitToken(stockUnit);
  if (!d || !s) return false;
  return d === s;
}

export const DOSE_DUE_LEAD_MS = 15 * 60_000;
export const DOSE_GRACE_PERIOD_MS = 60 * 60_000;

export function computeDoseDisplayStatus(
  scheduledFor: Date,
  recordedStatus: 'PLANNED' | 'TAKEN' | 'SKIPPED' | null | undefined,
  now: Date = new Date(),
): DoseDisplayStatus {
  if (recordedStatus === 'TAKEN') return 'taken';
  if (recordedStatus === 'SKIPPED') return 'skipped';

  const diffMs = now.getTime() - scheduledFor.getTime();
  if (diffMs > DOSE_GRACE_PERIOD_MS) {
    return 'missed';
  }
  if (diffMs >= -DOSE_DUE_LEAD_MS) {
    return 'due';
  }
  return 'upcoming';
}
