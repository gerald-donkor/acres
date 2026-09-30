const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync, spawn } = require("node:child_process");

const children = {
  "run-static-integrity-checks.js": "static",
  "generate-sbom.js": "sbom",
  "run-sast-scan.js": "sast",
  "verify-container-security.js": "container",
  "verify-caddy-routing.js": "caddy",
  "run-deployment-drill.sh": "deployment",
  "verify-volume-encryption.js": "volume",
  "run-secret-rotation-drill.sh": "rotation",
  "run-capacity-alerting-drill.sh": "capacity",
  "run-restore-drill.sh": "restore",
  "reconcile-storage-objects.js": "reconcile",
};

// This function is serialized into the disposable repository. All children are
// deterministic stubs; none delegates to Docker, curl, databases, storage, or npm.
function stub(key, args) {
  const fs = require("node:fs"),
    path = require("node:path");
  const { targetId } = require("./launch-target-evidence");
  const val = (flag) =>
    args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  const file = val(args.includes("--output") ? "--output" : "--evidence-file");
  fs.appendFileSync(
    process.env.CHILD_LOG,
    JSON.stringify({ key, args, file }) + "\n",
  );
  const now = new Date().toISOString();
  const success = {
    timestamp: now,
    status: "success",
    valid: true,
    errors: [],
  };
  const pool = {
    totalConnections: 2,
    idleConnections: 1,
    maxConnections: 10,
    requestsWaiting: 0,
  };
  const latency = { p50Ms: 1, p95Ms: 2, p99Ms: 3 };
  const db = {
    status: "verified",
    source: "synthetic",
    postgresExporter: { up: 1, lastScrapeError: 0 },
    postgresServer: { pgUp: 1, maxConnections: 100, activeConnections: 2 },
    connectionPool: { api: pool, worker: pool },
    poolAcquisitionLatency: { api: latency, worker: latency },
    queryExecutionDuration: { api: latency, worker: latency },
    serverActivity: { lockWaits: 0, maxTransactionDurationSec: 0 },
  };
  const { REQUIRED_ALERTS } = require("./verify-alert-rules");
  const {
    DEFAULT_SLO_TARGETS,
    evaluateSloCompliance,
  } = require("./verify-capacity-load");
  const distribution = {
    availabilityPercent: 100,
    throughputRps: 150,
    latencyMs: { min: 1, p50: 2, p90: 3, p95: 4, p99: 5, max: 6 },
    databaseLatency: {
      acquisitionLatencyMs: {
        min: 0,
        p50: 1,
        p90: 1.5,
        p95: 2,
        p99: 3,
        max: 4,
      },
      queryLatencyMs: { min: 0, p50: 1, p90: 1.5, p95: 2, p99: 3, max: 4 },
    },
  };
  const simulatedDos = {
    drill_type: "dos_resilience_drill",
    timestamp: now,
    durationMs: 0,
    status: "success",
    mode: "simulated",
    apiTargetId: null,
    failures: [],
    layers: Object.fromEntries(
      [
        "layer1_edge_ingress",
        "layer2_in_process_throttling",
        "layer3_graphql_bounds",
        "layer4_storage_bounds",
        "layer5_anti_enumeration",
      ].map((k) => [k, { passed: true }]),
    ),
  };
  simulatedDos.layers.layer6_rate_limiter_burst = {
    passed: null,
    burstTestMode: "skipped",
    attemptedRequests: 0,
    throttledRequests: 0,
    authRejectedRequests: 0,
    unexpectedResponses: 0,
    transportFailures: 0,
    preHealthPassed: false,
    csrfHandshakePassed: false,
    postHealthPassed: false,
  };
  const reports = {
    static: {
      ...success,
      drill_type: "static_integrity_verification",
      totalChecks: 3,
      passedChecks: 3,
      failedChecks: 0,
      checks: ["production_templates", "docker_runtime", "secret_defaults"].map(
        (id) => ({ id, passed: true, exitCode: 0 }),
      ),
    },
    sbom: {
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      metadata: { timestamp: now },
      components: [{}],
      licenseCompliance: { compliant: true, violations: [] },
    },
    sast: {
      ...success,
      drill_type: "sast_security_scan",
      passed: true,
      scannedFilesCount: 1,
      totalFindingsCount: 0,
      triagedFindings: [],
      expiredFindings: [],
      blockingActiveFindings: [],
    },
    container: {
      ...success,
      drill_type: "container_security_verification",
      checks: [{ passed: true }],
      totalChecks: 1,
      passedChecks: 1,
      failedChecks: 0,
    },
    caddy: {
      ...success,
      drill_type: "caddy_routing_and_tls_verification",
      targetPath: args[0],
      securityHeadersVerified: true,
      s3SigV4HostPreserved: true,
      proxyHeadersVerified: true,
      routesPassed: 12,
      routesEvaluated: 12,
      domain: "launch.example.test",
      hstsApproved: args.includes("--allow-hsts"),
    },
    deployment: {
      ...success,
      drill_timestamp: now,
      caddyfile: val("--caddyfile"),
      compose_file: val("--compose-file"),
      schema_backward_compatible: true,
      caddy_routing_verified: true,
      rollback_procedure_verified: true,
      network_isolation_verified: true,
      migration_count: 1,
      caddy_routes_tested: 12,
      probe_live_tested: !args.includes("--dry-run"),
      dry_run: args.includes("--dry-run"),
      api_target_id: targetId(
        new URL(val("--api-url") || "http://localhost:3001").href,
      ),
    },
    volume: {
      ...success,
      drill_type: "production_volume_encryption_and_key_separation",
      totalRequiredMounts: 9,
      validMountsCount: 9,
      evaluatedMounts: Array.from({ length: 9 }, () => ({ passed: true })),
      keySeparation: {
        verified: true,
        detectedViolations: [],
        scannedPaths: [],
      },
    },
    rotation: {
      ...success,
      drill_type: "zero_downtime_secret_rotation_and_compromise_response",
      steps: Object.fromEntries(
        [
          "session_rollover",
          "csrf_rollover",
          "database_rotation",
          "valkey_rotation",
          "storage_rotation",
          "compromise_response",
          "redaction_audit",
        ].map((k) => [
          k,
          {
            status: "passed",
            raw_secrets_masked: true,
            zero_dev_passwords_detected: true,
          },
        ]),
      ),
    },
    capacity: {
      ...success,
      mode: "synthetic",
      durationMs: 0,
      alerts: {
        valid: true,
        errors: [],
        checks: [{ passed: true }],
        requiredRulesCount: REQUIRED_ALERTS.length,
        totalRulesCount: REQUIRED_ALERTS.length,
        alerts: REQUIRED_ALERTS.map((alert) => ({
          alert,
          valid: true,
          errors: [],
        })),
        simulations: REQUIRED_ALERTS.map((alert) => ({
          alert,
          passed: true,
          firesOnBreach: true,
          clearsOnNormal: true,
          ignoresOther4xx: true,
        })),
      },
      capacity: {
        mode: "synthetic",
        targets: DEFAULT_SLO_TARGETS,
        distribution,
        compliance: evaluateSloCompliance(distribution),
      },
      dosResilience: simulatedDos,
      failures: [],
      summary: {
        capacitySloCompliance: "passed",
        alertVerification: "passed",
        dosResilience: "passed",
        databaseBaselineCompliance: "passed",
      },
      databaseTelemetryBaseline: db,
    },
    restore: {
      ...success,
      drill_timestamp: now,
      duration_seconds: 1,
      rto_target_seconds: 900,
      rto_compliant: true,
      record_parity_verified: true,
      postgis_verified: true,
      foreign_keys_verified: true,
      tables_source: 3,
      tables_restored: 3,
      migrations_source: 1,
      migrations_restored: 1,
    },
    reconcile: {
      timestamp: now,
      summary: {
        status: "clean",
        exitCode: 0,
        totalDatabaseObjects: 1,
        totalBucketObjects: 1,
        matchedObjects: 1,
        missingObjects: 0,
        orphanObjects: 0,
        mismatchedObjects: 0,
      },
    },
  };
  if (key === "capacity" && args.includes("--target-url")) {
    reports.capacity.mode = "live";
    reports.capacity.targetId = targetId(new URL(val("--target-url")).href);
    reports.capacity.apiTargetId = targetId(
      new URL(val("--api-url") || "http://localhost:3001").origin,
    );
    delete reports.capacity.capacity.distribution.databaseLatency;
    Object.assign(reports.capacity.capacity, {
      mode: "live",
      targetUrl: reports.capacity.targetId,
    });
    Object.assign(simulatedDos, {
      mode: "live",
      apiTargetId: targetId(new URL(val("--api-url")).origin),
    });
    Object.assign(simulatedDos.layers.layer6_rate_limiter_burst, {
      passed: true,
      burstTestMode: "live",
      attemptedRequests: 15,
      throttledRequests: 5,
      authRejectedRequests: 10,
      preHealthPassed: true,
      csrfHandshakePassed: true,
      postHealthPassed: true,
    });
    Object.assign(db, {
      source: "prometheus-live-scrape",
      timestamp: now,
      probeHealthy: true,
      targetId: reports.capacity.targetId,
    });
  }
  const e = reports[key];
  const [selected, scenario] = (process.env.SCENARIO || "").split(":");
  if (selected === key) {
    if (scenario === "missing") process.exit(0);
    if (scenario === "malformed") {
      fs.writeFileSync(file, "{ private-secret");
      process.exit(0);
    }
    if (scenario === "oversized") {
      fs.writeFileSync(
        file,
        "x".repeat(
          key === "sbom"
            ? 16 * 1024 * 1024 + 1
            : key === "capacity"
              ? 65537
              : 1024 * 1024 + 1,
        ),
      );
      process.exit(0);
    }
    if (scenario === "symlink") {
      const other = file + ".other";
      fs.writeFileSync(other, JSON.stringify(e));
      fs.symlinkSync(other, file);
      process.exit(0);
    }
    if (scenario === "fifo") {
      require("node:child_process").execFileSync("mkfifo", [file]);
      process.exit(0);
    }
    if (
      scenario === "stale" ||
      scenario === "future" ||
      scenario === "calendar"
    ) {
      const time =
        scenario === "calendar"
          ? "2026-02-30T00:00:00.000Z"
          : new Date(
              Date.now() + (scenario === "stale" ? -120000 : 120000),
            ).toISOString();
      if (key === "sbom") e.metadata.timestamp = time;
      else if (["deployment", "restore"].includes(key))
        e.drill_timestamp = time;
      else e.timestamp = time;
    }
    if (scenario === "type") e.drill_type = "private-secret";
    if (scenario === "null-check") {
      if (key === "container") e.checks = [null];
      if (key === "volume") e.evaluatedMounts[0] = null;
    }
    if (scenario === "baseline") {
      if (key === "static") e.valid = false;
      if (key === "sbom") delete e.licenseCompliance;
      if (key === "sast") e.passed = false;
      if (key === "container") e.checks[0].passed = false;
      if (key === "caddy") e.securityHeadersVerified = false;
      if (key === "deployment") e.rollback_procedure_verified = false;
      if (key === "volume") e.keySeparation.verified = false;
      if (key === "rotation") e.steps.csrf_rollover.status = "failed";
      if (key === "capacity") e.summary.databaseBaselineCompliance = "failed";
      if (key === "restore") e.tables_restored = 2;
      if (key === "reconcile") e.summary.missingObjects = 1;
    }
    if (scenario === "nested-missing") {
      delete e.alerts;
      delete e.capacity;
      delete e.dosResilience;
    }
    if (scenario === "nested-alert") e.alerts.simulations[0].passed = false;
    if (scenario === "nested-capacity")
      e.capacity.distribution.latencyMs.p95 = 501;
    if (scenario === "nested-dos")
      e.dosResilience.layers.layer4_storage_bounds.passed = false;
    if (scenario === "nested-targets")
      e.capacity.targets = { ...e.capacity.targets, maxP95LatencyMs: 999 };
    if (scenario === "db-threshold")
      e.databaseTelemetryBaseline.poolAcquisitionLatency.api.p95Ms = 51;
    if (scenario === "db-private")
      e.databaseTelemetryBaseline.privateField = "private-secret";
    if (scenario === "summary-private") e.scannedFilesCount = "private-secret";
    if (scenario === "target") e.apiTargetId = "wrong";
    if (scenario === "legacy-api-hash")
      e.apiTargetId = targetId(new URL(val("--api-url")).href);
    if (scenario === "config") e.compose_file = "/missing";
    if (scenario === "contradictory") {
      e.status = "failed";
      e.valid = true;
    }
    if (scenario === "duplicate")
      fs.writeFileSync(file + ".duplicate.json", JSON.stringify(e));
    if (scenario === "delay") {
      fs.writeFileSync(process.env.MARKER, file);
      setTimeout(() => {
        fs.writeFileSync(file, JSON.stringify(e));
      }, 5000);
      return;
    }
    if (scenario === "publish-blocked") fs.mkdirSync(process.env.OUTPUT_DEST);
  }
  fs.writeFileSync(file, JSON.stringify(e));
  if (selected === key && scenario === "failed-exit") process.exit(1);
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-launch ' paths-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ops = path.join(dir, "scripts/ops");
  fs.mkdirSync(ops, { recursive: true });
  for (const file of [
    "run-launch-drills.sh",
    "assemble-launch-dossier.js",
    "launch-target-evidence.js",
    "verify-capacity-load.js",
    "verify-alert-rules.js",
  ])
    fs.copyFileSync(path.join(__dirname, file), path.join(ops, file));
  const yamlDir = path.join(dir, "node_modules/js-yaml");
  fs.mkdirSync(yamlDir, { recursive: true });
  // Only the pure alert-name export is used; parser execution is prohibited in fixtures.
  fs.writeFileSync(
    path.join(yamlDir, "index.js"),
    'module.exports={load(){throw Error("fixture parser prohibited")}};',
  );
  fs.copyFileSync(
    path.join(__dirname, "run-static-integrity-checks.js"),
    path.join(ops, "static-validator.js"),
  );
  fs.writeFileSync(
    path.join(ops, "stub.js"),
    `module.exports=${stub.toString()};`,
  );
  for (const [name, key] of Object.entries(children)) {
    const script = name.endsWith(".sh")
      ? `#!/usr/bin/env bash\nexec node "$(dirname "$0")/entry.js" ${key} "$@"\n`
      : `${key === "static" ? "module.exports=require('./static-validator');" : ""} if(require.main===module)require('./stub')('${key}',process.argv.slice(2));`;
    fs.writeFileSync(path.join(ops, name), script);
  }
  fs.writeFileSync(
    path.join(ops, "entry.js"),
    "require('./stub')(process.argv[2],process.argv.slice(3));",
  );
  fs.mkdirSync(path.join(dir, "infra/caddy"), { recursive: true });
  fs.mkdirSync(path.join(dir, "infra/compose"), { recursive: true });
  fs.writeFileSync(path.join(dir, "infra/caddy/Caddyfile.example"), "fixture");
  fs.writeFileSync(
    path.join(dir, "infra/compose/docker-compose.production.example.yml"),
    "fixture",
  );
  const log = path.join(dir, "child-calls.jsonl");
  const output = path.join(dir, "evidence/dossier.json");
  // Allow-list environment: no inherited service credentials, NODE_OPTIONS or test context.
  const env = (scenario) => ({
    PATH: process.env.PATH,
    TMPDIR: os.tmpdir(),
    SCENARIO: scenario || "",
    CHILD_LOG: log,
    MARKER: path.join(dir, "marker"),
    OUTPUT_DEST: output,
  });
  const run = (args = [], scenario = "") =>
    spawnSync("bash", [path.join(ops, "run-launch-drills.sh"), ...args], {
      cwd: dir,
      env: env(scenario),
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
    });
  const execute = (scenario = "", extra = []) => {
    const result = run(
      [
        "--dry-run",
        "--evidence-dir",
        path.dirname(output),
        "--output",
        output,
        ...extra,
      ],
      scenario,
    );
    assert.ifError(result.error);
    return {
      ...result,
      dossier:
        fs.existsSync(output) && fs.statSync(output).isFile()
          ? JSON.parse(fs.readFileSync(output))
          : null,
    };
  };
  return {
    dir,
    ops,
    log,
    output,
    env,
    run,
    execute,
    calls: () =>
      fs.existsSync(log)
        ? fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse)
        : [],
  };
}
function invariant(d) {
  assert.equal(d.total_stages, 7);
  assert.equal(
    d.passed_stages,
    d.stages.filter((s) => s.status === "PASSED").length,
  );
  assert.equal(d.failed_stages, 7 - d.passed_stages);
  assert.equal(d.overall_status, d.failed_stages ? "FAILED" : "PASSED");
  const keys = [
    "staticIntegrity",
    "supplyChainSecurity",
    "ingressDeployment",
    "volumeEncryption",
    "secretRotation",
    "capacityAlerting",
    "disasterRecovery",
  ];
  d.stages.forEach((s, i) =>
    assert.equal(
      d.summary[keys[i]],
      s.status
        .toLowerCase()
        .replace("passed", "passed")
        .replace("failed", "failed"),
    ),
  );
}

