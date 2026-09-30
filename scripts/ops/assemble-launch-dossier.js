const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { validateStaticEvidence } = require("./run-static-integrity-checks");
const {
  targetId,
  fileId,
  validDatabaseTelemetry,
  validDosEvidence,
} = require("./launch-target-evidence");

const {
  evaluateSloCompliance,
  DEFAULT_SLO_TARGETS,
} = require("./verify-capacity-load");
const { REQUIRED_ALERTS } = require("./verify-alert-rules");

// Exact receipt names are shared with Bash; intermediate/unregistered files are never consumed.
const RECEIPTS = {
  static_templates: { static: "static-integrity-evidence-receipt.json" },
  supply_chain_sast: {
    sbom: "sbom-inventory-receipt.json",
    sast: "sast-scan-evidence-receipt.json",
    container: "container-security-evidence-receipt.json",
  },
  ingress_deployment: {
    deployment: "deployment-drill-evidence-receipt.json",
    caddy: "caddy-routing-evidence-receipt.json",
  },
  volume_encryption: { volume: "volume-encryption-evidence-receipt.json" },
  secret_rotation: { rotation: "secret-rotation-evidence-receipt.json" },
  capacity_alerting: {
    capacity: "capacity-alerting-drill-evidence-receipt.json",
  },
  disaster_recovery: {
    restore: "restore-drill-evidence-receipt.json",
    reconcile: "reconcile-report-receipt.json",
  },
};
const TYPES = {
  static: "static_integrity_verification",
  sast: "sast_security_scan",
  container: "container_security_verification",
  caddy: "caddy_routing_and_tls_verification",
  volume: "production_volume_encryption_and_key_separation",
  rotation: "zero_downtime_secret_rotation_and_compromise_response",
};

// Reject symlinks in all path components, including operator-supplied parents.
function directory(value, create = false) {
  const resolved = path.resolve(value);
  let current = path.parse(resolved).root;
  for (const part of resolved
    .slice(current.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    if (create) {
      try {
        fs.mkdirSync(current, { mode: 0o700 });
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
      }
    }
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw Error("invalid evidence directory");
  }
  return resolved;
}

function freshTimestamp(value, startedAt, endedAt) {
  if (typeof value !== "string") return false;
  let iso = value;
  if (/^\d{8}T\d{6}Z$/.test(value))
    iso = value.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      "$1-$2-$3T$4:$5:$6Z",
    );
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(iso))
    return false;
  const ms = Date.parse(iso);
  const precise = iso.includes(".");
  if (
    !Number.isFinite(ms) ||
    new Date(ms).toISOString() !== (precise ? iso : iso.replace("Z", ".000Z"))
  )
    return false;
  return ms >= startedAt - (precise ? 0 : 999) && ms <= endedAt;
}

function readReceipt(file, ownedDirectory, limit) {
  const root = directory(ownedDirectory);
  if (path.dirname(path.resolve(file)) !== root)
    throw Error("receipt outside stage");
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.size > limit)
    throw Error("invalid receipt");
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const opened = fs.fstatSync(fd);
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size > limit
    )
      throw Error("changed receipt");
    const buffer = Buffer.alloc(limit + 1);
    let used = 0;
    while (used < buffer.length) {
      const n = fs.readSync(fd, buffer, used, buffer.length - used, null);
      if (!n) break;
      used += n;
    }
    const after = fs.fstatSync(fd);
    const named = fs.lstatSync(file);
    if (
      used > limit ||
      used !== opened.size ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs ||
      named.dev !== opened.dev ||
      named.ino !== opened.ino
    )
      throw Error("changed or oversized receipt");
    return JSON.parse(buffer.subarray(0, used).toString("utf8"));
  } finally {
    fs.closeSync(fd);
  }
}

function temporaryPath(outputPath, token) {
  return path.join(
    path.dirname(outputPath),
    `.launch-dossier-${path.basename(token)}.tmp`,
  );
}

