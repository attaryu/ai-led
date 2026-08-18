import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Role, User } from '@ai-led/db';
import { requireEnv } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDenylistService } from './refresh-token-denylist.service';
import type { JwtPayload } from './types/jwt-payload.type';

const ACCESS_TOKEN_TTL = '15m';
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL = '7d';

export function toSafeUser(user: User) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit it
  const { passwordHash, ...safe } = user;
  return safe;
}

interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  /** Detik sampai accessToken kedaluwarsa. */
  expiresIn: number;
  user: ReturnType<typeof toSafeUser>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly refreshDenylist: RefreshTokenDenylistService,
  ) {}

  async register(dto: RegisterDto): Promise<IssuedTokens> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { namaUniversitas: dto.namaUniversitas },
      });
      return tx.user.create({
        data: {
          tenantId: tenant.id,
          namaLengkap: dto.namaLengkap,
          email: dto.email,
          passwordHash,
          role: Role.ADMIN,
        },
      });
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email atau password salah');
    }

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<IssuedTokens> {
    const payload = this.verifyRefreshToken(refreshToken);

    if (await this.refreshDenylist.isRevoked(payload.jti)) {
      throw new UnauthorizedException('Refresh token sudah tidak berlaku');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User tidak ditemukan');
    }

    // Rotasi: cabut token lama begitu dipakai, meski umur 7 harinya belum habis.
    await this.revokeToken(payload);

    return this.issueTokens(user);
  }

  /** Mencabut refresh token aktif — dipanggil dari `AuthController.logout`. */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    try {
      const payload = this.verifyRefreshToken(refreshToken);
      await this.revokeToken(payload);
    } catch {
      // Token sudah tidak valid/kedaluwarsa: tidak ada yang perlu dicabut.
    }
  }

  /** Bentuk yang sama seperti `/auth/login` (§4), bukan payload token mentah. */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User tidak ditemukan');
    }
    return toSafeUser(user);
  }

  private verifyRefreshToken(refreshToken: string): JwtPayload {
    try {
      return this.jwt.verify<JwtPayload>(refreshToken, {
        secret: requireEnv('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token tidak valid');
    }
  }

  private async revokeToken(payload: JwtPayload): Promise<void> {
    const ttlRemaining = (payload.exp ?? 0) - Math.floor(Date.now() / 1000);
    await this.refreshDenylist.revoke(payload.jti, ttlRemaining);
  }

  private issueTokens(user: User): IssuedTokens {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      programStudiId: user.programStudiId,
      jti: randomUUID(),
    };

    const accessToken = this.jwt.sign(payload, {
      secret: requireEnv('JWT_ACCESS_SECRET'),
      expiresIn: ACCESS_TOKEN_TTL,
    });
    const refreshToken = this.jwt.sign(
      { ...payload, jti: randomUUID() },
      { secret: requireEnv('JWT_REFRESH_SECRET'), expiresIn: REFRESH_TOKEN_TTL },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: toSafeUser(user),
    };
  }
}
