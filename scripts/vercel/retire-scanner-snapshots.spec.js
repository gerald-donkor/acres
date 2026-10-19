"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { MAX_RETIRE, parseArgs, main } = require("./retire-scanner-snapshots");

const DAY = 24 * 3600 * 1000;
const ACTIVE = "snap_active";
const ROLLBACK = "snap_rollback";
const R1 = "snap_retire1";
const R2 = "snap_retire2";
const R3 = "snap_retire3";

// A well-formed, unsigned OIDC token for the fake target; never a real one.
const TOKEN = [
  Buffer.from('{"alg":"RS256"}').toString("base64url"),
  Buffer.from(
    JSON.stringify({
      owner_id: "team-test",
      project_id: "prj-test",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url"),
  "signature",
].join(".");

const ENV = {
  ACRES_VERCEL_PROBE: "isolated-synthetic-preview",
  VERCEL_ENV: "preview",
  VERCEL_TEAM_ID: "team-test",
  VERCEL_PROJECT_ID: "prj-test",
  ACRES_VERCEL_PROBE_REGION: "iad1",
  VERCEL_OIDC_TOKEN: TOKEN,
  SCANNER_SANDBOX_SNAPSHOT_ID: ACTIVE,
};

const ARGS = [
  "--keep",
  ACTIVE,
  "--keep",
  ROLLBACK,
  "--retire",
  R1,
  "--retire",
  R2,
  "--retire",
  R3,
];

const snap = (overrides = {}) => ({
  status: "created",
  sizeBytes: 460_000_000,
  region: "iad1",
  expiresAt: Date.now() + 5 * DAY,
  ...overrides,
});

const inventory = () =>
  new Map([
    [ACTIVE, snap()],
    [ROLLBACK, snap()],
    [R1, snap({ sizeBytes: 461_000_000 })],
    [R2, snap({ sizeBytes: 462_000_000 })],
    [R3, snap({ sizeBytes: 463_000_000 })],
  ]);

const notFound = () =>
  Object.assign(new Error("not found"), { response: { status: 404 } });

/**
 * Snapshot.get/list, instance delete and Sandbox.list over an in-memory
 * inventory. `deleteThrows`, `landsThenThrows`, `stayCreated` and
 * `goneAfterDelete` shape what a delete does; `getFails` (always) and
 * `regetFails` (after a delete) throw a non-404 error that carries the token.
 * `otherProject` ids answer `get` but are missing from the project listing.
 */
function fakeSdk({
  snapshots = inventory(),
  sandboxes = [],
  getFails = new Set(),
  regetFails = new Set(),
  deleteThrows = new Set(),
  landsThenThrows = new Set(),
  stayCreated = new Set(),
  goneAfterDelete = new Set(),
  otherProject = new Set(),
  snapshotListFails = false,
  sandboxListFails = false,
} = {}) {
  const calls = [];
  const deleted = new Set();
  const credentialed = (params) => {
    assert.equal(params.token, TOKEN);
    assert.equal(params.teamId, "team-test");
    assert.equal(params.projectId, "prj-test");
    assert.ok(params.signal);
  };
  const Snapshot = {
    async get(params) {
      credentialed(params);
      calls.push(`get:${params.snapshotId}`);
      const id = params.snapshotId;
      if (getFails.has(id) || (regetFails.has(id) && deleted.has(id)))
        throw new Error(`provider said ${TOKEN}`);
      const meta = snapshots.get(id);
      if (!meta) throw notFound();
      return {
        snapshotId: id,
        status: meta.status,
        sizeBytes: meta.sizeBytes,
        regions: meta.regions ?? [meta.region],
        expiresAt:
          meta.expiresAt === undefined ? undefined : new Date(meta.expiresAt),
        async delete(opts) {
          assert.ok(opts.signal);
          calls.push(`delete:${id}`);
          if (deleteThrows.has(id)) throw new Error(`delete failed ${TOKEN}`);
          deleted.add(id);
          if (stayCreated.has(id)) return;
          if (goneAfterDelete.has(id)) snapshots.delete(id);
          else meta.status = "deleted";
          if (landsThenThrows.has(id)) throw new Error(`retry 404 ${TOKEN}`);
        },
      };
    },
    async list(params) {
      credentialed(params);
      calls.push("snapshot-list");
      if (snapshotListFails) throw new Error(`list failed ${TOKEN}`);
      const listedIds = [...snapshots].filter(([id]) => !otherProject.has(id));
      const items = listedIds.map(([id, meta]) => ({
        id,
        sourceSessionId: "sess",
        createdAt: 0,
        updatedAt: 0,
        ...meta,
      }));
      return { toArray: async () => items };
    },
  };
  const Sandbox = {
    async list(params) {
      credentialed(params);
      calls.push("sandbox-list");
      if (sandboxListFails) throw new Error(`sandbox list failed ${TOKEN}`);
      return { toArray: async () => sandboxes };
    },
  };
  return { sdk: { Snapshot, Sandbox }, calls, snapshots };
}

async function run(args, fake = fakeSdk(), env = ENV) {
  const out = [];
  const err = [];
  const code = await main(args, env, fake.sdk, {
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  });
  const receipt = out.length === 1 ? safeJson(out[0]) : null;
  return { code, receipt, out, err, calls: fake.calls };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const deletes = (calls) => calls.filter((c) => c.startsWith("delete:"));

test("--help exits 0 without credentials or an SDK call", async () => {
  const fake = fakeSdk();
  for (const flag of ["--help", "-h"]) {
    const { code, out } = await run([flag], fake, {});
    assert.equal(code, 0);
    assert.match(out[0], /^Usage: npm run vercel:scanner-retire/);
  }
  assert.deepEqual(fake.calls, []);
});

test("usage errors exit 2 before any SDK call", async () => {
  const repoFile = path.join(__dirname, "receipt.json");
  const cases = [
    ["--retire", R1],
    ["--keep", ACTIVE],
    ["--keep", "snap-bad", "--retire", R1],
    ["--keep", ACTIVE, "--retire", "not_a_snapshot"],
    ["--keep", ACTIVE, "--retire", ACTIVE],
    ["--keep", ACTIVE, "--keep", ACTIVE, "--retire", R1],
    [
      "--keep",
      ACTIVE,
      ...Array.from({ length: MAX_RETIRE + 1 }, (_, i) => [
        "--retire",
        `snap_extra${i}`,
      ]).flat(),
    ],
    ["--keep", ACTIVE, "--retire", R1, "--force"],
    ["--keep", ACTIVE, "--retire"],
    ["--keep", "--retire", R1],
    ["--keep", ACTIVE, "--retire", R1, "--output", repoFile],
  ];
  for (const args of cases) {
    const fake = fakeSdk();
    const { code, out } = await run(args, fake);
    assert.equal(code, 2, args.join(" "));
    assert.deepEqual(out, []);
    assert.deepEqual(fake.calls, [], args.join(" "));
  }
  assert.equal(fs.existsSync(repoFile), false);
});

test("parseArgs keeps the given order and the confirm flag", () => {
  const options = parseArgs([...ARGS, "--confirm"]);
  assert.deepEqual(options.keep, [ACTIVE, ROLLBACK]);
  assert.deepEqual(options.retire, [R1, R2, R3]);
  assert.equal(options.confirm, true);
});

test("plan mode inspects, reports storage and never deletes", async () => {
  const { code, receipt, calls } = await run(ARGS);
  assert.equal(code, 0);
  assert.equal(receipt.mode, "plan");
  assert.equal(receipt.result, "planned");
  assert.deepEqual(receipt.refusals, []);
  assert.equal(receipt.active_snapshot_id, ACTIVE);
  assert.equal(receipt.active_sandboxes, 0);
  assert.deepEqual(receipt.target, {
    team_id: "team-test",
    project_id: "prj-test",
    region: "iad1",
  });
  assert.deepEqual(receipt.storage.before, {
    created_count: 5,
    created_bytes: 460_000_000 * 2 + 461_000_000 + 462_000_000 + 463_000_000,
  });
  assert.equal(receipt.storage.after, null);
  assert.deepEqual(
    receipt.retire.map((r) => [r.id, r.status_before, r.outcome]),
    [
      [R1, "created", "planned"],
      [R2, "created", "planned"],
      [R3, "created", "planned"],
    ],
  );
  assert.ok(receipt.keep.every((k) => k.status === "created" && k.expires_at));
  assert.deepEqual(receipt.unlisted_snapshots, []);
  assert.deepEqual(deletes(calls), []);
});

// Each refusal on its own: exit 1, result refused, and no delete even with --confirm.
const refusalCases = [
  [
    "active_not_kept",
    () => ({ env: { ...ENV, SCANNER_SANDBOX_SNAPSHOT_ID: "snap_other" } }),
  ],
  [
    "active_unknown",
    () => {
      const env = { ...ENV };
      delete env.SCANNER_SANDBOX_SNAPSHOT_ID;
      return { env };
    },
  ],
  [
    "active_disagrees",
    () => ({ env: { ...ENV, ACRES_SCANNER_SNAPSHOT_ID: ROLLBACK } }),
  ],
  [
    "keep_unhealthy",
    () => {
      const snapshots = inventory();
      snapshots.get(ROLLBACK).expiresAt = Date.now() - 1000;
      return { fake: fakeSdk({ snapshots }) };
    },
  ],
  [
    "keep_unhealthy",
    () => {
      const snapshots = inventory();
      snapshots.delete(ROLLBACK);
      return { fake: fakeSdk({ snapshots }) };
    },
  ],
  [
    "keep_unhealthy",
    () => {
      const snapshots = inventory();
      snapshots.get(ROLLBACK).region = "sfo1";
      return { fake: fakeSdk({ snapshots }) };
    },
  ],
  [
    "parent_dependency",
    () => {
      const snapshots = inventory();
      snapshots.get(ROLLBACK).parentId = R2;
      return { fake: fakeSdk({ snapshots }) };
    },
  ],
  [
    "active_sandbox",
    () => ({
      fake: fakeSdk({ sandboxes: [{ name: "scan", status: "pending" }] }),
    }),
  ],
  [
    "wrong_region",
    () => {
      const snapshots = inventory();
      snapshots.get(R3).region = "fra1";
      return { fake: fakeSdk({ snapshots }) };
    },
  ],
  ["lookup_failed", () => ({ fake: fakeSdk({ getFails: new Set([R1]) }) })],
  ["lookup_failed", () => ({ fake: fakeSdk({ snapshotListFails: true }) })],
  ["lookup_failed", () => ({ fake: fakeSdk({ sandboxListFails: true }) })],
  [
    "not_in_project",
    () => ({ fake: fakeSdk({ otherProject: new Set([R2]) }) }),
  ],
  [
    "not_in_project",
    () => ({ fake: fakeSdk({ otherProject: new Set([ROLLBACK]) }) }),
  ],
  [
    "sandbox_dependency",
    () => ({
      fake: fakeSdk({
        sandboxes: [
          { name: "builder", status: "stopped", currentSnapshotId: R3 },
        ],
      }),
    }),
  ],
  [
    "active_malformed",
    () => ({
      env: { ...ENV, SCANNER_SANDBOX_SNAPSHOT_ID: "not-a-snap secretish" },
    }),
  ],
];

for (const [code, setup] of refusalCases) {
  test(`refuses on ${code} with zero deletes`, async () => {
    const { env = ENV, fake = fakeSdk() } = setup();
    const result = await run([...ARGS, "--confirm"], fake, env);
    assert.equal(result.code, 1);
    assert.equal(result.receipt.result, "refused");
    assert.deepEqual(result.receipt.refusals, [code]);
    assert.deepEqual(deletes(result.calls), []);
    assert.equal(result.receipt.storage.after, null);
  });
}

test("a stopped sandbox is not an active one", async () => {
  const fake = fakeSdk({
    sandboxes: [
      { name: "old", status: "stopped" },
      { name: "bad", status: "failed" },
    ],
  });
  const { code, receipt } = await run(ARGS, fake);
  assert.equal(code, 0);
  assert.equal(receipt.active_sandboxes, 0);
});

test("confirm deletes in order and confirms each by status or 404", async () => {
  const fake = fakeSdk({ goneAfterDelete: new Set([R2]) });
  const { code, receipt, calls } = await run([...ARGS, "--confirm"], fake);
  assert.equal(code, 0);
  assert.equal(receipt.mode, "retire");
  assert.equal(receipt.result, "retired");
  assert.deepEqual(deletes(calls), [
    `delete:${R1}`,
    `delete:${R2}`,
    `delete:${R3}`,
  ]);
  // Each delete is followed by its own re-get before the next one starts.
  const r1 = calls.indexOf(`delete:${R1}`);
  assert.equal(calls[r1 + 1], `get:${R1}`);
  assert.deepEqual(
    receipt.retire.map((r) => r.outcome),
    ["deleted", "deleted", "deleted"],
  );
  assert.deepEqual(receipt.storage.after, {
    created_count: 2,
    created_bytes: 920_000_000,
  });
  assert.deepEqual(
    receipt.keep_after.map((k) => [k.id, k.status]),
    [
      [ACTIVE, "created"],
      [ROLLBACK, "created"],
    ],
  );
  assert.deepEqual(
    receipt.keep_after.map((k) => k.expires_at),
    receipt.keep.map((k) => k.expires_at),
  );
});

test("an already absent target is skipped and the rest are deleted", async () => {
  const snapshots = inventory();
  snapshots.delete(R1);
  const fake = fakeSdk({ snapshots });
  const { code, receipt, calls } = await run([...ARGS, "--confirm"], fake);
  assert.equal(code, 0);
  assert.equal(receipt.result, "retired");
  assert.deepEqual(
    receipt.retire.map((r) => [r.id, r.status_before, r.outcome]),
    [
      [R1, "absent", "already_absent"],
      [R2, "created", "deleted"],
      [R3, "created", "deleted"],
    ],
  );
  assert.deepEqual(deletes(calls), [`delete:${R2}`, `delete:${R3}`]);
});

test("a thrown delete stops the run with no retry", async () => {
  const fake = fakeSdk({ deleteThrows: new Set([R2]) });
  const { code, receipt, calls, out, err } = await run(
    [...ARGS, "--confirm"],
    fake,
  );
  assert.equal(code, 1);
  assert.equal(receipt.result, "partial");
  assert.deepEqual(
    receipt.retire.map((r) => r.outcome),
    ["deleted", "delete_failed", "not_attempted"],
  );
  assert.deepEqual(deletes(calls), [`delete:${R1}`, `delete:${R2}`]);
  assert.equal(receipt.storage.after.created_count, 4);
  assert.ok(!`${out}${err}`.includes(TOKEN));
});

test("a delete that lands and then throws is recorded, and still stops", async () => {
  const fake = fakeSdk({ landsThenThrows: new Set([R1]) });
  const { code, receipt, calls } = await run([...ARGS, "--confirm"], fake);
  assert.equal(code, 1);
  assert.equal(receipt.result, "partial");
  assert.deepEqual(
    receipt.retire.map((r) => r.outcome),
    ["deleted_after_error", "not_attempted", "not_attempted"],
  );
  assert.deepEqual(deletes(calls), [`delete:${R1}`]);
});

test("a re-get that errors after a delete is unconfirmed, never deleted", async () => {
  const fake = fakeSdk({ regetFails: new Set([R1]) });
  const { code, receipt, calls } = await run([...ARGS, "--confirm"], fake);
  assert.equal(code, 1);
  assert.equal(receipt.result, "partial");
  assert.deepEqual(
    receipt.retire.map((r) => r.outcome),
    ["unconfirmed", "not_attempted", "not_attempted"],
  );
  assert.deepEqual(deletes(calls), [`delete:${R1}`]);
});

test("a malformed active id never reaches the receipt", async () => {
  const { receipt } = await run(ARGS, fakeSdk(), {
    ...ENV,
    SCANNER_SANDBOX_SNAPSHOT_ID: "not-a-snap secretish",
  });
  assert.equal(receipt.active_snapshot_id, null);
  assert.ok(!JSON.stringify(receipt).includes("secretish"));
});

test("a failed listing reports unlisted snapshots as unknown, not empty", async () => {
  const { receipt } = await run(ARGS, fakeSdk({ snapshotListFails: true }));
  assert.equal(receipt.unlisted_snapshots, null);
  assert.equal(receipt.storage.before, null);
});

test("a keep that changes during the run warns and exits 1", async () => {
  const snapshots = inventory();
  const fake = fakeSdk({ snapshots });
  const list = fake.sdk.Snapshot.list;
  let listings = 0;
  // The second listing is the after-state: the rollback keep has gone.
  fake.sdk.Snapshot.list = async (params) => {
    if (++listings === 2) snapshots.get(ROLLBACK).status = "failed";
    return list(params);
  };
  const { code, receipt } = await run([...ARGS, "--confirm"], fake);
  assert.equal(code, 1);
  assert.equal(receipt.result, "retired");
  assert.deepEqual(receipt.warnings, ["keep_changed"]);
});

test("a delete the re-get cannot confirm stops the run", async () => {
  const fake = fakeSdk({ stayCreated: new Set([R1]) });
  const { code, receipt, calls } = await run([...ARGS, "--confirm"], fake);
  assert.equal(code, 1);
  assert.equal(receipt.result, "partial");
  assert.deepEqual(
    receipt.retire.map((r) => r.outcome),
    ["unconfirmed", "not_attempted", "not_attempted"],
  );
  assert.deepEqual(deletes(calls), [`delete:${R1}`]);
});

test("receipt and stderr never carry the token, even on provider errors", async () => {
  for (const fake of [
    fakeSdk(),
    fakeSdk({ getFails: new Set([ACTIVE]) }),
    fakeSdk({ deleteThrows: new Set([R1]) }),
  ]) {
    const { out, err } = await run([...ARGS, "--confirm"], fake);
    const text = `${out.join("\n")}\n${err.join("\n")}`;
    assert.ok(!text.includes(TOKEN));
    assert.ok(!text.includes("signature"));
  }
});

test("an unlisted created snapshot is reported, never deleted", async () => {
  const snapshots = inventory();
  snapshots.set("snap_stray", snap());
  snapshots.set("snap_gone", snap({ status: "deleted" }));
  const fake = fakeSdk({ snapshots });
  const { code, receipt, calls } = await run([...ARGS, "--confirm"], fake);
  assert.equal(code, 0);
  assert.deepEqual(receipt.unlisted_snapshots, ["snap_stray"]);
  assert.ok(!calls.includes("delete:snap_stray"));
  assert.equal(snapshots.get("snap_stray").status, "created");
});

test("--output writes the same receipt 0600 and refuses an existing file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-retire-"));
  try {
    const file = path.join(dir, "plan.json");
    const { code, out } = await run([...ARGS, "--output", file]);
    assert.equal(code, 0);
    assert.equal(fs.readFileSync(file, "utf8"), `${out[0]}\n`);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const fake = fakeSdk();
    const again = await run([...ARGS, "--output", file], fake);
    assert.equal(again.code, 2);
    assert.deepEqual(fake.calls, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a target outside the isolated preview is refused before any SDK call", async () => {
  const fake = fakeSdk();
  const { code, out } = await run(ARGS, fake, {
    ...ENV,
    VERCEL_ENV: "production",
  });
  assert.equal(code, 1);
  assert.deepEqual(out, []);
  assert.deepEqual(fake.calls, []);
});
