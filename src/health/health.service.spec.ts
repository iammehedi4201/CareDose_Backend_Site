import { describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthService', () => {
  it('returns ok when PostgreSQL connection check succeeds', async () => {
    const prismaMock = {
      checkConnection: vi.fn().mockResolvedValue({ connected: true }),
    } as unknown as PrismaService;

    const service = new HealthService(prismaMock);
    const result = await service.getHealthStatus();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('caredose-backend');
    expect(result.database.connected).toBe(true);
  });

  it('returns degraded when PostgreSQL connection check fails', async () => {
    const prismaMock = {
      checkConnection: vi.fn().mockResolvedValue({
        connected: false,
        error: 'Connection refused',
      }),
    } as unknown as PrismaService;

    const service = new HealthService(prismaMock);
    const result = await service.getHealthStatus();

    expect(result.status).toBe('degraded');
    expect(result.database.connected).toBe(false);
    expect(result.database.error).toBe('Connection refused');
  });
});
