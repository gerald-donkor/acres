const test = require('node:test');
const assert = require('node:assert');
const {
  reconcileObjects,
  formatReconciliationSummary,
  DEFAULT_IGNORE_PATTERNS,
} = require('./reconcile-storage-objects');

test('reconcileObjects: clean match with exact sizes and checksums', () => {
  const dbObjects = [
    {
      id: 'so-1',
      organizationId: 'org-1',
      bucket: 'acres-quarantine',
      objectKey: 'organizations/org-1/uploads/file-1.csv',
      byteCount: 1024n,
      checksumHex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      state: 'accepted',
      createdAt: '2026-08-01T00:00:00Z',
    },
    {
      id: 'so-2',
      organizationId: 'org-1',
      bucket: 'acres-quarantine',
      objectKey: 'organizations/org-1/exports/exp-1.csv',
      byteCount: 2048,
      checksumHex: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
      state: 'accepted',
      createdAt: '2026-08-01T00:00:00Z',
    },
  ];

  const storageObjects = [
    {
      key: 'organizations/org-1/uploads/file-1.csv',
      byteCount: 1024,
      checksumHex: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', // uppercase test
    },
    {
      key: 'organizations/org-1/exports/exp-1.csv',
      byteCount: 2048n,
      checksumHex: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
    },
  ];

  const result = reconcileObjects({ dbObjects, storageObjects });

  assert.strictEqual(result.summary.status, 'clean');
  assert.strictEqual(result.summary.exitCode, 0);
  assert.strictEqual(result.summary.matchedObjects, 2);
  assert.strictEqual(result.summary.missingObjects, 0);
  assert.strictEqual(result.summary.orphanObjects, 0);
  assert.strictEqual(result.summary.mismatchedObjects, 0);
  assert.strictEqual(result.matched.length, 2);
});

test('reconcileObjects: detects orphan storage objects (storage leak)', () => {
  const dbObjects = [
    {
      id: 'so-1',
      organizationId: 'org-1',
      bucket: 'acres-quarantine',
      objectKey: 'organizations/org-1/uploads/file-1.csv',
      byteCount: 100,
      state: 'accepted',
    },
  ];

  const storageObjects = [
    {
      key: 'organizations/org-1/uploads/file-1.csv',
      byteCount: 100,
    },
    {
      key: 'organizations/org-1/uploads/untracked-orphan.csv',
      byteCount: 500,
      lastModified: '2026-08-01T12:00:00Z',
    },
  ];

  // By default, orphans trigger a warning with exitCode 0
  const defaultResult = reconcileObjects({ dbObjects, storageObjects });
  assert.strictEqual(defaultResult.summary.status, 'warning');
  assert.strictEqual(defaultResult.summary.exitCode, 0);
  assert.strictEqual(defaultResult.summary.orphanObjects, 1);
  assert.strictEqual(defaultResult.orphans[0].key, 'organizations/org-1/uploads/untracked-orphan.csv');

  // With failOnOrphans: true, triggers exitCode 1
  const strictResult = reconcileObjects({ dbObjects, storageObjects, options: { failOnOrphans: true } });
  assert.strictEqual(strictResult.summary.status, 'warning');
  assert.strictEqual(strictResult.summary.exitCode, 1);
  assert.strictEqual(strictResult.summary.orphanObjects, 1);
});

test('reconcileObjects: detects missing storage objects (data loss)', () => {
  const dbObjects = [
    {
      id: 'so-1',
      organizationId: 'org-1',
      bucket: 'acres-quarantine',
      objectKey: 'organizations/org-1/uploads/active-file.csv',
      byteCount: 1000,
      state: 'accepted',
    },
    {
      id: 'so-2',
      organizationId: 'org-1',
      bucket: 'acres-quarantine',
      objectKey: 'organizations/org-1/uploads/missing-file.csv',
      byteCount: 2000,
      state: 'accepted',
    },
  ];

  const storageObjects = [
    {
      key: 'organizations/org-1/uploads/active-file.csv',
      byteCount: 1000,
    },
  ];

  const result = reconcileObjects({ dbObjects, storageObjects });
  assert.strictEqual(result.summary.status, 'error');
  assert.strictEqual(result.summary.exitCode, 1);
  assert.strictEqual(result.summary.matchedObjects, 1);
  assert.strictEqual(result.summary.missingObjects, 1);
  assert.strictEqual(result.missing[0].objectKey, 'organizations/org-1/uploads/missing-file.csv');
});

