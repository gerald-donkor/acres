const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const yaml = require("js-yaml");

const {
  REQUIRED_STATEFUL_MOUNTS,
  APPROVED_MECHANISM_PATTERNS,
  FORBIDDEN_KEY_PATTERNS,
  parseEnv,
  isApprovedMechanism,
  parseVolumeEntry,
  scanDirectoryForKeys,
  validateVolumeEncryption,
} = require("./verify-volume-encryption");

const REFERENCE_COMPOSE_PATH = path.resolve(
  __dirname,
  "../../infra/compose/docker-compose.production.example.yml",
);
const REFERENCE_ENV_PATH = path.resolve(
  __dirname,
  "../../infra/env/production.env.example",
);
const REFERENCE_READINESS_PATH = path.resolve(
  __dirname,
  "../../infra/launch/readiness.example.json",
);

test("verifyVolumeEncryption: reference templates pass cleanly with 9/9 valid mounts", () => {
  const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, "utf8");
  const envText = fs.readFileSync(REFERENCE_ENV_PATH, "utf8");
  const readiness = JSON.parse(
    fs.readFileSync(REFERENCE_READINESS_PATH, "utf8"),
  );

  const result = validateVolumeEncryption({
    compose: composeText,
    env: envText,
    readiness,
    options: {
      checkGit: false,
      scanBackups: false,
    },
  });

  assert.equal(
    result.valid,
    true,
    `Expected valid result, but got errors: ${result.errors.join(", ")}`,
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.totalRequiredMounts, 9);
  assert.equal(result.validMountsCount, 9);
  assert.equal(result.evaluatedMounts.length, 9);
  assert.ok(result.evaluatedMounts.every((m) => m.passed === true));
});

test("verifyVolumeEncryption: fails closed when a stateful service lacks an encrypted mount", () => {
  const composeDoc = yaml.load(fs.readFileSync(REFERENCE_COMPOSE_PATH, "utf8"));
  const envText = fs.readFileSync(REFERENCE_ENV_PATH, "utf8");

  // Remove postgres volumes
  delete composeDoc.services.postgres.volumes;

  const result = validateVolumeEncryption({
    compose: composeDoc,
    env: envText,
    options: { checkGit: false, scanBackups: false },
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) =>
      e.includes(
        'Service "postgres" is missing required volume mount at "/var/lib/postgresql"',
      ),
    ),
  );
});

test("verifyVolumeEncryption: fails closed when an unencrypted direct host path is mounted", () => {
  const composeDoc = yaml.load(fs.readFileSync(REFERENCE_COMPOSE_PATH, "utf8"));
  const envText = fs.readFileSync(REFERENCE_ENV_PATH, "utf8");

  // Replace valkey encrypted mount with direct unencrypted host path
  composeDoc.services.valkey.volumes = ["/var/data/valkey:/data"];

  const result = validateVolumeEncryption({
    compose: composeDoc,
    env: envText,
    options: { checkGit: false, scanBackups: false },
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) =>
      e.includes(
        'mounts "/data" directly to unencrypted path "/var/data/valkey"',
      ),
    ),
    "Expected error for direct unencrypted mount",
  );
});

test("verifyVolumeEncryption: fails closed when postgres mounts forbidden subpath /var/lib/postgresql/data", () => {
  const composeDoc = yaml.load(fs.readFileSync(REFERENCE_COMPOSE_PATH, "utf8"));
  const envText = fs.readFileSync(REFERENCE_ENV_PATH, "utf8");

  // Add forbidden subpath mount
  composeDoc.services.postgres.volumes.push(
    "${ACRES_POSTGRES_DATA_MOUNT}:/var/lib/postgresql/data",
  );

  const result = validateVolumeEncryption({
    compose: composeDoc,
    env: envText,
    options: { checkGit: false, scanBackups: false },
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) =>
      e.includes('must not mount "/var/lib/postgresql/data" directly'),
    ),
    "Expected error for forbidden subpath mount",
  );
});

test("verifyVolumeEncryption: fails closed when an encrypted mount env variable is missing from environment template", () => {
  const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, "utf8");
  const env = parseEnv(fs.readFileSync(REFERENCE_ENV_PATH, "utf8"));

  // Delete an encrypted mount definition
  delete env.ACRES_GARAGE_DATA_ENCRYPTED_MOUNT;

  const result = validateVolumeEncryption({
    compose: composeText,
    env,
    options: { checkGit: false, scanBackups: false },
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) =>
      e.includes(
        'variable "ACRES_GARAGE_DATA_ENCRYPTED_MOUNT" is not declared',
      ),
    ),
    "Expected error for missing env declaration",
  );
});

test("isApprovedMechanism: correctly validates approved and unapproved mechanisms", () => {
  // Approved
  assert.equal(isApprovedMechanism("LUKS2"), true);
  assert.equal(isApprovedMechanism("luks2-dm-crypt"), true);
  assert.equal(isApprovedMechanism("dm-crypt"), true);
  assert.equal(isApprovedMechanism("aws:kms"), true);
  assert.equal(isApprovedMechanism("aws-kms"), true);
  assert.equal(isApprovedMechanism("aws:ebs:kms"), true);
  assert.equal(isApprovedMechanism("gcp:cmek"), true);
  assert.equal(isApprovedMechanism("gcp:persistent-disk:cmek"), true);
  assert.equal(isApprovedMechanism("azure:keyvault"), true);
  assert.equal(isApprovedMechanism("azure-keyvault"), true);

  // Unapproved / Insecure
  assert.equal(isApprovedMechanism("plaintext"), false);
  assert.equal(isApprovedMechanism("none"), false);
  assert.equal(isApprovedMechanism("aes-ecb"), false);
  assert.equal(isApprovedMechanism("rot13"), false);
  assert.equal(isApprovedMechanism(""), false);
  assert.equal(isApprovedMechanism(null), false);
  assert.equal(isApprovedMechanism(undefined), false);
});

test("verifyVolumeEncryption: fails closed on unapproved concrete encryption mechanism", () => {
  const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, "utf8");
  const env = parseEnv(fs.readFileSync(REFERENCE_ENV_PATH, "utf8"));

  env.PRODUCTION_VOLUME_ENCRYPTION = "proprietary-unverified-crypto";

  const result = validateVolumeEncryption({
    compose: composeText,
    env,
    options: { checkGit: false, scanBackups: false },
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.includes("is not an approved mechanism")),
    "Expected error for unapproved mechanism",
  );
});

