const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  SAST_RULES,
  scanFile,
  evaluateTriage,
  runSastScan,
  shouldIgnorePath,
} = require("./run-sast-scan");

test("shouldIgnorePath: filters out node_modules, dist, tests, and build artifacts", () => {
  assert.equal(shouldIgnorePath("node_modules/express/index.js"), true);
  assert.equal(shouldIgnorePath("server/dist/main.js"), true);
  assert.equal(shouldIgnorePath("client/.next/static/chunk.js"), true);
  assert.equal(shouldIgnorePath("server/src/auth/auth.service.spec.ts"), true);
  assert.equal(shouldIgnorePath("server/test/api.e2e-spec.ts"), true);
  assert.equal(shouldIgnorePath("scripts/ops/run-sast-scan.js"), true);

  // In-scope source files
  assert.equal(shouldIgnorePath("server/src/auth/auth.service.ts"), false);
  assert.equal(shouldIgnorePath("client/app/page.tsx"), false);
  assert.equal(shouldIgnorePath("packages/shared/src/index.ts"), false);
});

test("SAST-01: catches SQL injection patterns ($queryRawUnsafe, Prisma.raw, string concatenation)", () => {
  const rule = SAST_RULES.find((r) => r.id === "SAST-01");
  assert.ok(rule);

  assert.ok(
    rule.check(
      'const res = await prisma.$queryRawUnsafe("SELECT * FROM users");',
    ),
  );
  assert.ok(rule.check('await tx.$executeRawUnsafe("DROP TABLE temp");'));
  assert.ok(
    rule.check('const rawSql = Prisma.raw("SELECT * FROM " + tableName);'),
  );
  assert.ok(
    rule.check(
      "const q = await prisma.$queryRaw`SELECT * FROM users WHERE id = ${userId}`;",
    ),
  );
  assert.ok(rule.check('const res = db.query("SELECT * FROM " + table);'));

  // Safe patterns
  assert.equal(
    rule.check("const user = await prisma.user.findUnique({ where: { id } });"),
    null,
  );
  assert.equal(
    rule.check(
      "const res = await prisma.$queryRaw(Prisma.sql`SELECT * FROM users WHERE id = ${id}`);",
    ),
    null,
  );
});

test("SAST-02: catches Command injection patterns (dynamic exec, shell: true)", () => {
  const rule = SAST_RULES.find((r) => r.id === "SAST-02");
  assert.ok(rule);

  assert.ok(rule.check("child_process.exec(`rm -rf ${userDir}`);"));
  assert.ok(rule.check('execSync("ls " + folder);'));
  assert.ok(rule.check('spawn("sh", [cmd], { shell: true });'));

  // Safe patterns
  assert.equal(
    rule.check("child_process.fork(scriptPath, [arg1, arg2]);"),
    null,
  );
  assert.equal(rule.check('spawn("node", ["dist/main.js"]);'), null);
});

test("SAST-03: catches Path traversal patterns", () => {
  const rule = SAST_RULES.find((r) => r.id === "SAST-03");
  assert.ok(rule);

  assert.ok(rule.check('fs.readFileSync("../../secrets.json");'));
  assert.ok(rule.check("fs.readFile(baseDir + req.query.file);"));

  // Safe patterns
  assert.equal(
    rule.check('fs.readFileSync(path.join(__dirname, "config.json"));'),
    null,
  );
});

test("SAST-04: catches Hardcoded Secrets (private keys, API tokens, hardcoded JWT secrets)", () => {
  const rule = SAST_RULES.find((r) => r.id === "SAST-04");
  assert.ok(rule);

  assert.ok(rule.check('const key = "-----BEGIN RSA PRIVATE KEY-----";'));
  assert.ok(rule.check('const token = "sk-1234567890abcdef1234567890abcdef";'));
  assert.ok(
    rule.check('const gh = "ghp_123456789012345678901234567890123456";'),
  );
  assert.ok(
    rule.check(
      'const conn = "postgres://admin:superSecretPassword123@prod-db.internal:5432/db";',
    ),
  );
  assert.ok(
    rule.check('const jwtToken = jwt.sign(payload, "mySuperSecretKey123");'),
  );

  // Safe patterns
  assert.equal(rule.check("const key = process.env.API_KEY;"), null);
  assert.equal(rule.check("const url = process.env.DATABASE_URL;"), null);
});

test("SAST-05: catches ReDoS patterns with nested quantifiers", () => {
  const rule = SAST_RULES.find((r) => r.id === "SAST-05");
  assert.ok(rule);

  assert.ok(rule.check("const rx = /(a+)+/g;"));
  assert.ok(rule.check("const rx = /([a-zA-Z0-9]+)*/;"));
  assert.ok(rule.check("const rx = /(\\d+)+/;"));

  // Safe patterns
  assert.equal(rule.check("const rx = /^[a-zA-Z0-9_-]+$/;"), null);
  assert.equal(rule.check("const rx = /\\d{4}-\\d{2}-\\d{2}/;"), null);
});

