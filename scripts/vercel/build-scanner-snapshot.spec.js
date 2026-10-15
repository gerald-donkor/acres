"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  CLAMAV_DEB_SHA256,
  BASE_IMAGE,
  SNAPSHOT_EXPIRATION_MS,
  buildSnapshot,
  replaceSnapshot,
  assertOutsideRepo,
  writeScannerEnv,
  parseArgs,
  main,
} = require("./build-scanner-snapshot");

const MAIN = "d".repeat(64);
const DAILY = "e".repeat(64);
const config = {
  teamId: "team-test",
  projectId: "prj-test",
  region: "iad1",
  auth: "token",
  token: "test-token",
};

const RECORD =
  "/usr/local/bin/clamscan\n/usr/local/bin/sigtool\n/usr/local/bin/freshclam\n" +
  "ClamAV 1.5.4/27800/Wed Oct 14 09:00:00 2026\n" +
  `${MAIN}  /var/lib/clamav/main.cvd\n${DAILY}  /var/lib/clamav/daily.cvd\n` +
  "== main\nBuild time: 16 Sep 2025 06:00 -0400\nVersion: 63\n" +
  "== daily\nBuild time: 14 Oct 2026 09:00 +0000\nVersion: 27800\n" +
  "== bytecode\nBuild time: 01 Aug 2025 10:00 +0000\nVersion: 339\n" +
  "== files\nbytecode.cvd\ndaily.cvd\nfreshclam.dat\nmain.cvd\nacres-step-ok\n";

// Answers what a healthy builder does; `override(step, cmd)` may replace any.
function stepOf(cmd) {
  if (cmd.cmd === "node" && cmd.args[0].endsWith("fetch.js")) return "fetch";
  if (cmd.cmd === "node") return "signatures";
  if (cmd.cmd === "clamscan") return "scan";
  const script = cmd.args[1];
  for (const [step, needle] of [
    ["record-environment", "os-release"],
    ["dpkg-install", "dpkg -i"],
    ["database-owner", "useradd"],
    ["freshclam", "freshclam --config-file"],
    ["record-scanner", "command -v clamscan"],
    ["scrub", "rm -rf"],
    ["prepare", "mkdir -p"],
  ])
    if (script.includes(needle)) return step;
  throw new Error(`unexpected command ${cmd.cmd}`);
}

function defaultAnswer(step, cmd) {
  const ok = (stdout, exitCode = 0) => ({ exitCode, stdout });
  switch (step) {
    case "record-environment":
      return ok(
        "os=ubuntu 26.04\nnode=v24.21.0\nuid=1000\ncurl=1\ngpg=0\nsudo=1\nacres-step-ok\n",
      );
    case "fetch":
      return cmd.args[3] === CLAMAV_DEB_SHA256
        ? ok("deb-sha256-ok\n")
        : ok("", 2);
    case "record-scanner":
      return ok(RECORD);
    case "signatures":
      return ok("signatures-ok\n");
    case "scan": {
      const file = cmd.args.at(-1);
      return file.endsWith("eicar.txt")
        ? ok(`${file}: Eicar-Test-Signature FOUND\n`, 1)
        : ok(`${file}: OK\n`);
    }
    default:
      return ok("acres-step-ok\n");
  }
}

function fakeSdk({
  override = () => undefined,
  failSnapshot = false,
  failDelete = false,
  snapshotStatus = "created",
  replaceGoneVia = "deleted",
  oldMissing = false,
} = {}) {
  const events = [];
  const creates = [];
  const written = [];
  const snapshots = new Map();
  const sdk = {
    Sandbox: {
      async create(options) {
        creates.push(options);
        return {
          name: "sbx-builder",
          async runCommand(cmd) {
            const step = stepOf(cmd);
            events.push(`run:${step}`);
            const a = override(step, cmd) ?? defaultAnswer(step, cmd);
            return {
              exitCode: a.exitCode,
              stdout: async () => a.stdout,
              stderr: async () => "builder stderr",
            };
          },
          async writeFiles(files) {
            for (const f of files) written.push(f);
            events.push("write");
          },
          async update(params) {
            assert.equal(params.networkPolicy, "deny-all");
            events.push("update");
          },
          async snapshot(opts) {
            assert.equal(opts.expiration, SNAPSHOT_EXPIRATION_MS);
            events.push("snapshot");
            if (failSnapshot) throw new Error("snapshot refused");
            snapshots.set("snap_new", snapshotStatus);
            return { snapshotId: "snap_new" };
          },
          async stop() {
            events.push("stop");
          },
          async delete(opts) {
            events.push(`delete:${opts.deleteOrphanSnapshots}`);
            if (failDelete) throw new Error("delete failure");
          },
        };
      },
    },
    Snapshot: {
      async get({ snapshotId }) {
        events.push(`get:${snapshotId}`);
        if (snapshotId === "snap_old" && !snapshots.has("snap_old"))
          snapshots.set("snap_old", oldMissing ? "gone" : "created");
        const status = snapshots.get(snapshotId);
        if (status === "gone") {
          const error = new Error("not found");
          error.response = { status: 404 };
          throw error;
        }
        return {
          snapshotId,
          status,
          sizeBytes: 812_000_000,
          expiresAt: new Date("2026-10-23T15:00:00Z"),
          async delete() {
            events.push(`delete-snapshot:${snapshotId}`);
            snapshots.set(
              snapshotId,
              replaceGoneVia === "404" ? "gone" : replaceGoneVia,
            );
          },
        };
      },
    },
  };
  return { sdk, events, creates, written };
}

