"use strict";
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  configuration,
  probeBlob,
  probeScanner,
  probeScannerFailures,
  SANDBOX_BUDGET,
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

const DIGEST = `sha256:${"a".repeat(64)}`;

// Virtual clock: the double "spends" time on sleep commands so the probe's
// timing windows are exercised without real waits.
const realNow = Date.now;
let clockSkew = 0;
Date.now = () => realNow() + clockSkew;
afterEach(() => {
  clockSkew = 0;
});

// Scripted Sandbox double. Each command is answered by what a healthy
// pinned image does; `override(name, cmd)` may replace any answer.
function defaultAnswer(cmd) {
  const args = cmd.args ?? [];
  const ok = (stdout, exitCode = 0) => ({ exitCode, stdout });
  if (cmd.cmd === "sh" && args[1].includes("uid="))
    return ok("uid=1000\ndb=1\ntmp=1\n");
  if (cmd.cmd === "sh" && args[1].includes("VmHWM"))
    return ok("total=2048\nexit=0\npeak=969\n");
  if (cmd.cmd === "mkdir") return ok("");
  if (cmd.cmd === "node" && args[1].includes("fetch(")) return ok("", 7);
  if (cmd.cmd === "node") {
    if (args[2] === "0".repeat(64)) return ok("", 2);
    if (args[5]?.endsWith("emptydb")) return ok("", 1);
    if (args[4] === "0.001") return ok("", 3);
    return ok("signatures-ok\n");
  }
  if (cmd.cmd === "sleep") {
    if (cmd.timeoutMs) {
      clockSkew += cmd.timeoutMs;
      return ok("", 137);
    }
    clockSkew += 14_000;
    throw new Error("session ended");
  }
  if (cmd.cmd === "clamscan") {
    const file = args.at(-1);
    if (file.endsWith("eicar.txt"))
      return ok(`${file}: Eicar-Test-Signature FOUND\n`, 1);
    if (file.endsWith("large.bin") && args.includes("--alert-exceeds-max=yes"))
      return ok(`${file}: Heuristics.Limits.Exceeded.MaxFileSize FOUND\n`, 2);
    return ok(`${file}: OK\n`);
  }
  throw new Error(`unexpected command ${cmd.cmd}`);
}