function prepareOutput(outputPath, token) {
  directory(path.dirname(outputPath), true);
  const lock = `${outputPath}.lock`;
  const fd = fs.openSync(lock, "wx", 0o600);
  let temporaryOwned = false;
  try {
    fs.writeFileSync(fd, token);
    fs.closeSync(fs.openSync(temporaryPath(outputPath, token), "wx", 0o600));
    temporaryOwned = true;
    if (
      fs.existsSync(outputPath) ||
      fs.lstatSync(path.dirname(outputPath)).isSymbolicLink()
    ) {
      const stat = fs.lstatSync(outputPath);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw Error("invalid output destination");
      fs.unlinkSync(outputPath);
    } else {
      // existsSync returns false for dangling symlinks.
      try {
        fs.lstatSync(outputPath);
        throw Error("invalid output destination");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
  } catch (e) {
    if (temporaryOwned) fs.unlinkSync(temporaryPath(outputPath, token));
    fs.unlinkSync(lock);
    throw e;
  } finally {
    fs.closeSync(fd);
  }
}
function releaseOutput(outputPath, token) {
  const lock = `${outputPath}.lock`;
  let fd;
  try {
    const stat = fs.lstatSync(lock);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) return;
    fd = fs.openSync(
      lock,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const opened = fs.fstatSync(fd);
    if (
      !opened.isFile() ||
      opened.ino !== stat.ino ||
      opened.dev !== stat.dev ||
      opened.size > 4096
    )
      return;
    const bytes = Buffer.alloc(4097);
    const count = fs.readSync(fd, bytes, 0, bytes.length, 0);
    const named = fs.lstatSync(lock);
    if (
      bytes.subarray(0, count).toString("utf8") === token &&
      named.ino === opened.ino &&
      named.dev === opened.dev
    ) {
      try {
        fs.unlinkSync(temporaryPath(outputPath, token));
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      fs.unlinkSync(lock);
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function publish(outputPath, dossier, token) {
  directory(path.dirname(outputPath));
  const temporary = token
    ? temporaryPath(outputPath, token)
    : path.join(
        path.dirname(outputPath),
        `.launch-dossier-${randomUUID()}.tmp`,
      );
  let owned = false,
    fd;
  try {
    const json = JSON.stringify(dossier, null, 2) + "\n";
    fd = token
      ? fs.openSync(
          temporary,
          fs.constants.O_WRONLY |
            fs.constants.O_NOFOLLOW |
            fs.constants.O_NONBLOCK,
        )
      : fs.openSync(temporary, "wx", 0o600);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (token && stat.size !== 0))
      throw Error("invalid temporary destination");
    owned = true;
    fs.writeFileSync(fd, json);
    fs.closeSync(fd);
    fd = undefined;
    try {
      const stat = fs.lstatSync(outputPath);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw Error("invalid output destination");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    fs.renameSync(temporary, outputPath);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (owned) {
      try {
        fs.unlinkSync(temporary);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
  }
}

const count = (n) => Number.isSafeInteger(n) && n >= 0;
const finite = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
function validSummaryFields(key, e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return false;
  if (!["sbom", "reconcile"].includes(key) && e.status !== "success")
    return false;
  if (key === "sast")
    return (
      count(e.scannedFilesCount) &&
      count(e.totalFindingsCount) &&
      Array.isArray(e.triagedFindings)
    );
  if (key === "container")
    return (
      Array.isArray(e.checks) &&
      e.totalChecks === e.checks.length &&
      e.passedChecks === e.checks.length &&
      e.failedChecks === 0
    );
  if (key === "volume")
    return (
      Array.isArray(e.evaluatedMounts) &&
      e.totalRequiredMounts === e.evaluatedMounts.length &&
      e.validMountsCount === e.totalRequiredMounts
    );
  if (key === "deployment")
    return count(e.migration_count) && count(e.caddy_routes_tested);
  if (key === "restore")
    return (
      [
        "tables_source",
        "tables_restored",
        "migrations_source",
        "migrations_restored",
      ].every((k) => count(e[k])) &&
      finite(e.duration_seconds) &&
      finite(e.rto_target_seconds) &&
      e.rto_target_seconds > 0 &&
      e.duration_seconds <= e.rto_target_seconds
    );
  if (key === "reconcile")
    return (
      [
        "totalDatabaseObjects",
        "totalBucketObjects",
        "matchedObjects",
        "missingObjects",
        "orphanObjects",
        "mismatchedObjects",
      ].every((k) => count(e.summary?.[k])) &&
      ["clean", "warning"].includes(e.summary?.status)
    );
  return true;
}
function databaseBaseline(e, targetUrl, startedAt, endedAt, dryRun) {
  const db = e?.databaseTelemetryBaseline;
  if (!db || db.status !== "verified") return null;
  const expected = targetUrl ? targetId(new URL(targetUrl).href) : null;
  const test =
    dryRun === "1"
      ? {
          ...db,
          source: "prometheus-live-scrape",
          timestamp: new Date(endedAt).toISOString(),
          targetId: expected,
          probeHealthy: true,
        }
      : db;
  if (
    !validDatabaseTelemetry(test, expected, startedAt, endedAt) ||
    (dryRun === "1" && db.source !== "synthetic")
  )
    return null;
  // Select only contract fields after validating every number. Raw metadata is excluded.
  const pick = (object, fields) =>
    Object.fromEntries(fields.map((k) => [k, object[k]]));
  const roles = (section, fields) =>
    Object.fromEntries(
      ["api", "worker"].map((role) => [role, pick(db[section][role], fields)]),
    );
  return {
    status: "verified",
    source: db.source,
    ...(dryRun === "1"
      ? {}
      : { timestamp: db.timestamp, targetId: db.targetId, probeHealthy: true }),
    postgresExporter: pick(db.postgresExporter, ["up", "lastScrapeError"]),
    postgresServer: pick(db.postgresServer, [
      "pgUp",
      "maxConnections",
      "activeConnections",
    ]),
    connectionPool: roles("connectionPool", [
      "totalConnections",
      "idleConnections",
      "maxConnections",
      "requestsWaiting",
    ]),
    poolAcquisitionLatency: roles("poolAcquisitionLatency", [
      "p50Ms",
      "p95Ms",
      "p99Ms",
    ]),
    queryExecutionDuration: roles("queryExecutionDuration", [
      "p50Ms",
      "p95Ms",
      "p99Ms",
    ]),
    serverActivity: pick(db.serverActivity, [
      "lockWaits",
      "maxTransactionDurationSec",
    ]),
  };
}

function validCapacityChildren(e, dryRun, apiUrl, startedAt, endedAt) {
  try {
    const alerts = e?.alerts;
    if (
      !alerts ||
      alerts.valid !== true ||
      !Array.isArray(alerts.errors) ||
      alerts.errors.length ||
      alerts.requiredRulesCount !== REQUIRED_ALERTS.length ||
      !count(alerts.totalRulesCount) ||
      alerts.totalRulesCount < REQUIRED_ALERTS.length ||
      !Array.isArray(alerts.alerts) ||
      !Array.isArray(alerts.simulations) ||
      !Array.isArray(alerts.checks) ||
      !alerts.checks.length ||
      !alerts.checks.every((c) => c?.passed === true)
    )
      return false;
    for (const name of REQUIRED_ALERTS) {
      const rules = alerts.alerts.filter((r) => r?.alert === name),
        sims = alerts.simulations.filter((r) => r?.alert === name);
      if (
        rules.length !== 1 ||
        sims.length !== 1 ||
        rules[0].valid !== true ||
        !Array.isArray(rules[0].errors) ||
        rules[0].errors.length ||
        sims[0].passed !== true ||
        sims[0].firesOnBreach !== true ||
        sims[0].clearsOnNormal !== true ||
        (name === "High429Rate" && sims[0].ignoresOther4xx !== true)
      )
        return false;
    }
    const capacity = e.capacity,
      d = capacity?.distribution,
      targets = capacity?.targets;
    if (
      !d ||
      !targets ||
      !finite(d.availabilityPercent) ||
      d.availabilityPercent > 100 ||
      !finite(d.throughputRps)
    )
      return false;
    for (const [key, baseline] of Object.entries(DEFAULT_SLO_TARGETS)) {
      if (
        !finite(targets[key]) ||
        targets[key] <= 0 ||
        (key.startsWith("max")
          ? targets[key] > baseline
          : targets[key] < baseline)
      )
        return false;
    }
    // Live HTTP benchmarks do not sample DB latency; the separately bound live
    // telemetry baseline supplies that gate. Synthetic reports include both.
    const latencies = [d.latencyMs];
    if (d.databaseLatency)
      latencies.push(
        d.databaseLatency.acquisitionLatencyMs,
        d.databaseLatency.queryLatencyMs,
      );
    else if (dryRun === "1") return false;
    for (const latency of latencies) {
      if (
        !latency ||
        !["min", "p50", "p90", "p95", "p99", "max"].every((k) =>
          finite(latency[k]),
        )
      )
        return false;
    }
    const computed = evaluateSloCompliance(d, targets);
    for (const key of [
      "availabilityPassed",
      "latencyPassed",
      "throughputPassed",
      "monotonicLatency",
      "databaseAcquisitionLatencyPassed",
      "databaseQueryLatencyPassed",
      "monotonicDbAcquisition",
      "monotonicDbQuery",
      "overallPassed",
    ]) {
      if (computed[key] !== true || capacity.compliance?.[key] !== true)
        return false;
    }
    if (
      !Array.isArray(capacity.compliance.violations) ||
      capacity.compliance.violations.length ||
      capacity.mode !== (dryRun === "1" ? "synthetic" : "live")
    )
      return false;
    const origin = apiUrl ? new URL(apiUrl).origin : "http://localhost:3001";
    return validDosEvidence(
      e.dosResilience,
      dryRun === "1",
      targetId(origin),
      startedAt,
      endedAt,
    );
  } catch {
    return false;
  }
}

function assemble(config) {
  const {
    outputPath,
    timestamp,
    durationS,
    caddyfile,
    composeFile,
    targetUrl,
    apiUrl,
    allowHsts,
    dryRun,
    startedAt,
    endedAt,
  } = config;
  if (
    ![startedAt, endedAt, durationS].every(
      (n) => Number.isFinite(n) && n >= 0,
    ) ||
    endedAt < startedAt
  )
    throw Error("invalid invocation timing");
  const version = "1.0.0",
    environment = "drill",
    total = 7;
  const stages = config.stages.map((s) => ({
    ...s,
    artifacts: [...s.artifacts, outputPath],
  }));
  if (
    stages.length !== total ||
    stages.some(
      (s, i) =>
        s.stage_id !== Object.keys(RECEIPTS)[i] ||
        !["PASSED", "FAILED"].includes(s.status) ||
        !Number.isFinite(s.duration_ms) ||
        s.duration_ms < 0,
    )
  )
    throw Error("invalid stage manifest");
  const explicitLiveTargets = Boolean(targetUrl && apiUrl);
  const sameFile = (actual, expected) => {
    try {
      return fs.realpathSync(actual) === fs.realpathSync(expected);
    } catch {
      return false;
    }
  };
  const failStage = (stage, reason) => {
    stage.status = "FAILED";
    stage.error_message = reason;
  };
  const load = (stage, key) => {
    const file = path.join(
      config.runDir,
      stage.stage_id,
      RECEIPTS[stage.stage_id][key],
    );
    try {
      const e = readReceipt(
        file,
        path.join(config.runDir, stage.stage_id),
        key === "sbom"
          ? 16 * 1024 * 1024
          : key === "capacity"
            ? 65536
            : 1024 * 1024,
      );
      const time =
        key === "sbom"
          ? e.metadata?.timestamp
          : ["deployment", "restore"].includes(key)
            ? e.drill_timestamp
            : e.timestamp;
      if (
        !validSummaryFields(key, e) ||
        !freshTimestamp(time, startedAt, endedAt) ||
        (TYPES[key] && e.drill_type !== TYPES[key]) ||
        (key === "sbom" &&
          (e.bomFormat !== "CycloneDX" || e.specVersion !== "1.5"))
      )
        throw Error("invalid receipt contract");
      return e;
    } catch {
      failStage(stage, "required receipt invalid or unavailable");
      return null;
    }
  };
  const staticStage = stages.find((s) => s.stage_id === "static_templates");
  const staticEvidence = load(staticStage, "static");
  const staticPassed =
    staticStage?.status === "PASSED" &&
    validateStaticEvidence(staticEvidence).valid;
  const staticIntegrityBaseline = staticPassed
    ? {
        status: "verified",
        totalChecks: staticEvidence.totalChecks,
        passedChecks: staticEvidence.passedChecks,
        failedChecks: staticEvidence.failedChecks,
        checks: staticEvidence.checks.map(({ id, passed, exitCode }) => ({
          id,
          passed,
          exitCode,
        })),
      }
    : {
        status: "breached",
        error_message:
          "stage 1 failed or child static integrity evidence failed verification",
      };
  if (!staticPassed)
    failStage(staticStage, "static receipt failed verification");
  const staticIntegrityCompliance = staticPassed ? "passed" : "failed";

  const capStage = stages.find((s) => s.stage_id === "capacity_alerting");
  const capEvidence = load(capStage, "capacity");

  const verifiedDatabase = databaseBaseline(
    capEvidence,
    targetUrl,
    startedAt,
    endedAt,
    dryRun,
  );
  const capValid = Boolean(
    validCapacityChildren(capEvidence, dryRun, apiUrl, startedAt, endedAt) &&
    verifiedDatabase &&
    capStage?.status === "PASSED" &&
    capEvidence &&
    capEvidence.status === "success" &&
    Array.isArray(capEvidence.failures) &&
    capEvidence.failures.length === 0 &&
    capEvidence.summary?.capacitySloCompliance === "passed" &&
    capEvidence.summary?.alertVerification === "passed" &&
    capEvidence.summary?.dosResilience === "passed" &&
    capEvidence.summary?.databaseBaselineCompliance === "passed" &&
    capEvidence.databaseTelemetryBaseline?.status === "verified" &&
    (dryRun === "1"
      ? capEvidence.mode === "synthetic"
      : explicitLiveTargets &&
        capEvidence.mode === "live" &&
        capEvidence.targetId === targetId(new URL(targetUrl).href) &&
        capEvidence.apiTargetId === targetId(new URL(apiUrl).origin) &&
        capEvidence.capacity?.mode === "live" &&
        capEvidence.capacity?.targetUrl === targetId(new URL(targetUrl).href) &&
        capEvidence.databaseTelemetryBaseline?.source ===
          "prometheus-live-scrape"),
  );
  if (!capValid)
    failStage(
      capStage,
      "stage 6 child missing, synthetic, failed, or mismatched live target/telemetry",
    );

  const dbCompliancePassed = Boolean(
    capStage?.status === "PASSED" &&
    capEvidence?.summary?.databaseBaselineCompliance === "passed" &&
    capEvidence?.databaseTelemetryBaseline?.status === "verified",
  );

  const databaseTelemetryBaseline =
    capValid && verifiedDatabase ? verifiedDatabase : { status: "breached" };

  const alertVerification =
    capValid && capEvidence?.summary?.alertVerification === "passed"
      ? "passed"
      : "failed";
  const dosResilience =
    capValid && capEvidence?.summary?.dosResilience === "passed"
      ? "passed"
      : "failed";

  const drStage = stages.find((s) => s.stage_id === "disaster_recovery");
  const restoreEvidence = load(drStage, "restore");
  const reconcileEvidence = load(drStage, "reconcile");

  const restorePassed = Boolean(
    drStage?.status === "PASSED" &&
    restoreEvidence &&
    restoreEvidence.rto_compliant === true &&
    restoreEvidence.record_parity_verified === true &&
    restoreEvidence.postgis_verified === true &&
    restoreEvidence.foreign_keys_verified === true &&
    typeof restoreEvidence.tables_source === "number" &&
    restoreEvidence.tables_source === restoreEvidence.tables_restored &&
    typeof restoreEvidence.migrations_source === "number" &&
    restoreEvidence.migrations_source === restoreEvidence.migrations_restored &&
    restoreEvidence.status === "success",
  );

  const reconcilePassed = Boolean(
    drStage?.status === "PASSED" &&
    reconcileEvidence &&
    reconcileEvidence.summary &&
    reconcileEvidence.summary.status !== "error" &&
    reconcileEvidence.summary.missingObjects === 0 &&
    reconcileEvidence.summary.mismatchedObjects === 0 &&
    reconcileEvidence.summary.exitCode === 0,
  );

  let disasterRecoveryBaseline;
  if (restorePassed && reconcilePassed) {
    disasterRecoveryBaseline = {
      status: "verified",
      restoreDrill: {
        rtoSeconds: restoreEvidence.duration_seconds,
        rtoTargetSeconds: restoreEvidence.rto_target_seconds,
        rtoCompliant: restoreEvidence.rto_compliant,
        tablesSource: restoreEvidence.tables_source,
        tablesRestored: restoreEvidence.tables_restored,
        migrationsSource: restoreEvidence.migrations_source,
        migrationsRestored: restoreEvidence.migrations_restored,
        postgisVerified: restoreEvidence.postgis_verified,
        foreignKeysVerified: restoreEvidence.foreign_keys_verified,
        recordParityVerified: restoreEvidence.record_parity_verified,
      },
      storageReconciliation: {
        totalDatabaseObjects: reconcileEvidence.summary.totalDatabaseObjects,
        totalBucketObjects: reconcileEvidence.summary.totalBucketObjects,
        matchedObjects: reconcileEvidence.summary.matchedObjects,
        missingObjects: reconcileEvidence.summary.missingObjects,
        orphanObjects: reconcileEvidence.summary.orphanObjects,
        mismatchedObjects: reconcileEvidence.summary.mismatchedObjects,
        status: reconcileEvidence.summary.status,
      },
    };
  } else {
    disasterRecoveryBaseline = {
      status: "breached",
      error_message:
        drStage?.error_message ||
        "stage 7 failed or child evidence failed verification",
    };
  }

  if (!restorePassed || !reconcilePassed)
    failStage(drStage, "recovery receipts failed verification");
  const restoreCompliance = restorePassed ? "passed" : "failed";
  const reconcileCompliance = reconcilePassed ? "passed" : "failed";

  const depStage = stages.find((s) => s.stage_id === "ingress_deployment");
  const depEvidence = load(depStage, "deployment");
  const caddyEvidence = load(depStage, "caddy");

  const caddyIsExample = path.basename(caddyfile) === "Caddyfile.example";
  const targetBound = Boolean(
    caddyEvidence &&
    depEvidence &&
    sameFile(caddyEvidence.targetPath, caddyfile) &&
    sameFile(depEvidence.caddyfile, caddyfile) &&
    sameFile(depEvidence.compose_file, composeFile),
  );
  const productionCandidate =
    explicitLiveTargets || !caddyIsExample || allowHsts === "1";
  const liveIngressValid =
    !productionCandidate ||
    Boolean(
      explicitLiveTargets &&
      !caddyIsExample &&
      allowHsts === "1" &&
      caddyEvidence?.hstsApproved === true &&
      typeof caddyEvidence.domain === "string" &&
      caddyEvidence.domain.includes(".") &&
      caddyEvidence.domain !== "example.com" &&
      caddyEvidence.domain.toLowerCase() ===
        new URL(targetUrl).hostname.toLowerCase() &&
      depEvidence?.probe_live_tested === true &&
      depEvidence.dry_run === false &&
      depEvidence.api_target_id === targetId(new URL(apiUrl).href),
    );
  const routesValid = Boolean(
    caddyEvidence &&
    Array.isArray(caddyEvidence.errors) &&
    caddyEvidence.errors.length === 0 &&
    Number.isInteger(caddyEvidence.routesPassed) &&
    caddyEvidence.routesPassed >= 12 &&
    caddyEvidence.routesPassed === caddyEvidence.routesEvaluated &&
    depEvidence?.caddy_routes_tested >= 12,
  );
  if (!targetBound || !routesValid || !liveIngressValid) {
    failStage(
      depStage,
      "stage 3 child missing, mismatched config, insufficient routes, or unverified live ingress",
    );
  }

  const caddyPassed = Boolean(
    caddyEvidence &&
    caddyEvidence.status === "success" &&
    caddyEvidence.valid === true &&
    caddyEvidence.securityHeadersVerified === true &&
    caddyEvidence.s3SigV4HostPreserved === true &&
    caddyEvidence.proxyHeadersVerified === true,
  );

  const depPassed = Boolean(
    depStage?.status === "PASSED" &&
    depEvidence &&
    depEvidence.status === "success" &&
    depEvidence.schema_backward_compatible === true &&
    depEvidence.caddy_routing_verified === true &&
    depEvidence.rollback_procedure_verified === true &&
    depEvidence.network_isolation_verified === true &&
    caddyPassed &&
    targetBound &&
    routesValid &&
    liveIngressValid,
  );

  let deploymentBaseline;
  if (depPassed) {
    deploymentBaseline = {
      status: "verified",
      schemaBackwardCompatible: depEvidence.schema_backward_compatible,
      caddyRoutingVerified: depEvidence.caddy_routing_verified,
      rollbackProcedureVerified: depEvidence.rollback_procedure_verified,
      networkIsolationVerified: depEvidence.network_isolation_verified,
      migrationCount: depEvidence.migration_count,
      routesTested: depEvidence.caddy_routes_tested,
    };
  } else {
    deploymentBaseline = {
      status: "breached",
      error_message:
        depStage?.error_message ||
        "stage 3 failed or child deployment evidence failed verification",
    };
  }

  if (!depPassed)
    failStage(depStage, "deployment receipts failed verification");
  const deploymentCompliance = depPassed ? "passed" : "failed";
  const rollbackCompliance =
    depPassed && depEvidence?.rollback_procedure_verified === true
      ? "passed"
      : "failed";

  const secStage = stages.find((s) => s.stage_id === "secret_rotation");
  const secEvidence = load(secStage, "rotation");

  const secPassed = Boolean(
    secStage?.status === "PASSED" &&
    secEvidence &&
    secEvidence.status === "success" &&
    Array.isArray(secEvidence.errors) &&
    secEvidence.errors.length === 0 &&
    secEvidence.steps?.session_rollover?.status === "passed" &&
    secEvidence.steps?.csrf_rollover?.status === "passed" &&
    secEvidence.steps?.database_rotation?.status === "passed" &&
    secEvidence.steps?.valkey_rotation?.status === "passed" &&
    secEvidence.steps?.storage_rotation?.status === "passed" &&
    secEvidence.steps?.compromise_response?.status === "passed" &&
    secEvidence.steps?.redaction_audit?.status === "passed" &&
    secEvidence.steps?.redaction_audit?.raw_secrets_masked === true &&
    secEvidence.steps?.redaction_audit?.zero_dev_passwords_detected === true,
  );

  let secretRotationBaseline;
  if (secPassed) {
    secretRotationBaseline = {
      status: "verified",
      steps: {
        sessionRollover: secEvidence.steps.session_rollover.status,
        csrfRollover: secEvidence.steps.csrf_rollover.status,
        databaseRotation: secEvidence.steps.database_rotation.status,
        valkeyRotation: secEvidence.steps.valkey_rotation.status,
        storageRotation: secEvidence.steps.storage_rotation.status,
        compromiseResponse: secEvidence.steps.compromise_response.status,
        redactionAudit: secEvidence.steps.redaction_audit.status,
      },
      redactionAudit: {
        rawSecretsMasked: secEvidence.steps.redaction_audit.raw_secrets_masked,
        zeroDevPasswordsDetected:
          secEvidence.steps.redaction_audit.zero_dev_passwords_detected,
      },
    };
  } else {
    secretRotationBaseline = {
      status: "breached",
      error_message:
        secStage?.error_message ||
        "stage 5 failed or child secret rotation evidence failed verification",
    };
  }

  if (!secPassed) failStage(secStage, "rotation receipt failed verification");
  const secretRotationCompliance = secPassed ? "passed" : "failed";

  const volStage = stages.find((s) => s.stage_id === "volume_encryption");
  const volEvidence = load(volStage, "volume");

  const volPassed = Boolean(
    volStage?.status === "PASSED" &&
    volEvidence &&
    volEvidence.status === "success" &&
    volEvidence.valid === true &&
    Array.isArray(volEvidence.errors) &&
    volEvidence.errors.length === 0 &&
    Array.isArray(volEvidence.evaluatedMounts) &&
    volEvidence.evaluatedMounts.length >= 9 &&
    volEvidence.evaluatedMounts.every((m) => m?.passed === true) &&
    volEvidence.keySeparation?.verified === true &&
    Array.isArray(volEvidence.keySeparation?.detectedViolations) &&
    volEvidence.keySeparation.detectedViolations.length === 0,
  );

  let volumeEncryptionBaseline;
  if (volPassed) {
    volumeEncryptionBaseline = {
      status: "verified",
      totalRequiredMounts: volEvidence.totalRequiredMounts,
      validMountsCount: volEvidence.validMountsCount,
      keySeparationVerified: volEvidence.keySeparation.verified,
      violationsDetected: volEvidence.keySeparation.detectedViolations.length,
      scannedPathsCount: Array.isArray(volEvidence.keySeparation.scannedPaths)
        ? volEvidence.keySeparation.scannedPaths.length
        : 0,
    };
  } else {
    volumeEncryptionBaseline = {
      status: "breached",
      error_message:
        volStage?.error_message ||
        "stage 4 failed or child volume encryption evidence failed verification",
    };
  }

  if (!volPassed) failStage(volStage, "volume receipt failed verification");
  const volumeEncryptionCompliance = volPassed ? "passed" : "failed";

  const scStage = stages.find((s) => s.stage_id === "supply_chain_sast");
  const sbomEvidence = load(scStage, "sbom");
  const sastEvidence = load(scStage, "sast");
  const containerEvidence = load(scStage, "container");

  const scPassed = Boolean(
    scStage?.status === "PASSED" &&
    sbomEvidence &&
    Array.isArray(sbomEvidence.components) &&
    sbomEvidence.components.length > 0 &&
    sbomEvidence.licenseCompliance?.compliant === true &&
    Array.isArray(sbomEvidence.licenseCompliance.violations) &&
    sbomEvidence.licenseCompliance.violations.length === 0 &&
    sastEvidence &&
    (sastEvidence.status === "success" || sastEvidence.passed === true) &&
    sastEvidence.passed === true &&
    Array.isArray(sastEvidence.blockingActiveFindings) &&
    sastEvidence.blockingActiveFindings.length === 0 &&
    Array.isArray(sastEvidence.expiredFindings) &&
    sastEvidence.expiredFindings.length === 0 &&
    containerEvidence &&
    (containerEvidence.status === "success" ||
      containerEvidence.valid === true) &&
    containerEvidence.valid === true &&
    Array.isArray(containerEvidence.errors) &&
    containerEvidence.errors.length === 0 &&
    Array.isArray(containerEvidence.checks) &&
    containerEvidence.checks.length > 0 &&
    containerEvidence.checks.every((c) => c?.passed === true),
  );

  let supplyChainBaseline;
  if (scPassed) {
    supplyChainBaseline = {
      status: "verified",
      sbom: {
        packagesCount: sbomEvidence.components.length,
        licenseComplianceVerified: sbomEvidence.licenseCompliance
          ? sbomEvidence.licenseCompliance.compliant
          : true,
        violationsCount:
          sbomEvidence.licenseCompliance?.violations?.length || 0,
      },
      sast: {
        filesScanned: sastEvidence.scannedFilesCount,
        totalFindingsCount: sastEvidence.totalFindingsCount,
        triagedFindingsCount: Array.isArray(sastEvidence.triagedFindings)
          ? sastEvidence.triagedFindings.length
          : 0,
        expiredFindingsCount: Array.isArray(sastEvidence.expiredFindings)
          ? sastEvidence.expiredFindings.length
          : 0,
        blockingActiveFindingsCount: Array.isArray(
          sastEvidence.blockingActiveFindings,
        )
          ? sastEvidence.blockingActiveFindings.length
          : 0,
        passed: sastEvidence.passed,
      },
      containerSecurity: {
        valid: containerEvidence.valid,
        totalChecks: Array.isArray(containerEvidence.checks)
          ? containerEvidence.checks.length
          : 0,
        passedChecks: Array.isArray(containerEvidence.checks)
          ? containerEvidence.checks.filter((c) => c.passed).length
          : 0,
        errorsCount: Array.isArray(containerEvidence.errors)
          ? containerEvidence.errors.length
          : 0,
      },
    };
  } else {
    supplyChainBaseline = {
      status: "breached",
      error_message:
        scStage?.error_message ||
        "stage 2 failed or child supply chain / SAST / container evidence failed verification",
    };
  }

  if (!scPassed)
    failStage(scStage, "supply chain receipts failed verification");
  const supplyChainCompliance = scPassed ? "passed" : "failed";
  const sastCompliance =
    scPassed && sastEvidence?.passed === true ? "passed" : "failed";
  const containerSecurityCompliance =
    scPassed && containerEvidence?.valid === true ? "passed" : "failed";

  const dossier = {
    version,
    timestamp,
    environment,
    overall_status: stages.every((s) => s.status === "PASSED")
      ? "PASSED"
      : "FAILED",
    total_stages: Number(total),
    passed_stages: stages.filter((s) => s.status === "PASSED").length,
    failed_stages: stages.filter((s) => s.status === "FAILED").length,
    duration_seconds: Number(durationS),
    stages,
    targets: {
      caddyfile: fileId(caddyfile),
      composeFile: fileId(composeFile),
      capacity: targetUrl ? targetId(new URL(targetUrl).href) : null,
      api: apiUrl ? targetId(new URL(apiUrl).href) : null,
      mode:
        dryRun === "1"
          ? "offline"
          : explicitLiveTargets
            ? "live-target-drill"
            : "default-drill",
    },
    staticIntegrityBaseline,
    supplyChainBaseline,
    databaseTelemetryBaseline,
    disasterRecoveryBaseline,
    deploymentBaseline,
    secretRotationBaseline,
    volumeEncryptionBaseline,
    summary: {
      staticIntegrity: stages[0].status === "PASSED" ? "passed" : "failed",
      staticIntegrityCompliance,
      supplyChainSecurity: stages[1].status === "PASSED" ? "passed" : "failed",
      supplyChainCompliance,
      sastCompliance,
      containerSecurityCompliance,
      ingressDeployment: depStage.status === "PASSED" ? "passed" : "failed",
      volumeEncryption: stages[3].status === "PASSED" ? "passed" : "failed",
      secretRotation: stages[4].status === "PASSED" ? "passed" : "failed",
      capacityAlerting: capStage.status === "PASSED" ? "passed" : "failed",
      disasterRecovery: stages[6].status === "PASSED" ? "passed" : "failed",
      sloCompliance:
        capStage.status === "PASSED"
          ? "capacity_alerts_verified"
          : "capacity_alerts_failed",
      recoveryCompliance:
        restoreCompliance === "passed" && reconcileCompliance === "passed"
          ? "restore_reconcile_verified"
          : "restore_reconcile_failed",
      alertVerification,
      dosResilience,
      databaseBaselineCompliance: dbCompliancePassed ? "passed" : "failed",
      restoreCompliance,
      reconcileCompliance,
      deploymentCompliance,
      rollbackCompliance,
      secretRotationCompliance,
      volumeEncryptionCompliance,
      noAiPosture: "preview_excluded_from_launch",
    },
  };
  return dossier;
}

function main(args) {
  const [command, outputPath, ...rest] = args;
  try {
    if (command === "prepare") prepareOutput(outputPath, rest[0]);
    else if (command === "release") releaseOutput(outputPath, rest[0]);
    else if (command === "assemble") {
      const [
        timestamp,
        seconds,
        idsRaw,
        descRaw,
        statusesRaw,
        msRaw,
        errorsRaw,
        logsRaw,
        caddyfile,
        composeFile,
        targetUrl,
        apiUrl,
        allowHsts,
        dryRun,
        start,
        end,
        runDir,
      ] = rest;
      const [ids, descriptions, statuses, durations, errors, logs] = [
        idsRaw,
        descRaw,
        statusesRaw,
        msRaw,
        errorsRaw,
        logsRaw,
      ].map(JSON.parse);
      const stages = ids.map((id, i) => ({
        stage_id: id,
        description: descriptions[i],
        status: statuses[i],
        duration_ms: durations[i],
        error_message: errors[i] || null,
        artifacts: [
          logs[i],
          ...Object.values(RECEIPTS[id]).map((name) =>
            path.join(runDir, id, name),
          ),
        ],
      }));
      const dossier = assemble({
        outputPath,
        timestamp,
        durationS: Number(seconds),
        caddyfile,
        composeFile,
        targetUrl,
        apiUrl,
        allowHsts,
        dryRun,
        startedAt: Number(start),
        endedAt: Number(end),
        runDir,
        stages,
      });
      publish(outputPath, dossier, runDir);
    } else throw Error("invalid command");
    return 0;
  } catch {
    console.error("launch dossier: operation failed");
    return 1;
  }
}
if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = {
  RECEIPTS,
  directory,
  freshTimestamp,
  readReceipt,
  prepareOutput,
  releaseOutput,
  publish,
  assemble,
};