test("verifyVolumeEncryption: fails closed when key recovery owner is empty in concrete env", () => {
  const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, "utf8");
  const env = parseEnv(fs.readFileSync(REFERENCE_ENV_PATH, "utf8"));

  env.PRODUCTION_VOLUME_ENCRYPTION = "LUKS2";
  env.PRODUCTION_KEY_RECOVERY_OWNER = "   ";

  const result = validateVolumeEncryption({
    compose: composeText,
    env,
    options: { checkGit: false, scanBackups: false },
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) =>
      e.includes("Designated key recovery owner is empty"),
    ),
    "Expected error for empty key recovery owner",
  );
});

test("readiness record validation: enforces key separation confirmation and owner in approved record", () => {
  const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, "utf8");
  const envText = fs.readFileSync(REFERENCE_ENV_PATH, "utf8");

  // Test 1: approved status with key_separation_confirmed: false
  const unconfirmedReadiness = {
    sections: {
      volume_encryption: {
        status: "approved",
        encryption_mechanism: "luks2-dm-crypt",
        key_separation_confirmed: false,
        key_recovery_owner: "infra-sre-lead",
        encrypted_mount_paths: ["/mnt/postgres", "/mnt/valkey", "/mnt/garage"],
      },
    },
  };

  const res1 = validateVolumeEncryption({
    compose: composeText,
    env: envText,
    readiness: unconfirmedReadiness,
    options: { checkGit: false, scanBackups: false },
  });
  assert.equal(res1.valid, false);
  assert.ok(
    res1.errors.some((e) =>
      e.includes("explicit confirmation of key separation"),
    ),
  );

  // Test 2: approved status with valid settings
  const confirmedReadiness = {
    sections: {
      volume_encryption: {
        status: "approved",
        encryption_mechanism: "luks2-dm-crypt",
        key_separation_confirmed: true,
        key_recovery_owner: "infra-sre-lead",
        encrypted_mount_paths: ["/mnt/postgres", "/mnt/valkey", "/mnt/garage"],
      },
    },
  };

  const res2 = validateVolumeEncryption({
    compose: composeText,
    env: envText,
    readiness: confirmedReadiness,
    options: { checkGit: false, scanBackups: false },
  });
  assert.equal(res2.valid, true);
});

test("Key Separation Invariant: detects co-located keyfiles in mount directories", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-key-sep-test-"));
  try {
    const dataSubdir = path.join(tmpDir, "data");
    fs.mkdirSync(dataSubdir, { recursive: true });

    // Plant forbidden key file
    const plantedKeyFile = path.join(dataSubdir, "volume-unlock.key");
    fs.writeFileSync(plantedKeyFile, "SIMULATED_PRIVATE_KEY_MATERIAL");

    const violations = scanDirectoryForKeys(tmpDir);
    assert.ok(violations.length > 0, "Expected to detect key file violation");
    assert.equal(violations[0].filename, "volume-unlock.key");

    const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, "utf8");
    const envText = fs.readFileSync(REFERENCE_ENV_PATH, "utf8");

    const result = validateVolumeEncryption({
      compose: composeText,
      env: envText,
      options: {
        checkGit: false,
        scanBackups: false,
        hostMountPaths: [tmpDir],
      },
    });

    assert.equal(result.valid, false);
    assert.equal(result.keySeparation.verified, false);
    assert.ok(
      result.errors.some((e) =>
        e.includes("Key Separation Invariant violated"),
      ),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Key Separation Invariant: clean directory with legitimate data files passes cleanly", () => {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "acres-clean-dir-test-"),
  );
  try {
    const dataSubdir = path.join(tmpDir, "postgres_data");
    fs.mkdirSync(dataSubdir, { recursive: true });

    fs.writeFileSync(path.join(dataSubdir, "PG_VERSION"), "18\n");
    fs.writeFileSync(path.join(dataSubdir, "postgresql.conf"), "# config\n");
    fs.writeFileSync(path.join(dataSubdir, "dataset.csv"), "id,col1\n1,val\n");

    const violations = scanDirectoryForKeys(tmpDir);
    assert.equal(violations.length, 0);

    const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, "utf8");
    const envText = fs.readFileSync(REFERENCE_ENV_PATH, "utf8");

    const result = validateVolumeEncryption({
      compose: composeText,
      env: envText,
      options: {
        checkGit: false,
        scanBackups: false,
        hostMountPaths: [tmpDir],
      },
    });

    assert.equal(result.valid, true);
    assert.equal(result.keySeparation.verified, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("parseVolumeEntry: correctly parses string and object mount declarations", () => {
  const v1 = parseVolumeEntry("/host/data:/var/lib/postgresql:rw");
  assert.equal(v1.source, "/host/data");
  assert.equal(v1.target, "/var/lib/postgresql");
  assert.equal(v1.readOnly, false);

  const v2 = parseVolumeEntry(
    "../caddy/Caddyfile.example:/etc/caddy/Caddyfile:ro",
  );
  assert.equal(v2.source, "../caddy/Caddyfile.example");
  assert.equal(v2.target, "/etc/caddy/Caddyfile");
  assert.equal(v2.readOnly, true);

  const v3 = parseVolumeEntry({
    type: "volume",
    source: "acres_valkey",
    target: "/data",
    read_only: false,
  });
  assert.equal(v3.source, "acres_valkey");
  assert.equal(v3.target, "/data");
  assert.equal(v3.readOnly, false);
});

test("Key Separation Invariant: detects symlinked keyfile within mount path", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-symlink-test-"));
  try {
    const secretDir = path.join(tmpDir, "secret_store");
    const mountDir = path.join(tmpDir, "mount");
    fs.mkdirSync(secretDir, { recursive: true });
    fs.mkdirSync(mountDir, { recursive: true });

    // Put key in secret_store and symlink into mount
    const realKey = path.join(secretDir, "real.key");
    fs.writeFileSync(realKey, "TOP_SECRET_KEY");
    const symlinkKey = path.join(mountDir, "linked.key");
    fs.symlinkSync(realKey, symlinkKey);

    const violations = scanDirectoryForKeys(mountDir);
    assert.ok(
      violations.length > 0,
      "Expected violation for symlinked keyfile",
    );
    assert.equal(violations[0].filename, "linked.key");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Key Separation Invariant: fails closed when keyfile is detected in backupsDir", () => {
  const tmpBackups = fs.mkdtempSync(
    path.join(os.tmpdir(), "acres-backups-test-"),
  );
  try {
    fs.writeFileSync(path.join(tmpBackups, "leak.passphrase"), "PASS");

    const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, "utf8");
    const envText = fs.readFileSync(REFERENCE_ENV_PATH, "utf8");

    const result = validateVolumeEncryption({
      compose: composeText,
      env: envText,
      options: {
        checkGit: false,
        scanBackups: true,
        backupsDir: tmpBackups,
      },
    });

    assert.equal(result.valid, false);
    assert.equal(result.keySeparation.verified, false);
    assert.ok(
      result.errors.some((e) =>
        e.includes("key material detected in backups directory"),
      ),
    );
  } finally {
    fs.rmSync(tmpBackups, { recursive: true, force: true });
  }
});

// Isolate the script location too: its default repo/backups roots must be test-owned.
function cliFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acres-volume-cli-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ops = path.join(root, "scripts/ops");
  fs.mkdirSync(ops, { recursive: true });
  const script = path.join(ops, "verify-volume-encryption.js");
  fs.copyFileSync(path.join(__dirname, "verify-volume-encryption.js"), script);
  fs.mkdirSync(path.join(root, "node_modules"));
  for (const pkg of ["js-yaml", "argparse"])
    fs.cpSync(
      path.dirname(require.resolve(pkg + "/package.json")),
      path.join(root, "node_modules", pkg),
      { recursive: true },
    );
  fs.mkdirSync(path.join(root, ".git"));
  fs.mkdirSync(path.join(root, "backups"));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, "git"),
    '#!/bin/sh\nprintf "dataset.csv\\n"\n',
    { mode: 0o700 },
  );
  const compose = path.join(root, "compose.yml");
  const envFile = path.join(root, "production.env");
  const readiness = path.join(root, "readiness.json");
  const output = path.join(root, "receipt.json");
  fs.copyFileSync(REFERENCE_COMPOSE_PATH, compose);
  fs.copyFileSync(REFERENCE_ENV_PATH, envFile);
  fs.copyFileSync(REFERENCE_READINESS_PATH, readiness);
  return {
    root,
    compose,
    envFile,
    output,
    run(args = [], save = true) {
      return require("node:child_process").spawnSync(
        process.execPath,
        [
          script,
          "--compose",
          compose,
          "--env",
          envFile,
          "--readiness",
          readiness,
          ...(save ? ["--output", output] : []),
          ...args,
        ],
        {
          cwd: root,
          env: { PATH: bin, TMPDIR: root },
          encoding: "utf8",
          timeout: 10000,
        },
      );
    },
  };
}

