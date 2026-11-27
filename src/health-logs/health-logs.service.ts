import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GlucoseUnit, Prisma, ReadingContext } from '@prisma/client';
import { normalizeOptionalText } from '../imports/catalogue-dataset.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  formatLocalDateYmd,
  getLocalDayRangeUtc,
  normalizeScheduledTimeTo24Hour,
  zonedDateTimeToUtc,
} from '../schedules/schedule-time.util';
import {
  CreateHealthReadingDto,
  ListHealthReadingsQueryDto,
} from './dto/health-reading.dto';
import {
  buildHealthChartPoints,
  HEALTH_LOG_NON_INTERPRETATION_DISCLAIMER,
  SerializedHealthReadingItem,
  SerializedHealthReadingsResponse,
  serializeHealthReading,
} from './health-logs.serializers';

interface HealthCursorPayload {
  measuredAt: string;
  id: string;
}

function encodeHealthCursor(payload: HealthCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeHealthCursor(raw?: string): HealthCursorPayload | null {
  if (!raw || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw.trim(), 'base64url').toString('utf8'),
    ) as Partial<HealthCursorPayload>;
    if (
      typeof parsed.measuredAt === 'string' &&
      typeof parsed.id === 'string' &&
      parsed.id.trim().length > 0 &&
      !Number.isNaN(new Date(parsed.measuredAt).getTime())
    ) {
      return { measuredAt: parsed.measuredAt, id: parsed.id };
    }
  } catch {
    // Fall through to validation error
  }
  throw new BadRequestException('Invalid health readings pagination cursor.');
}

export function resolveReadingMeasuredAt(
  dto: Pick<CreateHealthReadingDto, 'measuredAt' | 'date' | 'time'>,
  timeZone = 'Asia/Dhaka',
): Date {
  if (dto.measuredAt && dto.measuredAt.trim().length > 0) {
    const parsed = new Date(dto.measuredAt.trim());
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(
        `Invalid measuredAt "${dto.measuredAt}". Expected ISO timestamp.`,
      );
    }
    return parsed;
  }

  if (dto.date || dto.time) {
    const ymd = dto.date?.trim() || formatLocalDateYmd(new Date(), timeZone);
    const rawTime = dto.time?.trim() || '08:00';
    let time24: string;
    try {
      time24 = normalizeScheduledTimeTo24Hour(rawTime);
    } catch {
      throw new BadRequestException(
        `Invalid time "${rawTime}". Expected HH:mm or hh:mm AM/PM.`,
      );
    }
    try {
      return zonedDateTimeToUtc(ymd, time24, timeZone);
    } catch {
      throw new BadRequestException(`Invalid reading date/time "${ymd} ${rawTime}".`);
    }
  }

  return new Date();
}

export function validateGlucoseValueBounds(
  value: number,
  unit: GlucoseUnit,
): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestException('Glucose reading value must be greater than 0.');
  }
  if (unit === GlucoseUnit.MMOL_L && value > 100) {
    throw new BadRequestException(
      'Glucose reading in mmol/L must be 100 or less. Switch unit to mg/dL if needed.',
    );
  }
  if (unit === GlucoseUnit.MG_DL && value > 2000) {
    throw new BadRequestException('Glucose reading in mg/dL must be 2000 or less.');
  }
}

@Injectable()
export class HealthLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForPatient(
    patientId: string,
    userId: string,
    timeZone: string,
    query: ListHealthReadingsQueryDto,
  ): Promise<SerializedHealthReadingsResponse> {
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('from date cannot be later than to date.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { glucoseUnit: true },
    });
    const preferredUnit = user?.glucoseUnit ?? GlucoseUnit.MG_DL;

    const conditions: Prisma.HealthReadingWhereInput[] = [{ patientId }];
    if (query.context) {
      conditions.push({ context: query.context });
    }
    if (query.from || query.to) {
      const measuredAtFilter: Prisma.DateTimeFilter = {};
      if (query.from) {
        measuredAtFilter.gte = getLocalDayRangeUtc(query.from, timeZone).startUtc;
      }
      if (query.to) {
        measuredAtFilter.lt = getLocalDayRangeUtc(query.to, timeZone).endUtc;
      }
      conditions.push({ measuredAt: measuredAtFilter });
    }

    const filterWhere: Prisma.HealthReadingWhereInput =
      conditions.length === 1 ? conditions[0] : { AND: conditions };

    const cursorPayload = decodeHealthCursor(query.cursor);
    const paginatedConditions: Prisma.HealthReadingWhereInput[] = [...conditions];
    if (cursorPayload) {
      const cursorDate = new Date(cursorPayload.measuredAt);
      paginatedConditions.push({
        OR: [
          { measuredAt: { lt: cursorDate } },
          { measuredAt: cursorDate, id: { lt: cursorPayload.id } },
        ],
      });
    }
    const paginatedWhere: Prisma.HealthReadingWhereInput =
      paginatedConditions.length === 1
        ? paginatedConditions[0]
        : { AND: paginatedConditions };

    const limit = query.limit ?? 30;

    const [rows, totalCount, recentForChart] = await Promise.all([
      this.prisma.healthReading.findMany({
        where: paginatedWhere,
        orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      this.prisma.healthReading.count({ where: filterWhere }),
      this.prisma.healthReading.findMany({
        where: { patientId },
        orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
        take: 7,
      }),
    ]);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && lastRow
        ? encodeHealthCursor({
            measuredAt: lastRow.measuredAt.toISOString(),
            id: lastRow.id,
          })
        : null;

    const latestRaw = recentForChart[0] ?? null;

    return {
      patientId,
      timezone: timeZone,
      preferredUnit,
      preferredUnitLabel: preferredUnit === GlucoseUnit.MMOL_L ? 'mmol/L' : 'mg/dL',
      items: pageRows.map((r) => serializeHealthReading(r, timeZone)),
      latestReading: latestRaw ? serializeHealthReading(latestRaw, timeZone) : null,
      chartPoints: buildHealthChartPoints(recentForChart, preferredUnit, timeZone),
      totalCount,
      nextCursor,
      disclaimer: HEALTH_LOG_NON_INTERPRETATION_DISCLAIMER,
    };
  }

  async createForPatient(
    patientId: string,
    userId: string,
    timeZone: string,
    dto: CreateHealthReadingDto,
  ): Promise<SerializedHealthReadingItem> {
    let unit = dto.unit;
    if (!unit) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { glucoseUnit: true },
      });
      unit = user?.glucoseUnit ?? GlucoseUnit.MG_DL;
    }

    validateGlucoseValueBounds(dto.value, unit);
    const measuredAt = resolveReadingMeasuredAt(dto, timeZone);

    const created = await this.prisma.healthReading.create({
      data: {
        patientId,
        value: new Prisma.Decimal(dto.value).toDecimalPlaces(2),
        unit,
        context: dto.context ?? ReadingContext.FASTING,
        measuredAt,
        note: normalizeOptionalText(dto.note),
      },
    });

    return serializeHealthReading(created, timeZone);
  }

  async deleteForPatient(
    patientId: string,
    readingId: string,
  ): Promise<{ deletedId: string }> {
    const existing = await this.prisma.healthReading.findUnique({
      where: { id: readingId },
      select: { id: true, patientId: true },
    });

    if (!existing || existing.patientId !== patientId) {
      throw new NotFoundException('Health reading not found');
    }

    await this.prisma.healthReading.delete({
      where: { id: existing.id },
    });

    return { deletedId: existing.id };
  }
}
