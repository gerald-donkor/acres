const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  SAST_RULES,
  scanFile,
  evaluateTriage,
  runSastScan,
  shouldIgnorePath,
} = require('./run-sast-scan');

test('shouldIgnorePath: filters out node_modules, dist, tests, and build artifacts', () => {
  assert.equal(shouldIgnorePath('node_modules/express/index.js'), true);
  assert.equal(shouldIgnorePath('server/dist/main.js'), true);
  assert.equal(shouldIgnorePath('client/.next/static/chunk.js'), true);
  assert.equal(shouldIgnorePath('server/src/auth/auth.service.spec.ts'), true);
  assert.equal(shouldIgnorePath('server/test/api.e2e-spec.ts'), true);
  assert.equal(shouldIgnorePath('scripts/ops/run-sast-scan.js'), true);

  // In-scope source files
  assert.equal(shouldIgnorePath('server/src/auth/auth.service.ts'), false);
  assert.equal(shouldIgnorePath('client/app/page.tsx'), false);
  assert.equal(shouldIgnorePath('packages/shared/src/index.ts'), false);
});

test('SAST-01: catches SQL injection patterns ($queryRawUnsafe, Prisma.raw, string concatenation)', () => {
  const rule = SAST_RULES.find((r) => r.id === 'SAST-01');
  assert.ok(rule);

  assert.ok(rule.check('const res = await prisma.$queryRawUnsafe("SELECT * FROM users");'));
  assert.ok(rule.check('await tx.$executeRawUnsafe("DROP TABLE temp");'));
  assert.ok(rule.check('const rawSql = Prisma.raw("SELECT * FROM " + tableName);'));
  assert.ok(rule.check('const q = await prisma.$queryRaw`SELECT * FROM users WHERE id = ${userId}`;'));
  assert.ok(rule.check('const res = db.query("SELECT * FROM " + table);'));

  // Safe patterns
  assert.equal(rule.check('const user = await prisma.user.findUnique({ where: { id } });'), null);
  assert.equal(rule.check('const res = await prisma.$queryRaw(Prisma.sql`SELECT * FROM users WHERE id = ${id}`);'), null);
});

test('SAST-02: catches Command injection patterns (dynamic exec, shell: true)', () => {
  const rule = SAST_RULES.find((r) => r.id === 'SAST-02');
  assert.ok(rule);

  assert.ok(rule.check('child_process.exec(`rm -rf ${userDir}`);'));
  assert.ok(rule.check('execSync("ls " + folder);'));
  assert.ok(rule.check('spawn("sh", [cmd], { shell: true });'));

  // Safe patterns
  assert.equal(rule.check('child_process.fork(scriptPath, [arg1, arg2]);'), null);
  assert.equal(rule.check('spawn("node", ["dist/main.js"]);'), null);
});

test('SAST-03: catches Path traversal patterns', () => {
  const rule = SAST_RULES.find((r) => r.id === 'SAST-03');
  assert.ok(rule);

  assert.ok(rule.check('fs.readFileSync("../../secrets.json");'));
  assert.ok(rule.check('fs.readFile(baseDir + req.query.file);'));

  // Safe patterns
  assert.equal(rule.check('fs.readFileSync(path.join(__dirname, "config.json"));'), null);
});

test('SAST-04: catches Hardcoded Secrets (private keys, API tokens, hardcoded JWT secrets)', () => {
  const rule = SAST_RULES.find((r) => r.id === 'SAST-04');
  assert.ok(rule);

  assert.ok(rule.check('const key = "-----BEGIN RSA PRIVATE KEY-----";'));
  assert.ok(rule.check('const token = "sk-1234567890abcdef1234567890abcdef";'));
  assert.ok(rule.check('const gh = "ghp_123456789012345678901234567890123456";'));
  assert.ok(rule.check('const conn = "postgres://admin:superSecretPassword123@prod-db.internal:5432/db";'));
  assert.ok(rule.check('const jwtToken = jwt.sign(payload, "mySuperSecretKey123");'));

  // Safe patterns
  assert.equal(rule.check('const key = process.env.API_KEY;'), null);
  assert.equal(rule.check('const url = process.env.DATABASE_URL;'), null);
});

