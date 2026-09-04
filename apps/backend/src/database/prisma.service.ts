import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@ai-led/db';
import { TenantContextService } from '../tenant/tenant-context.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(tenantContext: TenantContextService) {
    super({
      log: [{ emit: 'event', level: 'query' }],
    });

    // Postgres RLS (packages/db/prisma/migrations/..._tenant_row_level_security)
    // only isolates tenants for the `app_runtime` role if `app.tenant_id` is
    // set on the connection running the query — this wraps every standalone
    // Prisma call in a 2-statement transaction that sets it from the
    // request's tenant context first (Prisma's documented RLS pattern; costs
    // one extra round trip per query — upgrade path if that matters: batch
    // several operations behind one set_config via an explicit
    // $transaction, same as the managed-transaction branch below).
    //
    // Calls made through `tx` inside an existing interactive $transaction
    // skip this wrap (see runInManagedTransaction) — wrapping them here
    // would run on a DIFFERENT connection than `tx`, silently breaking the
    // atomicity that transaction was written for. Those call sites set
    // `app.tenant_id` once themselves via `tx.$executeRaw`.
    const base = this;
    return base.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            if (tenantContext.isInManagedTransaction()) return query(args);
            const ctx = tenantContext.get();
            if (!ctx) return query(args);
            const [, result] = await base.$transaction([
              base.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`,
              query(args),
            ]);
            return result;
          },
        },
      },
    }) as unknown as PrismaService;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    // Setiap query mentah dulu selalu tercetak — di apps run sungguhan itu
    // ratusan baris SQL per request, menenggelamkan log yang lebih penting.
    // Opt-in lewat env var, bukan default.
    if (process.env.PRISMA_LOG_QUERIES === 'true') {
      this.$on('query' as never, (event: Prisma.QueryEvent) => {
        this.logger.debug(
          `${event.query} +${event.params} (${event.duration}ms)`,
        );
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
