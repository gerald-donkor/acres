#!/usr/bin/env node
"use strict";

// Explicit opt-in: retires superseded scanner snapshots by exact id, after
// dependency checks. Plans by default; deletes only with --confirm. It never
// chooses targets itself. See infra/vercel/runbooks/managed-operations.md §5.5.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const {
  sandboxTarget,
  credentialsFor,
  SNAPSHOT_ID,
} = require("./probe-platform");
const { assertOutsideRepo } = require("./build-scanner-snapshot");

// Same value and meaning as the builder's control-call timeout.
const CONTROL_TIMEOUT_MS = 30_000;
// One run is a bounded retirement, never a bulk sweep. A judgement.
const MAX_RETIRE = 5;
// Statuses during which a sandbox may still be booting from, or writing, a
// snapshot. Sandbox.list does not say which snapshot a sandbox came from.
const ACTIVE_SANDBOX = new Set([
  "pending",
  "running",
  "stopping",
  "snapshotting",
]);
const ACTIVE_ENV = ["SCANNER_SANDBOX_SNAPSHOT_ID", "ACRES_SCANNER_SNAPSHOT_ID"];

const USAGE =
  "Usage: npm run vercel:scanner-retire -- --keep <snap_id> [--keep <snap_id>…] --retire <snap_id> [--retire <snap_id>…] [--confirm] [--output <file outside repo>]\n" +
  "Plans by default; deletes only the listed --retire ids with --confirm. Requires an explicitly selected isolated synthetic preview. See infra/vercel/runbooks/managed-operations.md §5.5.";

class UsageError extends Error {}

function parseArgs(args) {
  const options = { keep: [], retire: [], confirm: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--confirm") options.confirm = true;
    else if (["--keep", "--retire", "--output"].includes(arg)) {
      const value = args[++i];
      if (value === undefined || value.startsWith("--"))
        throw new UsageError(`${arg} needs a value.`);
      if (arg === "--output") {
        if (options.output) throw new UsageError("--output is given twice.");
        options.output = value;
        continue;
      }
      if (!SNAPSHOT_ID.test(value))
        throw new UsageError(`${arg} takes a Sandbox snapshot id.`);
      options[arg.slice(2)].push(value);
    } else throw new UsageError("Unknown argument.");
  }
  if (options.help) return options;
  if (options.keep.length === 0)
    throw new UsageError("Name at least one --keep.");
  if (options.retire.length === 0)
    throw new UsageError("Name at least one --retire.");
  if (options.retire.length > MAX_RETIRE)
    throw new UsageError(`At most ${MAX_RETIRE} --retire ids per run.`);
  const all = [...options.keep, ...options.retire];
  if (new Set(all).size !== all.length)
    throw new UsageError("A snapshot id is listed more than once.");
  return options;
}

/** Resolves the --output path and refuses one that exists or is in the repo. */
function checkOutput(file, repoRoot) {
  let target;
  try {
    target = assertOutsideRepo(file, repoRoot);
  } catch {
    throw new UsageError(
      "--output must be a new file outside the repository, in an existing directory.",
    );
  }
  if (fs.lstatSync(target, { throwIfNoEntry: false }))
    throw new UsageError("--output must not exist yet.");
  return target;
}

const iso = (value) =>
  value === undefined || value === null ? null : new Date(value).toISOString();

const isNotFound = (error) => {
  try {
    return error?.response?.status === 404;
  } catch {
    return false;
  }
};

// One record per listed snapshot; only fields the decision or the receipt uses.
function listRecord(item) {
  return {
    id: item.id,
    status: item.status,
    size_bytes: item.sizeBytes,
    region: item.region,
    regions: item.regions ?? [item.region],
    expires_at: iso(item.expiresAt),
    last_used_at: iso(item.lastUsedAt),
    parent_id: item.parentId ?? null,
  };
}

function storageOf(records) {
  const created = records.filter((r) => r.status === "created");
  return {
    created_count: created.length,
    created_bytes: created.reduce((sum, r) => sum + (r.size_bytes ?? 0), 0),
  };
}

async function listSnapshots(sdk, credentials, projectId) {
  const pages = await sdk.Snapshot.list({
    ...credentials,
    projectId,
    signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
  });
  return (await pages.toArray()).map(listRecord);
}

/** `{ snapshot }` when present, `{ absent: true }` on 404 or deleted status. */
async function lookup(sdk, credentials, snapshotId) {
  try {
    const snapshot = await sdk.Snapshot.get({
      ...credentials,
      snapshotId,
      signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
    });
    return snapshot.status === "deleted" ? { absent: true } : { snapshot };
  } catch (error) {
    if (isNotFound(error)) return { absent: true };
    return { failed: true };
  }
}

