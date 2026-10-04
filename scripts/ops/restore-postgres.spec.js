const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const RUNNER = path.join(ROOT, "scripts/ops/restore-postgres.sh");

function runRunner(args = [], options = {}) {
  const runnerPath = options.runner || RUNNER;
  return spawnSync("/bin/sh", [runnerPath, ...args], {
    cwd: options.cwd || ROOT,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
  });
}

function makeCleanFixture(t) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-restore-test-"));
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  const opsDir = path.join(tmpDir, "scripts/ops");
  fs.mkdirSync(opsDir, { recursive: true });
  const scriptPath = path.join(opsDir, "restore-postgres.sh");
  fs.copyFileSync(RUNNER, scriptPath);
  fs.chmodSync(scriptPath, 0o755);

  const binDir = path.join(tmpDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  const mockPgRestore = path.join(binDir, "pg_restore");
  fs.writeFileSync(mockPgRestore, "#!/bin/sh\nexit 0\n", "utf8");
  fs.chmodSync(mockPgRestore, 0o755);

  const mockPsql = path.join(binDir, "psql");
  fs.writeFileSync(mockPsql, "#!/bin/sh\nprintf '42\\n'\nexit 0\n", "utf8");
  fs.chmodSync(mockPsql, 0o755);

  const mockPgIsready = path.join(binDir, "pg_isready");
  fs.writeFileSync(mockPgIsready, "#!/bin/sh\nexit 0\n", "utf8");
  fs.chmodSync(mockPgIsready, 0o755);

  const dumpFile = path.join(tmpDir, "sample-backup.dump");
  fs.writeFileSync(dumpFile, "DUMMY_POSTGRES_RESTORE_DUMP_BYTES", "utf8");

  return {
    tmpDir,
    scriptPath,
    binDir,
    dumpFile,
    run(args = [], runOpts = {}) {
      const { env: extraEnv, ...restOpts } = runOpts;
      return runRunner(args, {
        runner: scriptPath,
        cwd: tmpDir,
        ...restOpts,
        env: {
          PATH: `${binDir}:${process.env.PATH || ""}`,
          ...(extraEnv || {}),
        },
      });
    },
  };
}

function makeIsolatedBinWithWrappers(tmpDir, binariesToProvide = {}) {
  const isolatedBin = path.join(
    tmpDir,
    "isolated_bin_" + Math.random().toString(36).slice(2),
  );
  fs.mkdirSync(isolatedBin, { recursive: true });

  for (const util of ["wc", "tr", "dirname"]) {
    const whichRes = spawnSync("which", [util], { encoding: "utf8" });
    const realBin =
      whichRes.status === 0 && whichRes.stdout
        ? whichRes.stdout.trim()
        : `/usr/bin/${util}`;
    const utilPath = path.join(isolatedBin, util);
    fs.writeFileSync(utilPath, `#!/bin/sh\nexec ${realBin} "$@"\n`, "utf8");
    fs.chmodSync(utilPath, 0o755);
  }

  for (const [name, script] of Object.entries(binariesToProvide)) {
    const binPath = path.join(isolatedBin, name);
    fs.writeFileSync(binPath, script, "utf8");
    fs.chmodSync(binPath, 0o755);
  }

  return isolatedBin;
}

