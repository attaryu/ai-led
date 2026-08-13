import { applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from './tenant.guard';
import { TenantInterceptor } from './tenant.interceptor';

/**
 * Bundles the full auth + tenant-isolation stack so a controller can't
 * accidentally forget the tenant guard while remembering the auth guard.
 */
export function Protected() {
  return applyDecorators(
    UseGuards(JwtAuthGuard, TenantGuard),
    UseInterceptors(TenantInterceptor),
  );
}
