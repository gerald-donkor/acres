const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const yaml = require("js-yaml");

const {
  parseDockerfile,
  validateDockerfile,
  validateComposeConfig,
  verifyContainerSecurity,
} = require("./verify-container-security");

const ROOT_DIR = path.resolve(__dirname, "../..");
const SERVER_DOCKERFILE = path.join(ROOT_DIR, "server/Dockerfile");
const CLIENT_DOCKERFILE = path.join(
  ROOT_DIR,
  "infra/docker/client.Dockerfile.example",
);
const COMPOSE_FILE = path.join(
  ROOT_DIR,
  "infra/compose/docker-compose.production.example.yml",
);

test("validateComposeConfig: Valkey probe requires the same injected password as the server", () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, "utf8"));
  const check = "valkey-authenticated-healthcheck";
  assert.equal(
    validateComposeConfig(original).checks.find((item) => item.check === check)
      ?.passed,
    true,
  );

  const mutations = [
    (doc) => {
      delete doc.services.valkey.environment.VALKEY_PASSWORD;
    },
    (doc) => {
      doc.services.valkey.healthcheck.test[1] =
        'VALKEYCLI_AUTH="$${UNBOUND_PASSWORD}" valkey-cli ping | grep -qx PONG';
    },
    (doc) => {
      doc.services.valkey.command[2] =
        "${OTHER_PASSWORD:?inject other password}";
    },
  ];
  for (const mutate of mutations) {
    const doc = structuredClone(original);
    mutate(doc);
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some(
        (error) => error.includes(check) && error.includes("VALKEY_PASSWORD"),
      ),
    );
  }
});

test("verifyContainerSecurity: production reference files pass 100% of container security checks", () => {
  const result = verifyContainerSecurity();

  assert.equal(
    result.valid,
    true,
    `Expected valid container security, errors: ${result.errors.join(", ")}`,
  );
  assert.equal(result.errors.length, 0);
  assert.ok(
    result.checks.length >= 17,
    `Expected at least 17 checks, got ${result.checks.length}`,
  );
  assert.ok(result.checks.every((c) => c.passed === true));
});

test("validateDockerfile: detects insecure root runtime user regression", () => {
  const insecureRootDockerfile = `
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
USER root
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/main.js"]
`;

  const res = validateDockerfile(insecureRootDockerfile, "insecure.Dockerfile");
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("non-root-runtime-user")));
});

test("validateDockerfile: detects missing multi-stage isolation regression", () => {
  const singleStageDockerfile = `
FROM node:24-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/main.js"]
`;

  const res = validateDockerfile(
    singleStageDockerfile,
    "single-stage.Dockerfile",
  );
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("multi-stage-isolation")));
});

test("validateDockerfile: detects missing or unbounded healthcheck regression", () => {
  const noHealthcheckDockerfile = `
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json ./

FROM deps AS build
COPY . .

FROM node:24-alpine AS runtime
WORKDIR /app
USER node
CMD ["node", "dist/main.js"]
`;

  const res = validateDockerfile(
    noHealthcheckDockerfile,
    "no-healthcheck.Dockerfile",
  );
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("bounded-healthcheck")));
});

test("validateDockerfile: detects secret leakage (.env copy) regression", () => {
  const secretLeakDockerfile = `
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json ./

FROM deps AS build
COPY . .

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=build /app/.env.production ./.env
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/main.js"]
`;

  const res = validateDockerfile(secretLeakDockerfile, "leak.Dockerfile");
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("layer-hygiene-zero-secrets")));
});

test("validateComposeConfig: detects hardcoded plaintext password regression", () => {
  const insecureCompose = {
    services: {
      postgres: {
        environment: {
          POSTGRES_PASSWORD: "plainTextUnsafePassword123",
        },
        networks: ["private"],
        healthcheck: { test: ["CMD", "pg_isready"] },
      },
    },
    networks: {
      private: { internal: true },
    },
  };

  const res = validateComposeConfig(insecureCompose);
  assert.equal(res.valid, false);
  assert.ok(
    res.errors.some((e) => e.includes("mandatory-secret-injection-syntax")),
  );
  assert.equal(
    res.errors.join(" ").includes("plainTextUnsafePassword123"),
    false,
  );
});

test("validateComposeConfig: accepts Garage metrics file path only with read-only source mount", () => {
  const fileMount =
    "${ACRES_GARAGE_METRICS_TOKEN_FILE:?inject Garage metrics token file path}:/run/secrets/garage_metrics_token:ro";
  const compose = {
    services: {
      garage: {
        environment: {
          GARAGE_METRICS_TOKEN_FILE: "/run/secrets/garage_metrics_token",
        },
        volumes: [fileMount],
        networks: ["private"],
        healthcheck: { test: ["CMD", "true"] },
      },
    },
    networks: { private: { internal: true } },
  };
  assert.equal(validateComposeConfig(compose).valid, true);
  compose.services.garage.volumes = [fileMount.replace(":ro", ":rw")];
  assert.ok(
    validateComposeConfig(compose).errors.some((e) =>
      e.includes("mandatory-secret-injection-syntax"),
    ),
  );
});

