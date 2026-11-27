import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestWithContext extends Request {
  requestId?: string;
}

const SAFE_HEADER_RE = /^[A-Za-z0-9._-]{8,64}$/;
const SENSITIVE_KEY_RE =
  /(password|passwordHash|secret|token|authorization|cookie|hash|note|personalInstructions|healthReadings)/i;

export function sanitizePathForLog(rawUrl?: string): string {
  if (!rawUrl) return '/';
  const idx = rawUrl.indexOf('?');
  return idx >= 0 ? rawUrl.slice(0, idx) : rawUrl;
}

/**
 * Redacts credentials, tokens, and sensitive clinical/note payloads before JSON logging.
 */
export function sanitizeLogPayload(input: unknown, depth = 0): unknown {
  if (depth > 4) return '[TRUNCATED]';
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    if (/^Bearer\s+\S+/i.test(input)) return 'Bearer [REDACTED]';
    return input;
  }
  if (typeof input === 'number' || typeof input === 'boolean') return input;
  if (Array.isArray(input)) {
    return input.slice(0, 20).map((item) => sanitizeLogPayload(item, depth + 1));
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = sanitizeLogPayload(v, depth + 1);
      }
    }
    return out;
  }
  return String(input);
}

export function formatStructuredLogLine(entry: {
  level: 'info' | 'warn' | 'error';
  type: string;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  userId?: string;
  message?: string;
  meta?: Record<string, unknown>;
}): string {
  const safeMeta = entry.meta
    ? (sanitizeLogPayload(entry.meta) as Record<string, unknown>)
    : undefined;

  return JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'caredose-backend',
    level: entry.level,
    type: entry.type,
    ...(entry.requestId ? { requestId: entry.requestId } : {}),
    ...(entry.method ? { method: entry.method } : {}),
    ...(entry.path ? { path: sanitizePathForLog(entry.path) } : {}),
    ...(entry.statusCode !== undefined ? { statusCode: entry.statusCode } : {}),
    ...(entry.durationMs !== undefined ? { durationMs: entry.durationMs } : {}),
    ...(entry.userId ? { userId: entry.userId } : {}),
    ...(entry.message ? { message: entry.message } : {}),
    ...(safeMeta && Object.keys(safeMeta).length > 0 ? { meta: safeMeta } : {}),
  });
}

export function resolveRequestId(req: Request): string {
  const raw = req.headers?.['x-request-id'];
  const headerVal = Array.isArray(raw) ? raw[0] : raw;
  if (typeof headerVal === 'string' && SAFE_HEADER_RE.test(headerVal.trim())) {
    return headerVal.trim();
  }
  return randomUUID();
}

export function requestContextMiddleware(
  req: RequestWithContext,
  res: Response,
  next: NextFunction,
): void {
  const startedAtNs = process.hrtime.bigint();
  const requestId = resolveRequestId(req);
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const shouldLog =
      process.env.LOG_HTTP_REQUESTS === 'true' ||
      (process.env.NODE_ENV !== 'test' &&
        process.env.LOG_HTTP_REQUESTS !== 'false');

    if (!shouldLog) return;

    const elapsedMs = Number(
      (process.hrtime.bigint() - startedAtNs) / BigInt(1_000_000),
    );
    const status = res.statusCode;
    const authUser = (req as RequestWithContext & { user?: { userId?: string } })
      .user;

    const line = formatStructuredLogLine({
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      type: 'http_request',
      requestId,
      method: req.method,
      path: req.originalUrl ?? req.url,
      statusCode: status,
      durationMs: Math.max(0, elapsedMs),
      userId: authUser?.userId,
    });

    if (status >= 500) {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  });

  next();
}