test('reconcileObjects: detects byte size and checksum mismatches', () => {
  const dbObjects = [
    {
      id: 'so-1',
      organizationId: 'org-1',
      bucket: 'acres-quarantine',
      objectKey: 'organizations/org-1/uploads/corrupted-size.csv',
      byteCount: 1000n,
      checksumHex: 'aaaabbbbcccc',
      state: 'accepted',
    },
    {
      id: 'so-2',
      organizationId: 'org-1',
      bucket: 'acres-quarantine',
      objectKey: 'organizations/org-1/uploads/corrupted-checksum.csv',
      byteCount: 500n,
      checksumHex: '111122223333',
      state: 'accepted',
    },
  ];

  const storageObjects = [
    {
      key: 'organizations/org-1/uploads/corrupted-size.csv',
      byteCount: 999n, // size mismatch
      checksumHex: 'aaaabbbbcccc',
    },
    {
      key: 'organizations/org-1/uploads/corrupted-checksum.csv',
      byteCount: 500n,
      checksumHex: '999988887777', // checksum mismatch
    },
  ];

  const result = reconcileObjects({ dbObjects, storageObjects });
  assert.strictEqual(result.summary.status, 'error');
  assert.strictEqual(result.summary.exitCode, 1);
  assert.strictEqual(result.summary.mismatchedObjects, 2);

  const sizeMismatch = result.mismatches.find((m) => m.objectKey.includes('corrupted-size'));
  assert.ok(sizeMismatch.issues.some((i) => i.includes('size_mismatch')));

  const checksumMismatch = result.mismatches.find((m) => m.objectKey.includes('corrupted-checksum'));
  assert.ok(checksumMismatch.issues.some((i) => i.includes('checksum_mismatch')));
});

test('reconcileObjects: excludes pending, soft-deleted, and expired uploads', () => {
  const dbObjects = [
    {
      id: 'so-pending',
      organizationId: 'org-1',
      bucket: 'acres-quarantine',
      objectKey: 'organizations/org-1/uploads/pending.csv',
      state: 'pending_upload',
      uploadState: 'pending_upload',
    },
    {
      id: 'so-deleted',
      organizationId: 'org-1',
      bucket: 'acres-quarantine',
      objectKey: 'organizations/org-1/uploads/deleted.csv',
      state: 'deleted',
      deletedAt: '2026-08-01T00:00:00Z',
    },
    {
      id: 'so-expired',
      organizationId: 'org-1',
      bucket: 'acres-quarantine',
      objectKey: 'organizations/org-1/uploads/expired.csv',
      state: 'pending_upload',
      uploadState: 'expired',
    },
    {
      id: 'so-accepted',
      organizationId: 'org-1',
      bucket: 'acres-quarantine',
      objectKey: 'organizations/org-1/uploads/accepted.csv',
      state: 'accepted',
      byteCount: 500,
    },
  ];

  const storageObjects = [
    {
      key: 'organizations/org-1/uploads/accepted.csv',
      byteCount: 500,
    },
  ];

  const result = reconcileObjects({ dbObjects, storageObjects });
  assert.strictEqual(result.summary.status, 'clean');
  assert.strictEqual(result.summary.exitCode, 0);
  assert.strictEqual(result.summary.pendingOrDeletedExcluded, 3);
  assert.strictEqual(result.summary.activeDatabaseObjects, 1);
  assert.strictEqual(result.summary.missingObjects, 0);
  assert.strictEqual(result.summary.matchedObjects, 1);
});

test('reconcileObjects: handles quarantine retention window', () => {
  const now = new Date('2026-08-10T12:00:00Z');

  const dbObjects = [
    {
      id: 'so-recent-quarantine',
      organizationId: 'org-1',
      bucket: 'acres-quarantine',
      objectKey: 'organizations/org-1/uploads/recent-quarantine.csv',
      state: 'quarantined',
      createdAt: '2026-08-08T12:00:00Z', // 2 days old (within 7 days)
    },
    {
      id: 'so-old-quarantine',
      organizationId: 'org-1',
      bucket: 'acres-quarantine',
      objectKey: 'organizations/org-1/uploads/old-quarantine.csv',
      state: 'quarantined',
      createdAt: '2026-07-01T12:00:00Z', // 40 days old (outside 7 days)
    },
  ];

  // If storage is empty, recent quarantine within window is excluded; old quarantine is active and flagged missing
  const result = reconcileObjects({
    dbObjects,
    storageObjects: [],
    options: { now, quarantineRetentionDays: 7 },
  });

  assert.strictEqual(result.summary.pendingOrDeletedExcluded, 1); // recent excluded
  assert.strictEqual(result.summary.activeDatabaseObjects, 1); // old active
  assert.strictEqual(result.summary.missingObjects, 1);
  assert.strictEqual(result.missing[0].objectKey, 'organizations/org-1/uploads/old-quarantine.csv');
});