test("validateComposeConfig: detects datastore leaked onto public network regression", () => {
  const publicDatastoreCompose = {
    services: {
      postgres: {
        environment: {
          POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:?inject}",
        },
        networks: ["public", "private"],
        healthcheck: { test: ["CMD", "pg_isready"] },
      },
    },
    networks: {
      private: { internal: true },
    },
  };

  const res = validateComposeConfig(publicDatastoreCompose);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("datastore-network-isolation")));
});

test("validateDockerfile: detects healthcheck present in deps stage but missing in runtime stage", () => {
  const earlyHealthcheckDockerfile = `
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json ./
HEALTHCHECK --interval=30s --timeout=5s CMD true

FROM deps AS build
COPY . .

FROM node:24-alpine AS runtime
WORKDIR /app
USER node
CMD ["node", "dist/main.js"]
`;

  const res = validateDockerfile(
    earlyHealthcheckDockerfile,
    "early-healthcheck.Dockerfile",
  );
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("bounded-healthcheck")));
});

test("validateComposeConfig: detects hardcoded secrets in array-format environment and command flags", () => {
  const arrayEnvCompose = {
    services: {
      valkey: {
        environment: ["REDIS_PASSWORD=hardcodedPlaintextPassword"],
        command: ["valkey-server", "--requirepass", "plaintextBadPass"],
        networks: ["private"],
        healthcheck: { test: ["CMD", "valkey-cli", "ping"] },
      },
    },
    networks: {
      private: { internal: true },
    },
  };

  const res = validateComposeConfig(arrayEnvCompose);
  assert.equal(res.valid, false);
  assert.ok(
    res.errors.some((e) => e.includes("mandatory-secret-injection-syntax")),
  );
});

test("validateComposeConfig: detects missing internal: true on private network regression", () => {
  const openNetworkCompose = {
    services: {
      postgres: {
        environment: {
          POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:?inject}",
        },
        networks: ["private"],
        healthcheck: { test: ["CMD", "pg_isready"] },
      },
    },
    networks: {
      private: { internal: false },
    },
  };

  const res = validateComposeConfig(openNetworkCompose);
  assert.equal(res.valid, false);
  assert.ok(
    res.errors.some((e) => e.includes("private-network-internal-isolation")),
  );
});

test("validateComposeConfig: detects missing healthcheck on worker or next service regression", () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, "utf8"));
  const check = "service-healthchecks-defined";
  assert.equal(
    validateComposeConfig(original).checks.find((item) => item.check === check)
      ?.passed,
    true,
  );

  for (const svc of ["worker", "next"]) {
    const doc = structuredClone(original);
    delete doc.services[svc].healthcheck;
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.equal(
      result.checks.find((item) => item.check === check)?.passed,
      false,
    );
    assert.ok(result.errors.some((error) => error.includes(svc)));
  }
});

test("validateComposeConfig: detects internal observability and worker services leaked onto public network", () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, "utf8"));
  const check = "datastore-network-isolation";
  assert.equal(
    validateComposeConfig(original).checks.find((item) => item.check === check)
      ?.passed,
    true,
  );

  for (const svc of ["postgres-exporter", "grafana", "worker", "next"]) {
    const doc = structuredClone(original);
    doc.services[svc].networks = ["public", "private"];
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.equal(
      result.checks.find((item) => item.check === check)?.passed,
      false,
    );
    assert.ok(result.errors.some((error) => error.includes(svc)));
  }
});

test("validateComposeConfig: detects Caddy backend dependencies permitting unready condition", () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, "utf8"));
  const check = "caddy-dependencies-healthy";
  assert.equal(
    validateComposeConfig(original).checks.find((item) => item.check === check)
      ?.passed,
    true,
  );

  for (const dep of ["next", "api", "garage"]) {
    const doc = structuredClone(original);
    doc.services.caddy.depends_on[dep] = { condition: "service_started" };
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.equal(
      result.checks.find((item) => item.check === check)?.passed,
      false,
    );
    assert.ok(result.errors.some((error) => error.includes(dep)));
  }
});

test("validateComposeConfig: detects omitted critical service definition (worker, next) from full compose stack", () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, "utf8"));
  const check = "service-healthchecks-defined";

  for (const svc of ["worker", "next"]) {
    const doc = structuredClone(original);
    delete doc.services[svc];
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.equal(
      result.checks.find((item) => item.check === check)?.passed,
      false,
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes(`Required service '${svc}' is not defined`),
      ),
    );
  }
});

