import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GlucoseUnit, Prisma, ReadingContext } from '@prisma/client';
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

interface MockHealthReading {
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

function createPhase8PrismaMock() {
  const users: MockUser[] = [];
  const patients: MockPatient[] = [];
  const readings: MockHealthReading[] = [];

  const applyReadingWhere = (
    list: MockHealthReading[],
    where?: {
      patientId?: string;
      AND?: Array<Record<string, unknown>>;
    },
  ): MockHealthReading[] => {
    if (!where) return [...list];
    let out = [...list];
    if (where.patientId) out = out.filter((r) => r.patientId === where.patientId);
    if (Array.isArray(where.AND)) {
      for (const cond of where.AND) {
        if (typeof cond.patientId === 'string') {
          out = out.filter((r) => r.patientId === cond.patientId);
        }
        if (typeof cond.context === 'string') {
          out = out.filter((r) => r.context === cond.context);
        }
        if (cond.measuredAt && typeof cond.measuredAt === 'object') {
          const range = cond.measuredAt as { gte?: Date; lt?: Date };
          if (range.gte) out = out.filter((r) => r.measuredAt >= range.gte!);
          if (range.lt) out = out.filter((r) => r.measuredAt < range.lt!);
        }
        if (Array.isArray(cond.OR)) {
          const [ltDateCond, eqDateCond] = cond.OR as Array<{
            measuredAt?: { lt?: Date } | Date;
            id?: { lt?: string };
          }>;
          const cursorDate =
            ltDateCond?.measuredAt && typeof ltDateCond.measuredAt === 'object' && 'lt' in ltDateCond.measuredAt
              ? ltDateCond.measuredAt.lt!
              : null;
          const cursorId = eqDateCond?.id?.lt ?? '';
          if (cursorDate) {
            out = out.filter(
              (r) =>
                r.measuredAt < cursorDate ||
                (r.measuredAt.getTime() === cursorDate.getTime() && r.id < cursorId),
            );
          }
        }
      }
    }
    return out;
  };

  const db = {
    reset() {
      users.length = 0;
      patients.length = 0;
      readings.length = 0;
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
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const u = users.find((x) => x.id === where.id);
          if (!u) throw new Error('User not found');
          Object.assign(u, data, { updatedAt: new Date() });
          return u;
        },
      ),
    },
    patientProfile: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = patients.find((x) => x.id === where.id);
        if (!p) return null;
        return { ...p, ownerUser: users.find((u) => u.id === p.ownerUserId) };
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
            relationship?: string;
            timezone?: string;
            isDefault?: boolean;
          };
        }) => {
          const now = new Date();
          const p: MockPatient = {
            id: randomUUID(),
            ownerUserId: data.ownerUserId,
            name: data.name,
            relationship: data.relationship ?? 'Self',
            timezone: data.timezone ?? 'Asia/Dhaka',
            isDefault: Boolean(data.isDefault),
            createdAt: now,
            updatedAt: now,
          };
          patients.push(p);
          return p;
        },
      ),
    },
    healthReading: {
      findMany: vi.fn(
        async ({
          where,
          take,
        }: {
          where?: { patientId?: string; AND?: Array<Record<string, unknown>> };
          take?: number;
        }) => {
          const sorted = applyReadingWhere(readings, where).sort((a, b) => {
            const byTime = b.measuredAt.getTime() - a.measuredAt.getTime();
            if (byTime !== 0) return byTime;
            return b.id.localeCompare(a.id);
          });
          return typeof take === 'number' ? sorted.slice(0, take) : sorted;
        },
      ),
      count: vi.fn(
        async ({
          where,
        }: {
          where?: { patientId?: string; AND?: Array<Record<string, unknown>> };
        }) => applyReadingWhere(readings, where).length,
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return readings.find((r) => r.id === where.id) ?? null;
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            patientId: string;
            value: Prisma.Decimal;
            unit: GlucoseUnit;
            context: ReadingContext;
            measuredAt: Date;
            note: string | null;
          };
        }) => {
          const now = new Date();
          const row: MockHealthReading = {
            id: randomUUID(),
            patientId: data.patientId,
            value: data.value,
            unit: data.unit,
            context: data.context,
            measuredAt: data.measuredAt,
            note: data.note,
            createdAt: now,
            updatedAt: now,
          };
          readings.push(row);
          return row;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = readings.findIndex((r) => r.id === where.id);
        if (idx >= 0) {
          const [removed] = readings.splice(idx, 1);
          return removed;
        }
        throw new Error('Reading not found');
      }),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(db)),
  };

  return db;
}

