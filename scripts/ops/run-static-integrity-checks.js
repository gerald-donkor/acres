#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const ROOT = path.resolve(__dirname, '../..');
const CHECKS = Object.freeze(
  [
    {
      id: 'production_templates',
      script: 'scripts/ops/check-production-templates.sh',
    },
    { id: 'docker_runtime', script: 'scripts/ops/check-docker-runtime.sh' },
    { id: 'secret_defaults', script: 'scripts/ops/scan-secrets.sh' },
  ].map(Object.freeze),
);
const USAGE = `Usage: node scripts/ops/run-static-integrity-checks.js --output <file> | -o <file> | --output=<file> | -o=<file>
       node scripts/ops/run-static-integrity-checks.js --help | -h
Checks: production_templates, docker_runtime, secret_defaults (in order).
Output resolves against caller cwd and must be absent; existing evidence is preserved.
Child diagnostics are suppressed. Static evidence does not approve production launch.
`;

function validExit(code) {
  return Number.isInteger(code) && code >= 0 && code <= 255;
}

function validCheck(check, index) {
  if (
    !check ||
    typeof check !== 'object' ||
    Array.isArray(check) ||
    check.id !== CHECKS[index].id ||
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
function completeReceipt(evidence) {
  try {
    if (
      !evidence ||
      typeof evidence !== 'object' ||
      Array.isArray(evidence) ||
      !Array.isArray(evidence.checks) ||
      evidence.checks.length !== CHECKS.length ||
      !CHECKS.every((_check, index) =>
        validCheck(evidence.checks[index], index),
      )
    )
      return false;
    const passed = evidence.checks.filter((check) => check.passed).length;
    return (
      evidence.drill_type === 'static_integrity_verification' &&
      typeof evidence.timestamp === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
        evidence.timestamp,
      ) &&
      !Number.isNaN(Date.parse(evidence.timestamp)) &&
      new Date(evidence.timestamp).toISOString() === evidence.timestamp &&
      evidence.totalChecks === CHECKS.length &&
      evidence.passedChecks === passed &&
      evidence.failedChecks === CHECKS.length - passed &&
      evidence.valid === (passed === CHECKS.length) &&
      evidence.status === (passed === CHECKS.length ? 'success' : 'failed')
    );
  } catch {
    return false;
  }
}

function validateStaticEvidence(evidence) {
  try {
    if (
      !evidence ||
      typeof evidence !== 'object' ||
      Array.isArray(evidence) ||
      !Array.isArray(evidence.checks) ||
      evidence.checks.length !== CHECKS.length
    ) {
      return { valid: false, failedCheckId: null };
    }
    for (let i = 0; i < CHECKS.length; i++) {
      if (!validCheck(evidence.checks[i], i) || !evidence.checks[i].passed) {
        return { valid: false, failedCheckId: CHECKS[i].id };
      }
    }
    return { valid: completeReceipt(evidence), failedCheckId: null };
  } catch {
    return { valid: false, failedCheckId: null };
  }
}

function runChecks(execute = spawnSync, binary = 'bash') {
  const checks = CHECKS.map(({ id, script }) => {
    try {
      const result = execute(binary, [script], { cwd: ROOT, stdio: 'ignore' });
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
    timestamp: new Date().toISOString(),
    status: passedChecks === CHECKS.length ? 'success' : 'failed',
    valid: passedChecks === CHECKS.length,
    totalChecks: CHECKS.length,
    passedChecks,
    failedChecks: CHECKS.length - passedChecks,
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
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    let value;
    if (arg === '--output' || arg === '-o') {
      value = args[++i];
      if (typeof value !== 'string' || value.startsWith('-'))
        throw new Error('invalid output');
    } else if (typeof arg === 'string' && /^(--output|-o)=/.test(arg)) {
      value = arg.slice(arg.indexOf('=') + 1);
    } else {
      throw new Error('unknown option');
    }
    if (output !== undefined) throw new Error('duplicate output');
    output = resolveOutput(value);
  }
  if (output === undefined) throw new Error('output required');
  return output;
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

function installedBinary(io = fs, env = process.env) {
  for (const { script } of CHECKS) {
    const file = path.join(ROOT, script);
    const stat = io.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error('invalid child');
    io.accessSync(file, fs.constants.R_OK);
  }
  for (const dir of (env.PATH ?? '/usr/bin:/bin').split(path.delimiter)) {
    const file = path.resolve(dir || process.cwd(), 'bash');
    try {
      if (!io.statSync(file).isFile()) continue;
      io.accessSync(file, fs.constants.X_OK);
      return file;
    } catch {
      /* Try the next PATH entry without executing a probe. */
    }
  }
  throw new Error('missing bash');
}

function projectReceipt(evidence) {
  if (!completeReceipt(evidence)) throw new Error('invalid receipt');
  const projected = {
    drill_type: evidence.drill_type,
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
  if (!completeReceipt(projected)) throw new Error('invalid receipt');
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
      !completeReceipt(receipt) ||
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
    const output = parseArgs(args);
    preflightOutput(output, dependencies.fs || fs);
    const binary = installedBinary(
      dependencies.fs || fs,
      dependencies.env || process.env,
    );
    const evidence = runChecks(dependencies.execute || spawnSync, binary);
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
  validateStaticEvidence,
  runChecks,
  parseArgs,
  writeEvidence,
  main,
};