const build = (fake, extra = {}) =>
  buildSnapshot(config, fake.sdk, { freshclamConf: "conf\n", ...extra });

test("builds from the managed image, scrubs inputs, snapshots and keeps it", async () => {
  const fake = fakeSdk();
  const summary = await build(fake);
  const [options] = fake.creates;
  assert.equal(options.image, BASE_IMAGE);
  assert.equal(options.persistent, false);
  assert.deepEqual(options.resources, { vcpus: 2 });
  assert.ok(Array.isArray(options.networkPolicy.allow));
  assert.equal(options.token, "test-token");
  assert.equal(summary.snapshotId, "snap_new");
  assert.equal(summary.clamavVersion, "1.5.4");
  assert.equal(summary.main.sha256, MAIN);
  assert.equal(summary.daily.version, "27800");
  assert.equal(summary.bytecode.version, "339");
  assert.deepEqual(summary.databaseFiles, [
    "bytecode.cvd",
    "daily.cvd",
    "freshclam.dat",
    "main.cvd",
  ]);
  assert.equal(summary.egressAtSnapshot, "deny-all");
  assert.equal(summary.expiresAt, "2026-10-23T15:00:00.000Z");
  const scrub = fake.events.indexOf("run:scrub");
  const snap = fake.events.indexOf("snapshot");
  assert.ok(scrub >= 0 && snap > scrub);
  assert.ok(fake.events.indexOf("update") < snap);
  assert.ok(fake.events.includes("delete:false"));
  assert.ok(!fake.events.includes("delete:true"));
  assert.ok(!fake.events.includes("stop"), "snapshot() already stopped it");
});

test("OIDC auth binds the checked token to the target, in create and Snapshot.get", async () => {
  const fake = fakeSdk();
  await buildSnapshot(
    { ...config, auth: "oidc", token: "oidc-jwt" },
    fake.sdk,
    {
      freshclamConf: "",
    },
  );
  assert.equal(fake.creates[0].token, "oidc-jwt");
  assert.equal(fake.creates[0].teamId, "team-test");
  assert.equal(fake.creates[0].projectId, "prj-test");
});

test("a digest mismatch aborts before dpkg and still deletes the builder", async () => {
  const fake = fakeSdk({
    override: (step) =>
      step === "fetch" ? { exitCode: 2, stdout: "" } : undefined,
  });
  await assert.rejects(build(fake), /deb-digest-mismatch/);
  assert.ok(!fake.events.includes("run:dpkg-install"));
  assert.ok(!fake.events.includes("snapshot"));
  assert.deepEqual(fake.events.slice(-2), ["stop", "delete:false"]);
});

for (const step of [
  "record-environment",
  "dpkg-install",
  "database-owner",
  "freshclam",
  "record-scanner",
  "scrub",
]) {
  test(`a failed ${step} aborts, never snapshots and deletes the builder`, async () => {
    const fake = fakeSdk({
      override: (s) => (s === step ? { exitCode: 1, stdout: "" } : undefined),
    });
    await assert.rejects(build(fake), new RegExp(step));
    assert.ok(!fake.events.includes("snapshot"));
    assert.ok(fake.events.includes("delete:false"));
  });
}

test("accepts the version line printed without a default database", async () => {
  const fake = fakeSdk({
    override: (s) =>
      s === "record-scanner"
        ? {
            exitCode: 0,
            stdout: RECORD.replace(
              "ClamAV 1.5.4/27800/Wed Oct 14 09:00:00 2026",
              "ClamAV 1.5.4",
            ),
          }
        : undefined,
  });
  assert.equal((await build(fake)).clamavVersion, "1.5.4");
});