test("SAST-06: catches multi-tenant Prisma queries without where scoping", () => {
  const rule = SAST_RULES.find((r) => r.id === "SAST-06");
  assert.ok(rule);

  // Violates: findMany without where in server/src across models and accessors
  assert.ok(
    rule.check(
      "const data = await this.prisma.dataset.findMany({ select: { id: true } });",
      "",
      "server/src/datasets/datasets.service.ts",
    ),
  );
  assert.ok(
    rule.check(
      "const members = await tx.membership.findMany({ take: 10 });",
      "",
      "server/src/orgs/orgs.service.ts",
    ),
  );
  assert.ok(
    rule.check(
      "const invites = await client.invitation.findMany();",
      "",
      "server/src/orgs/orgs.service.ts",
    ),
  );

  // Multi-line findMany with where clause on next line is safe
  const multiLineSafe = `const rows = await tx.membership.findMany({\n  where: { organizationId },\n  include: { user: true },\n});`;
  const safeLines = multiLineSafe.split("\n");
  assert.equal(
    rule.check(
      safeLines[0],
      multiLineSafe,
      "server/src/organizations/organizations.service.ts",
      1,
      safeLines,
    ),
    null,
  );

  // Multi-line findMany WITHOUT where clause violates
  const multiLineUnsafe = `const rows = await tx.membership.findMany({\n  take: 10,\n  include: { user: true },\n});`;
  const unsafeLines = multiLineUnsafe.split("\n");
  assert.ok(
    rule.check(
      unsafeLines[0],
      multiLineUnsafe,
      "server/src/organizations/organizations.service.ts",
      1,
      unsafeLines,
    ),
  );

  // Single-line findMany with where is safe
  assert.equal(
    rule.check(
      "const data = await prisma.dataset.findMany({ where: { organizationId } });",
      "",
      "server/src/datasets/datasets.service.ts",
    ),
    null,
  );
});

test("SAST-07: catches XSS and dangerous DOM assignment", () => {
  const rule = SAST_RULES.find((r) => r.id === "SAST-07");
  assert.ok(rule);

  assert.ok(
    rule.check("<div dangerouslySetInnerHTML={{ __html: userHtml }} />"),
  );
  assert.ok(rule.check("element.innerHTML = untrustedInput;"));
  assert.ok(rule.check('document.write("<h1>Hello</h1>");'));

  // Safe pattern
  assert.equal(rule.check("element.textContent = safeText;"), null);
});

test("SAST-08: catches weak/insecure cryptographic hash algorithms", () => {
  const rule = SAST_RULES.find((r) => r.id === "SAST-08");
  assert.ok(rule);

  assert.ok(rule.check('crypto.createHash("md5").update(data).digest("hex");'));
  assert.ok(
    rule.check('crypto.createHash("sha1").update(data).digest("hex");'),
  );
  assert.ok(rule.check('crypto.createCipher("aes192", password);'));

  // Safe patterns
  assert.equal(
    rule.check('crypto.createHash("sha256").update(data).digest("hex");'),
    null,
  );
  assert.equal(
    rule.check('crypto.createHash("sha512").update(data).digest("hex");'),
    null,
  );
});

test("evaluateTriage: correctly categorizes valid suppressions and flags expired ones", () => {
  const mockFindings = [
    {
      ruleId: "SAST-01",
      file: "server/src/mock.ts",
      line: 10,
      severity: "BLOCKER",
    },
    {
      ruleId: "SAST-04",
      file: "server/src/old.ts",
      line: 25,
      severity: "BLOCKER",
    },
    {
      ruleId: "SAST-02",
      file: "client/src/unreviewed.ts",
      line: 5,
      severity: "BLOCKER",
    },
  ];

  const mockPolicy = {
    version: "1.0.0",
    suppressions: [
      {
        id: "SUP-VALID",
        rule_id: "SAST-01",
        path: "server/src/mock.ts",
        severity: "LOW",
        rationale: "Valid suppression",
        approved_by: "security",
        approved_date: "2026-01-01",
        expires_at: "2028-01-01",
      },
      {
        id: "SUP-EXPIRED",
        rule_id: "SAST-04",
        path: "server/src/old.ts",
        severity: "LOW",
        rationale: "Expired suppression",
        approved_by: "security",
        approved_date: "2025-01-01",
        expires_at: "2025-12-31",
      },
    ],
  };

  const fixedNow = new Date("2026-09-09T00:00:00Z");
  const res = evaluateTriage(mockFindings, mockPolicy, fixedNow);

  assert.equal(res.triaged.length, 1);
  assert.equal(res.triaged[0].suppression.id, "SUP-VALID");

  assert.equal(res.expired.length, 1);
  assert.equal(res.expired[0].suppression.id, "SUP-EXPIRED");

  assert.equal(res.active.length, 1);
  assert.equal(res.active[0].file, "client/src/unreviewed.ts");
});

test("evaluateTriage: enforces exact path and granular line/lines constraints", () => {
  const mockFindings = [
    {
      ruleId: "SAST-01",
      file: "server/src/db.ts",
      line: 10,
      snippet: "SELECT 1",
      severity: "BLOCKER",
    },
    {
      ruleId: "SAST-01",
      file: "server/src/db.ts",
      line: 20,
      snippet: "SELECT 2",
      severity: "BLOCKER",
    },
    {
      ruleId: "SAST-01",
      file: "other/path/to/server/src/db.ts",
      line: 10,
      snippet: "SELECT 1",
      severity: "BLOCKER",
    },
  ];

  const mockPolicy = {
    version: "1.0.0",
    suppressions: [
      {
        id: "SUP-LINE-10",
        rule_id: "SAST-01",
        path: "server/src/db.ts",
        line: 10,
        severity: "LOW",
        rationale: "Suppression strictly for line 10",
        approved_by: "security",
        approved_date: "2026-01-01",
        expires_at: "2028-01-01",
      },
    ],
  };

  const fixedNow = new Date("2026-09-09T00:00:00Z");
  const res = evaluateTriage(mockFindings, mockPolicy, fixedNow);

  // Exactly line 10 on exact path matches
  assert.equal(res.triaged.length, 1);
  assert.equal(res.triaged[0].finding.line, 10);
  assert.equal(res.triaged[0].finding.file, "server/src/db.ts");

  // Line 20 and suffix path match are active (unsuppressed)
  assert.equal(res.active.length, 2);
  assert.ok(
    res.active.some((f) => f.line === 20 && f.file === "server/src/db.ts"),
  );
  assert.ok(
    res.active.some((f) => f.file === "other/path/to/server/src/db.ts"),
  );
});

