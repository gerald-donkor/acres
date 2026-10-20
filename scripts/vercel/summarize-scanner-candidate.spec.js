"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  renderSummary,
  summarize,
  parseArgs,
} = require("./summarize-scanner-candidate");
const {
  prepareHandoff,
  TARGET,
  MAX_RECEIPT_BYTES,
} = require("./prepare-scanner-handoff");
const CLI = path.join(__dirname, "summarize-scanner-candidate.js");
const now = Date.parse("2026-10-20T12:00:00Z");
const CANARY =
  "PRIVATE_CANARY\n```\nhttps://private.invalid/token /private/receipt $(false)";
function receipt() {
  return {
    schema_version: 1,
    tool: "rebuild-scanner-cadence",
    target: { ...TARGET },
    timestamp: "2026-10-17T11:00:00Z",
    execution_mode: "live",
    status: "success",
    rebuild_needed: true,
    activation_status: "not_performed",
    configuration_export: "exported",
    prune_status: "retained",
    previous_snapshot_id: "snap_old",
    new_snapshot_id: "snap_new",
    main_sha256: "a".repeat(64),
    daily_sha256: "b".repeat(64),
    smoke_test: {
      signatures: "passed",
      clean_sample: "passed",
      eicar_sample: "passed",
      cleanup: "passed",
    },
  };
}
function temporary(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-summary-test-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
function setup(dir, value = receipt()) {
  const input = path.join(dir, "receipt.json");
  fs.writeFileSync(input, JSON.stringify(value));
  return { receipt: input, summary: path.join(dir, "summary.md") };
}
function cli(options, extra = {}) {
  return spawnSync(
    process.execPath,
    [CLI, "--receipt", options.receipt, "--summary", options.summary],
    {
      encoding: "utf8",
      env: { PATH: process.env.PATH },
      ...extra,
    },
  );
}
function extracted(summary) {
  const match = summary.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(match, "copyable candidate JSON exists");
  return JSON.parse(match[1]);
}
function handoff(dir, markdown) {
  const input = path.join(dir, "copied.json");
  fs.writeFileSync(input, JSON.stringify(extracted(markdown), null, 2) + "\n", {
    mode: 0o600,
  });
  const outputDir = path.join(dir, "bundle");
  const result = prepareHandoff({ receipt: input, outputDir }, { now });
  assert.equal(result.status, "prepared");
  assert.equal(
    fs.readFileSync(path.join(outputDir, "runtime.env"), "utf8"),
    `SCANNER_SANDBOX_SNAPSHOT_ID=snap_new\nSCANNER_MAIN_SHA256=${"a".repeat(64)}\nSCANNER_DAILY_SHA256=${"b".repeat(64)}\n`,
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(outputDir, "handoff.json"), "utf8"),
  );
  for (const key of [
    "activation_status",
    "deployment_verification",
    "retirement_status",
  ])
    assert.equal(manifest[key], "not_performed");
  assert.equal(
    manifest.receipt_sha256,
    createHash("sha256").update(fs.readFileSync(input)).digest("hex"),
  );
  assert.equal(fs.statSync(outputDir).mode & 0o777, 0o700);
  for (const name of ["runtime.env", "handoff.json"])
    assert.equal(fs.statSync(path.join(outputDir, name)).mode & 0o777, 0o600);
  return manifest;
}
for (const previous of [null, "snap_old"])
  for (const configuration of ["exported", "not_performed"])
    for (const prune of ["retained", "not_requested"])
      test(`success round-trips through handoff: ${previous}/${configuration}/${prune}`, () =>
        temporary((dir) => {
          const r = receipt();
          r.previous_snapshot_id = previous;
          r.configuration_export = configuration;
          r.prune_status = prune;
          r.timestamp = "Oct 17 2026 11:00:00 GMT (PRIVATE_CANARY)";
          r.unknown = { private: CANARY };
          r.smoke_test.unknown = CANARY;
          const options = setup(dir, r);
          fs.writeFileSync(options.summary, "Earlier step\n");
          const result = cli(options);
          assert.equal(result.status, 0, result.stderr);
          assert.equal(result.stdout + result.stderr, "");
          const markdown = fs.readFileSync(options.summary, "utf8");
          assert.ok(markdown.startsWith("Earlier step\n"));
          assert.match(
            markdown,
            /Reconstructed, unsigned consistency evidence/,
          );
          assert.match(markdown, /not the original runner receipt/);
          assert.doesNotMatch(
            markdown,
            /PRIVATE_CANARY|private\.invalid|\/private\/receipt/,
          );
          const projected = extracted(markdown);
          assert.deepEqual(
            Object.keys(projected).sort(),
            [
              "schema_version",
              "tool",
              "target",
              "timestamp",
              "execution_mode",
              "status",
              "rebuild_needed",
              "previous_snapshot_id",
              "new_snapshot_id",
              "main_sha256",
              "daily_sha256",
              "smoke_test",
              "activation_status",
              "configuration_export",
              "prune_status",
              "deployment_verification",
              "retirement_status",
            ].sort(),
          );
          assert.deepEqual(
            Object.keys(projected.smoke_test).sort(),
            ["signatures", "clean_sample", "eicar_sample", "cleanup"].sort(),
          );
          assert.equal(projected.timestamp, "2026-10-17T11:00:00.000Z");
          assert.equal(projected.configuration_export, configuration);
          assert.equal(projected.prune_status, prune);
          assert.equal(handoff(dir, markdown).previous_snapshot_id, previous);
        }));

