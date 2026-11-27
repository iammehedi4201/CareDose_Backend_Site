import { InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateJwtSecretStrength } from '../../auth/token.service';
import {
  formatStructuredLogLine,
  sanitizeLogPayload,
  sanitizePathForLog,
} from '../logging/request-context';
import {
  classifyRateLimitBucket,
  InMemoryRateLimiter,
} from './rate-limit.middleware';

describe('Phase 10 Security Hardening & Structured Logging', () => {
  it('redacts credentials, tokens, clinical notes, and query strings from structured JSON logs', () => {
    expect(sanitizePathForLog('/api/v1/catalogue/search?q=Napa&token=leak')).toBe(
      '/api/v1/catalogue/search',
    );

    const sanitized = sanitizeLogPayload({
      authorization: 'Bearer secret.jwt.token',
      password: 'PlainPassword123!',
      passwordHash: 'scrypt$salt$hash',
      note: 'Patient fasting notes',
      personalInstructions: 'Take 1 tab daily',
      safeUserId: 'user-123',
      nested: {
        token: 'abc',
        status: 'ok',
      },
    }) as Record<string, unknown>;

    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.passwordHash).toBe('[REDACTED]');
    expect(sanitized.note).toBe('[REDACTED]');
    expect(sanitized.personalInstructions).toBe('[REDACTED]');
    expect(sanitized.safeUserId).toBe('user-123');
    expect((sanitized.nested as Record<string, unknown>).token).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).status).toBe('ok');

    const line = formatStructuredLogLine({
      level: 'info',
      type: 'http_request',
      requestId: 'req-abc-123',
      method: 'GET',
      path: '/api/v1/patients/p1/health-readings?token=bad',
      statusCode: 200,
      durationMs: 12,
      userId: 'user-123',
      meta: { password: 'hidden' },
    });
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.requestId).toBe('req-abc-123');
    expect(parsed.path).toBe('/api/v1/patients/p1/health-readings');
    expect((parsed.meta as Record<string, unknown>).password).toBe('[REDACTED]');
  });

  it('classifies rate limit buckets and enforces per-window limits with Retry-After recovery', () => {
    expect(classifyRateLimitBucket('/api/v1/auth/login')).toBe('auth');
    expect(classifyRateLimitBucket('/api/v1/auth/register')).toBe('auth');
    expect(classifyRateLimitBucket('/api/v1/catalogue/search')).toBe('catalogue');
    expect(classifyRateLimitBucket('/api/v1/patients/p1/doses')).toBe('default');

    const limiter = new InMemoryRateLimiter();
    const t0 = 1_000_000;

    expect(limiter.consume('auth:1.2.3.4', 2, 60_000, t0)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(limiter.consume('auth:1.2.3.4', 2, 60_000, t0 + 100)).toMatchObject({
      allowed: true,
      remaining: 0,
    });

    const blocked = limiter.consume('auth:1.2.3.4', 2, 60_000, t0 + 200);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(59);

    // Different bucket or IP stays isolated
    expect(limiter.consume('auth:5.6.7.8', 2, 60_000, t0 + 200).allowed).toBe(true);

    // Window expiry resets counter cleanly
    expect(limiter.consume('auth:1.2.3.4', 2, 60_000, t0 + 60_001).allowed).toBe(
      true,
    );
  });

  it('enforces strict JWT_SECRET strength in production while allowing dev/test >= 16 chars', () => {
    expect(validateJwtSecretStrength('test-secret-16ch', 'test')).toBe(
      'test-secret-16ch',
    );
    expect(() =>
      validateJwtSecretStrength('short-16-chars-only', 'production'),
    ).toThrow(InternalServerErrorException);
    expect(() =>
      validateJwtSecretStrength(
        'replace-with-a-secure-secret-at-least-32-chars',
        'production',
      ),
    ).toThrow(InternalServerErrorException);
    expect(
      validateJwtSecretStrength(
        '9f2c8b4e7d1a6f305c8e2b4d9a71c3e5f8b0d2a4',
        'production',
      ),
    ).toHaveLength(40);
  });
});
