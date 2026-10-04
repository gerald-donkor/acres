const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const RUNNER = path.join(ROOT, "scripts/ops/audit-dependencies.sh");

function runRunner(args = [], options = {}) {
  const runnerPath = options.runner || RUNNER;
  return spawnSync("sh", [runnerPath, ...args], {
    cwd: options.cwd || ROOT,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
  });
}

function makeCleanFixture(t) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-audit-clean-"));
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  const opsDir = path.join(tmpDir, "scripts/ops");
  fs.mkdirSync(opsDir, { recursive: true });
  const scriptPath = path.join(opsDir, "audit-dependencies.sh");
  fs.copyFileSync(RUNNER, scriptPath);
  fs.chmodSync(scriptPath, 0o755);

  const packageJsonPath = path.join(tmpDir, "package.json");
  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify({ name: "fixture-audit-test", version: "1.0.0" }, null, 2) +
      "\n",
    "utf8",
  );

  const packageLockJsonPath = path.join(tmpDir, "package-lock.json");
  fs.writeFileSync(
    packageLockJsonPath,
    JSON.stringify(
      {
        name: "fixture-audit-test",
        version: "1.0.0",
        lockfileVersion: 3,
        packages: {
          "": {
            name: "fixture-audit-test",
            version: "1.0.0",
          },
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  return {
    tmpDir,
    scriptPath,
    packageJsonPath,
    packageLockJsonPath,
  };
}

function makeMockNpmFixture(t, mockScript) {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "acres-audit-mock-npm-"),
  );
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  const binDir = path.join(tmpDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const npmPath = path.join(binDir, "npm");
  fs.writeFileSync(npmPath, mockScript, "utf8");
  fs.chmodSync(npmPath, 0o755);

  const packageJsonPath = path.join(tmpDir, "package.json");
  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify({ name: "mock-test", version: "1.0.0" }, null, 2) + "\n",
    "utf8",
  );

  const packageLockJsonPath = path.join(tmpDir, "package-lock.json");
  fs.writeFileSync(
    packageLockJsonPath,
    JSON.stringify(
      {
        name: "mock-test",
        version: "1.0.0",
        lockfileVersion: 3,
        packages: { "": { name: "mock-test", version: "1.0.0" } },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  return {
    tmpDir,
    binDir,
    npmPath,
    env: {
      PATH: `${binDir}:${process.env.PATH || ""}`,
    },
  };
}

test("audit-dependencies.sh: displays usage with --help", () => {
  const res = runRunner(["--help"]);
  assert.equal(res.status, 0);
  assert.match(
    res.stdout,
    /Usage: scripts\/ops\/audit-dependencies\.sh \[--cwd <path> \| --cwd=<path>\]/,
  );
  assert.equal(res.stderr, "");
});

test("audit-dependencies.sh: displays usage with -h", () => {
  const res = runRunner(["-h"]);
  assert.equal(res.status, 0);
  assert.match(
    res.stdout,
    /Usage: scripts\/ops\/audit-dependencies\.sh \[--cwd <path> \| --cwd=<path>\]/,
  );
  assert.equal(res.stderr, "");
});

test("audit-dependencies.sh: rejects unknown long option", () => {
  const res = runRunner(["--unknown-flag"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: Unknown option "--unknown-flag"/);
  assert.match(res.stderr, /Usage: scripts\/ops\/audit-dependencies\.sh/);
});

test("audit-dependencies.sh: rejects unknown short option", () => {
  const res = runRunner(["-x"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: Unknown option "-x"/);
  assert.match(res.stderr, /Usage: scripts\/ops\/audit-dependencies\.sh/);
});

test("audit-dependencies.sh: rejects unexpected positional argument", () => {
  const res = runRunner(["unexpected_arg"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: Unexpected argument "unexpected_arg"/);
  assert.match(res.stderr, /Usage: scripts\/ops\/audit-dependencies\.sh/);
});

test("audit-dependencies.sh: rejects missing value for --cwd", () => {
  const res = runRunner(["--cwd"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --cwd requires a non-empty directory path/);
});

test("audit-dependencies.sh: rejects next flag as value for --cwd", () => {
  const res = runRunner(["--cwd", "--help"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --cwd requires a non-empty directory path/);
});

test("audit-dependencies.sh: rejects empty string value for --cwd", () => {
  const res = runRunner(["--cwd", ""]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --cwd path cannot be empty/);
});

test("audit-dependencies.sh: rejects whitespace string value for --cwd", () => {
  const res = runRunner(["--cwd", "   "]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --cwd path cannot be empty/);
});

test("audit-dependencies.sh: rejects empty value for --cwd=", () => {
  const res = runRunner(["--cwd="]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --cwd path cannot be empty/);
});

test("audit-dependencies.sh: rejects whitespace value for --cwd=", () => {
  const res = runRunner(["--cwd=   "]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --cwd path cannot be empty/);
});

test("audit-dependencies.sh: rejects repeated --cwd option (separate syntax)", () => {
  const res = runRunner(["--cwd", ".", "--cwd", "."]);
  assert.equal(res.status, 1);
  assert.match(
    res.stderr,
    /Error: Repeated --cwd option; expected single directory path/,
  );
});

test("audit-dependencies.sh: rejects repeated --cwd= option (equals syntax)", () => {
  const res = runRunner(["--cwd=.", "--cwd=."]);
  assert.equal(res.status, 1);
  assert.match(
    res.stderr,
    /Error: Repeated --cwd option; expected single directory path/,
  );
});

test("audit-dependencies.sh: rejects repeated --cwd mixed syntax", () => {
  const res = runRunner(["--cwd", ".", "--cwd=."]);
  assert.equal(res.status, 1);
  assert.match(
    res.stderr,
    /Error: Repeated --cwd option; expected single directory path/,
  );
});

test("audit-dependencies.sh: rejects non-existent directory for --cwd", () => {
  const res = runRunner(["--cwd", "/path/that/does/not/exist/at/all"]);
  assert.equal(res.status, 1);
  assert.match(
    res.stderr,
    /audit error: target directory does not exist: \/path\/that\/does\/not\/exist\/at\/all/,
  );
});

test("audit-dependencies.sh: rejects missing value for --audit-level", () => {
  const res = runRunner(["--audit-level"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --audit-level requires a value/);
});

test("audit-dependencies.sh: rejects next flag as value for --audit-level", () => {
  const res = runRunner(["--audit-level", "--help"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --audit-level requires a value/);
});

test("audit-dependencies.sh: rejects empty string for --audit-level", () => {
  const res = runRunner(["--audit-level", ""]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --audit-level cannot be empty/);
});

test("audit-dependencies.sh: rejects whitespace string for --audit-level", () => {
  const res = runRunner(["--audit-level", "   "]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --audit-level cannot be empty/);
});

test("audit-dependencies.sh: rejects empty value for --audit-level=", () => {
  const res = runRunner(["--audit-level="]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --audit-level cannot be empty/);
});

test("audit-dependencies.sh: rejects whitespace value for --audit-level=", () => {
  const res = runRunner(["--audit-level=   "]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --audit-level cannot be empty/);
});

test("audit-dependencies.sh: rejects repeated --audit-level option (separate)", () => {
  const res = runRunner(["--audit-level", "critical", "--audit-level", "high"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: Repeated --audit-level option/);
});

test("audit-dependencies.sh: rejects repeated --audit-level option (equals)", () => {
  const res = runRunner(["--audit-level=critical", "--audit-level=high"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: Repeated --audit-level option/);
});

test("audit-dependencies.sh: rejects invalid --audit-level value (separate)", () => {
  const res = runRunner(["--audit-level", "super_critical"]);
  assert.equal(res.status, 1);
  assert.match(
    res.stderr,
    /Error: Invalid --audit-level "super_critical" \(allowed: info, low, moderate, high, critical\)/,
  );
});

test("audit-dependencies.sh: rejects invalid --audit-level value (equals)", () => {
  const res = runRunner(["--audit-level=bogus"]);
  assert.equal(res.status, 1);
  assert.match(
    res.stderr,
    /Error: Invalid --audit-level "bogus" \(allowed: info, low, moderate, high, critical\)/,
  );
});

test("audit-dependencies.sh: rejects missing value for --omit", () => {
  const res = runRunner(["--omit"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --omit requires a value/);
});

test("audit-dependencies.sh: rejects next flag as value for --omit", () => {
  const res = runRunner(["--omit", "--help"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --omit requires a value/);
});

test("audit-dependencies.sh: rejects empty string for --omit", () => {
  const res = runRunner(["--omit", ""]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --omit cannot be empty/);
});

test("audit-dependencies.sh: rejects whitespace string for --omit", () => {
  const res = runRunner(["--omit", "   "]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --omit cannot be empty/);
});

test("audit-dependencies.sh: rejects empty value for --omit=", () => {
  const res = runRunner(["--omit="]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --omit cannot be empty/);
});

test("audit-dependencies.sh: rejects whitespace value for --omit=", () => {
  const res = runRunner(["--omit=   "]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --omit cannot be empty/);
});

test("audit-dependencies.sh: rejects repeated --omit option (separate)", () => {
  const res = runRunner(["--omit", "dev", "--omit", "dev"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: Repeated --omit option/);
});

test("audit-dependencies.sh: rejects repeated --omit option (equals)", () => {
  const res = runRunner(["--omit=dev", "--omit=dev"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: Repeated --omit option/);
});

test("audit-dependencies.sh: rejects directory without package.json", (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-audit-no-pkg-"));
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const res = runRunner(["--cwd", tmpDir]);
  assert.equal(res.status, 1);
  assert.match(
    res.stderr,
    /audit error: target directory does not contain package\.json:/,
  );
});

test("audit-dependencies.sh: rejects directory without package-lock.json", (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-audit-no-lock-"));
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  fs.writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name: "test", version: "1.0.0" }),
    "utf8",
  );

  const res = runRunner(["--cwd", tmpDir]);
  assert.equal(res.status, 1);
  assert.match(
    res.stderr,
    /audit error: target directory does not contain package-lock\.json:/,
  );
});

test("audit-dependencies.sh: passes cleanly on clean fixture with default options", (t) => {
  const fixture = makeCleanFixture(t);
  const res = runRunner(["--cwd", fixture.tmpDir]);
  assert.equal(res.status, 0);
  assert.match(
    res.stdout,
    /Running production dependency security audit \(level: critical, omit: dev\)\.\.\./,
  );
  assert.match(
    res.stdout,
    /Production dependency security audit passed \(0 critical vulnerabilities\)/,
  );
});

test("audit-dependencies.sh: passes cleanly on clean fixture with --cwd= syntax", (t) => {
  const fixture = makeCleanFixture(t);
  const res = runRunner([`--cwd=${fixture.tmpDir}`]);
  assert.equal(res.status, 0);
  assert.match(
    res.stdout,
    /Production dependency security audit passed \(0 critical vulnerabilities\)/,
  );
});

test("audit-dependencies.sh: passes cleanly on clean fixture with --audit-level=high", (t) => {
  const fixture = makeCleanFixture(t);
  const res = runRunner(["--cwd", fixture.tmpDir, "--audit-level", "high"]);
  assert.equal(res.status, 0);
  assert.match(
    res.stdout,
    /Production dependency security audit passed \(0 high vulnerabilities\)/,
  );
});

test("audit-dependencies.sh: passes cleanly on clean fixture with --audit-level=moderate", (t) => {
  const fixture = makeCleanFixture(t);
  const res = runRunner(["--cwd", fixture.tmpDir, "--audit-level=moderate"]);
  assert.equal(res.status, 0);
  assert.match(
    res.stdout,
    /Production dependency security audit passed \(0 moderate vulnerabilities\)/,
  );
});

test("audit-dependencies.sh: passes cleanly on clean fixture with --audit-level=low", (t) => {
  const fixture = makeCleanFixture(t);
  const res = runRunner(["--cwd", fixture.tmpDir, "--audit-level", "low"]);
  assert.equal(res.status, 0);
  assert.match(
    res.stdout,
    /Production dependency security audit passed \(0 low vulnerabilities\)/,
  );
});

test("audit-dependencies.sh: passes cleanly on clean fixture with --audit-level=info", (t) => {
  const fixture = makeCleanFixture(t);
  const res = runRunner(["--cwd", fixture.tmpDir, "--audit-level=info"]);
  assert.equal(res.status, 0);
  assert.match(
    res.stdout,
    /Production dependency security audit passed \(0 info vulnerabilities\)/,
  );
});

test("audit-dependencies.sh: passes cleanly on clean fixture with custom --omit=optional", (t) => {
  const fixture = makeCleanFixture(t);
  const res = runRunner(["--cwd", fixture.tmpDir, "--omit", "optional"]);
  assert.equal(res.status, 0);
  assert.match(
    res.stdout,
    /Running production dependency security audit \(level: critical, omit: optional\)\.\.\./,
  );
});

test("audit-dependencies.sh: passes cleanly on clean fixture with custom --omit=peer", (t) => {
  const fixture = makeCleanFixture(t);
  const res = runRunner(["--cwd", fixture.tmpDir, "--omit=peer"]);
  assert.equal(res.status, 0);
  assert.match(
    res.stdout,
    /Running production dependency security audit \(level: critical, omit: peer\)\.\.\./,
  );
});

test("audit-dependencies.sh: fails and reports error message when npm audit detects vulnerabilities", (t) => {
  const mockScript = `#!/bin/sh
if [ "\${1:-}" = "audit" ]; then
  printf 'simulated critical vulnerability found\\n' >&2
  exit 1
fi
exit 0
`;
  const fixture = makeMockNpmFixture(t, mockScript);

  const res = runRunner(["--cwd", fixture.tmpDir], {
    env: fixture.env,
  });
  assert.equal(res.status, 1);
  assert.match(
    res.stderr,
    /audit error: critical vulnerabilities detected in production dependencies/,
  );
});

test("audit-dependencies.sh: reports custom audit level in error message when npm audit fails", (t) => {
  const mockScript = `#!/bin/sh
if [ "\${1:-}" = "audit" ]; then
  printf 'simulated high vulnerability found\\n' >&2
  exit 1
fi
exit 0
`;
  const fixture = makeMockNpmFixture(t, mockScript);

  const res = runRunner(
    ["--cwd", fixture.tmpDir, "--audit-level=high", "--omit=peer"],
    { env: fixture.env },
  );
  assert.equal(res.status, 1);
  assert.match(
    res.stderr,
    /audit error: high vulnerabilities detected in production dependencies/,
  );
});

test("audit-dependencies.sh: passes exact CLI flags through to npm audit invocation", (t) => {
  const argsLog = path.join(
    os.tmpdir(),
    `npm-args-${Date.now()}-${Math.random()}.log`,
  );
  t.after(() => {
    try {
      fs.rmSync(argsLog, { force: true });
    } catch {
      // ignore
    }
  });

  const mockScript = `#!/bin/sh
printf '%s\\n' "$*" > "${argsLog}"
exit 0
`;
  const fixture = makeMockNpmFixture(t, mockScript);

  const res = runRunner(
    ["--cwd", fixture.tmpDir, "--audit-level=moderate", "--omit=dev"],
    { env: fixture.env },
  );
  assert.equal(res.status, 0);
  const recorded = fs.readFileSync(argsLog, "utf8").trim();
  assert.equal(recorded, "audit --omit=dev --audit-level=moderate");
});

test("audit-dependencies.sh: passes when mock npm audit reports zero vulnerabilities", (t) => {
  const mockScript = `#!/bin/sh
if [ "\${1:-}" = "audit" ]; then
  printf 'found 0 vulnerabilities\\n'
  exit 0
fi
exit 0
`;
  const fixture = makeMockNpmFixture(t, mockScript);

  const res = runRunner(["--cwd", fixture.tmpDir, "--audit-level", "low"], {
    env: fixture.env,
  });
  assert.equal(res.status, 0);
  assert.match(
    res.stdout,
    /Production dependency security audit passed \(0 low vulnerabilities\)/,
  );
});

test("audit-dependencies.sh: supports execution from subdirectory targeting repository root", () => {
  const res = runRunner(["--help"], {
    cwd: path.join(ROOT, "server"),
  });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Usage: scripts\/ops\/audit-dependencies\.sh/);
});

test("audit-dependencies.sh: supports execution from subdirectory using --cwd ..", (t) => {
  const fixture = makeCleanFixture(t);
  const subDir = path.join(fixture.tmpDir, "nested-sub");
  fs.mkdirSync(subDir, { recursive: true });

  const res = runRunner(["--cwd", ".."], {
    cwd: subDir,
  });
  assert.equal(res.status, 0);
  assert.match(
    res.stdout,
    /Production dependency security audit passed \(0 critical vulnerabilities\)/,
  );
});

test("audit-dependencies.sh: supports directory path containing spaces", (t) => {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "acres audit space test-"),
  );
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  fs.writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name: "space-test", version: "1.0.0" }, null, 2) + "\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(tmpDir, "package-lock.json"),
    JSON.stringify(
      {
        name: "space-test",
        version: "1.0.0",
        lockfileVersion: 3,
        packages: { "": { name: "space-test", version: "1.0.0" } },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const res = runRunner(["--cwd", tmpDir]);
  assert.equal(res.status, 0);
  assert.match(
    res.stdout,
    /Production dependency security audit passed \(0 critical vulnerabilities\)/,
  );
});

test("audit-dependencies.sh: rejects invalid option when invoked from subdirectory", () => {
  const res = runRunner(["--bogus"], {
    cwd: path.join(ROOT, "server"),
  });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: Unknown option "--bogus"/);
});