test('SAST-05: catches ReDoS patterns with nested quantifiers', () => {
  const rule = SAST_RULES.find((r) => r.id === 'SAST-05');
  assert.ok(rule);

  assert.ok(rule.check('const rx = /(a+)+/g;'));
  assert.ok(rule.check('const rx = /([a-zA-Z0-9]+)*/;'));
  assert.ok(rule.check('const rx = /(\\d+)+/;'));

  // Safe patterns
  assert.equal(rule.check('const rx = /^[a-zA-Z0-9_-]+$/;'), null);
  assert.equal(rule.check('const rx = /\\d{4}-\\d{2}-\\d{2}/;'), null);
});

test('SAST-06: catches multi-tenant Prisma queries without where scoping', () => {
  const rule = SAST_RULES.find((r) => r.id === 'SAST-06');
  assert.ok(rule);

  // Violates: findMany without where in server/src across models and accessors
  assert.ok(rule.check('const data = await this.prisma.dataset.findMany({ select: { id: true } });', '', 'server/src/datasets/datasets.service.ts'));
  assert.ok(rule.check('const members = await tx.membership.findMany({ take: 10 });', '', 'server/src/orgs/orgs.service.ts'));
  assert.ok(rule.check('const invites = await client.invitation.findMany();', '', 'server/src/orgs/orgs.service.ts'));

  // Multi-line findMany with where clause on next line is safe
  const multiLineSafe = `const rows = await tx.membership.findMany({\n  where: { organizationId },\n  include: { user: true },\n});`;
  const safeLines = multiLineSafe.split('\n');
  assert.equal(rule.check(safeLines[0], multiLineSafe, 'server/src/organizations/organizations.service.ts', 1, safeLines), null);

  // Multi-line findMany WITHOUT where clause violates
  const multiLineUnsafe = `const rows = await tx.membership.findMany({\n  take: 10,\n  include: { user: true },\n});`;
  const unsafeLines = multiLineUnsafe.split('\n');
  assert.ok(rule.check(unsafeLines[0], multiLineUnsafe, 'server/src/organizations/organizations.service.ts', 1, unsafeLines));

  // Single-line findMany with where is safe
  assert.equal(rule.check('const data = await prisma.dataset.findMany({ where: { organizationId } });', '', 'server/src/datasets/datasets.service.ts'), null);
});

test('SAST-07: catches XSS and dangerous DOM assignment', () => {
  const rule = SAST_RULES.find((r) => r.id === 'SAST-07');
  assert.ok(rule);

  assert.ok(rule.check('<div dangerouslySetInnerHTML={{ __html: userHtml }} />'));
  assert.ok(rule.check('element.innerHTML = untrustedInput;'));
  assert.ok(rule.check('document.write("<h1>Hello</h1>");'));

  // Safe pattern
  assert.equal(rule.check('element.textContent = safeText;'), null);
});

test('SAST-08: catches weak/insecure cryptographic hash algorithms', () => {
  const rule = SAST_RULES.find((r) => r.id === 'SAST-08');
  assert.ok(rule);

  assert.ok(rule.check('crypto.createHash("md5").update(data).digest("hex");'));
  assert.ok(rule.check('crypto.createHash("sha1").update(data).digest("hex");'));
  assert.ok(rule.check('crypto.createCipher("aes192", password);'));

  // Safe patterns
  assert.equal(rule.check('crypto.createHash("sha256").update(data).digest("hex");'), null);
  assert.equal(rule.check('crypto.createHash("sha512").update(data).digest("hex");'), null);
});

