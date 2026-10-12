#!/usr/bin/env node

/**
 * scripts/ops/reconcile-storage-objects.js
 *
 * PostgreSQL and Object Storage (Garage / S3) Reconciliation Utility.
 * Reconciles metadata records (StoredObject, Upload, ExportArtifact) against
 * object storage keys, detecting missing objects (data loss) and orphan objects (storage leaks).
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_IGNORE_PATTERNS = [
  /^\.acres-readiness$/,
  /^\.keep$/,
  /^\.DS_Store$/,
];

const isInventoryRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function validateInventory(objects, database) {
  const invalid = () =>
    new Error(`${database ? 'Database' : 'Storage'} inventory is invalid`);
  if (!Array.isArray(objects)) throw invalid();
  const seen = new Set();
  const identities = database
    ? ['id', 'organizationId', 'bucket', 'objectKey']
    : ['key'];
  for (const object of objects) {
    if (
      !isInventoryRecord(object) ||
      identities.some(
        (field) =>
          typeof object[field] !== 'string' || object[field].length === 0,
      )
    )
      throw invalid();
    const identity = database ? object.id : object.key;
    if (seen.has(identity)) throw invalid();
    seen.add(identity);
    const count = object.byteCount;
    if (
      count !== undefined &&
      count !== null &&
      !(
        (typeof count === 'bigint' && count >= 0n) ||
        (typeof count === 'number' &&
          Number.isSafeInteger(count) &&
          count >= 0) ||
        (typeof count === 'string' && /^[0-9]+$/.test(count))
      )
    )
      throw invalid();
  }
}

function normalizeComparisonOptions(options) {
  const invalid = () => new Error('Reconciliation options are invalid');
  if (!isInventoryRecord(options)) throw invalid();
  const {
    bucket = null,
    excludeQuarantined = false,
    quarantineRetentionDays = 7,
    ignorePatterns = DEFAULT_IGNORE_PATTERNS,
    failOnOrphans = false,
    organizationId = null,
    prefix = null,
    now = new Date(),
    execution_mode = 'simulation',
  } = options;
  if (
    [bucket, organizationId, prefix].some(
      (filter) => filter !== null && typeof filter !== 'string',
    ) ||
    typeof excludeQuarantined !== 'boolean' ||
    typeof failOnOrphans !== 'boolean' ||
    typeof quarantineRetentionDays !== 'number' ||
    !Number.isFinite(quarantineRetentionDays) ||
    quarantineRetentionDays < 0 ||
    quarantineRetentionDays * 86400000 > Number.MAX_SAFE_INTEGER ||
    !(now instanceof Date || (typeof now === 'string' && now.trim())) ||
    !Array.isArray(ignorePatterns) ||
    !['simulation', 'live'].includes(execution_mode)
  )
    throw invalid();
  const currentTime =
    now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(currentTime)) throw invalid();
  const patterns = [];
  for (const pattern of ignorePatterns) {
    if (!(pattern instanceof RegExp)) throw invalid();
    patterns.push(new RegExp(pattern.source, pattern.flags));
  }
  return {
    bucket,
    excludeQuarantined,
    quarantineRetentionDays,
    quarantineRetentionMs: quarantineRetentionDays * 86400000,
    ignorePatterns: patterns,
    failOnOrphans,
    organizationId,
    prefix,
    currentTime,
    execution_mode,
  };
}

// Each key starts matching at zero; clones keep caller regex state untouched.
function matchesIgnorePattern(patterns, key) {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(key);
  });
}

/**
 * Compares database metadata records with object storage keys.
 * Pure deterministic reconciliation function suitable for testing and runtime execution.
 *
 * @param {object} params
 * @param {Array<object>} params.dbObjects
 * @param {Array<object>} params.storageObjects
 * @param {object} [params.options]
 * @returns {object} reconciliation result
 */
