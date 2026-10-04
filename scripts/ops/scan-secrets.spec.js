const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const RUNNER = path.join(ROOT, "scripts/ops/scan-secrets.sh");

function runRunner(args = [], options = {}) {
  const runnerPath = options.runner || RUNNER;
  return spawnSync("sh", [runnerPath, ...args], {
    cwd: options.cwd || ROOT,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
  });
}

function makeTempGitFixture(t) {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "acres-scan-secrets-test-"),
  );
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // Initialize git repo
  spawnSync("git", ["init", "-b", "main"], { cwd: tmpDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Test Runner"], {
    cwd: tmpDir,
    encoding: "utf8",
  });
  spawnSync("git", ["config", "user.email", "test@example.com"], {
    cwd: tmpDir,
    encoding: "utf8",
  });

  const opsDir = path.join(tmpDir, "scripts/ops");
  fs.mkdirSync(opsDir, { recursive: true });
  const scriptPath = path.join(opsDir, "scan-secrets.sh");
  fs.copyFileSync(RUNNER, scriptPath);
  fs.chmodSync(scriptPath, 0o755);

  // Commit initial clean state
  const readmePath = path.join(tmpDir, "README.md");
  fs.writeFileSync(readmePath, "# Test Repo\n", "utf8");
  spawnSync("git", ["add", "."], { cwd: tmpDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "initial commit"], {
    cwd: tmpDir,
    encoding: "utf8",
  });

  return {
    tmpDir,
    scriptPath,
    writeFile(relPath, content) {
      const fullPath = path.join(tmpDir, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, "utf8");
      return fullPath;
    },
    trackFile(relPath, content) {
      const fullPath = this.writeFile(relPath, content);
      spawnSync("git", ["add", relPath], { cwd: tmpDir, encoding: "utf8" });
      return fullPath;
    },
    run(args = [], runOpts = {}) {
      return runRunner(args, {
        runner: scriptPath,
        cwd: tmpDir,
        ...runOpts,
      });
    },
  };
}