describe('Phase 8 HealthLogs & User Settings E2E', () => {
  let app: INestApplication;
  const prismaMock = createPhase8PrismaMock();

  beforeAll(async () => {
    process.env.JWT_SECRET = 'phase8-test-secret-key';
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
        transform: true,
        forbidNonWhitelisted: true,
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

  it('creates, lists, paginates, converts units cleanly, enforces ownership, and deletes health readings', async () => {
    const regA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'phase8-a@example.com',
        password: 'StrongPassword123',
        displayName: 'Karim',
        timezone: 'Asia/Dhaka',
      })
      .expect(201);

    const tokenA = regA.body.accessToken as string;
    const patientA = regA.body.defaultPatientProfile.id as string;

    const regB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'phase8-b@example.com',
        password: 'StrongPassword123',
        displayName: 'Other User',
      })
      .expect(201);
    const tokenB = regB.body.accessToken as string;

    // 1. Create readings in mixed mg/dL and mmol/L and human labels
    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientA}/health-readings`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        value: 102,
        unit: 'mg/dL',
        context: 'Fasting',
        date: '2026-11-23',
        time: '07:30 AM',
      })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientA}/health-readings`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        value: 6.2,
        unit: 'mmol/L',
        context: 'After meal',
        date: '2026-11-24',
        time: '02:15 PM',
        note: 'Post lunch',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientA}/health-readings`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        value: 108,
        unit: 'MG_DL',
        context: 'FASTING',
        date: '2026-11-25',
        time: '07:45 AM',
      })
      .expect(201);

    // 2. Ownership enforcement (User B cannot access or mutate User A's readings)
    await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientA}/health-readings`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/patients/${patientA}/health-readings/${second.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);

    // 3. List with pagination (limit=2) & verify chart points scaled in preferred MG_DL
    const page1 = await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientA}/health-readings?limit=2`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(page1.body.totalCount).toBe(3);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();
    expect(page1.body.latestReading.displayValue).toBe('108');
    expect(page1.body.chartPoints).toHaveLength(3);
    expect(page1.body.chartPoints[1]).toMatchObject({
      originalValue: '6.2',
      originalUnitLabel: 'mmol/L',
      convertedValue: 112,
      unitLabel: 'mg/dL',
    });

    const page2 = await request(app.getHttpServer())
      .get(
        `/api/v1/patients/${patientA}/health-readings?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`,
      )
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();

    // 4. Persist user settings (glucoseUnit -> MMOL_L, displayName, reminders) and verify chart rescales
    const settingsRes = await request(app.getHttpServer())
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        displayName: 'Karim Rahman',
        glucoseUnit: 'MMOL_L',
        remindersEnabled: false,
        soundEnabled: false,
        reminderLeadMins: 15,
        monthlyBudget: 3000,
      })
      .expect(200);

    expect(settingsRes.body.displayName).toBe('Karim Rahman');
    expect(settingsRes.body.glucoseUnit).toBe('MMOL_L');
    expect(settingsRes.body.remindersEnabled).toBe(false);
    expect(settingsRes.body.reminderLeadMins).toBe(15);

    const rescaled = await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientA}/health-readings?context=FASTING`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(rescaled.body.preferredUnitLabel).toBe('mmol/L');
    expect(rescaled.body.totalCount).toBe(2);
    expect(rescaled.body.chartPoints[2].unitLabel).toBe('mmol/L');
    expect(rescaled.body.chartPoints[2].convertedValue).toBe(6);

    // 5. Delete reading cleanly
    await request(app.getHttpServer())
      .delete(`/api/v1/patients/${patientA}/health-readings/${second.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const afterDelete = await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientA}/health-readings`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(afterDelete.body.totalCount).toBe(2);
  });
});
