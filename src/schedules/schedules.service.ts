import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MedicationStatus, Prisma, ScheduleStatus } from '@prisma/client';
import { isValidUuid } from '../common/utils/uuid.util';
import { normalizeOptionalText } from '../imports/catalogue-dataset.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateScheduleDto,
  ListSchedulesQueryDto,
  UpdateScheduleDto,
} from './dto/schedule.dto';
import {
  formatLocalDateYmd,
  normalizeScheduledTimesList,
  normalizeScheduleFrequency,
  parseScheduleDateInputToYmd,
  zonedDateTimeToUtc,
} from './schedule-time.util';
import {
  inferDefaultDoseUnit,
  serializeSchedule,
  SerializedMedicationSchedule,
} from './schedules.serializers';

const SCHEDULE_INCLUDE = {
  patientMedication: {
    select: {
      id: true,
      patientId: true,
      name: true,
      strength: true,
      dosageForm: true,
      stockUnit: true,
      personalInstructions: true,
      status: true,
      patient: {
        select: {
          ownerUserId: true,
          timezone: true,
        },
      },
    },
  },
} satisfies Prisma.MedicationScheduleInclude;

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForMedication(
    medicationId: string,
    query: ListSchedulesQueryDto = {},
  ): Promise<SerializedMedicationSchedule[]> {
    const med = await this.prisma.patientMedication.findUnique({
      where: { id: medicationId },
      select: {
        id: true,
        patient: { select: { timezone: true } },
      },
    });
    if (!med) {
      throw new NotFoundException('Patient medication not found');
    }

    const timeZone = med.patient.timezone || 'Asia/Dhaka';
    const where: Prisma.MedicationScheduleWhereInput = {
      patientMedicationId: medicationId,
      ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}),
    };

    const rows = await this.prisma.medicationSchedule.findMany({
      where,
      include: SCHEDULE_INCLUDE,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });

    return rows.map((row) => serializeSchedule(row, timeZone));
  }

  async listForPatient(
    patientId: string,
    timeZone = 'Asia/Dhaka',
    query: ListSchedulesQueryDto = {},
  ): Promise<SerializedMedicationSchedule[]> {
    const where: Prisma.MedicationScheduleWhereInput = {
      patientMedication: {
        patientId,
      },
      ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}),
    };

    const rows = await this.prisma.medicationSchedule.findMany({
      where,
      include: SCHEDULE_INCLUDE,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });

    return rows.map((row) => serializeSchedule(row, timeZone));
  }

  async createForMedication(
    medicationId: string,
    dto: CreateScheduleDto,
  ): Promise<SerializedMedicationSchedule> {
    const med = await this.prisma.patientMedication.findUnique({
      where: { id: medicationId },
      select: {
        id: true,
        status: true,
        stockUnit: true,
        patient: {
          select: {
            timezone: true,
          },
        },
      },
    });
    if (!med) {
      throw new NotFoundException('Patient medication not found');
    }
    if (med.status === MedicationStatus.ARCHIVED) {
      throw new BadRequestException(
        'Cannot create a schedule for an archived medicine. Restore it first.',
      );
    }

    const timeZone = med.patient.timezone || 'Asia/Dhaka';
    const { scheduledTimes, frequency, startDate, endDate } =
      this.parseAndValidateScheduleFields(
        {
          scheduledTimes: dto.scheduledTimes,
          frequency: dto.frequency ?? 'DAILY',
          startDate: dto.startDate,
          endDate: dto.endDate,
        },
        timeZone,
      );

    const doseAmountDec = new Prisma.Decimal(dto.doseAmount ?? 1).toDecimalPlaces(2);
    const doseUnit =
      normalizeOptionalText(dto.doseUnit) ?? inferDefaultDoseUnit(med.stockUnit);

    const created = await this.prisma.medicationSchedule.create({
      data: {
        patientMedicationId: med.id,
        doseAmount: doseAmountDec,
        doseUnit,
        frequency,
        scheduledTimes,
        startDate,
        endDate,
        instructions: normalizeOptionalText(dto.instructions),
        remindersEnabled: dto.remindersEnabled ?? true,
        status: ScheduleStatus.ACTIVE,
      },
      include: SCHEDULE_INCLUDE,
    });

    return serializeSchedule(created, timeZone);
  }

  async updateForUser(
    userId: string,
    scheduleId: string,
    dto: UpdateScheduleDto,
  ): Promise<SerializedMedicationSchedule> {
    const existing = await this.loadOwnedScheduleOrThrow(userId, scheduleId);
    const timeZone = existing.patientMedication.patient.timezone || 'Asia/Dhaka';

    const nextStartYmd =
      dto.startDate !== undefined
        ? this.wrapScheduleParse(() =>
            parseScheduleDateInputToYmd(dto.startDate!, timeZone),
          )
        : formatLocalDateYmd(existing.startDate, timeZone);

    let nextEndDate: Date | null = existing.endDate;
    let nextEndYmd: string | null = existing.endDate
      ? formatLocalDateYmd(existing.endDate, timeZone)
      : null;

    if (dto.endDate !== undefined) {
      if (dto.endDate === null || dto.endDate.trim().length === 0) {
        nextEndDate = null;
        nextEndYmd = null;
      } else {
        nextEndYmd = this.wrapScheduleParse(() =>
          parseScheduleDateInputToYmd(dto.endDate!, timeZone),
        );
        nextEndDate = zonedDateTimeToUtc(nextEndYmd, '00:00', timeZone);
      }
    }

    if (nextEndYmd && nextEndYmd < nextStartYmd) {
      throw new BadRequestException('End date cannot be earlier than start date.');
    }

    const data: Prisma.MedicationScheduleUpdateInput = {
      ...(dto.startDate !== undefined
        ? { startDate: zonedDateTimeToUtc(nextStartYmd, '00:00', timeZone) }
        : {}),
      ...(dto.endDate !== undefined ? { endDate: nextEndDate } : {}),
      ...(dto.doseAmount !== undefined
        ? { doseAmount: new Prisma.Decimal(dto.doseAmount).toDecimalPlaces(2) }
        : {}),
      ...(dto.doseUnit !== undefined
        ? {
            doseUnit:
              normalizeOptionalText(dto.doseUnit) ??
              inferDefaultDoseUnit(existing.patientMedication.stockUnit),
          }
        : {}),
      ...(dto.frequency !== undefined
        ? {
            frequency: this.wrapScheduleParse(() =>
              normalizeScheduleFrequency(dto.frequency),
            ),
          }
        : {}),
      ...(dto.scheduledTimes !== undefined
        ? {
            scheduledTimes: this.wrapScheduleParse(() =>
              normalizeScheduledTimesList(dto.scheduledTimes!),
            ),
          }
        : {}),
      ...(dto.instructions !== undefined
        ? { instructions: normalizeOptionalText(dto.instructions) }
        : {}),
      ...(dto.remindersEnabled !== undefined
        ? { remindersEnabled: dto.remindersEnabled }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };

    const updated = await this.prisma.medicationSchedule.update({
      where: { id: scheduleId },
      data,
      include: SCHEDULE_INCLUDE,
    });

    return serializeSchedule(updated, timeZone);
  }

  async deleteForUser(
    userId: string,
    scheduleId: string,
  ): Promise<{ deleted: true; id: string }> {
    await this.loadOwnedScheduleOrThrow(userId, scheduleId);
    await this.prisma.medicationSchedule.delete({
      where: { id: scheduleId },
    });
    return { deleted: true, id: scheduleId };
  }

  private async loadOwnedScheduleOrThrow(userId: string, scheduleId: string) {
    if (!isValidUuid(scheduleId)) {
      throw new BadRequestException('Invalid schedule UUID parameter');
    }
    const existing = await this.prisma.medicationSchedule.findUnique({
      where: { id: scheduleId },
      include: SCHEDULE_INCLUDE,
    });
    if (!existing) {
      throw new NotFoundException('Medication schedule not found');
    }
    if (existing.patientMedication.patient.ownerUserId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this schedule',
      );
    }
    return existing;
  }

  private wrapScheduleParse<T>(fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Invalid schedule field value.',
      );
    }
  }

  private parseAndValidateScheduleFields(
    input: {
      scheduledTimes: string[];
      frequency: string;
      startDate: string;
      endDate?: string | null;
    },
    timeZone: string,
  ): {
    scheduledTimes: string[];
    frequency: string;
    startDate: Date;
    endDate: Date | null;
  } {
    return this.wrapScheduleParse(() => {
      const scheduledTimes = normalizeScheduledTimesList(input.scheduledTimes);
      const frequency = normalizeScheduleFrequency(input.frequency);
      const startYmd = parseScheduleDateInputToYmd(input.startDate, timeZone);
      const startDate = zonedDateTimeToUtc(startYmd, '00:00', timeZone);

      let endDate: Date | null = null;
      if (input.endDate && input.endDate.trim().length > 0) {
        const endYmd = parseScheduleDateInputToYmd(input.endDate, timeZone);
        if (endYmd < startYmd) {
          throw new Error('End date cannot be earlier than start date.');
        }
        endDate = zonedDateTimeToUtc(endYmd, '00:00', timeZone);
      }

      return { scheduledTimes, frequency, startDate, endDate };
    });
  }
}
