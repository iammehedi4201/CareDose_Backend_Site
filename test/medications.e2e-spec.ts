import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FieldStatus,
  GlucoseUnit,
  InventoryTransactionType,
  MedicationStatus,
  Prisma,
  VerificationStatus,
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

interface MockInventoryTx {
  id: string;
  patientMedicationId: string;
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

const SAMPLE_CATALOGUE_GENERIC = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  sourceId: '3',
  name: 'Aceclofenac',
  slug: 'aceclofenac',
};

const SAMPLE_CATALOGUE_BRAND = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  sourceId: '1',
  name: 'Celofen',
  normalizedName: 'celofen',
  genericId: SAMPLE_CATALOGUE_GENERIC.id,
  strength: '100 mg',
  strengthNorm: '100mg',
  dosageForm: 'Tablet',
  dosageFormNorm: 'tablet',
  manufacturer: 'ACI Limited',
  manufacturerSourceId: '2',
  category: 'allopathic',
  releaseMarker: null,
  productUrl: 'https://medex.com.bd/brands/1/celofen-100-mg-tablet',
  collectedAt: new Date('2026-07-09T00:00:00Z'),
  verification: VerificationStatus.UNVERIFIED,
  genericFieldStatus: FieldStatus.PRESENT,
  strengthFieldStatus: FieldStatus.PRESENT,
  formFieldStatus: FieldStatus.PRESENT,
  mfrFieldStatus: FieldStatus.PRESENT,
  priceFieldStatus: FieldStatus.PRESENT,
  warnings: [],
  importBatchId: null,
  createdAt: new Date('2026-11-21T00:00:00Z'),
  updatedAt: new Date('2026-11-21T00:00:00Z'),
  generic: SAMPLE_CATALOGUE_GENERIC,
  packs: [
    {
      id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      brandId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      packQuantity: '5 x 10',
      packUnits: 50,
      stripUnits: 10,
      unitPrice: new Prisma.Decimal('4.01'),
      packPrice: new Prisma.Decimal('200.50'),
      currency: 'BDT',
      unitPriceLabel: 'Unit Price',
      priceSource: 'brand_page',
      sourceUrl: null,
      collectedAt: null,
      verification: VerificationStatus.UNVERIFIED,
      warnings: [],
      createdAt: new Date('2026-11-21T00:00:00Z'),
    },
  ],
  images: [],
};

