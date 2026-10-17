#!/usr/bin/env node
"use strict";

// Explicit opt-in: builds the hosted scanner as a Vercel Sandbox snapshot.
// Never imported by application boot. See infra/vercel/README.md.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const {
  sandboxTarget,
  credentialsFor,
  SIGNATURE_CHECK,
  SNAPSHOT_ID,
  scanShape,
  signaturesOk,
  EICAR,
  ADAPTER_SCAN_FLAGS,
} = require("./probe-platform");

const CLAMAV_DEB_URL =
  "https://github.com/Cisco-Talos/clamav/releases/download/clamav-1.5.4/clamav-1.5.4.linux.x86_64.deb";
const CLAMAV_DEB_SHA256 =
  "28d6efc5b4423e7830c3559339552eb53870a9eac51ac4efb37d60530d329886";
const BASE_IMAGE = "vercel/sandbox/node:24";
// Longer than the 168 h signature-age ceiling, so expiry is never the first failure.
const SNAPSHOT_EXPIRATION_MS = 8 * 24 * 3600 * 1000;

// Hosts the downloads need, resolved 2026-10-15: GitHub answers the release
// URL with a 302 to release-assets.githubusercontent.com. Domain rules are
// SNI-based. The builder holds no customer bytes.
const BUILDER_EGRESS = {
  allow: [
    "github.com",
    "release-assets.githubusercontent.com",
    "database.clamav.net",
  ],
};
const BUILDER_TIMEOUT_MS = 900_000;
const CONTROL_TIMEOUT_MS = 30_000;
const SNAPSHOT_TIMEOUT_MS = 300_000;
const SMOKE_MAX_AGE_HOURS = 48;
const REPO_ROOT = path.resolve(__dirname, "../..");
const FRESHCLAM_CONF = path.join(
  REPO_ROOT,
  "infra/vercel/scanner/freshclam.conf",
);
const BUILD_DIR = "/tmp/acres-build";
const SCAN_DIR = "/tmp/acres-scan";
const STEP_OK = "acres-step-ok";

// Runs inside the builder VM: streams the package to disk and hashes it.
// Exit 2 is a digest mismatch; only the marker line counts as success.
const FETCH_SCRIPT = `
const fs = require('node:fs');
const crypto = require('node:crypto');
const [url, out, want] = process.argv.slice(2);
(async () => {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(300000) });
  if (!res.ok || !res.body) process.exit(3);
  const hash = crypto.createHash('sha256');
  const file = fs.createWriteStream(out, { mode: 0o600 });
  for await (const chunk of res.body) {
    hash.update(chunk);
    if (!file.write(chunk)) await new Promise((r) => file.once('drain', r));
  }
  await new Promise((resolve, reject) => file.end((e) => (e ? reject(e) : resolve())));
  if (hash.digest('hex') !== want) process.exit(2);
  process.stdout.write('deb-sha256-ok\\n');
})().catch(() => process.exit(4));
`;

// Only source-owned classifications cross the CLI/receipt boundary. Never inspect
// arbitrary exception properties (even getters may throw or disclose secrets).
const FAILURE_STEPS = new Set([
  "builder-create",
  "record-environment",
  "prepare",
  "write-build-inputs",
  "deb-download",
  "deb-digest-mismatch",
  "dpkg-install",
  "database-owner",
  "freshclam",
  "record-scanner",
  "smoke-prepare",
  "smoke-signatures",
  "write-smoke-inputs",
  "smoke-scan",
  "scrub",
  "snapshot-request",
  "builder-delete",
  "snapshot-metadata",
  "snapshot-status",
  "summary",
  "replace-same-id",
  "replace-lookup",
  "replace-confirm",
]);
const FAILURE_KINDS = new Set([
  "command_failed",
  "provider_failed",
  "validation_failed",
]);
const failures = new WeakMap();

class BuildError extends Error {
  constructor(step, _detail = "", kind = "command_failed") {
    const safeStep = FAILURE_STEPS.has(step) ? step : "unknown";
    super(`Snapshot build failed at step: ${safeStep}.`);
    this.name = "BuildError";
    failures.set(this, {
      step: safeStep,
      kind: FAILURE_KINDS.has(kind) ? kind : "unknown",
      builder_cleanup: "unknown",
      snapshot_confirmed: false,
    });
  }
}

