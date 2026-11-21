import { ConfigService } from '@nestjs/config';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth/auth.service';
import { TokenService } from '../src/auth/token.service';
import { PatientsService } from '../src/patients/patients.service';
import { PrismaService } from '../src/prisma/prisma.service';
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
  }, 30000);
});
