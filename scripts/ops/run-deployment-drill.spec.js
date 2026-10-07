const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const yaml = require("js-yaml");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_COMPOSE = path.join(
  ROOT,
  "infra/compose/docker-compose.production.example.yml",
);

// Execute the real runner and Compose checks in a disposable repository. All
// probes/preflight children are stubs and service environments are never inherited.
function fixtureRepo(options = {}) {
  const fixture = makeTempDir();
  try {
    for (const dir of [
      "scripts/ops",
      "server/src/health",
      "server/prisma/migrations/fixture",
      "infra/caddy",
      "infra/compose",
      "bin",
    ])
      fs.mkdirSync(path.join(fixture, dir), { recursive: true });
    for (const file of [
      "scripts/ops/run-deployment-drill.sh",
      "scripts/ops/launch-target-evidence.js",
      "server/src/health/health.controller.ts",
      "infra/caddy/Caddyfile.example",
      "infra/compose/docker-compose.production.example.yml",
    ])
      fs.copyFileSync(path.join(ROOT, file), path.join(fixture, file));
    fs.symlinkSync(
      path.join(ROOT, "node_modules"),
      path.join(fixture, "node_modules"),
    );
    fs.writeFileSync(
      path.join(fixture, "server/prisma/migrations/fixture/migration.sql"),
      options.destructive
        ? "DROP TABLE fixture;"
        : "CREATE TABLE fixture (id int);",
    );
    fs.writeFileSync(
      path.join(fixture, "scripts/ops/verify-caddy-routing.js"),
      "",
    );
    fs.writeFileSync(
      path.join(fixture, "scripts/ops/verify-caddy-routing.spec.js"),
      "",
    );
    const env = {
      PATH: `${path.join(fixture, "bin")}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: fixture,
      API_URL: "http://fixture.invalid:3001",
      CALL_LOG: path.join(fixture, "calls.jsonl"),
      ...options.env,
    };
    // Stubs compare credentials internally; the log contains only commands/arguments/cwd.
    const log = `printf '%s\\n' "$0|$PWD|$*" >> "$CALL_LOG"\n`;
    for (const name of [
      "check-production-templates.sh",
      "scan-secrets.sh",
      "check-docker-runtime.sh",
    ]) {
      fs.writeFileSync(
        path.join(fixture, "scripts/ops", name),
        `#!/bin/bash\n${log}exit ${options.childFailure ? 1 : 0}\n`,
        { mode: 0o700 },
      );
    }
    const passwordCheck = `[[ "$PGPASSWORD" == "$EXPECTED_PASSWORD" && "$PGCONNECT_TIMEOUT" == 3 ]] || exit 9\n`;
    fs.writeFileSync(
      path.join(fixture, "bin/pg_isready"),
      `#!/bin/bash\n${passwordCheck}${log}exit ${options.unavailable ? 1 : 0}\n`,
      { mode: 0o700 },
    );
    fs.writeFileSync(
      path.join(fixture, "bin/psql"),
      `#!/bin/bash\n${passwordCheck}${log}
if [[ "$*" == *pg_constraint* ]]; then
  exit_code="${options.secondQueryFailure ? 1 : 0}"
  printf '%s' "$SECOND_COUNT"
else
  exit_code="${options.firstQueryFailure ? 1 : 0}"
  printf '%s' "$FIRST_COUNT"
fi
exit "$exit_code"
`,
      { mode: 0o700 },
    );
    env.FIRST_COUNT = options.firstCount ?? "7\n";
    env.SECOND_COUNT = options.secondCount ?? "2\n";
    fs.writeFileSync(
      path.join(fixture, "bin/curl"),
      `#!/bin/bash\n${log}
${options.probeFailure ? "exit 1" : ""}
case "$*" in
 *health/ready*) printf '%s' '${options.malformedProbe ? "{}" : '{"ok":true,"data":{"status":"ok","database":"ok","storage":"ok"}}'}' ;;
 *) printf '%s' '{"ok":true,"data":{"status":"ok","service":"acres-api","uptimeSeconds":1}}' ;;
esac
`,
      { mode: 0o700 },
    );
    return {
      root: fixture,
      env,
      dispose() {
        fs.rmSync(fixture, { recursive: true, force: true });
      },
    };
  } catch (error) {
    fs.rmSync(fixture, { recursive: true, force: true });
    throw error;
  }
}
function invoke(f, args, options = {}) {
  try {
    const output = execFileSync(
      "bash",
      [path.join(f.root, "scripts/ops/run-deployment-drill.sh"), ...args],
      {
        cwd: options.cwd || f.root,
        encoding: "utf8",
        timeout: 15000,
        stdio: "pipe",
        env: f.env,
      },
    );
    return { output, exitCode: 0 };
  } catch (err) {
    if (!Number.isInteger(err.status)) throw err;
    return {
      output: (err.stdout || "") + (err.stderr || ""),
      exitCode: err.status,
    };
  }
}
function run(args, options = {}) {
  const f = fixtureRepo(options);
  try {
    const result = invoke(f, args);
    if (result.exitCode) {
      const error = new Error(result.output);
      error.status = result.exitCode;
      error.stdout = result.output;
      throw error;
    }
    return result.output;
  } finally {
    f.dispose();
  }
}

