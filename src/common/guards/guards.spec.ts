import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { TokenService } from '../../auth/token.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestWithAuth } from '../decorators/current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MedicationOwnershipGuard } from './medication-ownership.guard';
import { PatientOwnershipGuard } from './patient-ownership.guard';

function makeExecutionContext(
  request: RequestWithAuth,
): ExecutionContext {
  return {
    getHandler: () => (() => undefined),
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard & PatientOwnershipGuard', () => {
  const tokenService = new TokenService({
    get: (k: string) =>
      k === 'JWT_SECRET' ? 'caredose-phase3-guard-test-secret-key' : undefined,
  } as unknown as ConfigService);

  it('JwtAuthGuard allows @Public routes without checking headers', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const prisma = { user: { findUnique: vi.fn() } } as unknown as PrismaService;
    const guard = new JwtAuthGuard(reflector, tokenService, prisma);

    await expect(guard.canActivate(makeExecutionContext({}))).resolves.toBe(true);
  });

  it('JwtAuthGuard rejects missing headers and non-existent user accounts', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const guard = new JwtAuthGuard(reflector, tokenService, prisma);

    await expect(guard.canActivate(makeExecutionContext({ headers: {} }))).rejects.toThrow(
      UnauthorizedException,
    );

    const token = tokenService.signAccessToken('deleted-user-id', 'gone@example.com');
    await expect(
      guard.canActivate(makeExecutionContext({ headers: { authorization: `Bearer ${token}` } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('PatientOwnershipGuard enforces ownerUserId isolation (400 / 401 / 403 / 404)', async () => {
    const profileId = '11111111-1111-4111-8111-111111111111';
    const findUnique = vi.fn();
    const prisma = { patientProfile: { findUnique } } as unknown as PrismaService;
    const guard = new PatientOwnershipGuard(prisma);

    await expect(guard.canActivate(makeExecutionContext({ params: { patientId: profileId } }))).rejects.toThrow(
      UnauthorizedException,
    );

    await expect(
      guard.canActivate(
        makeExecutionContext({
          user: { userId: 'user-a', email: 'a@example.com' },
          params: { patientId: 'not-a-uuid' },
        }),
      ),
    ).rejects.toThrow(BadRequestException);

    findUnique.mockResolvedValueOnce(null);
    await expect(
      guard.canActivate(
        makeExecutionContext({
          user: { userId: 'user-a', email: 'a@example.com' },
          params: { patientId: profileId },
        }),
      ),
    ).rejects.toThrow(NotFoundException);

    findUnique.mockResolvedValueOnce({
      id: profileId,
      ownerUserId: 'user-b',
      name: 'Other Person',
      timezone: 'Asia/Dhaka',
      isDefault: true,
    });
    await expect(
      guard.canActivate(
        makeExecutionContext({
          user: { userId: 'user-a', email: 'a@example.com' },
          params: { patientId: profileId },
        }),
      ),
    ).rejects.toThrow(ForbiddenException);

    const req: RequestWithAuth = {
      user: { userId: 'user-a', email: 'a@example.com' },
      params: { patientId: profileId },
    };
    findUnique.mockResolvedValueOnce({
      id: profileId,
      ownerUserId: 'user-a',
      name: 'Karim',
      timezone: 'Asia/Dhaka',
      isDefault: true,
    });
    await expect(guard.canActivate(makeExecutionContext(req))).resolves.toBe(true);
    expect(req.patientProfile?.name).toBe('Karim');
  });

  it('MedicationOwnershipGuard enforces ownerUserId via linked PatientProfile (400 / 401 / 403 / 404)', async () => {
    const medId = '22222222-2222-4222-8222-222222222222';
    const patientId = '11111111-1111-4111-8111-111111111111';
    const findUnique = vi.fn();
    const prisma = { patientMedication: { findUnique } } as unknown as PrismaService;
    const guard = new MedicationOwnershipGuard(prisma);

    await expect(
      guard.canActivate(makeExecutionContext({ params: { id: medId } })),
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      guard.canActivate(
        makeExecutionContext({
          user: { userId: 'user-a', email: 'a@example.com' },
          params: { id: 'bad-id' },
        }),
      ),
    ).rejects.toThrow(BadRequestException);

    findUnique.mockResolvedValueOnce(null);
    await expect(
      guard.canActivate(
        makeExecutionContext({
          user: { userId: 'user-a', email: 'a@example.com' },
          params: { id: medId },
        }),
      ),
    ).rejects.toThrow(NotFoundException);

    findUnique.mockResolvedValueOnce({
      id: medId,
      patientId,
      patient: { ownerUserId: 'user-b' },
    });
    await expect(
      guard.canActivate(
        makeExecutionContext({
          user: { userId: 'user-a', email: 'a@example.com' },
          params: { id: medId },
        }),
      ),
    ).rejects.toThrow(ForbiddenException);

    const req: RequestWithAuth = {
      user: { userId: 'user-a', email: 'a@example.com' },
      params: { id: medId },
    };
    findUnique.mockResolvedValueOnce({
      id: medId,
      patientId,
      patient: { ownerUserId: 'user-a' },
    });
    await expect(guard.canActivate(makeExecutionContext(req))).resolves.toBe(true);
    expect(req.patientMedication?.patientId).toBe(patientId);
  });
});
