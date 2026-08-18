import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@ai-led/db';
import { AuthService } from './auth.service';
import type { RefreshTokenDenylistService } from './refresh-token-denylist.service';

process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const USER = {
  id: 'user-1',
  tenantId: 'tenant-1',
  programStudiId: null,
  namaLengkap: 'Test User',
  email: 'test@example.com',
  passwordHash: 'hash',
  role: Role.ADMIN,
  dibuatPada: new Date(),
};

// JwtService dari @nestjs/jwt murni bungkus jsonwebtoken tanpa dependency Nest
// lain, jadi cukup dipakai langsung tanpa DI module penuh.
const jwt = new JwtService({});

function signRefresh(jti: string): string {
  return jwt.sign(
    { sub: USER.id, tenantId: USER.tenantId, role: USER.role, programStudiId: null, jti },
    { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d' },
  );
}

function makeService() {
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(USER) } };
  const revoked = new Set<string>();
  const denylist: Pick<RefreshTokenDenylistService, 'isRevoked' | 'revoke'> = {
    isRevoked: jest.fn((jti: string) => Promise.resolve(revoked.has(jti))),
    revoke: jest.fn((jti: string) => {
      revoked.add(jti);
      return Promise.resolve();
    }),
  };
  return new AuthService(prisma as never, jwt, denylist as RefreshTokenDenylistService);
}

describe('AuthService refresh rotation', () => {
  it('rejects a refresh token whose jti was already revoked', async () => {
    const service = makeService();
    const token = signRefresh('jti-a');

    await service.refresh(token);
    // Token yang sama dipakai lagi setelah dirotasi harus ditolak.
    await expect(service.refresh(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates to a new jti on every refresh, invalidating the previous one', async () => {
    const service = makeService();

    const { refreshToken: rotated1 } = await service.refresh(signRefresh('jti-b'));
    const { jti: jti1 } = jwt.decode<{ jti: string }>(rotated1);

    const { refreshToken: rotated2 } = await service.refresh(rotated1);
    const { jti: jti2 } = jwt.decode<{ jti: string }>(rotated2);

    expect(jti1).not.toBe(jti2);
    await expect(service.refresh(rotated1)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout revokes the current refresh token', async () => {
    const service = makeService();
    const token = signRefresh('jti-c');

    await service.revokeRefreshToken(token);
    await expect(service.refresh(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