function makeMockFixture(t, options = {}) {
  const fixture = makeCleanFixture(t);

  const logDir = path.join(fixture.tmpDir, "logs");
  fs.mkdirSync(logDir, { recursive: true });

  const restoreLog = path.join(logDir, "pg_restore.log");
  const psqlLog = path.join(logDir, "psql.log");
  const isreadyLog = path.join(logDir, "pg_isready.log");

  const pgRestoreScript =
    options.mockPgRestore ??
    `#!/bin/sh
printf '%s\\n' "$@" > "${restoreLog}"
printf '%s\\n' "PGPASSWORD=\${PGPASSWORD:-}" >> "${restoreLog}"
printf '%s\\n' "PGHOST=\${PGHOST:-}" >> "${restoreLog}"
printf '%s\\n' "PGPORT=\${PGPORT:-}" >> "${restoreLog}"
printf '%s\\n' "PGUSER=\${PGUSER:-}" >> "${restoreLog}"
printf '%s\\n' "PGDATABASE=\${PGDATABASE:-}" >> "${restoreLog}"
exit 0
`;
  fs.writeFileSync(
    path.join(fixture.binDir, "pg_restore"),
    pgRestoreScript,
    "utf8",
  );
  fs.chmodSync(path.join(fixture.binDir, "pg_restore"), 0o755);

  const psqlScript =
    options.mockPsql ??
    `#!/bin/sh
printf '%s\\n' "$@" > "${psqlLog}"
printf '%s\\n' "PGPASSWORD=\${PGPASSWORD:-}" >> "${psqlLog}"
printf '%s\\n' "PGHOST=\${PGHOST:-}" >> "${psqlLog}"
printf '%s\\n' "PGPORT=\${PGPORT:-}" >> "${psqlLog}"
printf '%s\\n' "PGUSER=\${PGUSER:-}" >> "${psqlLog}"
printf '%s\\n' "PGDATABASE=\${PGDATABASE:-}" >> "${psqlLog}"
printf '35\\n'
exit 0
`;
  fs.writeFileSync(path.join(fixture.binDir, "psql"), psqlScript, "utf8");
  fs.chmodSync(path.join(fixture.binDir, "psql"), 0o755);

  const isreadyScript =
    options.mockPgIsready ??
    `#!/bin/sh
printf '%s\\n' "$@" > "${isreadyLog}"
printf '%s\\n' "PGPASSWORD=\${PGPASSWORD:-}" >> "${isreadyLog}"
printf '%s\\n' "PGHOST=\${PGHOST:-}" >> "${isreadyLog}"
printf '%s\\n' "PGPORT=\${PGPORT:-}" >> "${isreadyLog}"
printf '%s\\n' "PGUSER=\${PGUSER:-}" >> "${isreadyLog}"
exit 0
`;
  fs.writeFileSync(
    path.join(fixture.binDir, "pg_isready"),
    isreadyScript,
    "utf8",
  );
  fs.chmodSync(path.join(fixture.binDir, "pg_isready"), 0o755);

  return {
    ...fixture,
    restoreLog,
    psqlLog,
    isreadyLog,
    runWithMock(args = [], runOpts = {}) {
      const { env: extraEnv, ...restOpts } = runOpts;
      return fixture.run(args, {
        ...restOpts,
        env: {
          PGPASSWORD: "testpassword",
          ...(extraEnv || {}),
        },
      });
    },
  };
}

