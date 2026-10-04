const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const RUNNER = path.join(ROOT, "scripts/ops/check-docker-runtime.sh");

const VALID_DOCKERFILE_CONTENT = `# Valid Dockerfile fixture
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm ci

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=deps /app ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:3001/health" || exit 1
CMD ["node", "server/dist/main.js"]
`;

function runRunner(args = [], options = {}) {
  const runnerPath = options.runner || RUNNER;
  return spawnSync("sh", [runnerPath, ...args], {
    cwd: options.cwd || ROOT,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
  });
}

function makeTempFixture(t) {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "acres-docker-runtime-test-"),
  );
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  const opsDir = path.join(tmpDir, "scripts/ops");
  fs.mkdirSync(opsDir, { recursive: true });
  const scriptPath = path.join(opsDir, "check-docker-runtime.sh");
  fs.copyFileSync(RUNNER, scriptPath);
  fs.chmodSync(scriptPath, 0o755);

  const serverDir = path.join(tmpDir, "server");
  fs.mkdirSync(serverDir, { recursive: true });
  const dockerfilePath = path.join(serverDir, "Dockerfile");
  fs.writeFileSync(dockerfilePath, VALID_DOCKERFILE_CONTENT, "utf8");

  return {
    tmpDir,
    scriptPath,
    dockerfilePath,
    run(args = [], runOpts = {}) {
      return runRunner(args, {
        runner: scriptPath,
        cwd: tmpDir,
        ...runOpts,
      });
    },
  };
}

