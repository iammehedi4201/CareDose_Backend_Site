import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { TokenService } from './token.service';

function makeConfig(secret?: string): ConfigService {
  return {
    get: <T = string>(key: string): T | undefined => {
      if (key === 'JWT_SECRET') return secret as unknown as T;
      return undefined;
    },
  } as unknown as ConfigService;
}

describe('TokenService', () => {
  const validSecret = 'caredose-phase3-test-signing-secret-32chars';

  it('signs and verifies valid HS256 access tokens', () => {
    const service = new TokenService(makeConfig(validSecret));
    const token = service.signAccessToken('user-123', 'karim@example.com');
    const payload = service.verifyAccessToken(token);

    expect(payload.sub).toBe('user-123');
    expect(payload.email).toBe('karim@example.com');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('rejects tampered, wrong-secret, unsupported-alg, and expired tokens', () => {
    const service = new TokenService(makeConfig(validSecret));
    const token = service.signAccessToken('user-123', 'karim@example.com');
    const [header, body, sig] = token.split('.');

    const tamperedBody = Buffer.from(
      JSON.stringify({ sub: 'other-user', email: 'x@example.com', iat: 1, exp: 9999999999 }),
    ).toString('base64url');
    expect(() => service.verifyAccessToken(`${header}.${tamperedBody}.${sig}`)).toThrow(
      UnauthorizedException,
    );

    const wrongSecretService = new TokenService(makeConfig('another-different-test-secret-value'));
    expect(() => wrongSecretService.verifyAccessToken(token)).toThrow(UnauthorizedException);

    const expiredToken = service.signAccessToken('user-123', 'karim@example.com', -5);
    expect(() => service.verifyAccessToken(expiredToken)).toThrow(UnauthorizedException);

    const algNoneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    );
    expect(() => service.verifyAccessToken(`${algNoneHeader}.${body}.`)).toThrow(
      UnauthorizedException,
    );
  });

  it('fails closed when JWT_SECRET is missing or too short', () => {
    const missingSecret = new TokenService(makeConfig(undefined));
    expect(() => missingSecret.signAccessToken('u1', 'a@b.com')).toThrow(
      InternalServerErrorException,
    );

    const shortSecret = new TokenService(makeConfig('too-short'));
    expect(() => shortSecret.signAccessToken('u1', 'a@b.com')).toThrow(
      InternalServerErrorException,
    );
  });
});
