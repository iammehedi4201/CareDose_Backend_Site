import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DoseEventStatus,
  GlucoseUnit,
  InventoryTransactionType,
  MedicationStatus,
  Prisma,
  ScheduleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface MockUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  glucoseUnit: GlucoseUnit;
  currency: string;
  monthlyBudget: Prisma.Decimal | null;
  remindersEnabled: boolean;
  soundEnabled: boolean;
  reminderLeadMins: number;
  createdAt: Date;
  updatedAt: Date;
}

interface MockPatient {
  id: string;
  ownerUserId: string;
  name: string;
  relationship: string;
  timezone: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MockMedication {
  id: string;
  patientId: string;
  catalogueBrandId: string | null;
  name: string;
  genericName: string | null;
  strength: string | null;
  dosageForm: string | null;
  manufacturer: string | null;
  personalInstructions: string;
  stockRemaining: Prisma.Decimal;
  stockUnit: string;
  lowStockThreshold: Prisma.Decimal;
  status: MedicationStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface MockSchedule {
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
  instructions: string | null;
  remindersEnabled: boolean;
  status: ScheduleStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface MockDoseEvent {
  id: string;
  scheduleId: string;
  patientMedicationId: string;
  scheduledFor: Date;
  status: DoseEventStatus;
  recordedAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockInventoryTx {
  id: string;
  patientMedicationId: string;
  doseEventId: string | null;
  type: InventoryTransactionType;
  quantityDelta: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  reason: string | null;
  note: string | null;
  createdAt: Date;
}

function createPhase6PrismaMock() {
  const users: MockUser[] = [];
  const patients: MockPatient[] = [];
  const medications: MockMedication[] = [];
  const schedules: MockSchedule[] = [];
  const doseEvents: MockDoseEvent[] = [];
  const inventoryTxs: MockInventoryTx[] = [];

  const hydrateMed = (med: MockMedication) => {
    const patient = patients.find((p) => p.id === med.patientId);
    const txs = inventoryTxs.filter((t) => t.patientMedicationId === med.id);
    return {
      ...med,
      patient: patient
        ? {
            id: patient.id,
            ownerUserId: patient.ownerUserId,
            name: patient.name,
            timezone: patient.timezone,
          }
        : undefined,
      catalogueBrand: null,
      schedules: schedules.filter((s) => s.patientMedicationId === med.id),
      purchases: [],
      doseEvents: doseEvents.filter((e) => e.patientMedicationId === med.id),
      inventoryTransactions: txs,
      _count: {
        schedules: schedules.filter((s) => s.patientMedicationId === med.id).length,
        purchases: 0,
      },
    };
  };

  const hydrateSchedule = (s: MockSchedule) => {
    const med = medications.find((m) => m.id === s.patientMedicationId);
    const patient = med ? patients.find((p) => p.id === med.patientId) : undefined;
    return {
      ...s,
      patientMedication: med
        ? {
            id: med.id,
            patientId: med.patientId,
            name: med.name,
            strength: med.strength,
            dosageForm: med.dosageForm,
            stockUnit: med.stockUnit,
            personalInstructions: med.personalInstructions,
            status: med.status,
            patient: patient
              ? { ownerUserId: patient.ownerUserId, timezone: patient.timezone }
              : undefined,
          }
        : undefined,
    };
  };

  const hydrateEvent = (ev: MockDoseEvent) => {
    const sched = schedules.find((s) => s.id === ev.scheduleId);
    const med = medications.find((m) => m.id === ev.patientMedicationId);
    const patient = med ? patients.find((p) => p.id === med.patientId) : undefined;
    const inv = inventoryTxs.find((t) => t.doseEventId === ev.id) ?? null;
    return {
      ...ev,
      schedule: sched,
      patientMedication: med
        ? {
            ...med,
            patient: patient ? { ownerUserId: patient.ownerUserId } : undefined,
          }
        : undefined,
      inventoryTransaction: inv,
    };
  };

  const db = {
    reset() {
      users.length = 0;
      patients.length = 0;
      medications.length = 0;
      schedules.length = 0;
      doseEvents.length = 0;
      inventoryTxs.length = 0;
    },
    inventoryTxs,
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
    checkConnection: vi.fn().mockResolvedValue({ connected: true }),
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        const u = users.find((x) => (where.id ? x.id === where.id : x.email === where.email));
        if (!u) return null;
        return {
          ...u,
          patientProfiles: patients.filter((p) => p.ownerUserId === u.id),
        };
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: { email: string; passwordHash: string; displayName: string; glucoseUnit?: GlucoseUnit };
        }) => {
          const now = new Date();
          const row: MockUser = {
            id: randomUUID(),
            email: data.email,
            passwordHash: data.passwordHash,
            displayName: data.displayName,
            glucoseUnit: data.glucoseUnit ?? GlucoseUnit.MG_DL,
            currency: 'BDT',
            monthlyBudget: null,
            remindersEnabled: true,
            soundEnabled: true,
            reminderLeadMins: 10,
            createdAt: now,
            updatedAt: now,
          };
          users.push(row);
          return row;
        },
      ),
    },
    patientProfile: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        patients.find((p) => p.id === where.id) ?? null,
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            ownerUserId: string;
            name: string;
            relationship: string;
            timezone: string;
            isDefault: boolean;
          };
        }) => {
          const now = new Date();
          const row: MockPatient = {
            id: randomUUID(),
            ownerUserId: data.ownerUserId,
            name: data.name,
            relationship: data.relationship,
            timezone: data.timezone,
            isDefault: data.isDefault,
            createdAt: now,
            updatedAt: now,
          };
          patients.push(row);
          return row;
        },
      ),
    },
    patientMedication: {
      findMany: vi.fn(async ({ where }: { where: { AND: Array<Record<string, unknown>> } }) => {
        const patientCond = where.AND.find((c) => 'patientId' in c) as
          | { patientId: string }
          | undefined;
        return medications
          .filter((m) => (patientCond ? m.patientId === patientCond.patientId : true))
          .map(hydrateMed);
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const med = medications.find((m) => m.id === where.id);
        return med ? hydrateMed(med) : null;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const med = medications.find((m) => m.id === where.id);
        if (!med) throw new Error('Medication not found');
        return hydrateMed(med);
      }),
      create: vi.fn(async ({ data }: { data: Omit<MockMedication, 'id' | 'createdAt' | 'updatedAt'> }) => {
        const now = new Date();
        const row: MockMedication = {
          ...data,
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        medications.push(row);
        return hydrateMed(row);
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockMedication> }) => {
        const idx = medications.findIndex((m) => m.id === where.id);
        if (idx === -1) throw new Error('Not found');
        medications[idx] = { ...medications[idx], ...data, updatedAt: new Date() };
        return hydrateMed(medications[idx]);
      }),
    },
    medicationSchedule: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where?: {
            patientMedicationId?: string;
            patientMedication?: { patientId?: string; id?: string; status?: MedicationStatus };
            status?: ScheduleStatus;
          };
        }) => {
          return schedules
            .filter((s) => {
              if (where?.patientMedicationId && s.patientMedicationId !== where.patientMedicationId) {
                return false;
              }
              const med = medications.find((m) => m.id === s.patientMedicationId);
              if (where?.patientMedication?.patientId && med?.patientId !== where.patientMedication.patientId) {
                return false;
              }
              if (where?.patientMedication?.id && med?.id !== where.patientMedication.id) {
                return false;
              }
              if (where?.patientMedication?.status && med?.status !== where.patientMedication.status) {
                return false;
              }
              if (where?.status && s.status !== where.status) return false;
              return true;
            })
            .map(hydrateSchedule);
        },
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const s = schedules.find((x) => x.id === where.id);
        return s ? hydrateSchedule(s) : null;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const s = schedules.find((x) => x.id === where.id);
        if (!s) throw new Error('Schedule not found');
        return hydrateSchedule(s);
      }),
      create: vi.fn(
        async ({ data }: { data: Omit<MockSchedule, 'id' | 'createdAt' | 'updatedAt'> }) => {
          const now = new Date();
          const row: MockSchedule = {
            ...data,
            intervalHours: data.intervalHours ?? null,
            weekdays: data.weekdays ?? [],
            id: randomUUID(),
            createdAt: now,
            updatedAt: now,
          };
          schedules.push(row);
          return hydrateSchedule(row);
        },
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<MockSchedule> }) => {
          const idx = schedules.findIndex((s) => s.id === where.id);
          if (idx === -1) throw new Error('Not found');
          schedules[idx] = { ...schedules[idx], ...data, updatedAt: new Date() };
          return hydrateSchedule(schedules[idx]);
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = schedules.findIndex((s) => s.id === where.id);
        const [removed] = idx >= 0 ? schedules.splice(idx, 1) : [];
        return removed;
      }),
    },
    doseEvent: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { AND?: Array<Record<string, unknown>>; patientMedication?: { patientId?: string } };
        }) => {
          return doseEvents
            .filter((ev) => {
              const med = medications.find((m) => m.id === ev.patientMedicationId);
              if (where.patientMedication?.patientId && med?.patientId !== where.patientMedication.patientId) {
                return false;
              }
              if (where.AND) {
                for (const cond of where.AND) {
                  if (cond.patientMedication && (cond.patientMedication as { patientId?: string }).patientId !== med?.patientId) {
                    return false;
                  }
                  if (cond.patientMedicationId && cond.patientMedicationId !== ev.patientMedicationId) {
                    return false;
                  }
                  if (cond.status && typeof cond.status === 'string' && ev.status !== cond.status) {
                    return false;
                  }
                  if (cond.status && typeof cond.status === 'object' && 'in' in cond.status) {
                    const allowed = (cond.status as { in: DoseEventStatus[] }).in;
                    if (!allowed.includes(ev.status)) return false;
                  }
                  if (cond.scheduledFor && typeof cond.scheduledFor === 'object') {
                    const range = cond.scheduledFor as { gte?: Date; lt?: Date };
                    if (range.gte && ev.scheduledFor < range.gte) return false;
                    if (range.lt && ev.scheduledFor >= range.lt) return false;
                  }
                }
              }
              return true;
            })
            .sort((a, b) => b.scheduledFor.getTime() - a.scheduledFor.getTime())
            .map(hydrateEvent);
        },
      ),
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { id?: string; scheduleId_scheduledFor?: { scheduleId: string; scheduledFor: Date } };
        }) => {
          const ev = where.id
            ? doseEvents.find((x) => x.id === where.id)
            : doseEvents.find(
                (x) =>
                  x.scheduleId === where.scheduleId_scheduledFor?.scheduleId &&
                  x.scheduledFor.getTime() === where.scheduleId_scheduledFor?.scheduledFor.getTime(),
              );
          return ev ? hydrateEvent(ev) : null;
        },
      ),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const ev = doseEvents.find((x) => x.id === where.id);
        if (!ev) throw new Error('DoseEvent not found');
        return hydrateEvent(ev);
      }),
      create: vi.fn(
        async ({ data }: { data: Omit<MockDoseEvent, 'id' | 'createdAt' | 'updatedAt' | 'recordedAt' | 'note'> }) => {
          const now = new Date();
          const row: MockDoseEvent = {
            ...data,
            recordedAt: null,
            note: null,
            id: randomUUID(),
            createdAt: now,
            updatedAt: now,
          };
          doseEvents.push(row);
          return hydrateEvent(row);
        },
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<MockDoseEvent> }) => {
          const idx = doseEvents.findIndex((e) => e.id === where.id);
          if (idx === -1) throw new Error('Not found');
          doseEvents[idx] = { ...doseEvents[idx], ...data, updatedAt: new Date() };
          return hydrateEvent(doseEvents[idx]);
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; status?: { not?: DoseEventStatus } };
          data: Partial<MockDoseEvent>;
        }) => {
          const idx = doseEvents.findIndex(
            (e) => e.id === where.id && (!where.status?.not || e.status !== where.status.not),
          );
          if (idx === -1) return { count: 0 };
          doseEvents[idx] = { ...doseEvents[idx], ...data, updatedAt: new Date() };
          return { count: 1 };
        },
      ),
      groupBy: vi.fn(async () => {
        const taken = doseEvents.filter((e) => e.status === DoseEventStatus.TAKEN).length;
        const skipped = doseEvents.filter((e) => e.status === DoseEventStatus.SKIPPED).length;
        return [
          ...(taken > 0 ? [{ status: DoseEventStatus.TAKEN, _count: { _all: taken } }] : []),
          ...(skipped > 0 ? [{ status: DoseEventStatus.SKIPPED, _count: { _all: skipped } }] : []),
        ];
      }),
    },
    inventoryTransaction: {
      findUnique: vi.fn(async ({ where }: { where: { doseEventId?: string } }) =>
        inventoryTxs.find((t) => t.doseEventId === where.doseEventId) ?? null,
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            patientMedicationId: string;
            doseEventId?: string;
            type: InventoryTransactionType;
            quantityDelta: Prisma.Decimal;
            balanceAfter: Prisma.Decimal;
            reason?: string;
            note?: string | null;
          };
        }) => {
          const row: MockInventoryTx = {
            id: randomUUID(),
            patientMedicationId: data.patientMedicationId,
            doseEventId: data.doseEventId ?? null,
            type: data.type,
            quantityDelta: data.quantityDelta,
            balanceAfter: data.balanceAfter,
            reason: data.reason ?? null,
            note: data.note ?? null,
            createdAt: new Date(),
          };
          inventoryTxs.push(row);
          return row;
        },
      ),
    },
    medicineBrand: { findUnique: vi.fn().mockResolvedValue(null) },
    catalogueImportBatch: { findFirst: vi.fn().mockResolvedValue(null) },
    medicineGeneric: { count: vi.fn().mockResolvedValue(0) },
    medicinePack: { count: vi.fn().mockResolvedValue(0) },
    alternativeGroup: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(db)),
  };

  return db;
}

