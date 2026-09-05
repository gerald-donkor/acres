import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import { uuidV7 } from '../common/ids';
import { AcresConfigService } from '../config/acres-config.service';
import type { TenantTransactionClient } from '../prisma/tenant-transaction.service';

const KEY_RE = /^[\x21-\x7e]{16,128}$/;

export interface IdempotencyScope {
  key: string | undefined;
  accountId: string;
  organizationId: string | null;
  operation: string;
  requestBody: unknown;
  responseStatus: number;
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly config: AcresConfigService) {}

  async run<T>(
    tx: TenantTransactionClient,
    scope: IdempotencyScope,
    callback: () => Promise<T>,
  ): Promise<T> {
    if (!scope.key || !KEY_RE.test(scope.key)) {
      throw ApiException.idempotencyKeyRequired();
    }

    const keyDigest = digest(`idempotency-key:${scope.key}`);
    const requestHash = digest(
      `idempotency-body:${canonicalJson(scope.requestBody)}`,
    );
    const expiresAt = new Date(
      Date.now() + this.config.idempotencyTtlHours * 60 * 60 * 1000,
    );
    const now = new Date();
    const scopeWhere = {
      keyDigest,
      accountId: scope.accountId,
      organizationId: scope.organizationId,
      operation: scope.operation,
    };

    await tx.idempotencyRecord.deleteMany({
      where: {
        ...scopeWhere,
        expiresAt: { lte: now },
      },
    });

    const existing = await tx.idempotencyRecord.findFirst({
      where: {
        ...scopeWhere,
        expiresAt: { gt: now },
      },
    });

    if (existing != null) {
      if (existing.requestHash !== requestHash) {
        throw ApiException.idempotencyConflict();
      }
      if (existing.state === 'succeeded' && existing.responseBody !== null) {
        return existing.responseBody as T;
      }
      throw ApiException.conflict('That idempotency request is still running.');
    }

    const recordId = uuidV7();
    const reservation = await tx.idempotencyRecord.createMany({
      data: {
        id: recordId,
        keyDigest,
        accountId: scope.accountId,
        organizationId: scope.organizationId,
        operation: scope.operation,
        requestHash,
        state: 'in_progress',
        expiresAt,
      },
      skipDuplicates: true,
    });

    if (reservation.count === 0) {
      const row = await tx.idempotencyRecord.findFirst({
        where: {
          ...scopeWhere,
          expiresAt: { gt: now },
        },
      });
      if (row == null || row.requestHash !== requestHash) {
        throw ApiException.idempotencyConflict();
      }
      if (row.state === 'succeeded' && row.responseBody !== null) {
        return row.responseBody as T;
      }
      throw ApiException.conflict('That idempotency request is still running.');
    }

    const response = await callback();
    await tx.idempotencyRecord.update({
      where: { id: recordId },
      data: {
        state: 'succeeded',
        responseStatus: scope.responseStatus,
        responseBody: response as object,
      },
    });
    return response;
  }
}

function digest(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, sortValue(inner)]),
    );
  }
  return value;
}
