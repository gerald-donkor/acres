# Prompt 373 — Snapshot-based Sandbox scanner (Prompt 370, checklist item 3)

## Scope and why this is next

Planning baseline: `8502b93` on `main` (clean tree).

Prompt 370 (Vercel-managed migration) is approved and still running. The
"Resume here" checklist in `docs/vercel-deployment.md` lists **Scanner image**
as the first open item that work can start on now: "**blocked on cost**
(Prompt 372) … Next: a snapshot-based scanner (Hobby includes 15 GB of Sandbox
snapshot storage and is never charged), as its own prompt." On 2026-10-15 the
user chose "Commit, then new prompt" for exactly this. The first preview
deployment depends on this item, because uploads cannot be accepted without a
working scanner. This prompt inherits 370's target, non-goals and
authorization limits, plus the **$0 rule**: stop and ask before anything whose
Hobby allotment is not documented as free.

Prompt 372 built and committed, locally only:

- the `vercel-sandbox` adapter with fail-closed result mapping;
- the probe's `scanner` and `scanner-failures` modes;
- the persistence fix (non-persistent sandboxes, `stop()` + delete).

Nothing is hosted. The only gap is where the scanner's bytes come from. VCR
image storage costs $0.10/GB. A Sandbox **snapshot** does not, on Hobby.

This prompt delivers five things:

1. `scripts/vercel/build-scanner-snapshot.js`: an opt-in script that boots a
   managed Sandbox image, installs the **official ClamAV 1.5.4 `.deb`**
   (hash-pinned), fetches signatures, snapshots the VM and prints the snapshot
   id, size and CVD hashes;
2. the probe and the adapter switched from a VCR image digest to a snapshot id,
   with OIDC authentication, so no long-lived `VERCEL_TOKEN` is needed;
3. a hosted build, then the hosted `scanner` and `scanner-failures` runs with
   a residue check, including a new check that the **base snapshot survives**
   scan-sandbox deletion;
4. the hosted unknowns Prompt 372 named, recorded as observed: the shape of a
   killed command, auto-resume on session end, and whether `writeFiles` creates
   parent directories;
5. a docs record, and the checklist item ticked only if every gate case
   passes.

### Facts verified while planning (2026-10-15)