for (const scenario of ["sentinels", "concrete", "failed"]) {
  test(`volume CLI emits simulation preflight for ${scenario} configuration`, (t) => {
    const f = cliFixture(t);
    if (scenario === "concrete") {
      const env = parseEnv(fs.readFileSync(f.envFile, "utf8"));
      env.PRODUCTION_VOLUME_ENCRYPTION = "LUKS2";
      env.PRODUCTION_KEY_RECOVERY_OWNER = "fixture-custodian";
      for (const [index, mount] of REQUIRED_STATEFUL_MOUNTS.entries()) {
        env[mount.envVar] = path.join(f.root, `storage-${index}`);
        fs.mkdirSync(env[mount.envVar]);
      }
      fs.writeFileSync(
        f.envFile,
        Object.entries(env)
          .map(([key, value]) => `${key}=${value}`)
          .join("\n"),
      );
    }
    if (scenario === "failed") fs.writeFileSync(f.compose, "services: {}");
    const result = f.run(["--json"]);
    assert.ifError(result.error);
    assert.equal(result.status, scenario === "failed" ? 1 : 0, result.stderr);
    const receipt = JSON.parse(fs.readFileSync(f.output, "utf8"));
    assert.deepEqual(JSON.parse(result.stdout), receipt);
    assert.equal(receipt.execution_mode, "simulation");
    assert.equal(receipt.status, scenario === "failed" ? "failed" : "success");
    const {
      validateVolumeEncryptionReport,
    } = require("./check-launch-readiness");
    assert.equal(
      validateVolumeEncryptionReport(receipt),
      scenario !== "failed",
    );
    assert.equal(
      validateVolumeEncryptionReport(receipt, undefined, { requireLive: true }),
      false,
    );
    assert.ok(
      receipt.keySeparation.scannedPaths.every(
        (source) => source === "Local filename scan",
      ),
    );
    if (scenario === "concrete")
      assert.equal(receipt.keySeparation.scannedPaths.length, 10);
  });
}

test("volume CLI -o alias and human text describe preflight only", (t) => {
  const f = cliFixture(t);
  const result = f.run(["-o", f.output], false);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    JSON.parse(fs.readFileSync(f.output)).execution_mode,
    "simulation",
  );
  assert.match(
    result.stdout,
    /limited local filename scans passed; live inspection required/,
  );
});

