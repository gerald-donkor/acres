"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  parseArgs,
  writeReceipt,
  evaluateCadence,
  rebuildCadence,
} = require("./rebuild-scanner-cadence");
const {
  SNAPSHOT_EXPIRATION_MS,
  assertOutsideRepo,
} = require("./build-scanner-snapshot");

const config = {
  teamId: "team-test",
  projectId: "prj-test",
  region: "iad1",
  auth: "token",
  token: "test-token",
};

function fakeSdk({
  storedSnapshots = new Map(),
  failSnapshot = false,
  failDelete = false,
  failClean = false,
  failEicar = false,
  cleanShape = "ok",
  eicarShape = "found:Eicar-Test-Signature",
} = {}) {
  const events = [];
  const creates = [];
  const written = [];
  const snapshots = new Map(storedSnapshots);

  const sdk = {
    Sandbox: {
      async create(options) {
        creates.push(options);
        const isBuilder = !options.snapshotId;
        const targetSnapshotId = options.snapshotId;
        events.push(
          `create:${isBuilder ? "builder" : `probe:${targetSnapshotId}`}`,
        );

        return {
          name: isBuilder ? "sbx-builder" : "sbx-probe",
          async runCommand(cmd) {
            events.push(`run:${cmd.cmd}:${cmd.args?.[0] ?? ""}`);
            if (isBuilder) {
              const script = cmd.args?.[1] || "";
              if (cmd.cmd === "node" && cmd.args?.[0]?.endsWith("fetch.js")) {
                return { exitCode: 0, stdout: async () => "deb-sha256-ok\n" };
              }
              if (cmd.cmd === "node") {
                return { exitCode: 0, stdout: async () => "signatures-ok\n" };
              }
              if (cmd.cmd === "clamscan") {
                const file = cmd.args?.at(-1) || "";
                if (file.endsWith("eicar.txt")) {
                  return {
                    exitCode: 1,
                    stdout: async () => `${file}: Eicar-Test-Signature FOUND\n`,
                  };
                }
                return { exitCode: 0, stdout: async () => `${file}: OK\n` };
              }
              if (script.includes("command -v clamscan")) {
                return {
                  exitCode: 0,
                  stdout: async () =>
                    "/usr/local/bin/clamscan\n/usr/local/bin/sigtool\n/usr/local/bin/freshclam\n" +
                    "ClamAV 1.5.4/27800/Wed Oct 14 09:00:00 2026\n" +
                    "d".repeat(64) +
                    "  /var/lib/clamav/main.cvd\n" +
                    "e".repeat(64) +
                    "  /var/lib/clamav/daily.cvd\n" +
                    "== main\nBuild time: 16 Sep 2025 06:00 -0400\nVersion: 63\n" +
                    "== daily\nBuild time: 14 Oct 2026 09:00 +0000\nVersion: 27800\n" +
                    "== bytecode\nBuild time: 01 Aug 2025 10:00 +0000\nVersion: 339\n" +
                    "== files\nbytecode.cvd\ndaily.cvd\nfreshclam.dat\nmain.cvd\nacres-step-ok\n",
                };
              }
              return { exitCode: 0, stdout: async () => "acres-step-ok\n" };
            }

            if (cmd.cmd === "clamscan") {
              const file = cmd.args?.at(-1) || "";
              if (file.endsWith("clean.csv")) {
                events.push("smoke:clean");
                if (failClean) {
                  return {
                    exitCode: 2,
                    stdout: async () => `${file}: ERROR\n`,
                  };
                }
                return {
                  exitCode: 0,
                  stdout: async () =>
                    `${file}: ${cleanShape === "ok" ? "OK" : "OTHER"}\n`,
                };
              }
              if (file.endsWith("eicar.txt")) {
                events.push("smoke:eicar");
                if (failEicar) {
                  return { exitCode: 0, stdout: async () => `${file}: OK\n` };
                }
                return {
                  exitCode: 1,
                  stdout: async () =>
                    `${file}: ${eicarShape.startsWith("found:") ? eicarShape.slice(6) : "UNKNOWN"} FOUND\n`,
                };
              }
            }

            return { exitCode: 0, stdout: async () => "acres-step-ok\n" };
          },
          async writeFiles(files) {
            for (const f of files) written.push(f);
            events.push("writeFiles");
          },
          async update(params) {
            events.push(`update:${params.networkPolicy}`);
          },
          async snapshot() {
            events.push("snapshot");
            if (failSnapshot) throw new Error("snapshot refused");
            snapshots.set("snap_new", {
              snapshotId: "snap_new",
              status: "created",
              sizeBytes: 812_000_000,
              expiresAt: new Date(Date.now() + SNAPSHOT_EXPIRATION_MS),
              createdAt: new Date(),
            });
            return { snapshotId: "snap_new" };
          },
          async stop() {
            events.push("stop");
          },
          async delete(opts) {
            events.push(`delete:${opts?.deleteOrphanSnapshots ?? false}`);
            if (failDelete) throw new Error("delete failure");
          },
        };
      },
    },
    Snapshot: {
      async get({ snapshotId }) {
        events.push(`get:${snapshotId}`);
        const snap = snapshots.get(snapshotId);
        if (!snap || snap.status === "gone" || snap.status === "deleted") {
          const error = new Error("not found");
          error.response = { status: 404 };
          throw error;
        }
        return {
          snapshotId,
          status: snap.status ?? "created",
          sizeBytes: snap.sizeBytes ?? 812_000_000,
          expiresAt:
            snap.expiresAt ?? new Date(Date.now() + SNAPSHOT_EXPIRATION_MS),
          createdAt: snap.createdAt ?? new Date(),
          async delete() {
            events.push(`delete-snapshot:${snapshotId}`);
            snapshots.set(snapshotId, { status: "deleted" });
          },
        };
      },
    },
  };

  return { sdk, events, creates, written, snapshots };
}

