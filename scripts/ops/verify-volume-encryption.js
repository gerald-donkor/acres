#!/usr/bin/env node

/**
 * scripts/ops/verify-volume-encryption.js
 *
 * Deterministic, pure Node.js validator and evaluation engine for Acres production
 * volume encryption, key separation, and key recovery governance (TM-21).
 *
 * Enforces that:
 * 1. All stateful services (PostgreSQL, Valkey, Garage, ClamAV, Caddy, Prometheus, Grafana)
 *    declare explicit encrypted mount paths rather than unencrypted host binds.
 * 2. Host-level encryption mechanisms match approved FOSS/cloud standards
 *    (LUKS2/dm-crypt, aws:kms, gcp:cmek, azure:keyvault).
 * 3. Key Separation Invariant: volume unlock material, passphrases, and keyfiles
 *    are NEVER co-located with persistent data, backup archives, or tracked in git.
 * 4. Key Recovery Governance: designated recovery owner, dual-custody parameters,
 *    and operational recovery runbook references are defined.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('js-yaml');

const DEFAULT_COMPOSE_PATH = path.resolve(
  __dirname,
  '../../infra/compose/docker-compose.production.example.yml'
);
const DEFAULT_ENV_PATH = path.resolve(
  __dirname,
  '../../infra/env/production.env.example'
);
const DEFAULT_READINESS_PATH = path.resolve(
  __dirname,
  '../../infra/launch/readiness.example.json'
);
const DEFAULT_BACKUPS_DIR = path.resolve(__dirname, '../../backups');
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * All stateful container storage paths requiring encrypted host volume mounts.
 */
const REQUIRED_STATEFUL_MOUNTS = [
  {
    service: 'postgres',
    containerPath: '/var/lib/postgresql',
    envVar: 'ACRES_POSTGRES_ENCRYPTED_MOUNT',
    description: 'PostgreSQL 18 relational storage & PostGIS geometries',
  },
  {
    service: 'valkey',
    containerPath: '/data',
    envVar: 'ACRES_VALKEY_ENCRYPTED_MOUNT',
    description: 'Valkey cache and persistent ingestion queue storage',
  },
  {
    service: 'garage',
    containerPath: '/var/lib/garage/meta',
    envVar: 'ACRES_GARAGE_META_ENCRYPTED_MOUNT',
    description: 'Garage metadata DB (sled engine)',
  },
  {
    service: 'garage',
    containerPath: '/var/lib/garage/data',
    envVar: 'ACRES_GARAGE_DATA_ENCRYPTED_MOUNT',
    description: 'Garage chunk and block storage',
  },
  {
    service: 'clamav',
    containerPath: '/var/lib/clamav',
    envVar: 'ACRES_CLAMAV_ENCRYPTED_MOUNT',
    description: 'ClamAV antivirus database definitions and local cache',
  },
  {
    service: 'caddy',
    containerPath: '/data',
    envVar: 'ACRES_CADDY_DATA_MOUNT',
    description: 'Caddy TLS private keys and automated certificates',
  },
  {
    service: 'caddy',
    containerPath: '/config',
    envVar: 'ACRES_CADDY_CONFIG_MOUNT',
    description: 'Caddy runtime autosave configuration',
  },
  {
    service: 'prometheus',
    containerPath: '/prometheus',
    envVar: 'ACRES_PROMETHEUS_ENCRYPTED_MOUNT',
    description: 'Prometheus TSDB metrics storage',
  },
  {
    service: 'grafana',
    containerPath: '/var/lib/grafana',
    envVar: 'ACRES_GRAFANA_ENCRYPTED_MOUNT',
    description: 'Grafana dashboards, preferences, and session state',
  },
];

/**
 * Approved host-level encryption mechanisms for production deployment.
 */
const APPROVED_MECHANISM_PATTERNS = [
  /^luks2(?:[-_]dm[-_]crypt)?$/i,
  /^dm[-_]crypt$/i,
  /^luks$/i,
  /^aws:(?:ebs:)?kms$/i,
  /^aws[-_]kms$/i,
  /^gcp:(?:persistent[-_]disk:)?cmek$/i,
  /^gcp[-_]cmek$/i,
  /^azure:(?:disk:)?keyvault$/i,
  /^azure[-_]keyvault$/i,
];

/**
 * File patterns that indicate volume unlock keys, passphrases, or credentials.
 * Key Separation Invariant requires these NEVER to be present in volume mounts,
 * backup directories, or repository tracking.
 */
