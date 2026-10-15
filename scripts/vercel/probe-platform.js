#!/usr/bin/env node
"use strict";

// Explicit opt-in synthetic probes. Never imported by application boot.
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const path = require("node:path");
const serverRequire = createRequire(
  path.resolve(__dirname, "../../server/package.json"),
);

function required(env, key) {
  const value = env[key]?.trim();
  if (!value || value.startsWith("__REQUIRED_"))
    throw new Error(`Missing ${key}.`);
  return value;
}

function configuration(env, mode) {
  if (!["blob", "blob-browser", "scanner", "scanner-failures"].includes(mode))
    throw new Error("Choose blob, blob-browser, scanner or scanner-failures.");
  if (env.ACRES_VERCEL_PROBE !== "isolated-synthetic-preview") {
    throw new Error(
      "Set ACRES_VERCEL_PROBE=isolated-synthetic-preview only for an approved isolated target.",
    );
  }
  if (env.VERCEL_ENV !== "preview")
    throw new Error("Probes require VERCEL_ENV=preview.");
  const common = {
    teamId: required(env, "VERCEL_TEAM_ID"),
    projectId: required(env, "VERCEL_PROJECT_ID"),
  };
  if (mode === "blob" || mode === "blob-browser")
    return { ...common, token: required(env, "BLOB_READ_WRITE_TOKEN") };
  const region = required(env, "ACRES_VERCEL_PROBE_REGION");
  if (!/^[a-z]{3}[1-9][0-9]?$/.test(region))
    throw new Error("Select a valid Vercel region for the probe.");
  const image = required(env, "ACRES_SCANNER_IMAGE");
  if (!/^vcr\.vercel\.com\/[a-zA-Z0-9_/-]+@sha256:[a-f0-9]{64}$/.test(image)) {
    throw new Error(
      "ACRES_SCANNER_IMAGE must be an approved VCR image pinned by SHA-256 digest.",
    );
  }
  const mainSha256 = required(env, "ACRES_SCANNER_MAIN_SHA256");
  const dailySha256 = required(env, "ACRES_SCANNER_DAILY_SHA256");
  if (![mainSha256, dailySha256].every((v) => /^[a-f0-9]{64}$/.test(v)))
    throw new Error("Signature digests must be SHA-256.");
  const age = required(env, "ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS");
  if (!/^[1-9]\d*$/.test(age) || Number(age) > 168)
    throw new Error(
      "Adopt a signature age from 1 through 168 hours for the probe.",
    );
  return {
    ...common,
    token: required(env, "VERCEL_TOKEN"),
    image,
    region,
    mainSha256,
    dailySha256,
    maxAgeHours: Number(age),
  };
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function readBounded(stream, limit) {
  const chunks = [];
  let size = 0;
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Probe object exceeds expected size.");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

async function probeBlob(config, sdk, fetcher = fetch) {
  const key = `acres-probes/${randomUUID()}/synthetic.csv`;
  // 5 MiB synthetic payload; server SDK compatibility only, not browser proof.
  const bytes = Buffer.alloc(5 * 1024 * 1024, "x");
  const options = {
    token: config.token,
    abortSignal: AbortSignal.timeout(60_000),
  };
  try {
    const uploaded = await sdk.put(key, bytes, {
      ...options,
      access: "private",
      contentType: "text/csv",
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    const url = new URL(uploaded.url);
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      throw new Error("Unexpected private Blob origin.");
    const unauthenticated = await fetcher(url, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    await unauthenticated.body?.cancel();
    if (![401, 403, 404].includes(unauthenticated.status))
      throw new Error(
        "Private Blob permitted an unauthenticated read or returned an unexpected status.",
      );
    const result = await sdk.get(key, {
      ...options,
      access: "private",
      useCache: false,
    });
    if (!result || result.statusCode !== 200)
      throw new Error("Private Blob read failed.");
    const actual = await readBounded(result.stream, bytes.length);
    if (actual.length !== bytes.length || sha256(actual) !== sha256(bytes))
      throw new Error("Private Blob byte/checksum mismatch.");
    return {
      probe: "private-blob-server-sdk",
      bytes: bytes.length,
      checksumVerified: true,
      anonymousReadDenied: true,
      browserUploadProven: false,
    };
  } finally {
    // The randomly generated pathname is known even if put's response is lost.
    // Use a fresh signal so a timed-out upload cannot skip cleanup.
    await sdk.del(key, {
      token: config.token,
      abortSignal: AbortSignal.timeout(30_000),
    });
  }
}

// Deterministic xorshift32 bytes. The page receives this function's source and
// generates the payload itself, so 12 MiB never crosses the evaluate boundary.
function syntheticBytes(length, seed) {
  const out = new Uint8Array(length);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out[i] = x & 0xff;
  }
  return out;
}

// Runs inside the browser page. Self-contained: it may not close over module
// scope. Returns statuses and digests only, never the URL or response text.
async function pageRequest([spec, generatorSource]) {
  const result = { status: null, blocked: false };
  try {
    const init = { method: spec.method, headers: spec.headers ?? {} };
    if (spec.body) {
      const generate = new Function(`return (${generatorSource})`)();
      init.body = generate(spec.body.length, spec.body.seed);
    }
    init.signal = AbortSignal.timeout(120000);
    init.cache = "no-store";
    init.redirect = "error";
    const response = await fetch(spec.url, init);
    result.status = response.status;
    if (spec.read === "json-keys") {
      try {
        result.keys = Object.keys(await response.json()).sort();
      } catch {
        result.keys = null;
      }
    } else if (spec.read === "sha256") {
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      result.length = bytes.byteLength;
      result.sha256 = [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } else {
      await response.body?.cancel();
    }
  } catch {
    // CORS failure, network failure or timeout; the network status is
    // recorded separately from the browser's own response event.
    result.blocked = true;
  }
  return result;
}

const PROBE_BYTES = 12 * 1024 * 1024; // above the 4.5 MB function body limit

function dispositionShape(value) {
  if (value == null) return "absent";
  const v = value.trim().toLowerCase();
  if (v.startsWith("attachment")) return "attachment";
  if (v.startsWith("inline")) return "inline";
  return "other";
}

const accepted = (status) => status != null && status >= 200 && status < 300;

/**
 * Proves the presigned Blob PUT/GET protocol from a real browser origin.
 * `browser.request(spec)` performs one cross-origin fetch and returns
 * `{ status, networkStatus, blocked, keys?, sha256?, length?, headers }`.
 */
async function probeBlobBrowser(
  config,
  sdk,
  browser,
  {
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    fetcher = fetch,
  } = {},
) {
  const run = randomUUID();
  const tracked = [];
  const path = (name) => {
    const p = `acres-probes/${run}/${name}.csv`;
    tracked.push(p);
    return p;
  };
  const control = () => ({
    token: config.token,
    abortSignal: AbortSignal.timeout(30_000),
  });
  const exists = async (pathname) => {
    try {
      await sdk.head(pathname, control());
      return true;
    } catch (error) {
      if (error instanceof sdk.BlobNotFoundError) return false;
      throw error;
    }
  };
  const signPut = async (pathname, { types, max, ttlMs }) => {
    const validUntil = Date.now() + ttlMs;
    const token = await sdk.issueSignedToken({
      ...control(),
      pathname,
      operations: ["put"],
      allowedContentTypes: types,
      maximumSizeInBytes: max,
      validUntil,
    });
    const { presignedUrl } = await sdk.presignUrl(token, {
      operation: "put",
      pathname,
      access: "private",
      allowedContentTypes: types,
      maximumSizeInBytes: max,
      allowOverwrite: false,
      addRandomSuffix: false,
      validUntil,
    });
    return presignedUrl;
  };
  const putFrom = (url, contentType, length, seed, read = "none") =>
    browser.request({
      url,
      method: "PUT",
      headers: { "content-type": contentType },
      body: { length, seed },
      read,
    });
  const status = (r) => r.networkStatus ?? r.status;
  // Rejected only if the browser saw no 2xx AND the server state is unchanged.
  const rejectedWithoutWrite = async (response, ...pathnames) => {
    if (accepted(response.status) || accepted(response.networkStatus))
      return false;
    for (const p of pathnames) if (await exists(p)) return false;
    return true;
  };

  const seed = 0x5eed1234;
  const expected = Buffer.from(syntheticBytes(PROBE_BYTES, seed));
  const expectedSha = sha256(expected);
  const cases = {};
  try {
    // 1. Browser PUT to a scoped, constrained presigned URL.
    const main = path("upload");
    const mainUrl = await signPut(main, {
      types: ["text/csv"],
      max: PROBE_BYTES,
      ttlMs: 120_000,
    });
    const put = await putFrom(
      mainUrl,
      "text/csv",
      PROBE_BYTES,
      seed,
      "json-keys",
    );
    cases.browserPut = {
      status: status(put),
      corsReadable: !put.blocked,
      responseKeys: put.keys ?? null,
      passed: accepted(put.status) && !put.blocked,
    };
    if (!cases.browserPut.passed) {
      // Diagnostic only: the header names the SDK's own presigned PUT sends.
      // A pass here still fails the gate (the contract sends content-type only).
      const sdkHeaders = {
        "content-type": "text/csv",
        "x-content-type": "text/csv",
        "x-vercel-blob-access": "private",
        "x-api-version": "13",
      };
      const diagPath = path("diagnostic");
      const diagUrl = await signPut(diagPath, {
        types: ["text/csv"],
        max: 1024,
        ttlMs: 120_000,
      });
      const diag = await browser.request({
        url: diagUrl,
        method: "PUT",
        headers: sdkHeaders,
        body: { length: 512, seed },
        read: "none",
      });
      cases.diagnosticSdkHeaders = {
        headerNames: Object.keys(sdkHeaders),
        status: status(diag),
        corsReadable: !diag.blocked,
      };
      return summary(cases, false);
    }

    // 2. Server metadata.
    const meta = await sdk.head(main, control());
    cases.serverHead = {
      passed: meta.size === PROBE_BYTES && meta.contentType === "text/csv",
    };

    // 3. Server bounded read and checksum.
    const read = await sdk.get(main, {
      ...control(),
      abortSignal: AbortSignal.timeout(120_000),
      access: "private",
      useCache: false,
    });
    const actual =
      read && read.statusCode === 200
        ? await readBounded(read.stream, PROBE_BYTES)
        : Buffer.alloc(0);
    cases.serverChecksum = {
      passed: actual.length === PROBE_BYTES && sha256(actual) === expectedSha,
    };

    // 4. Replaying the same URL with different bytes must not overwrite.
    const overwrite = await putFrom(mainUrl, "text/csv", PROBE_BYTES, seed + 1);
    const after = await sdk.get(main, {
      ...control(),
      abortSignal: AbortSignal.timeout(120_000),
      access: "private",
      useCache: false,
    });
    const afterBytes =
      after && after.statusCode === 200
        ? await readBounded(after.stream, PROBE_BYTES)
        : Buffer.alloc(0);
    cases.overwriteDenied = {
      status: status(overwrite),
      passed:
        !accepted(overwrite.status) &&
        !accepted(overwrite.networkStatus) &&
        sha256(afterBytes) === expectedSha,
    };

    // Application keys carry no extension (organizations/<id>/quarantine/<uuid>).
    // Observed precedence for the stored type: `x-content-type`, then the
    // pathname extension, then `content-type`; the resolved type is checked
    // against the signed allowlist. So gate cases use extensionless keys.
    const bare = (name) => {
      const p = `acres-probes/${run}/${name}`;
      tracked.push(p);
      return p;
    };
    const storedType = async (pathname) =>
      (await exists(pathname))
        ? ((await sdk.head(pathname, control())).contentType ?? null)
        : null;
    const small = { types: ["text/csv"], max: 1024, ttlMs: 120_000 };

    // 5a. The application's shape: extensionless key, `content-type` only.
    const shapePath = bare("extensionless");
    const shape = await putFrom(
      await signPut(shapePath, small),
      "text/csv",
      512,
      seed,
    );
    const shapeType = await storedType(shapePath);
    cases.extensionlessPut = {
      status: status(shape),
      storedContentType: shapeType,
      passed: accepted(shape.status) && shapeType === "text/csv",
    };

    // 5. Content type outside the signed allowlist, extensionless key.
    const typePath = bare("wrong-type");
    const wrongType = await putFrom(
      await signPut(typePath, small),
      "text/plain",
      512,
      seed,
    );
    cases.contentTypeEnforced = {
      status: status(wrongType),
      passed: await rejectedWithoutWrite(wrongType, typePath),
    };

    // Diagnostics (no `passed`): a `.csv` key overrides a wrong `content-type`,
    // while a wrong `x-content-type` is refused even on a `.csv` key.
    for (const [name, headers] of [
      ["diagnosticExtensionOverridesHeader", { "content-type": "text/plain" }],
      [
        "diagnosticXContentType",
        { "content-type": "text/plain", "x-content-type": "text/plain" },
      ],
    ]) {
      const p = path(name);
      const r = await browser.request({
        url: await signPut(p, small),
        method: "PUT",
        headers,
        body: { length: 512, seed },
        read: "none",
      });
      cases[name] = {
        status: status(r),
        storedContentType: await storedType(p),
      };
    }

    // 6. Body one byte over the signed maximum.
    const sizePath = path("oversize");
    const sizeUrl = await signPut(sizePath, {
      types: ["text/csv"],
      max: 1024,
      ttlMs: 120_000,
    });
    const oversize = await putFrom(sizeUrl, "text/csv", 1025, seed);
    cases.sizeEnforced = {
      status: status(oversize),
      passed: await rejectedWithoutWrite(oversize, sizePath),
    };

    // 7. Signature binds the pathname.
    const signedPath = path("signed");
    const swappedPath = path("swapped");
    const signedUrl = new URL(
      await signPut(signedPath, {
        types: ["text/csv"],
        max: 1024,
        ttlMs: 120_000,
      }),
    );
    signedUrl.searchParams.set("pathname", swappedPath);
    const tampered = await putFrom(signedUrl.toString(), "text/csv", 512, seed);
    cases.pathnameBound = {
      status: status(tampered),
      passed: await rejectedWithoutWrite(tampered, signedPath, swappedPath),
    };

    // 8. Expired URL.
    const expiredPath = path("expired");
    const expiredUrl = await signPut(expiredPath, {
      types: ["text/csv"],
      max: 1024,
      ttlMs: 5_000,
    });
    await sleep(8_000);
    const expired = await putFrom(expiredUrl, "text/csv", 512, seed);
    cases.expiryEnforced = {
      status: status(expired),
      passed: await rejectedWithoutWrite(expired, expiredPath),
    };

    // 9. Anonymous browser read of the plain private URL.
    const anonymous = await browser.request({
      url: meta.url,
      method: "GET",
      read: "none",
    });
    cases.anonymousReadDenied = {
      status: status(anonymous),
      passed: [401, 403, 404].includes(status(anonymous)),
    };

    // 10. Scoped presigned GET from the browser.
    const getToken = await sdk.issueSignedToken({
      ...control(),
      pathname: main,
      operations: ["get"],
      validUntil: Date.now() + 60_000,
    });
    const { presignedUrl: getUrl } = await sdk.presignUrl(getToken, {
      operation: "get",
      pathname: main,
      access: "private",
      useCache: false,
    });
    const download = await browser.request({
      url: getUrl,
      method: "GET",
      read: "sha256",
    });
    let downloadSha = download.sha256;
    let downloadLength = download.length;
    if (download.blocked && status(download) === 200) {
      // Browsers download by navigation, which CORS does not gate; when a
      // script read is blocked, verify the same URL's bytes outside the page.
      const direct = await fetcher(getUrl, {
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(120_000),
      });
      const bytes = direct.body
        ? await readBounded(direct.body, PROBE_BYTES)
        : Buffer.alloc(0);
      downloadSha = sha256(bytes);
      downloadLength = bytes.length;
    }
    cases.presignedGet = {
      status: status(download),
      corsReadable: !download.blocked,
      contentType: download.headers?.["content-type"] ?? null,
      contentDisposition: dispositionShape(
        download.headers?.["content-disposition"],
      ),
      passed:
        status(download) === 200 &&
        downloadLength === PROBE_BYTES &&
        downloadSha === expectedSha,
    };

    // 11. The read token cannot presign a different pathname.
    let scopeRefused = false;
    try {
      await sdk.presignUrl(getToken, {
        operation: "get",
        pathname: typePath,
        access: "private",
      });
    } catch (error) {
      // The SDK's own local scope check (2.8.2), not an unrelated failure.
      scopeRefused = /does not match the signed token scope/.test(
        String(error?.message),
      );
    }
    cases.readTokenScoped = { passed: scopeRefused };

    // 12. Deletion is how a still-valid GET URL is revoked.
    await sdk.del(main, control());
    const revoked = await browser.request({
      url: getUrl,
      method: "GET",
      read: "none",
    });
    cases.deleteRevokesGet = {
      status: status(revoked),
      passed: [403, 404].includes(status(revoked)),
    };

    // Diagnostic entries carry no `passed` and do not count toward the gate.
    return summary(
      cases,
      Object.values(cases).every((c) => !("passed" in c) || c.passed),
    );
  } finally {
    // Every pathname is known before any request, so cleanup never depends on
    // a response. Fresh signals so a timed-out case cannot skip deletion.
    const failures = [];
    for (const p of tracked) {
      try {
        await sdk.del(p, {
          token: config.token,
          abortSignal: AbortSignal.timeout(30_000),
        });
      } catch {
        failures.push(p);
      }
    }
    if (failures.length > 0) throw new Error("Probe cleanup failed.");
  }

  function summary(observed, passed) {
    return {
      probe: "private-blob-browser-presigned",
      bytes: PROBE_BYTES,
      cases: observed,
      gatePassed: passed,
    };
  }
}

async function openProbeBrowser(clientRequire) {
  const http = require("node:http");
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>probe</title>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await clientRequire("@playwright/test").chromium.launch();
    const page = await browser.newPage();
    await page.goto(`${origin}/`);
    const normalize = (u) => new URL(u).href;
    return {
      async request(spec) {
        const target = normalize(spec.url);
        const seen = page
          .waitForResponse(
            (r) =>
              r.request().method() === spec.method &&
              normalize(r.url()) === target,
            { timeout: 125_000 },
          )
          .catch(() => null);
        const result = await page.evaluate(pageRequest, [
          spec,
          syntheticBytes.toString(),
        ]);
        const response = await seen;
        const headers = response ? await response.allHeaders() : {};
        return {
          ...result,
          networkStatus: response ? response.status() : null,
          headers,
        };
      },
      async close() {
        await browser.close();
        await new Promise((resolve) => server.close(resolve));
      },
    };
  } catch (error) {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
    throw error;
  }
}

// Kept identical to server/src/scanner/sandbox-signature-check.ts (a server
// unit test compares the two). argv: main hash, daily hash, max daily age in
// hours, optional database directory. Prints a marker only when every check
// passed, so a killed or truncated run cannot read as success.
const SIGNATURE_CHECK = `
const fs = require('node:fs');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const dir = process.argv[4] || '/var/lib/clamav';
const maxAgeMs = Number(process.argv[3]) * 3600000;
if (!(maxAgeMs > 0)) process.exit(4);
for (const [name, hash] of [['main.cvd', process.argv[1]], ['daily.cvd', process.argv[2]]]) {
  const file = dir + '/' + name;
  if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== hash) process.exit(2);
  const info = cp.execFileSync('sigtool', ['--info', file], { encoding: 'utf8', timeout: 10000 });
  const line = info.match(/^Build time:\\s*(.+)$/m);
  const time = line ? Date.parse(line[1]) : NaN;
  const age = Date.now() - time;
  if (!Number.isFinite(time) || age < 0 || (name === 'daily.cvd' && age > maxAgeMs)) process.exit(3);
}
process.stdout.write('signatures-ok\\n');
`;

const SCAN_DIR = "/tmp/acres-scan";
const SANDBOX_TIMEOUT_MS = 120_000;
const CLEANUP_TIMEOUT_MS = 30_000;
// Per invocation; scanner + scanner-failures together stay within 10.
const SANDBOX_BUDGET = { scanner: 1, "scanner-failures": 9 };
const EICAR = Buffer.from(
  "X5O!P%@AP[4" + "\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
);
const ADAPTER_SCAN_FLAGS = [
  "--no-summary",
  "--database=/var/lib/clamav",
  "--max-filesize=50M",
  "--max-scansize=50M",
  "--alert-exceeds-max=yes",
];

// Signature name only; never an output body.
function scanShape(stdout, file) {
  if (stdout.includes(`${file}: OK`)) return "ok";
  const found = stdout.match(/: (.+) FOUND$/m);
  if (found && found[1].length <= 200) return `found:${found[1]}`;
  return "other";
}

async function cleanupSandbox(sandbox, { tolerateStopError = false } = {}) {
  let stopFailed = false;
  let deleteFailed = false;
  try {
    await sandbox.stop({ signal: AbortSignal.timeout(CLEANUP_TIMEOUT_MS) });
  } catch {
    stopFailed = true;
  }
  try {
    // Without this, persistent-by-default snapshots keep scanned bytes.
    await sandbox.delete({
      deleteOrphanSnapshots: true,
      signal: AbortSignal.timeout(CLEANUP_TIMEOUT_MS),
    });
  } catch {
    deleteFailed = true;
  }
  if (deleteFailed || (stopFailed && !tolerateStopError))
    throw new Error("Sandbox cleanup failed.");
  return { stopFailed };
}

function sandboxRunner(config, sdk, mode, log = () => {}) {
  const digest = config.image.slice(config.image.indexOf("@") + 1);
  let created = 0;
  return {
    created: () => created,
    async run(overrides, fn, cleanupOptions) {
      if (created >= SANDBOX_BUDGET[mode])
        throw new Error("Sandbox creation budget exceeded.");
      created++;
      let sandbox;
      let value;
      try {
        sandbox = await sdk.Sandbox.create({
          token: config.token,
          teamId: config.teamId,
          projectId: config.projectId,
          image: config.image,
          region: config.region,
          persistent: false,
          networkPolicy: "deny-all",
          timeout: SANDBOX_TIMEOUT_MS,
          resources: { vcpus: 1 },
          ...overrides,
        });
        log(sandbox.name);
        if (
          typeof sandbox.image !== "string" ||
          !sandbox.image.endsWith(`@${digest}`)
        )
          throw new Error("Scanner image digest mismatch.");
        value = await fn(sandbox);
      } finally {
        if (sandbox) {
          const cleanup = await cleanupSandbox(sandbox, cleanupOptions);
          if (value && typeof value === "object")
            value.stopFailed = cleanup.stopFailed;
        }
      }
      return value;
    },
  };
}

async function runChecked(sandbox, params) {
  const started = Date.now();
  const result = await sandbox.runCommand(params);
  return {
    exitCode: result.exitCode,
    stdout: await result.stdout(),
    durationMs: Date.now() - started,
  };
}

function signatureCheck(config, overrides = {}) {
  const maxAge = overrides.maxAgeHours ?? config.maxAgeHours;
  return {
    cmd: "node",
    args: [
      "-e",
      SIGNATURE_CHECK,
      overrides.mainSha256 ?? config.mainSha256,
      config.dailySha256,
      String(maxAge),
      ...(overrides.dir ? [overrides.dir] : []),
    ],
    timeoutMs: 30_000,
  };
}

const signaturesOk = (r) =>
  r.exitCode === 0 && r.stdout.includes("signatures-ok");

async function probeScanner(config, sdk, log) {
  const runner = sandboxRunner(config, sdk, "scanner", log);
  const result = await runner.run({}, async (sandbox) => {
    const identity = await runChecked(sandbox, {
      cmd: "sh",
      args: [
        "-c",
        `mkdir -p ${SCAN_DIR} && echo uid=$(id -u) && ` +
          `{ test -r /var/lib/clamav/daily.cvd && echo db=1 || echo db=0; } && ` +
          `{ test -w ${SCAN_DIR} && echo tmp=1 || echo tmp=0; }`,
      ],
      timeoutMs: 30_000,
    });
    const uid = identity.stdout.match(/^uid=(\d+)$/m);
    const sandboxUser = {
      uid: uid ? Number(uid[1]) : null,
      signaturesReadable: /^db=1$/m.test(identity.stdout),
      scanDirWritable: /^tmp=1$/m.test(identity.stdout),
    };
    if (!sandboxUser.signaturesReadable || !sandboxUser.scanDirWritable)
      throw new Error(
        "Scanner sandbox user cannot read signatures or write scan inputs.",
      );
    if (!signaturesOk(await runChecked(sandbox, signatureCheck(config))))
      throw new Error("Scanner signature verification failed.");
    await sandbox.writeFiles([
      {
        path: `${SCAN_DIR}/clean.csv`,
        content: Buffer.from("region,value\nsynthetic,1\n"),
      },
      { path: `${SCAN_DIR}/eicar.txt`, content: EICAR },
    ]);
    const scan = (file) =>
      runChecked(sandbox, {
        cmd: "clamscan",
        args: [...ADAPTER_SCAN_FLAGS, file],
        timeoutMs: 60_000,
      });
    const clean = await scan(`${SCAN_DIR}/clean.csv`);
    const infected = await scan(`${SCAN_DIR}/eicar.txt`);
    if (
      clean.exitCode !== 0 ||
      scanShape(clean.stdout, `${SCAN_DIR}/clean.csv`) !== "ok" ||
      infected.exitCode !== 1 ||
      !scanShape(infected.stdout, `${SCAN_DIR}/eicar.txt`).startsWith("found:")
    )
      throw new Error("Scanner clean/EICAR verification failed.");
    return {
      probe: "sandbox-clean-eicar",
      sandboxUser,
      signaturesVerified: true,
      cleanAccepted: true,
      eicarRejected: true,
      eicarSignature: scanShape(infected.stdout, `${SCAN_DIR}/eicar.txt`).slice(
        6,
      ),
      cleanScanMs: clean.durationMs,
      eicarScanMs: infected.durationMs,
      network: "deny-all",
      persistent: false,
      productionScannerProven: false,
    };
  });
  delete result.stopFailed;
  return { ...result, sandboxCreations: runner.created() };
}

// Timeout cases need a lower bound too: an instant, unrelated rejection
// (transport error, 4xx) must not count as an enforced limit.
const COMMAND_TIMEOUT_WINDOW = [2_500, 10_000];
const SESSION_TIMEOUT_WINDOW = [8_000, 40_000];
const within = (ms, [min, max]) => ms >= min && ms < max;

// Each case runs in its own short-lived sandbox and passes only on its
// expected fail-closed result. Summary: statuses, codes, booleans, durations.
const FAILURE_CASES = {
  async "wrong-hash"(sandbox, config) {
    const r = await runChecked(
      sandbox,
      signatureCheck(config, { mainSha256: "0".repeat(64) }),
    );
    return {
      passed: r.exitCode === 2 && !signaturesOk(r),
      exitCode: r.exitCode,
    };
  },
  async missing(sandbox, config) {
    // The image has no sudo, so the check reads an empty database directory.
    await runChecked(sandbox, {
      cmd: "mkdir",
      args: ["-p", `${SCAN_DIR}/emptydb`],
      timeoutMs: 10_000,
    });
    const r = await runChecked(
      sandbox,
      signatureCheck(config, { dir: `${SCAN_DIR}/emptydb` }),
    );
    return {
      passed: r.exitCode !== 0 && !signaturesOk(r),
      exitCode: r.exitCode,
      variant: "empty-database-directory",
    };
  },
  async stale(sandbox, config) {
    const r = await runChecked(
      sandbox,
      signatureCheck(config, { maxAgeHours: 0.001 }),
    );
    return {
      passed: r.exitCode === 3 && !signaturesOk(r),
      exitCode: r.exitCode,
    };
  },
  async "egress-denied"(sandbox) {
    const r = await runChecked(sandbox, {
      cmd: "node",
      args: [
        "-e",
        "fetch('https://database.clamav.net',{signal:AbortSignal.timeout(5000)}).then(()=>process.exit(0),()=>process.exit(7))",
      ],
      timeoutMs: 20_000,
    });
    // Exactly the script's fetch-failed exit: a node that never ran is not
    // evidence of denied egress.
    return { passed: r.exitCode === 7, exitCode: r.exitCode };
  },
  async "command-timeout"(sandbox) {
    const started = Date.now();
    try {
      const r = await sandbox.runCommand({
        cmd: "sleep",
        args: ["60"],
        timeoutMs: 3_000,
      });
      const durationMs = Date.now() - started;
      return {
        passed: r.exitCode !== 0 && within(durationMs, COMMAND_TIMEOUT_WINDOW),
        shape: "resolved",
        exitCode: r.exitCode,
        durationMs,
      };
    } catch {
      const durationMs = Date.now() - started;
      return {
        passed: within(durationMs, COMMAND_TIMEOUT_WINDOW),
        shape: "rejected",
        durationMs,
      };
    }
  },
  async "session-timeout"(sandbox) {
    const started = Date.now();
    try {
      // The signal only stops the probe hanging if the session never ends.
      const r = await sandbox.runCommand({
        cmd: "sleep",
        args: ["60"],
        signal: AbortSignal.timeout(45_000),
      });
      return {
        passed: false,
        shape: "resolved",
        exitCode: r.exitCode,
        durationMs: Date.now() - started,
      };
    } catch {
      const durationMs = Date.now() - started;
      return {
        passed: within(durationMs, SESSION_TIMEOUT_WINDOW),
        shape: "rejected",
        durationMs,
      };
    }
  },
  async "size-limit"(sandbox) {
    const file = `${SCAN_DIR}/large.bin`;
    await runChecked(sandbox, {
      cmd: "mkdir",
      args: ["-p", SCAN_DIR],
      timeoutMs: 10_000,
    });
    await sandbox.writeFiles([
      { path: file, content: randomBytes(7 * 1024 * 1024) },
    ]);
    const flags = [
      "--no-summary",
      "--database=/var/lib/clamav",
      "--max-filesize=6M",
      "--max-scansize=6M",
    ];
    const plain = await runChecked(sandbox, {
      cmd: "clamscan",
      args: [...flags, file],
      timeoutMs: 60_000,
    });
    const alert = await runChecked(sandbox, {
      cmd: "clamscan",
      args: [...flags, "--alert-exceeds-max=yes", file],
      timeoutMs: 60_000,
    });
    // ClamAV 1.5.4 reports the limit as FOUND but exits 2 ("Virus(es)
    // detected ERROR"); without the flag the same file reads OK. Either
    // non-zero exit fails closed in the adapter.
    return {
      passed:
        alert.exitCode !== 0 &&
        scanShape(alert.stdout, file).startsWith(
          "found:Heuristics.Limits.Exceeded",
        ),
      withoutAlert: {
        exitCode: plain.exitCode,
        shape: scanShape(plain.stdout, file),
      },
      withAlert: {
        exitCode: alert.exitCode,
        shape: scanShape(alert.stdout, file),
      },
    };
  },
  async malformed(sandbox) {
    const file = `${SCAN_DIR}/malformed.zip`;
    await runChecked(sandbox, {
      cmd: "mkdir",
      args: ["-p", SCAN_DIR],
      timeoutMs: 10_000,
    });
    const bytes = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
      randomBytes(2 * 1024 * 1024),
    ]);
    await sandbox.writeFiles([{ path: file, content: bytes }]);
    const r = await runChecked(sandbox, {
      cmd: "clamscan",
      args: [...ADAPTER_SCAN_FLAGS, file],
      timeoutMs: 60_000,
    });
    // Completion is the gate; exit >= 2 maps to scanner_error (fail closed).
    return {
      passed: true,
      exitCode: r.exitCode,
      shape: scanShape(r.stdout, file),
      adapterOutcome:
        r.exitCode === 0
          ? "clean"
          : r.exitCode === 1
            ? "infected"
            : "scanner_error",
    };
  },
  async memory(sandbox) {
    // Peak RSS sampled from /proc while one clamscan runs: a measurement.
    const r = await runChecked(sandbox, {
      cmd: "sh",
      args: [
        "-c",
        `mkdir -p ${SCAN_DIR} && printf 'a,b\\n1,2\\n' > ${SCAN_DIR}/m.csv && ` +
          `awk '/MemTotal/{print "total=" int($2/1024)}' /proc/meminfo && ` +
          `clamscan ${ADAPTER_SCAN_FLAGS.join(" ")} ${SCAN_DIR}/m.csv >/dev/null & pid=$!; peak=0; ` +
          `while kill -0 $pid 2>/dev/null; do ` +
          `v=$(awk '/VmHWM/{print $2}' /proc/$pid/status 2>/dev/null); ` +
          `[ -n "$v" ] && [ "$v" -gt "$peak" ] && peak=$v; sleep 0.2; done; ` +
          `wait $pid; echo exit=$?; echo peak=$((peak/1024))`,
      ],
      timeoutMs: 90_000,
    });
    const num = (k) => {
      const m = r.stdout.match(new RegExp(`^${k}=(\\d+)$`, "m"));
      return m ? Number(m[1]) : null;
    };
    return {
      passed: true,
      memTotalMiB: num("total"),
      clamscanPeakRssMiB: num("peak"),
      clamscanExitCode: num("exit"),
      durationMs: r.durationMs,
    };
  },
};

async function probeScannerFailures(config, sdk, log) {
  const runner = sandboxRunner(config, sdk, "scanner-failures", log);
  const cases = {};
  for (const [name, fn] of Object.entries(FAILURE_CASES)) {
    const session = name === "session-timeout";
    try {
      cases[name] = await runner.run(
        session ? { timeout: 15_000 } : {},
        (sandbox) => fn(sandbox, config),
        { tolerateStopError: session },
      );
    } catch {
      cases[name] = { passed: false, shape: "probe-error" };
    }
  }
  return {
    probe: "sandbox-scanner-failures",
    cases,
    gatePassed: Object.values(cases).every((c) => c.passed),
    sandboxCreations: runner.created(),
    network: "deny-all",
    persistent: false,
    productionScannerProven: false,
  };
}

async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      "Usage: npm run vercel:probe -- blob|blob-browser|scanner|scanner-failures\nRequires an explicitly selected isolated synthetic preview. See infra/vercel/README.md.",
    );
    return;
  }
  if (args.length !== 1) throw new Error("Expected exactly one probe mode.");
  const config = configuration(env, args[0]);
  if (args[0] === "blob-browser") {
    const browser = await openProbeBrowser(
      createRequire(path.resolve(__dirname, "../../client/package.json")),
    );
    let result;
    try {
      result = await probeBlobBrowser(
        config,
        serverRequire("@vercel/blob"),
        browser,
      );
    } finally {
      await browser.close();
    }
    // Statuses, booleans and header shapes only: no URL, token or signature.
    console.log(
      JSON.stringify({
        ...result,
        cleanupSucceeded: true,
        launchApproved: false,
      }),
    );
    if (!result.gatePassed) process.exitCode = 1;
    return;
  }
  // Sandbox names are not secrets; they let an operator verify no residue.
  const log = (name) => console.error(`probe sandbox: ${name}`);
  const result =
    args[0] === "blob"
      ? await probeBlob(config, serverRequire("@vercel/blob"))
      : args[0] === "scanner"
        ? await probeScanner(config, serverRequire("@vercel/sandbox"), log)
        : await probeScannerFailures(
            config,
            serverRequire("@vercel/sandbox"),
            log,
          );
  console.log(
    JSON.stringify({
      ...result,
      cleanupSucceeded: true,
      launchApproved: false,
    }),
  );
  if (result.gatePassed === false) process.exitCode = 1;
}

module.exports = {
  configuration,
  readBounded,
  probeBlob,
  probeBlobBrowser,
  pageRequest,
  syntheticBytes,
  dispositionShape,
  probeScanner,
  probeScannerFailures,
  SANDBOX_BUDGET,
  SIGNATURE_CHECK,
  main,
};
if (require.main === module)
  main().catch(() => {
    // SDK exceptions may contain credentials, URLs, signature names and bodies.
    console.error(
      "Platform probe failed or lacks required isolated-target configuration. No gate approved; inspect the restricted provider console and verify cleanup.",
    );
    process.exitCode = 1;
  });