function reconcileObjects({ dbObjects = [], storageObjects = [], options = {} }) {
  // Validate before policy filters can hide malformed or duplicate evidence.
  validateInventory(dbObjects, true);
  validateInventory(storageObjects, false);
  const {
    bucket,
    excludeQuarantined,
    quarantineRetentionDays,
    quarantineRetentionMs,
    ignorePatterns,
    failOnOrphans,
    organizationId,
    prefix,
    currentTime,
    execution_mode,
  } = normalizeComparisonOptions(options);

  // Index storage objects by key
  const storageMap = new Map();
  for (const obj of storageObjects) {
    if (matchesIgnorePattern(ignorePatterns, obj.key)) continue;
    if (prefix && !obj.key.startsWith(prefix)) continue;
    storageMap.set(obj.key, {
      key: obj.key,
      byteCount: obj.byteCount !== undefined && obj.byteCount !== null ? BigInt(obj.byteCount) : null,
      checksumHex: obj.checksumHex ? String(obj.checksumHex).toLowerCase() : null,
      lastModified: obj.lastModified || null,
    });
  }

  const matched = [];
  const missing = [];
  const mismatches = [];
  const matchedStorageKeys = new Set();

  let activeDatabaseObjects = 0;
  let pendingOrDeletedExcluded = 0;

  // Process database objects
  for (const dbObj of dbObjects) {
    if (bucket && dbObj.bucket && dbObj.bucket !== bucket) continue;
    if (organizationId && dbObj.organizationId !== organizationId) continue;
    if (prefix && !dbObj.objectKey.startsWith(prefix)) continue;
    if (matchesIgnorePattern(ignorePatterns, dbObj.objectKey)) continue;

    const isDeleted = Boolean(dbObj.deletedAt || dbObj.state === 'deleted');
    const isPending = dbObj.state === 'pending_upload' && (!dbObj.uploadState || dbObj.uploadState === 'pending_upload');
    const isExpired = dbObj.uploadState === 'expired' || dbObj.uploadState === 'cancelled';

    // Check if quarantined object is within retention window
    let isQuarantineExcluded = false;
    if (dbObj.state === 'quarantined') {
      if (excludeQuarantined) {
        isQuarantineExcluded = true;
      } else if (quarantineRetentionDays > 0 && dbObj.createdAt) {
        const createdTime = new Date(dbObj.createdAt).getTime();
        if (!isNaN(createdTime) && (currentTime - createdTime) <= quarantineRetentionMs) {
          // Object is quarantined and within active quarantine retention window
          isQuarantineExcluded = true;
        }
      }
    }

    if (isDeleted || isPending || isExpired || isQuarantineExcluded) {
      pendingOrDeletedExcluded++;
      // If object exists in storage anyway, register it so it won't be flagged as an orphan
      if (storageMap.has(dbObj.objectKey)) {
        matchedStorageKeys.add(dbObj.objectKey);
      }
      continue;
    }

    // Active database object: must be present in storage
    activeDatabaseObjects++;
    const storageItem = storageMap.get(dbObj.objectKey);

    if (!storageItem) {
      missing.push({
        id: dbObj.id,
        organizationId: dbObj.organizationId,
        objectKey: dbObj.objectKey,
        state: dbObj.state,
        expectedByteCount: dbObj.byteCount !== null && dbObj.byteCount !== undefined ? String(dbObj.byteCount) : null,
        expectedChecksumHex: dbObj.checksumHex || null,
      });
      continue;
    }

    matchedStorageKeys.add(dbObj.objectKey);

    // Verify size & checksum alignment
    const issues = [];
    const dbByteCount = dbObj.byteCount !== null && dbObj.byteCount !== undefined ? BigInt(dbObj.byteCount) : null;
    const stByteCount = storageItem.byteCount !== null && storageItem.byteCount !== undefined ? BigInt(storageItem.byteCount) : null;

    if (dbByteCount !== null && stByteCount !== null && dbByteCount !== stByteCount) {
      issues.push(`size_mismatch (db: ${dbByteCount}, storage: ${stByteCount})`);
    }

    const dbChecksum = dbObj.checksumHex ? String(dbObj.checksumHex).toLowerCase() : null;
    const stChecksum = storageItem.checksumHex ? String(storageItem.checksumHex).toLowerCase() : null;

    if (dbChecksum && stChecksum && dbChecksum !== stChecksum) {
      issues.push(`checksum_mismatch (db: ${dbChecksum}, storage: ${stChecksum})`);
    }

    if (issues.length > 0) {
      mismatches.push({
        id: dbObj.id,
        organizationId: dbObj.organizationId,
        objectKey: dbObj.objectKey,
        issues,
        db: {
          byteCount: dbByteCount !== null ? String(dbByteCount) : null,
          checksumHex: dbChecksum,
        },
        storage: {
          byteCount: stByteCount !== null ? String(stByteCount) : null,
          checksumHex: stChecksum,
        },
      });
    } else {
      matched.push({
        id: dbObj.id,
        organizationId: dbObj.organizationId,
        objectKey: dbObj.objectKey,
        byteCount: stByteCount !== null ? String(stByteCount) : (dbByteCount !== null ? String(dbByteCount) : null),
      });
    }
  }

  // Detect orphan storage objects
  const orphans = [];
  for (const [key, item] of storageMap.entries()) {
    if (!matchedStorageKeys.has(key)) {
      orphans.push({
        key: item.key,
        byteCount: item.byteCount !== null ? String(item.byteCount) : null,
        lastModified: item.lastModified,
      });
    }
  }

  // Determine reconciliation status and exit code
  let status = 'clean';
  let exitCode = 0;

  if (missing.length > 0 || mismatches.length > 0) {
    status = 'error';
    exitCode = 1;
  } else if (orphans.length > 0) {
    status = 'warning';
    exitCode = failOnOrphans ? 1 : 0;
  }

  return {
    execution_mode,
    drill_type: 'storage_reconciliation',
    timestamp: new Date().toISOString(),
    summary: {
      totalDatabaseObjects: dbObjects.length,
      activeDatabaseObjects,
      pendingOrDeletedExcluded,
      totalBucketObjects: storageMap.size,
      matchedObjects: matched.length,
      missingObjects: missing.length,
      orphanObjects: orphans.length,
      mismatchedObjects: mismatches.length,
      status,
      exitCode,
    },
    matched,
    missing,
    orphans,
    mismatches,
  };
}

