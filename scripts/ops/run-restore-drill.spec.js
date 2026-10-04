const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const runner = path.resolve(__dirname, "run-restore-drill.sh");
const root = path.resolve(__dirname, "../..");

function fixture(t, scenario = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-restore-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  const log = path.join(dir, "calls");
  const stub = `#!/usr/bin/env node
const fs=require('node:fs');
const name=require('node:path').basename(process.argv[1]);
const args=process.argv.slice(2);
const scenario=JSON.parse(process.env.STUB_SCENARIO||'{}');
if(name==='date'){
  if(args.includes('+%s%3N')&&scenario.clock){
    const countFile=process.env.STUB_CLOCK_COUNT;
    const n=fs.existsSync(countFile)?Number(fs.readFileSync(countFile,'utf8')):0;
    fs.writeFileSync(countFile,String(n+1));
    console.log(scenario.clock[Math.min(n,scenario.clock.length-1)]);process.exit(0);
  }
  require('node:child_process').spawnSync('/usr/bin/date',args,{stdio:'inherit'});process.exit(0);
}
if(process.env.PGPASSWORD!==process.env.STUB_EXPECTED_PASSWORD)process.exit(97);
fs.appendFileSync(process.env.STUB_LOG,JSON.stringify({name,args,connection:{host:process.env.PGHOST,port:process.env.PGPORT,user:process.env.PGUSER}})+'\\n');
const fail=(code=1)=>process.exit(code);
if(name==='pg_isready'){if(scenario.unavailable)fail();process.exit(0)}
if(name==='pg_dump'){
  if(scenario.dumpFail)fail();
  const file=args.find(x=>x.startsWith('--file=')).slice(7);
  fs.writeFileSync(file,'valid archive');process.exit(0);
}
if(name==='pg_restore'){
  if(args.includes('--list')&&scenario.listFail)fail();
  if(!args.includes('--list')&&scenario.restoreFail)fail();
  if(!args.includes('--list')&&scenario.delayMs)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,scenario.delayMs);
  process.exit(0);
}
if(name==='psql'){
  const db=args[args.indexOf('-d')+1]||process.env.PGDATABASE;
  const target=scenario.target||'acres_restore_drill';
  const query=args[args.indexOf('-c')+1]||'';
  if(query.includes('DROP DATABASE')){if(scenario.dropFail)fail();process.exit(0)}
  if(query.includes('CREATE DATABASE')){if(scenario.createFail)fail();process.exit(0)}
  if(query.includes('oid::text')){
    const checks=fs.readFileSync(process.env.STUB_LOG,'utf8').split('\\n').filter(x=>x.includes('oid::text')).length;
    console.log(scenario.oidMismatch&&checks>1?'43:10':'42:10');process.exit(0);
  }
  if(query.includes('FROM pg_database')){console.log(scenario.existing?'1':'0');process.exit(0)}
  if(query==='SELECT 1;'){if(scenario.authFail)fail();console.log('1');process.exit(0)}
  if(query.includes('_prisma_migrations')){
    if(scenario.migrationsFail||scenario.restoredMigrationsFail&&db===target)fail();
    console.log(scenario.malformed?'oops':scenario.restoredMigrations&&db===target?'3':'2');process.exit(0);
  }
  if(query.includes('information_schema.tables')){console.log(scenario.restoredTables&&db===target?'4':'5');process.exit(0)}
  if(query.includes('pg_extension')){console.log(scenario.noPostgis?'0':'1');process.exit(0)}
  if(query.includes('pg_constraint')){console.log(scenario.badFk?'1':'0');process.exit(0)}
  if(query.includes('json_build_object')){
    console.log(JSON.stringify({accounts:db===target&&scenario.badRecords?2:1,organizations:1,stored_objects:0,datasets:0,regions:0}));process.exit(0);
  }
  console.error('unexpected query',query);fail();
}
`;
  for (const name of ["pg_isready", "pg_dump", "pg_restore", "psql", "date"]) {
    const target = path.join(bin, name);
    fs.writeFileSync(target, stub, { mode: 0o755 });
  }
  const evidence = path.join(dir, 'evidence path "quoted".json');
  const backup = path.join(dir, "backup path");
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    PGPASSWORD: "test-only",
    STUB_EXPECTED_PASSWORD: "test-only",
    STUB_LOG: log,
    STUB_SCENARIO: JSON.stringify(scenario),
    STUB_CLOCK_COUNT: path.join(dir, "clock-count"),
    PGHOST: "stub",
    PGPORT: "5432",
    PGUSER: "stub",
  };
  function run(args = [], envOverride = {}) {
    return spawnSync(
      "bash",
      [runner, "--backup-dir", backup, "--evidence-file", evidence, ...args],
      {
        cwd: root,
        env: { ...env, ...envOverride },
        encoding: "utf8",
        timeout: 15000,
      },
    );
  }
  function runRaw(args = [], envOverride = {}, options = {}) {
    return spawnSync("bash", [runner, ...args], {
      cwd: options.cwd || root,
      env: { ...env, ...envOverride },
      encoding: "utf8",
      timeout: 15000,
    });
  }
  function calls() {
    return fs.existsSync(log)
      ? fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse)
      : [];
  }
  return { dir, evidence, backup, run, runRaw, calls, env, bin };
}

