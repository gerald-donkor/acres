const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  reconcileObjects,
  listBucketObjects,
  queryDatabaseStoredObjects,
  formatReconciliationSummary,
  DEFAULT_IGNORE_PATTERNS,
  ReconcileUsageError,
  parseCliArguments,
  publishReceipt,
  main,
} = require('./reconcile-storage-objects');

const inventoryDbRecord = (overrides = {}) => ({
  id: 'fixture-id',
  organizationId: 'fixture-org',
  bucket: 'acres-quarantine',
  objectKey: 'fixture-key',
  state: 'accepted',
  byteCount: 1,
  ...overrides,
});

const inventoryError = /^(Database|Storage) inventory is invalid$/;

for (const side of ['dbObjects', 'storageObjects']) {
  for (const [label, value] of [
    ['null', null],
    ['false', false],
    ['object', {}],
    ['text', 'private-inventory'],
    ['hole', new Array(1)],
    ['null row', [null]],
    ['array row', [[]]],
    ['primitive row', ['private-row']],
    ['empty row', [{}]],
  ]) {
    test(`reconcileObjects: rejects ${side} ${label}`, () => {
      assert.throws(() => reconcileObjects({ [side]: value }), {
        message: inventoryError,
      });
    });
  }
  for (const value of [
    -1,
    -1n,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    true,
    '',
    ' ',
    '0x10',
    '1e2',
    '+1',
    '-1',
    '1.0',
    {},
    [],
  ]) {
    test(`reconcileObjects: rejects ${side} count ${String(value)} (${typeof value})`, () => {
      const row =
        side === 'dbObjects'
          ? inventoryDbRecord({ byteCount: value })
          : { key: 'fixture-key', byteCount: value };
      assert.throws(() => reconcileObjects({ [side]: [row] }), {
        message: inventoryError,
      });
    });
  }
}

for (const field of ['id', 'organizationId', 'bucket', 'objectKey']) {
  for (const value of [undefined, null, '', 5]) {
    test(`reconcileObjects: rejects invalid DB ${field} ${String(value)}`, () => {
      assert.throws(
        () =>
          reconcileObjects({
            dbObjects: [inventoryDbRecord({ [field]: value })],
          }),
        { message: inventoryError },
      );
    });
  }
}

for (const value of [undefined, null, '', 5]) {
  test(`reconcileObjects: rejects invalid storage key ${String(value)}`, () => {
    assert.throws(
      () => reconcileObjects({ storageObjects: [{ key: value }] }),
      { message: inventoryError },
    );
  });
}

test('reconcileObjects: duplicate identities reject before exclusions or overwrites', () => {
  assert.throws(
    () =>
      reconcileObjects({
        dbObjects: [
          inventoryDbRecord(),
          inventoryDbRecord({ objectKey: 'different', state: 'deleted' }),
        ],
        options: { bucket: 'different-bucket' },
      }),
    { message: inventoryError },
  );
  for (const byteCount of [1, 99]) {
    assert.throws(
      () =>
        reconcileObjects({
          dbObjects: [inventoryDbRecord()],
          storageObjects: [
            { key: 'fixture-key', byteCount },
            { key: 'fixture-key', byteCount: 1 },
          ],
        }),
      { message: inventoryError },
    );
  }
  assert.throws(
    () =>
      reconcileObjects({
        storageObjects: [{ key: '.keep' }, { key: '.keep' }],
      }),
    { message: inventoryError },
  );
});

test('reconcileObjects: malformed data cannot hide behind valid filters', () => {
  assert.throws(
    () =>
      reconcileObjects({
        dbObjects: [inventoryDbRecord({ bucket: 'other', byteCount: false })],
        options: { bucket: 'acres-quarantine' },
      }),
    { message: inventoryError },
  );
  assert.throws(
    () =>
      reconcileObjects({
        storageObjects: [{ key: '.keep', byteCount: 'private-count' }],
      }),
    { message: inventoryError },
  );
});

test('reconcileObjects: preserves empty defaults, exact counts, opaque keys and inputs', () => {
  assert.strictEqual(reconcileObjects({}).summary.status, 'clean');
  for (const byteCount of [
    undefined,
    null,
    0,
    0n,
    '0',
    '0001',
    '900719925474099312345',
    900719925474099312345n,
  ]) {
    const db = Object.freeze(
      inventoryDbRecord({ objectKey: ' key with spaces ', byteCount }),
    );
    const storage = Object.freeze({ key: db.objectKey, byteCount });
    const result = reconcileObjects({
      dbObjects: Object.freeze([db]),
      storageObjects: Object.freeze([storage]),
    });
    assert.strictEqual(result.summary.status, 'clean');
    assert.strictEqual(result.matched[0].objectKey, db.objectKey);
    assert.strictEqual(
      result.matched[0].byteCount,
      byteCount == null ? null : String(BigInt(byteCount)),
    );
  }
});

for (const result of [
  null,
  [],
  {},
  { rows: null },
  { rows: {} },
  { rows: [null] },
  { rows: [{}] },
  { rows: [inventoryDbRecord({ byteCount: true })] },
]) {
  test(`queryDatabaseStoredObjects: rejects malformed result ${JSON.stringify(result)}`, async () => {
    await assert.rejects(
      queryDatabaseStoredObjects({ pgClient: { query: async () => result } }),
      { message: inventoryError },
    );
  });
}

