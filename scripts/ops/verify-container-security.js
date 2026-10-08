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

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const crypto = require("node:crypto");

/**
 * Parses Dockerfile into stages and instructions.
 */
function parseDockerfile(content) {
  if (typeof content !== "string") throw failure("evaluation");
  const rawLines = content.split("\n");
  const instructions = [];
  let currentStage = null;
  let stageCount = 0;

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i].trim();
    if (!line || line.startsWith("#")) continue;

    // Handle multiline continuation with backslash
    while (line.endsWith("\\") && i + 1 < rawLines.length) {
      i++;
      line = line.slice(0, -1).trim() + " " + rawLines[i].trim();
    }

    const spaceIdx = line.indexOf(" ");
    if (spaceIdx === -1) continue;

    const command = line.slice(0, spaceIdx).toUpperCase();
    const args = line.slice(spaceIdx + 1).trim();

    if (command === "FROM") {
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
function validateDockerfile(content, filePath = "Dockerfile") {
  if (!text(filePath)) throw failure("evaluation");
  const { instructions, stageCount } = parseDockerfile(content);
  const errors = [];
  const checks = [];

  function record(checkName, passed, details = "") {
    passed = Boolean(passed);
    checks.push({ target: filePath, check: checkName, passed, details });
    if (!passed) {
      errors.push(`[${filePath}] ${checkName}: ${details}`);
    }
  }

  // 1. Multi-stage build check
  const fromInstructions = instructions.filter((i) => i.command === "FROM");
  const isMultiStage = fromInstructions.length >= 3;
  record(
    "multi-stage-isolation",
    isMultiStage,
    isMultiStage
      ? `Found ${fromInstructions.length} stages (proper multi-stage build)`
      : `Expected at least 3 stages for isolation, found ${fromInstructions.length}`,
  );

  // 2. Base image Node 24 Alpine check
  const baseFroms = fromInstructions.filter(
    (i) => !i.args.startsWith("deps ") && !i.args.startsWith("build "),
  );
  const node24Alpine = baseFroms.every((i) =>
    i.args.startsWith("node:24-alpine"),
  );
  record(
    "base-image-pinned-node-alpine",
    node24Alpine,
    node24Alpine
      ? "All external base stages use pinned node:24-alpine"
      : "Stages must pin node:24-alpine base",
  );

  // 3. Runtime stage non-root user check
  const runtimeStageName =
    fromInstructions[fromInstructions.length - 1]?.args.split(/\s+/).pop() ||
    "runtime";
  const runtimeInstructions = instructions.filter(
    (i) => i.stage === runtimeStageName,
  );
  const userInstructions = runtimeInstructions.filter(
    (i) => i.command === "USER",
  );
  const lastUser = userInstructions[userInstructions.length - 1];

  const runsAsNonRoot = lastUser && lastUser.args === "node";
  record(
    "non-root-runtime-user",
    runsAsNonRoot,
    runsAsNonRoot
      ? `Runtime stage specifies 'USER node'`
      : `Runtime stage must execute as 'USER node', found: ${lastUser ? lastUser.args : "none (root)"}`,
  );

  // 4. Bounded HEALTHCHECK check
  const healthcheck = runtimeInstructions.find(
    (i) => i.command === "HEALTHCHECK",
  );
  const hasHealthcheck =
    !!healthcheck &&
    healthcheck.args.includes("--interval") &&
    healthcheck.args.includes("--timeout");
  record(
    "bounded-healthcheck",
    hasHealthcheck,
    hasHealthcheck
      ? "HEALTHCHECK defined with bounded intervals and timeouts in runtime stage"
      : "Missing HEALTHCHECK instruction or missing --interval/--timeout bounds in runtime stage",
  );

  // 5. Direct process execution / signal handling (exec form CMD)
  const cmdInstructions = runtimeInstructions.filter(
    (i) => i.command === "CMD",
  );
  const lastCmd = cmdInstructions[cmdInstructions.length - 1];
  const isExecForm =
    lastCmd && lastCmd.args.startsWith("[") && lastCmd.args.endsWith("]");
  const doesNotUseNpm = isExecForm && !lastCmd.args.includes('"npm"');
  record(
    "direct-signal-exec-cmd",
    isExecForm && doesNotUseNpm,
    isExecForm && doesNotUseNpm
      ? `CMD uses exec JSON array without npm wrapper: ${lastCmd.args}`
      : `CMD must use JSON exec array directly invoking runtime binary without npm wrapper`,
  );

  // 6. Layer hygiene: no secrets copying
  let leakedSecret = null;
  for (const inst of instructions) {
    if (inst.command === "COPY" || inst.command === "ADD") {
      if (/(?:\.env|\.pem|\.key|id_rsa|credentials)/i.test(inst.args)) {
        leakedSecret = inst.raw;
        break;
      }
    }
    if (inst.command === "ENV") {
      if (
        /(?:PASSWORD|SECRET|TOKEN|KEY)\s*=\s*['"]?[a-zA-Z0-9_!@#$%^&*-]{6,}['"]?/i.test(
          inst.args,
        ) &&
        !inst.args.includes("${")
      ) {
        leakedSecret = inst.raw;
        break;
      }
    }
  }
  record(
    "layer-hygiene-zero-secrets",
    !leakedSecret,
    !leakedSecret
      ? "No secrets, .env files, or private keys copied into image"
      : `Forbidden secret instruction: ${leakedSecret}`,
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
function validateComposeConfig(composeDoc, filePath = "docker-compose.yml") {
  if (!text(filePath) || !validComposeShape(composeDoc))
    return { valid: false, errors: ["Invalid Compose structure"], checks: [] };
  const errors = [];
  const checks = [];

  function record(checkName, passed, details = "") {
    passed = Boolean(passed);
    checks.push({ target: filePath, check: checkName, passed, details });
    if (!passed) {
      errors.push(`[${filePath}] ${checkName}: ${details}`);
    }
  }

  const services = composeDoc.services || {};
  const networks = composeDoc.networks || {};

  // 1. Private network isolation
  const hasPrivateInternal =
    networks.private && networks.private.internal === true;
  record(
    "private-network-internal-isolation",
    hasPrivateInternal,
    hasPrivateInternal
      ? "Private network configured with internal: true"
      : "Private network must be configured with internal: true",
  );

  // 2. Data store & internal service network isolation
  let datastoreIsolated = true;
  for (const [svcName, svc] of Object.entries(services)) {
    if (svcName === "caddy") continue;
    if (svc) {
      const netList = Array.isArray(svc.networks) ? svc.networks : [];
      if (netList.includes("public")) {
        datastoreIsolated = false;
        errors.push(
          `Data store or internal service '${svcName}' must not attach to public network`,
        );
      }
    }
  }
  record(
    "datastore-network-isolation",
    datastoreIsolated,
    datastoreIsolated
      ? "Internal stateful and application services attached only to private network"
      : "Internal services leaked onto public network",
  );

  // 3. No plaintext passwords in environment definitions or command flags
  let hardcodedSecretsFound = false;
  for (const [svcName, svc] of Object.entries(services)) {
    const env = svc.environment;
    const envEntries = [];
    if (env && typeof env === "object") {
      if (Array.isArray(env)) {
        for (const item of env) {
          if (typeof item === "string") {
            const eqIdx = item.indexOf("=");
            if (eqIdx !== -1) {
              envEntries.push([
                item.slice(0, eqIdx).trim(),
                item.slice(eqIdx + 1).trim(),
              ]);
            } else {
              envEntries.push([item.trim(), ""]);
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
        if (
          svcName === "postgres" &&
          k === "ACRES_MONITOR_BOOTSTRAP_PASSWORD" &&
          strVal === "${ACRES_MONITOR_BOOTSTRAP_PASSWORD-}"
        )
          continue;
        // Garage receives a file path, not token material. Require its
        // read-only mount here; the template checker validates both readers.
        if (
          svcName === "garage" &&
          k === "GARAGE_METRICS_TOKEN_FILE" &&
          strVal === "/run/secrets/garage_metrics_token" &&
          (svc.volumes || []).includes(
            "${ACRES_GARAGE_METRICS_TOKEN_FILE:?inject Garage metrics token file path}:/run/secrets/garage_metrics_token:ro",
          )
        )
          continue;
        // Must use variable expansion syntax e.g. ${VAR:?msg}
        if (!strVal.startsWith("${") || !strVal.includes(":?")) {
          hardcodedSecretsFound = true;
          errors.push(
            `Service '${svcName}' environment '${k}' must use mandatory injected variable expansion (\${VAR:?msg})`,
          );
        }
      }
    }

    // Also inspect command / entrypoint for credential flags
    const cmdStr = Array.isArray(svc.command)
      ? svc.command.join(" ")
      : svc.command || "";
    if (/--requirepass\b/i.test(cmdStr)) {
      if (!cmdStr.includes("${") || !cmdStr.includes(":?")) {
        hardcodedSecretsFound = true;
        errors.push(
          `Service '${svcName}' command contains credential flag without mandatory variable expansion: '${cmdStr}'`,
        );
      }
    }
  }
  record(
    "mandatory-secret-injection-syntax",
    !hardcodedSecretsFound,
    !hardcodedSecretsFound
      ? "All sensitive credentials in compose services use injected variable expansion (${VAR:?msg})"
      : "Hardcoded secrets detected in compose services",
  );

  // The server and its in-container probe must share one mandatory source.
  // Compare the unrendered template so neither diagnostics nor evidence expose it.
  if (services.valkey) {
    const valkey = services.valkey;
    const passwordSource = "${VALKEY_PASSWORD:?inject Valkey password}";
    const environmentBound =
      !Array.isArray(valkey.environment) &&
      valkey.environment?.VALKEY_PASSWORD === passwordSource;
    const requirepassIndex = Array.isArray(valkey.command)
      ? valkey.command.indexOf("--requirepass")
      : -1;
    const serverBound =
      requirepassIndex >= 0 &&
      valkey.command[requirepassIndex + 1] === passwordSource;
    const probe = valkey.healthcheck?.test;
    const probeBound =
      Array.isArray(probe) &&
      probe[0] === "CMD-SHELL" &&
      probe[1] ===
        'VALKEYCLI_AUTH="$${VALKEY_PASSWORD}" valkey-cli ping | grep -qx PONG';
    record(
      "valkey-authenticated-healthcheck",
      environmentBound && serverBound && probeBound,
      environmentBound && serverBound && probeBound
        ? "Valkey server and exact-PONG healthcheck use the same injected container password"
        : "Valkey must inject VALKEY_PASSWORD, use it for --requirepass, and probe with the escaped in-container variable and exact PONG",
    );
  }

  // 4. Healthcheck enforcement on critical services
  const requiredHealthcheckServices = [
    "api",
    "worker",
    "next",
    "postgres",
    "valkey",
    "garage",
    "clamav",
  ];
  const isFullStack =
    Object.keys(services).length > 3 ||
    filePath.includes("docker-compose.production");
  let allHealthchecksPresent = true;
  for (const svcName of requiredHealthcheckServices) {
    const svc = services[svcName];
    if (isFullStack && !svc) {
      allHealthchecksPresent = false;
      errors.push(
        `Required service '${svcName}' is not defined in Compose configuration`,
      );
    } else if (svc && !svc.healthcheck) {
      allHealthchecksPresent = false;
      errors.push(`Service '${svcName}' is missing healthcheck configuration`);
    }
  }
  record(
    "service-healthchecks-defined",
    allHealthchecksPresent,
    allHealthchecksPresent
      ? "Critical services (api, worker, next, postgres, valkey, garage, clamav) define bounded healthchecks"
      : "Missing healthchecks on critical services",
  );

  // 5. Caddy backend dependencies require verified health
  if (isFullStack || services.caddy) {
    const expectedCaddyBackends = ["next", "api", "garage"];
    const caddyDeps = services.caddy?.depends_on;
    let depsHealthy = true;
    if (!services.caddy) {
      depsHealthy = false;
      errors.push(
        "Missing Caddy reverse proxy service definition in Compose configuration",
      );
    } else if (
      !caddyDeps ||
      typeof caddyDeps !== "object" ||
      Array.isArray(caddyDeps)
    ) {
      depsHealthy = false;
      errors.push(
        "Caddy service must define 'depends_on' object specifying upstream readiness conditions",
      );
    } else {
      for (const backend of expectedCaddyBackends) {
        if (!caddyDeps[backend]) {
          depsHealthy = false;
          errors.push(
            `Caddy depends_on is missing expected backend '${backend}'`,
          );
        }
      }
      for (const [depName, depConfig] of Object.entries(caddyDeps)) {
        const condition = depConfig?.condition;
        if (condition !== "service_healthy") {
          depsHealthy = false;
          errors.push(
            `Caddy dependency '${depName}' must require condition: service_healthy (found: ${condition || "none"})`,
          );
        }
      }
    }
    record(
      "caddy-dependencies-healthy",
      depsHealthy,
      depsHealthy
        ? "Caddy reverse proxy gates ingress on backend health (all depends_on require service_healthy)"
        : "Caddy depends_on permits unready backend services",
    );
  }

  // 6. Observability dependencies and healthchecks
  if (
    services.prometheus ||
    services["postgres-exporter"] ||
    services.grafana
  ) {
    let obsValid = true;
    if (services.prometheus) {
      const promHc = services.prometheus.healthcheck;
      if (
        !promHc ||
        !JSON.stringify(promHc.test || "").includes("/-/healthy")
      ) {
        obsValid = false;
        errors.push(
          "Service 'prometheus' must define bounded healthcheck on /-/healthy",
        );
      }
    }
    if (services["postgres-exporter"]) {
      const pgDep = services["postgres-exporter"]?.depends_on?.postgres;
      if (pgDep?.condition !== "service_healthy") {
        obsValid = false;
        errors.push(
          "Service 'postgres-exporter' must depend on postgres with condition: service_healthy",
        );
      }
    }
    if (services.grafana) {
      const promDep = services.grafana?.depends_on?.prometheus;
      if (promDep?.condition !== "service_healthy") {
        obsValid = false;
        errors.push(
          "Service 'grafana' must depend on prometheus with condition: service_healthy",
        );
      }
    }
    record(
      "observability-dependencies-healthy",
      obsValid,
      obsValid
        ? "Observability services configure bounded healthchecks and require healthy upstream dependencies"
        : "Observability services missing healthchecks or healthy upstream dependencies",
    );
  }

  // 7. Application dependencies on healthy datastores
  if (services.api || services.worker) {
    let appDepsValid = true;
    if (services.api) {
      const apiDeps = services.api.depends_on;
      const requiredApiDeps = ["postgres", "valkey", "garage"];
      if (!apiDeps || typeof apiDeps !== "object" || Array.isArray(apiDeps)) {
        appDepsValid = false;
        errors.push(
          "Service 'api' must define 'depends_on' object specifying upstream datastore conditions",
        );
      } else {
        for (const dep of requiredApiDeps) {
          if (!apiDeps[dep]) {
            appDepsValid = false;
            errors.push(
              `Service 'api' depends_on is missing expected backend '${dep}'`,
            );
          }
        }
        for (const [depName, depConfig] of Object.entries(apiDeps)) {
          if (depConfig?.condition !== "service_healthy") {
            appDepsValid = false;
            errors.push(
              `Service 'api' dependency '${depName}' must require condition: service_healthy (found: ${depConfig?.condition || "none"})`,
            );
          }
        }
      }
    }
    if (services.worker) {
      const workerDeps = services.worker.depends_on;
      const requiredWorkerDeps = ["postgres", "valkey", "garage", "clamav"];
      if (
        !workerDeps ||
        typeof workerDeps !== "object" ||
        Array.isArray(workerDeps)
      ) {
        appDepsValid = false;
        errors.push(
          "Service 'worker' must define 'depends_on' object specifying upstream datastore conditions",
        );
      } else {
        for (const dep of requiredWorkerDeps) {
          if (!workerDeps[dep]) {
            appDepsValid = false;
            errors.push(
              `Service 'worker' depends_on is missing expected backend '${dep}'`,
            );
          }
        }
        for (const [depName, depConfig] of Object.entries(workerDeps)) {
          if (depConfig?.condition !== "service_healthy") {
            appDepsValid = false;
            errors.push(
              `Service 'worker' dependency '${depName}' must require condition: service_healthy (found: ${depConfig?.condition || "none"})`,
            );
          }
        }
      }
    }
    record(
      "application-dependencies-healthy",
      appDepsValid,
      appDepsValid
        ? "Application services (api, worker) gate startup on healthy datastore dependencies"
        : "Application services missing datastore dependencies or permit unready conditions",
    );
  }

  // 8. Container process signal supervision (init: true and stop_signal: SIGTERM)
  const appServices = ["api", "worker", "next"];
  let initConfigured = true;
  for (const svcName of appServices) {
    const svc = services[svcName];
    if (svc) {
      if (svc.init !== true) {
        initConfigured = false;
        errors.push(
          `Service '${svcName}' should configure init: true for signal supervision`,
        );
      }
      if (svc.stop_signal !== "SIGTERM") {
        initConfigured = false;
        errors.push(
          `Service '${svcName}' should configure stop_signal: SIGTERM (found: ${svc.stop_signal || "none"})`,
        );
      }
    }
  }
  record(
    "process-init-supervision",
    initConfigured,
    initConfigured
      ? "Application services (api, worker, next) configure init: true and stop_signal: SIGTERM"
      : "Application services missing init: true or stop_signal: SIGTERM",
  );

  // 9. Graceful shutdown lifecycle and restart policy
  if (isFullStack) {
    const expectedGracePeriods = {
      caddy: "30s",
      next: "30s",
      api: "45s",
      worker: "60s",
    };
    let shutdownValid = true;
    for (const [svcName, svc] of Object.entries(services)) {
      if (!svc) continue;
      if (svc.restart !== "unless-stopped") {
        shutdownValid = false;
        errors.push(
          `Service '${svcName}' must configure restart: unless-stopped (found: ${svc.restart || "none"})`,
        );
      }
      if (
        !svc.stop_grace_period ||
        typeof svc.stop_grace_period !== "string" ||
        !/^[1-9]\d*s$/.test(svc.stop_grace_period)
      ) {
        shutdownValid = false;
        errors.push(
          `Service '${svcName}' must define a positive bounded stop_grace_period (e.g. '30s')`,
        );
      }
    }
    for (const [appSvc, expectedGrace] of Object.entries(
      expectedGracePeriods,
    )) {
      if (services[appSvc]) {
        const actual = services[appSvc]?.stop_grace_period;
        if (actual !== expectedGrace) {
          shutdownValid = false;
          errors.push(
            `Service '${appSvc}' stop_grace_period is '${actual}', expected '${expectedGrace}'`,
          );
        }
      }
    }
    record(
      "graceful-shutdown-lifecycle",
      shutdownValid,
      shutdownValid
        ? "All services configure restart: unless-stopped and bounded stop_grace_period matching operational drain contracts"
        : "Services missing restart policy or bounded stop_grace_period",
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
  if (!isRecord(options)) throw failure("invocation");
  for (const key of [
    "rootDir",
    "serverDockerPath",
    "clientDockerPath",
    "composePath",
  ])
    if (Object.hasOwn(options, key) && !text(options[key]))
      throw failure("invocation");
  const rootDir = options.rootDir ?? path.resolve(__dirname, "../..");
  const sources = [
    [
      options.serverDockerPath ?? path.join(rootDir, TARGETS[0]),
      "server Dockerfile",
      false,
    ],
    [
      options.clientDockerPath ?? path.join(rootDir, TARGETS[1]),
      "client Dockerfile",
      false,
    ],
    [
      options.composePath ?? path.join(rootDir, TARGETS[2]),
      "Compose template",
      true,
    ],
  ];
  const checks = [],
    errors = [];
  for (const [source, slot, compose] of sources) {
    const content = readSource(source);
    if (content === null) {
      errors.push(`Missing ${slot}`);
      continue;
    }
    let result;
    if (compose) {
      let doc;
      try {
        doc = yaml.load(content, { maxDepth: 100, maxTotalMergeKeys: 10000 });
      } catch {
        result = { checks: [], errors: ["Invalid Compose source"] };
      }
      if (!result)
        result = validateComposeConfig(doc, path.relative(rootDir, source));
    } else result = validateDockerfile(content, path.relative(rootDir, source));
    checks.push(...result.checks);
    errors.push(...result.errors);
  }
  return { valid: errors.length === 0, errors, checks };
}

// Resource limits are engineering bounds, not operational security certification.
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_SAVED_BYTES = 1024 * 1024;
const TARGETS = [
  "server/Dockerfile",
  "infra/docker/client.Dockerfile.example",
  "infra/compose/docker-compose.production.example.yml",
];
const text = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  !/[\x00-\x1f\x7f-\x9f]/.test(value);
const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const failure = (category) => new Error(`Container ${category} failed`);

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
      opened.size > MAX_SOURCE_BYTES
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

function validComposeShape(doc) {
  // Bound expanded traversal, including aliases; active ancestry rejects cycles.
  let budget = 10000;
  const active = new Set();
  const visit = (value, depth) => {
    if (--budget < 0 || depth > 100) return false;
    if (value === null || ["string", "boolean"].includes(typeof value))
      return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (!Array.isArray(value) && !isRecord(value)) return false;
    if (active.has(value)) return false;
    active.add(value);
    let valid = true;
    for (const key of Object.keys(value)) {
      if (!visit(value[key], depth + 1)) {
        valid = false;
        break;
      }
    }
    active.delete(value);
    return valid;
  };
  if (
    !visit(doc, 0) ||
    !isRecord(doc) ||
    !isRecord(doc.services) ||
    Object.keys(doc.services).length === 0 ||
    (Object.hasOwn(doc, "networks") && !isRecord(doc.networks))
  )
    return false;
  const stringList = (value) =>
    Array.isArray(value) &&
    Array.from(value).every((v) => typeof v === "string");
  const scalar = (value) =>
    value === null || ["string", "boolean", "number"].includes(typeof value);
  for (const network of Object.values(doc.networks ?? {}))
    if (network !== null && !isRecord(network)) return false;
  for (const svc of Object.values(doc.services)) {
    if (!isRecord(svc)) return false;
    // Lifecycle diagnostics interpolate scalar values; reject objects before coercion.
    for (const key of ["init", "stop_signal", "restart", "stop_grace_period"])
      if (Object.hasOwn(svc, key) && !scalar(svc[key])) return false;
    if (
      Object.hasOwn(svc, "networks") &&
      !stringList(svc.networks) &&
      !(
        isRecord(svc.networks) &&
        Object.values(svc.networks).every((v) => v === null || isRecord(v))
      )
    )
      return false;
    if (
      Object.hasOwn(svc, "environment") &&
      !stringList(svc.environment) &&
      !(
        isRecord(svc.environment) &&
        Object.values(svc.environment).every(scalar)
      )
    )
      return false;
    if (
      Object.hasOwn(svc, "command") &&
      typeof svc.command !== "string" &&
      !stringList(svc.command)
    )
      return false;
    if (
      Object.hasOwn(svc, "volumes") &&
      (!Array.isArray(svc.volumes) ||
        !Array.from(svc.volumes).every(
          (v) => typeof v === "string" || isRecord(v),
        ))
    )
      return false;
    if (Object.hasOwn(svc, "healthcheck")) {
      if (!isRecord(svc.healthcheck)) return false;
      if (
        Object.hasOwn(svc.healthcheck, "test") &&
        typeof svc.healthcheck.test !== "string" &&
        !stringList(svc.healthcheck.test)
      )
        return false;
    }
    if (
      isRecord(svc.depends_on) &&
      Object.values(svc.depends_on).some(
        (dep) =>
          isRecord(dep) &&
          Object.hasOwn(dep, "condition") &&
          typeof dep.condition !== "string",
      )
    )
      return false;
    if (
      Object.hasOwn(svc, "depends_on") &&
      !stringList(svc.depends_on) &&
      !(
        isRecord(svc.depends_on) &&
        Object.values(svc.depends_on).every(isRecord)
      )
    )
      return false;
  }
  return true;
}

function parseArgs(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0]))
    return { help: true };
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      if (options.json) throw failure("invocation");
      options.json = true;
      continue;
    }
    const index = arg.indexOf("=");
    const flag = index < 0 ? arg : arg.slice(0, index);
    if (!["--output", "-o"].includes(flag) || Object.hasOwn(options, "output"))
      throw failure("invocation");
    const value = index >= 0 ? arg.slice(index + 1) : args[++i];
    if (
      !text(value) ||
      (index < 0 && value.startsWith("-")) ||
      value.endsWith(path.sep)
    )
      throw failure("invocation");
    options.output = path.resolve(value);
    if (options.output === path.parse(options.output).root)
      throw failure("invocation");
  }
  return options;
}

const SAFE_ERRORS = [
  "Missing server Dockerfile",
  "Missing client Dockerfile",
  "Missing Compose template",
  "Invalid Compose source",
  "Invalid Compose structure",
  "Container source or security check failed",
];
const CHECK_MESSAGES = {
  "multi-stage-isolation": "Require at least three build stages",
  "base-image-pinned-node-alpine": "Require the established Node Alpine base",
  "non-root-runtime-user": "Require USER node in the runtime stage",
  "bounded-healthcheck": "Require runtime healthcheck interval and timeout",
  "direct-signal-exec-cmd": "Require direct exec-form CMD without npm",
  "layer-hygiene-zero-secrets":
    "Exclude secret instructions and files from layers",
  "private-network-internal-isolation": "Require an internal private network",
  "datastore-network-isolation":
    "Keep internal services off the public network",
  "mandatory-secret-injection-syntax": "Require mandatory injected credentials",
  "valkey-authenticated-healthcheck":
    "Bind Valkey server and exact-PONG probe to the same injected password",
  "service-healthchecks-defined": "Require critical service healthchecks",
  "caddy-dependencies-healthy": "Gate Caddy on healthy upstream services",
  "observability-dependencies-healthy":
    "Require observability healthchecks and healthy dependencies",
  "application-dependencies-healthy":
    "Gate application startup on healthy datastores",
  "process-init-supervision":
    "Require application init and SIGTERM supervision",
  "graceful-shutdown-lifecycle":
    "Require the established restart and graceful-drain policy",
};

function projectReport(result) {
  const checks = result.checks.map((c) => {
    if (
      !TARGETS.includes(c.target) ||
      !Object.hasOwn(CHECK_MESSAGES, c.check) ||
      typeof c.passed !== "boolean"
    )
      throw failure("serialization");
    return {
      target: c.target,
      check: c.check,
      passed: c.passed,
      details: `${c.passed ? "Verified" : "Failed"}: ${CHECK_MESSAGES[c.check]}`,
    };
  });
  const errors = result.errors.map((e) =>
    SAFE_ERRORS.includes(e) ? e : "Container source or security check failed",
  );
  return {
    drill_type: "container_security_verification",
    timestamp: new Date().toISOString(),
    status: result.valid ? "success" : "failed",
    valid: result.valid,
    errors,
    checks,
    totalChecks: checks.length,
    passedChecks: checks.filter((c) => c.passed).length,
    failedChecks: checks.filter((c) => !c.passed).length,
  };
}
function validateReport(report) {
  if (
    !isRecord(report) ||
    report.drill_type !== "container_security_verification" ||
    typeof report.timestamp !== "string" ||
    !Number.isFinite(Date.parse(report.timestamp)) ||
    new Date(report.timestamp).toISOString() !== report.timestamp ||
    typeof report.valid !== "boolean" ||
    report.status !== (report.valid ? "success" : "failed") ||
    !Array.isArray(report.errors) ||
    !report.errors.every((e) => SAFE_ERRORS.includes(e)) ||
    !Array.isArray(report.checks) ||
    !report.checks.every(
      (c) =>
        isRecord(c) &&
        TARGETS.includes(c.target) &&
        Object.hasOwn(CHECK_MESSAGES, c.check) &&
        typeof c.passed === "boolean" &&
        c.details ===
          `${c.passed ? "Verified" : "Failed"}: ${CHECK_MESSAGES[c.check]}`,
    ) ||
    report.totalChecks !== report.checks.length ||
    report.passedChecks !== report.checks.filter((c) => c.passed).length ||
    report.failedChecks !== report.checks.filter((c) => !c.passed).length ||
    report.valid !==
      (report.errors.length === 0 && report.failedChecks === 0) ||
    (report.valid && report.totalChecks === 0)
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
    `.container-${crypto.randomUUID()}.tmp`,
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

const HELP = `Usage: scripts/ops/verify-container-security.js [options]
  --json               Print one complete report
  --output, -o FILE    Save to a fresh absent destination, at most 1 MiB
  --help, -h           Standalone help, no evaluation or saving
Output options accept =VALUE, including literal dash-leading paths.
Sources use the installed repository; relative output uses caller cwd.
Paths are literal: spaces are supported; no shell, variable or tilde expansion.
Saving rejects retained destinations and symlink ancestors; new parents are private.
Failed evaluations print/save complete evidence and exit nonzero.
Static template checks do not certify images, running containers or launch approval.
`;
function humanOutput(report, saved) {
  const lines = ["Container Image & Compose Security Verification:"];
  for (const c of report.checks)
    lines.push(
      `  ${c.passed ? "✔" : "✖"} [${c.target}] ${c.check}`,
      `    ${c.details}`,
    );
  for (const e of report.errors) lines.push(`  ${e}`);
  if (saved) lines.push("Container security evidence published");
  lines.push(
    report.valid
      ? "Container Security Gate: PASSED (All Dockerfiles and Compose templates verified)"
      : "Container Security Gate: FAILED",
  );
  return lines.join("\n") + "\n";
}
function main(args) {
  let category = "invocation";
  let outputFault = false;
  const diagnostic = (value) => {
    process.exitCode = 1;
    try {
      process.stderr.write(`Container ${value} failed\n`, () => {});
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
    const result = verifyContainerSecurity();
    category = "serialization";
    const report = projectReport(result);
    const bytes = serializeReport(report, Boolean(options.output));
    if (options.output) {
      category = "publication";
      try {
        publishReport(options.output, parents, bytes);
      } catch (e) {
        if (e.message === "Container cleanup failed") category = "cleanup";
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
  parseDockerfile,
  validateDockerfile,
  validateComposeConfig,
  verifyContainerSecurity,
};