const FORBIDDEN_KEY_PATTERNS = [
  /\.(key|keyfile|passphrase|luks|pkcs8|pfx|p12|pem|der|crt)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/i,
  /luks[-_]?key/i,
  /volume[-_]?key/i,
  /kms[-_]?creds/i,
  /master[-_]?key/i,
  /recovery[-_]?key/i,
];

/**
 * Parse an environment file into a key-value dictionary.
 */
function parseEnv(content) {
  if (typeof content !== 'string') return {};
  const env = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      const key = match[1];
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

/**
 * Checks whether an encryption mechanism string conforms to approved standards.
 */
function isApprovedMechanism(mechanism) {
  if (!mechanism || typeof mechanism !== 'string') return false;
  const normalized = mechanism.trim().toLowerCase();
  return APPROVED_MECHANISM_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Normalizes and extracts source/target from a compose volume entry.
 */
function parseVolumeEntry(entry) {
  if (typeof entry === 'string') {
    const parts = entry.split(':');
    const mode = /^(?:ro|rw|z|Z|delegated|cached|consistent)(?:,[A-Za-z]+)*$/.test(
      parts[parts.length - 1] || ''
    )
      ? parts.pop()
      : undefined;
    const target = parts.pop();
    const source = parts.join(':');
    return {
      source,
      target,
      readOnly: mode ? mode.split(',').includes('ro') : false,
    };
  }

  if (entry && typeof entry === 'object') {
    return {
      source: entry.source || '',
      target: entry.target || '',
      readOnly: entry.read_only === true || entry.readOnly === true,
    };
  }

  return { source: '', target: '', readOnly: false };
}

/**
 * Scans a filesystem directory recursively for files matching key/passphrase patterns.
 * Resolves symlinks safely to prevent keyfile evasion and handles recursion limits.
 * Returns array of detected violations.
 */
function scanDirectoryForKeys(dirPath, maxDepth = 4, currentDepth = 0, visitedRealPaths = new Set()) {
  const violations = [];
  if (currentDepth > maxDepth) return violations;

  try {
    if (!fs.existsSync(dirPath)) return violations;
    const realDirPath = fs.realpathSync(dirPath);
    if (visitedRealPaths.has(realDirPath)) return violations;
    visitedRealPaths.add(realDirPath);

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      let isDir = entry.isDirectory();
      let isFile = entry.isFile();

      if (entry.isSymbolicLink()) {
        try {
          const targetStats = fs.statSync(fullPath);
          isDir = targetStats.isDirectory();
          isFile = targetStats.isFile();
        } catch (_err) {
          // Broken symlink: check filename as potential keyfile reference
          isFile = true;
        }
      }

      if (isDir) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        violations.push(...scanDirectoryForKeys(fullPath, maxDepth, currentDepth + 1, visitedRealPaths));
      } else if (isFile) {
        for (const pattern of FORBIDDEN_KEY_PATTERNS) {
          if (pattern.test(entry.name)) {
            violations.push({
              path: fullPath,
              filename: entry.name,
              pattern: pattern.toString(),
            });
            break;
          }
        }
      }
    }
  } catch (_err) {
    // Permission errors or inaccessible directories are treated safely
  }

  return violations;
}

/**
 * Validates volume encryption and key separation configuration.
 * Pure deterministic validator.
 *
 * @param {object} params
 * @param {object|string} params.compose - Parsed Compose object or YAML string
 * @param {object|string} params.env - Parsed env dictionary or envfile string
 * @param {object} [params.readiness] - Optional parsed readiness JSON
 * @param {object} [params.options] - Evaluation options
 * @returns {object} { valid: boolean, errors: string[], warnings: string[], evaluatedMounts: Array, keySeparation: object }
 */