function failed(t, scenario, expected) {
  const f = fixture(t, scenario);
  const result = f.run();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, expected);
  assert.equal(fs.existsSync(f.evidence), false);
  return f;
}

test("help works without credentials and unknown options fail", (t) => {
  const f = fixture(t);
  assert.equal(f.run(["--help"], { PGPASSWORD: "" }).status, 0);
  assert.match(f.run(["--unknown"]).stderr, /unknown option/);
  assert.equal(f.calls().length, 0);
});

test("-h and --help print comprehensive usage to stdout and exit 0", (t) => {
  const f = fixture(t);
  for (const flag of ["-h", "--help"]) {
    const res = f.run([flag], { PGPASSWORD: "" });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage: scripts\/ops\/run-restore-drill\.sh/);
    assert.match(res.stdout, /--source-db/);
    assert.match(res.stdout, /--drill-db/);
    assert.match(res.stdout, /--host/);
    assert.match(res.stdout, /--port/);
    assert.match(res.stdout, /--user/);
    assert.match(res.stdout, /--cwd/);
    assert.match(res.stdout, /--keep-drill-db/);
    assert.match(res.stdout, /--keep-backup/);
    assert.match(res.stdout, /--dry-run/);
  }
  assert.equal(f.calls().length, 0);
});

test("unexpected arguments and unknown options fail with exit 1", (t) => {
  const f = fixture(t);
  const unexp = f.run(["extra_argument"]);
  assert.equal(unexp.status, 1);
  assert.match(unexp.stderr, /unexpected argument extra_argument/);

  const unk = f.run(["--unknown-flag"]);
  assert.equal(unk.status, 1);
  assert.match(unk.stderr, /unknown option --unknown-flag/);

  const unkEq = f.run(["--unknown-flag=value"]);
  assert.equal(unkEq.status, 1);
  assert.match(unkEq.stderr, /unknown option --unknown-flag=value/);
  assert.equal(f.calls().length, 0);
});

test("repeated options are rejected before execution", (t) => {
  const f = fixture(t);
  const repeatedCases = [
    [["--cwd", ".", "--cwd", "."], /repeated --cwd option/],
    [["--cwd=.", "--cwd=."], /repeated --cwd option/],
    [["--host", "localhost", "--host", "localhost"], /repeated --host option/],
    [["--host=localhost", "--host=localhost"], /repeated --host option/],
    [["--port", "5432", "--port", "5432"], /repeated --port option/],
    [["--port=5432", "--port=5432"], /repeated --port option/],
    [["--user", "postgres", "--user", "postgres"], /repeated --user option/],
    [["--user=postgres", "--user=postgres"], /repeated --user option/],
    [
      ["--source-db", "acres", "--source-db", "acres"],
      /repeated --source-db option/,
    ],
    [["--source-db=acres", "--source-db=acres"], /repeated --source-db option/],
    [
      ["--drill-db", "acres_drill", "--drill-db", "acres_drill"],
      /repeated --drill-db option/,
    ],
    [
      ["--drill-db=acres_drill", "--drill-db=acres_drill"],
      /repeated --drill-db option/,
    ],
    [
      ["--backup-dir", "backups", "--backup-dir", "backups"],
      /repeated --backup-dir option/,
    ],
    [
      ["--backup-dir=backups", "--backup-dir=backups"],
      /repeated --backup-dir option/,
    ],
    [
      ["--evidence-file", "ev.json", "--evidence-file", "ev.json"],
      /repeated --evidence-file option/,
    ],
    [
      ["--evidence-file=ev.json", "--evidence-file=ev.json"],
      /repeated --evidence-file option/,
    ],
    [
      ["--rto-target-seconds", "10", "--rto-target-seconds", "10"],
      /repeated --rto-target-seconds option/,
    ],
    [
      ["--rto-target-seconds=10", "--rto-target-seconds=10"],
      /repeated --rto-target-seconds option/,
    ],
  ];
  for (const [args, pattern] of repeatedCases) {
    const res = f.run(args);
    assert.equal(res.status, 1, args.join(" "));
    assert.match(res.stderr, pattern);
  }
  assert.equal(f.calls().length, 0);
});

