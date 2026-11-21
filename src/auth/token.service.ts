import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

const DEFAULT_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7; // 7 days
const MIN_SECRET_LENGTH = 16;

function toBase64Url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

@Injectable()
export class TokenService {
  constructor(private readonly configService: ConfigService) {}

  private getSigningSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET')?.trim();
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new InternalServerErrorException(
        'JWT_SECRET is missing or too short (minimum 16 characters required)',
      );
    }
    return secret;
  }

  getExpiresInSeconds(): number {
    const raw = this.configService.get<string>('JWT_EXPIRES_IN_SECONDS');
    if (raw) {
      const parsed = Number(raw);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return DEFAULT_EXPIRES_IN_SECONDS;
  }

  signAccessToken(userId: string, email: string, ttlSeconds?: number): string {
    const secret = this.getSigningSecret();
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = ttlSeconds ?? this.getExpiresInSeconds();

    const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = toBase64Url(
      JSON.stringify({
        sub: userId,
        email,
        iat: now,
        exp: now + expiresIn,
      } satisfies AccessTokenPayload),
    );
    const signingInput = `${header}.${payload}`;
    const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
    return `${signingInput}.${signature}`;
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const secret = this.getSigningSecret();
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Access token is required');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Malformed access token');
    }

    const [headerB64, payloadB64, sigB64] = parts;
    let parsedHeader: { alg?: string; typ?: string };
    try {
      parsedHeader = JSON.parse(fromBase64Url(headerB64)) as { alg?: string; typ?: string };
    } catch {
      throw new UnauthorizedException('Malformed token header');
    }

    if (parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'JWT') {
      throw new UnauthorizedException('Unsupported token algorithm');
    }

    const expectedSig = createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest();

    let providedSig: Buffer;
    try {
      providedSig = Buffer.from(sigB64, 'base64url');
    } catch {
      throw new UnauthorizedException('Invalid token signature');
    }

    if (
      providedSig.length !== expectedSig.length ||
      !timingSafeEqual(providedSig, expectedSig)
    ) {
      throw new UnauthorizedException('Invalid token signature');
    }

    let payload: AccessTokenPayload;
    try {
      payload = JSON.parse(fromBase64Url(payloadB64)) as AccessTokenPayload;
    } catch {
      throw new UnauthorizedException('Malformed token payload');
    }

    if (
      !payload.sub ||
      !payload.email ||
      typeof payload.exp !== 'number' ||
      Math.floor(Date.now() / 1000) >= payload.exp
    ) {
      throw new UnauthorizedException('Access token has expired or is invalid');
    }

    return payload;
  }
}
