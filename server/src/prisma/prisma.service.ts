import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolClient } from 'pg';
import { PrismaClient } from '../generated/prisma/client';
import { AcresConfigService } from '../config/acres-config.service';

type PoolConnectCallback = (
  err: Error | undefined,
  client: PoolClient | undefined,
  done: (release?: any) => void,
) => void;

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
  private readonly acquisitionListeners: Array<
    (durationSeconds: number) => void
  > = [];

  constructor(config: AcresConfigService) {
    const pool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 5000,
    });
    super({
      adapter: new PrismaPg(pool),
    });
    this.pool = pool;
    this.wrapPoolConnect(pool);
  }

  onAcquisition(listener: (durationSeconds: number) => void): () => void {
    this.acquisitionListeners.push(listener);
    return () => {
      const idx = this.acquisitionListeners.indexOf(listener);
      if (idx !== -1) {
        this.acquisitionListeners.splice(idx, 1);
      }
    };
  }

  private notifyAcquisition(durationSeconds: number): void {
    if (this.acquisitionListeners.length === 0) return;
    for (const listener of [...this.acquisitionListeners]) {
      try {
        listener(durationSeconds);
      } catch (err) {
        this.logger.warn(
          `Pool acquisition listener failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private wrapPoolConnect(pool: Pool): void {
    const originalConnect = pool.connect.bind(pool);

    pool.connect = ((
      callback?: PoolConnectCallback,
    ): Promise<PoolClient> | void => {
      const start = process.hrtime.bigint();
      if (typeof callback === 'function') {
        try {
          originalConnect((err, client, release) => {
            const durationSeconds =
              Number(process.hrtime.bigint() - start) / 1e9;
            this.notifyAcquisition(durationSeconds);
            callback(err, client, release);
          });
          return;
        } catch (error) {
          const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
          this.notifyAcquisition(durationSeconds);
          throw error;
        }
      }

      try {
        return originalConnect().then(
          (client: PoolClient) => {
            const durationSeconds =
              Number(process.hrtime.bigint() - start) / 1e9;
            this.notifyAcquisition(durationSeconds);
            return client;
          },
          (err: unknown) => {
            const durationSeconds =
              Number(process.hrtime.bigint() - start) / 1e9;
            this.notifyAcquisition(durationSeconds);
            throw err;
          },
        );
      } catch (error) {
        const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
        this.notifyAcquisition(durationSeconds);
        throw error;
      }
    }) as typeof pool.connect;
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
