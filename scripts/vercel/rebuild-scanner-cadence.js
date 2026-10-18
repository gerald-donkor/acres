#!/usr/bin/env node
"use strict";

// Candidate-only ClamAV scanner snapshot preparation; never activates or retires.
// Never imported by application boot. See infra/vercel/README.md.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const {
  sandboxTarget,
  LIVE_BUILD_OIDC_MIN_REMAINING_MS,
  credentialsFor,
  scanShape,
  runChecked,
  signatureCheck,
  signaturesOk,
  EICAR,
  ADAPTER_SCAN_FLAGS,
  SNAPSHOT_ID,
} = require("./probe-platform");
const {
  buildSnapshot,
  classifyProviderError,
  projectBuildFailure,
  assertOutsideRepo,
  SNAPSHOT_EXPIRATION_MS,
} = require("./build-scanner-snapshot");

const CONTROL_TIMEOUT_MS = 30_000;
// Matches the app adapter's CREATE_TIMEOUT_MS.
const SMOKE_CREATE_TIMEOUT_MS = 60_000;
const SCAN_DIR = "/tmp/acres-scan";
const REPO_ROOT = path.resolve(__dirname, "../..");
const FRESHCLAM_CONF = path.join(
  REPO_ROOT,
  "infra/vercel/scanner/freshclam.conf",
);

/**
 * Parses CLI arguments for rebuild-scanner-cadence.
 */
function parseArgs(args) {
  const options = {
    help: false,
    dryRun: false,
    output: null,
    writeEnv: null,
    currentSnapshotId: null,
    maxAgeHours: 48,
    force: false,
    skipPrune: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--output" || arg === "-o") {
      if (!args[i + 1]) throw new Error(`Missing value for ${arg}`);
      options.output = args[++i];
    } else if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
    } else if (arg.startsWith("-o=")) {
      options.output = arg.slice("-o=".length);
    } else if (arg === "--write-env") {
      if (!args[i + 1]) throw new Error("Missing value for --write-env");
      options.writeEnv = args[++i];
    } else if (arg.startsWith("--write-env=")) {
      options.writeEnv = arg.slice("--write-env=".length);
    } else if (arg === "--current-snapshot-id") {
      if (!args[i + 1])
        throw new Error("Missing value for --current-snapshot-id");
      const id = args[++i];
      if (!SNAPSHOT_ID.test(id)) {
        throw new Error("--current-snapshot-id must be a Sandbox snapshot id.");
      }
      options.currentSnapshotId = id;
    } else if (arg.startsWith("--current-snapshot-id=")) {
      const id = arg.slice("--current-snapshot-id=".length);
      if (!SNAPSHOT_ID.test(id)) {
        throw new Error("--current-snapshot-id must be a Sandbox snapshot id.");
      }
      options.currentSnapshotId = id;
    } else if (arg === "--max-age-hours") {
      if (!args[i + 1]) throw new Error("Missing value for --max-age-hours");
      const val = args[++i];
      if (!/^[1-9]\d*$/.test(val) || Number(val) > 168) {
        throw new Error(
          "--max-age-hours must be a positive integer from 1 through 168.",
        );
      }
      options.maxAgeHours = Number(val);
    } else if (arg.startsWith("--max-age-hours=")) {
      const val = arg.slice("--max-age-hours=".length);
      if (!/^[1-9]\d*$/.test(val) || Number(val) > 168) {
        throw new Error(
          "--max-age-hours must be a positive integer from 1 through 168.",
        );
      }
      options.maxAgeHours = Number(val);
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--skip-prune") {
      options.skipPrune = true;
    } else {
      throw new Error("Unknown argument.");
    }
  }
  if (options.output === "" || options.writeEnv === "") {
    throw new Error("Scanner output path must not be empty.");
  }
  return options;
}

// Canonicalize parents before cloud work and again at exclusive creation.
// Existing outputs (including dangling symlinks) are never overwritten.
function outputPath(file, { outside = false, allowExisting = false } = {}) {
  try {
    const resolved = outside
      ? assertOutsideRepo(file)
      : path.join(
          fs.realpathSync(path.dirname(path.resolve(file))),
          path.basename(file),
        );
    if (!allowExisting && fs.lstatSync(resolved, { throwIfNoEntry: false })) {
      throw new Error();
    }
    return resolved;
  } catch {
    throw new Error("Scanner output path unavailable or already exists.");
  }
}

