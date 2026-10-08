const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync, spawn } = require("node:child_process");

function liveTelemetry(target, timestamp = new Date().toISOString()) {
  const { targetId } = require("./launch-target-evidence");
  const pool = {
    totalConnections: 2,
    idleConnections: 1,
    maxConnections: 10,
    requestsWaiting: 0,
  };
  const latency = { p50Ms: 1, p95Ms: 2, p99Ms: 3 };
  return {
    source: "prometheus-live-scrape",
    targetId: targetId(new URL(target).href),
    timestamp,
    probeHealthy: true,
    postgresExporter: { up: 1, lastScrapeError: 0 },
    postgresServer: { pgUp: 1, maxConnections: 100, activeConnections: 2 },
    connectionPool: { api: { ...pool }, worker: { ...pool } },
    poolAcquisitionLatency: { api: { ...latency }, worker: { ...latency } },
    queryExecutionDuration: { api: { ...latency }, worker: { ...latency } },
    serverActivity: { lockWaits: 0, maxTransactionDurationSec: 0 },
  };
}

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
      execution_mode: "simulation",
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
      execution_mode: "simulation",
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
      execution_mode: "simulation",
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
      execution_mode: "simulation",
      dry_run: true,
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
      execution_mode: "simulation",
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
      execution_mode: "simulation",
      drill_type: "disaster_recovery_restore",
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
      execution_mode: "simulation",
      drill_type: "storage_reconciliation",
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
    reports.capacity.execution_mode = "live";
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
    if (scenario === "legacy-mode") delete e.execution_mode;
    if (scenario === "live-mode") e.execution_mode = "live";
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
    if (scenario === "leader-exits") {
      fs.writeFileSync(file, JSON.stringify(e));
      const descendant = require("node:child_process").spawn(
        process.execPath,
        [
          "-e",
          "process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000);",
        ],
        { stdio: ["ignore", "ignore", "ignore", "ipc"] },
      );
      descendant.once("message", () => {
        fs.writeFileSync(
          process.env.MARKER,
          JSON.stringify({
            pid: process.pid,
            descendant: descendant.pid,
            file,
          }),
        );
        descendant.disconnect();
        descendant.unref();
      });
      return;
    }
    if (["hold", "stop", "nested", "resist"].includes(scenario)) {
      let descendant;
      if (scenario === "nested" || scenario === "resist") {
        descendant = require("node:child_process").spawn(
          process.execPath,
          ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);"],
          { stdio: "ignore" },
        );
      }
      if (scenario === "resist") process.on("SIGTERM", () => {});
      fs.writeFileSync(
        process.env.MARKER,
        JSON.stringify({ pid: process.pid, descendant: descendant?.pid, file }),
      );
      setInterval(() => {}, 1000);
      if (scenario === "stop") process.kill(process.pid, "SIGSTOP");
      return;
    }
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
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  for (const tool of [
    "bash",
    "dirname",
    "date",
    "mkdir",
    "mktemp",
    "sleep",
    "cat",
    "rm",
    "mkfifo",
  ])
    fs.symlinkSync(`/usr/bin/${tool}`, path.join(bin, tool));
  fs.symlinkSync(process.execPath, path.join(bin, "node"));
  const env = (scenario) => ({
    PATH: bin,
    TMPDIR: os.tmpdir(),
    SCENARIO: scenario || "",
    CHILD_LOG: log,
    MARKER: path.join(dir, "marker"),
    OUTPUT_DEST: output,
  });
  const run = (args = [], scenario = "", options = {}) =>
    spawnSync("bash", [path.join(ops, "run-launch-drills.sh"), ...args], {
      cwd: options.cwd || dir,
      env: { ...env(scenario), ...(options.env || {}) },
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
    bin,
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
  assert.equal(r.dossier.secretRotationBaseline.status, "verified");
  assert.equal(r.dossier.summary.secretRotationCompliance, "passed");
  assert.equal(r.dossier.targets.mode, "offline");
  assert.equal(r.dossier.execution_mode, "simulation");
  assert.equal(r.dossier.volumeEncryptionBaseline.status, "verified");
  assert.equal(
    r.dossier.volumeEncryptionBaseline.volumePreflight,
    "simulation",
  );
  assert.equal(r.dossier.summary.volumeEncryptionCompliance, "passed");
  assert.equal(r.dossier.summary.volumePreflight, "simulation");
  assert.equal(
    r.dossier.deploymentBaseline.caddyRoutingPreflight,
    "simulation",
  );
  assert.equal(r.dossier.summary.caddyRoutingPreflight, "simulation");
  assert.equal(r.dossier.deploymentBaseline.deploymentPreflight, "simulation");
  assert.equal(r.dossier.summary.deploymentPreflight, "simulation");
  assert.equal(
    r.dossier.secretRotationBaseline.rotationPreflight,
    "simulation",
  );
  assert.equal(r.dossier.summary.rotationPreflight, "simulation");
  assert.equal(
    r.dossier.disasterRecoveryBaseline.restorePreflight,
    "simulation",
  );
  assert.equal(
    r.dossier.disasterRecoveryBaseline.reconciliationPreflight,
    "simulation",
  );
  assert.equal(
    r.dossier.databaseTelemetryBaseline.capacityPreflight,
    "simulation",
  );
  assert.equal(r.dossier.summary.restorePreflight, "simulation");
  assert.equal(r.dossier.summary.reconcilePreflight, "simulation");
  assert.equal(r.dossier.summary.reconciliationPreflight, "simulation");
  assert.equal(r.dossier.summary.capacityPreflight, "simulation");
  const caddyChild = JSON.parse(
    fs.readFileSync(
      r.dossier.stages[2].artifacts.find((file) =>
        file.endsWith("caddy-routing-evidence-receipt.json"),
      ),
    ),
  );
  assert.equal(caddyChild.execution_mode, "simulation");
  const deploymentChild = JSON.parse(
    fs.readFileSync(
      r.dossier.stages[2].artifacts.find((file) =>
        file.endsWith("deployment-drill-evidence-receipt.json"),
      ),
    ),
  );
  assert.equal(deploymentChild.execution_mode, "simulation");
  const volumeChild = JSON.parse(
    fs.readFileSync(
      r.dossier.stages[3].artifacts.find((file) =>
        file.endsWith("volume-encryption-evidence-receipt.json"),
      ),
    ),
  );
  assert.equal(volumeChild.execution_mode, "simulation");
  const rotationChild = JSON.parse(
    fs.readFileSync(
      r.dossier.stages[4].artifacts.find((file) =>
        file.endsWith("secret-rotation-evidence-receipt.json"),
      ),
    ),
  );
  assert.equal(rotationChild.execution_mode, "simulation");
  const capacityChild = JSON.parse(
    fs.readFileSync(
      r.dossier.stages[5].artifacts.find((file) =>
        file.endsWith("capacity-alerting-drill-evidence-receipt.json"),
      ),
    ),
  );
  assert.equal(capacityChild.execution_mode, "simulation");
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
  "deployment:legacy-mode",
  "deployment:live-mode",
  "restore:missing",
  "sast:contradictory",
  "sast:summary-private",
  "container:null-check",
  "caddy:legacy-mode",
  "caddy:live-mode",
  "volume:null-check",
  "volume:legacy-mode",
  "volume:live-mode",
  "rotation:legacy-mode",
  "rotation:live-mode",
  "capacity:legacy-mode",
  "capacity:live-mode",
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
  fs.writeFileSync(
    path.join(f.dir, "telemetry"),
    JSON.stringify(liveTelemetry("https://launch.example.test/path")),
  );
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
  const goodDossier = JSON.parse(fs.readFileSync(f.output));
  assert.equal(goodDossier.databaseTelemetryBaseline.capacityPreflight, "live");
  assert.equal(goodDossier.summary.capacityPreflight, "live");
  for (const key of ["deployment", "capacity"])
    assert.ok(
      f
        .calls()
        .find((c) => c.key === key)
        .args.includes("--api-url"),
    );
  for (const scenario of ["capacity:target", "capacity:legacy-api-hash"]) {
    const destination = path.join(f.dir, `${scenario.replace(":", "-")}.json`);
    const badArgs = [...args];
    badArgs[1] = destination;
    const bad = f.run(badArgs, scenario);
    assert.equal(bad.status, 1, bad.stderr);
    const d = JSON.parse(fs.readFileSync(destination));
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
test("explicit output rejects second writer; interruption releases owned lock without publishing", async (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.dirname(f.output));
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
test("publication exclusive-link failure exits nonzero and leaves no temporary dossier or lock", (t) => {
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
  fs.writeFileSync(
    path.join(f.dir, "telemetry"),
    JSON.stringify(liveTelemetry("https://launch.example.test/path")),
  );
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
      "--database-telemetry-file",
      path.join(f.dir, "telemetry"),
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

const valueFlags = [
  "--output",
  "--evidence-dir",
  "--caddyfile",
  "--compose-file",
  "--target-url",
  "--api-url",
  "--database-telemetry-file",
];
for (const flag of valueFlags) {
  test(`strict separate/attached arguments reject duplicates and blanks for ${flag}`, (t) => {
    const f = fixture(t);
    for (const args of [
      [`${flag}=`],
      [`${flag}=   `],
      [`${flag}=x\x7fcanary`],
      [flag, " \t "],
      [flag, "x", flag, "y"],
      [`${flag}=x`, `${flag}=y`],
      [flag, "x", `${flag}=y`],
      [`${flag}=x`, flag, "y"],
    ]) {
      const result = f.run(args);
      assert.notEqual(result.status, 0);
      assert.ok(
        !result.stdout.includes("canary") && !result.stderr.includes("canary"),
      );
    }
    assert.deepEqual(f.calls(), []);
    assert.ok(!fs.existsSync(path.join(f.dir, "backups")));
  });
}

test("attached path options, dash-leading paths and different caller cwd preserve installation-root semantics", (t) => {
  const f = fixture(t),
    caller = path.join(f.dir, "caller");
  fs.mkdirSync(caller);
  const result = f.run(
    [
      "--dry-run",
      "--json",
      "--verbose",
      "--output=-receipt.json",
      "--evidence-dir=-stage-evidence",
      "--caddyfile=infra/caddy/Caddyfile.example",
      "--compose-file=infra/compose/docker-compose.production.example.yml",
    ],
    "",
    { cwd: caller },
  );
  assert.equal(result.status, 0, result.stderr);
  const output = path.join(f.dir, "-receipt.json");
  invariant(JSON.parse(fs.readFileSync(output)));
  assert.ok(!fs.existsSync(path.join(caller, "-receipt.json")));
  assert.ok(fs.existsSync(path.join(f.dir, "-stage-evidence")));
  assert.match(result.stdout, /Running stage static_templates/);
});

for (const kind of ["file", "directory", "symlink", "dangling"]) {
  test(`retained ${kind} prevents children and preserves all evidence`, (t) => {
    const f = fixture(t);
    fs.mkdirSync(path.dirname(f.output));
    if (kind === "file")
      fs.writeFileSync(
        f.output,
        '{"overall_status":"PASSED","canary":"retained"}',
      );
    if (kind === "directory") fs.mkdirSync(f.output);
    if (kind === "symlink" || kind === "dangling") {
      const target = path.join(f.dir, "target");
      if (kind === "symlink") fs.writeFileSync(target, "retained");
      fs.symlinkSync(target, f.output);
    }
    const before = fs.lstatSync(f.output);
    const result = f.run([
      "--dry-run",
      "--output",
      f.output,
      "--evidence-dir=unused",
    ]);
    assert.equal(result.status, 1);
    assert.equal(fs.lstatSync(f.output).ino, before.ino);
    assert.equal(f.calls().length, 0);
    assert.ok(!fs.existsSync(path.join(f.dir, "unused")));
    assert.ok(!fs.existsSync(f.output + ".lock"));
    assert.ok(!result.stdout.includes("Overall Result: PASSED"));
  });
}

for (const kind of [
  "trailing",
  "non-directory",
  "symlink-parent",
  "dangling-parent",
  "invalid-evidence-dir",
]) {
  test(`invalid output parents reject before any creation: ${kind}`, (t) => {
    const f = fixture(t),
      parent = path.join(f.dir, "parent");
    let output = path.join(parent, "out"),
      evidence = path.join(f.dir, "unused");
    if (kind === "trailing") output += "/";
    if (kind === "non-directory") fs.writeFileSync(parent, "canary");
    if (kind === "symlink-parent") fs.symlinkSync(f.dir, parent);
    if (kind === "dangling-parent")
      fs.symlinkSync(path.join(f.dir, "missing"), parent);
    if (kind === "invalid-evidence-dir") {
      fs.writeFileSync(parent, "canary");
      evidence = parent;
    }
    assert.equal(
      f.run(["--dry-run", "--output", output, "--evidence-dir", evidence])
        .status,
      1,
    );
    assert.equal(f.calls().length, 0);
    assert.ok(!fs.existsSync(path.join(f.dir, "unused")));
  });
}

test("private creation preserves existing output/evidence directory permissions and retains logs with explicit output", (t) => {
  const f = fixture(t),
    evidence = path.join(f.dir, "logs"),
    outputDir = path.dirname(f.output);
  fs.mkdirSync(evidence, { mode: 0o755 });
  fs.mkdirSync(outputDir, { mode: 0o750 });
  const r = f.run([
    "--dry-run",
    "--output",
    f.output,
    "--evidence-dir",
    evidence,
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.statSync(evidence).mode & 0o777, 0o755);
  assert.equal(fs.statSync(outputDir).mode & 0o777, 0o750);
  assert.equal(fs.statSync(f.output).mode & 0o777, 0o600);
  const run = fs
    .readdirSync(evidence)
    .find((n) => n.startsWith("launch-drill-run-"));
  assert.equal(fs.statSync(path.join(evidence, run)).mode & 0o777, 0o700);
  assert.ok(!fs.existsSync(path.join(evidence, run, ".dossier-view.json")));
  assert.ok(
    fs.existsSync(
      path.join(
        evidence,
        run,
        "static_templates",
        "launch-drill-stage-static_templates.log",
      ),
    ),
  );
});

for (const tool of ["node", "date", "mkdir", "mktemp", "sleep", "cat", "rm"]) {
  test(`missing ${tool} fails before children or evidence`, (t) => {
    const f = fixture(t);
    fs.unlinkSync(path.join(f.bin, tool));
    assert.notEqual(f.run(["--dry-run"]).status, 0);
    assert.equal(f.calls().length, 0);
    assert.ok(!fs.existsSync(path.join(f.dir, "backups")));
  });
}
for (const file of [
  "assemble-launch-dossier.js",
  "run-restore-drill.sh",
  "verify-volume-encryption.js",
  "run-capacity-alerting-drill.sh",
]) {
  test(`missing installed ${file} fails before stages`, (t) => {
    const f = fixture(t);
    fs.unlinkSync(path.join(f.ops, file));
    assert.equal(f.run(["--dry-run"]).status, 1);
    assert.equal(f.calls().length, 0);
    assert.ok(!fs.existsSync(path.join(f.dir, "backups")));
  });
}

function liveArgs(f, changes = {}) {
  const target = changes.target || "https://launch.example.test/path",
    api = changes.api || "https://api.example.test";
  const telemetryFile = path.join(f.dir, "live-telemetry.json"),
    caddy = path.join(f.dir, "production.Caddyfile");
  fs.writeFileSync(caddy, "fixture");
  fs.writeFileSync(
    telemetryFile,
    JSON.stringify(changes.telemetry || liveTelemetry(target)),
  );
  return [
    "--target-url=" + target,
    "--api-url=" + api,
    "--database-telemetry-file=" + telemetryFile,
    "--caddyfile=" + caddy,
    "--allow-hsts",
    "--output=" + f.output,
    "--evidence-dir=" + path.dirname(f.output),
  ];
}
for (const scenario of [
  "missing",
  "malformed",
  "oversized",
  "primitive",
  "stale",
  "future",
  "target",
  "exporter",
  "database",
  "latency",
]) {
  test(`invalid live telemetry ${scenario} prevents earlier probes and all stages`, (t) => {
    const f = fixture(t),
      args = liveArgs(f),
      file = path.join(f.dir, "live-telemetry.json");
    const telemetry = liveTelemetry("https://launch.example.test/path");
    if (scenario === "stale")
      telemetry.timestamp = new Date(Date.now() - 120000).toISOString();
    if (scenario === "future")
      telemetry.timestamp = new Date(Date.now() + 120000).toISOString();
    if (scenario === "target") telemetry.targetId = "wrong-private-canary";
    if (scenario === "exporter") telemetry.postgresExporter.up = 0;
    if (scenario === "database") telemetry.postgresServer.pgUp = 0;
    if (scenario === "latency")
      telemetry.queryExecutionDuration.api.p95Ms = 101;
    fs.writeFileSync(
      file,
      scenario === "malformed"
        ? "{private-canary"
        : scenario === "oversized"
          ? "x".repeat(65537)
          : scenario === "primitive"
            ? "null"
            : JSON.stringify(telemetry),
    );
    if (scenario === "missing") fs.unlinkSync(file);
    const result = f.run(args);
    assert.equal(result.status, 1);
    assert.equal(f.calls().length, 0);
    assert.ok(!fs.existsSync(path.dirname(f.output)));
    assert.ok(!result.stderr.includes("private-canary"));
  });
}

for (const target of [
  "https://launch.example.test/path?",
  "https://launch.example.test/path#",
  "https://user:private-canary@launch.example.test",
  "ftp://launch.example.test",
  "https://launch.example.test:65536",
]) {
  test(`bad benchmark URL rejects before stages: ${target}`, (t) => {
    const f = fixture(t),
      args = liveArgs(f);
    args[0] = "--target-url=" + target;
    const result = f.run(args);
    assert.equal(result.status, 1);
    assert.equal(f.calls().length, 0);
    assert.ok(!result.stderr.includes("private-canary"));
  });
}
for (const api of [
  "https://api.example.test/path",
  "https://api.example.test?",
  "https://api.example.test#",
  "https://user:private-canary@api.example.test",
  "https://api.example.test:65536",
]) {
  test(`bad API origin rejects before stages: ${api}`, (t) => {
    const f = fixture(t),
      args = liveArgs(f);
    args[1] = "--api-url=" + api;
    assert.equal(f.run(args).status, 1);
    assert.equal(f.calls().length, 0);
  });
}

test("canonical benchmark href and API origin are forwarded with their existing different hashes", (t) => {
  const f = fixture(t),
    args = liveArgs(f, {
      target: "https://LAUNCH.example.test:443/path",
      api: "https://API.example.test:443/",
    });
  const result = f.run(args);
  assert.equal(result.status, 0, result.stderr);
  const calls = f.calls(),
    capacity = calls.find((c) => c.key === "capacity"),
    deployment = calls.find((c) => c.key === "deployment");
  assert.equal(
    capacity.args[capacity.args.indexOf("--target-url") + 1],
    "https://launch.example.test/path",
  );
  assert.equal(
    capacity.args[capacity.args.indexOf("--api-url") + 1],
    "https://api.example.test",
  );
  const { targetId } = require("./launch-target-evidence");
  const report = JSON.parse(fs.readFileSync(capacity.file));
  assert.equal(report.targetId, targetId("https://launch.example.test/path"));
  assert.equal(report.apiTargetId, targetId("https://api.example.test"));
  assert.equal(
    JSON.parse(fs.readFileSync(deployment.file)).api_target_id,
    targetId("https://api.example.test/"),
  );
});

function injectAssembler(f, condition) {
  const file = path.join(f.ops, "assemble-launch-dossier.js");
  const original = fs.readFileSync(file, "utf8");
  const entry =
    "if (require.main === module) process.exitCode = main(process.argv.slice(2));";
  assert.ok(original.includes(entry));
  fs.writeFileSync(
    file,
    original.replace(
      entry,
      `if (require.main === module) {${condition};process.exitCode = main(process.argv.slice(2));}`,
    ),
  );
}
for (const json of ["", "{}", '{"overall_status":"PASSED"}', "{"]) {
  test(`empty/incomplete success-exit assembler output cannot publish or print pass: ${JSON.stringify(json)}`, (t) => {
    const f = fixture(t);
    injectAssembler(
      f,
      `if(process.argv[2]==='assemble'){process.stdout.write(${JSON.stringify(json)});process.exit(0)}`,
    );
    const result = f.execute();
    assert.equal(result.status, 1);
    assert.equal(result.dossier, null);
    assert.ok(!result.stdout.includes("Overall Result: PASSED"));
    assert.ok(!fs.existsSync(f.output + ".lock"));
  });
}

test("prepare failure after reservation cleans owned temp and lock without starting children", (t) => {
  const f = fixture(t);
  injectAssembler(
    f,
    "if(process.argv[2]==='prepare'){main(process.argv.slice(2));process.exit(1)}",
  );
  const result = f.execute();
  assert.equal(result.status, 1);
  assert.equal(f.calls().length, 0);
  assert.ok(!fs.existsSync(f.output + ".lock"));
  assert.ok(
    fs
      .readdirSync(path.dirname(f.output))
      .every((n) => !n.startsWith(".launch-dossier-")),
  );
});

test("owned cleanup failure prevents passing summary and preserves diagnostic run tree", (t) => {
  const f = fixture(t);
  injectAssembler(f, "if(process.argv[2]==='release'){process.exit(1)}");
  const result = f.execute();
  assert.equal(result.status, 1);
  assert.ok(!result.stdout.includes("Overall Result: PASSED"));
  assert.ok(fs.existsSync(f.output + ".lock"));
  assert.ok(fs.existsSync(result.dossier.stages[0].artifacts[0]));
});

for (const kind of ["file", "directory", "symlink", "dangling"]) {
  test(`publication race preserves competing ${kind} without printing success`, (t) => {
    const f = fixture(t);
    const insertion =
      kind === "file"
        ? "fs.writeFileSync(process.argv[3], 'concurrent-canary', {flag:'wx'})"
        : kind === "directory"
          ? "fs.mkdirSync(process.argv[3])"
          : `fs.symlinkSync(${kind === "symlink" ? "process.env.CHILD_LOG" : "process.argv[3]+'.missing'"}, process.argv[3])`;
    injectAssembler(f, `if(process.argv[2]==='assemble'){${insertion}}`);
    const result = f.run([
      "--dry-run",
      "--output",
      f.output,
      "--evidence-dir",
      path.dirname(f.output),
    ]);
    assert.equal(result.status, 1);
    assert.ok(!result.stdout.includes("Overall Result: PASSED"));
    assert.ok(!fs.existsSync(f.output + ".lock"));
    if (kind === "file")
      assert.equal(fs.readFileSync(f.output, "utf8"), "concurrent-canary");
    if (kind === "directory") assert.ok(fs.lstatSync(f.output).isDirectory());
    if (kind === "symlink" || kind === "dangling")
      assert.ok(fs.lstatSync(f.output).isSymbolicLink());
  });
}

function processAlive(pid) {
  try {
    // Zombies are terminated and cannot perform any more work; the host reaps them.
    const status = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return status.slice(status.lastIndexOf(")") + 2).split(" ")[0] !== "Z";
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
test("leader exit cannot pass while an owned descendant continues running", async (t) => {
  const f = fixture(t);
  // The next stage records the descendant's state at its own start, proving
  // termination precedes further work rather than merely happening at exit.
  const child = path.join(f.ops, "generate-sbom.js");
  fs.writeFileSync(
    child,
    `const fs=require('node:fs');const m=JSON.parse(fs.readFileSync(process.env.MARKER));let active=false;try{const s=fs.readFileSync('/proc/'+m.descendant+'/stat','utf8');active=s.slice(s.lastIndexOf(')')+2).split(' ')[0]!=='Z';}catch(e){if(e.code!=='ENOENT')throw e;}fs.writeFileSync(process.env.MARKER+'.next',JSON.stringify({active}));require('./stub')('sbom',process.argv.slice(2));`,
  );
  const run = asynchronous(
    f,
    [
      "--dry-run",
      "--output",
      f.output,
      "--evidence-dir",
      path.dirname(f.output),
    ],
    "static:leader-exits",
  );
  let marked;
  t.after(() => {
    if (processAlive(run.child.pid)) run.child.kill("SIGKILL");
    for (const pid of [marked?.pid, marked?.descendant])
      if (pid && processAlive(pid)) process.kill(pid, "SIGKILL");
  });
  await marker(path.join(f.dir, "marker"));
  marked = JSON.parse(fs.readFileSync(path.join(f.dir, "marker")));
  const result = await run.done;
  assert.equal(result.status, 1, result.stderr);
  assert.ok(!processAlive(marked.descendant));
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.dir, "marker.next"))).active,
    false,
  );
  assert.equal(f.calls().length, 11);
  const dossier = JSON.parse(fs.readFileSync(f.output));
  assert.equal(dossier.overall_status, "FAILED");
  assert.equal(dossier.stages[0].status, "FAILED");
  assert.ok(!fs.existsSync(f.output + ".lock"));
  assert.ok(!result.stdout.includes("Overall Result: PASSED"));
});

for (const suffix of ["", "/nested", "/nested/deeper"]) {
  test(`conflicting output/evidence directories reject before allocation: ${suffix}`, (t) => {
    const f = fixture(t),
      output = path.join(f.dir, "absent");
    const result = f.run([
      "--dry-run",
      "--output",
      output,
      "--evidence-dir",
      output + suffix,
    ]);
    assert.equal(result.status, 1);
    assert.equal(f.calls().length, 0);
    assert.ok(!fs.existsSync(output));
    assert.ok(!fs.existsSync(output + ".lock"));
  });
}

for (const [scenario, signal, code] of [
  ["hold", "SIGINT", 130],
  ["hold", "SIGTERM", 143],
  ["hold", "SIGHUP", 129],
  ["stop", "SIGTERM", 143],
  ["nested", "SIGTERM", 143],
  ["resist", "SIGTERM", 143],
]) {
  test(`catchable ${signal} stops owned ${scenario} stage before release and preserves logs`, async (t) => {
    const f = fixture(t);
    const run = asynchronous(
      f,
      [
        "--dry-run",
        "--output",
        f.output,
        "--evidence-dir",
        path.dirname(f.output),
      ],
      `static:${scenario}`,
    );
    let marked;
    t.after(() => {
      if (processAlive(run.child.pid)) run.child.kill("SIGKILL");
      for (const pid of [marked?.pid, marked?.descendant])
        if (pid && processAlive(pid)) process.kill(pid, "SIGKILL");
    });
    await marker(path.join(f.dir, "marker"));
    marked = JSON.parse(fs.readFileSync(path.join(f.dir, "marker")));
    if (scenario === "stop") {
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(
        f.calls().length,
        1,
        "stopped job must not start later stages",
      );
      assert.ok(fs.existsSync(f.output + ".lock"));
    }
    run.child.kill(signal);
    const result = await run.done;
    assert.equal(result.status, code, result.stderr);
    assert.equal(f.calls().length, 1);
    assert.ok(!processAlive(marked.pid));
    if (marked.descendant) assert.ok(!processAlive(marked.descendant));
    assert.ok(!fs.existsSync(f.output));
    assert.ok(!fs.existsSync(f.output + ".lock"));
    assert.ok(fs.existsSync(path.dirname(marked.file)));
    assert.ok(
      fs
        .readdirSync(path.dirname(f.output))
        .every((n) => !n.startsWith(".launch-dossier-")),
    );
    assert.ok(!result.stdout.includes("Overall Result: PASSED"));
  });
}

for (const kind of ["invalid-clock", "missing-helper-export"]) {
  test(`preflight ${kind} fails before output resources or stages`, (t) => {
    const f = fixture(t);
    if (kind === "invalid-clock") {
      const tool = path.join(f.bin, "date");
      fs.unlinkSync(tool);
      fs.writeFileSync(
        tool,
        '#!/usr/bin/env bash\nprintf "invalid-clock\\n"\n',
        { mode: 0o700 },
      );
    } else {
      fs.appendFileSync(
        path.join(f.ops, "assemble-launch-dossier.js"),
        "\nmodule.exports.validateDossier = undefined;\n",
      );
    }
    const result = f.run(["--dry-run"]);
    assert.equal(result.status, 1);
    assert.equal(f.calls().length, 0);
    assert.ok(!fs.existsSync(path.join(f.dir, "backups")));
  });
}

for (const failStatic of ["", "docker_runtime"]) {
  test(`actual isolated static producer integrates with Stage 1: ${failStatic || "passed"}`, (t) => {
    const f = fixture(t);
    fs.copyFileSync(
      path.join(__dirname, "run-static-integrity-checks.js"),
      path.join(f.ops, "run-static-integrity-checks.js"),
    );
    const {
      CHECKS,
      validateStaticEvidence,
    } = require("./run-static-integrity-checks");
    const { validCaddyStaticEvidence } = require("./check-launch-readiness");
    const staticLog = path.join(f.dir, "static-calls");
    for (const { id, script } of CHECKS) {
      fs.writeFileSync(
        path.join(f.dir, script),
        `printf '%s|%s\\n' '${id}' "$PWD" >> "$STATIC_LOG"
printf 'private-static-canary\\n' >&2
[[ "$FAIL_STATIC" == '${id}' ]] && exit 7
exit 0
`,
      );
    }
    const r = f.run(
      [
        "--dry-run",
        "--evidence-dir",
        path.dirname(f.output),
        "--output",
        f.output,
      ],
      "",
      {
        env: { STATIC_LOG: staticLog, FAIL_STATIC: failStatic },
      },
    );
    assert.ifError(r.error);
    assert.equal(r.status, failStatic ? 1 : 0, r.stderr);
    const dossier = JSON.parse(fs.readFileSync(f.output));
    invariant(dossier);
    assert.equal(dossier.stages[0].status, failStatic ? "FAILED" : "PASSED");
    assert.equal(
      dossier.staticIntegrityBaseline.status,
      failStatic ? "breached" : "verified",
    );
    assert.equal(
      dossier.summary.staticIntegrityCompliance,
      failStatic ? "failed" : "passed",
    );
    assert.deepEqual(
      fs.readFileSync(staticLog, "utf8").trim().split("\n"),
      CHECKS.map((c) => `${c.id}|${f.dir}`),
    );
    const receiptPath = dossier.stages[0].artifacts.find((file) =>
      file.endsWith("static-integrity-evidence-receipt.json"),
    );
    assert.ok(receiptPath);
    const receipt = JSON.parse(fs.readFileSync(receiptPath));
    assert.equal(validateStaticEvidence(receipt).valid, !failStatic);
    assert.equal(validCaddyStaticEvidence(receipt, receiptPath), !failStatic);
    assert.ok(
      !(
        r.stdout +
        r.stderr +
        JSON.stringify(dossier) +
        JSON.stringify(receipt)
      ).includes("private-static-canary"),
    );
  });
}

for (const license of ["MIT", "GPL-3.0"]) {
  test(`actual SBOM child and unchanged dossier/readiness consumers: ${license}`, (t) => {
    const f = fixture(t);
    fs.copyFileSync(
      path.join(__dirname, "generate-sbom.js"),
      path.join(f.ops, "generate-sbom.js"),
    );
    fs.writeFileSync(
      path.join(f.dir, "package-lock.json"),
      JSON.stringify({
        packages: {
          "": { name: "acres" },
          "node_modules/fixture-package": { version: "1.0.0", license },
        },
      }),
    );
    const r = f.execute();
    assert.equal(r.status, license === "MIT" ? 0 : 1, r.stderr);
    assert.ok(r.dossier);
    invariant(r.dossier);
    const stage = r.dossier.stages.find(
      (s) => s.stage_id === "supply_chain_sast",
    );
    assert.equal(stage.status, license === "MIT" ? "PASSED" : "FAILED");
    const receiptPath = stage.artifacts.find(
      (p) => path.basename(p) === "sbom-inventory-receipt.json",
    );
    assert.ok(receiptPath);
    const bom = JSON.parse(fs.readFileSync(receiptPath));
    assert.equal(bom.components.length, 1);
    assert.equal(bom.licenseCompliance.totalComponents, 1);
    assert.equal(bom.licenseCompliance.compliant, license === "MIT");
    const {
      isSbomEvidence,
      validateSupplyChainEvidence,
    } = require("./check-launch-readiness");
    assert.equal(isSbomEvidence(bom, receiptPath), true);
    const blockers = [];
    assert.equal(
      validateSupplyChainEvidence(
        bom,
        receiptPath,
        (_c, message) => blockers.push(message),
        "supply_chain",
      ),
      license === "MIT",
    );
    assert.equal(blockers.length, license === "MIT" ? 0 : 1);
    if (license === "MIT") {
      assert.equal(r.dossier.supplyChainBaseline.sbom.packagesCount, 1);
      assert.equal(
        r.dossier.supplyChainBaseline.sbom.licenseComplianceVerified,
        true,
      );
    } else assert.equal(r.dossier.summary.supplyChainSecurity, "failed");
  });
}

for (const scenario of ["clean", "active-blocker", "expired-match"]) {
  test(`actual SAST child and unchanged dossier/readiness consumers: ${scenario}`, (t) => {
    const f = fixture(t);
    fs.copyFileSync(
      path.join(__dirname, "run-sast-scan.js"),
      path.join(f.ops, "run-sast-scan.js"),
    );
    // Install only the dependency-free scanner. Every other runner stage stays stubbed.
    const content =
      scenario === "clean"
        ? "const safe = 1;"
        : 'const token = "sk-' + "CanarySecret".repeat(3) + '";';
    fs.mkdirSync(path.join(f.dir, "client"));
    fs.writeFileSync(path.join(f.dir, "client/source.js"), content);
    fs.mkdirSync(path.join(f.dir, "infra/security"));
    fs.writeFileSync(
      path.join(f.dir, "infra/security/sast-triage.json"),
      JSON.stringify({
        suppressions:
          scenario === "expired-match"
            ? [
                {
                  id: "SUP-100",
                  rule_id: "SAST-04",
                  path: "client/source.js",
                  snippet: content,
                  expires_at: "2000-01-01",
                },
              ]
            : [],
      }),
    );
    // Existing fixture JS lives under scanned scripts/. It has no unsafe rule matches.
    const r = f.execute();
    const passing = scenario === "clean";
    assert.equal(r.status, passing ? 0 : 1, r.stderr);
    assert.ok(r.dossier);
    invariant(r.dossier);
    const stage = r.dossier.stages.find(
      (s) => s.stage_id === "supply_chain_sast",
    );
    assert.equal(stage.status, passing ? "PASSED" : "FAILED");
    const receiptPath = stage.artifacts.find(
      (p) => path.basename(p) === "sast-scan-evidence-receipt.json",
    );
    assert.ok(receiptPath);
    const raw = fs.readFileSync(receiptPath, "utf8");
    const receipt = JSON.parse(raw);
    assert.equal(receipt.drill_type, "sast_security_scan");
    assert.equal(receipt.status, passing ? "success" : "failed");
    assert.equal(receipt.passed, passing);
    assert.equal(
      receipt.expiredFindings.length,
      scenario === "expired-match" ? 1 : 0,
    );
    assert.equal(
      receipt.blockingActiveFindings.length,
      scenario === "active-blocker" ? 1 : 0,
    );
    assert.ok(!raw.includes("CanarySecret"));
    const {
      isSastEvidence,
      validateSupplyChainEvidence,
    } = require("./check-launch-readiness");
    assert.equal(isSastEvidence(receipt, receiptPath), true);
    const blockers = [];
    assert.equal(
      validateSupplyChainEvidence(
        receipt,
        receiptPath,
        (_c, m) => blockers.push(m),
        "supply_chain",
      ),
      passing,
    );
    assert.equal(blockers.length, passing ? 0 : 1);
    assert.equal(
      r.dossier.summary.sastCompliance,
      passing ? "passed" : "failed",
    );
    if (passing) {
      assert.equal(
        r.dossier.supplyChainBaseline.sast.filesScanned,
        receipt.scannedFilesCount,
      );
      assert.equal(
        r.dossier.supplyChainBaseline.sast.totalFindingsCount,
        receipt.totalFindingsCount,
      );
    } else assert.equal(r.dossier.summary.supplyChainSecurity, "failed");
  });
}

for (const scenario of [
  "clean",
  "failed-check",
  "malformed-source",
  "unreadable-source",
]) {
  test(`actual container verifier and unchanged dossier/readiness consumers: ${scenario}`, (t) => {
    const f = fixture(t),
      root = path.resolve(__dirname, "../..");
    fs.copyFileSync(
      path.join(__dirname, "verify-container-security.js"),
      path.join(f.ops, "verify-container-security.js"),
    );
    // Replace only the fixture parser stub with the installed parser closure.
    fs.rmSync(path.join(f.dir, "node_modules/js-yaml"), { recursive: true });
    for (const pkg of ["js-yaml", "argparse"])
      fs.cpSync(
        path.dirname(require.resolve(`${pkg}/package.json`)),
        path.join(f.dir, "node_modules", pkg),
        { recursive: true },
      );
    for (const file of [
      "server/Dockerfile",
      "infra/docker/client.Dockerfile.example",
      "infra/compose/docker-compose.production.example.yml",
    ]) {
      const destination = path.join(f.dir, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, file), destination);
    }
    const compose = path.join(
      f.dir,
      "infra/compose/docker-compose.production.example.yml",
    );
    if (scenario === "failed-check") {
      const file = path.join(f.dir, "server/Dockerfile");
      fs.writeFileSync(
        file,
        fs
          .readFileSync(file, "utf8")
          .replace("USER node", "USER CanaryPrivate"),
      );
    }
    if (scenario === "malformed-source")
      fs.writeFileSync(compose, "CanaryPrivate: [");
    if (scenario === "unreadable-source") {
      // Compose is also parent-preflight input; fault the child-only Dockerfile.
      const file = path.join(f.dir, "server/Dockerfile");
      fs.unlinkSync(file);
      fs.mkdirSync(file);
    }
    const r = f.execute(),
      passing = scenario === "clean";
    assert.equal(r.status, passing ? 0 : 1, r.stderr);
    assert.ok(r.dossier);
    invariant(r.dossier);
    const stage = r.dossier.stages.find(
      (s) => s.stage_id === "supply_chain_sast",
    );
    assert.equal(stage.status, passing ? "PASSED" : "FAILED");
    const receiptPath = stage.artifacts.find(
      (p) => path.basename(p) === "container-security-evidence-receipt.json",
    );
    assert.ok(receiptPath);
    assert.equal(
      r.dossier.summary.containerSecurityCompliance,
      passing ? "passed" : "failed",
    );
    assert.equal(
      r.dossier.supplyChainBaseline.status,
      passing ? "verified" : "breached",
    );
    if (scenario === "unreadable-source") {
      assert.equal(fs.existsSync(receiptPath), false);
      return;
    }
    const raw = fs.readFileSync(receiptPath, "utf8"),
      receipt = JSON.parse(raw);
    assert.equal(receipt.drill_type, "container_security_verification");
    assert.equal(receipt.valid, passing);
    assert.equal(receipt.status, passing ? "success" : "failed");
    assert.ok(!raw.includes("CanaryPrivate"));
    const {
      isContainerSecurityEvidence,
      validateSupplyChainEvidence,
    } = require("./check-launch-readiness");
    assert.equal(isContainerSecurityEvidence(receipt, receiptPath), true);
    const blockers = [];
    assert.equal(
      validateSupplyChainEvidence(
        receipt,
        receiptPath,
        (_c, m) => blockers.push(m),
        "supply_chain",
      ),
      passing,
    );
    assert.equal(blockers.length, passing ? 0 : 1);
    assert.ok(!blockers.join("").includes("CanaryPrivate"));
    if (passing)
      assert.equal(
        r.dossier.supplyChainBaseline.containerSecurity.totalChecks,
        22,
      );
  });
}
