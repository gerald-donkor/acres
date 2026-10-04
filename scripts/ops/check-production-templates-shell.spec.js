const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const RUNNER = path.join(ROOT, "scripts/ops/check-production-templates.sh");

const REQUIRED_FILES = [
  "infra/caddy/Caddyfile.example",
  "infra/compose/docker-compose.production.example.yml",
  "infra/docker/client.Dockerfile.example",
  "infra/docker/client.Dockerfile.example.dockerignore",
  "infra/env/production.env.example",
  "infra/env/garage.production.env.example",
  "infra/prometheus/prometheus.yml",
  "infra/prometheus/alerts.yml",
  "infra/grafana/provisioning/datasources/prometheus.yml",
  "infra/grafana/provisioning/dashboards/acres.yml",
  "infra/grafana/dashboards/acres-operations.json",
  "infra/launch/readiness.example.json",
  "infra/launch/readiness.schema.json",
  "scripts/ops/check-launch-readiness.js",
  "scripts/ops/check-launch-readiness.spec.js",
  "scripts/ops/check-smtp-template-keys.js",
  "scripts/ops/check-smtp-template-keys.spec.js",
  "scripts/ops/check-garage-metrics.js",
  "scripts/ops/check-garage-metrics.spec.js",
  "scripts/ops/check-proxy-environment.js",
  "scripts/ops/check-proxy-environment.spec.js",
  "scripts/ops/check-application-environment.js",
  "scripts/ops/check-application-environment.spec.js",
  "scripts/ops/check-readiness-schema.spec.js",
  "scripts/db/bootstrap-production-roles.sh",
  "scripts/db/reconcile-production-monitor.sh",
  "scripts/ops/verify-caddy-routing.js",
  "scripts/ops/verify-caddy-routing.spec.js",
  "scripts/ops/run-deployment-drill.sh",
  "scripts/ops/run-deployment-drill.spec.js",
  "scripts/ops/verify-volume-encryption.js",
  "scripts/ops/verify-volume-encryption.spec.js",
  "scripts/ops/run-secret-rotation-drill.sh",
  "scripts/ops/run-secret-rotation-drill.spec.js",
  "scripts/ops/run-restore-drill.sh",
  "scripts/ops/run-restore-drill.spec.js",
  "scripts/ops/verify-alert-rules.js",
  "scripts/ops/verify-alert-rules.spec.js",
  "scripts/ops/verify-capacity-load.js",
  "scripts/ops/verify-capacity-load.spec.js",
  "scripts/ops/run-dos-resilience-drill.spec.js",
  "scripts/ops/run-capacity-alerting-drill.spec.js",
  "scripts/ops/launch-target-evidence.spec.js",
  "scripts/ops/run-dos-resilience-drill.sh",
  "scripts/ops/run-capacity-alerting-drill.sh",
  "scripts/ops/check-release-images.js",
  "scripts/ops/check-release-images.spec.js",
  "scripts/ops/verify-postgres-diagnostics.js",
  "scripts/ops/run-launch-drills.sh",
  "scripts/ops/run-launch-drills.spec.js",
  "scripts/ops/assemble-launch-dossier.js",
  "scripts/ops/assemble-launch-dossier.spec.js",
  "scripts/ops/run-static-integrity-checks.js",
  "scripts/ops/run-static-integrity-checks.spec.js",
  "scripts/ops/check-docker-runtime.sh",
  "scripts/ops/check-docker-runtime.spec.js",
  "scripts/ops/scan-secrets.sh",
  "scripts/ops/scan-secrets.spec.js",
  "scripts/ops/audit-dependencies.sh",
  "scripts/ops/audit-dependencies.spec.js",
  "scripts/ops/backup-postgres.sh",
  "scripts/ops/backup-postgres.spec.js",
  "scripts/ops/restore-postgres.sh",
  "scripts/ops/restore-postgres.spec.js",
  "scripts/ops/launch-readiness.sh",
  "scripts/ops/launch-readiness.spec.js",
  "scripts/ops/check-production-templates.js",
  "scripts/ops/check-production-templates.spec.js",
  "scripts/ops/check-production-templates-shell.spec.js",
  "docs/launch-checklist.md",
];

