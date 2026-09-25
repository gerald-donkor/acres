#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const CHECKS = Object.freeze([
  { id: 'production_templates', script: 'scripts/ops/check-production-templates.sh' },
  { id: 'docker_runtime', script: 'scripts/ops/check-docker-runtime.sh' },
  { id: 'secret_defaults', script: 'scripts/ops/scan-secrets.sh' },
]);

function validateStaticEvidence(evidence) {
  if (!evidence || !Array.isArray(evidence.checks) ||
      evidence.checks.length !== CHECKS.length) {
    return { valid: false, failedCheckId: null };
  }
  for (let i = 0; i < CHECKS.length; i++) {
    const check = evidence.checks[i];
    if (!check || check.id !== CHECKS[i].id || check.passed !== true || check.exitCode !== 0) {
      return { valid: false, failedCheckId: CHECKS[i].id };
    }
  }
  if (evidence.drill_type !== 'static_integrity_verification' ||
      evidence.status !== 'success' || evidence.valid !== true ||
      typeof evidence.timestamp !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(evidence.timestamp) ||
      Number.isNaN(Date.parse(evidence.timestamp)) ||
      new Date(evidence.timestamp).toISOString() !== evidence.timestamp ||
      evidence.totalChecks !== CHECKS.length || evidence.passedChecks !== CHECKS.length ||
      evidence.failedChecks !== 0) {
    return { valid: false, failedCheckId: null };
  }
  return { valid: true, failedCheckId: null };
}

function runChecks(execute = spawnSync) {
  const checks = CHECKS.map(({ id, script }) => {
    try {
      const result = execute('bash', [script], { cwd: ROOT, stdio: 'ignore' });
      if (result.error || typeof result.status !== 'number') {
        return { id, passed: false, exitCode: null, failureKind: 'spawn_failed' };
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

function parseArgs(args) {
  let output;
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--output' && args[i] !== '-o') throw new Error('unknown option');
    if (output !== undefined || !args[i + 1] || args[i + 1].startsWith('-')) throw new Error('invalid output');
    output = args[++i];
  }
  if (!output) throw new Error('output required');
  return path.resolve(process.cwd(), output);
}

function writeEvidence(output, evidence) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = path.join(path.dirname(output), `.${path.basename(output)}.${process.pid}.${require('node:crypto').randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temporary, output);
  } finally {
    try { fs.unlinkSync(temporary); } catch { /* already renamed or write failed */ }
  }
}

function main(args = process.argv.slice(2)) {
  let output;
  try {
    output = parseArgs(args);
  } catch {
    console.error('static integrity: expected --output <file>');
    return 1;
  }
  const evidence = runChecks();
  for (const check of evidence.checks) {
    console.log(`static integrity: ${check.id} ${check.passed ? 'passed' : 'failed'}`);
  }
  try {
    writeEvidence(output, evidence);
  } catch {
    console.error('static integrity: could not write evidence');
    return 1;
  }
  return evidence.valid ? 0 : 1;
}

if (require.main === module) process.exitCode = main();

module.exports = { CHECKS, validateStaticEvidence, runChecks, parseArgs, writeEvidence, main };