const invalid = [
  ["schema missing", (r) => delete r.schema_version],
  ["schema wrong", (r) => (r.schema_version = 2)],
  ["tool", (r) => (r.tool = CANARY)],
  ["mode missing", (r) => delete r.execution_mode],
  ["mode invalid", (r) => (r.execution_mode = CANARY)],
  ["target missing", (r) => delete r.target],
  ...Object.keys(TARGET).map((k) => [
    `target ${k}`,
    (r) => (r.target[k] = CANARY),
  ]),
  ["target extra", (r) => (r.target.secret = CANARY)],
  ["timestamp future", (r) => (r.timestamp = "2099-01-01")],
  ["timestamp invalid", (r) => (r.timestamp = CANARY)],
  ["not rebuilt", (r) => (r.rebuild_needed = false)],
  ["smoke missing", (r) => (r.smoke_test = null)],
  ...["signatures", "clean_sample", "eicar_sample", "cleanup"].map((k) => [
    `smoke ${k}`,
    (r) => delete r.smoke_test[k],
  ]),
  ...[
    "new_snapshot_id",
    "previous_snapshot_id",
    "main_sha256",
    "daily_sha256",
  ].flatMap((k) => [
    [`${k} injected`, (r) => (r[k] = CANARY)],
    [`${k} newline`, (r) => (r[k] += "\n")],
  ]),
  ["same snapshot", (r) => (r.previous_snapshot_id = r.new_snapshot_id)],
  ...[
    "error",
    "failure",
    "failure_reason",
    "failed",
    "activated",
    "activation_performed",
  ].map((k) => [`contradiction ${k}`, (r) => (r[k] = CANARY)]),
  ...[
    "receipt_status",
    "activation_status",
    "deployment_verification",
    "retirement_status",
    "configuration_export",
    "prune_status",
  ].map((k) => [`contradiction ${k}`, (r) => (r[k] = CANARY)]),
];
for (const [name, mutate] of invalid)
  test(`ineligible success cannot publish a receipt: ${name}`, () =>
    temporary((dir) => {
      const r = receipt();
      mutate(r);
      const options = setup(dir, r);
      const result = cli(options);
      assert.equal(result.status, 1);
      assert.equal(result.stderr, "summary_receipt_invalid\n");
      assert.equal(result.stdout, "");
      const markdown = fs.readFileSync(options.summary, "utf8");
      assert.match(markdown, /no handoff available/);
      assert.doesNotMatch(
        markdown,
        /```|PRIVATE_CANARY|private\.invalid|\/private\/receipt/,
      );
      assert.throws(() =>
        prepareHandoff(
          { receipt: options.receipt, outputDir: dir + "/bundle" },
          { now },
        ),
      );
      assert.equal(fs.existsSync(dir + "/bundle"), false);
    }));
for (const [mode, status] of [
  ["simulation", "success"],
  ["live", "skipped"],
  ["live", "failed"],
])
  test(`non-success is diagnostic only: ${mode}/${status}`, () =>
    temporary((dir) => {
      const r = receipt();
      r.execution_mode = mode;
      r.status = status;
      r.target = CANARY;
      r.timestamp = CANARY;
      r.smoke_test = { private: CANARY };
      r.extra = CANARY;
      r.error = "candidate_smoke_failed";
      const options = setup(dir, r);
      const result = cli(options);
      assert.equal(result.status, 0, result.stderr);
      const markdown = fs.readFileSync(options.summary, "utf8");
      assert.match(markdown, /no handoff available/);
      assert.match(markdown, /new_snapshot_id: `snap_new`/);
      assert.match(markdown, /candidate_smoke_failed/);
      assert.doesNotMatch(
        markdown,
        /```|PRIVATE_CANARY|target:|timestamp:|smoke_test:/,
      );
      assert.throws(() =>
        prepareHandoff(
          { receipt: options.receipt, outputDir: dir + "/bundle" },
          { now },
        ),
      );
    }));
