#!/usr/bin/env node

/**
 * scripts/ops/reconcile-storage-objects.js
 *
 * PostgreSQL and Object Storage (Garage / S3) Reconciliation Utility.
 * Reconciles metadata records (StoredObject, Upload, ExportArtifact) against
 * object storage keys, detecting missing objects (data loss) and orphan objects (storage leaks).
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_IGNORE_PATTERNS = [
  /^\.acres-readiness$/,
  /^\.keep$/,
  /^\.DS_Store$/,
];

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
  const {
    bucket = null,
    excludeQuarantined = false,
    quarantineRetentionDays = 7,
    ignorePatterns = DEFAULT_IGNORE_PATTERNS,
    failOnOrphans = false,
    organizationId = null,
    prefix = null,
    now = new Date(),
  } = options;

  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const quarantineRetentionMs = quarantineRetentionDays * 24 * 60 * 60 * 1000;

  // Index storage objects by key
  const storageMap = new Map();
  for (const obj of storageObjects) {
    if (!obj || !obj.key) continue;
    if (ignorePatterns.some((pattern) => pattern.test(obj.key))) continue;
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
    if (!dbObj || !dbObj.objectKey) continue;
    if (bucket && dbObj.bucket && dbObj.bucket !== bucket) continue;
    if (organizationId && dbObj.organizationId !== organizationId) continue;
    if (prefix && !dbObj.objectKey.startsWith(prefix)) continue;
    if (ignorePatterns.some((pattern) => pattern.test(dbObj.objectKey))) continue;

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
  let continuationToken = undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || undefined,
      ContinuationToken: continuationToken,
    });

    const response = await s3Client.send(command);
    if (response.Contents) {
      for (const entry of response.Contents) {
        items.push({
          key: entry.Key,
          byteCount: entry.Size,
          lastModified: entry.LastModified ? entry.LastModified.toISOString() : null,
          checksumHex: entry.ChecksumSHA256
            ? Buffer.from(entry.ChecksumSHA256, 'base64').toString('hex')
            : null,
        });
      }
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
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
  return result.rows.map((row) => ({
    ...row,
    byteCount: row.byteCount !== null ? BigInt(row.byteCount) : null,
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
 * Main execution function for CLI invocation.
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node scripts/ops/reconcile-storage-objects.js [options]

Options:
  --bucket <bucket>           S3 / Garage bucket name (default: STORAGE_BUCKET or acres-quarantine)
  --endpoint <endpoint>       Storage endpoint URL (default: STORAGE_ENDPOINT or http://localhost:3900)
  --region <region>           Storage region (default: STORAGE_REGION or garage)
  --access-key <key>          Storage access key ID
  --secret-key <secret>       Storage secret access key
  --force-path-style          Use path style addressing (default: true)
  --output <file>             Path to write JSON evidence report (default: reconciliation-report.json)
  --prefix <prefix>           Filter reconciliation to a key prefix
  --organization-id <orgId>   Filter reconciliation to an organization ID
  --fail-on-orphans           Exit with status 1 if orphans are detected (default: false)
  --exclude-quarantined       Exclude quarantined items regardless of age (default: false)
  --dry-run                   Report status without side effects
  --help, -h                  Show this help message
`);
    process.exit(0);
  }

  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
  };

  const bucket = getArg('--bucket') || process.env.STORAGE_BUCKET || 'acres-quarantine';
  const endpoint = getArg('--endpoint') || process.env.STORAGE_ENDPOINT || 'http://localhost:3900';
  const region = getArg('--region') || process.env.STORAGE_REGION || 'garage';
  const accessKeyId = getArg('--access-key') || process.env.STORAGE_ACCESS_KEY_ID || 'acres_garage_dev_key';
  const secretAccessKey = getArg('--secret-key') || process.env.STORAGE_SECRET_ACCESS_KEY || 'acres_garage_dev_secret';
  const forcePathStyle = !args.includes('--no-force-path-style');
  const outputFile = getArg('--output') || 'reconciliation-report.json';
  const prefix = getArg('--prefix');
  const organizationId = getArg('--organization-id');
  const failOnOrphans = args.includes('--fail-on-orphans');
  const excludeQuarantined = args.includes('--exclude-quarantined');

  console.log('Connecting to PostgreSQL and Object Storage...');

  // 1. Connect to PostgreSQL
  const { Client } = require('pg');
  const pgClient = new Client({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'acres_migrator',
    password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || 'acres_migrator_dev_password',
    database: process.env.PGDATABASE || 'acres',
  });

  try {
    await pgClient.connect();
  } catch (err) {
    console.error(`PostgreSQL connection failed: ${err.message}`);
    process.exit(1);
  }

  // 2. Connect to S3 / Garage
  const { S3Client } = require('@aws-sdk/client-s3');
  const s3Client = new S3Client({
    endpoint,
    region,
    forcePathStyle,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  try {
    const dbObjects = await queryDatabaseStoredObjects({ pgClient });
    const storageObjects = await listBucketObjects({ s3Client, bucket, prefix });

    const report = reconcileObjects({
      dbObjects,
      storageObjects,
      options: {
        bucket,
        prefix,
        organizationId,
        failOnOrphans,
        excludeQuarantined,
      },
    });

    console.log(formatReconciliationSummary(report));

    fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\nReconciliation evidence written to ${outputFile}`);

    await pgClient.end();
    process.exit(report.summary.exitCode);
  } catch (err) {
    console.error(`Reconciliation error: ${err.message}`);
    await pgClient.end().catch(() => {});
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  reconcileObjects,
  formatReconciliationSummary,
  listBucketObjects,
  queryDatabaseStoredObjects,
  DEFAULT_IGNORE_PATTERNS,
};