test("validateComposeConfig: detects missing Caddy depends_on or omitted upstream backend", () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, "utf8"));
  const check = "caddy-dependencies-healthy";

  const docNoDependsOn = structuredClone(original);
  delete docNoDependsOn.services.caddy.depends_on;
  const resNoDependsOn = validateComposeConfig(docNoDependsOn);
  assert.equal(resNoDependsOn.valid, false);
  assert.equal(
    resNoDependsOn.checks.find((item) => item.check === check)?.passed,
    false,
  );

  for (const backend of ["next", "api", "garage"]) {
    const doc = structuredClone(original);
    delete doc.services.caddy.depends_on[backend];
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.equal(
      result.checks.find((item) => item.check === check)?.passed,
      false,
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes(`missing expected backend '${backend}'`),
      ),
    );
  }
});

test("validateComposeConfig: detects missing observability dependencies or unhealthchecked Prometheus", () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, "utf8"));
  const check = "observability-dependencies-healthy";
  assert.equal(
    validateComposeConfig(original).checks.find((item) => item.check === check)
      ?.passed,
    true,
  );

  // 1. Prometheus missing healthcheck
  const docNoPromHc = structuredClone(original);
  delete docNoPromHc.services.prometheus.healthcheck;
  const resNoPromHc = validateComposeConfig(docNoPromHc);
  assert.equal(resNoPromHc.valid, false);
  assert.equal(
    resNoPromHc.checks.find((item) => item.check === check)?.passed,
    false,
  );
  assert.ok(
    resNoPromHc.errors.some((err) =>
      err.includes(
        "Service 'prometheus' must define bounded healthcheck on /-/healthy",
      ),
    ),
  );

  // 2. postgres-exporter missing depends_on postgres or permitting unready condition
  const docNoExporterDep = structuredClone(original);
  delete docNoExporterDep.services["postgres-exporter"].depends_on;
  const resNoExporterDep = validateComposeConfig(docNoExporterDep);
  assert.equal(resNoExporterDep.valid, false);
  assert.equal(
    resNoExporterDep.checks.find((item) => item.check === check)?.passed,
    false,
  );
  assert.ok(
    resNoExporterDep.errors.some((err) =>
      err.includes(
        "Service 'postgres-exporter' must depend on postgres with condition: service_healthy",
      ),
    ),
  );

  const docExporterStarted = structuredClone(original);
  docExporterStarted.services[
    "postgres-exporter"
  ].depends_on.postgres.condition = "service_started";
  const resExporterStarted = validateComposeConfig(docExporterStarted);
  assert.equal(resExporterStarted.valid, false);
  assert.equal(
    resExporterStarted.checks.find((item) => item.check === check)?.passed,
    false,
  );

  // 3. grafana missing depends_on prometheus or permitting unready condition
  const docNoGrafanaDep = structuredClone(original);
  delete docNoGrafanaDep.services.grafana.depends_on;
  const resNoGrafanaDep = validateComposeConfig(docNoGrafanaDep);
  assert.equal(resNoGrafanaDep.valid, false);
  assert.equal(
    resNoGrafanaDep.checks.find((item) => item.check === check)?.passed,
    false,
  );
  assert.ok(
    resNoGrafanaDep.errors.some((err) =>
      err.includes(
        "Service 'grafana' must depend on prometheus with condition: service_healthy",
      ),
    ),
  );

  const docGrafanaStarted = structuredClone(original);
  docGrafanaStarted.services.grafana.depends_on.prometheus.condition =
    "service_started";
  const resGrafanaStarted = validateComposeConfig(docGrafanaStarted);
  assert.equal(resGrafanaStarted.valid, false);
  assert.equal(
    resGrafanaStarted.checks.find((item) => item.check === check)?.passed,
    false,
  );
});