test("approved plan ANALYZE calls do not suppress dynamic SQL at the same line", () => {
  const rootDir = path.resolve(__dirname, "../..");
  const policy = JSON.parse(
    fs.readFileSync(
      path.join(rootDir, "infra/security/sast-triage.json"),
      "utf8",
    ),
  );
  const approvals = policy.suppressions.filter(
    (s) => s.rule_id === "SAST-01" && s.snippet?.includes("ANALYZE"),
  );
  const expectedTables = [
    "DashboardView",
    "MetricAggregate",
    "MetricAggregateLineage",
    "MetricDefinition",
    "MetricObservation",
    "Region",
    "RegionGeometry",
  ];
  assert.deepEqual(
    approvals.map((s) => s.snippet.match(/ANALYZE "(\w+)"/)?.[1]).sort(),
    expectedTables.sort(),
  );

  const rule = SAST_RULES.find((r) => r.id === "SAST-01");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "acres-sast-plan-"));
  try {
    for (const approval of approvals) {
      const sourceLine = fs
        .readFileSync(path.join(rootDir, approval.path), "utf8")
        .split("\n")
        [approval.line - 1].trim();
      assert.equal(
        sourceLine,
        approval.snippet,
        `${approval.id} must cover one complete fixed call`,
      );
      const approvedFinding = scanFile(approval.path, rootDir, [rule]).find(
        (finding) => finding.line === approval.line,
      );
      assert.ok(approvedFinding, `${approval.id} must still be detected`);
      assert.equal(evaluateTriage([approvedFinding], policy).triaged.length, 1);

      const mutatedLine =
        "await prisma.$executeRawUnsafe('ANALYZE \"' + tableName + '\"');";
      const tempPath = path.join(tempRoot, approval.path);
      fs.mkdirSync(path.dirname(tempPath), { recursive: true });
      fs.writeFileSync(
        tempPath,
        `${"\n".repeat(approval.line - 1)}${mutatedLine}\n`,
      );
      const mutatedFinding = scanFile(approval.path, tempRoot, [rule]).find(
        (finding) => finding.line === approval.line,
      );
      assert.ok(mutatedFinding, "dynamic unsafe call must still be detected");
      assert.equal(evaluateTriage([mutatedFinding], policy).active.length, 1);

      fs.writeFileSync(
        tempPath,
        `${"\n".repeat(approval.line - 1)}${sourceLine} ${mutatedLine}\n`,
      );
      const appendedFinding = scanFile(approval.path, tempRoot, [rule]).find(
        (finding) => finding.line === approval.line,
      );
      assert.ok(appendedFinding, "appended unsafe call must still be detected");
      assert.equal(evaluateTriage([appendedFinding], policy).active.length, 1);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("runSastScan: repository scan passes cleanly with zero unreviewed blockers", () => {
  const result = runSastScan();

  assert.equal(
    result.passed,
    true,
    "SAST scan must pass on the current repository",
  );
  assert.equal(
    result.blockingActiveFindings.length,
    0,
    "Must have zero unreviewed blocking findings",
  );
  assert.equal(
    result.expiredFindings.length,
    0,
    "Must have zero expired suppressions",
  );
  assert.ok(
    result.scannedFilesCount > 300,
    `Expected >300 files scanned, got ${result.scannedFilesCount}`,
  );
});

test("runSastScan CLI: --output and -o create structured JSON evidence file matching schema", () => {
  const { execFileSync } = require("node:child_process");
  const tmpDir = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "sast-cli-test-"),
  );
  try {
    const scriptPath = path.join(__dirname, "run-sast-scan.js");
    const outPath1 = path.join(tmpDir, "sast-scan-evidence-1.json");
    execFileSync(process.execPath, [scriptPath, "--output", outPath1], {
      cwd: path.resolve(__dirname, "../.."),
      encoding: "utf8",
      env: { PATH: process.env.PATH, LANG: "C", TZ: "UTC" },
      timeout: 10000,
    });

    assert.ok(fs.existsSync(outPath1), "evidence file 1 must be created");
    const evidence1 = JSON.parse(fs.readFileSync(outPath1, "utf8"));
    assert.equal(evidence1.drill_type, "sast_security_scan");
    assert.match(evidence1.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.equal(evidence1.status, "success");
    assert.equal(evidence1.passed, true);
    assert.ok(evidence1.scannedFilesCount > 300);
    assert.deepEqual(evidence1.blockingActiveFindings, []);
    assert.deepEqual(evidence1.expiredFindings, []);

    const outPath2 = path.join(tmpDir, "sast-scan-evidence-2.json");
    execFileSync(process.execPath, [scriptPath, "-o", outPath2], {
      cwd: path.resolve(__dirname, "../.."),
      encoding: "utf8",
      env: { PATH: process.env.PATH, LANG: "C", TZ: "UTC" },
      timeout: 10000,
    });
    assert.ok(
      fs.existsSync(outPath2),
      "evidence file 2 must be created via -o",
    );
    const evidence2 = JSON.parse(fs.readFileSync(outPath2, "utf8"));
    assert.equal(evidence2.drill_type, "sast_security_scan");
    assert.equal(evidence2.status, "success");
    assert.equal(evidence2.passed, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

const { spawnSync, spawn } = require("node:child_process");
const vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "run-sast-scan.js"),
  "utf8",
);
const childEnv = { PATH: process.env.PATH, LANG: "C", TZ: "UTC" };
const secretLine = 'const token = "sk-' + "SecretCanary".repeat(3) + '";';
function installation(t, content = "const safe = 1;", count = 1) {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "sast private paths-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ops = path.join(root, "scripts/ops");
  fs.mkdirSync(ops, { recursive: true });
  const script = path.join(ops, "run-sast-scan.js");
  fs.writeFileSync(script, source);
  fs.mkdirSync(path.join(root, "client"));
  fs.writeFileSync(
    path.join(root, "client/source.js"),
    Array(count).fill(content).join("\n"),
  );
  const policy = path.join(root, "infra/security/sast-triage.json");
  fs.mkdirSync(path.dirname(policy), { recursive: true });
  fs.writeFileSync(policy, '{"suppressions":[]}');
  const cwd = path.join(root, "caller");
  fs.mkdirSync(cwd);
  return {
    root,
    cwd,
    script,
    policy,
    run(args = [], hook) {
      const hookPath = path.join(root, "hook.cjs");
      if (hook) fs.writeFileSync(hookPath, hook);
      return spawnSync(
        process.execPath,
        [...(hook ? ["--require", hookPath] : []), script, ...args],
        {
          cwd,
          env: childEnv,
          encoding: "utf8",
          timeout: 10000,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
    },
  };
}
function machinery(overrides = {}) {
  const module = { exports: {} };
  const fakeFs = new Proxy(fs, {
    get(target, key) {
      return Object.hasOwn(overrides, key) ? overrides[key] : target[key];
    },
  });
  vm.runInNewContext(
    source +
      "\nmodule.exports.testing={parseArgs,outputPreflight,projectReport,validateReport,serializeReport,publishReport};",
    {
      require(name) {
        return name === "fs" ? fakeFs : require(name);
      },
      module,
      __dirname,
      Buffer,
      Date,
      process,
    },
  );
  return module.exports;
}
function artifactFixture(t, overrides = {}) {
  const f = installation(t);
  const api = machinery(overrides);
  const report = api.testing.projectReport(
    api.runSastScan({ rootDir: f.root }),
  );
  const bytes = api.testing.serializeReport(report, true);
  const output = path.join(f.cwd, "new/deep/receipt.json");
  const parents = api.testing.outputPreflight(output);
  return {
    ...f,
    api,
    report,
    bytes,
    output,
    parents,
    publish() {
      api.testing.publishReport(output, parents, bytes);
    },
  };
}
for (const kind of [
  "file",
  "directory",
  "symlink",
  "dangling",
  "ancestor-link",
  "ancestor-file",
  "trailing",
])
  test(`preserves retained ${kind}`, (t) => {
    const f = installation(t);
    let output = path.join(f.cwd, "private-canary");
    const target = path.join(f.cwd, "target");
    fs.writeFileSync(target, "retained private-canary");
    if (kind === "file" || kind === "ancestor-file")
      fs.writeFileSync(output, "retained private-canary");
    if (kind === "directory" || kind === "trailing") fs.mkdirSync(output);
    if (["symlink", "dangling", "ancestor-link"].includes(kind))
      fs.symlinkSync(
        kind === "dangling"
          ? target + ".missing"
          : kind === "ancestor-link"
            ? f.cwd
            : target,
        output,
      );
    const before = fs.lstatSync(output);
    const originalOutput = output;
    if (kind.startsWith("ancestor"))
      output = path.join(output, "new/receipt.json");
    if (kind === "trailing") output += "/";
    const r = f.run(["--json", "-o", output]);
    assert.equal(r.status, 1, r.stderr);
    assert.equal(r.stdout, "");
    assert.ok(!r.stderr.includes("private-canary"));
    assert.equal(fs.lstatSync(originalOutput).ino, before.ino);
    assert.equal(fs.readFileSync(target, "utf8"), "retained private-canary");
  });

test("creates private parents, leaves existing parent modes and uses same-directory staging", (t) => {
  const f = artifactFixture(t);
  const oldMode = fs.statSync(f.cwd).mode;
  f.publish();
  assert.equal(fs.statSync(f.cwd).mode, oldMode);
  for (const p of [path.join(f.cwd, "new"), path.dirname(f.output)])
    assert.equal(fs.statSync(p).mode & 0o777, 0o700);
  assert.equal(fs.statSync(f.output).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(path.dirname(f.output)), ["receipt.json"]);
});

test("short writes complete and exclusive link preserves deterministic late competitor", (t) => {
  let linkCalled = false;
  const f = artifactFixture(t, {
    writeSync(fd, bytes, offset, length, position) {
      return fs.writeSync(fd, bytes, offset, Math.min(length, 17), position);
    },
    linkSync(from, to) {
      linkCalled = true;
      assert.equal(path.dirname(from), path.dirname(to));
      assert.equal(fs.readFileSync(from).equals(f.bytes), true);
      fs.writeFileSync(to, "competing private-canary");
      fs.linkSync(from, to);
    },
  });
  assert.throws(() => f.publish(), /publication failed/);
  assert.equal(linkCalled, true);
  assert.equal(fs.readFileSync(f.output, "utf8"), "competing private-canary");
  assert.deepEqual(fs.readdirSync(path.dirname(f.output)), ["receipt.json"]);
});

for (const operation of [
  "openSync",
  "writeSync",
  "readSync",
  "closeSync",
  "linkSync",
  "unlinkSync",
])
  test(`controlled ${operation} faults preserve published evidence and owned cleanup`, (t) => {
    let calls = 0;
    const f = artifactFixture(t, {
      [operation](...args) {
        calls++;
        if (calls === 1) throw Error("private-canary");
        return fs[operation](...args);
      },
    });
    assert.throws(() => f.publish(), /SAST (publication|cleanup) failed/);
    const published = operation === "unlinkSync";
    assert.equal(fs.existsSync(f.output), published);
    if (published) assert.ok(fs.readFileSync(f.output).equals(f.bytes));
    assert.equal(
      fs
        .readdirSync(path.dirname(f.output))
        .some((n) => n.startsWith(".sast-")),
      false,
    );
  });

for (const fault of [
  "zero-write",
  "incomplete-read",
  "tampered-read",
  "foreign-staging",
])
  test(`readback and ownership fail closed: ${fault}`, (t) => {
    const overrides = {};
    if (fault === "zero-write") overrides.writeSync = () => 0;
    if (fault === "incomplete-read") overrides.readSync = () => 0;
    if (fault === "tampered-read")
      overrides.readSync = (fd, buf, ...args) => {
        const n = fs.readSync(fd, buf, ...args);
        if (n) buf[0] ^= 1;
        return n;
      };
    if (fault === "foreign-staging")
      overrides.linkSync = (from) => {
        fs.unlinkSync(from);
        fs.writeFileSync(from, "foreign private-canary");
        throw Error("private-canary");
      };
    const f = artifactFixture(t, overrides);
    assert.throws(() => f.publish(), /SAST (publication|cleanup) failed/);
    assert.ok(!fs.existsSync(f.output));
    const files = fs.readdirSync(path.dirname(f.output));
    if (fault === "foreign-staging") {
      assert.equal(files.length, 1);
      assert.equal(
        fs.readFileSync(path.join(path.dirname(f.output), files[0]), "utf8"),
        "foreign private-canary",
      );
    } else assert.deepEqual(files, []);
  });

test("failed exclusive open never removes foreign staging", (t) => {
  const f = artifactFixture(t, {
    openSync(file, flags, mode) {
      fs.writeFileSync(file, "foreign");
      return fs.openSync(file, flags, mode);
    },
  });
  assert.throws(() => f.publish(), /publication failed/);
  const files = fs.readdirSync(path.dirname(f.output));
  assert.equal(files.length, 1);
  assert.equal(
    fs.readFileSync(path.join(path.dirname(f.output), files[0]), "utf8"),
    "foreign",
  );
});

for (const operation of ["mkdirSync", "fstatSync", "lstatSync"])
  test(`injected ${operation} publication fault has no passing receipt`, (t) => {
    let active = false,
      calls = 0;
    const f = artifactFixture(t, {
      [operation](...args) {
        if (active && ++calls === 1) throw Error("private-canary");
        return fs[operation](...args);
      },
    });
    active = true;
    assert.throws(() => f.publish(), /SAST (publication|cleanup) failed/);
    assert.ok(!fs.existsSync(f.output));
    if (fs.existsSync(path.dirname(f.output)))
      assert.deepEqual(fs.readdirSync(path.dirname(f.output)), []);
  });

test("ordinary ancestor substitution after preflight fails safely", (t) => {
  const f = artifactFixture(t);
  fs.renameSync(f.cwd, f.cwd + ".retained");
  fs.symlinkSync(f.cwd + ".retained", f.cwd);
  assert.throws(() => f.publish(), /publication failed/);
  assert.ok(!fs.existsSync(path.join(f.cwd + ".retained", "new")));
});

test("persistent cleanup failure is nonzero and preserves published evidence and owned staging", (t) => {
  const f = artifactFixture(t, {
    unlinkSync() {
      throw Error("private-canary");
    },
  });
  assert.throws(() => f.publish(), /cleanup failed/);
  assert.ok(fs.readFileSync(f.output).equals(f.bytes));
  assert.equal(fs.readdirSync(path.dirname(f.output)).length, 2);
});

test("staging content changed on disk before readback fails without publishing", (t) => {
  let writeFd;
  const f = artifactFixture(t, {
    writeSync(fd, ...args) {
      writeFd = fd;
      return fs.writeSync(fd, ...args);
    },
    closeSync(fd) {
      fs.closeSync(fd);
      if (fd === writeFd) {
        writeFd = null;
        const temp = fs
          .readdirSync(path.dirname(f.output))
          .find((n) => n.startsWith(".sast-"));
        fs.writeFileSync(path.join(path.dirname(f.output), temp), "{}");
      }
    },
  });
  assert.throws(() => f.publish(), /publication failed/);
  assert.ok(!fs.existsSync(f.output));
  assert.deepEqual(fs.readdirSync(path.dirname(f.output)), []);
});

for (const operation of [
  "writeSync",
  "openSync",
  "readSync",
  "closeSync",
  "linkSync",
  "unlinkSync",
])
  test(`CLI ${operation} fault never prints passing completion`, (t) => {
    const f = installation(t);
    const hook = `const fs=require('fs');const old=fs.${operation};fs.${operation}=function(...a){${operation === "openSync" ? "if(!String(a[0]).includes('.sast-'))return old.apply(this,a);" : ""}throw Error('private-canary');};`;
    const r = f.run(["-o", "new/receipt.json"], hook);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /^SAST (publication|cleanup) failed\n$/);
    assert.ok(!r.stderr.includes("private-canary"));
    assert.equal(
      fs.existsSync(path.join(f.cwd, "new/receipt.json")),
      operation === "unlinkSync",
    );
  });

test("stdout callback errors and stderr errors set controlled nonzero status", (t) => {
  const f = installation(t);
  for (const hook of [
    "process.stdout.write=(_v,cb)=>{cb(Error('private-canary'));return false};",
    "process.stdout.write=()=>{process.stdout.emit('error',Error('private-canary'));return false};",
    "process.stdout.write=()=>{process.stderr.emit('error',Error('private-canary'));return false};",
  ]) {
    const r = f.run(["--json"], hook);
    assert.equal(r.status, 1);
    assert.ok(!r.stderr.includes("private-canary"));
  }
});

test("removed recorded ancestor fails without recreating it", (t) => {
  const f = artifactFixture(t);
  fs.rmdirSync(f.cwd);
  assert.throws(() => f.publish(), /publication failed/);
  assert.ok(!fs.existsSync(f.cwd));
});

const invalidArgs = [
  ["--unknown=private-canary"],
  ["private-canary"],
  ["--json", "--json"],
  ["--json=true"],
  ["--format=json", "--json"],
  ["--json", "--format", "json"],
  ["--format", "human"],
  ["--format=json", "--format=json"],
  ["--format"],
  ["--format="],
  ["--help", "--json"],
  ["-h", "-h"],
  ["--help=true"],
  ["--output"],
  ["-o"],
  ["--output="],
  ["-o="],
  ["--output", " "],
  ["--output=\tprivate-canary"],
  ["--output", "--json"],
  ["-o", "-private-canary"],
  ["--output", "one", "-o=two"],
  ["--output=one", "--output=two"],
  ["--output", "/"],
  ["--output", "new/"],
  ["--output", "private-canary\x7f"],
  ["--triage"],
  ["--triage="],
  ["--triage", " "],
  ["--triage", "--json"],
  ["--triage=one", "--triage=two"],
  ["--fail-on"],
  ["--fail-on="],
  ["--fail-on", "private-canary"],
  ["--fail-on", "BLOCKER", "--fail-on=HIGH"],
  ["--fail-on= HIGH"],
  ["--triage=x\n"],
];
for (const args of invalidArgs)
  test(`rejects invalid CLI before reads/allocation: ${JSON.stringify(args)}`, (t) => {
    const f = installation(t);
    const r = f.run(
      args,
      "const fs=require('fs');const old=fs.readFileSync;fs.readFileSync=function(p,...a){if(String(p).endsWith('source.js')||String(p).endsWith('sast-triage.json'))throw Error('read private-canary');return old.call(this,p,...a)};for(const k of ['mkdirSync','openSync','linkSync'])fs[k]=()=>{throw Error('private-canary')};",
    );
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "SAST invocation failed\n");
    assert.deepEqual(fs.readdirSync(f.cwd), []);
  });
for (const options of [
  null,
  [],
  1,
  "private-canary",
  { rootDir: null },
  { rootDir: "" },
  { rootDir: undefined },
  { rootDir: "x\n" },
  { triagePath: false },
  { triagePath: undefined },
  { roots: null },
  { roots: "client" },
  { roots: [""] },
  { roots: ["x\x7f"] },
  { roots: [1] },
  { failOnSeverity: undefined },
  { failOnSeverity: "critical" },
  { failOnSeverity: "" },
  { now: undefined },
  { now: "2026-10-08" },
  { now: new Date(NaN) },
])
  test(`direct options reject before reads: ${JSON.stringify(options)}`, () => {
    const api = machinery({
      existsSync() {
        throw Error("read private-canary");
      },
      readFileSync() {
        throw Error("read private-canary");
      },
    });
    assert.throws(() => api.runSastScan(options), /SAST invocation failed/);
  });

test("import/help/no-save do no allocation; help scans nothing", (t) => {
  const blocked = () => {
    throw Error("private-canary");
  };
  const api = machinery(
    Object.fromEntries(
      [
        "existsSync",
        "readFileSync",
        "lstatSync",
        "mkdirSync",
        "openSync",
        "linkSync",
      ].map((k) => [k, blocked]),
    ),
  );
  assert.equal(typeof api.runSastScan, "function");
  const f = installation(t);
  const allocation =
    "const fs=require('fs');for(const k of ['mkdirSync','openSync','linkSync','writeFileSync'])fs[k]=()=>{throw Error('private-canary')};";
  for (const flag of ["--help", "-h"]) {
    const r = f.run(
      [flag],
      allocation + "fs.existsSync=()=>{throw Error('private-canary')};",
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^Usage:/);
    assert.equal(r.stderr, "");
  }
  const r = f.run(["--json"], allocation);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).scannedFilesCount, 1);
  assert.deepEqual(fs.readdirSync(f.cwd), []);
});
for (const args of [
  ["--output", "ordinary spaces/receipt.json"],
  ["-o", "receipt.json"],
  ["--output=receipt.json"],
  ["-o=receipt.json"],
  ["--output=-dash.json"],
])
  test(`literal saved/printed parity: ${args[0]}`, (t) => {
    const f = installation(t);
    const value = args[0].includes("=") ? args[0].split("=")[1] : args[1];
    const r = f.run(["--format=json", "--fail-on=blocker", ...args]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(path.join(f.cwd, value), "utf8"), r.stdout);
    assert.equal(JSON.parse(r.stdout).failOnSeverity, "BLOCKER");
    assert.equal(fs.statSync(path.join(f.cwd, value)).mode & 0o777, 0o600);
  });
for (const args of [
  ["--triage", "ordinary spaces/policy.json"],
  ["--triage=-dash.json"],
  ["--triage=literal $HOME ~.json"],
])
  test(`literal caller-relative triage: ${args[0]}`, (t) => {
    const f = installation(t, secretLine);
    const value = args[0].includes("=")
      ? args[0].slice(args[0].indexOf("=") + 1)
      : args[1];
    const file = path.join(f.cwd, value);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        suppressions: [
          {
            rule_id: "SAST-04",
            path: "client/source.js",
            snippet: secretLine,
            expires_at: "2099-01-01",
          },
        ],
      }),
    );
    const r = f.run(["--json", ...args]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).triagedFindings.length, 1);
  });
