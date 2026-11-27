import { BadRequestException } from '@nestjs/common';
import { GlucoseUnit } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { CAREDOSE_BACKUP_SCHEMA_VERSION } from './dto/account-backup.dto';
import { UsersBackupService } from './users-backup.service';

describe('UsersBackupService', () => {
  it('excludes passwordHash from exported user backup and summarizes owned entities', async () => {
    const prismaMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          email: 'karim@example.com',
          displayName: 'Karim',
          glucoseUnit: GlucoseUnit.MG_DL,
          currency: 'BDT',
          monthlyBudget: '2500.00',
          remindersEnabled: true,
          soundEnabled: true,
          reminderLeadMins: 10,
          createdAt: new Date('2026-11-20T00:00:00.000Z'),
          updatedAt: new Date('2026-11-20T00:00:00.000Z'),
        }),
      },
      patientProfile: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'p1',
            ownerUserId: 'u1',
            name: 'Karim',
            relationship: 'Self',
            timezone: 'Asia/Dhaka',
            isDefault: true,
            medications: [],
            healthReadings: [],
          },
        ]),
      },
    };

    const service = new UsersBackupService(prismaMock as never);
    const exported = await service.exportAccountData('u1');

    expect(exported.schemaVersion).toBe(CAREDOSE_BACKUP_SCHEMA_VERSION);
    expect('passwordHash' in exported.account).toBe(false);
    expect(exported.account.monthlyBudget).toBe('2500.00');
    expect(exported.summary.profilesCount).toBe(1);
    expect(exported.summary.medicationsCount).toBe(0);
  });

  it('requires exact DELETE confirmation before deleting account', async () => {
    const prismaMock = {
      user: {
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
    };

    const service = new UsersBackupService(prismaMock as never);
    await expect(service.deleteAccount('u1', 'delete')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.deleteAccount('u1', '')).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it('rejects restores with missing profiles or unsupported schema versions', async () => {
    const prismaMock = {
      $transaction: vi.fn(),
    };
    const service = new UsersBackupService(prismaMock as never);

    await expect(
      service.restoreAccountData('u1', {
        schemaVersion: 'legacy.v0',
        account: {
          displayName: 'Karim',
          glucoseUnit: GlucoseUnit.MG_DL,
          remindersEnabled: true,
          soundEnabled: true,
          reminderLeadMins: 10,
        },
        patientProfiles: [],
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.restoreAccountData('u1', {
        schemaVersion: CAREDOSE_BACKUP_SCHEMA_VERSION,
        account: {
          displayName: 'Karim',
          glucoseUnit: GlucoseUnit.MG_DL,
          remindersEnabled: true,
          soundEnabled: true,
          reminderLeadMins: 10,
        },
        patientProfiles: [],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
