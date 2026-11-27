/**
 * CareDose Local Concurrency & Latency Smoke Benchmark
 * Boots the compiled NestJS app against TEST_DATABASE_URL (never production),
 * verifies concurrent reads, concurrent idempotent dose logging (no double stock deduction),
 * request ID propagation, and p95 latency baseline.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadDotEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return Number(sorted[idx].toFixed(2));
}

async function timedFetch(url, options = {}) {
  const start = performance.now();
  const res = await fetch(url, options);
  const durationMs = performance.now() - start;
  const text = await res.text();
  return {
    status: res.status,
    durationMs,
    requestId: res.headers.get('x-request-id'),
    body: text ? JSON.parse(text) : null,
  };
}

async function main() {
  loadDotEnv();

  const testDbUrl = process.env.TEST_DATABASE_URL?.trim();
  if (!testDbUrl || !/test/i.test(testDbUrl)) {
    throw new Error('TEST_DATABASE_URL pointing to a test database is required.');
  }

  process.env.DATABASE_URL = testDbUrl;
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'caredose-load-smoke-secret-at-least-32ch';
  process.env.DISABLE_RATE_LIMIT = 'true';
  process.env.LOG_HTTP_REQUESTS = 'false';

  const { ValidationPipe } = require('@nestjs/common');
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(0);

  const server = app.getHttpServer();
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
  const prisma = app.get(PrismaService);
  const testEmail = `load-smoke-${Date.now()}@example.com`;

  try {
    const readyRes = await timedFetch(`${baseUrl}/health/ready`);
    if (readyRes.status !== 200) {
      throw new Error(`Expected /health/ready 200, got ${readyRes.status}`);
    }

    const reg = await timedFetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'LoadSmokePassword123!',
        displayName: 'Load Smoke Caregiver',
      }),
    });
    if (reg.status !== 201) {
      throw new Error(`Register failed with ${reg.status}`);
    }

    const token = reg.body.accessToken;
    const patientId = reg.body.defaultPatientProfile.id;
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const med = await timedFetch(`${baseUrl}/patients/${patientId}/medications`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Concurrent Dose Test Tab',
        dosageForm: 'Tablet',
        personalInstructions: '1 tablet daily',
        startingStock: 10,
        stockUnit: 'tablets',
        lowStockThreshold: 2,
      }),
    });
    if (med.status !== 201 || !med.body?.id) {
      throw new Error(`Create medication failed (${med.status}): ${JSON.stringify(med.body)}`);
    }
    const medId = med.body.id;

    const sched = await timedFetch(
      `${baseUrl}/patient-medications/${medId}/schedules`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          doseAmount: 2,
          doseUnit: 'tablet',
          frequency: 'DAILY',
          scheduledTimes: ['08:00'],
          startDate: new Date().toISOString().slice(0, 10),
          remindersEnabled: true,
        }),
      },
    );
    if (sched.status !== 201 || !sched.body?.id) {
      throw new Error(`Create schedule failed (${sched.status}): ${JSON.stringify(sched.body)}`);
    }
    const schedId = sched.body.id;

    const dosesRes = await timedFetch(`${baseUrl}/patients/${patientId}/doses?days=1`, {
      headers: authHeaders,
    });
    if (dosesRes.status !== 200 || !dosesRes.body?.days?.[0]?.items?.[0]?.scheduledFor) {
      throw new Error(`Get daily doses failed (${dosesRes.status}): ${JSON.stringify(dosesRes.body)}`);
    }
    const scheduledFor = dosesRes.body.days[0].items[0].scheduledFor;

    // Fire 10 simultaneous TAKEN requests for the exact same occurrence
    const concurrentDoseCalls = await Promise.all(
      Array.from({ length: 10 }, () =>
        timedFetch(`${baseUrl}/patients/${patientId}/dose-events/record`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            scheduleId: schedId,
            scheduledFor,
            action: 'TAKEN',
          }),
        }),
      ),
    );

    const failedDoseCalls = concurrentDoseCalls.filter((r) => r.status >= 400);
    if (failedDoseCalls.length > 0) {
      throw new Error(
        `Unexpected error in concurrent dose calls: status=${failedDoseCalls[0].status} body=${JSON.stringify(failedDoseCalls[0].body)}`,
      );
    }

    const deductedResponses = concurrentDoseCalls.filter(
      (r) => r.body && r.body.stockDeducted === true,
    ).length;
    if (deductedResponses !== 1) {
      throw new Error(
        `Concurrency idempotency violation: expected 1 deduction, observed ${deductedResponses}`,
      );
    }

    const finalMed = await timedFetch(`${baseUrl}/patient-medications/${medId}`, {
      headers: authHeaders,
    });
    if (finalMed.body.stockRemaining !== '8.00') {
      throw new Error(
        `Expected remaining stock 8.00 after 10 concurrent TAKEN calls, got ${finalMed.body.stockRemaining}`,
      );
    }

    // Fire 30 concurrent read requests across catalogue, doses, expenses, and health logs
    const readUrls = [
      `${baseUrl}/catalogue/search?q=Napa&limit=15`,
      `${baseUrl}/patients/${patientId}/doses?days=1`,
      `${baseUrl}/patients/${patientId}/health-readings`,
      `${baseUrl}/patients/${patientId}/expenses`,
    ];

    const readResults = await Promise.all(
      Array.from({ length: 30 }, (_, idx) =>
        timedFetch(readUrls[idx % readUrls.length], { headers: authHeaders }),
      ),
    );

    const failedReads = readResults.filter((r) => r.status >= 400);
    if (failedReads.length > 0) {
      throw new Error(`Observed ${failedReads.length} failed concurrent reads`);
    }

    const durations = [
      ...concurrentDoseCalls.map((r) => r.durationMs),
      ...readResults.map((r) => r.durationMs),
    ];

    console.log(
      JSON.stringify(
        {
          ok: true,
          totalConcurrentRequests: durations.length,
          concurrentDuplicateDoseCalls: concurrentDoseCalls.length,
          actualStockDeductions: deductedResponses,
          verifiedFinalStock: finalMed.body.stockRemaining,
          allResponsesHadRequestId: readResults.every((r) => Boolean(r.requestId)),
          p50LatencyMs: percentile(durations, 50),
          p95LatencyMs: percentile(durations, 95),
          maxLatencyMs: percentile(durations, 100),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.user.deleteMany({ where: { email: testEmail } }).catch(() => {});
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