for (const level of ["BLOCKER", "HIGH", "MEDIUM", "LOW"])
  test(`normalized threshold ${level}`, (t) => {
    const f = installation(t, "element.innerHTML = input;");
    const r = f.run(["--json", `--fail-on=${level.toLowerCase()}`]);
    assert.equal(r.status, level === "BLOCKER" ? 0 : 1, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.failOnSeverity, level);
    assert.equal(report.activeFindings.length, 1);
    assert.equal(
      runSastScan({ rootDir: f.root, failOnSeverity: level.toLowerCase() })
        .failOnSeverity,
      level,
    );
  });
for (const mode of ["active", "triaged", "expired"])
  test(`detected-secret projection ${mode} preserves direct result and saved/human identity`, (t) => {
    const f = installation(t, secretLine);
    const suppression = {
      id: "SUP-100",
      rule_id: "SAST-04",
      path: "client/source.js",
      line: 1,
      lines: [1],
      snippet: secretLine,
      rationale: "reviewed fixture",
      expires_at: mode === "expired" ? "2000-01-01" : "2099-01-01",
    };
    if (mode !== "active")
      fs.writeFileSync(
        f.policy,
        JSON.stringify({ suppressions: [suppression] }),
      );
    const direct = runSastScan({ rootDir: f.root });
    const snapshot = JSON.stringify(direct);
    const api = machinery();
    const projection = api.testing.projectReport(direct);
    assert.equal(JSON.stringify(direct), snapshot);
    assert.ok(snapshot.includes(secretLine.replaceAll('"', '\\"')));
    assert.ok(!JSON.stringify(projection).includes("SecretCanary"));
    const r = f.run(["--json", "-o", "report.json"]);
    assert.equal(r.status, mode === "triaged" ? 0 : 1, r.stderr);
    assert.equal(r.stderr, "");
    assert.ok(!r.stdout.includes("SecretCanary"));
    assert.equal(
      r.stdout,
      fs.readFileSync(path.join(f.cwd, "report.json"), "utf8"),
    );
    const report = JSON.parse(r.stdout);
    assert.equal(report.totalFindingsCount, 1);
    assert.equal(report.passed, mode === "triaged");
    const human = f.run([]);
    assert.equal(human.status, r.status);
    assert.ok(!human.stdout.includes("SecretCanary"));
    assert.match(
      human.stdout,
      /SAST-04 client\/source.js:1|SAST-04\] \(BLOCKER\) client\/source.js:1/,
    );
    assert.ok(!human.stdout.includes(f.root));
    if (mode !== "triaged") assert.ok(!human.stdout.includes("PASSED"));
  });
