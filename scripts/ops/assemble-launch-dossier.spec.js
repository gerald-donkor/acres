const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  RECEIPTS,
  freshTimestamp,
  readReceipt,
  publish,
  prepareOutput,
  releaseOutput,
  outputPreflight,
  main,
} = require("./assemble-launch-dossier");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "launch-assembly-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
test("timestamps accept actual producer precisions and reject impossible or outside dates", () => {
  const start = Date.parse("2026-09-29T10:11:12.950Z"),
    end = start + 500;
  for (const s of [
    "2026-09-29T10:11:12Z",
    "20260929T101112Z",
    "2026-09-29T10:11:13.000Z",
  ])
    assert.equal(freshTimestamp(s, start, end), true);
  for (const s of [
    "2026-02-30T00:00:00Z",
    "20260929T251112Z",
    "2026-09-29T10:11:11Z",
    "2026-09-29T10:11:14Z",
    "2026-09-29T10:11:12.949Z",
    "2026-09-29 10:11:13Z",
  ])
    assert.equal(freshTimestamp(s, start, end), false);
});
test("bounded reader rejects escape and symlink stage ancestors", (t) => {
  const root = fixture(t),
    dir = path.join(root, "stage");
  fs.mkdirSync(dir);
  const file = path.join(root, "file.json");
  fs.writeFileSync(file, "{}");
  assert.throws(() => readReceipt(file, dir, 100));
  fs.symlinkSync(dir, path.join(root, "link"));
  assert.throws(() =>
    readReceipt(
      path.join(root, "link/file.json"),
      path.join(root, "link"),
      100,
    ),
  );
});
test("bounded reader limits actual bytes and rejects malformed/nonregular evidence", (t) => {
  const root = fixture(t),
    file = path.join(root, "receipt.json");
  fs.writeFileSync(file, "{}");
  assert.deepEqual(readReceipt(file, root, 2), {});
  assert.throws(() => readReceipt(file, root, 1));
  fs.writeFileSync(file, "{");
  assert.throws(() => readReceipt(file, root, 100));
  fs.unlinkSync(file);
  fs.mkdirSync(file);
  assert.throws(() => readReceipt(file, root, 100));
});
test("output locking preserves retained evidence and other owner, and exclusively publishes private JSON", (t) => {
  const root = fixture(t),
    file = path.join(root, "out.json");
  fs.writeFileSync(file, "old");
  assert.throws(() => prepareOutput(file, "one"));
  assert.equal(fs.readFileSync(file, "utf8"), "old");
  fs.unlinkSync(file);
  prepareOutput(file, "one");
  assert.ok(!fs.existsSync(file));
  assert.throws(() => prepareOutput(file, "two"));
  releaseOutput(file, "two");
  assert.ok(fs.existsSync(file + ".lock"));
  publish(file, { overall_status: "FAILED" }, "one");
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), {
    overall_status: "FAILED",
  });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  releaseOutput(file, "one");
  assert.ok(!fs.existsSync(file + ".lock"));
});
test("serialization/write/link failures clean only owned temporary files", (t) => {
  const root = fixture(t),
    output = path.join(root, "out");
  const circular = {};
  circular.self = circular;
  assert.throws(() => publish(output, circular));
  fs.mkdirSync(output);
  assert.throws(() => publish(output, {}));
  assert.deepEqual(fs.readdirSync(root), ["out"]);
  assert.throws(() => publish(path.join(root, "missing/out"), {}));
});

test("reader detects growth during bounded reads", (t) => {
  const root = fixture(t),
    file = path.join(root, "receipt.json");
  fs.writeFileSync(file, "{}");
  const original = fs.readSync;
  try {
    let changed = false;
    fs.readSync = function (...args) {
      const result = original(...args);
      if (!changed) {
        changed = true;
        fs.appendFileSync(file, " ");
      }
      return result;
    };
    assert.throws(() => readReceipt(file, root, 100));
  } finally {
    fs.readSync = original;
  }
});
test("publication write and link failures remove the exclusively owned temporary file", (t) => {
  const root = fixture(t),
    output = path.join(root, "out.json");
  for (const method of ["writeFileSync", "linkSync"]) {
    const original = fs[method];
    try {
      fs[method] = () => {
        throw Object.assign(Error("injected failure"), { code: "EIO" });
      };
      assert.throws(() => publish(output, {}));
    } finally {
      fs[method] = original;
    }
    assert.deepEqual(fs.readdirSync(root), []);
    assert.ok(!fs.existsSync(output));
  }
});
test("prepare leaves existing parent permissions and unrelated lock contents unchanged", (t) => {
  const root = fixture(t),
    output = path.join(root, "out.json");
  fs.chmodSync(root, 0o755);
  prepareOutput(output, "one");
  assert.equal(fs.statSync(root).mode & 0o777, 0o755);
  assert.throws(() => prepareOutput(output, "two"));
  assert.equal(fs.readFileSync(output + ".lock", "utf8"), "one");
  releaseOutput(output, "one");
  assert.deepEqual(fs.readdirSync(root), []);
});
test("RECEIPTS includes ingress_deployment caddy-routing-evidence-receipt.json", () => {
  assert.equal(
    RECEIPTS.ingress_deployment.caddy,
    "caddy-routing-evidence-receipt.json",
  );
});

