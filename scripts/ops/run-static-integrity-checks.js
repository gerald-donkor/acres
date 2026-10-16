#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const ROOT = path.resolve(__dirname, '../..');
const VALID_TARGET_ARCHITECTURES = Object.freeze([
  'single-host-compose-caddy',
  'vercel-managed-production',
]);
const CHECKS_BY_ARCHITECTURE = Object.freeze({
  'single-host-compose-caddy': Object.freeze(
    [
      {
        id: 'production_templates',
        script: 'scripts/ops/check-production-templates.sh',
        runner: 'bash',
      },
      {
        id: 'docker_runtime',
        script: 'scripts/ops/check-docker-runtime.sh',
        runner: 'bash',
      },
      {
        id: 'secret_defaults',
        script: 'scripts/ops/scan-secrets.sh',
        runner: 'bash',
      },
    ].map(Object.freeze),
  ),
  'vercel-managed-production': Object.freeze(
    [
      {
        id: 'vercel_config',
        script: 'scripts/vercel/check-vercel-config.js',
        runner: 'node',
      },
      {
        id: 'secret_defaults',
        script: 'scripts/ops/scan-secrets.sh',
        runner: 'bash',
      },
    ].map(Object.freeze),
  ),
});
const CHECKS = CHECKS_BY_ARCHITECTURE['single-host-compose-caddy'];

const USAGE = `Usage: node scripts/ops/run-static-integrity-checks.js [options]
Options:
  --output, -o <file>                Path to output evidence receipt (required)
  --target-architecture, --target-arch <arch>
                                     Target architecture: single-host-compose-caddy (default)
                                     or vercel-managed-production
  --help, -h                         Show this help message
Checks:
  single-host-compose-caddy: production_templates, docker_runtime, secret_defaults (in order)
  vercel-managed-production: vercel_config, secret_defaults (in order)
Output resolves against caller cwd and must be absent; existing evidence is preserved.
Child diagnostics are suppressed. Static evidence does not approve production launch.
`;

function validExit(code) {
  return Number.isInteger(code) && code >= 0 && code <= 255;
}

function validCheck(check, index, checksList = CHECKS) {
  if (
    !check ||
    typeof check !== 'object' ||
    Array.isArray(check) ||
    check.id !== checksList[index]?.id ||
    typeof check.passed !== 'boolean'
  )
    return false;
  if (check.exitCode === null) {
    return check.passed === false && check.failureKind === 'spawn_failed';
  }
  return (
    validExit(check.exitCode) &&
    check.passed === (check.exitCode === 0) &&
    check.failureKind === undefined
  );
}

// General consistency includes truthful failed receipts; launch acceptance does not.
function completeReceipt(evidence, targetArchitecture) {
  try {
    const arch =
      targetArchitecture ||
      evidence?.target_architecture ||
      'single-host-compose-caddy';
    const checksList = CHECKS_BY_ARCHITECTURE[arch];
    if (!checksList) return false;
    if (
      evidence?.target_architecture !== undefined &&
      evidence.target_architecture !== arch
    ) {
      return false;
    }
    if (
      !evidence ||
      typeof evidence !== 'object' ||
      Array.isArray(evidence) ||
      !Array.isArray(evidence.checks) ||
      evidence.checks.length !== checksList.length ||
      !checksList.every((_check, index) =>
        validCheck(evidence.checks[index], index, checksList),
      )
    )
      return false;
    const passed = evidence.checks.filter((check) => check.passed).length;
    return (
      evidence.drill_type === 'static_integrity_verification' &&
      (evidence.target_architecture === undefined ||
        evidence.target_architecture === arch) &&
      typeof evidence.timestamp === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
        evidence.timestamp,
      ) &&
      !Number.isNaN(Date.parse(evidence.timestamp)) &&
      new Date(evidence.timestamp).toISOString() === evidence.timestamp &&
      evidence.totalChecks === checksList.length &&
      evidence.passedChecks === passed &&
      evidence.failedChecks === checksList.length - passed &&
      evidence.valid === (passed === checksList.length) &&
      evidence.status === (passed === checksList.length ? 'success' : 'failed')
    );
  } catch {
    return false;
  }
}

