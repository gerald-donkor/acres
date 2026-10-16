const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  RECEIPTS,
  RECEIPTS_MANAGED,
  getReceipts,
  freshTimestamp,
  readReceipt,
  publish,
  prepareOutput,
  releaseOutput,
  outputPreflight,
  assemble,
  validateDossier,
  main,
} = require("./assemble-launch-dossier");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "launch-assembly-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
test("timestamps accept actual producer precisions and reject impossible or outside dates", () => {
  const start = Date.parse("2026-09-29T10:11:12.950Z"),
    end = start + 500;
  for (const s of [
    "2026-09-29T10:11:12Z",
    "20260929T101112Z",
    "2026-09-29T10:11:13.000Z",
  ])
    assert.equal(freshTimestamp(s, start, end), true);
  for (const s of [
    "2026-02-30T00:00:00Z",
    "20260929T251112Z",
    "2026-09-29T10:11:11Z",
    "2026-09-29T10:11:14Z",
    "2026-09-29T10:11:12.949Z",
    "2026-09-29 10:11:13Z",
  ])
    assert.equal(freshTimestamp(s, start, end), false);
});
test("bounded reader rejects escape and symlink stage ancestors", (t) => {
  const root = fixture(t),
    dir = path.join(root, "stage");
  fs.mkdirSync(dir);
  const file = path.join(root, "file.json");
  fs.writeFileSync(file, "{}");
  assert.throws(() => readReceipt(file, dir, 100));
  fs.symlinkSync(dir, path.join(root, "link"));
  assert.throws(() =>
    readReceipt(
      path.join(root, "link/file.json"),
      path.join(root, "link"),
      100,
    ),
  );
});
test("bounded reader limits actual bytes and rejects malformed/nonregular evidence", (t) => {
  const root = fixture(t),
    file = path.join(root, "receipt.json");
  fs.writeFileSync(file, "{}");
  assert.deepEqual(readReceipt(file, root, 2), {});
  assert.throws(() => readReceipt(file, root, 1));
  fs.writeFileSync(file, "{");
  assert.throws(() => readReceipt(file, root, 100));
  fs.unlinkSync(file);
  fs.mkdirSync(file);
  assert.throws(() => readReceipt(file, root, 100));
});
test("output locking preserves retained evidence and other owner, and exclusively publishes private JSON", (t) => {
  const root = fixture(t),
    file = path.join(root, "out.json");
  fs.writeFileSync(file, "old");
  assert.throws(() => prepareOutput(file, "one"));
  assert.equal(fs.readFileSync(file, "utf8"), "old");
  fs.unlinkSync(file);
  prepareOutput(file, "one");
  assert.ok(!fs.existsSync(file));
  assert.throws(() => prepareOutput(file, "two"));
  releaseOutput(file, "two");
  assert.ok(fs.existsSync(file + ".lock"));
  publish(file, { overall_status: "FAILED" }, "one");
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), {
    overall_status: "FAILED",
  });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  releaseOutput(file, "one");
  assert.ok(!fs.existsSync(file + ".lock"));
});
test("serialization/write/link failures clean only owned temporary files", (t) => {
  const root = fixture(t),
    output = path.join(root, "out");
  const circular = {};
  circular.self = circular;
  assert.throws(() => publish(output, circular));
  fs.mkdirSync(output);
  assert.throws(() => publish(output, {}));
  assert.deepEqual(fs.readdirSync(root), ["out"]);
  assert.throws(() => publish(path.join(root, "missing/out"), {}));
});

