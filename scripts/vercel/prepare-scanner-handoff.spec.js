"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  prepareHandoff,
  validateReceipt,
  parseArgs,
  TARGET,
  MAX_RECEIPT_BYTES,
} = require("./prepare-scanner-handoff");
const CLI = path.join(__dirname, "prepare-scanner-handoff.js");
const now = Date.parse("2026-10-17T12:00:00Z");
const digest = (s) => createHash("sha256").update(s).digest("hex");
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
    configuration_export: "not_performed",
    prune_status: "retained",
    previous_snapshot_id: "snap_old",
    new_snapshot_id: "snap_new",
    main_sha256: "d".repeat(64),
    daily_sha256: "e".repeat(64),
    smoke_test: {
      clean_sample: "passed",
      eicar_sample: "passed",
      cleanup: "passed",
    },
  };
}
function temporary(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-handoff-test-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
function setup(dir, body = JSON.stringify(receipt())) {
  const input = path.join(dir, "receipt.json");
  fs.writeFileSync(input, body);
  return { receipt: input, outputDir: path.join(dir, "bundle") };
}
function cli(args) {
  return spawnSync(process.execPath, ["--no-addons", CLI, ...args], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      NODE_OPTIONS: "--no-network-family-autoselection",
    },
  });
}
test("bundle has exact runtime names, restricted modes and digest-bound allowlist", () =>
  temporary((dir) => {
    const r = receipt();
    r.unknown = "SECRET_CANARY";
    const opts = setup(dir, JSON.stringify(r));
    const result = prepareHandoff(opts, { now });
    assert.equal(result.status, "prepared");
    assert.deepEqual(fs.readdirSync(opts.outputDir).sort(), [
      "handoff.json",
      "runtime.env",
    ]);
    const env = fs.readFileSync(
      path.join(opts.outputDir, "runtime.env"),
      "utf8",
    );
    assert.equal(
      env,
      `SCANNER_SANDBOX_SNAPSHOT_ID=snap_new\nSCANNER_MAIN_SHA256=${r.main_sha256}\nSCANNER_DAILY_SHA256=${r.daily_sha256}\n`,
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(opts.outputDir, "handoff.json"), "utf8"),
    );
    assert.deepEqual(manifest.target, TARGET);
    assert.equal(
      manifest.receipt_sha256,
      digest(fs.readFileSync(opts.receipt)),
    );
    assert.equal(manifest.runtime_env_sha256, digest(env));
    for (const key of [
      "activation_status",
      "deployment_verification",
      "retirement_status",
    ])
      assert.equal(manifest[key], "not_performed");
    assert.equal(JSON.stringify(manifest).includes("SECRET_CANARY"), false);
    assert.equal(fs.statSync(opts.outputDir).mode & 0o777, 0o700);
    for (const f of ["runtime.env", "handoff.json"])
      assert.equal(
        fs.statSync(path.join(opts.outputDir, f)).mode & 0o777,
        0o600,
      );
  }));
