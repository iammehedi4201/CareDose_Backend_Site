import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DoseEventStatus,
  GlucoseUnit,
  InventoryTransactionType,
  MedicationStatus,
  Prisma,
  ReadingContext,
  ScheduleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface MockUserRow {
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

interface MockPatientRow {
  id: string;
  ownerUserId: string;
  name: string;
  relationship: string;
  timezone: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MockMedRow {
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

interface MockScheduleRow {
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

interface MockDoseEventRow {
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

interface MockPurchaseRow {
  id: string;
  patientId: string;
  patientMedicationId: string;
  purchaseDate: Date;
  packCount: number;
  unitsPerPack: Prisma.Decimal;
  totalUnitsAdded: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  currency: string;
  vendor: string | null;
  note: string | null;
  createdAt: Date;
}

interface MockInvTxRow {
  id: string;
  patientMedicationId: string;
  doseEventId: string | null;
  purchaseId: string | null;
  cataloguePackId: string | null;
  type: InventoryTransactionType;
  enteredQuantity: Prisma.Decimal | null;
  enteredUnit: string | null;
  baseUnit: string | null;
  quantityDelta: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  reason: string | null;
  note: string | null;
  createdAt: Date;
}

interface MockReadingRow {
  id: string;
  patientId: string;
  value: Prisma.Decimal;
  unit: GlucoseUnit;
  context: ReadingContext;
  measuredAt: Date;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function createBackupPrismaMock() {
  const users: MockUserRow[] = [];
  const patients: MockPatientRow[] = [];
  const meds: MockMedRow[] = [];
  const schedules: MockScheduleRow[] = [];
  const doseEvents: MockDoseEventRow[] = [];
  const purchases: MockPurchaseRow[] = [];
  const invTxs: MockInvTxRow[] = [];
  const readings: MockReadingRow[] = [];
  const catalogueBrands = [{ id: 'cat-brand-valid' }];

  const cascadeDeletePatients = (ownerUserId: string) => {
    const ownedPatientIds = new Set(
      patients.filter((p) => p.ownerUserId === ownerUserId).map((p) => p.id),
    );
    const ownedMedIds = new Set(
      meds.filter((m) => ownedPatientIds.has(m.patientId)).map((m) => m.id),
    );
    const filterInPlace = <T>(arr: T[], keep: (item: T) => boolean) => {
      for (let i = arr.length - 1; i >= 0; i -= 1) {
        if (!keep(arr[i])) arr.splice(i, 1);
      }
    };
    filterInPlace(invTxs, (x) => !ownedMedIds.has(x.patientMedicationId));
    filterInPlace(purchases, (x) => !ownedPatientIds.has(x.patientId));
    filterInPlace(doseEvents, (x) => !ownedMedIds.has(x.patientMedicationId));
    filterInPlace(schedules, (x) => !ownedMedIds.has(x.patientMedicationId));
    filterInPlace(meds, (x) => !ownedPatientIds.has(x.patientId));
    filterInPlace(readings, (x) => !ownedPatientIds.has(x.patientId));
    filterInPlace(patients, (x) => x.ownerUserId !== ownerUserId);
  };

  const db = {
    reset() {
      users.length = 0;
      patients.length = 0;
      meds.length = 0;
      schedules.length = 0;
      doseEvents.length = 0;
      purchases.length = 0;
      invTxs.length = 0;
      readings.length = 0;
    },
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
    checkConnection: vi.fn().mockResolvedValue({ connected: true }),
    medicineBrand: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        catalogueBrands.filter((b) => where.id.in.includes(b.id)),
      ),
    },
    medicinePack: {
      findMany: vi.fn(async () => []),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        const u = users.find((x) => (where.id ? x.id === where.id : x.email === where.email));
        if (!u) return null;
        return { ...u, patientProfiles: patients.filter((p) => p.ownerUserId === u.id) };
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            email: string;
            passwordHash: string;
            displayName: string;
            glucoseUnit?: GlucoseUnit;
          };
        }) => {
          const now = new Date();
          const u: MockUserRow = {
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
          users.push(u);
          return u;
        },
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const u = users.find((x) => x.id === where.id);
        if (!u) throw new Error('User not found');
        Object.assign(u, data, { updatedAt: new Date() });
        return u;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        cascadeDeletePatients(where.id);
        const idx = users.findIndex((x) => x.id === where.id);
        if (idx === -1) throw new Error('User not found');
        const [removed] = users.splice(idx, 1);
        return removed;
      }),
    },
    patientProfile: {
      findMany: vi.fn(
        async ({
          where,
          include,
        }: {
          where: { ownerUserId: string };
          include?: Record<string, unknown>;
        }) => {
          const owned = patients.filter((p) => p.ownerUserId === where.ownerUserId);
          if (!include) return owned;
          return owned.map((p) => ({
            ...p,
            medications: meds
              .filter((m) => m.patientId === p.id)
              .map((m) => ({
                ...m,
                schedules: schedules.filter((s) => s.patientMedicationId === m.id),
                doseEvents: doseEvents.filter((e) => e.patientMedicationId === m.id),
                purchases: purchases.filter((pur) => pur.patientMedicationId === m.id),
                inventoryTransactions: invTxs.filter(
                  (tx) => tx.patientMedicationId === m.id,
                ),
              })),
            healthReadings: readings.filter((r) => r.patientId === p.id),
          }));
        },
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = patients.find((x) => x.id === where.id);
        if (!p) return null;
        return { ...p, ownerUser: users.find((u) => u.id === p.ownerUserId) };
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            ownerUserId: string;
            name: string;
            relationship?: string;
            timezone?: string;
            isDefault?: boolean;
          };
        }) => {
          const now = new Date();
          const p: MockPatientRow = {
            id: randomUUID(),
            ownerUserId: data.ownerUserId,
            name: data.name,
            relationship: data.relationship ?? 'Self',
            timezone: data.timezone ?? 'Asia/Dhaka',
            isDefault: data.isDefault ?? false,
            createdAt: now,
            updatedAt: now,
          };
          patients.push(p);
          return p;
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: { ownerUserId: string } }) => {
        cascadeDeletePatients(where.ownerUserId);
        return { count: 1 };
      }),
    },
    patientMedication: {
      create: vi.fn(async ({ data }: { data: Omit<MockMedRow, 'id' | 'createdAt' | 'updatedAt'> }) => {
        const now = new Date();
        const row: MockMedRow = {
          ...data,
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        meds.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const m = meds.find((x) => x.id === where.id);
        if (!m) return null;
        return {
          ...m,
          patient: patients.find((p) => p.id === m.patientId) ?? null,
        };
      }),
    },
    medicationSchedule: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<MockScheduleRow, 'id' | 'createdAt' | 'updatedAt'>;
        }) => {
          const now = new Date();
          const row: MockScheduleRow = {
            ...data,
            id: randomUUID(),
            createdAt: now,
            updatedAt: now,
          };
          schedules.push(row);
          return row;
        },
      ),
    },
    doseEvent: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<MockDoseEventRow, 'id' | 'createdAt' | 'updatedAt'>;
        }) => {
          const now = new Date();
          const row: MockDoseEventRow = {
            ...data,
            id: randomUUID(),
            createdAt: now,
            updatedAt: now,
          };
          doseEvents.push(row);
          return row;
        },
      ),
    },
    purchase: {
      create: vi.fn(async ({ data }: { data: Omit<MockPurchaseRow, 'id' | 'createdAt'> }) => {
        const row: MockPurchaseRow = {
          ...data,
          id: randomUUID(),
          createdAt: new Date(),
        };
        purchases.push(row);
        return row;
      }),
    },
    inventoryTransaction: {
      create: vi.fn(async ({ data }: { data: MockInvTxRow }) => {
        const row: MockInvTxRow = {
          ...data,
          id: data.id || randomUUID(),
          createdAt: new Date(),
        };
        invTxs.push(row);
        return row;
      }),
    },
    healthReading: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<MockReadingRow, 'id' | 'createdAt' | 'updatedAt'>;
        }) => {
          const now = new Date();
          const row: MockReadingRow = {
            ...data,
            id: randomUUID(),
            createdAt: now,
            updatedAt: now,
          };
          readings.push(row);
          return row;
        },
      ),
    },
    $transaction: vi.fn(async (cb: (tx: typeof db) => Promise<unknown>) => cb(db)),
  };

  return db;
}