/**
 * Lists objects in an S3/Garage bucket with continuation token handling.
 */
async function listBucketObjects({ s3Client, bucket, prefix }) {
  const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const items = [];
  const seenTokens = new Set();
  const seenKeys = new Set();
  const invalidListing = () =>
    new Error('Object storage listing is invalid or incomplete');
  let continuationToken = undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || undefined,
      ContinuationToken: continuationToken,
    });

    const response = await s3Client.send(command);
    // Inventory evidence needs an explicit terminal signal, never a guessed EOF.
    if (
      !response ||
      typeof response !== 'object' ||
      Array.isArray(response) ||
      typeof response.IsTruncated !== 'boolean' ||
      (response.Contents !== undefined && !Array.isArray(response.Contents))
    )
      throw invalidListing();

    if (response.Contents !== undefined) {
      for (const entry of response.Contents) {
        if (
          !entry ||
          typeof entry !== 'object' ||
          Array.isArray(entry) ||
          typeof entry.Key !== 'string' ||
          entry.Key.length === 0 ||
          seenKeys.has(entry.Key) ||
          !Number.isSafeInteger(entry.Size) ||
          entry.Size < 0 ||
          (entry.LastModified !== undefined &&
            (!(entry.LastModified instanceof Date) ||
              !Number.isFinite(entry.LastModified.getTime())))
        )
          throw invalidListing();
        seenKeys.add(entry.Key);
        items.push({
          key: entry.Key,
          byteCount: entry.Size,
          lastModified: entry.LastModified
            ? entry.LastModified.toISOString()
            : null,
          checksumHex: entry.ChecksumSHA256
            ? Buffer.from(entry.ChecksumSHA256, 'base64').toString('hex')
            : null,
        });
      }
    }
    if (!response.IsTruncated) break;
    const next = response.NextContinuationToken;
    if (typeof next !== 'string' || !next.trim() || seenTokens.has(next))
      throw invalidListing();
    seenTokens.add(next);
    continuationToken = next;
  } while (continuationToken);

  return items;
}

/**
 * Queries StoredObject rows from PostgreSQL.
 */
async function queryDatabaseStoredObjects({ pgClient }) {
  const query = `
    SELECT DISTINCT ON (s.id)
      s.id,
      s."organizationId",
      s.bucket,
      s."objectKey",
      s."byteCount"::text AS "byteCount",
      s."checksumAlgorithm",
      s."checksumHex",
      s.state,
      s."deletedAt",
      s."createdAt",
      u.state AS "uploadState",
      u."expiresAt" AS "uploadExpiresAt"
    FROM "StoredObject" s
    LEFT JOIN "Upload" u ON u."storedObjectId" = s.id
    ORDER BY s.id, s."createdAt" ASC;
  `;

  const result = await pgClient.query(query);
  if (!isInventoryRecord(result)) throw new Error('Database inventory is invalid');
  validateInventory(result.rows, true);
  return result.rows.map((row) => ({
    ...row,
    byteCount: row.byteCount != null ? BigInt(row.byteCount) : null,
  }));
}

