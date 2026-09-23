import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
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
  private readonly pool: Pool;
  private disconnectPromise?: Promise<void>;

  constructor(config: AcresConfigService) {
    const pool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 5000,
    });
    super({
      adapter: new PrismaPg(pool),
    });
    this.pool = pool;
  }

  getPoolSnapshot(): {
    total: number;
    idle: number;
    waiting: number;
    max: number;
  } {
    const max = this.pool.options.max;
    if (max === undefined) {
      throw new Error('PostgreSQL pool maximum is unavailable');
    }
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
      max,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.disconnect();
  }

  private async disconnect(): Promise<void> {
    this.disconnectPromise ??= (async () => {
      try {
        await this.$disconnect();
      } catch (error) {
        this.logger.warn(
          `Prisma disconnect failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        try {
          await this.pool.end();
        } catch (error) {
          this.logger.warn(
            `PostgreSQL pool close failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    })();
    await this.disconnectPromise;
  }
}
