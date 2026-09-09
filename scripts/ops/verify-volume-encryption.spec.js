const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const yaml = require('js-yaml');

const {
  REQUIRED_STATEFUL_MOUNTS,
  APPROVED_MECHANISM_PATTERNS,
  FORBIDDEN_KEY_PATTERNS,
  parseEnv,
  isApprovedMechanism,
  parseVolumeEntry,
  scanDirectoryForKeys,
  validateVolumeEncryption,
} = require('./verify-volume-encryption');

const REFERENCE_COMPOSE_PATH = path.resolve(
  __dirname,
  '../../infra/compose/docker-compose.production.example.yml'
);
const REFERENCE_ENV_PATH = path.resolve(
  __dirname,
  '../../infra/env/production.env.example'
);
const REFERENCE_READINESS_PATH = path.resolve(
  __dirname,
  '../../infra/launch/readiness.example.json'
);

test('verifyVolumeEncryption: reference templates pass cleanly with 9/9 valid mounts', () => {
  const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, 'utf8');
  const envText = fs.readFileSync(REFERENCE_ENV_PATH, 'utf8');
  const readiness = JSON.parse(fs.readFileSync(REFERENCE_READINESS_PATH, 'utf8'));

  const result = validateVolumeEncryption({
    compose: composeText,
    env: envText,
    readiness,
    options: {
      checkGit: false,
      scanBackups: false,
    },
  });

  assert.equal(result.valid, true, `Expected valid result, but got errors: ${result.errors.join(', ')}`);
  assert.equal(result.errors.length, 0);
  assert.equal(result.totalRequiredMounts, 9);
  assert.equal(result.validMountsCount, 9);
  assert.equal(result.evaluatedMounts.length, 9);
  assert.ok(result.evaluatedMounts.every((m) => m.passed === true));
});

test('verifyVolumeEncryption: fails closed when a stateful service lacks an encrypted mount', () => {
  const composeDoc = yaml.load(fs.readFileSync(REFERENCE_COMPOSE_PATH, 'utf8'));
  const envText = fs.readFileSync(REFERENCE_ENV_PATH, 'utf8');

  // Remove postgres volumes
  delete composeDoc.services.postgres.volumes;

  const result = validateVolumeEncryption({
    compose: composeDoc,
    env: envText,
    options: { checkGit: false, scanBackups: false },
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('Service "postgres" is missing required volume mount at "/var/lib/postgresql"')));
});

test('verifyVolumeEncryption: fails closed when an unencrypted direct host path is mounted', () => {
  const composeDoc = yaml.load(fs.readFileSync(REFERENCE_COMPOSE_PATH, 'utf8'));
  const envText = fs.readFileSync(REFERENCE_ENV_PATH, 'utf8');

  // Replace valkey encrypted mount with direct unencrypted host path
  composeDoc.services.valkey.volumes = ['/var/data/valkey:/data'];

  const result = validateVolumeEncryption({
    compose: composeDoc,
    env: envText,
    options: { checkGit: false, scanBackups: false },
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.includes('mounts "/data" directly to unencrypted path "/var/data/valkey"')),
    'Expected error for direct unencrypted mount'
  );
});

test('verifyVolumeEncryption: fails closed when postgres mounts forbidden subpath /var/lib/postgresql/data', () => {
  const composeDoc = yaml.load(fs.readFileSync(REFERENCE_COMPOSE_PATH, 'utf8'));
  const envText = fs.readFileSync(REFERENCE_ENV_PATH, 'utf8');

  // Add forbidden subpath mount
  composeDoc.services.postgres.volumes.push(
    '${ACRES_POSTGRES_DATA_MOUNT}:/var/lib/postgresql/data'
  );

  const result = validateVolumeEncryption({
    compose: composeDoc,
    env: envText,
    options: { checkGit: false, scanBackups: false },
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.includes('must not mount "/var/lib/postgresql/data" directly')),
    'Expected error for forbidden subpath mount'
  );
});

