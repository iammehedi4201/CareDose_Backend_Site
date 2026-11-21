import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.util';

describe('password.util', () => {
  it('hashes passwords with unique per-password salts and verifies matches', () => {
    const hashA = hashPassword('CareDose#2026');
    const hashB = hashPassword('CareDose#2026');

    expect(hashA.startsWith('scrypt$')).toBe(true);
    expect(hashA).not.toBe(hashB);
    expect(hashA).not.toContain('CareDose#2026');

    expect(verifyPassword('CareDose#2026', hashA)).toBe(true);
    expect(verifyPassword('CareDose#2026', hashB)).toBe(true);
    expect(verifyPassword('WrongPassword', hashA)).toBe(false);
  });

  it('rejects malformed stored hashes safely without throwing', () => {
    expect(verifyPassword('CareDose#2026', '')).toBe(false);
    expect(verifyPassword('CareDose#2026', 'bcrypt$salt$hash')).toBe(false);
    expect(verifyPassword('CareDose#2026', 'scrypt$short$deadbeef')).toBe(false);
  });
});