describe('Phase 9 Users Export, Restore & Account Deletion E2E', () => {
  let app: INestApplication;
  const mockDb = createBackupPrismaMock();

  beforeAll(async () => {
    process.env.JWT_SECRET = 'phase9-backup-test-secret';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockDb)
      .compile();

    app = moduleFixture.createNestApplication();
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
    if (app) {
      await app.close();
    }
  });

  it('exports owned records securely, restores full account graph atomically, isolates other users, and cascades DELETE /users/me', async () => {
    const regA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'usera-backup@example.com',
        password: 'StrongPassword123!',
        displayName: 'User A',
      })
      .expect(201);
    const tokenA = regA.body.accessToken as string;
    const patientA = regA.body.defaultPatientProfile.id as string;

    const regB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'userb-backup@example.com',
        password: 'StrongPassword123!',
        displayName: 'User B',
      })
      .expect(201);
    const tokenB = regB.body.accessToken as string;
    const patientB = regB.body.defaultPatientProfile.id as string;

    // Seed settings + health reading for User A and a separate reading for User B
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        displayName: 'Karim Backup',
        glucoseUnit: 'MMOL_L',
        monthlyBudget: 3200,
        remindersEnabled: false,
        reminderLeadMins: 15,
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientA}/health-readings`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        value: 6.1,
        unit: 'MMOL_L',
        context: 'FASTING',
        date: '2026-11-25',
        time: '07:30 AM',
        note: 'Morning check',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientB}/health-readings`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        value: 140,
        unit: 'MG_DL',
        context: 'AFTER_MEAL',
        date: '2026-11-25',
        time: '02:00 PM',
      })
      .expect(201);

    const exportRes = await request(app.getHttpServer())
      .get('/api/v1/users/me/export')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(exportRes.body.schemaVersion).toBe('caredose.backup.v1');
    expect(exportRes.body.account.passwordHash).toBeUndefined();
    expect(exportRes.body.account.displayName).toBe('Karim Backup');
    expect(exportRes.body.summary.profilesCount).toBe(1);
    expect(exportRes.body.summary.healthReadingsCount).toBe(1);
    expect(exportRes.body.patientProfiles[0].healthReadings[0].note).toBe(
      'Morning check',
    );

    // Build an expanded backup restore payload including medication, schedule, dose event, purchase, inventory tx, and dangling catalogue ref
    const restorePayload = {
      ...exportRes.body,
      patientProfiles: [
        {
          id: patientA,
          name: 'Karim Backup',
          relationship: 'Self',
          timezone: 'Asia/Dhaka',
          isDefault: true,
          medications: [
            {
              id: 'orig-med-1',
              catalogueBrandId: 'missing-brand-from-other-env',
              name: 'Napa 500 mg',
              genericName: 'Paracetamol',
              strength: '500 mg',
              dosageForm: 'Tablet',
              manufacturer: 'Beximco',
              personalInstructions: '1 tablet after meal',
              stockRemaining: '29.00',
              stockUnit: 'tablets',
              lowStockThreshold: '5.00',
              status: 'ACTIVE',
              schedules: [
                {
                  id: 'orig-sched-1',
                  doseAmount: '1.00',
                  doseUnit: 'tablet',
                  frequency: 'DAILY',
                  intervalHours: null,
                  weekdays: [],
                  scheduledTimes: ['08:00'],
                  startDate: '2026-11-25T00:00:00.000Z',
                  endDate: null,
                  instructions: 'After breakfast',
                  remindersEnabled: true,
                  status: 'ACTIVE',
                },
              ],
              doseEvents: [
                {
                  id: 'orig-ev-1',
                  scheduleId: 'orig-sched-1',
                  scheduledFor: '2026-11-25T02:00:00.000Z',
                  status: 'TAKEN',
                  recordedAt: '2026-11-25T02:05:00.000Z',
                  note: null,
                },
              ],
              purchases: [
                {
                  id: 'orig-pur-1',
                  purchaseDate: '2026-11-20T06:00:00.000Z',
                  packCount: 3,
                  unitsPerPack: '10.00',
                  totalUnitsAdded: '30.00',
                  amountPaid: '36.00',
                  currency: 'BDT',
                  vendor: 'Lazz Pharma',
                  note: null,
                },
              ],
              inventoryTransactions: [
                {
                  id: 'orig-tx-1',
                  doseEventId: 'orig-ev-1',
                  purchaseId: null,
                  cataloguePackId: 'missing-pack-id',
                  type: 'DOSE_CONSUMPTION',
                  enteredQuantity: '1.00',
                  enteredUnit: 'tablet',
                  baseUnit: 'tablets',
                  quantityDelta: '-1.00',
                  balanceAfter: '29.00',
                  reason: 'Dose taken',
                  note: null,
                },
              ],
            },
          ],
          healthReadings: exportRes.body.patientProfiles[0].healthReadings,
        },
      ],
    };

    const restoreRes = await request(app.getHttpServer())
      .post('/api/v1/users/me/restore')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(restorePayload)
      .expect(200);

    expect(restoreRes.body.summary).toEqual({
      profilesCount: 1,
      medicationsCount: 1,
      schedulesCount: 1,
      doseEventsCount: 1,
      purchasesCount: 1,
      inventoryTransactionsCount: 1,
      healthReadingsCount: 1,
    });

    const reExportRes = await request(app.getHttpServer())
      .get('/api/v1/users/me/export')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(
      reExportRes.body.patientProfiles[0].medications[0].catalogueBrandId,
    ).toBeNull();
    expect(
      reExportRes.body.patientProfiles[0].medications[0].purchases[0].vendor,
    ).toBe('Lazz Pharma');

    // Deletion requires exact confirmation
    await request(app.getHttpServer())
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ confirmation: 'NOPE' })
      .expect(400);

    await request(app.getHttpServer())
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ confirmation: 'DELETE' })
      .expect(200);

    // Token A is now permanently invalid
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(401);

    // User B remains completely untouched
    const userBExport = await request(app.getHttpServer())
      .get('/api/v1/users/me/export')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(userBExport.body.summary.healthReadingsCount).toBe(1);
    expect(userBExport.body.patientProfiles[0].healthReadings[0].value).toBe('140.00');
  });
});
