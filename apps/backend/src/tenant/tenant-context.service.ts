import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Role } from '@ai-led/db';

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: Role;
}

@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantContext>();

  run<T>(context: TenantContext, fn: () => T): T {
    return this.als.run(context, fn);
  }

  get(): TenantContext | undefined {
    return this.als.getStore();
  }

  getOrThrow(): TenantContext {
    const context = this.als.getStore();
    if (!context) {
      throw new Error('TenantContext accessed outside of a request scope');
    }
    return context;
  }
}
