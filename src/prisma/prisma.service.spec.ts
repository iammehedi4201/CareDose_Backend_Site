import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const originalDbUrl = process.env.DATABASE_URL;
  const originalSkip = process.env.SKIP_DB_CONNECT_ON_INIT;
  const originalRequire = process.env.REQUIRE_DB_ON_STARTUP;

  afterEach(() => {
    if (originalDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDbUrl;

    if (originalSkip === undefined) delete process.env.SKIP_DB_CONNECT_ON_INIT;
    else process.env.SKIP_DB_CONNECT_ON_INIT = originalSkip;

    if (originalRequire === undefined) delete process.env.REQUIRE_DB_ON_STARTUP;
    else process.env.REQUIRE_DB_ON_STARTUP = originalRequire;
  });

  it('starts cleanly in degraded mode when DATABASE_URL is missing', async () => {
    process.env.DATABASE_URL = '';
    delete process.env.SKIP_DB_CONNECT_ON_INIT;
    delete process.env.REQUIRE_DB_ON_STARTUP;

    const service = new PrismaService();
    const connectSpy = vi.spyOn(service, '$connect').mockResolvedValue(undefined);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(connectSpy).not.toHaveBeenCalled();

    const health = await service.checkConnection();
    expect(health).toEqual({
      connected: false,
      error: 'DATABASE_URL is not configured',
    });
  });

  it('throws when REQUIRE_DB_ON_STARTUP=true and DATABASE_URL is missing', async () => {
    process.env.DATABASE_URL = '';
    delete process.env.SKIP_DB_CONNECT_ON_INIT;
    process.env.REQUIRE_DB_ON_STARTUP = 'true';

    const service = new PrismaService();
    await expect(service.onModuleInit()).rejects.toThrow('DATABASE_URL is not set');
  });
});
