import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { requireEnv } from '../config/env';

const KEY_PREFIX = 'auth:refresh:revoked:';

/** Redis (bukan tabel baru) — TTL per-entri otomatis bersih sendiri. */
@Injectable()
export class RefreshTokenDenylistService implements OnModuleDestroy {
  private readonly redis = new Redis(requireEnv('REDIS_URL'));

  async revoke(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.redis.set(KEY_PREFIX + jti, '1', 'EX', Math.ceil(ttlSeconds));
  }

  async isRevoked(jti: string): Promise<boolean> {
    return (await this.redis.exists(KEY_PREFIX + jti)) === 1;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