describe("CLI usage & flag parsing", () => {
  test("--help and -h set help flag and exit 0", () => {
    assert.equal(parseArgs(["--help"]).help, true);
    assert.equal(parseArgs(["-h"]).help, true);
  });

  test("invalid or unknown flags throw Unknown argument", () => {
    assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
    assert.throws(() => parseArgs(["-x"]), /Unknown argument/);
  });

  test("--max-age-hours validates positive numeric input within 1..168", () => {
    assert.equal(parseArgs(["--max-age-hours", "24"]).maxAgeHours, 24);
    assert.equal(parseArgs(["--max-age-hours=72"]).maxAgeHours, 72);
    assert.throws(
      () => parseArgs(["--max-age-hours", "0"]),
      /--max-age-hours must be a positive integer from 1 through 168/,
    );
    assert.throws(
      () => parseArgs(["--max-age-hours", "169"]),
      /--max-age-hours must be a positive integer from 1 through 168/,
    );
    assert.throws(
      () => parseArgs(["--max-age-hours", "-10"]),
      /--max-age-hours must be a positive integer from 1 through 168/,
    );
    assert.throws(
      () => parseArgs(["--max-age-hours", "abc"]),
      /--max-age-hours must be a positive integer from 1 through 168/,
    );
  });

  test("--current-snapshot-id validates format", () => {
    assert.equal(
      parseArgs(["--current-snapshot-id", "snap_abc123"]).currentSnapshotId,
      "snap_abc123",
    );
    assert.throws(
      () => parseArgs(["--current-snapshot-id", "invalid_id"]),
      /--current-snapshot-id must be a Sandbox snapshot id/,
    );
    assert.throws(
      () => parseArgs(["--current-snapshot-id", "../evil"]),
      /--current-snapshot-id must be a Sandbox snapshot id/,
    );
  });

  test("--write-env validates path outside repository and rejects symlinks", () => {
    assert.throws(
      () => assertOutsideRepo("client/scanner.env"),
      /Refusing to write scanner.env inside the repository/,
    );
    assert.throws(
      () => assertOutsideRepo("scanner.env"),
      /Refusing to write scanner.env inside the repository/,
    );

    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "acres-scanner-test-"),
    );
    try {
      const validPath = path.join(tmpDir, "scanner.env");
      assert.equal(assertOutsideRepo(validPath), path.resolve(validPath));

      const symlinkTarget = path.join(tmpDir, "real.env");
      const symlinkPath = path.join(tmpDir, "link.env");
      fs.writeFileSync(symlinkTarget, "test=1\n");
      fs.symlinkSync(symlinkTarget, symlinkPath);
      assert.throws(
        () => assertOutsideRepo(symlinkPath),
        /Refusing to write scanner.env through a symlink/,
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("missing flag values throw explicit errors", () => {
    assert.throws(() => parseArgs(["--output"]), /Missing value for --output/);
    assert.throws(() => parseArgs(["-o"]), /Missing value for -o/);
    assert.throws(
      () => parseArgs(["--write-env"]),
      /Missing value for --write-env/,
    );
    assert.throws(
      () => parseArgs(["--current-snapshot-id"]),
      /Missing value for --current-snapshot-id/,
    );
    assert.throws(
      () => parseArgs(["--max-age-hours"]),
      /Missing value for --max-age-hours/,
    );
  });
});

describe("Cadence evaluation logic", () => {
  const now = 1792195200000; // Reference timestamp

  test("fresh snapshot (<48h) skips build and returns rebuildNeeded: false", async () => {
    const fake = fakeSdk({
      storedSnapshots: new Map([
        [
          "snap_fresh",
          {
            snapshotId: "snap_fresh",
            status: "created",
            createdAt: new Date(now - 12 * 3600000), // 12h old
          },
        ],
      ]),
    });

    const res = await evaluateCadence(config, fake.sdk, {
      currentSnapshotId: "snap_fresh",
      maxAgeHours: 48,
      force: false,
      now,
    });

    assert.equal(res.rebuildNeeded, false);
    assert.equal(res.reason, "snapshot_recent");
    assert.ok(res.ageHours < 48);
  });

  test("stale snapshot (>48h) flags rebuildNeeded: true", async () => {
    const fake = fakeSdk({
      storedSnapshots: new Map([
        [
          "snap_stale",
          {
            snapshotId: "snap_stale",
            status: "created",
            createdAt: new Date(now - 52 * 3600000), // 52h old
          },
        ],
      ]),
    });

    const res = await evaluateCadence(config, fake.sdk, {
      currentSnapshotId: "snap_stale",
      maxAgeHours: 48,
      force: false,
      now,
    });

    assert.equal(res.rebuildNeeded, true);
    assert.equal(res.reason, "stale_or_forced");
    assert.ok(res.ageHours > 48);
  });

  test("--force forces rebuildNeeded: true even when current snapshot is fresh", async () => {
    const fake = fakeSdk({
      storedSnapshots: new Map([
        [
          "snap_fresh",
          {
            snapshotId: "snap_fresh",
            status: "created",
            createdAt: new Date(now - 2 * 3600000), // 2h old
          },
        ],
      ]),
    });

    const res = await evaluateCadence(config, fake.sdk, {
      currentSnapshotId: "snap_fresh",
      maxAgeHours: 48,
      force: true,
      now,
    });

    assert.equal(res.rebuildNeeded, true);
    assert.equal(res.reason, "stale_or_forced");
  });

  test("missing current snapshot ID flags rebuildNeeded: true", async () => {
    const fake = fakeSdk();
    const res = await evaluateCadence(config, fake.sdk, {
      currentSnapshotId: null,
      maxAgeHours: 48,
      force: false,
      now,
    });

    assert.equal(res.rebuildNeeded, true);
    assert.equal(res.reason, "stale_or_forced");
    assert.equal(res.ageHours, null);
  });

  test("missing/deleted snapshot flags rebuildNeeded: true", async () => {
    const fake = fakeSdk({
      storedSnapshots: new Map([
        [
          "snap_deleted",
          {
            snapshotId: "snap_deleted",
            status: "deleted",
          },
        ],
      ]),
    });

    const res = await evaluateCadence(config, fake.sdk, {
      currentSnapshotId: "snap_deleted",
      maxAgeHours: 48,
      force: false,
      now,
    });

    assert.equal(res.rebuildNeeded, true);
    assert.equal(res.reason, "stale_or_forced");
  });
});

describe("Execution order & safety invariants", () => {
  test("smoke tests candidate and retains previous snapshot", async () => {
    const fake = fakeSdk({
      storedSnapshots: new Map([
        [
          "snap_old",
          {
            snapshotId: "snap_old",
            status: "created",
            createdAt: new Date(Date.now() - 60 * 3600000), // stale
          },
        ],
      ]),
    });

    const receipt = await rebuildCadence(config, fake.sdk, {
      currentSnapshotId: "snap_old",
      force: false,
      skipPrune: false,
    });

    assert.equal(receipt.status, "success");
    assert.equal(receipt.rebuild_needed, true);
    assert.equal(receipt.new_snapshot_id, "snap_new");
    assert.equal(receipt.prune_status, "retained");

    // Execution sequence checks
    const builderCreate = fake.events.indexOf("create:builder");
    const snapshotCreate = fake.events.indexOf("snapshot");
    const probeCreate = fake.events.indexOf("create:probe:snap_new");
    const cleanScan = fake.events.indexOf("smoke:clean");
    const eicarScan = fake.events.indexOf("smoke:eicar");
    const deleteOld = fake.events.indexOf("delete-snapshot:snap_old");

    assert.ok(builderCreate >= 0, "builder created");
    assert.ok(snapshotCreate > builderCreate, "snapshot taken after build");
    assert.ok(
      probeCreate > snapshotCreate,
      "probe sandbox created from new snapshot",
    );
    assert.ok(cleanScan > probeCreate, "clean scan executed in probe");
    assert.ok(eicarScan > cleanScan, "eicar scan executed in probe");
    assert.equal(deleteOld, -1, "old snapshot retained after smoke tests");
  });

  test("smoke test failure halts immediately and DOES NOT prune previous snapshot", async () => {
    const fake = fakeSdk({
      storedSnapshots: new Map([
        [
          "snap_old",
          {
            snapshotId: "snap_old",
            status: "created",
            createdAt: new Date(Date.now() - 60 * 3600000),
          },
        ],
      ]),
      failClean: true, // Clean scan returns exit 2 instead of 0
    });

    await assert.rejects(
      rebuildCadence(config, fake.sdk, {
        currentSnapshotId: "snap_old",
        force: false,
      }),
      (err) => err.message === "candidate_smoke_failed",
    );

    assert.ok(
      !fake.events.includes("delete-snapshot:snap_old"),
      "old snapshot was NOT deleted",
    );
  });

  test("eicar smoke test failure halts immediately and DOES NOT prune previous snapshot", async () => {
    const fake = fakeSdk({
      storedSnapshots: new Map([
        [
          "snap_old",
          {
            snapshotId: "snap_old",
            status: "created",
            createdAt: new Date(Date.now() - 60 * 3600000),
          },
        ],
      ]),
      failEicar: true, // Eicar scan returns exit 0 instead of 1
    });

    await assert.rejects(
      rebuildCadence(config, fake.sdk, {
        currentSnapshotId: "snap_old",
        force: false,
      }),
      (err) => err.message === "candidate_smoke_failed",
    );

    assert.ok(
      !fake.events.includes("delete-snapshot:snap_old"),
      "old snapshot was NOT deleted",
    );
  });

  test("--skip-prune preserves previous snapshot after successful rebuild", async () => {
    const fake = fakeSdk({
      storedSnapshots: new Map([
        [
          "snap_old",
          {
            snapshotId: "snap_old",
            status: "created",
            createdAt: new Date(Date.now() - 60 * 3600000),
          },
        ],
      ]),
    });

    const receipt = await rebuildCadence(config, fake.sdk, {
      currentSnapshotId: "snap_old",
      skipPrune: true,
    });

    assert.equal(receipt.status, "success");
    assert.equal(receipt.prune_status, "retained");
    assert.ok(
      !fake.events.includes("delete-snapshot:snap_old"),
      "old snapshot was preserved",
    );
  });
});

describe("Receipt emission", () => {
  test("writes structured JSON audit receipt with 0600 mode", () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "acres-receipt-test-"),
    );
    try {
      const receiptPath = path.join(tmpDir, "receipt.json");
      const sampleReceipt = {
        tool: "rebuild-scanner-cadence",
        timestamp: "2026-10-17T00:00:00.000Z",
        status: "success",
        rebuild_needed: true,
        previous_snapshot_id: "snap_prev",
        new_snapshot_id: "snap_next",
        main_sha256: "0".repeat(64),
        daily_sha256: "1".repeat(64),
        smoke_test: { clean_sample: "passed", eicar_sample: "passed" },
        prune_status: "retained",
        execution_mode: "simulation",
      };

      writeReceipt(receiptPath, sampleReceipt);

      assert.ok(fs.existsSync(receiptPath));
      const stat = fs.statSync(receiptPath);
      // Mode 0600 check (rw-------)
      assert.equal(stat.mode & 0o777, 0o600);

      const parsed = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
      assert.deepEqual(parsed, sampleReceipt);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("failed rebuild writes failed receipt if output path is configured", async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "acres-receipt-fail-"),
    );
    try {
      const receiptPath = path.join(tmpDir, "failed-receipt.json");
      const fake = fakeSdk({
        failClean: true,
      });

      await assert.rejects(
        rebuildCadence(config, fake.sdk, {
          force: true,
          output: receiptPath,
        }),
      );

      assert.ok(fs.existsSync(receiptPath));
      const parsed = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
      assert.equal(parsed.status, "failed");
      assert.equal(parsed.rebuild_needed, true);
      assert.equal(parsed.smoke_test.clean_sample, "failed");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("Dry-run simulation mode", () => {
  test("--dry-run executes full pipeline without cloud mutations", async () => {
    const fake = fakeSdk();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-dryrun-test-"));
    try {
      const envPath = path.join(tmpDir, "scanner.env");
      const receiptPath = path.join(tmpDir, "receipt.json");

      const receipt = await rebuildCadence(config, fake.sdk, {
        dryRun: true,
        force: true,
        writeEnv: envPath,
        output: receiptPath,
        currentSnapshotId: "snap_current",
      });

      assert.equal(receipt.status, "success");
      assert.equal(receipt.execution_mode, "simulation");
      assert.equal(receipt.smoke_test, null);
      assert.equal(receipt.activation_status, "not_performed");
      assert.equal(receipt.configuration_export, "not_performed");
      assert.equal(receipt.prune_status, "retained");

      // No SDK network/cloud operations were performed
      assert.equal(fake.events.length, 0);

      assert.ok(!fs.existsSync(envPath));
      assert.ok(fs.existsSync(receiptPath));
      assert.equal(receipt.new_snapshot_id, null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("main() handles --dry-run without environment credentials", () => {
    const result = require("node:child_process").spawnSync(
      process.execPath,
      [path.join(__dirname, "rebuild-scanner-cadence.js"), "--dry-run"],
      { env: {}, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).execution_mode, "simulation");
  });
});

const { spawnSync } = require("node:child_process");
const forbiddenSdk = new Proxy(
  {},
  {
    get() {
      throw new Error("SDK must not be accessed");
    },
  },
);
function temporary(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-candidate-"));
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}
function retained(fake) {
  assert.ok(!fake.events.some((e) => e.startsWith("delete-snapshot:")));
  assert.ok(!fake.events.includes("delete:true"));
}

test("simulation preserves existing env bytes/mode and does not access SDK", () =>
  temporary(async (dir) => {
    const env = path.join(dir, "active.env");
    fs.writeFileSync(env, "ACTIVE=sentinel\n", { mode: 0o640 });
    const receipt = await rebuildCadence({}, forbiddenSdk, {
      dryRun: true,
      writeEnv: env,
    });
    assert.equal(fs.readFileSync(env, "utf8"), "ACTIVE=sentinel\n");
    assert.equal(fs.statSync(env).mode & 0o777, 0o640);
    assert.equal(receipt.configuration_export, "not_performed");
    assert.equal(receipt.activation_status, "not_performed");
  }));

test("help does not access SDK or require credentials", async () => {
  // subprocess also keeps test runner reporting separate from CLI output.
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "rebuild-scanner-cadence.js"), "--help"],
    { env: {}, encoding: "utf8" },
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /all snapshots are retained/);
});

for (const kind of [
  "env-exists",
  "receipt-exists",
  "env-link",
  "receipt-link",
  "same-path",
  "normalized-alias",
  "parent-alias",
  "missing-parent",
  "directory",
]) {
  test(`output preflight rejects ${kind} before SDK work`, () =>
    temporary(async (dir) => {
      const env = path.join(dir, "candidate.env");
      const out = path.join(dir, "receipt.json");
      const sentinel = path.join(dir, "sentinel");
      fs.writeFileSync(sentinel, "preserve", { mode: 0o640 });
      const opts = { force: true, writeEnv: env, output: out };
      if (kind === "env-exists") fs.writeFileSync(env, "original");
      if (kind === "receipt-exists") fs.writeFileSync(out, "original");
      if (kind === "env-link") fs.symlinkSync(sentinel, env);
      if (kind === "receipt-link") fs.symlinkSync(sentinel, out);
      if (kind === "same-path") opts.output = env;
      if (kind === "normalized-alias")
        opts.output = path.join(dir, "./candidate.env");
      if (kind === "parent-alias") {
        fs.symlinkSync(dir, path.join(dir, "alias"));
        opts.output = path.join(dir, "alias/candidate.env");
      }
      if (kind === "missing-parent")
        opts.output = path.join(dir, "absent/receipt");
      if (kind === "directory") fs.mkdirSync(env);
      await assert.rejects(
        rebuildCadence(config, forbiddenSdk, opts),
        /Scanner output/,
      );
      assert.equal(fs.readFileSync(sentinel, "utf8"), "preserve");
    }));
}

test("live export creates exactly three variables, mode 0600, and retains both snapshots", () =>
  temporary(async (dir) => {
    const fake = fakeSdk();
    const env = path.join(dir, "candidate.env");
    const r = await rebuildCadence(config, fake.sdk, {
      force: true,
      writeEnv: env,
      currentSnapshotId: "snap_old",
    });
    assert.equal(
      fs.readFileSync(env, "utf8"),
      `ACRES_SCANNER_SNAPSHOT_ID=snap_new\nACRES_SCANNER_MAIN_SHA256=${"d".repeat(64)}\nACRES_SCANNER_DAILY_SHA256=${"e".repeat(64)}\n`,
    );
    assert.equal(fs.statSync(env).mode & 0o777, 0o600);
    assert.equal(r.configuration_export, "exported");
    assert.equal(r.activation_status, "not_performed");
    assert.equal(fake.events.filter((e) => e === "delete:false").length, 2);
    retained(fake);
  }));

for (const destination of ["env", "receipt"]) {
  test(`exclusive ${destination} write preserves destination created during cloud work`, () =>
    temporary(async (dir) => {
      const fake = fakeSdk();
      const file = path.join(dir, destination);
      const create = fake.sdk.Sandbox.create;
      fake.sdk.Sandbox.create = async (params) => {
        if (!fs.existsSync(file))
          fs.writeFileSync(file, "race-sentinel", { mode: 0o640 });
        return create(params);
      };
      const opts = {
        force: true,
        [destination === "env" ? "writeEnv" : "output"]: file,
      };
      await assert.rejects(rebuildCadence(config, fake.sdk, opts), (err) => {
        assert.equal(err.receipt.status, "failed");
        assert.equal(err.receipt.new_snapshot_id, "snap_new");
        assert.equal(err.receipt.activation_status, "not_performed");
        return true;
      });
      assert.equal(fs.readFileSync(file, "utf8"), "race-sentinel");
      assert.equal(fs.statSync(file).mode & 0o777, 0o640);
      retained(fake);
    }));
}

for (const failure of [
  "failSnapshot",
  "failDelete",
  "failClean",
  "failEicar",
]) {
  test(`${failure} retains snapshots and cannot certify success`, () =>
    temporary(async (dir) => {
      const fake = fakeSdk({ [failure]: true });
      const out = path.join(dir, "receipt");
      await assert.rejects(
        rebuildCadence(config, fake.sdk, {
          force: true,
          currentSnapshotId: "snap_old",
          output: out,
        }),
      );
      const r = JSON.parse(fs.readFileSync(out));
      assert.equal(r.status, "failed");
      assert.equal(r.prune_status, "retained");
      assert.equal(r.activation_status, "not_performed");
      if (failure === "failDelete") assert.equal(r.new_snapshot_id, "snap_new");
      retained(fake);
    }));
}

test("probe cleanup failure fails preparation", async () => {
  const fake = fakeSdk();
  const create = fake.sdk.Sandbox.create;
  fake.sdk.Sandbox.create = async (params) => {
    const sandbox = await create(params);
    if (params.snapshotId)
      sandbox.delete = async (opts) => {
        assert.equal(opts.deleteOrphanSnapshots, false);
        throw new Error("private-provider-canary");
      };
    return sandbox;
  };
  await assert.rejects(
    rebuildCadence(config, fake.sdk, { force: true }),
    /candidate_smoke_failed/,
  );
  retained(fake);
});

for (const age of [47.999, 48, 48.001]) {
  test(`snapshot age ${age} hours uses strict threshold`, async () => {
    const now = Date.now();
    const sdk = {
      Snapshot: {
        get: async () => ({
          status: "created",
          createdAt: new Date(now - age * 3600000),
        }),
      },
    };
    const r = await evaluateCadence(config, sdk, {
      currentSnapshotId: "snap_old",
      maxAgeHours: 48,
      now,
    });
    assert.equal(r.rebuildNeeded, age >= 48);
    assert.equal(r.reason, age < 48 ? "snapshot_recent" : "stale_or_forced");
  });
}
for (const metadata of [
  {},
  { createdAt: "invalid" },
  { createdAt: new Date(Date.now() + 3600000) },
  { expiresAt: "invalid" },
]) {
  test(`untrustworthy metadata ${JSON.stringify(metadata)} requests rebuild`, async () => {
    const sdk = {
      Snapshot: { get: async () => ({ status: "created", ...metadata }) },
    };
    const r = await evaluateCadence(config, sdk, {
      currentSnapshotId: "snap_old",
      maxAgeHours: 48,
    });
    assert.equal(r.rebuildNeeded, true);
    assert.equal(r.ageHours, null);
  });
}

test("recent snapshot skips build and configuration export", () =>
  temporary(async (dir) => {
    const fake = fakeSdk({
      storedSnapshots: new Map([["snap_old", { createdAt: new Date() }]]),
    });
    const file = path.join(dir, "unused.env");
    const r = await rebuildCadence(config, fake.sdk, {
      currentSnapshotId: "snap_old",
      writeEnv: file,
    });
    assert.equal(r.status, "skipped");
    assert.equal(fs.existsSync(file), false);
    assert.equal(fake.creates.length, 0);
    retained(fake);
  }));

test("SDK and builder detail canaries never escape public errors or receipts", () =>
  temporary(async (dir) => {
    const { BuildError } = require("./build-scanner-snapshot");
    for (const error of [
      new Error("TOKEN-private-canary /private/path"),
      new BuildError("TOKEN-private-canary", "TOKEN-private-canary"),
    ]) {
      const fake = fakeSdk();
      fake.sdk.Sandbox.create = async () => {
        throw error;
      };
      const output = path.join(dir, `receipt-${error.name}`);
      await assert.rejects(
        rebuildCadence(config, fake.sdk, { force: true, output }),
        (err) => {
          assert.doesNotMatch(
            err.stack + JSON.stringify(err.receipt),
            /TOKEN-private-canary|private\/path/,
          );
          return true;
        },
      );
      assert.doesNotMatch(
        fs.readFileSync(output, "utf8"),
        /TOKEN-private-canary|private\/path/,
      );
      retained(fake);
    }
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
for (const [event, prepare, force, expected] of [
  ["schedule", "true", "true", "simulation"],
  ["workflow_dispatch", "false", "true", "simulation"],
  ["workflow_dispatch", "", "", "simulation"],
  ["workflow_dispatch", "true", "false", "live"],
]) {
  test(`workflow mode ${event}/${prepare}/${force} selects ${expected}`, () =>
    temporary((dir) => {
      const output = path.join(dir, "mode");
      const r = spawnSync(
        "bash",
        ["-e", "-c", workflowScript("Select execution mode")],
        {
          env: {
            ...process.env,
            EVENT_NAME: event,
            PREPARE_CANDIDATE: prepare,
            FORCE_INPUT: force,
            GITHUB_OUTPUT: output,
          },
          encoding: "utf8",
        },
      );
      assert.equal(r.status, 0, r.stderr);
      assert.equal(fs.readFileSync(output, "utf8"), `mode=${expected}\n`);
    }));
}

test("workflow target mismatch rejects before executing Node", () =>
  temporary((dir) => {
    const marker = path.join(dir, "node-called");
    fs.writeFileSync(path.join(dir, "node"), `#!/bin/sh\ntouch '${marker}'\n`, {
      mode: 0o700,
    });
    const r = spawnSync(
      "bash",
      ["-e", "-c", workflowScript("Prepare retained preview candidate")],
      {
        env: {
          PATH: dir + ":" + process.env.PATH,
          VERCEL_TEAM_ID: "wrong",
          VERCEL_PROJECT_ID: "wrong",
          ACRES_VERCEL_PROBE_REGION: "iad1",
        },
        encoding: "utf8",
      },
    );
    assert.equal(r.status, 1);
    assert.equal(fs.existsSync(marker), false);
    assert.match(r.stderr, /target mismatch/);
  }));

test("workflow credentials are live-step-only and defaults remain simulation", () => {
  const live = workflow
    .split("      - name: Prepare retained preview candidate")[1]
    .split("      - name:")[0];
  const remaining = workflow.replace(live, "");
  assert.doesNotMatch(remaining, /secrets\.|VERCEL_TOKEN:/);
  assert.match(live, /if: steps.mode.outputs.mode == 'live'/);
  assert.match(workflow, /prepare_candidate:[\s\S]*?default: false/);
  assert.match(workflow, /mktemp -d "\$RUNNER_TEMP\/acres-scanner\.XXXXXXXX"/);
  assert.match(workflow, /chmod 700/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(
    workflow,
    /cat .*receipt|--replace|--prune|vercel env|gh variable|vercel deploy|environment: production/,
  );
});

test("workflow summary allowlist drops secret/error payloads", () =>
  temporary((dir) => {
    fs.writeFileSync(
      path.join(dir, "receipt.json"),
      JSON.stringify({
        status: "failed",
        execution_mode: "live",
        new_snapshot_id: "snap_new",
        token: "SECRET-canary",
        error: "SECRET-canary",
        main_sha256: "SECRET-canary",
      }),
    );
    const output = path.join(dir, "summary");
    const r = spawnSync(
      "bash",
      [
        "-e",
        "-c",
        workflowScript("Generate sanitized candidate handoff summary"),
      ],
      {
        env: {
          ...process.env,
          SCANNER_TASK_DIR: dir,
          GITHUB_STEP_SUMMARY: output,
        },
        encoding: "utf8",
      },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(fs.readFileSync(output, "utf8"), /SECRET-canary/);
    assert.match(fs.readFileSync(output, "utf8"), /snap_new/);
  }));

test("empty output arguments fail closed", () => {
  for (const arg of ["--output=", "-o=", "--write-env="]) {
    assert.throws(() => parseArgs([arg]), /must not be empty/);
  }
});

test("builder command diagnostics do not reach console or receipts", () =>
  temporary(async (dir) => {
    const fake = fakeSdk();
    const create = fake.sdk.Sandbox.create;
    fake.sdk.Sandbox.create = async (params) => {
      const sandbox = await create(params);
      sandbox.runCommand = async () => ({
        exitCode: 2,
        stdout: async () => "SECRET-command-canary /private/path",
      });
      return sandbox;
    };
    const output = path.join(dir, "receipt");
    const logs = [];
    await assert.rejects(
      rebuildCadence(config, fake.sdk, {
        force: true,
        output,
        log: (line) => logs.push(line),
      }),
      (err) => {
        assert.doesNotMatch(
          err.stack + JSON.stringify(err.receipt),
          /SECRET-command-canary|private\/path/,
        );
        return true;
      },
    );
    assert.deepEqual(logs, []);
    assert.doesNotMatch(
      fs.readFileSync(output, "utf8"),
      /SECRET-command-canary|private\/path/,
    );
    retained(fake);
  }));

test("cleanup failure retains accurate passing scan evidence", async () => {
  const fake = fakeSdk();
  const create = fake.sdk.Sandbox.create;
  fake.sdk.Sandbox.create = async (params) => {
    const sandbox = await create(params);
    if (params.snapshotId)
      sandbox.delete = async () => {
        throw new Error("cleanup-canary");
      };
    return sandbox;
  };
  await assert.rejects(
    rebuildCadence(config, fake.sdk, { force: true }),
    (err) => {
      assert.deepEqual(err.receipt.smoke_test, {
        clean_sample: "passed",
        eicar_sample: "passed",
        cleanup: "failed",
      });
      return true;
    },
  );
  retained(fake);
});

for (const force of ["false", "true"]) {
  test(`workflow valid target invokes candidate CLI with force=${force}`, () =>
    temporary((dir) => {
      const argsFile = path.join(dir, "args");
      fs.writeFileSync(
        path.join(dir, "node"),
        '#!/bin/sh\nprintf "%s\\n" "$@" > "$ARGS_FILE"\n',
        { mode: 0o700 },
      );
      const r = spawnSync(
        "bash",
        ["-e", "-c", workflowScript("Prepare retained preview candidate")],
        {
          env: {
            PATH: dir + ":" + process.env.PATH,
            VERCEL_TEAM_ID: "team_zE3mp7nrEZ6a7cxRavwUMYC4",
            VERCEL_PROJECT_ID: "prj_q9ApajZWDgdYZetnm5s5oakEjrUD",
            ACRES_VERCEL_PROBE_REGION: "iad1",
            FORCE_INPUT: force,
            SCANNER_TASK_DIR: dir,
            ARGS_FILE: argsFile,
          },
          encoding: "utf8",
        },
      );
      assert.equal(r.error, undefined);
      assert.equal(r.status, 0, r.stderr);
      const args = fs.readFileSync(argsFile, "utf8").trim().split("\n");
      assert.deepEqual(args, [
        "scripts/vercel/rebuild-scanner-cadence.js",
        "--write-env",
        path.join(dir, "candidate.env"),
        "--output",
        path.join(dir, "receipt.json"),
        ...(force === "true" ? ["--force"] : []),
      ]);
    }));
}

test("workflow runtime directories are unique and restricted", () =>
  temporary((dir) => {
    const output = path.join(dir, "env");
    const run = () =>
      spawnSync(
        "bash",
        ["-e", "-c", workflowScript("Create isolated runtime directory")],
        {
          env: { PATH: process.env.PATH, RUNNER_TEMP: dir, GITHUB_ENV: output },
          encoding: "utf8",
        },
      );
    for (let i = 0; i < 2; i++) {
      const r = run();
      assert.equal(r.error, undefined);
      assert.equal(r.status, 0, r.stderr);
    }
    const dirs = fs
      .readFileSync(output, "utf8")
      .trim()
      .split("\n")
      .map((line) => line.split("=")[1]);
    assert.notEqual(dirs[0], dirs[1]);
    for (const file of dirs)
      assert.equal(fs.statSync(file).mode & 0o777, 0o700);
  }));

test("help and simulation tolerate an SDK double that forbids any access", async () => {
  const { main } = require("./rebuild-scanner-cadence");
  const log = console.log;
  const messages = [];
  try {
    console.log = (line) => messages.push(line);
    await main(["--help"], {}, forbiddenSdk);
    await main(["--dry-run"], {}, forbiddenSdk);
  } finally {
    console.log = log;
  }
  assert.match(messages[0], /all snapshots are retained/);
  assert.equal(JSON.parse(messages[1]).execution_mode, "simulation");
});

test("exclusive open rejects a collision after the final path check", () =>
  temporary(async (dir) => {
    const fake = fakeSdk();
    const file = path.join(dir, "candidate.env");
    const open = fs.openSync;
    try {
      fs.openSync = function (target, flags, mode) {
        if (target === file && flags === "wx") {
          fs.writeFileSync(file, "late-sentinel", { mode: 0o640 });
        }
        return open.call(this, target, flags, mode);
      };
      await assert.rejects(
        rebuildCadence(config, fake.sdk, { force: true, writeEnv: file }),
        /candidate_configuration_export_failed/,
      );
    } finally {
      fs.openSync = open;
    }
    assert.equal(fs.readFileSync(file, "utf8"), "late-sentinel");
    assert.equal(fs.statSync(file).mode & 0o777, 0o640);
    retained(fake);
  }));