function projectBuildFailure(error, confirmedId = undefined) {
  const state = failures.get(error);
  return {
    step: state?.step ?? "unknown",
    kind: state?.kind ?? "unknown",
    builder_cleanup: state?.builder_cleanup ?? "unknown",
    snapshot_confirmed:
      confirmedId === undefined
        ? (state?.snapshot_confirmed ?? false)
        : typeof confirmedId === "string" && SNAPSHOT_ID.test(confirmedId),
  };
}

async function buildStep(step, kind, action) {
  try {
    return await action();
  } catch (error) {
    throw failures.has(error) ? error : new BuildError(step, "", kind);
  }
}

// Execute and read command output inside the same classified boundary.
async function command(sandbox, step, options) {
  return buildStep(step, "provider_failed", async () => {
    const result = await sandbox.runCommand(options);
    const stdout = await result.stdout();
    if (typeof stdout !== "string")
      throw new BuildError(step, "", "validation_failed");
    return { exitCode: result.exitCode, stdout };
  });
}

/**
 * One bash step. Success needs exit 0 **and** the marker line, because SDK
 * 3.8.0 reports a missing exit code as 0.
 */
async function must(sandbox, step, script, { sudo = false, timeoutMs }) {
  const result = await command(sandbox, step, {
    cmd: "bash",
    args: ["-c", `set -euo pipefail\n${script}\necho ${STEP_OK}`],
    ...(sudo ? { sudo: true } : {}),
    timeoutMs,
  });
  const stdout = result.stdout;
  if (result.exitCode !== 0 || !stdout.includes(STEP_OK)) {
    throw new BuildError(step);
  }
  return stdout;
}

const field = (text, key) => text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1];

function cvdInfo(text, name) {
  const block = text.split(`== ${name}\n`)[1]?.split("\n== ")[0] ?? "";
  return {
    version: block.match(/^Version:\s*(\d+)$/m)?.[1] ?? null,
    buildTime: block.match(/^Build time:\s*(.+)$/m)?.[1]?.trim() ?? null,
  };
}

function sha256Of(text, name) {
  return (
    text.match(new RegExp(`^([a-f0-9]{64})\\s+\\S*/${name}$`, "m"))?.[1] ?? null
  );
}

