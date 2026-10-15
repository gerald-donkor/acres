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

// ---- blob-browser ---------------------------------------------------------
const {
  probeBlobBrowser,
  pageRequest,
  syntheticBytes,
  dispositionShape,
} = require("./probe-platform");
const { createHash } = require("node:crypto");
const hex = (b) => createHash("sha256").update(b).digest("hex");

for (const [key, value] of [
  ["ACRES_VERCEL_PROBE", ""],
  ["VERCEL_ENV", "production"],
  ["VERCEL_TEAM_ID", ""],
  ["BLOB_READ_WRITE_TOKEN", "__REQUIRED_TOKEN__"],
]) {
  test(`Blob browser refuses invalid ${key} before any SDK call`, () =>
    assert.throws(() =>
      configuration({ ...base, [key]: value }, "blob-browser"),
    ));
}

test("synthetic bytes are deterministic and seed-dependent", () => {
  assert.deepEqual(syntheticBytes(64, 7), syntheticBytes(64, 7));
  assert.notDeepEqual(syntheticBytes(64, 7), syntheticBytes(64, 8));
});

test("disposition shape never echoes the header value", () => {
  assert.equal(dispositionShape('attachment; filename="x.csv"'), "attachment");
  assert.equal(dispositionShape("inline"), "inline");
  assert.equal(dispositionShape(undefined), "absent");
  assert.equal(dispositionShape("form-data"), "other");
});

test("page request reports keys only, and blocked on fetch failure", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({ url: "https://secret", pathname: "p" });
    const ok = await pageRequest([
      {
        url: "https://x",
        method: "PUT",
        body: { length: 4, seed: 1 },
        read: "json-keys",
      },
      syntheticBytes.toString(),
    ]);
    assert.deepEqual(ok, {
      status: 200,
      blocked: false,
      keys: ["pathname", "url"],
    });
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    const blocked = await pageRequest([
      { url: "https://x", method: "GET", read: "none" },
      syntheticBytes.toString(),
    ]);
    assert.deepEqual(blocked, { status: null, blocked: true });
  } finally {
    globalThis.fetch = original;
  }
});

class FakeNotFound extends Error {}

// A store that applies the rules observed on the real API (2026-10-15): the
// stored type is `x-content-type`, else the `.csv` extension, else
// `content-type`, and must be in the signed allowlist; size, expiry, overwrite
// and pathname binding are enforced. `broken` disables one rule.
function browserFake({
  broken = null,
  failPut = false,
  failCleanup = false,
  hiddenWrite = false,
} = {}) {
  let clock = 0;
  const now = () => Date.now() + clock;
  const store = new Map();
  const deleted = [];
  const resolveType = (pathname, headers) =>
    headers["x-content-type"] ??
    (pathname.endsWith(".csv") ? "text/csv" : headers["content-type"]);
  const sdk = {
    BlobNotFoundError: FakeNotFound,
    async issueSignedToken(o) {
      assert.equal(o.token, "private-test-token");
      return {
        delegationToken: JSON.stringify(o),
        clientSigningToken: "k",
        validUntil: o.validUntil,
      };
    },
    async presignUrl(token, o) {
      const scope = JSON.parse(token.delegationToken);
      if (scope.pathname !== o.pathname)
        throw new Error("Blob path does not match the signed token scope");
      const url = new URL(`https://fake.test/${o.operation}`);
      url.searchParams.set("pathname", o.pathname);
      url.searchParams.set("sig", o.pathname);
      url.searchParams.set("exp", String(o.validUntil ?? scope.validUntil));
      if (o.operation === "put") {
        assert.equal(o.access, "private");
        assert.equal(o.allowOverwrite, false);
        assert.equal(o.addRandomSuffix, false);
        url.searchParams.set("types", o.allowedContentTypes.join(","));
        url.searchParams.set("max", String(o.maximumSizeInBytes));
      }
      return { presignedUrl: url.toString() };
    },
    async head(pathname) {
      const o = store.get(pathname);
      if (!o) throw new FakeNotFound();
      return {
        size: o.bytes.length,
        contentType: o.type,
        url: `https://fake.test/plain/${pathname}`,
      };
    },
    async get(pathname, o) {
      assert.equal(o.access, "private");
      const obj = store.get(pathname);
      return obj
        ? { statusCode: 200, stream: new Response(obj.bytes).body }
        : null;
    },
    async del(pathname) {
      deleted.push(pathname);
      if (failCleanup) throw new Error("secret");
      store.delete(pathname);
    },
  };
  const browser = {
    async request(spec) {
      const url = new URL(spec.url);
      const q = url.searchParams;
      const pathname = q.get("pathname");
      const reply = (status, extra = {}) => ({
        status,
        networkStatus: status,
        blocked: false,
        headers: {},
        ...extra,
      });
      if (url.pathname.startsWith("/plain/")) return reply(403);
      if (q.get("sig") !== pathname && broken !== "pathname") return reply(403);
      if (now() > Number(q.get("exp")) && broken !== "expiry")
        return reply(403);
      if (spec.method === "GET") {
        const obj = store.get(pathname);
        if (!obj) return reply(404);
        return reply(200, {
          length: obj.bytes.length,
          sha256: hex(obj.bytes),
          headers: {
            "content-type": obj.type,
            "content-disposition": "attachment",
          },
        });
      }
      if (failPut) return reply(null, { networkStatus: null, blocked: true });
      // A CORS-hidden write: the store accepts, the page sees nothing.
      const hide = hiddenWrite && pathname.endsWith("/wrong-type");
      const bytes = Buffer.from(
        syntheticBytes(spec.body.length, spec.body.seed),
      );
      const type = resolveType(pathname, spec.headers);
      if (
        !hide &&
        !q.get("types").split(",").includes(type) &&
        broken !== "type"
      )
        return reply(403);
      if (bytes.length > Number(q.get("max")) && broken !== "size")
        return reply(403);
      if (store.has(pathname) && broken !== "overwrite") return reply(400);
      store.set(pathname, { bytes, type });
      if (hide) return reply(null, { networkStatus: null, blocked: true });
      return reply(200, { keys: ["pathname", "url"] });
    },
  };
  const sleep = async (ms) => {
    clock += ms;
  };
  return { sdk, browser, sleep, deleted, store };
}

