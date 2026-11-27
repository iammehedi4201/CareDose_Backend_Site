import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DoseEventStatus,
  InventoryTransactionType,
  MedicationStatus,
  Prisma,
  ScheduleStatus,
} from '@prisma/client';
import { isValidUuid } from '../common/utils/uuid.util';
import { formatDecimalFixed, normalizeOptionalText } from '../imports/catalogue-dataset.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  addDaysToYmd,
  canDeductDoseUnitFromStockUnit,
  classifySchedulePeriod,
  computeDoseDisplayStatus,
  format24HourTo12Hour,
  formatLocalDateYmd,
  formatLocalTime24,
  getLocalDayRangeUtc,
  getScheduleTimesForLocalDate,
  parseYmdDateString,
  zonedDateTimeToUtc,
} from '../schedules/schedule-time.util';
import {
  GetDailyDosesQueryDto,
  ListDoseHistoryQueryDto,
  RecordDoseEventDto,
} from './dto/dose-logs.dto';
import {
  SerializedDailyDosesResponse,
  SerializedDoseHistoryItem,
  SerializedDoseHistoryResponse,
  SerializedRecordDoseResult,
  SerializedScheduleDayBucket,
  SerializedScheduledDoseItem,
} from './dose-logs.serializers';

interface HistoryCursorPayload {
  scheduledFor: string;
  id: string;
}

function encodeHistoryCursor(payload: HistoryCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeHistoryCursor(raw?: string): HistoryCursorPayload | null {
  if (!raw || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw.trim(), 'base64url').toString('utf8'),
    ) as Partial<HistoryCursorPayload>;
    if (
      typeof parsed.scheduledFor === 'string' &&
      typeof parsed.id === 'string' &&
      parsed.id.trim().length > 0 &&
      !Number.isNaN(new Date(parsed.scheduledFor).getTime())
    ) {
      return { scheduledFor: parsed.scheduledFor, id: parsed.id };
    }
  } catch {
    // Fall through to invalid cursor error
  }
  throw new BadRequestException('Invalid history pagination cursor.');
}

function formatDoseInstruction(
  doseAmount: string,
  doseUnit: string,
  instructions?: string | null,
  fallbackInstructions?: string | null,
): string {
  const numAmount = Number(doseAmount);
  const cleanAmount = Number.isFinite(numAmount)
    ? Number.isInteger(numAmount)
      ? String(numAmount)
      : String(Number(numAmount.toFixed(2)))
    : doseAmount;
  const amountLabel = `${cleanAmount} ${doseUnit}`;
  const note = (instructions || fallbackInstructions || '').trim();
  return note ? `${amountLabel} · ${note}` : amountLabel;
}