for (const kind of ["file", "directory", "symlink", "dangling"]) {
  test(`preflight and prepare preserve retained ${kind} without allocating resources`, (t) => {
    const root = fixture(t),
      output = path.join(root, "retained");
    if (kind === "file") fs.writeFileSync(output, "retained-secret-canary");
    if (kind === "directory") fs.mkdirSync(output);
    if (kind === "symlink" || kind === "dangling") {
      const target = path.join(root, "target");
      if (kind === "symlink")
        fs.writeFileSync(target, "retained-secret-canary");
      fs.symlinkSync(target, output);
    }
    const stat = fs.lstatSync(output);
    assert.throws(() => outputPreflight(output, path.join(root, "unused")));
    assert.throws(() => prepareOutput(output, "owner"));
    assert.equal(fs.lstatSync(output).ino, stat.ino);
    assert.ok(!fs.existsSync(path.join(root, "unused")));
    assert.ok(!fs.existsSync(output + ".lock"));
    if (kind === "file")
      assert.equal(fs.readFileSync(output, "utf8"), "retained-secret-canary");
  });
}

test("read-only preflight rejects symlink ancestors, foreign locks and trailing separators", (t) => {
  const root = fixture(t),
    link = path.join(root, "link");
  fs.symlinkSync(root, link);
  assert.throws(() => outputPreflight(path.join(link, "out"), root));
  assert.throws(() =>
    outputPreflight(path.join(root, "out"), path.join(link, "new")),
  );
  assert.throws(() => outputPreflight(path.join(root, "out") + "/", root));
  const output = path.join(root, "out");
  fs.writeFileSync(output + ".lock", "foreign");
  assert.throws(() => outputPreflight(output, root));
  releaseOutput(output, "owner");
  assert.equal(fs.readFileSync(output + ".lock", "utf8"), "foreign");
});

for (const kind of ["file", "directory", "symlink", "dangling"]) {
  test(`exclusive publication preserves a concurrent ${kind}`, (t) => {
    const root = fixture(t),
      output = path.join(root, "out");
    prepareOutput(output, "owner");
    if (kind === "file") fs.writeFileSync(output, "concurrent-canary");
    if (kind === "directory") fs.mkdirSync(output);
    if (kind === "symlink" || kind === "dangling") {
      const target = path.join(root, "target");
      if (kind === "symlink") fs.writeFileSync(target, "concurrent-canary");
      fs.symlinkSync(target, output);
    }
    const before = fs.lstatSync(output);
    assert.throws(() => publish(output, { overall_status: "PASSED" }, "owner"));
    releaseOutput(output, "owner");
    assert.equal(fs.lstatSync(output).ino, before.ino);
    if (kind === "file")
      assert.equal(fs.readFileSync(output, "utf8"), "concurrent-canary");
    assert.ok(!fs.existsSync(output + ".lock"));
    assert.ok(
      fs.readdirSync(root).every((n) => !n.startsWith(".launch-dossier-")),
    );
  });
}

test("late non-cooperating insertion wins without replacement", (t) => {
  const root = fixture(t),
    output = path.join(root, "out");
  const original = fs.linkSync;
  try {
    fs.linkSync = (source, destination) => {
      fs.writeFileSync(destination, "late-writer", { flag: "wx" });
      return original(source, destination);
    };
    assert.throws(() => publish(output, { status: "success" }));
  } finally {
    fs.linkSync = original;
  }
  assert.equal(fs.readFileSync(output, "utf8"), "late-writer");
  assert.deepEqual(fs.readdirSync(root), ["out"]);
});