test("validateComposeConfig: detects missing or unready application datastore dependencies", () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, "utf8"));
  const check = "application-dependencies-healthy";
  assert.equal(
    validateComposeConfig(original).checks.find((item) => item.check === check)
      ?.passed,
    true,
  );

  // 1. API missing required dependencies
  for (const dep of ["postgres", "valkey", "garage"]) {
    const doc = structuredClone(original);
    delete doc.services.api.depends_on[dep];
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.equal(
      result.checks.find((item) => item.check === check)?.passed,
      false,
    );
    assert.ok(
      result.errors.some((err) =>
        err.includes(
          `Service 'api' depends_on is missing expected backend '${dep}'`,
        ),
      ),
    );
  }

  // 2. API dependency permits unready condition
  const docApiStarted = structuredClone(original);
  docApiStarted.services.api.depends_on.postgres.condition = "service_started";
  const resApiStarted = validateComposeConfig(docApiStarted);
  assert.equal(resApiStarted.valid, false);
  assert.equal(
    resApiStarted.checks.find((item) => item.check === check)?.passed,
    false,
  );
  assert.ok(
    resApiStarted.errors.some((err) =>
      err.includes(
        "Service 'api' dependency 'postgres' must require condition: service_healthy",
      ),
    ),
  );

  // 3. Worker missing required dependencies
  for (const dep of ["postgres", "valkey", "garage", "clamav"]) {
    const doc = structuredClone(original);
    delete doc.services.worker.depends_on[dep];
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.equal(
      result.checks.find((item) => item.check === check)?.passed,
      false,
    );
    assert.ok(
      result.errors.some((err) =>
        err.includes(
          `Service 'worker' depends_on is missing expected backend '${dep}'`,
        ),
      ),
    );
  }

  // 4. Worker dependency permits unready condition
  const docWorkerStarted = structuredClone(original);
  docWorkerStarted.services.worker.depends_on.clamav.condition =
    "service_started";
  const resWorkerStarted = validateComposeConfig(docWorkerStarted);
  assert.equal(resWorkerStarted.valid, false);
  // 5. API extra dependency permits unready condition
  const docApiExtraUnready = structuredClone(original);
  docApiExtraUnready.services.api.depends_on.unready_backend = {
    condition: "service_started",
  };
  const resApiExtra = validateComposeConfig(docApiExtraUnready);
  assert.equal(resApiExtra.valid, false);
  assert.equal(
    resApiExtra.checks.find((item) => item.check === check)?.passed,
    false,
  );
  assert.ok(
    resApiExtra.errors.some((err) =>
      err.includes(
        "Service 'api' dependency 'unready_backend' must require condition: service_healthy",
      ),
    ),
  );
});

test("validateComposeConfig: detects missing init: true or stop_signal: SIGTERM on application services", () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, "utf8"));
  const check = "process-init-supervision";
  assert.equal(
    validateComposeConfig(original).checks.find((item) => item.check === check)
      ?.passed,
    true,
  );

  for (const svc of ["api", "worker", "next"]) {
    // Missing init: true
    const docNoInit = structuredClone(original);
    delete docNoInit.services[svc].init;
    const resNoInit = validateComposeConfig(docNoInit);
    assert.equal(resNoInit.valid, false);
    assert.equal(
      resNoInit.checks.find((item) => item.check === check)?.passed,
      false,
    );
    assert.ok(
      resNoInit.errors.some((err) =>
        err.includes(`Service '${svc}' should configure init: true`),
      ),
    );

    // Missing or invalid stop_signal
    const docBadSignal = structuredClone(original);
    docBadSignal.services[svc].stop_signal = "SIGKILL";
    const resBadSignal = validateComposeConfig(docBadSignal);
    assert.equal(resBadSignal.valid, false);
    assert.equal(
      resBadSignal.checks.find((item) => item.check === check)?.passed,
      false,
    );
    assert.ok(
      resBadSignal.errors.some((err) =>
        err.includes(`Service '${svc}' should configure stop_signal: SIGTERM`),
      ),
    );
  }
});

test("validateComposeConfig: detects missing restart policy or drifted stop_grace_period", () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, "utf8"));
  const check = "graceful-shutdown-lifecycle";
  assert.equal(
    validateComposeConfig(original).checks.find((item) => item.check === check)
      ?.passed,
    true,
  );

  // 1. Missing restart: unless-stopped on a service
  const docNoRestart = structuredClone(original);
  delete docNoRestart.services.postgres.restart;
  const resNoRestart = validateComposeConfig(docNoRestart);
  assert.equal(resNoRestart.valid, false);
  assert.equal(
    resNoRestart.checks.find((item) => item.check === check)?.passed,
    false,
  );
  assert.ok(
    resNoRestart.errors.some((err) =>
      err.includes("Service 'postgres' must configure restart: unless-stopped"),
    ),
  );

  // 2. Drifted stop_grace_period on application service
  const docDriftGrace = structuredClone(original);
  docDriftGrace.services.worker.stop_grace_period = "10s";
  const resDriftGrace = validateComposeConfig(docDriftGrace);
  assert.equal(resDriftGrace.valid, false);
  assert.equal(
    resDriftGrace.checks.find((item) => item.check === check)?.passed,
    false,
  );
  assert.ok(
    resDriftGrace.errors.some((err) =>
      err.includes(
        "Service 'worker' stop_grace_period is '10s', expected '60s'",
      ),
    ),
  );

  // 3. Missing stop_grace_period on a stateful service
  const docNoGrace = structuredClone(original);
  delete docNoGrace.services.garage.stop_grace_period;
  const resNoGrace = validateComposeConfig(docNoGrace);
  assert.equal(resNoGrace.valid, false);
  assert.equal(
    resNoGrace.checks.find((item) => item.check === check)?.passed,
    false,
  );
  assert.ok(
    resNoGrace.errors.some((err) =>
      err.includes(
        "Service 'garage' must define a positive bounded stop_grace_period",
      ),
    ),
  );

  // 4. Zero stop_grace_period ('0s') rejected
  const docZeroGrace = structuredClone(original);
  docZeroGrace.services.postgres.stop_grace_period = "0s";
  const resZeroGrace = validateComposeConfig(docZeroGrace);
  assert.equal(resZeroGrace.valid, false);
  assert.equal(
    resZeroGrace.checks.find((item) => item.check === check)?.passed,
    false,
  );
  assert.ok(
    resZeroGrace.errors.some((err) =>
      err.includes(
        "Service 'postgres' must define a positive bounded stop_grace_period",
      ),
    ),
  );
});

