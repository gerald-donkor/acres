"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  configuration,
  probeBlob,
  probeScanner,
  readBounded,
} = require("./probe-platform");

const base = {
  ACRES_VERCEL_PROBE: "isolated-synthetic-preview",
  VERCEL_ENV: "preview",
  VERCEL_TEAM_ID: "team-test",
  VERCEL_PROJECT_ID: "prj-test",
  BLOB_READ_WRITE_TOKEN: "private-test-token",
  VERCEL_TOKEN: "test-token",
  ACRES_VERCEL_PROBE_REGION: "fra1",
  ACRES_SCANNER_IMAGE: `vcr.vercel.com/test/probe/scanner@sha256:${"a".repeat(64)}`,
  ACRES_SCANNER_MAIN_SHA256: "b".repeat(64),
  ACRES_SCANNER_DAILY_SHA256: "c".repeat(64),
  ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS: "24",
};

for (const [key, value] of [
  ["ACRES_VERCEL_PROBE", ""],
  ["VERCEL_ENV", "production"],
  ["VERCEL_TEAM_ID", ""],
  ["VERCEL_PROJECT_ID", "__REQUIRED_TARGET__"],
  ["BLOB_READ_WRITE_TOKEN", ""],
]) {
  test(`Blob refuses invalid ${key} before any SDK call`, () =>
    assert.throws(() => configuration({ ...base, [key]: value }, "blob")));
}
for (const [key, value] of [
  ["VERCEL_TOKEN", ""],
  ["ACRES_VERCEL_PROBE_REGION", ""],
  ["ACRES_VERCEL_PROBE_REGION", "unselected"],
  ["ACRES_SCANNER_IMAGE", "latest"],
  ["ACRES_SCANNER_MAIN_SHA256", "bad"],
  ["ACRES_SCANNER_DAILY_SHA256", ""],
  ["ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS", "24junk"],
  ["ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS", "169"],
  ["ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS", "0"],
]) {
  test(`Scanner refuses invalid ${key}=${value}`, () =>
    assert.throws(() => configuration({ ...base, [key]: value }, "scanner")));
}
test("unknown mode fails closed", () =>
  assert.throws(() => configuration(base, "deploy")));

function blobFake({
  status = 403,
  wrongBytes = false,
  putFailure = false,
  cleanupFailure = false,
} = {}) {
  let bytes;
  let key;
  const deleted = [];
  const sdk = {
    async put(k, body, options) {
      key = k;
      bytes = body;
      assert.equal(options.access, "private");
      assert.equal(options.allowOverwrite, false);
      if (putFailure) throw new Error("secret");
      return {
        url: "https://probe.private.blob.vercel-storage.com/synthetic.csv",
      };
    },
    async get(k, options) {
      assert.equal(k, key);
      assert.equal(options.access, "private");
      assert.equal(options.useCache, false);
      return {
        statusCode: 200,
        stream: new Response(wrongBytes ? "wrong" : bytes).body,
      };
    },
    async del(k) {
      deleted.push(k);
      if (cleanupFailure) throw new Error("secret cleanup error");
    },
  };
  const fetcher = async () => new Response(null, { status });
  return { sdk, fetcher, deleted };
}

test("Blob verifies bytes, private read denial and exact-path cleanup", async () => {
  const fake = blobFake();
  const result = await probeBlob(
    configuration(base, "blob"),
    fake.sdk,
    fake.fetcher,
  );
  assert.equal(result.checksumVerified, true);
  assert.equal(result.bytes, 5 * 1024 * 1024);
  assert.equal(result.browserUploadProven, false);
  assert.equal(fake.deleted.length, 1);
  assert.match(fake.deleted[0], /^acres-probes\/[0-9a-f-]+\/synthetic.csv$/);
});
for (const options of [
  { status: 200 },
  { status: 500 },
  { wrongBytes: true },
  { putFailure: true },
  { cleanupFailure: true },
]) {
  test(`Blob failure still cleans up ${JSON.stringify(options)}`, async () => {
    const fake = blobFake(options);
    await assert.rejects(
      probeBlob(configuration(base, "blob"), fake.sdk, fake.fetcher),
    );
    assert.equal(fake.deleted.length, 1);
  });
}
test("bounded read cancels an oversized body", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(4));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(readBounded(stream, 2));
  assert.equal(cancelled, true);
});

function scannerFake(codes = [0, 0, 1], failWrite = false, failStop = false) {
  let stopped = 0;
  let commands = 0;
  const sdk = {
    Sandbox: {
      async create(options) {
        assert.equal(options.networkPolicy, "deny-all");
        assert.equal(options.region, "fra1");
        assert.equal(options.timeout, 120000);
        assert.deepEqual(options.resources, { vcpus: 1 });
        assert.match(options.image, /@sha256:/);
        assert.equal(options.env, undefined);
        return {
          async runCommand(cmd) {
            assert.equal(cmd.detached, undefined);
            assert.equal(cmd.timeoutMs, 30000);
            return { exitCode: codes[commands++] };
          },
          async writeFiles(files) {
            assert.equal(files.length, 2);
            assert.match(
              files[1].content.toString(),
              /EICAR-STANDARD-ANTIVIRUS-TEST-FILE/,
            );
            if (failWrite) throw new Error("private failure");
          },
          async stop() {
            stopped++;
            if (failStop) throw new Error("cleanup failure");
          },
        };
      },
    },
  };
  return { sdk, stopped: () => stopped };
}
test("scanner checks signatures, clean/EICAR, then stops without production claim", async () => {
  const fake = scannerFake();
  const result = await probeScanner(configuration(base, "scanner"), fake.sdk);
  assert.equal(result.productionScannerProven, false);
  assert.equal(result.eicarRejected, true);
  assert.equal(fake.stopped(), 1);
});
for (const codes of [[2], [3], [0, 2, 1], [0, 0, 0], [0, 0, 2]]) {
  test(`scanner rejects nonconforming signature/scan exits ${codes}`, async () => {
    const fake = scannerFake(codes);
    await assert.rejects(
      probeScanner(configuration(base, "scanner"), fake.sdk),
    );
    assert.equal(fake.stopped(), 1);
  });
}
test("scanner stops after file-write failure", async () => {
  const fake = scannerFake([], true);
  await assert.rejects(probeScanner(configuration(base, "scanner"), fake.sdk));
  assert.equal(fake.stopped(), 1);
});
test("scanner cleanup failure cannot mint success", async () => {
  const fake = scannerFake([0, 0, 1], false, true);
  await assert.rejects(probeScanner(configuration(base, "scanner"), fake.sdk));
  assert.equal(fake.stopped(), 1);
});