test('reconcileObjects: filters by organizationId and key prefix', () => {
  const dbObjects = [
    {
      id: 'so-org1',
      organizationId: 'org-1',
      bucket: 'acres-quarantine',
      objectKey: 'organizations/org-1/uploads/file.csv',
      state: 'accepted',
      byteCount: 100,
    },
    {
      id: 'so-org2',
      organizationId: 'org-2',
      bucket: 'acres-quarantine',
      objectKey: 'organizations/org-2/uploads/file.csv',
      state: 'accepted',
      byteCount: 200,
    },
  ];

  const storageObjects = [
    {
      key: 'organizations/org-1/uploads/file.csv',
      byteCount: 100,
    },
    {
      key: 'organizations/org-2/uploads/file.csv',
      byteCount: 200,
    },
  ];

  // Scoped to org-1
  const org1Result = reconcileObjects({
    dbObjects,
    storageObjects,
    options: { organizationId: 'org-1' },
  });
  assert.strictEqual(org1Result.summary.activeDatabaseObjects, 1);
  assert.strictEqual(org1Result.summary.matchedObjects, 1);
  assert.strictEqual(org1Result.matched[0].id, 'so-org1');

  // Scoped to prefix
  const prefixResult = reconcileObjects({
    dbObjects,
    storageObjects,
    options: { prefix: 'organizations/org-2' },
  });
  assert.strictEqual(prefixResult.summary.activeDatabaseObjects, 1);
  assert.strictEqual(prefixResult.summary.matchedObjects, 1);
  assert.strictEqual(prefixResult.matched[0].id, 'so-org2');
});

test('reconcileObjects: ignores internal operational markers like .acres-readiness', () => {
  const dbObjects = [];
  const storageObjects = [
    { key: '.acres-readiness', byteCount: 0 },
    { key: '.keep', byteCount: 0 },
  ];

  const result = reconcileObjects({ dbObjects, storageObjects });
  assert.strictEqual(result.summary.totalBucketObjects, 0);
  assert.strictEqual(result.summary.orphanObjects, 0);
  assert.strictEqual(result.summary.status, 'clean');
});

test('reconcileObjects: filters by bucket name', () => {
  const dbObjects = [
    {
      id: 'so-bucket-a',
      organizationId: 'org-1',
      bucket: 'bucket-a',
      objectKey: 'organizations/org-1/uploads/file-a.csv',
      state: 'accepted',
      byteCount: 100,
    },
    {
      id: 'so-bucket-b',
      organizationId: 'org-1',
      bucket: 'bucket-b',
      objectKey: 'organizations/org-1/uploads/file-b.csv',
      state: 'accepted',
      byteCount: 200,
    },
  ];

  const storageObjects = [
    {
      key: 'organizations/org-1/uploads/file-a.csv',
      byteCount: 100,
    },
  ];

  // When scoped to bucket-a, bucket-b record is ignored and does not trigger missing error
  const result = reconcileObjects({
    dbObjects,
    storageObjects,
    options: { bucket: 'bucket-a' },
  });

  assert.strictEqual(result.summary.status, 'clean');
  assert.strictEqual(result.summary.activeDatabaseObjects, 1);
  assert.strictEqual(result.summary.matchedObjects, 1);
  assert.strictEqual(result.summary.missingObjects, 0);
  assert.strictEqual(result.matched[0].id, 'so-bucket-a');
});

test('formatReconciliationSummary: produces human-readable text without errors', () => {
  const sampleReport = {
    timestamp: '2026-09-09T10:00:00.000Z',
    summary: {
      totalDatabaseObjects: 10,
      activeDatabaseObjects: 8,
      pendingOrDeletedExcluded: 2,
      totalBucketObjects: 8,
      matchedObjects: 7,
      missingObjects: 1,
      orphanObjects: 1,
      mismatchedObjects: 1,
      status: 'error',
      exitCode: 1,
    },
    matched: [{ id: '1', objectKey: 'key1' }],
    missing: [{ id: '2', objectKey: 'missingKey', organizationId: 'org-1', state: 'accepted' }],
    orphans: [{ key: 'orphanKey', byteCount: '500' }],
    mismatches: [{ id: '3', objectKey: 'mismatchKey', issues: ['size_mismatch'] }],
  };

  const formatted = formatReconciliationSummary(sampleReport);
  assert.ok(formatted.includes('Acres Storage Reconciliation Report'));
  assert.ok(formatted.includes('CRITICAL ERROR'));
  assert.ok(formatted.includes('missingKey'));
  assert.ok(formatted.includes('orphanKey'));
  assert.ok(formatted.includes('mismatchKey'));
});