@Injectable()
export class DoseLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailyOrWeekDoses(
    patientId: string,
    timeZone: string,
    query: GetDailyDosesQueryDto,
    now: Date = new Date(),
  ): Promise<SerializedDailyDosesResponse> {
    const tz = timeZone || 'Asia/Dhaka';
    const startDate = this.parseDateOrToday(query.date, tz);
    const daysCount = query.days ?? 1;
    const endDateExclusive = addDaysToYmd(startDate, daysCount);

    const { startUtc } = getLocalDayRangeUtc(startDate, tz);
    const { startUtc: endUtc } = getLocalDayRangeUtc(endDateExclusive, tz);

    const [schedules, doseEvents] = await Promise.all([
      this.prisma.medicationSchedule.findMany({
        where: {
          patientMedication: {
            patientId,
          },
        },
        include: {
          patientMedication: {
            select: {
              id: true,
              name: true,
              strength: true,
              dosageForm: true,
              personalInstructions: true,
              status: true,
              catalogueBrand: {
                select: {
                  images: {
                    orderBy: { checkedAt: 'desc' },
                    take: 1,
                    select: { imageUrl: true },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.doseEvent.findMany({
        where: {
          patientMedication: { patientId },
          scheduledFor: {
            gte: startUtc,
            lt: endUtc,
          },
        },
        include: {
          schedule: {
            select: {
              doseAmount: true,
              doseUnit: true,
              instructions: true,
            },
          },
          patientMedication: {
            select: {
              id: true,
              name: true,
              strength: true,
              dosageForm: true,
              personalInstructions: true,
              catalogueBrand: {
                select: {
                  images: {
                    orderBy: { checkedAt: 'desc' },
                    take: 1,
                    select: { imageUrl: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const eventByOccurrenceKey = new Map<string, (typeof doseEvents)[number]>();
    for (const ev of doseEvents) {
      const key = `${ev.scheduleId}:${ev.scheduledFor.toISOString()}`;
      eventByOccurrenceKey.set(key, ev);
    }

    const consumedEventKeys = new Set<string>();
    const days: SerializedScheduleDayBucket[] = [];

    for (let offset = 0; offset < daysCount; offset += 1) {
      const ymd = addDaysToYmd(startDate, offset);
      const dayItems: SerializedScheduledDoseItem[] = [];

      for (const sched of schedules) {
        if (sched.patientMedication.status !== MedicationStatus.ACTIVE) {
          continue;
        }
        const dayTimes = getScheduleTimesForLocalDate(sched, ymd, tz);
        if (dayTimes.length === 0) {
          continue;
        }
        const doseAmountStr = formatDecimalFixed(sched.doseAmount) ?? '1.00';
        for (const time24 of dayTimes) {
          const scheduledFor = zonedDateTimeToUtc(ymd, time24, tz);
          const occurrenceKey = `${sched.id}:${scheduledFor.toISOString()}`;
          if (consumedEventKeys.has(occurrenceKey)) {
            continue;
          }
          consumedEventKeys.add(occurrenceKey);

          const recorded = eventByOccurrenceKey.get(occurrenceKey);
          const status = computeDoseDisplayStatus(scheduledFor, recorded?.status, now);

          dayItems.push({
            occurrenceKey,
            doseEventId: recorded?.id ?? null,
            scheduleId: sched.id,
            patientMedicationId: sched.patientMedicationId,
            medicineName: sched.patientMedication.name,
            strength: sched.patientMedication.strength,
            dosageForm: sched.patientMedication.dosageForm,
            imageUrl:
              (
                sched.patientMedication as {
                  catalogueBrand?: { images?: Array<{ imageUrl: string }> } | null;
                }
              ).catalogueBrand?.images?.[0]?.imageUrl ?? null,
            doseAmount: doseAmountStr,
            doseUnit: sched.doseUnit,
            doseInstruction: formatDoseInstruction(
              doseAmountStr,
              sched.doseUnit,
              sched.instructions,
              sched.patientMedication.personalInstructions,
            ),
            scheduledDateYmd: ymd,
            scheduledTime24: time24,
            scheduledTime12: format24HourTo12Hour(time24),
            scheduledFor: scheduledFor.toISOString(),
            period: classifySchedulePeriod(time24),
            status,
            recordedAt: recorded?.recordedAt ? recorded.recordedAt.toISOString() : null,
            note: recorded?.note ?? null,
          });
        }
      }

      // Include any previously recorded Taken/Skipped events on this day whose schedule changed later
      for (const ev of doseEvents) {
        const key = `${ev.scheduleId}:${ev.scheduledFor.toISOString()}`;
        if (consumedEventKeys.has(key)) continue;
        if (ev.status === DoseEventStatus.PLANNED) continue;

        const evYmd = formatLocalDateYmd(ev.scheduledFor, tz);
        if (evYmd !== ymd) continue;

        consumedEventKeys.add(key);
        const time24 = formatLocalTime24(ev.scheduledFor, tz);
        const doseAmountStr = formatDecimalFixed(ev.schedule.doseAmount) ?? '1.00';

        dayItems.push({
          occurrenceKey: key,
          doseEventId: ev.id,
          scheduleId: ev.scheduleId,
          patientMedicationId: ev.patientMedicationId,
          medicineName: ev.patientMedication.name,
          strength: ev.patientMedication.strength,
          dosageForm: ev.patientMedication.dosageForm,
          imageUrl:
            (
              ev.patientMedication as {
                catalogueBrand?: { images?: Array<{ imageUrl: string }> } | null;
              }
            ).catalogueBrand?.images?.[0]?.imageUrl ?? null,
          doseAmount: doseAmountStr,
          doseUnit: ev.schedule.doseUnit,
          doseInstruction: formatDoseInstruction(
            doseAmountStr,
            ev.schedule.doseUnit,
            ev.schedule.instructions,
            ev.patientMedication.personalInstructions,
          ),
          scheduledDateYmd: evYmd,
          scheduledTime24: time24,
          scheduledTime12: format24HourTo12Hour(time24),
          scheduledFor: ev.scheduledFor.toISOString(),
          period: classifySchedulePeriod(time24),
          status: computeDoseDisplayStatus(ev.scheduledFor, ev.status, now),
          recordedAt: ev.recordedAt ? ev.recordedAt.toISOString() : null,
          note: ev.note,
        });
      }

      dayItems.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

      const takenCount = dayItems.filter((i) => i.status === 'taken').length;
      const skippedCount = dayItems.filter((i) => i.status === 'skipped').length;
      const pendingCount = dayItems.length - takenCount - skippedCount;

      days.push({
        date: ymd,
        totalCount: dayItems.length,
        takenCount,
        skippedCount,
        pendingCount,
        items: dayItems,
      });
    }

    const firstDayItems = days[0]?.items ?? [];
    const total = firstDayItems.length;
    const taken = days[0]?.takenCount ?? 0;
    const skipped = days[0]?.skippedCount ?? 0;
    const remaining = firstDayItems.filter(
      (i) => i.status === 'upcoming' || i.status === 'due',
    ).length;

    const allWindowItems = days.flatMap((d) => d.items);
    const nextDose =
      allWindowItems.find(
        (i) => i.status === 'due' || i.status === 'upcoming',
      ) ?? null;

    return {
      startDate,
      daysCount,
      timezone: tz,
      days,
      summary: { total, taken, skipped, remaining },
      nextDose,
    };
  }

  async recordOccurrenceForPatient(
    patientId: string,
    dto: RecordDoseEventDto,
    now: Date = new Date(),
  ): Promise<SerializedRecordDoseResult> {
    const scheduledDate = new Date(dto.scheduledFor);
    if (Number.isNaN(scheduledDate.getTime())) {
      throw new BadRequestException('Invalid scheduledFor ISO timestamp.');
    }

    const schedule = await this.prisma.medicationSchedule.findUnique({
      where: { id: dto.scheduleId },
      include: {
        patientMedication: {
          select: {
            id: true,
            patientId: true,
            status: true,
          },
        },
      },
    });
    if (!schedule) {
      throw new NotFoundException('Medication schedule not found');
    }
    if (schedule.patientMedication.patientId !== patientId) {
      throw new ForbiddenException(
        'This schedule does not belong to the specified patient profile.',
      );
    }

    return this.executeAtomicDoseAction(
      {
        scheduleId: schedule.id,
        patientMedicationId: schedule.patientMedicationId,
        scheduledFor: scheduledDate,
        action: dto.action,
        note: normalizeOptionalText(dto.note),
      },
      now,
    );
  }

  async markExistingDoseEvent(
    userId: string,
    doseEventId: string,
    action: 'TAKEN' | 'SKIPPED',
    note?: string,
    now: Date = new Date(),
  ): Promise<SerializedRecordDoseResult> {
    if (!isValidUuid(doseEventId)) {
      throw new BadRequestException('Invalid dose event UUID parameter');
    }

    const existing = await this.prisma.doseEvent.findUnique({
      where: { id: doseEventId },
      include: {
        patientMedication: {
          select: {
            id: true,
            patientId: true,
            patient: {
              select: { ownerUserId: true },
            },
          },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Dose event not found');
    }
    if (existing.patientMedication.patient.ownerUserId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to modify this dose event.',
      );
    }

    return this.executeAtomicDoseAction(
      {
        scheduleId: existing.scheduleId,
        patientMedicationId: existing.patientMedicationId,
        scheduledFor: existing.scheduledFor,
        action,
        note: normalizeOptionalText(note),
      },
      now,
    );
  }

  async listDoseHistory(
    patientId: string,
    timeZone: string,
    query: ListDoseHistoryQueryDto,
    now: Date = new Date(),
  ): Promise<SerializedDoseHistoryResponse> {
    const tz = timeZone || 'Asia/Dhaka';
    const limit = query.limit ?? 20;
    const cursor = decodeHistoryCursor(query.cursor);
    const fromYmd = query.from ? this.parseDateOrToday(query.from, tz) : null;
    const toYmd = query.to ? this.parseDateOrToday(query.to, tz) : null;

    const baseConditions: Prisma.DoseEventWhereInput[] = [
      {
        patientMedication: {
          patientId,
        },
      },
      {
        status: {
          in: [DoseEventStatus.TAKEN, DoseEventStatus.SKIPPED],
        },
      },
    ];

    if (query.medicationId) {
      baseConditions.push({ patientMedicationId: query.medicationId });
    }
    if (fromYmd) {
      const { startUtc } = getLocalDayRangeUtc(fromYmd, tz);
      baseConditions.push({ scheduledFor: { gte: startUtc } });
    }
    if (toYmd) {
      const { endUtc } = getLocalDayRangeUtc(toYmd, tz);
      baseConditions.push({ scheduledFor: { lt: endUtc } });
    }

    const activeSchedulesPromise =
      typeof this.prisma.medicationSchedule?.findMany === 'function'
        ? this.prisma.medicationSchedule.findMany({
            where: {
              status: ScheduleStatus.ACTIVE,
              patientMedication: {
                patientId,
                status: MedicationStatus.ACTIVE,
                ...(query.medicationId ? { id: query.medicationId } : {}),
              },
            },
            include: {
              patientMedication: {
                select: {
                  id: true,
                  name: true,
                  strength: true,
                  dosageForm: true,
                  status: true,
                },
              },
            },
          })
        : Promise.resolve([]);

    const [recordedRows, activeSchedules] = await Promise.all([
      this.prisma.doseEvent.findMany({
        where: { AND: baseConditions },
        include: {
          schedule: {
            select: {
              doseAmount: true,
              doseUnit: true,
            },
          },
          patientMedication: {
            select: {
              name: true,
              strength: true,
              dosageForm: true,
            },
          },
        },
        orderBy: [{ scheduledFor: 'desc' }, { id: 'desc' }],
      }),
      activeSchedulesPromise,
    ]);

    const recordedSlotKeys = new Set<string>();
    const recordedItems: SerializedDoseHistoryItem[] = [];
    for (const row of recordedRows) {
      recordedSlotKeys.add(`${row.scheduleId}:${row.scheduledFor.toISOString()}`);
      const ymd = formatLocalDateYmd(row.scheduledFor, tz);
      if (fromYmd && ymd < fromYmd) continue;
      if (toYmd && ymd > toYmd) continue;
      const time24 = formatLocalTime24(row.scheduledFor, tz);
      recordedItems.push({
        id: row.id,
        scheduleId: row.scheduleId,
        patientMedicationId: row.patientMedicationId,
        medicineName: row.patientMedication.name,
        strength: row.patientMedication.strength,
        dosageForm: row.patientMedication.dosageForm,
        doseAmount: formatDecimalFixed(row.schedule.doseAmount) ?? '1.00',
        doseUnit: row.schedule.doseUnit,
        scheduledDateYmd: ymd,
        scheduledTime12: format24HourTo12Hour(time24),
        scheduledFor: row.scheduledFor.toISOString(),
        recordedAt: row.recordedAt ? row.recordedAt.toISOString() : null,
        status: row.status === DoseEventStatus.TAKEN ? 'taken' : 'skipped',
        note: row.note,
      });
    }

    const missedItems = this.computeMissedHistoryItems({
      schedules: activeSchedules,
      recordedSlotKeys,
      timeZone: tz,
      fromYmd,
      toYmd,
      medicationId: query.medicationId,
      now,
    });

    const allItems = [...recordedItems, ...missedItems].sort((a, b) => {
      const byTime = b.scheduledFor.localeCompare(a.scheduledFor);
      return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
    });

    let takenCount = 0;
    let skippedCount = 0;
    let missedCount = 0;
    for (const item of allItems) {
      if (item.status === 'taken') takenCount += 1;
      else if (item.status === 'skipped') skippedCount += 1;
      else missedCount += 1;
    }

    const statusFilter =
      query.status === 'TAKEN'
        ? 'taken'
        : query.status === 'SKIPPED'
          ? 'skipped'
          : query.status === 'MISSED'
            ? 'missed'
            : null;

    const statusFiltered = statusFilter
      ? allItems.filter((item) => item.status === statusFilter)
      : allItems;

    const pagedPool = cursor
      ? statusFiltered.filter(
          (item) =>
            item.scheduledFor < cursor.scheduledFor ||
            (item.scheduledFor === cursor.scheduledFor && item.id < cursor.id),
        )
      : statusFiltered;

    const hasMore = pagedPool.length > limit;
    const items = pagedPool.slice(0, limit);
    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? encodeHistoryCursor({
            scheduledFor: lastItem.scheduledFor,
            id: lastItem.id,
          })
        : null;

    return {
      items,
      counts: {
        all: allItems.length,
        taken: takenCount,
        skipped: skippedCount,
        missed: missedCount,
      },
      hasMore,
      nextCursor,
    };
  }

  private computeMissedHistoryItems(input: {
    schedules: Array<{
      id: string;
      patientMedicationId: string;
      doseAmount: Prisma.Decimal;
      doseUnit: string;
      frequency: string;
      intervalHours: number | null;
      weekdays: number[];
      scheduledTimes: string[];
      startDate: Date;
      endDate: Date | null;
      status: ScheduleStatus;
      patientMedication: {
        id: string;
        name: string;
        strength: string | null;
        dosageForm: string | null;
        status: MedicationStatus;
      };
    }>;
    recordedSlotKeys: Set<string>;
    timeZone: string;
    fromYmd: string | null;
    toYmd: string | null;
    medicationId?: string;
    now: Date;
  }): SerializedDoseHistoryItem[] {
    const todayYmd = formatLocalDateYmd(input.now, input.timeZone);
    const scanToYmd =
      input.toYmd && input.toYmd < todayYmd ? input.toYmd : todayYmd;
    const defaultScanStartYmd = addDaysToYmd(todayYmd, -30);
    const earliestSafeYmd = addDaysToYmd(scanToYmd, -120);
    const lowerBoundYmd = input.fromYmd
      ? input.fromYmd < earliestSafeYmd
        ? earliestSafeYmd
        : input.fromYmd
      : defaultScanStartYmd;

    if (lowerBoundYmd > scanToYmd) {
      return [];
    }

    const missed: SerializedDoseHistoryItem[] = [];
    const seenKeys = new Set<string>();

    for (const sched of input.schedules) {
      if (sched.status !== ScheduleStatus.ACTIVE) continue;
      if (sched.patientMedication.status === MedicationStatus.ARCHIVED) continue;
      if (input.medicationId && sched.patientMedicationId !== input.medicationId) {
        continue;
      }

      const schedStartYmd = formatLocalDateYmd(sched.startDate, input.timeZone);
      const schedEndYmd = sched.endDate
        ? formatLocalDateYmd(sched.endDate, input.timeZone)
        : scanToYmd;
      const endScanYmd = scanToYmd < schedEndYmd ? scanToYmd : schedEndYmd;
      let cursorYmd = lowerBoundYmd > schedStartYmd ? lowerBoundYmd : schedStartYmd;

      while (cursorYmd <= endScanYmd) {
        const times = getScheduleTimesForLocalDate(sched, cursorYmd, input.timeZone);
        for (const time24 of times) {
          const scheduledDate = zonedDateTimeToUtc(
            cursorYmd,
            time24,
            input.timeZone,
          );
          const scheduledIso = scheduledDate.toISOString();
          const slotKey = `${sched.id}:${scheduledIso}`;
          if (seenKeys.has(slotKey) || input.recordedSlotKeys.has(slotKey)) {
            continue;
          }
          if (computeDoseDisplayStatus(scheduledDate, null, input.now) !== 'missed') {
            continue;
          }
          seenKeys.add(slotKey);
          missed.push({
            id: `missed:${slotKey}`,
            scheduleId: sched.id,
            patientMedicationId: sched.patientMedicationId,
            medicineName: sched.patientMedication.name,
            strength: sched.patientMedication.strength,
            dosageForm: sched.patientMedication.dosageForm,
            doseAmount: formatDecimalFixed(sched.doseAmount) ?? '1.00',
            doseUnit: sched.doseUnit,
            scheduledDateYmd: cursorYmd,
            scheduledTime12: format24HourTo12Hour(time24),
            scheduledFor: scheduledIso,
            recordedAt: null,
            status: 'missed',
            note: null,
          });
        }
        cursorYmd = addDaysToYmd(cursorYmd, 1);
      }
    }

    return missed;
  }

  private async ensureDoseEventRow(input: {
    scheduleId: string;
    patientMedicationId: string;
    scheduledFor: Date;
  }) {
    const whereUnique = {
      scheduleId_scheduledFor: {
        scheduleId: input.scheduleId,
        scheduledFor: input.scheduledFor,
      },
    };
    const existing = await this.prisma.doseEvent.findUnique({
      where: whereUnique,
      select: { id: true, status: true, recordedAt: true },
    });
    if (existing) {
      return existing;
    }
    try {
      return await this.prisma.doseEvent.create({
        data: {
          scheduleId: input.scheduleId,
          patientMedicationId: input.patientMedicationId,
          scheduledFor: input.scheduledFor,
          status: DoseEventStatus.PLANNED,
        },
        select: { id: true, status: true, recordedAt: true },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await this.prisma.doseEvent.findUnique({
          where: whereUnique,
          select: { id: true, status: true, recordedAt: true },
        });
        if (raced) return raced;
      }
      throw err;
    }
  }

  private async executeAtomicDoseAction(
    input: {
      scheduleId: string;
      patientMedicationId: string;
      scheduledFor: Date;
      action: 'TAKEN' | 'SKIPPED';
      note: string | null;
    },
    now: Date,
  ): Promise<SerializedRecordDoseResult> {
    const ensured = await this.ensureDoseEventRow(input);

    if (ensured.status === DoseEventStatus.TAKEN) {
      if (input.action === 'SKIPPED') {
        throw new ConflictException(
          'Dose is already recorded as taken and cannot be skipped.',
        );
      }

      if (typeof this.prisma.patientMedication?.findUnique === 'function') {
        const med = await this.prisma.patientMedication.findUnique({
          where: { id: input.patientMedicationId },
          select: { id: true, stockRemaining: true, stockUnit: true },
        });
        if (med) {
          return {
            doseEventId: ensured.id,
            scheduleId: input.scheduleId,
            patientMedicationId: input.patientMedicationId,
            scheduledFor: input.scheduledFor.toISOString(),
            status: DoseEventStatus.TAKEN,
            recordedAt: (ensured.recordedAt ?? now).toISOString(),
            stockDeducted: false,
            deductedQuantity: '0.00',
            newStockRemaining: formatDecimalFixed(med.stockRemaining) ?? '0.00',
            stockUnit: med.stockUnit,
            idempotentReplay: true,
          };
        }
      }
    }

    return this.prisma.$transaction(
      async (tx) => {
        if (input.action === 'SKIPPED') {
          const current = await tx.doseEvent.findUniqueOrThrow({
            where: { id: ensured.id },
            select: {
              id: true,
              scheduleId: true,
              patientMedicationId: true,
              scheduledFor: true,
              status: true,
              recordedAt: true,
            },
          });

          if (current.status === DoseEventStatus.TAKEN) {
            throw new ConflictException(
              'Dose is already recorded as taken and cannot be skipped.',
            );
          }

          const alreadySkipped = current.status === DoseEventStatus.SKIPPED;
          const [savedEvent, med] = await Promise.all([
            alreadySkipped
              ? Promise.resolve(current)
              : tx.doseEvent.update({
                  where: { id: ensured.id },
                  data: {
                    status: DoseEventStatus.SKIPPED,
                    recordedAt: now,
                    note: input.note,
                  },
                }),
            tx.patientMedication.findUniqueOrThrow({
              where: { id: input.patientMedicationId },
              select: { id: true, stockRemaining: true, stockUnit: true },
            }),
          ]);

          return {
            doseEventId: savedEvent.id,
            scheduleId: savedEvent.scheduleId,
            patientMedicationId: savedEvent.patientMedicationId,
            scheduledFor: savedEvent.scheduledFor.toISOString(),
            status: savedEvent.status,
            recordedAt: savedEvent.recordedAt
              ? savedEvent.recordedAt.toISOString()
              : null,
            stockDeducted: false,
            deductedQuantity: '0.00',
            newStockRemaining: formatDecimalFixed(med.stockRemaining) ?? '0.00',
            stockUnit: med.stockUnit,
            idempotentReplay: alreadySkipped,
          };
        }

        // Action === 'TAKEN': claim row transition atomically before reading/updating stock
        const claimed = await tx.doseEvent.updateMany({
          where: {
            id: ensured.id,
            status: { not: DoseEventStatus.TAKEN },
          },
          data: {
            status: DoseEventStatus.TAKEN,
            recordedAt: now,
            note: input.note,
          },
        });

        if (claimed.count === 0) {
          const med = await tx.patientMedication.findUniqueOrThrow({
            where: { id: input.patientMedicationId },
            select: { id: true, stockRemaining: true, stockUnit: true },
          });
          return {
            doseEventId: ensured.id,
            scheduleId: input.scheduleId,
            patientMedicationId: input.patientMedicationId,
            scheduledFor: input.scheduledFor.toISOString(),
            status: DoseEventStatus.TAKEN,
            recordedAt: (ensured.recordedAt ?? now).toISOString(),
            stockDeducted: false,
            deductedQuantity: '0.00',
            newStockRemaining: formatDecimalFixed(med.stockRemaining) ?? '0.00',
            stockUnit: med.stockUnit,
            idempotentReplay: true,
          };
        }

        const [schedule, med, existingTx] = await Promise.all([
          tx.medicationSchedule.findUniqueOrThrow({
            where: { id: input.scheduleId },
            select: { id: true, doseAmount: true, doseUnit: true },
          }),
          tx.patientMedication.findUniqueOrThrow({
            where: { id: input.patientMedicationId },
            select: { id: true, stockRemaining: true, stockUnit: true },
          }),
          tx.inventoryTransaction.findUnique({
            where: { doseEventId: ensured.id },
            select: { id: true },
          }),
        ]);

        let stockDeducted = false;
        let deductedDec = new Prisma.Decimal('0').toDecimalPlaces(2);
        let newStockDec = med.stockRemaining.toDecimalPlaces(2);

        const canDeduct =
          !existingTx &&
          canDeductDoseUnitFromStockUnit(schedule.doseUnit, med.stockUnit) &&
          med.stockRemaining.gt(0);

        if (canDeduct) {
          deductedDec = Prisma.Decimal.min(
            med.stockRemaining,
            schedule.doseAmount,
          ).toDecimalPlaces(2);

          if (deductedDec.gt(0)) {
            newStockDec = med.stockRemaining.sub(deductedDec).toDecimalPlaces(2);

            await tx.patientMedication.update({
              where: { id: med.id },
              data: { stockRemaining: newStockDec },
            });

            await tx.inventoryTransaction.create({
              data: {
                patientMedicationId: med.id,
                doseEventId: ensured.id,
                type: InventoryTransactionType.DOSE_CONSUMPTION,
                quantityDelta: deductedDec.neg(),
                balanceAfter: newStockDec,
                reason: 'Confirmed dose taken',
                note: input.note,
              },
            });

            stockDeducted = true;
          }
        }

        return {
          doseEventId: ensured.id,
          scheduleId: input.scheduleId,
          patientMedicationId: input.patientMedicationId,
          scheduledFor: input.scheduledFor.toISOString(),
          status: DoseEventStatus.TAKEN,
          recordedAt: now.toISOString(),
          stockDeducted,
          deductedQuantity: formatDecimalFixed(deductedDec) ?? '0.00',
          newStockRemaining: formatDecimalFixed(newStockDec) ?? '0.00',
          stockUnit: med.stockUnit,
          idempotentReplay: false,
        };
      },
      { maxWait: 20000, timeout: 45000 },
    );
  }

  private parseDateOrToday(raw: string | undefined, timeZone: string): string {
    if (!raw || raw.trim().length === 0) {
      return formatLocalDateYmd(new Date(), timeZone);
    }
    try {
      parseYmdDateString(raw);
      return raw.trim();
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Invalid date format (YYYY-MM-DD).',
      );
    }
  }
}