test("reader detects growth during bounded reads", (t) => {
  const root = fixture(t),
    file = path.join(root, "receipt.json");
  fs.writeFileSync(file, "{}");
  const original = fs.readSync;
  try {
    let changed = false;
    fs.readSync = function (...args) {
      const result = original(...args);
      if (!changed) {
        changed = true;
        fs.appendFileSync(file, " ");
      }
      return result;
    };
    assert.throws(() => readReceipt(file, root, 100));
  } finally {
    fs.readSync = original;
  }
});
test("publication write and link failures remove the exclusively owned temporary file", (t) => {
  const root = fixture(t),
    output = path.join(root, "out.json");
  for (const method of ["writeFileSync", "linkSync"]) {
    const original = fs[method];
    try {
      fs[method] = () => {
        throw Object.assign(Error("injected failure"), { code: "EIO" });
      };
      assert.throws(() => publish(output, {}));
    } finally {
      fs[method] = original;
    }
    assert.deepEqual(fs.readdirSync(root), []);
    assert.ok(!fs.existsSync(output));
  }
});
test("prepare leaves existing parent permissions and unrelated lock contents unchanged", (t) => {
  const root = fixture(t),
    output = path.join(root, "out.json");
  fs.chmodSync(root, 0o755);
  prepareOutput(output, "one");
  assert.equal(fs.statSync(root).mode & 0o777, 0o755);
  assert.throws(() => prepareOutput(output, "two"));
  assert.equal(fs.readFileSync(output + ".lock", "utf8"), "one");
  releaseOutput(output, "one");
  assert.deepEqual(fs.readdirSync(root), []);
});
test("RECEIPTS includes ingress_deployment caddy-routing-evidence-receipt.json", () => {
  assert.equal(
    RECEIPTS.ingress_deployment.caddy,
    "caddy-routing-evidence-receipt.json",
  );
});

for (const kind of ["file", "directory", "symlink", "dangling"]) {
  test(`preflight and prepare preserve retained ${kind} without allocating resources`, (t) => {
    const root = fixture(t),
      output = path.join(root, "retained");
    if (kind === "file") fs.writeFileSync(output, "retained-secret-canary");
    if (kind === "directory") fs.mkdirSync(output);
    if (kind === "symlink" || kind === "dangling") {
      const target = path.join(root, "target");
      if (kind === "symlink")
        fs.writeFileSync(target, "retained-secret-canary");
      fs.symlinkSync(target, output);
    }
    const stat = fs.lstatSync(output);
    assert.throws(() => outputPreflight(output, path.join(root, "unused")));
    assert.throws(() => prepareOutput(output, "owner"));
    assert.equal(fs.lstatSync(output).ino, stat.ino);
    assert.ok(!fs.existsSync(path.join(root, "unused")));
    assert.ok(!fs.existsSync(output + ".lock"));
    if (kind === "file")
      assert.equal(fs.readFileSync(output, "utf8"), "retained-secret-canary");
  });
}

test("read-only preflight rejects symlink ancestors, foreign locks and trailing separators", (t) => {
  const root = fixture(t),
    link = path.join(root, "link");
  fs.symlinkSync(root, link);
  assert.throws(() => outputPreflight(path.join(link, "out"), root));
  assert.throws(() =>
    outputPreflight(path.join(root, "out"), path.join(link, "new")),
  );
  assert.throws(() => outputPreflight(path.join(root, "out") + "/", root));
  const output = path.join(root, "out");
  fs.writeFileSync(output + ".lock", "foreign");
  assert.throws(() => outputPreflight(output, root));
  releaseOutput(output, "owner");
  assert.equal(fs.readFileSync(output + ".lock", "utf8"), "foreign");
});

for (const kind of ["file", "directory", "symlink", "dangling"]) {
  test(`exclusive publication preserves a concurrent ${kind}`, (t) => {
    const root = fixture(t),
      output = path.join(root, "out");
    prepareOutput(output, "owner");
    if (kind === "file") fs.writeFileSync(output, "concurrent-canary");
    if (kind === "directory") fs.mkdirSync(output);
    if (kind === "symlink" || kind === "dangling") {
      const target = path.join(root, "target");
      if (kind === "symlink") fs.writeFileSync(target, "concurrent-canary");
      fs.symlinkSync(target, output);
    }
    const before = fs.lstatSync(output);
    assert.throws(() => publish(output, { overall_status: "PASSED" }, "owner"));
    releaseOutput(output, "owner");
    assert.equal(fs.lstatSync(output).ino, before.ino);
    if (kind === "file")
      assert.equal(fs.readFileSync(output, "utf8"), "concurrent-canary");
    assert.ok(!fs.existsSync(output + ".lock"));
    assert.ok(
      fs.readdirSync(root).every((n) => !n.startsWith(".launch-dossier-")),
    );
  });
}

test("late non-cooperating insertion wins without replacement", (t) => {
  const root = fixture(t),
    output = path.join(root, "out");
  const original = fs.linkSync;
  try {
    fs.linkSync = (source, destination) => {
      fs.writeFileSync(destination, "late-writer", { flag: "wx" });
      return original(source, destination);
    };
    assert.throws(() => publish(output, { status: "success" }));
  } finally {
    fs.linkSync = original;
  }
  assert.equal(fs.readFileSync(output, "utf8"), "late-writer");
  assert.deepEqual(fs.readdirSync(root), ["out"]);
});