function populateDirectoryFiles(dir, omittedFiles = new Set(), overrides = {}) {
  for (const relFile of REQUIRED_FILES) {
    if (omittedFiles.has(relFile)) continue;
    const fullPath = path.join(dir, relFile);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, "");
    }
  }

  if (!omittedFiles.has("infra/env/production.env.example")) {
    const envContent =
      overrides.envContent ?? "# Valid template env\n__REQUIRED_KEY=value\n";
    const envPath = path.join(dir, "infra/env/production.env.example");
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, envContent);
  }

  if (!omittedFiles.has("infra/caddy/Caddyfile.example")) {
    const caddyContent =
      overrides.caddyContent ??
      'Strict-Transport-Security "max-age=31536000;"\n';
    const caddyPath = path.join(dir, "infra/caddy/Caddyfile.example");
    fs.mkdirSync(path.dirname(caddyPath), { recursive: true });
    fs.writeFileSync(caddyPath, caddyContent);
  }
}

function makeTempFixture(t, overrides = {}) {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "acres-templates-shell-test-"),
  );
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  const opsDir = path.join(tmpDir, "scripts/ops");
  fs.mkdirSync(opsDir, { recursive: true });

  const callLog = path.join(tmpDir, "calls.jsonl");

  fs.copyFileSync(RUNNER, path.join(opsDir, "check-production-templates.sh"));
  fs.chmodSync(path.join(opsDir, "check-production-templates.sh"), 0o755);

  function makeNodeStub(relPath, exitCode = 0) {
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const content = `#!/usr/bin/env node
const fs = require('node:fs');
const log = ${JSON.stringify(callLog)};
fs.appendFileSync(log, JSON.stringify({ name: ${JSON.stringify(relPath)}, argv: process.argv.slice(2), cwd: process.cwd() }) + "\\n");
if (${exitCode} !== 0) {
  process.exit(${exitCode});
}
`;
    fs.writeFileSync(fullPath, content, { mode: 0o755 });
  }

  const omittedFiles = new Set(overrides.omitFiles || []);
  populateDirectoryFiles(tmpDir, omittedFiles, overrides);

  makeNodeStub(
    "scripts/ops/check-production-templates.js",
    overrides.nodeTemplatesExit ?? 0,
  );
  makeNodeStub(
    "scripts/ops/verify-caddy-routing.js",
    overrides.caddyRoutingExit ?? 0,
  );
  makeNodeStub(
    "scripts/ops/verify-volume-encryption.js",
    overrides.volumeEncryptionExit ?? 0,
  );
  makeNodeStub(
    "scripts/ops/verify-alert-rules.js",
    overrides.alertRulesExit ?? 0,
  );
  makeNodeStub(
    "scripts/ops/verify-capacity-load.js",
    overrides.capacityLoadExit ?? 0,
  );

  function runScript(args = [], runEnv = {}, runCwd = tmpDir) {
    const cleanEnv = { ...process.env, ...runEnv };
    delete cleanEnv.NODE_TEST_CONTEXT;
    delete cleanEnv.NODE_TEST_WORKER_ID;

    const res = spawnSync(
      "sh",
      [path.join(opsDir, "check-production-templates.sh"), ...args],
      {
        cwd: runCwd,
        env: cleanEnv,
        encoding: "utf8",
      },
    );

    let recordedCalls = [];
    if (fs.existsSync(callLog)) {
      const lines = fs
        .readFileSync(callLog, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean);
      recordedCalls = lines.map((l) => JSON.parse(l));
    }

    return {
      status: res.status,
      stdout: res.stdout || "",
      stderr: res.stderr || "",
      calls: recordedCalls,
    };
  }

  return { tmpDir, runScript, callLog, opsDir };
}