test("verifyContainerSecurity CLI: --output and -o create structured JSON evidence file matching schema", () => {
  const os = require("node:os");
  const { execFileSync } = require("node:child_process");
  const tmpDir = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "container-cli-test-"),
  );
  try {
    const scriptPath = path.join(__dirname, "verify-container-security.js");
    const outPath1 = path.join(tmpDir, "container-security-evidence-1.json");
    execFileSync(process.execPath, [scriptPath, "--output", outPath1], {
      cwd: path.resolve(__dirname, "../.."),
      encoding: "utf8",
    });

    assert.ok(fs.existsSync(outPath1), "evidence file 1 must be created");
    const evidence1 = JSON.parse(fs.readFileSync(outPath1, "utf8"));
    assert.equal(evidence1.drill_type, "container_security_verification");
    assert.match(evidence1.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.equal(evidence1.status, "success");
    assert.equal(evidence1.valid, true);
    assert.deepEqual(evidence1.errors, []);
    assert.ok(Array.isArray(evidence1.checks));
    assert.ok(evidence1.checks.length >= 17);
    assert.ok(evidence1.checks.every((c) => c.passed === true));
    assert.equal(evidence1.failedChecks, 0);

    const outPath2 = path.join(tmpDir, "container-security-evidence-2.json");
    execFileSync(process.execPath, [scriptPath, "-o", outPath2], {
      cwd: path.resolve(__dirname, "../.."),
      encoding: "utf8",
    });
    assert.ok(
      fs.existsSync(outPath2),
      "evidence file 2 must be created via -o",
    );
    const evidence2 = JSON.parse(fs.readFileSync(outPath2, "utf8"));
    assert.equal(evidence2.drill_type, "container_security_verification");
    assert.equal(evidence2.status, "success");
    assert.equal(evidence2.valid, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Hermetic installed-CLI tests: no inherited credentials or external services.
const os = require("node:os");
const { spawnSync, spawn } = require("node:child_process");
function installation(t) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "container private paths-"),
  );
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const script = path.join(dir, "scripts/ops/verify-container-security.js");
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(path.join(__dirname, "verify-container-security.js"), script);
  for (const pkg of ["js-yaml", "argparse"]) {
    const from = path.dirname(require.resolve(`${pkg}/package.json`));
    fs.cpSync(from, path.join(dir, "node_modules", pkg), { recursive: true });
  }
  for (const [from, to] of [
    [SERVER_DOCKERFILE, "server/Dockerfile"],
    [CLIENT_DOCKERFILE, "infra/docker/client.Dockerfile.example"],
    [COMPOSE_FILE, "infra/compose/docker-compose.production.example.yml"],
  ]) {
    const dest = path.join(dir, to);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(from, dest);
  }
  const cwd = path.join(dir, "caller");
  fs.mkdirSync(cwd);
  const env = { PATH: "/usr/bin:/bin", TMPDIR: os.tmpdir() };
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
      { cwd, env, encoding: "utf8", timeout: 8000, maxBuffer: 4 * 1024 * 1024 },
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
    server: path.join(dir, "server/Dockerfile"),
  };
}
const rejectWork = `const old=fs.openSync;fs.openSync=function(p,...args){if(String(p).endsWith('Dockerfile')||String(p).endsWith('.yml'))throw Error('CanaryRead');return old.call(this,p,...args)};fs.mkdirSync=()=>{throw Error('CanaryAllocate')};`;
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
    assert.equal(r.stderr, "Container invocation failed\n");
    assert.deepEqual(fs.readdirSync(f.cwd), []);
  });