test("diagnostic allowlist drops every injected value and trailing newline", () => {
  for (const value of [
    CANARY,
    "snap_new\n",
    "a".repeat(64) + "\n",
    "failed\n",
    "live\n",
    "candidate_build_failed\n",
  ]) {
    const r = Object.fromEntries(
      [
        "execution_mode",
        "status",
        "new_snapshot_id",
        "main_sha256",
        "daily_sha256",
        "activation_status",
        "configuration_export",
        "error",
      ].map((k) => [k, value]),
    );
    const markdown = renderSummary(r, now);
    assert.doesNotMatch(
      markdown,
      /PRIVATE_CANARY|snap_new|a{64}|- status:|- execution_mode:|- error:/,
    );
  }
});
for (const kind of [
  "malformed",
  "oversized",
  "array",
  "null",
  "symlink",
  "dangling symlink",
  "directory",
  "fifo",
  "read failure",
])
  test(`unsafe receipt fails visibly without disclosure: ${kind}`, () =>
    temporary((dir) => {
      const options = setup(dir);
      if (kind === "malformed") fs.writeFileSync(options.receipt, "{" + CANARY);
      if (kind === "oversized")
        fs.writeFileSync(options.receipt, " ".repeat(MAX_RECEIPT_BYTES + 1));
      if (["array", "null"].includes(kind))
        fs.writeFileSync(options.receipt, kind === "array" ? "[]" : "null");
      if (
        [
          "symlink",
          "dangling symlink",
          "directory",
          "fifo",
          "read failure",
        ].includes(kind)
      ) {
        options.receipt += ".unsafe";
        if (kind.includes("symlink"))
          fs.symlinkSync(
            kind === "symlink" ? dir + "/receipt.json" : dir + "/absent",
            options.receipt,
          );
        if (kind === "directory") fs.mkdirSync(options.receipt);
        if (kind === "fifo")
          assert.equal(spawnSync("mkfifo", [options.receipt]).status, 0);
        if (kind === "read failure")
          options.receipt = dir + "/receipt.json/invalid";
      }
      const result = cli(options);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "summary_receipt_invalid\n");
      assert.doesNotMatch(
        fs.readFileSync(options.summary, "utf8"),
        /```|PRIVATE_CANARY/,
      );
    }));
test("missing evidence is expected and summary write failures remain failures", () =>
  temporary((dir) => {
    const options = { receipt: dir + "/absent", summary: dir + "/summary.md" };
    assert.equal(cli(options).status, 0);
    assert.match(
      fs.readFileSync(options.summary, "utf8"),
      /Receipt evidence is unavailable/,
    );
    for (const receiptFile of [options.receipt, setup(dir).receipt]) {
      const result = cli({ receipt: receiptFile, summary: dir });
      assert.equal(result.status, 1);
      assert.equal(result.stderr, "summary_write_failed\n");
      assert.equal(result.stdout, "");
    }
  }));
test("bounded-reader errors and summary sink errors are sanitized", () =>
  temporary((dir) => {
    const options = setup(dir);
    const open = fs.openSync;
    try {
      fs.openSync = () => {
        throw Error(CANARY);
      };
      // Receipt open fails; the fixed invalid notice is still published.
      assert.throws(
        () => summarize(options, { now }),
        /^Error: summary_receipt_invalid$/,
      );
    } finally {
      fs.openSync = open;
    }
    const append = fs.appendFileSync;
    try {
      fs.appendFileSync = () => {
        throw Error(CANARY);
      };
      assert.throws(
        () => summarize(options, { now }),
        /^Error: summary_write_failed$/,
      );
    } finally {
      fs.appendFileSync = append;
    }
  }));
test("argument validation and help stay offline without provider or network loading", () =>
  temporary((dir) => {
    const guard = dir + "/guard.cjs";
    fs.writeFileSync(
      guard,
      `const M=require('node:module'),load=M._load;M._load=function(n,...a){if(/@vercel|node:https|node:http$|node:net|node:child_process/.test(n))throw Error('PRIVATE_CANARY');return load.call(this,n,...a)};global.fetch=()=>{throw Error('PRIVATE_CANARY')};`,
    );
    const run = (args) =>
      spawnSync(process.execPath, ["--require", guard, CLI, ...args], {
        encoding: "utf8",
        env: { PATH: process.env.PATH },
      });
    const help = run(["--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Offline sanitized summary only/);
    for (const args of [
      [],
      [CANARY],
      ["--activate"],
      ["--receipt"],
      ["--receipt", ""],
      ["--receipt", " "],
      ["--receipt", "--summary"],
      ["--summary", "x"],
      ["--help", "--help"],
      ["--help", "--unknown"],
      ["--receipt", "x", "--receipt", "y"],
      ["--summary", "x", "--summary", "y"],
    ]) {
      assert.throws(() => parseArgs(args), /summary_arguments_invalid/);
      const result = run(args);
      assert.equal(result.status, 1);
      assert.equal(result.stderr, "summary_arguments_invalid\n");
      assert.equal(result.stdout, "");
    }
    const options = setup(dir);
    assert.equal(
      run(["--receipt", options.receipt, "--summary", options.summary]).status,
      0,
    );
  }));

const workflow = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../.github/workflows/scanner-snapshot-rebuild.yml",
  ),
  "utf8",
);
function workflowScript(name) {
  const step = workflow
    .split(`      - name: ${name}\n`)[1]
    ?.split(/\n      - /)[0];
  assert.ok(step, `workflow step exists: ${name}`);
  return step
    .split("        run: |\n")[1]
    .split("\n")
    .map((line) => line.replace(/^          /, ""))
    .join("\n");
}
for (const outcome of [
  "success",
  "invalid",
  "missing",
  "missing task directory",
  "summary write failure",
  "missing task directory and summary write failure",
])
  test(`actual workflow summary then always-cleanup: ${outcome}`, () =>
    temporary((dir) => {
      const taskDir = path.join(dir, "task with spaces");
      fs.mkdirSync(taskDir, { mode: 0o700 });
      const options = setup(taskDir);
      fs.writeFileSync(taskDir + "/candidate.env", CANARY, { mode: 0o600 });
      if (outcome === "invalid")
        fs.writeFileSync(
          options.receipt,
          JSON.stringify({ ...receipt(), activated: true, secret: CANARY }),
        );
      if (outcome === "missing") fs.unlinkSync(options.receipt);
      const summary = outcome.includes("summary write failure")
        ? dir
        : dir + "/summary with spaces.md";
      const env = {
        PATH: process.env.PATH,
        SCANNER_TASK_DIR: outcome.includes("missing task directory")
          ? ""
          : taskDir,
        GITHUB_STEP_SUMMARY: summary,
      };
      const run = (script) =>
        spawnSync("bash", ["-e", "-c", script], {
          cwd: path.resolve(__dirname, "../.."),
          env,
          encoding: "utf8",
        });
      const result = run(
        workflowScript("Generate sanitized candidate handoff summary"),
      );
      assert.equal(
        result.status,
        outcome === "invalid" || outcome.includes("summary write failure")
          ? 1
          : 0,
        result.stderr,
      );
      assert.doesNotMatch(
        result.stdout + result.stderr,
        /PRIVATE_CANARY|private\.invalid/,
      );
      if (outcome.includes("summary write failure"))
        assert.equal(result.stderr, "summary_write_failed\n");
      // Model GitHub's separate always() cleanup, even after summary failure.
      const cleanup = run(workflowScript("Clean up temporary files"));
      assert.equal(cleanup.status, 0, cleanup.stderr);
      if (!outcome.includes("missing task directory"))
        assert.equal(fs.existsSync(taskDir), false);
      if (!outcome.includes("summary write failure")) {
        const markdown = fs.readFileSync(summary, "utf8");
        assert.doesNotMatch(markdown, /PRIVATE_CANARY/);
        if (outcome === "success") handoff(dir, markdown);
        else {
          assert.match(markdown, /no handoff available/);
          assert.doesNotMatch(markdown, /```json/);
        }
      }
    }));
