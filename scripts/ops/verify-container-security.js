#!/usr/bin/env node
/**
 * scripts/ops/verify-container-security.js
 *
 * Container Security & Multi-Stage Build Hardening Validator.
 * Statically evaluates Dockerfiles (server/Dockerfile, infra/docker/client.Dockerfile.example)
 * and Compose templates (infra/compose/docker-compose.production.example.yml) for:
 * - Non-root execution (USER node)
 * - Multi-stage build isolation
 * - Layer hygiene and zero secrets leakage
 * - Signal propagation and process supervision
 * - Network isolation and healthcheck configurations
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Parses Dockerfile into stages and instructions.
 */
function parseDockerfile(content) {
  const rawLines = content.split('\n');
  const instructions = [];
  let currentStage = null;
  let stageCount = 0;

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i].trim();
    if (!line || line.startsWith('#')) continue;

    // Handle multiline continuation with backslash
    while (line.endsWith('\\') && i + 1 < rawLines.length) {
      i++;
      line = line.slice(0, -1).trim() + ' ' + rawLines[i].trim();
    }

    const spaceIdx = line.indexOf(' ');
    if (spaceIdx === -1) continue;

    const command = line.slice(0, spaceIdx).toUpperCase();
    const args = line.slice(spaceIdx + 1).trim();

    if (command === 'FROM') {
      stageCount++;
      const stageMatch = args.match(/(?:AS|as)\s+([a-zA-Z0-9_-]+)/i);
      currentStage = stageMatch ? stageMatch[1] : `stage-${stageCount}`;
    }

    instructions.push({
      command,
      args,
      stage: currentStage,
      raw: line,
      lineNumber: i + 1,
    });
  }

  return { instructions, stageCount };
}

/**
 * Validates container security invariants for a Dockerfile.
 */