const { spawnSync, spawn } = require("node:child_process");
function installation(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "volume private paths-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const script = path.join(dir, "scripts/ops/verify-volume-encryption.js");
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(path.join(__dirname, "verify-volume-encryption.js"), script);
  for (const pkg of ["js-yaml", "argparse"])
    fs.cpSync(
      path.dirname(require.resolve(pkg + "/package.json")),
      path.join(dir, "node_modules", pkg),
      { recursive: true },
    );
  for (const [from, to] of [
    [
      REFERENCE_COMPOSE_PATH,
      "infra/compose/docker-compose.production.example.yml",
    ],
    [REFERENCE_ENV_PATH, "infra/env/production.env.example"],
    [REFERENCE_READINESS_PATH, "infra/launch/readiness.example.json"],
  ]) {
    const dest = path.join(dir, to);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(from, dest);
  }
  fs.mkdirSync(path.join(dir, ".git"));
  fs.mkdirSync(path.join(dir, "backups"));
  fs.mkdirSync(path.join(dir, "bin"));
  fs.writeFileSync(
    path.join(dir, "bin/git"),
    '#!/bin/sh\nprintf "dataset.csv\\n"\n',
    { mode: 0o700 },
  );
  const cwd = path.join(dir, "caller");
  fs.mkdirSync(cwd);
  const env = { PATH: path.join(dir, "bin"), TMPDIR: dir };
  const execute = (args = [], hook = "") => {
    const preload = path.join(dir, "hook.cjs");
    if (hook)
      fs.writeFileSync(
        preload,
        `const fs=require('node:fs'),path=require('node:path');const base=${JSON.stringify(dir)};${hook}`,
      );
    return spawnSync(
      process.execPath,
      [...(hook ? ["--require", preload] : []), script, ...args],
      { cwd, env, encoding: "utf8", timeout: 8000, maxBuffer: 8 * 1024 * 1024 },
    );
  };
  return {
    dir,
    cwd,
    script,
    env,
    execute,
    output: path.join(cwd, "evidence.json"),
    compose: path.join(
      dir,
      "infra/compose/docker-compose.production.example.yml",
    ),
    server: path.join(
      dir,
      "infra/compose/docker-compose.production.example.yml",
    ),
    envFile: path.join(dir, "infra/env/production.env.example"),
    readiness: path.join(dir, "infra/launch/readiness.example.json"),
  };
}
const rejectWork = `const marker=path.join(base,'early-work');const reject=()=>{fs.writeFileSync(marker,'unexpected work');throw Error('CanaryWork')};for(const name of ['statSync','lstatSync','openSync','mkdirSync'])fs[name]=reject;require('node:child_process').execSync=reject;`;
for (const args of [
  ["--unknown=CanaryValue"],
  ["CanaryValue"],
  ["--json", "--json"],
  ["--json=true"],
  ["--output"],
  ["-o"],
  ["--output="],
  ["--output", " "],
  ["--output", "a\nb"],
  ["--output", "--json"],
  ["--output", "-literal"],
  ["--output", "/"],
  ["--output", "folder/"],
  ["--output", "one", "-o", "two"],
  ["-o=one", "--output=two"],
  ["--help", "--json"],
  ["-h", "-h"],
])
  test(`strict CLI rejects ${JSON.stringify(args)} before work`, (t) => {
    const f = installation(t),
      r = f.execute(args, rejectWork);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "Volume invocation failed\n");
    assert.deepEqual(fs.readdirSync(f.cwd), []);
    assert.equal(fs.existsSync(path.join(f.dir, "early-work")), false);
  });
for (const flag of ["--help", "-h"])
  test(`standalone ${flag} has no evaluation/allocation`, (t) => {
    const r = installation(t).execute([flag], rejectWork);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /limited local filename scans/);
    assert.equal(r.stderr, "");
  });
test("import does not evaluate or allocate", (t) => {
  const f = installation(t);
  const r = spawnSync(
    process.execPath,
    [
      "-e",
      `const fs=require('fs');fs.statSync=()=>{throw Error('read')};fs.mkdirSync=()=>{throw Error('allocate')};require(${JSON.stringify(f.script)});`,
    ],
    { env: f.env, encoding: "utf8", timeout: 8000 },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");
});
for (const args of [
  ["--output", "space name.json"],
  ["-o", "space name.json"],
  ["--output=-dash.json"],
  ["--output=$LITERAL.json"],
  ["--output=~literal.json"],
])
  test(`literal caller-relative output ${JSON.stringify(args)}`, (t) => {
    const f = installation(t),
      r = f.execute(["--json", ...args]);
    assert.equal(r.status, 0, r.stderr);
    const value =
      args.length === 2 ? args[1] : args[0].split("=").slice(1).join("=");
    const file = path.join(f.cwd, value),
      report = JSON.parse(r.stdout);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), report);
    assert.equal(report.totalRequiredMounts, 9);
    assert.equal(report.valid, true);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(report.validMountsCount, 9);
  });
test("no-save never allocates output and default sources ignore caller cwd", (t) => {
  const f = installation(t),
    r = f.execute(
      ["--json"],
      `fs.mkdirSync=()=>{throw Error('allocate')};fs.writeSync=()=>{throw Error('write')};`,
    );
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).totalRequiredMounts, 9);
  assert.deepEqual(fs.readdirSync(f.cwd), []);
});
for (const type of ["file", "directory", "symlink", "dangling"])
  test(`preserve retained ${type} before reading sources`, (t) => {
    const f = installation(t);
    if (type === "file") fs.writeFileSync(f.output, "retained");
    if (type === "directory") fs.mkdirSync(f.output);
    if (type === "symlink" || type === "dangling")
      fs.symlinkSync(
        type === "symlink" ? f.server : path.join(f.dir, "absent"),
        f.output,
      );
    const original = fs.lstatSync(f.output),
      r = f.execute(["--output", f.output], rejectWork);
    assert.equal(r.status, 1);
    assert.equal(r.stderr, "Volume publication failed\n");
    assert.equal(fs.lstatSync(f.output).ino, original.ino);
    if (type === "file")
      assert.equal(fs.readFileSync(f.output, "utf8"), "retained");
  });
for (const type of ["symlink", "file"])
  test(`reject ${type} output ancestor`, (t) => {
    const f = installation(t),
      ancestor = path.join(f.cwd, "parent");
    if (type === "symlink") fs.symlinkSync(f.dir, ancestor);
    else fs.writeFileSync(ancestor, "keep");
    const r = f.execute(["--output", path.join(ancestor, "evidence.json")]);
    assert.equal(r.status, 1);
    assert.equal(r.stderr, "Volume publication failed\n");
  });
