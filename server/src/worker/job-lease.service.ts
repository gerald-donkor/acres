import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { uuidV7 } from '../common/ids';
import { AcresConfigService } from '../config/acres-config.service';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';

export interface JobLease {
  readonly durableJobId: string;
  readonly owner: string;
}

export interface JobLeaseTarget {
  readonly deterministicKey: string;
  readonly jobType: string;
  readonly organizationId: string;
  readonly uploadId: string | null;
}

/**
 * One live executor per deterministic job key for at-least-once transports.
 * Each claim is a single short statement: no SQL transaction is held while the
 * job reads objects, scans or renders. An expired lease means the previous
 * executor was lost (crash, timeout, deployment replacement).
 */
@Injectable()
export class JobLeaseService {
  constructor(
    private readonly tenants: TenantTransactionService,
    private readonly config: AcresConfigService,
  ) {}

  async acquire(target: JobLeaseTarget): Promise<JobLease | null> {
    const owner = `lease-${randomUUID()}`;
    // Computed by the database clock that also judges expiry (no app skew).
    const leaseMs = this.config.jobLeaseMs;
    const rows = await this.tenants.workerScoped(
      (tx) =>
        tx.$queryRaw<{ id: string; leaseOwner: string | null }[]>`
        INSERT INTO "DurableJob" (
          "id", "deterministicKey", "organizationId", "uploadId", "jobType",
          "state", "maxAttempts", "leaseOwner", "leaseUntil", "updatedAt"
        )
        VALUES (
          ${uuidV7()}, ${target.deterministicKey}, ${target.organizationId},
          ${target.uploadId}, ${target.jobType}, 'queued'::"DurableJobState",
          ${this.config.queueDefaultAttempts}, ${owner},
          now() + (${leaseMs} * interval '1 millisecond'), now()
        )
        ON CONFLICT ("deterministicKey") DO UPDATE
          SET "leaseOwner" = EXCLUDED."leaseOwner",
              "leaseUntil" = EXCLUDED."leaseUntil",
              "updatedAt" = now()
          WHERE "DurableJob"."leaseUntil" IS NULL
             OR "DurableJob"."leaseUntil" < now()
        RETURNING "id", "leaseOwner"
      `,
    );
    const row = rows[0];
    if (row === undefined || row.leaseOwner !== owner) return null;
    return { durableJobId: row.id, owner };
  }

  /** Remaining lease time on a key held by someone else, for retry pacing. */
  async remainingMs(deterministicKey: string): Promise<number> {
    const rows = await this.tenants.workerScoped(
      (tx) =>
        tx.$queryRaw<{ remaining: number | null }[]>`
        SELECT GREATEST(0, EXTRACT(EPOCH FROM ("leaseUntil" - now())) * 1000)::float8 AS remaining
        FROM "DurableJob" WHERE "deterministicKey" = ${deterministicKey}
      `,
    );
    return Math.ceil(rows[0]?.remaining ?? 0);
  }

  /** Releases only the caller's own lease; a stolen (expired) lease is left alone. */
  async release(lease: JobLease): Promise<void> {
    await this.tenants.workerScoped(
      (tx) =>
        tx.$executeRaw`
        UPDATE "DurableJob"
        SET "leaseOwner" = NULL, "leaseUntil" = NULL, "updatedAt" = now()
        WHERE "id" = ${lease.durableJobId} AND "leaseOwner" = ${lease.owner}
      `,
    );
  }
}