test("help and invalid inputs have zero child calls and no evidence side effects", (t) => {
  const f = fixture(t);
  for (const args of [["--help"], ["-h"]]) assert.equal(f.run(args).status, 0);
  for (const flag of [
    "--output",
    "--evidence-dir",
    "--caddyfile",
    "--compose-file",
    "--target-url",
    "--api-url",
    "--database-telemetry-file",
  ]) {
    for (const value of [null, "", "-x", "--json", "bad\nvalue"]) {
      const args = [flag];
      if (value !== null) args.push(value);
      assert.notEqual(f.run(args).status, 0);
    }
  }
  for (const args of [
    ["--unknown"],
    ["--dry-run", "--allow-hsts"],
    ["--target-url", "https://x.test/"],
    [
      "--target-url",
      "https://u:private-secret@x.test",
      "--api-url",
      "https://x.test",
    ],
  ]) {
    const result = f.run(args);
    assert.notEqual(result.status, 0);
    assert.ok(!result.stderr.includes("private-secret"));
  }
  assert.equal(f.calls().length, 0);
  assert.ok(!fs.existsSync(path.join(f.dir, "backups")));
});

test("full fixture publishes consistent private evidence, ordered calls and identical JSON", (t) => {
  const f = fixture(t);
  const r = f.execute("", ["--json"]);
  assert.equal(r.status, 0, r.stderr);
  invariant(r.dossier);
  assert.equal(r.dossier.environment, "drill");
  assert.equal(r.dossier.targets.mode, "offline");
  assert.deepEqual(
    f.calls().map((c) => c.key),
    Object.values(children),
  );
  const printed = JSON.parse(
    r.stdout.slice(r.stdout.indexOf("{"), r.stdout.lastIndexOf("}") + 1),
  );
  assert.deepEqual(printed, r.dossier);
  assert.equal(fs.statSync(f.output).mode & 0o777, 0o600);
  for (const s of r.dossier.stages) {
    assert.equal(fs.statSync(path.dirname(s.artifacts[0])).mode & 0o777, 0o700);
    for (const file of s.artifacts)
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  }
  assert.ok(
    f
      .calls()
      .find((c) => c.key === "rotation")
      .args.includes("--dry-run"),
  );
  assert.ok(
    f
      .calls()
      .find((c) => c.key === "reconcile")
      .args.includes("--dry-run"),
  );
  assert.ok(
    f
      .calls()
      .find((c) => c.key === "sbom")
      .args.includes("--verify-licenses"),
  );
  assert.ok(!fs.existsSync(f.output + ".lock"));
});

