import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@ai-led/db';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [{ emit: 'event', level: 'query' }],
    });
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