for (const flag of ["--help", "-h"])
  test(`standalone ${flag} has no evaluation/allocation`, (t) => {
    const r = installation(t).execute([flag], rejectWork);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Static template checks/);
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
for (const value of [
  null,
  [],
  "x",
  1,
  { rootDir: "" },
  { rootDir: null },
  { serverDockerPath: undefined },
  { clientDockerPath: 5 },
  { composePath: "bad\npath" },
])
  test(`direct invalid options fail before reads ${JSON.stringify(value)}`, () => {
    const old = fs.statSync;
    fs.statSync = () => {
      throw Error("CanaryRead");
    };
    try {
      assert.throws(
        () => verifyContainerSecurity(value),
        /^Error: Container invocation failed$/,
      );
    } finally {
      fs.statSync = old;
    }
  });
for (const args of [
  ["--output", "space name.json"],
  ["-o=space name.json"],
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
    assert.equal(report.totalChecks, 22);
    assert.equal(report.valid, true);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(report.failedChecks, 0);
  });
test("no-save never allocates output and default sources ignore caller cwd", (t) => {
  const f = installation(t),
    r = f.execute(
      ["--json"],
      `fs.mkdirSync=()=>{throw Error('allocate')};fs.writeSync=()=>{throw Error('write')};`,
    );
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).totalChecks, 22);
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
    assert.equal(r.stderr, "Container publication failed\n");
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
    assert.equal(r.stderr, "Container publication failed\n");
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
      "parent-removed": `const old=fs.openSync;let once=true;fs.openSync=(p,...a)=>{const fd=old(p,...a);if(once&&String(p).endsWith('Dockerfile')){once=false;fs.rmdirSync(path.join(base,'caller'))}return fd};`,
      "parent-replaced": `const old=fs.openSync;let once=true;fs.openSync=(p,...a)=>{const fd=old(p,...a);if(once&&String(p).endsWith('Dockerfile')){once=false;fs.renameSync(path.join(base,'caller'),path.join(base,'retained'));fs.mkdirSync(path.join(base,'caller'))}return fd};`,
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
  test(`source handling ${source}`, (t) => {
    const f = installation(t);
    if (source === "missing") fs.unlinkSync(f.compose);
    if (source === "malformed") fs.writeFileSync(f.compose, "Canary: [");
    if (source === "oversize")
      fs.writeFileSync(f.compose, "#".repeat(1024 * 1024 + 1));
    if (source === "directory") {
      fs.unlinkSync(f.compose);
      fs.mkdirSync(f.compose);
    }
    if (source === "fifo") {
      fs.unlinkSync(f.compose);
      assert.equal(spawnSync("/usr/bin/mkfifo", [f.compose]).status, 0);
    }
    if (source === "cycle")
      fs.writeFileSync(
        f.compose,
        "services: &a {private: *a}\nnetworks: {private: {internal: true}}",
      );
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
        JSON.stringify({
          services: { p: {} },
          networks: { private: { internal: true } },
          extra: Array(10001).fill(0),
        }),
      );
    if (source === "symlink") {
      fs.renameSync(f.compose, f.compose + ".source");
      fs.symlinkSync(f.compose + ".source", f.compose);
    }
    const r = f.execute(["--json", "--output", f.output]);
    assert.equal(r.status, source === "symlink" ? 0 : 1, r.stderr);
    if (["oversize", "directory", "fifo"].includes(source)) {
      assert.equal(r.stdout, "");
      assert.equal(r.stderr, "Container evaluation failed\n");
      assert.equal(fs.existsSync(f.output), false);
    } else {
      const report = JSON.parse(r.stdout);
      assert.equal(report.valid, source === "symlink");
      assert.equal(report.status, source === "symlink" ? "success" : "failed");
      assert.deepEqual(report, JSON.parse(fs.readFileSync(f.output, "utf8")));
    }
    assert.ok(!r.stderr.includes("Canary"));
  });
for (const mutate of [
  (d) => (d.services = null),
  (d) => (d.services = []),
  (d) => (d.services.postgres = null),
  (d) => (d.services.postgres.environment = 3),
  (d) => (d.services.postgres.environment = { PASSWORD: {} }),
  (d) => (d.services.postgres.command = [null]),
  (d) => (d.services.postgres.volumes = [null]),
  (d) => (d.services.postgres.healthcheck = { test: [null] }),
  (d) => (d.services.api.depends_on = { postgres: null }),
  (d) => (d.networks = []),
  (d) => (d.networks.private = 4),
])
  test(`malformed dereferenced Compose shape ${mutate}`, () => {
    const d = yaml.load(fs.readFileSync(COMPOSE_FILE, "utf8"));
    mutate(d);
    const r = validateComposeConfig(d);
    assert.equal(r.valid, false);
    assert.deepEqual(r.checks, []);
    assert.deepEqual(r.errors, ["Invalid Compose structure"]);
  });