const stageFor = {
  static: 0,
  sbom: 1,
  sast: 1,
  container: 1,
  caddy: 2,
  deployment: 2,
  volume: 3,
  rotation: 4,
  capacity: 5,
  restore: 6,
  reconcile: 6,
};
for (const key of Object.values(children)) {
  test(`${key} baseline breach fails its stage and overall verdict`, (t) => {
    const r = fixture(t).execute(`${key}:baseline`);
    assert.equal(r.status, 1, r.stderr);
    invariant(r.dossier);
    assert.equal(r.dossier.stages[stageFor[key]].status, "FAILED");
  });
}
for (const scenario of [
  "missing",
  "malformed",
  "oversized",
  "symlink",
  "fifo",
  "stale",
  "future",
  "calendar",
  "type",
  "contradictory",
  "failed-exit",
]) {
  test(`zero exit invalid static receipt or failed process: ${scenario}`, (t) => {
    const r = fixture(t).execute(`static:${scenario}`);
    assert.equal(r.status, 1, r.stderr);
    invariant(r.dossier);
    assert.equal(r.dossier.staticIntegrityBaseline.status, "breached");
    assert.ok(!JSON.stringify(r.dossier).includes("private-secret"));
  });
}
for (const scenario of [
  "sbom:oversized",
  "capacity:oversized",
  "deployment:config",
  "restore:missing",
  "sast:contradictory",
  "sast:summary-private",
  "container:null-check",
  "volume:null-check",
  "capacity:db-threshold",
  "capacity:nested-missing",
  "capacity:nested-alert",
  "capacity:nested-capacity",
  "capacity:nested-dos",
  "capacity:nested-targets",
]) {
  test(`mandatory receipt rejects ${scenario}`, (t) => {
    const r = fixture(t).execute(scenario);
    assert.equal(r.status, 1, r.stderr);
    invariant(r.dossier);
  });
}
test("duplicate/unregistered files do not become receipts or artifacts", (t) => {
  const f = fixture(t);
  const r = f.execute("static:duplicate");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!JSON.stringify(r.dossier).includes("duplicate.json"));
});
test("default paths are unique and default mode fails synthetic capacity", (t) => {
  const f = fixture(t);
  const r = f.run();
  assert.equal(r.status, 1, r.stderr);
  const dossiers = fs
    .readdirSync(path.join(f.dir, "backups"))
    .filter((n) => n.startsWith("launch-evidence-dossier-"));
  assert.equal(dossiers.length, 1);
  const d = JSON.parse(
    fs.readFileSync(path.join(f.dir, "backups", dossiers[0])),
  );
  invariant(d);
  assert.equal(d.targets.mode, "default-drill");
  assert.equal(d.stages[5].status, "FAILED");
});
test("live fixture preserves target/config/HSTS forwarding and rejects wrong target", (t) => {
  const f = fixture(t);
  const caddy = path.join(f.dir, "production.Caddyfile");
  fs.writeFileSync(caddy, "fixture");
  const args = [
    "--output",
    f.output,
    "--evidence-dir",
    path.dirname(f.output),
    "--caddyfile",
    caddy,
    "--allow-hsts",
    "--target-url",
    "https://launch.example.test/path",
    "--api-url",
    "https://api.example.test",
    "--database-telemetry-file",
    path.join(f.dir, "telemetry"),
  ];
  const good = f.run(args);
  assert.equal(good.status, 0, good.stderr);
  for (const key of ["deployment", "capacity"])
    assert.ok(
      f
        .calls()
        .find((c) => c.key === key)
        .args.includes("--api-url"),
    );
  for (const scenario of ["capacity:target", "capacity:legacy-api-hash"]) {
    const bad = f.run(args, scenario);
    assert.equal(bad.status, 1, bad.stderr);
    const d = JSON.parse(fs.readFileSync(f.output));
    assert.equal(d.stages[5].status, "FAILED");
  }
});
test("production candidate remains fail-closed without explicit live ingress", (t) => {
  const f = fixture(t),
    caddy = path.join(f.dir, "production.Caddyfile");
  fs.writeFileSync(caddy, "fixture");
  const r = f.execute("", ["--caddyfile", caddy]);
  assert.equal(r.status, 1);
  assert.equal(r.dossier.stages[2].status, "FAILED");
});