test("new parent modes private, existing modes preserved", (t) => {
  const f = installation(t);
  fs.chmodSync(f.cwd, 0o750);
  const out = path.join(f.cwd, "a/b/receipt.json");
  const r = f.execute(["--output", out]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.statSync(f.cwd).mode & 0o777, 0o750);
  for (const p of ["a", "a/b"])
    assert.equal(fs.statSync(path.join(f.cwd, p)).mode & 0o777, 0o700);
  assert.deepEqual(fs.readdirSync(path.dirname(out)), ["receipt.json"]);
});
for (const fault of [
  "late-file",
  "late-directory",
  "late-link",
  "unsupported-link",
  "write",
  "zero-write",
  "readback",
  "close",
  "unlink",
  "foreign",
  "parent-removed",
  "parent-replaced",
  "open",
  "fstat",
  "short-write",
])
  test(`publication fault/ownership ${fault}`, (t) => {
    const f = installation(t);
    const hooks = {
      "late-file": `const old=fs.linkSync;fs.linkSync=(a,b)=>{fs.writeFileSync(b,'competitor');return old(a,b)};`,
      "late-directory": `const old=fs.linkSync;fs.linkSync=(a,b)=>{fs.mkdirSync(b);return old(a,b)};`,
      "late-link": `const old=fs.linkSync;fs.linkSync=(a,b)=>{fs.symlinkSync(path.join(base,'absent'),b);return old(a,b)};`,
      "unsupported-link": `fs.linkSync=()=>{throw Error('CanaryPrivate')};`,
      write: `fs.writeSync=()=>{throw Error('CanaryPrivate')};`,
      "zero-write": `fs.writeSync=()=>0;`,
      readback: `const old=fs.openSync;fs.openSync=(p,...a)=>{if(String(p).endsWith('.tmp')&&a[0]=== (fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK))fs.writeFileSync(p,'tampered');return old(p,...a)};`,
      close: `const open=fs.openSync,close=fs.closeSync;const temps=new Set();fs.openSync=(p,...a)=>{const fd=open(p,...a);if(String(p).endsWith('.tmp'))temps.add(fd);return fd};let once=true;fs.closeSync=fd=>{if(once&&temps.has(fd)){once=false;throw Error('CanaryClose')}return close(fd)};`,
      unlink: `const old=fs.unlinkSync;let once=true;fs.unlinkSync=p=>{if(once){once=false;throw Error('CanaryUnlink')}return old(p)};`,
      foreign: `const old=fs.linkSync;fs.linkSync=(a,b)=>{fs.renameSync(a,a+'.owned');fs.writeFileSync(a,'foreign');throw Error('CanaryForeign')};`,
      "parent-removed": `const old=fs.openSync;let once=true;fs.openSync=(p,...a)=>{const fd=old(p,...a);if(once&&String(p).endsWith('.yml')){once=false;fs.rmdirSync(path.join(base,'caller'))}return fd};`,
      "parent-replaced": `const old=fs.openSync;let once=true;fs.openSync=(p,...a)=>{const fd=old(p,...a);if(once&&String(p).endsWith('.yml')){once=false;fs.renameSync(path.join(base,'caller'),path.join(base,'retained'));fs.mkdirSync(path.join(base,'caller'))}return fd};`,
      open: `const old=fs.openSync;fs.openSync=(p,...a)=>{if(String(p).endsWith('.tmp'))throw Error('CanaryOpen');return old(p,...a)};`,
      fstat: `const old=fs.fstatSync;let once=true;fs.fstatSync=fd=>{const s=old(fd);if(once&&s.size===0){once=false;throw Error('CanaryStat')}return s};`,
      "short-write": `const old=fs.writeSync;fs.writeSync=(fd,b,o,n,p)=>old(fd,b,o,Math.min(n,13),p);`,
    };
    const r = f.execute(["--json", "--output", f.output], hooks[fault]);
    assert.equal(r.status, fault === "short-write" ? 0 : 1, r.stderr);
    assert.ok(!r.stderr.includes("Canary"));
    if (fault === "short-write")
      assert.equal(JSON.parse(fs.readFileSync(f.output, "utf8")).valid, true);
    else if (fault === "unlink")
      assert.equal(JSON.parse(fs.readFileSync(f.output, "utf8")).valid, true);
    else if (fault === "late-file")
      assert.equal(fs.readFileSync(f.output, "utf8"), "competitor");
    else if (fault === "late-directory")
      assert.ok(fs.statSync(f.output).isDirectory());
    else if (fault === "late-link")
      assert.ok(fs.lstatSync(f.output).isSymbolicLink());
    else assert.equal(fs.existsSync(f.output), false);
    if (fault === "foreign")
      assert.ok(
        fs
          .readdirSync(f.cwd)
          .some(
            (p) =>
              p.endsWith(".tmp") &&
              fs.readFileSync(path.join(f.cwd, p), "utf8") === "foreign",
          ),
      );
    else if (fs.existsSync(f.cwd))
      assert.ok(!fs.readdirSync(f.cwd).some((p) => p.endsWith(".tmp")));
  });
for (const fault of ["growth", "read", "close", "fifo-replacement"])
  test(`source fault and owned closure ${fault}`, (t) => {
    const f = installation(t),
      hook = {
        growth: `const old=fs.readSync;fs.readSync=(fd,...a)=>{const n=old(fd,...a);if(n>0)fs.appendFileSync(path.join(base,'infra/compose/docker-compose.production.example.yml'),'growth');return n};`,
        read: `fs.readSync=()=>{throw Error('CanaryRead')};`,
        close: `const old=fs.closeSync;let once=true;fs.closeSync=fd=>{if(once){once=false;throw Error('CanaryClose')}return old(fd)};`,
        "fifo-replacement": `const old=fs.openSync;fs.openSync=(p,...a)=>{if(String(p).endsWith('.yml')){fs.unlinkSync(p);require('child_process').execFileSync('/usr/bin/mkfifo',[p]);}return old(p,...a)};`,
      }[fault];
    const r = f.execute(["--json"], hook);
    assert.equal(r.status, 1);
    assert.equal(r.stderr, "Volume evaluation failed\n");
    assert.equal(r.stdout, "");
  });
for (const fault of ["throw", "callback", "event", "stderr"])
  test(`output failure ${fault} preserves published receipt and nonzero`, (t) => {
    const f = installation(t),
      hook = {
        throw: `process.stdout.write=()=>{throw Error('CanaryOutput')};`,
        callback: `process.stdout.write=(v,cb)=>{cb(Error('CanaryOutput'));return false};`,
        event: `process.stdout.write=()=>{process.stdout.emit('error',Error('CanaryOutput'));return false};`,
        stderr: `process.stderr.write=()=>{throw Error('CanaryError')};process.stdout.write=()=>{throw Error('CanaryOutput')};`,
      }[fault];
    const r = f.execute(["--json", "--output", f.output], hook);
    assert.equal(r.status, 1);
    assert.ok(!r.stderr.includes("Canary"));
    assert.equal(JSON.parse(fs.readFileSync(f.output, "utf8")).valid, true);
  });