const invalid = [
  ["legacy", (r) => delete r.schema_version],
  ["wrong version", (r) => (r.schema_version = 2)],
  ["producer", (r) => (r.tool = "other")],
  ["simulation", (r) => (r.execution_mode = "simulation")],
  ["skipped", (r) => (r.status = "skipped")],
  ["failed", (r) => (r.status = "failed")],
  ["not rebuilt", (r) => (r.rebuild_needed = false)],
  ["activated", (r) => (r.activation_status = "performed")],
  ["error", (r) => (r.error = "SECRET_CANARY")],
  ["receipt failure", (r) => (r.receipt_status = "failed")],
  ["failure marker", (r) => (r.failed = true)],
  ["deployment", (r) => (r.deployment_verification = "passed")],
  ["retired", (r) => (r.retirement_status = "performed")],
  ["pruned", (r) => (r.prune_status = "deleted")],
  ["export failure", (r) => (r.configuration_export = "failed")],
  ["no target", (r) => delete r.target],
  ["null target", (r) => (r.target = null)],
  ["partial target", (r) => delete r.target.team_id],
  ...Object.keys(TARGET).map((k) => [
    `target ${k}`,
    (r) => (r.target[k] = k === "environment" ? "production" : "other"),
  ]),
  [
    "snapshot",
    (r) => (r.new_snapshot_id = "snap_$(touch /tmp/SECRET_CANARY)\n"),
  ],
  ["hash", (r) => (r.main_sha256 = "A".repeat(64))],
  ["daily missing", (r) => delete r.daily_sha256],
  ["previous", (r) => (r.previous_snapshot_id = "../snap_bad")],
  ["equal ID", (r) => (r.previous_snapshot_id = r.new_snapshot_id)],
  ["invalid timestamp", (r) => (r.timestamp = "SECRET_CANARY")],
  ["future", (r) => (r.timestamp = "2099-01-01")],
  ...["clean_sample", "eicar_sample", "cleanup"].map((k) => [
    `smoke ${k}`,
    (r) => (r.smoke_test[k] = "failed"),
  ]),
];
for (const [name, change] of invalid)
  test(`reject ${name} before creating output`, () =>
    temporary((dir) => {
      const r = receipt();
      change(r);
      const opts = setup(dir, JSON.stringify(r));
      assert.throws(
        () => prepareHandoff(opts, { now }),
        /^Error: handoff_(receipt|target)_invalid$/,
      );
      assert.equal(fs.existsSync(opts.outputDir), false);
    }));
for (const [name, body] of [
  ["array", "[]"],
  ["null", "null"],
  ["malformed", "{SECRET_CANARY"],
  ["oversized", " ".repeat(MAX_RECEIPT_BYTES + 1)],
])
  test(`reject ${name} file`, () =>
    temporary((dir) => {
      const opts = setup(dir, body);
      assert.throws(
        () => prepareHandoff(opts, { now }),
        /handoff_receipt_invalid/,
      );
      assert.equal(fs.existsSync(opts.outputDir), false);
    }));
test("null previous ID is eligible, timestamp clock is injected", () => {
  const r = receipt();
  r.previous_snapshot_id = null;
  assert.equal(validateReceipt(r, now).previous_snapshot_id, null);
  assert.throws(
    () => validateReceipt(r, now - 86400000),
    /handoff_receipt_invalid/,
  );
});
for (const kind of ["symlink", "directory", "fifo", "missing"])
  test(`reject ${kind} input`, () =>
    temporary((dir) => {
      const opts = setup(dir);
      const original = opts.receipt;
      opts.receipt += ".invalid";
      if (kind === "symlink") fs.symlinkSync(original, opts.receipt);
      if (kind === "directory") fs.mkdirSync(opts.receipt);
      if (kind === "fifo")
        assert.equal(spawnSync("mkfifo", [opts.receipt]).status, 0);
      assert.throws(
        () => prepareHandoff(opts, { now }),
        /handoff_receipt_invalid/,
      );
      assert.equal(fs.existsSync(opts.outputDir), false);
    }));
test("input replaced between check and open fails inode check", () =>
  temporary((dir) => {
    const opts = setup(dir);
    const open = fs.openSync;
    try {
      fs.openSync = function (file, ...args) {
        if (file === opts.receipt) {
          fs.renameSync(file, file + ".old");
          fs.writeFileSync(file, JSON.stringify(receipt()));
        }
        return open.call(this, file, ...args);
      };
      assert.throws(
        () => prepareHandoff(opts, { now }),
        /handoff_receipt_invalid/,
      );
    } finally {
      fs.openSync = open;
    }
  }));
for (const kind of [
  "directory",
  "file",
  "symlink",
  "dangling",
  "missing parent",
  "repo alias",
  "overlap",
])
  test(`preserve unsafe output: ${kind}`, () =>
    temporary((dir) => {
      const opts = setup(dir);
      if (kind === "directory") {
        fs.mkdirSync(opts.outputDir);
        fs.writeFileSync(opts.outputDir + "/sentinel", "KEEP");
      }
      if (kind === "file") fs.writeFileSync(opts.outputDir, "KEEP");
      if (kind === "symlink" || kind === "dangling")
        fs.symlinkSync(
          kind === "symlink" ? dir : dir + "/missing",
          opts.outputDir,
        );
      if (kind === "missing parent") opts.outputDir = dir + "/missing/bundle";
      if (kind === "repo alias") {
        fs.symlinkSync(path.resolve(__dirname, "../.."), dir + "/repo");
        opts.outputDir = dir + "/repo/forbidden-handoff";
      }
      if (kind === "overlap") opts.outputDir = opts.receipt;
      assert.throws(
        () => prepareHandoff(opts, { now }),
        /handoff_output_unavailable/,
      );
      if (kind === "directory")
        assert.equal(
          fs.readFileSync(opts.outputDir + "/sentinel", "utf8"),
          "KEEP",
        );
      if (kind === "file")
        assert.equal(fs.readFileSync(opts.outputDir, "utf8"), "KEEP");
    }));
