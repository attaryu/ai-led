import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Role } from '@ai-led/db';

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: Role;
  studyProgramId: string | null;
}

@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantContext>();
  private readonly txScope = new AsyncLocalStorage<true>();

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

  /**
   * Marks that Postgres session var `app.tenant_id` (Row-Level Security,
   * packages/db/prisma/migrations/..._tenant_row_level_security) has already
   * been set for the interactive `$transaction` `fn` runs inside — see
   * prisma.service.ts. Query calls made through that transaction's `tx` skip
   * the extension's own set-and-wrap-in-a-transaction step; wrapping them in
   * a SEPARATE transaction would run on a different connection than `tx` and
   * silently break the atomicity the caller wrote `$transaction` for.
   */
  runInManagedTransaction<T>(fn: () => T): T {
    return this.txScope.run(true, fn);
  }

  isInManagedTransaction(): boolean {
    return this.txScope.getStore() === true;
  }
}
