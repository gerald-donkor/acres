#!/usr/bin/env node
"use strict";

// Automated, zero-downtime ClamAV scanner snapshot rebuild cadence tool.
// Never imported by application boot. See infra/vercel/README.md.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const {
  sandboxTarget,
  credentialsFor,
  scanShape,
  EICAR,
  ADAPTER_SCAN_FLAGS,
  SNAPSHOT_ID,
} = require("./probe-platform");
const {
  buildSnapshot,
  replaceSnapshot,
  assertOutsideRepo,
  writeScannerEnv,
  BuildError,
  SNAPSHOT_EXPIRATION_MS,
} = require("./build-scanner-snapshot");

const CONTROL_TIMEOUT_MS = 30_000;
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
      if (!args[i + 1]) throw new Error("Missing value for --current-snapshot-id");
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
  return options;
}

/**
 * Writes structured audit receipt to disk with 0600 mode.
 */
function writeReceipt(filePath, receipt) {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(receipt, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.chmodSync(target, 0o600);
}

/**
 * Evaluates whether signature rebuild is needed based on age threshold or flags.
 */
async function evaluateCadence(config, sdk, options = {}) {
  const currentTime = options.now ?? Date.now();

  if (options.dryRun) {
    if (options.force) {
      return { rebuildNeeded: true, reason: "stale_or_forced", ageHours: 0 };
    }
    if (!options.currentSnapshotId) {
      return { rebuildNeeded: true, reason: "stale_or_forced", ageHours: null };
    }
    const simulatedAgeHours = 12;
    if (simulatedAgeHours <= options.maxAgeHours) {
      return {
        rebuildNeeded: false,
        reason: "signatures_fresh",
        ageHours: simulatedAgeHours,
      };
    }
    return {
      rebuildNeeded: true,
      reason: "stale_or_forced",
      ageHours: simulatedAgeHours,
    };
  }

  if (options.force) {
    let ageHours = null;
    if (options.currentSnapshotId) {
      try {
        const credentials = credentialsFor(config);
        const stored = await sdk.Snapshot.get({
          ...credentials,
          snapshotId: options.currentSnapshotId,
          signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
        });
        const created = stored.createdAt
          ? new Date(stored.createdAt).getTime()
          : stored.expiresAt
            ? new Date(stored.expiresAt).getTime() - SNAPSHOT_EXPIRATION_MS
            : null;
        if (created && Number.isFinite(created)) {
          ageHours = Math.max(0, (currentTime - created) / 3600000);
        }
      } catch {
        // Ignored under force
      }
    }
    return { rebuildNeeded: true, reason: "stale_or_forced", ageHours };
  }

  if (!options.currentSnapshotId) {
    return { rebuildNeeded: true, reason: "stale_or_forced", ageHours: null };
  }

  let stored;
  try {
    const credentials = credentialsFor(config);
    stored = await sdk.Snapshot.get({
      ...credentials,
      snapshotId: options.currentSnapshotId,
      signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
    });
  } catch {
    return { rebuildNeeded: true, reason: "stale_or_forced", ageHours: null };
  }

  if (stored.status !== "created") {
    return { rebuildNeeded: true, reason: "stale_or_forced", ageHours: null };
  }

  const created = stored.createdAt
    ? new Date(stored.createdAt).getTime()
    : stored.expiresAt
      ? new Date(stored.expiresAt).getTime() - SNAPSHOT_EXPIRATION_MS
      : null;

  if (!created || !Number.isFinite(created)) {
    return { rebuildNeeded: true, reason: "stale_or_forced", ageHours: null };
  }

  const ageHours = Math.max(0, (currentTime - created) / 3600000);
  if (ageHours <= options.maxAgeHours) {
    return {
      rebuildNeeded: false,
      reason: "signatures_fresh",
      ageHours,
    };
  }

  return {
    rebuildNeeded: true,
    reason: "stale_or_forced",
    ageHours,
  };
}

/**
 * Smoke tests a newly built snapshot via clean and EICAR scans before pruning.
 */
async function smokeTestSnapshot(config, sdk, snapshotId) {
  const credentials = credentialsFor(config);
  const sandbox = await sdk.Sandbox.create({
    ...credentials,
    snapshotId,
    region: config.region,
    timeout: 120_000,
    networkPolicy: "deny-all",
  });
  try {
    await sandbox.writeFiles([
      {
        path: `${SCAN_DIR}/clean.csv`,
        content: Buffer.from("region,value\nsynthetic,1\n"),
      },
      { path: `${SCAN_DIR}/eicar.txt`, content: EICAR },
    ]);
    const scan = async (file) => {
      const r = await sandbox.runCommand({
        cmd: "clamscan",
        args: [...ADAPTER_SCAN_FLAGS, file],
        timeoutMs: 60_000,
      });
      const stdout = await r.stdout();
      return { exitCode: r.exitCode, stdout, shape: scanShape(stdout, file) };
    };
    const clean = await scan(`${SCAN_DIR}/clean.csv`);
    const infected = await scan(`${SCAN_DIR}/eicar.txt`);
    if (
      clean.exitCode !== 0 ||
      clean.shape !== "ok" ||
      infected.exitCode !== 1 ||
      !infected.shape.startsWith("found:")
    ) {
      throw new BuildError(
        "smoke-test-failed",
        `clean(exit=${clean.exitCode}, shape=${clean.shape}), eicar(exit=${infected.exitCode}, shape=${infected.shape})`,
      );
    }
    return { clean_sample: "passed", eicar_sample: "passed" };
  } finally {
    try {
      await sandbox.delete({
        deleteOrphanSnapshots: false,
        signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
      });
    } catch {
      // Best-effort probe cleanup
    }
  }
}

/**
 * Rebuild cadence orchestrator: build new -> verify healthy -> switch -> prune old.
 */
async function rebuildCadence(config, sdk, options = {}) {
  const opts = {
    dryRun: false,
    output: null,
    writeEnv: null,
    currentSnapshotId: null,
    maxAgeHours: 48,
    force: false,
    skipPrune: false,
    log: () => {},
    ...options,
  };

  if (opts.writeEnv) {
    assertOutsideRepo(opts.writeEnv);
  }

  const cadence = await evaluateCadence(config, sdk, opts);

  if (!cadence.rebuildNeeded) {
    const skippedReceipt = {
      tool: "rebuild-scanner-cadence",
      timestamp: new Date().toISOString(),
      status: "skipped",
      rebuild_needed: false,
      reason: cadence.reason,
      age_hours: cadence.ageHours,
      previous_snapshot_id: opts.currentSnapshotId,
      new_snapshot_id: null,
      main_sha256: null,
      daily_sha256: null,
      smoke_test: null,
      prune_status: "none",
      execution_mode: opts.dryRun ? "simulation" : "live",
    };
    if (opts.output) {
      writeReceipt(opts.output, skippedReceipt);
    }
    return skippedReceipt;
  }

  if (opts.dryRun) {
    const simulatedSnapshotId = `snap_simulated_${Date.now()}`;
    const simulatedSummary = {
      snapshotId: simulatedSnapshotId,
      main: { sha256: "0".repeat(64) },
      daily: { sha256: "1".repeat(64) },
    };
    if (opts.writeEnv) {
      writeScannerEnv(opts.writeEnv, simulatedSummary);
    }
    const pruneStatus = opts.skipPrune
      ? "skipped"
      : opts.currentSnapshotId
        ? "pruned"
        : "none";
    const receipt = {
      tool: "rebuild-scanner-cadence",
      timestamp: new Date().toISOString(),
      status: "success",
      rebuild_needed: true,
      reason: cadence.reason,
      age_hours: cadence.ageHours,
      previous_snapshot_id: opts.currentSnapshotId,
      new_snapshot_id: simulatedSnapshotId,
      main_sha256: simulatedSummary.main.sha256,
      daily_sha256: simulatedSummary.daily.sha256,
      smoke_test: { clean_sample: "passed", eicar_sample: "passed" },
      prune_status: pruneStatus,
      execution_mode: "simulation",
    };
    if (opts.output) {
      writeReceipt(opts.output, receipt);
    }
    return receipt;
  }

  let summary;
  let smokeTest;
  try {
    summary = await buildSnapshot(config, sdk, {
      persistentBuilder: false,
      freshclamConf: fs.readFileSync(FRESHCLAM_CONF, "utf8"),
      log: opts.log,
    });
    smokeTest = await smokeTestSnapshot(config, sdk, summary.snapshotId);
  } catch (error) {
    const failedReceipt = {
      tool: "rebuild-scanner-cadence",
      timestamp: new Date().toISOString(),
      status: "failed",
      rebuild_needed: true,
      reason: cadence.reason,
      age_hours: cadence.ageHours,
      previous_snapshot_id: opts.currentSnapshotId,
      new_snapshot_id: summary?.snapshotId ?? null,
      main_sha256: summary?.main?.sha256 ?? null,
      daily_sha256: summary?.daily?.sha256 ?? null,
      smoke_test: smokeTest ?? {
        clean_sample: "failed",
        eicar_sample: "untested",
      },
      prune_status: "none",
      execution_mode: "live",
      error:
        error instanceof BuildError
          ? error.message
          : "Scanner snapshot build failed.",
    };
    if (opts.output) {
      try {
        writeReceipt(opts.output, failedReceipt);
      } catch {
        // Secondary write error ignored
      }
    }
    throw error;
  }

  if (opts.writeEnv) {
    writeScannerEnv(opts.writeEnv, summary);
  }

  let pruneStatus = "none";
  if (opts.currentSnapshotId && !opts.skipPrune) {
    try {
      await replaceSnapshot(
        config,
        sdk,
        opts.currentSnapshotId,
        summary.snapshotId,
      );
      pruneStatus = "pruned";
    } catch (pruneError) {
      pruneStatus = "failed";
      const pruneFailedReceipt = {
        tool: "rebuild-scanner-cadence",
        timestamp: new Date().toISOString(),
        status: "failed",
        rebuild_needed: true,
        reason: cadence.reason,
        age_hours: cadence.ageHours,
        previous_snapshot_id: opts.currentSnapshotId,
        new_snapshot_id: summary.snapshotId,
        main_sha256: summary.main.sha256,
        daily_sha256: summary.daily.sha256,
        smoke_test: smokeTest,
        prune_status: "failed",
        execution_mode: "live",
        error:
          pruneError instanceof BuildError
            ? pruneError.message
            : "Prune of previous snapshot failed.",
      };
      if (opts.output) {
        try {
          writeReceipt(opts.output, pruneFailedReceipt);
        } catch {
          // Secondary write error ignored
        }
      }
      throw pruneError;
    }
  } else if (opts.skipPrune) {
    pruneStatus = "skipped";
  }

  const receipt = {
    tool: "rebuild-scanner-cadence",
    timestamp: new Date().toISOString(),
    status: "success",
    rebuild_needed: true,
    reason: cadence.reason,
    age_hours: cadence.ageHours,
    previous_snapshot_id: opts.currentSnapshotId,
    new_snapshot_id: summary.snapshotId,
    main_sha256: summary.main.sha256,
    daily_sha256: summary.daily.sha256,
    smoke_test: smokeTest,
    prune_status: pruneStatus,
    execution_mode: "live",
  };

  if (opts.output) {
    writeReceipt(opts.output, receipt);
  }

  return receipt;
}

/**
 * Main entry point.
 */
async function main(
  args = process.argv.slice(2),
  env = process.env,
  sdk = createRequire(path.resolve(__dirname, "../../server/package.json"))(
    "@vercel/sandbox",
  ),
) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(
      "Usage: node scripts/vercel/rebuild-scanner-cadence.js [options]\n" +
        "Options:\n" +
        "  --help, -h                  Show this help message\n" +
        "  --dry-run                   Simulate without cloud mutations\n" +
        "  --output, -o <file>         Write JSON audit receipt to file\n" +
        "  --write-env <file>          Write updated scanner.env to outside-repo path\n" +
        "  --current-snapshot-id <id>  Active snapshot ID to evaluate or prune\n" +
        "  --max-age-hours <hours>     Threshold age in hours (default: 48, max: 168)\n" +
        "  --force                     Force rebuild regardless of signature age\n" +
        "  --skip-prune                Do not prune previous snapshot after rebuild",
    );
    return;
  }

  if (options.writeEnv) {
    assertOutsideRepo(options.writeEnv);
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
    : sandboxTarget(env);

  const receipt = await rebuildCadence(config, sdk, {
    ...options,
    log: (line) => console.error(line),
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
  rebuildCadence,
  main,
};

if (require.main === module) {
  main().catch((error) => {
    if (error instanceof BuildError) {
      console.error(error.message);
      if (error.detail) console.error(error.detail);
    } else {
      const status = error?.response?.status;
      const name = error?.constructor?.name;
      console.error(
        "Scanner snapshot rebuild failed or lacks required configuration.",
        `(${/^\w{1,40}$/.test(name ?? "") ? name : "Error"}${Number.isInteger(status) ? `, HTTP ${status}` : ""})`,
      );
    }
    process.exitCode = 1;
  });
}