function validateStaticEvidence(evidence, targetArchitecture) {
  try {
    const arch =
      targetArchitecture ||
      evidence?.target_architecture ||
      'single-host-compose-caddy';
    const checksList = CHECKS_BY_ARCHITECTURE[arch];
    if (!checksList) {
      return { valid: false, failedCheckId: null };
    }
    if (
      evidence?.target_architecture !== undefined &&
      targetArchitecture !== undefined &&
      evidence.target_architecture !== targetArchitecture
    ) {
      return { valid: false, failedCheckId: null };
    }
    if (
      !evidence ||
      typeof evidence !== 'object' ||
      Array.isArray(evidence) ||
      !Array.isArray(evidence.checks) ||
      evidence.checks.length !== checksList.length
    ) {
      return { valid: false, failedCheckId: null };
    }
    for (let i = 0; i < checksList.length; i++) {
      if (
        !validCheck(evidence.checks[i], i, checksList) ||
        !evidence.checks[i].passed
      ) {
        return { valid: false, failedCheckId: checksList[i].id };
      }
    }
    return { valid: completeReceipt(evidence, arch), failedCheckId: null };
  } catch {
    return { valid: false, failedCheckId: null };
  }
}

function runChecks(
  execute = spawnSync,
  binary = 'bash',
  targetArchitecture = 'single-host-compose-caddy',
  binaries = {},
) {
  const checksList =
    CHECKS_BY_ARCHITECTURE[targetArchitecture] || CHECKS;
  const checks = checksList.map(({ id, script, runner }) => {
    try {
      const bin =
        runner === 'node'
          ? binaries.node || process.execPath || 'node'
          : binaries.bash || binary || 'bash';
      const result = execute(bin, [script], { cwd: ROOT, stdio: 'ignore' });
      if (
        !result ||
        result.error != null ||
        result.signal != null ||
        !validExit(result.status)
      ) {
        return {
          id,
          passed: false,
          exitCode: null,
          failureKind: 'spawn_failed',
        };
      }
      return { id, passed: result.status === 0, exitCode: result.status };
    } catch {
      return { id, passed: false, exitCode: null, failureKind: 'spawn_failed' };
    }
  });
  const passedChecks = checks.filter((check) => check.passed).length;
  return {
    drill_type: 'static_integrity_verification',
    target_architecture: targetArchitecture,
    timestamp: new Date().toISOString(),
    status: passedChecks === checksList.length ? 'success' : 'failed',
    valid: passedChecks === checksList.length,
    totalChecks: checksList.length,
    passedChecks,
    failedChecks: checksList.length - passedChecks,
    checks,
  };
}

function resolveOutput(value) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    /[\x00-\x1f\x7f-\x9f]/.test(value) ||
    value.endsWith(path.sep)
  ) {
    throw new Error('invalid output');
  }
  return path.resolve(process.cwd(), value);
}

function parseArgs(args) {
  let output;
  let targetArchitecture = 'single-host-compose-caddy';
  let targetArchSpecified = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    let value;
    if (arg === '--output' || arg === '-o') {
      value = args[++i];
      if (typeof value !== 'string' || value.startsWith('-'))
        throw new Error('invalid output');
      if (output !== undefined) throw new Error('duplicate output');
      output = resolveOutput(value);
    } else if (typeof arg === 'string' && /^(--output|-o)=/.test(arg)) {
      value = arg.slice(arg.indexOf('=') + 1);
      if (output !== undefined) throw new Error('duplicate output');
      output = resolveOutput(value);
    } else if (arg === '--target-architecture' || arg === '--target-arch') {
      value = args[++i];
      if (typeof value !== 'string' || value.startsWith('-'))
        throw new Error('invalid target architecture');
      if (targetArchSpecified) throw new Error('duplicate target architecture');
      if (!VALID_TARGET_ARCHITECTURES.includes(value))
        throw new Error('unknown target architecture');
      targetArchitecture = value;
      targetArchSpecified = true;
    } else if (
      typeof arg === 'string' &&
      /^(--target-architecture|--target-arch)=/.test(arg)
    ) {
      value = arg.slice(arg.indexOf('=') + 1);
      if (targetArchSpecified) throw new Error('duplicate target architecture');
      if (!VALID_TARGET_ARCHITECTURES.includes(value))
        throw new Error('unknown target architecture');
      targetArchitecture = value;
      targetArchSpecified = true;
    } else {
      throw new Error('unknown option');
    }
  }
  if (output === undefined) throw new Error('output required');
  return {
    output,
    targetArchitecture,
    toString() {
      return this.output;
    },
    [Symbol.toPrimitive](hint) {
      if (hint === 'number') return NaN;
      return this.output;
    },
  };
}

