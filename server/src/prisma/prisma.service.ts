import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { AcresConfigService } from '../config/acres-config.service';

/**
 * The Prisma client, wired to the Postgres driver adapter Prisma 7 requires.
 *
 * It deliberately does **not** connect in `onModuleInit`. Prisma connects
 * lazily on the first query, and keeping it lazy means `/health` answers
 * truthfully about the HTTP service even when no database is reachable — which
 * is the state this repository ships in, since no database is provisioned.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleDestroy, OnApplicationShutdown
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AcresConfigService) {
    super({ adapter: new PrismaPg(config.databaseUrl) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.disconnect();
  }

  private async disconnect(): Promise<void> {
    try {
      await this.$disconnect();
    } catch (error) {
      this.logger.warn(
        `Prisma disconnect failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