test("exit 0 without the step marker is not success", async () => {
  const fake = fakeSdk({
    override: (s) =>
      s === "freshclam" ? { exitCode: 0, stdout: "" } : undefined,
  });
  await assert.rejects(build(fake), /freshclam/);
});

for (const [label, override] of [
  [
    "signature check",
    (s) => (s === "signatures" ? { exitCode: 3, stdout: "" } : undefined),
  ],
  [
    "clean scan",
    (s, c) =>
      s === "scan" && c.args.at(-1).endsWith("clean.csv")
        ? { exitCode: 1, stdout: "" }
        : undefined,
  ],
  [
    "EICAR scan",
    (s, c) =>
      s === "scan" && c.args.at(-1).endsWith("eicar.txt")
        ? { exitCode: 0, stdout: "" }
        : undefined,
  ],
  [
    "wrong ClamAV version",
    (s) =>
      s === "record-scanner"
        ? { exitCode: 0, stdout: RECORD.replace("1.5.4", "1.4.3") }
        : undefined,
  ],
  [
    "version 1.5.40",
    (s) =>
      s === "record-scanner"
        ? { exitCode: 0, stdout: RECORD.replace("1.5.4/", "1.5.40/") }
        : undefined,
  ],
]) {
  test(`a failed smoke test (${label}) never snapshots`, async () => {
    const fake = fakeSdk({ override });
    await assert.rejects(build(fake));
    assert.ok(!fake.events.includes("snapshot"));
    assert.ok(!fake.events.includes("run:scrub") || label !== "EICAR scan");
    assert.ok(fake.events.includes("delete:false"));
  });
}

test("a refused snapshot still deletes the builder", async () => {
  const fake = fakeSdk({ failSnapshot: true });
  await assert.rejects(build(fake), /snapshot refused/);
  assert.deepEqual(fake.events.slice(-2), ["stop", "delete:false"]);
});

test("a builder delete failure after snapshotting fails the build", async () => {
  const fake = fakeSdk({ failDelete: true });
  await assert.rejects(build(fake), /builder-delete/);
});

test("a snapshot that is not created fails the build", async () => {
  const fake = fakeSdk({ snapshotStatus: "failed" });
  await assert.rejects(build(fake), /snapshot-status/);
});

test("the persistent fallback keeps only the latest snapshot", async () => {
  const fake = fakeSdk();
  await build(fake, { persistentBuilder: true });
  assert.equal(fake.creates[0].persistent, true);
  assert.deepEqual(fake.creates[0].keepLastSnapshots, { count: 1 });
  assert.ok(fake.events.includes("delete:false"));
});

// Runs main() end to end with a real temp env file, capturing stdout/stderr.
async function runMain(fake, args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-out-"));
  const envFile = path.join(dir, "scanner.env");
  const out = [];
  const log = console.log;
  const err = console.error;
  console.log = (line) => {
    out.push(line);
    fake.events.push("stdout:summary");
  };
  console.error = () => {};
  let error;
  try {
    await main(["--write-env", envFile, ...args], mainEnv, fake.sdk);
  } catch (e) {
    error = e;
  } finally {
    console.log = log;
    console.error = err;
  }
  const written = fs.existsSync(envFile)
    ? fs.readFileSync(envFile, "utf8")
    : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { out, error, written };
}
const mainEnv = {
  ACRES_VERCEL_PROBE: "isolated-synthetic-preview",
  VERCEL_ENV: "preview",
  VERCEL_TEAM_ID: "team-test",
  VERCEL_PROJECT_ID: "prj-test",
  ACRES_VERCEL_PROBE_REGION: "iad1",
  VERCEL_TOKEN: "test-token",
};

for (const via of ["deleted", "404"]) {
  test(`--replace deletes only the given id, after the summary is saved (${via})`, async () => {
    const fake = fakeSdk({ replaceGoneVia: via });
    const { out, error, written } = await runMain(fake, [
      "--replace",
      "snap_old",
    ]);
    assert.equal(error, undefined);
    assert.equal(JSON.parse(out[0]).snapshotId, "snap_new");
    assert.match(written, /^ACRES_SCANNER_SNAPSHOT_ID=snap_new$/m);
    const created = fake.events.indexOf("get:snap_new");
    const saved = fake.events.indexOf("stdout:summary");
    const removed = fake.events.indexOf("delete-snapshot:snap_old");
    assert.ok(created >= 0 && saved > created && removed > saved);
    assert.ok(!fake.events.includes("delete-snapshot:snap_new"));
  });
}