describe('Phase 6 — Schedules & DoseLogs API E2E (DTO Validation, Ownership, Atomic Stock & History)', () => {
  let app: INestApplication;
  const mockDb = createPhase6PrismaMock();

  beforeAll(async () => {
    process.env.SKIP_DB_CONNECT_ON_INIT = 'true';
    process.env.JWT_SECRET = 'caredose-phase6-e2e-jwt-secret-key';
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockDb)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    mockDb.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates schedules, lists week occurrences, deducts stock once idempotently on Taken, skips safely, filters history, and isolates users', async () => {
    const regA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'phase6-a@example.com',
        password: 'StrongPassword123',
        displayName: 'User A',
        timezone: 'Asia/Dhaka',
      })
      .expect(201);

    const regB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'phase6-b@example.com',
        password: 'StrongPassword123',
        displayName: 'User B',
      })
      .expect(201);

    const tokenA = regA.body.accessToken as string;
    const tokenB = regB.body.accessToken as string;
    const patientA = regA.body.defaultPatientProfile.id as string;

    const medRes = await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientA}/medications`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Corvalen 5 mg',
        dosageForm: 'Tablet',
        personalInstructions: '1 tablet twice daily after meal',
        startingStock: 10,
        lowStockThreshold: 4,
      })
      .expect(201);

    const medId = medRes.body.id as string;

    // Create schedule with endDate < startDate rejected
    await request(app.getHttpServer())
      .post(`/api/v1/patient-medications/${medId}/schedules`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        doseAmount: 1,
        doseUnit: 'tablet',
        frequency: 'TWICE_DAILY',
        scheduledTimes: ['08:00 AM', '08:00 PM'],
        startDate: '2026-11-22',
        endDate: '2026-11-20',
      })
      .expect(400);

    const schedRes = await request(app.getHttpServer())
      .post(`/api/v1/patient-medications/${medId}/schedules`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        doseAmount: 2,
        doseUnit: 'tablet',
        frequency: 'TWICE_DAILY',
        scheduledTimes: ['08:00 AM', '08:00 PM'],
        startDate: '2026-11-22',
        instructions: 'After breakfast & dinner',
      })
      .expect(201);

    const scheduleId = schedRes.body.id as string;
    expect(schedRes.body.scheduledTimes).toEqual(['08:00', '20:00']);

    // Cross-user isolation on schedules & doses
    await request(app.getHttpServer())
      .patch(`/api/v1/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ remindersEnabled: false })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientA}/doses?date=2026-11-22&days=7`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);

    const weekRes = await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientA}/doses?date=2026-11-22&days=7`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(weekRes.body.days).toHaveLength(7);
    expect(weekRes.body.days[0].items).toHaveLength(2);

    const morningOccurrence = weekRes.body.days[0].items[0];
    const eveningOccurrence = weekRes.body.days[0].items[1];

    // Mark morning dose TAKEN twice -> deducts 2 tablets ONLY ONCE (10 -> 8)
    const takenFirst = await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientA}/dose-events/record`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        scheduleId,
        scheduledFor: morningOccurrence.scheduledFor,
        action: 'TAKEN',
      })
      .expect(200);

    expect(takenFirst.body.stockDeducted).toBe(true);
    expect(takenFirst.body.newStockRemaining).toBe('8.00');
    expect(takenFirst.body.idempotentReplay).toBe(false);

    const takenReplay = await request(app.getHttpServer())
      .post(`/api/v1/dose-events/${takenFirst.body.doseEventId}/mark-taken`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({})
      .expect(200);

    expect(takenReplay.body.stockDeducted).toBe(false);
    expect(takenReplay.body.newStockRemaining).toBe('8.00');
    expect(takenReplay.body.idempotentReplay).toBe(true);

    // Skip evening dose -> stock stays 8.00
    const skippedRes = await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientA}/dose-events/record`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        scheduleId,
        scheduledFor: eveningOccurrence.scheduledFor,
        action: 'SKIPPED',
      })
      .expect(200);

    expect(skippedRes.body.status).toBe('SKIPPED');
    expect(skippedRes.body.newStockRemaining).toBe('8.00');

    // Dose history returns both events & accurate filter counts
    const historyRes = await request(app.getHttpServer())
      .get(
        `/api/v1/patients/${patientA}/dose-history?status=ALL&medicationId=${medId}&from=2026-11-22&to=2026-11-22`,
      )
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(historyRes.body.counts).toEqual({ all: 2, taken: 1, skipped: 1, missed: 0 });
    expect(historyRes.body.items).toHaveLength(2);

    // Duplicate overlapping active schedule returns 409 Conflict
    await request(app.getHttpServer())
      .post(`/api/v1/patient-medications/${medId}/schedules`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        doseAmount: 2,
        doseUnit: 'tablet',
        frequency: 'TWICE_DAILY',
        scheduledTimes: ['08:00 AM', '08:00 PM'],
        startDate: '2026-11-22',
      })
      .expect(409);

    // Archiving a schedule preserves its dose history & removes it from future daily doses
    const archivedSched = await request(app.getHttpServer())
      .post(`/api/v1/schedules/${scheduleId}/archive`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(archivedSched.body.status).toBe('ARCHIVED');

    const dailyAfterArchive = await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientA}/doses?date=2026-11-23&days=1`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(dailyAfterArchive.body.days[0].items).toHaveLength(0);

    const historyAfterArchive = await request(app.getHttpServer())
      .get(
        `/api/v1/patients/${patientA}/dose-history?status=ALL&medicationId=${medId}&from=2026-11-22&to=2026-11-22`,
      )
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(historyAfterArchive.body.counts).toEqual({ all: 2, taken: 1, skipped: 1, missed: 0 });

    // Second medicine tests Every X hours & Selected weekdays + verifies stock is untouched on schedule creation
    const medRes2 = await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientA}/medications`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Seclo 20 mg',
        dosageForm: 'Capsule',
        startingStock: 20,
        stockUnit: 'capsules',
        lowStockThreshold: 5,
      })
      .expect(201);
    const med2Id = medRes2.body.id as string;

    const every8Res = await request(app.getHttpServer())
      .post(`/api/v1/patient-medications/${med2Id}/schedules`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        doseAmount: 1,
        doseUnit: 'capsules',
        frequency: 'EVERY_X_HOURS',
        intervalHours: 8,
        scheduledTimes: ['08:00 AM'],
        startDate: '2026-11-23',
        remindersEnabled: false,
      })
      .expect(201);

    expect(every8Res.body.frequency).toBe('EVERY_X_HOURS');
    expect(every8Res.body.intervalHours).toBe(8);

    // Stock remained 20.00 after creating schedule (never auto-deducted until Taken)
    const med2Check = await request(app.getHttpServer())
      .get(`/api/v1/patient-medications/${med2Id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(med2Check.body.stockRemaining).toBe('20.00');

    // Week view shows 2 occurrences on Nov 23 (08:00, 16:00) and 3 on Nov 24 (00:00, 08:00, 16:00) for med2Id
    const med2Week = await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientA}/doses?date=2026-11-23&days=2`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const nov23Med2Times = med2Week.body.days[0].items
      .filter((i: { patientMedicationId: string }) => i.patientMedicationId === med2Id)
      .map((i: { scheduledTime24: string }) => i.scheduledTime24);
    const nov24Med2Times = med2Week.body.days[1].items
      .filter((i: { patientMedicationId: string }) => i.patientMedicationId === med2Id)
      .map((i: { scheduledTime24: string }) => i.scheduledTime24);

    expect(nov23Med2Times).toEqual(['08:00', '16:00']);
    expect(nov24Med2Times).toEqual(['00:00', '08:00', '16:00']);
  });
});