async function installAndVerify(sandbox, freshclamConf) {
  const env = await must(
    sandbox,
    "record-environment",
    '. /etc/os-release\necho "os=$ID $VERSION_ID"\necho "node=$(node --version)"\necho "uid=$(id -u)"\n' +
      'for t in curl gpg sudo; do if command -v "$t" >/dev/null; then echo "$t=1"; else echo "$t=0"; fi; done',
    { timeoutMs: 30_000 },
  );
  await must(sandbox, "prepare", `mkdir -p ${BUILD_DIR}`, {
    timeoutMs: 10_000,
  });
  await buildStep("write-build-inputs", "provider_failed", () =>
    sandbox.writeFiles([
      { path: `${BUILD_DIR}/fetch.js`, content: Buffer.from(FETCH_SCRIPT) },
      {
        path: `${BUILD_DIR}/freshclam.conf`,
        content: Buffer.from(freshclamConf),
      },
    ]),
  );
  const fetched = await command(sandbox, "deb-download", {
    cmd: "node",
    args: [
      `${BUILD_DIR}/fetch.js`,
      CLAMAV_DEB_URL,
      `${BUILD_DIR}/clamav.deb`,
      CLAMAV_DEB_SHA256,
    ],
    timeoutMs: 330_000,
  });
  const fetchOut = fetched.stdout;
  if (fetched.exitCode === 2) throw new BuildError("deb-digest-mismatch");
  if (fetched.exitCode !== 0 || !fetchOut.includes("deb-sha256-ok"))
    throw new BuildError("deb-download");

  // No GPG check: no Talos signing-key source is pinned. The GitHub release
  // digest above is the integrity pin, and nothing installs on a mismatch.
  const signature = "not-verified:no-pinned-signing-key";

  await must(
    sandbox,
    "dpkg-install",
    `dpkg -i ${BUILD_DIR}/clamav.deb\nldconfig`,
    { sudo: true, timeoutMs: 180_000 },
  );
  // freshclam drops privileges to DatabaseOwner, which defaults to clamav.
  await must(
    sandbox,
    "database-owner",
    "id clamav >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin clamav\n" +
      "mkdir -p /var/lib/clamav\nchown clamav: /var/lib/clamav",
    { sudo: true, timeoutMs: 30_000 },
  );
  // Same checks as infra/vercel/scanner/Dockerfile.
  await must(
    sandbox,
    "freshclam",
    `freshclam --config-file=${BUILD_DIR}/freshclam.conf --stdout\n` +
      "test -s /var/lib/clamav/main.cvd\ntest -s /var/lib/clamav/daily.cvd\ntest -s /var/lib/clamav/bytecode.cvd\n" +
      "if ls /var/lib/clamav/*.cld >/dev/null 2>&1; then exit 5; fi\n" +
      "chmod -R a+rX /var/lib/clamav",
    { sudo: true, timeoutMs: 420_000 },
  );
  // As the default user: the tools must be on the PATH the adapter sees.
  const record = await must(
    sandbox,
    "record-scanner",
    "command -v clamscan sigtool freshclam\nclamscan --version\n" +
      "sha256sum /var/lib/clamav/main.cvd /var/lib/clamav/daily.cvd\n" +
      'for f in main daily bytecode; do echo "== $f"; sigtool --info "/var/lib/clamav/$f.cvd" | grep -E "^(Build time|Version):"; done\n' +
      'echo "== files"; ls -A /var/lib/clamav',
    { timeoutMs: 60_000 },
  );
  const main = sha256Of(record, "main.cvd");
  const daily = sha256Of(record, "daily.cvd");
  // "ClamAV 1.5.4/<daily>/<date>", or just "ClamAV 1.5.4" when the binary's
  // compiled-in database directory is empty, as it is here.
  const clamavVersion = record.match(/^ClamAV (\d+\.\d+\.\d+)\b/m)?.[1] ?? null;
  if (!main || !daily || clamavVersion !== "1.5.4")
    throw new BuildError("record-scanner", record);
  const files = (record.split("== files\n")[1] ?? "")
    .split("\n")
    .filter((f) => f && f !== STEP_OK);
  return {
    os: field(env, "os") ?? null,
    nodeVersion: field(env, "node") ?? null,
    builderUid: Number(field(env, "uid")),
    tools: {
      curl: field(env, "curl") === "1",
      gpg: field(env, "gpg") === "1",
      sudo: field(env, "sudo") === "1",
    },
    clamavVersion,
    signature,
    databaseFiles: files,
    main: { sha256: main, ...cvdInfo(record, "main") },
    daily: { sha256: daily, ...cvdInfo(record, "daily") },
    bytecode: cvdInfo(record, "bytecode"),
  };
}

/** The same checks a scan sandbox runs, then removal of every build input. */
async function smokeTestAndScrub(sandbox, recorded) {
  await must(sandbox, "smoke-prepare", `mkdir -p ${SCAN_DIR}`, {
    timeoutMs: 10_000,
  });
  const check = await command(sandbox, "smoke-signatures", {
    cmd: "node",
    args: [
      "-e",
      SIGNATURE_CHECK,
      recorded.main.sha256,
      recorded.daily.sha256,
      String(SMOKE_MAX_AGE_HOURS),
    ],
    timeoutMs: 30_000,
  });
  if (!signaturesOk({ exitCode: check.exitCode, stdout: check.stdout }))
    throw new BuildError("smoke-signatures");
  await buildStep("write-smoke-inputs", "provider_failed", () =>
    sandbox.writeFiles([
      {
        path: `${SCAN_DIR}/clean.csv`,
        content: Buffer.from("region,value\nsynthetic,1\n"),
      },
      { path: `${SCAN_DIR}/eicar.txt`, content: EICAR },
    ]),
  );
  const scan = async (file) => {
    const r = await command(sandbox, "smoke-scan", {
      cmd: "clamscan",
      args: [...ADAPTER_SCAN_FLAGS, file],
      timeoutMs: 60_000,
    });
    return { exitCode: r.exitCode, shape: scanShape(r.stdout, file) };
  };
  const clean = await scan(`${SCAN_DIR}/clean.csv`);
  const infected = await scan(`${SCAN_DIR}/eicar.txt`);
  if (
    clean.exitCode !== 0 ||
    clean.shape !== "ok" ||
    infected.exitCode !== 1 ||
    !infected.shape.startsWith("found:")
  )
    throw new BuildError("smoke-scan");
  // No EICAR, package or build file may reach the snapshot.
  await must(
    sandbox,
    "scrub",
    `rm -rf ${SCAN_DIR} ${BUILD_DIR}\ntest ! -e ${SCAN_DIR}\ntest ! -e ${BUILD_DIR}`,
    { sudo: true, timeoutMs: 30_000 },
  );
}