test('evaluateTriage: correctly categorizes valid suppressions and flags expired ones', () => {
  const mockFindings = [
    {
      ruleId: 'SAST-01',
      file: 'server/src/mock.ts',
      line: 10,
      severity: 'BLOCKER',
    },
    {
      ruleId: 'SAST-04',
      file: 'server/src/old.ts',
      line: 25,
      severity: 'BLOCKER',
    },
    {
      ruleId: 'SAST-02',
      file: 'client/src/unreviewed.ts',
      line: 5,
      severity: 'BLOCKER',
    },
  ];

  const mockPolicy = {
    version: '1.0.0',
    suppressions: [
      {
        id: 'SUP-VALID',
        rule_id: 'SAST-01',
        path: 'server/src/mock.ts',
        severity: 'LOW',
        rationale: 'Valid suppression',
        approved_by: 'security',
        approved_date: '2026-01-01',
        expires_at: '2028-01-01',
      },
      {
        id: 'SUP-EXPIRED',
        rule_id: 'SAST-04',
        path: 'server/src/old.ts',
        severity: 'LOW',
        rationale: 'Expired suppression',
        approved_by: 'security',
        approved_date: '2025-01-01',
        expires_at: '2025-12-31',
      },
    ],
  };

  const fixedNow = new Date('2026-09-09T00:00:00Z');
  const res = evaluateTriage(mockFindings, mockPolicy, fixedNow);

  assert.equal(res.triaged.length, 1);
  assert.equal(res.triaged[0].suppression.id, 'SUP-VALID');

  assert.equal(res.expired.length, 1);
  assert.equal(res.expired[0].suppression.id, 'SUP-EXPIRED');

  assert.equal(res.active.length, 1);
  assert.equal(res.active[0].file, 'client/src/unreviewed.ts');
});

test('evaluateTriage: enforces exact path and granular line/lines constraints', () => {
  const mockFindings = [
    { ruleId: 'SAST-01', file: 'server/src/db.ts', line: 10, snippet: 'SELECT 1', severity: 'BLOCKER' },
    { ruleId: 'SAST-01', file: 'server/src/db.ts', line: 20, snippet: 'SELECT 2', severity: 'BLOCKER' },
    { ruleId: 'SAST-01', file: 'other/path/to/server/src/db.ts', line: 10, snippet: 'SELECT 1', severity: 'BLOCKER' },
  ];

  const mockPolicy = {
    version: '1.0.0',
    suppressions: [
      {
        id: 'SUP-LINE-10',
        rule_id: 'SAST-01',
        path: 'server/src/db.ts',
        line: 10,
        severity: 'LOW',
        rationale: 'Suppression strictly for line 10',
        approved_by: 'security',
        approved_date: '2026-01-01',
        expires_at: '2028-01-01',
      },
    ],
  };

  const fixedNow = new Date('2026-09-09T00:00:00Z');
  const res = evaluateTriage(mockFindings, mockPolicy, fixedNow);

  // Exactly line 10 on exact path matches
  assert.equal(res.triaged.length, 1);
  assert.equal(res.triaged[0].finding.line, 10);
  assert.equal(res.triaged[0].finding.file, 'server/src/db.ts');

  // Line 20 and suffix path match are active (unsuppressed)
  assert.equal(res.active.length, 2);
  assert.ok(res.active.some((f) => f.line === 20 && f.file === 'server/src/db.ts'));
  assert.ok(res.active.some((f) => f.file === 'other/path/to/server/src/db.ts'));
});

test('runSastScan: repository scan passes cleanly with zero unreviewed blockers', () => {
  const result = runSastScan();

  assert.equal(result.passed, true, 'SAST scan must pass on the current repository');
  assert.equal(result.blockingActiveFindings.length, 0, 'Must have zero unreviewed blocking findings');
  assert.equal(result.expiredFindings.length, 0, 'Must have zero expired suppressions');
  assert.ok(result.scannedFilesCount > 300, `Expected >300 files scanned, got ${result.scannedFilesCount}`);
});
