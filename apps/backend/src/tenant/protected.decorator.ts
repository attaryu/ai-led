import { applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { Role } from '@ai-led/db';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { RolesGuard } from '../auth/roles/roles.guard';
import { TenantGuard } from './tenant.guard';
import { TenantInterceptor } from './tenant.interceptor';

/**
 * Bundles the full auth + tenant-isolation stack so a controller can't
 * accidentally forget the tenant guard while remembering the auth guard.
 * Pass roles to also restrict the route to those roles: @Protected(Role.ADMIN).
 */
export function Protected(...roles: Role[]) {
  const decorators = [
    UseGuards(JwtAuthGuard, TenantGuard, RolesGuard),
    UseInterceptors(TenantInterceptor),
  ];
  if (roles.length > 0) {
    decorators.push(Roles(...roles));
  }
  return applyDecorators(...decorators);
}