/**
 * Active sandboxes, and any sandbox (stopped persistent ones included) whose
 * current snapshot is a target. The listing names no source snapshot.
 */
async function inspectSandboxes(sdk, credentials, projectId, targets) {
  const pages = await sdk.Sandbox.list({
    ...credentials,
    projectId,
    signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
  });
  const sandboxes = await pages.toArray();
  return {
    active: sandboxes.filter((s) => ACTIVE_SANDBOX.has(s.status)).length,
    dependent: sandboxes.some((s) => targets.has(s.currentSnapshotId)),
  };
}

/** The active id must come from the environment, not only from the operator. */
function activeSnapshot(env, keep) {
  const set = ACTIVE_ENV.map((key) => env[key]?.trim()).filter(Boolean);
  if (set.length === 0) return { id: null, refusals: ["active_unknown"] };
  // Never copy an unvalidated environment value into the receipt.
  if (!set.every((id) => SNAPSHOT_ID.test(id)))
    return { id: null, refusals: ["active_malformed"] };
  const refusals = [];
  if (new Set(set).size > 1) refusals.push("active_disagrees");
  if (set.some((id) => !keep.includes(id))) refusals.push("active_not_kept");
  return { id: set[0], refusals };
}

/**
 * Inspects, decides, and only with `confirm` deletes. Every SDK call gets the
 * checked credentials explicitly. Provider errors are classified, never echoed.
 */
async function retireSnapshots(
  config,
  sdk,
  options,
  env,
  now = () => new Date(),
) {
  const credentials = credentialsFor(config);
  const startedAt = now().toISOString();
  const refusals = new Set();
  const active = activeSnapshot(env, options.keep);
  active.refusals.forEach((code) => refusals.add(code));

  let listed = null;
  try {
    listed = await listSnapshots(sdk, credentials, config.projectId);
  } catch {
    refusals.add("lookup_failed");
  }

  const keep = [];
  for (const id of options.keep) {
    const found = await lookup(sdk, credentials, id);
    if (found.failed) {
      refusals.add("lookup_failed");
      keep.push({ id, status: "lookup_failed", expires_at: null });
      continue;
    }
    const snapshot = found.snapshot;
    const expiresAt = snapshot?.expiresAt;
    keep.push({
      id,
      status: snapshot ? snapshot.status : "absent",
      expires_at: iso(expiresAt),
    });
    if (
      !snapshot ||
      snapshot.status !== "created" ||
      !snapshot.regions.includes(config.region) ||
      (expiresAt && expiresAt.getTime() <= now().getTime())
    )
      refusals.add("keep_unhealthy");
  }

  // Snapshot get and delete are team-scoped; only the project listing binds a
  // snapshot to the checked project. A present id outside it is refused.
  const inProject = (id) => !listed || listed.some((r) => r.id === id);
  for (const entry of keep)
    if (entry.status !== "absent" && entry.status !== "lookup_failed")
      if (!inProject(entry.id)) refusals.add("not_in_project");

  const retire = [];
  for (const id of options.retire) {
    const found = await lookup(sdk, credentials, id);
    if (found.failed) refusals.add("lookup_failed");
    const snapshot = found.snapshot;
    if (snapshot && !snapshot.regions.includes(config.region))
      refusals.add("wrong_region");
    if (snapshot && !inProject(id)) refusals.add("not_in_project");
    const record = listed?.find((r) => r.id === id);
    retire.push({
      id,
      status_before: found.failed
        ? "lookup_failed"
        : snapshot
          ? snapshot.status
          : "absent",
      size_bytes: snapshot ? snapshot.sizeBytes : null,
      parent_id: record ? record.parent_id : null,
      outcome: found.absent ? "already_absent" : "planned",
      snapshot,
    });
  }

  // A snapshot that stays and was derived from a target is a dependent.
  if (listed) {
    const targets = new Set(options.retire);
    if (
      listed.some(
        (r) =>
          r.status !== "deleted" &&
          !targets.has(r.id) &&
          targets.has(r.parent_id),
      )
    )
      refusals.add("parent_dependency");
  }

  let activeSandboxes = null;
  try {
    const sandboxes = await inspectSandboxes(
      sdk,
      credentials,
      config.projectId,
      new Set(options.retire),
    );
    activeSandboxes = sandboxes.active;
    if (sandboxes.active > 0) refusals.add("active_sandbox");
    if (sandboxes.dependent) refusals.add("sandbox_dependency");
  } catch {
    refusals.add("lookup_failed");
  }

  const named = new Set([...options.keep, ...options.retire]);
  const receipt = {
    schema_version: 1,
    mode: options.confirm ? "retire" : "plan",
    target: {
      team_id: config.teamId,
      project_id: config.projectId,
      region: config.region,
    },
    started_at: startedAt,
    finished_at: null,
    active_snapshot_id: active.id,
    keep,
    retire,
    refusals: [...refusals],
    active_sandboxes: activeSandboxes,
    storage: { before: listed ? storageOf(listed) : null, after: null },
    keep_after: null,
    // null, not [], when the listing failed: empty must mean fully accounted.
    unlisted_snapshots: listed
      ? listed
          .filter((r) => r.status === "created" && !named.has(r.id))
          .map((r) => r.id)
      : null,
    warnings: [],
    result: "planned",
  };

  if (refusals.size > 0) receipt.result = "refused";
  else if (options.confirm) {
    receipt.result = "retired";
    let stopped = false;
    for (const entry of retire) {
      if (entry.outcome === "already_absent") continue;
      if (stopped) {
        entry.outcome = "not_attempted";
        continue;
      }
      try {
        await entry.snapshot.delete({
          signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
        });
      } catch {
        // This tool never retries, but the SDK transport retries 5xx/429, so
        // a delete can land and still throw. One read records which; the run
        // stops either way.
        const after = await lookup(sdk, credentials, entry.id);
        entry.outcome = after.absent ? "deleted_after_error" : "delete_failed";
        stopped = true;
        continue;
      }
      const after = await lookup(sdk, credentials, entry.id);
      entry.outcome = after.absent ? "deleted" : "unconfirmed";
      if (!after.absent) stopped = true;
    }
    if (stopped) receipt.result = "partial";
    try {
      const afterList = await listSnapshots(sdk, credentials, config.projectId);
      receipt.storage.after = storageOf(afterList);
      receipt.keep_after = options.keep.map((id) => {
        const r = afterList.find((item) => item.id === id);
        return {
          id,
          status: r ? r.status : "absent",
          expires_at: r ? r.expires_at : null,
        };
      });
      if (receipt.keep_after.some((k) => k.status !== "created"))
        receipt.warnings.push("keep_changed");
    } catch {
      // The deletes stand; the after-state is then read by a plan run.
      receipt.warnings.push("after_list_failed");
    }
  }

  for (const entry of retire) delete entry.snapshot;
  receipt.finished_at = now().toISOString();
  return receipt;
}