test("scan-secrets CLI argument parsing", async (t) => {
  await t.test("--help outputs usage and exits 0", () => {
    const res = runRunner(["--help"]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage: scripts\/ops\/scan-secrets\.sh/);
    assert.equal(res.stderr, "");
  });

  await t.test("-h outputs usage and exits 0", () => {
    const res = runRunner(["-h"]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage: scripts\/ops\/scan-secrets\.sh/);
    assert.equal(res.stderr, "");
  });

  await t.test("unknown long option exits 1 with usage to stderr", () => {
    const res = runRunner(["--invalid-flag"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Unknown option "--invalid-flag"/);
    assert.match(res.stderr, /Usage: scripts\/ops\/scan-secrets\.sh/);
  });

  await t.test("unknown short option exits 1 with usage to stderr", () => {
    const res = runRunner(["-x"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Unknown option "-x"/);
    assert.match(res.stderr, /Usage: scripts\/ops\/scan-secrets\.sh/);
  });

  await t.test(
    "unexpected positional argument exits 1 with usage to stderr",
    () => {
      const res = runRunner(["unexpected-arg"]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /Error: Unexpected argument "unexpected-arg"/);
      assert.match(res.stderr, /Usage: scripts\/ops\/scan-secrets\.sh/);
    },
  );

  await t.test("--cwd without argument at end of argv exits 1", () => {
    const res = runRunner(["--cwd"]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: --cwd requires a non-empty directory path/,
    );
  });

  await t.test("--cwd followed by another option exits 1", () => {
    const res = runRunner(["--cwd", "--other"]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: --cwd requires a non-empty directory path/,
    );
  });

  await t.test("--cwd with empty string exits 1", () => {
    const res = runRunner(["--cwd", ""]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --cwd path cannot be empty/);
  });

  await t.test("--cwd with whitespace string exits 1", () => {
    const res = runRunner(["--cwd", "   "]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --cwd path cannot be empty/);
  });

  await t.test("--cwd= with empty string exits 1", () => {
    const res = runRunner(["--cwd="]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --cwd path cannot be empty/);
  });

  await t.test("--cwd= with whitespace string exits 1", () => {
    const res = runRunner(["--cwd=   "]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --cwd path cannot be empty/);
  });

  await t.test("repeated --cwd option exits 1", () => {
    const res = runRunner(["--cwd", "server", "--cwd", "client"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Repeated --cwd option/);
  });

  await t.test("repeated --cwd= option exits 1", () => {
    const res = runRunner(["--cwd=server", "--cwd=client"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Repeated --cwd option/);
  });

  await t.test("pointing --cwd to non-existent directory exits 1", () => {
    const nonExistent = path.join(os.tmpdir(), "non-existent-dir-12345");
    const res = runRunner(["--cwd", nonExistent]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /secret scan failed: target directory does not exist/,
    );
  });
});

test("scan-secrets git repository validation", async (t) => {
  await t.test(
    "fails closed when target directory is not a git repository",
    () => {
      const nonGitDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "acres-non-git-dir-"),
      );
      t.after(() => {
        try {
          fs.rmSync(nonGitDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      });

      const res = runRunner(["--cwd", nonGitDir]);
      assert.equal(res.status, 1);
      assert.match(
        res.stderr,
        /secret scan failed: target directory is not a git repository/,
      );
    },
  );
});

test("scan-secrets pattern detection in isolated git fixture", async (t) => {
  await t.test("clean repository passes with exit code 0", () => {
    const fixture = makeTempGitFixture(t);
    const res = fixture.run();
    assert.equal(res.status, 0);
    assert.match(res.stdout, /secret\/default scan passed/);
    assert.equal(res.stderr, "");
  });

  await t.test(
    "detects acres_superuser_dev_password in unallowed tracked file",
    () => {
      const fixture = makeTempGitFixture(t);
      fixture.trackFile(
        "server/src/database.ts",
        'const pass = "acres_superuser_dev_password";\n',
      );
      const res = fixture.run();
      assert.equal(res.status, 1);
      assert.match(
        res.stderr,
        /secret scan failed: local development password/,
      );
      assert.match(res.stderr, /server\/src\/database\.ts/);
    },
  );

  await t.test(
    "detects acres_migrator_dev_password in unallowed tracked file",
    () => {
      const fixture = makeTempGitFixture(t);
      fixture.trackFile(
        "client/src/api.ts",
        'const pass = "acres_migrator_dev_password";\n',
      );
      const res = fixture.run();
      assert.equal(res.status, 1);
      assert.match(
        res.stderr,
        /secret scan failed: local development password/,
      );
      assert.match(res.stderr, /client\/src\/api\.ts/);
    },
  );

  await t.test(
    "detects acres_app_dev_password in unallowed tracked file",
    () => {
      const fixture = makeTempGitFixture(t);
      fixture.trackFile(
        "server/src/app.ts",
        'const pass = "acres_app_dev_password";\n',
      );
      const res = fixture.run();
      assert.equal(res.status, 1);
      assert.match(
        res.stderr,
        /secret scan failed: local development password/,
      );
      assert.match(res.stderr, /server\/src\/app\.ts/);
    },
  );

  await t.test(
    "detects acres_test_dev_password in unallowed tracked file",
    () => {
      const fixture = makeTempGitFixture(t);
      fixture.trackFile(
        "packages/shared/src/config.ts",
        'const pass = "acres_test_dev_password";\n',
      );
      const res = fixture.run();
      assert.equal(res.status, 1);
      assert.match(
        res.stderr,
        /secret scan failed: local development password/,
      );
      assert.match(res.stderr, /packages\/shared\/src\/config\.ts/);
    },
  );

  await t.test(
    "detects acres_valkey_dev_password in unallowed tracked file",
    () => {
      const fixture = makeTempGitFixture(t);
      fixture.trackFile(
        "server/src/cache.ts",
        'const pass = "acres_valkey_dev_password";\n',
      );
      const res = fixture.run();
      assert.equal(res.status, 1);
      assert.match(
        res.stderr,
        /secret scan failed: local development password/,
      );
      assert.match(res.stderr, /server\/src\/cache\.ts/);
    },
  );

  await t.test(
    "detects change-me placeholder in unallowed tracked file",
    () => {
      const fixture = makeTempGitFixture(t);
      fixture.trackFile(
        "server/src/auth.ts",
        'const secretKey = "change-me-production-jwt-key";\n',
      );
      const res = fixture.run();
      assert.equal(res.status, 1);
      assert.match(res.stderr, /secret scan failed: change-me placeholder/);
      assert.match(res.stderr, /server\/src\/auth\.ts/);
    },
  );

  await t.test("detects change-me_ with underscore placeholder", () => {
    const fixture = makeTempGitFixture(t);
    fixture.trackFile(
      "client/src/env.ts",
      'const secretKey = "change-me_secret_123";\n',
    );
    const res = fixture.run();
    assert.equal(res.status, 1);
    assert.match(res.stderr, /secret scan failed: change-me placeholder/);
  });

  await t.test("detects change-me followed by alphanumeric characters", () => {
    const fixture = makeTempGitFixture(t);
    fixture.trackFile(
      "server/src/config.ts",
      'const secretKey = "change-me123";\n',
    );
    const res = fixture.run();
    assert.equal(res.status, 1);
    assert.match(res.stderr, /secret scan failed: change-me placeholder/);
  });

  await t.test("detects __REQUIRED_ launch placeholder sentinel", () => {
    const fixture = makeTempGitFixture(t);
    fixture.trackFile(
      "server/src/main.ts",
      'const token = "__REQUIRED_SYSTEM_TOKEN__";\n',
    );
    const res = fixture.run();
    assert.equal(res.status, 1);
    assert.match(res.stderr, /secret scan failed: launch placeholder sentinel/);
    assert.match(res.stderr, /server\/src\/main\.ts/);
  });

  await t.test(
    "detects NEXT_PUBLIC_ client-exposed secret-looking names",
    () => {
      const fixture = makeTempGitFixture(t);
      fixture.trackFile(
        "client/app/page.tsx",
        "export const key = process.env.NEXT_PUBLIC_API_SECRET;\n",
      );
      const res = fixture.run();
      assert.equal(res.status, 1);
      assert.match(
        res.stderr,
        /secret scan failed: client-exposed secret-looking name/,
      );
      assert.match(res.stderr, /client\/app\/page\.tsx/);
    },
  );

  await t.test("detects NEXT_PUBLIC_AUTH_PASSWORD", () => {
    const fixture = makeTempGitFixture(t);
    fixture.trackFile(
      "client/app/login.tsx",
      "const p = process.env.NEXT_PUBLIC_AUTH_PASSWORD;\n",
    );
    const res = fixture.run();
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /secret scan failed: client-exposed secret-looking name/,
    );
  });

  await t.test("detects NEXT_PUBLIC_MAP_KEY", () => {
    const fixture = makeTempGitFixture(t);
    fixture.trackFile(
      "client/app/map.tsx",
      "const k = process.env.NEXT_PUBLIC_MAP_KEY;\n",
    );
    const res = fixture.run();
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /secret scan failed: client-exposed secret-looking name/,
    );
  });

  await t.test("detects NEXT_PUBLIC_USER_TOKEN", () => {
    const fixture = makeTempGitFixture(t);
    fixture.trackFile(
      "client/app/header.tsx",
      "const t = process.env.NEXT_PUBLIC_USER_TOKEN;\n",
    );
    const res = fixture.run();
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /secret scan failed: client-exposed secret-looking name/,
    );
  });
});

test("scan-secrets allowed paths and exclusions", async (t) => {
  await t.test(
    "tolerates development passwords in allowed example and config files",
    () => {
      const fixture = makeTempGitFixture(t);
      fixture.trackFile(
        ".env.example",
        "POSTGRES_SUPERUSER_PASSWORD=acres_superuser_dev_password\n",
      );
      fixture.trackFile(
        "server/.env.example",
        "POSTGRES_APP_PASSWORD=acres_app_dev_password\n",
      );
      fixture.trackFile(
        "infra/env/production.env.example",
        "DATABASE_PASSWORD=__REQUIRED_DATABASE_PASSWORD__\n",
      );
      fixture.trackFile(
        "infra/launch/readiness.example.json",
        '{"secret": "__REQUIRED_SECRET__"}\n',
      );
      fixture.trackFile(
        ".github/workflows/ci.yml",
        "POSTGRES_PASSWORD: acres_superuser_dev_password\n",
      );
      fixture.trackFile(
        "docker-compose.yml",
        "POSTGRES_PASSWORD: acres_superuser_dev_password\n",
      );
      fixture.trackFile(
        "infra/garage/garage.toml",
        'rpc_secret = "change-me-garage-rpc-secret"\n',
      );
      fixture.trackFile(
        "client/playwright.config.ts",
        'const key = process.env.NEXT_PUBLIC_MAP_KEY || "dummy";\n',
      );
      fixture.trackFile(
        "server/src/config/env.validation.ts",
        "valkey_password: acres_valkey_dev_password\n",
      );
      fixture.trackFile(
        "server/src/contracts/generate-contracts.ts",
        "acres_superuser_dev_password\n",
      );
      fixture.trackFile(
        "docs/security.md",
        "default is acres_superuser_dev_password\n",
      );
      fixture.trackFile(
        "prompts/207-secrets.md",
        "change-me-production-secret\n",
      );
      fixture.trackFile(
        "server/test/auth.e2e-spec.ts",
        "acres_superuser_dev_password\n",
      );
      fixture.trackFile(
        "server/src/modules/auth.spec.ts",
        "acres_app_dev_password\n",
      );
      fixture.trackFile(
        "client/tests/e2e.ts",
        "acres_superuser_dev_password\n",
      );
      fixture.trackFile(
        "scripts/ops/custom-check.spec.js",
        "acres_superuser_dev_password\n",
      );
      fixture.trackFile(
        "scripts/ops/run-secret-rotation-drill.sh",
        "acres_superuser_dev_password\n",
      );
      fixture.trackFile(
        "scripts/ops/verify-volume-encryption.js",
        "acres_superuser_dev_password\n",
      );

      const res = fixture.run();
      assert.equal(res.status, 0);
      assert.match(res.stdout, /secret\/default scan passed/);
      assert.equal(res.stderr, "");
    },
  );

  await t.test("ignores matches inside excluded paths", () => {
    const fixture = makeTempGitFixture(t);
    // Track excluded directories (if accidentally committed)
    fixture.trackFile(
      "package-lock.json",
      '{"dev": "acres_superuser_dev_password"}\n',
    );
    fixture.trackFile(
      ".agents/skills/test.md",
      "acres_superuser_dev_password\n",
    );
    fixture.trackFile(
      "node_modules/mock-pkg/index.js",
      'const secret = "acres_superuser_dev_password";\n',
    );
    fixture.trackFile(
      ".next/server/chunk.js",
      'const secret = "acres_superuser_dev_password";\n',
    );
    fixture.trackFile(
      "server/src/generated/types.ts",
      'const secret = "acres_superuser_dev_password";\n',
    );

    const res = fixture.run();
    assert.equal(res.status, 0);
    assert.match(res.stdout, /secret\/default scan passed/);
    assert.equal(res.stderr, "");
  });
});

test("scan-secrets directory targeting and options", async (t) => {
  await t.test("supports --cwd <path>", () => {
    const fixture = makeTempGitFixture(t);
    const res = runRunner(["--cwd", fixture.tmpDir]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /secret\/default scan passed/);
  });

  await t.test("supports --cwd=<path>", () => {
    const fixture = makeTempGitFixture(t);
    const res = runRunner([`--cwd=${fixture.tmpDir}`]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /secret\/default scan passed/);
  });
});

test("scan-secrets end-to-end repository execution", async (t) => {
  await t.test("runs successfully against repository without arguments", () => {
    const res = runRunner();
    assert.equal(res.status, 0);
    assert.match(res.stdout, /secret\/default scan passed/);
    assert.equal(res.stderr, "");
  });

  await t.test(
    "runs successfully against repository with explicit --cwd .",
    () => {
      const res = runRunner(["--cwd", "."]);
      assert.equal(res.status, 0);
      assert.match(res.stdout, /secret\/default scan passed/);
      assert.equal(res.stderr, "");
    },
  );

  await t.test(
    "runs successfully from server/ subdirectory with --cwd ..",
    () => {
      const serverDir = path.join(ROOT, "server");
      const res = runRunner(["--cwd", ".."], { cwd: serverDir });
      assert.equal(res.status, 0);
      assert.match(res.stdout, /secret\/default scan passed/);
      assert.equal(res.stderr, "");
    },
  );
});
