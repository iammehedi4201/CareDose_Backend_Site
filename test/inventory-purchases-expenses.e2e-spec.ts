import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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

interface MockInventoryTx {
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

interface MockPurchase {
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

function createPhase7PrismaMock() {
  const users: MockUser[] = [];
  const patients: MockPatient[] = [];
  const medications: MockMedication[] = [];
  const schedules: MockSchedule[] = [];
  const inventoryTxs: MockInventoryTx[] = [];
  const purchases: MockPurchase[] = [];

  const hydrateMed = (med: MockMedication) => {
    const patient = patients.find((p) => p.id === med.patientId);
    const medSchedules = schedules.filter((s) => s.patientMedicationId === med.id);
    const medPurchases = purchases
      .filter((p) => p.patientMedicationId === med.id)
      .sort((a, b) => b.purchaseDate.getTime() - a.purchaseDate.getTime());
    const medTxs = inventoryTxs
      .filter((t) => t.patientMedicationId === med.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

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
      schedules: medSchedules,
      purchases: medPurchases,
      doseEvents: [],
      inventoryTransactions: medTxs,
      _count: {
        schedules: medSchedules.length,
        purchases: medPurchases.length,
      },
    };
  };

  const applyPurchaseWhere = (
    list: MockPurchase[],
    where?: {
      patientId?: string;
      patientMedicationId?: string;
      AND?: Array<Record<string, unknown>>;
    },
  ): MockPurchase[] => {
    if (!where) return list;
    let out = [...list];
    if (where.patientId) out = out.filter((p) => p.patientId === where.patientId);
    if (where.patientMedicationId) {
      out = out.filter((p) => p.patientMedicationId === where.patientMedicationId);
    }
    if (Array.isArray(where.AND)) {
      for (const cond of where.AND) {
        if (typeof cond.patientId === 'string') {
          out = out.filter((p) => p.patientId === cond.patientId);
        }
        if (typeof cond.patientMedicationId === 'string') {
          out = out.filter((p) => p.patientMedicationId === cond.patientMedicationId);
        }
        if (cond.purchaseDate && typeof cond.purchaseDate === 'object') {
          const range = cond.purchaseDate as { gte?: Date; lt?: Date };
          if (range.gte) out = out.filter((p) => p.purchaseDate >= range.gte!);
          if (range.lt) out = out.filter((p) => p.purchaseDate < range.lt!);
        }
      }
    }
    return out;
  };

  const db = {
    reset() {
      users.length = 0;
      patients.length = 0;
      medications.length = 0;
      schedules.length = 0;
      inventoryTxs.length = 0;
      purchases.length = 0;
    },
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
          data: {
            email: string;
            passwordHash: string;
            displayName: string;
            glucoseUnit?: GlucoseUnit;
          };
        }) => {
          const now = new Date();
          const user: MockUser = {
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
          users.push(user);
          return user;
        },
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const u = users.find((x) => x.id === where.id);
        if (!u) throw new Error('User not found');
        Object.assign(u, data, { updatedAt: new Date() });
        return u;
      }),
    },
    patientProfile: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = patients.find((x) => x.id === where.id);
        if (!p) return null;
        const ownerUser = users.find((u) => u.id === p.ownerUserId);
        return { ...p, ownerUser };
      }),
      findMany: vi.fn(async ({ where }: { where: { ownerUserId: string } }) =>
        patients.filter((p) => p.ownerUserId === where.ownerUserId),
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
          const patient: MockPatient = {
            id: randomUUID(),
            ownerUserId: data.ownerUserId,
            name: data.name,
            relationship: data.relationship,
            timezone: data.timezone,
            isDefault: data.isDefault,
            createdAt: now,
            updatedAt: now,
          };
          patients.push(patient);
          return patient;
        },
      ),
    },
    patientMedication: {
      findMany: vi.fn(async ({ where }: { where: { patientId?: string; status?: MedicationStatus } }) => {
        return medications
          .filter((m) => (!where.patientId || m.patientId === where.patientId) && (!where.status || m.status === where.status))
          .map(hydrateMed);
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const med = medications.find((m) => m.id === where.id);
        return med ? hydrateMed(med) : null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const med: MockMedication = {
          id: randomUUID(),
          patientId: String(data.patientId),
          catalogueBrandId: (data.catalogueBrandId as string | null) ?? null,
          name: String(data.name),
          genericName: (data.genericName as string | null) ?? null,
          strength: (data.strength as string | null) ?? null,
          dosageForm: (data.dosageForm as string | null) ?? null,
          manufacturer: (data.manufacturer as string | null) ?? null,
          personalInstructions: String(data.personalInstructions ?? ''),
          stockRemaining: new Prisma.Decimal(String(data.stockRemaining ?? 0)),
          stockUnit: String(data.stockUnit ?? 'tablets'),
          lowStockThreshold: new Prisma.Decimal(String(data.lowStockThreshold ?? 5)),
          status: (data.status as MedicationStatus) ?? MedicationStatus.ACTIVE,
          createdAt: now,
          updatedAt: now,
        };
        medications.push(med);
        return hydrateMed(med);
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const med = medications.find((m) => m.id === where.id);
        if (!med) throw new Error('Med not found');
        Object.assign(med, data, { updatedAt: new Date() });
        return hydrateMed(med);
      }),
    },
    medicationSchedule: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const sched: MockSchedule = {
          id: randomUUID(),
          patientMedicationId: String(data.patientMedicationId),
          doseAmount: new Prisma.Decimal(String(data.doseAmount)),
          doseUnit: String(data.doseUnit),
          frequency: String(data.frequency),
          intervalHours: (data.intervalHours as number | null) ?? null,
          weekdays: Array.isArray(data.weekdays) ? (data.weekdays as number[]) : [],
          scheduledTimes: Array.isArray(data.scheduledTimes) ? (data.scheduledTimes as string[]) : [],
          startDate: data.startDate as Date,
          endDate: (data.endDate as Date | null) ?? null,
          instructions: (data.instructions as string | null) ?? null,
          remindersEnabled: Boolean(data.remindersEnabled ?? true),
          status: (data.status as ScheduleStatus) ?? ScheduleStatus.ACTIVE,
          createdAt: now,
          updatedAt: now,
        };
        schedules.push(sched);
        return { ...sched, patientMedication: medications.find((m) => m.id === sched.patientMedicationId) };
      }),
    },
    purchase: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const purchase: MockPurchase = {
          id: randomUUID(),
          patientId: String(data.patientId),
          patientMedicationId: String(data.patientMedicationId),
          purchaseDate: data.purchaseDate as Date,
          packCount: Number(data.packCount),
          unitsPerPack: new Prisma.Decimal(String(data.unitsPerPack)),
          totalUnitsAdded: new Prisma.Decimal(String(data.totalUnitsAdded)),
          amountPaid: new Prisma.Decimal(String(data.amountPaid)),
          currency: String(data.currency ?? 'BDT'),
          vendor: (data.vendor as string | null) ?? null,
          note: (data.note as string | null) ?? null,
          createdAt: new Date(),
        };
        purchases.push(purchase);
        const med = medications.find((m) => m.id === purchase.patientMedicationId);
        return {
          ...purchase,
          patientMedication: med
            ? {
                id: med.id,
                name: med.name,
                strength: med.strength,
                dosageForm: med.dosageForm,
                stockUnit: med.stockUnit,
              }
            : null,
        };
      }),
      findMany: vi.fn(async ({ where, take }: { where?: Record<string, unknown>; take?: number }) => {
        const filtered = applyPurchaseWhere(purchases, where as Parameters<typeof applyPurchaseWhere>[1])
          .sort((a, b) => b.purchaseDate.getTime() - a.purchaseDate.getTime())
          .map((p) => {
            const med = medications.find((m) => m.id === p.patientMedicationId);
            return {
              ...p,
              patientMedication: med
                ? {
                    id: med.id,
                    name: med.name,
                    strength: med.strength,
                    dosageForm: med.dosageForm,
                    stockUnit: med.stockUnit,
                  }
                : null,
            };
          });
        return take ? filtered.slice(0, take) : filtered;
      }),
    },
    inventoryTransaction: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const tx: MockInventoryTx = {
          id: randomUUID(),
          patientMedicationId: String(data.patientMedicationId),
          doseEventId: (data.doseEventId as string | null) ?? null,
          purchaseId: (data.purchaseId as string | null) ?? null,
          cataloguePackId: (data.cataloguePackId as string | null) ?? null,
          type: data.type as InventoryTransactionType,
          enteredQuantity: data.enteredQuantity ? new Prisma.Decimal(String(data.enteredQuantity)) : null,
          enteredUnit: (data.enteredUnit as string | null) ?? null,
          baseUnit: (data.baseUnit as string | null) ?? null,
          quantityDelta: new Prisma.Decimal(String(data.quantityDelta)),
          balanceAfter: new Prisma.Decimal(String(data.balanceAfter)),
          reason: (data.reason as string | null) ?? null,
          note: (data.note as string | null) ?? null,
          createdAt: new Date(),
        };
        inventoryTxs.push(tx);
        return tx;
      }),
      findMany: vi.fn(async ({ where, take }: { where?: { AND?: Array<Record<string, unknown>> }; take?: number }) => {
        const medCond = where?.AND?.find((c) => typeof c.patientMedicationId === 'string');
        const typeCond = where?.AND?.find((c) => typeof c.type === 'string');
        const rows = inventoryTxs
          .filter(
            (t) =>
              (!medCond || t.patientMedicationId === medCond.patientMedicationId) &&
              (!typeCond || t.type === typeCond.type),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take ? rows.slice(0, take) : rows;
      }),
    },
    $transaction: vi.fn(async (cb: (client: unknown) => Promise<unknown>) => cb(db)),
    medicineBrand: { findUnique: vi.fn(async () => null) },
    medicinePack: { findFirst: vi.fn(async () => null) },
  };

  return db;
}