test("empty or whitespace option values are rejected before database access", (t) => {
  const f = fixture(t);
  const emptyCases = [
    [["--cwd", ""], /--cwd requires a nonempty value/],
    [["--cwd", "   "], /--cwd requires a nonempty value/],
    [["--cwd="], /--cwd requires a nonempty value/],
    [["--cwd=   "], /--cwd requires a nonempty value/],
    [["--host", ""], /--host requires a nonempty value/],
    [["--host", "   "], /--host requires a nonempty value/],
    [["--host="], /--host requires a nonempty value/],
    [["--host=   "], /--host requires a nonempty value/],
    [["--port", ""], /--port requires a nonempty value/],
    [["--port", "   "], /--port requires a nonempty value/],
    [["--port="], /--port requires a nonempty value/],
    [["--port=   "], /--port requires a nonempty value/],
    [["--user", ""], /--user requires a nonempty value/],
    [["--user", "   "], /--user requires a nonempty value/],
    [["--user="], /--user requires a nonempty value/],
    [["--user=   "], /--user requires a nonempty value/],
    [["--source-db", ""], /--source-db requires a nonempty value/],
    [["--source-db", "   "], /--source-db requires a nonempty value/],
    [["--source-db="], /--source-db requires a nonempty value/],
    [["--source-db=   "], /--source-db requires a nonempty value/],
    [["--drill-db", ""], /--drill-db requires a nonempty value/],
    [["--drill-db", "   "], /--drill-db requires a nonempty value/],
    [["--drill-db="], /--drill-db requires a nonempty value/],
    [["--drill-db=   "], /--drill-db requires a nonempty value/],
    [["--backup-dir", ""], /--backup-dir requires a nonempty value/],
    [["--backup-dir", "   "], /--backup-dir requires a nonempty value/],
    [["--backup-dir="], /--backup-dir requires a nonempty value/],
    [["--backup-dir=   "], /--backup-dir requires a nonempty value/],
    [["--evidence-file", ""], /--evidence-file requires a nonempty value/],
    [["--evidence-file", "   "], /--evidence-file requires a nonempty value/],
    [["--evidence-file="], /--evidence-file requires a nonempty value/],
    [["--evidence-file=   "], /--evidence-file requires a nonempty value/],
    [
      ["--rto-target-seconds", ""],
      /--rto-target-seconds requires a nonempty value/,
    ],
    [
      ["--rto-target-seconds", "   "],
      /--rto-target-seconds requires a nonempty value/,
    ],
    [
      ["--rto-target-seconds="],
      /--rto-target-seconds requires a nonempty value/,
    ],
    [
      ["--rto-target-seconds=   "],
      /--rto-target-seconds requires a nonempty value/,
    ],
  ];
  for (const [args, pattern] of emptyCases) {
    const res = f.runRaw(args);
    assert.equal(res.status, 1, args.join(" "));
    assert.match(res.stderr, pattern);
  }
  assert.equal(f.calls().length, 0);
});