test("full failed evaluation JSON naturally drains beyond pipe buffers", (t) => {
  const f = installation(t, secretLine, 600);
  const r = f.run(["--json", "-o", "failed.json"]);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stderr, "");
  const saved = JSON.parse(fs.readFileSync(path.join(f.cwd, "failed.json")));
  assert.equal(saved.blockingActiveFindings.length, 600);
  assert.deepEqual(JSON.parse(r.stdout), saved);
});
test("save-only 1 MiB UTF-8 bound rejects before allocation, no-save remains complete", (t) => {
  const f = installation(
    t,
    'element.innerHTML = "' + "é".repeat(600000) + '";',
  );
  const r = f.run(["--json", "-o", "absent/receipt.json"]);
  assert.equal(r.status, 1);
  assert.equal(r.stderr, "SAST serialization failed\n");
  assert.ok(!fs.existsSync(path.join(f.cwd, "absent")));
  const noSave = f.run(["--json"]);
  assert.equal(noSave.status, 0, noSave.stderr);
  assert.equal(JSON.parse(noSave.stdout).activeFindings.length, 1);
  assert.ok(Buffer.byteLength(noSave.stdout) > 1024 * 1024);
});
for (const stage of ["scanning", "serialization", "output"])
  test(`controlled ${stage} failure omits canary`, (t) => {
    const f = installation(t);
    let hook;
    if (stage === "scanning") fs.writeFileSync(f.policy, "{ private-canary");
    if (stage === "serialization")
      hook = "JSON.stringify=()=>{throw Error('private-canary')};";
    if (stage === "output")
      hook = "process.stdout.write=()=>{throw Error('private-canary')};";
    const r = f.run(["--json"], hook);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, `SAST ${stage} failed\n`);
  });
