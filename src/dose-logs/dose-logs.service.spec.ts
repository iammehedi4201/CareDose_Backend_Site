import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  DoseEventStatus,
  MedicationStatus,
  Prisma,
  ScheduleStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { zonedDateTimeToUtc } from '../schedules/schedule-time.util';
import { DoseLogsService } from './dose-logs.service';

describe('Phase 6 — DoseLogsService daily occurrences, atomic stock deduction & history', () => {
  it('builds 7-day schedule buckets, skips archived meds, and selects nearest upcoming/due nextDose', async () => {
    const schedActiveId = '11111111-1111-4111-8111-111111111111';
    const schedArchivedId = '22222222-2222-4222-8222-222222222222';
    const morningUtc = zonedDateTimeToUtc('2026-11-22', '08:00', 'Asia/Dhaka');
    const eveningUtc = zonedDateTimeToUtc('2026-11-22', '20:00', 'Asia/Dhaka');
    // Evaluate "now" at 12:00 PM Asia/Dhaka on 2026-11-22 (08:00 is past grace -> missed; 20:00 is upcoming)
    const now = zonedDateTimeToUtc('2026-11-22', '12:00', 'Asia/Dhaka');

    const prisma = {
      medicationSchedule: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: schedActiveId,
            patientMedicationId: 'm1',
            doseAmount: new Prisma.Decimal('1'),
            doseUnit: 'tablet',
            frequency: 'DAILY',
            scheduledTimes: ['08:00', '20:00'],
            startDate: zonedDateTimeToUtc('2026-11-20', '00:00', 'Asia/Dhaka'),
            endDate: null,
            instructions: 'After meal',
            remindersEnabled: true,
            status: ScheduleStatus.ACTIVE,
            createdAt: new Date(),
            patientMedication: {
              id: 'm1',
              name: 'Napa',
              strength: '500 mg',
              dosageForm: 'Tablet',
              personalInstructions: 'After meal',
              status: MedicationStatus.ACTIVE,
            },
          },
          {
            id: schedArchivedId,
            patientMedicationId: 'm2',
            doseAmount: new Prisma.Decimal('1'),
            doseUnit: 'capsule',
            frequency: 'DAILY',
            scheduledTimes: ['09:00'],
            startDate: zonedDateTimeToUtc('2026-11-20', '00:00', 'Asia/Dhaka'),
            endDate: null,
            instructions: 'Old',
            remindersEnabled: true,
            status: ScheduleStatus.ACTIVE,
            createdAt: new Date(),
            patientMedication: {
              id: 'm2',
              name: 'Archived Med',
              strength: '250 mg',
              dosageForm: 'Capsule',
              personalInstructions: 'Old',
              status: MedicationStatus.ARCHIVED,
            },
          },
        ]),
      },
      doseEvent: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const svc = new DoseLogsService(prisma);
    const res = await svc.getDailyOrWeekDoses(
      'patient-1',
      'Asia/Dhaka',
      { date: '2026-11-22', days: 7 },
      now,
    );

    expect(res.days).toHaveLength(7);
    expect(res.days[0].totalCount).toBe(2);
    expect(res.days[0].items[0].scheduledFor).toBe(morningUtc.toISOString());
    expect(res.days[0].items[0].status).toBe('missed');
    expect(res.days[0].items[0].period).toBe('Morning');
    expect(res.days[0].items[1].scheduledFor).toBe(eveningUtc.toISOString());
    expect(res.days[0].items[1].status).toBe('upcoming');
    expect(res.days[0].items[1].period).toBe('Evening');
    expect(res.nextDose?.scheduledFor).toBe(eveningUtc.toISOString());
    expect(res.summary).toEqual({ total: 2, taken: 0, skipped: 0, remaining: 1 });
  });

  it('deducts stock once when marking taken, prevents double deduction on replay, and rejects skip after taken', async () => {
    const schedId = '11111111-1111-4111-8111-111111111111';
    const medId = '22222222-2222-4222-8222-222222222222';
    const eventId = '33333333-3333-4333-8333-333333333333';
    const scheduledFor = new Date('2026-11-22T02:00:00.000Z');

    let currentStock = new Prisma.Decimal('10.00');
    let currentStatus: DoseEventStatus = DoseEventStatus.PLANNED;
    let invCreatedCount = 0;

    const findEvent = vi.fn(async () => ({
      id: eventId,
      scheduleId: schedId,
      patientMedicationId: medId,
      scheduledFor,
      status: currentStatus,
      recordedAt: currentStatus === DoseEventStatus.PLANNED ? null : new Date(),
      inventoryTransaction: invCreatedCount > 0 ? { id: 'tx-1', quantityDelta: new Prisma.Decimal('-2') } : null,
    }));

    const txMock = {
      doseEvent: {
        findUnique: findEvent,
        findUniqueOrThrow: findEvent,
        updateMany: vi.fn(async ({ where }: { where: { status?: { not?: DoseEventStatus } } }) => {
          if (currentStatus === where.status?.not) {
            return { count: 0 };
          }
          currentStatus = DoseEventStatus.TAKEN;
          return { count: 1 };
        }),
      },
      medicationSchedule: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: schedId,
          doseAmount: new Prisma.Decimal('2.00'),
          doseUnit: 'tablet',
        })),
      },
      patientMedication: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: medId,
          stockRemaining: currentStock,
          stockUnit: 'tablets',
        })),
        update: vi.fn(async ({ data }: { data: { stockRemaining: Prisma.Decimal } }) => {
          currentStock = data.stockRemaining;
          return { id: medId, stockRemaining: currentStock };
        }),
      },
      inventoryTransaction: {
        findUnique: vi.fn(async () => (invCreatedCount > 0 ? { id: 'tx-1' } : null)),
        create: vi.fn(async () => {
          invCreatedCount += 1;
          return { id: 'tx-1' };
        }),
      },
    };

    const prisma = {
      medicationSchedule: {
        findUnique: vi.fn(async () => ({
          id: schedId,
          patientMedicationId: medId,
          patientMedication: {
            id: medId,
            patientId: 'patient-1',
            status: MedicationStatus.ACTIVE,
          },
        })),
      },
      doseEvent: {
        findUnique: txMock.doseEvent.findUnique,
      },
      $transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
    } as unknown as PrismaService;

    const svc = new DoseLogsService(prisma);

    // First TAKEN succeeds & reduces stock from 10.00 -> 8.00
    const first = await svc.recordOccurrenceForPatient('patient-1', {
      scheduleId: schedId,
      scheduledFor: scheduledFor.toISOString(),
      action: 'TAKEN',
    });
    expect(first.stockDeducted).toBe(true);
    expect(first.deductedQuantity).toBe('2.00');
    expect(first.newStockRemaining).toBe('8.00');
    expect(first.idempotentReplay).toBe(false);
    expect(invCreatedCount).toBe(1);

    // Second TAKEN replay is idempotent & does NOT reduce stock again
    const replay = await svc.recordOccurrenceForPatient('patient-1', {
      scheduleId: schedId,
      scheduledFor: scheduledFor.toISOString(),
      action: 'TAKEN',
    });
    expect(replay.stockDeducted).toBe(false);
    expect(replay.newStockRemaining).toBe('8.00');
    expect(replay.idempotentReplay).toBe(true);
    expect(invCreatedCount).toBe(1);

    // Cannot SKIP after already TAKEN
    await expect(
      svc.recordOccurrenceForPatient('patient-1', {
        scheduleId: schedId,
        scheduledFor: scheduledFor.toISOString(),
        action: 'SKIPPED',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('skips stock deduction when doseUnit and stockUnit conversion is unknown (e.g. drops vs bottle) and rejects cross-user access', async () => {
    const eventId = '44444444-4444-4444-8444-444444444444';
    const schedId = '11111111-1111-4111-8111-111111111111';
    const medId = '22222222-2222-4222-8222-222222222222';
    const medUpdate = vi.fn();

    const prisma = {
      doseEvent: {
        findUnique: vi.fn(async () => ({
          id: eventId,
          scheduleId: schedId,
          patientMedicationId: medId,
          scheduledFor: new Date('2026-11-22T14:00:00.000Z'),
          status: DoseEventStatus.PLANNED,
          recordedAt: null,
          patientMedication: {
            id: medId,
            patientId: 'patient-1',
            patient: { ownerUserId: 'owner-user' },
          },
        })),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          doseEvent: {
            findUnique: vi.fn(async () => ({
              id: eventId,
              scheduleId: schedId,
              patientMedicationId: medId,
              scheduledFor: new Date('2026-11-22T14:00:00.000Z'),
              status: DoseEventStatus.PLANNED,
              recordedAt: null,
              inventoryTransaction: null,
            })),
            updateMany: vi.fn(async () => ({ count: 1 })),
          },
          medicationSchedule: {
            findUniqueOrThrow: vi.fn(async () => ({
              id: schedId,
              doseAmount: new Prisma.Decimal('1'),
              doseUnit: 'drop',
            })),
          },
          patientMedication: {
            findUniqueOrThrow: vi.fn(async () => ({
              id: medId,
              stockRemaining: new Prisma.Decimal('1'),
              stockUnit: 'bottle',
            })),
            update: medUpdate,
          },
          inventoryTransaction: {
            findUnique: vi.fn(async () => null),
            create: vi.fn(),
          },
        }),
      ),
    } as unknown as PrismaService;

    const svc = new DoseLogsService(prisma);

    await expect(
      svc.markExistingDoseEvent('other-user', eventId, 'TAKEN'),
    ).rejects.toThrow(ForbiddenException);

    const dropRes = await svc.markExistingDoseEvent('owner-user', eventId, 'TAKEN');
    expect(dropRes.stockDeducted).toBe(false);
    expect(dropRes.newStockRemaining).toBe('1.00');
    expect(medUpdate).not.toHaveBeenCalled();
  });

  it('computes MISSED dose history strictly past grace period for active schedules only', async () => {
    const activeSchedId = '11111111-1111-4111-8111-111111111111';
    const pausedSchedId = '22222222-2222-4222-8222-222222222222';
    // At 10:30 AM Asia/Dhaka on 2026-11-23:
    // - 08:00 AM -> past 60m grace -> missed (1)
    // - 10:00 AM -> within 60m grace (30m) -> NOT missed
    // - 20:00 PM -> upcoming -> NOT missed
    // - paused schedule 07:00 AM -> paused -> NOT missed
    const now = zonedDateTimeToUtc('2026-11-23', '10:30', 'Asia/Dhaka');
    const takenAtUtc = zonedDateTimeToUtc('2026-11-22', '08:00', 'Asia/Dhaka');

    const prisma = {
      doseEvent: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: '33333333-3333-4333-8333-333333333333',
            scheduleId: activeSchedId,
            patientMedicationId: 'm1',
            scheduledFor: takenAtUtc,
            status: DoseEventStatus.TAKEN,
            recordedAt: zonedDateTimeToUtc('2026-11-22', '08:05', 'Asia/Dhaka'),
            note: 'After breakfast',
            schedule: {
              doseAmount: new Prisma.Decimal('1'),
              doseUnit: 'tablet',
            },
            patientMedication: {
              name: 'Napa',
              strength: '500 mg',
              dosageForm: 'Tablet',
            },
          },
        ]),
      },
      medicationSchedule: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: activeSchedId,
            patientMedicationId: 'm1',
            doseAmount: new Prisma.Decimal('1'),
            doseUnit: 'tablet',
            frequency: 'CUSTOM_TIMES',
            intervalHours: null,
            weekdays: [],
            scheduledTimes: ['08:00', '10:00', '20:00'],
            startDate: zonedDateTimeToUtc('2026-11-23', '00:00', 'Asia/Dhaka'),
            endDate: null,
            status: ScheduleStatus.ACTIVE,
            patientMedication: {
              id: 'm1',
              name: 'Napa',
              strength: '500 mg',
              dosageForm: 'Tablet',
              status: MedicationStatus.ACTIVE,
            },
          },
          {
            id: pausedSchedId,
            patientMedicationId: 'm2',
            doseAmount: new Prisma.Decimal('1'),
            doseUnit: 'capsule',
            frequency: 'DAILY',
            intervalHours: null,
            weekdays: [],
            scheduledTimes: ['07:00'],
            startDate: zonedDateTimeToUtc('2026-11-22', '00:00', 'Asia/Dhaka'),
            endDate: null,
            status: ScheduleStatus.PAUSED,
            patientMedication: {
              id: 'm2',
              name: 'Seclo',
              strength: '20 mg',
              dosageForm: 'Capsule',
              status: MedicationStatus.ACTIVE,
            },
          },
        ]),
      },
    } as unknown as PrismaService;

    const svc = new DoseLogsService(prisma);
    const allRes = await svc.listDoseHistory(
      'patient-1',
      'Asia/Dhaka',
      { from: '2026-11-22', to: '2026-11-23', status: 'ALL' },
      now,
    );

    expect(allRes.counts).toEqual({ all: 2, taken: 1, skipped: 0, missed: 1 });
    expect(allRes.items.map((i) => i.status)).toEqual(['missed', 'taken']);
    expect(allRes.items[0].scheduledTime12).toBe('08:00 AM');
    expect(allRes.items[1].recordedAt).toBe(
      zonedDateTimeToUtc('2026-11-22', '08:05', 'Asia/Dhaka').toISOString(),
    );

    const missedOnly = await svc.listDoseHistory(
      'patient-1',
      'Asia/Dhaka',
      { from: '2026-11-22', to: '2026-11-23', status: 'MISSED' },
      now,
    );
    expect(missedOnly.items).toHaveLength(1);
    expect(missedOnly.items[0].status).toBe('missed');
  });
});