test("port validation rejects invalid, zero, negative, out-of-range, and overflow values", (t) => {
  const f = fixture(t);
  const portCases = [
    [["--port", "invalid"], /invalid port/],
    [["--port=invalid"], /invalid port/],
    [["--port", "0"], /invalid port/],
    [["--port=0"], /invalid port/],
    [["--port", "-1"], /--port requires a nonempty value/],
    [["--port=-1"], /invalid port/],
    [["--port", "65536"], /invalid port/],
    [["--port=70000"], /invalid port/],
    [["--port", "999999999999"], /invalid port/],
    [["--port=999999999999"], /invalid port/],
  ];
  for (const [args, pattern] of portCases) {
    const res = f.run(args);
    assert.equal(res.status, 1, args.join(" "));
    assert.match(res.stderr, pattern);
  }

  const envPortNonNumeric = f.run(["--dry-run"], { PGPORT: "bad-port" });
  assert.equal(envPortNonNumeric.status, 1);
  assert.match(envPortNonNumeric.stderr, /invalid port/);

  const envPortZero = f.run(["--dry-run"], { PGPORT: "0" });
  assert.equal(envPortZero.status, 1);
  assert.match(envPortZero.stderr, /invalid port/);

  const envPortOverflow = f.run(["--dry-run"], { PGPORT: "999999" });
  assert.equal(envPortOverflow.status, 1);
  assert.match(envPortOverflow.stderr, /invalid port/);
});

test("directory targeting via --cwd validates existence and executes properly", (t) => {
  const f = fixture(t);
  const badDir = path.join(f.dir, "nonexistent-directory");
  const resBad = f.run(["--cwd", badDir]);
  assert.equal(resBad.status, 1);
  assert.match(resBad.stderr, /target directory does not exist/);

  const resBadEq = f.run([`--cwd=${badDir}`]);
  assert.equal(resBadEq.status, 1);
  assert.match(resBadEq.stderr, /target directory does not exist/);

  const subDir = path.join(f.dir, "custom-cwd");
  fs.mkdirSync(subDir);
  const resGood = f.run(["--cwd", subDir, "--dry-run"]);
  assert.equal(resGood.status, 0, resGood.stderr);
  assert.match(resGood.stdout, /\[DRY RUN\]/);
});

test("attached options syntax executes successfully with dry-run", (t) => {
  const f = fixture(t);
  const res = f.run([
    "--source-db=acres",
    "--drill-db=acres_test_drill",
    "--host=stub",
    "--port=5432",
    "--user=stub",
    "--rto-target-seconds=120",
    "--dry-run",
  ]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /\[DRY RUN\]/);
});

test("full restore resolves relative paths from cwd and propagates connection options", (t) => {
  const f = fixture(t);
  const target = path.join(f.dir, "target directory");
  fs.mkdirSync(target);
  const res = f.runRaw(
    [
      "--cwd=target directory",
      "--backup-dir=relative backups",
      "--evidence-file=receipt.json",
      "--source-db=acres",
      "--drill-db=acres_restore_drill",
      "--host=db.example.test",
      "--port=15432",
      "--user=restore_operator",
      "--rto-target-seconds=120",
    ],
    {},
    { cwd: f.dir },
  );
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const report = JSON.parse(
    fs.readFileSync(path.join(target, "receipt.json"), "utf8"),
  );
  assert.equal(report.execution_mode, "simulation");
  assert.equal(
    path.dirname(report.backup_file),
    path.join(target, "relative backups"),
  );
  const restore = f
    .calls()
    .find(
      (call) => call.name === "pg_restore" && !call.args.includes("--list"),
    );
  assert.ok(restore, "anchored restore helper must execute outside repository");
  assert.equal(restore.args.at(-1), report.backup_file);
  for (const call of f
    .calls()
    .filter((call) => ["psql", "pg_dump", "pg_isready"].includes(call.name))) {
    assert.equal(
      call.args.includes("-h")
        ? call.args[call.args.indexOf("-h") + 1]
        : call.connection.host,
      "db.example.test",
    );
    assert.equal(
      call.args.includes("-p")
        ? call.args[call.args.indexOf("-p") + 1]
        : call.connection.port,
      "15432",
    );
    if (call.name !== "pg_isready") {
      assert.equal(
        call.args.includes("-U")
          ? call.args[call.args.indexOf("-U") + 1]
          : call.connection.user,
        "restore_operator",
      );
    }
  }
});

