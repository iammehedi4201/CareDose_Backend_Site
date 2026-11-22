import { ConfigService } from '@nestjs/config';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth/auth.service';
import { TokenService } from '../src/auth/token.service';
import { DoseLogsService } from '../src/dose-logs/dose-logs.service';
import { MedicationsService } from '../src/medications/medications.service';
import { PatientsService } from '../src/patients/patients.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SchedulesService } from '../src/schedules/schedules.service';
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
  });

  afterAll(async () => {
    if (prisma && createdEmails.length > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: createdEmails } },
      });
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

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
      { status: 'ALL', medicationId: createdMed.id },
    );
    expect(history.counts).toEqual({ all: 2, taken: 1, skipped: 1 });
  }, 60000);
});