- **Pricing.** [Sandbox pricing](https://vercel.com/docs/sandbox/pricing)
  (last updated 2026-09-10) gives Hobby these included amounts: Active CPU
  5 h/month, Provisioned Memory 420 GB-h/month, Creations 5,000/month, Data
  Transfer 20 GB/month, **Snapshot Storage 15 GB (lifetime)**. It also says:
  "You **will not be charged** for any additional usage. Once you exceed the
  quotas, sandbox creation is paused". Data the sandbox downloads is free.
  "(lifetime)" is not defined on the page. Read it conservatively as a
  cumulative cap, and keep at most **one** scanner snapshot stored.
- **ClamAV package.** GitHub release `clamav-1.5.4` (published 2026-08-07)
  has asset `clamav-1.5.4.linux.x86_64.deb`, size 105,819,396 bytes, GitHub
  digest
  `sha256:28d6efc5b4423e7830c3559339552eb53870a9eac51ac4efb37d60530d329886`,
  with a detached `.sig` (801 bytes). This is the same 1.5.4 that Prompt 372
  measured locally, so the measured exit-2 behaviour of
  `--alert-exceeds-max=yes` still applies.
- **SDK 3.8.0** (`node_modules/@vercel/sandbox/dist/sandbox.d.ts`):
  - `CreateSandboxParams` allows
    `source: { type: "snapshot"; snapshotId: string }`, with `image` and
    `runtime` set to `never` in that branch;
  - `get sourceSnapshotId(): string | undefined` ("If the session was
    created from a snapshot, the ID of that snapshot");
  - `snapshot(opts?: { expiration?: number; signal?: AbortSignal }):
    Promise<Snapshot>`, which stops the sandbox;
  - `delete(opts?: { deleteOrphanSnapshots?: boolean; … })`. Its JSDoc says
    "When true, the snapshots of this sandbox that are not used by any other
    sandbox are deleted asynchronously too. Defaults to false, which keeps
    them until they expire."
  - `snapshot.d.ts` declares `Snapshot.get(params)` (static),
    `snapshot.delete()`, and the getters `snapshotId`, `status`
    (`created | deleted | failed`), `sizeBytes` and `expiresAt`;
  - credentials: without explicit `token`/`teamId`/`projectId`, the SDK uses
    `VERCEL_OIDC_TOKEN`, takes owner and project from its claims and
    refreshes it through `@vercel/oidc`. It never reads `VERCEL_TOKEN` from
    the environment. Re-check this in `dist/utils/get-credentials.js` before
    relying on it.
- **Managed images** (skill `vercel:vercel-sandbox`): `vercel/sandbox/node:24`
  is "Ubuntu + pinned Node.js, pnpm". Commands run as `ubuntu` (in the sudo
  group); root needs `sudo: true` (object form only). The exact Ubuntu and Node
  patch versions are not documented, so Step 3 records them.

### Design decisions

**Snapshot, not image.** The scanner source becomes a snapshot id
(`snap_…`) in `SCANNER_SANDBOX_SNAPSHOT_ID` and `ACRES_SCANNER_SNAPSHOT_ID`.
These replace `SCANNER_SANDBOX_IMAGE` and `ACRES_SCANNER_IMAGE`. Prompt 372
recorded the image contract as "not settled", and VCR is blocked on cost. A
second source kind would be unused code (YAGNI). The VM's identity check
changes from `sandbox.image` ends with the digest to
`sandbox.sourceSnapshotId === <configured id>`. The CVD hash and age check is
unchanged and remains the content pin. A snapshot id is immutable, but unlike
a digest it is not a content hash, so the in-VM hash check carries the
integrity guarantee.

**Official `.deb`, hash-pinned, not Ubuntu's apt package.** It keeps ClamAV
1.5.4 exactly. The package is downloaded inside the builder VM, using Node's
`fetch` (Node is in the image; `curl` may not be). It is installed only if its
SHA-256 equals the pinned digest. GPG verification of the `.sig` is optional:
attempt it only if `gpg` is present and the Talos signing key can be fetched
from an official Cisco-Talos source. Otherwise record "not verified by
signature, verified by GitHub digest". Never install on a hash mismatch.

**Same paths as the Docker image.** Signatures go in `/var/lib/clamav`, made
world-readable (`a+rX`). Every command passes `--database=/var/lib/clamav` and
`--config-file`. The shared signature-check script, its parity test and the
probe cases therefore keep working unchanged. `infra/vercel/scanner/` stays as
the local, reproducible mirror for Docker dry runs. Its README gains a line
saying that the hosted scanner is built by the snapshot script instead.

**Builder egress.** The builder holds no customer bytes. It may use an
allow-list policy limited to the hosts the downloads need. Resolve them at
execution: run `curl -sIL` locally on the release URL and record every host in
the redirect chain (expected `github.com` plus a `*.githubusercontent.com`
release-asset host), plus `database.clamav.net`. Domain rules are SNI-based,
TLS only. If an allow-list blocks a needed redirect and the host cannot be
named, `allow-all` for the **builder only** is acceptable; record why. Scan
sandboxes are always `deny-all`, passed explicitly at create. The probe's
`egress-denied` case proves that the snapshot does not carry the builder's
policy.

**Snapshot lifecycle and the orphan-deletion risk.** The base snapshot belongs
to the builder sandbox.

- The builder is cleaned up with `delete({ deleteOrphanSnapshots: false })`.
  The default keeps the snapshot. **`true` would delete the scanner itself.**
- Scan sandboxes are created `persistent: false`, so they write no snapshot
  of their own. Whether their `delete({ deleteOrphanSnapshots: true })` can
  remove the **source** snapshot is not documented. A new probe gate, `base
  snapshot survives`, checks it: after every scan sandbox is deleted,
  `Snapshot.get` must still return `status: "created"`.
- If the gate fails, the adapter and probe switch to
  `delete({ deleteOrphanSnapshots: false })` and keep only the
  `persistent: false` protection. A residue check (no snapshot whose source
  session is a scan sandbox) replaces the flag. Record which branch held.
  Rebuild the snapshot before re-running, because the old one is gone.

Snapshot expiration: pass `expiration: 8 * 24 * 3600 * 1000` (8 days). That
is longer than the 168 h signature-age ceiling, so an expired snapshot is
never the first failure. The build script deletes the **previous** scanner
snapshot only after the new one passes its smoke test, and only by the id the
operator passes in (`--replace <snap_id>`). It never deletes by listing.

**Builder persistence.** `snapshot()` is documented for running sandboxes. It
is not documented whether a `persistent: false` sandbox can be snapshotted.
Create the builder `persistent: false` first. If `snapshot()` refuses it,
recreate the builder with the default persistence, set `keepLastSnapshots:
{ count: 1 }`, and record the outcome. A failed attempt costs one creation.

**Authentication: OIDC first.** The build script and the probe accept either a
`VERCEL_OIDC_TOKEN` or a `VERCEL_TOKEN` in the environment. With OIDC they pass
**no** credentials, so the SDK resolves them. They check that the token's
`project_id` and `owner_id` claims equal `VERCEL_PROJECT_ID` and
`VERCEL_TEAM_ID`, decoding the JWT payload without verifying it, because this
only checks which target the token is for. They never print the token or its
claims. The automated path is
`npx vercel@latest env pull ~/.config/acres/vercel-preview/preview.env
--environment=preview --yes`, which refreshes the roughly 12-hour token and
already holds only variable names that Prompt 370 vetted. `VERCEL_TOKEN`
stays as an explicit fallback.

### Cost and quota budget (stop conditions)

Every run is on Hobby, which is free and never charged. Quota exhaustion only
pauses creation for 30 days, and that would block the first preview
deployment. Budget for this prompt:

| item                                | creations | ~lifetime | notes                                          |
| ----------------------------------- | --------- | --------- | ---------------------------------------------- |
| snapshot build (+1 retry allowed)   | ≤ 2       | ≤ 10 min  | 2 vCPU; ~106 MB `.deb` + ~110 MB CVDs, free in |
| `scanner`                           | 1         | ≤ 120 s   | 1 vCPU                                         |
| `scanner-failures`                  | 9         | ≤ 120 s   | 1 vCPU each                                    |
| one full rerun after a fix          | ≤ 10      | ≤ 120 s   | only if a case fails for a probe defect        |

Total ≤ 23 creations and under 1 Active-CPU hour (5 h included). Snapshot
storage holds one snapshot; Step 3 measures its size. **Stop and ask** if the
measured size exceeds 5 GB, if the dashboard or an API shows any charge, or if
a run would exceed this budget.

## References read for this prompt

- `AGENTS.md`; `docs/vercel-deployment.md` ("Resume here", "Scanner image —
  2026-10-15", "Target and gates"); `docs/security.md` ("Vercel Sandbox
  scanner — Prompt 372"); `docs/backend.md` ("Scanner provider selection");
  `infra/vercel/README.md`; `infra/vercel/scanner/{Dockerfile,freshclam.conf,README.md}`;
  `prompts/372-vercel-sandbox-scanner-image.md`; memory
  `vercel-migration-resume`.
- Code: `scripts/vercel/probe-platform.js` (`configuration`,
  `sandboxRunner`, `cleanupSandbox`, `FAILURE_CASES`, `SANDBOX_BUDGET`,
  `main`), `scripts/vercel/probe-platform.spec.js`,
  `server/src/scanner/vercel-sandbox-scanner.adapter{,.spec}.ts`,
  `server/src/config/env.validation{,.spec}.ts`,
  `server/src/config/acres-config.service{,.spec}.ts`, `server/.env.example`.
- SDK `@vercel/sandbox` 3.8.0: `dist/sandbox.d.ts` (lines ~196–212 snapshot
  source; ~440 `sourceSnapshotId`; ~1084 `snapshot()`; ~1141 `delete()`),
  `dist/snapshot.d.ts`, `dist/utils/get-credentials.js`, `dist/sandbox.js`
  (`withResume`).
- Official docs: [Sandbox pricing](https://vercel.com/docs/sandbox/pricing),
  [Snapshots](https://vercel.com/docs/sandbox/concepts/snapshots),
  [Persistence](https://vercel.com/docs/sandbox/concepts/persistent-sandboxes),
  GitHub release API for `Cisco-Talos/clamav` tag `clamav-1.5.4`.

There is no visual reference: no UI changes.

## SKILLS USED

- `vercel:vercel-sandbox` — create/runCommand/sudo/snapshot/delete, network policy, managed images, Hobby limits.
- `vercel:vercel-cli` — `vercel env pull`, `vercel sandbox list` / `sandbox snapshots list` for the residue check.
- `vercel:env-vars` — OIDC token lifecycle; new variable names; no project env change here.
- `nestjs-best-practices` — adapter/config changes stay in the provider-factory pattern.
- `security-best-practices` — hash-pinned download, least-privilege builder egress, deny-all scan VMs, no bytes kept.
- `secrets-management` — OIDC token handling; never print tokens or claims; restricted env files.
- `error-handling-patterns` — map snapshot/identity/cleanup failures to fail-closed codes.
- `javascript-testing-patterns` — doubles for the build script, the probe and the adapter.
- `deployment-pipeline-design` — a reproducible scanner build step and its rebuild cadence as a recorded gate.
- `requesting-code-review` — independent review after self-verification.
- `receiving-code-review` — verify findings before fixing.
- `caveman-commit` — every commit message.

## Ordered implementation

Use Node 24 for every check (`/tmp/acres-node24/...`, npm through
`/usr/lib/node_modules/npm/bin/npm-cli.js`). In zsh, run multi-argument
commands through `bash -c`. Never print a secret value; list variable names
only (`cut -d= -f1`).

### Step 0 — Re-establish access (read-only)

1. `npx vercel@latest whoami` (if signed out, the user runs
   `! npx vercel@latest login`). Confirm `.vercel/project.json` links
   `prj_q9ApajZWDgdYZetnm5s5oakEjrUD` in `team_zE3mp7nrEZ6a7cxRavwUMYC4`.
2. Refresh OIDC: `npx vercel@latest env pull
   ~/.config/acres/vercel-preview/preview.env --environment=preview --yes`
   (keep it 0600), then list names only.
3. `npx vercel@latest sandbox --help`,
   `npx vercel@latest sandbox list --help` and the snapshots subcommand's
   `--help`, to record the exact residue-check commands (do not guess flags).
   Record the baseline: current sandboxes and snapshots for `acres` (expected:
   none).

### Step 1 — Credentials helper (probe and build script)

In `scripts/vercel/probe-platform.js`, change `configuration(env, mode)` for
the `scanner*` modes:

- Require exactly one of `VERCEL_OIDC_TOKEN` or `VERCEL_TOKEN`. When both are
  present, prefer OIDC and ignore the token.
- OIDC: decode the payload segment (base64url JSON) and require
  `project_id === VERCEL_PROJECT_ID` and `owner_id === VERCEL_TEAM_ID`, or
  throw `"OIDC token is for a different project or team."`. Return
  `{ auth: "oidc" }` with no token field. A malformed token throws
  `"VERCEL_OIDC_TOKEN is not a JWT."` and never echoes the value.
- Token: keep the current behaviour, `{ auth: "token", token }`.
- Replace `ACRES_SCANNER_IMAGE` with `ACRES_SCANNER_SNAPSHOT_ID`
  (`^snap_[A-Za-z0-9]+$`). Keep the main/daily hash and age checks.
- `sandboxRunner` passes `token`/`teamId`/`projectId` to `Sandbox.create`
  only when `auth === "token"`.

Export a small `credentialsFor(config)` helper so the build script reuses it
(see Step 2). The build script `require`s it from the probe module; do not
duplicate it.

### Step 2 — `scripts/vercel/build-scanner-snapshot.js`

CommonJS, `"use strict"`, opt-in. The same guards as the probe:
`ACRES_VERCEL_PROBE=isolated-synthetic-preview`, `VERCEL_ENV=preview`, team
and project ids, region (`^[a-z]{3}[1-9][0-9]?$`) and auth from Step 1. Add
`npm run vercel:scanner-snapshot` to the root `package.json` (that script name
does not exist yet; this step adds it).

Pinned constants at the top of the file:

```js
const CLAMAV_DEB_URL =
  "https://github.com/Cisco-Talos/clamav/releases/download/clamav-1.5.4/clamav-1.5.4.linux.x86_64.deb";
const CLAMAV_DEB_SHA256 =
  "28d6efc5b4423e7830c3559339552eb53870a9eac51ac4efb37d60530d329886";
const BASE_IMAGE = "vercel/sandbox/node:24";
const SNAPSHOT_EXPIRATION_MS = 8 * 24 * 3600 * 1000;
```

The freshclam config is the exact text of
`infra/vercel/scanner/freshclam.conf`, read from that file at runtime and
written into the VM, so there is one source.

Sequence (each `runCommand` uses the object form with `timeoutMs`; any
non-zero exit aborts with a fixed message; stdout is parsed only for the
values named here):

1. `Sandbox.create({ image: BASE_IMAGE, region, resources: { vcpus: 2 },
   timeout: 900_000, persistent: false, networkPolicy: <allow-list from
   design> })`. Log the sandbox name to stderr.
2. Record the environment: `cat /etc/os-release` (`VERSION_ID`),
   `node --version`, `id -u`, `command -v curl gpg sudo` (presence only).
3. Download with Node: write a small script via `writeFiles` to
   `/tmp/acres-build/fetch.js` that streams `CLAMAV_DEB_URL` to
   `/tmp/acres-build/clamav.deb`, follows redirects and computes SHA-256. It
   exits 0 only if the hash equals `CLAMAV_DEB_SHA256` and exits 2 otherwise.
4. Optional `.sig` check (see design). Record `verified | not-verified:<reason>`.
5. `sudo: true`: `dpkg -i /tmp/acres-build/clamav.deb`. Exit ≠ 0 aborts; if
   `dpkg` reports missing dependencies, stop and report them. Do not
   `apt-get -f install` without recording what it pulls in.
6. `sudo: true`: `id clamav || useradd --system --no-create-home --shell
   /usr/sbin/nologin clamav`, then `mkdir -p /var/lib/clamav && chown clamav:
   /var/lib/clamav`. (freshclam drops privileges to `DatabaseOwner`, default
   `clamav`.)
7. Write `/tmp/acres-build/freshclam.conf`, then (`sudo: true`)
   `freshclam --config-file=/tmp/acres-build/freshclam.conf --stdout`.
   Then the same checks as the Dockerfile: `test -s` on all three `.cvd`, no
   `*.cld`, `chmod -R a+rX /var/lib/clamav`.
8. Record `command -v clamscan sigtool freshclam` (their paths must be on the
   default `PATH` for the `ubuntu` user, otherwise abort). Record
   `clamscan --version`, `sha256sum` of `main.cvd`/`daily.cvd` and
   `sigtool --info` `Build time`/`Version` for each CVD.
9. Smoke test **as the default user** (no sudo), with `/tmp/acres-scan`
   created first: the shared `SIGNATURE_CHECK` with the hashes from step 8 and
   max age 48, a synthetic clean CSV → exit 0 plus an `OK` line, and EICAR
   (built in memory, as in the probe) → exit 1 plus `FOUND`. Then
   `rm -rf /tmp/acres-scan /tmp/acres-build`, so that **no EICAR, `.deb` or
   build files are in the snapshot**. Verify with `test ! -e` on each.
10. Set `networkPolicy` to `"deny-all"` with `sandbox.update(...)` before
    snapshotting, if `update` accepts it (check `sandbox.d.ts`); otherwise
    record that the policy is not carried and rely on create-time `deny-all`.
11. `const snap = await sandbox.snapshot({ expiration:
    SNAPSHOT_EXPIRATION_MS, signal: AbortSignal.timeout(300_000) })`. If it
    refuses a non-persistent sandbox, apply the fallback in the design.
12. Cleanup in `finally`: `delete({ deleteOrphanSnapshots: false })`. Never
    `true` here. Then `Snapshot.get({ snapshotId })` must report `created`;
    record `sizeBytes` and `expiresAt`.
13. `--replace <snap_id>`: only after step 12 passes, `Snapshot.get` that id,
    then `.delete()`, and confirm `deleted` (or not found).
14. Print one JSON line: `{ snapshotId, sizeBytes, expiresAt, ubuntuVersion,
    nodeVersion, clamavVersion, debSha256Verified: true, signature:
    "verified|not-verified:…", main: { sha256, version, buildTime }, daily:
    {…}, bytecode: { version, buildTime }, egress: "allow-list|allow-all",
    sandboxCreations }`. A snapshot id is not a secret.

Write to the operator's restricted file (not the repo):
`~/.config/acres/vercel-preview/scanner.env`, mode 0600, containing
`ACRES_SCANNER_SNAPSHOT_ID`, `ACRES_SCANNER_MAIN_SHA256` and
`ACRES_SCANNER_DAILY_SHA256`. Do this only with `--write-env <path>`, and
refuse a path inside the repository.

**Tests** in `scripts/vercel/build-scanner-snapshot.spec.js` (node:test,
doubles only; add it to `vercel:probe-test` or a sibling script):

- the hash-mismatch exit aborts before `dpkg`;
- any non-zero step aborts and still deletes the builder;
- the builder is deleted with `deleteOrphanSnapshots: false`, never `true`;
- the clean-up `rm` runs before `snapshot()`, and `snapshot()` is not called
  if the smoke test fails;
- `--replace` deletes only the given id, and only after the new snapshot
  reports `created`;
- `--write-env` refuses repo paths and writes 0600;
- the summary never contains the token, the deb URL query, or EICAR.

### Step 3 — Hosted build

```bash
bash -c 'set -a; . ~/.config/acres/vercel-preview/preview.env; set +a; \
  ACRES_VERCEL_PROBE=isolated-synthetic-preview VERCEL_ENV=preview \
  VERCEL_TEAM_ID=team_zE3mp7nrEZ6a7cxRavwUMYC4 \
  VERCEL_PROJECT_ID=prj_q9ApajZWDgdYZetnm5s5oakEjrUD \
  ACRES_VERCEL_PROBE_REGION=iad1 \
  node scripts/vercel/build-scanner-snapshot.js \
    --write-env ~/.config/acres/vercel-preview/scanner.env'
```

Record the summary JSON. If `sizeBytes` > 5 GB, stop (cost gate). If the
build fails for a reason the design did not foresee, fix it, using at most one
retry creation, then stop and report.

### Step 4 — Probe changes

In `scripts/vercel/probe-platform.js`:

1. `sandboxRunner` creates with
   `source: { type: "snapshot", snapshotId }`, no `image`, and checks
   `sandbox.sourceSnapshotId === snapshotId` (mismatch or `undefined` →
   failure). Everything else is unchanged: `persistent: false`, `deny-all`,
   1 vCPU, 120 s, stop → delete.
2. New gate in **both** modes, after all cleanup: `Snapshot.get({
   snapshotId, ...credentials })` returns `status === "created"`. Report it
   as `baseSnapshotSurvived: true|false`. `false` fails the mode.
3. Record observed shapes, as diagnostics without a gate:
   - in `command-timeout`, the raw `exitCode` when the command resolves;
   - in `session-timeout`, whether the rejection error has a `410` status
     (read `error.response?.status` or the SDK's error type from
     `dist/api-client`; verify the field name) and whether a second session
     started (`sandbox.listSessions()` count after the case, if the API allows
     it under `persistent: false`);
   - in `size-limit`, whether `writeFiles` into a **missing** directory
     succeeded. Add one write to `/tmp/acres-missing-dir/x` before the
     `mkdir` and record `writeCreatesParents: true|false`.
4. The summary contains no token, no claims and no snapshot id (the id is
   recorded in the doc from the build summary).

Update `scripts/vercel/probe-platform.spec.js`:

- the snapshot `source` is passed and `image` is absent;
- a `sourceSnapshotId` mismatch fails;
- `baseSnapshotSurvived: false` fails each mode;
- OIDC configuration: no credentials are passed to `create`; a claims
  mismatch throws; a malformed JWT throws without echoing the value;
- with both tokens present, OIDC wins;
- the new diagnostics never affect `passed`.

### Step 5 — Adapter and config (server)

- `env.validation.ts`: replace `SCANNER_SANDBOX_IMAGE` with
  `SCANNER_SANDBOX_SNAPSHOT_ID` (`^snap_[A-Za-z0-9]+$`, required when
  `vercel-sandbox`). Remove the VCR regex constant. Error text:
  `SCANNER_SANDBOX_SNAPSHOT_ID must be a Vercel Sandbox snapshot id (snap_…)
  when SCANNER_PROVIDER="vercel-sandbox".` Update `AcresEnv`
  (`scannerSandboxSnapshotId`), the getter in `acres-config.service.ts`,
  both specs and `server/.env.example`.
- `vercel-sandbox-scanner.adapter.ts`:
  - `ScanSandboxCreateParams` replaces `image` with `source: { type:
    'snapshot'; snapshotId: string }`;
  - `ScanSandbox` replaces `image` with
    `readonly sourceSnapshotId: string | undefined`;
  - the identity check becomes `sandbox.sourceSnapshotId === snapshotId`,
    else `scanner_unavailable`;
  - cleanup follows the branch Step 6 proves: keep
    `deleteOrphanSnapshots: true` only if `baseSnapshotSurvived` held on
    every hosted case, otherwise `false`, with the comment and docs updated.
    Typecheck must still pass against the real `Sandbox.create` with no cast.
- Adapter spec: swap the image-mismatch cases for snapshot-mismatch and
  `undefined` cases; assert the create params carry `source` and no `image`;
  keep every other case.
- Logs still never contain the snapshot id (treat it like the image
  reference: identifiers are logged as the sandbox name only).

### Step 6 — Hosted probe runs

```bash
bash -c 'set -a; . ~/.config/acres/vercel-preview/preview.env; \
  . ~/.config/acres/vercel-preview/scanner.env; set +a; \
  ACRES_VERCEL_PROBE=isolated-synthetic-preview VERCEL_ENV=preview \
  VERCEL_TEAM_ID=team_zE3mp7nrEZ6a7cxRavwUMYC4 \
  VERCEL_PROJECT_ID=prj_q9ApajZWDgdYZetnm5s5oakEjrUD \
  ACRES_VERCEL_PROBE_REGION=iad1 ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS=48 \
  node scripts/vercel/probe-platform.js scanner && \
  node scripts/vercel/probe-platform.js scanner-failures'
```

The 48 h age is a probe choice. If the snapshot is older than that, rebuild
it; never raise the threshold. Then run the residue check with the commands
recorded in Step 0. The result must be no running sandboxes and exactly one
snapshot (the scanner's). Delete stray items only by the names the runs
printed, and report them as defects. Record the Usage page's Sandbox CPU and
creation counts if visible; otherwise estimate.

If `baseSnapshotSurvived` is `false`: switch the adapter and probe to the
`false` branch (design), rebuild the snapshot (one creation), rerun both modes
once, and record both runs.

### Step 7 — Documentation

- `docs/vercel-deployment.md`: a new section, "Scanner snapshot —
  <date>". It records the pricing evidence and the $0 basis; the deb pin and
  signature status; the build summary (snapshot id, size, expiry, Ubuntu,
  Node and ClamAV versions, CVD hashes and build times, egress mode); every
  hosted case with its result; the three observed shapes; the residue check;
  the orphan-deletion branch that held; and the usage. Update "Resume here":
  - tick **Scanner image** only if both modes passed every gate case,
    including `baseSnapshotSurvived`;
  - rename it **Scanner source**;
  - update the re-run commands (OIDC, `scanner.env`);
  - in **First preview deployment**, replace `SCANNER_SANDBOX_IMAGE` with
    `SCANNER_SANDBOX_SNAPSHOT_ID`.

  Also update the "Scanner" row of "Target and gates".
- **Rebuild cadence stays an open production blocker**, now concrete: a
  Vercel Cron or GitHub Actions job running `vercel:scanner-snapshot
  --replace <old>` at least every `SCANNER_MAX_SIGNATURE_AGE_HOURS / 2`.
  Cron runs on production only, so on Hobby that job has to wait for the
  production decision. Do not build it here.
- `infra/vercel/README.md`: snapshot inputs, the OIDC auth option and the
  build script. `infra/vercel/scanner/README.md`: one line saying that
  hosted scanning uses the snapshot build and this Dockerfile is the local
  mirror.
- `docs/security.md` (Prompt 372 section): replace the image-digest identity
  bullet with the snapshot-id plus CVD-hash rule; builder egress (allow-list,
  no customer bytes); no EICAR or build artifacts in the snapshot; the
  orphan-deletion branch; and the base snapshot as a high-value artifact. A
  tampered snapshot is caught by the CVD hash check only for signatures, not
  for binaries, so record a residual: binaries are pinned by the `.deb`
  digest at build time only.
- `docs/backend.md`: update the "Scanner provider selection" variable names.
- Memory `vercel-migration-resume`: Prompt 373 = snapshot scanner; the
  orphan-deletion branch; OIDC auth works for Sandbox scripts.

## Reference deltas

None visual. Process deltas:

- `SCANNER_SANDBOX_IMAGE` and `ACRES_SCANNER_IMAGE` are removed in favour of
  snapshot ids. No hosted environment ever set them.
- Node comes from the managed `vercel/sandbox/node:24` image, not a pinned
  `node:24.21.0` binary. Record the observed patch version.

## Breakpoint behaviour

No UI change; 375, 800 and 1280 are unaffected. Upload status semantics are
unchanged.

## Non-goals

- No preview or production deployment. No project env changes. No
  `SCANNER_PROVIDER` set anywhere hosted (that belongs to the first preview
  deployment item).
- No VCR push and no paid usage of any kind.
- No automated rebuild (recorded as a blocker). No Cron. No GitHub workflow.
- No change to clamd, the Compose scanner or `UPLOAD_MAX_BYTES`. No change to
  `--max-scansize`: the archive-expansion residual stays recorded.
- No drives. No persistent scan sandboxes. No egress for scan sandboxes.
- No committed EICAR, `.deb`, CVD, token, claims or `scanner.env`.

## Verification (quote real output, Node 24, sequential)

```bash
npm run vercel:probe-test        # includes the build-script spec
npm run lint
npm run typecheck
npm run build
npm run test --workspace=@acres/server -- --runInBand
npm run test:e2e --workspace=@acres/server -- --runInBand --testTimeout=30000
npm run contracts:check   # no drift expected
npm run ops:check
git diff --check
```

Also quote: the build summary JSON, both probe summary JSONs, the residue
listing, and a check that the built scanner module still loads no SDK modules
(`node -e "require('./server/dist/scanner/scanner.module.js'); …"`). If a
check fails for an environment reason (DB starting, network), say so and
rerun. Never record an environment failure as a pass. The client e2e suite is
not required (no client change); say that it was not run.

Then use `requesting-code-review` (BASE `8502b93`, HEAD, the diff, the check
output and the hosted summaries), evaluate the findings with
`receiving-code-review`, fix the valid ones, and re-review if the adapter
cleanup or identity check changes shape. Commit locally on `main` with
`caveman-commit`. Suggested split: (1) build script + probe + tests; (2)
adapter/config switch + tests; (3) docs record. Stage only task files. Do not
push.

## Rollback

`git revert` the commits. `SCANNER_PROVIDER` defaults to `clamav`, so nothing
changes unless it is set. To remove the hosted artifact, delete the scanner
snapshot by its recorded id (`Snapshot.get(...).delete()` or the CLI
equivalent), and only on the user's request. The probes and build leave no
sandbox, and the residue check proves it.

## Completion statement to give the user

Report:

- the $0 basis;
- the deb pin and signature status;
- the snapshot id, size and expiry, and the CVD hashes and build times;
- each hosted case's result, including `baseSnapshotSurvived` and the three
  observed shapes;
- the residue check and the usage consumed;
- whether the checklist item is ticked.

Name the open blockers: the rebuild cadence (Cron waits on the production
decision), app-level scanning through a deployed preview, the 50 MiB cap and
the archive-expansion residual. Do not call it production scanner acceptance.