for (const content of ["", "{}", '{"overall_status":"PASSED"}', "{"]) {
  test(`independent staging read rejects injected incomplete write: ${JSON.stringify(content)}`, (t) => {
    const root = fixture(t),
      output = path.join(root, "out");
    const original = fs.writeFileSync;
    try {
      fs.writeFileSync = (fd) => original(fd, content);
      assert.throws(() => publish(output, { status: "success", count: 7 }));
    } finally {
      fs.writeFileSync = original;
    }
    assert.deepEqual(fs.readdirSync(root), []);
  });
}

test("prepare failures release their owned lock and preserve a foreign staging file", (t) => {
  const root = fixture(t),
    output = path.join(root, "out");
  const foreign = path.join(root, ".launch-dossier-owner.tmp");
  fs.writeFileSync(foreign, "foreign");
  assert.throws(() => prepareOutput(output, "owner"));
  assert.equal(fs.readFileSync(foreign, "utf8"), "foreign");
  assert.ok(!fs.existsSync(output + ".lock"));
  fs.unlinkSync(foreign);
  const original = fs.writeFileSync;
  try {
    fs.writeFileSync = () => {
      throw Error("private-canary");
    };
    assert.throws(() => prepareOutput(output, "owner"));
  } finally {
    fs.writeFileSync = original;
  }
  assert.deepEqual(fs.readdirSync(root), []);
});

test("staging close failure removes owned paths or retains ownership for retry", (t) => {
  const root = fixture(t),
    output = path.join(root, "out");
  for (const failUnlink of [false, true]) {
    const originalClose = fs.closeSync,
      originalUnlink = fs.unlinkSync;
    let injected = false;
    try {
      fs.closeSync = (fd) => {
        originalClose(fd);
        if (!injected) {
          injected = true;
          throw Object.assign(Error("private-canary"), { code: "EIO" });
        }
      };
      if (failUnlink)
        fs.unlinkSync = () => {
          throw Object.assign(Error("private-canary"), { code: "EIO" });
        };
      assert.throws(() => prepareOutput(output, "owner"));
    } finally {
      fs.closeSync = originalClose;
      fs.unlinkSync = originalUnlink;
    }
    assert.ok(injected);
    if (failUnlink) {
      assert.equal(fs.readFileSync(output + ".lock", "utf8"), "owner");
      assert.ok(fs.existsSync(path.join(root, ".launch-dossier-owner.tmp")));
    } else assert.deepEqual(fs.readdirSync(root), []);
    releaseOutput(output, "owner");
    assert.deepEqual(fs.readdirSync(root), []);
  }
});

for (const suffix of ["", "/nested", "/nested/deeper"]) {
  test(`output conflicting with allocated evidence directory rejects without creation: ${suffix}`, (t) => {
    const root = fixture(t),
      output = path.join(root, "absent");
    assert.throws(() => outputPreflight(output, output + suffix));
    assert.deepEqual(fs.readdirSync(root), []);
  });
}

test("owned release I/O failure is reported and can be retried without touching foreign files", (t) => {
  const root = fixture(t),
    output = path.join(root, "out");
  prepareOutput(output, "owner");
  const original = fs.unlinkSync;
  try {
    fs.unlinkSync = () => {
      throw Object.assign(Error("private-canary"), { code: "EIO" });
    };
    assert.throws(() => releaseOutput(output, "owner"));
  } finally {
    fs.unlinkSync = original;
  }
  releaseOutput(output, "owner");
  assert.deepEqual(fs.readdirSync(root), []);
});

test("assembler rejects incomplete CLI manifests with a fixed diagnostic", () => {
  const original = console.error,
    messages = [];
  try {
    console.error = (message) => messages.push(message);
    assert.equal(main(["assemble", "/private-canary", "{}"]), 1);
    assert.equal(
      main(["verify", "/private-canary", "/private-snapshot", "{}"]),
      1,
    );
  } finally {
    console.error = original;
  }
  assert.deepEqual(messages, [
    "launch dossier: operation failed",
    "launch dossier: operation failed",
  ]);
});

test("publication with a colliding token basename cannot consume the reservation or staging file of another owner", (t) => {
  const root = fixture(t),
    output = path.join(root, "out");
  const first = "/owner/one",
    second = "/foreign/one";
  prepareOutput(output, first);
  const staging = path.join(root, ".launch-dossier-one.tmp");
  assert.throws(() => publish(output, { status: "success" }, second));
  assert.equal(fs.readFileSync(output + ".lock", "utf8"), first);
  assert.equal(fs.readFileSync(staging, "utf8"), "");
  assert.ok(!fs.existsSync(output));
  releaseOutput(output, first);
  assert.deepEqual(fs.readdirSync(root), []);
});
