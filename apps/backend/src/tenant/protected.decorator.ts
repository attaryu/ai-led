import { applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { Role } from '@ai-led/db';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { RolesGuard } from '../auth/roles/roles.guard';
import { TenantGuard } from './tenant.guard';
import { TenantInterceptor } from './tenant.interceptor';

/** Bundles auth + tenant-isolation guards; pass roles to also restrict the route, e.g. @Protected(Role.ADMIN). */
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