test("small valid fixtures and ordinary finite aliases retain established policy", () => {
  const d = yaml.load(
    "services: {one: &a {networks: [private], healthcheck: {test: [CMD, true]}} , two: *a}\nnetworks: {private: {internal: true}}",
  );
  d.services.one.healthcheck.test[1] = "true";
  assert.equal(validateComposeConfig(d).valid, true);
  assert.equal(
    validateComposeConfig({
      services: {},
      networks: { private: { internal: true } },
    }).valid,
    false,
  );
});
test("pure Docker helpers reject wrong types with controlled errors", () => {
  for (const v of [null, {}, [], 3]) {
    assert.throws(() => parseDockerfile(v), /Container evaluation failed/);
    assert.throws(() => validateDockerfile(v), /Container evaluation failed/);
  }
  assert.throws(
    () => validateDockerfile("", null),
    /Container evaluation failed/,
  );
});
for (const family of [
  "docker",
  "networks",
  "credentials",
  "healthchecks",
  "caddy",
  "observability",
  "applications",
  "init",
  "drain",
])
  test(`CLI projection excludes private values in ${family} predicate errors`, (t) => {
    const f = installation(t),
      canary = "CanaryPrivateMaterial";
    const d = yaml.load(fs.readFileSync(f.compose, "utf8"));
    const mutations = {
      networks: () => {
        d.services[canary] = {
          networks: ["public"],
          restart: canary,
          stop_grace_period: canary,
        };
      },
      credentials: () => {
        d.services.postgres.environment["SECRET_" + canary] = canary;
        d.services.postgres.command = ["--requirepass", canary];
      },
      healthchecks: () => {
        delete d.services.worker.healthcheck;
      },
      caddy: () => {
        d.services.caddy.depends_on[canary] = { condition: canary };
      },
      observability: () => {
        d.services.prometheus.healthcheck.test = [canary];
        d.services["postgres-exporter"].depends_on.postgres.condition = canary;
      },
      applications: () => {
        d.services.api.depends_on[canary] = { condition: canary };
      },
      init: () => {
        d.services.worker.stop_signal = canary;
        d.services.worker.init = false;
      },
      drain: () => {
        d.services.worker.stop_grace_period = canary;
        d.services.worker.restart = canary;
      },
      docker: () => {
        fs.writeFileSync(
          f.server,
          fs
            .readFileSync(f.server, "utf8")
            .replace("USER node", "USER " + canary) +
            "\nENV SECRET=" +
            canary +
            "\n",
        );
      },
    };
    mutations[family]();
    fs.writeFileSync(f.compose, yaml.dump(d));
    const before = verifyContainerSecurity({ rootDir: f.dir });
    const snapshot = structuredClone(before);
    const r = f.execute(["--json", "--output", f.output]);
    assert.equal(r.status, 1, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.valid, false);
    assert.ok(
      ![r.stdout, r.stderr, fs.readFileSync(f.output, "utf8")]
        .join("")
        .includes(canary),
    );
    assert.deepEqual(before, snapshot);
    const human = f.execute();
    assert.equal(human.status, 1);
    assert.ok(!human.stdout.includes(canary));
    assert.match(human.stdout, /Gate: FAILED/);
    const { validateSupplyChainEvidence } = require("./check-launch-readiness");
    const blockers = [];
    assert.equal(
      validateSupplyChainEvidence(
        report,
        "receipt.json",
        (_c, m) => blockers.push(m),
        "supply_chain",
      ),
      false,
    );
    assert.ok(!blockers.join("").includes(canary));
  });
