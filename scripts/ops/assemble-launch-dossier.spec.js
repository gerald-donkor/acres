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
test("output locking invalidates old receipt, preserves other owner and atomically publishes private JSON", (t) => {
  const root = fixture(t),
    file = path.join(root, "out.json");
  fs.writeFileSync(file, "old");
  prepareOutput(file, "one");
  assert.ok(!fs.existsSync(file));
  assert.throws(() => prepareOutput(file, "two"));
  releaseOutput(file, "two");
  assert.ok(fs.existsSync(file + ".lock"));
  publish(file, { overall_status: "FAILED" });
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), {
    overall_status: "FAILED",
  });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  releaseOutput(file, "one");
  assert.ok(!fs.existsSync(file + ".lock"));
});
test("serialization/write/rename failures clean only owned temporary files", (t) => {
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
test("publication write and rename failures remove the exclusively owned temporary file", (t) => {
  const root = fixture(t),
    output = path.join(root, "out.json");
  for (const method of ["writeFileSync", "renameSync"]) {
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