test("actual broken pipe is controlled and retains published receipt", async (t) => {
  const f = installation(t, secretLine, 600);
  const child = spawn(
    process.execPath,
    [f.script, "--json", "-o", "receipt.json"],
    { cwd: f.cwd, env: childEnv, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (c) => (stderr += c));
  child.stdout.destroy();
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  const result = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  }).finally(() => clearTimeout(timer));
  assert.deepEqual(result, { code: 1, signal: null });
  assert.equal(stderr, "SAST output failed\n");
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.cwd, "receipt.json")))
      .totalFindingsCount,
    600,
  );
});
test("report validation independently rejects structure/count/verdict/blocking/redaction inconsistencies", (t) => {
  const f = installation(t, secretLine);
  const api = machinery();
  const report = api.testing.projectReport(
    api.runSastScan({ rootDir: f.root }),
  );
  const mutations = [
    (r) => (r.status = "success"),
    (r) => (r.passed = true),
    (r) => (r.totalFindingsCount = 2),
    (r) => (r.scannedFilesCount = -1),
    (r) => (r.scannedFilesCount = 0),
    (r) => (r.failOnSeverity = "bogus"),
    (r) => (r.timestamp = "yesterday"),
    (r) => (r.activeFindings = null),
    (r) => (r.blockingActiveFindings = []),
    (r) => (r.activeFindings[0].snippet = secretLine),
    (r) => (r.activeFindings[0].line = 0),
  ];
  for (const mutate of mutations) {
    const copy = JSON.parse(JSON.stringify(report));
    mutate(copy);
    assert.throws(
      () => api.testing.serializeReport(copy, true),
      /serialization failed/,
    );
  }
  assert.ok(api.testing.serializeReport(report, true).length);
});
test("valid custom/empty/relative roots and exact first matching triage remain synchronous", (t) => {
  const f = installation(t, secretLine);
  assert.equal(
    runSastScan({ rootDir: f.root, roots: [] }).scannedFilesCount,
    0,
  );
  const policy = {
    suppressions: [
      {
        id: "first",
        rule_id: "SAST-04",
        path: "client/source.js",
        lines: [1],
        snippet: secretLine,
        expires_at: "2026-10-08T00:00:00Z",
      },
      {
        id: "second",
        rule_id: "SAST-04",
        path: "client/source.js",
        expires_at: "2000-01-01",
      },
    ],
  };
  fs.writeFileSync(f.policy, JSON.stringify(policy));
  const result = runSastScan({
    rootDir: f.root,
    roots: ["client", "./client"],
    now: new Date("2026-10-08T00:00:00Z"),
  });
  assert.equal(result.scannedFilesCount, 1);
  assert.equal(result.triagedFindings[0].suppression.id, "first");
  assert.equal(result.passed, true);
  policy.suppressions[0].lines = [2];
  fs.writeFileSync(f.policy, JSON.stringify(policy));
  assert.equal(
    runSastScan({ rootDir: f.root }).expiredFindings[0].suppression.id,
    "second",
  );
  fs.unlinkSync(f.policy);
  assert.equal(runSastScan({ rootDir: f.root }).activeFindings.length, 1);
});