test("--replace is not attempted when the build fails", async () => {
  const fake = fakeSdk({ failSnapshot: true });
  const { error, written } = await runMain(fake, ["--replace", "snap_old"]);
  assert.ok(error);
  assert.equal(written, null);
  assert.ok(!fake.events.some((e) => e.startsWith("delete-snapshot")));
});

for (const [label, options, pattern] of [
  [
    "the old snapshot is still there",
    { replaceGoneVia: "created" },
    /replace-confirm/,
  ],
  ["the old snapshot cannot be found", { oldMissing: true }, /replace-lookup/],
]) {
  test(`a failed --replace (${label}) keeps the new summary and env file`, async () => {
    const fake = fakeSdk(options);
    const { out, error, written } = await runMain(fake, [
      "--replace",
      "snap_old",
    ]);
    assert.match(error.message, pattern);
    assert.equal(JSON.parse(out[0]).snapshotId, "snap_new");
    assert.match(written, /^ACRES_SCANNER_MAIN_SHA256=d{64}$/m);
  });
}

test("--replace refuses to delete the snapshot it just built", async () => {
  const fake = fakeSdk();
  await assert.rejects(
    replaceSnapshot(config, fake.sdk, "snap_new", "snap_new"),
    /replace-same-id/,
  );
  assert.ok(!fake.events.some((e) => e.startsWith("delete-snapshot")));
});

test("arguments are validated", () => {
  assert.throws(() => parseArgs(["--replace", "../x"]));
  assert.throws(() => parseArgs(["--write-env"]));
  assert.throws(() => parseArgs(["--deploy"]));
  assert.deepEqual(parseArgs(["--replace", "snap_abc", "--write-env", "/x"]), {
    persistentBuilder: false,
    replace: "snap_abc",
    writeEnv: "/x",
  });
});

test("--write-env refuses repository paths and symlinks, and writes 0600", (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "acres-repo-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "acres-out-"));
  t.after(() => {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(repo, "sub"));
  const summary = {
    snapshotId: "snap_new",
    main: { sha256: MAIN },
    daily: { sha256: DAILY },
  };
  for (const inside of [
    path.join(repo, "scanner.env"),
    path.join(repo, "..scanner.env"),
    path.join(repo, "..", path.basename(repo), "scanner.env"),
    path.join(repo, "sub", "scanner.env"),
    path.join(repo, "sub", "..", "scanner.env"),
  ])
    assert.throws(() => writeScannerEnv(inside, summary, repo), /inside/);
  fs.symlinkSync(path.join(repo, "sub"), path.join(outside, "link"));
  assert.throws(
    () =>
      writeScannerEnv(path.join(outside, "link", "scanner.env"), summary, repo),
    /inside/,
  );
  fs.symlinkSync(path.join(repo, "x.env"), path.join(outside, "dangling.env"));
  assert.throws(
    () => writeScannerEnv(path.join(outside, "dangling.env"), summary, repo),
    /symlink/,
  );
  const target = path.join(outside, "scanner.env");
  writeScannerEnv(target, summary, repo);
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  assert.equal(
    fs.readFileSync(target, "utf8"),
    `ACRES_SCANNER_SNAPSHOT_ID=snap_new\nACRES_SCANNER_MAIN_SHA256=${MAIN}\nACRES_SCANNER_DAILY_SHA256=${DAILY}\n`,
  );
  assert.equal(assertOutsideRepo(target, repo), target);
});

test("main refuses a repository --write-env before creating a sandbox", async () => {
  const fake = fakeSdk();
  const env = {
    ACRES_VERCEL_PROBE: "isolated-synthetic-preview",
    VERCEL_ENV: "preview",
    VERCEL_TEAM_ID: "team-test",
    VERCEL_PROJECT_ID: "prj-test",
    ACRES_VERCEL_PROBE_REGION: "iad1",
    VERCEL_TOKEN: "test-token",
  };
  await assert.rejects(
    main(["--write-env", path.join(__dirname, "scanner.env")], env, fake.sdk),
    /inside/,
  );
  await assert.rejects(
    main([], { ...env, VERCEL_ENV: "production" }, fake.sdk),
  );
  assert.equal(fake.creates.length, 0);
});

test("the summary never carries the token, the package URL or EICAR", async () => {
  const fake = fakeSdk();
  const text = JSON.stringify(await build(fake));
  assert.ok(!text.includes("test-token"));
  assert.ok(!text.includes("github.com"));
  assert.ok(!text.includes("EICAR"));
  // Nothing in the VM receives a credential either.
  for (const f of fake.written)
    assert.ok(!f.content.toString().includes("test-token"));
});