async function buildSnapshot(
  config,
  sdk,
  {
    persistentBuilder = false,
    freshclamConf,
    log = () => {},
    onSnapshot = () => {},
  },
) {
  const credentials = credentialsFor(config);
  // Logging is advisory; a broken output sink must not skip owned cleanup.
  const progress = (line) => {
    try {
      log(line);
    } catch {
      /* Cleanup and the primary outcome take precedence. */
    }
  };
  let builder;
  let snapshotId = null;
  let snapshotRequested = false;
  let cleanup = "not_requested";
  let primaryFailed = false;
  let recorded;
  let egressAtSnapshot = "unchanged";
  try {
    try {
      builder = await buildStep("builder-create", "provider_failed", () =>
        sdk.Sandbox.create({
          ...credentials,
          image: BASE_IMAGE,
          region: config.region,
          resources: { vcpus: 2 },
          timeout: BUILDER_TIMEOUT_MS,
          networkPolicy: BUILDER_EGRESS,
          // Fallback only if snapshot() refuses a non-persistent sandbox.
          ...(persistentBuilder
            ? { persistent: true, keepLastSnapshots: { count: 1 } }
            : { persistent: false }),
        }),
      );
      progress("builder sandbox created");
      recorded = await installAndVerify(builder, freshclamConf);
      await smokeTestAndScrub(builder, recorded);
      try {
        await builder.update(
          { networkPolicy: "deny-all" },
          { signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS) },
        );
        egressAtSnapshot = "deny-all";
      } catch {
        egressAtSnapshot = "unchanged";
      }
      snapshotRequested = true;
      await buildStep("snapshot-request", "provider_failed", async () => {
        const snapshot = await builder.snapshot({
          expiration: SNAPSHOT_EXPIRATION_MS,
          signal: AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS),
        });
        const id = snapshot.snapshotId;
        if (typeof id !== "string" || !SNAPSHOT_ID.test(id))
          throw new BuildError("snapshot-request", "", "validation_failed");
        snapshotId = id;
        onSnapshot(id);
        progress(`scanner snapshot: ${id}`);
      });
    } catch (error) {
      primaryFailed = true;
      throw error;
    } finally {
      if (builder) {
        if (!snapshotId) {
          if (snapshotRequested)
            progress("snapshot request unconfirmed; inspect provider state");
          try {
            await builder.stop({
              signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
            });
          } catch {
            // Stop does not certify deletion.
          }
        }
        try {
          await builder.delete({
            deleteOrphanSnapshots: false,
            signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
          });
          cleanup = "passed";
        } catch {
          cleanup = "failed";
          if (!primaryFailed)
            throw new BuildError("builder-delete", "", "provider_failed");
        }
      }
    }
    const stored = await buildStep("snapshot-metadata", "provider_failed", () =>
      sdk.Snapshot.get({
        ...credentials,
        snapshotId,
        signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
      }),
    );
    await buildStep("snapshot-status", "validation_failed", () => {
      if (stored.status !== "created")
        throw new BuildError("snapshot-status", "", "validation_failed");
    });
    return await buildStep("summary", "validation_failed", () => {
      const summary = {
        snapshotId,
        sizeBytes: stored.sizeBytes,
        expiresAt: stored.expiresAt ? stored.expiresAt.toISOString() : null,
        baseImage: BASE_IMAGE,
        os: recorded.os,
        nodeVersion: recorded.nodeVersion,
        builderUid: recorded.builderUid,
        tools: recorded.tools,
        clamavVersion: recorded.clamavVersion,
        debSha256Verified: true,
        signature: recorded.signature,
        databaseFiles: recorded.databaseFiles,
        main: recorded.main,
        daily: recorded.daily,
        bytecode: recorded.bytecode,
        egress: "allow-list",
        egressAtSnapshot,
        builderPersistent: persistentBuilder,
        sandboxCreations: 1,
      };
      JSON.stringify(summary);
      return summary;
    });
  } catch (error) {
    const safe = failures.has(error)
      ? error
      : new BuildError("unknown", "", "unknown");
    const state = failures.get(safe);
    state.builder_cleanup = cleanup;
    state.snapshot_confirmed = snapshotId !== null;
    throw safe;
  }
}

