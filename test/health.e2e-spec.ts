import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { sharedRateLimiter } from '../src/common/security/rate-limit.middleware';
import { PrismaService } from '../src/prisma/prisma.service';

describe('HealthController & Production Security Middleware (e2e)', () => {
  let app: INestApplication;
  const checkConnectionMock = vi.fn().mockResolvedValue({ connected: true });

  beforeAll(async () => {
    process.env.SKIP_DB_CONNECT_ON_INIT = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: vi.fn(),
        onModuleDestroy: vi.fn(),
        checkConnection: checkConnectionMock,
      })
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
    checkConnectionMock.mockResolvedValue({ connected: true });
    sharedRateLimiter.reset();
    delete process.env.ENABLE_RATE_LIMIT;
    delete process.env.RATE_LIMIT_AUTH_MAX;
  });

  afterAll(async () => {
    delete process.env.ENABLE_RATE_LIMIT;
    delete process.env.RATE_LIMIT_AUTH_MAX;
    if (app) {
      await app.close();
    }
  });

  it('GET /api/v1/health boots NestJS and emits security headers and request correlation ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'trace-phase10-001')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'caredose-backend',
      version: '0.1.0',
      database: { connected: true },
    });
    expect(response.headers['x-request-id']).toBe('trace-phase10-001');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('supports /health/live and returns 503 on /health/ready when database is disconnected', async () => {
    const liveRes = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200);
    expect(liveRes.body.status).toBe('alive');
    expect(liveRes.headers['x-request-id']).toBeTruthy();

    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);

    checkConnectionMock.mockResolvedValueOnce({
      connected: false,
      error: 'DB unreachable',
    });
    const degradedRes = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503);
    expect(degradedRes.body.requestId).toBeTruthy();
  });

  it('enforces tiered rate limiting with 429 + Retry-After while exempting health probes', async () => {
    process.env.ENABLE_RATE_LIMIT = 'true';
    process.env.RATE_LIMIT_AUTH_MAX = '2';

    // Auth validation returns 400 cleanly for first 2 hits, then 429 on 3rd
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'bad', password: '' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'bad', password: '' })
      .expect(400);

    const limited = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'bad', password: '' })
      .expect(429);
    expect(limited.headers['retry-after']).toBeTruthy();
    expect(limited.body.error).toBe('Too Many Requests');

    // Health readiness remains exempt from rate limiting
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
  });
});