/**
 * Formats structured reconciliation summary report for terminal output.
 */
function formatReconciliationSummary(report) {
  const { summary } = report;
  const lines = [
    '========================================================',
    '        Acres Storage Reconciliation Report             ',
    '========================================================',
    `Timestamp:                 ${report.timestamp}`,
    `Reconciliation Status:     ${summary.status.toUpperCase()}`,
    `Total DB Objects:          ${summary.totalDatabaseObjects}`,
    `Active DB Objects:         ${summary.activeDatabaseObjects}`,
    `Pending/Excluded Objects:  ${summary.pendingOrDeletedExcluded}`,
    `Total Bucket Objects:      ${summary.totalBucketObjects}`,
    `Matched Objects:           ${summary.matchedObjects}`,
    `Missing Objects (Loss):    ${summary.missingObjects}`,
    `Orphan Objects (Leak):     ${summary.orphanObjects}`,
    `Mismatched Objects:        ${summary.mismatchedObjects}`,
    '========================================================',
  ];

  if (report.missing.length > 0) {
    lines.push('\n[CRITICAL ERROR] Missing Storage Objects (Active in DB, absent in Storage):');
    for (const m of report.missing) {
      lines.push(`  - Key: ${m.objectKey} (Org: ${m.organizationId}, ID: ${m.id}, State: ${m.state})`);
    }
  }

  if (report.mismatches.length > 0) {
    lines.push('\n[CRITICAL ERROR] Mismatched Storage Objects (Size or checksum mismatch):');
    for (const mm of report.mismatches) {
      lines.push(`  - Key: ${mm.objectKey} -> ${mm.issues.join(', ')}`);
    }
  }

  if (report.orphans.length > 0) {
    lines.push('\n[WARNING] Orphan Storage Objects (Present in Storage, absent in DB):');
    for (const o of report.orphans) {
      lines.push(`  - Key: ${o.key} (Bytes: ${o.byteCount || 'unknown'})`);
    }
  }

  return lines.join('\n');
}

/**
 * Custom error class for reconciliation CLI argument validation.
 */
class ReconcileUsageError extends Error {}

const USAGE_TEXT = `Usage: node scripts/ops/reconcile-storage-objects.js [options]

Reconciliation drill: compares database metadata records against object storage keys.
Local/dry-run receipts are simulation; does not attest live production storage integrity.

Options:
  --bucket <bucket>           S3 / Garage bucket name (default: STORAGE_BUCKET or acres-quarantine)
  --endpoint <endpoint>       Storage endpoint URL (default: STORAGE_ENDPOINT or http://localhost:3900)
  --region <region>           Storage region (default: STORAGE_REGION or garage)
  --access-key <key>          Storage access key ID
  --secret-key <secret>       Storage secret access key
  --force-path-style          Use path style addressing (default: true)
  --no-force-path-style       Disable path style addressing
  --output, -o <file>         Path to write JSON evidence report
  --cwd <path>                Working directory for relative path resolution
  --prefix <prefix>           Filter reconciliation to a key prefix
  --organization-id <orgId>   Filter reconciliation to an organization ID
  --fail-on-orphans           Exit with status 1 if orphans are detected (default: false)
  --exclude-quarantined       Exclude quarantined items regardless of age (default: false)
  --dry-run                   Report status without side effects
  --help, -h                  Show this help message
`;

/**
 * Parses and strictly validates CLI arguments for storage reconciliation.
 *
 * @param {string[]} [argv=process.argv.slice(2)]
 * @param {string} [cwd=process.cwd()]
 * @returns {object} parsed options
 */
