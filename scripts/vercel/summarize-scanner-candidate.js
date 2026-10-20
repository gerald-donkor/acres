#!/usr/bin/env node
"use strict";

// Offline publication only. Validate before discarding any untrusted fields.
const fs = require("node:fs");
const { readReceipt, validateReceipt } = require("./prepare-scanner-handoff");
const HELP =
  "Usage: node scripts/vercel/summarize-scanner-candidate.js --receipt <file> --summary <file>\nOffline sanitized summary only; no activation, deployment verification or retirement.";
const UNAVAILABLE =
  "### Scanner candidate — no handoff available\n\nReceipt evidence is unavailable.\n";
const INVALID =
  "### Scanner candidate — no handoff available\n\nReceipt evidence is invalid or ineligible.\n";
class SummaryError extends Error {}
function fail(code) {
  throw new SummaryError(code);
}
function parseArgs(args) {
  const options = {};
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!["--help", "--receipt", "--summary"].includes(flag) || seen.has(flag))
      fail("summary_arguments_invalid");
    seen.add(flag);
    if (flag === "--help") options.help = true;
    else {
      const value = args[++i];
      if (typeof value !== "string" || !value.trim() || value.startsWith("--"))
        fail("summary_arguments_invalid");
      options[flag.slice(2)] = value;
    }
  }
  if (!options.help && (!options.receipt || !options.summary))
    fail("summary_arguments_invalid");
  return options;
}
function projectReceipt(receipt, now = Date.now()) {
  const values = validateReceipt(receipt, now);
  const projected = {
    schema_version: 1,
    tool: "rebuild-scanner-cadence",
    target: values.target,
    timestamp: values.preparation_timestamp,
    execution_mode: "live",
    status: "success",
    rebuild_needed: true,
    previous_snapshot_id: values.previous_snapshot_id,
    new_snapshot_id: values.candidate_snapshot_id,
    main_sha256: values.main_sha256,
    daily_sha256: values.daily_sha256,
    smoke_test: {
      signatures: "passed",
      clean_sample: "passed",
      eicar_sample: "passed",
      cleanup: "passed",
    },
    activation_status: "not_performed",
    configuration_export: receipt.configuration_export,
    prune_status: receipt.prune_status,
    deployment_verification: "not_performed",
    retirement_status: "not_performed",
  };
  validateReceipt(projected, now);
  return projected;
}
function renderSummary(receipt, now = Date.now()) {
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt))
    fail("summary_receipt_invalid");
  if (receipt.status === "success" && receipt.execution_mode !== "simulation") {
    let projected;
    try {
      projected = projectReceipt(receipt, now);
    } catch {
      fail("summary_receipt_invalid");
    }
    return (
      "### Sanitized candidate receipt for offline handoff\n\n" +
      "Reconstructed, unsigned consistency evidence. Review the trusted workflow run and source before copying. " +
      "This does not attest to provider state, CVD freshness, adoption or launch approval. " +
      "A later handoff hash binds the copied projection's bytes, not the original runner receipt.\n\n" +
      "```json\n" +
      JSON.stringify(projected, null, 2) +
      "\n```\n"
    );
  }
  const lines = [
    "### Scanner candidate — no handoff available",
    "",
    "Simulation, skipped or failed preparation is diagnostic only; no eligible receipt is published.",
  ];
  // Anchored allowlists plus trim equality forbid terminal-newline matches.
  for (const [key, pattern] of Object.entries({
    execution_mode: /^(simulation|live)$/,
    status: /^(success|failed|skipped)$/,
    new_snapshot_id: /^snap_[A-Za-z0-9]+$/,
    main_sha256: /^[a-f0-9]{64}$/,
    daily_sha256: /^[a-f0-9]{64}$/,
    activation_status: /^not_performed$/,
    configuration_export: /^(exported|not_performed)$/,
    error: /^candidate_(build|smoke|configuration_export|receipt)_failed$/,
  })) {
    const value = receipt[key];
    if (
      typeof value === "string" &&
      value.trim() === value &&
      pattern.test(value)
    )
      lines.push(`- ${key}: \`${value}\``);
  }
  return lines.join("\n") + "\n";
}
function appendSummary(file, markdown) {
  try {
    fs.appendFileSync(file, markdown);
  } catch {
    fail("summary_write_failed");
  }
}
function summarize({ receipt: file, summary }, { now = Date.now() } = {}) {
  let markdown;
  try {
    // readReceipt deliberately sanitizes all IO errors. Distinguish absence
    // first without following symlinks; a dangling symlink remains invalid.
    try {
      fs.lstatSync(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      appendSummary(summary, UNAVAILABLE);
      return;
    }
    markdown = renderSummary(readReceipt(file).receipt, now);
  } catch (error) {
    if (
      error instanceof SummaryError &&
      error.message === "summary_write_failed"
    )
      throw error;
    appendSummary(summary, INVALID);
    fail("summary_receipt_invalid");
  }
  // Construct and validate everything before publishing any success bytes.
  appendSummary(summary, markdown);
}
function main(args = process.argv.slice(2)) {
  try {
    const options = parseArgs(args);
    if (options.help) console.log(HELP);
    else summarize(options);
    return 0;
  } catch (error) {
    console.error(
      error instanceof SummaryError ? error.message : "summary_failed",
    );
    return 1;
  }
}
module.exports = { parseArgs, projectReceipt, renderSummary, summarize, main };
if (require.main === module) process.exitCode = main();