test("restore-postgres CLI argument parsing", async (t) => {
  await t.test("--help outputs usage and exits 0", () => {
    const res = runRunner(["--help"]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage: scripts\/ops\/restore-postgres\.sh/);
    assert.equal(res.stderr, "");
  });

  await t.test("-h outputs usage and exits 0", () => {
    const res = runRunner(["-h"]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage: scripts\/ops\/restore-postgres\.sh/);
    assert.equal(res.stderr, "");
  });

  await t.test("unknown long option exits 1 with usage to stderr", () => {
    const res = runRunner(["--invalid-flag"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Unknown option "--invalid-flag"/);
    assert.match(res.stderr, /Usage: scripts\/ops\/restore-postgres\.sh/);
  });

  await t.test("unknown short option exits 1 with usage to stderr", () => {
    const res = runRunner(["-x"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Unknown option "-x"/);
    assert.match(res.stderr, /Usage: scripts\/ops\/restore-postgres\.sh/);
  });

  await t.test("missing --cwd value exits 1", () => {
    const res = runRunner(["--cwd"]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: --cwd requires a non-empty directory path/,
    );
  });

  await t.test("--cwd followed by flag exits 1", () => {
    const res = runRunner(["--cwd", "--dry-run"]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: --cwd requires a non-empty directory path/,
    );
  });

  await t.test("repeated --cwd option exits 1", () => {
    const res = runRunner(["--cwd", ".", "--cwd", "."]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Repeated --cwd option/);
  });

  await t.test("empty --cwd value exits 1", () => {
    const res = runRunner(["--cwd="]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --cwd path cannot be empty/);
  });

  await t.test("whitespace --cwd value exits 1", () => {
    const res = runRunner(["--cwd", "   "]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --cwd path cannot be empty/);
  });

  await t.test("non-existent --cwd directory exits 1", () => {
    const res = runRunner(["--cwd", "/path/that/does/not/exist/acres/ops"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /restore error: target directory does not exist:/);
  });

  await t.test("missing --host value exits 1", () => {
    const res = runRunner(["--host"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --host requires a value/);
  });

  await t.test("--host followed by flag exits 1", () => {
    const res = runRunner(["--host", "--port"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --host requires a value/);
  });

  await t.test("repeated --host option exits 1", () => {
    const res = runRunner(["--host", "h1", "--host", "h2"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Repeated --host option/);
  });

  await t.test("empty --host value exits 1", () => {
    const res = runRunner(["--host="]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --host cannot be empty/);
  });

  await t.test("whitespace --host value exits 1", () => {
    const res = runRunner(["--host", "   "]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --host cannot be empty/);
  });

  await t.test("missing --port value exits 1", () => {
    const res = runRunner(["--port"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --port requires a value/);
  });

  await t.test("--port followed by flag exits 1", () => {
    const res = runRunner(["--port", "--user"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --port requires a value/);
  });

  await t.test("repeated --port option exits 1", () => {
    const res = runRunner(["--port", "5432", "--port", "5433"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Repeated --port option/);
  });

  await t.test("empty --port value exits 1", () => {
    const res = runRunner(["--port="]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --port cannot be empty/);
  });

  await t.test("invalid non-numeric --port value exits 1", () => {
    const res = runRunner(["--port", "abc"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Invalid --port "abc"/);
  });

  await t.test("invalid zero --port value exits 1", () => {
    const res = runRunner(["--port", "0"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Invalid --port "0"/);
  });

  await t.test("invalid out of range --port value exits 1", () => {
    const res = runRunner(["--port", "65536"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Invalid --port "65536"/);
  });

  await t.test("multi-digit overflow --port value exits 1", () => {
    const res = runRunner([
      "--port",
      "9999999999999999999999999999999999999999",
    ]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: Invalid --port "9999999999999999999999999999999999999999"/,
    );
  });

  await t.test("six-digit --port=100000 exits 1", () => {
    const res = runRunner(["--port=100000"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Invalid --port "100000"/);
  });

  await t.test("missing --user value exits 1", () => {
    const res = runRunner(["--user"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --user requires a value/);
  });

  await t.test("--user followed by flag exits 1", () => {
    const res = runRunner(["--user", "--dbname"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --user requires a value/);
  });

  await t.test("repeated --user option exits 1", () => {
    const res = runRunner(["--user", "u1", "--user", "u2"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Repeated --user option/);
  });

  await t.test("empty --user value exits 1", () => {
    const res = runRunner(["--user="]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --user cannot be empty/);
  });

  await t.test("missing --dbname value exits 1", () => {
    const res = runRunner(["--dbname"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --dbname requires a value/);
  });

  await t.test("--dbname followed by flag exits 1", () => {
    const res = runRunner(["--dbname", "--file"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --dbname requires a value/);
  });

  await t.test("repeated --dbname option exits 1", () => {
    const res = runRunner(["--dbname", "d1", "--dbname", "d2"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Repeated --dbname option/);
  });

  await t.test("empty --dbname value exits 1", () => {
    const res = runRunner(["--dbname="]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --dbname cannot be empty/);
  });

  await t.test("missing --file value exits 1", () => {
    const res = runRunner(["--file"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --file requires a value/);
  });

  await t.test("missing --input-file value exits 1", () => {
    const res = runRunner(["--input-file"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --input-file requires a value/);
  });

  await t.test("repeated --file option exits 1", () => {
    const res = runRunner(["--file", "f1.dump", "--file", "f2.dump"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Repeated backup file option/);
  });

  await t.test("empty --file value exits 1", () => {
    const res = runRunner(["--file="]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: backup file path cannot be empty/);
  });

  await t.test("conflicting --clean and --no-clean flags exit 1", () => {
    const res = runRunner(["--clean", "--no-clean"]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: Conflicting --clean and --no-clean options/,
    );
  });

  await t.test("conflicting --no-clean and --clean flags exit 1", () => {
    const res = runRunner(["--no-clean", "--clean"]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: Conflicting --clean and --no-clean options/,
    );
  });

  await t.test("positional argument clashing with --file exits 1", () => {
    const res = runRunner(["pos.dump", "--file", "flag.dump"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Repeated backup file option/);
  });

  await t.test("--file clashing with positional argument exits 1", () => {
    const res = runRunner(["--file", "flag.dump", "pos.dump"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Unexpected argument "pos\.dump"/);
  });

  await t.test("multiple positional arguments exit 1", () => {
    const res = runRunner(["first.dump", "second.dump"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Unexpected argument "second\.dump"/);
  });

  await t.test("empty positional argument exits 1", () => {
    const res = runRunner([""]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: backup file path cannot be empty/);
  });

  await t.test("whitespace-only positional argument exits 1", () => {
    const res = runRunner(["   "]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: backup file path cannot be empty/);
  });
});

test("restore-postgres backup file validation", async (t) => {
  const fixture = makeCleanFixture(t);

  await t.test("missing backup file argument entirely exits 1", () => {
    const res = fixture.run([]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /restore error: backup file path is required/);
  });

  await t.test("non-existent backup file exits 1", () => {
    const res = fixture.run(["non-existent-backup-file.dump"]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /restore error: backup file does not exist: .*non-existent-backup-file\.dump/,
    );
  });

  await t.test("directory specified as backup file exits 1", () => {
    const testDir = path.join(fixture.tmpDir, "some-directory");
    fs.mkdirSync(testDir, { recursive: true });
    const res = fixture.run([testDir]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /restore error: backup target is not a regular file:/,
    );
  });

  await t.test("empty backup file exits 1", () => {
    const emptyFile = path.join(fixture.tmpDir, "empty.dump");
    fs.writeFileSync(emptyFile, "", "utf8");
    const res = fixture.run([emptyFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /restore error: backup file is empty:/);
  });
});

test("restore-postgres tool prerequisites and credential validation", async (t) => {
  await t.test("missing pg_restore in PATH exits 1", (tInner) => {
    const fixture = makeCleanFixture(tInner);
    const isolatedBin = makeIsolatedBinWithWrappers(fixture.tmpDir, {
      psql: "#!/bin/sh\nexit 0\n",
      pg_isready: "#!/bin/sh\nexit 0\n",
    });
    const res = fixture.run([fixture.dumpFile], {
      env: { PATH: isolatedBin, PGPASSWORD: "pw" },
    });
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /restore error: pg_restore utility not found in PATH/,
    );
  });

  await t.test("missing psql in PATH exits 1", (tInner) => {
    const fixture = makeCleanFixture(tInner);
    const isolatedBin = makeIsolatedBinWithWrappers(fixture.tmpDir, {
      pg_restore: "#!/bin/sh\nexit 0\n",
      pg_isready: "#!/bin/sh\nexit 0\n",
    });
    const res = fixture.run([fixture.dumpFile], {
      env: { PATH: isolatedBin, PGPASSWORD: "pw" },
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /restore error: psql utility not found in PATH/);
  });

  await t.test("missing pg_isready in PATH exits 1", (tInner) => {
    const fixture = makeCleanFixture(tInner);
    const isolatedBin = makeIsolatedBinWithWrappers(fixture.tmpDir, {
      pg_restore: "#!/bin/sh\nexit 0\n",
      psql: "#!/bin/sh\nexit 0\n",
    });
    const res = fixture.run([fixture.dumpFile], {
      env: { PATH: isolatedBin, PGPASSWORD: "pw" },
    });
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /restore error: pg_isready utility not found in PATH/,
    );
  });

  await t.test(
    "missing all password environment variables exits 1",
    (tInner) => {
      const fixture = makeCleanFixture(tInner);
      const res = fixture.run([fixture.dumpFile], {
        env: {
          PGPASSWORD: "",
          POSTGRES_PASSWORD: "",
          POSTGRES_SUPERUSER_PASSWORD: "",
          ACRES_MIGRATOR_PASSWORD: "",
        },
      });
      assert.equal(res.status, 1);
      assert.match(
        res.stderr,
        /restore error: PGPASSWORD environment variable is required/,
      );
    },
  );

  await t.test("resolves credentials from PGPASSWORD", (tInner) => {
    const fixture = makeMockFixture(tInner);
    const res = fixture.runWithMock([fixture.dumpFile], {
      env: {
        PGPASSWORD: "primary-pgpassword",
        POSTGRES_PASSWORD: "alt",
      },
    });
    assert.equal(res.status, 0);
    const restoreContent = fs.readFileSync(fixture.restoreLog, "utf8");
    assert.match(restoreContent, /PGPASSWORD=primary-pgpassword/);
  });

  await t.test(
    "resolves credentials fallback from POSTGRES_PASSWORD",
    (tInner) => {
      const fixture = makeMockFixture(tInner);
      const res = fixture.runWithMock([fixture.dumpFile], {
        env: {
          PGPASSWORD: "",
          POSTGRES_PASSWORD: "postgres-password-fallback",
        },
      });
      assert.equal(res.status, 0);
      const restoreContent = fs.readFileSync(fixture.restoreLog, "utf8");
      assert.match(restoreContent, /PGPASSWORD=postgres-password-fallback/);
    },
  );

  await t.test(
    "resolves credentials fallback from POSTGRES_SUPERUSER_PASSWORD",
    (tInner) => {
      const fixture = makeMockFixture(tInner);
      const res = fixture.runWithMock([fixture.dumpFile], {
        env: {
          PGPASSWORD: "",
          POSTGRES_PASSWORD: "",
          POSTGRES_SUPERUSER_PASSWORD: "superuser-password-fallback",
        },
      });
      assert.equal(res.status, 0);
      const restoreContent = fs.readFileSync(fixture.restoreLog, "utf8");
      assert.match(restoreContent, /PGPASSWORD=superuser-password-fallback/);
    },
  );

  await t.test(
    "resolves credentials fallback from ACRES_MIGRATOR_PASSWORD",
    (tInner) => {
      const fixture = makeMockFixture(tInner);
      const res = fixture.runWithMock([fixture.dumpFile], {
        env: {
          PGPASSWORD: "",
          POSTGRES_PASSWORD: "",
          POSTGRES_SUPERUSER_PASSWORD: "",
          ACRES_MIGRATOR_PASSWORD: "migrator-password-fallback",
        },
      });
      assert.equal(res.status, 0);
      const restoreContent = fs.readFileSync(fixture.restoreLog, "utf8");
      assert.match(restoreContent, /PGPASSWORD=migrator-password-fallback/);
    },
  );

  await t.test("never leaks password to stdout or stderr", (tInner) => {
    const secret = "SUPER_SECRET_RESTORE_PASS_XYZ123";
    const fixture = makeMockFixture(tInner);
    const res = fixture.runWithMock([fixture.dumpFile], {
      env: { PGPASSWORD: secret },
    });
    assert.equal(res.status, 0);
    assert.doesNotMatch(res.stdout, new RegExp(secret));
    assert.doesNotMatch(res.stderr, new RegExp(secret));
  });

  await t.test("rejects invalid PGPORT environment variable", (tInner) => {
    const fixture = makeCleanFixture(tInner);
    const res = fixture.run(["--dry-run", fixture.dumpFile], {
      env: {
        PGPASSWORD: "testpassword",
        PGPORT: "not-a-port",
      },
    });
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /restore error: invalid port: not-a-port \(expected integer 1-65535\)/,
    );
  });

  await t.test(
    "rejects multi-digit overflow PGPORT environment variable",
    (tInner) => {
      const fixture = makeCleanFixture(tInner);
      const res = fixture.run(["--dry-run", fixture.dumpFile], {
        env: {
          PGPASSWORD: "testpassword",
          PGPORT: "9999999999999999999999999999999999999999",
        },
      });
      assert.equal(res.status, 1);
      assert.match(
        res.stderr,
        /restore error: invalid port: 9999999999999999999999999999999999999999 \(expected integer 1-65535\)/,
      );
    },
  );
});

test("restore-postgres --dry-run mode", async (t) => {
  await t.test(
    "--dry-run prints plan and exits 0 without invoking tools",
    (tInner) => {
      const fixture = makeMockFixture(tInner);
      const res = fixture.runWithMock([
        "--dry-run",
        "--host",
        "db.internal",
        "--port",
        "5433",
        "--user",
        "admin",
        "--dbname",
        "testdb",
        fixture.dumpFile,
      ]);
      assert.equal(res.status, 0);
      assert.match(res.stdout, /\[dry-run\] PostgreSQL restore plan:/);
      assert.match(res.stdout, /\[dry-run\]\s+Host: db\.internal/);
      assert.match(res.stdout, /\[dry-run\]\s+Port: 5433/);
      assert.match(res.stdout, /\[dry-run\]\s+User: admin/);
      assert.match(res.stdout, /\[dry-run\]\s+Database: testdb/);
      assert.match(
        res.stdout,
        /\[dry-run\]\s+Backup file: .*sample-backup\.dump/,
      );
      assert.match(res.stdout, /\[dry-run\]\s+Clean mode: enabled/);
      assert.match(res.stdout, /\[dry-run\] Dry run completed successfully\./);

      // Verify tools were NOT called
      assert.equal(fs.existsSync(fixture.restoreLog), false);
      assert.equal(fs.existsSync(fixture.psqlLog), false);
      assert.equal(fs.existsSync(fixture.isreadyLog), false);
    },
  );

  await t.test(
    "--dry-run reports disabled clean mode with --no-clean",
    (tInner) => {
      const fixture = makeMockFixture(tInner);
      const res = fixture.runWithMock([
        "--dry-run",
        "--no-clean",
        fixture.dumpFile,
      ]);
      assert.equal(res.status, 0);
      assert.match(res.stdout, /\[dry-run\]\s+Clean mode: disabled/);
    },
  );

  await t.test("--dry-run fails closed if password is missing", (tInner) => {
    const fixture = makeCleanFixture(tInner);
    const res = fixture.run(["--dry-run", fixture.dumpFile], {
      env: {
        PGPASSWORD: "",
        POSTGRES_PASSWORD: "",
        POSTGRES_SUPERUSER_PASSWORD: "",
        ACRES_MIGRATOR_PASSWORD: "",
      },
    });
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /restore error: PGPASSWORD environment variable is required/,
    );
  });

  await t.test("--dry-run fails closed if backup file is missing", (tInner) => {
    const fixture = makeCleanFixture(tInner);
    const res = fixture.run(["--dry-run", "non-existent.dump"], {
      env: {
        PGPASSWORD: "pw",
      },
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /restore error: backup file does not exist:/);
  });
});

test("restore-postgres mock execution and failure handling", async (t) => {
  await t.test(
    "successful restore flow executes all steps and verifies tables",
    (tInner) => {
      const fixture = makeMockFixture(tInner);
      const res = fixture.runWithMock([fixture.dumpFile]);
      assert.equal(res.status, 0);
      assert.match(
        res.stdout,
        /Checking target PostgreSQL connection on localhost:5432\.\.\./,
      );
      assert.match(
        res.stdout,
        /Restoring .*sample-backup\.dump into database "acres" on localhost:5432\.\.\./,
      );
      assert.match(
        res.stdout,
        /PostgreSQL restore completed successfully\. Verified 35 tables in public schema\./,
      );

      // Verify pg_restore arguments
      const restoreContent = fs.readFileSync(fixture.restoreLog, "utf8");
      assert.match(restoreContent, /--clean/);
      assert.match(restoreContent, /--if-exists/);
      assert.match(restoreContent, /--no-owner/);
      assert.match(restoreContent, /--no-privileges/);
      assert.match(restoreContent, /--dbname=acres/);
      assert.match(restoreContent, /sample-backup\.dump/);

      // Verify psql query arguments
      const psqlContent = fs.readFileSync(fixture.psqlLog, "utf8");
      assert.match(psqlContent, /-t/);
      assert.match(psqlContent, /-A/);
      assert.match(psqlContent, /information_schema\.tables/);
    },
  );

  await t.test(
    "--no-clean omits --clean and --if-exists from pg_restore",
    (tInner) => {
      const fixture = makeMockFixture(tInner);
      const res = fixture.runWithMock(["--no-clean", fixture.dumpFile]);
      assert.equal(res.status, 0);

      const restoreContent = fs.readFileSync(fixture.restoreLog, "utf8");
      assert.doesNotMatch(restoreContent, /--clean/);
      assert.doesNotMatch(restoreContent, /--if-exists/);
      assert.match(restoreContent, /--no-owner/);
      assert.match(restoreContent, /--no-privileges/);
      assert.match(restoreContent, /--dbname=acres/);
    },
  );

  await t.test(
    "explicit --clean includes --clean and --if-exists",
    (tInner) => {
      const fixture = makeMockFixture(tInner);
      const res = fixture.runWithMock(["--clean", fixture.dumpFile]);
      assert.equal(res.status, 0);

      const restoreContent = fs.readFileSync(fixture.restoreLog, "utf8");
      assert.match(restoreContent, /--clean/);
      assert.match(restoreContent, /--if-exists/);
    },
  );

  await t.test("pg_isready failure halts restore and exits 1", (tInner) => {
    const fixture = makeMockFixture(tInner, {
      mockPgIsready: "#!/bin/sh\nexit 1\n",
    });
    const res = fixture.runWithMock([fixture.dumpFile]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /restore error: PostgreSQL is not ready on localhost:5432/,
    );
    assert.equal(fs.existsSync(fixture.restoreLog), false);
  });

  await t.test("pg_restore failure exits non-zero", (tInner) => {
    const fixture = makeMockFixture(tInner, {
      mockPgRestore: "#!/bin/sh\nprintf 'restore fatal error\\n' >&2\nexit 2\n",
    });
    const res = fixture.runWithMock([fixture.dumpFile]);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /restore fatal error/);
  });

  await t.test("psql query failure exits non-zero", (tInner) => {
    const fixture = makeMockFixture(tInner, {
      mockPsql: "#!/bin/sh\nprintf 'psql connection failure\\n' >&2\nexit 3\n",
    });
    const res = fixture.runWithMock([fixture.dumpFile]);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /psql connection failure/);
  });

  await t.test("psql returning non-numeric table count exits 1", (tInner) => {
    const fixture = makeMockFixture(tInner, {
      mockPsql: "#!/bin/sh\nprintf 'NOT_A_NUMBER\\n'\nexit 0\n",
    });
    const res = fixture.runWithMock([fixture.dumpFile]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /restore error: failed to verify public schema table count after restore/,
    );
  });

  await t.test("psql returning empty table count exits 1", (tInner) => {
    const fixture = makeMockFixture(tInner, {
      mockPsql: "#!/bin/sh\nprintf '\\n'\nexit 0\n",
    });
    const res = fixture.runWithMock([fixture.dumpFile]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /restore error: failed to verify public schema table count after restore/,
    );
  });
});

test("restore-postgres directory targeting and custom paths", async (t) => {
  await t.test("resolves relative backup file against --cwd", (tInner) => {
    const fixture = makeMockFixture(tInner);
    const subDir = path.join(fixture.tmpDir, "subproject");
    fs.mkdirSync(subDir, { recursive: true });
    const subDump = path.join(subDir, "rel-backup.dump");
    fs.writeFileSync(subDump, "REL_BACKUP_DUMP_DATA", "utf8");

    const res = fixture.runWithMock([
      "--cwd",
      subDir,
      "--file",
      "rel-backup.dump",
    ]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Restoring .*rel-backup\.dump/);
    const restoreContent = fs.readFileSync(fixture.restoreLog, "utf8");
    assert.match(restoreContent, new RegExp(subDump));
  });

  await t.test("resolves positional backup file against --cwd", (tInner) => {
    const fixture = makeMockFixture(tInner);
    const subDir = path.join(fixture.tmpDir, "subproject2");
    fs.mkdirSync(subDir, { recursive: true });
    const subDump = path.join(subDir, "positional-rel.dump");
    fs.writeFileSync(subDump, "POSITIONAL_DUMP_DATA", "utf8");

    const res = fixture.runWithMock(["--cwd", subDir, "positional-rel.dump"]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Restoring .*positional-rel\.dump/);
  });

  await t.test("supports --input-file and --file= syntax", (tInner) => {
    const fixture = makeMockFixture(tInner);
    const res1 = fixture.runWithMock([`--file=${fixture.dumpFile}`]);
    assert.equal(res1.status, 0);

    const res2 = fixture.runWithMock([`--input-file=${fixture.dumpFile}`]);
    assert.equal(res2.status, 0);

    const res3 = fixture.runWithMock(["--input-file", fixture.dumpFile]);
    assert.equal(res3.status, 0);
  });

  await t.test(
    "supports custom database connection parameters via CLI flags",
    (tInner) => {
      const fixture = makeMockFixture(tInner);
      const res = fixture.runWithMock([
        "--host=remote.db",
        "--port=5434",
        "--user=dbowner",
        "--dbname=customacres",
        fixture.dumpFile,
      ]);
      assert.equal(res.status, 0);

      const isreadyContent = fs.readFileSync(fixture.isreadyLog, "utf8");
      assert.match(isreadyContent, /-h\nremote\.db/);
      assert.match(isreadyContent, /-p\n5434/);
      assert.match(isreadyContent, /PGHOST=remote\.db/);
      assert.match(isreadyContent, /PGPORT=5434/);
      assert.match(isreadyContent, /PGUSER=dbowner/);

      const restoreContent = fs.readFileSync(fixture.restoreLog, "utf8");
      assert.match(restoreContent, /--dbname=customacres/);
      assert.match(restoreContent, /PGHOST=remote\.db/);
      assert.match(restoreContent, /PGPORT=5434/);
      assert.match(restoreContent, /PGUSER=dbowner/);
      assert.match(restoreContent, /PGDATABASE=customacres/);

      const psqlContent = fs.readFileSync(fixture.psqlLog, "utf8");
      assert.match(psqlContent, /PGHOST=remote\.db/);
      assert.match(psqlContent, /PGPORT=5434/);
      assert.match(psqlContent, /PGUSER=dbowner/);
      assert.match(psqlContent, /PGDATABASE=customacres/);
    },
  );
});
