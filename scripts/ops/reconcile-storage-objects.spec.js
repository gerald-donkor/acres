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

for (const later of [false, true]) {
  for (const [label, fields] of [
    ['omitted echo', {}],
    ['undefined echo', { Prefix: undefined }],
    ['matching echo', { Prefix: 'scope/' }],
  ]) {
    test(`listBucketObjects: rejects ${later ? 'later' : 'first'} out-of-prefix key with ${label}`, async () => {
      const pages = later
        ? [
            {
              IsTruncated: true,
              Contents: [{ Key: 'scope/first', Size: 1 }],
              NextContinuationToken: 'A',
            },
          ]
        : [];
      pages.push(
        Object.freeze({
          ...fields,
          IsTruncated: true,
          NextContinuationToken: 'B',
          Contents: Object.freeze([
            Object.freeze({ Key: 'scope/valid', Size: 1 }),
            Object.freeze({ Key: 'private-outside/key', Size: 1 }),
          ]),
        }),
        { IsTruncated: false },
      );
      const s3Client = listingClient(pages);
      await assert.rejects(
        listBucketObjects({ s3Client, bucket: 'fixture', prefix: 'scope/' }),
        {
          message: 'Object storage listing is invalid or incomplete',
        },
      );
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
    });
  }
}

for (const [prefix, key] of [
  ['scope/', 'Scope/key'],
  ['scope/', 'scope'],
  ['scope/', 'other/scope/key'],
  ['scope/', 'scope%2Fkey'],
  ['é/', 'e\u0301/key'],
]) {
  test(`listBucketObjects: rejects literal prefix mismatch ${JSON.stringify([prefix, key])}`, async () => {
    await assert.rejects(
      listBucketObjects({
        s3Client: listingClient([
          { IsTruncated: false, Contents: [{ Key: key, Size: 1 }] },
        ]),
        bucket: 'fixture',
        prefix,
      }),
      { message: 'Object storage listing is invalid or incomplete' },
    );
  });
}

for (const [prefix, key] of [
  [undefined, 'any/key'],
  ['', 'any/key'],
  ['scope/', 'scope/'],
  ['scope', 'scoped'],
  [' scope/', ' scope/key'],
  ['scope%2F', 'scope%2Fkey'],
  ['scope/../', 'scope/../key'],
  ['[scope].*/', '[scope].*/key'],
  ['e\u0301/', 'e\u0301/key'],
]) {
  test(`listBucketObjects: preserves literal prefix semantics ${JSON.stringify([prefix, key])}`, async () => {
    const lastModified = new Date('2026-01-01T00:00:00Z');
    const digest = Buffer.alloc(32, 1);
    const page = Object.freeze({
      IsTruncated: false,
      Contents: Object.freeze([
        Object.freeze({
          Key: key,
          Size: 2,
          LastModified: lastModified,
          ChecksumSHA256: digest.toString('base64'),
        }),
      ]),
    });
    const s3Client = listingClient([page]);
    assert.deepStrictEqual(
      await listBucketObjects({ s3Client, bucket: 'fixture', prefix }),
      [
        {
          key,
          byteCount: 2,
          lastModified: lastModified.toISOString(),
          checksumHex: digest.toString('hex'),
        },
      ],
    );
    assert.deepStrictEqual(s3Client.inputs, [
      {
        Bucket: 'fixture',
        Prefix: prefix || undefined,
        ContinuationToken: undefined,
      },
    ]);
    assert.strictEqual(page.Contents[0].Key, key);
  });
}

test('listBucketObjects: omitted prefix preserves bucket-wide listing', async () => {
  const result = await listBucketObjects({
    bucket: 'fixture',
    s3Client: listingClient([
      { IsTruncated: false, Contents: [{ Key: 'any/key', Size: 1 }] },
    ]),
  });
  assert.strictEqual(result[0].key, 'any/key');
});

test('listBucketObjects: scoped keys preserve order through empty intermediate page', async () => {
  const s3Client = listingClient([
    {
      IsTruncated: true,
      Prefix: 'scope/',
      Contents: [{ Key: 'scope/first', Size: 1 }],
      NextContinuationToken: 'A',
    },
    {
      IsTruncated: true,
      Prefix: 'scope/',
      Contents: [],
      NextContinuationToken: 'B',
    },
    {
      IsTruncated: false,
      Prefix: 'scope/',
      Contents: [{ Key: 'scope/last', Size: 2 }],
    },
  ]);
  const result = await listBucketObjects({
    s3Client,
    bucket: 'fixture',
    prefix: 'scope/',
  });
  assert.deepStrictEqual(
    result.map(item => item.key),
    ['scope/first', 'scope/last'],
  );
  assert.deepStrictEqual(
    s3Client.inputs,
    [undefined, 'A', 'B'].map(ContinuationToken => ({
      Bucket: 'fixture',
      Prefix: 'scope/',
      ContinuationToken,
    })),
  );
});