test("save byte ceiling rejects before directory allocation", (t) => {
  const f = installation(t);
  const r = f.execute(
    ["--output", "new/receipt.json"],
    `const old=JSON.stringify;JSON.stringify=(v,...a)=>{const s=old(v,...a);return v?.drill_type?s+' '.repeat(1024*1024):s};fs.mkdirSync=()=>{throw Error('CanaryAllocation')};`,
  );
  assert.equal(r.status, 1);
  assert.equal(r.stderr, "Volume serialization failed\n");
  assert.deepEqual(fs.readdirSync(f.cwd), []);
});
test("broken stdout pipe fails without stack", async (t) => {
  const f = installation(t);
  const child = spawn(process.execPath, [f.script, "--json"], {
    env: f.env,
    cwd: f.cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.destroy();
  let stderr = "";
  child.stderr.on("data", (b) => (stderr += b));
  const timer = setTimeout(() => child.kill("SIGKILL"), 8000);
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  clearTimeout(timer);
  assert.equal(code, 1);
  assert.equal(stderr, "Volume output failed\n");
});

for (const kind of [
  "truncation",
  "growth",
  "same-size",
  "negative-read",
  "read-close",
  "persistent-cleanup",
])
  test(`staging verification/cleanup fault ${kind}`, (t) => {
    const f = installation(t),
      hook = {
        truncation: `const old=fs.openSync;fs.openSync=(p,...a)=>{if(String(p).endsWith('.tmp')&&a[0]===(fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK))fs.truncateSync(p,20);return old(p,...a)};`,
        growth: `const old=fs.openSync;fs.openSync=(p,...a)=>{if(String(p).endsWith('.tmp')&&a[0]===(fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK))fs.appendFileSync(p,'growth');return old(p,...a)};`,
        "same-size": `const old=fs.openSync;fs.openSync=(p,...a)=>{if(String(p).endsWith('.tmp')&&a[0]===(fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK)){const b=fs.readFileSync(p);b[0]=32;fs.writeFileSync(p,b)}return old(p,...a)};`,
        "negative-read": `const open=fs.openSync,read=fs.readSync;let temp;fs.openSync=(p,...a)=>{const fd=open(p,...a);if(String(p).endsWith('.tmp')&&a[0]===(fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK))temp=fd;return fd};fs.readSync=(fd,...a)=>fd===temp?-1:read(fd,...a);`,
        "read-close": `const open=fs.openSync,close=fs.closeSync;let temp;fs.openSync=(p,...a)=>{const fd=open(p,...a);if(String(p).endsWith('.tmp')&&a[0]===(fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK))temp=fd;return fd};let once=true;fs.closeSync=fd=>{if(once&&fd===temp){once=false;throw Error('CanaryClose')}return close(fd)};`,
        "persistent-cleanup": `fs.unlinkSync=()=>{throw Error('CanaryCleanup')};`,
      }[kind];
    const r = f.execute(["--output", f.output], hook);
    assert.equal(r.status, 1);
    assert.ok(!r.stderr.includes("Canary"));
    if (kind === "persistent-cleanup") {
      assert.equal(r.stderr, "Volume cleanup failed\n");
      assert.equal(JSON.parse(fs.readFileSync(f.output, "utf8")).valid, true);
      assert.ok(fs.readdirSync(f.cwd).some((p) => p.endsWith(".tmp")));
    } else {
      assert.equal(fs.existsSync(f.output), false);
      assert.ok(!fs.readdirSync(f.cwd).some((p) => p.endsWith(".tmp")));
    }
  });
test("source descriptors close after read fault and closure retry still fails", (t) => {
  const f = installation(t),
    marker = path.join(f.dir, "closure.json");
  const r = f.execute(
    ["--json"],
    `const open=fs.openSync,close=fs.closeSync;let fd,attempts=0;fs.openSync=(p,...a)=>{const x=open(p,...a);if(String(p).endsWith('.yml'))fd=x;return x};fs.readSync=()=>{throw Error('CanaryRead')};fs.closeSync=x=>{if(x===fd&&++attempts===1)throw Error('CanaryClose');return close(x)};process.on('exit',()=>fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({attempts,closed:(()=>{try{fs.fstatSync(fd);return false}catch{return true}})()})));`,
  );
  assert.equal(r.status, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(marker, "utf8")), {
    attempts: 2,
    closed: true,
  });
  assert.equal(r.stderr, "Volume evaluation failed\n");
});
test("serialization faults and invalid closed report fail without source reflection", (t) => {
  const f = installation(t);
  for (const hook of [
    `JSON.stringify=()=>{throw Error('CanarySerialization')};`,
    `const old=JSON.stringify;JSON.stringify=(v,...a)=>old(v?.drill_type?{...v,valid:false}:v,...a);`,
  ]) {
    const r = f.execute(["--output", f.output], hook);
    assert.equal(r.status, 1);
    assert.ok(!r.stderr.includes("Canary"));
    assert.equal(fs.existsSync(f.output), false);
    assert.ok(!fs.readdirSync(f.cwd).some((p) => p.endsWith(".tmp")));
  }
});

for (const args of [
  ["--compose"],
  ["--env="],
  ["--readiness", "--json"],
  ["--mount-path", " "],
  ["--compose", "a", "--compose=b"],
  ["--env=a", "--env=b"],
  ["--readiness=a", "--readiness=b"],
  ["--mount-path=true", "--unknown"],
  ["--help", "--compose=x"],
  ["-o=x"],
])
  test(`source argv rejected before work ${JSON.stringify(args)}`, (t) => {
    const f = installation(t),
      r = f.execute(args, rejectWork);
    assert.equal(r.status, 1);
    assert.equal(r.stderr, "Volume invocation failed\n");
    assert.equal(r.stdout, "");
  });
for (const value of [
  undefined,
  null,
  [],
  1,
  {},
  { compose: [], env: {} },
  { compose: { services: [] }, env: {} },
  { compose: { services: {} }, env: { PRODUCTION_VOLUME_ENCRYPTION: {} } },
  {
    compose: { services: {} },
    env: {},
    options: { hostMountPaths: "private" },
  },
  { compose: { services: {} }, env: {}, options: { scanBackups: 1 } },
  {
    compose: { services: {} },
    env: {},
    readiness: { sections: { volume_encryption: { key_recovery_owner: {} } } },
  },
])
  test(`malformed direct inputs fail before work ${JSON.stringify(value)}`, () => {
    const old = fs.existsSync;
    fs.existsSync = () => {
      throw Error("unexpected scan");
    };
    try {
      const r = validateVolumeEncryption(value);
      assert.equal(r.valid, false);
      assert.deepEqual(r.errors, ["Invalid volume configuration"]);
    } finally {
      fs.existsSync = old;
    }
  });
for (const source of [
  "missing",
  "malformed",
  "oversize",
  "directory",
  "fifo",
  "cycle",
  "depth",
  "merge",
  "budget",
  "symlink",
])
  test(`bounded Compose source ${source}`, (t) => {
    const f = installation(t);
    if (source === "missing") fs.unlinkSync(f.compose);
    if (source === "malformed") fs.writeFileSync(f.compose, "CanaryPrivate: [");
    if (source === "oversize")
      fs.writeFileSync(f.compose, "#".repeat(1024 * 1024 + 1));
    if (source === "directory" || source === "fifo") {
      fs.unlinkSync(f.compose);
      if (source === "directory") fs.mkdirSync(f.compose);
      else assert.equal(spawnSync("/usr/bin/mkfifo", [f.compose]).status, 0);
    }
    if (source === "cycle") fs.writeFileSync(f.compose, "services: &a {p: *a}");
    if (source === "depth")
      fs.writeFileSync(f.compose, "[".repeat(101) + "0" + "]".repeat(101));
    if (source === "merge")
      fs.writeFileSync(
        f.compose,
        "a: &a {v: 1}\nb: {<<: [" + Array(10001).fill("*a").join(",") + "]}",
      );
    if (source === "budget")
      fs.writeFileSync(
        f.compose,
        JSON.stringify({ services: {}, extra: Array(10001).fill(0) }),
      );
    if (source === "symlink") {
      fs.renameSync(f.compose, f.compose + ".real");
      fs.symlinkSync(f.compose + ".real", f.compose);
    }
    const r = f.execute(["--json", "--output", f.output]);
    assert.equal(r.status, source === "symlink" ? 0 : 1, r.stderr);
    if (source === "symlink") assert.equal(JSON.parse(r.stdout).valid, true);
    else {
      assert.equal(r.stdout, "");
      assert.equal(r.stderr, "Volume evaluation failed\n");
      assert.equal(fs.existsSync(f.output), false);
    }
  });
for (const source of [
  "absent-default",
  "absent-explicit",
  "malformed",
  "null",
  "array",
  "sections",
  "owner",
  "confirmation",
  "paths",
  "oversize",
  "directory",
  "read-fault",
])
  test(`readiness source distinction ${source}`, (t) => {
    const f = installation(t);
    let args = [],
      hook = "";
    if (source.startsWith("absent")) {
      fs.unlinkSync(f.readiness);
      if (source === "absent-explicit") args = ["--readiness", f.readiness];
    }
    if (source === "malformed")
      fs.writeFileSync(f.readiness, "CanaryPrivate: [");
    const values = {
      null: null,
      array: [],
      sections: { sections: [] },
      owner: { sections: { volume_encryption: { key_recovery_owner: {} } } },
      confirmation: {
        sections: { volume_encryption: { key_separation_confirmed: "true" } },
      },
      paths: {
        sections: { volume_encryption: { encrypted_mount_paths: [{}] } },
      },
    };
    if (Object.hasOwn(values, source))
      fs.writeFileSync(f.readiness, JSON.stringify(values[source]));
    if (source === "oversize")
      fs.writeFileSync(f.readiness, " ".repeat(1024 * 1024 + 1));
    if (source === "directory") {
      fs.unlinkSync(f.readiness);
      fs.mkdirSync(f.readiness);
    }
    if (source === "read-fault")
      hook = `const old=fs.statSync;fs.statSync=(p,...a)=>{if(String(p).endsWith('readiness.example.json'))throw Object.assign(Error('CanaryPrivate'),{code:'EACCES'});return old(p,...a)};`;
    const r = f.execute(["--json", "--output", f.output, ...args], hook);
    assert.equal(r.status, source === "absent-default" ? 0 : 1, r.stderr);
    if (source === "absent-default")
      assert.equal(JSON.parse(r.stdout).readinessEvaluated, null);
    else {
      assert.equal(r.stdout, "");
      assert.equal(r.stderr, "Volume evaluation failed\n");
      assert.equal(fs.existsSync(f.output), false);
    }
  });
test("caller-relative attached sources, repeated mount paths and finite aliases", (t) => {
  const f = installation(t),
    d = yaml.load(fs.readFileSync(f.compose, "utf8"));
  d.extra = { one: { v: 1 } };
  d.extra.two = d.extra.one;
  fs.writeFileSync(path.join(f.cwd, "-compose file"), yaml.dump(d));
  fs.copyFileSync(f.envFile, path.join(f.cwd, "env file"));
  fs.copyFileSync(f.readiness, path.join(f.cwd, "readiness file"));
  const mount = path.join(f.cwd, "mount");
  fs.mkdirSync(mount);
  const r = f.execute([
    "--json",
    "--compose=-compose file",
    "--env",
    "env file",
    "--readiness=readiness file",
    "--mount-path=mount",
    "--mount-path",
    "mount",
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).keySeparation.scannedPaths.length, 3);
});
for (const scenario of [
  "mechanism",
  "owner",
  "source",
  "readiness",
  "keys",
  "git",
])
  test(`private metadata redaction and evaluated failure parity ${scenario}`, (t) => {
    const f = installation(t),
      canary = "CanaryPrivate",
      d = yaml.load(fs.readFileSync(f.compose, "utf8"));
    if (scenario === "mechanism")
      fs.appendFileSync(f.envFile, "\nPRODUCTION_VOLUME_ENCRYPTION=" + canary);
    if (scenario === "owner")
      fs.appendFileSync(f.envFile, '\nPRODUCTION_KEY_RECOVERY_OWNER="   "');
    if (scenario === "source") {
      d.services.valkey.volumes = ["/private/" + canary + ":/data"];
      fs.writeFileSync(f.compose, yaml.dump(d));
    }
    if (scenario === "readiness")
      fs.writeFileSync(
        f.readiness,
        JSON.stringify({
          sections: {
            volume_encryption: {
              status: "approved",
              encryption_mechanism: canary,
              key_separation_confirmed: false,
              key_recovery_owner: canary,
              encrypted_mount_paths: [],
            },
          },
        }),
      );
    if (scenario === "keys")
      fs.writeFileSync(path.join(f.dir, "backups", canary + ".key"), "fixture");
    if (scenario === "git")
      fs.writeFileSync(
        path.join(f.dir, "bin/git"),
        '#!/bin/sh\nprintf "' + canary + '.key\\n"\n',
        { mode: 0o700 },
      );
    const r = f.execute(["--json", "--output", f.output]);
    assert.equal(r.status, 1, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.deepEqual(report, JSON.parse(fs.readFileSync(f.output, "utf8")));
    assert.equal(report.valid, false);
    assert.equal(report.evaluatedMounts.length, 9);
    assert.equal(report.validMountsCount, scenario === "source" ? 8 : 9);
    assert.ok(!r.stdout.includes(canary));
    assert.ok(!r.stdout.includes(f.dir));
    assert.ok(!r.stderr.includes(canary));
    const human = f.execute();
    assert.equal(human.status, 1);
    assert.ok(!human.stdout.includes(canary));
    assert.ok(!human.stdout.includes(f.dir));
    if (["keys", "git"].includes(scenario)) {
      assert.equal(report.keySeparation.detectedViolations.length, 1);
      assert.equal(report.keySeparation.verified, false);
    }
    const {
      validateVolumeEncryptionReport,
    } = require("./check-launch-readiness");
    assert.equal(validateVolumeEncryptionReport(report), false);
  });
test("large finite failed scan JSON drains completely", (t) => {
  const f = installation(t);
  for (let i = 0; i < 1800; i++)
    fs.writeFileSync(
      path.join(f.dir, "backups", `fixture-${i}.key`),
      "fixture",
    );
  const r = f.execute(["--json"]);
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stdout.length > 65536);
  const report = JSON.parse(r.stdout);
  assert.equal(report.keySeparation.detectedViolations.length, 1800);
  assert.equal(report.errors.length, 1800);
});
test("declaration predicates and exports match predecessor on well-formed fixtures", (t) => {
  const f = installation(t),
    oldFile = path.join(path.dirname(f.script), "baseline.js");
  const old = spawnSync(
    "/usr/bin/git",
    ["show", "963de07:scripts/ops/verify-volume-encryption.js"],
    {
      cwd: __dirname,
      encoding: "utf8",
      timeout: 8000,
      env: { PATH: "/usr/bin:/bin" },
    },
  );
  assert.equal(old.status, 0, old.stderr);
  fs.writeFileSync(oldFile, old.stdout);
  const baseline = require(oldFile);
  const original = yaml.load(fs.readFileSync(f.compose, "utf8")),
    env = parseEnv(fs.readFileSync(f.envFile, "utf8"));
  const cases = [
    () => {},
    (d) => delete d.services.postgres,
    (d) => delete d.services.valkey.volumes,
    (d) => (d.services.garage.volumes = ["/plain:/var/lib/garage/data"]),
    (d) =>
      d.services.postgres.volumes.push(
        "${OTHER_MOUNT}:/var/lib/postgresql/data",
      ),
  ];
  for (const mutate of cases) {
    const d = structuredClone(original);
    mutate(d);
    const params = {
      compose: d,
      env,
      options: { checkGit: false, scanBackups: false, scanEnvMounts: false },
    };
    assert.deepEqual(
      validateVolumeEncryption(params),
      baseline.validateVolumeEncryption(params),
    );
  }
  for (const mechanism of [
    "LUKS2",
    "aws:kms",
    "none",
    "__REQUIRED_MECHANISM__",
  ]) {
    const params = {
      compose: original,
      env: { ...env, PRODUCTION_VOLUME_ENCRYPTION: mechanism },
      options: { checkGit: false, scanBackups: false, scanEnvMounts: false },
    };
    assert.deepEqual(
      validateVolumeEncryption(params),
      baseline.validateVolumeEncryption(params),
    );
  }
  assert.deepEqual(
    Object.keys(require("./verify-volume-encryption")).sort(),
    Object.keys(baseline).sort(),
  );
});

for (const mutate of [
  (d) => (d.services = null),
  (d) => (d.services = []),
  (d) => (d.services.postgres = null),
  (d) => (d.services.postgres.volumes = {}),
  (d) => (d.services.postgres.volumes = [null]),
  (d) =>
    (d.services.postgres.volumes = [
      { source: {}, target: "/var/lib/postgresql" },
    ]),
  (d) => (d.services.postgres.volumes = [{ source: "private", target: [] }]),
  (d) => (d.extra = d),
])
  test(`malformed Compose structures reject before scans ${mutate}`, () => {
    const d = yaml.load(fs.readFileSync(REFERENCE_COMPOSE_PATH, "utf8"));
    mutate(d);
    const r = validateVolumeEncryption({
      compose: d,
      env: "",
      options: { checkGit: false, scanBackups: false, scanEnvMounts: false },
    });
    assert.equal(r.valid, false);
    assert.deepEqual(r.evaluatedMounts, []);
    assert.deepEqual(r.errors, ["Invalid volume configuration"]);
  });
for (const fault of [
  "mkdir",
  "lstat",
  "staging-symlink",
  "source-truncation",
  "source-replacement",
  "private-extra-field",
  "invalid-scan-count",
])
  test(`additional source/publication boundary ${fault}`, (t) => {
    const f = installation(t),
      hooks = {
        mkdir: `fs.mkdirSync=()=>{throw Error('CanaryPrivate')};`,
        lstat: `fs.lstatSync=()=>{throw Error('CanaryPrivate')};`,
        "staging-symlink": `const old=fs.openSync;fs.openSync=(p,...a)=>{if(String(p).endsWith('.tmp')&&a[0]===(fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK)){fs.renameSync(p,p+'.owned');fs.symlinkSync(p+'.owned',p);}return old(p,...a)};`,
        "source-truncation": `const old=fs.readSync;let once=true;fs.readSync=(fd,...a)=>{const n=old(fd,...a);if(once&&n>0){once=false;fs.truncateSync(path.join(base,'infra/compose/docker-compose.production.example.yml'),0);}return n};`,
        "source-replacement": `const old=fs.openSync;fs.openSync=(p,...a)=>{if(String(p).endsWith('.yml')){fs.renameSync(p,p+'.old');fs.writeFileSync(p,'services: {}');}return old(p,...a)};`,
        "private-extra-field": `const old=JSON.stringify;JSON.stringify=(v,...a)=>old(v?.drill_type?{...v,private:'CanaryPrivate'}:v,...a);`,
        "invalid-scan-count": `const old=JSON.stringify;JSON.stringify=(v,...a)=>old(v?.drill_type?{...v,keySeparation:{...v.keySeparation,verified:false}}:v,...a);`,
      };
    const out =
      fault === "mkdir" ? path.join(f.cwd, "new/evidence.json") : f.output;
    const r = f.execute(["--json", "--output", out], hooks[fault]);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
    assert.ok(!r.stderr.includes("CanaryPrivate"));
    assert.equal(fs.existsSync(out), false);
    if (fault === "staging-symlink")
      assert.ok(
        fs
          .readdirSync(f.cwd)
          .some(
            (p) =>
              p.endsWith(".tmp") &&
              fs.lstatSync(path.join(f.cwd, p)).isSymbolicLink(),
          ),
      );
  });