function scannerFake({
  override = () => undefined,
  image = `vcr.vercel.com/test/probe/scanner@${DIGEST}`,
  failCreate = false,
  failWrite = false,
  failStop = false,
  failDelete = false,
} = {}) {
  const events = [];
  const creates = [];
  let caseIndex = 0;
  const sdk = {
    Sandbox: {
      async create(options) {
        creates.push(options);
        if (failCreate) throw new Error("create failure with test-token");
        const name = `sbx-${caseIndex++}`;
        return {
          name,
          image,
          async runCommand(cmd) {
            assert.equal(cmd.detached, undefined);
            assert.equal(cmd.sudo, undefined);
            const answer = override(name, cmd) ?? defaultAnswer(cmd);
            events.push(`${name}:run:${cmd.cmd}`);
            return {
              exitCode: answer.exitCode,
              stdout: async () => answer.stdout,
            };
          },
          async writeFiles(files) {
            for (const f of files) assert.match(f.path, /^\/tmp\/acres-scan\//);
            events.push(`${name}:write`);
            if (failWrite) throw new Error("private failure");
          },
          async stop(opts) {
            assert.ok(opts.signal instanceof AbortSignal);
            events.push(`${name}:stop`);
            if (failStop) throw new Error("cleanup failure");
          },
          async delete(opts) {
            assert.equal(opts.deleteOrphanSnapshots, true);
            assert.ok(opts.signal instanceof AbortSignal);
            events.push(`${name}:delete`);
            if (failDelete) throw new Error("delete failure");
          },
        };
      },
    },
  };
  const cleanupOrdered = () =>
    creates.length > 0 &&
    creates.every((_, i) => {
      const stop = events.indexOf(`sbx-${i}:stop`);
      const del = events.indexOf(`sbx-${i}:delete`);
      return stop >= 0 && del > stop;
    });
  return { sdk, events, creates, cleanupOrdered };
}

const scannerConfig = () => configuration(base, "scanner");

test("scanner creates non-persistent deny-all VMs and passes clean/EICAR", async () => {
  const fake = scannerFake();
  const result = await probeScanner(scannerConfig(), fake.sdk);
  assert.equal(result.productionScannerProven, false);
  assert.equal(result.eicarRejected, true);
  assert.equal(result.eicarSignature, "Eicar-Test-Signature");
  assert.deepEqual(result.sandboxUser, {
    uid: 1000,
    signaturesReadable: true,
    scanDirWritable: true,
  });
  assert.equal(fake.creates.length, 1);
  const [options] = fake.creates;
  assert.equal(options.persistent, false);
  assert.equal(options.networkPolicy, "deny-all");
  assert.equal(options.region, "fra1");
  assert.equal(options.timeout, 120000);
  assert.deepEqual(options.resources, { vcpus: 1 });
  assert.equal(options.env, undefined);
  assert.equal(options.source, undefined);
  assert.ok(fake.cleanupOrdered());
});

const scannerBreaks = {
  "unreadable signatures": (n, c) =>
    c.cmd === "sh"
      ? { exitCode: 0, stdout: "uid=1000\ndb=0\ntmp=1\n" }
      : undefined,
  "signature exit 2": (n, c) =>
    c.cmd === "node" ? { exitCode: 2, stdout: "" } : undefined,
  "signature exit 0 without marker": (n, c) =>
    c.cmd === "node" ? { exitCode: 0, stdout: "" } : undefined,
  "clean exit 1": (n, c) =>
    c.cmd === "clamscan" && c.args.at(-1).endsWith("clean.csv")
      ? { exitCode: 1, stdout: "" }
      : undefined,
  "clean exit 0 without OK line": (n, c) =>
    c.cmd === "clamscan" && c.args.at(-1).endsWith("clean.csv")
      ? { exitCode: 0, stdout: "" }
      : undefined,
  "EICAR exit 0": (n, c) =>
    c.cmd === "clamscan" && c.args.at(-1).endsWith("eicar.txt")
      ? { exitCode: 0, stdout: "" }
      : undefined,
  "EICAR exit 2": (n, c) =>
    c.cmd === "clamscan" && c.args.at(-1).endsWith("eicar.txt")
      ? { exitCode: 2, stdout: "" }
      : undefined,
};
for (const [label, override] of Object.entries(scannerBreaks)) {
  test(`scanner fails and still stops+deletes on ${label}`, async () => {
    const fake = scannerFake({ override });
    await assert.rejects(probeScanner(scannerConfig(), fake.sdk));
    assert.ok(fake.cleanupOrdered());
  });
}
for (const [label, options] of [
  ["file-write failure", { failWrite: true }],
  ["stop failure", { failStop: true }],
  ["delete failure", { failDelete: true }],
  [
    "image digest mismatch",
    { image: `vcr.vercel.com/test/probe/scanner@sha256:${"f".repeat(64)}` },
  ],
  ["missing image getter", { image: null }],
]) {
  test(`scanner cleanup/identity failure cannot mint success: ${label}`, async () => {
    const fake = scannerFake(options);
    await assert.rejects(probeScanner(scannerConfig(), fake.sdk));
    assert.ok(fake.events.includes("sbx-0:stop"));
    assert.ok(fake.events.includes("sbx-0:delete"));
  });
}
test("scanner create failure leaves nothing to clean", async () => {
  const fake = scannerFake({ failCreate: true });
  await assert.rejects(probeScanner(scannerConfig(), fake.sdk));
  assert.equal(fake.events.length, 0);
});

test("scanner-failures passes every expected fail-closed case within budget", async () => {
  const fake = scannerFake();
  const result = await probeScannerFailures(scannerConfig(), fake.sdk);
  assert.equal(result.gatePassed, true, JSON.stringify(result.cases));
  assert.equal(result.cases.missing.variant, "empty-database-directory");
  assert.equal(result.cases["size-limit"].withoutAlert.shape, "ok");
  assert.equal(result.cases["session-timeout"].shape, "rejected");
  assert.equal(result.cases.memory.clamscanPeakRssMiB, 969);
  assert.equal(result.sandboxCreations, fake.creates.length);
  assert.ok(fake.creates.length <= SANDBOX_BUDGET["scanner-failures"]);
  assert.ok(SANDBOX_BUDGET.scanner + SANDBOX_BUDGET["scanner-failures"] <= 10);
  for (const options of fake.creates) {
    assert.equal(options.persistent, false);
    assert.equal(options.networkPolicy, "deny-all");
    assert.deepEqual(options.resources, { vcpus: 1 });
    assert.ok(options.timeout <= 120000);
  }
  assert.equal(fake.creates[5].timeout, 15000);
  assert.ok(fake.cleanupOrdered());
});

// The opposite result of each case must fail that case and the gate.
const failureBreaks = {
  "wrong-hash": (n, c) =>
    c.cmd === "node" && c.args[2] === "0".repeat(64)
      ? { exitCode: 0, stdout: "signatures-ok\n" }
      : undefined,
  missing: (n, c) =>
    c.cmd === "node" && c.args[5]?.endsWith("emptydb")
      ? { exitCode: 0, stdout: "signatures-ok\n" }
      : undefined,
  stale: (n, c) =>
    c.cmd === "node" && c.args[4] === "0.001"
      ? { exitCode: 0, stdout: "signatures-ok\n" }
      : undefined,
  "egress-denied": (n, c) =>
    c.cmd === "node" && c.args[1].includes("fetch(")
      ? { exitCode: 0, stdout: "" }
      : undefined,
  "command-timeout": (n, c) =>
    c.cmd === "sleep" && c.timeoutMs ? { exitCode: 0, stdout: "" } : undefined,
  "session-timeout": (n, c) =>
    c.cmd === "sleep" && !c.timeoutMs ? { exitCode: 0, stdout: "" } : undefined,
  "size-limit": (n, c) =>
    c.cmd === "clamscan" &&
    c.args.includes("--alert-exceeds-max=yes") &&
    c.args.at(-1).endsWith("large.bin")
      ? { exitCode: 0, stdout: `${c.args.at(-1)}: OK\n` }
      : undefined,
};
for (const [name, override] of Object.entries(failureBreaks)) {
  test(`scanner-failures fails ${name} on the opposite result`, async () => {
    const fake = scannerFake({ override });
    const result = await probeScannerFailures(scannerConfig(), fake.sdk);
    assert.equal(result.cases[name].passed, false);
    assert.equal(result.gatePassed, false);
    for (const [other, c] of Object.entries(result.cases))
      if (other !== name) assert.equal(c.passed, true, other);
  });
}
const instantRejection = {
  "command-timeout": (n, c) => {
    if (c.cmd === "sleep" && c.timeoutMs) throw new Error("transport error");
  },
  "session-timeout": (n, c) => {
    if (c.cmd === "sleep" && !c.timeoutMs) throw new Error("403");
  },
  "egress-denied": (n, c) =>
    c.cmd === "node" && c.args[1].includes("fetch(")
      ? { exitCode: 1, stdout: "" }
      : undefined,
};
for (const [name, override] of Object.entries(instantRejection)) {
  test(`scanner-failures fails ${name} on an unrelated failure`, async () => {
    const fake = scannerFake({ override });
    const result = await probeScannerFailures(scannerConfig(), fake.sdk);
    assert.equal(result.cases[name].passed, false);
    assert.equal(result.gatePassed, false);
  });
}
test("command-timeout fails when the kill comes too late", async () => {
  const fake = scannerFake({
    override: (n, c) => {
      if (c.cmd !== "sleep" || !c.timeoutMs) return undefined;
      clockSkew += 12_000;
      return { exitCode: 137, stdout: "" };
    },
  });
  const result = await probeScannerFailures(scannerConfig(), fake.sdk);
  assert.equal(result.cases["command-timeout"].passed, false);
});
test("scanner-failures marks a case failed when its cleanup fails", async () => {
  const fake = scannerFake({ failDelete: true });
  const result = await probeScannerFailures(scannerConfig(), fake.sdk);
  assert.equal(result.gatePassed, false);
  assert.ok(Object.values(result.cases).every((c) => c.passed === false));
});
test("session-timeout tolerates a stop error only when delete succeeds", async () => {
  const fake = scannerFake({ failStop: true });
  const result = await probeScannerFailures(scannerConfig(), fake.sdk);
  assert.equal(result.cases["session-timeout"].passed, true);
  assert.equal(result.cases["session-timeout"].stopFailed, true);
  assert.equal(result.cases["wrong-hash"].passed, false);
});
test("scanner summaries never carry the token or image reference", async () => {
  for (const run of [probeScanner, probeScannerFailures]) {
    const text = JSON.stringify(await run(scannerConfig(), scannerFake().sdk));
    assert.ok(!text.includes(base.VERCEL_TOKEN));
    assert.ok(!text.includes("vcr.vercel.com"));
    assert.ok(!text.includes("a".repeat(64)));
  }
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