test('verifyVolumeEncryption: fails closed when an encrypted mount env variable is missing from environment template', () => {
  const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, 'utf8');
  const env = parseEnv(fs.readFileSync(REFERENCE_ENV_PATH, 'utf8'));

  // Delete an encrypted mount definition
  delete env.ACRES_GARAGE_DATA_ENCRYPTED_MOUNT;

  const result = validateVolumeEncryption({
    compose: composeText,
    env,
    options: { checkGit: false, scanBackups: false },
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.includes('variable "ACRES_GARAGE_DATA_ENCRYPTED_MOUNT" is not declared')),
    'Expected error for missing env declaration'
  );
});

test('isApprovedMechanism: correctly validates approved and unapproved mechanisms', () => {
  // Approved
  assert.equal(isApprovedMechanism('LUKS2'), true);
  assert.equal(isApprovedMechanism('luks2-dm-crypt'), true);
  assert.equal(isApprovedMechanism('dm-crypt'), true);
  assert.equal(isApprovedMechanism('aws:kms'), true);
  assert.equal(isApprovedMechanism('aws-kms'), true);
  assert.equal(isApprovedMechanism('aws:ebs:kms'), true);
  assert.equal(isApprovedMechanism('gcp:cmek'), true);
  assert.equal(isApprovedMechanism('gcp:persistent-disk:cmek'), true);
  assert.equal(isApprovedMechanism('azure:keyvault'), true);
  assert.equal(isApprovedMechanism('azure-keyvault'), true);

  // Unapproved / Insecure
  assert.equal(isApprovedMechanism('plaintext'), false);
  assert.equal(isApprovedMechanism('none'), false);
  assert.equal(isApprovedMechanism('aes-ecb'), false);
  assert.equal(isApprovedMechanism('rot13'), false);
  assert.equal(isApprovedMechanism(''), false);
  assert.equal(isApprovedMechanism(null), false);
  assert.equal(isApprovedMechanism(undefined), false);
});

test('verifyVolumeEncryption: fails closed on unapproved concrete encryption mechanism', () => {
  const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, 'utf8');
  const env = parseEnv(fs.readFileSync(REFERENCE_ENV_PATH, 'utf8'));

  env.PRODUCTION_VOLUME_ENCRYPTION = 'proprietary-unverified-crypto';

  const result = validateVolumeEncryption({
    compose: composeText,
    env,
    options: { checkGit: false, scanBackups: false },
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.includes('is not an approved mechanism')),
    'Expected error for unapproved mechanism'
  );
});

test('verifyVolumeEncryption: fails closed when key recovery owner is empty in concrete env', () => {
  const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, 'utf8');
  const env = parseEnv(fs.readFileSync(REFERENCE_ENV_PATH, 'utf8'));

  env.PRODUCTION_VOLUME_ENCRYPTION = 'LUKS2';
  env.PRODUCTION_KEY_RECOVERY_OWNER = '   ';

  const result = validateVolumeEncryption({
    compose: composeText,
    env,
    options: { checkGit: false, scanBackups: false },
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.includes('Designated key recovery owner is empty')),
    'Expected error for empty key recovery owner'
  );
});