for (const later of [false, true]) {
  test(`main: ${later ? 'later' : 'first'} out-of-prefix key publishes no evidence`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-key-scope-failure-'),
    );
    try {
      const pages = later
        ? [
            {
              IsTruncated: true,
              Contents: [{ Key: 'scope/valid', Size: 1 }],
              NextContinuationToken: 'A',
            },
          ]
        : [];
      pages.push(
        {
          IsTruncated: true,
          Prefix: 'scope/',
          Contents: [{ Key: '.keep', Size: 1 }],
          NextContinuationToken: 'B',
        },
        { IsTruncated: false },
      );
      const s3Client = listingClient(pages);
      const io = createIo();
      assert.strictEqual(
        await main(
          [
            'node',
            'script',
            '--dry-run',
            '--prefix',
            'scope/',
            '--output',
            path.join(dir, 'receipt.json'),
          ],
          io,
          {
            env: {},
            dbObjects: later
              ? [inventoryDbRecord({ objectKey: 'scope/valid' })]
              : [],
            s3Client,
          },
        ),
        1,
      );
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
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

test('main: valid scoped keys publish a clean multi-page simulation receipt', async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'acres-key-scope-success-'),
  );
  try {
    const target = path.join(dir, 'receipt.json');
    const io = createIo();
    const s3Client = listingClient([
      {
        IsTruncated: true,
        Contents: [{ Key: 'scope/first', Size: 1 }],
        NextContinuationToken: 'A',
      },
      { IsTruncated: true, Contents: [], NextContinuationToken: 'B' },
      { IsTruncated: false, Contents: [{ Key: 'scope/last', Size: 1 }] },
    ]);
    assert.strictEqual(
      await main(
        [
          'node',
          'script',
          '--dry-run',
          '--prefix',
          'scope/',
          '--output',
          target,
        ],
        io,
        {
          env: {},
          s3Client,
          dbObjects: ['first', 'last'].map(id =>
            inventoryDbRecord({ id, objectKey: `scope/${id}` }),
          ),
        },
      ),
      0,
    );
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.deepStrictEqual(io.errors, []);
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.totalBucketObjects, 2);
    assert.strictEqual(report.summary.matchedObjects, 2);
    assert.deepStrictEqual(
      report.matched.map(item => item.objectKey),
      ['scope/first', 'scope/last'],
    );
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const invalidChecksumAlgorithms = [
  ['unsupported', 'md5'],
  ['private value', 'private-algorithm-sentinel'],
  ['case variant', 'SHA256'],
  ['whitespace variant', ' sha256 '],
  ['empty', ''],
  ['boolean', false],
  ['number', 0],
  ['bigint', 0n],
  ['array', ['sha256']],
  ['object', {}],
  ['boxed string', new String('sha256')],
  ['symbol', Symbol('private-algorithm')],
  [
    'coercible object',
    {
      toString() {
        throw new Error('private-coercion-must-not-run');
      },
    },
  ],
];

for (const [label, checksumAlgorithm] of invalidChecksumAlgorithms) {
  test(`reconcileObjects: rejects ${label} checksum algorithm before a clean match`, () => {
    assert.throws(
      () =>
        reconcileObjects({
          dbObjects: [
            inventoryDbRecord({ checksumAlgorithm, checksumHex: 'aBcD' }),
          ],
          storageObjects: [
            { key: 'fixture-key', byteCount: 1, checksumHex: 'abcd' },
          ],
        }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const [label, patch, options] of [
  ['bucket', { bucket: 'private-other' }, { bucket: 'acres-quarantine' }],
  [
    'organization',
    { organizationId: 'private-other' },
    { organizationId: 'fixture-org' },
  ],
  ['prefix', {}, { prefix: 'other/' }],
  ['ignore', {}, { ignorePatterns: [/^fixture-/] }],
  ['pending', { state: 'pending_upload' }, {}],
  ['deleted', { deletedAt: '2026-01-01' }, {}],
  ['expired', { uploadState: 'expired' }, {}],
  ['quarantine', { state: 'quarantined' }, { excludeQuarantined: true }],
]) {
  test(`reconcileObjects: invalid checksum algorithm cannot hide behind ${label} without a digest`, () => {
    assert.throws(
      () =>
        reconcileObjects({
          dbObjects: [
            inventoryDbRecord({
              id: 'first',
              objectKey: 'first',
              checksumAlgorithm: 'sha256',
            }),
            inventoryDbRecord({
              ...patch,
              checksumAlgorithm: 'private-algorithm-sentinel',
            }),
          ],
          options,
        }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const [label, algorithmPatch] of [
  ['omitted', {}],
  ['undefined', { checksumAlgorithm: undefined }],
  ['null', { checksumAlgorithm: null }],
  ['sha256', { checksumAlgorithm: 'sha256' }],
]) {
  for (const digestPatch of [
    {},
    { checksumHex: null },
    { checksumHex: 'aBcD' },
  ]) {
    test(`reconcileObjects: optional algorithm ${label} accepts digest ${String(digestPatch.checksumHex)}`, () => {
      const dbObjects = Object.freeze([
        Object.freeze(inventoryDbRecord({ ...algorithmPatch, ...digestPatch })),
      ]);
      const storageObjects = Object.freeze([
        Object.freeze({
          key: 'fixture-key',
          byteCount: 1,
          checksumHex: 'abcd',
        }),
      ]);
      const report = reconcileObjects({ dbObjects, storageObjects });
      assert.strictEqual(report.summary.status, 'clean');
      assert.strictEqual(report.summary.matchedObjects, 1);
      assert.deepStrictEqual(
        dbObjects[0],
        inventoryDbRecord({ ...algorithmPatch, ...digestPatch }),
      );
      assert.deepStrictEqual(storageObjects[0], {
        key: 'fixture-key',
        byteCount: 1,
        checksumHex: 'abcd',
      });
    });
  }
}

test('queryDatabaseStoredObjects: invalid later checksum algorithm rejects whole result', async () => {
  let queries = 0;
  await assert.rejects(
    queryDatabaseStoredObjects({
      pgClient: {
        async query() {
          queries++;
          return {
            rows: [
              inventoryDbRecord({
                id: 'first',
                objectKey: 'first',
                checksumAlgorithm: 'sha256',
              }),
              inventoryDbRecord({
                checksumAlgorithm: 'private-algorithm-sentinel',
              }),
            ],
          };
        },
      },
    }),
    { message: 'Database inventory is invalid' },
  );
  assert.strictEqual(queries, 1);
});

test('queryDatabaseStoredObjects: preserves optional algorithms and valid digest spelling', async () => {
  const rows = Object.freeze(
    [{}, { checksumAlgorithm: null }, { checksumAlgorithm: 'sha256' }].map(
      (patch, i) =>
        Object.freeze(
          inventoryDbRecord({
            id: `row-${i}`,
            objectKey: `key-${i}`,
            byteCount: '1',
            checksumHex: 'aBcD',
            ...patch,
          }),
        ),
    ),
  );
  const result = await queryDatabaseStoredObjects({
    pgClient: { query: async () => ({ rows }) },
  });
  assert.deepStrictEqual(
    result,
    rows.map((row) => ({ ...row, byteCount: 1n })),
  );
  assert.ok(
    rows.every((row) => row.byteCount === '1' && row.checksumHex === 'aBcD'),
  );
});

for (const injectedStorage of [true, false]) {
  test(`main: invalid injected checksum algorithm rejects before clients (storage injected: ${injectedStorage})`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-algorithm-'));
    try {
      let touched = false;
      const touch = async () => {
        touched = true;
        throw new Error('private-client');
      };
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
        {
          env: {},
          dbObjects: [
            inventoryDbRecord({
              checksumAlgorithm: 'private-algorithm-sentinel',
            }),
          ],
          ...(injectedStorage ? { storageObjects: [] } : {}),
          pgClient: { connect: touch, query: touch },
          s3Client: { send: touch },
        },
      );
      assert.strictEqual(code, 1);
      assert.strictEqual(touched, false);
      assert.deepStrictEqual(io.errors, [
        'Error: Reconciliation execution failed',
      ]);
      assert.deepStrictEqual(io.logs, []);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('main: queried invalid checksum algorithm rejects before storage and publication', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-algorithm-query-'));
  try {
    const io = createIo();
    let queries = 0;
    let storageTouched = false;
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
        pgClient: {
          async query() {
            queries++;
            return {
              rows: [
                inventoryDbRecord({
                  checksumAlgorithm: 'private-algorithm-sentinel',
                }),
              ],
            };
          },
        },
        s3Client: {
          async send() {
            storageTouched = true;
            throw new Error('private-storage');
          },
        },
      },
    );
    assert.strictEqual(code, 1);
    assert.strictEqual(queries, 1);
    assert.strictEqual(storageTouched, false);
    assert.deepStrictEqual(io.errors, ['Error: Database query failed']);
    assert.deepStrictEqual(io.logs, [
      'Connecting to PostgreSQL and Object Storage...',
    ]);
    assert.deepStrictEqual(fs.readdirSync(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('main: explicit sha256 metadata publishes existing simulation receipt', async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'acres-algorithm-success-'),
  );
  try {
    const target = path.join(dir, 'receipt.json');
    const io = createIo();
    const code = await main(
      ['node', 'script', '--dry-run', '--output', target],
      io,
      {
        env: {},
        dbObjects: [
          inventoryDbRecord({
            checksumAlgorithm: 'sha256',
            checksumHex: 'aBcD',
          }),
        ],
        storageObjects: [
          { key: 'fixture-key', byteCount: 1, checksumHex: 'abcd' },
        ],
      },
    );
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(io.errors, []);
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.drill_type, 'storage_reconciliation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, 1);
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// StoredObject.objectKey is globally unique, including across buckets/tenants.
const duplicateKeyRows = (patch = {}) => [
  inventoryDbRecord({
    id: 'private-first-id',
    objectKey: 'private-duplicate-key',
  }),
  inventoryDbRecord({
    id: 'private-second-id',
    objectKey: 'private-duplicate-key',
    ...patch,
  }),
];

for (const [label, patch] of [
  ['identical metadata', {}],
  ['different organization', { organizationId: 'private-other-org' }],
  ['different bucket', { bucket: 'private-other-bucket' }],
  ['conflicting size', { byteCount: 2 }],
  ['conflicting checksum', { checksumHex: 'abcd' }],
]) {
  test(`reconcileObjects: rejects duplicate DB object keys with ${label}`, () => {
    const dbObjects = duplicateKeyRows(patch);
    dbObjects[0].checksumHex = '1234';
    assert.throws(
      () =>
        reconcileObjects({
          dbObjects,
          storageObjects: [
            { key: 'private-duplicate-key', byteCount: 1, checksumHex: '1234' },
          ],
        }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const [label, patch, options] of [
  [
    'bucket',
    { bucket: 'private-other-bucket' },
    { bucket: 'acres-quarantine' },
  ],
  [
    'organization',
    { organizationId: 'private-other-org' },
    { organizationId: 'fixture-org' },
  ],
  ['prefix', {}, { prefix: 'other/' }],
  ['ignore', {}, { ignorePatterns: [/^private-/] }],
  ['pending', { state: 'pending_upload' }, {}],
  ['deleted', { state: 'deleted' }, {}],
  ['expired', { uploadState: 'expired' }, {}],
  ['quarantine', { state: 'quarantined' }, { excludeQuarantined: true }],
]) {
  test(`reconcileObjects: duplicate DB object keys cannot hide behind ${label}`, () => {
    assert.throws(
      () => reconcileObjects({ dbObjects: duplicateKeyRows(patch), options }),
      { message: 'Database inventory is invalid' },
    );
  });
}

test('reconcileObjects: rejects nonadjacent duplicate DB object keys without mutation', () => {
  const [first, duplicate] = duplicateKeyRows();
  const dbObjects = Object.freeze(
    [
      first,
      inventoryDbRecord({ id: 'middle', objectKey: 'unique' }),
      duplicate,
    ].map(Object.freeze),
  );
  assert.throws(() => reconcileObjects({ dbObjects }), {
    message: 'Database inventory is invalid',
  });
  assert.deepStrictEqual(
    dbObjects.map((row) => row.id),
    ['private-first-id', 'middle', 'private-second-id'],
  );
});

const opaqueUniqueKeys = [
  'Key',
  'key',
  ' key',
  'key ',
  'path/key',
  'path//key',
  'path/./key',
  '\u00e9',
  'e\u0301',
  '__proto__',
  'constructor',
  'toString',
];

test('reconcileObjects: preserves unique opaque keys and frozen caller inventories', () => {
  const dbObjects = Object.freeze(
    opaqueUniqueKeys.map((objectKey, i) =>
      Object.freeze(inventoryDbRecord({ id: `unique-${i}`, objectKey })),
    ),
  );
  const storageObjects = Object.freeze(
    opaqueUniqueKeys.map((key) => Object.freeze({ key, byteCount: 1 })),
  );
  const report = reconcileObjects({ dbObjects, storageObjects });
  assert.strictEqual(report.summary.status, 'clean');
  assert.strictEqual(report.summary.matchedObjects, opaqueUniqueKeys.length);
  assert.strictEqual(
    report.summary.totalBucketObjects,
    opaqueUniqueKeys.length,
  );
  assert.deepStrictEqual(
    report.matched.map((row) => row.objectKey),
    opaqueUniqueKeys,
  );
  assert.deepStrictEqual(
    dbObjects.map((row) => row.objectKey),
    opaqueUniqueKeys,
  );
  assert.deepStrictEqual(
    storageObjects.map((row) => row.key),
    opaqueUniqueKeys,
  );
});

test('reconcileObjects: unique keys preserve empty inventories and lifecycle counts', () => {
  const empty = reconcileObjects({});
  assert.strictEqual(empty.summary.status, 'clean');
  assert.strictEqual(empty.summary.totalDatabaseObjects, 0);
  const dbObjects = [
    inventoryDbRecord({ id: 'active', objectKey: 'active' }),
    inventoryDbRecord({
      id: 'pending',
      objectKey: 'pending',
      state: 'pending_upload',
    }),
    inventoryDbRecord({
      id: 'deleted',
      objectKey: 'deleted',
      state: 'deleted',
    }),
  ];
  const report = reconcileObjects({
    dbObjects,
    storageObjects: dbObjects.map((row) => ({
      key: row.objectKey,
      byteCount: 1,
    })),
  });
  assert.strictEqual(report.summary.status, 'clean');
  assert.strictEqual(report.summary.activeDatabaseObjects, 1);
  assert.strictEqual(report.summary.pendingOrDeletedExcluded, 2);
  assert.strictEqual(report.summary.matchedObjects, 1);
  assert.strictEqual(report.summary.orphanObjects, 0);
});

test('queryDatabaseStoredObjects: rejects whole result on later duplicate key', async () => {
  const [first, duplicate] = duplicateKeyRows({
    bucket: 'private-other-bucket',
  });
  let queries = 0;
  await assert.rejects(
    queryDatabaseStoredObjects({
      pgClient: {
        async query() {
          queries++;
          return {
            rows: [
              first,
              inventoryDbRecord({ id: 'middle', objectKey: 'unique' }),
              duplicate,
            ],
          };
        },
      },
    }),
    { message: 'Database inventory is invalid' },
  );
  assert.strictEqual(queries, 1);
});

test('queryDatabaseStoredObjects: unique opaque keys retain bigint conversion', async () => {
  const rows = Object.freeze(
    opaqueUniqueKeys.map((objectKey, i) =>
      Object.freeze(
        inventoryDbRecord({ id: `unique-${i}`, objectKey, byteCount: '1' }),
      ),
    ),
  );
  const result = await queryDatabaseStoredObjects({
    pgClient: { query: async () => ({ rows }) },
  });
  assert.deepStrictEqual(
    result.map((row) => row.objectKey),
    opaqueUniqueKeys,
  );
  assert.ok(result.every((row) => row.byteCount === 1n));
  assert.ok(rows.every((row) => row.byteCount === '1'));
});

for (const injectedStorage of [true, false]) {
  test(`main: duplicate injected DB keys reject before clients (storage injected: ${injectedStorage})`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-duplicate-keys-'));
    try {
      let touched = false;
      const touch = async () => {
        touched = true;
        throw new Error('private-client');
      };
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
        {
          env: {},
          dbObjects: duplicateKeyRows(),
          ...(injectedStorage ? { storageObjects: [] } : {}),
          pgClient: { connect: touch, query: touch },
          s3Client: { send: touch },
        },
      );
      assert.strictEqual(code, 1);
      assert.strictEqual(touched, false);
      assert.deepStrictEqual(io.errors, [
        'Error: Reconciliation execution failed',
      ]);
      assert.deepStrictEqual(io.logs, []);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('main: queried duplicate keys reject before storage and receipt publication', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-duplicate-query-'));
  try {
    const io = createIo();
    let queries = 0;
    let storageTouched = false;
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
        pgClient: {
          async query() {
            queries++;
            return { rows: duplicateKeyRows() };
          },
        },
        s3Client: {
          async send() {
            storageTouched = true;
            throw new Error('private-storage');
          },
        },
      },
    );
    assert.strictEqual(code, 1);
    assert.strictEqual(queries, 1);
    assert.strictEqual(storageTouched, false);
    assert.deepStrictEqual(io.errors, ['Error: Database query failed']);
    assert.deepStrictEqual(io.logs, [
      'Connecting to PostgreSQL and Object Storage...',
    ]);
    assert.deepStrictEqual(fs.readdirSync(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('main: unique opaque keys publish unchanged simulation evidence', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-unique-keys-'));
  try {
    const target = path.join(dir, 'receipt.json');
    const io = createIo();
    const code = await main(
      ['node', 'script', '--dry-run', '--output', target],
      io,
      {
        env: {},
        dbObjects: opaqueUniqueKeys.map((objectKey, i) =>
          inventoryDbRecord({ id: `unique-${i}`, objectKey }),
        ),
        storageObjects: opaqueUniqueKeys.map((key) => ({ key, byteCount: 1 })),
      },
    );
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(io.errors, []);
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.drill_type, 'storage_reconciliation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, opaqueUniqueKeys.length);
    assert.deepStrictEqual(
      report.matched.map((row) => row.objectKey),
      opaqueUniqueKeys,
    );
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const invalidChecksumValues = [
  ['empty', ''],
  ['whitespace', ' \t '],
  ['nonhex', 'private-checksum-sentinel'],
  ['odd hex', 'abc'],
  ['leading space', ' abcd'],
  ['trailing newline', 'abcd\n'],
  ['trailing CRLF', 'abcd\r\n'],
  ['hex prefix', '0xabcd'],
  ['number', 42],
  ['zero', 0],
  ['bigint', 42n],
  ['true', true],
  ['false', false],
  ['array', ['abcd']],
  ['object', {}],
  ['boxed string', new String('abcd')],
  ['buffer', Buffer.from('abcd', 'hex')],
];

for (const side of ['dbObjects', 'storageObjects']) {
  for (const [label, checksumHex] of invalidChecksumValues) {
    test(`reconcileObjects: rejects ${side} checksum ${label} before clean report`, () => {
      const dbObjects = [inventoryDbRecord()];
      const storageObjects = [{ key: 'fixture-key', byteCount: 1 }];
      (side === 'dbObjects' ? dbObjects : storageObjects)[0].checksumHex =
        checksumHex;
      assert.throws(() => reconcileObjects({ dbObjects, storageObjects }), {
        message:
          side === 'dbObjects'
            ? 'Database inventory is invalid'
            : 'Storage inventory is invalid',
      });
    });
  }
  test(`reconcileObjects: never coerces ${side} checksum objects`, () => {
    let coerced = false;
    const checksumHex = {
      toString() {
        coerced = true;
        return 'abcd';
      },
    };
    const row =
      side === 'dbObjects'
        ? inventoryDbRecord({ checksumHex })
        : { key: 'fixture-key', checksumHex };
    assert.throws(() => reconcileObjects({ [side]: [row] }), {
      message: inventoryError,
    });
    assert.strictEqual(coerced, false);
  });
}

for (const checksumHex of [false, 42, {}, ['abcd'], 'not-a-digest']) {
  test(`reconcileObjects: identical malformed ${typeof checksumHex} checksums cannot match`, () => {
    assert.throws(
      () =>
        reconcileObjects({
          dbObjects: [inventoryDbRecord({ checksumHex })],
          storageObjects: [{ key: 'fixture-key', checksumHex }],
        }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const [label, patch, options] of [
  ['bucket', { bucket: 'other' }, { bucket: 'acres-quarantine' }],
  [
    'organization',
    { organizationId: 'other' },
    { organizationId: 'fixture-org' },
  ],
  ['prefix', {}, { prefix: 'other/' }],
  ['ignore', { objectKey: '.keep' }, {}],
  ['pending', { state: 'pending_upload' }, {}],
  ['deleted', { state: 'deleted' }, {}],
  ['expired', { uploadState: 'expired' }, {}],
  ['quarantine', { state: 'quarantined' }, { excludeQuarantined: true }],
]) {
  test(`reconcileObjects: invalid checksum cannot hide behind ${label}`, () => {
    assert.throws(
      () =>
        reconcileObjects({
          dbObjects: [inventoryDbRecord({ ...patch, checksumHex: false })],
          options,
        }),
      { message: 'Database inventory is invalid' },
    );
  });
}
for (const options of [{}, { prefix: 'other/' }]) {
  test(`reconcileObjects: ignored/filtered storage checksum still rejects (${Object.keys(options).length})`, () => {
    assert.throws(
      () =>
        reconcileObjects({
          storageObjects: [{ key: '.keep', checksumHex: false }],
          options,
        }),
      { message: 'Storage inventory is invalid' },
    );
  });
}

for (const checksumHex of [
  '00',
  'aB',
  'aaaabbbbcccc',
  'Ab'.repeat(32),
  'aF'.repeat(64),
]) {
  test(`reconcileObjects: complete ${checksumHex.length}-character hex compares without mutating input`, () => {
    const dbObjects = Object.freeze([
      Object.freeze(inventoryDbRecord({ checksumHex })),
    ]);
    const storageObjects = Object.freeze([
      Object.freeze({
        key: 'fixture-key',
        byteCount: 1,
        checksumHex: checksumHex.toLowerCase(),
      }),
    ]);
    const report = reconcileObjects({ dbObjects, storageObjects });
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, 1);
    assert.strictEqual(dbObjects[0].checksumHex, checksumHex);
    assert.strictEqual(
      storageObjects[0].checksumHex,
      checksumHex.toLowerCase(),
    );
  });
}
for (const dbChecksum of [undefined, null, 'aB']) {
  for (const storageChecksum of [undefined, null, 'Ab']) {
    test(`reconcileObjects: nullable checksums keep metadata-only matching (${dbChecksum}/${storageChecksum})`, () => {
      const report = reconcileObjects({
        dbObjects: [inventoryDbRecord({ checksumHex: dbChecksum })],
        storageObjects: [
          { key: 'fixture-key', byteCount: 1, checksumHex: storageChecksum },
        ],
      });
      assert.strictEqual(report.summary.status, 'clean');
      assert.strictEqual(report.summary.matchedObjects, 1);
    });
  }
}
test('reconcileObjects: valid checksums preserve missing case and detect mismatches', () => {
  const missing = reconcileObjects({
    dbObjects: [inventoryDbRecord({ checksumHex: 'aBcD' })],
  });
  assert.strictEqual(missing.missing[0].expectedChecksumHex, 'aBcD');
  const mismatch = reconcileObjects({
    dbObjects: [inventoryDbRecord({ checksumHex: 'aB' })],
    storageObjects: [{ key: 'fixture-key', checksumHex: 'Cd' }],
  });
  assert.strictEqual(mismatch.summary.status, 'error');
  assert.deepStrictEqual(mismatch.mismatches[0].issues, [
    'checksum_mismatch (db: ab, storage: cd)',
  ]);
  const orphan = reconcileObjects({
    storageObjects: [{ key: 'orphan', byteCount: 1, checksumHex: 'aB' }],
  });
  assert.strictEqual(orphan.summary.status, 'warning');
  assert.strictEqual(orphan.orphans[0].key, 'orphan');
});

for (const checksumHex of [false, 'private-checksum-sentinel']) {
  test(`queryDatabaseStoredObjects: rejects entire result with later ${typeof checksumHex} checksum`, async () => {
    await assert.rejects(
      queryDatabaseStoredObjects({
        pgClient: {
          query: async () => ({
            rows: [
              inventoryDbRecord(),
              inventoryDbRecord({ id: 'second', checksumHex }),
            ],
          }),
        },
      }),
      { message: 'Database inventory is invalid' },
    );
  });
}

const canonicalSha256 = Buffer.alloc(32, 255).toString('base64');
const invalidListedChecksums = [
  ['empty', ''],
  ['whitespace', ' '],
  ['invalid alphabet', '!'.repeat(43) + '='],
  ['one byte', 'YQ=='],
  ['31 bytes', Buffer.alloc(31).toString('base64')],
  ['33 bytes', Buffer.alloc(33).toString('base64')],
  ['missing padding', canonicalSha256.slice(0, -1)],
  ['extra padding', canonicalSha256 + '='],
  ['leading whitespace', ' ' + canonicalSha256],
  ['trailing newline', canonicalSha256 + '\n'],
  ['URL-safe', canonicalSha256.replaceAll('/', '_')],
  ['noncanonical pad bits', canonicalSha256.slice(0, -2) + '9='],
  ['composite suffix', canonicalSha256 + '-2'],
  ['number', 42],
  ['zero', 0],
  ['true', true],
  ['false', false],
  ['array', [canonicalSha256]],
  ['object', {}],
  ['boxed string', new String(canonicalSha256)],
  ['buffer', Buffer.alloc(32)],
];
for (const [label, ChecksumSHA256] of invalidListedChecksums) {
  test(`listBucketObjects: rejects ${label} checksum extension`, async () => {
    await assert.rejects(
      listBucketObjects({
        s3Client: listingClient([
          {
            IsTruncated: false,
            Contents: [{ Key: 'fixture-key', Size: 1, ChecksumSHA256 }],
          },
        ]),
        bucket: 'fixture',
      }),
      { message: 'Object storage listing is invalid or incomplete' },
    );
  });
}
for (const ChecksumSHA256 of [
  undefined,
  null,
  canonicalSha256,
  Buffer.alloc(32).toString('base64'),
]) {
  test(`listBucketObjects: preserves optional canonical SHA256 extension (${ChecksumSHA256})`, async () => {
    const result = await listBucketObjects({
      s3Client: listingClient([
        {
          IsTruncated: false,
          Contents: [
            {
              Key: 'fixture-key',
              Size: 1,
              ChecksumSHA256,
              ChecksumAlgorithm: ['SHA256'],
              ChecksumType: 'FULL_OBJECT',
              ETag: 'untrusted-etag',
            },
          ],
        },
      ]),
      bucket: 'fixture',
    });
    assert.deepStrictEqual(result, [
      {
        key: 'fixture-key',
        byteCount: 1,
        lastModified: null,
        checksumHex:
          ChecksumSHA256 == null
            ? null
            : Buffer.from(ChecksumSHA256, 'base64').toString('hex'),
      },
    ]);
  });
}
test('listBucketObjects: invalid later checksum rejects the whole inventory', async () => {
  const s3Client = listingClient([
    {
      IsTruncated: true,
      NextContinuationToken: 'A',
      Contents: [{ Key: 'first', Size: 1, ChecksumSHA256: canonicalSha256 }],
    },
    {
      IsTruncated: false,
      Contents: [
        { Key: 'second', Size: 1, ChecksumSHA256: 'private-checksum-sentinel' },
      ],
    },
  ]);
  await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
    message: 'Object storage listing is invalid or incomplete',
  });
  assert.strictEqual(s3Client.inputs.length, 2);
});

for (const source of ['dbObjects', 'storageObjects', 'query', 'listing']) {
  test(`main: malformed ${source} checksum fails without summary or receipt`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-checksum-failure-'),
    );
    try {
      const io = createIo();
      const options = { env: {}, dbObjects: [], storageObjects: [] };
      let touched = false;
      if (source === 'query') {
        delete options.dbObjects;
        options.pgClient = {
          query: async () => ({
            rows: [
              inventoryDbRecord({ checksumHex: 'private-checksum-sentinel' }),
            ],
          }),
        };
      } else if (source === 'listing') {
        delete options.storageObjects;
        options.s3Client = listingClient([
          {
            IsTruncated: false,
            Contents: [
              {
                Key: 'fixture-key',
                Size: 1,
                ChecksumSHA256: 'private-checksum-sentinel',
              },
            ],
          },
        ]);
      } else {
        options[source] = [
          source === 'dbObjects'
            ? inventoryDbRecord({ checksumHex: false })
            : { key: 'fixture-key', checksumHex: false },
        ];
        delete options[source === 'dbObjects' ? 'storageObjects' : 'dbObjects'];
        options.pgClient = {
          connect() {
            touched = true;
            throw new Error('private-client');
          },
        };
        options.s3Client = {
          send() {
            touched = true;
            throw new Error('private-client');
          },
        };
      }
      const code = await main(
        [
          'node',
          'script',
          '--dry-run',
          '--output',
          path.join(dir, 'receipt.json'),
        ],
        io,
        options,
      );
      assert.strictEqual(code, 1);
      assert.strictEqual(touched, false);
      assert.deepStrictEqual(io.errors, [
        source === 'query'
          ? 'Error: Database query failed'
          : source === 'listing'
            ? 'Error: Object storage connection or listing failed'
            : 'Error: Reconciliation execution failed',
      ]);
      assert.deepStrictEqual(
        io.logs,
        source === 'query' || source === 'listing'
          ? ['Connecting to PostgreSQL and Object Storage...']
          : [],
      );
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

const invalidLifecycleStates = [
  ['undefined', undefined],
  ['null', null],
  ['empty', ''],
  ['whitespace', ' '],
  ['unknown', 'private-state-sentinel'],
  ['case', 'Accepted'],
  ['number', 0],
  ['boolean', false],
  ['array', ['accepted']],
  ['object', {}],
  ['boxed string', new String('accepted')],
];

for (const field of ['state', 'uploadState']) {
  for (const [label, value] of invalidLifecycleStates) {
    if (field === 'uploadState' && value == null) continue;
    test(`reconcileObjects: rejects lifecycle ${field} ${label} in matching inventory`, () => {
      assert.throws(
        () =>
          reconcileObjects({
            dbObjects: [inventoryDbRecord({ [field]: value })],
            storageObjects: [{ key: 'fixture-key', byteCount: 1 }],
          }),
        { message: 'Database inventory is invalid' },
      );
    });
  }
}

const lifecycleDateFields = [
  ['dbObjects', 'createdAt'],
  ['dbObjects', 'deletedAt'],
  ['dbObjects', 'uploadExpiresAt'],
  ['storageObjects', 'lastModified'],
];
const invalidLifecycleDates = [
  ['empty', ''],
  ['whitespace', ' '],
  ['unknown', 'private-date-sentinel'],
  ['invalid Date', new Date(NaN)],
  ['zero number', 0],
  ['epoch number', 1791763200000],
  ['true', true],
  ['false', false],
  ['array', ['2026-10-12T00:00:00Z']],
  ['object', {}],
  ['boxed string', new String('2026-10-12T00:00:00Z')],
];

for (const [side, field] of lifecycleDateFields) {
  for (const [label, value] of invalidLifecycleDates) {
    test(`reconcileObjects: rejects lifecycle ${field} ${label} before clean report`, () => {
      const dbObjects = [inventoryDbRecord()];
      const storageObjects = [{ key: 'fixture-key', byteCount: 1 }];
      (side === 'dbObjects' ? dbObjects : storageObjects)[0][field] = value;
      assert.throws(() => reconcileObjects({ dbObjects, storageObjects }), {
        message:
          side === 'dbObjects'
            ? 'Database inventory is invalid'
            : 'Storage inventory is invalid',
      });
    });
  }
  test(`reconcileObjects: does not coerce lifecycle ${field} objects`, () => {
    let coerced = false;
    const value = {
      toString() {
        coerced = true;
        return '2026-10-12T00:00:00Z';
      },
    };
    const row =
      side === 'dbObjects'
        ? inventoryDbRecord({ [field]: value })
        : { key: 'fixture-key', [field]: value };
    assert.throws(() => reconcileObjects({ [side]: [row] }), {
      message: inventoryError,
    });
    assert.strictEqual(coerced, false);
  });
}

for (const deletedAt of [true, 'private-deletion-sentinel']) {
  test(`reconcileObjects: malformed deletion ${typeof deletedAt} cannot conceal a missing object`, () => {
    assert.throws(
      () =>
        reconcileObjects({
          dbObjects: [inventoryDbRecord({ deletedAt })],
          storageObjects: [],
        }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const [label, patch, options] of [
  ['bucket', { bucket: 'other' }, { bucket: 'acres-quarantine' }],
  [
    'organization',
    { organizationId: 'other' },
    { organizationId: 'fixture-org' },
  ],
  ['prefix', {}, { prefix: 'other/' }],
  ['ignore', { objectKey: '.keep' }, {}],
  ['pending', { state: 'pending_upload' }, {}],
  ['deleted', { state: 'deleted' }, {}],
  ['expired', { uploadState: 'expired' }, {}],
  ['quarantine', { state: 'quarantined' }, { excludeQuarantined: true }],
]) {
  test(`reconcileObjects: malformed lifecycle cannot hide behind ${label}`, () => {
    assert.throws(
      () =>
        reconcileObjects({
          dbObjects: [inventoryDbRecord({ ...patch, createdAt: true })],
          options,
        }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const options of [{}, { prefix: 'other/' }]) {
  test(`reconcileObjects: ignored or filtered storage lifecycle still rejects (${Object.keys(options).length})`, () => {
    assert.throws(
      () =>
        reconcileObjects({
          storageObjects: [{ key: '.keep', lastModified: false }],
          options,
        }),
      { message: 'Storage inventory is invalid' },
    );
  });
}

for (const [side, field] of lifecycleDateFields) {
  test(`reconcileObjects: preserves optional and valid lifecycle ${field} without mutation`, () => {
    const epoch = Object.freeze(new Date(0));
    for (const value of [
      undefined,
      null,
      epoch,
      Object.freeze(new Date('2026-10-12T00:00:00Z')),
      '1970-01-01T00:00:00Z',
      '2026-10-12T01:00:00+01:00',
      'October 12, 2026 00:00:00 GMT',
    ]) {
      const row = Object.freeze(
        side === 'dbObjects'
          ? inventoryDbRecord({ [field]: value, extension: 'ignored' })
          : { key: 'fixture-key', byteCount: 1, [field]: value },
      );
      const records = Object.freeze([row]);
      const report = reconcileObjects({
        dbObjects: side === 'dbObjects' ? records : [inventoryDbRecord()],
        storageObjects:
          side === 'storageObjects'
            ? records
            : [{ key: 'fixture-key', byteCount: 1 }],
      });
      assert.strictEqual(report.summary.status, 'clean');
      assert.strictEqual(
        report.summary.pendingOrDeletedExcluded,
        field === 'deletedAt' && value != null ? 1 : 0,
      );
      assert.strictEqual(row[field], value);
      if (side === 'storageObjects') {
        const orphan = reconcileObjects({ storageObjects: records }).orphans[0];
        assert.strictEqual(orphan.lastModified, value ?? null);
      }
    }
    assert.strictEqual(epoch.getTime(), 0);
  });
}

test('reconcileObjects: preserves every valid StoredObjectState', () => {
  for (const state of [
    'pending_upload',
    'quarantined',
    'accepted',
    'rejected',
    'deleted',
  ]) {
    const report = reconcileObjects({
      dbObjects: [inventoryDbRecord({ state })],
      storageObjects: [{ key: 'fixture-key', byteCount: 1 }],
    });
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(
      report.summary.pendingOrDeletedExcluded,
      ['pending_upload', 'deleted'].includes(state) ? 1 : 0,
    );
  }
});

test('reconcileObjects: preserves every optional and valid UploadState', () => {
  for (const uploadState of [
    undefined,
    null,
    'pending_upload',
    'completed',
    'scanning',
    'accepted',
    'rejected',
    'cancelled',
    'expired',
  ]) {
    const report = reconcileObjects({
      dbObjects: [inventoryDbRecord({ state: 'pending_upload', uploadState })],
      storageObjects: [{ key: 'fixture-key', byteCount: 1 }],
    });
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(
      report.summary.pendingOrDeletedExcluded,
      uploadState == null ||
        ['pending_upload', 'cancelled', 'expired'].includes(uploadState)
        ? 1
        : 0,
    );
  }
});

test('reconcileObjects: preserves quarantine boundary and future-date policy', () => {
  for (const [createdAt, excluded] of [
    ['2026-10-05T23:59:59.999Z', 0],
    ['2026-10-06T00:00:00Z', 1],
    ['2026-10-12T00:00:00Z', 1],
    ['2026-10-14T00:00:00Z', 1],
  ]) {
    for (const value of [createdAt, new Date(createdAt)]) {
      const report = reconcileObjects({
        dbObjects: [
          inventoryDbRecord({ state: 'quarantined', createdAt: value }),
        ],
        storageObjects: [],
        options: { now: '2026-10-13T00:00:00Z' },
      });
      assert.strictEqual(report.summary.pendingOrDeletedExcluded, excluded);
      assert.strictEqual(report.summary.missingObjects, 1 - excluded);
    }
  }
});

for (const patch of [
  { state: undefined },
  { state: 'private-state-sentinel' },
  { uploadState: ['expired'] },
  { createdAt: new Date(NaN) },
  { deletedAt: true },
  { uploadExpiresAt: 'private-date-sentinel' },
]) {
  test(`queryDatabaseStoredObjects: rejects later malformed lifecycle ${Object.keys(patch)[0]}`, async () => {
    await assert.rejects(
      queryDatabaseStoredObjects({
        pgClient: {
          query: async () => ({
            rows: [
              inventoryDbRecord(),
              inventoryDbRecord({ id: 'later', ...patch }),
            ],
          }),
        },
      }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const [label, injected, expectedError] of [
  [
    'injected DB',
    { dbObjects: [inventoryDbRecord({ deletedAt: 'private-date-sentinel' })] },
    'Error: Reconciliation execution failed',
  ],
  [
    'injected storage',
    { storageObjects: [{ key: 'fixture-key', lastModified: false }] },
    'Error: Reconciliation execution failed',
  ],
  [
    'query DB',
    {
      pgClient: {
        query: async () => ({
          rows: [inventoryDbRecord({ state: 'private-state-sentinel' })],
        }),
      },
    },
    'Error: Database query failed',
  ],
]) {
  test(`main: invalid lifecycle ${label} fails without acquisition or publication`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-lifecycle-'));
    const io = createIo();
    let acquisitions = 0;
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
          pgClient: {
            connect: async () => {
              acquisitions++;
            },
          },
          s3Client: {
            send: async () => {
              acquisitions++;
            },
          },
          ...injected,
        },
      );
      assert.strictEqual(code, 1);
      assert.strictEqual(acquisitions, 0);
      assert.deepStrictEqual(io.errors, [expectedError]);
      assert.deepStrictEqual(
        io.logs,
        label === 'query DB'
          ? ['Connecting to PostgreSQL and Object Storage...']
          : [],
      );
      assert.ok(![...io.logs, ...io.errors].join('\n').includes('private-'));
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

const invalidComparisonOptions = [
  ['null options', null],
  ['array options', []],
  ['text options', 'private-option'],
  ['boolean options', false],
  ['numeric options', 42],
];
for (const field of ['bucket', 'organizationId', 'prefix']) {
  for (const value of [false, 42, {}, []]) {
    invalidComparisonOptions.push([
      `${field} ${typeof value}`,
      { [field]: value },
    ]);
  }
}
for (const field of ['excludeQuarantined', 'failOnOrphans']) {
  for (const value of [null, 'false', 0, 1, {}, []]) {
    invalidComparisonOptions.push([
      `${field} ${String(value)}`,
      { [field]: value },
    ]);
  }
}
for (const value of [
  null,
  -1,
  NaN,
  Infinity,
  -Infinity,
  '7',
  true,
  {},
  Number.MAX_VALUE,
  Number.MAX_SAFE_INTEGER,
]) {
  invalidComparisonOptions.push([
    `retention ${String(value)}`,
    { quarantineRetentionDays: value },
  ]);
}
for (const value of [
  null,
  0,
  false,
  {},
  '',
  ' ',
  'private-invalid-clock',
  new Date(NaN),
]) {
  invalidComparisonOptions.push([`clock ${String(value)}`, { now: value }]);
}
for (const value of [
  null,
  {},
  'private-pattern',
  new Array(1),
  [null],
  ['object'],
  [{ test: () => true }],
  [/valid/, false],
]) {
  invalidComparisonOptions.push([
    `patterns ${String(value)}`,
    { ignorePatterns: value },
  ]);
}
for (const value of [null, '', 'private-mode', false, 0, {}]) {
  invalidComparisonOptions.push([
    `mode ${String(value)}`,
    { execution_mode: value },
  ]);
}

for (const [label, options] of invalidComparisonOptions) {
  test(`reconcileObjects: invalid policy ${label} rejects even empty inventory`, () => {
    assert.throws(() => reconcileObjects({ options }), {
      message: 'Reconciliation options are invalid',
    });
  });
}

test('reconcileObjects: malformed policy cannot hide a missing quarantine object', () => {
  const dbObjects = [
    inventoryDbRecord({
      state: 'quarantined',
      createdAt: '2020-01-01T00:00:00Z',
    }),
  ];
  for (const options of [
    { excludeQuarantined: 'false' },
    { bucket: 42 },
    { quarantineRetentionDays: Infinity },
  ]) {
    assert.throws(() => reconcileObjects({ dbObjects, options }), {
      message: 'Reconciliation options are invalid',
    });
  }
});

test('reconcileObjects: undefined defaults, null-prototype records and unknown fields work', () => {
  const options = Object.assign(Object.create(null), {
    bucket: undefined,
    organizationId: undefined,
    prefix: undefined,
    failOnOrphans: undefined,
    excludeQuarantined: undefined,
    quarantineRetentionDays: undefined,
    now: undefined,
    ignorePatterns: undefined,
    execution_mode: undefined,
    futureExtension: 'ignored',
  });
  const report = reconcileObjects({ options: Object.freeze(options) });
  assert.strictEqual(report.summary.status, 'clean');
  assert.strictEqual(report.execution_mode, 'simulation');
});

for (const value of [null, '', undefined]) {
  test(`reconcileObjects: nullable/empty filters ${String(value)} preserve matching`, () => {
    const report = reconcileObjects({
      dbObjects: [inventoryDbRecord()],
      storageObjects: [{ key: 'fixture-key' }],
      options: { bucket: value, organizationId: value, prefix: value },
    });
    assert.strictEqual(report.summary.matchedObjects, 1);
    assert.strictEqual(report.summary.status, 'clean');
  });
}

test('reconcileObjects: opaque filter strings keep significant whitespace', () => {
  const report = reconcileObjects({
    dbObjects: [
      inventoryDbRecord({
        bucket: ' bucket ',
        organizationId: ' org ',
        objectKey: ' key ',
      }),
    ],
    storageObjects: [{ key: ' key ' }],
    options: { bucket: ' bucket ', organizationId: ' org ', prefix: ' key' },
  });
  assert.strictEqual(report.summary.matchedObjects, 1);
  assert.strictEqual(report.matched[0].objectKey, ' key ');
});

for (const failOnOrphans of [false, true]) {
  test(`reconcileObjects: boolean orphan policy ${failOnOrphans} remains intentional`, () => {
    const report = reconcileObjects({
      storageObjects: [{ key: 'orphan' }],
      options: { failOnOrphans },
    });
    assert.strictEqual(report.summary.status, 'warning');
    assert.strictEqual(report.summary.exitCode, failOnOrphans ? 1 : 0);
  });
}
for (const excludeQuarantined of [false, true]) {
  test(`reconcileObjects: boolean quarantine policy ${excludeQuarantined} remains intentional`, () => {
    const report = reconcileObjects({
      dbObjects: [
        inventoryDbRecord({
          state: 'quarantined',
          createdAt: '2020-01-01T00:00:00Z',
        }),
      ],
      options: { excludeQuarantined },
    });
    assert.strictEqual(
      report.summary.missingObjects,
      excludeQuarantined ? 0 : 1,
    );
    assert.strictEqual(
      report.summary.pendingOrDeletedExcluded,
      excludeQuarantined ? 1 : 0,
    );
  });
}

for (const now of [
  '2026-10-12T12:00:00Z',
  Object.freeze(new Date('2026-10-12T12:00:00Z')),
]) {
  for (const [days, excluded] of [
    [0, 0],
    [0.5, 1],
    [7, 2],
  ]) {
    test(`reconcileObjects: ${typeof now} clock and ${days} day retention honor boundary`, () => {
      const records = [
        '2026-10-12T00:00:00Z',
        '2026-10-11T23:59:59.999Z',
        '2026-10-05T11:59:59.999Z',
      ];
      const dbObjects = Object.freeze(
        records.map((createdAt, i) =>
          Object.freeze(
            inventoryDbRecord({
              id: `quarantine-${i}`,
              objectKey: `key-${i}`,
              state: 'quarantined',
              createdAt,
            }),
          ),
        ),
      );
      const report = reconcileObjects({
        dbObjects,
        options: Object.freeze({ now, quarantineRetentionDays: days }),
      });
      assert.strictEqual(report.summary.pendingOrDeletedExcluded, excluded);
      assert.strictEqual(report.summary.missingObjects, 3 - excluded);
    });
  }
}

test('reconcileObjects: exact seven-day retention boundary is included', () => {
  const report = reconcileObjects({
    dbObjects: [
      inventoryDbRecord({
        state: 'quarantined',
        createdAt: '2026-10-05T12:00:00Z',
      }),
    ],
    options: { now: '2026-10-12T12:00:00Z', quarantineRetentionDays: 7 },
  });
  assert.strictEqual(report.summary.pendingOrDeletedExcluded, 1);
});

test('reconcileObjects: finite representable retention duration remains supported', () => {
  const report = reconcileObjects({
    options: { quarantineRetentionDays: Number.MAX_SAFE_INTEGER / 86400000 },
  });
  assert.strictEqual(report.summary.status, 'clean');
});

for (const execution_mode of ['simulation', 'live']) {
  test(`reconcileObjects: supported ${execution_mode} mode remains unchanged`, () => {
    assert.strictEqual(
      reconcileObjects({ options: { execution_mode } }).execution_mode,
      execution_mode,
    );
  });
}

test('reconcileObjects: empty regex list includes default markers', () => {
  const storageObjects = [
    { key: '.keep' },
    { key: '.acres-readiness' },
    { key: '.DS_Store' },
  ];
  assert.strictEqual(
    reconcileObjects({ storageObjects }).summary.totalBucketObjects,
    0,
  );
  const report = reconcileObjects({
    storageObjects,
    options: { ignorePatterns: [] },
  });
  assert.strictEqual(report.summary.orphanObjects, 3);
});

for (const flags of ['', 'g', 'y', 'gy', 'gi']) {
  test(`reconcileObjects: regex ${flags || 'plain'} ignores repeatably without caller mutation`, () => {
    const pattern = /^ignored-/;
    const regex = new RegExp(pattern.source, flags);
    regex.lastIndex = 3;
    Object.freeze(regex);
    const ignorePatterns = Object.freeze([regex, /^other-marker$/]);
    const options = Object.freeze({ ignorePatterns });
    const dbObjects = ['ignored-a', 'ignored-b', 'kept'].map((key, i) =>
      Object.freeze(inventoryDbRecord({ id: `id-${i}`, objectKey: key })),
    );
    const storageObjects = [
      'ignored-a',
      'ignored-b',
      'kept',
      'other-marker',
    ].map((key) => Object.freeze({ key }));
    for (const reverse of [false, true, false]) {
      const report = reconcileObjects({
        dbObjects: Object.freeze(
          reverse ? [...dbObjects].reverse() : [...dbObjects],
        ),
        storageObjects: Object.freeze(
          reverse ? [...storageObjects].reverse() : [...storageObjects],
        ),
        options,
      });
      assert.strictEqual(report.summary.status, 'clean');
      assert.strictEqual(report.summary.totalBucketObjects, 1);
      assert.strictEqual(report.summary.activeDatabaseObjects, 1);
      assert.deepStrictEqual(
        report.matched.map((row) => row.objectKey),
        ['kept'],
      );
      assert.strictEqual(regex.lastIndex, 3);
    }
  });
}

test('reconcileObjects: sticky regex keeps anchored-at-zero matching semantics', () => {
  const pattern = /ignored/y;
  pattern.lastIndex = 2;
  const report = reconcileObjects({
    storageObjects: [{ key: 'ignored' }, { key: 'x-ignored' }],
    options: { ignorePatterns: [pattern] },
  });
  assert.deepStrictEqual(
    report.orphans.map((row) => row.key),
    ['x-ignored'],
  );
  assert.strictEqual(pattern.lastIndex, 2);
});

test('main: malformed effective policy fails without receipt or private diagnostics', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-invalid-policy-'));
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
        env: { STORAGE_BUCKET: { private: 'private-option-sentinel' } },
        dbObjects: [],
        storageObjects: [],
      },
    );
    assert.strictEqual(code, 1);
    assert.deepStrictEqual(io.errors, [
      'Error: Reconciliation execution failed',
    ]);
    assert.ok(!io.logs.join('\n').includes('Reconciliation Report'));
    assert.ok(!io.logs.join('\n').includes('evidence written'));
    assert.ok(
      ![...io.logs, ...io.errors]
        .join('\n')
        .includes('private-option-sentinel'),
    );
    assert.deepStrictEqual(fs.readdirSync(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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
        inventoryDbRecord({
          id: `id-${i}`,
          objectKey: `key-${i}`,
          byteCount,
          extra: 'preserved',
        }),
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

const invalidListingCounts = [
  ['null', null],
  ['negative', -1],
  ['fraction', 0.5],
  ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
  ['NaN', NaN],
  ['infinity', Infinity],
  ['negative infinity', -Infinity],
  ['numeric text', '0'],
  ['private text', 'private-count-sentinel'],
  ['boolean', false],
  ['bigint', 0n],
  ['array', []],
  ['object', {}],
  ['boxed number', new Number(0)],
  ['symbol', Symbol('private-count-sentinel')],
  [
    'coercible object',
    {
      valueOf() {
        throw new Error('private-count-coercion-must-not-run');
      },
    },
  ],
];

for (const [label, KeyCount] of invalidListingCounts) {
  test(`listBucketObjects: rejects ${label} key count without coercion`, async () => {
    const s3Client = listingClient([
      Object.freeze({ IsTruncated: false, KeyCount, Contents: [] }),
    ]);
    await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
      message: 'Object storage listing is invalid or incomplete',
    });
    assert.strictEqual(s3Client.inputs.length, 1);
  });
}

const contradictoryCountPages = [
  ['missing contents', { KeyCount: 1 }],
  ['empty contents', { KeyCount: 1, Contents: [] }],
  [
    'zero with objects',
    { KeyCount: 0, Contents: [{ Key: 'private-key', Size: 1 }] },
  ],
  [
    'short contents',
    { KeyCount: 2, Contents: [{ Key: 'private-key', Size: 1 }] },
  ],
  [
    'excess contents',
    {
      KeyCount: 1,
      Contents: [
        { Key: 'private-a', Size: 1 },
        { Key: 'private-b', Size: 2 },
      ],
    },
  ],
];

for (const [label, patch] of contradictoryCountPages) {
  for (const later of [false, true]) {
    test(`listBucketObjects: rejects ${later ? 'later' : 'first'} contradictory count (${label}) before pagination`, async () => {
      const pages = later
        ? [
            {
              IsTruncated: true,
              KeyCount: 1,
              Contents: [{ Key: 'valid', Size: 1 }],
              NextContinuationToken: 'private-A',
            },
          ]
        : [];
      pages.push(
        Object.freeze({
          ...patch,
          IsTruncated: true,
          NextContinuationToken: 'private-B',
        }),
      );
      pages.push({ IsTruncated: false, KeyCount: 0 });
      const s3Client = listingClient(pages);
      await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
        message: 'Object storage listing is invalid or incomplete',
      });
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
    });
  }
}

for (const [label, patch] of [
  ['omitted', {}],
  ['undefined', { KeyCount: undefined }],
  ['zero', { KeyCount: 0 }],
  ['negative zero', { KeyCount: -0 }],
]) {
  for (const Contents of [undefined, Object.freeze([])]) {
    test(`listBucketObjects: accepts ${label} count with ${Contents ? 'empty' : 'absent'} contents`, async () => {
      const page = Object.freeze({ ...patch, IsTruncated: false, Contents });
      assert.deepStrictEqual(
        await listBucketObjects({
          s3Client: listingClient([page]),
          bucket: 'fixture',
        }),
        [],
      );
    });
  }
}

test('listBucketObjects: counted and uncounted frozen pages preserve metadata and per-page counts', async () => {
  const date = new Date('2026-10-01T12:00:00Z');
  const checksum = Buffer.alloc(32, 0xab);
  const entry = Object.freeze({
    Key: 'scope/one',
    Size: 4,
    LastModified: date,
    ChecksumSHA256: checksum.toString('base64'),
  });
  const pages = Object.freeze([
    Object.freeze({
      IsTruncated: true,
      KeyCount: 1,
      Contents: Object.freeze([entry]),
      NextContinuationToken: ' token A ',
    }),
    Object.freeze({
      IsTruncated: true,
      KeyCount: 0,
      NextContinuationToken: 'B',
    }),
    Object.freeze({
      IsTruncated: true,
      Contents: Object.freeze([{ Key: 'scope/two', Size: 0 }]),
      NextContinuationToken: 'C',
    }),
    Object.freeze({
      IsTruncated: false,
      KeyCount: 1,
      Contents: Object.freeze([{ Key: 'scope/three', Size: 7 }]),
    }),
  ]);
  const s3Client = listingClient(pages);
  assert.deepStrictEqual(
    await listBucketObjects({ s3Client, bucket: 'fixture', prefix: 'scope/' }),
    [
      {
        key: 'scope/one',
        byteCount: 4,
        lastModified: date.toISOString(),
        checksumHex: checksum.toString('hex'),
      },
      { key: 'scope/two', byteCount: 0, lastModified: null, checksumHex: null },
      {
        key: 'scope/three',
        byteCount: 7,
        lastModified: null,
        checksumHex: null,
      },
    ],
  );
  assert.deepStrictEqual(
    s3Client.inputs.map((input) => input.ContinuationToken),
    [undefined, ' token A ', 'B', 'C'],
  );
  assert.strictEqual(pages[0].Contents[0], entry);
  assert.strictEqual(entry.LastModified, date);
});

for (const later of [false, true]) {
  test(`main: ${later ? 'later' : 'first'} terminal count contradiction publishes no evidence`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-count-failure-'));
    try {
      const pages = later
        ? [
            {
              IsTruncated: true,
              KeyCount: 1,
              Contents: [{ Key: 'valid', Size: 1 }],
              NextContinuationToken: 'private-token',
            },
          ]
        : [];
      pages.push({ IsTruncated: false, KeyCount: 1, Contents: [] });
      const io = createIo();
      const s3Client = listingClient(pages);
      const code = await main(
        [
          'node',
          'script',
          '--dry-run',
          '--output',
          path.join(dir, 'receipt.json'),
        ],
        io,
        { dbObjects: [], s3Client, env: {} },
      );
      assert.strictEqual(code, 1);
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
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

test('main: accurate per-page key counts publish a clean simulation receipt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-count-success-'));
  try {
    const target = path.join(dir, 'receipt.json');
    const io = createIo();
    const s3Client = listingClient([
      { IsTruncated: true, KeyCount: 0, NextContinuationToken: 'A' },
      {
        IsTruncated: false,
        KeyCount: 1,
        Contents: [{ Key: 'fixture-key', Size: 1 }],
      },
    ]);
    assert.strictEqual(
      await main(['node', 'script', '--dry-run', '--output', target], io, {
        env: {},
        dbObjects: [inventoryDbRecord()],
        s3Client,
      }),
      0,
    );
    assert.deepStrictEqual(io.errors, []);
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, 1);
    assert.strictEqual(report.summary.totalBucketObjects, 1);
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const invalidListingCommonPrefixes = [
  ['null', null],
  ['string', 'prefix/'],
  ['empty string', ''],
  ['numeric', 42],
  ['boolean true', true],
  ['boolean false', false],
  ['bigint', 1n],
  ['symbol', Symbol('prefix')],
  ['plain object', {}],
  ['boxed string', Object.freeze(new String('prefix/'))],
  [
    'coercible object',
    {
      valueOf() {
        throw new Error('private-prefix-coercion-must-not-run');
      },
    },
  ],
];

for (const [label, CommonPrefixes] of invalidListingCommonPrefixes) {
  test(`listBucketObjects: rejects ${label} CommonPrefixes without coercion`, async () => {
    const s3Client = listingClient([
      Object.freeze({ IsTruncated: false, CommonPrefixes, Contents: [] }),
    ]);
    await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
      message: 'Object storage listing is invalid or incomplete',
    });
    assert.strictEqual(s3Client.inputs.length, 1);
  });
}

const nonEmptyCommonPrefixPages = [
  ['single prefix', [{ Prefix: 'sub/' }]],
  ['multiple prefixes', [{ Prefix: 'a/' }, { Prefix: 'b/' }]],
  ['empty prefix string', [{ Prefix: '' }]],
  ['plain string entry', ['sub/']],
  ['empty entry object', [{}]],
];

for (const [label, CommonPrefixes] of nonEmptyCommonPrefixPages) {
  for (const later of [false, true]) {
    test(`listBucketObjects: rejects ${later ? 'later' : 'first'} non-empty CommonPrefixes (${label}) before pagination`, async () => {
      const pages = later
        ? [
            {
              IsTruncated: true,
              Contents: [{ Key: 'valid', Size: 1 }],
              NextContinuationToken: 'token-A',
            },
          ]
        : [];
      pages.push(
        Object.freeze({
          IsTruncated: true,
          CommonPrefixes: Object.freeze(CommonPrefixes),
          NextContinuationToken: 'token-B',
        }),
      );
      pages.push({ IsTruncated: false });
      const s3Client = listingClient(pages);
      await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
        message: 'Object storage listing is invalid or incomplete',
      });
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
    });
  }
}

for (const [label, patch] of [
  ['omitted', {}],
  ['undefined', { CommonPrefixes: undefined }],
  ['empty array', { CommonPrefixes: [] }],
  ['frozen empty array', { CommonPrefixes: Object.freeze([]) }],
]) {
  for (const Contents of [
    undefined,
    Object.freeze([]),
    Object.freeze([{ Key: 'fixture-key', Size: 10 }]),
  ]) {
    test(`listBucketObjects: accepts ${label} CommonPrefixes with ${Contents === undefined ? 'absent' : Contents.length === 0 ? 'empty' : 'populated'} contents`, async () => {
      const page = Object.freeze({ ...patch, IsTruncated: false, Contents });
      const result = await listBucketObjects({
        s3Client: listingClient([page]),
        bucket: 'fixture',
      });
      assert.strictEqual(result.length, Contents ? Contents.length : 0);
      if (Contents && Contents.length > 0) {
        assert.strictEqual(result[0].key, 'fixture-key');
        assert.strictEqual(result[0].byteCount, 10);
      }
    });
  }
}

for (const later of [false, true]) {
  test(`main: ${later ? 'later' : 'first'} terminal CommonPrefixes failure publishes no evidence`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-prefix-failure-'));
    try {
      const pages = later
        ? [
            {
              IsTruncated: true,
              Contents: [{ Key: 'valid', Size: 1 }],
              NextContinuationToken: 'private-token',
            },
          ]
        : [];
      pages.push({
        IsTruncated: false,
        CommonPrefixes: [{ Prefix: 'sub/' }],
        Contents: [],
      });
      const io = createIo();
      const s3Client = listingClient(pages);
      const code = await main(
        [
          'node',
          'script',
          '--dry-run',
          '--output',
          path.join(dir, 'receipt.json'),
        ],
        io,
        { dbObjects: [], s3Client, env: {} },
      );
      assert.strictEqual(code, 1);
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
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

test('main: empty CommonPrefixes array publishes a clean simulation receipt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-prefix-success-'));
  try {
    const target = path.join(dir, 'receipt.json');
    const io = createIo();
    const s3Client = listingClient([
      {
        IsTruncated: true,
        CommonPrefixes: [],
        NextContinuationToken: 'A',
      },
      {
        IsTruncated: false,
        CommonPrefixes: Object.freeze([]),
        Contents: [{ Key: 'fixture-key', Size: 1 }],
      },
    ]);
    assert.strictEqual(
      await main(['node', 'script', '--dry-run', '--output', target], io, {
        env: {},
        dbObjects: [inventoryDbRecord()],
        s3Client,
      }),
      0,
    );
    assert.deepStrictEqual(io.errors, []);
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, 1);
    assert.strictEqual(report.summary.totalBucketObjects, 1);
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const definedListingDelimiters = [
  ['slash string', '/'],
  ['backslash string', '\\'],
  ['dot string', '.'],
  ['pipe string', '|'],
  ['empty string', ''],
  ['whitespace string', '   '],
  ['null', null],
  ['numeric 42', 42],
  ['numeric zero', 0],
  ['boolean true', true],
  ['boolean false', false],
  ['bigint', 1n],
  ['symbol', Symbol('delimiter')],
  ['plain object', {}],
  ['boxed string', Object.freeze(new String('/'))],
  [
    'coercible object',
    {
      valueOf() {
        throw new Error('private-delimiter-coercion-must-not-run');
      },
    },
  ],
];

for (const [label, Delimiter] of definedListingDelimiters) {
  test(`listBucketObjects: rejects ${label} Delimiter without coercion`, async () => {
    const s3Client = listingClient([
      Object.freeze({ IsTruncated: false, Delimiter, Contents: [] }),
    ]);
    await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
      message: 'Object storage listing is invalid or incomplete',
    });
    assert.strictEqual(s3Client.inputs.length, 1);
  });
}

const delimitedPageSamples = [
  ['slash', '/'],
  ['empty string', ''],
  ['null', null],
  ['boolean true', true],
  ['numeric', 42],
  ['plain object', {}],
];

for (const [label, Delimiter] of delimitedPageSamples) {
  for (const later of [false, true]) {
    test(`listBucketObjects: rejects ${later ? 'later' : 'first'} defined Delimiter (${label}) before pagination`, async () => {
      const pages = later
        ? [
            {
              IsTruncated: true,
              Contents: [{ Key: 'valid', Size: 1 }],
              NextContinuationToken: 'token-A',
            },
          ]
        : [];
      pages.push(
        Object.freeze({
          IsTruncated: true,
          Delimiter,
          NextContinuationToken: 'token-B',
        }),
      );
      pages.push({ IsTruncated: false });
      const s3Client = listingClient(pages);
      await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
        message: 'Object storage listing is invalid or incomplete',
      });
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
    });
  }
}

for (const [label, patch] of [
  ['omitted', {}],
  ['undefined', { Delimiter: undefined }],
]) {
  for (const Contents of [
    undefined,
    Object.freeze([]),
    Object.freeze([{ Key: 'fixture-key', Size: 10 }]),
  ]) {
    test(`listBucketObjects: accepts ${label} Delimiter with ${Contents === undefined ? 'absent' : Contents.length === 0 ? 'empty' : 'populated'} contents`, async () => {
      const page = Object.freeze({ ...patch, IsTruncated: false, Contents });
      const result = await listBucketObjects({
        s3Client: listingClient([page]),
        bucket: 'fixture',
      });
      assert.strictEqual(result.length, Contents ? Contents.length : 0);
      if (Contents && Contents.length > 0) {
        assert.strictEqual(result[0].key, 'fixture-key');
        assert.strictEqual(result[0].byteCount, 10);
      }
    });
  }
}

for (const later of [false, true]) {
  test(`main: ${later ? 'later' : 'first'} terminal Delimiter failure publishes no evidence`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-delim-failure-'));
    try {
      const pages = later
        ? [
            {
              IsTruncated: true,
              Contents: [{ Key: 'valid', Size: 1 }],
              NextContinuationToken: 'private-token',
            },
          ]
        : [];
      pages.push({
        IsTruncated: false,
        Delimiter: '/',
        Contents: [],
      });
      const io = createIo();
      const s3Client = listingClient(pages);
      const code = await main(
        [
          'node',
          'script',
          '--dry-run',
          '--output',
          path.join(dir, 'receipt.json'),
        ],
        io,
        { dbObjects: [], s3Client, env: {} },
      );
      assert.strictEqual(code, 1);
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
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

test('main: undefined Delimiter publishes a clean simulation receipt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-delim-success-'));
  try {
    const target = path.join(dir, 'receipt.json');
    const io = createIo();
    const s3Client = listingClient([
      {
        IsTruncated: true,
        Delimiter: undefined,
        NextContinuationToken: 'A',
      },
      {
        IsTruncated: false,
        Delimiter: undefined,
        Contents: [{ Key: 'fixture-key', Size: 1 }],
      },
    ]);
    assert.strictEqual(
      await main(['node', 'script', '--dry-run', '--output', target], io, {
        env: {},
        dbObjects: [inventoryDbRecord()],
        s3Client,
      }),
      0,
    );
    assert.deepStrictEqual(io.errors, []);
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, 1);
    assert.strictEqual(report.summary.totalBucketObjects, 1);
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const definedListingEncodingTypes = [
  ['url string', 'url'],
  ['uppercase URL string', 'URL'],
  ['gzip string', 'gzip'],
  ['base64 string', 'base64'],
  ['empty string', ''],
  ['whitespace string', '   '],
  ['null', null],
  ['numeric 42', 42],
  ['numeric zero', 0],
  ['boolean true', true],
  ['boolean false', false],
  ['bigint', 1n],
  ['symbol', Symbol('encoding')],
  ['plain object', {}],
  ['boxed string', Object.freeze(new String('url'))],
  [
    'coercible object',
    {
      valueOf() {
        throw new Error('private-encoding-coercion-must-not-run');
      },
    },
  ],
];

for (const [label, EncodingType] of definedListingEncodingTypes) {
  test(`listBucketObjects: rejects ${label} EncodingType without coercion`, async () => {
    const s3Client = listingClient([
      Object.freeze({ IsTruncated: false, EncodingType, Contents: [] }),
    ]);
    await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
      message: 'Object storage listing is invalid or incomplete',
    });
    assert.strictEqual(s3Client.inputs.length, 1);
  });
}

const encodedPageSamples = [
  ['url', 'url'],
  ['empty string', ''],
  ['null', null],
  ['boolean true', true],
  ['numeric', 42],
  ['plain object', {}],
];

for (const [label, EncodingType] of encodedPageSamples) {
  for (const later of [false, true]) {
    test(`listBucketObjects: rejects ${later ? 'later' : 'first'} defined EncodingType (${label}) before pagination`, async () => {
      const pages = later
        ? [
            {
              IsTruncated: true,
              Contents: [{ Key: 'valid', Size: 1 }],
              NextContinuationToken: 'token-A',
            },
          ]
        : [];
      pages.push(
        Object.freeze({
          IsTruncated: true,
          EncodingType,
          NextContinuationToken: 'token-B',
        }),
      );
      pages.push({ IsTruncated: false });
      const s3Client = listingClient(pages);
      await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
        message: 'Object storage listing is invalid or incomplete',
      });
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
    });
  }
}

for (const [label, patch] of [
  ['omitted', {}],
  ['undefined', { EncodingType: undefined }],
]) {
  for (const Contents of [
    undefined,
    Object.freeze([]),
    Object.freeze([{ Key: 'fixture-key', Size: 10 }]),
  ]) {
    test(`listBucketObjects: accepts ${label} EncodingType with ${Contents === undefined ? 'absent' : Contents.length === 0 ? 'empty' : 'populated'} contents`, async () => {
      const page = Object.freeze({ ...patch, IsTruncated: false, Contents });
      const result = await listBucketObjects({
        s3Client: listingClient([page]),
        bucket: 'fixture',
      });
      assert.strictEqual(result.length, Contents ? Contents.length : 0);
      if (Contents && Contents.length > 0) {
        assert.strictEqual(result[0].key, 'fixture-key');
        assert.strictEqual(result[0].byteCount, 10);
      }
    });
  }
}

for (const later of [false, true]) {
  test(`main: ${later ? 'later' : 'first'} terminal EncodingType failure publishes no evidence`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-enc-failure-'));
    try {
      const pages = later
        ? [
            {
              IsTruncated: true,
              Contents: [{ Key: 'valid', Size: 1 }],
              NextContinuationToken: 'private-token',
            },
          ]
        : [];
      pages.push({
        IsTruncated: false,
        EncodingType: 'url',
        Contents: [],
      });
      const io = createIo();
      const s3Client = listingClient(pages);
      const code = await main(
        [
          'node',
          'script',
          '--dry-run',
          '--output',
          path.join(dir, 'receipt.json'),
        ],
        io,
        { dbObjects: [], s3Client, env: {} },
      );
      assert.strictEqual(code, 1);
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
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

test('main: undefined EncodingType publishes a clean simulation receipt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-enc-success-'));
  try {
    const target = path.join(dir, 'receipt.json');
    const io = createIo();
    const s3Client = listingClient([
      {
        IsTruncated: true,
        EncodingType: undefined,
        NextContinuationToken: 'A',
      },
      {
        IsTruncated: false,
        EncodingType: undefined,
        Contents: [{ Key: 'fixture-key', Size: 1 }],
      },
    ]);
    assert.strictEqual(
      await main(['node', 'script', '--dry-run', '--output', target], io, {
        env: {},
        dbObjects: [inventoryDbRecord()],
        s3Client,
      }),
      0,
    );
    assert.deepStrictEqual(io.errors, []);
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, 1);
    assert.strictEqual(report.summary.totalBucketObjects, 1);
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const definedListingStartAfterMarkers = [
  ['object key string', 'data/marker.csv'],
  ['prefixed key string', 'org-1/uploads/file.csv'],
  ['root key string', 'readme.txt'],
  ['arbitrary marker string', 'marker'],
  ['empty string', ''],
  ['whitespace string', '   '],
  ['null', null],
  ['numeric 42', 42],
  ['numeric zero', 0],
  ['boolean true', true],
  ['boolean false', false],
  ['bigint', 1n],
  ['symbol', Symbol('startAfter')],
  ['plain object', {}],
  ['boxed string', Object.freeze(new String('marker'))],
  [
    'coercible object',
    {
      valueOf() {
        throw new Error('private-start-after-coercion-must-not-run');
      },
    },
  ],
];

for (const [label, StartAfter] of definedListingStartAfterMarkers) {
  test(`listBucketObjects: rejects ${label} StartAfter without coercion`, async () => {
    const s3Client = listingClient([
      Object.freeze({ IsTruncated: false, StartAfter, Contents: [] }),
    ]);
    await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
      message: 'Object storage listing is invalid or incomplete',
    });
    assert.strictEqual(s3Client.inputs.length, 1);
  });
}

const startAfterPageSamples = [
  ['marker key', 'data/marker.csv'],
  ['empty string', ''],
  ['null', null],
  ['boolean true', true],
  ['numeric', 42],
  ['plain object', {}],
];

for (const [label, StartAfter] of startAfterPageSamples) {
  for (const later of [false, true]) {
    test(`listBucketObjects: rejects ${later ? 'later' : 'first'} defined StartAfter (${label}) before pagination`, async () => {
      const pages = later
        ? [
            {
              IsTruncated: true,
              Contents: [{ Key: 'valid', Size: 1 }],
              NextContinuationToken: 'token-A',
            },
          ]
        : [];
      pages.push(
        Object.freeze({
          IsTruncated: true,
          StartAfter,
          NextContinuationToken: 'token-B',
        }),
      );
      pages.push({ IsTruncated: false });
      const s3Client = listingClient(pages);
      await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
        message: 'Object storage listing is invalid or incomplete',
      });
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
    });
  }
}

for (const [label, patch] of [
  ['omitted', {}],
  ['undefined', { StartAfter: undefined }],
]) {
  for (const Contents of [
    undefined,
    Object.freeze([]),
    Object.freeze([{ Key: 'fixture-key', Size: 10 }]),
  ]) {
    test(`listBucketObjects: accepts ${label} StartAfter with ${Contents === undefined ? 'absent' : Contents.length === 0 ? 'empty' : 'populated'} contents`, async () => {
      const page = Object.freeze({ ...patch, IsTruncated: false, Contents });
      const result = await listBucketObjects({
        s3Client: listingClient([page]),
        bucket: 'fixture',
      });
      assert.strictEqual(result.length, Contents ? Contents.length : 0);
      if (Contents && Contents.length > 0) {
        assert.strictEqual(result[0].key, 'fixture-key');
        assert.strictEqual(result[0].byteCount, 10);
      }
    });
  }
}

for (const later of [false, true]) {
  test(`main: ${later ? 'later' : 'first'} terminal StartAfter failure publishes no evidence`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-sa-failure-'));
    try {
      const pages = later
        ? [
            {
              IsTruncated: true,
              Contents: [{ Key: 'valid', Size: 1 }],
              NextContinuationToken: 'private-token',
            },
          ]
        : [];
      pages.push({
        IsTruncated: false,
        StartAfter: 'data/marker.csv',
        Contents: [],
      });
      const io = createIo();
      const s3Client = listingClient(pages);
      const code = await main(
        [
          'node',
          'script',
          '--dry-run',
          '--output',
          path.join(dir, 'receipt.json'),
        ],
        io,
        { dbObjects: [], s3Client, env: {} },
      );
      assert.strictEqual(code, 1);
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
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

test('main: undefined StartAfter publishes a clean simulation receipt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-sa-success-'));
  try {
    const target = path.join(dir, 'receipt.json');
    const io = createIo();
    const s3Client = listingClient([
      {
        IsTruncated: true,
        StartAfter: undefined,
        NextContinuationToken: 'A',
      },
      {
        IsTruncated: false,
        StartAfter: undefined,
        Contents: [{ Key: 'fixture-key', Size: 1 }],
      },
    ]);
    assert.strictEqual(
      await main(['node', 'script', '--dry-run', '--output', target], io, {
        env: {},
        dbObjects: [inventoryDbRecord()],
        s3Client,
      }),
      0,
    );
    assert.deepStrictEqual(io.errors, []);
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, 1);
    assert.strictEqual(report.summary.totalBucketObjects, 1);
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const definedInitialListingContinuationTokens = [
  ['token string', 'page-2-token'],
  ['arbitrary token string', 'token-marker'],
  ['empty string', ''],
  ['whitespace string', '   '],
  ['null', null],
  ['numeric 42', 42],
  ['numeric zero', 0],
  ['boolean true', true],
  ['boolean false', false],
  ['bigint', 1n],
  ['symbol', Symbol('token')],
  ['plain object', {}],
  ['boxed string', new String('token')],
  [
    'coercible object',
    {
      valueOf() {
        throw new Error('private-token-valueOf-error');
      },
    },
  ],
];

for (const [label, ContinuationToken] of definedInitialListingContinuationTokens) {
  test(`listBucketObjects: rejects ${label} initial ContinuationToken without coercion`, async () => {
    const s3Client = listingClient([
      Object.freeze({ IsTruncated: false, ContinuationToken, Contents: [] }),
    ]);
    await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
      message: 'Object storage listing is invalid or incomplete',
    });
    assert.strictEqual(s3Client.inputs.length, 1);
  });
}

const mismatchedLaterContinuationTokenSamples = [
  ['mismatched token string', 'token-B'],
  ['empty string', ''],
  ['null', null],
  ['boolean true', true],
  ['numeric', 42],
  ['plain object', {}],
];

for (const [label, ContinuationToken] of mismatchedLaterContinuationTokenSamples) {
  test(`listBucketObjects: rejects later mismatched ContinuationToken (${label}) before pagination`, async () => {
    const pages = [
      {
        IsTruncated: true,
        Contents: [{ Key: 'valid', Size: 1 }],
        NextContinuationToken: 'token-A',
      },
      Object.freeze({
        IsTruncated: true,
        ContinuationToken,
        NextContinuationToken: 'token-B',
      }),
      { IsTruncated: false },
    ];
    const s3Client = listingClient(pages);
    await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
      message: 'Object storage listing is invalid or incomplete',
    });
    assert.strictEqual(s3Client.inputs.length, 2);
  });
}

test('listBucketObjects: accepts matching ContinuationToken on later page', async () => {
  const s3Client = listingClient([
    {
      IsTruncated: true,
      Contents: [{ Key: 'first', Size: 1 }],
      NextContinuationToken: 'token-A',
    },
    {
      IsTruncated: false,
      ContinuationToken: 'token-A',
      Contents: [{ Key: 'second', Size: 2 }],
    },
  ]);
  const result = await listBucketObjects({ s3Client, bucket: 'fixture' });
  assert.strictEqual(result.length, 2);
  assert.strictEqual(s3Client.inputs.length, 2);
  assert.strictEqual(s3Client.inputs[1].ContinuationToken, 'token-A');
});

for (const [label, patch] of [
  ['omitted', {}],
  ['undefined', { ContinuationToken: undefined }],
]) {
  for (const Contents of [
    undefined,
    Object.freeze([]),
    Object.freeze([{ Key: 'fixture-key', Size: 10 }]),
  ]) {
    test(`listBucketObjects: accepts ${label} ContinuationToken with ${Contents === undefined ? 'absent' : Contents.length === 0 ? 'empty' : 'populated'} contents`, async () => {
      const page = Object.freeze({ ...patch, IsTruncated: false, Contents });
      const result = await listBucketObjects({
        s3Client: listingClient([page]),
        bucket: 'fixture',
      });
      assert.strictEqual(
        result.length,
        Contents && Contents.length ? Contents.length : 0,
      );
    });
  }
}

test('main: initial defined ContinuationToken failure publishes no evidence', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-ct-init-failure-'));
  try {
    const io = createIo();
    const s3Client = listingClient([
      {
        IsTruncated: false,
        ContinuationToken: 'page-2-token',
        Contents: [],
      },
    ]);
    const code = await main(
      [
        'node',
        'script',
        '--dry-run',
        '--output',
        path.join(dir, 'receipt.json'),
      ],
      io,
      { dbObjects: [], s3Client, env: {} },
    );
    assert.strictEqual(code, 1);
    assert.strictEqual(s3Client.inputs.length, 1);
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

test('main: later mismatched ContinuationToken failure publishes no evidence', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-ct-later-failure-'));
  try {
    const io = createIo();
    const s3Client = listingClient([
      {
        IsTruncated: true,
        Contents: [{ Key: 'valid', Size: 1 }],
        NextContinuationToken: 'token-A',
      },
      {
        IsTruncated: false,
        ContinuationToken: 'token-wrong',
        Contents: [],
      },
    ]);
    const code = await main(
      [
        'node',
        'script',
        '--dry-run',
        '--output',
        path.join(dir, 'receipt.json'),
      ],
      io,
      { dbObjects: [], s3Client, env: {} },
    );
    assert.strictEqual(code, 1);
    assert.strictEqual(s3Client.inputs.length, 2);
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

test('main: matching ContinuationToken publishes a clean simulation receipt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-ct-success-'));
  try {
    const target = path.join(dir, 'receipt.json');
    const io = createIo();
    const s3Client = listingClient([
      {
        IsTruncated: true,
        ContinuationToken: undefined,
        NextContinuationToken: 'A',
      },
      {
        IsTruncated: false,
        ContinuationToken: 'A',
        Contents: [{ Key: 'fixture-key', Size: 1 }],
      },
    ]);
    assert.strictEqual(
      await main(['node', 'script', '--dry-run', '--output', target], io, {
        env: {},
        dbObjects: [inventoryDbRecord()],
        s3Client,
      }),
      0,
    );
    assert.deepStrictEqual(io.errors, []);
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, 1);
    assert.strictEqual(report.summary.totalBucketObjects, 1);
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const definedTerminalNextContinuationTokens = [
  ['token string', 'token-1'],
  ['arbitrary token string', 'page-2-token'],
  ['empty string', ''],
  ['whitespace string', '   '],
  ['null', null],
  ['numeric 42', 42],
  ['numeric zero', 0],
  ['boolean true', true],
  ['boolean false', false],
  ['bigint', 1n],
  ['symbol', Symbol('token')],
  ['plain object', {}],
  ['boxed string', new String('token')],
  [
    'coercible object',
    {
      valueOf() {
        throw new Error('private-token-valueOf-error');
      },
    },
  ],
];

for (const [label, NextContinuationToken] of definedTerminalNextContinuationTokens) {
  test(`listBucketObjects: rejects ${label} terminal NextContinuationToken without coercion`, async () => {
    const s3Client = listingClient([
      Object.freeze({ IsTruncated: false, NextContinuationToken, Contents: [] }),
    ]);
    await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
      message: 'Object storage listing is invalid or incomplete',
    });
    assert.strictEqual(s3Client.inputs.length, 1);
  });
}

const definedLaterTerminalNextContinuationTokenSamples = [
  ['token string', 'token-B'],
  ['empty string', ''],
  ['null', null],
  ['boolean true', true],
  ['numeric', 42],
  ['plain object', {}],
];

for (const [label, NextContinuationToken] of definedLaterTerminalNextContinuationTokenSamples) {
  test(`listBucketObjects: rejects later terminal NextContinuationToken (${label}) before pagination`, async () => {
    const pages = [
      {
        IsTruncated: true,
        Contents: [{ Key: 'valid', Size: 1 }],
        NextContinuationToken: 'token-A',
      },
      Object.freeze({
        IsTruncated: false,
        ContinuationToken: 'token-A',
        NextContinuationToken,
        Contents: [{ Key: 'second', Size: 2 }],
      }),
      { IsTruncated: false },
    ];
    const s3Client = listingClient(pages);
    await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
      message: 'Object storage listing is invalid or incomplete',
    });
    assert.strictEqual(s3Client.inputs.length, 2);
  });
}

test('listBucketObjects: accepts multi-page listing with clean terminal NextContinuationToken', async () => {
  const s3Client = listingClient([
    {
      IsTruncated: true,
      Contents: [{ Key: 'first', Size: 1 }],
      NextContinuationToken: 'token-A',
    },
    {
      IsTruncated: false,
      ContinuationToken: 'token-A',
      Contents: [{ Key: 'second', Size: 2 }],
    },
  ]);
  const result = await listBucketObjects({ s3Client, bucket: 'fixture' });
  assert.strictEqual(result.length, 2);
  assert.strictEqual(s3Client.inputs.length, 2);
  assert.strictEqual(s3Client.inputs[1].ContinuationToken, 'token-A');
});

for (const [label, patch] of [
  ['omitted', {}],
  ['undefined', { NextContinuationToken: undefined }],
]) {
  for (const Contents of [
    undefined,
    Object.freeze([]),
    Object.freeze([{ Key: 'fixture-key', Size: 10 }]),
  ]) {
    test(`listBucketObjects: accepts ${label} terminal NextContinuationToken with ${Contents === undefined ? 'absent' : Contents.length === 0 ? 'empty' : 'populated'} contents`, async () => {
      const page = Object.freeze({ ...patch, IsTruncated: false, Contents });
      const result = await listBucketObjects({
        s3Client: listingClient([page]),
        bucket: 'fixture',
      });
      assert.strictEqual(
        result.length,
        Contents && Contents.length ? Contents.length : 0,
      );
    });
  }
}

test('main: initial terminal defined NextContinuationToken failure publishes no evidence', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-nct-init-failure-'));
  try {
    const io = createIo();
    const s3Client = listingClient([
      {
        IsTruncated: false,
        NextContinuationToken: 'rogue-token',
        Contents: [],
      },
    ]);
    const code = await main(
      [
        'node',
        'script',
        '--dry-run',
        '--output',
        path.join(dir, 'receipt.json'),
      ],
      io,
      { dbObjects: [], s3Client, env: {} },
    );
    assert.strictEqual(code, 1);
    assert.strictEqual(s3Client.inputs.length, 1);
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

test('main: later terminal defined NextContinuationToken failure publishes no evidence', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-nct-later-failure-'));
  try {
    const io = createIo();
    const s3Client = listingClient([
      {
        IsTruncated: true,
        Contents: [{ Key: 'valid', Size: 1 }],
        NextContinuationToken: 'token-A',
      },
      {
        IsTruncated: false,
        ContinuationToken: 'token-A',
        NextContinuationToken: 'rogue-token-B',
        Contents: [],
      },
    ]);
    const code = await main(
      [
        'node',
        'script',
        '--dry-run',
        '--output',
        path.join(dir, 'receipt.json'),
      ],
      io,
      { dbObjects: [], s3Client, env: {} },
    );
    assert.strictEqual(code, 1);
    assert.strictEqual(s3Client.inputs.length, 2);
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

test('main: clean terminal NextContinuationToken publishes a clean simulation receipt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-nct-success-'));
  try {
    const target = path.join(dir, 'receipt.json');
    const io = createIo();
    const s3Client = listingClient([
      {
        IsTruncated: true,
        ContinuationToken: undefined,
        NextContinuationToken: 'A',
      },
      {
        IsTruncated: false,
        ContinuationToken: 'A',
        NextContinuationToken: undefined,
        Contents: [{ Key: 'fixture-key', Size: 1 }],
      },
    ]);
    assert.strictEqual(
      await main(['node', 'script', '--dry-run', '--output', target], io, {
        env: {},
        dbObjects: [inventoryDbRecord()],
        s3Client,
      }),
      0,
    );
    assert.deepStrictEqual(io.errors, []);
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, 1);
    assert.strictEqual(report.summary.totalBucketObjects, 1);
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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
      Contents: [{ Key: 'scope/ folder/ ', Size: 0, LastModified: date }],
    },
    { IsTruncated: true, NextContinuationToken: 'token-B' },
    {
      IsTruncated: false,
      Contents: [{ Key: 'scope/file', Size: 42 }],
    },
  ]);
  assert.deepStrictEqual(
    await listBucketObjects({ s3Client, bucket: 'fixture', prefix: 'scope/' }),
    [
      {
        key: 'scope/ folder/ ',
        byteCount: 0,
        lastModified: date.toISOString(),
        checksumHex: null,
      },
      { key: 'scope/file', byteCount: 42, lastModified: null, checksumHex: null },
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

// Prefix echoes bind each page to the requested inventory scope.
const invalidPrefixEchoes = [
  ['null', null],
  ['number', 1],
  ['false', false],
  ['true', true],
  ['bigint', 1n],
  ['symbol', Symbol('private-prefix')],
  ['array', []],
  ['object', {}],
  ['boxed string', new String('scope/')],
  [
    'coercible object',
    {
      toString() {
        throw new Error('private-prefix');
      },
    },
  ],
  ['other scope', 'private-other/'],
  ['whitespace', ' scope/'],
  ['case mismatch', 'Scope/'],
];
for (const prefix of [undefined, 'scope/']) {
  for (const [label, Prefix] of invalidPrefixEchoes) {
    test(`listBucketObjects: rejects ${label} prefix echo for ${prefix === undefined ? 'bucket' : 'scoped'} listing`, async () => {
      const s3Client = listingClient([
        Object.freeze({ IsTruncated: false, Prefix, Contents: [] }),
      ]);
      await assert.rejects(
        listBucketObjects({ s3Client, bucket: 'fixture', prefix }),
        { message: 'Object storage listing is invalid or incomplete' },
      );
      assert.strictEqual(s3Client.inputs.length, 1);
    });
  }
  test(`listBucketObjects: rejects later prefix echo mismatch for ${prefix === undefined ? 'bucket' : 'scoped'} listing`, async () => {
    const s3Client = listingClient([
      Object.freeze({
        IsTruncated: true,
        Prefix: prefix || '',
        NextContinuationToken: 'A',
        Contents: [{ Key: 'scope/first', Size: 1 }],
      }),
      Object.freeze({
        IsTruncated: true,
        Prefix: 'private-other/',
        NextContinuationToken: 'B',
        Contents: [],
      }),
      { IsTruncated: false },
    ]);
    await assert.rejects(
      listBucketObjects({ s3Client, bucket: 'fixture', prefix }),
      { message: 'Object storage listing is invalid or incomplete' },
    );
    assert.strictEqual(s3Client.inputs.length, 2);
  });
}

for (const prefix of [undefined, '', 'scope/', ' space/é%2F/']) {
  for (const echo of [{}, { Prefix: undefined }, { Prefix: prefix || '' }]) {
    for (const populated of [false, true]) {
      test(`listBucketObjects: accepts compatible prefix echo ${JSON.stringify(echo)} for ${JSON.stringify(prefix)} (${populated})`, async () => {
        const key = `${prefix || ''}file`;
        const s3Client = listingClient([
          Object.freeze({
            IsTruncated: true,
            ...echo,
            NextContinuationToken: 'A',
          }),
          Object.freeze({
            IsTruncated: false,
            ...echo,
            Contents: Object.freeze(
              populated ? [Object.freeze({ Key: key, Size: 1 })] : [],
            ),
          }),
        ]);
        const result = await listBucketObjects({
          s3Client,
          bucket: 'fixture',
          prefix,
        });
        assert.deepStrictEqual(
          result,
          populated
            ? [{ key, byteCount: 1, lastModified: null, checksumHex: null }]
            : [],
        );
        assert.deepStrictEqual(
          s3Client.inputs.map(input => input.Prefix),
          [prefix || undefined, prefix || undefined],
        );
        assert.deepStrictEqual(
          s3Client.inputs.map(input => input.ContinuationToken),
          [undefined, 'A'],
        );
      });
    }
  }
}

test('listBucketObjects: rejects empty prefix echo for scoped request', async () => {
  await assert.rejects(
    listBucketObjects({
      bucket: 'fixture',
      prefix: 'scope/',
      s3Client: listingClient([{ IsTruncated: false, Prefix: '' }]),
    }),
    { message: 'Object storage listing is invalid or incomplete' },
  );
});

for (const later of [false, true]) {
  test(`main: ${later ? 'later' : 'first'} prefix echo mismatch publishes no evidence`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-prefix-failure-'));
    try {
      const io = createIo();
      const s3Client = listingClient([
        ...(later
          ? [
              {
                IsTruncated: true,
                Prefix: 'scope/',
                NextContinuationToken: 'A',
              },
            ]
          : []),
        { IsTruncated: false, Prefix: 'private-other/', Contents: [] },
      ]);
      assert.strictEqual(
        await main(
          [
            'node',
            'script',
            '--dry-run',
            '--prefix',
            'scope/',
            '--output',
            path.join(dir, 'receipt.json'),
          ],
          io,
          { dbObjects: [], s3Client, env: {} },
        ),
        1,
      );
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
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

test('main: matching scoped prefix echoes publish clean simulation receipt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-prefix-success-'));
  try {
    const io = createIo();
    const target = path.join(dir, 'receipt.json');
    const s3Client = listingClient([
      { IsTruncated: true, Prefix: 'fixture-', NextContinuationToken: 'A' },
      {
        IsTruncated: false,
        Prefix: 'fixture-',
        Contents: [{ Key: 'fixture-key', Size: 1 }],
      },
    ]);
    assert.strictEqual(
      await main(
        [
          'node',
          'script',
          '--dry-run',
          '--prefix',
          'fixture-',
          '--output',
          target,
        ],
        io,
        { dbObjects: [inventoryDbRecord()], s3Client, env: {} },
      ),
      0,
    );
    assert.deepStrictEqual(io.errors, []);
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, 1);
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Declared page maxima cannot contradict the flat inventory count.
const invalidListingMaxima = [
  ['null', null],
  ['negative', -1],
  ['fraction', 0.5],
  ['unsafe', Number.MAX_SAFE_INTEGER + 1],
  ['NaN', NaN],
  ['infinity', Infinity],
  ['negative infinity', -Infinity],
  ['numeric string', '1'],
  ['boolean false', false],
  ['boolean true', true],
  ['bigint', 1n],
  ['symbol', Symbol('private-maximum')],
  ['array', []],
  ['object', {}],
  ['boxed number', new Number(1)],
  [
    'coercible object',
    {
      valueOf() {
        throw new Error('private-maximum');
      },
    },
  ],
];
for (const later of [false, true]) {
  for (const [label, MaxKeys] of invalidListingMaxima) {
    test(`listBucketObjects: rejects ${later ? 'later' : 'first'} ${label} MaxKeys without coercion`, async () => {
      const s3Client = listingClient([
        ...(later
          ? [
              Object.freeze({
                IsTruncated: true,
                MaxKeys: 1,
                NextContinuationToken: 'A',
                Contents: [{ Key: 'first', Size: 1 }],
              }),
            ]
          : []),
        Object.freeze({
          IsTruncated: true,
          MaxKeys,
          NextContinuationToken: 'B',
          Contents: [],
        }),
        { IsTruncated: false },
      ]);
      await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
        message: 'Object storage listing is invalid or incomplete',
      });
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
    });
  }
  for (const MaxKeys of [0, 1]) {
    for (const withCount of [false, true]) {
      test(`listBucketObjects: rejects ${later ? 'later' : 'first'} MaxKeys ${MaxKeys} below contents (${withCount})`, async () => {
        const Contents = Array.from({ length: MaxKeys + 1 }, (_, i) =>
          Object.freeze({ Key: `next-${i}`, Size: i }),
        );
        const s3Client = listingClient([
          ...(later
            ? [
                {
                  IsTruncated: true,
                  NextContinuationToken: 'A',
                  Contents: [{ Key: 'first', Size: 1 }],
                },
              ]
            : []),
          Object.freeze({
            IsTruncated: true,
            MaxKeys,
            ...(withCount ? { KeyCount: Contents.length } : {}),
            NextContinuationToken: 'B',
            Contents: Object.freeze(Contents),
          }),
          { IsTruncated: false },
        ]);
        await assert.rejects(
          listBucketObjects({ s3Client, bucket: 'fixture' }),
          { message: 'Object storage listing is invalid or incomplete' },
        );
        assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
      });
    }
  }
}

for (const [label, fields] of [
  ['omitted', {}],
  ['undefined', { MaxKeys: undefined }],
  ['zero', { MaxKeys: 0 }],
  ['negative zero', { MaxKeys: -0 }],
  ['one', { MaxKeys: 1 }],
  ['greater', { MaxKeys: 2 }],
  ['over default', { MaxKeys: 2000 }],
  ['largest safe', { MaxKeys: Number.MAX_SAFE_INTEGER }],
]) {
  for (const Contents of [undefined, [], [{ Key: 'fixture-key', Size: 1 }]]) {
    if (fields.MaxKeys === 0 && Contents?.length) continue;
    test(`listBucketObjects: accepts ${label} MaxKeys with ${Contents === undefined ? 'omitted' : Contents.length ? 'populated' : 'empty'} contents`, async () => {
      const page = Object.freeze({
        IsTruncated: false,
        ...fields,
        KeyCount: Contents?.length ?? 0,
        Contents: Contents && Object.freeze(Contents),
      });
      const s3Client = listingClient([page]);
      assert.deepStrictEqual(
        await listBucketObjects({ s3Client, bucket: 'fixture' }),
        Contents?.length
          ? [
              {
                key: 'fixture-key',
                byteCount: 1,
                lastModified: null,
                checksumHex: null,
              },
            ]
          : [],
      );
      assert.strictEqual(Object.hasOwn(s3Client.inputs[0], 'MaxKeys'), false);
    });
  }
}

test('listBucketObjects: validates varying per-page MaxKeys without guessing EOF', async () => {
  const s3Client = listingClient([
    Object.freeze({
      IsTruncated: true,
      MaxKeys: 0,
      KeyCount: 0,
      NextContinuationToken: 'A',
    }),
    Object.freeze({
      IsTruncated: true,
      MaxKeys: 2,
      KeyCount: 1,
      NextContinuationToken: 'B',
      Contents: [{ Key: 'one', Size: 1 }],
    }),
    Object.freeze({
      IsTruncated: false,
      MaxKeys: 1,
      KeyCount: 1,
      Contents: [{ Key: 'two', Size: 2 }],
    }),
  ]);
  const result = await listBucketObjects({ s3Client, bucket: 'fixture' });
  assert.deepStrictEqual(
    result.map(item => item.key),
    ['one', 'two'],
  );
  assert.deepStrictEqual(
    s3Client.inputs.map(input => input.ContinuationToken),
    [undefined, 'A', 'B'],
  );
  assert.ok(s3Client.inputs.every(input => !Object.hasOwn(input, 'MaxKeys')));
});

for (const later of [false, true]) {
  test(`main: ${later ? 'later' : 'first'} contradictory MaxKeys publishes no evidence`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-maxkeys-failure-'),
    );
    try {
      const io = createIo();
      const s3Client = listingClient([
        ...(later
          ? [{ IsTruncated: true, MaxKeys: 0, NextContinuationToken: 'A' }]
          : []),
        {
          IsTruncated: false,
          MaxKeys: 0,
          Contents: [{ Key: 'private-key', Size: 1 }],
        },
      ]);
      assert.strictEqual(
        await main(
          [
            'node',
            'script',
            '--dry-run',
            '--output',
            path.join(dir, 'receipt.json'),
          ],
          io,
          { dbObjects: [], s3Client, env: {} },
        ),
        1,
      );
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
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

test('main: compatible MaxKeys publish a clean simulation receipt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-maxkeys-success-'));
  try {
    const target = path.join(dir, 'receipt.json');
    const io = createIo();
    const s3Client = listingClient([
      {
        IsTruncated: true,
        MaxKeys: 0,
        KeyCount: 0,
        NextContinuationToken: 'A',
      },
      {
        IsTruncated: false,
        MaxKeys: 2,
        KeyCount: 1,
        Contents: [{ Key: 'fixture-key', Size: 1 }],
      },
    ]);
    assert.strictEqual(
      await main(['node', 'script', '--dry-run', '--output', target], io, {
        dbObjects: [inventoryDbRecord()],
        s3Client,
        env: {},
      }),
      0,
    );
    assert.deepStrictEqual(io.errors, []);
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, 1);
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const invalidRequestScopeValues = [
  ['null', null],
  ['true', true],
  ['false', false],
  ['zero', 0],
  ['NaN', NaN],
  ['bigint', 0n],
  ['symbol', Symbol('private-scope')],
  ['array', []],
  ['object', {}],
  ['boxed string', new String('private-scope')],
  ['function', () => 'private-scope'],
  [
    'coercion trap',
    Object.freeze({
      toString() {
        throw new Error('private-scope-coercion');
      },
      valueOf() {
        throw new Error('private-scope-coercion');
      },
      [Symbol.toPrimitive]() {
        throw new Error('private-scope-coercion');
      },
    }),
  ],
];

for (const field of ['bucket', 'prefix']) {
  for (const [label, value] of invalidRequestScopeValues) {
    test(`listBucketObjects: rejects ${label} request ${field} before acquisition`, async () => {
      const s3Client = listingClient([{ IsTruncated: false }]);
      await assert.rejects(
        listBucketObjects(
          Object.freeze({ s3Client, bucket: 'fixture', [field]: value }),
        ),
        {
          message: 'Object storage listing is invalid or incomplete',
        },
      );
      assert.deepStrictEqual(s3Client.inputs, []);
    });
  }
}

for (const [label, fields] of [
  ['missing', {}],
  ['undefined', { bucket: undefined }],
  ['empty', { bucket: '' }],
  ['space', { bucket: ' ' }],
  ['mixed whitespace', { bucket: '\t\n ' }],
]) {
  test(`listBucketObjects: rejects ${label} request bucket before acquisition`, async () => {
    const s3Client = listingClient([{ IsTruncated: false }]);
    await assert.rejects(listBucketObjects({ s3Client, ...fields }), {
      message: 'Object storage listing is invalid or incomplete',
    });
    assert.deepStrictEqual(s3Client.inputs, []);
  });
}

for (const [label, fields] of [
  ['omitted prefix', { bucket: 'fixture' }],
  ['undefined prefix', { bucket: 'fixture', prefix: undefined }],
  ['empty prefix', { bucket: 'fixture', prefix: '' }],
  ['whitespace prefix', { bucket: 'fixture', prefix: ' \t' }],
  ['opaque prefix', { bucket: 'fixture', prefix: 'é/%2F/../[x]/' }],
  ['bucket whitespace preserved', { bucket: ' fixture ', prefix: 'scope/' }],
  ['bucket alias', { bucket: 'fixture-alias-s3alias', prefix: 'scope/' }],
  [
    'bucket ARN',
    {
      bucket: 'arn:aws:s3:us-east-1:123456789012:accesspoint/fixture',
      prefix: 'scope/',
    },
  ],
]) {
  test(`listBucketObjects: preserves valid request scope (${label})`, async () => {
    const key = `${fields.prefix || ''}key`;
    const s3Client = listingClient([
      Object.freeze({
        IsTruncated: false,
        Contents: Object.freeze([Object.freeze({ Key: key, Size: 1 })]),
      }),
    ]);
    const request = Object.freeze({ s3Client, ...fields });
    const result = await listBucketObjects(request);
    assert.deepStrictEqual(s3Client.inputs, [
      {
        Bucket: fields.bucket,
        Prefix: fields.prefix || undefined,
        ContinuationToken: undefined,
      },
    ]);
    assert.deepStrictEqual(result, [
      { key, byteCount: 1, lastModified: null, checksumHex: null },
    ]);
    assert.strictEqual(request.bucket, fields.bucket);
    assert.strictEqual(request.prefix, fields.prefix);
  });
}

for (const [label, bucket] of [
  ['object', { private: 'bucket-sentinel' }],
  ['boxed string', new String('private-bucket')],
  ['blank string', ' \t '],
]) {
  test(`main: ${label} configured bucket rejects before storage acquisition`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-request-scope-failure-'),
    );
    try {
      const s3Client = listingClient([{ IsTruncated: false }]);
      const io = createIo();
      assert.strictEqual(
        await main(
          [
            'node',
            'script',
            '--dry-run',
            '--prefix',
            'scope/',
            '--output',
            path.join(dir, 'receipt.json'),
          ],
          io,
          {
            env: { STORAGE_BUCKET: bucket },
            dbObjects: [],
            s3Client,
          },
        ),
        1,
      );
      assert.deepStrictEqual(s3Client.inputs, []);
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

test('main: valid configured request scope publishes a clean simulation receipt', async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'acres-request-scope-success-'),
  );
  try {
    const target = path.join(dir, 'receipt.json');
    const bucket = 'configured-fixture';
    const s3Client = listingClient([
      { IsTruncated: true, Contents: [], NextContinuationToken: 'A' },
      {
        IsTruncated: false,
        Prefix: 'scope/',
        Contents: [{ Key: 'scope/key', Size: 1 }],
      },
    ]);
    const io = createIo();
    assert.strictEqual(
      await main(
        [
          'node',
          'script',
          '--dry-run',
          '--prefix',
          'scope/',
          '--output',
          target,
        ],
        io,
        {
          env: { STORAGE_BUCKET: bucket },
          dbObjects: [inventoryDbRecord({ bucket, objectKey: 'scope/key' })],
          s3Client,
        },
      ),
      0,
    );
    assert.deepStrictEqual(
      s3Client.inputs,
      [undefined, 'A'].map(ContinuationToken => ({
        Bucket: bucket,
        Prefix: 'scope/',
        ContinuationToken,
      })),
    );
    assert.deepStrictEqual(io.errors, []);
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, 1);
    assert.strictEqual(report.summary.totalBucketObjects, 1);
    assert.strictEqual(report.matched[0].objectKey, 'scope/key');
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const invalidListingNames = [
  ['null', null],
  ['false', false],
  ['true', true],
  ['zero', 0],
  ['NaN', NaN],
  ['bigint', 1n],
  ['symbol', Symbol('private-name')],
  ['array', ['private-name']],
  ['object', { private: 'name-sentinel' }],
  ['boxed string', new String('private-name')],
  ['empty', ''],
  ['blank', ' \t\n '],
  [
    'coercion trap',
    {
      toString() {
        throw new Error('private-name-toString');
      },
      valueOf() {
        throw new Error('private-name-valueOf');
      },
      [Symbol.toPrimitive]() {
        throw new Error('private-name-toPrimitive');
      },
    },
  ],
];

for (const later of [false, true]) {
  for (const [label, Name] of invalidListingNames) {
    test(`listBucketObjects: rejects ${later ? 'later' : 'first'} ${label} bucket-name metadata`, async () => {
      const pages = later
        ? [
            {
              IsTruncated: true,
              Name: 'fixture',
              Contents: [{ Key: 'first', Size: 1 }],
              NextContinuationToken: 'A',
            },
          ]
        : [];
      pages.push(
        Object.freeze({
          Name,
          IsTruncated: true,
          NextContinuationToken: 'B',
          Contents: Object.freeze([Object.freeze({ Key: 'second', Size: 1 })]),
        }),
        { IsTruncated: false },
      );
      const s3Client = listingClient(pages);
      await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
        message: 'Object storage listing is invalid or incomplete',
      });
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
    });
  }
}

for (const [label, fields] of [
  ['omitted', {}],
  ['undefined', { Name: undefined }],
  ['plain', { Name: 'fixture' }],
  ['opaque', { Name: 'é/%2F/../[x]' }],
  ['surrounded whitespace', { Name: ' fixture ' }],
]) {
  test(`listBucketObjects: accepts ${label} bucket-name metadata without rewriting`, async () => {
    const page = Object.freeze({
      ...fields,
      IsTruncated: false,
      Contents: Object.freeze([Object.freeze({ Key: 'scope/key', Size: 1 })]),
    });
    const s3Client = listingClient([
      { ...fields, IsTruncated: true, NextContinuationToken: 'A' },
      page,
    ]);
    const bucket = 'arn:aws:s3:us-east-1:123456789012:accesspoint/fixture';
    const result = await listBucketObjects(
      Object.freeze({ s3Client, bucket, prefix: 'scope/' }),
    );
    assert.deepStrictEqual(result, [
      { key: 'scope/key', byteCount: 1, lastModified: null, checksumHex: null },
    ]);
    assert.deepStrictEqual(
      s3Client.inputs,
      [undefined, 'A'].map(ContinuationToken => ({
        Bucket: bucket,
        Prefix: 'scope/',
        ContinuationToken,
      })),
    );
    assert.strictEqual(page.Name, fields.Name);
  });
}

for (const later of [false, true]) {
  test(`main: invalid ${later ? 'later' : 'first'} bucket name publishes no evidence`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-name-failure-'));
    try {
      const pages = later
        ? [
            {
              IsTruncated: true,
              Name: 'fixture',
              NextContinuationToken: 'A',
              Contents: [{ Key: 'first', Size: 1 }],
            },
          ]
        : [];
      pages.push(
        {
          IsTruncated: true,
          Name: { private: 'name-sentinel' },
          NextContinuationToken: 'B',
        },
        { IsTruncated: false },
      );
      const s3Client = listingClient(pages);
      const io = createIo();
      assert.strictEqual(
        await main(
          [
            'node',
            'script',
            '--dry-run',
            '--bucket',
            'fixture',
            '--output',
            path.join(dir, 'receipt.json'),
          ],
          io,
          { env: {}, dbObjects: [], s3Client },
        ),
        1,
      );
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
      assert.deepStrictEqual(io.logs, [
        'Connecting to PostgreSQL and Object Storage...',
      ]);
      assert.deepStrictEqual(io.errors, [
        'Error: Object storage connection or listing failed',
      ]);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('main: named pages with alias request publish a clean simulation receipt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-name-success-'));
  try {
    const bucket = 'fixture-alias-s3alias';
    const target = path.join(dir, 'receipt.json');
    const s3Client = listingClient([
      { IsTruncated: true, Name: 'actual-bucket', NextContinuationToken: 'A' },
      {
        IsTruncated: false,
        Name: 'actual-bucket',
        Contents: [{ Key: 'key', Size: 1 }],
      },
    ]);
    const io = createIo();
    assert.strictEqual(
      await main(
        ['node', 'script', '--dry-run', '--bucket', bucket, '--output', target],
        io,
        {
          env: {},
          dbObjects: [inventoryDbRecord({ bucket, objectKey: 'key' })],
          s3Client,
        },
      ),
      0,
    );
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, 1);
    assert.deepStrictEqual(io.errors, []);
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function bucketContinuityPages(fields) {
  return fields.map((extra, index) =>
    Object.freeze({
      IsTruncated: index < fields.length - 1,
      ...(index < fields.length - 1
        ? { NextContinuationToken: String(index + 1) }
        : {}),
      Contents: Object.freeze([
        Object.freeze({
          Key: `scope/${index}`,
          Size: index + 1,
          LastModified: new Date('2026-01-01T00:00:00Z'),
          ChecksumSHA256: Buffer.alloc(32, 1).toString('base64'),
        }),
      ]),
      ...extra,
    }),
  );
}

for (const [label, fields] of [
  ['direct', [{ Name: 'one' }, { Name: 'two' }]],
  ['absent gap', [{ Name: 'one' }, {}, { Name: 'two' }]],
  ['undefined gap', [{ Name: 'one' }, { Name: undefined }, { Name: 'two' }]],
  ['late first name', [{}, { Name: 'one' }, { Name: 'two' }]],
  ['case difference', [{ Name: 'one' }, { Name: 'One' }]],
  ['space difference', [{ Name: 'one' }, { Name: ' one ' }]],
  ['Unicode difference', [{ Name: 'é' }, { Name: 'e\u0301' }]],
]) {
  test(`listBucketObjects: rejects ${label} bucket-name contradiction before next request`, async () => {
    const pages = bucketContinuityPages([...fields, {}]);
    const s3Client = listingClient(pages);
    await assert.rejects(
      listBucketObjects({
        s3Client,
        bucket: 'fixture-alias-s3alias',
        prefix: 'scope/',
      }),
      {
        message: 'Object storage listing is invalid or incomplete',
      },
    );
    assert.strictEqual(s3Client.inputs.length, fields.length);
    assert.strictEqual(pages.at(-2).Name, fields.at(-1).Name);
  });
}

test('listBucketObjects: rejects contradictory terminal bucket name', async () => {
  const s3Client = listingClient(
    bucketContinuityPages([{ Name: 'one' }, { Name: 'two' }]),
  );
  await assert.rejects(listBucketObjects({ s3Client, bucket: 'fixture' }), {
    message: 'Object storage listing is invalid or incomplete',
  });
  assert.strictEqual(s3Client.inputs.length, 2);
});

for (const [label, fields] of [
  ['unnamed pages', [{}, { Name: undefined }, {}]],
  ['late first name', [{}, { Name: 'actual' }, { Name: 'actual' }]],
  ['terminal first name', [{}, { Name: undefined }, { Name: 'actual' }]],
  ['first name only', [{ Name: 'actual' }, {}, { Name: undefined }]],
  [
    'stable with gaps',
    [{ Name: 'actual' }, {}, { Name: undefined }, { Name: 'actual' }],
  ],
  [
    'empty intermediate page',
    [{ Name: 'actual' }, { Contents: Object.freeze([]) }, { Name: 'actual' }],
  ],
  ['literal opaque name', [{ Name: 'é/%2F/../[x]' }, { Name: 'é/%2F/../[x]' }]],
  ['literal spaces', [{ Name: ' actual ' }, { Name: ' actual ' }]],
]) {
  test(`listBucketObjects: preserves ${label} bucket-name continuity`, async () => {
    const pages = bucketContinuityPages(fields);
    const s3Client = listingClient(pages);
    const bucket = 'arn:aws:s3:us-east-1:123456789012:accesspoint/fixture';
    const result = await listBucketObjects(
      Object.freeze({ s3Client, bucket, prefix: 'scope/' }),
    );
    assert.deepStrictEqual(
      result,
      pages.flatMap(page =>
        page.Contents.map(entry => ({
          key: entry.Key,
          byteCount: entry.Size,
          lastModified: '2026-01-01T00:00:00.000Z',
          checksumHex: Buffer.alloc(32, 1).toString('hex'),
        })),
      ),
    );
    assert.deepStrictEqual(
      s3Client.inputs,
      fields.map((_, index) => ({
        Bucket: bucket,
        Prefix: 'scope/',
        ContinuationToken: index ? String(index) : undefined,
      })),
    );
    assert.deepStrictEqual(
      pages.map(page => page.Name),
      fields.map(extra => extra.Name),
    );
  });
}

test('listBucketObjects: reused client does not carry bucket-name state across invocations', async () => {
  const s3Client = listingClient([
    { IsTruncated: false, Name: 'one' },
    { IsTruncated: false, Name: 'two' },
  ]);
  assert.deepStrictEqual(
    await listBucketObjects({ s3Client, bucket: 'first-alias' }),
    [],
  );
  assert.deepStrictEqual(
    await listBucketObjects({ s3Client, bucket: 'second-alias' }),
    [],
  );
  assert.deepStrictEqual(
    s3Client.inputs.map(input => input.Bucket),
    ['first-alias', 'second-alias'],
  );
});

for (const gap of [false, true]) {
  test(`main: contradictory bucket names ${gap ? 'across gap' : 'directly'} publish no evidence`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-name-continuity-failure-'),
    );
    try {
      const fields = [
        { Name: 'private-one' },
        ...(gap ? [{}, { Name: undefined }] : []),
        { Name: 'private-two' },
      ];
      const s3Client = listingClient(bucketContinuityPages([...fields, {}]));
      const io = createIo();
      assert.strictEqual(
        await main(
          [
            'node',
            'script',
            '--dry-run',
            '--bucket',
            'fixture',
            '--prefix',
            'scope/',
            '--output',
            path.join(dir, 'receipt.json'),
          ],
          io,
          { env: {}, dbObjects: [], s3Client },
        ),
        1,
      );
      assert.strictEqual(s3Client.inputs.length, fields.length);
      assert.deepStrictEqual(io.logs, [
        'Connecting to PostgreSQL and Object Storage...',
      ]);
      assert.deepStrictEqual(io.errors, [
        'Error: Object storage connection or listing failed',
      ]);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('main: stable bucket names across optional gap publish a clean simulation receipt', async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'acres-name-continuity-success-'),
  );
  try {
    const bucket = 'fixture-alias-s3alias';
    const fields = [
      { Name: 'actual' },
      {},
      { Name: undefined },
      { Name: 'actual' },
    ];
    const pages = bucketContinuityPages(fields);
    const s3Client = listingClient(pages);
    const target = path.join(dir, 'receipt.json');
    const io = createIo();
    const dbObjects = pages.map((page, index) =>
      inventoryDbRecord({
        id: `fixture-${index}`,
        bucket,
        objectKey: page.Contents[0].Key,
        byteCount: page.Contents[0].Size,
      }),
    );
    assert.strictEqual(
      await main(
        [
          'node',
          'script',
          '--dry-run',
          '--bucket',
          bucket,
          '--prefix',
          'scope/',
          '--output',
          target,
        ],
        io,
        { env: {}, dbObjects, s3Client },
      ),
      0,
    );
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(report.execution_mode, 'simulation');
    assert.strictEqual(report.summary.status, 'clean');
    assert.strictEqual(report.summary.matchedObjects, fields.length);
    assert.deepStrictEqual(io.errors, []);
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const incompatibleChecksumTypes = [
  ['composite', 'COMPOSITE'],
  ['null', null],
  ['empty', ''],
  ['case variant', 'full_object'],
  ['space variant', ' FULL_OBJECT '],
  ['number', 1],
  ['boolean', false],
  ['array', ['FULL_OBJECT']],
  ['boxed string', new String('FULL_OBJECT')],
  [
    'coercible object',
    {
      [Symbol.toPrimitive]() {
        throw new Error('private-checksum-type-coercion');
      },
    },
  ],
];

for (const later of [false, true]) {
  for (const [label, ChecksumType] of incompatibleChecksumTypes) {
    test(`listBucketObjects: rejects ${label} digest type on ${later ? 'later' : 'first'} page`, async () => {
      const pages = bucketContinuityPages([
        ...(later ? [{}] : []),
        {
          Contents: Object.freeze([
            Object.freeze({
              Key: 'scope/conflict',
              Size: 1,
              ChecksumSHA256: canonicalSha256,
              ChecksumType,
            }),
          ]),
        },
        {},
      ]);
      const s3Client = listingClient(pages);
      await assert.rejects(
        listBucketObjects({ s3Client, bucket: 'fixture', prefix: 'scope/' }),
        { message: 'Object storage listing is invalid or incomplete' },
      );
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
      assert.strictEqual(
        pages[later ? 1 : 0].Contents[0].ChecksumType,
        ChecksumType,
      );
    });
  }
}

for (const [label, fields] of [
  ['omitted', {}],
  ['undefined', { ChecksumType: undefined }],
  ['full object', { ChecksumType: 'FULL_OBJECT' }],
]) {
  test(`listBucketObjects: preserves ${label} digest type and frozen paginated metadata`, async () => {
    const pages = bucketContinuityPages([{}, {}]).map(page =>
      Object.freeze({
        ...page,
        Contents: Object.freeze(
          page.Contents.map(entry => Object.freeze({ ...entry, ...fields })),
        ),
      }),
    );
    const s3Client = listingClient(pages);
    const result = await listBucketObjects(
      Object.freeze({ s3Client, bucket: 'fixture', prefix: 'scope/' }),
    );
    assert.deepStrictEqual(
      result,
      [0, 1].map(index => ({
        key: `scope/${index}`,
        byteCount: index + 1,
        lastModified: '2026-01-01T00:00:00.000Z',
        checksumHex: Buffer.alloc(32, 1).toString('hex'),
      })),
    );
    assert.deepStrictEqual(s3Client.inputs, [
      { Bucket: 'fixture', Prefix: 'scope/', ContinuationToken: undefined },
      { Bucket: 'fixture', Prefix: 'scope/', ContinuationToken: '1' },
    ]);
    assert.strictEqual(pages[0].Contents[0].ChecksumType, fields.ChecksumType);
  });
}

for (const [label, digestFields] of [
  ['absent', {}],
  ['undefined', { ChecksumSHA256: undefined }],
  ['null', { ChecksumSHA256: null }],
]) {
  for (const [hint, ChecksumType] of [
    ['composite', 'COMPOSITE'],
    ['null', null],
    ['malformed', incompatibleChecksumTypes.at(-1)[1]],
  ]) {
    test(`listBucketObjects: ignores ${hint} type hint with ${label} digest`, async () => {
      const entry = Object.freeze({
        Key: 'scope/key',
        Size: 1,
        ChecksumAlgorithm: Object.freeze(['SHA256']),
        ChecksumType,
        ...digestFields,
      });
      const s3Client = listingClient([
        Object.freeze({ IsTruncated: false, Contents: Object.freeze([entry]) }),
      ]);
      assert.deepStrictEqual(
        await listBucketObjects({
          s3Client,
          bucket: 'fixture',
          prefix: 'scope/',
        }),
        [
          {
            key: 'scope/key',
            byteCount: 1,
            lastModified: null,
            checksumHex: null,
          },
        ],
      );
      assert.strictEqual(s3Client.inputs.length, 1);
      assert.strictEqual(entry.ChecksumType, ChecksumType);
    });
  }
}

for (const later of [false, true]) {
  test(`main: ${later ? 'later' : 'first'} composite digest publishes no evidence`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-digest-type-failure-'),
    );
    try {
      const s3Client = listingClient(
        bucketContinuityPages([
          ...(later ? [{}] : []),
          {
            Contents: [
              {
                Key: 'scope/conflict',
                Size: 1,
                ChecksumSHA256: canonicalSha256,
                ChecksumType: 'COMPOSITE',
              },
            ],
          },
          {},
        ]),
      );
      const io = createIo();
      assert.strictEqual(
        await main(
          [
            'node',
            'script',
            '--dry-run',
            '--bucket',
            'fixture',
            '--prefix',
            'scope/',
            '--output',
            path.join(dir, 'receipt.json'),
          ],
          io,
          { env: {}, dbObjects: [], s3Client },
        ),
        1,
      );
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
      assert.deepStrictEqual(io.logs, [
        'Connecting to PostgreSQL and Object Storage...',
      ]);
      assert.deepStrictEqual(io.errors, [
        'Error: Object storage connection or listing failed',
      ]);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const [label, fields] of [
  [
    'full-object digest',
    { ChecksumSHA256: canonicalSha256, ChecksumType: 'FULL_OBJECT' },
  ],
  ['legacy digest', { ChecksumSHA256: canonicalSha256 }],
  [
    'composite hint without digest',
    { ChecksumType: 'COMPOSITE', ChecksumAlgorithm: ['SHA256'] },
  ],
]) {
  test(`main: ${label} publishes a clean simulation receipt`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-digest-type-success-'),
    );
    try {
      const bucket = 'fixture';
      const target = path.join(dir, 'receipt.json');
      const s3Client = listingClient([
        {
          IsTruncated: false,
          Contents: [{ Key: 'scope/key', Size: 1, ...fields }],
        },
      ]);
      const io = createIo();
      assert.strictEqual(
        await main(
          [
            'node',
            'script',
            '--dry-run',
            '--bucket',
            bucket,
            '--output',
            target,
          ],
          io,
          {
            env: {},
            dbObjects: [
              inventoryDbRecord({
                bucket,
                objectKey: 'scope/key',
                checksumAlgorithm: 'sha256',
                checksumHex: Buffer.from(canonicalSha256, 'base64').toString(
                  'hex',
                ),
              }),
            ],
            s3Client,
          },
        ),
        0,
      );
      const report = JSON.parse(fs.readFileSync(target, 'utf8'));
      assert.strictEqual(report.execution_mode, 'simulation');
      assert.strictEqual(report.summary.status, 'clean');
      assert.strictEqual(report.summary.matchedObjects, 1);
      assert.deepStrictEqual(io.errors, []);
      assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

const incompatibleChecksumAlgorithms = [
  ['CRC32 only', ['CRC32']],
  ['empty array', []],
  ['null', null],
  ['scalar', 'SHA256'],
  ['boxed scalar', new String('SHA256')],
  ['number', 1],
  ['boolean', false],
  ['object', {}],
  ['wrong case', ['sha256']],
  ['padded name', [' SHA256 ']],
  ['empty member', ['SHA256', '']],
  ['blank member', ['SHA256', ' \t']],
  ['null member', ['SHA256', null]],
  ['undefined member', ['SHA256', undefined]],
  ['numeric member', ['SHA256', 1]],
  ['boolean member', ['SHA256', false]],
  ['nested member', ['SHA256', ['CRC32']]],
  ['boxed member', ['SHA256', new String('CRC32')]],
  ['sparse array', new Array(2)],
  ['leading hole', [, 'SHA256']],
  ['trailing hole', ['SHA256', ,]],
  [
    'coercible member',
    [
      'SHA256',
      {
        [Symbol.toPrimitive]() {
          throw new Error('private-algorithm-coercion');
        },
      },
    ],
  ],
];

for (const later of [false, true]) {
  for (const [label, algorithms] of incompatibleChecksumAlgorithms) {
    if (Array.isArray(algorithms)) Object.freeze(algorithms);
    test(`listBucketObjects: rejects ${label} digest algorithms on ${later ? 'later' : 'first'} page`, async () => {
      const entry = Object.freeze({
        Key: 'scope/conflict',
        Size: 1,
        ChecksumSHA256: canonicalSha256,
        ChecksumType: 'FULL_OBJECT',
        ChecksumAlgorithm: algorithms,
      });
      const pages = bucketContinuityPages([
        ...(later ? [{}] : []),
        { Contents: Object.freeze([entry]) },
        {},
      ]);
      const s3Client = listingClient(pages);
      await assert.rejects(
        listBucketObjects({ s3Client, bucket: 'fixture', prefix: 'scope/' }),
        { message: 'Object storage listing is invalid or incomplete' },
      );
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
      assert.strictEqual(entry.ChecksumAlgorithm, algorithms);
    });
  }
}

for (const [label, fields] of [
  ['omitted', {}],
  ['undefined', { ChecksumAlgorithm: undefined }],
  ['SHA256', { ChecksumAlgorithm: ['SHA256'] }],
  ['SHA256 first', { ChecksumAlgorithm: ['SHA256', 'CRC32'] }],
  ['SHA256 last', { ChecksumAlgorithm: ['CRC32', 'SHA256'] }],
  ['repeated SHA256', { ChecksumAlgorithm: ['SHA256', 'SHA256'] }],
  ['future algorithm', { ChecksumAlgorithm: ['FUTURE_ALGORITHM', 'SHA256'] }],
]) {
  if (Array.isArray(fields.ChecksumAlgorithm))
    Object.freeze(fields.ChecksumAlgorithm);
  test(`listBucketObjects: preserves ${label} digest algorithms across frozen pages`, async () => {
    const pages = bucketContinuityPages([{}, {}]).map(page =>
      Object.freeze({
        ...page,
        Contents: Object.freeze(
          page.Contents.map(entry =>
            Object.freeze({
              ...entry,
              ...fields,
              ChecksumType: 'FULL_OBJECT',
            }),
          ),
        ),
      }),
    );
    const s3Client = listingClient(pages);
    assert.deepStrictEqual(
      await listBucketObjects(
        Object.freeze({ s3Client, bucket: 'fixture', prefix: 'scope/' }),
      ),
      [0, 1].map(index => ({
        key: `scope/${index}`,
        byteCount: index + 1,
        lastModified: '2026-01-01T00:00:00.000Z',
        checksumHex: Buffer.alloc(32, 1).toString('hex'),
      })),
    );
    assert.deepStrictEqual(s3Client.inputs, [
      { Bucket: 'fixture', Prefix: 'scope/', ContinuationToken: undefined },
      { Bucket: 'fixture', Prefix: 'scope/', ContinuationToken: '1' },
    ]);
    assert.strictEqual(
      pages[0].Contents[0].ChecksumAlgorithm,
      fields.ChecksumAlgorithm,
    );
  });
}

for (const [label, digestFields] of [
  ['absent', {}],
  ['undefined', { ChecksumSHA256: undefined }],
  ['null', { ChecksumSHA256: null }],
]) {
  for (const [hint, algorithms] of [
    ['CRC32 only', ['CRC32']],
    ['null', null],
    ['scalar', 'SHA256'],
    ['sparse', ['SHA256', ,]],
    ['coercible', incompatibleChecksumAlgorithms.at(-1)[1]],
  ]) {
    test(`listBucketObjects: ignores ${hint} algorithms with ${label} digest`, async () => {
      const entry = Object.freeze({
        Key: 'scope/key',
        Size: 1,
        ChecksumAlgorithm: algorithms,
        ChecksumType: 'COMPOSITE',
        ...digestFields,
      });
      const s3Client = listingClient([
        Object.freeze({ IsTruncated: false, Contents: Object.freeze([entry]) }),
      ]);
      assert.deepStrictEqual(
        await listBucketObjects({
          s3Client,
          bucket: 'fixture',
          prefix: 'scope/',
        }),
        [
          {
            key: 'scope/key',
            byteCount: 1,
            lastModified: null,
            checksumHex: null,
          },
        ],
      );
      assert.strictEqual(s3Client.inputs.length, 1);
      assert.strictEqual(entry.ChecksumAlgorithm, algorithms);
    });
  }
}

for (const later of [false, true]) {
  test(`main: ${later ? 'later' : 'first'} contradictory digest algorithms publish no evidence`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-digest-algorithm-failure-'),
    );
    try {
      const s3Client = listingClient(
        bucketContinuityPages([
          ...(later ? [{}] : []),
          {
            Contents: [
              {
                Key: 'scope/private-conflict',
                Size: 1,
                ChecksumSHA256: canonicalSha256,
                ChecksumType: 'FULL_OBJECT',
                ChecksumAlgorithm: ['CRC32'],
              },
            ],
          },
          {},
        ]),
      );
      const io = createIo();
      assert.strictEqual(
        await main(
          [
            'node',
            'script',
            '--dry-run',
            '--bucket',
            'fixture',
            '--prefix',
            'scope/',
            '--output',
            path.join(dir, 'receipt.json'),
          ],
          io,
          { env: {}, dbObjects: [], s3Client },
        ),
        1,
      );
      assert.strictEqual(s3Client.inputs.length, later ? 2 : 1);
      assert.deepStrictEqual(io.logs, [
        'Connecting to PostgreSQL and Object Storage...',
      ]);
      assert.deepStrictEqual(io.errors, [
        'Error: Object storage connection or listing failed',
      ]);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const [label, fields] of [
  [
    'typed SHA256',
    {
      ChecksumSHA256: canonicalSha256,
      ChecksumType: 'FULL_OBJECT',
      ChecksumAlgorithm: ['SHA256'],
    },
  ],
  [
    'multiple algorithms',
    { ChecksumSHA256: canonicalSha256, ChecksumAlgorithm: ['CRC32', 'SHA256'] },
  ],
  ['legacy digest', { ChecksumSHA256: canonicalSha256 }],
  [
    'CRC32 hint without digest',
    { ChecksumAlgorithm: ['CRC32'], ChecksumType: 'COMPOSITE' },
  ],
]) {
  test(`main: ${label} retains clean simulation receipt publication`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-digest-algorithm-success-'),
    );
    try {
      const target = path.join(dir, 'receipt.json');
      const s3Client = listingClient([
        {
          IsTruncated: false,
          Contents: [{ Key: 'scope/key', Size: 1, ...fields }],
        },
      ]);
      const io = createIo();
      assert.strictEqual(
        await main(
          [
            'node',
            'script',
            '--dry-run',
            '--bucket',
            'fixture',
            '--output',
            target,
          ],
          io,
          {
            env: {},
            s3Client,
            dbObjects: [
              inventoryDbRecord({
                bucket: 'fixture',
                objectKey: 'scope/key',
                checksumAlgorithm: 'sha256',
                checksumHex: Buffer.from(canonicalSha256, 'base64').toString(
                  'hex',
                ),
              }),
            ],
          },
        ),
        0,
      );
      const report = JSON.parse(fs.readFileSync(target, 'utf8'));
      assert.strictEqual(report.execution_mode, 'simulation');
      assert.strictEqual(report.summary.status, 'clean');
      assert.strictEqual(report.summary.matchedObjects, 1);
      assert.deepStrictEqual(io.errors, []);
      assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

const invalidDatabaseRowCounts = [
  ['null', null],
  ['numeric string', '1'],
  ['blank string', ''],
  ['boxed number', new Number(1)],
  ['boolean', true],
  ['array', [1]],
  ['object', {}],
  ['symbol', Symbol('private-row-count')],
  ['bigint', 1n],
  ['NaN', NaN],
  ['positive infinity', Infinity],
  ['negative infinity', -Infinity],
  ['negative', -1],
  ['fraction', 1.5],
  ['unsafe', Number.MAX_SAFE_INTEGER + 1],
  ['smaller', 0],
  ['larger', 2],
  [
    'throwing coercion',
    {
      [Symbol.toPrimitive]() {
        throw new Error('private-row-count-coercion');
      },
    },
  ],
];

for (const [label, rowCount] of invalidDatabaseRowCounts) {
  test(`queryDatabaseStoredObjects: rejects ${label} supplied row count`, async () => {
    const rows = Object.freeze([Object.freeze(inventoryDbRecord())]);
    const result = Object.freeze({ rows, rowCount });
    let queries = 0;
    await assert.rejects(
      queryDatabaseStoredObjects({
        pgClient: {
          async query() {
            queries++;
            return result;
          },
        },
      }),
      { message: 'Database inventory is invalid' },
    );
    assert.strictEqual(queries, 1);
    assert.strictEqual(result.rowCount, rowCount);
    assert.deepStrictEqual(rows, [inventoryDbRecord()]);
  });
}

for (const [label, fields, count] of [
  ['omitted empty', {}, 0],
  ['omitted populated', {}, 2],
  ['undefined empty', { rowCount: undefined }, 0],
  ['undefined populated', { rowCount: undefined }, 2],
  ['zero empty', { rowCount: 0 }, 0],
  ['negative zero empty', { rowCount: -0 }, 0],
  ['exact one', { rowCount: 1 }, 1],
  ['exact multiple', { rowCount: 2 }, 2],
]) {
  test(`queryDatabaseStoredObjects: preserves ${label} row count compatibility`, async () => {
    const rows = Object.freeze(
      Array.from({ length: count }, (_, i) =>
        Object.freeze(
          inventoryDbRecord({
            id: `id-${i}`,
            objectKey: `opaque/${i}`,
            byteCount: '0001',
            extra: 'preserved',
          }),
        ),
      ),
    );
    const result = Object.freeze({ rows, ...fields });
    let queries = 0;
    const converted = await queryDatabaseStoredObjects({
      pgClient: {
        async query() {
          queries++;
          return result;
        },
      },
    });
    assert.strictEqual(queries, 1);
    assert.deepStrictEqual(
      converted,
      rows.map((row) => ({ ...row, byteCount: 1n })),
    );
    assert.ok(rows.every((row) => row.byteCount === '0001'));
    assert.notStrictEqual(converted, rows);
  });
}

for (const [label, rows, rowCount] of [
  ['nonzero empty', [], 1],
  [
    'smaller multiple',
    [
      inventoryDbRecord(),
      inventoryDbRecord({ id: 'second', objectKey: 'second' }),
    ],
    1,
  ],
  ['matching malformed', [{}], 1],
  ['matching sparse', new Array(1), 1],
  ['matching duplicate', [inventoryDbRecord(), inventoryDbRecord()], 2],
  ['matching invalid bytes', [inventoryDbRecord({ byteCount: true })], 1],
]) {
  test(`queryDatabaseStoredObjects: rejects ${label} result without partial inventory`, async () => {
    await assert.rejects(
      queryDatabaseStoredObjects({
        pgClient: { query: async () => ({ rows, rowCount }) },
      }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const [label, rowCount] of invalidDatabaseRowCounts) {
  test(`main: ${label} database row count prevents storage requests and receipts`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-db-count-failure-'),
    );
    try {
      let queries = 0;
      let ended = 0;
      let destroyed = 0;
      const s3Client = listingClient([{ IsTruncated: false }]);
      s3Client.destroy = () => destroyed++;
      const io = createIo();
      assert.strictEqual(
        await main(
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
            pgClient: {
              async query() {
                queries++;
                return { rows: [inventoryDbRecord()], rowCount };
              },
              async end() {
                ended++;
              },
            },
            s3Client,
          },
        ),
        1,
      );
      assert.strictEqual(queries, 1);
      assert.strictEqual(s3Client.inputs.length, 0);
      assert.strictEqual(ended, 0);
      assert.strictEqual(destroyed, 0);
      assert.deepStrictEqual(io.logs, [
        'Connecting to PostgreSQL and Object Storage...',
      ]);
      assert.deepStrictEqual(io.errors, ['Error: Database query failed']);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const [label, fields, populated] of [
  ['exact populated', { rowCount: 1 }, true],
  ['exact empty', { rowCount: 0 }, false],
  ['omitted populated', {}, true],
  ['undefined empty', { rowCount: undefined }, false],
]) {
  test(`main: ${label} database row count publishes clean simulation evidence`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-db-count-success-'),
    );
    try {
      const target = path.join(dir, 'receipt.json');
      const rows = Object.freeze(
        populated ? [Object.freeze(inventoryDbRecord({ byteCount: '1' }))] : [],
      );
      const result = Object.freeze({ rows, ...fields });
      let queries = 0;
      const s3Client = listingClient([
        {
          IsTruncated: false,
          Contents: populated ? [{ Key: 'fixture-key', Size: 1 }] : [],
        },
      ]);
      const io = createIo();
      assert.strictEqual(
        await main(['node', 'script', '--dry-run', '--output', target], io, {
          env: {},
          pgClient: {
            async query() {
              queries++;
              return result;
            },
          },
          s3Client,
        }),
        0,
      );
      const report = JSON.parse(fs.readFileSync(target, 'utf8'));
      assert.strictEqual(queries, 1);
      assert.strictEqual(s3Client.inputs.length, 1);
      assert.strictEqual(report.execution_mode, 'simulation');
      assert.strictEqual(report.summary.status, 'clean');
      assert.strictEqual(report.summary.matchedObjects, populated ? 1 : 0);
      assert.deepStrictEqual(io.errors, []);
      assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
      assert.ok(rows.every((row) => row.byteCount === '1'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

const invalidDatabaseCommands = [
  ['delete', 'DELETE'],
  ['update', 'UPDATE'],
  ['insert', 'INSERT'],
  ['show', 'SHOW'],
  ['empty', ''],
  ['blank', ' \t'],
  ['lowercase', 'select'],
  ['leading space', ' SELECT'],
  ['trailing space', 'SELECT '],
  ['suffix', 'SELECT 1'],
  ['control', 'SELECT\0'],
  ['null', null],
  ['boxed string', new String('SELECT')],
  ['boolean', true],
  ['number', 1],
  ['NaN', NaN],
  ['infinity', Infinity],
  ['bigint', 1n],
  ['symbol', Symbol('private-command')],
  ['array', ['SELECT']],
  ['object', {}],
  [
    'throwing coercion',
    {
      [Symbol.toPrimitive]() {
        throw new Error('private-command-coercion');
      },
    },
  ],
];

for (const [label, command] of invalidDatabaseCommands) {
  for (const populated of [false, true]) {
    test(`queryDatabaseStoredObjects: rejects ${label} command with ${populated ? 'populated' : 'empty'} rows`, async () => {
      const rows = Object.freeze(
        populated ? [Object.freeze(inventoryDbRecord())] : [],
      );
      const result = Object.freeze({ rows, rowCount: rows.length, command });
      let queries = 0;
      await assert.rejects(
        queryDatabaseStoredObjects({
          pgClient: {
            async query() {
              queries++;
              return result;
            },
          },
        }),
        { message: 'Database inventory is invalid' },
      );
      assert.strictEqual(queries, 1);
      assert.strictEqual(result.command, command);
      assert.deepStrictEqual(rows, populated ? [inventoryDbRecord()] : []);
    });
  }
}

for (const [label, fields] of [
  ['omitted', {}],
  ['undefined', { command: undefined }],
  ['SELECT', { command: 'SELECT' }],
]) {
  for (const count of [0, 2]) {
    for (const includeCount of [false, true]) {
      test(`queryDatabaseStoredObjects: preserves ${label} command, ${count} rows, count ${includeCount}`, async () => {
        const rows = Object.freeze(
          Array.from({ length: count }, (_, i) =>
            Object.freeze(
              inventoryDbRecord({
                id: `id-${i}`,
                objectKey: `opaque/${i}`,
                byteCount: '0001',
                extra: 'preserved',
              }),
            ),
          ),
        );
        const result = Object.freeze({
          rows,
          ...fields,
          ...(includeCount ? { rowCount: count } : {}),
        });
        let queries = 0;
        const converted = await queryDatabaseStoredObjects({
          pgClient: {
            async query() {
              queries++;
              return result;
            },
          },
        });
        assert.strictEqual(queries, 1);
        assert.deepStrictEqual(
          converted,
          rows.map((row) => ({ ...row, byteCount: 1n })),
        );
        assert.notStrictEqual(converted, rows);
        assert.ok(rows.every((row) => row.byteCount === '0001'));
      });
    }
  }
}

for (const [label, rows, rowCount] of [
  ['malformed', [{}], 1],
  ['sparse', new Array(1), 1],
  ['duplicate', [inventoryDbRecord(), inventoryDbRecord()], 2],
  ['invalid bytes', [inventoryDbRecord({ byteCount: true })], 1],
  ['wrong count', [inventoryDbRecord()], 0],
]) {
  test(`queryDatabaseStoredObjects: SELECT cannot excuse ${label} inventory`, async () => {
    await assert.rejects(
      queryDatabaseStoredObjects({
        pgClient: {
          query: async () => ({ rows, rowCount, command: 'SELECT' }),
        },
      }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const count of [0, 1]) {
  test(`queryDatabaseStoredObjects: accepts installed pg SELECT ${count} completion`, async () => {
    const Result = require('pg/lib/result');
    const result = new Result();
    result.addFields(databaseInventoryFields());
    if (count) result.addRow(projectedInventoryRow({ byteCount: '1' }));
    result.addCommandComplete({ text: `SELECT ${count}` });
    assert.strictEqual(result.command, 'SELECT');
    assert.strictEqual(result.rowCount, count);
    const converted = await queryDatabaseStoredObjects({
      pgClient: { query: async () => result },
    });
    assert.deepStrictEqual(
      converted,
      result.rows.map((row) => ({ ...row, byteCount: 1n })),
    );
  });
}

for (const [label, command] of invalidDatabaseCommands) {
  for (const populated of [false, true]) {
    test(`main: ${label} command with ${populated ? 'populated' : 'empty'} rows prevents storage and publication`, async () => {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'acres-db-command-failure-'),
      );
      try {
        let queries = 0;
        let ended = 0;
        let destroyed = 0;
        const rows = Object.freeze(
          populated ? [Object.freeze(inventoryDbRecord())] : [],
        );
        const result = Object.freeze({ rows, rowCount: rows.length, command });
        const s3Client = listingClient([{ IsTruncated: false }]);
        s3Client.destroy = () => destroyed++;
        const io = createIo();
        assert.strictEqual(
          await main(
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
              pgClient: {
                async query() {
                  queries++;
                  return result;
                },
                async end() {
                  ended++;
                },
              },
              s3Client,
            },
          ),
          1,
        );
        assert.strictEqual(queries, 1);
        assert.strictEqual(s3Client.inputs.length, 0);
        assert.strictEqual(ended, 0);
        assert.strictEqual(destroyed, 0);
        assert.deepStrictEqual(io.logs, [
          'Connecting to PostgreSQL and Object Storage...',
        ]);
        assert.deepStrictEqual(io.errors, ['Error: Database query failed']);
        assert.deepStrictEqual(fs.readdirSync(dir), []);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }
}

for (const [label, fields] of [
  ['SELECT', { command: 'SELECT' }],
  ['omitted', {}],
  ['undefined', { command: undefined }],
]) {
  for (const populated of [false, true]) {
    test(`main: ${label} command with ${populated ? 'populated' : 'empty'} rows publishes simulation evidence`, async () => {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'acres-db-command-success-'),
      );
      try {
        const target = path.join(dir, 'receipt.json');
        const rows = Object.freeze(
          populated
            ? [Object.freeze(inventoryDbRecord({ byteCount: '1' }))]
            : [],
        );
        const result = Object.freeze({
          rows,
          rowCount: rows.length,
          ...fields,
        });
        let queries = 0;
        const s3Client = listingClient([
          {
            IsTruncated: false,
            Contents: populated ? [{ Key: 'fixture-key', Size: 1 }] : [],
          },
        ]);
        const io = createIo();
        assert.strictEqual(
          await main(['node', 'script', '--dry-run', '--output', target], io, {
            env: {},
            pgClient: {
              async query() {
                queries++;
                return result;
              },
            },
            s3Client,
          }),
          0,
        );
        const report = JSON.parse(fs.readFileSync(target, 'utf8'));
        assert.strictEqual(queries, 1);
        assert.strictEqual(s3Client.inputs.length, 1);
        assert.strictEqual(report.execution_mode, 'simulation');
        assert.strictEqual(report.summary.status, 'clean');
        assert.strictEqual(report.summary.matchedObjects, populated ? 1 : 0);
        assert.deepStrictEqual(io.errors, []);
        assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
        assert.ok(rows.every((row) => row.byteCount === '1'));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }
}

const invalidDatabaseRowModes = [
  ['true', true],
  ['null', null],
  ['zero', 0],
  ['negative zero', -0],
  ['one', 1],
  ['NaN', NaN],
  ['infinity', Infinity],
  ['negative infinity', -Infinity],
  ['bigint', 0n],
  ['symbol', Symbol('private-mode')],
  ['empty string', ''],
  ['blank string', ' '],
  ['false string', 'false'],
  ['true string', 'true'],
  ['boxed false', new Boolean(false)],
  ['boxed true', new Boolean(true)],
  ['array', []],
  ['object', {}],
  [
    'throwing coercion',
    {
      [Symbol.toPrimitive]() {
        throw new Error('private-value');
      },
    },
  ],
];

for (const [label, rowAsArray] of invalidDatabaseRowModes) {
  for (const populated of [false, true]) {
    test(`queryDatabaseStoredObjects: rejects ${label} rowAsArray with ${populated ? 'populated' : 'empty'} rows`, async () => {
      const rows = Object.freeze(
        populated ? [Object.freeze(inventoryDbRecord())] : [],
      );
      const result = Object.freeze({
        rows,
        rowCount: rows.length,
        command: 'SELECT',
        rowAsArray,
      });
      let queries = 0;
      await assert.rejects(
        queryDatabaseStoredObjects({
          pgClient: {
            async query() {
              queries++;
              return result;
            },
          },
        }),
        { message: 'Database inventory is invalid' },
      );
      assert.strictEqual(queries, 1);
      assert.strictEqual(result.rowAsArray, rowAsArray);
      assert.deepStrictEqual(rows, populated ? [inventoryDbRecord()] : []);
    });
  }
}

for (const [label, fields] of [
  ['omitted', {}],
  ['undefined', { rowAsArray: undefined }],
  ['false', { rowAsArray: false }],
]) {
  for (const count of [0, 2]) {
    for (const includeCount of [false, true]) {
      test(`queryDatabaseStoredObjects: preserves ${label} rowAsArray, ${count} rows, count ${includeCount}`, async () => {
        const rows = Object.freeze(
          Array.from({ length: count }, (_, i) =>
            Object.freeze(
              inventoryDbRecord({
                id: `id-${i}`,
                objectKey: `opaque/${i}`,
                byteCount: '0001',
                extra: 'preserved',
              }),
            ),
          ),
        );
        const result = Object.freeze({
          rows,
          ...fields,
          ...(includeCount ? { rowCount: count } : {}),
        });
        let queries = 0;
        const converted = await queryDatabaseStoredObjects({
          pgClient: {
            async query() {
              queries++;
              return result;
            },
          },
        });
        assert.strictEqual(queries, 1);
        assert.deepStrictEqual(
          converted,
          rows.map((row) => ({ ...row, byteCount: 1n })),
        );
        assert.notStrictEqual(converted, rows);
        assert.ok(rows.every((row) => row.byteCount === '0001'));
      });
    }
  }
}

for (const [label, rows, rowCount] of [
  ['malformed', [{}], 1],
  ['sparse', new Array(1), 1],
  ['duplicate', [inventoryDbRecord(), inventoryDbRecord()], 2],
  ['invalid bytes', [inventoryDbRecord({ byteCount: true })], 1],
  ['wrong count', [inventoryDbRecord()], 0],
]) {
  test(`queryDatabaseStoredObjects: false cannot excuse ${label} inventory`, async () => {
    await assert.rejects(
      queryDatabaseStoredObjects({
        pgClient: {
          query: async () => ({ rows, rowCount, rowAsArray: false }),
        },
      }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const mode of [undefined, 'array']) {
  test(`queryDatabaseStoredObjects: installed pg empty ${mode || 'default'} row mode`, async () => {
    const Result = require('pg/lib/result');
    const result = new Result(mode);
    result.addFields(databaseInventoryFields());
    result.addCommandComplete({ text: 'SELECT 0' });
    assert.strictEqual(result.rowAsArray, mode === 'array');
    const query = queryDatabaseStoredObjects({
      pgClient: { query: async () => result },
    });
    if (mode === 'array') {
      await assert.rejects(query, { message: 'Database inventory is invalid' });
    } else {
      assert.deepStrictEqual(await query, []);
    }
  });
}

test('queryDatabaseStoredObjects: false row mode cannot excuse invalid command', async () => {
  await assert.rejects(
    queryDatabaseStoredObjects({
      pgClient: {
        query: async () => ({
          rows: [],
          rowCount: 0,
          command: 'DELETE',
          rowAsArray: false,
        }),
      },
    }),
    { message: 'Database inventory is invalid' },
  );
});

for (const [label, rowAsArray] of invalidDatabaseRowModes) {
  for (const populated of [false, true]) {
    test(`main: ${label} rowAsArray with ${populated ? 'populated' : 'empty'} rows prevents storage and publication`, async () => {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'acres-db-row-mode-failure-'),
      );
      try {
        let queries = 0;
        let ended = 0;
        let destroyed = 0;
        const rows = Object.freeze(
          populated ? [Object.freeze(inventoryDbRecord())] : [],
        );
        const result = Object.freeze({
          rows,
          rowCount: rows.length,
          command: 'SELECT',
          rowAsArray,
        });
        const s3Client = listingClient([{ IsTruncated: false }]);
        s3Client.destroy = () => destroyed++;
        const io = createIo();
        assert.strictEqual(
          await main(
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
              pgClient: {
                async query() {
                  queries++;
                  return result;
                },
                async end() {
                  ended++;
                },
              },
              s3Client,
            },
          ),
          1,
        );
        assert.strictEqual(queries, 1);
        assert.strictEqual(s3Client.inputs.length, 0);
        assert.strictEqual(ended, 0);
        assert.strictEqual(destroyed, 0);
        assert.deepStrictEqual(io.logs, [
          'Connecting to PostgreSQL and Object Storage...',
        ]);
        assert.deepStrictEqual(io.errors, ['Error: Database query failed']);
        assert.deepStrictEqual(fs.readdirSync(dir), []);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }
}

for (const [label, fields] of [
  ['false', { rowAsArray: false }],
  ['omitted', {}],
  ['undefined', { rowAsArray: undefined }],
]) {
  for (const populated of [false, true]) {
    test(`main: ${label} rowAsArray with ${populated ? 'populated' : 'empty'} rows publishes simulation evidence`, async () => {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'acres-db-row-mode-success-'),
      );
      try {
        const target = path.join(dir, 'receipt.json');
        const rows = Object.freeze(
          populated
            ? [Object.freeze(inventoryDbRecord({ byteCount: '1' }))]
            : [],
        );
        const result = Object.freeze({
          rows,
          rowCount: rows.length,
          ...fields,
        });
        let queries = 0;
        const s3Client = listingClient([
          {
            IsTruncated: false,
            Contents: populated ? [{ Key: 'fixture-key', Size: 1 }] : [],
          },
        ]);
        const io = createIo();
        assert.strictEqual(
          await main(['node', 'script', '--dry-run', '--output', target], io, {
            env: {},
            pgClient: {
              async query() {
                queries++;
                return result;
              },
            },
            s3Client,
          }),
          0,
        );
        const report = JSON.parse(fs.readFileSync(target, 'utf8'));
        assert.strictEqual(queries, 1);
        assert.strictEqual(s3Client.inputs.length, 1);
        assert.strictEqual(report.execution_mode, 'simulation');
        assert.strictEqual(report.summary.status, 'clean');
        assert.strictEqual(report.summary.matchedObjects, populated ? 1 : 0);
        assert.deepStrictEqual(io.errors, []);
        assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
        assert.ok(rows.every((row) => row.byteCount === '1'));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }
}

// Fixed SELECT projection metadata is present even for an empty inventory.
function databaseInventoryFields() {
  return [
    'id',
    'organizationId',
    'bucket',
    'objectKey',
    'byteCount',
    'checksumAlgorithm',
    'checksumHex',
    'state',
    'deletedAt',
    'createdAt',
    'uploadState',
    'uploadExpiresAt',
  ].map((name) => ({
    name,
    dataTypeID: ['deletedAt', 'createdAt', 'uploadExpiresAt'].includes(name)
      ? 1184
      : 25,
    format: 'text',
  }));
}

// Descriptor-bearing fixtures model pg's complete named projection.
const projectedInventoryRow = (overrides = {}) =>
  inventoryDbRecord({
    checksumAlgorithm: 'sha256',
    checksumHex: null,
    deletedAt: null,
    createdAt: null,
    uploadState: null,
    uploadExpiresAt: null,
    ...overrides,
  });

const invalidDatabaseFields = [
  ['null', null],
  ['boolean', false],
  ['number', 0],
  ['string', 'private-fields'],
  ['object', {}],
  ['empty', []],
  ['short', databaseInventoryFields().slice(1)],
  ['extra', [...databaseInventoryFields(), { name: 'extra' }]],
  ['sparse', new Array(12)],
  [
    'duplicate',
    databaseInventoryFields().map((f, i) => (i === 1 ? { name: 'id' } : f)),
  ],
  ['reordered', databaseInventoryFields().reverse()],
  ...[
    ['null descriptor', null],
    ['array descriptor', []],
    ['string descriptor', 'id'],
    ['missing name', {}],
    ['unknown name', { name: 'private-column' }],
    ['uppercase name', { name: 'ID' }],
    ['padded name', { name: ' id' }],
    ['null name', { name: null }],
    ['numeric name', { name: 1 }],
    ['boolean name', { name: false }],
    ['symbol name', { name: Symbol('private') }],
    ['bigint name', { name: 1n }],
    ['boxed name', { name: new String('id') }],
    ['array name', { name: ['id'] }],
    [
      'throwing name',
      {
        name: {
          [Symbol.toPrimitive]() {
            throw new Error('private-coercion');
          },
        },
      },
    ],
  ].map(([label, descriptor]) => [
    label,
    [descriptor, ...databaseInventoryFields().slice(1)],
  ]),
];
const projectionVariants = [
  ['omitted', {}],
  ['undefined', { fields: undefined }],
  [
    'exact',
    {
      fields: Object.freeze(
        databaseInventoryFields().map((f) =>
          Object.freeze({ ...f, opaque: 'kept' }),
        ),
      ),
    },
  ],
];

for (const [label, fields] of invalidDatabaseFields) {
  for (const populated of [false, true]) {
    test(`queryDatabaseStoredObjects: rejects ${label} columns with populated=${populated}`, async () => {
      const rows = Object.freeze(
        populated ? [Object.freeze(projectedInventoryRow())] : [],
      );
      if (Array.isArray(fields)) Object.freeze(fields);
      const result = Object.freeze({
        fields,
        rows,
        command: 'SELECT',
        rowCount: rows.length,
        rowAsArray: false,
      });
      let queries = 0;
      await assert.rejects(
        queryDatabaseStoredObjects({
          pgClient: {
            query: async () => {
              queries++;
              return result;
            },
          },
        }),
        { message: 'Database inventory is invalid' },
      );
      assert.strictEqual(queries, 1);
      assert.strictEqual(result.fields, fields);
      assert.deepStrictEqual(rows, populated ? [projectedInventoryRow()] : []);
    });
  }
  test(`main: ${label} columns suppress requests and publication`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-db-columns-failure-'),
    );
    try {
      let queries = 0;
      let ended = 0;
      let destroyed = 0;
      const s3Client = listingClient([{ IsTruncated: false }]);
      s3Client.destroy = () => destroyed++;
      const io = createIo();
      assert.strictEqual(
        await main(
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
            s3Client,
            pgClient: {
              query: async () => {
                queries++;
                return {
                  fields,
                  rows: [],
                  command: 'SELECT',
                  rowCount: 0,
                  rowAsArray: false,
                };
              },
              end: async () => {
                ended++;
              },
            },
          },
        ),
        1,
      );
      assert.strictEqual(queries, 1);
      assert.strictEqual(s3Client.inputs.length, 0);
      assert.strictEqual(ended, 0);
      assert.strictEqual(destroyed, 0);
      assert.deepStrictEqual(io.logs, [
        'Connecting to PostgreSQL and Object Storage...',
      ]);
      assert.deepStrictEqual(io.errors, ['Error: Database query failed']);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const [label, metadata] of projectionVariants) {
  for (const count of [0, 2]) {
    test(`queryDatabaseStoredObjects: preserves ${label} columns and ${count} rows`, async () => {
      const rows = Object.freeze(
        Array.from({ length: count }, (_, i) =>
          Object.freeze(
            projectedInventoryRow({
              id: `id-${i}`,
              objectKey: `key-${i}`,
              byteCount: '0001',
              opaque: 'kept',
            }),
          ),
        ),
      );
      const result = Object.freeze({
        ...metadata,
        rows,
        rowCount: count,
        command: 'SELECT',
        rowAsArray: false,
      });
      const converted = await queryDatabaseStoredObjects({
        pgClient: { query: async () => result },
      });
      assert.deepStrictEqual(
        converted,
        rows.map((r) => ({ ...r, byteCount: 1n })),
      );
      assert.ok(rows.every((r) => r.byteCount === '0001'));
    });
    test(`main: ${label} columns with ${count} rows publish simulation`, async () => {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'acres-db-columns-success-'),
      );
      try {
        const rows = Array.from({ length: count }, (_, i) =>
          projectedInventoryRow({ id: `id-${i}`, objectKey: `key-${i}` }),
        );
        const s3Client = listingClient([
          {
            IsTruncated: false,
            Contents: rows.map((r) => ({ Key: r.objectKey, Size: 1 })),
          },
        ]);
        const io = createIo();
        const target = path.join(dir, 'receipt.json');
        let queries = 0;
        assert.strictEqual(
          await main(['node', 'script', '--dry-run', '--output', target], io, {
            env: {},
            s3Client,
            pgClient: {
              query: async () => {
                queries++;
                return {
                  ...metadata,
                  rows,
                  rowCount: count,
                  command: 'SELECT',
                  rowAsArray: false,
                };
              },
            },
          }),
          0,
        );
        const report = JSON.parse(fs.readFileSync(target, 'utf8'));
        assert.strictEqual(queries, 1);
        assert.strictEqual(s3Client.inputs.length, 1);
        assert.strictEqual(report.execution_mode, 'simulation');
        assert.strictEqual(report.summary.status, 'clean');
        assert.strictEqual(report.summary.matchedObjects, count);
        assert.deepStrictEqual(io.errors, []);
        assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }
}

for (const [label, overrides] of [
  ['invalid row', { rows: [{}] }],
  ['sparse rows', { rows: new Array(1) }],
  ['duplicate rows', { rows: [projectedInventoryRow(), projectedInventoryRow()] }],
  ['invalid bytes', { rows: [projectedInventoryRow({ byteCount: true })] }],
  ['wrong count', { rowCount: 0 }],
  ['wrong command', { command: 'DELETE' }],
  ['array mode', { rowAsArray: true }],
]) {
  test(`queryDatabaseStoredObjects: correct columns cannot excuse ${label}`, async () => {
    await assert.rejects(
      queryDatabaseStoredObjects({
        pgClient: {
          query: async () => ({
            fields: databaseInventoryFields(),
            rows: [projectedInventoryRow()],
            ...overrides,
          }),
        },
      }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const valid of [false, true]) {
  test(`queryDatabaseStoredObjects: installed pg empty projection valid=${valid}`, async () => {
    const Result = require('pg/lib/result');
    const result = new Result();
    result.addFields(
      valid
        ? databaseInventoryFields()
        : [{ name: 'unrelated', dataTypeID: 25, format: 'text' }],
    );
    result.addCommandComplete({ text: 'SELECT 0' });
    const query = queryDatabaseStoredObjects({
      pgClient: { query: async () => result },
    });
    if (valid) assert.deepStrictEqual(await query, []);
    else
      await assert.rejects(query, { message: 'Database inventory is invalid' });
  });
}

test('queryDatabaseStoredObjects: installed pg parses the fixed projection', async () => {
  const Result = require('pg/lib/result');
  const result = new Result();
  result.addFields(databaseInventoryFields());
  const values = [
    'fixture-id',
    'fixture-org',
    'acres-quarantine',
    'fixture-key',
    '0001',
    null,
    null,
    'accepted',
    null,
    null,
    null,
    null,
  ];
  result.addRow(result.parseRow(values));
  result.addCommandComplete({ text: 'SELECT 1' });
  const converted = await queryDatabaseStoredObjects({
    pgClient: { query: async () => result },
  });
  assert.deepStrictEqual(converted, [{ ...result.rows[0], byteCount: 1n }]);
  assert.strictEqual(result.rows[0].byteCount, '0001');
});

// Plain-text inventory SELECTs cannot describe binary result columns.
const invalidDatabaseFormats = [
  ['binary', 'binary'],
  ['uppercase', 'TEXT'],
  ['padded', ' text '],
  ['empty', ''],
  ['null', null],
  ['boolean', false],
  ['number', 0],
  ['array', ['text']],
  ['object', {}],
  ['symbol', Symbol('private-format')],
  ['bigint', 0n],
  ['boxed', new String('text')],
  [
    'throwing coercion',
    {
      [Symbol.toPrimitive]() {
        throw new Error('private-format-coercion');
      },
    },
  ],
];

for (const [index, [label, format]] of invalidDatabaseFormats.entries()) {
  test(`queryDatabaseStoredObjects: rejects ${label} column format`, async () => {
    const fields = Object.freeze(
      databaseInventoryFields().map((field, i) =>
        Object.freeze(
          i === [0, 5, 11][index % 3] ? { ...field, format } : field,
        ),
      ),
    );
    const rows = Object.freeze(
      index % 2 ? [Object.freeze(projectedInventoryRow())] : [],
    );
    const result = Object.freeze({
      fields,
      rows,
      command: 'SELECT',
      rowCount: rows.length,
      rowAsArray: false,
    });
    let queries = 0;
    await assert.rejects(
      queryDatabaseStoredObjects({
        pgClient: {
          query: async () => {
            queries++;
            return result;
          },
        },
      }),
      { message: 'Database inventory is invalid' },
    );
    assert.strictEqual(queries, 1);
    assert.strictEqual(result.fields, fields);
    assert.deepStrictEqual(rows, index % 2 ? [projectedInventoryRow()] : []);
  });
}

for (const [label, format] of invalidDatabaseFormats
  .slice(0, 1)
  .concat(invalidDatabaseFormats.slice(-1))) {
  test(`main: ${label} column format suppresses requests and publication`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-db-format-failure-'),
    );
    try {
      let queries = 0;
      let ended = 0;
      let destroyed = 0;
      const fields = databaseInventoryFields();
      fields[11] = { ...fields[11], format };
      const s3Client = listingClient([{ IsTruncated: false }]);
      s3Client.destroy = () => destroyed++;
      const io = createIo();
      assert.strictEqual(
        await main(
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
            s3Client,
            pgClient: {
              query: async () => {
                queries++;
                return {
                  fields,
                  rows: [],
                  command: 'SELECT',
                  rowCount: 0,
                  rowAsArray: false,
                };
              },
              end: async () => {
                ended++;
              },
            },
          },
        ),
        1,
      );
      assert.strictEqual(queries, 1);
      assert.strictEqual(s3Client.inputs.length, 0);
      assert.strictEqual(ended, 0);
      assert.strictEqual(destroyed, 0);
      assert.deepStrictEqual(io.logs, [
        'Connecting to PostgreSQL and Object Storage...',
      ]);
      assert.deepStrictEqual(io.errors, ['Error: Database query failed']);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

const compatibleDatabaseFormats = [
  ['omitted', ({ name }) => ({ name })],
  ['undefined', (field) => ({ ...field, format: undefined })],
  ['text', (field) => field],
  [
    'mixed',
    (field, i) =>
      i % 3 === 0
        ? { name: field.name }
        : { ...field, format: i % 3 === 1 ? undefined : 'text' },
  ],
];
for (const [label, describe] of compatibleDatabaseFormats) {
  for (const count of [0, 2]) {
    test(`queryDatabaseStoredObjects: preserves ${label} formats with ${count} rows`, async () => {
      const fields = Object.freeze(
        databaseInventoryFields().map((field, i) =>
          Object.freeze({ ...describe(field, i), opaque: 'kept' }),
        ),
      );
      const rows = Object.freeze(
        Array.from({ length: count }, (_, i) =>
          Object.freeze(
            projectedInventoryRow({
              id: `id-${i}`,
              objectKey: `key-${i}`,
              byteCount: '0001',
              opaque: 'kept',
            }),
          ),
        ),
      );
      const result = Object.freeze({
        fields,
        rows,
        command: 'SELECT',
        rowCount: count,
        rowAsArray: false,
      });
      assert.deepStrictEqual(
        await queryDatabaseStoredObjects({
          pgClient: { query: async () => result },
        }),
        rows.map((row) => ({ ...row, byteCount: 1n })),
      );
      assert.ok(rows.every((row) => row.byteCount === '0001'));
      assert.strictEqual(result.fields, fields);
    });
  }
}

for (const count of [0, 2]) {
  test(`main: supported mixed column formats publish ${count} simulation matches`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-db-format-success-'),
    );
    try {
      const rows = Array.from({ length: count }, (_, i) =>
        projectedInventoryRow({ id: `id-${i}`, objectKey: `key-${i}` }),
      );
      const fields = databaseInventoryFields().map(
        compatibleDatabaseFormats[3][1],
      );
      const s3Client = listingClient([
        {
          IsTruncated: false,
          Contents: rows.map((row) => ({ Key: row.objectKey, Size: 1 })),
        },
      ]);
      const io = createIo();
      const target = path.join(dir, 'receipt.json');
      let queries = 0;
      assert.strictEqual(
        await main(['node', 'script', '--dry-run', '--output', target], io, {
          env: {},
          s3Client,
          pgClient: {
            query: async () => {
              queries++;
              return {
                fields,
                rows,
                command: 'SELECT',
                rowCount: count,
                rowAsArray: false,
              };
            },
          },
        }),
        0,
      );
      const report = JSON.parse(fs.readFileSync(target, 'utf8'));
      assert.strictEqual(queries, 1);
      assert.strictEqual(s3Client.inputs.length, 1);
      assert.strictEqual(report.execution_mode, 'simulation');
      assert.strictEqual(report.summary.status, 'clean');
      assert.strictEqual(report.summary.matchedObjects, count);
      assert.deepStrictEqual(io.errors, []);
      assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const [label, overrides] of [
  ['invalid row', { rows: [{}] }],
  ['wrong names', { fields: databaseInventoryFields().reverse() }],
  ['wrong count', { rowCount: 0 }],
  ['wrong command', { command: 'DELETE' }],
  ['array mode', { rowAsArray: true }],
]) {
  test(`queryDatabaseStoredObjects: text formats cannot excuse ${label}`, async () => {
    await assert.rejects(
      queryDatabaseStoredObjects({
        pgClient: {
          query: async () => ({
            fields: databaseInventoryFields(),
            rows: [projectedInventoryRow()],
            ...overrides,
          }),
        },
      }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const format of ['text', 'binary']) {
  test(`queryDatabaseStoredObjects: installed pg empty SELECT format ${format}`, async () => {
    const Result = require('pg/lib/result');
    const result = new Result();
    result.addFields(
      databaseInventoryFields().map((field) => ({ ...field, format })),
    );
    result.addCommandComplete({ text: 'SELECT 0' });
    const query = queryDatabaseStoredObjects({
      pgClient: { query: async () => result },
    });
    if (format === 'text') assert.deepStrictEqual(await query, []);
    else
      await assert.rejects(query, { message: 'Database inventory is invalid' });
  });
}

// The SELECT casts byteCount to text regardless of the underlying column type.
const invalidByteCountTypes = [
  ['float OID', 701],
  ['int8 OID', 20],
  ['varchar OID', 1043],
  ['zero', 0],
  ['negative', -25],
  ['fraction', 25.1],
  ['NaN', NaN],
  ['infinity', Infinity],
  ['null', null],
  ['string', '25'],
  ['boolean', false],
  ['array', [25]],
  ['object', {}],
  ['boxed', new Number(25)],
  ['bigint', 25n],
  ['symbol', Symbol('private-type')],
  [
    'coercion trap',
    {
      [Symbol.toPrimitive]() {
        throw new Error('private-type');
      },
    },
  ],
];
for (const [i, [label, dataTypeID]] of invalidByteCountTypes.entries()) {
  test(`queryDatabaseStoredObjects: rejects byteCount ${label}`, async () => {
    const fields = Object.freeze(
      databaseInventoryFields().map((field) =>
        Object.freeze(
          field.name === 'byteCount' ? { ...field, dataTypeID } : field,
        ),
      ),
    );
    const rows = Object.freeze(
      i % 2 ? [Object.freeze(projectedInventoryRow({ byteCount: '1' }))] : [],
    );
    const result = Object.freeze({
      fields,
      rows,
      command: 'SELECT',
      rowCount: rows.length,
    });
    await assert.rejects(
      queryDatabaseStoredObjects({ pgClient: { query: async () => result } }),
      { message: 'Database inventory is invalid' },
    );
    assert.strictEqual(result.fields, fields);
    assert.strictEqual(result.rows, rows);
    if (rows.length) assert.strictEqual(rows[0].byteCount, '1');
  });
}

for (const [label, patch] of [
  ['omitted', {}],
  ['undefined', { dataTypeID: undefined }],
  ['text OID', { dataTypeID: 25 }],
]) {
  for (const count of [0, 2]) {
    test(`queryDatabaseStoredObjects: accepts byteCount ${label} with ${count} rows`, async () => {
      const fields = Object.freeze(
        databaseInventoryFields().map((field) =>
          Object.freeze(
            field.name === 'byteCount'
              ? { name: field.name, format: 'text', ...patch }
              : {
                  ...field,
                  dataTypeID: ['state', 'uploadState'].includes(field.name)
                    ? 99999
                    : field.dataTypeID,
                  opaque: 'kept',
                },
          ),
        ),
      );
      const rows = Object.freeze(
        Array.from({ length: count }, (_, i) =>
          Object.freeze(
            projectedInventoryRow({
              id: `id-${i}`,
              objectKey: `key-${i}`,
              byteCount: '0001',
            }),
          ),
        ),
      );
      const result = Object.freeze({
        fields,
        rows,
        command: 'SELECT',
        rowCount: count,
        rowAsArray: false,
      });
      assert.deepStrictEqual(
        await queryDatabaseStoredObjects({
          pgClient: { query: async () => result },
        }),
        rows.map((row) => ({ ...row, byteCount: 1n })),
      );
      assert.ok(rows.every((row) => row.byteCount === '0001'));
    });
  }
}

for (const [label, dataTypeID] of [
  ['float', 701],
  ['malformed', 'private-type'],
]) {
  test(`main: byteCount ${label} type suppresses storage and publication`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-db-type-failure-'),
    );
    try {
      let queries = 0,
        ended = 0,
        destroyed = 0;
      const fields = databaseInventoryFields().map((field) =>
        field.name === 'byteCount' ? { ...field, dataTypeID } : field,
      );
      const s3Client = listingClient([{ IsTruncated: false }]);
      s3Client.destroy = () => destroyed++;
      const io = createIo();
      assert.strictEqual(
        await main(
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
            s3Client,
            pgClient: {
              query: async () => {
                queries++;
                return { fields, rows: [], command: 'SELECT', rowCount: 0 };
              },
              end: async () => {
                ended++;
              },
            },
          },
        ),
        1,
      );
      assert.strictEqual(queries, 1);
      assert.strictEqual(s3Client.inputs.length, 0);
      assert.strictEqual(ended, 0);
      assert.strictEqual(destroyed, 0);
      assert.deepStrictEqual(io.logs, [
        'Connecting to PostgreSQL and Object Storage...',
      ]);
      assert.deepStrictEqual(io.errors, ['Error: Database query failed']);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const count of [0, 2]) {
  test(`main: text byteCount type publishes ${count} simulation matches`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-db-type-success-'),
    );
    try {
      const rows = Array.from({ length: count }, (_, i) =>
        projectedInventoryRow({ id: `id-${i}`, objectKey: `key-${i}` }),
      );
      const s3Client = listingClient([
        {
          IsTruncated: false,
          Contents: rows.map((row) => ({ Key: row.objectKey, Size: 1 })),
        },
      ]);
      const io = createIo();
      const target = path.join(dir, 'receipt.json');
      assert.strictEqual(
        await main(['node', 'script', '--dry-run', '--output', target], io, {
          env: {},
          s3Client,
          pgClient: {
            query: async () => ({
              rows,
              fields: databaseInventoryFields(),
              command: 'SELECT',
              rowCount: count,
            }),
          },
        }),
        0,
      );
      const report = JSON.parse(fs.readFileSync(target, 'utf8'));
      assert.strictEqual(report.execution_mode, 'simulation');
      assert.strictEqual(report.summary.status, 'clean');
      assert.strictEqual(report.summary.matchedObjects, count);
      assert.strictEqual(s3Client.inputs.length, 1);
      assert.deepStrictEqual(io.errors, []);
      assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const [label, overrides] of [
  ['invalid row', { rows: [{}] }],
  ['wrong names', { fields: databaseInventoryFields().reverse() }],
  [
    'wrong format',
    {
      fields: databaseInventoryFields().map((field) => ({
        ...field,
        format: 'binary',
      })),
    },
  ],
  ['wrong count', { rowCount: 0 }],
  ['wrong command', { command: 'DELETE' }],
  ['array mode', { rowAsArray: true }],
]) {
  test(`queryDatabaseStoredObjects: text byteCount type cannot excuse ${label}`, async () => {
    await assert.rejects(
      queryDatabaseStoredObjects({
        pgClient: {
          query: async () => ({
            fields: databaseInventoryFields(),
            rows: [projectedInventoryRow()],
            ...overrides,
          }),
        },
      }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const dataTypeID of [25, 701]) {
  for (const count of [0, 1]) {
    test(`queryDatabaseStoredObjects: installed pg byteCount type ${dataTypeID} with ${count} rows`, async () => {
      const Result = require('pg/lib/result');
      const result = new Result();
      result.addFields(
        databaseInventoryFields().map((field) =>
          field.name === 'byteCount' ? { ...field, dataTypeID } : field,
        ),
      );
      if (count)
        result.addRow(
          result.parseRow([
            'fixture-id',
            'fixture-org',
            'acres-quarantine',
            'fixture-key',
            '0001',
            null,
            null,
            'accepted',
            null,
            null,
            null,
            null,
          ]),
        );
      result.addCommandComplete({ text: `SELECT ${count}` });
      if (dataTypeID === 25) {
        assert.deepStrictEqual(
          await queryDatabaseStoredObjects({
            pgClient: { query: async () => result },
          }),
          result.rows.map((row) => ({ ...row, byteCount: 1n })),
        );
        if (count) assert.strictEqual(result.rows[0].byteCount, '0001');
      } else {
        if (count) assert.strictEqual(result.rows[0].byteCount, 1);
        await assert.rejects(
          queryDatabaseStoredObjects({
            pgClient: { query: async () => result },
          }),
          { message: 'Database inventory is invalid' },
        );
      }
    });
  }
}

// These three projected columns are timestamptz in the committed storage migration.
const inventoryTimestampColumns = ['deletedAt', 'createdAt', 'uploadExpiresAt'];
for (const name of inventoryTimestampColumns) {
  for (const dataTypeID of [25, 1082, 1114]) {
    for (const count of [0, 1]) {
      test(`queryDatabaseStoredObjects: rejects ${name} type ${dataTypeID} with ${count} rows`, async () => {
        const fields = Object.freeze(
          databaseInventoryFields().map((field) =>
            Object.freeze(
              field.name === name ? { ...field, dataTypeID } : field,
            ),
          ),
        );
        const rows = Object.freeze(
          count
            ? [
                Object.freeze(
                  projectedInventoryRow({
                    [name]: '2026-01-02T03:04:05Z',
                    byteCount: '1',
                  }),
                ),
              ]
            : [],
        );
        const result = Object.freeze({
          fields,
          rows,
          command: 'SELECT',
          rowCount: count,
        });
        await assert.rejects(
          queryDatabaseStoredObjects({
            pgClient: { query: async () => result },
          }),
          { message: 'Database inventory is invalid' },
        );
        assert.strictEqual(result.rows, rows);
        assert.strictEqual(result.fields, fields);
        if (count) assert.strictEqual(rows[0][name], '2026-01-02T03:04:05Z');
      });
    }
  }
}

for (const [i, [label, dataTypeID]] of [
  ['null', null],
  ['string', '1184'],
  ['boolean', true],
  ['zero', 0],
  ['negative', -1184],
  ['fraction', 1184.1],
  ['NaN', NaN],
  ['infinity', Infinity],
  ['array', [1184]],
  ['object', {}],
  ['boxed', new Number(1184)],
  ['bigint', 1184n],
  ['symbol', Symbol('private-timestamp')],
  [
    'coercion trap',
    {
      [Symbol.toPrimitive]() {
        throw new Error('private-timestamp');
      },
    },
  ],
].entries()) {
  const name = inventoryTimestampColumns[i % inventoryTimestampColumns.length];
  test(`queryDatabaseStoredObjects: rejects timestamp ${label} without coercion`, async () => {
    const fields = databaseInventoryFields().map((field) =>
      field.name === name ? { ...field, dataTypeID } : field,
    );
    await assert.rejects(
      queryDatabaseStoredObjects({
        pgClient: {
          query: async () => ({
            fields,
            rows: i % 2 ? [projectedInventoryRow()] : [],
          }),
        },
      }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const [label, patch] of [
  ['omitted', {}],
  ['undefined', { dataTypeID: undefined }],
  ['timestamptz', { dataTypeID: 1184 }],
]) {
  for (const count of [0, 2]) {
    test(`queryDatabaseStoredObjects: accepts ${label} timestamp types with ${count} rows`, async () => {
      const fields = Object.freeze(
        databaseInventoryFields().map((field) =>
          Object.freeze(
            inventoryTimestampColumns.includes(field.name)
              ? { name: field.name, format: 'text', ...patch }
              : ['state', 'uploadState'].includes(field.name)
                ? { ...field, dataTypeID: 99999 }
                : field,
          ),
        ),
      );
      const rows = Object.freeze(
        Array.from({ length: count }, (_, i) =>
          Object.freeze(
            projectedInventoryRow({
              id: `id-${i}`,
              objectKey: `key-${i}`,
              byteCount: '0001',
              deletedAt: null,
              createdAt: new Date('2026-01-02T03:04:05Z'),
              uploadExpiresAt: null,
            }),
          ),
        ),
      );
      const result = Object.freeze({
        fields,
        rows,
        command: 'SELECT',
        rowCount: count,
        rowAsArray: false,
      });
      assert.deepStrictEqual(
        await queryDatabaseStoredObjects({
          pgClient: { query: async () => result },
        }),
        rows.map((row) => ({ ...row, byteCount: 1n })),
      );
      assert.ok(rows.every((row) => row.byteCount === '0001'));
    });
  }
}

for (const [i, name] of inventoryTimestampColumns.entries()) {
  test(`main: invalid ${name} type suppresses storage and publication`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-db-timestamp-failure-'),
    );
    try {
      let queries = 0,
        ended = 0,
        destroyed = 0;
      const fields = databaseInventoryFields().map((field) =>
        field.name === name
          ? { ...field, dataTypeID: i === 1 ? 'private-timestamp' : 25 }
          : field,
      );
      const rows =
        i === 0 ? [] : [projectedInventoryRow({ [name]: '2026-01-02T03:04:05Z' })];
      const s3Client = listingClient([{ IsTruncated: false }]);
      s3Client.destroy = () => destroyed++;
      const io = createIo();
      assert.strictEqual(
        await main(
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
            s3Client,
            pgClient: {
              query: async () => {
                queries++;
                return {
                  fields,
                  rows,
                  command: 'SELECT',
                  rowCount: rows.length,
                };
              },
              end: async () => {
                ended++;
              },
            },
          },
        ),
        1,
      );
      assert.strictEqual(queries, 1);
      assert.strictEqual(s3Client.inputs.length, 0);
      assert.strictEqual(ended, 0);
      assert.strictEqual(destroyed, 0);
      assert.deepStrictEqual(io.logs, [
        'Connecting to PostgreSQL and Object Storage...',
      ]);
      assert.deepStrictEqual(io.errors, ['Error: Database query failed']);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const [label, overrides] of [
  ['invalid row', { rows: [{}] }],
  ['wrong count', { rowCount: 0 }],
  ['wrong command', { command: 'DELETE' }],
  ['array mode', { rowAsArray: true }],
  ['wrong names', { fields: databaseInventoryFields().reverse() }],
  [
    'wrong format',
    {
      fields: databaseInventoryFields().map((field) => ({
        ...field,
        format: 'binary',
      })),
    },
  ],
  [
    'wrong byteCount type',
    {
      fields: databaseInventoryFields().map((field) =>
        field.name === 'byteCount' ? { ...field, dataTypeID: 701 } : field,
      ),
    },
  ],
]) {
  test(`queryDatabaseStoredObjects: valid timestamp types cannot excuse ${label}`, async () => {
    await assert.rejects(
      queryDatabaseStoredObjects({
        pgClient: {
          query: async () => ({
            fields: databaseInventoryFields(),
            rows: [projectedInventoryRow()],
            ...overrides,
          }),
        },
      }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const dataTypeID of [1184, 25]) {
  for (const count of [0, 1]) {
    test(`queryDatabaseStoredObjects: installed pg timestamp type ${dataTypeID} with ${count} rows`, async () => {
      const Result = require('pg/lib/result');
      const result = new Result();
      result.addFields(
        databaseInventoryFields().map((field) =>
          inventoryTimestampColumns.includes(field.name)
            ? { ...field, dataTypeID }
            : field,
        ),
      );
      if (count)
        result.addRow(
          result.parseRow([
            'fixture-id',
            'fixture-org',
            'acres-quarantine',
            'fixture-key',
            '0001',
            null,
            null,
            'accepted',
            null,
            '2026-01-02 03:04:05+00',
            null,
            null,
          ]),
        );
      result.addCommandComplete({ text: `SELECT ${count}` });
      if (dataTypeID === 1184) {
        assert.deepStrictEqual(
          await queryDatabaseStoredObjects({
            pgClient: { query: async () => result },
          }),
          result.rows.map((row) => ({ ...row, byteCount: 1n })),
        );
        if (count)
          assert.strictEqual(
            result.rows[0].createdAt.toISOString(),
            '2026-01-02T03:04:05.000Z',
          );
      } else {
        if (count)
          assert.strictEqual(typeof result.rows[0].createdAt, 'string');
        await assert.rejects(
          queryDatabaseStoredObjects({
            pgClient: { query: async () => result },
          }),
          { message: 'Database inventory is invalid' },
        );
      }
    });
  }
}


const inventoryTextColumns = [
  'id',
  'organizationId',
  'bucket',
  'objectKey',
  'checksumAlgorithm',
  'checksumHex',
];

for (const name of inventoryTextColumns) {
  for (const count of [0, 1]) {
    test(`queryDatabaseStoredObjects: rejects ${name} VARCHAR descriptor with ${count} rows`, async () => {
      const fields = databaseInventoryFields().map((field) =>
        field.name === name ? { ...field, dataTypeID: 1043 } : field,
      );
      await assert.rejects(
        queryDatabaseStoredObjects({
          pgClient: {
            query: async () => ({
              fields,
              rows: count ? [projectedInventoryRow()] : [],
            }),
          },
        }),
        { message: 'Database inventory is invalid' },
      );
    });
  }
}

for (const [i, dataTypeID] of [
  2950,
  99999,
  16,
  20,
  1184,
  0,
  -1,
  25.1,
  NaN,
  Infinity,
  '25',
  null,
  false,
  25n,
  Symbol('private-type'),
  new Number(25),
  [],
  {},
  {
    [Symbol.toPrimitive]() {
      throw new Error('private-coercion');
    },
  },
].entries()) {
  test(`queryDatabaseStoredObjects: rejects malformed native text type case ${i}`, async () => {
    const name = inventoryTextColumns[i % inventoryTextColumns.length];
    await assert.rejects(
      queryDatabaseStoredObjects({
        pgClient: {
          query: async () => ({
            fields: databaseInventoryFields().map((field) =>
              field.name === name ? { ...field, dataTypeID } : field,
            ),
            rows: i % 2 ? [projectedInventoryRow()] : [],
          }),
        },
      }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const [label, patch] of [
  ['omitted', {}],
  ['undefined', { dataTypeID: undefined }],
  ['TEXT', { dataTypeID: 25 }],
]) {
  for (const count of [0, 2]) {
    test(`queryDatabaseStoredObjects: preserves ${label} native text types with ${count} rows`, async () => {
      const fields = Object.freeze(
        databaseInventoryFields().map((field) =>
          Object.freeze(
            inventoryTextColumns.includes(field.name)
              ? { name: field.name, format: 'text', ...patch }
              : ['state', 'uploadState'].includes(field.name)
                ? { ...field, dataTypeID: 99999 }
                : field,
          ),
        ),
      );
      const rows = Object.freeze(
        Array.from({ length: count }, (_, i) =>
          Object.freeze(
            projectedInventoryRow({
              id: `id-${i}`,
              objectKey: `key-${i}`,
              byteCount: '0001',
              checksumAlgorithm: null,
              checksumHex: null,
              uploadState: null,
            }),
          ),
        ),
      );
      const result = Object.freeze({
        fields,
        rows,
        command: 'SELECT',
        rowCount: count,
        rowAsArray: false,
      });
      assert.deepStrictEqual(
        await queryDatabaseStoredObjects({
          pgClient: { query: async () => result },
        }),
        rows.map((row) => ({ ...row, byteCount: 1n })),
      );
      assert.ok(rows.every((row) => row.byteCount === '0001'));
      assert.strictEqual(result.fields, fields);
    });
  }
}

for (const [label, overrides] of [
  ['invalid row', { rows: [{}] }],
  ['count', { rowCount: 0 }],
  ['command', { command: 'DELETE' }],
  ['row mode', { rowAsArray: true }],
  ['names', { fields: databaseInventoryFields().reverse() }],
  [
    'format',
    {
      fields: databaseInventoryFields().map((field) => ({
        ...field,
        format: 'binary',
      })),
    },
  ],
  [
    'timestamp',
    {
      fields: databaseInventoryFields().map((field) =>
        field.name === 'createdAt' ? { ...field, dataTypeID: 25 } : field,
      ),
    },
  ],
  [
    'byte count',
    {
      fields: databaseInventoryFields().map((field) =>
        field.name === 'byteCount' ? { ...field, dataTypeID: 20 } : field,
      ),
    },
  ],
]) {
  test(`queryDatabaseStoredObjects: correct native text types cannot excuse ${label}`, async () => {
    await assert.rejects(
      queryDatabaseStoredObjects({
        pgClient: {
          query: async () => ({
            rows: [projectedInventoryRow()],
            fields: databaseInventoryFields(),
            command: 'SELECT',
            rowCount: 1,
            rowAsArray: false,
            ...overrides,
          }),
        },
      }),
      { message: 'Database inventory is invalid' },
    );
  });
}

for (const dataTypeID of [25, 1043]) {
  for (const count of [0, 1]) {
    test(`queryDatabaseStoredObjects: installed pg native text type ${dataTypeID} with ${count} rows`, async () => {
      const Result = require('pg/lib/result');
      const result = new Result();
      result.addFields(
        databaseInventoryFields().map((field) =>
          inventoryTextColumns.includes(field.name)
            ? { ...field, dataTypeID }
            : field,
        ),
      );
      if (count)
        result.addRow(
          result.parseRow([
            'fixture-id',
            'fixture-org',
            'acres-quarantine',
            'fixture-key',
            '0001',
            'sha256',
            'a'.repeat(64),
            'accepted',
            null,
            '2026-01-02 03:04:05+00',
            null,
            null,
          ]),
        );
      result.addCommandComplete({ text: `SELECT ${count}` });
      if (count)
        for (const name of inventoryTextColumns)
          assert.strictEqual(typeof result.rows[0][name], 'string');
      const query = queryDatabaseStoredObjects({
        pgClient: { query: async () => result },
      });
      if (dataTypeID === 25)
        assert.deepStrictEqual(
          await query,
          result.rows.map((row) => ({ ...row, byteCount: 1n })),
        );
      else
        await assert.rejects(query, {
          message: 'Database inventory is invalid',
        });
    });
  }
}

for (const [i, name] of inventoryTextColumns.entries()) {
  test(`main: invalid ${name} native text type suppresses storage and publication`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-db-text-failure-'),
    );
    try {
      let queries = 0,
        ended = 0,
        destroyed = 0;
      const rows = i % 2 ? [projectedInventoryRow()] : [];
      const fields = databaseInventoryFields().map((field) =>
        field.name === name
          ? { ...field, dataTypeID: i === 1 ? 'private-text-type' : 1043 }
          : field,
      );
      const s3Client = listingClient([{ IsTruncated: false }]);
      s3Client.destroy = () => destroyed++;
      const io = createIo();
      assert.strictEqual(
        await main(
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
            s3Client,
            pgClient: {
              query: async () => {
                queries++;
                return {
                  fields,
                  rows,
                  command: 'SELECT',
                  rowCount: rows.length,
                };
              },
              end: async () => {
                ended++;
              },
            },
          },
        ),
        1,
      );
      assert.strictEqual(queries, 1);
      assert.strictEqual(s3Client.inputs.length, 0);
      assert.strictEqual(ended, 0);
      assert.strictEqual(destroyed, 0);
      assert.deepStrictEqual(io.logs, [
        'Connecting to PostgreSQL and Object Storage...',
      ]);
      assert.deepStrictEqual(io.errors, ['Error: Database query failed']);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const { name } of databaseInventoryFields()) {
  for (const later of [false, true]) {
    test(`queryDatabaseStoredObjects: rejects missing projected ${name} in ${later ? 'later' : 'first'} row`, async () => {
      const row = projectedInventoryRow({
        id: 'incomplete',
        objectKey: 'incomplete',
      });
      delete row[name];
      Object.freeze(row);
      const rows = Object.freeze(
        later ? [Object.freeze(projectedInventoryRow()), row] : [row],
      );
      const result = Object.freeze({
        rows,
        fields: Object.freeze(databaseInventoryFields()),
      });
      await assert.rejects(
        queryDatabaseStoredObjects({ pgClient: { query: async () => result } }),
        { message: 'Database inventory is invalid' },
      );
      assert.strictEqual(Object.hasOwn(row, name), false);
      assert.strictEqual(result.rows, rows);
    });
  }
}

for (const name of [
  'checksumHex',
  'deletedAt',
  'uploadState',
  'uploadExpiresAt',
]) {
  test(`queryDatabaseStoredObjects: rejects inherited-only projected ${name}`, async () => {
    const complete = projectedInventoryRow();
    const row = Object.assign(
      Object.create({ [name]: complete[name] }),
      complete,
    );
    delete row[name];
    Object.freeze(row);
    await assert.rejects(
      queryDatabaseStoredObjects({
        pgClient: {
          query: async () => ({
            rows: [row],
            fields: databaseInventoryFields(),
          }),
        },
      }),
      { message: 'Database inventory is invalid' },
    );
  });

  test(`main: missing projected ${name} suppresses storage and publication`, async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'acres-db-projection-failure-'),
    );
    try {
      const row = projectedInventoryRow();
      delete row[name];
      let queries = 0,
        ended = 0,
        destroyed = 0;
      const s3Client = listingClient([{ IsTruncated: false }]);
      s3Client.destroy = () => destroyed++;
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
        {
          env: {},
          s3Client,
          pgClient: {
            query: async () => {
              queries++;
              return {
                rows: [row],
                fields: databaseInventoryFields(),
                command: 'SELECT',
                rowCount: 1,
              };
            },
            end: async () => {
              ended++;
            },
          },
        },
      );
      assert.strictEqual(code, 1);
      assert.strictEqual(queries, 1);
      assert.strictEqual(s3Client.inputs.length, 0);
      assert.strictEqual(ended, 0);
      assert.strictEqual(destroyed, 0);
      assert.deepStrictEqual(io.logs, [
        'Connecting to PostgreSQL and Object Storage...',
      ]);
      assert.deepStrictEqual(io.errors, ['Error: Database query failed']);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const value of [null, undefined]) {
  test(`queryDatabaseStoredObjects: preserves complete frozen nullable/undefined projection (${value})`, async () => {
    const rows = Object.freeze(
      [0, 1].map((i) =>
        Object.freeze(
          Object.fromEntries(
            Object.entries(
              projectedInventoryRow({
                id: `id-${i}`,
                objectKey: `key-${i}`,
                byteCount: i ? '9007199254740993' : '0001',
                checksumAlgorithm: value,
                checksumHex: value,
                deletedAt: value,
                createdAt: value,
                uploadState: value,
                uploadExpiresAt: value,
                extra: 'preserved',
              }),
            ).reverse(),
          ),
        ),
      ),
    );
    const result = Object.freeze({
      rows,
      fields: Object.freeze(databaseInventoryFields()),
    });
    const actual = await queryDatabaseStoredObjects({
      pgClient: { query: async () => result },
    });
    assert.deepStrictEqual(
      actual,
      rows.map((row) => ({ ...row, byteCount: BigInt(row.byteCount) })),
    );
    assert.strictEqual(rows[0].byteCount, '0001');
    assert.strictEqual(rows[1].byteCount, '9007199254740993');
    assert.notStrictEqual(actual[0], rows[0]);
  });
}

for (const patch of [{}, { fields: undefined }]) {
  test(`queryDatabaseStoredObjects: partial legacy rows remain supported with ${Object.hasOwn(patch, 'fields') ? 'undefined' : 'omitted'} descriptors`, async () => {
    const row = Object.freeze(inventoryDbRecord());
    assert.strictEqual(Object.hasOwn(row, 'deletedAt'), false);
    assert.deepStrictEqual(
      await queryDatabaseStoredObjects({
        pgClient: { query: async () => ({ rows: [row], ...patch }) },
      }),
      [{ ...row, byteCount: 1n }],
    );
  });
}

test('queryDatabaseStoredObjects: installed pg owns NULL projection keys and rejects copied omission', async () => {
  const Result = require('pg/lib/result');
  const result = new Result();
  result.addFields(databaseInventoryFields());
  result.addRow(
    result.parseRow([
      'fixture-id',
      'fixture-org',
      'acres-quarantine',
      'fixture-key',
      '1',
      'sha256',
      null,
      'accepted',
      null,
      null,
      null,
      null,
    ]),
  );
  result.addCommandComplete({ text: 'SELECT 1' });
  for (const { name } of databaseInventoryFields())
    assert.ok(Object.hasOwn(result.rows[0], name));
  assert.strictEqual(result.rows[0].deletedAt, null);
  assert.deepStrictEqual(
    await queryDatabaseStoredObjects({
      pgClient: { query: async () => result },
    }),
    [{ ...result.rows[0], byteCount: 1n }],
  );
  const incomplete = { ...result.rows[0] };
  delete incomplete.deletedAt;
  await assert.rejects(
    queryDatabaseStoredObjects({
      pgClient: { query: async () => ({ ...result, rows: [incomplete] }) },
    }),
    { message: 'Database inventory is invalid' },
  );
});

const invalidLifecycleTypeIds = [
  ['null', null],
  ['string', '99999'],
  ['boxed', new Number(99999)],
  ['boolean', true],
  ['bigint', 99999n],
  ['symbol', Symbol('private-type')],
  ['array', [99999]],
  ['object', {}],
  ['NaN', NaN],
  ['positive infinity', Infinity],
  ['negative infinity', -Infinity],
  ['negative', -1],
  ['fraction', 1.5],
  ['overflow', 0x100000000],
  ['unsafe', Number.MAX_SAFE_INTEGER + 1],
  [
    'coercion trap',
    {
      [Symbol.toPrimitive]() {
        throw new Error('private-type-coercion');
      },
      valueOf() {
        throw new Error('private-type-coercion');
      },
      toString() {
        throw new Error('private-type-coercion');
      },
    },
  ],
];

for (const name of ['state', 'uploadState']) {
  for (const [label, dataTypeID] of invalidLifecycleTypeIds) {
    for (const populated of [false, true]) {
      test(`queryDatabaseStoredObjects: rejects ${name} ${label} type ID populated=${populated}`, async () => {
        const fields = Object.freeze(
          databaseInventoryFields().map((field) =>
            Object.freeze(
              field.name === name ? { ...field, dataTypeID } : field,
            ),
          ),
        );
        const rows = Object.freeze(
          populated ? [Object.freeze(projectedInventoryRow())] : [],
        );
        const result = Object.freeze({ fields, rows });
        let queries = 0;
        await assert.rejects(
          queryDatabaseStoredObjects({
            pgClient: {
              query: async () => {
                queries++;
                return result;
              },
            },
          }),
          { message: 'Database inventory is invalid' },
        );
        assert.strictEqual(queries, 1);
        assert.strictEqual(
          fields.find((field) => field.name === name).dataTypeID,
          dataTypeID,
        );
      });
    }
  }
}

for (const [label, patch] of [
  ['omitted', {}],
  ['undefined', { dataTypeID: undefined }],
  ...[0, -0, 1, 99999, 0x80000000, 0xffffffff].map((dataTypeID) => [
    String(dataTypeID),
    { dataTypeID },
  ]),
]) {
  for (const count of [0, 2]) {
    test(`queryDatabaseStoredObjects: preserves lifecycle type ${label} with ${count} rows`, async () => {
      const fields = Object.freeze(
        databaseInventoryFields().map((field) =>
          Object.freeze(
            ['state', 'uploadState'].includes(field.name)
              ? { name: field.name, format: 'text', ...patch }
              : field,
          ),
        ),
      );
      const rows = Object.freeze(
        Array.from({ length: count }, (_, i) =>
          Object.freeze(
            projectedInventoryRow({
              id: `id-${i}`,
              objectKey: `key-${i}`,
              byteCount: i ? '9007199254740993' : '0001',
              extra: 'preserved',
            }),
          ),
        ),
      );
      const result = Object.freeze({
        fields,
        rows,
        rowCount: count,
        command: 'SELECT',
        rowAsArray: false,
      });
      const actual = await queryDatabaseStoredObjects({
        pgClient: { query: async () => result },
      });
      assert.deepStrictEqual(
        actual,
        rows.map((row) => ({ ...row, byteCount: BigInt(row.byteCount) })),
      );
      if (count) {
        assert.strictEqual(rows[0].byteCount, '0001');
        assert.strictEqual(rows[1].byteCount, '9007199254740993');
        assert.notStrictEqual(actual[0], rows[0]);
      }
    });
  }
}

for (const name of ['state', 'uploadState']) {
  for (const dataTypeID of ['private-invalid-type', -1, 0x100000000]) {
    for (const populated of [false, true]) {
      test(`main: malformed ${name} type ${dataTypeID} populated=${populated} suppresses evidence`, async () => {
        const dir = fs.mkdtempSync(
          path.join(os.tmpdir(), 'acres-lifecycle-type-'),
        );
        try {
          let queries = 0,
            ended = 0,
            destroyed = 0;
          const s3Client = listingClient([{ IsTruncated: false }]);
          s3Client.destroy = () => destroyed++;
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
            {
              env: {},
              s3Client,
              pgClient: {
                query: async () => {
                  queries++;
                  return {
                    fields: databaseInventoryFields().map((field) =>
                      field.name === name ? { ...field, dataTypeID } : field,
                    ),
                    rows: populated ? [projectedInventoryRow()] : [],
                  };
                },
                end: async () => {
                  ended++;
                },
              },
            },
          );
          assert.strictEqual(code, 1);
          assert.strictEqual(queries, 1);
          assert.strictEqual(s3Client.inputs.length, 0);
          assert.strictEqual(ended, 0);
          assert.strictEqual(destroyed, 0);
          assert.deepStrictEqual(io.logs, [
            'Connecting to PostgreSQL and Object Storage...',
          ]);
          assert.deepStrictEqual(io.errors, ['Error: Database query failed']);
          assert.deepStrictEqual(fs.readdirSync(dir), []);
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      });
    }
  }
}

test('main: opaque lifecycle type IDs publish a clean simulation receipt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-lifecycle-valid-'));
  try {
    const output = path.join(dir, 'receipt.json');
    const io = createIo();
    const s3Client = listingClient([
      { IsTruncated: false, Contents: [{ Key: 'fixture-key', Size: 1 }] },
    ]);
    const code = await main(
      ['node', 'script', '--dry-run', '--output', output],
      io,
      {
        env: {},
        s3Client,
        pgClient: {
          query: async () => ({
            rows: [projectedInventoryRow()],
            fields: databaseInventoryFields().map((field) =>
              ['state', 'uploadState'].includes(field.name)
                ? { ...field, dataTypeID: 0xffffffff }
                : field,
            ),
          }),
        },
      },
    );
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(io.errors, []);
    assert.strictEqual(s3Client.inputs.length, 1);
    const receipt = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.strictEqual(receipt.execution_mode, 'simulation');
    assert.strictEqual(receipt.summary.status, 'clean');
    assert.deepStrictEqual(fs.readdirSync(dir), ['receipt.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('queryDatabaseStoredObjects: installed pg preserves high-bit lifecycle IDs with string values', async () => {
  const Result = require('pg/lib/result');
  const result = new Result();
  result.addFields(
    databaseInventoryFields().map((field) =>
      ['state', 'uploadState'].includes(field.name)
        ? { ...field, dataTypeID: 0x80000000 }
        : field,
    ),
  );
  result.addRow(
    result.parseRow([
      'fixture-id',
      'fixture-org',
      'acres-quarantine',
      'fixture-key',
      '0001',
      'sha256',
      null,
      'accepted',
      null,
      null,
      'accepted',
      null,
    ]),
  );
  result.addCommandComplete({ text: 'SELECT 1' });
  assert.strictEqual(result.rows[0].state, 'accepted');
  assert.strictEqual(result.rows[0].uploadState, 'accepted');
  assert.deepStrictEqual(
    await queryDatabaseStoredObjects({
      pgClient: { query: async () => result },
    }),
    [{ ...result.rows[0], byteCount: 1n }],
  );
});
