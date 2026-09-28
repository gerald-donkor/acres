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

  // 2. Data store & internal service network isolation
  let datastoreIsolated = true;
  for (const [svcName, svc] of Object.entries(services)) {
    if (svcName === 'caddy') continue;
    if (svc) {
      const netList = Array.isArray(svc.networks) ? svc.networks : [];
      if (netList.includes('public')) {
        datastoreIsolated = false;
        errors.push(`Data store or internal service '${svcName}' must not attach to public network`);
      }
    }
  }
  record(
    'datastore-network-isolation',
    datastoreIsolated,
    datastoreIsolated
      ? 'Internal stateful and application services attached only to private network'
      : 'Internal services leaked onto public network'
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
        // This one-time bootstrap value is optional when an initialized
        // database volume starts; reconciliation injects it explicitly.
        if (svcName === 'postgres' && k === 'ACRES_MONITOR_BOOTSTRAP_PASSWORD' &&
            strVal === '${ACRES_MONITOR_BOOTSTRAP_PASSWORD-}') continue;
        // Garage receives a file path, not token material. Require its
        // read-only mount here; the template checker validates both readers.
        if (svcName === 'garage' && k === 'GARAGE_METRICS_TOKEN_FILE' &&
            strVal === '/run/secrets/garage_metrics_token' &&
            (svc.volumes || []).includes('${ACRES_GARAGE_METRICS_TOKEN_FILE:?inject Garage metrics token file path}:/run/secrets/garage_metrics_token:ro')) continue;
        // Must use variable expansion syntax e.g. ${VAR:?msg}
        if (!strVal.startsWith('${') || !strVal.includes(':?')) {
          hardcodedSecretsFound = true;
          errors.push(`Service '${svcName}' environment '${k}' must use mandatory injected variable expansion (\${VAR:?msg})`);
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

  // The server and its in-container probe must share one mandatory source.
  // Compare the unrendered template so neither diagnostics nor evidence expose it.
  if (services.valkey) {
    const valkey = services.valkey;
    const passwordSource = '${VALKEY_PASSWORD:?inject Valkey password}';
    const environmentBound = !Array.isArray(valkey.environment) &&
      valkey.environment?.VALKEY_PASSWORD === passwordSource;
    const requirepassIndex = Array.isArray(valkey.command)
      ? valkey.command.indexOf('--requirepass') : -1;
    const serverBound = requirepassIndex >= 0 &&
      valkey.command[requirepassIndex + 1] === passwordSource;
    const probe = valkey.healthcheck?.test;
    const probeBound = Array.isArray(probe) && probe[0] === 'CMD-SHELL' &&
      probe[1] === 'VALKEYCLI_AUTH="$${VALKEY_PASSWORD}" valkey-cli ping | grep -qx PONG';
    record(
      'valkey-authenticated-healthcheck',
      environmentBound && serverBound && probeBound,
      environmentBound && serverBound && probeBound
        ? 'Valkey server and exact-PONG healthcheck use the same injected container password'
        : 'Valkey must inject VALKEY_PASSWORD, use it for --requirepass, and probe with the escaped in-container variable and exact PONG'
    );
  }

  // 4. Healthcheck enforcement on critical services
  const requiredHealthcheckServices = ['api', 'worker', 'next', 'postgres', 'valkey', 'garage', 'clamav'];
  const isFullStack = Object.keys(services).length > 3 || filePath.includes('docker-compose.production');
  let allHealthchecksPresent = true;
  for (const svcName of requiredHealthcheckServices) {
    const svc = services[svcName];
    if (isFullStack && !svc) {
      allHealthchecksPresent = false;
      errors.push(`Required service '${svcName}' is not defined in Compose configuration`);
    } else if (svc && !svc.healthcheck) {
      allHealthchecksPresent = false;
      errors.push(`Service '${svcName}' is missing healthcheck configuration`);
    }
  }
  record(
    'service-healthchecks-defined',
    allHealthchecksPresent,
    allHealthchecksPresent
      ? 'Critical services (api, worker, next, postgres, valkey, garage, clamav) define bounded healthchecks'
      : 'Missing healthchecks on critical services'
  );

  // 5. Caddy backend dependencies require verified health
  if (isFullStack || services.caddy) {
    const expectedCaddyBackends = ['next', 'api', 'garage'];
    const caddyDeps = services.caddy?.depends_on;
    let depsHealthy = true;
    if (!services.caddy) {
      depsHealthy = false;
      errors.push("Missing Caddy reverse proxy service definition in Compose configuration");
    } else if (!caddyDeps || typeof caddyDeps !== 'object' || Array.isArray(caddyDeps)) {
      depsHealthy = false;
      errors.push("Caddy service must define 'depends_on' object specifying upstream readiness conditions");
    } else {
      for (const backend of expectedCaddyBackends) {
        if (!caddyDeps[backend]) {
          depsHealthy = false;
          errors.push(`Caddy depends_on is missing expected backend '${backend}'`);
        }
      }
      for (const [depName, depConfig] of Object.entries(caddyDeps)) {
        const condition = depConfig?.condition;
        if (condition !== 'service_healthy') {
          depsHealthy = false;
          errors.push(`Caddy dependency '${depName}' must require condition: service_healthy (found: ${condition || 'none'})`);
        }
      }
    }
    record(
      'caddy-dependencies-healthy',
      depsHealthy,
      depsHealthy
        ? 'Caddy reverse proxy gates ingress on backend health (all depends_on require service_healthy)'
        : 'Caddy depends_on permits unready backend services'
    );
  }

  // 6. Observability dependencies and healthchecks
  if (services.prometheus || services['postgres-exporter'] || services.grafana) {
    let obsValid = true;
    if (services.prometheus) {
      const promHc = services.prometheus.healthcheck;
      if (!promHc || !JSON.stringify(promHc.test || '').includes('/-/healthy')) {
        obsValid = false;
        errors.push("Service 'prometheus' must define bounded healthcheck on /-/healthy");
      }
    }
    if (services['postgres-exporter']) {
      const pgDep = services['postgres-exporter']?.depends_on?.postgres;
      if (pgDep?.condition !== 'service_healthy') {
        obsValid = false;
        errors.push("Service 'postgres-exporter' must depend on postgres with condition: service_healthy");
      }
    }
    if (services.grafana) {
      const promDep = services.grafana?.depends_on?.prometheus;
      if (promDep?.condition !== 'service_healthy') {
        obsValid = false;
        errors.push("Service 'grafana' must depend on prometheus with condition: service_healthy");
      }
    }
    record(
      'observability-dependencies-healthy',
      obsValid,
      obsValid
        ? 'Observability services configure bounded healthchecks and require healthy upstream dependencies'
        : 'Observability services missing healthchecks or healthy upstream dependencies'
    );
  }

  // 7. Application dependencies on healthy datastores
  if (services.api || services.worker) {
    let appDepsValid = true;
    if (services.api) {
      const apiDeps = services.api.depends_on;
      const requiredApiDeps = ['postgres', 'valkey', 'garage'];
      if (!apiDeps || typeof apiDeps !== 'object' || Array.isArray(apiDeps)) {
        appDepsValid = false;
        errors.push("Service 'api' must define 'depends_on' object specifying upstream datastore conditions");
      } else {
        for (const dep of requiredApiDeps) {
          if (!apiDeps[dep]) {
            appDepsValid = false;
            errors.push(`Service 'api' depends_on is missing expected backend '${dep}'`);
          }
        }
        for (const [depName, depConfig] of Object.entries(apiDeps)) {
          if (depConfig?.condition !== 'service_healthy') {
            appDepsValid = false;
            errors.push(`Service 'api' dependency '${depName}' must require condition: service_healthy (found: ${depConfig?.condition || 'none'})`);
          }
        }
      }
    }
    if (services.worker) {
      const workerDeps = services.worker.depends_on;
      const requiredWorkerDeps = ['postgres', 'valkey', 'garage', 'clamav'];
      if (!workerDeps || typeof workerDeps !== 'object' || Array.isArray(workerDeps)) {
        appDepsValid = false;
        errors.push("Service 'worker' must define 'depends_on' object specifying upstream datastore conditions");
      } else {
        for (const dep of requiredWorkerDeps) {
          if (!workerDeps[dep]) {
            appDepsValid = false;
            errors.push(`Service 'worker' depends_on is missing expected backend '${dep}'`);
          }
        }
        for (const [depName, depConfig] of Object.entries(workerDeps)) {
          if (depConfig?.condition !== 'service_healthy') {
            appDepsValid = false;
            errors.push(`Service 'worker' dependency '${depName}' must require condition: service_healthy (found: ${depConfig?.condition || 'none'})`);
          }
        }
      }
    }
    record(
      'application-dependencies-healthy',
      appDepsValid,
      appDepsValid
        ? 'Application services (api, worker) gate startup on healthy datastore dependencies'
        : 'Application services missing datastore dependencies or permit unready conditions'
    );
  }

  // 8. Container process signal supervision (init: true and stop_signal: SIGTERM)
  const appServices = ['api', 'worker', 'next'];
  let initConfigured = true;
  for (const svcName of appServices) {
    const svc = services[svcName];
    if (svc) {
      if (svc.init !== true) {
        initConfigured = false;
        errors.push(`Service '${svcName}' should configure init: true for signal supervision`);
      }
      if (svc.stop_signal !== 'SIGTERM') {
        initConfigured = false;
        errors.push(`Service '${svcName}' should configure stop_signal: SIGTERM (found: ${svc.stop_signal || 'none'})`);
      }
    }
  }
  record(
    'process-init-supervision',
    initConfigured,
    initConfigured
      ? 'Application services (api, worker, next) configure init: true and stop_signal: SIGTERM'
      : 'Application services missing init: true or stop_signal: SIGTERM'
  );

  // 9. Graceful shutdown lifecycle and restart policy
  if (isFullStack) {
    const expectedGracePeriods = {
      caddy: '30s',
      next: '30s',
      api: '45s',
      worker: '60s',
    };
    let shutdownValid = true;
    for (const [svcName, svc] of Object.entries(services)) {
      if (!svc) continue;
      if (svc.restart !== 'unless-stopped') {
        shutdownValid = false;
        errors.push(`Service '${svcName}' must configure restart: unless-stopped (found: ${svc.restart || 'none'})`);
      }
      if (!svc.stop_grace_period || typeof svc.stop_grace_period !== 'string' || !/^[1-9]\d*s$/.test(svc.stop_grace_period)) {
        shutdownValid = false;
        errors.push(`Service '${svcName}' must define a positive bounded stop_grace_period (e.g. '30s')`);
      }
    }
    for (const [appSvc, expectedGrace] of Object.entries(expectedGracePeriods)) {
      if (services[appSvc]) {
        const actual = services[appSvc]?.stop_grace_period;
        if (actual !== expectedGrace) {
          shutdownValid = false;
          errors.push(`Service '${appSvc}' stop_grace_period is '${actual}', expected '${expectedGrace}'`);
        }
      }
    }
    record(
      'graceful-shutdown-lifecycle',
      shutdownValid,
      shutdownValid
        ? 'All services configure restart: unless-stopped and bounded stop_grace_period matching operational drain contracts'
        : 'Services missing restart policy or bounded stop_grace_period'
    );
  }

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
  const outIdx = args.indexOf('--output') !== -1 ? args.indexOf('--output') : args.indexOf('-o');
  const outputPath = outIdx !== -1 && args[outIdx + 1] && !args[outIdx + 1].startsWith('-') ? path.resolve(process.cwd(), args[outIdx + 1]) : null;

  try {
    const result = verifyContainerSecurity();

    const payload = {
      drill_type: 'container_security_verification',
      timestamp: new Date().toISOString(),
      status: result.valid ? 'success' : 'failed',
      valid: result.valid,
      errors: result.errors,
      checks: result.checks,
      totalChecks: result.checks.length,
      passedChecks: result.checks.filter((c) => c.passed).length,
      failedChecks: result.checks.filter((c) => !c.passed).length,
    };

    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    }

    if (jsonOutput) {
      console.log(JSON.stringify(payload, null, 2));
      process.exit(result.valid ? 0 : 1);
    }

    console.log('Container Image & Compose Security Verification:');
    for (const c of result.checks) {
      const mark = c.passed ? '✔' : '✖';
      console.log(`  ${mark} [${c.target}] ${c.check}`);
      console.log(`    ${c.details}`);
    }

    if (outputPath) {
      console.log(`\n  Container security evidence written to: ${outputPath}`);
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
