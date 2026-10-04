const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const RUNNER = path.join(ROOT, "scripts/ops/backup-postgres.sh");

function runRunner(args = [], options = {}) {
  const runnerPath = options.runner || RUNNER;
  return spawnSync("/bin/sh", [runnerPath, ...args], {
    cwd: options.cwd || ROOT,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
  });
}

function makeCleanFixture(t) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-backup-test-"));
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  const opsDir = path.join(tmpDir, "scripts/ops");
  fs.mkdirSync(opsDir, { recursive: true });
  const scriptPath = path.join(opsDir, "backup-postgres.sh");
  fs.copyFileSync(RUNNER, scriptPath);
  fs.chmodSync(scriptPath, 0o755);

  const binDir = path.join(tmpDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const mockPgDump = path.join(binDir, "pg_dump");
  fs.writeFileSync(mockPgDump, "#!/bin/sh\nexit 0\n", "utf8");
  fs.chmodSync(mockPgDump, 0o755);

  return {
    tmpDir,
    scriptPath,
    binDir,
    run(args = [], runOpts = {}) {
      return runRunner(args, {
        runner: scriptPath,
        cwd: tmpDir,
        env: {
          PATH: `${binDir}:${process.env.PATH || ""}`,
          ...(runOpts.env || {}),
        },
        ...runOpts,
      });
    },
  };
}

function makeMockPgDumpFixture(t, mockScript) {
  const fixture = makeCleanFixture(t);
  const pgDumpPath = path.join(fixture.binDir, "pg_dump");
  fs.writeFileSync(pgDumpPath, mockScript, "utf8");
  fs.chmodSync(pgDumpPath, 0o755);

  const envWithMock = {
    PATH: `${fixture.binDir}:${process.env.PATH || ""}`,
    PGPASSWORD: "testpassword",
  };

  return {
    ...fixture,
    pgDumpPath,
    envWithMock,
    runWithMock(args = [], runOpts = {}) {
      return fixture.run(args, {
        env: { ...envWithMock, ...(runOpts.env || {}) },
        ...runOpts,
      });
    },
  };
}