function parseCliArguments(argv = process.argv.slice(2), cwd = process.cwd()) {
  if (typeof cwd !== 'string' || !cwd.trim()) {
    throw new ReconcileUsageError('cwd requires a non-empty path');
  }
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== 'string')) {
    throw new ReconcileUsageError('arguments must be an array of strings');
  }

  let showHelp = false;
  let customCwd;
  let outputFile;
  let bucket;
  let endpoint;
  let region;
  let accessKey;
  let secretKey;
  let prefix;
  let organizationId;
  let failOnOrphans = false;
  let excludeQuarantined = false;
  let noForcePathStyle = false;
  let forcePathStyle = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      showHelp = true;
      continue;
    }

    if (arg === '--cwd' || arg.startsWith('--cwd=')) {
      if (customCwd !== undefined) {
        throw new ReconcileUsageError('cwd may be specified only once');
      }
      const val = arg === '--cwd' ? argv[++i] : arg.slice(6);
      if (typeof val !== 'string' || !val.trim() || val.startsWith('-')) {
        throw new ReconcileUsageError('cwd requires a non-empty directory path');
      }
      customCwd = val;
      continue;
    }

    if (arg === '--output' || arg === '-o' || arg.startsWith('--output=') || arg.startsWith('-o=')) {
      if (outputFile !== undefined) {
        throw new ReconcileUsageError('output may be specified only once');
      }
      const prefixLen = arg.startsWith('--output=') ? 9 : (arg.startsWith('-o=') ? 3 : 0);
      const val = prefixLen > 0 ? arg.slice(prefixLen) : argv[++i];
      if (typeof val !== 'string' || !val.trim() || val.startsWith('-')) {
        throw new ReconcileUsageError('output requires a non-empty file path');
      }
      outputFile = val;
      continue;
    }

    if (arg === '--bucket' || arg.startsWith('--bucket=')) {
      if (bucket !== undefined) {
        throw new ReconcileUsageError('bucket may be specified only once');
      }
      const val = arg === '--bucket' ? argv[++i] : arg.slice(9);
      if (typeof val !== 'string' || !val.trim() || val.startsWith('-')) {
        throw new ReconcileUsageError('bucket requires a non-empty bucket name');
      }
      bucket = val;
      continue;
    }

    if (arg === '--endpoint' || arg.startsWith('--endpoint=')) {
      if (endpoint !== undefined) {
        throw new ReconcileUsageError('endpoint may be specified only once');
      }
      const val = arg === '--endpoint' ? argv[++i] : arg.slice(11);
      if (typeof val !== 'string' || !val.trim() || val.startsWith('-')) {
        throw new ReconcileUsageError('endpoint requires a non-empty endpoint URL');
      }
      endpoint = val;
      continue;
    }

    if (arg === '--region' || arg.startsWith('--region=')) {
      if (region !== undefined) {
        throw new ReconcileUsageError('region may be specified only once');
      }
      const val = arg === '--region' ? argv[++i] : arg.slice(9);
      if (typeof val !== 'string' || !val.trim() || val.startsWith('-')) {
        throw new ReconcileUsageError('region requires a non-empty region name');
      }
      region = val;
      continue;
    }

    if (arg === '--access-key' || arg.startsWith('--access-key=')) {
      if (accessKey !== undefined) {
        throw new ReconcileUsageError('access-key may be specified only once');
      }
      const val = arg === '--access-key' ? argv[++i] : arg.slice(13);
      if (typeof val !== 'string' || !val.trim() || val.startsWith('-')) {
        throw new ReconcileUsageError('access-key requires a non-empty key ID');
      }
      accessKey = val;
      continue;
    }

    if (arg === '--secret-key' || arg.startsWith('--secret-key=')) {
      if (secretKey !== undefined) {
        throw new ReconcileUsageError('secret-key may be specified only once');
      }
      const val = arg === '--secret-key' ? argv[++i] : arg.slice(13);
      if (typeof val !== 'string' || !val.trim() || val.startsWith('-')) {
        throw new ReconcileUsageError('secret-key requires a non-empty secret key');
      }
      secretKey = val;
      continue;
    }

    if (arg === '--prefix' || arg.startsWith('--prefix=')) {
      if (prefix !== undefined) {
        throw new ReconcileUsageError('prefix may be specified only once');
      }
      const val = arg === '--prefix' ? argv[++i] : arg.slice(9);
      if (typeof val !== 'string' || !val.trim() || val.startsWith('-')) {
        throw new ReconcileUsageError('prefix requires a non-empty key prefix');
      }
      prefix = val;
      continue;
    }

    if (arg === '--organization-id' || arg.startsWith('--organization-id=')) {
      if (organizationId !== undefined) {
        throw new ReconcileUsageError('organization-id may be specified only once');
      }
      const val = arg === '--organization-id' ? argv[++i] : arg.slice(18);
      if (typeof val !== 'string' || !val.trim() || val.startsWith('-')) {
        throw new ReconcileUsageError('organization-id requires a non-empty organization ID');
      }
      organizationId = val;
      continue;
    }

    if (arg === '--fail-on-orphans') {
      if (failOnOrphans) {
        throw new ReconcileUsageError('fail-on-orphans may be specified only once');
      }
      failOnOrphans = true;
      continue;
    }

    if (arg === '--exclude-quarantined') {
      if (excludeQuarantined) {
        throw new ReconcileUsageError('exclude-quarantined may be specified only once');
      }
      excludeQuarantined = true;
      continue;
    }

    if (arg === '--no-force-path-style') {
      if (noForcePathStyle) {
        throw new ReconcileUsageError('no-force-path-style may be specified only once');
      }
      noForcePathStyle = true;
      continue;
    }

    if (arg === '--force-path-style') {
      if (forcePathStyle) {
        throw new ReconcileUsageError('force-path-style may be specified only once');
      }
      forcePathStyle = true;
      continue;
    }

    if (arg === '--dry-run') {
      if (dryRun) {
        throw new ReconcileUsageError('dry-run may be specified only once');
      }
      dryRun = true;
      continue;
    }

    throw new ReconcileUsageError('unsupported option or positional argument');
  }

  if (forcePathStyle && noForcePathStyle) {
    throw new ReconcileUsageError('cannot specify both --force-path-style and --no-force-path-style');
  }

  const effectiveCwd = path.resolve(cwd, customCwd === undefined ? '.' : customCwd);

  return {
    showHelp,
    cwd: effectiveCwd,
    output: outputFile !== undefined ? path.resolve(effectiveCwd, outputFile) : null,
    bucket,
    endpoint,
    region,
    accessKey,
    secretKey,
    prefix,
    organizationId,
    failOnOrphans,
    excludeQuarantined,
    forcePathStyle: !noForcePathStyle,
    dryRun,
  };
}

