const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync, spawn } = require("node:child_process");
const {
  parseCaddyfile,
  evaluateRoute,
  verifyCaddyfile,
  DEFAULT_CADDYFILE_PATH,
} = require("./verify-caddy-routing");

test("verifyCaddyfile: parses reference Caddyfile.example cleanly with zero errors", () => {
  const result = verifyCaddyfile(DEFAULT_CADDYFILE_PATH);

  assert.strictEqual(
    result.valid,
    true,
    `Verification failed with errors: ${result.errors.join("; ")}`,
  );
  assert.strictEqual(result.errors.length, 0);
  assert.ok(result.parsedConfig);
  assert.strictEqual(result.parsedConfig.globalBlock.admin, "off");
  assert.ok(result.parsedConfig.globalBlock.email);
  assert.strictEqual(result.evaluatedRoutes.length, 12);
  assert.ok(result.evaluatedRoutes.every((r) => r.passed));
});

test("evaluateRoute: accurately routes API endpoints to api:3001 with proxy headers", () => {
  const result = verifyCaddyfile(DEFAULT_CADDYFILE_PATH);
  const apiPaths = [
    "/api/v1/auth/session",
    "/api/v1/organizations",
    "/api/v1/analytics/query",
    "/api/v1/reports/rep-123/export",
    "/graphql",
    "/health",
    "/health/ready",
  ];

  for (const path of apiPaths) {
    const route = evaluateRoute(result.parsedConfig, path);
    assert.strictEqual(route.upstream, "api:3001");
    assert.strictEqual(route.upstreamName, "api");
    assert.strictEqual(route.matcher, "@api");
    assert.strictEqual(route.headersUp["X-Forwarded-Host"], "{host}");
    assert.strictEqual(route.headersUp["X-Forwarded-Proto"], "{scheme}");
    assert.strictEqual(
      route.responseHeaders["X-Content-Type-Options"],
      "nosniff",
    );
    assert.strictEqual(route.responseHeaders["X-Frame-Options"], "DENY");
    assert.ok(route.removedResponseHeaders.includes("Server"));
  }
});

test("evaluateRoute: accurately routes quarantine storage objects to garage:3900 with SigV4 Host header", () => {
  const result = verifyCaddyfile(DEFAULT_CADDYFILE_PATH);
  const objectPaths = [
    "/acres-quarantine/temp-123/file.csv",
    "/acres-quarantine/organizations/org-1/uploads/test.csv",
    "/acres-quarantine/exports/exp-999.csv",
  ];

  for (const path of objectPaths) {
    const route = evaluateRoute(result.parsedConfig, path);
    assert.strictEqual(route.upstream, "garage:3900");
    assert.strictEqual(route.upstreamName, "objects");
    assert.strictEqual(route.matcher, "@objects");
    // Critical S3 SigV4 invariant: Host header MUST be preserved
    assert.strictEqual(route.headersUp["Host"], "{host}");
    assert.strictEqual(
      route.transport.read_timeout,
      "{$ACRES_OBJECT_READ_TIMEOUT}",
    );
  }
});

test("evaluateRoute: routes all frontend application and static assets to next:3000", () => {
  const result = verifyCaddyfile(DEFAULT_CADDYFILE_PATH);
  const nextPaths = [
    "/",
    "/login",
    "/register",
    "/app",
    "/app/dashboards",
    "/app/datasets",
    "/app/reports",
    "/app/members",
    "/_next/static/chunks/main-app.js",
    "/_next/image?url=%2Fhero.png&w=1280&q=75",
    "/favicon.ico",
    "/site.webmanifest",
  ];

  for (const path of nextPaths) {
    const route = evaluateRoute(result.parsedConfig, path);
    assert.strictEqual(route.upstream, "next:3000");
    assert.strictEqual(route.upstreamName, "next");
    assert.strictEqual(route.matcher, null);
    assert.strictEqual(route.matchedPattern, "*");
    assert.strictEqual(
      route.transport.read_timeout,
      "{$ACRES_NEXT_READ_TIMEOUT}",
    );
  }
});