test("backup-postgres CLI argument parsing", async (t) => {
  await t.test("--help outputs usage and exits 0", () => {
    const res = runRunner(["--help"]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage: scripts\/ops\/backup-postgres\.sh/);
    assert.equal(res.stderr, "");
  });

  await t.test("-h outputs usage and exits 0", () => {
    const res = runRunner(["-h"]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage: scripts\/ops\/backup-postgres\.sh/);
    assert.equal(res.stderr, "");
  });

  await t.test("unknown long option exits 1 with usage to stderr", () => {
    const res = runRunner(["--invalid-flag"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Unknown option "--invalid-flag"/);
    assert.match(res.stderr, /Usage: scripts\/ops\/backup-postgres\.sh/);
  });

  await t.test("unknown short option exits 1 with usage to stderr", () => {
    const res = runRunner(["-x"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Unknown option "-x"/);
    assert.match(res.stderr, /Usage: scripts\/ops\/backup-postgres\.sh/);
  });

  await t.test(
    "unexpected positional argument exits 1 with usage to stderr",
    () => {
      const res = runRunner(["unexpected-arg"]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /Error: Unexpected argument "unexpected-arg"/);
      assert.match(res.stderr, /Usage: scripts\/ops\/backup-postgres\.sh/);
    },
  );

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

  await t.test("non-existent --cwd directory exits 1", () => {
    const res = runRunner(["--cwd", "/path/that/does/not/exist/acres/ops"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /backup error: target directory does not exist:/);
  });

  await t.test("missing --backup-dir value exits 1", () => {
    const res = runRunner(["--backup-dir"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --backup-dir requires a value/);
  });

  await t.test("--backup-dir followed by flag exits 1", () => {
    const res = runRunner(["--backup-dir", "--host"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --backup-dir requires a value/);
  });

  await t.test("repeated --backup-dir option exits 1", () => {
    const res = runRunner(["--backup-dir", "a", "--backup-dir", "b"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Repeated --backup-dir option/);
  });

  await t.test("empty --backup-dir value exits 1", () => {
    const res = runRunner(["--backup-dir="]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --backup-dir cannot be empty/);
  });

  await t.test("missing --host value exits 1", () => {
    const res = runRunner(["--host"]);
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

  await t.test("missing --port value exits 1", () => {
    const res = runRunner(["--port"]);
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

  await t.test("non-numeric --port value exits 1", () => {
    const res = runRunner(["--port", "not-a-port"]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: Invalid --port "not-a-port" \(expected integer 1-65535\)/,
    );
  });

  await t.test("zero --port value exits 1", () => {
    const res = runRunner(["--port", "0"]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: Invalid --port "0" \(expected integer 1-65535\)/,
    );
  });

  await t.test("out-of-range --port value exits 1", () => {
    const res = runRunner(["--port", "70000"]);
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /Error: Invalid --port "70000" \(expected integer 1-65535\)/,
    );
  });

  await t.test("missing --user value exits 1", () => {
    const res = runRunner(["--user"]);
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

  await t.test("missing --output-file value exits 1", () => {
    const res = runRunner(["--output-file"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --output-file requires a value/);
  });

  await t.test("repeated --output-file option exits 1", () => {
    const res = runRunner(["--output-file", "o1", "--output-file", "o2"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: Repeated --output-file option/);
  });

  await t.test("empty --output-file value exits 1", () => {
    const res = runRunner(["--output-file="]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error: --output-file cannot be empty/);
  });

  await t.test(
    "all options accept inline --option=val syntax cleanly in --dry-run",
    (t2) => {
      const fixture = makeCleanFixture(t2);
      const res = fixture.run(
        [
          `--cwd=${fixture.tmpDir}`,
          "--backup-dir=custom_dir",
          "--host=db.example.internal",
          "--port=5433",
          "--user=acres_admin",
          "--dbname=acres_production",
          "--output-file=custom_dir/custom-backup.dump",
          "--dry-run",
        ],
        {
          env: { PGPASSWORD: "testpassword" },
        },
      );
      assert.equal(res.status, 0);
      assert.match(res.stdout, /Host: db\.example\.internal/);
      assert.match(res.stdout, /Port: 5433/);
      assert.match(res.stdout, /User: acres_admin/);
      assert.match(res.stdout, /Database: acres_production/);
      assert.match(res.stdout, /Output file: .*custom-backup\.dump/);
      assert.match(res.stdout, /Dry run completed successfully/);
    },
  );
});

test("backup-postgres tool prerequisites and credential validation", async (t) => {
  await t.test("fails if pg_dump is not available in PATH", (t2) => {
    const fixture = makeCleanFixture(t2);
    const isolatedBin = path.join(fixture.tmpDir, "no_pg_dump_bin");
    fs.mkdirSync(isolatedBin, { recursive: true });
    const whichTr = spawnSync("which", ["tr"], { encoding: "utf8" });
    const trBin =
      whichTr.status === 0 && whichTr.stdout
        ? whichTr.stdout.trim()
        : "/usr/bin/tr";
    const trPath = path.join(isolatedBin, "tr");
    fs.writeFileSync(trPath, `#!/bin/sh\nexec ${trBin} "$@"\n`, "utf8");
    fs.chmodSync(trPath, 0o755);

    const res = fixture.run(["--dry-run"], {
      env: {
        PATH: isolatedBin,
        PGPASSWORD: "testpassword",
      },
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /backup error: pg_dump utility not found in PATH/);
  });

  await t.test(
    "fails if all password environment variables are unset",
    (t2) => {
      const fixture = makeCleanFixture(t2);
      const res = fixture.run(["--dry-run"], {
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
        /backup error: PGPASSWORD environment variable is required/,
      );
    },
  );

  await t.test("succeeds with PGPASSWORD", (t2) => {
    const fixture = makeCleanFixture(t2);
    const res = fixture.run(["--dry-run"], {
      env: { PGPASSWORD: "primary_pw" },
    });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Dry run completed successfully/);
  });

  await t.test("falls back to POSTGRES_PASSWORD", (t2) => {
    const fixture = makeCleanFixture(t2);
    const res = fixture.run(["--dry-run"], {
      env: {
        PGPASSWORD: "",
        POSTGRES_PASSWORD: "pg_password",
      },
    });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Dry run completed successfully/);
  });

  await t.test("falls back to POSTGRES_SUPERUSER_PASSWORD", (t2) => {
    const fixture = makeCleanFixture(t2);
    const res = fixture.run(["--dry-run"], {
      env: {
        PGPASSWORD: "",
        POSTGRES_PASSWORD: "",
        POSTGRES_SUPERUSER_PASSWORD: "su_password",
      },
    });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Dry run completed successfully/);
  });

  await t.test("falls back to ACRES_MIGRATOR_PASSWORD", (t2) => {
    const fixture = makeCleanFixture(t2);
    const res = fixture.run(["--dry-run"], {
      env: {
        PGPASSWORD: "",
        POSTGRES_PASSWORD: "",
        POSTGRES_SUPERUSER_PASSWORD: "",
        ACRES_MIGRATOR_PASSWORD: "migrator_password",
      },
    });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Dry run completed successfully/);
  });

  await t.test("rejects invalid PGPORT environment variable", (t2) => {
    const fixture = makeCleanFixture(t2);
    const res = fixture.run(["--dry-run"], {
      env: {
        PGPASSWORD: "testpassword",
        PGPORT: "not-a-port",
      },
    });
    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /backup error: invalid port: not-a-port \(expected integer 1-65535\)/,
    );
  });
});

test("backup-postgres --dry-run mode", async (t) => {
  await t.test("creates target directory with 0700 permissions", (t2) => {
    const fixture = makeCleanFixture(t2);
    const targetDir = path.join(fixture.tmpDir, "custom_backups");
    const res = fixture.run(
      [`--cwd=${fixture.tmpDir}`, `--backup-dir=${targetDir}`, "--dry-run"],
      {
        env: { PGPASSWORD: "testpassword" },
      },
    );
    assert.equal(res.status, 0);
    assert.ok(fs.existsSync(targetDir));
    const stat = fs.statSync(targetDir);
    assert.equal(stat.mode & 0o777, 0o700);
  });

  await t.test(
    "prints planned parameters without creating output dump file",
    (t2) => {
      const fixture = makeCleanFixture(t2);
      const outputFile = path.join(
        fixture.tmpDir,
        "backups/test-plan-dump.dump",
      );
      const res = fixture.run(
        [
          `--cwd=${fixture.tmpDir}`,
          `--output-file=${outputFile}`,
          "--host=postgres.acres.internal",
          "--port=5432",
          "--user=acres_writer",
          "--dbname=acres_db",
          "--dry-run",
        ],
        {
          env: { PGPASSWORD: "testpassword" },
        },
      );
      assert.equal(res.status, 0);
      assert.match(res.stdout, /Host: postgres\.acres\.internal/);
      assert.match(res.stdout, /Port: 5432/);
      assert.match(res.stdout, /User: acres_writer/);
      assert.match(res.stdout, /Database: acres_db/);
      assert.match(res.stdout, /Output file: .*test-plan-dump\.dump/);
      assert.ok(!fs.existsSync(outputFile));
    },
  );
});

test("backup-postgres mock execution and failure handling", async (t) => {
  await t.test(
    "executes pg_dump with expected flags, writes dump, and sets 0600 permissions",
    (t2) => {
      const mockScript = `#!/bin/sh
# Log arguments and environment
echo "HOST=$PGHOST" > "$1.log"
echo "PORT=$PGPORT" >> "$1.log"
echo "USER=$PGUSER" >> "$1.log"
echo "DB=$PGDATABASE" >> "$1.log"
echo "ARGS=$*" >> "$1.log"

# Parse output file from --file=
for arg in "$@"; do
  case "$arg" in
    --file=*)
      TARGET_FILE="\${arg#--file=}"
      printf 'PG_CUSTOM_ARCHIVE_MOCK_DATA' > "$TARGET_FILE"
      ;;
  esac
done
exit 0
`;
      const fixture = makeMockPgDumpFixture(t2, mockScript);
      const targetDir = path.join(fixture.tmpDir, "backups");
      const res = fixture.runWithMock([
        `--cwd=${fixture.tmpDir}`,
        `--backup-dir=${targetDir}`,
        "--host=mockhost",
        "--port=5434",
        "--user=mockuser",
        "--dbname=mockdb",
      ]);

      assert.equal(res.status, 0);
      assert.match(
        res.stdout,
        /Starting PostgreSQL backup for database "mockdb"/,
      );
      assert.match(
        res.stdout,
        /PostgreSQL backup completed successfully: .* \(27 bytes\)/,
      );

      const files = fs.readdirSync(targetDir);
      const dumpFile = files.find((f) => f.endsWith(".dump"));
      assert.ok(dumpFile, "dump file was created");
      const dumpFilePath = path.join(targetDir, dumpFile);
      const dumpStat = fs.statSync(dumpFilePath);
      assert.equal(dumpStat.mode & 0o777, 0o600);
      assert.equal(
        fs.readFileSync(dumpFilePath, "utf8"),
        "PG_CUSTOM_ARCHIVE_MOCK_DATA",
      );
    },
  );

  await t.test(
    "cleans up and fails closed if pg_dump produces an empty file",
    (t2) => {
      const mockScript = `#!/bin/sh
for arg in "$@"; do
  case "$arg" in
    --file=*)
      TARGET_FILE="\${arg#--file=}"
      touch "$TARGET_FILE" # empty file
      ;;
  esac
done
exit 0
`;
      const fixture = makeMockPgDumpFixture(t2, mockScript);
      const targetDir = path.join(fixture.tmpDir, "backups");
      const res = fixture.runWithMock([
        `--cwd=${fixture.tmpDir}`,
        `--backup-dir=${targetDir}`,
      ]);

      assert.equal(res.status, 1);
      assert.match(
        res.stderr,
        /backup error: generated backup file is empty or missing/,
      );

      const files = fs.readdirSync(targetDir);
      const dumpFile = files.find((f) => f.endsWith(".dump"));
      assert.equal(dumpFile, undefined, "empty dump file was removed");
    },
  );

  await t.test("fails closed if pg_dump exits with error", (t2) => {
    const mockScript = `#!/bin/sh
echo "pg_dump: connection error: could not connect to server" >&2
exit 1
`;
    const fixture = makeMockPgDumpFixture(t2, mockScript);
    const res = fixture.runWithMock([`--cwd=${fixture.tmpDir}`]);

    assert.equal(res.status, 1);
    assert.match(
      res.stderr,
      /pg_dump: connection error: could not connect to server/,
    );
  });
});

test("backup-postgres directory targeting and custom paths", async (t) => {
  const mockScript = `#!/bin/sh
for arg in "$@"; do
  case "$arg" in
    --file=*)
      TARGET_FILE="\${arg#--file=}"
      printf 'MOCK_PG_DUMP_BYTES' > "$TARGET_FILE"
      ;;
  esac
done
exit 0
`;

  await t.test(
    "writes to relative --output-file resolved against --cwd",
    (t2) => {
      const fixture = makeMockPgDumpFixture(t2, mockScript);
      const relOut = "nested/deep/my-custom-backup.dump";
      const res = fixture.runWithMock([
        `--cwd=${fixture.tmpDir}`,
        `--output-file=${relOut}`,
      ]);
      assert.equal(res.status, 0);
      const expectedPath = path.join(fixture.tmpDir, relOut);
      assert.ok(fs.existsSync(expectedPath));
      const parentDir = path.dirname(expectedPath);
      const dirStat = fs.statSync(parentDir);
      assert.equal(dirStat.mode & 0o777, 0o700);
      const fileStat = fs.statSync(expectedPath);
      assert.equal(fileStat.mode & 0o777, 0o600);
    },
  );

  await t.test("writes to absolute --output-file directly", (t2) => {
    const fixture = makeMockPgDumpFixture(t2, mockScript);
    const absOut = path.join(fixture.tmpDir, "absolute-dir/dump.archive");
    const res = fixture.runWithMock([
      `--cwd=${fixture.tmpDir}`,
      `--output-file=${absOut}`,
    ]);
    assert.equal(res.status, 0);
    assert.ok(fs.existsSync(absOut));
    const fileStat = fs.statSync(absOut);
    assert.equal(fileStat.mode & 0o777, 0o600);
  });

  await t.test("resolves relative --backup-dir against --cwd", (t2) => {
    const fixture = makeMockPgDumpFixture(t2, mockScript);
    const relBackupDir = "relative_backup_dir";
    const res = fixture.runWithMock([
      `--cwd=${fixture.tmpDir}`,
      `--backup-dir=${relBackupDir}`,
    ]);
    assert.equal(res.status, 0);
    const expectedDir = path.join(fixture.tmpDir, relBackupDir);
    assert.ok(fs.existsSync(expectedDir));
    const dirStat = fs.statSync(expectedDir);
    assert.equal(dirStat.mode & 0o777, 0o700);
    const files = fs.readdirSync(expectedDir);
    assert.ok(
      files.some((f) => f.startsWith("acres-db-") && f.endsWith(".dump")),
    );
  });
});
