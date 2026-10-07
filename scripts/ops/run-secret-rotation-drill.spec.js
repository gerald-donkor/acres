const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateSecretRotationReport } = require("./check-launch-readiness");

const SCRIPT = path.join(__dirname, "run-secret-rotation-drill.sh");
const CLASSES = [
  "session_secret",
  "csrf_secret",
  "postgres_passwords",
  "valkey_password",
  "storage_s3_keys",
  "smtp_credentials",
  "grafana_admin_password",
];
const STEPS = [
  "session_rollover",
  "csrf_rollover",
  "database_rotation",
  "valkey_rotation",
  "storage_rotation",
  "compromise_response",
  "redaction_audit",
];
const VALUE_OPTIONS = [
  "--cwd",
  "--evidence-dir",
  "--evidence-file",
  "--api-url",
  "--pghost",
  "--pgport",
  "--valkey-host",
  "--valkey-port",
];
const CANARY = "PRIVATE_CANARY_268";

// No inherited credentials, service connections or credential mutations. Each
// child logs only cwd/argv; fake password comparisons happen inside the stub.
function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acres-rotation-"));
  const bin = path.join(root, "bin");
  const ops = path.join(root, "scripts/ops");
  fs.mkdirSync(ops, { recursive: true });
  fs.mkdirSync(bin);
  fs.copyFileSync(SCRIPT, path.join(ops, "run-secret-rotation-drill.sh"));
  fs.copyFileSync(
    path.join(__dirname, "launch-target-evidence.js"),
    path.join(ops, "launch-target-evidence.js"),
  );
  const env = {
    PATH: bin,
    LANG: "C",
    TZ: "UTC",
    CALLS: path.join(root, "calls.jsonl"),
  };
  for (const tool of [
    "bash",
    "cat",
    "date",
    "dirname",
    "mkdir",
    "mktemp",
    "chmod",
    "ln",
    "rm",
    "timeout",
  ]) {
    fs.symlinkSync(`/usr/bin/${tool}`, path.join(bin, tool));
  }
  fs.symlinkSync(process.execPath, path.join(bin, "node"));
  const log = `node - "$0" "$@" <<'NODE'
const fs = require('node:fs');
fs.appendFileSync(process.env.CALLS, JSON.stringify({name: require('node:path').basename(process.argv[2]), cwd: process.cwd(), args: process.argv.slice(3)}) + '\\n');
NODE
`;
  for (const name of ["check-production-templates.sh", "scan-secrets.sh"]) {
    fs.writeFileSync(
      path.join(ops, name),
      `#!/usr/bin/env bash\n${log}exit ${options.failChild === name ? 7 : 0}\n`,
      { mode: 0o700 },
    );
  }
  fs.writeFileSync(
    path.join(ops, "verify-volume-encryption.js"),
    `require('node:fs').appendFileSync(process.env.CALLS, JSON.stringify({name:'volume', cwd:process.cwd(), args:process.argv.slice(2)}) + '\\n'); process.exit(${options.failChild === "volume" ? 9 : 0});\n`,
  );
  fs.writeFileSync(
    path.join(bin, "curl"),
    `#!/usr/bin/env bash\n${log}exit ${options.apiReachable ? 0 : 1}\n`,
    { mode: 0o700 },
  );
  fs.writeFileSync(
    path.join(bin, "pg_isready"),
    `#!/usr/bin/env bash\n${log}
[[ "\${PGPASSWORD:-}" == "\${EXPECTED_PASSWORD:-}" ]] || exit 8
exit ${options.pgReachable ? 0 : 1}\n`,
    { mode: 0o700 },
  );
  if (!options.noValkey) {
    fs.writeFileSync(
      path.join(bin, "valkey-cli"),
      `#!/usr/bin/env bash\n${log}
printf '%s' "$VALKEY_REPLY"
exit ${options.valkeyExit ?? 0}\n`,
      { mode: 0o700 },
    );
    env.VALKEY_REPLY = options.valkeyReply ?? "no server";
  }
  if (options.throwValue) {
    const preload = path.join(root, "fail-algorithm.js");
    fs.writeFileSync(
      preload,
      `require('node:crypto').createHmac = () => { throw ${options.throwValue}; };\n`,
    );
    env.NODE_OPTIONS = `--require=${preload}`;
  }
  return {
    root,
    bin,
    ops,
    env,
    dispose: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
function invoke(f, args = [], options = {}) {
  const result = spawnSync(
    "/usr/bin/bash",
    [path.join(f.ops, "run-secret-rotation-drill.sh"), ...args],
    {
      cwd: options.cwd ?? f.root,
      env: { ...f.env, ...options.env },
      encoding: "utf8",
      timeout: 15000,
    },
  );
  if (result.error) throw result.error;
  return { code: result.status, output: result.stdout + result.stderr };
}
function calls(f) {
  return fs.existsSync(f.env.CALLS)
    ? fs
        .readFileSync(f.env.CALLS, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((s) => JSON.parse(s))
    : [];
}
function receipts(f, directory = path.join(f.root, "backups")) {
  return fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter(
          (n) =>
            n.startsWith("secret-rotation-evidence-") && n.endsWith(".json"),
        )
        .map((n) => path.join(directory, n))
    : [];
}
function read(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function passing(report, dryRun = false) {
  assert.equal(report.status, "success");
  assert.equal(report.execution_mode, "simulation");
  assert.equal(report.dry_run, dryRun);
  assert.deepEqual(report.tested_secret_classes, CLASSES);
  assert.deepEqual(report.errors, []);
  for (const step of STEPS) assert.equal(report.steps[step].status, "passed");
  assert.equal(validateSecretRotationReport(report, new Date()), true);
  assert.equal(
    validateSecretRotationReport(report, new Date(), { requireLive: true }),
    false,
  );
}
function isolated(name, fn, options) {
  test(name, async () => {
    const f = fixture(options);
    try {
      await fn(f);
    } finally {
      f.dispose();
    }
  });
}
function invalid(f, args, options) {
  const r = invoke(f, args, options);
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /Error:/);
  assert.equal(r.output.includes(CANARY), false);
  assert.deepEqual(calls(f), []);
  assert.equal(fs.existsSync(path.join(f.root, "backups")), false);
  return r;
}
for (const flag of ["--help", "-h"])
  isolated(`help ${flag} needs no prerequisites`, (f) => {
    fs.unlinkSync(path.join(f.bin, "node"));
    const r = invoke(f, [flag]);
    assert.equal(r.code, 0);
    assert.match(r.output, /Usage: scripts\/ops\/run-secret-rotation-drill.sh/);
    for (const option of VALUE_OPTIONS) assert.ok(r.output.includes(option));
    assert.deepEqual(calls(f), []);
    assert.equal(fs.existsSync(path.join(f.root, "backups")), false);
  });
for (const opt of VALUE_OPTIONS) {
  isolated(`${opt} rejects missing, blank and flag-like values`, (f) => {
    for (const args of [
      [opt],
      [opt, ""],
      [opt, " \t"],
      [opt, "--dry-run"],
      [opt, "-h"],
      [`${opt}=`],
      [`${opt}= \t`],
    ])
      invalid(f, args);
  });
  isolated(`${opt} rejects all duplicate forms before execution`, (f) => {
    for (const args of [
      [opt, "x", opt, "y"],
      [`${opt}=x`, opt, "y"],
      [opt, "x", `${opt}=y`],
      [`${opt}=x`, `${opt}=y`],
    ]) {
      assert.match(invalid(f, args).output, /Repeated/);
    }
  });
}
isolated("unknown and positional diagnostics do not reflect input", (f) => {
  for (const arg of [CANARY, `--${CANARY}`, `--unknown=${CANARY}`])
    invalid(f, [arg]);
});
for (const dryRun of [false, true])
  isolated(`offline receipt with dry_run=${dryRun}`, (f) => {
    assert.equal(invoke(f, dryRun ? ["--dry-run", "--dry-run"] : []).code, 0);
    const files = receipts(f);
    assert.equal(files.length, 1);
    passing(read(files[0]), dryRun);
    assert.deepEqual(read(files[0]).environment_topology, {
      live_postgres: false,
      live_valkey: false,
      live_api: false,
    });
    assert.equal(fs.statSync(files[0]).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(files[0])).mode & 0o777, 0o700);
    assert.deepEqual(fs.readdirSync(path.dirname(files[0])), [
      path.basename(files[0]),
    ]);
  });
isolated(
  "default cwd is installation root from unrelated caller directory",
  (f) => {
    const caller = path.join(f.root, "caller");
    fs.mkdirSync(caller);
    assert.equal(invoke(f, [], { cwd: caller }).code, 0);
    assert.equal(receipts(f).length, 1);
    assert.ok(calls(f).every((c) => c.cwd === f.root));
  },
);
for (const attached of [false, true])
  isolated(`all options forwarding attached=${attached}`, (f) => {
    const target = path.join(f.root, "-target with spaces");
    fs.mkdirSync(target);
    const values = [
      ["--cwd", attached ? "-target with spaces" : target],
      ["--evidence-dir", "unused"],
      ["--evidence-file", "-receipt with spaces.json"],
      ["--api-url", "http://127.0.0.1:3999/"],
      ["--pghost", "127.0.0.1"],
      ["--pgport", "05999"],
      ["--valkey-host", "127.0.0.1"],
      ["--valkey-port", "06999"],
    ];
    const args = values.flatMap(([k, v]) =>
      attached ? [`${k}=${v}`] : [k, v],
    );
    // Separate dash-leading file values are rejected by design; use an absolute path.
    if (!attached)
      args[args.indexOf("--evidence-file") + 1] = path.join(
        target,
        "-receipt with spaces.json",
      );
    const r = invoke(f, args, {
      env: {
        PGPASSWORD: "fixture-password",
        EXPECTED_PASSWORD: "fixture-password",
      },
    });
    assert.equal(r.code, 0, r.output);
    passing(read(path.join(target, "-receipt with spaces.json")));
    assert.equal(fs.existsSync(path.join(target, "unused")), false);
    const observed = calls(f);
    assert.ok(observed.every((c) => c.cwd === target));
    for (const name of ["check-production-templates.sh", "scan-secrets.sh"])
      assert.deepEqual(observed.find((c) => c.name === name).args, [
        `--cwd=${target}`,
      ]);
    assert.deepEqual(observed.find((c) => c.name === "volume").args, []);
    assert.deepEqual(observed.find((c) => c.name === "pg_isready").args, [
      "-h",
      "127.0.0.1",
      "-p",
      "5999",
      "-U",
      "postgres",
      "-d",
      "acres",
      "-t",
      "3",
      "-q",
    ]);
    assert.deepEqual(observed.find((c) => c.name === "valkey-cli").args, [
      "-h",
      "127.0.0.1",
      "-p",
      "6999",
      "ping",
    ]);
    assert.deepEqual(observed.find((c) => c.name === "curl").args, [
      "-fsS",
      "-m",
      "2",
      "http://127.0.0.1:3999/health",
    ]);
  });
isolated("relative target cwd resolves from invocation directory", (f) => {
  fs.mkdirSync(path.join(f.root, "caller"));
  fs.mkdirSync(path.join(f.root, "target"));
  assert.equal(
    invoke(f, ["--cwd", "../target"], { cwd: path.join(f.root, "caller") })
      .code,
    0,
  );
  assert.equal(receipts(f, path.join(f.root, "target/backups")).length, 1);
});
isolated("invalid cwd and output parent fail early", (f) => {
  invalid(f, ["--cwd", path.join(f.root, "missing")]);
  fs.writeFileSync(path.join(f.root, "file"), "retained");
  invalid(f, ["--evidence-file", path.join(f.root, "file/receipt.json")]);
  fs.symlinkSync("missing", path.join(f.root, "dangling-parent"));
  invalid(f, [
    "--evidence-file",
    path.join(f.root, "dangling-parent/receipt.json"),
  ]);
});
for (const tool of [
  "node",
  "bash",
  "date",
  "dirname",
  "mkdir",
  "mktemp",
  "chmod",
  "ln",
  "rm",
  "curl",
])
  isolated(`missing required ${tool} fails early`, (f) => {
    fs.unlinkSync(path.join(f.bin, tool));
    invalid(f, []);
  });
for (const helper of [
  "check-production-templates.sh",
  "scan-secrets.sh",
  "verify-volume-encryption.js",
  "launch-target-evidence.js",
])
  isolated(`missing helper ${helper} fails early`, (f) => {
    fs.unlinkSync(path.join(f.ops, helper));
    invalid(f, []);
  });
for (const origin of [
  `https://user:${CANARY}@example.com`,
  `https://example.com/?${CANARY}`,
  `https://example.com/#${CANARY}`,
  `https://example.com/${CANARY}`,
  `ftp://example.com/${CANARY}`,
  `http://example.com/\n${CANARY}`,
  CANARY,
])
  isolated(
    `unsafe origin ${origin.replace(CANARY, "canary").replace(/\n/g, "newline")}`,
    (f) => invalid(f, ["--api-url", origin]),
  );
for (const opt of ["--pgport", "--valkey-port"])
  isolated(`${opt} port bounds and decimal validation`, (f) => {
    for (const value of [
      "0",
      "65536",
      "999999999999999999999999",
      "-1",
      "1.5",
      "12x",
      " ",
    ])
      invalid(f, [`${opt}=${value}`]);
    assert.equal(invoke(f, [`${opt}=00001`]).code, 0);
  });
for (const field of ["PGHOST", "PGUSER", "PGDATABASE", "VALKEY_HOST"])
  isolated(`${field} blank/control/option-like values fail early`, (f) => {
    for (const value of [" ", `a\n${CANARY}`, `-${CANARY}`])
      invalid(f, [], { env: { [field]: value } });
  });
for (const child of [
  "check-production-templates.sh",
  "scan-secrets.sh",
  "volume",
])
  isolated(
    `baseline ${child} failure stops later children`,
    (f) => {
      const r = invoke(f);
      assert.equal(r.code, child === "volume" ? 9 : 7);
      const names = calls(f).map((c) => c.name);
      assert.equal(names.at(-1), child);
      assert.equal(names.includes("curl"), false);
      assert.equal(receipts(f).length, 0);
      assert.equal(fs.existsSync(path.join(f.root, "backups")), false);
      assert.equal(r.output.includes("SUMMARY"), false);
    },
    { failChild: child },
  );
for (const variable of ["PGPASSWORD", "POSTGRES_PASSWORD"])
  isolated(
    `readiness uses ${variable} only as environment`,
    (f) => {
      const r = invoke(f, [], {
        env: { [variable]: CANARY, EXPECTED_PASSWORD: CANARY },
      });
      assert.equal(r.code, 0, r.output);
      assert.equal(r.output.includes(CANARY), false);
      assert.equal(JSON.stringify(calls(f)).includes(CANARY), false);
      assert.equal(
        read(receipts(f)[0]).environment_topology.live_postgres,
        true,
      );
      assert.match(r.output, /authentication\/rotation not verified/);
    },
    { pgReachable: true },
  );
isolated(
  "PGPASSWORD precedence, empty primary fallback and credential blank rejection",
  (f) => {
    invalid(f, [], { env: { PGPASSWORD: " ", POSTGRES_PASSWORD: CANARY } });
    for (const primary of [CANARY, ""]) {
      const r = invoke(f, [], {
        env: {
          PGPASSWORD: primary,
          POSTGRES_PASSWORD: CANARY,
          EXPECTED_PASSWORD: CANARY,
        },
      });
      assert.equal(r.code, 0, r.output);
    }
  },
  { pgReachable: true },
);
isolated("missing selected pg client fails but no credential skips it", (f) => {
  fs.unlinkSync(path.join(f.bin, "pg_isready"));
  invalid(f, [], { env: { PGPASSWORD: CANARY } });
  assert.equal(invoke(f).code, 0);
  assert.equal(
    calls(f).some((c) => c.name === "pg_isready"),
    false,
  );
});
isolated(
  "unavailable PostgreSQL stays false and does not prevent simulation",
  (f) => {
    const r = invoke(f, [], {
      env: { PGPASSWORD: CANARY, EXPECTED_PASSWORD: CANARY },
    });
    assert.equal(r.code, 0);
    assert.equal(
      read(receipts(f)[0]).environment_topology.live_postgres,
      false,
    );
    assert.match(r.output, /PostgreSQL observation unavailable/);
  },
);
for (const [reply, exit, reachable] of [
  ["PONG", 0, true],
  [" \tPONG\r\n", 0, true],
  ["PONG", 1, false],
  ["prefixPONG", 0, false],
  ["PONG\nPONG", 0, false],
  ["ERR " + CANARY, 0, false],
  ["", 0, false],
])
  isolated(
    `Valkey exact reply ${JSON.stringify(reply)} exit ${exit}`,
    (f) => {
      const r = invoke(f);
      assert.equal(r.code, 0, r.output);
      assert.equal(
        read(receipts(f)[0]).environment_topology.live_valkey,
        reachable,
      );
      assert.equal(r.output.includes(CANARY), false);
    },
    { valkeyReply: reply, valkeyExit: exit },
  );
isolated(
  "missing optional Valkey CLI skips timeout prerequisite",
  (f) => {
    fs.unlinkSync(path.join(f.bin, "timeout"));
    assert.equal(invoke(f).code, 0);
    assert.equal(read(receipts(f)[0]).environment_topology.live_valkey, false);
  },
  { noValkey: true },
);
isolated("missing selected timeout fails before children", (f) => {
  fs.unlinkSync(path.join(f.bin, "timeout"));
  invalid(f, []);
});
isolated(
  "Valkey deadline failure falls back and enforces kill deadline arguments",
  (f) => {
    fs.unlinkSync(path.join(f.bin, "timeout"));
    fs.writeFileSync(
      path.join(f.bin, "timeout"),
      `#!/usr/bin/env bash\n[[ "$*" == '--kill-after=1s 2s valkey-cli -h localhost -p 6379 ping' ]] || exit 8\nexit 124\n`,
      { mode: 0o700 },
    );
    const r = invoke(f);
    assert.equal(r.code, 0, r.output);
    assert.equal(read(receipts(f)[0]).environment_topology.live_valkey, false);
    assert.equal(
      calls(f).some((c) => c.name === "valkey-cli"),
      false,
    );
  },
);
for (const dryRun of [false, true])
  isolated(
    `all successful observations stay simulation dry=${dryRun}`,
    (f) => {
      const r = invoke(f, dryRun ? ["--dry-run"] : [], {
        env: { PGPASSWORD: CANARY, EXPECTED_PASSWORD: CANARY },
      });
      assert.equal(r.code, 0, r.output);
      const report = read(receipts(f)[0]);
      passing(report, dryRun);
      assert.deepEqual(report.environment_topology, {
        live_postgres: true,
        live_valkey: true,
        live_api: true,
      });
    },
    { apiReachable: true, pgReachable: true, valkeyReply: "PONG" },
  );
for (const kind of ["file", "directory", "symlink", "dangling"])
  isolated(`prior ${kind} destination survives before children`, (f) => {
    const dest = path.join(f.root, "receipt");
    if (kind === "file") fs.writeFileSync(dest, "retain");
    if (kind === "directory") fs.mkdirSync(dest);
    if (kind === "symlink") {
      fs.writeFileSync(path.join(f.root, "other"), "retain");
      fs.symlinkSync("other", dest);
    }
    if (kind === "dangling") fs.symlinkSync("missing", dest);
    const before = fs.lstatSync(dest);
    invalid(f, ["--evidence-file", dest]);
    assert.equal(fs.lstatSync(dest).ino, before.ino);
    if (kind === "file" || kind === "symlink")
      assert.equal(fs.readFileSync(dest, "utf8"), "retain");
  });
isolated(
  "default receipts are unique and existing parent mode is preserved",
  (f) => {
    fs.mkdirSync(path.join(f.root, "backups"), { mode: 0o755 });
    assert.equal(invoke(f).code, 0);
    assert.equal(invoke(f).code, 0);
    assert.equal(receipts(f).length, 2);
    assert.equal(fs.statSync(path.join(f.root, "backups")).mode & 0o777, 0o755);
  },
);
for (const value of [`new Error('${CANARY}')`, `'${CANARY}'`, `null`])
  isolated(
    `algorithm failure sanitized for ${value}`,
    (f) => {
      const r = invoke(f);
      assert.equal(r.code, 1, r.output);
      assert.equal(r.output.includes(CANARY), false);
      const report = read(receipts(f)[0]);
      assert.equal(report.status, "failed");
      assert.equal(report.execution_mode, "simulation");
      assert.deepEqual(report.errors, [
        "Secret rotation algorithm rehearsal failed",
      ]);
      assert.equal(JSON.stringify(report).includes(CANARY), false);
      assert.equal(validateSecretRotationReport(report, new Date()), false);
    },
    { throwValue: value },
  );
isolated(
  "consumer rejects corrupt rehearsal step/redaction/class fields",
  (f) => {
    assert.equal(invoke(f).code, 0);
    const report = read(receipts(f)[0]);
    for (const mutate of [
      (r) => delete r.steps.session_rollover,
      (r) => (r.steps.database_rotation.status = "failed"),
      (r) => (r.steps.redaction_audit.raw_secrets_masked = false),
      (r) => r.tested_secret_classes.pop(),
    ]) {
      const copy = structuredClone(report);
      mutate(copy);
      assert.equal(validateSecretRotationReport(copy, new Date()), false);
    }
  },
);

function replaceTool(f, name, body) {
  fs.unlinkSync(path.join(f.bin, name));
  fs.writeFileSync(path.join(f.bin, name), `#!/usr/bin/env bash\n${body}\n`, {
    mode: 0o700,
  });
}
for (const kind of ["file", "directory", "symlink"])
  isolated(
    `concurrent ${kind} insertion is preserved and owned temp removed`,
    (f) => {
      const dest = path.join(f.root, "race.json");
      replaceTool(
        f,
        "ln",
        `${kind === "directory" ? '/usr/bin/mkdir -- "$3"' : kind === "symlink" ? '/usr/bin/ln -s missing "$3"' : 'printf retained > "$3"'}\nexec /usr/bin/ln "$@"`,
      );
      // ln args are -T -- temp destination (destination is $4).
      const script = fs
        .readFileSync(path.join(f.bin, "ln"), "utf8")
        .replaceAll('"$3"', '"$4"');
      fs.writeFileSync(path.join(f.bin, "ln"), script);
      const r = invoke(f, ["--evidence-file", dest]);
      assert.equal(r.code, 1, r.output);
      assert.match(r.output, /Could not publish evidence/);
      assert.equal(r.output.includes("SUMMARY"), false);
      assert.ok(fs.lstatSync(dest));
      if (kind === "file")
        assert.equal(fs.readFileSync(dest, "utf8"), "retained");
      assert.equal(
        fs
          .readdirSync(f.root)
          .some((n) => n.startsWith(".secret-rotation-evidence.")),
        false,
      );
    },
  );
for (const failingTool of ["mkdir", "mktemp", "chmod", "ln"])
  isolated(
    `${failingTool} failure reports controlled error without final receipt`,
    (f) => {
      replaceTool(f, failingTool, "exit 1");
      const r = invoke(f, ["--evidence-file", "out/receipt.json"]);
      assert.equal(r.code, 1, r.output);
      assert.match(r.output, /Error: Could not/);
      assert.equal(fs.existsSync(path.join(f.root, "out/receipt.json")), false);
      assert.equal(r.output.includes("SUMMARY"), false);
      if (fs.existsSync(path.join(f.root, "out")))
        assert.deepEqual(fs.readdirSync(path.join(f.root, "out")), []);
    },
  );
for (const throwAlgorithm of [false, true])
  isolated(
    `temporary write failure does not overwrite or conceal I/O error algorithm=${throwAlgorithm}`,
    (f) => {
      const preload = path.join(f.root, "fail-write.js");
      fs.writeFileSync(
        preload,
        `const fs=require('node:fs'); const original=fs.writeFileSync; fs.writeFileSync=(file,...args)=>{ if(String(file).includes('.secret-rotation-evidence.')) throw new Error('${CANARY}'); return original(file,...args); }; ${throwAlgorithm ? `require('node:crypto').createHmac=()=>{throw new Error('${CANARY}');};` : ""}`,
      );
      const r = invoke(f, ["--evidence-file", "receipt.json"], {
        env: { NODE_OPTIONS: `--require=${preload}` },
      });
      assert.equal(r.code, 1, r.output);
      assert.match(r.output, /Could not write temporary evidence/);
      assert.equal(r.output.includes(CANARY), false);
      assert.equal(fs.existsSync(path.join(f.root, "receipt.json")), false);
      assert.equal(
        fs
          .readdirSync(f.root)
          .some((n) => n.startsWith(".secret-rotation-evidence.")),
        false,
      );
    },
  );
// Shell trap waits for its foreground child. The stub signals the parent after
// the temp path is assigned, then exits; cleanup must preserve unrelated files.
isolated(
  "catchable TERM during chmod cleans only owned temporary receipt",
  (f) => {
    const unrelated = path.join(f.root, ".secret-rotation-evidence.unrelated");
    fs.writeFileSync(unrelated, "retain");
    replaceTool(f, "chmod", 'kill -TERM "$PPID"\nexit 0');
    const r = invoke(f, ["--evidence-file", "receipt.json"]);
    assert.equal(r.code, 143, r.output);
    assert.equal(fs.existsSync(path.join(f.root, "receipt.json")), false);
    assert.equal(fs.readFileSync(unrelated, "utf8"), "retain");
    assert.deepEqual(
      fs
        .readdirSync(f.root)
        .filter((n) => n.startsWith(".secret-rotation-evidence.")),
      [".secret-rotation-evidence.unrelated"],
    );
  },
);

isolated("actual bounded Valkey probe terminates an unresponsive stub", (f) => {
  fs.writeFileSync(
    path.join(f.bin, "valkey-cli"),
    "#!/usr/bin/env bash\nwhile :; do :; done\n",
    { mode: 0o700 },
  );
  const start = Date.now();
  const r = invoke(f);
  assert.equal(r.code, 0, r.output);
  assert.ok(Date.now() - start < 10000);
  assert.equal(read(receipts(f)[0]).environment_topology.live_valkey, false);
});
isolated(
  "early algorithm process failure cannot publish an empty receipt",
  (f) => {
    const preload = path.join(f.root, "early-exit.js");
    fs.writeFileSync(
      preload,
      `if(process.argv[2] && process.argv[2].includes('.secret-rotation-evidence.')) process.exit(1);`,
    );
    const r = invoke(f, ["--evidence-file", "receipt.json"], {
      env: { NODE_OPTIONS: `--require=${preload}` },
    });
    assert.equal(r.code, 1, r.output);
    assert.equal(fs.existsSync(path.join(f.root, "receipt.json")), false);
    assert.match(r.output, /Could not generate complete evidence/);
    assert.equal(
      fs
        .readdirSync(f.root)
        .some((n) => n.startsWith(".secret-rotation-evidence.")),
      false,
    );
  },
);

isolated(
  "explicit spaced evidence directory generates private default receipt",
  (f) => {
    const dir = path.join(f.root, "-evidence with spaces");
    assert.equal(invoke(f, [`--evidence-dir=-evidence with spaces`]).code, 0);
    const files = receipts(f, dir);
    assert.equal(files.length, 1);
    passing(read(files[0]));
  },
);
isolated("unwritable output parent fails before any child", (f) => {
  const dir = path.join(f.root, "read-only");
  fs.mkdirSync(dir, { mode: 0o500 });
  try {
    invalid(f, ["--evidence-file", path.join(dir, "receipt.json")]);
  } finally {
    fs.chmodSync(dir, 0o700);
  }
});
isolated("nonexecutable baseline helper fails before any child", (f) => {
  fs.chmodSync(path.join(f.ops, "scan-secrets.sh"), 0o600);
  invalid(f, []);
});
isolated(
  "algorithm failure plus publication failure reports both without overwriting",
  (f) => {
    replaceTool(f, "ln", 'printf retained > "$4"\nexec /usr/bin/ln "$@"');
    const r = invoke(f, ["--evidence-file", "retained.json"]);
    assert.equal(r.code, 1, r.output);
    assert.match(r.output, /algorithm rehearsal failed/);
    assert.match(r.output, /Could not publish evidence/);
    assert.equal(r.output.includes(CANARY), false);
    assert.equal(
      fs.readFileSync(path.join(f.root, "retained.json"), "utf8"),
      "retained",
    );
    assert.equal(
      fs
        .readdirSync(f.root)
        .some((n) => n.startsWith(".secret-rotation-evidence.")),
      false,
    );
  },
  { throwValue: `new Error('${CANARY}')` },
);

isolated(
  "absent trailing-slash explicit receipt paths fail before rehearsal",
  (f) => {
    for (const destination of ["absent/", "new-parent/absent/"]) {
      for (const args of [
        [`--evidence-file=${destination}`],
        ["--evidence-file", destination],
      ])
        invalid(f, args);
      assert.equal(fs.existsSync(path.join(f.root, "absent")), false);
      assert.equal(fs.existsSync(path.join(f.root, "new-parent")), false);
    }
  },
);