function writeExclusive(file, body, outside = false) {
  const target = outputPath(file, { outside });
  let fd;
  try {
    fd = fs.openSync(target, "wx", 0o600);
    fs.writeFileSync(fd, body);
  } catch {
    throw new Error("Scanner output creation failed.");
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function writeReceipt(filePath, receipt) {
  writeExclusive(filePath, JSON.stringify(receipt, null, 2) + "\n");
}

// This inspects snapshot metadata, never the CVD build date.
async function evaluateCadence(config, sdk, options = {}) {
  const unknown = {
    rebuildNeeded: true,
    reason: "stale_or_forced",
    ageHours: null,
  };
  if (options.dryRun) return { ...unknown, reason: "simulation_uninspected" };
  if (options.force || !options.currentSnapshotId) return unknown;
  let stored;
  try {
    stored = await sdk.Snapshot.get({
      ...credentialsFor(config),
      snapshotId: options.currentSnapshotId,
      signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
    });
  } catch {
    return unknown;
  }
  if (stored.status !== "created") return unknown;
  const created =
    stored.createdAt != null
      ? new Date(stored.createdAt).getTime()
      : stored.expiresAt != null
        ? new Date(stored.expiresAt).getTime() - SNAPSHOT_EXPIRATION_MS
        : NaN;
  const now = options.now ?? Date.now();
  if (!Number.isFinite(created) || created > now) return unknown;
  const ageHours = (now - created) / 3600000;
  return ageHours < (options.maxAgeHours ?? 48)
    ? { rebuildNeeded: false, reason: "snapshot_recent", ageHours }
    : { ...unknown, ageHours };
}

const SMOKE_STEPS = new Set([
  "smoke-create",
  "smoke-source",
  "smoke-signatures",
  "smoke-write",
  "smoke-scan-clean",
  "smoke-scan-eicar",
  "smoke-cleanup",
]);
const SMOKE_KINDS = new Set(["provider_failed", "result_failed"]);
const NO_PROVIDER_ERROR = Object.freeze({
  provider_error: null,
  provider_status: null,
  provider_code: null,
});
const SHA256 = /^[a-f0-9]{64}$/;
// Ends the primary checks after a recorded failure; never carries data.
const SMOKE_ABORT = Object.freeze({});

/**
 * Smoke tests a newly built snapshot without activating it: boots it as the
 * app adapter does, then verifies source, signature hashes, clean and EICAR.
 * Only the first failing step and a provider-error shape are recorded.
 */
async function smokeTestSnapshot(config, sdk, snapshotId, expected = {}) {
  const result = {
    signatures: "untested",
    clean_sample: "untested",
    eicar_sample: "untested",
    cleanup: "not_requested",
  };
  const classes = { APIError: sdk.APIError, StreamError: sdk.StreamError };
  let sandbox;
  let step = "smoke-create";
  let failure = null;
  const fail = (kind, provider = NO_PROVIDER_ERROR) => {
    failure ??= { step, kind, ...provider };
  };
  const provider = async (action) => {
    try {
      return await action();
    } catch (error) {
      fail("provider_failed", classifyProviderError(error, classes));
      throw SMOKE_ABORT;
    }
  };
  const check = (ok) => {
    if (ok) return;
    fail("result_failed");
    throw SMOKE_ABORT;
  };
  const scan = (file) =>
    provider(() =>
      runChecked(sandbox, {
        cmd: "clamscan",
        args: [...ADAPTER_SCAN_FLAGS, file],
        timeoutMs: 60_000,
      }),
    );
  const shape = (r, file) =>
    typeof r?.stdout === "string" ? scanShape(r.stdout, file) : "other";
  try {
    sandbox = await provider(() =>
      sdk.Sandbox.create({
        ...credentialsFor(config),
        source: { type: "snapshot", snapshotId },
        region: config.region,
        persistent: false,
        networkPolicy: "deny-all",
        timeout: 120_000,
        resources: { vcpus: 1 },
        signal: AbortSignal.timeout(SMOKE_CREATE_TIMEOUT_MS),
      }),
    );
    step = "smoke-source";
    check(sandbox?.sourceSnapshotId === snapshotId);
    step = "smoke-signatures";
    if (
      !SHA256.test(expected.mainSha256 ?? "") ||
      !SHA256.test(expected.dailySha256 ?? "")
    ) {
      result.signatures = "failed";
      check(false);
    }
    const signatures = await provider(() =>
      runChecked(
        sandbox,
        signatureCheck(config, {
          mainSha256: expected.mainSha256,
          dailySha256: expected.dailySha256,
          maxAgeHours: expected.maxAgeHours ?? 48,
        }),
      ),
    );
    result.signatures =
      typeof signatures?.stdout === "string" && signaturesOk(signatures)
        ? "passed"
        : "failed";
    check(result.signatures === "passed");
    step = "smoke-write";
    await provider(() =>
      sandbox.writeFiles([
        {
          path: `${SCAN_DIR}/clean.csv`,
          content: Buffer.from("region,value\nsynthetic,1\n"),
        },
        { path: `${SCAN_DIR}/eicar.txt`, content: EICAR },
      ]),
    );
    step = "smoke-scan-clean";
    const clean = await scan(`${SCAN_DIR}/clean.csv`);
    result.clean_sample =
      clean?.exitCode === 0 && shape(clean, `${SCAN_DIR}/clean.csv`) === "ok"
        ? "passed"
        : "failed";
    check(result.clean_sample === "passed");
    step = "smoke-scan-eicar";
    const infected = await scan(`${SCAN_DIR}/eicar.txt`);
    result.eicar_sample =
      infected?.exitCode === 1 &&
      shape(infected, `${SCAN_DIR}/eicar.txt`).startsWith("found:")
        ? "passed"
        : "failed";
    check(result.eicar_sample === "passed");
  } catch (error) {
    if (error !== SMOKE_ABORT) fail("unknown");
  }
  if (sandbox) {
    step = "smoke-cleanup";
    try {
      // Scan VMs use true; `baseSnapshotSurvived` proved it spares the source.
      await sandbox.delete({
        deleteOrphanSnapshots: true,
        signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
      });
      // The builder confirmed the candidate; a later loss is what this catches.
      const stored = await sdk.Snapshot.get({
        ...credentialsFor(config),
        snapshotId,
        signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
      });
      if (stored?.status === "created") result.cleanup = "passed";
      else {
        result.cleanup = "failed";
        fail("result_failed");
      }
    } catch (error) {
      result.cleanup = "failed";
      fail("provider_failed", classifyProviderError(error, classes));
    }
  }
  if (failure) {
    const error = new Error("candidate_smoke_failed");
    error.smokeTest = result;
    error.smokeFailure = failure;
    throw error;
  }
  return result;
}

// Allowlisted projection: values are source-owned, never provider text.
function projectSmokeFailure(error) {
  const state = error?.smokeFailure;
  return {
    step: SMOKE_STEPS.has(state?.step) ? state.step : "unknown",
    kind: SMOKE_KINDS.has(state?.kind) ? state.kind : "unknown",
    provider_error: state?.provider_error ?? null,
    provider_status: state?.provider_status ?? null,
    provider_code: state?.provider_code ?? null,
  };
}

/** Candidate preparation only. Every snapshot is retained, including failed candidates. */
async function rebuildCadence(config, sdk, options = {}) {
  const opts = { dryRun: false, maxAgeHours: 48, ...options };
  // Simulation may inspect a real env destination but must never write it.
  const envPath = opts.writeEnv
    ? outputPath(opts.writeEnv, { outside: true, allowExisting: opts.dryRun })
    : null;
  const receiptPath = opts.output ? outputPath(opts.output) : null;
  if (envPath && envPath === receiptPath) {
    throw new Error("Scanner output paths collide.");
  }
  const cadence = await evaluateCadence(config, sdk, opts);
  const receipt = {
    schema_version: 1,
    target: opts.dryRun
      ? null
      : {
          environment: "preview",
          team_id: config.teamId,
          project_id: config.projectId,
          region: config.region,
        },
    tool: "rebuild-scanner-cadence",
    timestamp: new Date().toISOString(),
    status: cadence.rebuildNeeded ? "success" : "skipped",
    rebuild_needed: cadence.rebuildNeeded,
    reason: cadence.reason,
    age_hours: cadence.ageHours,
    previous_snapshot_id: SNAPSHOT_ID.test(opts.currentSnapshotId ?? "")
      ? opts.currentSnapshotId
      : null,
    new_snapshot_id: null,
    main_sha256: null,
    daily_sha256: null,
    smoke_test: null,
    prune_status: opts.currentSnapshotId ? "retained" : "not_requested",
    activation_status: "not_performed",
    configuration_export: "not_performed",
    execution_mode: opts.dryRun ? "simulation" : "live",
  };
  let stage = "build";
  try {
    if (!opts.dryRun && cadence.rebuildNeeded) {
      // Observe the builder's confirmed ID even if later metadata/cleanup fails.
      const summary = await buildSnapshot(config, sdk, {
        onSnapshot: (id) => {
          receipt.new_snapshot_id = id;
        },
        persistentBuilder: false,
        freshclamConf: fs.readFileSync(FRESHCLAM_CONF, "utf8"),
        log: () => {},
      });
      if (
        !SNAPSHOT_ID.test(summary.snapshotId) ||
        !/^[a-f0-9]{64}$/.test(summary.main?.sha256 ?? "") ||
        !/^[a-f0-9]{64}$/.test(summary.daily?.sha256 ?? "")
      )
        throw new Error();
      receipt.new_snapshot_id = summary.snapshotId;
      receipt.main_sha256 = summary.main.sha256;
      receipt.daily_sha256 = summary.daily.sha256;
      stage = "smoke";
      receipt.smoke_test = await smokeTestSnapshot(
        config,
        sdk,
        summary.snapshotId,
        {
          mainSha256: summary.main.sha256,
          dailySha256: summary.daily.sha256,
          maxAgeHours: opts.maxAgeHours,
        },
      );
      if (envPath) {
        stage = "configuration_export";
        writeExclusive(
          envPath,
          `ACRES_SCANNER_SNAPSHOT_ID=${summary.snapshotId}\n` +
            `ACRES_SCANNER_MAIN_SHA256=${summary.main.sha256}\n` +
            `ACRES_SCANNER_DAILY_SHA256=${summary.daily.sha256}\n`,
          true,
        );
        receipt.configuration_export = "exported";
      }
    }
  } catch (error) {
    receipt.status = "failed";
    receipt.error = `candidate_${stage}_failed`;
    if (stage === "build")
      receipt.build_failure = projectBuildFailure(
        error,
        receipt.new_snapshot_id,
      );
    if (stage === "smoke") {
      receipt.smoke_test = error.smokeTest ?? null;
      receipt.smoke_failure = projectSmokeFailure(error);
    }
  }
  if (receiptPath) {
    try {
      writeReceipt(receiptPath, receipt);
    } catch {
      receipt.status = "failed";
      receipt.receipt_status = "failed";
      receipt.error ??= "candidate_receipt_failed";
    }
  }
  if (receipt.status === "failed") {
    const error = new Error(receipt.error);
    error.receipt = receipt;
    throw error;
  }
  return receipt;
}

/**
 * Main entry point.
 */
async function main(args = process.argv.slice(2), env = process.env, sdk) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(
      "Usage: node scripts/vercel/rebuild-scanner-cadence.js [options]\n" +
        "Options:\n" +
        "  --help, -h                  Show this help message\n" +
        "  --dry-run                   Simulate without cloud mutations\n" +
        "  --output, -o <file>         Write JSON audit receipt to file\n" +
        "  --write-env <file>          Create new candidate env outside repo (live only)\n" +
        "  --current-snapshot-id <id>  Snapshot ID for age inspection only\n" +
        "  --max-age-hours <hours>     Snapshot age in hours (default: 48, max: 168)\n" +
        "  --force                     Force candidate build regardless of snapshot age\n" +
        "  --skip-prune                Deprecated no-op; all snapshots are retained",
    );
    return;
  }

  if (!options.currentSnapshotId && env.ACRES_SCANNER_SNAPSHOT_ID?.trim()) {
    const envSnap = env.ACRES_SCANNER_SNAPSHOT_ID.trim();
    if (SNAPSHOT_ID.test(envSnap)) {
      options.currentSnapshotId = envSnap;
    }
  }

  const config = options.dryRun
    ? {
        teamId: "dry-run",
        projectId: "dry-run",
        region: "iad1",
        auth: "token",
        token: "dry-run",
      }
    : sandboxTarget(env, {
        minRemainingMs: LIVE_BUILD_OIDC_MIN_REMAINING_MS,
      });

  const provider = options.dryRun
    ? undefined
    : (sdk ??
      createRequire(path.resolve(__dirname, "../../server/package.json"))(
        "@vercel/sandbox",
      ));
  const receipt = await rebuildCadence(config, provider, {
    ...options,
    log: () => {},
  });

  console.log(JSON.stringify(receipt));
}

module.exports = {
  CONTROL_TIMEOUT_MS,
  SCAN_DIR,
  REPO_ROOT,
  FRESHCLAM_CONF,
  parseArgs,
  writeReceipt,
  evaluateCadence,
  smokeTestSnapshot,
  projectSmokeFailure,
  rebuildCadence,
  main,
};

if (require.main === module) {
  main().catch((error) => {
    if (error.receipt) console.log(JSON.stringify(error.receipt));
    console.error(
      "Scanner candidate preparation failed; activation not performed. Check restricted provider state and retained snapshots.",
    );
    process.exitCode = 1;
  });
}
