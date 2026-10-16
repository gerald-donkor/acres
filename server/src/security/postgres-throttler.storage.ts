import { HttpStatus, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { ApiException } from '../common/api-exception';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const THROTTLE_CLEANUP_BATCH = 250;
const TRANSACTION_OPTIONS = {
  maxWait: 5000,
  timeout: 5000,
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
};

/** The same selection is used by real-database EXPLAIN acceptance. */
export function expiredThrottleBuckets() {
  return Prisma.sql`
    WITH expired AS MATERIALIZED (
      SELECT "key", "tier" FROM "ThrottleBucket"
      WHERE "expiresAt" <= statement_timestamp()
      ORDER BY "expiresAt" LIMIT ${THROTTLE_CLEANUP_BATCH}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM "ThrottleBucket" b USING expired e
    WHERE b."key" = e."key" AND b."tier" = e."tier"
      AND b."expiresAt" <= statement_timestamp()
  `;
}

function unavailable(): ApiException {
  return new ApiException(
    'NOT_READY',
    'Request protection is temporarily unavailable.',
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

async function boundQueries(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`
    SELECT set_config('statement_timeout', '2000', true),
           set_config('lock_timeout', '1000', true)
  `;
}

/** No timers, extra pool, tenant context or fallback on managed storage failure. */
@Injectable()
export class PostgresThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly prisma: PrismaService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    tier: string,
  ): Promise<Awaited<ReturnType<ThrottlerStorage['increment']>>> {
    // Guard generates SHA-256(controller/handler/tier/IP); reject raw trackers.
    if (
      !/^[0-9a-f]{64}$/.test(key) ||
      tier.length < 1 ||
      tier.length > 64 ||
      ![ttl, limit, blockDuration].every(Number.isSafeInteger) ||
      ttl < 1 ||
      ttl > 2147483647 ||
      blockDuration < 1 ||
      blockDuration > 2147483647 ||
      limit < 1 ||
      limit > 1000000
    )
      throw unavailable();

    try {
      return await this.prisma.$transaction(async (tx) => {
        await boundQueries(tx);
        // UPSERT locks existing rows and serializes initial creation races.
        // Cleanup uses the same row locks. READ COMMITTED gives the subsequent
        // read the winning committed version even when we waited on insertion.
        await tx.$executeRaw`
          INSERT INTO "ThrottleBucket" ("key", "tier", "hits", "windowExpiresAt", "expiresAt")
          VALUES (${key}, ${tier}, ARRAY[]::timestamptz[],
            clock_timestamp() + (${ttl} * interval '1 millisecond'),
            clock_timestamp() + (${ttl} * interval '1 millisecond'))
          ON CONFLICT ("key", "tier") DO UPDATE SET "key" = EXCLUDED."key"
        `;
        const bucket = await tx.throttleBucket.findUniqueOrThrow({
          where: { key_tier: { key, tier } },
        });
        // Read database time AFTER lock acquisition, never transaction-start time.
        const [clock] = await tx.$queryRaw<{ now: Date }[]>`
          SELECT date_trunc('milliseconds', clock_timestamp()) AS now
        `;
        const now = clock.now.getTime();
        // Persist individual expiry instants so overlapping releases cannot
        // retroactively change prior hits by supplying a different TTL.
        let hits = bucket.hits.filter((expiry) => expiry.getTime() > now);
        let blockedUntil = bucket.blockedUntil;
        if (blockedUntil && blockedUntil.getTime() <= now) {
          blockedUntil = null;
          hits = [];
        }
        if (!blockedUntil) {
          // Also bounds history if an operator lowers the allowance mid-window.
          hits = hits.slice(-limit);
          hits.push(new Date(now + ttl));
          if (hits.length > limit) blockedUntil = new Date(now + blockDuration);
        }
        const windowExpiresAt =
          bucket.windowExpiresAt.getTime() <= now
            ? new Date(now + ttl)
            : bucket.windowExpiresAt;
        const expiresAt = new Date(
          Math.max(
            windowExpiresAt.getTime(),
            blockedUntil?.getTime() ?? 0,
            hits.reduce((last, expiry) => Math.max(last, expiry.getTime()), 0),
          ),
        );
        await tx.throttleBucket.update({
          where: { key_tier: { key, tier } },
          data: { hits, windowExpiresAt, blockedUntil, expiresAt },
        });
        return {
          totalHits: hits.length,
          timeToExpire: Math.max(
            0,
            Math.ceil((windowExpiresAt.getTime() - now) / 1000),
          ),
          isBlocked: blockedUntil !== null,
          timeToBlockExpire: Math.max(
            0,
            Math.ceil(((blockedUntil?.getTime() ?? now) - now) / 1000),
          ),
        };
      }, TRANSACTION_OPTIONS);
    } catch {
      // Do not attach driver errors (SQL, bindings, credentials) as cause/logs.
      throw unavailable();
    }
  }

  async cleanupOnce(): Promise<number> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await boundQueries(tx);
        return tx.$executeRaw(expiredThrottleBuckets());
      }, TRANSACTION_OPTIONS);
    } catch {
      throw unavailable();
    }
  }
}