function createPhase5PrismaMock() {
  const users: MockUser[] = [];
  const patients: MockPatient[] = [];
  const medications: MockMedication[] = [];
  const inventoryTxs: MockInventoryTx[] = [];
  const purchases: MockPurchase[] = [];

  const hydrateMed = (med: MockMedication) => {
    const patient = patients.find((p) => p.id === med.patientId);
    const brand = med.catalogueBrandId === SAMPLE_CATALOGUE_BRAND.id ? SAMPLE_CATALOGUE_BRAND : null;
    const txs = inventoryTxs.filter((t) => t.patientMedicationId === med.id);
    const medPurchases = purchases.filter((pr) => pr.patientMedicationId === med.id);
    return {
      ...med,
      patient: patient ? { ownerUserId: patient.ownerUserId, id: patient.id, name: patient.name } : undefined,
      catalogueBrand: brand,
      schedules: [],
      purchases: medPurchases,
      doseEvents: [],
      inventoryTransactions: txs,
      _count: { schedules: 0, purchases: medPurchases.length },
    };
  };

  const db = {
    reset() {
      users.length = 0;
      patients.length = 0;
      medications.length = 0;
      inventoryTxs.length = 0;
      purchases.length = 0;
    },
    inventoryTxs,
    purchases,
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
            ...data,
            createdAt: now,
            updatedAt: now,
          };
          patients.push(row);
          return row;
        },
      ),
    },
    medicineBrand: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; sourceId?: string } }) => {
        if (where.id === SAMPLE_CATALOGUE_BRAND.id || where.sourceId === SAMPLE_CATALOGUE_BRAND.sourceId) {
          return SAMPLE_CATALOGUE_BRAND;
        }
        return null;
      }),
    },
    medicinePack: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; brandId?: string } }) => {
        if (
          where.id === SAMPLE_CATALOGUE_BRAND.packs[0].id &&
          where.brandId === SAMPLE_CATALOGUE_BRAND.id
        ) {
          return { id: SAMPLE_CATALOGUE_BRAND.packs[0].id };
        }
        return null;
      }),
    },
    patientMedication: {
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        const andList = Array.isArray(where?.AND)
          ? (where.AND as Array<Record<string, unknown>>)
          : [];
        const matched = medications.filter((m) =>
          andList.every((cond) => {
            if (typeof cond.patientId === 'string' && m.patientId !== cond.patientId) return false;
            if (cond.status && m.status !== cond.status) return false;
            if (Array.isArray(cond.OR)) {
              const q = (cond.OR[0] as { name?: { contains?: string } })?.name?.contains ?? '';
              const hay = `${m.name} ${m.genericName ?? ''} ${m.strength ?? ''} ${m.dosageForm ?? ''}`.toLowerCase();
              if (!hay.includes(q.toLowerCase())) return false;
            }
            return true;
          }),
        );
        return matched.map(hydrateMed);
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const found = medications.find((m) => m.id === where.id);
        return found ? hydrateMed(found) : null;
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
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
          };
        }) => {
          const now = new Date();
          const row: MockMedication = {
            id: randomUUID(),
            ...data,
            createdAt: now,
            updatedAt: now,
          };
          medications.push(row);
          return hydrateMed(row);
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<MockMedication>;
        }) => {
          const found = medications.find((m) => m.id === where.id);
          if (!found) throw new Error('Not found');
          Object.assign(found, data, { updatedAt: new Date() });
          return hydrateMed(found);
        },
      ),
    },
    purchase: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            patientId: string;
            patientMedicationId: string;
            purchaseDate: Date;
            packCount: number;
            unitsPerPack: Prisma.Decimal;
            totalUnitsAdded: Prisma.Decimal;
            amountPaid: Prisma.Decimal;
            vendor?: string | null;
            note?: string | null;
          };
        }) => {
          const row: MockPurchase = {
            id: randomUUID(),
            patientId: data.patientId,
            patientMedicationId: data.patientMedicationId,
            purchaseDate: data.purchaseDate,
            packCount: data.packCount,
            unitsPerPack: data.unitsPerPack,
            totalUnitsAdded: data.totalUnitsAdded,
            amountPaid: data.amountPaid,
            currency: 'BDT',
            vendor: data.vendor ?? null,
            note: data.note ?? null,
            createdAt: new Date(),
          };
          purchases.push(row);
          return row;
        },
      ),
    },
    inventoryTransaction: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            patientMedicationId: string;
            purchaseId?: string | null;
            cataloguePackId?: string | null;
            type: InventoryTransactionType;
            enteredQuantity?: Prisma.Decimal | null;
            enteredUnit?: string | null;
            baseUnit?: string | null;
            quantityDelta: Prisma.Decimal;
            balanceAfter: Prisma.Decimal;
            reason: string | null;
            note?: string | null;
          };
        }) => {
          const row: MockInventoryTx = {
            id: randomUUID(),
            patientMedicationId: data.patientMedicationId,
            purchaseId: data.purchaseId ?? null,
            cataloguePackId: data.cataloguePackId ?? null,
            type: data.type,
            enteredQuantity: data.enteredQuantity ?? null,
            enteredUnit: data.enteredUnit ?? null,
            baseUnit: data.baseUnit ?? null,
            quantityDelta: data.quantityDelta,
            balanceAfter: data.balanceAfter,
            reason: data.reason,
            note: data.note ?? null,
            createdAt: new Date(),
          };
          inventoryTxs.push(row);
          return row;
        },
      ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  };

  return db;
}