test('queryDatabaseStoredObjects: preserves fields and normalizes only defined counts', async () => {
  const rows = [undefined, null, '0001', '900719925474099312345'].map(
    (byteCount, i) =>
      Object.freeze(
        inventoryDbRecord({ id: `id-${i}`, byteCount, extra: 'preserved' }),
      ),
  );
  const result = await queryDatabaseStoredObjects({
    pgClient: { query: async () => ({ rows: Object.freeze(rows) }) },
  });
  assert.deepStrictEqual(
    result.map((row) => row.byteCount),
    [null, null, 1n, 900719925474099312345n],
  );
  assert.ok(result.every((row) => row.extra === 'preserved'));
  assert.deepStrictEqual(
    rows.map((row) => row.byteCount),
    [undefined, null, '0001', '900719925474099312345'],
  );
});

for (const [label, injected, expectedError] of [
  [
    'invalid DB',
    { dbObjects: [inventoryDbRecord(), {}], storageObjects: [] },
    'Error: Reconciliation execution failed',
  ],
  [
    'invalid storage',
    {
      dbObjects: [],
      storageObjects: [{ key: 'private-inventory', byteCount: true }],
    },
    'Error: Reconciliation execution failed',
  ],
  [
    'null DB',
    { dbObjects: null, storageObjects: [] },
    'Error: Reconciliation execution failed',
  ],
  [
    'null DB with other source omitted',
    { dbObjects: null },
    'Error: Reconciliation execution failed',
  ],
  [
    'false storage with other source omitted',
    { storageObjects: false },
    'Error: Reconciliation execution failed',
  ],
  [
    'false storage',
    { dbObjects: [], storageObjects: false },
    'Error: Reconciliation execution failed',
  ],
  [
    'null storage',
    { dbObjects: [], storageObjects: null },
    'Error: Reconciliation execution failed',
  ],
  [
    'malformed pg',
    {
      pgClient: { query: async () => ({ rows: [inventoryDbRecord(), {}] }) },
      storageObjects: [],
    },
    'Error: Database query failed',
  ],
  [
    'rejected pg',
    {
      pgClient: {
        query: async () => {
          throw new Error('private-provider');
        },
      },
      storageObjects: [],
    },
    'Error: Database query failed',
  ],
]) {
  test(`main: ${label} never publishes successful inventory evidence`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-invalid-inventory-'),
    );
    const io = createIo();
    try {
      const code = await main(
        [
          'node',
          'script',
          '--dry-run',
          '--output',
          path.join(dir, 'receipt.json'),
        ],
        io,
        {
          env: {},
          ...injected,
          s3Client: {
            send: async () => {
              throw new Error('private-unexpected-acquisition');
            },
          },
        },
      );
      assert.strictEqual(code, 1);
      assert.deepStrictEqual(io.errors, [expectedError]);
      assert.ok(!io.logs.join('\n').includes('Reconciliation Report'));
      assert.ok(!io.logs.join('\n').includes('evidence written'));
      assert.ok(![...io.logs, ...io.errors].join('\n').includes('private-'));
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('main: valid pg inventory writes unchanged simulation receipt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-valid-inventory-'));
  const io = createIo();
  try {
    const target = path.join(dir, 'receipt.json');
    const code = await main(
      ['node', 'script', '--dry-run', '--output', target],
      io,
      {
        env: {},
        pgClient: {
          query: async () => ({
            rows: [inventoryDbRecord({ byteCount: '0001' })],
          }),
        },
        storageObjects: [{ key: 'fixture-key', byteCount: 1 }],
      },
    );
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(io.errors, []);
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.matched[0].byteCount, '1');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('publishReceipt: unsupported hard links fail without a rename fallback', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-no-rename-'));
  const target = path.join(dir, 'receipt.json');
  try {
    t.mock.method(fs, 'linkSync', () => {
      throw Object.assign(new Error('private filesystem diagnostic'), {
        code: 'EPERM',
      });
    });
    assert.throws(() => publishReceipt(target, { probe: true }));
    assert.strictEqual(fs.existsSync(target), false);
    assert.deepStrictEqual(fs.readdirSync(dir), []);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('publishReceipt: post-link cleanup failure preserves receipt and fails', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-cleanup-'));
  const target = path.join(dir, 'receipt.json');
  try {
    t.mock.method(fs, 'unlinkSync', () => {
      throw Object.assign(new Error('private cleanup diagnostic'), {
        code: 'EIO',
      });
    });
    assert.throws(() => publishReceipt(target, { probe: true }));
    assert.strictEqual(
      fs.readFileSync(target, 'utf8'),
      '{\n  "probe": true\n}\n',
    );
  } finally {
    t.mock.restoreAll();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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

  assert.strictEqual(result.execution_mode, 'simulation');
  assert.strictEqual(result.drill_type, 'storage_reconciliation');
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

function createIo() {
  return {
    logs: [],
    errors: [],
    log(...args) {
      this.logs.push(args.join(' '));
    },
    error(...args) {
      this.errors.push(args.join(' '));
    },
    reset() {
      this.logs = [];
      this.errors = [];
    },
  };
}

test('ReconcileUsageError: is instance of Error', () => {
  const err = new ReconcileUsageError('test error');
  assert.ok(err instanceof Error);
  assert.strictEqual(err.message, 'test error');
});

test('parseCliArguments: accepts valid space-separated and attached options', () => {
  const parsed = parseCliArguments([
    '--output', 'out.json',
    '--bucket', 'custom-bucket',
    '--endpoint', 'http://storage.internal:9000',
    '--region', 'us-east-1',
    '--access-key', 'key123',
    '--secret-key', 'secret456',
    '--prefix', 'org-1/',
    '--organization-id', 'org-1',
    '--fail-on-orphans',
    '--exclude-quarantined',
    '--no-force-path-style',
    '--dry-run',
  ], '/test/cwd');

  assert.strictEqual(parsed.showHelp, false);
  assert.strictEqual(parsed.cwd, '/test/cwd');
  assert.strictEqual(parsed.output, '/test/cwd/out.json');
  assert.strictEqual(parsed.bucket, 'custom-bucket');
  assert.strictEqual(parsed.endpoint, 'http://storage.internal:9000');
  assert.strictEqual(parsed.region, 'us-east-1');
  assert.strictEqual(parsed.accessKey, 'key123');
  assert.strictEqual(parsed.secretKey, 'secret456');
  assert.strictEqual(parsed.prefix, 'org-1/');
  assert.strictEqual(parsed.organizationId, 'org-1');
  assert.strictEqual(parsed.failOnOrphans, true);
  assert.strictEqual(parsed.excludeQuarantined, true);
  assert.strictEqual(parsed.forcePathStyle, false);
  assert.strictEqual(parsed.dryRun, true);
});

test('parseCliArguments: accepts attached syntax and short options', () => {
  const parsed = parseCliArguments([
    '-o=receipt.json',
    '--bucket=attached-bucket',
    '--endpoint=http://attached:9000',
    '--region=attached-region',
    '--access-key=attached-key',
    '--secret-key=attached-secret',
    '--prefix=attached-prefix/',
    '--organization-id=attached-org',
    '--cwd=sub/dir',
  ], '/base/cwd');

  assert.strictEqual(parsed.cwd, '/base/cwd/sub/dir');
  assert.strictEqual(parsed.output, '/base/cwd/sub/dir/receipt.json');
  assert.strictEqual(parsed.bucket, 'attached-bucket');
  assert.strictEqual(parsed.endpoint, 'http://attached:9000');
  assert.strictEqual(parsed.region, 'attached-region');
  assert.strictEqual(parsed.accessKey, 'attached-key');
  assert.strictEqual(parsed.secretKey, 'attached-secret');
  assert.strictEqual(parsed.prefix, 'attached-prefix/');
  assert.strictEqual(parsed.organizationId, 'attached-org');
});

test('parseCliArguments: flags --help and -h return showHelp: true', () => {
  assert.strictEqual(parseCliArguments(['--help']).showHelp, true);
  assert.strictEqual(parseCliArguments(['-h']).showHelp, true);
});

test('parseCliArguments: rejects invalid argv and cwd', () => {
  assert.throws(() => parseCliArguments('not-an-array'), /arguments must be an array of strings/);
  assert.throws(() => parseCliArguments([123]), /arguments must be an array of strings/);
  assert.throws(() => parseCliArguments([], ''), /cwd requires a non-empty path/);
  assert.throws(() => parseCliArguments([], '   '), /cwd requires a non-empty path/);
  assert.throws(() => parseCliArguments([], 123), /cwd requires a non-empty path/);
});

test('parseCliArguments: rejects unknown options and positional arguments', () => {
  assert.throws(() => parseCliArguments(['--bogus-flag']), /unsupported option or positional argument$/);
  assert.throws(() => parseCliArguments(['extra-positional']), /unsupported option or positional argument$/);
});

test('parseCliArguments: rejects missing, empty, or dash-prefixed values', () => {
  // Trailing flags missing values
  assert.throws(() => parseCliArguments(['--output']), /output requires a non-empty file path/);
  assert.throws(() => parseCliArguments(['-o']), /output requires a non-empty file path/);
  assert.throws(() => parseCliArguments(['--bucket']), /bucket requires a non-empty bucket name/);
  assert.throws(() => parseCliArguments(['--endpoint']), /endpoint requires a non-empty endpoint URL/);
  assert.throws(() => parseCliArguments(['--region']), /region requires a non-empty region name/);
  assert.throws(() => parseCliArguments(['--access-key']), /access-key requires a non-empty key ID/);
  assert.throws(() => parseCliArguments(['--secret-key']), /secret-key requires a non-empty secret key/);
  assert.throws(() => parseCliArguments(['--prefix']), /prefix requires a non-empty key prefix/);
  assert.throws(() => parseCliArguments(['--organization-id']), /organization-id requires a non-empty organization ID/);
  assert.throws(() => parseCliArguments(['--cwd']), /cwd requires a non-empty directory path/);

  // Dash-prefixed values (space-separated and attached)
  assert.throws(() => parseCliArguments(['--output', '-b']), /output requires a non-empty file path/);
  assert.throws(() => parseCliArguments(['--output=-b']), /output requires a non-empty file path/);
  assert.throws(() => parseCliArguments(['-o=-b']), /output requires a non-empty file path/);
  assert.throws(() => parseCliArguments(['--bucket', '--endpoint']), /bucket requires a non-empty bucket name/);
  assert.throws(() => parseCliArguments(['--bucket=-endpoint']), /bucket requires a non-empty bucket name/);
  assert.throws(() => parseCliArguments(['--cwd', '-x']), /cwd requires a non-empty directory path/);
  assert.throws(() => parseCliArguments(['--cwd=-x']), /cwd requires a non-empty directory path/);

  // Empty attached values
  assert.throws(() => parseCliArguments(['--output=']), /output requires a non-empty file path/);
  assert.throws(() => parseCliArguments(['-o=']), /output requires a non-empty file path/);
  assert.throws(() => parseCliArguments(['--bucket=   ']), /bucket requires a non-empty bucket name/);
});

test('parseCliArguments: rejects mutually exclusive force-path-style flags', () => {
  assert.throws(
    () => parseCliArguments(['--force-path-style', '--no-force-path-style']),
    /cannot specify both --force-path-style and --no-force-path-style/
  );
});

test('parseCliArguments: rejects repeated options', () => {
  assert.throws(() => parseCliArguments(['--output', 'a', '--output', 'b']), /output may be specified only once/);
  assert.throws(() => parseCliArguments(['--bucket', 'a', '--bucket', 'b']), /bucket may be specified only once/);
  assert.throws(() => parseCliArguments(['--endpoint', 'a', '--endpoint', 'b']), /endpoint may be specified only once/);
  assert.throws(() => parseCliArguments(['--region', 'a', '--region', 'b']), /region may be specified only once/);
  assert.throws(() => parseCliArguments(['--access-key', 'a', '--access-key', 'b']), /access-key may be specified only once/);
  assert.throws(() => parseCliArguments(['--secret-key', 'a', '--secret-key', 'b']), /secret-key may be specified only once/);
  assert.throws(() => parseCliArguments(['--prefix', 'a', '--prefix', 'b']), /prefix may be specified only once/);
  assert.throws(() => parseCliArguments(['--organization-id', 'a', '--organization-id', 'b']), /organization-id may be specified only once/);
  assert.throws(() => parseCliArguments(['--cwd', 'a', '--cwd', 'b']), /cwd may be specified only once/);
  assert.throws(() => parseCliArguments(['--fail-on-orphans', '--fail-on-orphans']), /fail-on-orphans may be specified only once/);
  assert.throws(() => parseCliArguments(['--exclude-quarantined', '--exclude-quarantined']), /exclude-quarantined may be specified only once/);
  assert.throws(() => parseCliArguments(['--no-force-path-style', '--no-force-path-style']), /no-force-path-style may be specified only once/);
  assert.throws(() => parseCliArguments(['--force-path-style', '--force-path-style']), /force-path-style may be specified only once/);
  assert.throws(() => parseCliArguments(['--dry-run', '--dry-run']), /dry-run may be specified only once/);
});

test('publishReceipt: writes report atomically to absent destination and rejects overwrites', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-reconcile-test-'));
  try {
    const target = path.join(tmpDir, 'receipt.json');
    const report = { timestamp: '2026-10-11T00:00:00.000Z', summary: { status: 'clean', exitCode: 0 } };

    // 1. Initial publication succeeds
    publishReceipt(target, report);
    assert.ok(fs.existsSync(target));
    const content = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.deepStrictEqual(content, report);

    const stat = fs.statSync(target);
    assert.strictEqual(stat.isFile(), true);

    // 2. Refuses to overwrite existing file
    assert.throws(
      () => publishReceipt(target, report),
      /output file already exists/
    );

    // 3. Refuses when target is a symlink
    const symlinkTarget = path.join(tmpDir, 'symlink-receipt.json');
    fs.symlinkSync(target, symlinkTarget);
    assert.throws(
      () => publishReceipt(symlinkTarget, report),
      /output file already exists/
    );

    // 4. Refuses when parent directory does not exist
    const nonExistentTarget = path.join(tmpDir, 'absent-subdir', 'receipt.json');
    assert.throws(
      () => publishReceipt(nonExistentTarget, report),
      /parent directory does not exist/
    );

    // 5. Refuses when parent path is a regular file
    const fileAsParentTarget = path.join(target, 'nested.json');
    assert.throws(
      () => publishReceipt(fileAsParentTarget, report),
      /parent path is not a directory/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('publishReceipt: cleans up temporary file on failure', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-reconcile-clean-'));
  try {
    const target = path.join(tmpDir, 'fail-receipt.json');
    const circular = {};
    circular.self = circular;

    assert.throws(() => publishReceipt(target, circular));

    // Ensure no leftover temporary files in directory
    const files = fs.readdirSync(tmpDir);
    const tmpFiles = files.filter((f) => f.startsWith('.reconcile-'));
    assert.strictEqual(tmpFiles.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('main: --help prints usage and exits cleanly with 0', async () => {
  const io = createIo();
  const code = await main(['node', 'script.js', '--help'], io, { exitOnError: false });
  assert.strictEqual(code, 0);
  assert.ok(io.logs.some((l) => l.includes('Usage: node scripts/ops/reconcile-storage-objects.js')));
});

test('main: usage error logs message and usage text and returns 1', async () => {
  const io = createIo();
  const code = await main(['node', 'script.js', '--invalid-arg'], io, { exitOnError: false });
  assert.strictEqual(code, 1);
  assert.ok(io.errors.some((e) => e.includes('reconciliation usage error')));
  assert.ok(io.logs.some((l) => l.includes('Usage: node scripts/ops/reconcile-storage-objects.js')));
});

test('main: missing PostgreSQL password logs sanitized error and returns 1', async () => {
  const io = createIo();
  const code = await main(['node', 'script.js'], io, {
    exitOnError: false,
    env: { PGPASSWORD: '', POSTGRES_PASSWORD: '', ACRES_MIGRATOR_PASSWORD: '' },
  });
  assert.strictEqual(code, 1);
  assert.ok(io.errors.some((e) => e.includes('PostgreSQL password is required')));
});

test('main: sanitized error when PostgreSQL connection fails', async () => {
  const io = createIo();
  const failingPgClient = {
    connect: async () => {
      throw new Error('connect ECONNREFUSED postgres://user:secretpassword@internal-host:5432/acres');
    },
    end: async () => {},
  };
  const code = await main(['node', 'script.js'], io, {
    exitOnError: false,
    pgClient: failingPgClient,
    env: {},
  });
  assert.strictEqual(code, 1);
  assert.ok(io.errors.some((e) => e.includes('PostgreSQL connection failed')));
  assert.ok(!io.errors.some((e) => e.includes('secretpassword')));
});

test('main: sanitized error when storage listing fails', async () => {
  const io = createIo();
  const failingS3Client = {
    send: async () => {
      throw new Error('AccessDenied: secret-credentials invalid for https://garage.secret.net');
    },
  };
  const code = await main(['node', 'script.js'], io, {
    exitOnError: false,
    dbObjects: [],
    s3Client: failingS3Client,
  });
  assert.strictEqual(code, 1);
  assert.ok(io.errors.some((e) => e.includes('Object storage connection or listing failed')));
  assert.ok(!io.errors.some((e) => e.includes('secret-credentials')));
});

test('main: clean run with injected mock objects returns 0 and formats summary', async () => {
  const io = createIo();
  const dbObjects = [
    {
      id: 'so-1',
      organizationId: 'org-1',
      bucket: 'acres-quarantine',
      objectKey: 'file.csv',
      byteCount: 100,
      state: 'accepted',
    },
  ];
  const storageObjects = [
    {
      key: 'file.csv',
      byteCount: 100,
    },
  ];

  const code = await main(['node', 'script.js'], io, {
    exitOnError: false,
    dbObjects,
    storageObjects,
  });

  assert.strictEqual(code, 0);
  assert.ok(io.logs.some((l) => l.includes('Acres Storage Reconciliation Report')));
  assert.ok(io.logs.some((l) => l.includes('Reconciliation Status:     CLEAN')));
});

test('main: publishes receipt exclusively when --output is provided', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-main-out-'));
  try {
    const target = path.join(tmpDir, 'evidence-receipt.json');
    const io = createIo();
    const dbObjects = [
      {
        id: 'so-1',
        organizationId: 'org-1',
        bucket: 'acres-quarantine',
        objectKey: 'file.csv',
        byteCount: 100,
        state: 'accepted',
      },
    ];
    const storageObjects = [
      {
        key: 'file.csv',
        byteCount: 100,
      },
    ];

    const code = await main(['node', 'script.js', '--output', target], io, {
      exitOnError: false,
      dbObjects,
      storageObjects,
    });

    assert.strictEqual(code, 0);
    assert.ok(fs.existsSync(target));
    const receipt = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(receipt.summary.status, 'clean');
    assert.strictEqual(receipt.summary.matchedObjects, 1);
    assert.ok(io.logs.some((l) => l.includes(`Reconciliation evidence written to ${target}`)));

    // Second run fails to overwrite existing evidence
    io.reset();
    const failCode = await main(['node', 'script.js', '--output', target], io, {
      exitOnError: false,
      dbObjects,
      storageObjects,
    });
    assert.strictEqual(failCode, 1);
    assert.ok(io.errors.some((e) => e.includes('output file already exists')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Fault injection is scoped and synchronous; no global filesystem mock survives a test.
function publicationFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-receipt-safety-'));
  t.after(() => {
    t.mock.restoreAll();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    dir,
    target: path.join(dir, 'receipt.json'),
    report: { evidence: 'complete' },
  };
}
const privateFsError = (code = 'EIO') =>
  Object.assign(
    new Error(
      'parent directory PRIVATE_PATH postgres://private:PRIVATE_SECRET@host',
    ),
    { code },
  );

test('publishReceipt: fresh receipt is exact, private and leaves no staging file', (t) => {
  const { dir, target, report } = publicationFixture(t);
  publishReceipt(target, report);
  assert.strictEqual(
    fs.readFileSync(target, 'utf8'),
    JSON.stringify(report, null, 2) + '\n',
  );
  assert.strictEqual(fs.statSync(target).mode & 0o777, 0o600);
  assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
});

for (const kind of ['file', 'directory', 'symlink', 'dangling symlink']) {
  test(`publishReceipt: preserves existing ${kind}`, (t) => {
    const { dir, target, report } = publicationFixture(t);
    const referent = path.join(dir, 'retained');
    fs.writeFileSync(referent, 'retained evidence');
    if (kind === 'file') fs.writeFileSync(target, 'competing evidence');
    if (kind === 'directory') fs.mkdirSync(target);
    if (kind === 'symlink') fs.symlinkSync(referent, target);
    if (kind === 'dangling symlink')
      fs.symlinkSync(path.join(dir, 'absent'), target);
    const before = fs.lstatSync(target);
    assert.throws(
      () => publishReceipt(target, report),
      /output file already exists/,
    );
    assert.strictEqual(fs.lstatSync(target).ino, before.ino);
    assert.strictEqual(fs.readFileSync(referent, 'utf8'), 'retained evidence');
    if (kind === 'file')
      assert.strictEqual(fs.readFileSync(target, 'utf8'), 'competing evidence');
  });
}

for (const kind of ['file', 'symlink']) {
  test(`publishReceipt: competing ${kind} at link time is never overwritten`, (t) => {
    const { dir, target, report } = publicationFixture(t);
    const link = fs.linkSync;
    const referent = path.join(dir, 'retained');
    fs.writeFileSync(referent, 'retained evidence');
    t.mock.method(fs, 'linkSync', (from, to) => {
      if (kind === 'file')
        fs.writeFileSync(to, 'competing evidence', { flag: 'wx' });
      else fs.symlinkSync(referent, to);
      return link(from, to);
    });
    assert.throws(
      () => publishReceipt(target, report),
      /output file already exists/,
    );
    assert.strictEqual(
      fs.readFileSync(target, 'utf8'),
      kind === 'file' ? 'competing evidence' : 'retained evidence',
    );
    assert.ok(
      !fs.readdirSync(dir).some((file) => file.startsWith('.reconcile-')),
    );
  });
}

for (const code of ['EPERM', 'ENOSYS', 'EXDEV', 'EIO']) {
  test(`publishReceipt: ${code} cannot trigger rename or copy`, (t) => {
    const { dir, target, report } = publicationFixture(t);
    const rename = t.mock.method(fs, 'renameSync', () =>
      assert.fail('unsafe rename'),
    );
    const copy = t.mock.method(fs, 'copyFileSync', () =>
      assert.fail('unsafe copy'),
    );
    t.mock.method(fs, 'linkSync', () => {
      throw privateFsError(code);
    });
    assert.throws(() => publishReceipt(target, report), {
      message: 'receipt publication failed',
    });
    assert.strictEqual(rename.mock.callCount(), 0);
    assert.strictEqual(copy.mock.callCount(), 0);
    assert.strictEqual(fs.existsSync(target), false);
    assert.deepStrictEqual(fs.readdirSync(dir), []);
  });
}

test('publishReceipt: rejects symlink parents and ancestors', (t) => {
  const { dir, report } = publicationFixture(t);
  const real = path.join(dir, 'real');
  fs.mkdirSync(path.join(real, 'nested'), { recursive: true });
  fs.symlinkSync(real, path.join(dir, 'alias'));
  for (const relative of ['alias/receipt.json', 'alias/nested/receipt.json']) {
    assert.throws(() => publishReceipt(path.join(dir, relative), report));
  }
  assert.deepStrictEqual(fs.readdirSync(path.join(real, 'nested')), []);
});

test('publishReceipt: parent replacement fails without deleting moved staging', (t) => {
  const { dir, report } = publicationFixture(t);
  const parent = path.join(dir, 'parent');
  const moved = path.join(dir, 'moved');
  fs.mkdirSync(parent);
  const write = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', (...args) => {
    write(...args);
    fs.renameSync(parent, moved);
    fs.mkdirSync(parent);
  });
  assert.throws(
    () => publishReceipt(path.join(parent, 'receipt.json'), report),
    /cleanup failed/,
  );
  assert.deepStrictEqual(fs.readdirSync(parent), []);
  assert.strictEqual(fs.readdirSync(moved).length, 1);
});

test('publishReceipt: staging substitution is not published or unlinked', (t) => {
  const { dir, target, report } = publicationFixture(t);
  const close = fs.closeSync;
  let swapped = false;
  t.mock.method(fs, 'closeSync', (fd) => {
    close(fd);
    if (!swapped) {
      swapped = true;
      const staged = path.join(
        dir,
        fs.readdirSync(dir).find((f) => f.startsWith('.reconcile-')),
      );
      fs.renameSync(staged, path.join(dir, 'original-staging'));
      fs.writeFileSync(staged, 'foreign evidence');
    }
  });
  assert.throws(() => publishReceipt(target, report), /cleanup failed/);
  assert.strictEqual(fs.existsSync(target), false);
  const foreign = fs.readdirSync(dir).find((f) => f.startsWith('.reconcile-'));
  assert.strictEqual(
    fs.readFileSync(path.join(dir, foreign), 'utf8'),
    'foreign evidence',
  );
});

for (const operation of ['writeFileSync', 'readSync', 'closeSync']) {
  test(`publishReceipt: transient ${operation} fault fails and cleans owned resources`, (t) => {
    const { dir, target, report } = publicationFixture(t);
    const original = fs[operation];
    let injected = false;
    t.mock.method(fs, operation, (...args) => {
      if (!injected) {
        injected = true;
        throw privateFsError();
      }
      return original(...args);
    });
    assert.throws(() => publishReceipt(target, report), {
      message: 'receipt publication failed',
    });
    assert.strictEqual(fs.existsSync(target), false);
    assert.deepStrictEqual(fs.readdirSync(dir), []);
  });
}

test('publishReceipt: serialization and control-bearing paths fail safely', (t) => {
  const { dir, target } = publicationFixture(t);
  const circular = {};
  circular.self = circular;
  assert.throws(() => publishReceipt(target, circular), {
    message: 'receipt publication failed',
  });
  for (const invalid of ['', ' ', null, 'private\npath', 'private\0path']) {
    assert.throws(() => publishReceipt(invalid, {}), /control-free/);
  }
  assert.deepStrictEqual(fs.readdirSync(dir), []);
});

test('publishReceipt: changed staged bytes are rejected', (t) => {
  const { dir, target, report } = publicationFixture(t);
  const write = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', (fd, bytes) =>
    write(fd, Buffer.alloc(bytes.length, 65)),
  );
  assert.throws(() => publishReceipt(target, report), {
    message: 'receipt publication failed',
  });
  assert.strictEqual(fs.existsSync(target), false);
  assert.deepStrictEqual(fs.readdirSync(dir), []);
});

test('publishReceipt: transient post-link cleanup failure is retried but stays failed', (t) => {
  const { dir, target, report } = publicationFixture(t);
  const unlink = fs.unlinkSync;
  let calls = 0;
  t.mock.method(fs, 'unlinkSync', (file) => {
    if (++calls === 1) throw privateFsError();
    return unlink(file);
  });
  assert.throws(() => publishReceipt(target, report), {
    message: 'receipt cleanup failed',
  });
  assert.strictEqual(calls, 2);
  assert.strictEqual(
    fs.readFileSync(target, 'utf8'),
    JSON.stringify(report, null, 2) + '\n',
  );
  assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
});

test('main: publication errors never reflect private paths or filesystem diagnostics', async (t) => {
  const { dir } = publicationFixture(t);
  const io = createIo();
  const target = path.join(dir, 'PRIVATE_PATH');
  fs.writeFileSync(target, 'retained');
  let code = await main(['node', 'script', '--output', target], io, {
    dbObjects: [],
    storageObjects: [],
  });
  assert.strictEqual(code, 1);
  assert.deepStrictEqual(io.errors, [
    'Error: Reconciliation evidence publication failed: output file already exists',
  ]);
  io.reset();
  t.mock.method(fs, 'linkSync', () => {
    throw privateFsError();
  });
  code = await main(
    ['node', 'script', '--output', path.join(dir, 'absent')],
    io,
    { dbObjects: [], storageObjects: [] },
  );
  assert.strictEqual(code, 1);
  assert.deepStrictEqual(io.errors, [
    'Error: Reconciliation evidence publication failed: receipt publication failed',
  ]);
  assert.ok(!io.errors.join(' ').includes('PRIVATE_'));
});

test('publishReceipt: exclusive staging open failure does not adopt or delete foreign staging', (t) => {
  const { dir, target, report } = publicationFixture(t);
  const open = fs.openSync;
  t.mock.method(fs, 'openSync', (file, flags, mode) => {
    if (flags & fs.constants.O_CREAT) {
      fs.writeFileSync(file, 'foreign staging', { flag: 'wx' });
      throw privateFsError('EEXIST');
    }
    return open(file, flags, mode);
  });
  assert.throws(() => publishReceipt(target, report), {
    message: 'receipt publication failed',
  });
  assert.strictEqual(fs.existsSync(target), false);
  const foreign = fs.readdirSync(dir);
  assert.strictEqual(foreign.length, 1);
  assert.strictEqual(
    fs.readFileSync(path.join(dir, foreign[0]), 'utf8'),
    'foreign staging',
  );
});

test('publishReceipt: first descriptor stat failure recovers owned cleanup', (t) => {
  const { dir, target, report } = publicationFixture(t);
  const stat = fs.fstatSync;
  let first = true;
  t.mock.method(fs, 'fstatSync', (fd) => {
    if (first) {
      first = false;
      throw privateFsError();
    }
    return stat(fd);
  });
  assert.throws(() => publishReceipt(target, report), {
    message: 'receipt publication failed',
  });
  assert.deepStrictEqual(fs.readdirSync(dir), []);
});

test('main: message substring cannot impersonate a controlled publication error', async (t) => {
  publicationFixture(t);
  const io = createIo();
  const dbObjects = [
    {
      id: 'fixture-id',
      organizationId: 'fixture-org',
      bucket: 'acres-quarantine',
      objectKey: 'fixture.csv',
      get state() {
        throw privateFsError();
      },
    },
  ];
  const code = await main(['node', 'script'], io, {
    dbObjects,
    storageObjects: [],
  });
  assert.strictEqual(code, 1);
  assert.deepStrictEqual(io.errors, ['Error: Reconciliation execution failed']);
});

// Bounded fake pagination prevents broken implementations from hanging tests.
function listingClient(pages) {
  const inputs = [];
  return {
    inputs,
    async send(command) {
      inputs.push(command.input);
      if (inputs.length > pages.length)
        throw new Error('fixture request bound');
      const page = pages[inputs.length - 1];
      if (page instanceof Error) throw page;
      return page;
    },
  };
}

for (const contents of [undefined, []]) {
  test(`listBucketObjects: terminal empty page (${contents === undefined ? 'omitted' : 'array'})`, async () => {
    const s3Client = listingClient([
      { IsTruncated: false, Contents: contents },
    ]);
    assert.deepStrictEqual(
      await listBucketObjects({ s3Client, bucket: 'fixture' }),
      [],
    );
    assert.strictEqual(s3Client.inputs.length, 1);
  });
}

test('listBucketObjects: aggregates pages and preserves opaque tokens, keys and scope', async () => {
  const date = new Date('2026-10-01T12:00:00Z');
  const s3Client = listingClient([
    {
      IsTruncated: true,
      NextContinuationToken: ' token A ',
      Contents: [{ Key: ' folder/ ', Size: 0, LastModified: date }],
    },
    { IsTruncated: true, NextContinuationToken: 'token-B' },
    {
      IsTruncated: false,
      NextContinuationToken: 'unused',
      Contents: [{ Key: 'file', Size: 42 }],
    },
  ]);
  assert.deepStrictEqual(
    await listBucketObjects({ s3Client, bucket: 'fixture', prefix: 'scope/' }),
    [
      {
        key: ' folder/ ',
        byteCount: 0,
        lastModified: date.toISOString(),
        checksumHex: null,
      },
      { key: 'file', byteCount: 42, lastModified: null, checksumHex: null },
    ],
  );
  assert.deepStrictEqual(
    s3Client.inputs,
    [undefined, ' token A ', 'token-B'].map((ContinuationToken) => ({
      Bucket: 'fixture',
      Prefix: 'scope/',
      ContinuationToken,
    })),
  );
});

const invalidListingPages = [
  ['null response', null],
  ['missing response', undefined],
  ['array response', []],
  ['text response', 'private-response'],
  ['missing truncation flag', {}],
  ['string truncation flag', { IsTruncated: 'false' }],
  ['numeric truncation flag', { IsTruncated: 0 }],
  ['null Contents', { IsTruncated: false, Contents: null }],
  ['object Contents', { IsTruncated: false, Contents: {} }],
  ['string Contents', { IsTruncated: false, Contents: 'private-contents' }],
  ...[
    null,
    [],
    {},
    { Key: '', Size: 1 },
    { Key: 42, Size: 1 },
    { Key: 'private-key' },
    { Key: 'private-key', Size: null },
    { Key: 'private-key', Size: '1' },
    { Key: 'private-key', Size: -1 },
    { Key: 'private-key', Size: 1.5 },
    { Key: 'private-key', Size: NaN },
    { Key: 'private-key', Size: Infinity },
    { Key: 'private-key', Size: Number.MAX_SAFE_INTEGER + 1 },
    { Key: 'private-key', Size: 1, LastModified: new Date(NaN) },
    { Key: 'private-key', Size: 1, LastModified: 'private-date' },
    { Key: 'private-key', Size: 1, LastModified: null },
  ].map((entry, i) => [
    `invalid entry ${i}`,
    { IsTruncated: false, Contents: [entry] },
  ]),
  ...[undefined, null, '', ' \t ', 42, {}].map((token, i) => [
    `invalid next token ${i}`,
    { IsTruncated: true, NextContinuationToken: token },
  ]),
];
for (const [label, page] of invalidListingPages) {
  test(`listBucketObjects: rejects ${label} without reflecting page data`, async () => {
    const s3Client = listingClient([page]);
    await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
      message: 'Object storage listing is invalid or incomplete',
    });
    assert.strictEqual(s3Client.inputs.length, 1);
  });
}

for (const tokens of [
  ['private-A', 'private-A'],
  ['private-A', 'private-B', 'private-A'],
]) {
  test(`listBucketObjects: rejects token cycle after ${tokens.length} requests`, async () => {
    const s3Client = listingClient(
      tokens.map((NextContinuationToken) => ({
        IsTruncated: true,
        NextContinuationToken,
      })),
    );
    await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
      message: 'Object storage listing is invalid or incomplete',
    });
    assert.strictEqual(s3Client.inputs.length, tokens.length);
  });
}

for (const acrossPages of [false, true]) {
  test(`listBucketObjects: rejects duplicate key ${acrossPages ? 'across pages' : 'within a page'}`, async () => {
    const entries = [
      { Key: 'private-key', Size: 1 },
      { Key: 'private-key', Size: 2 },
    ];
    const pages = acrossPages
      ? [
          {
            IsTruncated: true,
            NextContinuationToken: 'A',
            Contents: [entries[0]],
          },
          { IsTruncated: false, Contents: [entries[1]] },
        ]
      : [{ IsTruncated: false, Contents: entries }];
    await assert.rejects(
      listBucketObjects({ s3Client: listingClient(pages), bucket: 'fixture' }),
      { message: 'Object storage listing is invalid or incomplete' },
    );
  });
}

for (const second of [null, new Error('private-provider-error')]) {
  test(`listBucketObjects: rejects whole listing on later ${second ? 'provider failure' : 'malformed page'}`, async () => {
    const s3Client = listingClient([
      {
        IsTruncated: true,
        NextContinuationToken: 'A',
        Contents: [{ Key: 'valid', Size: 1 }],
      },
      second,
    ]);
    await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }));
    assert.strictEqual(s3Client.inputs.length, 2);
  });
}

for (const [label, pages] of [
  ['truncated page without token', [{ IsTruncated: true, Contents: [] }]],
  [
    'malformed later page',
    [
      { IsTruncated: true, NextContinuationToken: 'private-token' },
      { IsTruncated: false, Contents: [{ Key: 'private-key' }] },
    ],
  ],
  [
    'token cycle',
    [
      { IsTruncated: true, NextContinuationToken: 'private-token' },
      { IsTruncated: true, NextContinuationToken: 'private-token' },
    ],
  ],
  [
    'later provider failure',
    [
      { IsTruncated: true, NextContinuationToken: 'private-token' },
      new Error('private-provider-error'),
    ],
  ],
]) {
  test(`main: ${label} fails before summary and receipt publication`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-list-failure-'));
    try {
      const io = createIo();
      const code = await main(
        [
          'node',
          'script',
          '--dry-run',
          '--output',
          path.join(dir, 'receipt.json'),
        ],
        io,
        { dbObjects: [], s3Client: listingClient(pages), env: {} },
      );
      assert.strictEqual(code, 1);
      assert.deepStrictEqual(io.errors, [
        'Error: Object storage connection or listing failed',
      ]);
      assert.deepStrictEqual(io.logs, [
        'Connecting to PostgreSQL and Object Storage...',
      ]);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('main: complete multi-page listing publishes existing simulation receipt shape', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-list-success-'));
  try {
    const target = path.join(dir, 'receipt.json');
    const io = createIo();
    const s3Client = listingClient([
      {
        IsTruncated: true,
        NextContinuationToken: 'A',
        Contents: [{ Key: 'one', Size: 1 }],
      },
      { IsTruncated: false, Contents: [{ Key: 'two', Size: 2 }] },
    ]);
    const code = await main(
      ['node', 'script', '--dry-run', '--output', target],
      io,
      {
        env: {},
        s3Client,
        dbObjects: ['one', 'two'].map((objectKey, i) => ({
          id: objectKey,
          organizationId: 'fixture-org',
          bucket: 'acres-quarantine',
          objectKey,
          byteCount: i + 1,
          state: 'accepted',
        })),
      },
    );
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(io.errors, []);
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.drill_type, 'storage_reconciliation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, 2);
    assert.strictEqual(report.summary.totalBucketObjects, 2);
    assert.deepStrictEqual(
      report.matched.map((row) => row.objectKey),
      ['one', 'two'],
    );
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