test("verifyCaddyfile: enforces edge security headers and banner removal", () => {
  // Test missing X-Frame-Options
  const missingHeaderConfig = `
{
  admin off
  email test@example.com
}
example.com {
  encode zstd gzip
  header {
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
  request_body {
    max_size 10MB
  }
  @api path /api/* /graphql /health /health/ready
  reverse_proxy @api api:3001 {
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  @objects path /acres-quarantine/*
  reverse_proxy @objects garage:3900 {
    header_up Host {host}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  reverse_proxy next:3000 {
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
}
`;

  const missingHeaderResult = verifyCaddyfile(missingHeaderConfig);
  assert.strictEqual(missingHeaderResult.valid, false);
  assert.ok(
    missingHeaderResult.errors.some((e) => e.includes("X-Frame-Options")),
  );

  // Test missing -Server
  const missingServerRemovalConfig = missingHeaderConfig.replace("-Server", "");
  const missingServerResult = verifyCaddyfile(missingServerRemovalConfig);
  assert.strictEqual(missingServerResult.valid, false);
  assert.ok(missingServerResult.errors.some((e) => e.includes("-Server")));
});

test("verifyCaddyfile: enforces S3 SigV4 Host header preservation on Garage", () => {
  const missingHostUpConfig = `
{
  admin off
  email test@example.com
}
example.com {
  encode zstd gzip
  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
  request_body {
    max_size 10MB
  }
  @api path /api/* /graphql /health /health/ready
  reverse_proxy @api api:3001 {
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  @objects path /acres-quarantine/*
  reverse_proxy @objects garage:3900 {
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  reverse_proxy next:3000 {
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
}
`;

  const result = verifyCaddyfile(missingHostUpConfig);
  assert.strictEqual(result.valid, false);
  assert.ok(
    result.errors.some(
      (e) => e.includes("SigV4") || e.includes("header_up Host"),
    ),
  );
});

test("verifyCaddyfile: enforces proxy headers (X-Forwarded-Host / Proto) on API", () => {
  const missingProxyHeadersConfig = `
{
  admin off
  email test@example.com
}
example.com {
  encode zstd gzip
  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
  request_body {
    max_size 10MB
  }
  @api path /api/* /graphql /health /health/ready
  reverse_proxy @api api:3001 {
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  @objects path /acres-quarantine/*
  reverse_proxy @objects garage:3900 {
    header_up Host {host}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  reverse_proxy next:3000 {
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
}
`;

  const result = verifyCaddyfile(missingProxyHeadersConfig);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("X-Forwarded-Host")));
});

test("verifyCaddyfile: enforces transport timeouts across all backends", () => {
  const missingTimeoutConfig = `
{
  admin off
  email test@example.com
}
example.com {
  encode zstd gzip
  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
  request_body {
    max_size 10MB
  }
  @api path /api/* /graphql /health /health/ready
  reverse_proxy @api api:3001 {
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  @objects path /acres-quarantine/*
  reverse_proxy @objects garage:3900 {
    header_up Host {host}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  reverse_proxy next:3000 {
    transport http {
      dial_timeout 10s
    }
  }
}
`;

  const result = verifyCaddyfile(missingTimeoutConfig);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("timeout")));
});

test("verifyCaddyfile: HSTS gate invariant verification", () => {
  // 1. Reference Caddyfile has HSTS commented out
  const refResult = verifyCaddyfile(DEFAULT_CADDYFILE_PATH);
  assert.strictEqual(refResult.valid, true);

  // 2. Active HSTS without operator approval triggers fail-closed error
  const activeHstsConfig = `
{
  admin off
  email test@example.com
}
example.com {
  encode zstd gzip
  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
  header Strict-Transport-Security "max-age=31536000; includeSubDomains"
  request_body {
    max_size 10MB
  }
  @api path /api/* /graphql /health /health/ready
  reverse_proxy @api api:3001 {
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  @objects path /acres-quarantine/*
  reverse_proxy @objects garage:3900 {
    header_up Host {host}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  reverse_proxy next:3000 {
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
}
`;

  const unapprovedResult = verifyCaddyfile(activeHstsConfig);
  assert.strictEqual(unapprovedResult.valid, false);
  assert.ok(
    unapprovedResult.errors.some((e) =>
      e.includes("HSTS gate invariant violated"),
    ),
  );

  // 3. Approved HSTS with allowHsts: true passes
  const approvedResult = verifyCaddyfile(activeHstsConfig, { allowHsts: true });
  assert.strictEqual(approvedResult.valid, true);
});