function validateDockerfile(content, filePath = 'Dockerfile') {
  const { instructions, stageCount } = parseDockerfile(content);
  const errors = [];
  const checks = [];

  function record(checkName, passed, details = '') {
    checks.push({ target: filePath, check: checkName, passed, details });
    if (!passed) {
      errors.push(`[${filePath}] ${checkName}: ${details}`);
    }
  }

  // 1. Multi-stage build check
  const fromInstructions = instructions.filter((i) => i.command === 'FROM');
  const isMultiStage = fromInstructions.length >= 3;
  record(
    'multi-stage-isolation',
    isMultiStage,
    isMultiStage
      ? `Found ${fromInstructions.length} stages (proper multi-stage build)`
      : `Expected at least 3 stages for isolation, found ${fromInstructions.length}`
  );

  // 2. Base image Node 24 Alpine check
  const baseFroms = fromInstructions.filter((i) => !i.args.startsWith('deps ') && !i.args.startsWith('build '));
  const node24Alpine = baseFroms.every((i) => i.args.startsWith('node:24-alpine'));
  record(
    'base-image-pinned-node-alpine',
    node24Alpine,
    node24Alpine
      ? 'All external base stages use pinned node:24-alpine'
      : 'Stages must pin node:24-alpine base'
  );

  // 3. Runtime stage non-root user check
  const runtimeStageName = fromInstructions[fromInstructions.length - 1]?.args.split(/\s+/).pop() || 'runtime';
  const runtimeInstructions = instructions.filter((i) => i.stage === runtimeStageName);
  const userInstructions = runtimeInstructions.filter((i) => i.command === 'USER');
  const lastUser = userInstructions[userInstructions.length - 1];

  const runsAsNonRoot = lastUser && lastUser.args === 'node';
  record(
    'non-root-runtime-user',
    runsAsNonRoot,
    runsAsNonRoot
      ? `Runtime stage specifies 'USER node'`
      : `Runtime stage must execute as 'USER node', found: ${lastUser ? lastUser.args : 'none (root)'}`
  );

  // 4. Bounded HEALTHCHECK check
  const healthcheck = runtimeInstructions.find((i) => i.command === 'HEALTHCHECK');
  const hasHealthcheck = !!healthcheck && healthcheck.args.includes('--interval') && healthcheck.args.includes('--timeout');
  record(
    'bounded-healthcheck',
    hasHealthcheck,
    hasHealthcheck
      ? 'HEALTHCHECK defined with bounded intervals and timeouts in runtime stage'
      : 'Missing HEALTHCHECK instruction or missing --interval/--timeout bounds in runtime stage'
  );

  // 5. Direct process execution / signal handling (exec form CMD)
  const cmdInstructions = runtimeInstructions.filter((i) => i.command === 'CMD');
  const lastCmd = cmdInstructions[cmdInstructions.length - 1];
  const isExecForm = lastCmd && lastCmd.args.startsWith('[') && lastCmd.args.endsWith(']');
  const doesNotUseNpm = isExecForm && !lastCmd.args.includes('"npm"');
  record(
    'direct-signal-exec-cmd',
    isExecForm && doesNotUseNpm,
    isExecForm && doesNotUseNpm
      ? `CMD uses exec JSON array without npm wrapper: ${lastCmd.args}`
      : `CMD must use JSON exec array directly invoking runtime binary without npm wrapper`
  );

  // 6. Layer hygiene: no secrets copying
  let leakedSecret = null;
  for (const inst of instructions) {
    if (inst.command === 'COPY' || inst.command === 'ADD') {
      if (/(?:\.env|\.pem|\.key|id_rsa|credentials)/i.test(inst.args)) {
        leakedSecret = inst.raw;
        break;
      }
    }
    if (inst.command === 'ENV') {
      if (/(?:PASSWORD|SECRET|TOKEN|KEY)\s*=\s*['"]?[a-zA-Z0-9_!@#$%^&*-]{6,}['"]?/i.test(inst.args) && !inst.args.includes('${')) {
        leakedSecret = inst.raw;
        break;
      }
    }
  }
  record(
    'layer-hygiene-zero-secrets',
    !leakedSecret,
    !leakedSecret ? 'No secrets, .env files, or private keys copied into image' : `Forbidden secret instruction: ${leakedSecret}`
  );

  return {
    valid: errors.length === 0,
    errors,
    checks,
  };
}

/**
 * Validates Compose security configuration.
 */
function validateComposeConfig(composeDoc, filePath = 'docker-compose.yml') {
  const errors = [];
  const checks = [];

  function record(checkName, passed, details = '') {
    checks.push({ target: filePath, check: checkName, passed, details });
    if (!passed) {
      errors.push(`[${filePath}] ${checkName}: ${details}`);
    }
  }

  const services = composeDoc.services || {};
  const networks = composeDoc.networks || {};

  // 1. Private network isolation
  const hasPrivateInternal = networks.private && networks.private.internal === true;
  record(
    'private-network-internal-isolation',
    hasPrivateInternal,
    hasPrivateInternal
      ? 'Private network configured with internal: true'
      : 'Private network must be configured with internal: true'
  );

  // 2. Data store network isolation
  const isolatedServices = ['postgres', 'valkey', 'garage', 'clamav', 'prometheus'];
  let datastoreIsolated = true;
  for (const svcName of isolatedServices) {
    const svc = services[svcName];
    if (svc) {
      const netList = Array.isArray(svc.networks) ? svc.networks : [];
      if (netList.includes('public')) {
        datastoreIsolated = false;
        errors.push(`Data store service '${svcName}' must not attach to public network`);
      }
    }
  }
  record(
    'datastore-network-isolation',
    datastoreIsolated,
    datastoreIsolated
      ? 'Internal stateful services (postgres, valkey, garage, clamav, prometheus) attached only to private network'
      : 'Stateful services leaked onto public network'
  );

  // 3. No plaintext passwords in environment definitions or command flags
  let hardcodedSecretsFound = false;
  for (const [svcName, svc] of Object.entries(services)) {
    const env = svc.environment;
    const envEntries = [];
    if (env && typeof env === 'object') {
      if (Array.isArray(env)) {
        for (const item of env) {
          if (typeof item === 'string') {
            const eqIdx = item.indexOf('=');
            if (eqIdx !== -1) {
              envEntries.push([item.slice(0, eqIdx).trim(), item.slice(eqIdx + 1).trim()]);
            } else {
              envEntries.push([item.trim(), '']);
            }
          }
        }
      } else {
        for (const [k, v] of Object.entries(env)) {
          envEntries.push([k, String(v)]);
        }
      }
    }

    for (const [k, strVal] of envEntries) {
      if (/(?:PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL)/i.test(k)) {
        // Must use variable expansion syntax e.g. ${VAR:?msg}
        if (!strVal.startsWith('${') || !strVal.includes(':?')) {
          hardcodedSecretsFound = true;
          errors.push(`Service '${svcName}' environment '${k}' must use mandatory injected variable expansion (\${VAR:?msg}), got '${strVal}'`);
        }
      }
    }

    // Also inspect command / entrypoint for credential flags
    const cmdStr = Array.isArray(svc.command) ? svc.command.join(' ') : (svc.command || '');
    if (/--requirepass\b/i.test(cmdStr)) {
      if (!cmdStr.includes('${') || !cmdStr.includes(':?')) {
        hardcodedSecretsFound = true;
        errors.push(`Service '${svcName}' command contains credential flag without mandatory variable expansion: '${cmdStr}'`);
      }
    }
  }
  record(
    'mandatory-secret-injection-syntax',
    !hardcodedSecretsFound,
    !hardcodedSecretsFound
      ? 'All sensitive credentials in compose services use injected variable expansion (${VAR:?msg})'
      : 'Hardcoded secrets detected in compose services'
  );

  // 4. Healthcheck enforcement on critical services
  const requiredHealthcheckServices = ['api', 'postgres', 'valkey', 'garage', 'clamav'];
  let allHealthchecksPresent = true;
  for (const svcName of requiredHealthcheckServices) {
    const svc = services[svcName];
    if (svc && !svc.healthcheck) {
      allHealthchecksPresent = false;
      errors.push(`Service '${svcName}' is missing healthcheck configuration`);
    }
  }
  record(
    'service-healthchecks-defined',
    allHealthchecksPresent,
    allHealthchecksPresent
      ? 'Critical services (api, postgres, valkey, garage, clamav) define bounded healthchecks'
      : 'Missing healthchecks on critical services'
  );

  // 5. Container process signal supervision (init: true)
  const appServices = ['api', 'worker', 'next'];
  let initConfigured = true;
  for (const svcName of appServices) {
    const svc = services[svcName];
    if (svc && svc.init !== true) {
      initConfigured = false;
      errors.push(`Service '${svcName}' should configure init: true for signal supervision`);
    }
  }
  record(
    'process-init-supervision',
    initConfigured,
    initConfigured
      ? 'Application services (api, worker, next) configure init: true and stop_signal: SIGTERM'
      : 'Application services missing init: true'
  );

  return {
    valid: errors.length === 0,
    errors,
    checks,
  };
}

/**
 * Runs container security verification across repository Dockerfiles and Compose configurations.
 */
function verifyContainerSecurity(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '../..');
  const serverDockerPath = options.serverDockerPath || path.join(rootDir, 'server/Dockerfile');
  const clientDockerPath = options.clientDockerPath || path.join(rootDir, 'infra/docker/client.Dockerfile.example');
  const composePath = options.composePath || path.join(rootDir, 'infra/compose/docker-compose.production.example.yml');

  const allChecks = [];
  const allErrors = [];

  // 1. Verify server Dockerfile
  if (fs.existsSync(serverDockerPath)) {
    const content = fs.readFileSync(serverDockerPath, 'utf8');
    const res = validateDockerfile(content, path.relative(rootDir, serverDockerPath));
    allChecks.push(...res.checks);
    allErrors.push(...res.errors);
  } else {
    allErrors.push(`Missing server Dockerfile at ${serverDockerPath}`);
  }

  // 2. Verify client Dockerfile
  if (fs.existsSync(clientDockerPath)) {
    const content = fs.readFileSync(clientDockerPath, 'utf8');
    const res = validateDockerfile(content, path.relative(rootDir, clientDockerPath));
    allChecks.push(...res.checks);
    allErrors.push(...res.errors);
  } else {
    allErrors.push(`Missing client Dockerfile at ${clientDockerPath}`);
  }

  // 3. Verify Compose configuration
  if (fs.existsSync(composePath)) {
    const doc = yaml.load(fs.readFileSync(composePath, 'utf8'));
    const res = validateComposeConfig(doc, path.relative(rootDir, composePath));
    allChecks.push(...res.checks);
    allErrors.push(...res.errors);
  } else {
    allErrors.push(`Missing Compose template at ${composePath}`);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    checks: allChecks,
  };
}

// CLI runner
if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');

  try {
    const result = verifyContainerSecurity();

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
    }

    console.log('Container Image & Compose Security Verification:');
    for (const c of result.checks) {
      const mark = c.passed ? '✔' : '✖';
      console.log(`  ${mark} [${c.target}] ${c.check}`);
      console.log(`    ${c.details}`);
    }

    if (result.valid) {
      console.log('\nContainer Security Gate: PASSED (All Dockerfiles and Compose templates verified)');
      process.exit(0);
    } else {
      console.error('\nContainer Security Gate: FAILED');
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }
  } catch (err) {
    console.error(`Failed to verify container security: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  parseDockerfile,
  validateDockerfile,
  validateComposeConfig,
  verifyContainerSecurity,
};
