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
  smokeTestSnapshot,
  rebuildCadence,
  main,
} = require("./rebuild-scanner-cadence");
const {
  BuildError,
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
    assert.throws(
      () => parseArgs(["--output"]),
      /Missing value for --output/,
    );
    assert.throws(
      () => parseArgs(["-o"]),
      /Missing value for -o/,
    );
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
    assert.equal(res.reason, "signatures_fresh");
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
  test("smoke test runs on newly created snapshot before replacing previous snapshot", async () => {
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
    assert.equal(receipt.prune_status, "pruned");

    // Execution sequence checks
    const builderCreate = fake.events.indexOf("create:builder");
    const snapshotCreate = fake.events.indexOf("snapshot");
    const probeCreate = fake.events.indexOf("create:probe:snap_new");
    const cleanScan = fake.events.indexOf("smoke:clean");
    const eicarScan = fake.events.indexOf("smoke:eicar");
    const deleteOld = fake.events.indexOf("delete-snapshot:snap_old");

    assert.ok(builderCreate >= 0, "builder created");
    assert.ok(snapshotCreate > builderCreate, "snapshot taken after build");
    assert.ok(probeCreate > snapshotCreate, "probe sandbox created from new snapshot");
    assert.ok(cleanScan > probeCreate, "clean scan executed in probe");
    assert.ok(eicarScan > cleanScan, "eicar scan executed in probe");
    assert.ok(deleteOld > eicarScan, "old snapshot deleted ONLY AFTER probe scans passed");
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
      (err) => err instanceof BuildError && err.message.includes("smoke-test-failed"),
    );

    assert.ok(!fake.events.includes("delete-snapshot:snap_old"), "old snapshot was NOT deleted");
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
      (err) => err instanceof BuildError && err.message.includes("smoke-test-failed"),
    );

    assert.ok(!fake.events.includes("delete-snapshot:snap_old"), "old snapshot was NOT deleted");
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
    assert.equal(receipt.prune_status, "skipped");
    assert.ok(!fake.events.includes("delete-snapshot:snap_old"), "old snapshot was preserved");
  });
});

describe("Receipt emission", () => {
  test("writes structured JSON audit receipt with 0600 mode and creates parent directories", () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "acres-receipt-test-"),
    );
    try {
      const receiptPath = path.join(tmpDir, "nested/receipt.json");
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
        prune_status: "pruned",
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

  test("pruning failure writes failed receipt with prune_status: 'failed'", async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "acres-prune-fail-"),
    );
    try {
      const receiptPath = path.join(tmpDir, "prune-failed-receipt.json");
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
      // Override Snapshot.get for old snapshot so replaceSnapshot fails
      const origGet = fake.sdk.Snapshot.get;
      fake.sdk.Snapshot.get = async (params) => {
        const res = await origGet(params);
        if (params.snapshotId === "snap_old") {
          return {
            ...res,
            async delete() {
              throw new Error("delete failed");
            },
          };
        }
        return res;
      };

      await assert.rejects(
        rebuildCadence(config, fake.sdk, {
          currentSnapshotId: "snap_old",
          output: receiptPath,
        }),
      );

      assert.ok(fs.existsSync(receiptPath));
      const parsed = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
      assert.equal(parsed.status, "failed");
      assert.equal(parsed.prune_status, "failed");
      assert.equal(parsed.new_snapshot_id, "snap_new");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("Dry-run simulation mode", () => {
  test("--dry-run executes full pipeline without cloud mutations", async () => {
    const fake = fakeSdk();
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "acres-dryrun-test-"),
    );
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
      assert.equal(receipt.smoke_test.clean_sample, "passed");
      assert.equal(receipt.smoke_test.eicar_sample, "passed");
      assert.equal(receipt.prune_status, "pruned");

      // No SDK network/cloud operations were performed
      assert.equal(fake.events.length, 0);

      // Files were written properly
      assert.ok(fs.existsSync(envPath));
      assert.ok(fs.existsSync(receiptPath));
      const envContent = fs.readFileSync(envPath, "utf8");
      assert.match(envContent, /^ACRES_SCANNER_SNAPSHOT_ID=snap_simulated_/m);
      assert.match(envContent, /^ACRES_SCANNER_MAIN_SHA256=0{64}$/m);
      assert.match(envContent, /^ACRES_SCANNER_DAILY_SHA256=1{64}$/m);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("main() handles --dry-run without environment credentials", async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "acres-main-dryrun-"),
    );
    const logs = [];
    const origLog = console.log;
    console.log = (msg) => logs.push(msg);

    try {
      const receiptPath = path.join(tmpDir, "receipt.json");
      await main(
        ["--dry-run", "--force", "-o", receiptPath],
        {}, // Empty environment, no credentials
        {}, // Dummy SDK
      );

      assert.equal(logs.length, 1);
      const parsed = JSON.parse(logs[0]);
      assert.equal(parsed.status, "success");
      assert.equal(parsed.execution_mode, "simulation");
      assert.ok(fs.existsSync(receiptPath));
    } finally {
      console.log = origLog;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