test("check-docker-runtime CLI argument parsing", async (t) => {
  await t.test("--help outputs usage and exits 0", () => {
    const res = runRunner(["--help"]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage: scripts\/ops\/check-docker-runtime\.sh/);
    assert.equal(res.stderr, "");
  });

  await t.test("-h outputs usage and exits 0", () => {
    const res = runRunner(["-h"]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage: scripts\/ops\/check-docker-runtime\.sh/);
    assert.equal(res.stderr, "");
  });

  await t.test("unknown long option exits 1 with usage to stderr", () => {
    const res = runRunner(["--invalid-flag"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Unknown option "--invalid-flag"/);
    assert.match(res.stderr, /Usage: scripts\/ops\/check-docker-runtime\.sh/);
  });

  await t.test("unknown short option exits 1 with usage to stderr", () => {
    const res = runRunner(["-x"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Unknown option "-x"/);
    assert.match(res.stderr, /Usage: scripts\/ops\/check-docker-runtime\.sh/);
  });

  await t.test(
    "unexpected positional argument exits 1 with usage to stderr",
    () => {
      const res = runRunner(["unexpected-arg"]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /Error: Unexpected argument "unexpected-arg"/);
      assert.match(res.stderr, /Usage: scripts\/ops\/check-docker-runtime\.sh/);
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
    const res = runRunner(["--cwd", "--dockerfile", "server/Dockerfile"]);
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
    const res = runRunner(["--cwd=  "]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --cwd path cannot be empty/);
  });

  await t.test("repeated --cwd option exits 1", () => {
    const res = runRunner(["--cwd", ".", "--cwd", "."]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: Repeated --cwd option; expected single directory path/,
    );
  });

  await t.test("repeated --cwd= option exits 1", () => {
    const res = runRunner(["--cwd=.", "--cwd=."]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: Repeated --cwd option; expected single directory path/,
    );
  });

  await t.test("--cwd pointing to non-existent directory exits 1", () => {
    const nonExistentPath = path.join(ROOT, "does-not-exist-dir-12345");
    const res = runRunner(["--cwd", nonExistentPath]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /docker runtime check failed: target directory does not exist:/,
    );
  });

  await t.test("--dockerfile without argument at end of argv exits 1", () => {
    const res = runRunner(["--dockerfile"]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: --dockerfile requires a non-empty file path/,
    );
  });

  await t.test("--dockerfile followed by another option exits 1", () => {
    const res = runRunner(["--dockerfile", "--cwd", "."]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: --dockerfile requires a non-empty file path/,
    );
  });

  await t.test("--dockerfile with empty string exits 1", () => {
    const res = runRunner(["--dockerfile", ""]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --dockerfile path cannot be empty/);
  });

  await t.test("--dockerfile with whitespace string exits 1", () => {
    const res = runRunner(["--dockerfile", "   "]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --dockerfile path cannot be empty/);
  });

  await t.test("--dockerfile= with empty string exits 1", () => {
    const res = runRunner(["--dockerfile="]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --dockerfile path cannot be empty/);
  });

  await t.test("--dockerfile= with whitespace string exits 1", () => {
    const res = runRunner(["--dockerfile=  "]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --dockerfile path cannot be empty/);
  });

  await t.test("repeated --dockerfile option exits 1", () => {
    const res = runRunner([
      "--dockerfile",
      "server/Dockerfile",
      "--dockerfile",
      "server/Dockerfile",
    ]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: Repeated --dockerfile option; expected single file path/,
    );
  });

  await t.test("repeated --dockerfile= option exits 1", () => {
    const res = runRunner([
      "--dockerfile=server/Dockerfile",
      "--dockerfile=server/Dockerfile",
    ]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: Repeated --dockerfile option; expected single file path/,
    );
  });

  await t.test("non-existent default Dockerfile fails closed", (t) => {
    const fixture = makeTempFixture(t);
    fs.rmSync(fixture.dockerfilePath);
    const res = fixture.run([]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /docker runtime check failed: missing server\/Dockerfile/,
    );
  });

  await t.test("non-existent custom --dockerfile fails closed", (t) => {
    const fixture = makeTempFixture(t);
    const res = fixture.run(["--dockerfile", "custom/Dockerfile"]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /docker runtime check failed: missing custom\/Dockerfile/,
    );
  });
});

test("check-docker-runtime static Dockerfile verification assertions", async (t) => {
  await t.test("valid Dockerfile passes with exit code 0", (t) => {
    const fixture = makeTempFixture(t);
    const res = fixture.run([]);
    assert.equal(res.status, 0);
    assert.equal(res.stdout, "docker runtime check passed\n");
    assert.equal(res.stderr, "");
  });

  await t.test("missing Node 24 Alpine stage fails closed", (t) => {
    const fixture = makeTempFixture(t);
    const badContent = VALID_DOCKERFILE_CONTENT.replace(
      /FROM node:24-alpine/g,
      "FROM node:20-alpine",
    );
    fs.writeFileSync(fixture.dockerfilePath, badContent, "utf8");
    const res = fixture.run([]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /docker runtime check failed: server image must use Node 24 Alpine stages/,
    );
  });

  await t.test("missing non-root USER node fails closed", (t) => {
    const fixture = makeTempFixture(t);
    const badContent = VALID_DOCKERFILE_CONTENT.replace(
      /USER node/g,
      "USER root",
    );
    fs.writeFileSync(fixture.dockerfilePath, badContent, "utf8");
    const res = fixture.run([]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /docker runtime check failed: runtime image must run as USER node/,
    );
  });

  await t.test("completely missing USER directive fails closed", (t) => {
    const fixture = makeTempFixture(t);
    const badContent = VALID_DOCKERFILE_CONTENT.replace(/USER node\n/g, "");
    fs.writeFileSync(fixture.dockerfilePath, badContent, "utf8");
    const res = fixture.run([]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /docker runtime check failed: runtime image must run as USER node/,
    );
  });

  await t.test("missing HEALTHCHECK directive fails closed", (t) => {
    const fixture = makeTempFixture(t);
    const badContent = VALID_DOCKERFILE_CONTENT.replace(
      /HEALTHCHECK [^\n]+\n[^\n]+\n/g,
      "",
    );
    fs.writeFileSync(fixture.dockerfilePath, badContent, "utf8");
    const res = fixture.run([]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /docker runtime check failed: server image must keep a HEALTHCHECK/,
    );
  });

  await t.test("indirect npm startup CMD fails closed", (t) => {
    const fixture = makeTempFixture(t);
    const badContent = VALID_DOCKERFILE_CONTENT.replace(
      'CMD ["node", "server/dist/main.js"]',
      'CMD ["npm", "run", "start:server"]',
    );
    fs.writeFileSync(fixture.dockerfilePath, badContent, "utf8");
    const res = fixture.run([]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /docker runtime check failed: server image must start Node directly, not npm/,
    );
  });

  await t.test("different node entrypoint script CMD fails closed", (t) => {
    const fixture = makeTempFixture(t);
    const badContent = VALID_DOCKERFILE_CONTENT.replace(
      'CMD ["node", "server/dist/main.js"]',
      'CMD ["node", "dist/index.js"]',
    );
    fs.writeFileSync(fixture.dockerfilePath, badContent, "utf8");
    const res = fixture.run([]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /docker runtime check failed: server image must start Node directly, not npm/,
    );
  });
});

test("check-docker-runtime directory targeting and options", async (t) => {
  await t.test("supports --cwd <path>", (t) => {
    const fixture = makeTempFixture(t);
    const externalTmp = fs.mkdtempSync(
      path.join(os.tmpdir(), "acres-external-"),
    );
    t.after(() => fs.rmSync(externalTmp, { recursive: true, force: true }));

    const res = runRunner(["--cwd", fixture.tmpDir], {
      runner: fixture.scriptPath,
      cwd: externalTmp,
    });
    assert.equal(res.status, 0);
    assert.equal(res.stdout, "docker runtime check passed\n");
  });

  await t.test("supports --cwd=<path>", (t) => {
    const fixture = makeTempFixture(t);
    const externalTmp = fs.mkdtempSync(
      path.join(os.tmpdir(), "acres-external-"),
    );
    t.after(() => fs.rmSync(externalTmp, { recursive: true, force: true }));

    const res = runRunner([`--cwd=${fixture.tmpDir}`], {
      runner: fixture.scriptPath,
      cwd: externalTmp,
    });
    assert.equal(res.status, 0);
    assert.equal(res.stdout, "docker runtime check passed\n");
  });

  await t.test("supports --dockerfile <path> relative to cwd", (t) => {
    const fixture = makeTempFixture(t);
    const customRelative = "custom.Dockerfile";
    fs.writeFileSync(
      path.join(fixture.tmpDir, customRelative),
      VALID_DOCKERFILE_CONTENT,
      "utf8",
    );

    const res = fixture.run(["--dockerfile", customRelative]);
    assert.equal(res.status, 0);
    assert.equal(res.stdout, "docker runtime check passed\n");
  });

  await t.test("supports --dockerfile=<path> relative to cwd", (t) => {
    const fixture = makeTempFixture(t);
    const customRelative = "custom.Dockerfile";
    fs.writeFileSync(
      path.join(fixture.tmpDir, customRelative),
      VALID_DOCKERFILE_CONTENT,
      "utf8",
    );

    const res = fixture.run([`--dockerfile=${customRelative}`]);
    assert.equal(res.status, 0);
    assert.equal(res.stdout, "docker runtime check passed\n");
  });

  await t.test("supports absolute --dockerfile path", (t) => {
    const fixture = makeTempFixture(t);
    const customAbsolute = path.join(fixture.tmpDir, "custom.Dockerfile");
    fs.writeFileSync(customAbsolute, VALID_DOCKERFILE_CONTENT, "utf8");

    const res = fixture.run(["--dockerfile", customAbsolute]);
    assert.equal(res.status, 0);
    assert.equal(res.stdout, "docker runtime check passed\n");
  });

  await t.test("supports both --cwd and --dockerfile combined", (t) => {
    const fixture = makeTempFixture(t);
    const externalTmp = fs.mkdtempSync(
      path.join(os.tmpdir(), "acres-external-"),
    );
    t.after(() => fs.rmSync(externalTmp, { recursive: true, force: true }));

    const customRelative = "build/Custom.Dockerfile";
    fs.mkdirSync(path.join(fixture.tmpDir, "build"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture.tmpDir, customRelative),
      VALID_DOCKERFILE_CONTENT,
      "utf8",
    );

    const res = runRunner(
      ["--cwd", fixture.tmpDir, "--dockerfile", customRelative],
      {
        runner: fixture.scriptPath,
        cwd: externalTmp,
      },
    );
    assert.equal(res.status, 0);
    assert.equal(res.stdout, "docker runtime check passed\n");
  });
});

test("check-docker-runtime end-to-end repository execution", async (t) => {
  await t.test("runs successfully against repository without arguments", () => {
    const res = runRunner([]);
    assert.equal(res.status, 0);
    assert.equal(res.stdout, "docker runtime check passed\n");
    assert.equal(res.stderr, "");
  });

  await t.test(
    "runs successfully against repository with explicit --cwd .",
    () => {
      const res = runRunner(["--cwd", "."]);
      assert.equal(res.status, 0);
      assert.equal(res.stdout, "docker runtime check passed\n");
      assert.equal(res.stderr, "");
    },
  );

  await t.test(
    "runs successfully against repository with explicit --dockerfile server/Dockerfile",
    () => {
      const res = runRunner(["--dockerfile", "server/Dockerfile"]);
      assert.equal(res.status, 0);
      assert.equal(res.stdout, "docker runtime check passed\n");
      assert.equal(res.stderr, "");
    },
  );

  await t.test(
    "runs successfully from server/ subdirectory with --cwd ..",
    () => {
      const res = runRunner(["--cwd", ".."], {
        cwd: path.join(ROOT, "server"),
      });
      assert.equal(res.status, 0);
      assert.equal(res.stdout, "docker runtime check passed\n");
      assert.equal(res.stderr, "");
    },
  );
});