/**
 * Returns the exit code: 0 planned/retired with no warnings, 1 refused,
 * partial, warned or failed, 2 usage.
 */
async function main(
  args = process.argv.slice(2),
  env = process.env,
  sdk = createRequire(path.resolve(__dirname, "../../server/package.json"))(
    "@vercel/sandbox",
  ),
  { stdout = console.log, stderr = console.error, repoRoot } = {},
) {
  let options;
  let output;
  try {
    options = parseArgs(args);
    if (options.help) {
      stdout(USAGE);
      return 0;
    }
    // Checked before any SDK call, so a bad path costs nothing.
    if (options.output) output = checkOutput(options.output, repoRoot);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    stderr(`${error.message}\n${USAGE}`);
    return 2;
  }
  let config;
  try {
    config = sandboxTarget(env);
  } catch (error) {
    // sandboxTarget throws fixed, source-owned messages that carry no values.
    stderr(`Target refused: ${error.message}`);
    return 1;
  }
  const receipt = await retireSnapshots(config, sdk, options, env);
  // Snapshot ids and sizes are not secrets; the token never enters the receipt.
  const line = JSON.stringify(receipt);
  // Printed first, so a failed file write never hides deletes that landed.
  stdout(line);
  if (output) {
    try {
      fs.writeFileSync(output, `${line}\n`, { flag: "wx", mode: 0o600 });
    } catch {
      stderr("The receipt was printed but could not be written to --output.");
      return 1;
    }
  }
  const ok = receipt.result === "planned" || receipt.result === "retired";
  return ok && receipt.warnings.length === 0 ? 0 : 1;
}

module.exports = {
  MAX_RETIRE,
  UsageError,
  parseArgs,
  retireSnapshots,
  main,
};
if (require.main === module)
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      // SDK exceptions may contain credentials, URLs and bodies.
      console.error(
        "Snapshot retirement failed before a receipt. Nothing is confirmed deleted; inspect provider state with a plan run.",
      );
      process.exitCode = 1;
    });