for (const fault of ["growth", "read", "close", "fifo-replacement"])
  test(`source fault and owned closure ${fault}`, (t) => {
    const f = installation(t),
      hook = {
        growth: `const old=fs.readSync;fs.readSync=(fd,...a)=>{const n=old(fd,...a);if(n>0)fs.appendFileSync(path.join(base,'server/Dockerfile'),'growth');return n};`,
        read: `fs.readSync=()=>{throw Error('CanaryRead')};`,
        close: `const old=fs.closeSync;let once=true;fs.closeSync=fd=>{if(once){once=false;throw Error('CanaryClose')}return old(fd)};`,
        "fifo-replacement": `const old=fs.openSync;fs.openSync=(p,...a)=>{if(String(p).endsWith('Dockerfile')){fs.unlinkSync(p);require('child_process').execFileSync('/usr/bin/mkfifo',[p]);}return old(p,...a)};`,
      }[fault];
    const r = f.execute(["--json"], hook);
    assert.equal(r.status, 1);
    assert.equal(r.stderr, "Container evaluation failed\n");
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
test("failed finite large JSON drains completely", (t) => {
  const f = installation(t),
    d = yaml.load(fs.readFileSync(f.compose, "utf8"));
  for (let i = 0; i < 700; i++)
    d.services["service" + i] = {
      networks: ["public"],
      restart: "bad",
      stop_grace_period: "bad",
      command: "--requirepass private",
    };
  fs.writeFileSync(f.compose, yaml.dump(d));
  const r = f.execute(["--json"]);
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stdout.length > 65536);
  const report = JSON.parse(r.stdout);
  assert.equal(report.valid, false);
  assert.ok(report.errors.length > 1000);
});
test("save byte ceiling rejects before directory allocation", (t) => {
  const f = installation(t);
  const r = f.execute(
    ["--output", "new/receipt.json"],
    `const old=JSON.stringify;JSON.stringify=(v,...a)=>{const s=old(v,...a);return v?.drill_type?s+' '.repeat(1024*1024):s};fs.mkdirSync=()=>{throw Error('CanaryAllocation')};`,
  );
  assert.equal(r.status, 1);
  assert.equal(r.stderr, "Container serialization failed\n");
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
  assert.equal(stderr, "Container output failed\n");
});

test("valid custom/relative source options retain caller semantics and read-only exports", (t) => {
  const f = installation(t),
    old = process.cwd();
  try {
    process.chdir(f.dir);
    const r = verifyContainerSecurity({
      rootDir: ".",
      serverDockerPath: "server/Dockerfile",
      clientDockerPath: "infra/docker/client.Dockerfile.example",
      composePath: "infra/compose/docker-compose.production.example.yml",
    });
    assert.equal(r.valid, true);
    assert.equal(r.checks.length, 22);
    assert.deepEqual(
      Object.keys(require("./verify-container-security")).sort(),
      [
        "parseDockerfile",
        "validateComposeConfig",
        "validateDockerfile",
        "verifyContainerSecurity",
      ].sort(),
    );
  } finally {
    process.chdir(old);
  }
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
      assert.equal(r.stderr, "Container cleanup failed\n");
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
    `const open=fs.openSync,close=fs.closeSync;let fd,attempts=0;fs.openSync=(p,...a)=>{const x=open(p,...a);if(String(p).endsWith('Dockerfile'))fd=x;return x};fs.readSync=()=>{throw Error('CanaryRead')};fs.closeSync=x=>{if(x===fd&&++attempts===1)throw Error('CanaryClose');return close(x)};process.on('exit',()=>fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({attempts,closed:(()=>{try{fs.fstatSync(fd);return false}catch{return true}})()})));`,
  );
  assert.equal(r.status, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(marker, "utf8")), {
    attempts: 2,
    closed: true,
  });
  assert.equal(r.stderr, "Container evaluation failed\n");
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

test("optional observability checks retain variable successful check counts", (t) => {
  const f = installation(t),
    d = yaml.load(fs.readFileSync(f.compose, "utf8"));
  for (const key of ["prometheus", "postgres-exporter", "grafana"])
    delete d.services[key];
  fs.writeFileSync(f.compose, yaml.dump(d));
  const r = f.execute(["--json"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).totalChecks, 21);
  assert.equal(JSON.parse(r.stdout).valid, true);
});

for (const field of ["stop_signal", "restart", "stop_grace_period", "init"])
  test(`malformed lifecycle ${field} returns and saves complete safe failure`, (t) => {
    const f = installation(t),
      d = yaml.load(fs.readFileSync(f.compose, "utf8"));
    d.services.api[field] = { toString: null, CanaryPrivate: "private" };
    const direct = validateComposeConfig(d);
    assert.deepEqual(direct, {
      valid: false,
      errors: ["Invalid Compose structure"],
      checks: [],
    });
    fs.writeFileSync(f.compose, yaml.dump(d));
    const r = f.execute(["--json", "--output", f.output]);
    assert.equal(r.status, 1, r.stderr);
    assert.equal(r.stderr, "");
    const receipt = JSON.parse(r.stdout);
    assert.equal(receipt.valid, false);
    assert.equal(receipt.status, "failed");
    assert.deepEqual(receipt, JSON.parse(fs.readFileSync(f.output, "utf8")));
    assert.ok(!r.stdout.includes("CanaryPrivate"));
    // Scalar failures still reach the established predicates and complete their checks.
    for (const scalar of [null, false, 42, "invalid"]) {
      const original = yaml.load(fs.readFileSync(COMPOSE_FILE, "utf8"));
      original.services.api[field] = scalar;
      const result = validateComposeConfig(original);
      assert.equal(result.valid, false);
      assert.equal(result.checks.length, 10);
      assert.ok(result.checks.some((c) => !c.passed));
    }
  });
