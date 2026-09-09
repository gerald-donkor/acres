/**
 * scripts/ops/reconcile-storage-objects.ts
 *
 * TypeScript types and re-export for the storage reconciliation utility.
 */

export interface DbStoredObjectRecord {
  id: string;
  organizationId: string;
  bucket: string;
  objectKey: string;
  byteCount: bigint | number | string | null;
  checksumAlgorithm?: string | null;
  checksumHex?: string | null;
  state: 'pending_upload' | 'quarantined' | 'accepted' | 'rejected' | 'deleted';
  deletedAt?: Date | string | null;
  createdAt?: Date | string;
  uploadState?: string | null;
  uploadExpiresAt?: Date | string | null;
}

export interface StorageObjectRecord {
  key: string;
  byteCount?: bigint | number | string | null;
  checksumHex?: string | null;
  lastModified?: Date | string | null;
}

export interface ReconciliationOptions {
  bucket?: string | null;
  excludeQuarantined?: boolean;
  quarantineRetentionDays?: number;
  ignorePatterns?: RegExp[];
  failOnOrphans?: boolean;
  organizationId?: string | null;
  prefix?: string | null;
  now?: Date | string;
}

export interface ReconciliationSummary {
  totalDatabaseObjects: number;
  activeDatabaseObjects: number;
  pendingOrDeletedExcluded: number;
  totalBucketObjects: number;
  matchedObjects: number;
  missingObjects: number;
  orphanObjects: number;
  mismatchedObjects: number;
  status: 'clean' | 'warning' | 'error';
  exitCode: number;
}

export interface ReconciliationReport {
  timestamp: string;
  summary: ReconciliationSummary;
  matched: Array<{
    id: string;
    organizationId: string;
    objectKey: string;
    byteCount: string | null;
  }>;
  missing: Array<{
    id: string;
    organizationId: string;
    objectKey: string;
    state: string;
    expectedByteCount: string | null;
    expectedChecksumHex: string | null;
  }>;
  orphans: Array<{
    key: string;
    byteCount: string | null;
    lastModified?: Date | string | null;
  }>;
  mismatches: Array<{
    id: string;
    organizationId: string;
    objectKey: string;
    issues: string[];
    db: {
      byteCount: string | null;
      checksumHex: string | null;
    };
    storage: {
      byteCount: string | null;
      checksumHex: string | null;
    };
  }>;
}

// Re-export implementations from the JS runner
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jsModule = require('./reconcile-storage-objects.js');

export const reconcileObjects: (params: {
  dbObjects?: DbStoredObjectRecord[];
  storageObjects?: StorageObjectRecord[];
  options?: ReconciliationOptions;
}) => ReconciliationReport = jsModule.reconcileObjects;

export const formatReconciliationSummary: (report: ReconciliationReport) => string =
  jsModule.formatReconciliationSummary;

export const DEFAULT_IGNORE_PATTERNS: RegExp[] = jsModule.DEFAULT_IGNORE_PATTERNS;