// Only these fixed messages may cross the runner's publication error boundary.
class ReceiptPublicationError extends Error {}
const publicationFailure = (message = 'receipt publication failed') =>
  new ReceiptPublicationError(message);
const sameReceiptFile = (a, b) => a.dev === b.dev && a.ino === b.ino;

function receiptStat(file) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function receiptParents(destination) {
  const parents = [];
  let current = path.parse(destination).root;
  for (const part of [
    '',
    ...path
      .dirname(destination)
      .slice(current.length)
      .split(path.sep)
      .filter(Boolean),
  ]) {
    if (part) current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw publicationFailure('parent path is not a directory');
    }
    parents.push({ file: current, stat });
  }
  return parents;
}

function checkReceiptParents(parents) {
  for (const { file, stat } of parents) {
    const actual = fs.lstatSync(file);
    if (!actual.isDirectory() || !sameReceiptFile(actual, stat)) {
      throw publicationFailure();
    }
  }
}

/** Publish complete evidence exclusively; hard-link failure has no overwrite fallback. */
function publishReceipt(outputFile, report) {
  if (
    typeof outputFile !== 'string' ||
    !outputFile.trim() ||
    /[\x00-\x1f\x7f-\x9f]/.test(outputFile)
  )
    throw publicationFailure(
      'output file path must be non-empty and control-free',
    );
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw publicationFailure('report must be an object');
  }

  const destination = path.resolve(outputFile);
  let parents;
  try {
    parents = receiptParents(destination);
  } catch (error) {
    if (error instanceof ReceiptPublicationError) throw error;
    if (error.code === 'ENOENT')
      throw publicationFailure('parent directory does not exist');
    throw publicationFailure('parent directory is unavailable or unsafe');
  }
  try {
    if (receiptStat(destination))
      throw publicationFailure('output file already exists');
  } catch (error) {
    if (error instanceof ReceiptPublicationError) throw error;
    throw publicationFailure();
  }

  const temporary = path.join(
    path.dirname(destination),
    `.reconcile-${crypto.randomUUID()}.tmp`,
  );
  let fd = null;
  let readFd = null;
  let owned = null;
  let failed = null;
  let cleanupFailed = false;
  const close = (reading = false) => {
    const descriptor = reading ? readFd : fd;
    if (descriptor !== null) {
      fs.closeSync(descriptor);
      if (reading) readFd = null;
      else fd = null;
    }
  };
  const clean = () => {
    // Recover ownership if the first descriptor stat failed; never adopt a path.
    if (!owned && fd !== null) {
      try {
        owned = fs.fstatSync(fd);
      } catch {
        cleanupFailed = true;
      }
    }
    for (const reading of [true, false]) {
      try {
        close(reading);
      } catch {
        cleanupFailed = true;
      }
    }
    if (owned) {
      try {
        checkReceiptParents(parents);
        const actual = receiptStat(temporary);
        if (actual && (!actual.isFile() || !sameReceiptFile(actual, owned))) {
          throw publicationFailure();
        }
        if (actual) fs.unlinkSync(temporary);
        owned = null;
      } catch {
        cleanupFailed = true;
      }
    }
  };

  try {
    const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8');
    checkReceiptParents(parents);
    fd = fs.openSync(
      temporary,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
    owned = fs.fstatSync(fd);
    if (!owned.isFile()) throw publicationFailure();
    fs.writeFileSync(fd, bytes);
    close();
    checkReceiptParents(parents);
    const named = fs.lstatSync(temporary);
    if (
      !named.isFile() ||
      !sameReceiptFile(named, owned) ||
      named.size !== bytes.length
    ) {
      throw publicationFailure();
    }
    readFd = fs.openSync(
      temporary,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const opened = fs.fstatSync(readFd);
    if (
      !opened.isFile() ||
      !sameReceiptFile(opened, owned) ||
      opened.size !== bytes.length
    ) {
      throw publicationFailure();
    }
    const actual = Buffer.alloc(bytes.length + 1);
    let used = 0;
    while (used < actual.length) {
      const n = fs.readSync(readFd, actual, used, actual.length - used, null);
      if (!Number.isInteger(n) || n < 0 || n > actual.length - used)
        throw publicationFailure();
      if (n === 0) break;
      used += n;
    }
    const after = fs.fstatSync(readFd);
    if (
      used !== bytes.length ||
      after.size !== bytes.length ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs ||
      !actual.subarray(0, used).equals(bytes)
    )
      throw publicationFailure();
    close(true);
    checkReceiptParents(parents);
    const final = fs.lstatSync(temporary);
    if (
      !final.isFile() ||
      !sameReceiptFile(final, owned) ||
      final.size !== bytes.length ||
      final.mtimeMs !== after.mtimeMs ||
      final.ctimeMs !== after.ctimeMs
    )
      throw publicationFailure();
    try {
      fs.linkSync(temporary, destination);
    } catch (error) {
      if (error.code === 'EEXIST')
        throw publicationFailure('output file already exists');
      throw publicationFailure();
    }
  } catch (error) {
    failed =
      error instanceof ReceiptPublicationError ? error : publicationFailure();
  } finally {
    clean();
    // A transient fault still fails this invocation; retry only owned cleanup once.
    if (fd !== null || readFd !== null || owned !== null) clean();
  }
  if (cleanupFailed) throw publicationFailure('receipt cleanup failed');
  if (failed) throw failed;
}

/**
 * Programmatic and CLI runner for storage reconciliation.
 *
 * @param {string[]} [argv=process.argv]
 * @param {{ log: Function, error: Function }} [io]
 * @param {object} [options]
 * @returns {Promise<number>} exit code
 */
async function main(
  argv = process.argv,
  io = { log: console.log, error: console.error },
  options = {}
) {
  const setExitCode = (code) => {
    if (require.main === module) {
      process.exitCode = code;
    }
  };

  let parsed;
  try {
    parsed = parseCliArguments(argv.slice(2), options.cwd || process.cwd());
  } catch (error) {
    if (!(error instanceof ReconcileUsageError)) throw error;
    io.error(`reconciliation usage error: ${error.message}`);
    io.log(USAGE_TEXT);
    setExitCode(1);
    if (options.exitOnError === true) process.exit(1);
    return 1;
  }

  if (parsed.showHelp) {
    io.log(USAGE_TEXT);
    return 0;
  }

  try {
    if (options.dbObjects !== undefined)
      validateInventory(options.dbObjects, true);
    if (options.storageObjects !== undefined)
      validateInventory(options.storageObjects, false);
  } catch {
    io.error('Error: Reconciliation execution failed');
    setExitCode(1);
    if (options.exitOnError === true) process.exit(1);
    return 1;
  }

  const env = options.env !== undefined ? options.env : process.env;

  const bucket = parsed.bucket || env.STORAGE_BUCKET || 'acres-quarantine';
  const endpoint = parsed.endpoint || env.STORAGE_ENDPOINT || 'http://localhost:3900';
  const region = parsed.region || env.STORAGE_REGION || 'garage';
  const accessKeyId = parsed.accessKey || env.STORAGE_ACCESS_KEY_ID || 'acres_garage_dev_key';
  const secretAccessKey = parsed.secretKey || env.STORAGE_SECRET_ACCESS_KEY || 'acres_garage_dev_secret';
  const forcePathStyle = parsed.forcePathStyle;
  const outputFile = parsed.output;
  const prefix = parsed.prefix;
  const organizationId = parsed.organizationId;
  const failOnOrphans = parsed.failOnOrphans;
  const excludeQuarantined = parsed.excludeQuarantined;
  const dryRun = parsed.dryRun;

  io.log('Connecting to PostgreSQL and Object Storage...');

  // Database objects resolution
  let dbObjects = options.dbObjects;
  let pgClient = options.pgClient;

  if (dbObjects === undefined) {
    if (!pgClient) {
      const pgPassword =
        env.PGPASSWORD ||
        env.POSTGRES_PASSWORD ||
        env.ACRES_MIGRATOR_PASSWORD;

      if (!pgPassword) {
        io.error('Error: PostgreSQL password is required (set PGPASSWORD, POSTGRES_PASSWORD, or ACRES_MIGRATOR_PASSWORD)');
        setExitCode(1);
        if (options.exitOnError === true) process.exit(1);
        return 1;
      }

      const { Client } = require('pg');
      pgClient = new Client({
        host: env.PGHOST || 'localhost',
        port: parseInt(env.PGPORT || '5432', 10),
        user: env.PGUSER || 'acres_migrator',
        password: pgPassword,
        database: env.PGDATABASE || 'acres',
      });
    }

    try {
      if (typeof pgClient.connect === 'function') {
        await pgClient.connect();
      }
    } catch (_err) {
      io.error('Error: PostgreSQL connection failed');
      setExitCode(1);
      if (options.exitOnError === true) process.exit(1);
      return 1;
    }

    try {
      dbObjects = await queryDatabaseStoredObjects({ pgClient });
    } catch (_err) {
      io.error('Error: Database query failed');
      if (pgClient && !options.pgClient) {
        await pgClient.end().catch(() => {});
      }
      setExitCode(1);
      if (options.exitOnError === true) process.exit(1);
      return 1;
    }
  }

  // Storage objects resolution
  let storageObjects = options.storageObjects;
  let s3Client = options.s3Client;

  if (storageObjects === undefined) {
    if (!s3Client) {
      const { S3Client } = require('@aws-sdk/client-s3');
      s3Client = new S3Client({
        endpoint,
        region,
        forcePathStyle,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }

    try {
      storageObjects = await listBucketObjects({ s3Client, bucket, prefix });
    } catch (_err) {
      io.error('Error: Object storage connection or listing failed');
      if (pgClient && !options.pgClient) {
        await pgClient.end().catch(() => {});
      }
      setExitCode(1);
      if (options.exitOnError === true) process.exit(1);
      return 1;
    }
  }

  try {
    const report = reconcileObjects({
      dbObjects,
      storageObjects,
      options: {
        bucket,
        prefix,
        organizationId,
        failOnOrphans,
        excludeQuarantined,
        execution_mode: dryRun ? 'simulation' : 'live',
      },
    });

    io.log(formatReconciliationSummary(report));

    if (outputFile) {
      publishReceipt(outputFile, report);
      io.log(`\nReconciliation evidence written to ${outputFile}`);
    }

    if (pgClient && !options.pgClient) {
      await pgClient.end().catch(() => {});
    }

    const exitCode = report.summary.exitCode;
    setExitCode(exitCode);
    if (options.exitOnError === true && exitCode !== 0) {
      process.exit(exitCode);
    }
    return exitCode;
  } catch (err) {
    if (pgClient && !options.pgClient) {
      await pgClient.end().catch(() => {});
    }
    if (err instanceof ReceiptPublicationError) {
      io.error(`Error: Reconciliation evidence publication failed: ${err.message}`);
    } else {
      io.error('Error: Reconciliation execution failed');
    }
    setExitCode(1);
    if (options.exitOnError === true) process.exit(1);
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch(() => {
    process.exitCode = 1;
  });
}

module.exports = {
  reconcileObjects,
  formatReconciliationSummary,
  listBucketObjects,
  queryDatabaseStoredObjects,
  DEFAULT_IGNORE_PATTERNS,
  ReconcileUsageError,
  parseCliArguments,
  publishReceipt,
  main,
};