for (const content of ["", "{}", '{"overall_status":"PASSED"}', "{"]) {
  test(`independent staging read rejects injected incomplete write: ${JSON.stringify(content)}`, (t) => {
    const root = fixture(t),
      output = path.join(root, "out");
    const original = fs.writeFileSync;
    try {
      fs.writeFileSync = (fd) => original(fd, content);
      assert.throws(() => publish(output, { status: "success", count: 7 }));
    } finally {
      fs.writeFileSync = original;
    }
    assert.deepEqual(fs.readdirSync(root), []);
  });
}

test("prepare failures release their owned lock and preserve a foreign staging file", (t) => {
  const root = fixture(t),
    output = path.join(root, "out");
  const foreign = path.join(root, ".launch-dossier-owner.tmp");
  fs.writeFileSync(foreign, "foreign");
  assert.throws(() => prepareOutput(output, "owner"));
  assert.equal(fs.readFileSync(foreign, "utf8"), "foreign");
  assert.ok(!fs.existsSync(output + ".lock"));
  fs.unlinkSync(foreign);
  const original = fs.writeFileSync;
  try {
    fs.writeFileSync = () => {
      throw Error("private-canary");
    };
    assert.throws(() => prepareOutput(output, "owner"));
  } finally {
    fs.writeFileSync = original;
  }
  assert.deepEqual(fs.readdirSync(root), []);
});

test("staging close failure removes owned paths or retains ownership for retry", (t) => {
  const root = fixture(t),
    output = path.join(root, "out");
  for (const failUnlink of [false, true]) {
    const originalClose = fs.closeSync,
      originalUnlink = fs.unlinkSync;
    let injected = false;
    try {
      fs.closeSync = (fd) => {
        originalClose(fd);
        if (!injected) {
          injected = true;
          throw Object.assign(Error("private-canary"), { code: "EIO" });
        }
      };
      if (failUnlink)
        fs.unlinkSync = () => {
          throw Object.assign(Error("private-canary"), { code: "EIO" });
        };
      assert.throws(() => prepareOutput(output, "owner"));
    } finally {
      fs.closeSync = originalClose;
      fs.unlinkSync = originalUnlink;
    }
    assert.ok(injected);
    if (failUnlink) {
      assert.equal(fs.readFileSync(output + ".lock", "utf8"), "owner");
      assert.ok(fs.existsSync(path.join(root, ".launch-dossier-owner.tmp")));
    } else assert.deepEqual(fs.readdirSync(root), []);
    releaseOutput(output, "owner");
    assert.deepEqual(fs.readdirSync(root), []);
  }
});

for (const suffix of ["", "/nested", "/nested/deeper"]) {
  test(`output conflicting with allocated evidence directory rejects without creation: ${suffix}`, (t) => {
    const root = fixture(t),
      output = path.join(root, "absent");
    assert.throws(() => outputPreflight(output, output + suffix));
    assert.deepEqual(fs.readdirSync(root), []);
  });
}

test("owned release I/O failure is reported and can be retried without touching foreign files", (t) => {
  const root = fixture(t),
    output = path.join(root, "out");
  prepareOutput(output, "owner");
  const original = fs.unlinkSync;
  try {
    fs.unlinkSync = () => {
      throw Object.assign(Error("private-canary"), { code: "EIO" });
    };
    assert.throws(() => releaseOutput(output, "owner"));
  } finally {
    fs.unlinkSync = original;
  }
  releaseOutput(output, "owner");
  assert.deepEqual(fs.readdirSync(root), []);
});

test("assembler rejects incomplete CLI manifests with a fixed diagnostic", () => {
  const original = console.error,
    messages = [];
  try {
    console.error = (message) => messages.push(message);
    assert.equal(main(["assemble", "/private-canary", "{}"]), 1);
    assert.equal(
      main(["verify", "/private-canary", "/private-snapshot", "{}"]),
      1,
    );
  } finally {
    console.error = original;
  }
  assert.deepEqual(messages, [
    "launch dossier: operation failed",
    "launch dossier: operation failed",
  ]);
});