test('readiness record validation: enforces key separation confirmation and owner in approved record', () => {
  const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, 'utf8');
  const envText = fs.readFileSync(REFERENCE_ENV_PATH, 'utf8');

  // Test 1: approved status with key_separation_confirmed: false
  const unconfirmedReadiness = {
    sections: {
      volume_encryption: {
        status: 'approved',
        encryption_mechanism: 'luks2-dm-crypt',
        key_separation_confirmed: false,
        key_recovery_owner: 'infra-sre-lead',
        encrypted_mount_paths: ['/mnt/postgres', '/mnt/valkey', '/mnt/garage'],
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
  assert.ok(res1.errors.some((e) => e.includes('explicit confirmation of key separation')));

  // Test 2: approved status with valid settings
  const confirmedReadiness = {
    sections: {
      volume_encryption: {
        status: 'approved',
        encryption_mechanism: 'luks2-dm-crypt',
        key_separation_confirmed: true,
        key_recovery_owner: 'infra-sre-lead',
        encrypted_mount_paths: ['/mnt/postgres', '/mnt/valkey', '/mnt/garage'],
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

test('Key Separation Invariant: detects co-located keyfiles in mount directories', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-key-sep-test-'));
  try {
    const dataSubdir = path.join(tmpDir, 'data');
    fs.mkdirSync(dataSubdir, { recursive: true });

    // Plant forbidden key file
    const plantedKeyFile = path.join(dataSubdir, 'volume-unlock.key');
    fs.writeFileSync(plantedKeyFile, 'SIMULATED_PRIVATE_KEY_MATERIAL');

    const violations = scanDirectoryForKeys(tmpDir);
    assert.ok(violations.length > 0, 'Expected to detect key file violation');
    assert.equal(violations[0].filename, 'volume-unlock.key');

    const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, 'utf8');
    const envText = fs.readFileSync(REFERENCE_ENV_PATH, 'utf8');

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
    assert.ok(result.errors.some((e) => e.includes('Key Separation Invariant violated')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Key Separation Invariant: clean directory with legitimate data files passes cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-clean-dir-test-'));
  try {
    const dataSubdir = path.join(tmpDir, 'postgres_data');
    fs.mkdirSync(dataSubdir, { recursive: true });

    fs.writeFileSync(path.join(dataSubdir, 'PG_VERSION'), '18\n');
    fs.writeFileSync(path.join(dataSubdir, 'postgresql.conf'), '# config\n');
    fs.writeFileSync(path.join(dataSubdir, 'dataset.csv'), 'id,col1\n1,val\n');

    const violations = scanDirectoryForKeys(tmpDir);
    assert.equal(violations.length, 0);

    const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, 'utf8');
    const envText = fs.readFileSync(REFERENCE_ENV_PATH, 'utf8');

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

test('parseVolumeEntry: correctly parses string and object mount declarations', () => {
  const v1 = parseVolumeEntry('/host/data:/var/lib/postgresql:rw');
  assert.equal(v1.source, '/host/data');
  assert.equal(v1.target, '/var/lib/postgresql');
  assert.equal(v1.readOnly, false);

  const v2 = parseVolumeEntry('../caddy/Caddyfile.example:/etc/caddy/Caddyfile:ro');
  assert.equal(v2.source, '../caddy/Caddyfile.example');
  assert.equal(v2.target, '/etc/caddy/Caddyfile');
  assert.equal(v2.readOnly, true);

  const v3 = parseVolumeEntry({
    type: 'volume',
    source: 'acres_valkey',
    target: '/data',
    read_only: false,
  });
  assert.equal(v3.source, 'acres_valkey');
  assert.equal(v3.target, '/data');
  assert.equal(v3.readOnly, false);
});

test('Key Separation Invariant: detects symlinked keyfile within mount path', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-symlink-test-'));
  try {
    const secretDir = path.join(tmpDir, 'secret_store');
    const mountDir = path.join(tmpDir, 'mount');
    fs.mkdirSync(secretDir, { recursive: true });
    fs.mkdirSync(mountDir, { recursive: true });

    // Put key in secret_store and symlink into mount
    const realKey = path.join(secretDir, 'real.key');
    fs.writeFileSync(realKey, 'TOP_SECRET_KEY');
    const symlinkKey = path.join(mountDir, 'linked.key');
    fs.symlinkSync(realKey, symlinkKey);

    const violations = scanDirectoryForKeys(mountDir);
    assert.ok(violations.length > 0, 'Expected violation for symlinked keyfile');
    assert.equal(violations[0].filename, 'linked.key');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Key Separation Invariant: fails closed when keyfile is detected in backupsDir', () => {
  const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-backups-test-'));
  try {
    fs.writeFileSync(path.join(tmpBackups, 'leak.passphrase'), 'PASS');

    const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, 'utf8');
    const envText = fs.readFileSync(REFERENCE_ENV_PATH, 'utf8');

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
    assert.ok(result.errors.some((e) => e.includes('key material detected in backups directory')));
  } finally {
    fs.rmSync(tmpBackups, { recursive: true, force: true });
  }
});

test('Key Separation Invariant: checkGit clean repository validation', () => {
  const composeText = fs.readFileSync(REFERENCE_COMPOSE_PATH, 'utf8');
  const envText = fs.readFileSync(REFERENCE_ENV_PATH, 'utf8');

  const result = validateVolumeEncryption({
    compose: composeText,
    env: envText,
    options: {
      checkGit: true,
      scanBackups: false,
    },
  });

  // Since current repo git does not track any keyfiles, checkGit must succeed
  assert.equal(result.keySeparation.verified, true);
});
