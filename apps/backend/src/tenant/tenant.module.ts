import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';
import { TenantGuard } from './tenant.guard';
import { TenantInterceptor } from './tenant.interceptor';

@Global()
@Module({
  providers: [TenantContextService, TenantGuard, TenantInterceptor],
  exports: [TenantContextService, TenantGuard, TenantInterceptor],
})
export class TenantModule {}