test("publication with a colliding token basename cannot consume the reservation or staging file of another owner", (t) => {
  const root = fixture(t),
    output = path.join(root, "out");
  const first = "/owner/one",
    second = "/foreign/one";
  prepareOutput(output, first);
  const staging = path.join(root, ".launch-dossier-one.tmp");
  assert.throws(() => publish(output, { status: "success" }, second));
  assert.equal(fs.readFileSync(output + ".lock", "utf8"), first);
  assert.equal(fs.readFileSync(staging, "utf8"), "");
  assert.ok(!fs.existsSync(output));
  releaseOutput(output, first);
  assert.deepEqual(fs.readdirSync(root), []);
});

test("RECEIPTS_MANAGED includes managed receipts and getReceipts discriminates", () => {
  assert.equal(
    RECEIPTS_MANAGED.ingress_deployment.deployment,
    "managed-ingress-deployment-receipt.json",
  );
  assert.equal(
    RECEIPTS_MANAGED.volume_encryption.volume,
    "managed-volume-encryption-receipt.json",
  );
  assert.equal(
    RECEIPTS_MANAGED.secret_rotation.rotation,
    "managed-secret-rotation-receipt.json",
  );
  assert.equal(
    RECEIPTS_MANAGED.disaster_recovery.restore,
    "managed-restore-drill-receipt.json",
  );
  assert.equal(
    RECEIPTS_MANAGED.disaster_recovery.reconcile,
    "reconcile-report-receipt.json",
  );
  assert.equal(getReceipts("vercel-managed-production"), RECEIPTS_MANAGED);
  assert.equal(getReceipts("single-host-compose-caddy"), RECEIPTS);
  assert.equal(getReceipts(), RECEIPTS);
});

