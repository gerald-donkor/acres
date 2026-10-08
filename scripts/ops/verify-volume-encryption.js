#!/usr/bin/env node

/**
 * scripts/ops/verify-volume-encryption.js
 *
 * Configuration preflight for declared mounts, encryption mechanism and recovery
 * owner, with limited local filename scans (TM-21). Every CLI receipt is simulation.
 * It does not inspect host encryption, establish absence of all unlock material,
 * verify dual custody, or test recovery. The verified fields qualify preflight only.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const yaml = require("js-yaml");
const crypto = require("node:crypto");

const DEFAULT_COMPOSE_PATH = path.resolve(
  __dirname,
  "../../infra/compose/docker-compose.production.example.yml",
);
const DEFAULT_ENV_PATH = path.resolve(
  __dirname,
  "../../infra/env/production.env.example",
);
const DEFAULT_READINESS_PATH = path.resolve(
  __dirname,
  "../../infra/launch/readiness.example.json",
);
const DEFAULT_BACKUPS_DIR = path.resolve(__dirname, "../../backups");
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "../..");

/**
 * All stateful container storage paths requiring encrypted host volume mounts.
 */
const REQUIRED_STATEFUL_MOUNTS = [
  {
    service: "postgres",
    containerPath: "/var/lib/postgresql",
    envVar: "ACRES_POSTGRES_ENCRYPTED_MOUNT",
    description: "PostgreSQL 18 relational storage & PostGIS geometries",
  },
  {
    service: "valkey",
    containerPath: "/data",
    envVar: "ACRES_VALKEY_ENCRYPTED_MOUNT",
    description: "Valkey cache and persistent ingestion queue storage",
  },
  {
    service: "garage",
    containerPath: "/var/lib/garage/meta",
    envVar: "ACRES_GARAGE_META_ENCRYPTED_MOUNT",
    description: "Garage metadata DB (sled engine)",
  },
  {
    service: "garage",
    containerPath: "/var/lib/garage/data",
    envVar: "ACRES_GARAGE_DATA_ENCRYPTED_MOUNT",
    description: "Garage chunk and block storage",
  },
  {
    service: "clamav",
    containerPath: "/var/lib/clamav",
    envVar: "ACRES_CLAMAV_ENCRYPTED_MOUNT",
    description: "ClamAV antivirus database definitions and local cache",
  },
  {
    service: "caddy",
    containerPath: "/data",
    envVar: "ACRES_CADDY_DATA_MOUNT",
    description: "Caddy TLS private keys and automated certificates",
  },
  {
    service: "caddy",
    containerPath: "/config",
    envVar: "ACRES_CADDY_CONFIG_MOUNT",
    description: "Caddy runtime autosave configuration",
  },
  {
    service: "prometheus",
    containerPath: "/prometheus",
    envVar: "ACRES_PROMETHEUS_ENCRYPTED_MOUNT",
    description: "Prometheus TSDB metrics storage",
  },
  {
    service: "grafana",
    containerPath: "/var/lib/grafana",
    envVar: "ACRES_GRAFANA_ENCRYPTED_MOUNT",
    description: "Grafana dashboards, preferences, and session state",
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
  if (typeof content !== "string") return {};
  const env = {};
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      const key = match[1];
      let val = match[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
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
  if (!mechanism || typeof mechanism !== "string") return false;
  const normalized = mechanism.trim().toLowerCase();
  return APPROVED_MECHANISM_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

/**
 * Normalizes and extracts source/target from a compose volume entry.
 */
function parseVolumeEntry(entry) {
  if (typeof entry === "string") {
    const parts = entry.split(":");
    const mode =
      /^(?:ro|rw|z|Z|delegated|cached|consistent)(?:,[A-Za-z]+)*$/.test(
        parts[parts.length - 1] || "",
      )
        ? parts.pop()
        : undefined;
    const target = parts.pop();
    const source = parts.join(":");
    return {
      source,
      target,
      readOnly: mode ? mode.split(",").includes("ro") : false,
    };
  }

  if (entry && typeof entry === "object") {
    return {
      source: entry.source || "",
      target: entry.target || "",
      readOnly: entry.read_only === true || entry.readOnly === true,
    };
  }

  return { source: "", target: "", readOnly: false };
}

/**
 * Scans a filesystem directory recursively for files matching key/passphrase patterns.
 * Follows symlinks with cycle/depth limits; missing/inaccessible paths and Git
 * failures are skipped. Filename patterns also match TLS keys/certificates.
 * A clean scan is not proof of separated volume-unlock custody.
 * Returns array of detected violations.
 */
function scanDirectoryForKeys(
  dirPath,
  maxDepth = 4,
  currentDepth = 0,
  visitedRealPaths = new Set(),
) {
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
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        violations.push(
          ...scanDirectoryForKeys(
            fullPath,
            maxDepth,
            currentDepth + 1,
            visitedRealPaths,
          ),
        );
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
    // Preflight limitation: filesystem errors are suppressed, not proof of custody
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
function validateVolumeEncryption(params) {
  const invalid = () => ({
    valid: false,
    errors: ["Invalid volume configuration"],
    warnings: [],
    evaluatedMounts: [],
    keySeparation: {
      verified: false,
      scannedPaths: [],
      detectedViolations: [],
    },
    readinessEvaluated: null,
    totalRequiredMounts: 9,
    validMountsCount: 0,
  });
  if (!isRecord(params)) return invalid();
  const { compose, env, readiness = null, options = {} } = params;
  if (!validOptions(options)) return invalid();
  let composeDoc = compose;
  try {
    if (typeof compose === "string")
      composeDoc = yaml.load(compose, {
        maxDepth: 100,
        maxTotalMergeKeys: 10000,
      });
    if (!validComposeShape(composeDoc) || !validReadiness(readiness))
      return invalid();
  } catch {
    return invalid();
  }
  const envVars = typeof env === "string" ? parseEnv(env) : env;
  if (!isRecord(envVars)) return invalid();
  for (const name of [
    ...REQUIRED_STATEFUL_MOUNTS.map((m) => m.envVar),
    "PRODUCTION_VOLUME_ENCRYPTION",
    "PRODUCTION_KEY_RECOVERY_OWNER",
  ])
    if (Object.hasOwn(envVars, name) && typeof envVars[name] !== "string")
      return invalid();
  const services = composeDoc.services;
  const errors = [];
  const warnings = [];

  // 3. Inspect and evaluate each required stateful volume mount
  const evaluatedMounts = [];
  for (const req of REQUIRED_STATEFUL_MOUNTS) {
    const service = services[req.service];
    if (!service) {
      errors.push(
        `Required stateful service "${req.service}" is missing from Compose definition.`,
      );
      evaluatedMounts.push({
        service: req.service,
        containerPath: req.containerPath,
        envVar: req.envVar,
        status: "missing_service",
        passed: false,
      });
      continue;
    }

    const volumes = Array.isArray(service.volumes) ? service.volumes : [];
    const parsedVolumes = volumes.map(parseVolumeEntry);
    const matchingMount = parsedVolumes.find(
      (m) => m.target === req.containerPath,
    );

    if (!matchingMount) {
      errors.push(
        `Service "${req.service}" is missing required volume mount at "${req.containerPath}" (expected env variable: "${req.envVar}").`,
      );
      evaluatedMounts.push({
        service: req.service,
        containerPath: req.containerPath,
        envVar: req.envVar,
        status: "missing_mount",
        passed: false,
      });
      continue;
    }

    // Validate that source uses the expected encrypted mount environment variable
    const source = matchingMount.source || "";
    const hasExpectedVar = source.includes(req.envVar);
    const isDirectUnencryptedPath =
      source.startsWith("/") ||
      source.startsWith("./") ||
      source.startsWith("../") ||
      (!source.includes("${") &&
        !source.includes("ENCRYPTED_MOUNT") &&
        !source.includes("_MOUNT"));

    if (!hasExpectedVar && isDirectUnencryptedPath) {
      errors.push(
        `Service "${req.service}" mounts "${req.containerPath}" directly to unencrypted path "${source}" without using "${req.envVar}".`,
      );
      evaluatedMounts.push({
        service: req.service,
        containerPath: req.containerPath,
        envVar: req.envVar,
        declaredSource: source,
        status: "unencrypted_direct_mount",
        passed: false,
      });
      continue;
    }

    if (!hasExpectedVar) {
      errors.push(
        `Service "${req.service}" mounts "${req.containerPath}" using unexpected source "${source}" (expected interpolation with "${req.envVar}").`,
      );
      evaluatedMounts.push({
        service: req.service,
        containerPath: req.containerPath,
        envVar: req.envVar,
        declaredSource: source,
        status: "variable_mismatch",
        passed: false,
      });
      continue;
    }

    // Prohibit forbidden subpath mounts like /var/lib/postgresql/data
    if (
      req.service === "postgres" &&
      parsedVolumes.some((v) => v.target === "/var/lib/postgresql/data")
    ) {
      errors.push(
        'Postgres service must not mount "/var/lib/postgresql/data" directly; must mount parent "/var/lib/postgresql".',
      );
    }

    evaluatedMounts.push({
      service: req.service,
      containerPath: req.containerPath,
      envVar: req.envVar,
      declaredSource: source,
      status: "valid",
      passed: true,
    });
  }

  // 4. Validate Environment Variables declarations
  for (const req of REQUIRED_STATEFUL_MOUNTS) {
    if (!Object.prototype.hasOwnProperty.call(envVars, req.envVar)) {
      errors.push(
        `Required encrypted mount variable "${req.envVar}" is not declared in environment template.`,
      );
    }
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      envVars,
      "PRODUCTION_VOLUME_ENCRYPTION",
    )
  ) {
    errors.push(
      'Environment template is missing "PRODUCTION_VOLUME_ENCRYPTION" declaration.',
    );
  }
  if (
    !Object.prototype.hasOwnProperty.call(
      envVars,
      "PRODUCTION_KEY_RECOVERY_OWNER",
    )
  ) {
    errors.push(
      'Environment template is missing "PRODUCTION_KEY_RECOVERY_OWNER" declaration.',
    );
  }

  // 5. Evaluate Mechanism and Concrete Configuration (if concrete values provided)
  const declaredMechanism = envVars.PRODUCTION_VOLUME_ENCRYPTION;
  const isPlaceholderMechanism =
    !declaredMechanism ||
    declaredMechanism.includes("__REQUIRED_") ||
    declaredMechanism.includes("change-me");

  if (!isPlaceholderMechanism) {
    if (!isApprovedMechanism(declaredMechanism)) {
      errors.push(
        `Declared volume encryption mechanism "${declaredMechanism}" is not an approved mechanism. Approved mechanisms: LUKS2/dm-crypt, aws:kms, gcp:cmek, azure:keyvault.`,
      );
    }
  }

  const declaredOwner = envVars.PRODUCTION_KEY_RECOVERY_OWNER;
  const isPlaceholderOwner =
    !declaredOwner ||
    declaredOwner.includes("__REQUIRED_") ||
    declaredOwner.includes("change-me");

  if (!isPlaceholderOwner && declaredOwner.trim().length === 0) {
    errors.push("Designated key recovery owner is empty.");
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
      mount_paths_count: Array.isArray(encSec.encrypted_mount_paths)
        ? encSec.encrypted_mount_paths.length
        : 0,
    };

    if (encSec.status === "approved") {
      if (!isApprovedMechanism(encSec.encryption_mechanism)) {
        errors.push(
          `Readiness record volume_encryption mechanism "${encSec.encryption_mechanism}" is not an approved mechanism.`,
        );
      }
      if (encSec.key_separation_confirmed !== true) {
        errors.push(
          "Readiness record volume_encryption requires explicit confirmation of key separation (key_separation_confirmed: true).",
        );
      }
      if (
        !encSec.key_recovery_owner ||
        encSec.key_recovery_owner.includes("__REQUIRED_") ||
        encSec.key_recovery_owner.trim() === ""
      ) {
        errors.push(
          "Readiness record volume_encryption requires a designated key recovery owner.",
        );
      }
      if (
        !Array.isArray(encSec.encrypted_mount_paths) ||
        encSec.encrypted_mount_paths.length < 3
      ) {
        errors.push(
          "Readiness record volume_encryption must specify at least 3 stateful mount paths (PostgreSQL, Valkey, Garage).",
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
        errors.push(
          `Key Separation Invariant violated: key material detected in backups directory: ${v.path}`,
        );
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
        typeof declaredVal === "string" &&
        !declaredVal.includes("__REQUIRED_") &&
        !declaredVal.includes("change-me") &&
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
    if (typeof mountPath === "string" && fs.existsSync(mountPath)) {
      keySeparation.scannedPaths.push(mountPath);
      const mountViolations = scanDirectoryForKeys(mountPath);
      if (mountViolations.length > 0) {
        keySeparation.verified = false;
        keySeparation.detectedViolations.push(...mountViolations);
        for (const v of mountViolations) {
          errors.push(
            `Key Separation Invariant violated: key material detected inside volume mount path: ${v.path}`,
          );
        }
      }
    }
  }

  // Check Git tracking of key files (if running within a git repo)
  if (options.checkGit !== false) {
    const repoRoot = options.repoRoot || DEFAULT_REPO_ROOT;
    try {
      if (fs.existsSync(path.join(repoRoot, ".git"))) {
        const gitFiles = execSync("git ls-files", {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        });
        const trackedLines = gitFiles.split("\n");
        for (const file of trackedLines) {
          const basename = path.basename(file);
          for (const pattern of FORBIDDEN_KEY_PATTERNS) {
            if (pattern.test(basename)) {
              errors.push(
                `Key Separation Invariant violated: key file tracked in Git: ${file}`,
              );
              keySeparation.verified = false;
              keySeparation.detectedViolations.push({
                path: file,
                filename: basename,
                pattern: pattern.toString(),
              });
              break;
            }
          }
        }
      }
    } catch (_err) {
      // Preflight limitation: Git failures are ignored, not proof of custody
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

// Resource limits are engineering bounds, not operational security certification.
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_SAVED_BYTES = 1024 * 1024;
const text = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  !/[\x00-\x1f\x7f-\x9f]/.test(value);
const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const failure = (category) => new Error(`Volume ${category} failed`);

function readSource(source) {
  let fd = null;
  try {
    let initial;
    try {
      initial = fs.statSync(source);
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
    if (!initial.isFile() || initial.size > MAX_SOURCE_BYTES)
      throw failure("evaluation");
    fd = fs.openSync(source, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    const opened = fs.fstatSync(fd);
    if (
      !opened.isFile() ||
      !sameFile(initial, opened) ||
      opened.size > MAX_SOURCE_BYTES ||
      opened.size !== initial.size ||
      opened.mtimeMs !== initial.mtimeMs ||
      opened.ctimeMs !== initial.ctimeMs
    )
      throw failure("evaluation");
    const buffer = Buffer.alloc(MAX_SOURCE_BYTES + 1);
    let used = 0;
    while (used < buffer.length) {
      const n = fs.readSync(fd, buffer, used, buffer.length - used, null);
      if (!Number.isInteger(n) || n < 0 || n > buffer.length - used)
        throw failure("evaluation");
      if (n === 0) break;
      used += n;
    }
    const after = fs.fstatSync(fd);
    if (
      used > MAX_SOURCE_BYTES ||
      after.size !== used ||
      opened.mtimeMs !== after.mtimeMs ||
      opened.ctimeMs !== after.ctimeMs
    )
      throw failure("evaluation");
    return buffer.subarray(0, used).toString("utf8");
  } catch {
    throw failure("evaluation");
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        try {
          fs.closeSync(fd);
        } catch {
          /* Persistent faults require process teardown. */
        }
        throw failure("evaluation");
      }
    }
  }
}

function boundedTree(doc) {
  let budget = 10000;
  const active = new Set();
  const visit = (v, depth) => {
    if (--budget < 0 || depth > 100) return false;
    if (v === null || ["string", "boolean"].includes(typeof v)) return true;
    if (typeof v === "number") return Number.isFinite(v);
    if (!Array.isArray(v) && !isRecord(v)) return false;
    if (active.has(v)) return false;
    active.add(v);
    const ok = Object.keys(v).every((k) => visit(v[k], depth + 1));
    active.delete(v);
    return ok;
  };
  return visit(doc, 0);
}
function validOptions(o) {
  if (!isRecord(o)) return false;
  for (const k of ["checkGit", "scanBackups", "scanEnvMounts"])
    if (Object.hasOwn(o, k) && typeof o[k] !== "boolean") return false;
  for (const k of ["repoRoot", "backupsDir"])
    if (Object.hasOwn(o, k) && !text(o[k])) return false;
  return (
    !Object.hasOwn(o, "hostMountPaths") ||
    (Array.isArray(o.hostMountPaths) &&
      Array.from(o.hostMountPaths).every(text))
  );
}
function validComposeShape(doc) {
  if (!boundedTree(doc) || !isRecord(doc) || !isRecord(doc.services))
    return false;
  for (const svc of Object.values(doc.services)) {
    if (!isRecord(svc)) return false;
    if (
      Object.hasOwn(svc, "volumes") &&
      (!Array.isArray(svc.volumes) ||
        !Array.from(svc.volumes).every((v) => {
          if (typeof v === "string") return true;
          return (
            isRecord(v) &&
            ["source", "target"].every(
              (k) => !Object.hasOwn(v, k) || typeof v[k] === "string",
            )
          );
        }))
    )
      return false;
  }
  return true;
}
function validReadiness(r) {
  if (r === null) return true;
  if (!boundedTree(r) || !isRecord(r) || !isRecord(r.sections)) return false;
  if (!Object.hasOwn(r.sections, "volume_encryption")) return true;
  const e = r.sections.volume_encryption;
  if (!isRecord(e)) return false;
  for (const k of ["status", "encryption_mechanism", "key_recovery_owner"])
    if (Object.hasOwn(e, k) && typeof e[k] !== "string") return false;
  if (
    Object.hasOwn(e, "key_separation_confirmed") &&
    typeof e.key_separation_confirmed !== "boolean"
  )
    return false;
  return (
    !Object.hasOwn(e, "encrypted_mount_paths") ||
    (Array.isArray(e.encrypted_mount_paths) &&
      Array.from(e.encrypted_mount_paths).every((v) => typeof v === "string"))
  );
}
function parseArgs(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0]))
    return { help: true };
  const o = { hostMountPaths: [] };
  const flags = {
    "--compose": "compose",
    "--env": "env",
    "--readiness": "readiness",
    "--output": "output",
    "-o": "output",
    "--mount-path": "mount",
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      if (o.json) throw failure("invocation");
      o.json = true;
      continue;
    }
    const index = arg.indexOf("=");
    const flag = index < 0 ? arg : arg.slice(0, index);
    if (!Object.hasOwn(flags, flag) || (index >= 0 && flag === "-o"))
      throw failure("invocation");
    const key = flags[flag];
    if (key !== "mount" && Object.hasOwn(o, key)) throw failure("invocation");
    const value = index >= 0 ? arg.slice(index + 1) : args[++i];
    if (!text(value) || (index < 0 && value.startsWith("-")))
      throw failure("invocation");
    const resolved = path.resolve(value);
    if (
      key === "output" &&
      (value.endsWith(path.sep) || resolved === path.parse(resolved).root)
    )
      throw failure("invocation");
    if (key === "mount") o.hostMountPaths.push(resolved);
    else o[key] = resolved;
  }
  return o;
}
const SAFE_ERRORS = [
  "Required service declaration failed",
  "Required mount declaration failed",
  "Encrypted mount source declaration failed",
  "PostgreSQL parent mount policy failed",
  "Required environment declaration failed",
  "Encryption mechanism policy failed",
  "Recovery owner policy failed",
  "Readiness policy failed",
  "Key separation filename policy failed",
];
function safeError(e) {
  if (e.startsWith("Key Separation")) return SAFE_ERRORS[8];
  if (e.startsWith("Readiness record")) return SAFE_ERRORS[7];
  if (e.startsWith("Designated")) return SAFE_ERRORS[6];
  if (e.startsWith("Declared volume")) return SAFE_ERRORS[5];
  if (
    e.startsWith("Required encrypted") ||
    e.startsWith("Environment template")
  )
    return SAFE_ERRORS[4];
  if (e.startsWith("Postgres service")) return SAFE_ERRORS[3];
  if (e.includes("unencrypted path") || e.includes("unexpected source"))
    return SAFE_ERRORS[2];
  if (e.startsWith("Service ")) return SAFE_ERRORS[1];
  if (e.startsWith("Required stateful")) return SAFE_ERRORS[0];
  throw failure("serialization");
}
const STATUSES = [
  "valid",
  "missing_service",
  "missing_mount",
  "unencrypted_direct_mount",
  "variable_mismatch",
];
function projectReport(r) {
  return {
    execution_mode: "simulation",
    drill_type: "production_volume_encryption_and_key_separation",
    timestamp: new Date().toISOString(),
    status: r.valid ? "success" : "failed",
    valid: r.valid,
    errors: r.errors.map(safeError),
    warnings: [],
    totalRequiredMounts: r.totalRequiredMounts,
    validMountsCount: r.validMountsCount,
    evaluatedMounts: r.evaluatedMounts.map((m) => ({
      service: m.service,
      containerPath: m.containerPath,
      envVar: m.envVar,
      status: m.status,
      passed: m.passed,
    })),
    keySeparation: {
      verified: r.keySeparation.verified,
      scannedPaths: r.keySeparation.scannedPaths.map(
        () => "Local filename scan",
      ),
      detectedViolations: r.keySeparation.detectedViolations.map(
        () => "Forbidden filename detected",
      ),
    },
    readinessEvaluated: r.readinessEvaluated
      ? {
          ...(typeof r.readinessEvaluated.key_separation_confirmed === "boolean"
            ? {
                key_separation_confirmed:
                  r.readinessEvaluated.key_separation_confirmed,
              }
            : {}),
          mount_paths_count: r.readinessEvaluated.mount_paths_count,
        }
      : null,
  };
}
function exactKeys(value, keys) {
  return (
    isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((k) => Object.hasOwn(value, k))
  );
}
function validateReport(r) {
  if (
    !exactKeys(r, [
      "execution_mode",
      "drill_type",
      "timestamp",
      "status",
      "valid",
      "errors",
      "warnings",
      "totalRequiredMounts",
      "validMountsCount",
      "evaluatedMounts",
      "keySeparation",
      "readinessEvaluated",
    ]) ||
    !exactKeys(r.keySeparation, [
      "verified",
      "scannedPaths",
      "detectedViolations",
    ]) ||
    !Array.isArray(r.evaluatedMounts) ||
    !r.evaluatedMounts.every((m) =>
      exactKeys(m, ["service", "containerPath", "envVar", "status", "passed"]),
    )
  )
    throw failure("serialization");
  if (
    !isRecord(r) ||
    r.execution_mode !== "simulation" ||
    r.drill_type !== "production_volume_encryption_and_key_separation" ||
    typeof r.timestamp !== "string" ||
    !Number.isFinite(Date.parse(r.timestamp)) ||
    new Date(r.timestamp).toISOString() !== r.timestamp ||
    typeof r.valid !== "boolean" ||
    r.status !== (r.valid ? "success" : "failed") ||
    !Array.isArray(r.errors) ||
    !r.errors.every((e) => SAFE_ERRORS.includes(e)) ||
    !Array.isArray(r.warnings) ||
    r.warnings.length ||
    r.totalRequiredMounts !== 9 ||
    !Array.isArray(r.evaluatedMounts) ||
    r.evaluatedMounts.length !== 9 ||
    !r.evaluatedMounts.every(
      (m, i) =>
        isRecord(m) &&
        ["service", "containerPath", "envVar"].every(
          (k) => m[k] === REQUIRED_STATEFUL_MOUNTS[i][k],
        ) &&
        STATUSES.includes(m.status) &&
        typeof m.passed === "boolean" &&
        m.passed === (m.status === "valid"),
    ) ||
    r.validMountsCount !== r.evaluatedMounts.filter((m) => m.passed).length ||
    !isRecord(r.keySeparation) ||
    !Array.isArray(r.keySeparation.scannedPaths) ||
    !r.keySeparation.scannedPaths.every((p) => p === "Local filename scan") ||
    !Array.isArray(r.keySeparation.detectedViolations) ||
    !r.keySeparation.detectedViolations.every(
      (v) => v === "Forbidden filename detected",
    ) ||
    r.keySeparation.verified !==
      (r.keySeparation.detectedViolations.length === 0) ||
    r.valid !==
      (r.errors.length === 0 &&
        r.validMountsCount === 9 &&
        r.keySeparation.verified)
  )
    throw failure("serialization");
  const e = r.readinessEvaluated;
  if (
    e !== null &&
    (!isRecord(e) ||
      Object.keys(e).some(
        (k) => !["key_separation_confirmed", "mount_paths_count"].includes(k),
      ) ||
      (Object.hasOwn(e, "key_separation_confirmed") &&
        typeof e.key_separation_confirmed !== "boolean") ||
      !Number.isSafeInteger(e.mount_paths_count) ||
      e.mount_paths_count < 0)
  )
    throw failure("serialization");
}
function serializeReport(report, saving) {
  validateReport(report);
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n");
  if (saving && bytes.length > MAX_SAVED_BYTES) throw failure("serialization");
  return bytes;
}
function sameFile(a, b) {
  return a.dev === b.dev && a.ino === b.ino;
}
function statOrMissing(file) {
  try {
    return fs.lstatSync(file);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

// Record existing ancestors, then recheck identities at each publication boundary.
// This narrows ordinary substitution races, not attacks by a hostile same-UID admin.
function outputPreflight(output) {
  const parents = new Map();
  let current = path.parse(output).root;
  const root = fs.lstatSync(current);
  if (!root.isDirectory() || root.isSymbolicLink())
    throw failure("publication");
  parents.set(current, root);
  for (const part of path
    .dirname(output)
    .slice(current.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    const stat = statOrMissing(current);
    if (stat) {
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw failure("publication");
      parents.set(current, stat);
    }
  }
  if (statOrMissing(output)) throw failure("publication");
  return parents;
}

function checkParents(output, parents, create = false) {
  let current = path.parse(output).root;
  const check = () => {
    let stat = statOrMissing(current);
    if (!stat && parents.has(current)) throw failure("publication");
    if (!stat && create) {
      fs.mkdirSync(current, { mode: 0o700 });
      stat = fs.lstatSync(current);
      parents.set(current, stat);
    }
    if (
      !stat ||
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (parents.has(current) && !sameFile(stat, parents.get(current)))
    )
      throw failure("publication");
    parents.set(current, stat);
  };
  check();
  for (const part of path
    .dirname(output)
    .slice(current.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    check();
  }
}

function publishReport(output, parents, bytes) {
  const temporary = path.join(
    path.dirname(output),
    `.volume-${crypto.randomUUID()}.tmp`,
  );
  let fd = null,
    owned = null,
    readFd = null,
    cleanupFailed = false;
  const close = (reading = false) => {
    const value = reading ? readFd : fd;
    if (value !== null) {
      fs.closeSync(value);
      if (reading) readFd = null;
      else fd = null;
    }
  };
  const clean = () => {
    if (!owned && fd !== null) {
      try {
        owned = fs.fstatSync(fd);
      } catch {
        cleanupFailed = true;
      }
    }
    for (const reading of [true, false]) {
      try {
        close(reading);
      } catch {
        cleanupFailed = true;
      }
    }
    if (owned) {
      try {
        checkParents(output, parents);
        const named = statOrMissing(temporary);
        if (named && (!named.isFile() || !sameFile(named, owned)))
          throw failure("cleanup");
        if (named) fs.unlinkSync(temporary);
        owned = null; // Only release ownership after successful unlink/confirmed absence.
      } catch {
        cleanupFailed = true;
      }
    }
  };
  let operationFailed = false;
  try {
    checkParents(output, parents, true);
    if (statOrMissing(output)) throw failure("publication");
    fd = fs.openSync(
      temporary,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
    owned = fs.fstatSync(fd);
    if (!owned.isFile()) throw failure("publication");
    let offset = 0;
    while (offset < bytes.length) {
      const n = fs.writeSync(fd, bytes, offset, bytes.length - offset, null);
      if (!Number.isInteger(n) || n <= 0 || n > bytes.length - offset)
        throw failure("publication");
      offset += n;
    }
    close();
    checkParents(output, parents);
    const named = fs.lstatSync(temporary);
    if (
      !named.isFile() ||
      !sameFile(named, owned) ||
      named.size !== bytes.length ||
      named.size > MAX_SAVED_BYTES
    )
      throw failure("publication");
    readFd = fs.openSync(
      temporary,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const opened = fs.fstatSync(readFd);
    if (
      !opened.isFile() ||
      !sameFile(opened, owned) ||
      opened.size !== bytes.length
    )
      throw failure("publication");
    const actual = Buffer.alloc(bytes.length + 1);
    let used = 0;
    while (used < actual.length) {
      const n = fs.readSync(readFd, actual, used, actual.length - used, null);
      if (!Number.isInteger(n) || n < 0 || n > actual.length - used)
        throw failure("publication");
      if (n === 0) break;
      used += n;
    }
    const after = fs.fstatSync(readFd);
    if (
      used !== bytes.length ||
      after.size !== bytes.length ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs ||
      !actual.subarray(0, used).equals(bytes)
    )
      throw failure("publication");
    validateReport(JSON.parse(actual.subarray(0, used).toString("utf8")));
    close(true);
    checkParents(output, parents);
    const final = fs.lstatSync(temporary);
    if (
      !final.isFile() ||
      !sameFile(final, owned) ||
      final.size !== bytes.length ||
      final.mtimeMs !== after.mtimeMs ||
      final.ctimeMs !== after.ctimeMs
    )
      throw failure("publication");
    fs.linkSync(temporary, output); // Atomic exclusive publication; no overwrite fallback.
  } catch {
    operationFailed = true;
  } finally {
    clean();
    // Retain ownership when a cleanup operation fails; retry only our resources once.
    if (fd !== null || readFd !== null || owned !== null) clean();
  }
  if (cleanupFailed) throw failure("cleanup");
  if (operationFailed) throw failure("publication");
}

const HELP = `Usage: scripts/ops/verify-volume-encryption.js [options]
  --json                 Print one complete simulation report
  --compose FILE         Compose source (installed repository default)
  --env FILE             Environment source (installed repository default)
  --readiness FILE       Readiness source (absent default is optional)
  --mount-path DIR       Local filename scan path (repeatable)
  --output, -o FILE      Save to a fresh absent destination, at most 1 MiB
  --help, -h             Standalone help, no evaluation or saving
Long value options accept =VALUE, including literal dash-leading paths.
Explicit relative paths use caller cwd; paths are literal, without shell expansion.
New output parents are private; retained evidence and symlink ancestors are rejected.
Declarations and limited local filename scans cannot certify live encryption or custody.
`;
function humanOutput(r, saved) {
  const lines = ["Acres Volume Encryption Configuration Preflight"];
  for (const m of r.evaluatedMounts)
    lines.push(
      `  ${m.passed ? "✓" : "✗"} [${m.service}] ${m.containerPath} (${m.status})`,
    );
  lines.push(
    `Local filename scan: ${r.keySeparation.verified ? "PASSED" : "VIOLATED"}`,
    `Scanned paths: ${r.keySeparation.scannedPaths.length}; violations: ${r.keySeparation.detectedViolations.length}`,
    ...r.errors,
  );
  if (saved) lines.push("Volume preflight evidence published");
  lines.push(
    r.valid
      ? "Result: PASSED. Declarations and limited local filename scans passed; live inspection required."
      : "Result: FAILED. Volume encryption configuration preflight failed.",
  );
  return lines.join("\n") + "\n";
}
function main(args) {
  let category = "invocation";
  let outputFault = false;
  const diagnostic = (value) => {
    process.exitCode = 1;
    try {
      process.stderr.write(`Volume ${value} failed\n`, () => {});
    } catch {
      /* stderr may also be unavailable */
    }
  };
  process.stderr.on("error", () => {
    process.exitCode = 1;
  });
  process.stdout.on("error", () => {
    if (!outputFault) {
      outputFault = true;
      diagnostic("output");
    }
  });
  const print = (value) =>
    process.stdout.write(value, (e) => {
      if (e && !outputFault) {
        outputFault = true;
        diagnostic("output");
      }
    });
  try {
    const options = parseArgs(args);
    if (options.help) {
      category = "output";
      print(HELP);
      return;
    }
    category = "publication";
    const parents = options.output ? outputPreflight(options.output) : null;
    category = "evaluation";
    const compose = readSource(options.compose ?? DEFAULT_COMPOSE_PATH);
    const env = readSource(options.env ?? DEFAULT_ENV_PATH);
    const readinessText = readSource(
      options.readiness ?? DEFAULT_READINESS_PATH,
    );
    if (
      compose === null ||
      env === null ||
      (options.readiness && readinessText === null)
    )
      throw failure("evaluation");
    let readiness = null;
    if (readinessText !== null) {
      readiness = JSON.parse(readinessText);
      if (readiness === null || !validReadiness(readiness))
        throw failure("evaluation");
    }
    const result = validateVolumeEncryption({
      compose,
      env,
      readiness,
      options: { hostMountPaths: options.hostMountPaths },
    });
    if (result.evaluatedMounts.length !== 9) throw failure("evaluation");
    category = "serialization";
    const report = projectReport(result);
    const bytes = serializeReport(report, Boolean(options.output));
    if (options.output) {
      category = "publication";
      try {
        publishReport(options.output, parents, bytes);
      } catch (e) {
        if (e.message === "Volume cleanup failed") category = "cleanup";
        throw e;
      }
    }
    category = "output";
    if (!report.valid) process.exitCode = 1;
    print(options.json ? bytes : humanOutput(report, Boolean(options.output)));
  } catch {
    diagnostic(category);
  }
}
if (require.main === module) main(process.argv.slice(2));

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