function runTolerant(args, options = {}) {
  try {
    return { output: run(args, options), exitCode: 0 };
  } catch (err) {
    return {
      output: (err.stdout || "") + (err.stderr || ""),
      exitCode: err.status || 1,
    };
  }
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "acres-deploy-drill-test-"));
}

test("run-deployment-drill: displays usage and exits 0 on --help", () => {
  const result = run(["--help"]);
  assert.ok(result.includes("Usage: scripts/ops/run-deployment-drill.sh"));
  assert.ok(result.includes("--dry-run"));
  assert.ok(result.includes("--compose-file"));
});

test("run-deployment-drill: fails closed on unknown options", () => {
  const { output, exitCode } = runTolerant(["--unknown-option"]);
  assert.strictEqual(exitCode, 1);
  assert.ok(
    output.includes("Unknown option or unexpected positional argument"),
  );
});

test("run-deployment-drill: rejects missing option argument values", () => {
  for (const opt of [
    "--caddyfile",
    "--compose-file",
    "--evidence-dir",
    "--evidence-file",
    "--api-url",
  ]) {
    const res1 = runTolerant([opt]);
    assert.strictEqual(res1.exitCode, 1);
    assert.ok(res1.output.includes(`Error: ${opt} requires a non-empty value`));

    const res2 = runTolerant([opt, "--dry-run"]);
    assert.strictEqual(res2.exitCode, 1);
    assert.ok(res2.output.includes(`Error: ${opt} requires a non-empty value`));
  }
});