test("late mkdir race preserves pre-existing sentinel", () =>
  temporary((dir) => {
    const opts = setup(dir);
    const mkdir = fs.mkdirSync;
    try {
      fs.mkdirSync = function (file, ...args) {
        if (file === opts.outputDir) {
          mkdir(file);
          fs.writeFileSync(file + "/sentinel", "KEEP");
        }
        return mkdir.call(this, file, ...args);
      };
      assert.throws(
        () => prepareHandoff(opts, { now }),
        /handoff_output_failed/,
      );
    } finally {
      fs.mkdirSync = mkdir;
    }
    assert.deepEqual(fs.readdirSync(opts.outputDir), ["sentinel"]);
  }));
for (const stage of [
  "write env",
  "close env",
  "write manifest",
  "close manifest",
  "publish",
])
  test(`partial ${stage} failure has no completed manifest`, () =>
    temporary((dir) => {
      const opts = setup(dir);
      const write = fs.writeFileSync,
        close = fs.closeSync,
        link = fs.linkSync;
      let writes = 0;
      let failFd;
      try {
        fs.writeFileSync = function (fd, ...args) {
          writes++;
          if (writes === (stage.includes("env") ? 1 : 2)) {
            if (stage.startsWith("write")) {
              write(fd, "PARTIAL_SECRET_CANARY");
              throw new Error("SECRET_CANARY");
            }
            if (stage.startsWith("close")) failFd = fd;
          }
          return write.call(this, fd, ...args);
        };
        fs.closeSync = function (fd) {
          close.call(this, fd);
          if (fd === failFd) {
            failFd = undefined;
            throw new Error("SECRET_CANARY");
          }
        };
        if (stage === "publish")
          fs.linkSync = () => {
            throw new Error("SECRET_CANARY");
          };
        assert.throws(
          () => prepareHandoff(opts, { now }),
          /^Error: handoff_output_failed$/,
        );
      } finally {
        fs.writeFileSync = write;
        fs.closeSync = close;
        fs.linkSync = link;
      }
      assert.equal(fs.existsSync(opts.outputDir + "/handoff.json"), false);
    }));
test("exclusive file collision preserves sentinel", () =>
  temporary((dir) => {
    const opts = setup(dir);
    const open = fs.openSync;
    try {
      fs.openSync = function (file, flags, ...args) {
        if (typeof file === "string" && file.endsWith("/runtime.env"))
          fs.writeFileSync(file, "KEEP");
        return open.call(this, file, flags, ...args);
      };
      assert.throws(
        () => prepareHandoff(opts, { now }),
        /handoff_output_failed/,
      );
    } finally {
      fs.openSync = open;
    }
    assert.equal(
      fs.readFileSync(opts.outputDir + "/runtime.env", "utf8"),
      "KEEP",
    );
    assert.equal(fs.existsSync(opts.outputDir + "/handoff.json"), false);
  }));