/**
 * Deletes one previous snapshot by id and confirms it is gone. Run only after
 * the new snapshot's summary is saved, so a failure here loses nothing.
 */
async function replaceSnapshot(config, sdk, previousId, newId) {
  if (previousId === newId) throw new BuildError("replace-same-id");
  const credentials = credentialsFor(config);
  let previous;
  try {
    previous = await sdk.Snapshot.get({
      ...credentials,
      snapshotId: previousId,
      signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
    });
  } catch {
    throw new BuildError("replace-lookup");
  }
  await previous.delete({ signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS) });
  let gone = false;
  try {
    const after = await sdk.Snapshot.get({
      ...credentials,
      snapshotId: previousId,
      signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
    });
    gone = after.status === "deleted";
  } catch (error) {
    gone = error?.response?.status === 404;
  }
  if (!gone) throw new BuildError("replace-confirm");
}

/** Refuses any path inside the repository, and symlinks. */
function assertOutsideRepo(file, repoRoot = REPO_ROOT) {
  const target = path.resolve(file);
  const dir = fs.realpathSync(path.dirname(target));
  const resolved = path.join(dir, path.basename(target));
  const rel = path.relative(fs.realpathSync(repoRoot), resolved);
  const outside =
    rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
  if (rel === "" || !outside)
    throw new Error("Refusing to write scanner.env inside the repository.");
  if (fs.lstatSync(resolved, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new Error("Refusing to write scanner.env through a symlink.");
  return resolved;
}

function writeScannerEnv(file, summary, repoRoot = REPO_ROOT) {
  const target = assertOutsideRepo(file, repoRoot);
  const body =
    `ACRES_SCANNER_SNAPSHOT_ID=${summary.snapshotId}\n` +
    `ACRES_SCANNER_MAIN_SHA256=${summary.main.sha256}\n` +
    `ACRES_SCANNER_DAILY_SHA256=${summary.daily.sha256}\n`;
  fs.writeFileSync(target, body, { mode: 0o600 });
  fs.chmodSync(target, 0o600);
}

function parseArgs(args) {
  const options = { persistentBuilder: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help") options.help = true;
    else if (arg === "--persistent-builder") options.persistentBuilder = true;
    else if (arg === "--write-env" && args[i + 1]) options.writeEnv = args[++i];
    else if (arg === "--replace" && args[i + 1]) {
      options.replace = args[++i];
      if (!SNAPSHOT_ID.test(options.replace))
        throw new Error("--replace takes a Sandbox snapshot id.");
    } else throw new Error("Unknown argument.");
  }
  return options;
}

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
      "Usage: npm run vercel:scanner-snapshot -- [--write-env <path outside repo>] [--replace <snap_id>] [--persistent-builder]\nRequires an explicitly selected isolated synthetic preview. See infra/vercel/README.md.",
    );
    return;
  }
  const config = sandboxTarget(env);
  // Checked before any sandbox is created, so a bad path costs nothing.
  if (options.writeEnv) assertOutsideRepo(options.writeEnv);
  const summary = await buildSnapshot(config, sdk, {
    persistentBuilder: options.persistentBuilder,
    freshclamConf: fs.readFileSync(FRESHCLAM_CONF, "utf8"),
    log: (line) => console.error(line),
  });
  // Saved before --replace, so a failed replace never loses the new hashes.
  if (options.writeEnv) writeScannerEnv(options.writeEnv, summary);
  // A snapshot id and CVD hashes are not secrets.
  console.log(JSON.stringify(summary));
  if (options.replace) {
    await replaceSnapshot(config, sdk, options.replace, summary.snapshotId);
    console.error(`previous snapshot deleted: ${options.replace}`);
  }
}

module.exports = {
  CLAMAV_DEB_URL,
  CLAMAV_DEB_SHA256,
  BASE_IMAGE,
  SNAPSHOT_EXPIRATION_MS,
  BUILDER_EGRESS,
  FETCH_SCRIPT,
  BuildError,
  projectBuildFailure,
  buildSnapshot,
  replaceSnapshot,
  assertOutsideRepo,
  writeScannerEnv,
  parseArgs,
  main,
};
if (require.main === module)
  main().catch((error) => {
    console.error(
      "Scanner snapshot preparation failed.",
      JSON.stringify(projectBuildFailure(error)),
    );
    process.exitCode = 1;
  });
