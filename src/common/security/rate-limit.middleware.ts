import type { NextFunction, Request, Response } from 'express';
import { sanitizePathForLog } from '../logging/request-context';

export type RateLimitBucketName = 'auth' | 'catalogue' | 'default';

export interface RateLimitConfig {
  enabled: boolean;
  windowMs: number;
  authMax: number;
  catalogueMax: number;
  globalMax: number;
}

interface BucketWindowEntry {
  count: number;
  resetAtMs: number;
}

const MAX_STORE_ENTRIES = 10_000;

export class InMemoryRateLimiter {
  private readonly store = new Map<string, BucketWindowEntry>();

  reset(): void {
    this.store.clear();
  }

  consume(
    key: string,
    limit: number,
    windowMs: number,
    nowMs: number = Date.now(),
  ): {
    allowed: boolean;
    limit: number;
    remaining: number;
    retryAfterSeconds: number;
  } {
    const existing = this.store.get(key);
    if (!existing || nowMs >= existing.resetAtMs) {
      if (this.store.size >= MAX_STORE_ENTRIES) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey !== undefined) {
          this.store.delete(oldestKey);
        }
      }
      this.store.set(key, { count: 1, resetAtMs: nowMs + windowMs });
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - 1),
        retryAfterSeconds: Math.ceil(windowMs / 1000),
      };
    }

    if (existing.count >= limit) {
      const retryAfterMs = Math.max(1000, existing.resetAtMs - nowMs);
      return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - existing.count),
      retryAfterSeconds: Math.ceil(
        Math.max(1000, existing.resetAtMs - nowMs) / 1000,
      ),
    };
  }
}

export const sharedRateLimiter = new InMemoryRateLimiter();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveRateLimitConfig(): RateLimitConfig {
  const isTest = process.env.NODE_ENV === 'test';
  const enabled =
    process.env.ENABLE_RATE_LIMIT === 'true'
      ? true
      : process.env.DISABLE_RATE_LIMIT === 'true' || isTest
        ? false
        : true;

  return {
    enabled,
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    authMax: parsePositiveInt(process.env.RATE_LIMIT_AUTH_MAX, 20),
    catalogueMax: parsePositiveInt(process.env.RATE_LIMIT_CATALOGUE_MAX, 120),
    globalMax: parsePositiveInt(process.env.RATE_LIMIT_GLOBAL_MAX, 300),
  };
}

export function classifyRateLimitBucket(cleanPath: string): RateLimitBucketName {
  if (/^\/api\/v1\/auth\/(login|register)/.test(cleanPath)) {
    return 'auth';
  }
  if (/^\/api\/v1\/catalogue/.test(cleanPath)) {
    return 'catalogue';
  }
  return 'default';
}

function extractClientIp(req: Request): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Enforces tiered IP-based rate limiting for auth, catalogue search, and private API routes
 * while exempting health/readiness probes.
 */
export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const cfg = resolveRateLimitConfig();
  if (!cfg.enabled) {
    next();
    return;
  }

  const cleanPath = sanitizePathForLog(req.originalUrl ?? req.url);
  if (/^\/api\/v1\/health/.test(cleanPath)) {
    next();
    return;
  }

  const bucket = classifyRateLimitBucket(cleanPath);
  const maxForBucket =
    bucket === 'auth'
      ? cfg.authMax
      : bucket === 'catalogue'
        ? cfg.catalogueMax
        : cfg.globalMax;
  const ip = extractClientIp(req);
  const verdict = sharedRateLimiter.consume(
    `${bucket}:${ip}`,
    maxForBucket,
    cfg.windowMs,
  );

  res.setHeader('X-RateLimit-Limit', String(verdict.limit));
  res.setHeader('X-RateLimit-Remaining', String(verdict.remaining));

  if (!verdict.allowed) {
    res.setHeader('Retry-After', String(verdict.retryAfterSeconds));
    res.status(429).json({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded for ${bucket} requests. Retry in ${verdict.retryAfterSeconds}s.`,
      path: cleanPath,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
}