test("CLI parsing, help, sanitization and no provider loading", () =>
  temporary((dir) => {
    const guard = path.join(dir, "guard.cjs");
    fs.writeFileSync(
      guard,
      `const M=require('node:module');const load=M._load;M._load=function(n,...a){if(/@vercel|node:https|node:http$|node:net|node:child_process/.test(n))throw Error('PROVIDER_CANARY');return load.call(this,n,...a)};global.fetch=()=>{throw Error('NETWORK_CANARY')};`,
    );
    const run = (args) =>
      spawnSync(process.execPath, ["--require", guard, CLI, ...args], {
        encoding: "utf8",
        env: { PATH: process.env.PATH },
      });
    const help = run(["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Local bundle only/);
    for (const args of [
      [],
      ["--activate"],
      ["SECRET_CANARY"],
      ["--receipt"],
      ["--receipt", ""],
      ["--receipt", "x", "--receipt", "y"],
      ["--help", "--help"],
      ["--help", "--unknown"],
      ["--output-dir", "--receipt"],
    ]) {
      assert.throws(() => parseArgs(args), /handoff_arguments_invalid/);
      const result = run(args);
      assert.equal(result.status, 1);
      assert.equal(result.stderr, "handoff_arguments_invalid\n");
    }
    const opts = setup(dir);
    const ok = run(["--receipt", opts.receipt, "--output-dir", opts.outputDir]);
    assert.equal(ok.status, 0, ok.stderr);
    const bad = cli([
      "--receipt",
      dir + "/$(SECRET_CANARY)",
      "--output-dir",
      dir + "/out",
    ]);
    assert.equal(bad.status, 1);
    assert.equal(bad.stderr, "handoff_receipt_invalid\n");
    assert.equal(bad.stdout, "");
  }));

for (const key of [
  "new_snapshot_id",
  "previous_snapshot_id",
  "main_sha256",
  "daily_sha256",
])
  test(`reject trailing newline in ${key}`, () => {
    const r = receipt();
    r[key] += "\n";
    assert.throws(() => validateReceipt(r, now), /handoff_receipt_invalid/);
  });
test("timestamp is normalized and cannot propagate parseable annotations", () => {
  const r = receipt();
  r.timestamp = "Oct 17 2026 11:00:00 GMT (SECRET_CANARY)";
  assert.equal(
    validateReceipt(r, now).preparation_timestamp,
    "2026-10-17T11:00:00.000Z",
  );
});
test("late manifest collision preserves data and fails", () =>
  temporary((dir) => {
    const opts = setup(dir);
    const link = fs.linkSync;
    try {
      fs.linkSync = function (source, destination) {
        fs.writeFileSync(destination, "KEEP");
        return link.call(this, source, destination);
      };
      assert.throws(
        () => prepareHandoff(opts, { now }),
        /handoff_output_failed/,
      );
    } finally {
      fs.linkSync = link;
    }
    assert.equal(
      fs.readFileSync(opts.outputDir + "/handoff.json", "utf8"),
      "KEEP",
    );
  }));
test("post-publication unlink failure removes owned completed manifest", () =>
  temporary((dir) => {
    const opts = setup(dir);
    const unlink = fs.unlinkSync;
    try {
      fs.unlinkSync = function (file) {
        if (file.endsWith("/.handoff.pending")) throw Error("SECRET_CANARY");
        return unlink.call(this, file);
      };
      assert.throws(
        () => prepareHandoff(opts, { now }),
        /handoff_output_failed/,
      );
    } finally {
      fs.unlinkSync = unlink;
    }
    assert.equal(fs.existsSync(opts.outputDir + "/handoff.json"), false);
  }));

test("post-publication failure removes manifest through renamed owned directory", () =>
  temporary((dir) => {
    const opts = setup(dir);
    const moved = path.join(dir, "moved");
    const unlink = fs.unlinkSync;
    try {
      fs.unlinkSync = function (file) {
        if (file.endsWith("/.handoff.pending")) {
          fs.renameSync(opts.outputDir, moved);
          fs.mkdirSync(opts.outputDir);
          fs.writeFileSync(
            opts.outputDir + "/handoff.json",
            "FOREIGN_SENTINEL",
          );
          throw Error("SECRET_CANARY");
        }
        return unlink.call(this, file);
      };
      assert.throws(
        () => prepareHandoff(opts, { now }),
        /^Error: handoff_output_failed$/,
      );
    } finally {
      fs.unlinkSync = unlink;
    }
    assert.equal(fs.existsSync(moved + "/handoff.json"), false);
    assert.equal(fs.existsSync(moved + "/runtime.env"), true);
    assert.equal(
      fs.readFileSync(opts.outputDir + "/handoff.json", "utf8"),
      "FOREIGN_SENTINEL",
    );
  }));
