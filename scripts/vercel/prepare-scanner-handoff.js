#!/usr/bin/env node
"use strict";

// Offline operator tooling. No SDK, environment configuration, or cloud actions.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { SNAPSHOT_ID } = require("./probe-platform");
const REPO_ROOT = fs.realpathSync(path.resolve(__dirname, "../.."));
const MAX_RECEIPT_BYTES = 64 * 1024;
const TARGET = Object.freeze({
  environment: "preview",
  team_id: "team_zE3mp7nrEZ6a7cxRavwUMYC4",
  project_id: "prj_q9ApajZWDgdYZetnm5s5oakEjrUD",
  region: "iad1",
});
const HELP =
  "Usage: node scripts/vercel/prepare-scanner-handoff.js --receipt <file> --output-dir <new directory outside repo>\nLocal bundle only; activation, deployment verification and retirement not performed.\nLinux with procfs is required for descriptor-anchored output.";
class HandoffError extends Error {}
function fail(code) {
  throw new HandoffError(code);
}
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const snapshotId = (v) =>
  typeof v === "string" && v.trim() === v && SNAPSHOT_ID.test(v);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inside = (base, file) =>
  file === base || file.startsWith(base + path.sep);
function parseArgs(args) {
  const result = {};
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (
      !["--help", "--receipt", "--output-dir"].includes(flag) ||
      seen.has(flag)
    )
      fail("handoff_arguments_invalid");
    seen.add(flag);
    if (flag === "--help") result.help = true;
    else {
      const value = args[++i];
      if (typeof value !== "string" || !value.trim() || value.startsWith("--"))
        fail("handoff_arguments_invalid");
      result[flag === "--receipt" ? "receipt" : "outputDir"] = value;
    }
  }
  if (!result.help && (!result.receipt || !result.outputDir))
    fail("handoff_arguments_invalid");
  return result;
}
function readReceipt(file) {
  let fd;
  try {
    const checked = fs.lstatSync(file);
    if (!checked.isFile() || checked.size > MAX_RECEIPT_BYTES)
      fail("handoff_receipt_invalid");
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const opened = fs.fstatSync(fd);
    if (
      !opened.isFile() ||
      opened.dev !== checked.dev ||
      opened.ino !== checked.ino ||
      opened.size > MAX_RECEIPT_BYTES
    )
      fail("handoff_receipt_invalid");
    // Bounded even if a writer grows the file after fstat.
    const buffer = Buffer.alloc(MAX_RECEIPT_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const n = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (!n) break;
      length += n;
    }
    if (length > MAX_RECEIPT_BYTES) fail("handoff_receipt_invalid");
    const bytes = buffer.subarray(0, length);
    return { bytes, receipt: JSON.parse(bytes.toString("utf8")) };
  } catch {
    fail("handoff_receipt_invalid");
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function validateReceipt(r, now = Date.now()) {
  if (
    !object(r) ||
    r.schema_version !== 1 ||
    r.tool !== "rebuild-scanner-cadence" ||
    r.execution_mode !== "live" ||
    r.status !== "success" ||
    r.rebuild_needed !== true ||
    r.activation_status !== "not_performed"
  )
    fail("handoff_receipt_invalid");
  for (const key of [
    "error",
    "failure",
    "failure_reason",
    "failed",
    "activated",
    "activation_performed",
  ]) {
    if (Object.hasOwn(r, key)) fail("handoff_receipt_invalid");
  }
  for (const key of ["deployment_verification", "retirement_status"]) {
    if (Object.hasOwn(r, key) && r[key] !== "not_performed")
      fail("handoff_receipt_invalid");
  }
  if (
    (Object.hasOwn(r, "receipt_status") && r.receipt_status !== "written") ||
    !["exported", "not_performed"].includes(r.configuration_export) ||
    !["retained", "not_requested"].includes(r.prune_status)
  )
    fail("handoff_receipt_invalid");
  const timestamp =
    typeof r.timestamp === "string" ? Date.parse(r.timestamp) : NaN;
  if (!Number.isFinite(timestamp) || !Number.isFinite(now) || timestamp > now)
    fail("handoff_receipt_invalid");
  if (
    !object(r.smoke_test) ||
    !["clean_sample", "eicar_sample", "cleanup"].every(
      (k) => r.smoke_test[k] === "passed",
    )
  )
    fail("handoff_receipt_invalid");
  if (
    !snapshotId(r.new_snapshot_id) ||
    ![r.main_sha256, r.daily_sha256].every(
      (v) =>
        typeof v === "string" && v.length === 64 && /^[a-f0-9]{64}$/.test(v),
    )
  )
    fail("handoff_receipt_invalid");
  if (
    r.previous_snapshot_id !== null &&
    (!snapshotId(r.previous_snapshot_id) ||
      r.previous_snapshot_id === r.new_snapshot_id)
  )
    fail("handoff_receipt_invalid");
  if (
    !object(r.target) ||
    Object.keys(r.target).length !== Object.keys(TARGET).length ||
    !Object.entries(TARGET).every(([k, v]) => r.target[k] === v)
  )
    fail("handoff_target_invalid");
  // Reconstruct every output field: never propagate unknown receipt content.
  return {
    target: { ...TARGET },
    preparation_timestamp: new Date(timestamp).toISOString(),
    previous_snapshot_id: r.previous_snapshot_id,
    candidate_snapshot_id: r.new_snapshot_id,
    main_sha256: r.main_sha256,
    daily_sha256: r.daily_sha256,
  };
}
function outputPath(outputDir, receiptFile) {
  try {
    const resolved = path.resolve(outputDir);
    const parent = fs.realpathSync(path.dirname(resolved));
    const target = path.join(parent, path.basename(resolved));
    const input = fs.realpathSync(receiptFile);
    if (
      inside(REPO_ROOT, target) ||
      inside(target, input) ||
      fs.lstatSync(target, { throwIfNoEntry: false })
    )
      fail("handoff_output_unavailable");
    fs.accessSync(parent, fs.constants.W_OK);
    return target;
  } catch {
    fail("handoff_output_unavailable");
  }
}
function writeFile(directoryFd, name, body) {
  const fd = fs.openSync(`/proc/self/fd/${directoryFd}/${name}`, "wx", 0o600);
  try {
    fs.fchmodSync(fd, 0o600);
    fs.writeFileSync(fd, body);
  } finally {
    fs.closeSync(fd);
  }
}
function prepareHandoff(
  { receipt: receiptFile, outputDir },
  { now = Date.now() } = {},
) {
  const { bytes, receipt } = readReceipt(receiptFile);
  const values = validateReceipt(receipt, now);
  const target = outputPath(outputDir, receiptFile);
  const runtime = `SCANNER_SANDBOX_SNAPSHOT_ID=${values.candidate_snapshot_id}\nSCANNER_MAIN_SHA256=${values.main_sha256}\nSCANNER_DAILY_SHA256=${values.daily_sha256}\n`;
  const manifest = {
    schema_version: 1,
    tool: "prepare-scanner-handoff",
    ...values,
    receipt_sha256: hash(bytes),
    runtime_env_sha256: hash(runtime),
    activation_status: "not_performed",
    deployment_verification: "not_performed",
    retirement_status: "not_performed",
  };
  let dirFd;
  let published;
  try {
    fs.mkdirSync(target, { mode: 0o700 }); // Exclusive ownership; never recursive.
    const owned = fs.lstatSync(target);
    dirFd = fs.openSync(
      target,
      fs.constants.O_RDONLY |
        fs.constants.O_DIRECTORY |
        fs.constants.O_NOFOLLOW,
    );
    const opened = fs.fstatSync(dirFd);
    if (
      owned.dev !== opened.dev ||
      owned.ino !== opened.ino ||
      fs.realpathSync(target) !== target ||
      inside(REPO_ROOT, fs.realpathSync(target))
    )
      fail("handoff_output_failed");
    fs.fchmodSync(dirFd, 0o700);
    // Anchor writes to the owned directory, even if a parent is renamed later.
    const anchored = `/proc/self/fd/${dirFd}`;
    if (fs.realpathSync(anchored) !== target) fail("handoff_output_failed");
    writeFile(dirFd, "runtime.env", runtime);
    // Publish only a completely written/closed manifest, without overwriting.
    writeFile(
      dirFd,
      ".handoff.pending",
      JSON.stringify(manifest, null, 2) + "\n",
    );
    const pending = fs.statSync(`${anchored}/.handoff.pending`);
    fs.linkSync(`${anchored}/.handoff.pending`, `${anchored}/handoff.json`);
    published = pending;
    // A post-publication failure removes only our own manifest hardlink.
    fs.unlinkSync(`${anchored}/.handoff.pending`);
    const closing = dirFd;
    dirFd = undefined;
    fs.closeSync(closing);
  } catch {
    if (published) {
      // No recursive cleanup; preserve other data and incomplete env output.
      try {
        const file =
          dirFd !== undefined
            ? `/proc/self/fd/${dirFd}/handoff.json`
            : path.join(target, "handoff.json");
        const current = fs.lstatSync(file);
        if (current.dev === published.dev && current.ino === published.ino)
          fs.unlinkSync(file);
      } catch {
        /* Inspection is required if the owned directory became inaccessible. */
      }
    }
    fail("handoff_output_failed");
  } finally {
    if (dirFd !== undefined) {
      try {
        fs.closeSync(dirFd);
      } catch {
        fail("handoff_output_failed");
      }
    }
  }
  return {
    status: "prepared",
    candidate_snapshot_id: values.candidate_snapshot_id,
    runtime_env_sha256: manifest.runtime_env_sha256,
    activation_status: "not_performed",
  };
}
function main(args = process.argv.slice(2)) {
  try {
    const options = parseArgs(args);
    if (options.help) {
      console.log(HELP);
      return 0;
    }
    console.log(JSON.stringify(prepareHandoff(options)));
    return 0;
  } catch (error) {
    console.error(
      error instanceof HandoffError ? error.message : "handoff_failed",
    );
    return 1;
  }
}
module.exports = {
  parseArgs,
  readReceipt,
  validateReceipt,
  prepareHandoff,
  main,
  TARGET,
  MAX_RECEIPT_BYTES,
};
if (require.main === module) process.exitCode = main();