test("blob-browser passes every gate case and deletes every tracked path", async () => {
  const fake = browserFake();
  const result = await probeBlobBrowser(
    configuration(base, "blob-browser"),
    fake.sdk,
    fake.browser,
    { sleep: fake.sleep },
  );
  assert.equal(result.gatePassed, true);
  assert.equal(result.bytes, 12 * 1024 * 1024);
  for (const [name, c] of Object.entries(result.cases))
    if ("passed" in c) assert.equal(c.passed, true, name);
  assert.deepEqual(result.cases.diagnosticExtensionOverridesHeader, {
    status: 200,
    storedContentType: "text/csv",
  });
  assert.equal(result.cases.diagnosticXContentType.status, 403);
  assert.equal(result.cases.presignedGet.contentDisposition, "attachment");
  assert.equal(fake.store.size, 0);
  assert.ok(fake.deleted.every((p) => p.startsWith("acres-probes/")));
  assert.ok(!JSON.stringify(result).includes("https://"), "no URL in summary");
});

for (const [broken, name] of [
  ["overwrite", "overwriteDenied"],
  ["type", "contentTypeEnforced"],
  ["size", "sizeEnforced"],
  ["pathname", "pathnameBound"],
  ["expiry", "expiryEnforced"],
]) {
  test(`blob-browser fails the gate when ${broken} is not enforced`, async () => {
    const fake = browserFake({ broken });
    const result = await probeBlobBrowser(
      configuration(base, "blob-browser"),
      fake.sdk,
      fake.browser,
      { sleep: fake.sleep },
    );
    assert.equal(result.cases[name].passed, false);
    assert.equal(result.gatePassed, false);
    assert.equal(fake.store.size, 0);
  });
}

test("blob-browser stops after a blocked first PUT and records header names", async () => {
  const fake = browserFake({ failPut: true });
  const result = await probeBlobBrowser(
    configuration(base, "blob-browser"),
    fake.sdk,
    fake.browser,
    { sleep: fake.sleep },
  );
  assert.equal(result.gatePassed, false);
  assert.equal(result.cases.browserPut.passed, false);
  assert.ok(
    result.cases.diagnosticSdkHeaders.headerNames.includes("x-content-type"),
  );
  assert.equal(result.cases.serverHead, undefined);
});

test("blob-browser cleanup failure cannot mint success", async () => {
  const fake = browserFake({ failCleanup: true });
  await assert.rejects(
    probeBlobBrowser(
      configuration(base, "blob-browser"),
      fake.sdk,
      fake.browser,
      { sleep: fake.sleep },
    ),
  );
  assert.ok(fake.deleted.length > 0);
});

test("blob-browser fails a reject case whose write CORS hid from the page", async () => {
  const fake = browserFake({ hiddenWrite: true });
  const result = await probeBlobBrowser(
    configuration(base, "blob-browser"),
    fake.sdk,
    fake.browser,
    { sleep: fake.sleep },
  );
  assert.equal(result.cases.contentTypeEnforced.passed, false);
  assert.equal(result.gatePassed, false);
  assert.equal(fake.store.size, 0);
});