test("port bounds and leading zeros are validated as decimal integers", (t) => {
  const f = fixture(t);
  for (const port of ["1", "65535", "00008", "05432"]) {
    const res = f.run(["--port=" + port, "--dry-run"]);
    assert.equal(res.status, 0, port + ": " + res.stderr);
  }
  for (const port of ["00000", "65536"]) {
    const res = f.run(["--port=" + port, "--dry-run"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /invalid port/);
  }
});

test("tool prerequisite checks fail when utilities are missing from PATH", (t) => {
  const f = fixture(t);

  const testMissing = (missingTool) => {
    const customBin = path.join(f.dir, `bin-missing-${missingTool}`);
    fs.mkdirSync(customBin, { recursive: true });

    // Link required basic utilities to customBin without exposing system pg_* utilities
    for (const util of [
      "date",
      "mktemp",
      "mkdir",
      "tr",
      "wc",
      "chmod",
      "rm",
      "ln",
      "dirname",
      "bash",
      "sh",
    ]) {
      if (util === missingTool) continue;
      const whichRes = spawnSync("which", [util], { encoding: "utf8" });
      const realPath =
        whichRes.status === 0 && whichRes.stdout
          ? whichRes.stdout.trim()
          : `/bin/${util}`;
      const utilPath = path.join(customBin, util);
      fs.writeFileSync(utilPath, `#!/bin/sh\nexec ${realPath} "$@"\n`, {
        mode: 0o755,
      });
    }
    // Node is required
    if (missingTool !== "node") {
      const nodePath = path.join(customBin, "node");
      fs.writeFileSync(
        nodePath,
        `#!/bin/sh\nexec "${process.execPath}" "$@"\n`,
        { mode: 0o755 },
      );
    }

    // Provide mock implementations for all drill tools except missingTool
    for (const name of ["pg_isready", "pg_dump", "pg_restore", "psql"]) {
      if (name === missingTool) continue;
      const target = path.join(customBin, name);
      fs.writeFileSync(target, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    }

    const res = f.run(["--dry-run"], { PATH: customBin });
    assert.equal(res.status, 1, `expected missing ${missingTool} to fail`);
    assert.match(
      res.stderr,
      new RegExp(`${missingTool} utility not found in PATH`),
    );
  };

  testMissing("pg_dump");
  testMissing("pg_restore");
  testMissing("psql");
  testMissing("pg_isready");
  testMissing("node");
  testMissing("date");
  testMissing("mktemp");
});

test("credential fallbacks resolve alternative environment variables and reject whitespace", (t) => {
  const f = fixture(t);
  const resPostgresPw = f.run(["--dry-run"], {
    PGPASSWORD: "",
    POSTGRES_PASSWORD: "pw-via-postgres-pw",
    STUB_EXPECTED_PASSWORD: "pw-via-postgres-pw",
  });
  assert.equal(resPostgresPw.status, 0, resPostgresPw.stderr);

  const resSuperuserPw = f.run(["--dry-run"], {
    PGPASSWORD: "",
    POSTGRES_PASSWORD: "",
    POSTGRES_SUPERUSER_PASSWORD: "pw-via-superuser",
    STUB_EXPECTED_PASSWORD: "pw-via-superuser",
  });
  assert.equal(resSuperuserPw.status, 0, resSuperuserPw.stderr);

  const resMigratorPw = f.run(["--dry-run"], {
    PGPASSWORD: "",
    POSTGRES_PASSWORD: "",
    POSTGRES_SUPERUSER_PASSWORD: "",
    ACRES_MIGRATOR_PASSWORD: "pw-via-migrator",
    STUB_EXPECTED_PASSWORD: "pw-via-migrator",
  });
  assert.equal(resMigratorPw.status, 0, resMigratorPw.stderr);

  const resWhitespace = f.run(["--dry-run"], {
    PGPASSWORD: "    ",
    POSTGRES_PASSWORD: "",
    POSTGRES_SUPERUSER_PASSWORD: "",
    ACRES_MIGRATOR_PASSWORD: "",
  });
  assert.equal(resWhitespace.status, 1);
  assert.match(resWhitespace.stderr, /PGPASSWORD is required/);
});

test("credential precedence is verified without logging passwords", (t) => {
  const f = fixture(t);
  const result = f.run(["--dry-run"], {
    POSTGRES_PASSWORD: "lower-priority-one",
    POSTGRES_SUPERUSER_PASSWORD: "lower-priority-two",
    ACRES_MIGRATOR_PASSWORD: "lower-priority-three",
  });
  assert.equal(result.status, 0, result.stderr);
  for (const secret of [
    "test-only",
    "lower-priority-one",
    "lower-priority-two",
    "lower-priority-three",
  ]) {
    assert.equal(
      (result.stdout + result.stderr + JSON.stringify(f.calls())).includes(
        secret,
      ),
      false,
    );
  }
});

test("attached option-like user survives full restore helper forwarding", (t) => {
  const f = fixture(t);
  const result = f.run(["--user=-restore"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const restore = f
    .calls()
    .find(
      (call) => call.name === "pg_restore" && !call.args.includes("--list"),
    );
  assert.equal(restore.connection.user, "-restore");
});

test("invalid and incomplete options fail before database access", (t) => {
  const f = fixture(t);
  for (const args of [
    ["--source-db"],
    ["--drill-db", "--keep-backup"],
    ["--backup-dir", ""],
    ["--evidence-file"],
    ["--rto-target-seconds", "-1"],
    ["--source-db", "bad-name"],
    ["--drill-db", "1bad"],
    ["--source-db", "same", "--drill-db", "same"],
    ["--drill-db", "postgres"],
    ["--drill-db", "acres"],
    ["--rto-target-seconds", "0"],
    ["--rto-target-seconds", "1.5"],
    ["--rto-target-seconds", "999999999999"],
    ["--source-db=bad-name"],
    ["--drill-db=1bad"],
    ["--source-db=same", "--drill-db=same"],
    ["--drill-db=postgres"],
    ["--drill-db=acres"],
    ["--rto-target-seconds=0"],
    ["--rto-target-seconds=1.5"],
    ["--rto-target-seconds=999999999999"],
  ])
    assert.notEqual(f.run(args).status, 0, args.join(" "));
  assert.equal(f.calls().length, 0);
});

test("missing password and unavailable server fail closed", (t) => {
  const f = fixture(t);
  const noPassword = f.run([], {
    PGPASSWORD: "",
    POSTGRES_PASSWORD: "",
    POSTGRES_SUPERUSER_PASSWORD: "",
    ACRES_MIGRATOR_PASSWORD: "",
  });
  assert.match(noPassword.stderr, /PGPASSWORD is required/);
  assert.equal(noPassword.status, 1);
  failed(t, { unavailable: true }, /not ready/);
});

test("existing target is rejected before dump and never dropped", (t) => {
  const f = failed(t, { existing: true }, /already exists/);
  assert.equal(
    f
      .calls()
      .some(
        (c) =>
          c.name === "pg_dump" ||
          c.args.some((a) => a.includes("DROP DATABASE")),
      ),
    false,
  );
  const kept = f.run(["--keep-drill-db"]);
  assert.notEqual(kept.status, 0);
});

test("success verifies parity, cleans owned resources, and publishes Category 6 report", (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const report = JSON.parse(fs.readFileSync(f.evidence, "utf8"));
  assert.equal(report.status, "success");
  assert.equal(report.execution_mode, "simulation");
  assert.equal(report.drill_type, "disaster_recovery_restore");
  assert.equal(report.rto_compliant, true);
  assert.equal(report.postgis_verified, true);
  assert.equal(report.foreign_keys_verified, true);
  assert.equal(report.record_parity_verified, true);
  assert.equal(report.tables_source, report.tables_restored);
  assert.equal(report.migrations_source, report.migrations_restored);
  assert.ok(report.backup_bytes > 0);
  assert.match(report.drill_timestamp, /^\d{8}T\d{6}Z$/);
  assert.equal(fs.existsSync(report.backup_file), false);
  const calls = f.calls();
  const at = (fragment) =>
    calls.findIndex((c) => c.args.some((a) => a.includes(fragment)));
  assert.ok(at("FROM pg_database") < at("--file="));
  assert.ok(at("--list") < at("CREATE DATABASE"));
  assert.ok(at("CREATE DATABASE") < at("DROP DATABASE"));
});

test("keep flags retain only created resources", (t) => {
  const f = fixture(t);
  const result = f.run(["--keep-backup", "--keep-drill-db"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(fs.readFileSync(f.evidence));
  assert.equal(fs.existsSync(report.backup_file), true);
  assert.equal(
    f.calls().some((c) => c.args.some((a) => a.includes("DROP DATABASE"))),
    false,
  );
});

test("an existing evidence file is not overwritten or followed", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.evidence, "existing");
  assert.notEqual(f.run().status, 0);
  assert.equal(fs.readFileSync(f.evidence, "utf8"), "existing");
  assert.equal(f.calls().length, 0);
});

test("cleanup failure retains the archive for investigation", (t) => {
  const f = failed(
    t,
    { dropFail: true },
    /could not remove owned drill database/,
  );
  const dump = f.calls().find((c) => c.name === "pg_dump");
  assert.ok(dump);
  assert.equal(
    fs.existsSync(dump.args.find((a) => a.startsWith("--file=")).slice(7)),
    true,
  );
});

test("two same-second runs use distinct archive paths", (t) => {
  const f = fixture(t);
  assert.equal(f.run(["--keep-backup"]).status, 0);
  const first = JSON.parse(fs.readFileSync(f.evidence)).backup_file;
  fs.rmSync(f.evidence);
  assert.equal(f.run(["--keep-backup"]).status, 0);
  const second = JSON.parse(fs.readFileSync(f.evidence)).backup_file;
  assert.notEqual(first, second);
  assert.equal(fs.existsSync(first), true);
  assert.equal(fs.existsSync(second), true);
});

test("custom target is created, restored and cleaned by name", (t) => {
  const f = fixture(t, { target: "safe_trial" });
  const result = f.run(["--drill-db", "safe_trial"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(f.evidence)).drill_db, "safe_trial");
  assert.ok(
    f
      .calls()
      .some((c) =>
        c.args.some((a) => a.includes('CREATE DATABASE "safe_trial"')),
      ),
  );
  assert.ok(
    f
      .calls()
      .some((c) =>
        c.args.some((a) => a.includes('DROP DATABASE "safe_trial"')),
      ),
  );
});

test("changed target identity is left for operator investigation", (t) => {
  const f = failed(t, { oidMismatch: true }, /identity changed/);
  assert.equal(
    f.calls().some((c) => c.args.some((a) => a.includes("DROP DATABASE"))),
    false,
  );
});

test("exact millisecond RTO boundary passes", (t) => {
  const f = fixture(t, { clock: [1000000, 1001000] });
  const result = f.run(["--rto-target-seconds", "1"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(f.evidence)).duration_ms, 1000);
});

test("dry run authenticates and checks absence without side effects", (t) => {
  const f = fixture(t);
  assert.equal(f.run(["--dry-run"]).status, 0);
  assert.equal(fs.existsSync(f.evidence), false);
  assert.equal(
    f.calls().some((c) => c.name === "pg_dump"),
    false,
  );
});

for (const [name, scenario, message] of [
  ["auth", { authFail: true }, /authentication failed/],
  ["migration query", { migrationsFail: true }, /count query failed/],
  ["malformed count", { malformed: true }, /invalid count/],
  ["dump", { dumpFail: true }, /backup creation failed/],
  ["archive list", { listFail: true }, /archive validation failed/],
  ["creation", { createFail: true }, /could not create/],
  ["restore", { restoreFail: true }, /restore failed/],
  [
    "restored migration query",
    { restoredMigrationsFail: true },
    /count query failed/,
  ],
  ["table mismatch", { restoredTables: true }, /table count mismatch/],
  [
    "migration mismatch",
    { restoredMigrations: true },
    /migration count mismatch/,
  ],
  ["PostGIS", { noPostgis: true }, /PostGIS missing/],
  ["foreign keys", { badFk: true }, /foreign keys/],
  ["records", { badRecords: true }, /record count mismatch/],
  ["cleanup", { dropFail: true }, /could not remove owned drill database/],
])
  test(`${name} failure never publishes success`, (t) => {
    const f = failed(t, scenario, message);
    const calls = f.calls();
    const created = calls.some((c) =>
      c.args.some((a) => a.includes("CREATE DATABASE")),
    );
    const dropped = calls.some((c) =>
      c.args.some((a) => a.includes("DROP DATABASE")),
    );
    assert.equal(dropped, created && !scenario.createFail);
  });

test("RTO overrun fails in milliseconds", (t) => {
  const f = fixture(t, { delayMs: 1200 });
  const result = f.run(["--rto-target-seconds", "1"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /RTO exceeded/);
  assert.equal(fs.existsSync(f.evidence), false);
  assert.ok(
    f.calls().some((c) => c.args.some((a) => a.includes("DROP DATABASE"))),
  );
});