function entry(file, io) {
  try {
    return io.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Advisory preflight, repeated before allocation/link. Exclusive operations own races.
function preflightOutput(output, io = fs) {
  output = resolveOutput(output);
  const parent = path.dirname(output);
  const chain = [];
  for (let dir = parent; ; dir = path.dirname(dir)) {
    chain.unshift(dir);
    if (dir === path.dirname(dir)) break;
  }
  const missing = [];
  let nearest;
  for (const dir of chain) {
    const stat = entry(dir, io);
    if (stat) {
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error('invalid parent');
      io.accessSync(dir, fs.constants.X_OK);
      nearest = dir;
    } else missing.push(dir);
  }
  if (entry(output, io)) throw new Error('occupied output');
  io.accessSync(nearest, fs.constants.W_OK | fs.constants.X_OK);
  return missing;
}

function installedBinary(
  io = fs,
  env = process.env,
  targetArchitecture = 'single-host-compose-caddy',
) {
  const checks = CHECKS_BY_ARCHITECTURE[targetArchitecture] || CHECKS;
  for (const { script } of checks) {
    const file = path.join(ROOT, script);
    const stat = io.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error('invalid child');
    io.accessSync(file, fs.constants.R_OK);
  }
  const binaries = {};
  const needsBash = checks.some((c) => c.runner === 'bash');
  const needsNode = checks.some((c) => c.runner === 'node');

  if (needsBash) {
    let foundBash = false;
    for (const dir of (env.PATH ?? '/usr/bin:/bin').split(path.delimiter)) {
      const file = path.resolve(dir || process.cwd(), 'bash');
      try {
        if (!io.statSync(file).isFile()) continue;
        io.accessSync(file, fs.constants.X_OK);
        binaries.bash = file;
        foundBash = true;
        break;
      } catch {
        /* Try the next PATH entry without executing a probe. */
      }
    }
    if (!foundBash) throw new Error('missing bash');
  }

  if (needsNode) {
    let foundNode = false;
    if (process.execPath) {
      try {
        if (io.statSync(process.execPath).isFile()) {
          io.accessSync(process.execPath, fs.constants.X_OK);
          binaries.node = process.execPath;
          foundNode = true;
        }
      } catch {}
    }
    if (!foundNode) {
      for (const dir of (env.PATH ?? '/usr/bin:/bin').split(path.delimiter)) {
        const file = path.resolve(dir || process.cwd(), 'node');
        try {
          if (!io.statSync(file).isFile()) continue;
          io.accessSync(file, fs.constants.X_OK);
          binaries.node = file;
          foundNode = true;
          break;
        } catch {}
      }
    }
    if (!foundNode) throw new Error('missing node');
  }

  const bashStr = binaries.bash || 'bash';
  const nodeStr = binaries.node || process.execPath || 'node';
  const res = new String(bashStr);
  res.bash = bashStr;
  res.node = nodeStr;
  return res;
}

function projectReceipt(evidence) {
  const arch = evidence?.target_architecture || 'single-host-compose-caddy';
  if (!completeReceipt(evidence, arch)) throw new Error('invalid receipt');
  const projected = {
    drill_type: evidence.drill_type,
    ...(evidence.target_architecture
      ? { target_architecture: evidence.target_architecture }
      : {}),
    timestamp: evidence.timestamp,
    status: evidence.status,
    valid: evidence.valid,
    totalChecks: evidence.totalChecks,
    passedChecks: evidence.passedChecks,
    failedChecks: evidence.failedChecks,
    checks: evidence.checks.map(({ id, passed, exitCode, failureKind }) => ({
      id,
      passed,
      exitCode,
      ...(failureKind === undefined ? {} : { failureKind }),
    })),
  };
  if (!completeReceipt(projected, arch)) throw new Error('invalid receipt');
  return projected;
}

function writeEvidence(output, evidence, dependencies = {}) {
  const io = dependencies.fs || fs;
  const serialize = dependencies.serialize || JSON.stringify;
  let temporary;
  let fd;
  let failed = false;
  try {
    output = resolveOutput(output);
    const projected = projectReceipt(evidence);
    const serialized = serialize(projected, null, 2) + '\n';
    // Check serialization independently, before allocating anything.
    if (!isDeepStrictEqual(JSON.parse(serialized), projected))
      throw new Error('invalid serialization');
    const missing = preflightOutput(output, io);
    for (const dir of missing) {
      preflightOutput(output, io);
      try {
        io.mkdirSync(dir, { mode: 0o700 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
    preflightOutput(output, io);
    const candidate = path.join(
      path.dirname(output),
      `.static-integrity.${process.pid}.${randomUUID()}.tmp`,
    );
    fd = io.openSync(candidate, 'wx', 0o600);
    temporary = candidate; // Ownership precedes any write or close that can fail.
    io.writeFileSync(fd, serialized, { encoding: 'utf8' });
    io.closeSync(fd);
    fd = undefined;
    const readBack = io.readFileSync(temporary, 'utf8');
    const receipt = JSON.parse(readBack);
    if (
      readBack !== serialized ||
      !completeReceipt(receipt, evidence?.target_architecture) ||
      !isDeepStrictEqual(receipt, projected)
    ) {
      throw new Error('invalid readback');
    }
    preflightOutput(output, io);
    io.linkSync(temporary, output); // Atomic and exclusive; never replace retained evidence.
    io.unlinkSync(temporary);
    temporary = undefined;
  } catch {
    failed = true;
  } finally {
    if (fd !== undefined) {
      try {
        io.closeSync(fd);
      } catch (error) {
        if (error.code !== 'EBADF') failed = true;
      }
    }
    if (temporary !== undefined) {
      try {
        io.unlinkSync(temporary);
      } catch (error) {
        if (error.code !== 'ENOENT') failed = true;
      }
    }
  }
  if (failed) throw new Error('could not write evidence');
}

function main(args = process.argv.slice(2), dependencies = {}) {
  const logger = dependencies.console || console;
  try {
    if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
      logger.log(USAGE);
      return 0;
    }
    const { output, targetArchitecture } = parseArgs(args);
    preflightOutput(output, dependencies.fs || fs);
    const binary = installedBinary(
      dependencies.fs || fs,
      dependencies.env || process.env,
      targetArchitecture,
    );
    const evidence = runChecks(
      dependencies.execute || spawnSync,
      String(binary),
      targetArchitecture,
      binary,
    );
    for (const check of evidence.checks) {
      logger.log(
        `static integrity: ${check.id} ${check.passed ? 'passed' : 'failed'}`,
      );
    }
    writeEvidence(output, evidence, dependencies);
    return evidence.valid ? 0 : 1;
  } catch {
    try {
      logger.error(
        'static integrity: invocation or evidence publication failed; use --help',
      );
    } catch {
      /* Output failure still returns a controlled nonzero result. */
    }
    return 1;
  }
}

if (require.main === module) {
  // Console writes can fail asynchronously (e.g. a closed pipe).
  const outputFailure = () => {
    process.exitCode = 1;
  };
  process.stdout.on('error', outputFailure);
  process.stderr.on('error', outputFailure);
  process.exitCode = main();
}

module.exports = {
  CHECKS,
  CHECKS_BY_ARCHITECTURE,
  VALID_TARGET_ARCHITECTURES,
  validateStaticEvidence,
  runChecks,
  parseArgs,
  writeEvidence,
  main,
};
