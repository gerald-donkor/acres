import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolClient, type QueryConfig, type QueryResult } from 'pg';
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

  private readonly queryListeners: Array<
    (operation: string, durationSeconds: number) => void
  > = [];

  private readonly wrappedClients = new WeakSet<PoolClient>();

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

  onQuery(
    listener: (operation: string, durationSeconds: number) => void,
  ): () => void {
    this.queryListeners.push(listener);
    return () => {
      const idx = this.queryListeners.indexOf(listener);
      if (idx !== -1) {
        this.queryListeners.splice(idx, 1);
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

  private notifyQuery(operation: string, durationSeconds: number): void {
    if (this.queryListeners.length === 0) return;
    for (const listener of [...this.queryListeners]) {
      try {
        listener(operation, durationSeconds);
      } catch (err) {
        this.logger.warn(
          `Database query listener failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private extractQueryOperation(config: unknown): string {
    let sql: string | undefined;
    if (typeof config === 'string') {
      sql = config;
    } else if (config && typeof config === 'object' && 'text' in config) {
      const text = (config as { text?: unknown }).text;
      if (typeof text === 'string') {
        sql = text;
      }
    }
    if (!sql) return 'other';
    const match = sql.trim().match(/^([a-zA-Z]+)/);
    if (!match) return 'other';
    const op = match[1].toLowerCase();
    switch (op) {
      case 'select':
      case 'insert':
      case 'update':
      case 'delete':
      case 'begin':
      case 'commit':
      case 'rollback':
      case 'set':
        return op;
      default:
        return 'other';
    }
  }

  private wrapClientQuery(client: PoolClient): void {
    if (this.wrappedClients.has(client)) {
      return;
    }
    this.wrappedClients.add(client);

    const originalQuery = client.query.bind(client);

    const wrapped = (
      queryTextOrConfig: string | QueryConfig<unknown[]>,
      valuesOrCallback?:
        unknown[] | ((err: Error | undefined, result?: QueryResult) => void),
      callback?: (err: Error | undefined, result?: QueryResult) => void,
    ): Promise<QueryResult> | void => {
      const operation = this.extractQueryOperation(queryTextOrConfig);
      const start = process.hrtime.bigint();

      if (typeof valuesOrCallback === 'function') {
        const cb = valuesOrCallback;
        const wrappedCb = (
          err: Error | undefined,
          result?: QueryResult,
        ): void => {
          const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
          this.notifyQuery(operation, durationSeconds);
          cb(err, result);
        };
        const orig = originalQuery as (
          config: string | QueryConfig<unknown[]>,
          callback: (err: Error | undefined, result?: QueryResult) => void,
        ) => void;
        return orig(queryTextOrConfig, wrappedCb);
      }

      if (typeof callback === 'function') {
        const wrappedCb = (
          err: Error | undefined,
          result?: QueryResult,
        ): void => {
          const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
          this.notifyQuery(operation, durationSeconds);
          callback(err, result);
        };
        const orig = originalQuery as (
          config: string | QueryConfig<unknown[]>,
          values: unknown[] | undefined,
          callback: (err: Error | undefined, result?: QueryResult) => void,
        ) => void;
        return orig(queryTextOrConfig, valuesOrCallback, wrappedCb);
      }

      try {
        const orig = originalQuery as (
          config: string | QueryConfig<unknown[]>,
          values?: unknown[],
        ) => Promise<QueryResult>;
        const queryPromise = orig(queryTextOrConfig, valuesOrCallback);
        return queryPromise.then(
          (result) => {
            const durationSeconds =
              Number(process.hrtime.bigint() - start) / 1e9;
            this.notifyQuery(operation, durationSeconds);
            return result;
          },
          (err: unknown) => {
            const durationSeconds =
              Number(process.hrtime.bigint() - start) / 1e9;
            this.notifyQuery(operation, durationSeconds);
            throw err;
          },
        );
      } catch (error) {
        const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
        this.notifyQuery(operation, durationSeconds);
        throw error;
      }
    };

    client.query = wrapped as typeof client.query;
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
            if (client) {
              this.wrapClientQuery(client);
            }
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
            if (client) {
              this.wrapClientQuery(client);
            }
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