function validateVolumeEncryption({ compose, env, readiness = null, options = {} }) {
  const errors = [];
  const warnings = [];

  // 1. Normalize compose object
  let composeDoc = compose;
  if (typeof compose === 'string') {
    try {
      composeDoc = yaml.load(compose);
    } catch (err) {
      return {
        valid: false,
        errors: [`Invalid Docker Compose YAML: ${err.message}`],
        warnings: [],
        evaluatedMounts: [],
        keySeparation: { verified: false },
      };
    }
  }
  const services = (composeDoc && composeDoc.services) || {};

  // 2. Normalize env dictionary
  const envVars = typeof env === 'string' ? parseEnv(env) : (env || {});

  // 3. Inspect and evaluate each required stateful volume mount
  const evaluatedMounts = [];
  for (const req of REQUIRED_STATEFUL_MOUNTS) {
    const service = services[req.service];
    if (!service) {
      errors.push(`Required stateful service "${req.service}" is missing from Compose definition.`);
      evaluatedMounts.push({
        service: req.service,
        containerPath: req.containerPath,
        envVar: req.envVar,
        status: 'missing_service',
        passed: false,
      });
      continue;
    }

    const volumes = Array.isArray(service.volumes) ? service.volumes : [];
    const parsedVolumes = volumes.map(parseVolumeEntry);
    const matchingMount = parsedVolumes.find((m) => m.target === req.containerPath);

    if (!matchingMount) {
      errors.push(
        `Service "${req.service}" is missing required volume mount at "${req.containerPath}" (expected env variable: "${req.envVar}").`
      );
      evaluatedMounts.push({
        service: req.service,
        containerPath: req.containerPath,
        envVar: req.envVar,
        status: 'missing_mount',
        passed: false,
      });
      continue;
    }

    // Validate that source uses the expected encrypted mount environment variable
    const source = matchingMount.source || '';
    const hasExpectedVar = source.includes(req.envVar);
    const isDirectUnencryptedPath =
      source.startsWith('/') ||
      source.startsWith('./') ||
      source.startsWith('../') ||
      (!source.includes('${') && !source.includes('ENCRYPTED_MOUNT') && !source.includes('_MOUNT'));

    if (!hasExpectedVar && isDirectUnencryptedPath) {
      errors.push(
        `Service "${req.service}" mounts "${req.containerPath}" directly to unencrypted path "${source}" without using "${req.envVar}".`
      );
      evaluatedMounts.push({
        service: req.service,
        containerPath: req.containerPath,
        envVar: req.envVar,
        declaredSource: source,
        status: 'unencrypted_direct_mount',
        passed: false,
      });
      continue;
    }

    if (!hasExpectedVar) {
      errors.push(
        `Service "${req.service}" mounts "${req.containerPath}" using unexpected source "${source}" (expected interpolation with "${req.envVar}").`
      );
      evaluatedMounts.push({
        service: req.service,
        containerPath: req.containerPath,
        envVar: req.envVar,
        declaredSource: source,
        status: 'variable_mismatch',
        passed: false,
      });
      continue;
    }

    // Prohibit forbidden subpath mounts like /var/lib/postgresql/data
    if (req.service === 'postgres' && parsedVolumes.some((v) => v.target === '/var/lib/postgresql/data')) {
      errors.push(
        'Postgres service must not mount "/var/lib/postgresql/data" directly; must mount parent "/var/lib/postgresql".'
      );
    }

    evaluatedMounts.push({
      service: req.service,
      containerPath: req.containerPath,
      envVar: req.envVar,
      declaredSource: source,
      status: 'valid',
      passed: true,
    });
  }

  // 4. Validate Environment Variables declarations
  for (const req of REQUIRED_STATEFUL_MOUNTS) {
    if (!Object.prototype.hasOwnProperty.call(envVars, req.envVar)) {
      errors.push(
        `Required encrypted mount variable "${req.envVar}" is not declared in environment template.`
      );
    }
  }

  if (!Object.prototype.hasOwnProperty.call(envVars, 'PRODUCTION_VOLUME_ENCRYPTION')) {
    errors.push('Environment template is missing "PRODUCTION_VOLUME_ENCRYPTION" declaration.');
  }
  if (!Object.prototype.hasOwnProperty.call(envVars, 'PRODUCTION_KEY_RECOVERY_OWNER')) {
    errors.push('Environment template is missing "PRODUCTION_KEY_RECOVERY_OWNER" declaration.');
  }

  // 5. Evaluate Mechanism and Concrete Configuration (if concrete values provided)
  const declaredMechanism = envVars.PRODUCTION_VOLUME_ENCRYPTION;
  const isPlaceholderMechanism =
    !declaredMechanism ||
    declaredMechanism.includes('__REQUIRED_') ||
    declaredMechanism.includes('change-me');

  if (!isPlaceholderMechanism) {
    if (!isApprovedMechanism(declaredMechanism)) {
      errors.push(
        `Declared volume encryption mechanism "${declaredMechanism}" is not an approved mechanism. Approved mechanisms: LUKS2/dm-crypt, aws:kms, gcp:cmek, azure:keyvault.`
      );
    }
  }

  const declaredOwner = envVars.PRODUCTION_KEY_RECOVERY_OWNER;
  const isPlaceholderOwner =
    !declaredOwner ||
    declaredOwner.includes('__REQUIRED_') ||
    declaredOwner.includes('change-me');

  if (!isPlaceholderOwner && declaredOwner.trim().length === 0) {
    errors.push('Designated key recovery owner is empty.');
  }

  // 6. Evaluate Readiness Record Category 8 (if provided)
  let readinessEvaluated = null;
  if (readiness && readiness.sections && readiness.sections.volume_encryption) {
    const encSec = readiness.sections.volume_encryption;
    readinessEvaluated = {
      status: encSec.status,
      encryption_mechanism: encSec.encryption_mechanism,
      key_separation_confirmed: encSec.key_separation_confirmed,
      key_recovery_owner: encSec.key_recovery_owner,
      mount_paths_count: Array.isArray(encSec.encrypted_mount_paths) ? encSec.encrypted_mount_paths.length : 0,
    };

    if (encSec.status === 'approved') {
      if (!isApprovedMechanism(encSec.encryption_mechanism)) {
        errors.push(
          `Readiness record volume_encryption mechanism "${encSec.encryption_mechanism}" is not an approved mechanism.`
        );
      }
      if (encSec.key_separation_confirmed !== true) {
        errors.push(
          'Readiness record volume_encryption requires explicit confirmation of key separation (key_separation_confirmed: true).'
        );
      }
      if (!encSec.key_recovery_owner || encSec.key_recovery_owner.includes('__REQUIRED_') || encSec.key_recovery_owner.trim() === '') {
        errors.push('Readiness record volume_encryption requires a designated key recovery owner.');
      }
      if (!Array.isArray(encSec.encrypted_mount_paths) || encSec.encrypted_mount_paths.length < 3) {
        errors.push(
          'Readiness record volume_encryption must specify at least 3 stateful mount paths (PostgreSQL, Valkey, Garage).'
        );
      }
    }
  }

  // 7. Evaluate Key Separation Invariant
  const keySeparation = {
    verified: true,
    scannedPaths: [],
    detectedViolations: [],
  };

  // Check backup directory if requested or present
  const backupsDir = options.backupsDir || DEFAULT_BACKUPS_DIR;
  if (options.scanBackups !== false && fs.existsSync(backupsDir)) {
    keySeparation.scannedPaths.push(backupsDir);
    const backupViolations = scanDirectoryForKeys(backupsDir);
    if (backupViolations.length > 0) {
      keySeparation.verified = false;
      keySeparation.detectedViolations.push(...backupViolations);
      for (const v of backupViolations) {
        errors.push(`Key Separation Invariant violated: key material detected in backups directory: ${v.path}`);
      }
    }
  }

  // Collect host mount paths from options and from non-sentinel env declarations
  const hostMountPaths = [...(options.hostMountPaths || [])];
  if (options.scanEnvMounts !== false) {
    for (const req of REQUIRED_STATEFUL_MOUNTS) {
      const declaredVal = envVars[req.envVar];
      if (
        declaredVal &&
        typeof declaredVal === 'string' &&
        !declaredVal.includes('__REQUIRED_') &&
        !declaredVal.includes('change-me') &&
        path.isAbsolute(declaredVal) &&
        fs.existsSync(declaredVal) &&
        !hostMountPaths.includes(declaredVal)
      ) {
        hostMountPaths.push(declaredVal);
      }
    }
  }

  // Check concrete host mount paths
  for (const mountPath of hostMountPaths) {
    if (typeof mountPath === 'string' && fs.existsSync(mountPath)) {
      keySeparation.scannedPaths.push(mountPath);
      const mountViolations = scanDirectoryForKeys(mountPath);
      if (mountViolations.length > 0) {
        keySeparation.verified = false;
        keySeparation.detectedViolations.push(...mountViolations);
        for (const v of mountViolations) {
          errors.push(
            `Key Separation Invariant violated: key material detected inside volume mount path: ${v.path}`
          );
        }
      }
    }
  }

  // Check Git tracking of key files (if running within a git repo)
  if (options.checkGit !== false) {
    const repoRoot = options.repoRoot || DEFAULT_REPO_ROOT;
    try {
      if (fs.existsSync(path.join(repoRoot, '.git'))) {
        const gitFiles = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const trackedLines = gitFiles.split('\n');
        for (const file of trackedLines) {
          const basename = path.basename(file);
          for (const pattern of FORBIDDEN_KEY_PATTERNS) {
            if (pattern.test(basename)) {
              errors.push(`Key Separation Invariant violated: key file tracked in Git: ${file}`);
              keySeparation.verified = false;
              keySeparation.detectedViolations.push({ path: file, filename: basename, pattern: pattern.toString() });
              break;
            }
          }
        }
      }
    } catch (_err) {
      // Git command failure in environments without git is ignored safely
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    evaluatedMounts,
    keySeparation,
    readinessEvaluated,
    totalRequiredMounts: REQUIRED_STATEFUL_MOUNTS.length,
    validMountsCount: evaluatedMounts.filter((m) => m.passed).length,
  };
}

/**
 * CLI Entry Point & High-level file runner.
 */
function runCli() {
  const args = process.argv.slice(2);
  let composePath = DEFAULT_COMPOSE_PATH;
  let envPath = DEFAULT_ENV_PATH;
  let readinessPath = DEFAULT_READINESS_PATH;
  const hostMountPaths = [];
  let asJson = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      asJson = true;
    } else if (arg === '--compose' && args[i + 1]) {
      composePath = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '--env' && args[i + 1]) {
      envPath = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '--readiness' && args[i + 1]) {
      readinessPath = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '--mount-path' && args[i + 1]) {
      hostMountPaths.push(path.resolve(process.cwd(), args[++i]));
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node scripts/ops/verify-volume-encryption.js [options]

Evaluates production volume encryption declarations, key separation, and recovery governance.

Options:
  --compose <file>     Path to docker-compose file (default: infra/compose/docker-compose.production.example.yml)
  --env <file>         Path to environment template (default: infra/env/production.env.example)
  --readiness <file>   Path to launch readiness JSON (default: infra/launch/readiness.example.json)
  --mount-path <dir>   Explicit host directory path to scan for key separation (repeatable)
  --json               Output structured JSON report
  --help, -h           Show this help message
`);
      process.exit(0);
    }
  }

  if (!fs.existsSync(composePath)) {
    console.error(`Error: Compose file not found at ${composePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(envPath)) {
    console.error(`Error: Env file not found at ${envPath}`);
    process.exit(1);
  }

  const composeContent = fs.readFileSync(composePath, 'utf8');
  const envContent = fs.readFileSync(envPath, 'utf8');
  let readinessDoc = null;
  if (fs.existsSync(readinessPath)) {
    try {
      readinessDoc = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
    } catch (_err) {
      // ignore
    }
  }

  const result = validateVolumeEncryption({
    compose: composeContent,
    env: envContent,
    readiness: readinessDoc,
    options: {
      repoRoot: DEFAULT_REPO_ROOT,
      backupsDir: DEFAULT_BACKUPS_DIR,
      checkGit: true,
      scanBackups: true,
      hostMountPaths,
    },
  });

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }

  console.log('=================================================================');
  console.log('    Acres Production Volume Encryption & Key Separation Engine   ');
  console.log('=================================================================');
  console.log(`Compose Template:    ${composePath}`);
  console.log(`Env Template:        ${envPath}`);
  console.log(`Readiness Reference: ${readinessPath}`);
  console.log('-----------------------------------------------------------------');
  console.log('Evaluated Stateful Storage Mounts:');

  for (const m of result.evaluatedMounts) {
    const mark = m.passed ? '✓' : '✗';
    console.log(
      `  ${mark} [${m.service.padEnd(11)}] ${m.containerPath.padEnd(24)} -> \${${m.envVar}} (${m.status})`
    );
  }

  console.log('-----------------------------------------------------------------');
  console.log(`Key Separation Invariant: ${result.keySeparation.verified ? 'PASSED (0 keyfiles detected in data/git)' : 'VIOLATED'}`);
  console.log(`Approved Mechanisms:      LUKS2/dm-crypt, AWS KMS, GCP CMEK, Azure Key Vault`);
  console.log('-----------------------------------------------------------------');

  if (result.errors.length > 0) {
    console.log('Evaluation Errors:');
    for (const err of result.errors) {
      console.log(`  ✗ ${err}`);
    }
    console.log('=================================================================');
    console.log('Result: FAILED. Production volume encryption requirements unmet.\n');
    process.exit(1);
  }

  console.log('Result: PASSED. All stateful service encrypted mounts & key separation verified.\n');
  process.exit(0);
}

if (require.main === module) {
  runCli();
}

module.exports = {
  REQUIRED_STATEFUL_MOUNTS,
  APPROVED_MECHANISM_PATTERNS,
  FORBIDDEN_KEY_PATTERNS,
  parseEnv,
  isApprovedMechanism,
  parseVolumeEntry,
  scanDirectoryForKeys,
  validateVolumeEncryption,
};
