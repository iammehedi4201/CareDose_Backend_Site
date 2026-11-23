import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { MedicationStatus, Prisma, ScheduleStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import {
  addDaysToYmd,
  canDeductDoseUnitFromStockUnit,
  classifySchedulePeriod,
  computeDoseDisplayStatus,
  DOSE_DUE_LEAD_MS,
  DOSE_GRACE_PERIOD_MS,
  format24HourTo12Hour,
  formatLocalDateYmd,
  getScheduleTimesForLocalDate,
  isScheduleActiveOnLocalDate,
  normalizeScheduledTimesList,
  normalizeScheduleFrequency,
  zonedDateTimeToUtc,
} from './schedule-time.util';
import { SchedulesService } from './schedules.service';

describe('Phase 6 — Schedule time utilities & SchedulesService', () => {
  it('normalizes 12h/24h scheduled times, sorts cleanly, and classifies period groups', () => {
    expect(normalizeScheduledTimesList(['09:00 PM', '8:00', '08:00 AM', '13:30'])).toEqual([
      '08:00',
      '13:30',
      '21:00',
    ]);
    expect(format24HourTo12Hour('00:15')).toBe('12:15 AM');
    expect(format24HourTo12Hour('12:00')).toBe('12:00 PM');
    expect(format24HourTo12Hour('21:00')).toBe('09:00 PM');

    expect(classifySchedulePeriod('08:00')).toBe('Morning');
    expect(classifySchedulePeriod('13:30')).toBe('Afternoon');
    expect(classifySchedulePeriod('18:00')).toBe('Evening');
    expect(classifySchedulePeriod('22:00')).toBe('Bedtime');
    expect(classifySchedulePeriod('03:00')).toBe('Bedtime');
  });

  it('converts local patient dates/times in Asia/Dhaka accurately across UTC day boundaries', () => {
    // 02:00 AM in Asia/Dhaka (UTC+6) is 20:00 UTC of the previous day
    const utc = zonedDateTimeToUtc('2026-11-22', '02:00', 'Asia/Dhaka');
    expect(utc.toISOString()).toBe('2026-11-21T20:00:00.000Z');
    expect(formatLocalDateYmd(utc, 'Asia/Dhaka')).toBe('2026-11-22');
    expect(addDaysToYmd('2026-11-30', 1)).toBe('2026-12-01');
  });

  it('evaluates frequency rules, date windows, dose status windows, and stock-unit matching', () => {
    const startUtc = zonedDateTimeToUtc('2026-11-20', '00:00', 'Asia/Dhaka');
    const endUtc = zonedDateTimeToUtc('2026-11-24', '00:00', 'Asia/Dhaka');
    const alternateSchedule = {
      status: 'ACTIVE',
      frequency: normalizeScheduleFrequency('Alternate days'),
      startDate: startUtc,
      endDate: endUtc,
    };

    expect(isScheduleActiveOnLocalDate(alternateSchedule, '2026-11-19', 'Asia/Dhaka')).toBe(false);
    expect(isScheduleActiveOnLocalDate(alternateSchedule, '2026-11-20', 'Asia/Dhaka')).toBe(true);
    expect(isScheduleActiveOnLocalDate(alternateSchedule, '2026-11-21', 'Asia/Dhaka')).toBe(false);
    expect(isScheduleActiveOnLocalDate(alternateSchedule, '2026-11-22', 'Asia/Dhaka')).toBe(true);
    expect(isScheduleActiveOnLocalDate(alternateSchedule, '2026-11-25', 'Asia/Dhaka')).toBe(false);

    const schedFor = new Date('2026-11-22T02:00:00.000Z');
    expect(
      computeDoseDisplayStatus(schedFor, null, new Date(schedFor.getTime() - DOSE_DUE_LEAD_MS - 1000)),
    ).toBe('upcoming');
    expect(
      computeDoseDisplayStatus(schedFor, null, new Date(schedFor.getTime() - DOSE_DUE_LEAD_MS + 1000)),
    ).toBe('due');
    expect(
      computeDoseDisplayStatus(schedFor, null, new Date(schedFor.getTime() + DOSE_GRACE_PERIOD_MS + 1000)),
    ).toBe('missed');
    expect(
      computeDoseDisplayStatus(schedFor, 'TAKEN', new Date(schedFor.getTime() + DOSE_GRACE_PERIOD_MS + 5000)),
    ).toBe('taken');
    expect(computeDoseDisplayStatus(schedFor, 'SKIPPED', schedFor)).toBe('skipped');

    expect(canDeductDoseUnitFromStockUnit('tablet', 'tablets')).toBe(true);
    expect(canDeductDoseUnitFromStockUnit('ml', 'ml')).toBe(true);
    expect(canDeductDoseUnitFromStockUnit('drop', 'bottle')).toBe(false);
  });

  it('rejects schedules on archived meds, invalid end dates, and cross-user access', async () => {
    const medId = '11111111-1111-4111-8111-111111111111';
    const schedId = '22222222-2222-4222-8222-222222222222';
    const prisma = {
      patientMedication: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: medId,
            status: MedicationStatus.ARCHIVED,
            stockUnit: 'tablets',
            patient: { timezone: 'Asia/Dhaka' },
          })
          .mockResolvedValueOnce({
            id: medId,
            status: MedicationStatus.ACTIVE,
            stockUnit: 'tablets',
            patient: { timezone: 'Asia/Dhaka' },
          }),
      },
      medicationSchedule: {
        findUnique: vi.fn().mockResolvedValue({
          id: schedId,
          patientMedicationId: medId,
          doseAmount: new Prisma.Decimal('1'),
          doseUnit: 'tablet',
          frequency: 'DAILY',
          scheduledTimes: ['08:00'],
          startDate: new Date('2026-11-20T00:00:00.000Z'),
          endDate: null,
          instructions: null,
          remindersEnabled: true,
          status: ScheduleStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
          patientMedication: {
            id: medId,
            patientId: 'p1',
            name: 'Napa',
            strength: '500 mg',
            dosageForm: 'Tablet',
            stockUnit: 'tablets',
            personalInstructions: 'After meal',
            status: MedicationStatus.ACTIVE,
            patient: { ownerUserId: 'user-owner', timezone: 'Asia/Dhaka' },
          },
        }),
      },
    } as unknown as PrismaService;

    const svc = new SchedulesService(prisma);

    await expect(
      svc.createForMedication(medId, {
        scheduledTimes: ['08:00 AM'],
        startDate: '2026-11-22',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      svc.createForMedication(medId, {
        scheduledTimes: ['08:00 AM'],
        startDate: '2026-11-22',
        endDate: '2026-11-20',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      svc.updateForUser('other-user', schedId, { remindersEnabled: false }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('expands Every X hours, Selected weekdays, Three times daily, Custom times & DST timezones without duplicates', async () => {
    const medId = '11111111-1111-4111-8111-111111111111';

    // Every 8 hours starting 08:00 -> day 1: 08:00, 16:00; day 2: 00:00, 08:00, 16:00
    const every8Sched = {
      status: 'ACTIVE',
      frequency: normalizeScheduleFrequency('Every X hours'),
      intervalHours: 8,
      weekdays: [],
      scheduledTimes: ['08:00'],
      startDate: zonedDateTimeToUtc('2026-11-23', '00:00', 'America/New_York'),
      endDate: null,
    };
    expect(getScheduleTimesForLocalDate(every8Sched, '2026-11-23', 'America/New_York')).toEqual([
      '08:00',
      '16:00',
    ]);
    expect(getScheduleTimesForLocalDate(every8Sched, '2026-11-24', 'America/New_York')).toEqual([
      '00:00',
      '08:00',
      '16:00',
    ]);

    // Selected weekdays Mon/Wed/Fri [1, 3, 5] in Asia/Dhaka
    const weekdaySched = {
      status: 'ACTIVE',
      frequency: normalizeScheduleFrequency('Selected weekdays'),
      intervalHours: null,
      weekdays: [1, 3, 5],
      scheduledTimes: ['09:00', '21:00'],
      startDate: zonedDateTimeToUtc('2026-11-23', '00:00', 'Asia/Dhaka'), // Monday
      endDate: null,
    };
    expect(getScheduleTimesForLocalDate(weekdaySched, '2026-11-23', 'Asia/Dhaka')).toEqual([
      '09:00',
      '21:00',
    ]); // Mon
    expect(getScheduleTimesForLocalDate(weekdaySched, '2026-11-24', 'Asia/Dhaka')).toEqual([]); // Tue
    expect(getScheduleTimesForLocalDate(weekdaySched, '2026-11-25', 'Asia/Dhaka')).toEqual([
      '09:00',
      '21:00',
    ]); // Wed

    expect(normalizeScheduleFrequency('Three times daily')).toBe('THREE_TIMES_DAILY');
    expect(normalizeScheduleFrequency('Custom times')).toBe('CUSTOM_TIMES');

    // Duplicate active schedule prevention + Selected weekdays empty check
    const prisma = {
      patientMedication: {
        findUnique: vi.fn().mockResolvedValue({
          id: medId,
          status: MedicationStatus.ACTIVE,
          stockUnit: 'tablets',
          patient: { timezone: 'Asia/Dhaka' },
        }),
      },
      medicationSchedule: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'existing-1',
            patientMedicationId: medId,
            frequency: 'DAILY',
            intervalHours: null,
            weekdays: [],
            scheduledTimes: ['09:00'],
            startDate: zonedDateTimeToUtc('2026-11-23', '00:00', 'Asia/Dhaka'),
            endDate: null,
            status: ScheduleStatus.ACTIVE,
          },
        ]),
      },
    } as unknown as PrismaService;
    const svc = new SchedulesService(prisma);

    await expect(
      svc.createForMedication(medId, {
        frequency: 'DAILY',
        scheduledTimes: ['09:00 AM'],
        startDate: '2026-11-24',
      }),
    ).rejects.toThrow(ConflictException);

    await expect(
      svc.createForMedication(medId, {
        frequency: 'SELECTED_WEEKDAYS',
        weekdays: [],
        scheduledTimes: ['10:00 AM'],
        startDate: '2026-11-24',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      svc.createForMedication(medId, {
        frequency: 'EVERY_X_HOURS',
        intervalHours: 0,
        scheduledTimes: ['10:00 AM'],
        startDate: '2026-11-24',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('archives an owned schedule without deleting it', async () => {
    const schedId = '44444444-4444-4444-8444-444444444444';
    const medId = '11111111-1111-4111-8111-111111111111';
    const existingRow = {
      id: schedId,
      patientMedicationId: medId,
      doseAmount: new Prisma.Decimal('1'),
      doseUnit: 'tablet',
      frequency: 'DAILY',
      intervalHours: null,
      weekdays: [],
      scheduledTimes: ['08:00'],
      startDate: zonedDateTimeToUtc('2026-11-23', '00:00', 'Asia/Dhaka'),
      endDate: null,
      instructions: null,
      remindersEnabled: true,
      status: ScheduleStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      patientMedication: {
        id: medId,
        patientId: 'patient-1',
        name: 'Napa',
        strength: '500 mg',
        dosageForm: 'Tablet',
        stockUnit: 'tablets',
        personalInstructions: '',
        status: MedicationStatus.ACTIVE,
        patient: {
          ownerUserId: 'owner-user',
          timezone: 'Asia/Dhaka',
        },
      },
    };
    const updateMock = vi.fn().mockResolvedValue({
      ...existingRow,
      status: ScheduleStatus.ARCHIVED,
    });
    const deleteMock = vi.fn();
    const prisma = {
      medicationSchedule: {
        findUnique: vi.fn().mockResolvedValue(existingRow),
        update: updateMock,
        delete: deleteMock,
      },
    } as unknown as PrismaService;

    const svc = new SchedulesService(prisma);
    const archived = await svc.archiveForUser('owner-user', schedId);
    expect(archived.status).toBe('ARCHIVED');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: schedId },
        data: { status: ScheduleStatus.ARCHIVED },
      }),
    );
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