describe('Phase 5 Medications API (CRUD, Catalogue Link, Low-Stock, Archive/Restore, Ownership)', () => {
  let app: INestApplication;
  const prismaMock = createPhase5PrismaMock();

  beforeAll(async () => {
    process.env.SKIP_DB_CONNECT_ON_INIT = 'true';
    process.env.JWT_SECRET = 'caredose-phase5-medications-test-secret';

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

  it('creates manual & catalogue-linked medicines atomically with opening stock, preserves empty schedules, filters low-stock, archives & restores, and enforces strict ownership', async () => {
    const regA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'user-a@example.com',
        password: 'StrongPassword123',
        displayName: 'User A',
      })
      .expect(201);

    const regB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'user-b@example.com',
        password: 'StrongPassword123',
        displayName: 'User B',
      })
      .expect(201);

    const tokenA = regA.body.accessToken as string;
    const tokenB = regB.body.accessToken as string;
    const patientA = regA.body.defaultPatientProfile.id as string;

    // 1. Require auth & valid medicine name when manual; personalInstructions is optional
    await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientA}/medications`)
      .expect(401);

    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientA}/medications`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ startingStock: 10 })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientA}/medications`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ catalogueBrandId: '999999', startingStock: 10 })
      .expect(404);

    // 2. Manual medicine add with low stock
    const manualRes = await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientA}/medications`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Glymexa 500 mg',
        genericName: 'Metformin',
        strength: '500 mg',
        dosageForm: 'Tablet',
        personalInstructions: '1 tablet with morning meal',
        startingStock: 5,
        lowStockThreshold: 7,
      })
      .expect(201);

    expect(manualRes.body.isLowStock).toBe(true);
    expect(manualRes.body.stockRemaining).toBe('5.00');
    expect(manualRes.body.schedulesCount).toBe(0);
    expect(prismaMock.inventoryTxs).toHaveLength(1);
    expect(prismaMock.inventoryTxs[0].type).toBe(InventoryTransactionType.OPENING_STOCK);

    // 3. Catalogue-linked medicine add WITHOUT personalInstructions, WITH strip entry + pack ID + optional purchase
    const catRes = await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientA}/medications`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        catalogueBrandId: '1',
        startingStock: 30,
        stockUnit: 'tablets',
        enteredQuantity: 3,
        enteredUnit: 'strips',
        selectedPackId: SAMPLE_CATALOGUE_BRAND.packs[0].id,
        lowStockThreshold: 5,
        purchaseDetails: {
          amountPaid: 120.3,
          vendor: 'Local Pharmacy',
        },
      })
      .expect(201);

    expect(catRes.body.name).toBe('Celofen');
    expect(catRes.body.genericName).toBe('Aceclofenac');
    expect(catRes.body.manufacturer).toBe('ACI Limited');
    expect(catRes.body.personalInstructions).toBe('');
    expect(catRes.body.isLowStock).toBe(false);
    expect(catRes.body.schedulesCount).toBe(0);
    expect(catRes.body.purchasesCount).toBe(1);

    const catDetail = await request(app.getHttpServer())
      .get(`/api/v1/patient-medications/${catRes.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(catDetail.body.recentPurchases).toHaveLength(1);
    expect(catDetail.body.recentPurchases[0].amountPaid).toBe('120.30');
    expect(catDetail.body.recentInventoryTransactions).toHaveLength(1);
    expect(catDetail.body.recentInventoryTransactions[0]).toMatchObject({
      type: InventoryTransactionType.OPENING_STOCK,
      enteredQuantity: '3.00',
      enteredUnit: 'strips',
      baseUnit: 'tablets',
      cataloguePackId: SAMPLE_CATALOGUE_BRAND.packs[0].id,
      quantityDelta: '30.00',
      balanceAfter: '30.00',
    });

    // 4. Low-stock filter returns only Glymexa
    const lowStockList = await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientA}/medications?lowStock=true`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(lowStockList.body).toHaveLength(1);
    expect(lowStockList.body[0].name).toBe('Glymexa 500 mg');

    // 5. Strict cross-user ownership guard blocks User B from User A's medicine
    const manualId = manualRes.body.id as string;
    await request(app.getHttpServer())
      .get(`/api/v1/patient-medications/${manualId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/patient-medications/${manualId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Tampered' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/patient-medications/${manualId}/archive`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);

    // 6. Edit, Archive, and Restore flow for owner User A
    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/patient-medications/${manualId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        personalInstructions: '1 tablet after breakfast',
        lowStockThreshold: 10,
      })
      .expect(200);
    expect(patchRes.body.personalInstructions).toBe('1 tablet after breakfast');
    expect(patchRes.body.lowStockThreshold).toBe('10.00');

    const archRes = await request(app.getHttpServer())
      .post(`/api/v1/patient-medications/${manualId}/archive`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(archRes.body.status).toBe(MedicationStatus.ARCHIVED);
    expect(archRes.body.isLowStock).toBe(false);

    const archivedList = await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientA}/medications?status=ARCHIVED`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(archivedList.body).toHaveLength(1);
    expect(archivedList.body[0].id).toBe(manualId);

    const restoreRes = await request(app.getHttpServer())
      .post(`/api/v1/patient-medications/${manualId}/restore`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(restoreRes.body.status).toBe(MedicationStatus.ACTIVE);
    expect(restoreRes.body.isLowStock).toBe(true);
  });
});