test("verifyCaddyfile: fails closed on corrupted syntax or missing fallback", () => {
  // Empty content
  assert.strictEqual(verifyCaddyfile("").valid, false);

  // Missing fallback proxy
  const noFallbackConfig = `
{
  admin off
  email test@example.com
}
example.com {
  encode zstd gzip
  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
  request_body {
    max_size 10MB
  }
  @api path /api/* /graphql /health /health/ready
  reverse_proxy @api api:3001 {
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
}
`;
  const noFallbackResult = verifyCaddyfile(noFallbackConfig);
  assert.strictEqual(noFallbackResult.valid, false);
  assert.ok(noFallbackResult.errors.some((e) => e.includes("fallback")));
});

test("verifyCaddyfile: throws clear error when target path does not exist", () => {
  assert.throws(
    () => verifyCaddyfile("infra/caddy/non-existent-caddyfile.example"),
    /Caddyfile not found at path: "infra\/caddy\/non-existent-caddyfile.example"/,
  );
});

test("parseCaddyfile: preserves quoted hashtags inside header directives", () => {
  const config = `
{
  admin off
  email test@example.com
}
example.com {
  encode zstd gzip
  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    X-Custom "value # with hash" # this is a comment
    -Server
  }
  request_body {
    max_size 10MB
  }
  @api path /api/*
  reverse_proxy @api api:3001 {
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  reverse_proxy next:3000 {
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
}
`;
  const parsed = parseCaddyfile(config);
  assert.strictEqual(
    parsed.siteBlocks[0].headers["X-Custom"],
    "value # with hash",
  );
});

test("verify-caddy-routing CLI: --output writes valid structured drill evidence", () => {
  const { execFileSync } = require("node:child_process");
  const fs = require("node:fs");
  const os = require("node:os");
  const tmpDir = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "caddy-routing-test-"),
  );
  try {
    const outPath = path.join(tmpDir, "caddy-routing-evidence.json");
    const scriptPath = path.join(__dirname, "verify-caddy-routing.js");
    execFileSync(process.execPath, [scriptPath, "--output", outPath], {
      cwd: path.resolve(__dirname, "../.."),
      encoding: "utf8",
    });

    assert.ok(fs.existsSync(outPath), "Evidence file should be created");
    const content = JSON.parse(fs.readFileSync(outPath, "utf8"));
    assert.strictEqual(
      content.drill_type,
      "caddy_routing_and_tls_verification",
    );
    assert.strictEqual(content.status, "success");
    assert.strictEqual(content.valid, true);
    assert.ok(content.timestamp);
    assert.strictEqual(content.securityHeadersVerified, true);
    assert.strictEqual(content.s3SigV4HostPreserved, true);
    assert.strictEqual(content.proxyHeadersVerified, true);
    assert.ok(content.routesEvaluated >= 12);
    assert.strictEqual(content.routesPassed, content.routesEvaluated);
    assert.ok(Array.isArray(content.evaluatedRoutes));
    assert.ok(content.evaluatedRoutes.every((r) => r.passed));
    assert.deepStrictEqual(content.errors, []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("verify-caddy-routing CLI: --json outputs valid JSON to stdout", () => {
  const { execFileSync } = require("node:child_process");
  const scriptPath = path.join(__dirname, "verify-caddy-routing.js");
  const stdout = execFileSync(process.execPath, [scriptPath, "--json"], {
    cwd: path.resolve(__dirname, "../.."),
    encoding: "utf8",
  });

  const parsed = JSON.parse(stdout);
  assert.strictEqual(parsed.drill_type, "caddy_routing_and_tls_verification");
  assert.strictEqual(parsed.execution_mode, "simulation");
  assert.strictEqual(parsed.status, "success");
  assert.strictEqual(parsed.valid, true);
  assert.strictEqual(parsed.securityHeadersVerified, true);
  assert.strictEqual(parsed.s3SigV4HostPreserved, true);
  assert.strictEqual(parsed.proxyHeadersVerified, true);
  assert.ok(parsed.routesEvaluated >= 12);
  assert.strictEqual(parsed.routesPassed, parsed.routesEvaluated);
});

test("verify-caddy-routing CLI: --help displays usage and exits with 0", () => {
  const { execFileSync } = require("node:child_process");
  const scriptPath = path.join(__dirname, "verify-caddy-routing.js");
  const stdout = execFileSync(process.execPath, [scriptPath, "--help"], {
    cwd: path.resolve(__dirname, "../.."),
    encoding: "utf8",
  });

  assert.ok(stdout.includes("Usage: node scripts/ops/verify-caddy-routing.js"));
  assert.ok(stdout.includes("--output"));
  assert.ok(stdout.includes("--json"));
});

test("verify-caddy-routing CLI: rejects unknown options and missing output path", () => {
  const { spawnSync } = require("node:child_process");
  const scriptPath = path.join(__dirname, "verify-caddy-routing.js");
  for (const args of [["--bogus"], ["--output"], ["--output", "--json"]]) {
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
      cwd: path.resolve(__dirname, "../.."),
      encoding: "utf8",
    });
    assert.strictEqual(result.status, 1);
    assert.strictEqual(result.stderr, "Caddy invocation failed\n");
  }
});