test("check-production-templates.sh CLI flags and argument validation", async (t) => {
  await t.test("--help prints usage to stdout and exits with 0", () => {
    const { runScript } = makeTempFixture(t);
    const result = runScript(["--help"]);
    assert.equal(result.status, 0);
    assert.match(
      result.stdout,
      /Usage: scripts\/ops\/check-production-templates\.sh \[--cwd <path> \| --cwd=<path>\]/,
    );
    assert.equal(result.calls.length, 0);
  });

  await t.test("-h prints usage to stdout and exits with 0", () => {
    const { runScript } = makeTempFixture(t);
    const result = runScript(["-h"]);
    assert.equal(result.status, 0);
    assert.match(
      result.stdout,
      /Usage: scripts\/ops\/check-production-templates\.sh \[--cwd <path> \| --cwd=<path>\]/,
    );
    assert.equal(result.calls.length, 0);
  });

  await t.test(
    "unknown option --invalid exits 1 with error and usage to stderr",
    () => {
      const { runScript } = makeTempFixture(t);
      const result = runScript(["--invalid"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Error: Unknown option "--invalid"/);
      assert.match(
        result.stderr,
        /Usage: scripts\/ops\/check-production-templates\.sh/,
      );
      assert.equal(result.calls.length, 0);
    },
  );

  await t.test(
    "unknown single-dash option -x exits 1 with error and usage to stderr",
    () => {
      const { runScript } = makeTempFixture(t);
      const result = runScript(["-x"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Error: Unknown option "-x"/);
      assert.match(
        result.stderr,
        /Usage: scripts\/ops\/check-production-templates\.sh/,
      );
      assert.equal(result.calls.length, 0);
    },
  );

  await t.test(
    "unexpected positional argument exits 1 with error and usage to stderr",
    () => {
      const { runScript } = makeTempFixture(t);
      const result = runScript(["extra-arg"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Error: Unexpected argument "extra-arg"/);
      assert.match(
        result.stderr,
        /Usage: scripts\/ops\/check-production-templates\.sh/,
      );
      assert.equal(result.calls.length, 0);
    },
  );

  await t.test(
    "unexpected file positional argument exits 1 with error and usage to stderr",
    () => {
      const { runScript } = makeTempFixture(t);
      const result = runScript(["file.json"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Error: Unexpected argument "file.json"/);
      assert.match(
        result.stderr,
        /Usage: scripts\/ops\/check-production-templates\.sh/,
      );
      assert.equal(result.calls.length, 0);
    },
  );

  await t.test(
    "missing --cwd value at end of arguments exits 1 with descriptive error to stderr",
    () => {
      const { runScript } = makeTempFixture(t);
      const result = runScript(["--cwd"]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /Error: --cwd requires a non-empty directory path/,
      );
      assert.equal(result.calls.length, 0);
    },
  );

  await t.test(
    "--cwd with option passed as value exits 1 with descriptive error to stderr",
    () => {
      const { runScript } = makeTempFixture(t);
      const result = runScript(["--cwd", "--help"]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /Error: --cwd requires a non-empty directory path/,
      );
      assert.equal(result.calls.length, 0);
    },
  );

  await t.test(
    "repeated --cwd option exits 1 with descriptive error to stderr",
    () => {
      const { runScript } = makeTempFixture(t);
      const result = runScript(["--cwd", ".", "--cwd", "."]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /Error: Repeated --cwd option; expected single directory path/,
      );
      assert.equal(result.calls.length, 0);
    },
  );

  await t.test(
    "repeated --cwd= option exits 1 with descriptive error to stderr",
    () => {
      const { runScript } = makeTempFixture(t);
      const result = runScript(["--cwd=.", "--cwd=."]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /Error: Repeated --cwd option; expected single directory path/,
      );
      assert.equal(result.calls.length, 0);
    },
  );

  await t.test(
    "empty --cwd value exits 1 with descriptive error to stderr",
    () => {
      const { runScript } = makeTempFixture(t);
      const result = runScript(["--cwd", ""]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Error: --cwd path cannot be empty/);
      assert.equal(result.calls.length, 0);
    },
  );

  await t.test(
    "whitespace-only --cwd value exits 1 with descriptive error to stderr",
    () => {
      const { runScript } = makeTempFixture(t);
      const result = runScript(["--cwd", "   "]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Error: --cwd path cannot be empty/);
      assert.equal(result.calls.length, 0);
    },
  );

  await t.test(
    "empty --cwd= value exits 1 with descriptive error to stderr",
    () => {
      const { runScript } = makeTempFixture(t);
      const result = runScript(["--cwd="]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Error: --cwd path cannot be empty/);
      assert.equal(result.calls.length, 0);
    },
  );

  await t.test(
    "whitespace-only --cwd= value exits 1 with descriptive error to stderr",
    () => {
      const { runScript } = makeTempFixture(t);
      const result = runScript(["--cwd=   "]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Error: --cwd path cannot be empty/);
      assert.equal(result.calls.length, 0);
    },
  );

  await t.test(
    "non-existent --cwd directory exits 1 with fail-closed error to stderr",
    () => {
      const { runScript, tmpDir } = makeTempFixture(t);
      const missingDir = path.join(tmpDir, "does-not-exist-dir");
      const result = runScript(["--cwd", missingDir]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /ops template check failed: target directory does not exist:/,
      );
      assert.equal(result.calls.length, 0);
    },
  );

  await t.test(
    "both --cwd <path> and --cwd=<path> resolve and target explicit directory",
    () => {
      const { runScript, tmpDir } = makeTempFixture(t);
      const subTarget = path.join(tmpDir, "sub-target");
      fs.mkdirSync(subTarget, { recursive: true });
      populateDirectoryFiles(subTarget);

      const resSpace = runScript(["--cwd", subTarget]);
      assert.equal(resSpace.status, 0);
      assert.match(resSpace.stdout, /ops template check passed/);
      const templateCall1 = resSpace.calls.find(
        (c) => c.name === "scripts/ops/check-production-templates.js",
      );
      assert.ok(templateCall1);
      assert.deepEqual(templateCall1.argv, [
        "--cwd",
        fs.realpathSync(subTarget),
      ]);

      const resEqual = runScript([`--cwd=${subTarget}`]);
      assert.equal(resEqual.status, 0);
      assert.match(resEqual.stdout, /ops template check passed/);
      const templateCall2 = resEqual.calls
        .slice(resSpace.calls.length)
        .find((c) => c.name === "scripts/ops/check-production-templates.js");
      assert.ok(templateCall2);
      assert.deepEqual(templateCall2.argv, [
        "--cwd",
        fs.realpathSync(subTarget),
      ]);
    },
  );
});

test("check-production-templates.sh fail-closed step ordering and assertions", async (t) => {
  await t.test(
    "missing required template file halts immediately with exit 1",
    () => {
      const { runScript } = makeTempFixture(t, {
        omitFiles: ["infra/caddy/Caddyfile.example"],
      });
      const result = runScript([]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /ops template check failed: missing required file: infra\/caddy\/Caddyfile\.example/,
      );
      assert.equal(result.calls.length, 0);
    },
  );

  await t.test(
    "missing required shell spec file halts immediately with exit 1",
    () => {
      const { runScript } = makeTempFixture(t, {
        omitFiles: ["scripts/ops/check-production-templates-shell.spec.js"],
      });
      const result = runScript([]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /ops template check failed: missing required file: scripts\/ops\/check-production-templates-shell\.spec\.js/,
      );
      assert.equal(result.calls.length, 0);
    },
  );

  await t.test(
    "check-production-templates.js failure aborts execution immediately with exit 1",
    () => {
      const { runScript } = makeTempFixture(t, { nodeTemplatesExit: 1 });
      const result = runScript([]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /ops template check failed: production template validation failed/,
      );
      assert.equal(result.calls.length, 1);
      assert.equal(
        result.calls[0].name,
        "scripts/ops/check-production-templates.js",
      );
    },
  );

  await t.test(
    "leaked secret in production.env.example aborts execution with exit 1",
    () => {
      const { runScript } = makeTempFixture(t, {
        envContent:
          "NEXT_PUBLIC_DATABASE_PASSWORD=secret123\n__REQUIRED_SETTING=1\n",
      });
      const result = runScript([]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /ops template check failed: production env example exposes a secret-looking NEXT_PUBLIC variable/,
      );
      // Node validator was called, but downstream verifiers were not called
      assert.equal(result.calls.length, 1);
    },
  );

  await t.test(
    "missing __REQUIRED_ sentinels aborts execution with exit 1",
    () => {
      const { runScript } = makeTempFixture(t, {
        envContent: "DATABASE_URL=postgres://localhost/test\n",
      });
      const result = runScript([]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /ops template check failed: production env example lost required placeholder sentinels/,
      );
      assert.equal(result.calls.length, 1);
    },
  );

  await t.test(
    "missing Strict-Transport-Security in Caddyfile.example aborts execution with exit 1",
    () => {
      const { runScript } = makeTempFixture(t, {
        caddyContent: ':80 {\n  respond "healthy" 200\n}\n',
      });
      const result = runScript([]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /ops template check failed: Caddy template must document the HSTS approval gate/,
      );
      assert.equal(result.calls.length, 1);
    },
  );

  await t.test(
    "verify-caddy-routing.js failure aborts execution with exit 1",
    () => {
      const { runScript } = makeTempFixture(t, { caddyRoutingExit: 1 });
      const result = runScript([]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /ops template check failed: Caddy routing verification failed/,
      );
      const callNames = result.calls.map((c) => c.name);
      assert.deepEqual(callNames, [
        "scripts/ops/check-production-templates.js",
        "scripts/ops/verify-caddy-routing.js",
      ]);
    },
  );

  await t.test(
    "verify-volume-encryption.js failure aborts execution with exit 1",
    () => {
      const { runScript } = makeTempFixture(t, { volumeEncryptionExit: 1 });
      const result = runScript([]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /ops template check failed: Volume encryption verification failed/,
      );
      const callNames = result.calls.map((c) => c.name);
      assert.deepEqual(callNames, [
        "scripts/ops/check-production-templates.js",
        "scripts/ops/verify-caddy-routing.js",
        "scripts/ops/verify-volume-encryption.js",
      ]);
    },
  );

  await t.test(
    "verify-alert-rules.js failure aborts execution with exit 1",
    () => {
      const { runScript } = makeTempFixture(t, { alertRulesExit: 1 });
      const result = runScript([]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /ops template check failed: Alert rules verification failed/,
      );
      const callNames = result.calls.map((c) => c.name);
      assert.deepEqual(callNames, [
        "scripts/ops/check-production-templates.js",
        "scripts/ops/verify-caddy-routing.js",
        "scripts/ops/verify-volume-encryption.js",
        "scripts/ops/verify-alert-rules.js",
      ]);
    },
  );

  await t.test(
    "verify-capacity-load.js failure aborts execution with exit 1",
    () => {
      const { runScript } = makeTempFixture(t, { capacityLoadExit: 1 });
      const result = runScript([]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /ops template check failed: Capacity load verification failed/,
      );
      const callNames = result.calls.map((c) => c.name);
      assert.deepEqual(callNames, [
        "scripts/ops/check-production-templates.js",
        "scripts/ops/verify-caddy-routing.js",
        "scripts/ops/verify-volume-encryption.js",
        "scripts/ops/verify-alert-rules.js",
        "scripts/ops/verify-capacity-load.js",
      ]);
    },
  );

  await t.test(
    "successful run executes all verifiers in order and outputs success",
    () => {
      const { runScript } = makeTempFixture(t);
      const result = runScript([]);
      assert.equal(result.status, 0);
      assert.equal(result.stderr, "");
      assert.match(result.stdout, /ops template check passed/);
      const callNames = result.calls.map((c) => c.name);
      assert.deepEqual(callNames, [
        "scripts/ops/check-production-templates.js",
        "scripts/ops/verify-caddy-routing.js",
        "scripts/ops/verify-volume-encryption.js",
        "scripts/ops/verify-alert-rules.js",
        "scripts/ops/verify-capacity-load.js",
      ]);
    },
  );
});

test("check-production-templates.sh real repository execution", async (t) => {
  await t.test(
    "direct execution without arguments against the repository passes with exit code 0",
    () => {
      const cleanEnv = { ...process.env };
      delete cleanEnv.NODE_TEST_CONTEXT;
      delete cleanEnv.NODE_TEST_WORKER_ID;

      const result = spawnSync("sh", [RUNNER], {
        cwd: ROOT,
        encoding: "utf8",
        env: cleanEnv,
      });
      assert.equal(result.status, 0);
      assert.match(result.stdout, /ops template check passed/);
    },
  );

  await t.test(
    "direct execution with explicit --cwd . passes with exit code 0",
    () => {
      const cleanEnv = { ...process.env };
      delete cleanEnv.NODE_TEST_CONTEXT;
      delete cleanEnv.NODE_TEST_WORKER_ID;

      const result = spawnSync("sh", [RUNNER, "--cwd", "."], {
        cwd: ROOT,
        encoding: "utf8",
        env: cleanEnv,
      });
      assert.equal(result.status, 0);
      assert.match(result.stdout, /ops template check passed/);
    },
  );

  await t.test(
    "direct execution with explicit --cwd=<ROOT> passes with exit code 0",
    () => {
      const cleanEnv = { ...process.env };
      delete cleanEnv.NODE_TEST_CONTEXT;
      delete cleanEnv.NODE_TEST_WORKER_ID;

      const result = spawnSync("sh", [RUNNER, `--cwd=${ROOT}`], {
        cwd: ROOT,
        encoding: "utf8",
        env: cleanEnv,
      });
      assert.equal(result.status, 0);
      assert.match(result.stdout, /ops template check passed/);
    },
  );

  await t.test(
    "execution from another working directory passing --cwd <ROOT> passes with exit code 0",
    () => {
      const outsideTmp = fs.mkdtempSync(
        path.join(os.tmpdir(), "acres-outside-runner-test-"),
      );
      t.after(() => {
        try {
          fs.rmSync(outsideTmp, { recursive: true, force: true });
        } catch {
          // ignore
        }
      });

      const cleanEnv = { ...process.env };
      delete cleanEnv.NODE_TEST_CONTEXT;
      delete cleanEnv.NODE_TEST_WORKER_ID;

      const result = spawnSync("sh", [RUNNER, "--cwd", ROOT], {
        cwd: outsideTmp,
        encoding: "utf8",
        env: cleanEnv,
      });
      assert.equal(result.status, 0);
      assert.match(result.stdout, /ops template check passed/);
    },
  );
});
