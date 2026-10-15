#!/usr/bin/env node
"use strict";

// Explicit opt-in synthetic probes. Never imported by application boot.
const { createHash, randomUUID } = require("node:crypto");
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
  if (!["blob", "scanner"].includes(mode))
    throw new Error("Choose blob or scanner.");
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
  if (mode === "blob")
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

const SIGNATURE_CHECK = `
const fs = require('node:fs');
const crypto = require('node:crypto');
const cp = require('node:child_process');
for (const [name, hash] of [['main.cvd', process.argv[1]], ['daily.cvd', process.argv[2]]]) {
  const file = '/var/lib/clamav/' + name;
  if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== hash) process.exit(2);
  const info = cp.execFileSync('sigtool', ['--info', file], { encoding: 'utf8', timeout: 10000 });
  const line = info.match(/^Build time:\\s*(.+)$/m);
  const time = line ? Date.parse(line[1]) : NaN;
  const age = Date.now() - time;
  if (!Number.isFinite(time) || age < 0 || (name === 'daily.cvd' && age > Number(process.argv[3]) * 3600000)) process.exit(3);
}
`;

async function probeScanner(config, sdk) {
  let sandbox;
  try {
    sandbox = await sdk.Sandbox.create({
      token: config.token,
      teamId: config.teamId,
      projectId: config.projectId,
      image: config.image,
      region: config.region,
      networkPolicy: "deny-all",
      timeout: 120_000,
      resources: { vcpus: 1 },
    });
    const verify = await sandbox.runCommand({
      cmd: "node",
      args: [
        "-e",
        SIGNATURE_CHECK,
        config.mainSha256,
        config.dailySha256,
        String(config.maxAgeHours),
      ],
      timeoutMs: 30_000,
    });
    if (verify.exitCode !== 0)
      throw new Error("Scanner signature verification failed.");
    const eicar = Buffer.from(
      "X5O!P%@AP[4" +
        "\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
    );
    await sandbox.writeFiles([
      {
        path: "/tmp/acres-clean.csv",
        content: Buffer.from("region,value\nsynthetic,1\n"),
      },
      { path: "/tmp/acres-eicar.txt", content: eicar },
    ]);
    const clean = await sandbox.runCommand({
      cmd: "clamscan",
      args: [
        "--no-summary",
        "--database=/var/lib/clamav",
        "--max-filesize=6M",
        "--max-scansize=6M",
        "/tmp/acres-clean.csv",
      ],
      timeoutMs: 30_000,
    });
    const infected = await sandbox.runCommand({
      cmd: "clamscan",
      args: [
        "--no-summary",
        "--database=/var/lib/clamav",
        "--max-filesize=6M",
        "--max-scansize=6M",
        "/tmp/acres-eicar.txt",
      ],
      timeoutMs: 30_000,
    });
    if (clean.exitCode !== 0 || infected.exitCode !== 1)
      throw new Error("Scanner clean/EICAR verification failed.");
    return {
      probe: "sandbox-clean-eicar",
      signaturesVerified: true,
      cleanAccepted: true,
      eicarRejected: true,
      network: "deny-all",
      productionScannerProven: false,
    };
  } finally {
    if (sandbox) await sandbox.stop();
  }
}

async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      "Usage: npm run vercel:probe -- blob|scanner\nRequires an explicitly selected isolated synthetic preview. See infra/vercel/README.md.",
    );
    return;
  }
  if (args.length !== 1) throw new Error("Expected exactly one probe mode.");
  const config = configuration(env, args[0]);
  const result =
    args[0] === "blob"
      ? await probeBlob(config, serverRequire("@vercel/blob"))
      : await probeScanner(config, serverRequire("@vercel/sandbox"));
  console.log(
    JSON.stringify({
      ...result,
      cleanupSucceeded: true,
      launchApproved: false,
    }),
  );
}

module.exports = { configuration, readBounded, probeBlob, probeScanner, main };
if (require.main === module)
  main().catch(() => {
    // SDK exceptions may contain credentials, URLs, signature names and bodies.
    console.error(
      "Platform probe failed or lacks required isolated-target configuration. No gate approved; inspect the restricted provider console and verify cleanup.",
    );
    process.exitCode = 1;
  });