test("run-deployment-drill: executes cleanly in --dry-run and emits valid evidence", () => {
  const tmpDir = makeTempDir();
  try {
    const evidenceFile = path.join(tmpDir, "custom-deployment-evidence.json");
    const { output, exitCode } = runTolerant([
      "--dry-run",
      "--evidence-file",
      evidenceFile,
    ]);
    assert.strictEqual(exitCode, 0, `Drill failed: ${output}`);
    assert.ok(output.includes("DEPLOYMENT CONFIGURATION PREFLIGHT COMPLETED"));
    assert.ok(fs.existsSync(evidenceFile));

    const evidence = JSON.parse(fs.readFileSync(evidenceFile, "utf8"));
    assert.strictEqual(evidence.status, "success");
    assert.strictEqual(evidence.dry_run, true);
    assert.strictEqual(evidence.execution_mode, "simulation");
    assert.strictEqual(evidence.probe_live_tested, true);
    const {
      validateDeploymentDrillReport,
    } = require("./check-launch-readiness");
    assert.strictEqual(validateDeploymentDrillReport(evidence), true);
    assert.strictEqual(
      validateDeploymentDrillReport(evidence, new Date(), {
        requireLive: true,
      }),
      false,
    );
    assert.strictEqual(evidence.schema_backward_compatible, true);
    assert.strictEqual(evidence.rollback_procedure_verified, true);
    assert.strictEqual(evidence.caddy_routing_verified, true);
    assert.ok(evidence.caddy_routes_tested >= 12);
    assert.strictEqual(evidence.security_headers_verified, true);
    assert.strictEqual(evidence.s3_sigv4_host_preserved, true);
    assert.strictEqual(evidence.migrations_verified, true);
    assert.ok(
      typeof evidence.migration_count === "number" &&
        evidence.migration_count >= 0,
    );
    assert.strictEqual(evidence.operational_templates_verified, true);
    assert.strictEqual(evidence.secrets_scan_verified, true);
    assert.strictEqual(evidence.readiness_probes_verified, true);
    assert.strictEqual(evidence.network_isolation_verified, true);
    assert.deepStrictEqual(evidence.graceful_drain_periods_verified, {
      caddy: "30s",
      next: "30s",
      api: "45s",
      worker: "60s",
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("run-deployment-drill: fails closed when compose file does not exist", () => {
  const tmpDir = makeTempDir();
  try {
    const nonexistentCompose = path.join(tmpDir, "does-not-exist.yml");
    const { output, exitCode } = runTolerant([
      "--dry-run",
      "--compose-file",
      nonexistentCompose,
      "--evidence-dir",
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(
      output.includes(
        "Required configuration or local input is not a readable regular file",
      ),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("run-deployment-drill: fails closed when a service omits restart: unless-stopped", () => {
  const tmpDir = makeTempDir();
  try {
    const composeDoc = yaml.load(fs.readFileSync(DEFAULT_COMPOSE, "utf8"));
    delete composeDoc.services.postgres.restart;
    const modifiedCompose = path.join(tmpDir, "no-restart.yml");
    fs.writeFileSync(modifiedCompose, yaml.dump(composeDoc));

    const { output, exitCode } = runTolerant([
      "--dry-run",
      "--compose-file",
      modifiedCompose,
      "--evidence-dir",
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(
      output.includes(
        'Error: Service "postgres" must configure restart: unless-stopped',
      ),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("run-deployment-drill: fails closed when a service omits bounded stop_grace_period", () => {
  const tmpDir = makeTempDir();
  try {
    const composeDoc = yaml.load(fs.readFileSync(DEFAULT_COMPOSE, "utf8"));
    delete composeDoc.services.valkey.stop_grace_period;
    const modifiedCompose = path.join(tmpDir, "no-grace.yml");
    fs.writeFileSync(modifiedCompose, yaml.dump(composeDoc));

    const { output, exitCode } = runTolerant([
      "--dry-run",
      "--compose-file",
      modifiedCompose,
      "--evidence-dir",
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(
      output.includes(
        'Error: Service "valkey" must configure a positive bounded stop_grace_period',
      ),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("run-deployment-drill: fails closed when an application service drifts on stop_grace_period", () => {
  const tmpDir = makeTempDir();
  try {
    const composeDoc = yaml.load(fs.readFileSync(DEFAULT_COMPOSE, "utf8"));
    composeDoc.services.api.stop_grace_period = "30s"; // Expected: 45s
    const modifiedCompose = path.join(tmpDir, "drifted-grace.yml");
    fs.writeFileSync(modifiedCompose, yaml.dump(composeDoc));

    const { output, exitCode } = runTolerant([
      "--dry-run",
      "--compose-file",
      modifiedCompose,
      "--evidence-dir",
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(
      output.includes(
        'Error: Service "api" stop_grace_period is "30s", expected "45s"',
      ),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("run-deployment-drill: fails closed when api omits or misconfigures datastore dependency", () => {
  const tmpDir = makeTempDir();
  try {
    const composeDoc = yaml.load(fs.readFileSync(DEFAULT_COMPOSE, "utf8"));
    composeDoc.services.api.depends_on.postgres.condition = "service_started";
    const modifiedCompose = path.join(tmpDir, "unready-dep.yml");
    fs.writeFileSync(modifiedCompose, yaml.dump(composeDoc));

    const { output, exitCode } = runTolerant([
      "--dry-run",
      "--compose-file",
      modifiedCompose,
      "--evidence-dir",
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(
      output.includes(
        'Error: Service "api" must depend on healthy "postgres" (condition: service_healthy)',
      ),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("run-deployment-drill: fails closed when worker omits clamav dependency", () => {
  const tmpDir = makeTempDir();
  try {
    const composeDoc = yaml.load(fs.readFileSync(DEFAULT_COMPOSE, "utf8"));
    delete composeDoc.services.worker.depends_on.clamav;
    const modifiedCompose = path.join(tmpDir, "missing-clamav.yml");
    fs.writeFileSync(modifiedCompose, yaml.dump(composeDoc));

    const { output, exitCode } = runTolerant([
      "--dry-run",
      "--compose-file",
      modifiedCompose,
      "--evidence-dir",
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(
      output.includes(
        'Error: Service "worker" must depend on healthy "clamav" (condition: service_healthy)',
      ),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("run-deployment-drill: fails closed when an application service omits init: true or stop_signal", () => {
  const tmpDir = makeTempDir();
  try {
    const composeDoc = yaml.load(fs.readFileSync(DEFAULT_COMPOSE, "utf8"));
    delete composeDoc.services.next.init;
    const modifiedCompose = path.join(tmpDir, "no-init.yml");
    fs.writeFileSync(modifiedCompose, yaml.dump(composeDoc));

    const { output, exitCode } = runTolerant([
      "--dry-run",
      "--compose-file",
      modifiedCompose,
      "--evidence-dir",
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(
      output.includes(
        'Error: Service "next" must configure init: true for signal supervision',
      ),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("run-deployment-drill: fails closed when an internal service joins public network", () => {
  const tmpDir = makeTempDir();
  try {
    const composeDoc = yaml.load(fs.readFileSync(DEFAULT_COMPOSE, "utf8"));
    composeDoc.services.api.networks = ["private", "public"];
    const modifiedCompose = path.join(tmpDir, "public-leak.yml");
    fs.writeFileSync(modifiedCompose, yaml.dump(composeDoc));

    const { output, exitCode } = runTolerant([
      "--dry-run",
      "--compose-file",
      modifiedCompose,
      "--evidence-dir",
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(
      output.includes('Error: Service "api" must not join the public network!'),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("real deployment runner remains simulation without --dry-run despite successful probes", () => {
  const dir = makeTempDir();
  try {
    const file = path.join(dir, "receipt.json");
    run(["--evidence-file", file]);
    const receipt = JSON.parse(fs.readFileSync(file));
    const {
      validateDeploymentDrillReport,
    } = require("./check-launch-readiness");
    assert.strictEqual(receipt.dry_run, false);
    assert.strictEqual(receipt.probe_live_tested, true);
    assert.strictEqual(receipt.execution_mode, "simulation");
    assert.strictEqual(validateDeploymentDrillReport(receipt), true);
    assert.strictEqual(
      validateDeploymentDrillReport(receipt, new Date(), { requireLive: true }),
      false,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("schema-failure receipt is still classified simulation", () => {
  const dir = makeTempDir();
  try {
    const file = path.join(dir, "receipt.json");
    const result = runTolerant(["--evidence-file", file], {
      destructive: true,
    });
    assert.strictEqual(result.exitCode, 1);
    const receipt = JSON.parse(fs.readFileSync(file));
    assert.strictEqual(receipt.status, "failed");
    assert.strictEqual(receipt.execution_mode, "simulation");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const VALUE_OPTIONS = [
  "--cwd",
  "--caddyfile",
  "--compose-file",
  "--evidence-dir",
  "--evidence-file",
  "--api-url",
];
function withFixture(options, fn) {
  const f = fixtureRepo(options);
  try {
    fn(f);
  } finally {
    f.dispose();
  }
}
function calls(f) {
  return fs.existsSync(f.env.CALL_LOG)
    ? fs.readFileSync(f.env.CALL_LOG, "utf8")
    : "";
}
function assertEarlyFailure(f, args, pattern) {
  const result = invoke(f, args);
  assert.strictEqual(result.exitCode, 1, result.output);
  assert.match(result.output, pattern);
  assert.strictEqual(calls(f), "");
  assert.strictEqual(fs.existsSync(path.join(f.root, "backups")), false);
  return result;
}
for (const option of VALUE_OPTIONS) {
  test(`${option}: rejects all duplicate forms without executing children`, () => {
    withFixture({}, (f) => {
      for (const args of [
        [option, "value", option, "value"],
        [`${option}=value`, `${option}=value`],
        [option, "value", `${option}=value`],
        [`${option}=value`, option, "value"],
      ]) {
        assertEarlyFailure(f, args, /Repeated/);
      }
    });
  });
  test(`${option}: rejects absent, blank and separate option-looking values`, () => {
    withFixture({}, (f) => {
      for (const args of [
        [option],
        [option, ""],
        [option, " \t\n"],
        [`${option}=`],
        [`${option}= \t`],
        [option, "--dry-run"],
        [option, "-h"],
      ]) {
        assertEarlyFailure(f, args, /requires a non-empty value/);
      }
    });
  });
}
test("help aliases work without target prerequisites or directories", () => {
  withFixture({}, (f) => {
    fs.rmSync(path.join(f.root, "infra"), { recursive: true });
    for (const opt of ["--help", "-h"]) {
      const r = invoke(f, [opt]);
      assert.strictEqual(r.exitCode, 0);
      assert.match(r.output, /--cwd/);
      assert.strictEqual(calls(f), "");
      assert.strictEqual(fs.existsSync(path.join(f.root, "backups")), false);
    }
  });
});
test("unknown/positional diagnostics never reflect supplied canary", () => {
  withFixture({}, (f) => {
    for (const arg of [
      "CANARY-secret-value",
      "--unknown=CANARY-secret-value",
    ]) {
      const r = assertEarlyFailure(f, [arg], /Unknown option/);
      assert.ok(!r.output.includes("CANARY-secret-value"));
    }
  });
});
test("default root ignores caller cwd; explicit relative/absolute cwd select the target repository", () => {
  withFixture({}, (f) => {
    const caller = fs.mkdtempSync(path.join(f.root, "caller-"));
    let r = invoke(f, [], { cwd: caller });
    assert.strictEqual(r.exitCode, 0, r.output);
    assert.ok(fs.existsSync(path.join(f.root, "backups")));
    assert.strictEqual(fs.existsSync(path.join(caller, "backups")), false);
    for (const attached of [false, true]) {
      const selected = fixtureRepo({});
      try {
        const args = attached
          ? [`--cwd=${selected.root}`]
          : ["--cwd", path.relative(caller, selected.root)];
        r = invoke(f, args, { cwd: caller });
        assert.strictEqual(r.exitCode, 0, r.output);
        const log = calls(f);
        for (const name of [
          "check-production-templates.sh",
          "scan-secrets.sh",
          "check-docker-runtime.sh",
        ])
          assert.ok(
            log.includes(`${name}|${selected.root}|--cwd=${selected.root}`),
            log,
          );
      } finally {
        selected.dispose();
      }
    }
  });
});
test("all attached/separate options preserve paths with spaces, dash-leading paths and HSTS forwarding", () => {
  for (const attached of [false, true])
    withFixture({}, (f) => {
      fs.copyFileSync(
        path.join(f.root, "infra/caddy/Caddyfile.example"),
        path.join(f.root, "-caddy file"),
      );
      fs.copyFileSync(DEFAULT_COMPOSE, path.join(f.root, "-compose file"));
      fs.writeFileSync(
        path.join(f.root, "scripts/ops/verify-caddy-routing.js"),
        `require('node:fs').appendFileSync(process.env.CALL_LOG, JSON.stringify(process.argv.slice(2))+'\\n');`,
      );
      const pairs = [
        ["--cwd", f.root],
        ["--caddyfile", attached ? "-caddy file" : "./-caddy file"],
        ["--compose-file", attached ? "-compose file" : "./-compose file"],
        ["--evidence-dir", "private output"],
        ["--evidence-file", "private output/receipt file.json"],
        ["--api-url", "HTTP://Fixture.INVALID:80/"],
      ];
      const args = pairs.flatMap(([k, v]) =>
        attached ? [`${k}=${v}`] : [k, v],
      );
      const r = invoke(f, [
        ...args,
        "--allow-hsts",
        "--allow-hsts",
        "--dry-run",
        "--dry-run",
      ]);
      assert.strictEqual(r.exitCode, 0, r.output);
      const receipt = JSON.parse(
        fs.readFileSync(path.join(f.root, "private output/receipt file.json")),
      );
      assert.strictEqual(
        receipt.api_target_id,
        require("./launch-target-evidence").targetId("http://fixture.invalid/"),
      );
      assert.ok(calls(f).includes("--allow-hsts"));
      assert.ok(
        calls(f).includes(
          "-fsS -m 2 --max-filesize 4096 http://fixture.invalid/health",
        ),
      );
    });
});
for (const url of [
  "http://user:CANARY@fixture.invalid",
  "http://fixture.invalid?CANARY",
  "http://fixture.invalid#CANARY",
  "http://fixture.invalid/health/CANARY",
  "ftp://fixture.invalid/CANARY",
  "http://fixture.invalid/\nCANARY",
  "CANARY",
  "http://fixture.invalid/\x7fCANARY",
]) {
  test(`unsafe URL rejected before children (${JSON.stringify(url)})`, () => {
    withFixture({}, (f) => {
      const r = assertEarlyFailure(f, ["--api-url", url], /Invalid --api-url/);
      assert.ok(!r.output.includes("CANARY"));
    });
  });
}
for (const file of [
  "infra/caddy/Caddyfile.example",
  "infra/compose/docker-compose.production.example.yml",
  "scripts/ops/verify-caddy-routing.js",
  "scripts/ops/verify-caddy-routing.spec.js",
  "scripts/ops/launch-target-evidence.js",
  "server/src/health/health.controller.ts",
  "scripts/ops/check-production-templates.sh",
  "scripts/ops/scan-secrets.sh",
  "scripts/ops/check-docker-runtime.sh",
  "server/prisma/migrations",
]) {
  test(`missing prerequisite fails before side effects: ${file}`, () => {
    withFixture({}, (f) => {
      fs.rmSync(path.join(f.root, file), { recursive: true });
      assertEarlyFailure(f, [], /unavailable|not a readable/);
    });
  });
}
test("invalid cwd and output parents fail without executing children", () => {
  withFixture({}, (f) => {
    for (const args of [
      ["--cwd", "missing"],
      ["--cwd", "infra/caddy/Caddyfile.example"],
      ["--evidence-file", "infra/caddy/Caddyfile.example/receipt.json"],
      ["--evidence-dir", "infra/caddy/Caddyfile.example"],
    ]) {
      assertEarlyFailure(f, args, /Invalid --cwd|output parent/);
    }
    fs.symlinkSync("missing-parent", path.join(f.root, "dangling-parent"));
    assertEarlyFailure(
      f,
      ["--evidence-file", "dangling-parent/receipt.json"],
      /output parent/,
    );
  });
});
for (const kind of ["file", "directory", "symlink", "dangling"]) {
  test(`retained ${kind} evidence is rejected before a failing rehearsal`, () => {
    withFixture({ childFailure: true }, (f) => {
      const dest = path.join(f.root, "retained.json");
      if (kind === "file") fs.writeFileSync(dest, "retained");
      if (kind === "directory") fs.mkdirSync(dest);
      if (kind === "symlink") {
        fs.writeFileSync(path.join(f.root, "original"), "retained");
        fs.symlinkSync("original", dest);
      }
      if (kind === "dangling") fs.symlinkSync("missing", dest);
      const before = fs.lstatSync(dest);
      assertEarlyFailure(
        f,
        ["--evidence-file", dest],
        /Evidence destination exists/,
      );
      assert.strictEqual(fs.lstatSync(dest).ino, before.ino);
      if (kind === "file" || kind === "symlink")
        assert.strictEqual(fs.readFileSync(dest, "utf8"), "retained");
    });
  });
}
test("no password skips database tools and remains offline", () => {
  withFixture({}, (f) => {
    const r = invoke(f, []);
    assert.strictEqual(r.exitCode, 0, r.output);
    assert.ok(!calls(f).includes("psql") && !calls(f).includes("pg_isready"));
    assert.match(r.output, /Offline migration structure inspected/);
  });
});
for (const env of [
  { PGPASSWORD: "fixture-primary", EXPECTED_PASSWORD: "fixture-primary" },
  {
    POSTGRES_PASSWORD: "fixture-fallback",
    EXPECTED_PASSWORD: "fixture-fallback",
  },
  {
    PGPASSWORD: "",
    POSTGRES_PASSWORD: "fixture-fallback",
    EXPECTED_PASSWORD: "fixture-fallback",
  },
  {
    PGPASSWORD: "fixture-primary",
    POSTGRES_PASSWORD: "fixture-fallback",
    EXPECTED_PASSWORD: "fixture-primary",
  },
]) {
  test(`credential source/precedence propagated (${Object.keys(env).join(",")})`, () => {
    withFixture({ env }, (f) => {
      const r = invoke(f, []);
      assert.strictEqual(r.exitCode, 0, r.output);
      assert.match(
        r.output,
        /Observed database counts: 7 applied migrations, 2 unvalidated foreign keys/,
      );
      assert.ok(calls(f).includes("-X -w -v ON_ERROR_STOP=1"));
      assert.ok(calls(f).includes("-t 3 -q"));
      assert.ok(!/fixture-primary|fixture-fallback/.test(r.output + calls(f)));
      assert.ok(!r.output.includes("Live database verified"));
    });
  });
}
for (const env of [
  { PGPASSWORD: " \t" },
  { POSTGRES_PASSWORD: "\n " },
  { PGPASSWORD: " \t", POSTGRES_PASSWORD: "valid" },
  { PGHOST: " \t", PGPASSWORD: "valid" },
  { PGUSER: " \t", PGPASSWORD: "valid" },
  { PGDATABASE: " \t", PGPASSWORD: "valid" },
]) {
  test(`blank database credential/field rejected (${Object.keys(env).join(",")})`, () => {
    withFixture({ env }, (f) => assertEarlyFailure(f, [], /Invalid database/));
  });
}
for (const port of [
  "0",
  "65536",
  "-1",
  "1.5",
  "999999999999999999999",
  "bad",
  " \t",
]) {
  test(`invalid database port rejected (${port})`, () => {
    withFixture({ env: { PGPASSWORD: "valid", PGPORT: port } }, (f) =>
      assertEarlyFailure(f, [], /Invalid PGPORT/),
    );
  });
}
test("database port boundaries and leading zeros are decimal", () => {
  for (const [input, expected] of [
    ["1", "1"],
    ["65535", "65535"],
    ["05432", "5432"],
    ["00008", "8"],
  ]) {
    withFixture(
      {
        env: { PGPASSWORD: "valid", EXPECTED_PASSWORD: "valid", PGPORT: input },
      },
      (f) => {
        const r = invoke(f, []);
        assert.strictEqual(r.exitCode, 0, r.output);
        assert.ok(calls(f).includes(`-p ${expected} `));
      },
    );
  }
});
// Hermetic executable inventory prevents missing-client tests falling through to installed psql.
function restrictTools(f, excluded = []) {
  const bin = path.join(f.root, "tools");
  fs.mkdirSync(bin);
  for (const tool of [
    "bash",
    "dirname",
    "date",
    "find",
    "wc",
    "grep",
    "mkdir",
    "mktemp",
    "chmod",
    "ln",
    "rm",
    "curl",
    "node",
    "pg_isready",
    "psql",
  ]) {
    if (excluded.includes(tool)) continue;
    const stub = path.join(f.root, "bin", tool);
    const source = fs.existsSync(stub)
      ? stub
      : tool === "node"
        ? process.execPath
        : `/usr/bin/${tool}`;
    fs.symlinkSync(source, path.join(bin, tool));
  }
  f.env.PATH = bin;
}
for (const tool of ["node", "curl", "psql", "pg_isready", "mktemp", "ln"]) {
  test(`missing utility/client fails before side effects: ${tool}`, () => {
    withFixture({ env: { PGPASSWORD: "valid" } }, (f) => {
      restrictTools(f, [tool]);
      assertEarlyFailure(f, [], /unavailable/);
    });
  });
}
test("unavailable server reports fallback, never a database success", () => {
  withFixture(
    {
      unavailable: true,
      env: { PGPASSWORD: "valid", EXPECTED_PASSWORD: "valid" },
    },
    (f) => {
      const r = invoke(f, []);
      assert.strictEqual(r.exitCode, 0, r.output);
      assert.match(r.output, /observation unavailable/);
      assert.ok(
        !calls(f).includes("psql") &&
          !r.output.includes("Observed database counts"),
      );
    },
  );
});
for (const failure of ["firstQueryFailure", "secondQueryFailure"]) {
  test(`SQL failure aborts: ${failure}`, () => {
    withFixture(
      {
        [failure]: true,
        env: { PGPASSWORD: "valid", EXPECTED_PASSWORD: "valid" },
      },
      (f) => {
        const r = invoke(f, []);
        assert.strictEqual(r.exitCode, 1, r.output);
        assert.match(r.output, /Database count query failed/);
        assert.ok(!r.output.includes("Observed database counts"));
        assert.deepStrictEqual(
          fs.readdirSync(path.join(f.root, "backups")),
          [],
        );
      },
    );
  });
}
for (const count of ["", "-1", "1.5", "1\n2", "9007199254740992", "CANARY"]) {
  test(`invalid database count fails closed (${JSON.stringify(count)})`, () => {
    for (const field of ["firstCount", "secondCount"])
      withFixture(
        {
          [field]: count,
          env: { PGPASSWORD: "valid", EXPECTED_PASSWORD: "valid" },
        },
        (f) => {
          const r = invoke(f, []);
          assert.strictEqual(r.exitCode, 1, r.output);
          assert.match(r.output, /Invalid database count result/);
          assert.ok(!r.output.includes("CANARY"));
          assert.deepStrictEqual(
            fs.readdirSync(path.join(f.root, "backups")),
            [],
          );
        },
      );
  });
}
test("database counts accept surrounding whitespace and safe integer ceiling", () => {
  withFixture(
    {
      firstCount: " \t9007199254740991\n",
      secondCount: " 0 \n",
      env: { PGPASSWORD: "valid", EXPECTED_PASSWORD: "valid" },
    },
    (f) => {
      const r = invoke(f, []);
      assert.strictEqual(r.exitCode, 0, r.output);
      assert.match(
        r.output,
        /9007199254740991 applied migrations, 0 unvalidated/,
      );
    },
  );
});
for (const mode of ["probeFailure", "malformedProbe"]) {
  test(`optional health fallback: ${mode}`, () => {
    withFixture({ [mode]: true }, (f) => {
      const r = invoke(f, []);
      assert.strictEqual(r.exitCode, 0, r.output);
      const file = fs.readdirSync(path.join(f.root, "backups"))[0];
      const receipt = JSON.parse(
        fs.readFileSync(path.join(f.root, "backups", file)),
      );
      assert.strictEqual(receipt.probe_live_tested, false);
      assert.strictEqual(receipt.execution_mode, "simulation");
    });
  });
}
test("distinct default receipts are private and preserve existing directory permissions", () => {
  withFixture({}, (f) => {
    const dir = path.join(f.root, "backups");
    fs.mkdirSync(dir, { mode: 0o750 });
    for (let i = 0; i < 2; i++) {
      const r = invoke(f, []);
      assert.strictEqual(r.exitCode, 0, r.output);
    }
    assert.strictEqual(fs.statSync(dir).mode & 0o777, 0o750);
    const files = fs.readdirSync(dir);
    assert.strictEqual(files.length, 2);
    for (const file of files) {
      assert.match(file, /^deployment-drill-evidence-\d{8}T\d{6}Z-.+\.json$/);
      assert.strictEqual(fs.statSync(path.join(dir, file)).mode & 0o777, 0o600);
      const receipt = JSON.parse(fs.readFileSync(path.join(dir, file)));
      assert.strictEqual(
        require("./check-launch-readiness").validateDeploymentDrillReport(
          receipt,
        ),
        true,
      );
      assert.strictEqual(
        require("./check-launch-readiness").validateDeploymentDrillReport(
          receipt,
          new Date(),
          { requireLive: true },
        ),
        false,
      );
    }
  });
});
for (const insertion of ["file", "directory", "symlink"]) {
  test(`publication race preserves concurrent ${insertion} insertion and removes only owned temp`, () => {
    withFixture({}, (f) => {
      const dest = path.join(f.root, "receipt.json");
      fs.writeFileSync(path.join(f.root, "unrelated-temp"), "keep");
      const action =
        insertion === "file"
          ? 'printf retained > "$dest"'
          : insertion === "directory"
            ? 'mkdir "$dest"'
            : 'ln -s unrelated-temp "$dest"';
      fs.writeFileSync(
        path.join(f.root, "bin/ln"),
        `#!/bin/bash\ndest="\${@: -1}"\n${action.replace("ln -s", "/usr/bin/ln -s")}\nexec /usr/bin/ln "$@"\n`,
        { mode: 0o700 },
      );
      const r = invoke(f, ["--evidence-file", dest]);
      assert.strictEqual(r.exitCode, 1, r.output);
      assert.match(r.output, /Could not publish evidence/);
      if (insertion === "directory")
        assert.deepStrictEqual(fs.readdirSync(dest), []);
      else
        assert.strictEqual(
          fs.readFileSync(dest, "utf8"),
          insertion === "file" ? "retained" : "keep",
        );
      assert.strictEqual(
        fs.readFileSync(path.join(f.root, "unrelated-temp"), "utf8"),
        "keep",
      );
      assert.ok(
        !fs
          .readdirSync(f.root)
          .some((v) => v.startsWith(".deployment-drill-evidence.")),
      );
    });
  });
}
for (const step of ["mktemp", "node", "ln", "interrupt"]) {
  test(`publication ${step} failure cleans owned temp without a partial final receipt`, () => {
    withFixture({}, (f) => {
      const dest = path.join(f.root, "receipt.json");
      if (step === "node")
        fs.writeFileSync(
          path.join(f.root, "bin/node"),
          `#!/bin/bash\nif [[ "$2" == *.deployment-drill-evidence.* ]]; then exit 1; fi\nexec '${process.execPath}' "$@"\n`,
          { mode: 0o700 },
        );
      else
        fs.writeFileSync(
          path.join(f.root, "bin", step === "interrupt" ? "ln" : step),
          step === "interrupt"
            ? '#!/bin/bash\nkill -TERM "$PPID"\nexit 1\n'
            : "#!/bin/bash\nexit 1\n",
          { mode: 0o700 },
        );
      const r = invoke(f, ["--evidence-file", dest]);
      assert.ok(r.exitCode !== 0, r.output);
      assert.strictEqual(fs.existsSync(dest), false);
      assert.ok(
        !fs
          .readdirSync(f.root)
          .some((v) => v.startsWith(".deployment-drill-evidence.")),
      );
    });
  });
}
test("preflight child failure publishes no success", () => {
  withFixture({ childFailure: true }, (f) => {
    const r = invoke(f, []);
    assert.strictEqual(r.exitCode, 1, r.output);
    assert.deepStrictEqual(fs.readdirSync(path.join(f.root, "backups")), []);
  });
});
test("malformed/invalid Compose documents fail before children and redact YAML canaries", () => {
  for (const document of [
    "services: [CANARY",
    "services: null",
    "[]",
    "services: []",
  ])
    withFixture({}, (f) => {
      fs.writeFileSync(
        path.join(
          f.root,
          "infra/compose/docker-compose.production.example.yml",
        ),
        document,
      );
      const r = assertEarlyFailure(f, [], /Invalid Compose document/);
      assert.ok(
        !r.output.includes("CANARY") && !r.output.includes("YAMLException"),
      );
    });
});
test("unreadable configs and non-executable children fail before side effects", () => {
  withFixture({}, (f) => {
    const file = path.join(f.root, "infra/caddy/Caddyfile.example");
    fs.chmodSync(file, 0);
    assertEarlyFailure(f, [], /not a readable regular file/);
  });
  withFixture({}, (f) => {
    fs.chmodSync(path.join(f.root, "scripts/ops/scan-secrets.sh"), 0o600);
    assertEarlyFailure(f, [], /Required shell checker unavailable/);
  });
});
test("new evidence directories are private", () => {
  withFixture({}, (f) => {
    const r = invoke(f, ["--evidence-file", "new/receipt.json"]);
    assert.strictEqual(r.exitCode, 0, r.output);
    assert.strictEqual(
      fs.statSync(path.join(f.root, "new")).mode & 0o777,
      0o700,
    );
    assert.strictEqual(
      fs.statSync(path.join(f.root, "backups")).mode & 0o777,
      0o700,
    );
  });
});
test("actual evidence write exception is controlled and cleans temporary file", () => {
  withFixture({}, (f) => {
    const preload = path.join(f.root, "write-failure.js");
    fs.writeFileSync(
      preload,
      `const fs=require('node:fs');const write=fs.writeFileSync;
fs.writeFileSync=function(file,...args){if(String(file).includes('/.deployment-drill-evidence.'))throw new Error('CANARY');return write.call(this,file,...args);};`,
    );
    f.env.NODE_OPTIONS = `--require=${preload}`;
    const r = invoke(f, ["--evidence-file", "receipt.json"]);
    assert.strictEqual(r.exitCode, 1, r.output);
    assert.match(r.output, /Could not write evidence/);
    assert.ok(!r.output.includes("CANARY"));
    assert.ok(
      !fs
        .readdirSync(f.root)
        .some((file) => file.startsWith(".deployment-drill-evidence.")),
    );
    assert.strictEqual(fs.existsSync(path.join(f.root, "receipt.json")), false);
  });
});
test("target repository path containing spaces works from an unrelated caller", () => {
  const f = fixtureRepo({});
  const original = f.root;
  const renamed = `${original} with spaces`;
  try {
    fs.renameSync(original, renamed);
    f.root = renamed;
    f.env.PATH = f.env.PATH.replace(original, renamed);
    f.env.HOME = renamed;
    f.env.CALL_LOG = path.join(renamed, "calls.jsonl");
    const r = invoke(f, [`--cwd=${renamed}`], { cwd: os.tmpdir() });
    assert.strictEqual(r.exitCode, 0, r.output);
    assert.ok(calls(f).includes(`|${renamed}|--cwd=${renamed}`));
  } finally {
    fs.rmSync(renamed, { recursive: true, force: true });
    fs.rmSync(original, { recursive: true, force: true });
  }
});
