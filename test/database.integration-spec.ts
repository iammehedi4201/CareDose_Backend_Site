import { ConfigService } from '@nestjs/config';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth/auth.service';
import { TokenService } from '../src/auth/token.service';
import { DoseLogsService } from '../src/dose-logs/dose-logs.service';
import { ExpensesService } from '../src/expenses/expenses.service';
import { HealthLogsService } from '../src/health-logs/health-logs.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { MedicationsService } from '../src/medications/medications.service';
import { PatientsService } from '../src/patients/patients.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PurchasesService } from '../src/purchases/purchases.service';
import { SchedulesService } from '../src/schedules/schedules.service';
import { UsersBackupService } from '../src/users/users-backup.service';
import { UsersService } from '../src/users/users.service';

/**
 * Live PostgreSQL integration suite (Section 8.11 & Phase 3).
 * Must target a dedicated test database via TEST_DATABASE_URL, never production.
 * Run with: npm run test:db
 */
describe('PostgreSQL Live Database Integration (TEST_DATABASE_URL)', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  let usersService: UsersService;
  let patientsService: PatientsService;
  let medicationsService: MedicationsService;
  let schedulesService: SchedulesService;
  let doseLogsService: DoseLogsService;
  let inventoryService: InventoryService;
  let purchasesService: PurchasesService;
  let expensesService: ExpensesService;
  let healthLogsService: HealthLogsService;
  let usersBackupService: UsersBackupService;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    const testDbUrl = process.env.TEST_DATABASE_URL?.trim();
    if (!testDbUrl) {
      throw new Error(
        'TEST_DATABASE_URL is not configured. Configure a dedicated PostgreSQL test DB and run `npx prisma migrate deploy` before `npm run test:db`.',
      );
    }
    if (!/test/i.test(testDbUrl) && process.env.ALLOW_NON_TEST_DB_NAME !== 'true') {
      throw new Error(
        'Refusing to run DB integration tests because TEST_DATABASE_URL does not clearly reference a test database.',
      );
    }

    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? 'caredose-live-db-integration-test-secret';

    prisma = new PrismaService();
    await prisma.$connect();

    const config = {
      get: (key: string) => process.env[key],
    } as unknown as ConfigService;

    const tokenService = new TokenService(config);
    authService = new AuthService(prisma, tokenService);
    usersService = new UsersService(prisma);
    patientsService = new PatientsService(prisma);
    medicationsService = new MedicationsService(prisma);
    schedulesService = new SchedulesService(prisma);
    doseLogsService = new DoseLogsService(prisma);
    inventoryService = new InventoryService(prisma);
    purchasesService = new PurchasesService(prisma);
    expensesService = new ExpensesService(prisma);
    healthLogsService = new HealthLogsService(prisma);
    usersBackupService = new UsersBackupService(prisma);
  }, 60000);

  afterAll(async () => {
    if (prisma && createdEmails.length > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: createdEmails } },
      });
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  }, 60000);

  it(
    'persists users, patient profiles, unique email constraint, and ownership checks in PostgreSQL',
    async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const emailA = `phase3-a-${suffix}@example.com`;
    const emailB = `phase3-b-${suffix}@example.com`;
    createdEmails.push(emailA, emailB);

    const regA = await authService.register({
      email: emailA,
      password: 'LiveDbPassword123',
      displayName: 'DB User A',
      timezone: 'Asia/Dhaka',
    });
    const regB = await authService.register({
      email: emailB,
      password: 'LiveDbPassword123',
      displayName: 'DB User B',
    });

    await expect(
      authService.register({
        email: emailA,
        password: 'LiveDbPassword123',
        displayName: 'Duplicate A',
      }),
    ).rejects.toThrow(ConflictException);

    const updatedUser = await usersService.updateSettings(regA.user.id, {
      monthlyBudget: 1850.25,
      reminderLeadMins: 20,
    });
    expect(updatedUser.monthlyBudget).toBe('1850.25');

    const secondProfile = await patientsService.create(regA.user.id, {
      name: 'Father',
      relationship: 'Father',
      isDefault: true,
    });
    expect(secondProfile.isDefault).toBe(true);

    await expect(
      patientsService.getByIdForUser(regB.user.id, secondProfile.id),
    ).rejects.toThrow(ForbiddenException);

    // Simplification Phase: add catalogue-free med WITHOUT personalInstructions + entered strip conversion + optional purchase
    const stripMed = await medicationsService.createForPatient(secondProfile.id, {
      name: 'Napa Simple Add DB Test',
      dosageForm: 'Tablet',
      startingStock: 30,
      stockUnit: 'tablets',
      enteredQuantity: 3,
      enteredUnit: 'strips',
      purchaseDetails: { amountPaid: 36, vendor: 'Demo Pharmacy' },
    });
    expect(stripMed.personalInstructions).toBe('');
    expect(stripMed.stockRemaining).toBe('30.00');
    expect(stripMed.schedulesCount).toBe(0);
    expect(stripMed.purchasesCount).toBe(1);

    const stripDetail = await medicationsService.getById(stripMed.id);
    expect(stripDetail.recentInventoryTransactions[0]).toMatchObject({
      type: 'OPENING_STOCK',
      enteredQuantity: '3.00',
      enteredUnit: 'strips',
      baseUnit: 'tablets',
      quantityDelta: '30.00',
    });
    expect(stripDetail.recentPurchases[0].amountPaid).toBe('36.00');

    // Phase 6: create medication + schedule, mark dose taken atomically & verify idempotency
    const createdMed = await medicationsService.createForPatient(secondProfile.id, {
      name: 'Napa Phase 6 DB Test',
      dosageForm: 'Tablet',
      personalInstructions: '1 tablet twice daily',
      startingStock: 10,
      lowStockThreshold: 3,
    });
    const createdSched = await schedulesService.createForMedication(createdMed.id, {
      doseAmount: 2,
      doseUnit: 'tablet',
      frequency: 'DAILY',
      scheduledTimes: ['08:00 AM', '08:00 PM'],
      startDate: '2026-11-22',
    });
    const daily = await doseLogsService.getDailyOrWeekDoses(
      secondProfile.id,
      'Asia/Dhaka',
      { date: '2026-11-22', days: 1 },
    );
    expect(daily.days[0].items).toHaveLength(2);

    const firstOccurrence = daily.days[0].items[0];
    const [r1, r2] = await Promise.all([
      doseLogsService.recordOccurrenceForPatient(secondProfile.id, {
        scheduleId: createdSched.id,
        scheduledFor: firstOccurrence.scheduledFor,
        action: 'TAKEN',
      }),
      doseLogsService.recordOccurrenceForPatient(secondProfile.id, {
        scheduleId: createdSched.id,
        scheduledFor: firstOccurrence.scheduledFor,
        action: 'TAKEN',
      }),
    ]);

    const deductedCount = [r1, r2].filter((r) => r.stockDeducted).length;
    expect(deductedCount).toBe(1);

    const updatedMed = await medicationsService.getById(createdMed.id);
    expect(updatedMed.stockRemaining).toBe('8.00');

    const skipOccurrence = daily.days[0].items[1];
    const skipped = await doseLogsService.recordOccurrenceForPatient(secondProfile.id, {
      scheduleId: createdSched.id,
      scheduledFor: skipOccurrence.scheduledFor,
      action: 'SKIPPED',
    });
    expect(skipped.stockDeducted).toBe(false);
    expect(skipped.newStockRemaining).toBe('8.00');

    const history = await doseLogsService.listDoseHistory(
      secondProfile.id,
      'Asia/Dhaka',
      {
        status: 'ALL',
        medicationId: createdMed.id,
        from: '2026-11-22',
        to: '2026-11-22',
      },
    );
    expect(history.counts).toEqual({ all: 2, taken: 1, skipped: 1, missed: 0 });

    const archivedSched = await schedulesService.archiveForUser(
      regA.user.id,
      createdSched.id,
    );
    expect(archivedSched.status).toBe('ARCHIVED');

    const historyAfterArchive = await doseLogsService.listDoseHistory(
      secondProfile.id,
      'Asia/Dhaka',
      {
        status: 'ALL',
        medicationId: createdMed.id,
        from: '2026-11-22',
        to: '2026-11-22',
      },
    );
    expect(historyAfterArchive.counts).toEqual({ all: 2, taken: 1, skipped: 1, missed: 0 });

    // Phase 7: Purchase + InventoryTransaction + Stock Adjustment + Expense Summary
    // Note: earlier Phase 5 test on secondProfile recorded an initial ৳36.00 purchase today.
    const recordedPurchase = await purchasesService.recordForMedication(createdMed.id, {
      packCount: 2,
      unitsPerPack: 10,
      amountPaid: 24,
      vendor: 'Live DB Pharmacy',
    });
    expect(recordedPurchase.newStockRemaining).toBe('28.00');
    expect(recordedPurchase.purchase.unitPrice).toBe('1.20');

    const adjustedStock = await inventoryService.adjustForMedication(createdMed.id, {
      mode: 'DEDUCT',
      quantity: 3,
      reason: 'Damaged / wasted',
    });
    expect(adjustedStock.stockRemaining).toBe('25.00');
    expect(adjustedStock.transaction.type).toBe('WASTAGE');

    const ledger = await inventoryService.listForMedication(createdMed.id, {});
    expect(ledger.stockRemaining).toBe('25.00');
    expect(ledger.items.map((i) => i.type)).toEqual(
      expect.arrayContaining(['WASTAGE', 'PURCHASE', 'DOSE_CONSUMPTION', 'OPENING_STOCK']),
    );

    const expenses = await expensesService.getSummaryForPatient(secondProfile.id, {
      monthsCount: 4,
    });
    // 36.00 from initial stripMed purchase + 24.00 recordedPurchase = 60.00
    expect(expenses.actualSpent).toBe('60.00');
    expect(expenses.monthlyBudget).toBe('1850.25');
    expect(expenses.recentPurchases[0].vendor).toBe('Live DB Pharmacy');

    // Phase 8: HealthLogsService mixed units & live PostgreSQL storage
    const reading1 = await healthLogsService.createForPatient(
      secondProfile.id,
      regA.user.id,
      'Asia/Dhaka',
      {
        value: 106,
        unit: 'MG_DL' as never,
        context: 'FASTING' as never,
        date: '2026-11-25',
        time: '07:30 AM',
      },
    );
    const reading2 = await healthLogsService.createForPatient(
      secondProfile.id,
      regA.user.id,
      'Asia/Dhaka',
      {
        value: 6.2,
        unit: 'MMOL_L' as never,
        context: 'AFTER_MEAL' as never,
        date: '2026-11-25',
        time: '02:00 PM',
      },
    );
    expect(reading1.displayValue).toBe('106');
    expect(reading2.displayValue).toBe('6.2');

    const healthList = await healthLogsService.listForPatient(
      secondProfile.id,
      regA.user.id,
      'Asia/Dhaka',
      {},
    );
    expect(healthList.totalCount).toBe(2);
    expect(healthList.chartPoints).toHaveLength(2);

    // Phase 9: UsersBackupService live PostgreSQL export -> restore -> cascade delete verification
    const exported = await usersBackupService.exportAccountData(regA.user.id);
    expect(exported.schemaVersion).toBe('caredose.backup.v1');
    expect(exported.summary.medicationsCount).toBe(2);
    expect(exported.summary.healthReadingsCount).toBe(2);
    expect(exported.summary.purchasesCount).toBe(2);

    const restoreSummary = await usersBackupService.restoreAccountData(
      regA.user.id,
      exported,
    );
    expect(restoreSummary.summary).toMatchObject({
      profilesCount: 2,
      medicationsCount: 2,
      healthReadingsCount: 2,
      purchasesCount: 2,
    });

    const deletedRes = await usersBackupService.deleteAccount(
      regA.user.id,
      'DELETE',
    );
    expect(deletedRes.deletedUserId).toBe(regA.user.id);
    expect(
      await prisma.user.findUnique({ where: { id: regA.user.id } }),
    ).toBeNull();
    // Ensure User B remains intact after User A cascade delete
    expect(
      await prisma.user.findUnique({ where: { id: regB.user.id } }),
    ).not.toBeNull();
  }, 180000);
});