test("assemble and validateDossier succeed for vercel-managed-production", (t) => {
  const root = fixture(t);
  const runDir = path.join(root, "run");
  fs.mkdirSync(runDir);
  const outputPath = path.join(root, "dossier.json");
  const now = new Date();
  const startedAt = now.getTime() - 10000;
  const endedAt = now.getTime();
  const timestamp = now.toISOString();

  const receiptMap = getReceipts("vercel-managed-production");
  const stageIds = Object.keys(receiptMap);

  for (const id of stageIds) {
    fs.mkdirSync(path.join(runDir, id));
  }

  // 1. static_templates
  fs.writeFileSync(
    path.join(runDir, "static_templates", receiptMap.static_templates.static),
    JSON.stringify({
      drill_type: "static_integrity_verification",
      target_architecture: "vercel-managed-production",
      timestamp,
      status: "success",
      valid: true,
      totalChecks: 2,
      passedChecks: 2,
      failedChecks: 0,
      checks: [
        { id: "vercel_config", passed: true, exitCode: 0 },
        { id: "secret_defaults", passed: true, exitCode: 0 },
      ],
    }),
  );

  // 2. supply_chain_sast
  fs.writeFileSync(
    path.join(runDir, "supply_chain_sast", receiptMap.supply_chain_sast.sbom),
    JSON.stringify({
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      metadata: { timestamp },
      components: [{ name: "acres-api", version: "1.0.0" }],
      licenseCompliance: { compliant: true, violations: [] },
    }),
  );
  fs.writeFileSync(
    path.join(runDir, "supply_chain_sast", receiptMap.supply_chain_sast.sast),
    JSON.stringify({
      drill_type: "sast_security_scan",
      timestamp,
      status: "success",
      valid: true,
      passed: true,
      scannedFilesCount: 50,
      totalFindingsCount: 0,
      triagedFindings: [],
      expiredFindings: [],
      blockingActiveFindings: [],
    }),
  );
  fs.writeFileSync(
    path.join(runDir, "supply_chain_sast", receiptMap.supply_chain_sast.container),
    JSON.stringify({
      drill_type: "container_security_verification",
      timestamp,
      status: "success",
      valid: true,
      checks: [{ passed: true }],
      totalChecks: 1,
      passedChecks: 1,
      failedChecks: 0,
      errors: [],
    }),
  );

  // 3. ingress_deployment
  fs.writeFileSync(
    path.join(runDir, "ingress_deployment", receiptMap.ingress_deployment.deployment),
    JSON.stringify({
      drill_type: "managed_ingress_deployment_verification",
      drill_timestamp: timestamp,
      timestamp,
      status: "success",
      valid: true,
      target_architecture: "vercel-managed-production",
      execution_mode: "simulation",
      routing_verified: true,
      services_verified: true,
      rollback_procedure_verified: true,
      preview_deployment_verified: true,
      routes_evaluated: 12,
      routes_passed: 12,
      errors: [],
    }),
  );

  // 4. volume_encryption
  fs.writeFileSync(
    path.join(runDir, "volume_encryption", receiptMap.volume_encryption.volume),
    JSON.stringify({
      drill_type: "managed_volume_encryption_verification",
      timestamp,
      status: "success",
      valid: true,
      target_architecture: "vercel-managed-production",
      execution_mode: "simulation",
      storage_encryption_verified: true,
      neon_aws_kms_aes256: true,
      ephemeral_compute_isolated: true,
      key_separation_verified: true,
      cloud_storage_encrypted: true,
      errors: [],
    }),
  );

  // 5. secret_rotation
  fs.writeFileSync(
    path.join(runDir, "secret_rotation", receiptMap.secret_rotation.rotation),
    JSON.stringify({
      drill_type: "managed_secret_rotation_verification",
      timestamp,
      status: "success",
      valid: true,
      target_architecture: "vercel-managed-production",
      execution_mode: "simulation",
      rotation_cadence_days: 90,
      cadence_compliant: true,
      indirect_references_verified: true,
      steps: {
        session_rollover: { status: "passed" },
        csrf_rollover: { status: "passed" },
        cron_rollover: { status: "passed" },
        neon_role_rotation: { status: "passed" },
        blob_token_rotation: { status: "passed" },
        resend_key_rotation: { status: "passed" },
        compromise_response: { status: "passed" },
        redaction_audit: {
          status: "passed",
          raw_secrets_masked: true,
          zero_dev_passwords_detected: true,
        },
      },
      errors: [],
    }),
  );

  // 6. capacity_alerting
  const { REQUIRED_ALERTS } = require("./verify-alert-rules");
  const { DEFAULT_SLO_TARGETS, evaluateSloCompliance } = require("./verify-capacity-load");
  const distribution = {
    availabilityPercent: 100,
    throughputRps: 150,
    latencyMs: { min: 1, p50: 2, p90: 3, p95: 4, p99: 5, max: 6 },
    databaseLatency: {
      acquisitionLatencyMs: { min: 0, p50: 1, p90: 1.5, p95: 2, p99: 3, max: 4 },
      queryLatencyMs: { min: 0, p50: 1, p90: 1.5, p95: 2, p99: 3, max: 4 },
    },
  };
  const simulatedDos = {
    drill_type: "dos_resilience_drill",
    timestamp,
    durationMs: 0,
    status: "success",
    mode: "simulated",
    apiTargetId: null,
    failures: [],
    layers: {
      layer1_edge_ingress: { passed: true },
      layer2_in_process_throttling: { passed: true },
      layer3_graphql_bounds: { passed: true },
      layer4_storage_bounds: { passed: true },
      layer5_anti_enumeration: { passed: true },
      layer6_rate_limiter_burst: {
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
      },
    },
  };
  const pool = { totalConnections: 2, idleConnections: 1, maxConnections: 10, requestsWaiting: 0 };
  const latency = { p50Ms: 1, p95Ms: 2, p99Ms: 3 };
  fs.writeFileSync(
    path.join(runDir, "capacity_alerting", receiptMap.capacity_alerting.capacity),
    JSON.stringify({
      timestamp,
      status: "success",
      valid: true,
      execution_mode: "simulation",
      mode: "synthetic",
      durationMs: 0,
      alerts: {
        valid: true,
        errors: [],
        checks: [{ passed: true }],
        requiredRulesCount: REQUIRED_ALERTS.length,
        totalRulesCount: REQUIRED_ALERTS.length,
        alerts: REQUIRED_ALERTS.map((alert) => ({ alert, valid: true, errors: [] })),
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
      databaseTelemetryBaseline: {
        status: "verified",
        source: "synthetic",
        postgresExporter: { up: 1, lastScrapeError: 0 },
        postgresServer: { pgUp: 1, maxConnections: 100, activeConnections: 2 },
        connectionPool: { api: pool, worker: pool },
        poolAcquisitionLatency: { api: latency, worker: latency },
        queryExecutionDuration: { api: latency, worker: latency },
        serverActivity: { lockWaits: 0, maxTransactionDurationSec: 0 },
      },
    }),
  );

  // 7. disaster_recovery
  fs.writeFileSync(
    path.join(runDir, "disaster_recovery", receiptMap.disaster_recovery.restore),
    JSON.stringify({
      drill_type: "managed_restore_drill_verification",
      drill_timestamp: timestamp,
      timestamp,
      status: "success",
      valid: true,
      target_architecture: "vercel-managed-production",
      execution_mode: "simulation",
      pitr_recovery_window_days: 7,
      pitr_preflight_verified: true,
      rto_hours: 4,
      rto_compliant: true,
      rpo_hours: 1,
      rpo_compliant: true,
      blob_durability_verified: true,
      duration_seconds: 120,
      rto_target_seconds: 14400,
      errors: [],
    }),
  );
  fs.writeFileSync(
    path.join(runDir, "disaster_recovery", receiptMap.disaster_recovery.reconcile),
    JSON.stringify({
      execution_mode: "simulation",
      drill_type: "storage_reconciliation",
      timestamp,
      provider: "vercel-blob",
      summary: {
        status: "clean",
        exitCode: 0,
        provider: "vercel-blob",
        totalDatabaseObjects: 1,
        totalBucketObjects: 1,
        matchedObjects: 1,
        missingObjects: 0,
        orphanObjects: 0,
        mismatchedObjects: 0,
      },
    }),
  );

  const stages = stageIds.map((id) => {
    const log = path.join(runDir, id, `launch-drill-stage-${id}.log`);
    fs.writeFileSync(log, "stage log\n");
    return {
      stage_id: id,
      description: `Stage ${id}`,
      status: "PASSED",
      duration_ms: 100,
      error_message: null,
      artifacts: [
        log,
        ...Object.values(receiptMap[id]).map((name) => path.join(runDir, id, name)),
      ],
    };
  });

  const config = {
    outputPath,
    timestamp,
    durationS: 5.0,
    caddyfile: "infra/caddy/Caddyfile.example",
    composeFile: "infra/compose/docker-compose.production.example.yml",
    targetUrl: null,
    apiUrl: null,
    allowHsts: 0,
    dryRun: "1",
    startedAt,
    endedAt,
    runDir,
    targetArchitecture: "vercel-managed-production",
    stages,
  };

  const dossier = assemble(config);
  assert.equal(dossier.target_architecture, "vercel-managed-production");
  assert.equal(dossier.overall_status, "PASSED");
  assert.equal(dossier.total_stages, 7);
  assert.equal(dossier.passed_stages, 7);
  assert.equal(dossier.failed_stages, 0);

  assert.equal(dossier.deploymentBaseline.status, "verified");
  assert.equal(dossier.deploymentBaseline.targetArchitecture, "vercel-managed-production");
  assert.equal(dossier.deploymentBaseline.ingressRoutingVerified, true);
  assert.equal(dossier.deploymentBaseline.servicesVerified, true);

  assert.equal(dossier.volumeEncryptionBaseline.status, "verified");
  assert.equal(dossier.volumeEncryptionBaseline.targetArchitecture, "vercel-managed-production");
  assert.equal(dossier.volumeEncryptionBaseline.storageEncryptionVerified, true);
  assert.equal(dossier.volumeEncryptionBaseline.neonKmsAes256Verified, true);

  assert.equal(dossier.secretRotationBaseline.status, "verified");
  assert.equal(dossier.secretRotationBaseline.targetArchitecture, "vercel-managed-production");
  assert.equal(dossier.secretRotationBaseline.rotationCadenceDays, 90);
  assert.equal(dossier.secretRotationBaseline.cadenceCompliant, true);

  assert.equal(dossier.disasterRecoveryBaseline.status, "verified");
  assert.equal(dossier.disasterRecoveryBaseline.targetArchitecture, "vercel-managed-production");
  assert.equal(dossier.disasterRecoveryBaseline.restoreDrill.pitrRecoveryWindowDays, 7);
  assert.equal(dossier.disasterRecoveryBaseline.storageReconciliation.provider, "vercel-blob");

  assert.equal(dossier.summary.caddyRoutingPreflight, "not_applicable");
  assert.equal(dossier.summary.deploymentCompliance, "passed");
  assert.equal(dossier.summary.volumeEncryptionCompliance, "passed");
  assert.equal(dossier.summary.secretRotationCompliance, "passed");
  assert.equal(dossier.summary.restoreCompliance, "passed");
  assert.equal(dossier.summary.reconcileCompliance, "passed");

  // Validate dossier against invocation config
  assert.doesNotThrow(() => validateDossier(dossier, config));
});