for (const fault of ["grow", "truncate", "replace-file", "replace-link"]) {
  test(`closed staging ${fault} before reopening cannot publish`, (t) => {
    let writeFd;
    const f = artifactFixture(t, {
      writeSync(fd, ...args) {
        writeFd = fd;
        return fs.writeSync(fd, ...args);
      },
      closeSync(fd) {
        fs.closeSync(fd);
        if (fd !== writeFd) return;
        writeFd = null;
        const temp = fs
          .readdirSync(path.dirname(f.output))
          .find((n) => n.startsWith(".sast-"));
        const file = path.join(path.dirname(f.output), temp);
        if (fault === "grow") fs.appendFileSync(file, "x");
        if (fault === "truncate") fs.truncateSync(file, f.bytes.length - 1);
        if (fault.startsWith("replace")) {
          // Keep original inode allocated, so deterministic replacement cannot reuse it.
          fs.renameSync(file, file + ".original");
          if (fault === "replace-file") fs.writeFileSync(file, f.bytes);
          else fs.symlinkSync(file + ".original", file);
        }
      },
    });
    assert.throws(() => f.publish(), /SAST (publication|cleanup) failed/);
    assert.ok(!fs.existsSync(f.output));
    if (fault.startsWith("replace")) {
      const names = fs.readdirSync(path.dirname(f.output));
      assert.equal(names.length, 2);
      assert.ok(
        fs
          .readFileSync(
            path.join(
              path.dirname(f.output),
              names.find((n) => !n.endsWith(".original")),
            ),
          )
          .equals(f.bytes),
      );
    } else assert.deepEqual(fs.readdirSync(path.dirname(f.output)), []);
  });
}
test("successful short writes and private no-follow staging reopen publish complete bytes", (t) => {
  const opens = [];
  const f = artifactFixture(t, {
    openSync(file, flags, mode) {
      opens.push({ file, flags, mode });
      return fs.openSync(file, flags, mode);
    },
    writeSync(fd, bytes, offset, length, position) {
      return fs.writeSync(fd, bytes, offset, Math.min(length, 11), position);
    },
  });
  f.publish();
  assert.ok(fs.readFileSync(f.output).equals(f.bytes));
  assert.equal(opens.length, 2);
  assert.equal(opens[0].mode, 0o600);
  assert.ok(opens[0].flags & fs.constants.O_EXCL);
  assert.ok(opens[0].flags & fs.constants.O_NOFOLLOW);
  assert.ok(opens[1].flags & fs.constants.O_NOFOLLOW);
  assert.ok(opens[1].flags & fs.constants.O_NONBLOCK);
  assert.equal(path.dirname(opens[0].file), path.dirname(f.output));
});
test("sparse custom roots reject before source work", () => {
  const api = machinery({
    existsSync() {
      throw Error("read canary");
    },
  });
  assert.throws(
    () => api.runSastScan({ roots: Array(1) }),
    /SAST invocation failed/,
  );
});
