import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GlucoseUnit, Prisma } from '@prisma/client';
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

function project<T extends Record<string, unknown>>(
  row: T,
  select?: Record<string, unknown>,
): Record<string, unknown> {
  if (!select) return { ...row };
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(select)) {
    if (v === true) {
      result[k] = row[k];
    }
  }
  return result;
}

function createInMemoryPrismaMock() {
  const users: MockUserRow[] = [];
  const patients: MockPatientRow[] = [];

  const db = {
    reset() {
      users.length = 0;
      patients.length = 0;
    },
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
    checkConnection: vi.fn().mockResolvedValue({ connected: true }),
    user: {
      findUnique: vi.fn(
        async ({
          where,
          select,
        }: {
          where: { id?: string; email?: string };
          select?: Record<string, unknown>;
        }) => {
          const found = users.find((u) =>
            where.id ? u.id === where.id : u.email === where.email,
          );
          if (!found) return null;
          const out = project(found as unknown as Record<string, unknown>, select);
          if (select && typeof select.patientProfiles === 'object' && select.patientProfiles !== null) {
            const profileSelect = (select.patientProfiles as { select?: Record<string, unknown> }).select;
            out.patientProfiles = patients
              .filter((p) => p.ownerUserId === found.id)
              .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.getTime() - b.createdAt.getTime())
              .map((p) => project(p as unknown as Record<string, unknown>, profileSelect));
          }
          return out;
        },
      ),
      create: vi.fn(
        async ({
          data,
          select,
        }: {
          data: Partial<MockUserRow> & { email: string; passwordHash: string; displayName: string };
          select?: Record<string, unknown>;
        }) => {
          const now = new Date();
          const row: MockUserRow = {
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
          return project(row as unknown as Record<string, unknown>, select);
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
          select,
        }: {
          where: { id: string };
          data: Partial<MockUserRow>;
          select?: Record<string, unknown>;
        }) => {
          const idx = users.findIndex((u) => u.id === where.id);
          if (idx === -1) throw new Error('User not found');
          users[idx] = { ...users[idx], ...data, updatedAt: new Date() };
          return project(users[idx] as unknown as Record<string, unknown>, select);
        },
      ),
    },
    patientProfile: {
      findMany: vi.fn(
        async ({
          where,
          select,
        }: {
          where: { ownerUserId: string };
          select?: Record<string, unknown>;
        }) =>
          patients
            .filter((p) => p.ownerUserId === where.ownerUserId)
            .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.getTime() - b.createdAt.getTime())
            .map((p) => project(p as unknown as Record<string, unknown>, select)),
      ),
      findUnique: vi.fn(
        async ({
          where,
          select,
        }: {
          where: { id: string };
          select?: Record<string, unknown>;
        }) => {
          const found = patients.find((p) => p.id === where.id);
          return found ? project(found as unknown as Record<string, unknown>, select) : null;
        },
      ),
      findFirst: vi.fn(
        async ({
          where,
          select,
        }: {
          where: { ownerUserId: string };
          select?: Record<string, unknown>;
        }) => {
          const matches = patients
            .filter((p) => p.ownerUserId === where.ownerUserId)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          return matches[0]
            ? project(matches[0] as unknown as Record<string, unknown>, select)
            : null;
        },
      ),
      count: vi.fn(
        async ({ where }: { where: { ownerUserId: string } }) =>
          patients.filter((p) => p.ownerUserId === where.ownerUserId).length,
      ),
      create: vi.fn(
        async ({
          data,
          select,
        }: {
          data: {
            ownerUserId: string;
            name: string;
            relationship: string;
            timezone: string;
            isDefault: boolean;
          };
          select?: Record<string, unknown>;
        }) => {
          const now = new Date(Date.now() + patients.length);
          const row: MockPatientRow = {
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
          return project(row as unknown as Record<string, unknown>, select);
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { ownerUserId: string; isDefault?: boolean };
          data: Partial<MockPatientRow>;
        }) => {
          let count = 0;
          for (let i = 0; i < patients.length; i += 1) {
            const p = patients[i];
            if (
              p.ownerUserId === where.ownerUserId &&
              (where.isDefault === undefined || p.isDefault === where.isDefault)
            ) {
              patients[i] = { ...p, ...data, updatedAt: new Date() };
              count += 1;
            }
          }
          return { count };
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
          select,
        }: {
          where: { id: string };
          data: Partial<MockPatientRow>;
          select?: Record<string, unknown>;
        }) => {
          const idx = patients.findIndex((p) => p.id === where.id);
          if (idx === -1) throw new Error('Patient profile not found');
          patients[idx] = { ...patients[idx], ...data, updatedAt: new Date() };
          return project(patients[idx] as unknown as Record<string, unknown>, select);
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = patients.findIndex((p) => p.id === where.id);
        if (idx === -1) throw new Error('Patient profile not found');
        const [removed] = patients.splice(idx, 1);
        return removed;
      }),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(db)),
  };

  return db;
}

