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
  isScheduleActiveOnLocalDate,
  normalizeScheduledTimeTo24Hour,
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
      !Number.isNaN(new Date(parsed.scheduledFor).getTime()) &&
      isValidUuid(parsed.id)
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
        if (!isScheduleActiveOnLocalDate(sched, ymd, tz)) {
          continue;
        }
        const doseAmountStr = formatDecimalFixed(sched.doseAmount) ?? '1.00';
        for (const rawTime of sched.scheduledTimes) {
          const time24 = normalizeScheduledTimeTo24Hour(rawTime);
          const scheduledFor = zonedDateTimeToUtc(ymd, time24, tz);
          const occurrenceKey = `${sched.id}:${scheduledFor.toISOString()}`;
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
  ): Promise<SerializedDoseHistoryResponse> {
    const tz = timeZone || 'Asia/Dhaka';
    const limit = query.limit ?? 20;
    const cursor = decodeHistoryCursor(query.cursor);

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

    if (query.from) {
      const fromYmd = this.parseDateOrToday(query.from, tz);
      const { startUtc } = getLocalDayRangeUtc(fromYmd, tz);
      baseConditions.push({ scheduledFor: { gte: startUtc } });
    }
    if (query.to) {
      const toYmd = this.parseDateOrToday(query.to, tz);
      const { endUtc } = getLocalDayRangeUtc(toYmd, tz);
      baseConditions.push({ scheduledFor: { lt: endUtc } });
    }

    const baseWhere: Prisma.DoseEventWhereInput = { AND: baseConditions };

    const pagedConditions: Prisma.DoseEventWhereInput[] = [...baseConditions];
    if (query.status === 'TAKEN') {
      pagedConditions.push({ status: DoseEventStatus.TAKEN });
    } else if (query.status === 'SKIPPED') {
      pagedConditions.push({ status: DoseEventStatus.SKIPPED });
    }

    if (cursor) {
      const cursorDate = new Date(cursor.scheduledFor);
      pagedConditions.push({
        OR: [
          { scheduledFor: { lt: cursorDate } },
          {
            AND: [
              { scheduledFor: cursorDate },
              { id: { lt: cursor.id } },
            ],
          },
        ],
      });
    }

    const [rows, groupedCounts] = await Promise.all([
      this.prisma.doseEvent.findMany({
        where: { AND: pagedConditions },
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
        take: limit + 1,
      }),
      this.prisma.doseEvent.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { _all: true },
      }),
    ]);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && lastRow
        ? encodeHistoryCursor({
            scheduledFor: lastRow.scheduledFor.toISOString(),
            id: lastRow.id,
          })
        : null;

    let takenCount = 0;
    let skippedCount = 0;
    for (const g of groupedCounts) {
      if (g.status === DoseEventStatus.TAKEN) takenCount = g._count._all;
      if (g.status === DoseEventStatus.SKIPPED) skippedCount = g._count._all;
    }

    const items: SerializedDoseHistoryItem[] = pageRows.map((row) => {
      const ymd = formatLocalDateYmd(row.scheduledFor, tz);
      const time24 = formatLocalTime24(row.scheduledFor, tz);
      return {
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
      };
    });

    return {
      items,
      counts: {
        all: takenCount + skippedCount,
        taken: takenCount,
        skipped: skippedCount,
      },
      hasMore,
      nextCursor,
    };
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

        if (claimed.count === 0) {
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
      { maxWait: 10000, timeout: 15000 },
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