describe('Phase 7 E2E — Inventory, Purchases & Expenses API', () => {
  let app: INestApplication;
  const prismaMock = createPhase7PrismaMock();

  beforeAll(async () => {
    process.env.SKIP_DB_CONNECT_ON_INIT = 'true';
    process.env.JWT_SECRET = 'phase7-e2e-jwt-secret';
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
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

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prismaMock.reset();
  });

  it('enforces ownership, records purchases atomically with stock transactions, adjusts stock, and returns expense summary', async () => {
    const regA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'phase7a@example.com',
        password: 'Password123',
        displayName: 'Karim',
        timezone: 'Asia/Dhaka',
      })
      .expect(201);
    const tokenA = regA.body.accessToken as string;
    const patientAId = regA.body.defaultPatientProfile.id as string;

    await request(app.getHttpServer())
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ monthlyBudget: 2500 })
      .expect(200);

    const regB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'phase7b@example.com',
        password: 'Password123',
        displayName: 'Other User',
      })
      .expect(201);
    const tokenB = regB.body.accessToken as string;

    const medRes = await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientAId}/medications`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Corvalen 5 mg',
        dosageForm: 'Tablet',
        startingStock: 10,
        lowStockThreshold: 5,
      })
      .expect(201);
    const medId = medRes.body.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/patient-medications/${medId}/schedules`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        doseAmount: 1,
        doseUnit: 'tablet',
        frequency: 'DAILY',
        scheduledTimes: ['08:00 AM'],
        startDate: '2026-11-01',
      })
      .expect(201);

    // Record Purchase (2 packs * 10 = +20 tablets -> stock 30)
    const purRes = await request(app.getHttpServer())
      .post(`/api/v1/patient-medications/${medId}/purchases`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        purchaseDate: '2026-11-24',
        packCount: 2,
        unitsPerPack: 10,
        amountPaid: 370,
        vendor: 'Lazz Pharma',
      })
      .expect(201);

    expect(purRes.body.newStockRemaining).toBe('30.00');
    expect(purRes.body.purchase.totalUnitsAdded).toBe('20.00');
    expect(purRes.body.purchase.unitPrice).toBe('18.50');
    expect(purRes.body.inventoryTransaction.type).toBe(InventoryTransactionType.PURCHASE);

    // Adjust stock: deduct 2 wasted tablets -> stock 28
    const adjRes = await request(app.getHttpServer())
      .post(`/api/v1/patient-medications/${medId}/inventory/adjust`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        mode: 'DEDUCT',
        quantity: 2,
        reason: 'Damaged / wasted',
      })
      .expect(200);

    expect(adjRes.body.stockRemaining).toBe('28.00');
    expect(adjRes.body.transaction.type).toBe(InventoryTransactionType.WASTAGE);
    expect(adjRes.body.transaction.quantityDelta).toBe('-2.00');

    // Ownership isolation check for User B
    await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientAId}/purchases`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/patient-medications/${medId}/inventory/adjust`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ mode: 'ADD', quantity: 5 })
      .expect(403);

    // Purchase list & inventory ledger
    const purchasesList = await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientAId}/purchases`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(purchasesList.body.summary).toEqual({
      totalCount: 1,
      totalAmountPaid: '370.00',
      currency: 'BDT',
    });

    const ledgerRes = await request(app.getHttpServer())
      .get(`/api/v1/patient-medications/${medId}/inventory`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(ledgerRes.body.stockRemaining).toBe('28.00');
    expect(ledgerRes.body.items.length).toBeGreaterThanOrEqual(3);

    // Expenses summary
    const expRes = await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientAId}/expenses?month=2026-11`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(expRes.body.actualSpent).toBe('370.00');
    expect(expRes.body.monthlyBudget).toBe('2500.00');
    expect(expRes.body.budgetRemaining).toBe('2130.00');
    expect(expRes.body.estimatedMonthlyCost.hasEstimate).toBe(true);
    // 1 tablet/day * 30 days * 18.50 = 555.00
    expect(expRes.body.estimatedMonthlyCost.totalEstimatedCost).toBe('555.00');
  });
});