test("verify-caddy-routing CLI: approved active HSTS requires --allow-hsts", () => {
  const { spawnSync } = require("node:child_process");
  const fs = require("node:fs");
  const os = require("node:os");
  const tmpDir = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "caddy-hsts-test-"),
  );
  try {
    const target = path.join(tmpDir, "Caddyfile.production");
    const source = fs
      .readFileSync(DEFAULT_CADDYFILE_PATH, "utf8")
      .replace("{$ACRES_PRODUCTION_DOMAIN}", "acres.example.com")
      .replace("{$ACRES_TLS_CONTACT_EMAIL}", "ops@example.com")
      .replace(
        "# header Strict-Transport-Security",
        "header Strict-Transport-Security",
      )
      .replace("{$ACRES_HSTS_MAX_AGE}", "31536000");
    fs.writeFileSync(target, source);
    const scriptPath = path.join(__dirname, "verify-caddy-routing.js");
    const denied = spawnSync(process.execPath, [scriptPath, target, "--json"], {
      encoding: "utf8",
    });
    assert.strictEqual(denied.status, 1);
    assert.strictEqual(JSON.parse(denied.stdout).hstsApproved, false);

    const approved = spawnSync(
      process.execPath,
      [scriptPath, target, "--allow-hsts", "--json"],
      { encoding: "utf8" },
    );
    assert.strictEqual(approved.status, 0, approved.stderr || approved.stdout);
    const report = JSON.parse(approved.stdout);
    assert.strictEqual(report.status, "success");
    assert.strictEqual(report.domain, "acres.example.com");
    assert.strictEqual(report.hstsApproved, true);
    const { validateCaddyRoutingReport } = require("./check-launch-readiness");
    const context = {
      expectedSection: { domain: "acres.example.com", hsts_approved: true },
    };
    assert.strictEqual(
      validateCaddyRoutingReport(
        report,
        new Date(),
        "acres.example.com",
        context,
      ),
      true,
    );
    assert.strictEqual(
      validateCaddyRoutingReport(report, new Date(), "acres.example.com", {
        ...context,
        requireLive: true,
      }),
      false,
    );

    for (const invalid of ["0", "{$ACRES_HSTS_MAX_AGE}"]) {
      fs.writeFileSync(
        target,
        source.replace("max-age=31536000", `max-age=${invalid}`),
      );
      const rejected = spawnSync(
        process.execPath,
        [scriptPath, target, "--allow-hsts", "--json"],
        { encoding: "utf8" },
      );
      assert.strictEqual(rejected.status, 1);
      const rejectedReport = JSON.parse(rejected.stdout);
      assert.strictEqual(rejectedReport.hstsApproved, false);
      assert.ok(
        rejectedReport.errors.some(
          (error) => error === "HSTS max-age policy failed",
        ),
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("verify-caddy-routing CLI: nonexistent Caddyfile exits with 1 and writes failed report if --output is set", () => {
  const { execFileSync } = require("node:child_process");
  const fs = require("node:fs");
  const os = require("node:os");
  const tmpDir = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "caddy-routing-test-"),
  );
  try {
    const outPath = path.join(tmpDir, "failed-caddy-routing-evidence.json");
    const scriptPath = path.join(__dirname, "verify-caddy-routing.js");
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [scriptPath, "nonexistent.caddyfile", "--output", outPath],
          {
            cwd: path.resolve(__dirname, "../.."),
            encoding: "utf8",
          },
        ),
      (err) => err.status === 1,
    );

    assert.ok(fs.existsSync(outPath));
    const content = JSON.parse(fs.readFileSync(outPath, "utf8"));
    assert.strictEqual(content.status, "failed");
    assert.strictEqual(content.valid, false);
    assert.strictEqual(content.execution_mode, "simulation");
    assert.ok(content.errors.length > 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// An installed copy keeps default source paths inside a disposable root.
function installed(t) {
  const fs = require("node:fs");
  const os = require("node:os");
  const { spawnSync } = require("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caddy private paths-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const script = path.join(dir, "scripts/ops/verify-caddy-routing.js");
  const source = path.join(dir, "infra/caddy/Caddyfile.example");
  const cwd = path.join(dir, "caller");
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.mkdirSync(cwd);
  fs.copyFileSync(path.join(__dirname, "verify-caddy-routing.js"), script);
  fs.copyFileSync(DEFAULT_CADDYFILE_PATH, source);
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
      {
        cwd,
        env: { PATH: path.dirname(process.execPath), TMPDIR: dir },
        encoding: "utf8",
        timeout: 8000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
  };
  return {
    dir,
    script,
    source,
    cwd,
    execute,
    output: path.join(cwd, "evidence.json"),
  };
}
const rejectWork = `const marker=path.join(base,'early-work');const reject=()=>{fs.writeFileSync(marker,'unexpected work');throw Error('CanaryWork')};for(const name of ['statSync','lstatSync','openSync','mkdirSync'])fs[name]=reject;`;
for (const args of [
  ["--unknown=CanaryPrivate"],
  ["--json", "--json"],
  ["--allow-hsts", "--allow-hsts"],
  ["--output", "a", "-o", "b"],
  ["--help", "--json"],
  ["a", "b"],
  ["--output"],
  ["--output="],
  ["--output", "-literal"],
  ["--json=true"],
  ["-h", "a"],
  ["a\nCanaryPrivate"],
  ["a\u2028CanaryPrivate"],
  ["--output", "a\u202eCanaryPrivate"],
  ["--output", " "],
  ["--output", "bad\nCanaryPrivate"],
])
  test(`complete invocation rejects ${JSON.stringify(args)} before work`, (t) => {
    const f = installed(t),
      r = f.execute(args, rejectWork);
    assert.strictEqual(r.status, 1);
    assert.strictEqual(r.stderr, "Caddy invocation failed\n");
    assert.strictEqual(r.stdout, "");
    assert.strictEqual(
      require("node:fs").existsSync(path.join(f.dir, "early-work")),
      false,
    );
  });
for (const arg of ["--help", "-h"])
  test(`standalone ${arg} and import do no file work`, (t) => {
    const f = installed(t);
    assert.strictEqual(f.execute([arg], rejectWork).status, 0);
    assert.strictEqual(f.execute([f.source, "--help"], rejectWork).status, 1);
    const { spawnSync } = require("node:child_process");
    const imported = spawnSync(
      process.execPath,
      [
        "--require",
        path.join(f.dir, "hook.cjs"),
        "-e",
        `require(${JSON.stringify(f.script)})`,
      ],
      {
        cwd: f.cwd,
        env: { PATH: path.dirname(process.execPath) },
        encoding: "utf8",
        timeout: 8000,
      },
    );
    assert.strictEqual(imported.status, 0);
  });

test("source limits, ordinary symlink and path literals", (t) => {
  const fs = require("node:fs"),
    f = installed(t);
  fs.symlinkSync(f.source, path.join(f.cwd, "source link"));
  const saved = f.execute([
    "source link",
    "--json",
    "--output=./-literal.json",
  ]);
  assert.strictEqual(saved.status, 0, saved.stderr);
  const report = JSON.parse(saved.stdout);
  assert.strictEqual(report.targetPath, path.join(f.cwd, "source link"));
  assert.strictEqual(report.routesPassed, 12);
  assert.strictEqual(
    fs.statSync(path.join(f.cwd, "-literal.json")).mode & 0o777,
    0o600,
  );
  fs.writeFileSync(path.join(f.cwd, "big"), "x".repeat(1024 * 1024 + 1));
  for (const file of ["big", "missing"]) {
    const r = f.execute([file, "--json"]);
    assert.strictEqual(r.status, 1);
    const failed = JSON.parse(r.stdout);
    assert.strictEqual(failed.routesEvaluated, 0);
    assert.deepStrictEqual(failed.errors, ["Caddy source evaluation failed"]);
    assert.strictEqual(failed.domain, null);
  }
  const dir = f.execute(["caller", "--json"]);
  assert.strictEqual(dir.status, 1);
  assert.strictEqual(JSON.parse(dir.stdout).routesEvaluated, 0);
});

test("direct argument and supported block guards", () => {
  for (const value of [null, 42, {}, [], Symbol("x")])
    assert.throws(() => verifyCaddyfile(value), /Caddy evaluation failed/);
  for (const options of [
    null,
    [],
    { allowHsts: "yes" },
    { allowHsts: 1 },
    { extra: true },
  ])
    assert.throws(
      () => verifyCaddyfile("x", options),
      /Caddy evaluation failed/,
    );
  for (const value of [null, 42, {}, []])
    assert.throws(() => parseCaddyfile(value), /Caddy evaluation failed/);
  const full = require("node:fs").readFileSync(DEFAULT_CADDYFILE_PATH, "utf8");
  for (const fragment of [
    "}",
    "header {",
    "request_body {",
    "transport http {",
  ]) {
    const malformed =
      fragment === "}"
        ? full.slice(0, full.lastIndexOf("}"))
        : full.replace(fragment, "");
    assert.throws(() => parseCaddyfile(malformed), /Caddy evaluation failed/);
  }
  assert.throws(
    () => parseCaddyfile("x\n".repeat(10001)),
    /Caddy evaluation failed/,
  );
  assert.throws(
    () => parseCaddyfile("x".repeat(1024 * 1024 + 1)),
    /Caddy evaluation failed/,
  );
  assert.throws(
    () => evaluateRoute({ siteBlocks: [{}] }, "/"),
    /Caddy evaluation failed/,
  );
});

test("public policy projection hides source fields without changing verdict", (t) => {
  const fs = require("node:fs"),
    f = installed(t);
  const source = fs
    .readFileSync(f.source, "utf8")
    .replace("api:3001", "apiCanaryPrivate")
    .replace(
      "email {$ACRES_TLS_CONTACT_EMAIL}",
      "email CanaryPrivate@example.com",
    )
    .replace(
      "read_timeout {$ACRES_API_READ_TIMEOUT}",
      "read_timeout CanaryPrivate",
    )
    .replace('X-Frame-Options "DENY"', 'X-Frame-Options "CanaryPrivate"');
  fs.writeFileSync(f.source, source);
  const r = f.execute(["--json", "--output", f.output]);
  assert.strictEqual(r.status, 1);
  const report = JSON.parse(r.stdout),
    saved = fs.readFileSync(f.output, "utf8");
  assert.strictEqual(report.valid, false);
  assert.strictEqual(report.routesEvaluated, 0);
  assert.strictEqual(report.securityHeadersVerified, false);
  assert.ok(report.errors.includes("Security header policy failed"));
  assert.ok(!saved.includes("CanaryPrivate"));
  assert.deepStrictEqual(JSON.parse(saved), report);
});

for (const type of ["file", "directory", "symlink", "dangling"])
  test(`retained ${type} destination survives`, (t) => {
    const fs = require("node:fs"),
      f = installed(t);
    if (type === "file") fs.writeFileSync(f.output, "retained");
    if (type === "directory") fs.mkdirSync(f.output);
    if (type === "symlink" || type === "dangling")
      fs.symlinkSync(
        type === "symlink" ? f.source : path.join(f.dir, "absent"),
        f.output,
      );
    const original = fs.lstatSync(f.output),
      r = f.execute(["--output", f.output], rejectWork);
    assert.strictEqual(r.status, 1);
    assert.strictEqual(r.stderr, "Caddy publication failed\n");
    assert.strictEqual(fs.lstatSync(f.output).ino, original.ino);
  });
test("private new parents and no-save allocation absence", (t) => {
  const fs = require("node:fs"),
    f = installed(t),
    out = path.join(f.cwd, "a/b/receipt.json");
  assert.strictEqual(f.execute(["--json"]).status, 0);
  assert.deepStrictEqual(fs.readdirSync(f.cwd), []);
  assert.strictEqual(f.execute(["--output", out]).status, 0);
  assert.strictEqual(fs.statSync(path.dirname(out)).mode & 0o777, 0o700);
  assert.strictEqual(fs.statSync(out).mode & 0o777, 0o600);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(out)), ["receipt.json"]);
});
for (const type of ["symlink", "file"])
  test(`reject ${type} parent`, (t) => {
    const fs = require("node:fs"),
      f = installed(t),
      parent = path.join(f.cwd, "parent");
    if (type === "symlink") fs.symlinkSync(f.dir, parent);
    else fs.writeFileSync(parent, "keep");
    const r = f.execute(["--output", path.join(parent, "evidence.json")]);
    assert.strictEqual(r.status, 1);
    assert.strictEqual(r.stderr, "Caddy publication failed\n");
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
    const f = installed(t);
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
      "parent-removed": `const old=fs.openSync;let once=true;fs.openSync=(p,...a)=>{const fd=old(p,...a);if(once&&String(p).endsWith('Caddyfile.example')){once=false;fs.rmdirSync(path.join(base,'caller'))}return fd};`,
      "parent-replaced": `const old=fs.openSync;let once=true;fs.openSync=(p,...a)=>{const fd=old(p,...a);if(once&&String(p).endsWith('Caddyfile.example')){once=false;fs.renameSync(path.join(base,'caller'),path.join(base,'retained'));fs.mkdirSync(path.join(base,'caller'))}return fd};`,
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
for (const fault of ["growth", "read", "close", "fifo-replacement"])
  test(`source fault and owned closure ${fault}`, (t) => {
    const f = installed(t),
      hook = {
        growth: `const old=fs.readSync;fs.readSync=(fd,...a)=>{const n=old(fd,...a);if(n>0)fs.appendFileSync(path.join(base,'infra/caddy/Caddyfile.example'),'growth');return n};`,
        read: `fs.readSync=()=>{throw Error('CanaryRead')};`,
        close: `const old=fs.closeSync;let once=true;fs.closeSync=fd=>{if(once){once=false;throw Error('CanaryClose')}return old(fd)};`,
        "fifo-replacement": `const old=fs.openSync;fs.openSync=(p,...a)=>{if(String(p).endsWith('Caddyfile.example')){fs.unlinkSync(p);require('child_process').execFileSync('/usr/bin/mkfifo',[p]);}return old(p,...a)};`,
      }[fault];
    const r = f.execute(["--json"], hook);
    assert.equal(r.status, 1);
    assert.equal(r.stderr, "");
    const report = JSON.parse(r.stdout);
    assert.equal(report.valid, false);
    assert.equal(report.routesEvaluated, 0);
    assert.deepEqual(report.errors, ["Caddy source evaluation failed"]);
  });
for (const fault of ["throw", "callback", "event", "stderr"])
  test(`output failure ${fault} preserves published receipt and nonzero`, (t) => {
    const f = installed(t),
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
test("save byte ceiling rejects before directory allocation", (t) => {
  const f = installed(t);
  const r = f.execute(
    ["--output", "new/receipt.json"],
    `const old=JSON.stringify;JSON.stringify=(v,...a)=>{const s=old(v,...a);return v?.drill_type?s+' '.repeat(1024*1024):s};fs.mkdirSync=()=>{throw Error('CanaryAllocation')};`,
  );
  assert.equal(r.status, 1);
  assert.equal(r.stderr, "Caddy serialization failed\n");
  assert.deepEqual(fs.readdirSync(f.cwd), []);
});
test("broken stdout pipe fails without stack", async (t) => {
  const f = installed(t);
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
  assert.equal(stderr, "Caddy output failed\n");
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
    const f = installed(t),
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
      assert.equal(r.stderr, "Caddy cleanup failed\n");
      assert.equal(JSON.parse(fs.readFileSync(f.output, "utf8")).valid, true);
      assert.ok(fs.readdirSync(f.cwd).some((p) => p.endsWith(".tmp")));
    } else {
      assert.equal(fs.existsSync(f.output), false);
      assert.ok(!fs.readdirSync(f.cwd).some((p) => p.endsWith(".tmp")));
    }
  });
test("source descriptors close after read fault and closure retry still fails", (t) => {
  const f = installed(t),
    marker = path.join(f.dir, "closure.json");
  const r = f.execute(
    ["--json"],
    `const open=fs.openSync,close=fs.closeSync;let fd,attempts=0;fs.openSync=(p,...a)=>{const x=open(p,...a);if(String(p).endsWith('Caddyfile.example'))fd=x;return x};fs.readSync=()=>{throw Error('CanaryRead')};fs.closeSync=x=>{if(x===fd&&++attempts===1)throw Error('CanaryClose');return close(x)};process.on('exit',()=>fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({attempts,closed:(()=>{try{fs.fstatSync(fd);return false}catch{return true}})()})));`,
  );
  assert.equal(r.status, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(marker, "utf8")), {
    attempts: 2,
    closed: true,
  });
  assert.equal(r.stderr, "");
  assert.deepEqual(JSON.parse(r.stdout).errors, [
    "Caddy source evaluation failed",
  ]);
});
test("serialization faults and invalid closed report fail without source reflection", (t) => {
  const f = installed(t);
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

test("unchanged readiness contract accepts static simulation and rejects failures/live claim", (t) => {
  const { validateCaddyRoutingReport } = require("./check-launch-readiness");
  const f = installed(t);
  const clean = JSON.parse(f.execute(["--json"]).stdout);
  const now = new Date();
  assert.strictEqual(validateCaddyRoutingReport(clean, now), true);
  assert.strictEqual(
    validateCaddyRoutingReport(clean, now, undefined, { requireLive: true }),
    false,
  );
  const source = fs
    .readFileSync(f.source, "utf8")
    .replace('X-Frame-Options "DENY"', 'X-Frame-Options "CanaryPrivate"');
  fs.writeFileSync(f.source, source);
  const failed = JSON.parse(f.execute(["--json"]).stdout);
  assert.strictEqual(validateCaddyRoutingReport(failed, now), false);
  fs.unlinkSync(f.source);
  const sourceFailed = JSON.parse(f.execute(["--json"]).stdout);
  assert.strictEqual(validateCaddyRoutingReport(sourceFailed, now), false);
});

test("unsafe domain and unexpected upstream are projected without invented success", (t) => {
  const f = installed(t);
  const config = fs
    .readFileSync(f.source, "utf8")
    .replace("{$ACRES_PRODUCTION_DOMAIN}", "https://CanaryPrivate@example.com")
    .replace("api:3001", "apiCanaryPrivate");
  fs.writeFileSync(f.source, config);
  const r = f.execute(["--json"]);
  assert.strictEqual(r.status, 1);
  const report = JSON.parse(r.stdout);
  assert.strictEqual(report.domain, null);
  assert.strictEqual(report.routesEvaluated, 12);
  assert.strictEqual(report.routesPassed, 8);
  assert.strictEqual(report.evaluatedRoutes[0].upstream, "unrecognized");
  assert.strictEqual(report.evaluatedRoutes[0].passed, false);
  assert.ok(!r.stdout.includes("CanaryPrivate"));
});

for (const scenario of ["success", "source-failure"])
  test(`slow bounded stdout reader receives complete ${scenario} JSON`, async (t) => {
    const f = installed(t);
    const args = scenario === "success" ? ["--json"] : ["absent", "--json"];
    const child = spawn(process.execPath, [f.script, ...args], {
      cwd: f.cwd,
      env: { PATH: path.dirname(process.execPath), TMPDIR: f.dir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pause();
    child.stdout.on("readable", () => {});
    const drained = new Promise((resolve) => child.stdout.on("end", resolve));
    const chunks = [];
    const reader = setInterval(() => {
      const part = child.stdout.read(17);
      if (part) chunks.push(part);
    }, 2);
    let stderr = "";
    child.stderr.on("data", (b) => {
      stderr += b;
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 8000);
    const status = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    await drained;
    clearInterval(reader);
    clearTimeout(timer);
    const output = Buffer.concat(chunks).toString("utf8");
    assert.strictEqual(stderr, "");
    assert.strictEqual(status, scenario === "success" ? 0 : 1);
    const report = JSON.parse(output);
    assert.strictEqual(report.valid, scenario === "success");
    assert.ok(output.endsWith("\n"));
    assert.strictEqual(report.routesEvaluated, scenario === "success" ? 12 : 0);
  });
