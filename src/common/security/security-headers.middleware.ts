import type { NextFunction, Request, Response } from 'express';

/**
 * Applies production HTTP security headers across all CareDose API responses.
 */
export function securityHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );

  const protoHeader = req.headers?.['x-forwarded-proto'];
  const isHttps =
    req.secure === true ||
    (typeof protoHeader === 'string' && protoHeader.split(',')[0].trim() === 'https');

  if (process.env.NODE_ENV === 'production' || isHttps) {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  }

  next();
}