describe('Phase 3 API (Auth, User Settings, Patient Profile Ownership & DTO Validation)', () => {
  let app: INestApplication;
  const prismaMock = createInMemoryPrismaMock();

  beforeAll(async () => {
    process.env.SKIP_DB_CONNECT_ON_INIT = 'true';
    process.env.JWT_SECRET = 'caredose-phase3-e2e-jwt-secret-key-32';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
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
    prismaMock.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers user, creates default Self patient profile, prevents duplicate email, and hides passwordHash', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: '  Karim.Hasan@Example.com ',
        password: 'StrongPassword123',
        displayName: '  Karim Hasan ',
        timezone: 'Asia/Dhaka',
      })
      .expect(201);

    expect(regRes.body.accessToken).toBeTypeOf('string');
    expect(regRes.body.tokenType).toBe('Bearer');
    expect(regRes.body.user.email).toBe('karim.hasan@example.com');
    expect(regRes.body.user.displayName).toBe('Karim Hasan');
    expect(regRes.body.user.passwordHash).toBeUndefined();
    expect(regRes.body.defaultPatientProfile).toMatchObject({
      name: 'Karim Hasan',
      relationship: 'Self',
      timezone: 'Asia/Dhaka',
      isDefault: true,
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'karim.hasan@example.com',
        password: 'StrongPassword123',
        displayName: 'Karim Duplicate',
      })
      .expect(409);
  });

  it('rejects invalid DTO payloads with 400 Bad Request across auth, settings, and patient endpoints', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'not-an-email',
        password: 'short',
        displayName: '   ',
        timezone: 'Invalid/Zone',
        role: 'ADMIN',
      })
      .expect(400);

    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'validator@example.com',
        password: 'ValidPassword123',
        displayName: 'Validator User',
      })
      .expect(201);
    const token = regRes.body.accessToken as string;

    await request(app.getHttpServer())
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        monthlyBudget: -100,
        reminderLeadMins: 500,
        passwordHash: 'hijack',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Mother',
        timezone: 'Mars/Olympus',
      })
      .expect(400);
  });

  it('authenticates via login, updates settings, and enforces strict cross-user patient ownership', async () => {
    await request(app.getHttpServer()).get('/api/v1/patients').expect(401);

    const regA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'alice@example.com',
        password: 'AlicePassword123',
        displayName: 'Alice',
      })
      .expect(201);

    const regB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'bob@example.com',
        password: 'BobPassword123',
        displayName: 'Bob',
      })
      .expect(201);

    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ' ALICE@example.com ', password: 'AlicePassword123' })
      .expect(200);

    const aliceToken = loginA.body.accessToken as string;
    const bobToken = regB.body.accessToken as string;
    const aliceDefaultId = regA.body.defaultPatientProfile.id as string;
    const bobDefaultId = regB.body.defaultPatientProfile.id as string;

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com', password: 'WrongPassword!' })
      .expect(401);

    const settingsRes = await request(app.getHttpServer())
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        glucoseUnit: GlucoseUnit.MMOL_L,
        monthlyBudget: 3250.5,
        reminderLeadMins: 15,
      })
      .expect(200);
    expect(settingsRes.body.glucoseUnit).toBe(GlucoseUnit.MMOL_L);
    expect(settingsRes.body.monthlyBudget).toBe('3250.50');
    expect(settingsRes.body.reminderLeadMins).toBe(15);

    const authMeRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(authMeRes.body.user.email).toBe('alice@example.com');
    expect(authMeRes.body.user.passwordHash).toBeUndefined();
    expect(authMeRes.body.patientProfiles).toHaveLength(1);

    const userMeRes = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(userMeRes.body.monthlyBudget).toBe('3250.50');

    const clearedBudgetRes = await request(app.getHttpServer())
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ monthlyBudget: null })
      .expect(200);
    expect(clearedBudgetRes.body.monthlyBudget).toBeNull();

    const createMotherRes = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        name: 'Amina Begum',
        relationship: 'Mother',
        timezone: 'Asia/Dhaka',
        isDefault: true,
      })
      .expect(201);
    const motherId = createMotherRes.body.id as string;

    // Cross-user isolation checks (Bob cannot read, modify, or delete Alice's patient)
    await request(app.getHttpServer())
      .get(`/api/v1/patients/${aliceDefaultId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/patients/${motherId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ name: 'Tampered Name' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/patients/${motherId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/patients/not-a-uuid')
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/patients/99999999-9999-4999-8999-999999999999')
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(404);

    // Bob cannot delete his sole patient profile
    await request(app.getHttpServer())
      .delete(`/api/v1/patients/${bobDefaultId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(400);

    // Alice can read & update her own profile, and deleting default promotes remaining profile
    const ownedGetRes = await request(app.getHttpServer())
      .get(`/api/v1/patients/${motherId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(ownedGetRes.body.name).toBe('Amina Begum');

    const ownedPatchRes = await request(app.getHttpServer())
      .patch(`/api/v1/patients/${motherId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Amina Haque' })
      .expect(200);
    expect(ownedPatchRes.body.name).toBe('Amina Haque');

    await request(app.getHttpServer())
      .delete(`/api/v1/patients/${motherId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    const aliceList = await request(app.getHttpServer())
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    expect(aliceList.body).toHaveLength(1);
    expect(aliceList.body[0].id).toBe(aliceDefaultId);
    expect(aliceList.body[0].isDefault).toBe(true);
  });
});