function asynchronous(f, args, scenario = "") {
  const child = spawn(
    "bash",
    [path.join(f.ops, "run-launch-drills.sh"), ...args],
    { cwd: f.dir, env: f.env(scenario), detached: true },
  );
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (data) => {
    stdout += data;
  });
  child.stderr.on("data", (data) => {
    stderr += data;
  });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status, signal) =>
      resolve({ status, signal, stdout, stderr }),
    );
  });
  return { child, done };
}
async function marker(file) {
  for (let i = 0; i < 200; i++) {
    if (fs.existsSync(file)) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error("fixture marker timeout");
}
test("concurrent default runs share parent but never consume or delete unrelated evidence", async (t) => {
  const f = fixture(t),
    parent = path.join(f.dir, "shared");
  fs.mkdirSync(parent);
  const unrelated = path.join(
    parent,
    "static-integrity-evidence-unrelated.json",
  );
  fs.writeFileSync(unrelated, '{"status":"success"}');
  const a = asynchronous(f, ["--dry-run", "--evidence-dir", parent]);
  const b = asynchronous(f, ["--dry-run", "--evidence-dir", parent]);
  const later = path.join(parent, "launch-drill-stage-static_templates.log");
  fs.writeFileSync(later, "unrelated");
  for (const r of await Promise.all([a.done, b.done]))
    assert.equal(r.status, 0, r.stderr);
  const names = fs
    .readdirSync(parent)
    .filter((n) => n.startsWith("launch-evidence-dossier-"));
  assert.equal(names.length, 2);
  const [x, y] = names.map((n) =>
    JSON.parse(fs.readFileSync(path.join(parent, n))),
  );
  const paths = new Set(x.stages.flatMap((s) => s.artifacts));
  assert.ok(y.stages.flatMap((s) => s.artifacts).every((p) => !paths.has(p)));
  assert.equal(fs.readFileSync(later, "utf8"), "unrelated");
  assert.equal(fs.readFileSync(unrelated, "utf8"), '{"status":"success"}');
  assert.ok(!JSON.stringify([x, y]).includes("unrelated"));
});
test("explicit output rejects second writer; interruption removes old success and owned lock", async (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.dirname(f.output));
  fs.writeFileSync(f.output, '{"overall_status":"PASSED"}');
  const args = [
    "--dry-run",
    "--output",
    f.output,
    "--evidence-dir",
    path.dirname(f.output),
  ];
  const a = asynchronous(f, args, "static:delay");
  await marker(path.join(f.dir, "marker"));
  assert.ok(!fs.existsSync(f.output));
  const before = f.calls().length;
  const b = f.run(args);
  assert.equal(b.status, 1);
  assert.equal(f.calls().length, before);
  assert.ok(fs.existsSync(f.output + ".lock"));
  a.child.kill("SIGTERM");
  const result = await a.done;
  assert.equal(result.status, 143);
  assert.ok(!fs.existsSync(f.output));
  assert.ok(!fs.existsSync(f.output + ".lock"));
  assert.ok(
    fs
      .readdirSync(path.dirname(f.output))
      .every((name) => !name.startsWith(".launch-dossier-")),
  );
  assert.ok(
    fs.existsSync(
      path.dirname(fs.readFileSync(path.join(f.dir, "marker"), "utf8")),
    ),
  );
});
test("nonregular output and symlink evidence destinations reject before child calls", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.dirname(f.output));
  fs.mkdirSync(f.output);
  assert.equal(f.execute().status, 1);
  assert.equal(f.calls().length, 0);
  fs.rmdirSync(f.output);
  fs.symlinkSync(path.join(f.dir, "missing"), f.output);
  assert.equal(f.execute().status, 1);
  assert.equal(f.calls().length, 0);
  fs.unlinkSync(f.output);
  fs.symlinkSync(path.dirname(f.output), path.join(f.dir, "link"));
  assert.equal(f.run(["--evidence-dir", path.join(f.dir, "link")]).status, 1);
  assert.equal(f.calls().length, 0);
});
test("publication rename failure exits nonzero and leaves no temporary dossier or lock", (t) => {
  const f = fixture(t),
    r = f.execute("reconcile:publish-blocked");
  assert.equal(r.status, 1);
  assert.equal(r.dossier, null);
  assert.ok(!fs.existsSync(f.output + ".lock"));
  assert.ok(
    fs
      .readdirSync(path.dirname(f.output))
      .every((n) => !n.startsWith(".launch-dossier-")),
  );
});

test("unknown database metadata is excluded from a validated dossier", (t) => {
  const r = fixture(t).execute("capacity:db-private");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!JSON.stringify(r.dossier).includes("private-secret"));
});

test("live missing Caddy receipt publishes a complete failed dossier", (t) => {
  const f = fixture(t),
    caddy = path.join(f.dir, "production.Caddyfile");
  fs.writeFileSync(caddy, "fixture");
  const r = f.run(
    [
      "--output",
      f.output,
      "--evidence-dir",
      path.dirname(f.output),
      "--caddyfile",
      caddy,
      "--allow-hsts",
      "--target-url",
      "https://launch.example.test/path",
      "--api-url",
      "https://api.example.test",
    ],
    "caddy:missing",
  );
  assert.equal(r.status, 1);
  const d = JSON.parse(fs.readFileSync(f.output));
  invariant(d);
  assert.equal(d.stages[2].status, "FAILED");
});

test("custom output is exact even without a JSON extension", (t) => {
  const f = fixture(t),
    output = path.join(f.dir, "custom.receipt");
  const r = f.run(["--dry-run", "--output", output, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const d = JSON.parse(fs.readFileSync(output));
  invariant(d);
  assert.equal(d.overall_status, "PASSED");
});
