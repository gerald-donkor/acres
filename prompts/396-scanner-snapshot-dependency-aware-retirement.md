# Prompt 396 — scanner snapshot retirement, dependency-aware (tier 1)

## Scope and why this is next

Parent: Phase 12 managed-target operations, continuing approved Prompt 370.
Inspected baseline: `eadc35d` on `main` (`docs(ops): record scanner refresh
395`), worktree clean when this prompt was prepared (2026-10-19 ~09:45Z).
This file proves nothing on its own; resolve state from the repository and
`git log`.

`docs/vercel-deployment.md` "Resume here" → scanner bullet → "Next (own
prompts)" lists, in order:

1. the next refresh before the Prompt 395 bound (`≤ ~2026-10-21T09:02Z`);
2. the dependency-aware retirement of superseded snapshots (six retained);
3. the owner's decision on the nine leaky previews (owner only, not a
   prompt).

Item 1 cannot usefully run before about **`2026-10-19T21:00Z`**: Prompt 395
fetched a new `daily.cvd` at ~09:00Z today, and a rebuild sooner risks the
same file and no extension (a judgement recorded in Prompt 395). Item 2 can
run now and does not depend on item 1. On 2026-10-19 ~09:45Z the user chose
**item 2 for Prompt 396**; refresh 3 gets its own prompt after ~21:00Z.

This prompt does two things:

- **A. Local tooling.** A small, tested, guarded CLI,
  `scripts/vercel/retire-scanner-snapshots.js` (`npm run
vercel:scanner-retire`), that plans by default and deletes only exact,
  listed snapshot IDs after dependency checks. Retirement recurs with every
  refresh (each one supersedes a snapshot), so an ad hoc script would be
  rewritten every two days; the rebuild CLI deliberately never deletes
  (runbook §5), and `build-scanner-snapshot.js --replace` deletes without any
  dependency check, so neither fits.
- **B. One bounded live retirement (tier 1)** on the fixed preview target:
  delete exactly the three superseded snapshots that nothing can still use
  successfully, keep the other three, and measure what retirement does to
  Hobby's Snapshot Storage allowance.

### The six retained snapshots and their dependencies

Recorded values, all from `docs/vercel-deployment.md`; §B step 3 re-reads
every one from the provider before anything is deleted.

| snapshot                            | origin                                                                     | recorded dependents                                             | signature window                                                        | decision            |
| ----------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------- |
| `snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA` | Prompt 373 baseline; preview config until Prompt 391 (`daily` `af003f6e…`) | `dpl_Hr9VwjL5…` and the other pre-391 previews                  | closed days ago; every scan from those deployments already fails closed | **retire**          |
| `snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y` | Prompt 386 candidate, `candidate_build_failed`, null hashes                | none; receipt ineligible for handoff                            | none                                                                    | **retire**          |
| `snap_KtLdaJeG4SaLAwi4mI8G8XzURZat` | Prompt 389 stage C, failed smoke, never adopted                            | none                                                            | none                                                                    | **retire**          |
| `snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN` | adopted Prompt 391                                                         | `dpl_2aajXYcF…`, `dpl_1S2xiZKz…` (Prompt 393)                   | open until no later than ~`2026-10-20T01:00Z`                           | **keep** (tier 2)   |
| `snap_ngIwnQplocPoUR0A6cewfCGrFAbX` | adopted Prompt 394                                                         | `dpl_A5H3fnpS…`; Prompt 395's rollback (`previous-scanner.env`) | open until no later than ~`2026-10-20T16:01Z`                           | **keep** (rollback) |
| `snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf` | adopted Prompt 395, **active**                                             | `dpl_AtJLkmoy…`                                                 | open until no later than ~`2026-10-21T09:02Z`                           | **keep** (active)   |

**Why the tier-1 set is safe.** The server adapter
(`server/src/scanner/vercel-sandbox-scanner.adapter.ts`, `scanBuffer`) turns a
`Sandbox.create` failure into `{ status: 'failed', errorCode:
'scanner_unavailable' }` (lines ~108–117, checked while preparing). So a
deployment pinned to a deleted snapshot still fails closed; only its error
code changes, from a signature-age failure to `scanner_unavailable`. Feg5's
dependents already fail closed on signature age, and rz0cs/KtLd were never
configured anywhere. No upload that would otherwise be marked `clean` can be
affected.

**Why CARv and ngIw stay (tier 2, deferred).** Their dependents can still
scan successfully today, and ngIw is the documented rollback for the active
configuration. Both lose all value once their windows close (~01:00Z and
~16:01Z tomorrow). They are retired in a later prompt, most naturally
together with refresh 3, using the tool built here. They also expire on
their own (8 days after last use: CARv ~2026-10-26T01:44Z, ngIw
~2026-10-26T16:14Z), so deferring costs at most a few days of storage.

**A doc defect to resolve, not to act on.** The "First preview deployment"
bullet and the Prompt 378 lines (~1803, ~1840) name a snapshot
`snap_d2y7r2n9`, which matches no recorded build. §B step 3 checks whether
any listed snapshot carries that ID. If none does, correct those lines (§10
rule 8) to say the recorded ID is unverified and the baseline in use was
`snap_Feg5…`; do not invent a replacement history.

### What retirement should tell us about the free tier

The [Sandbox pricing page](https://vercel.com/docs/sandbox/pricing) (re-read
2026-10-19, `last_updated: 2026-09-10`) gives Hobby **"Snapshot Storage 15
GB (lifetime)"**, describes the metric as "storage used by snapshots,
measured in GB per month", and does not define "(lifetime)" or say whether
deleting a snapshot returns allowance. On Hobby, exceeding a quota pauses
**sandbox creation**, which would stop both refreshes and scans. Two
readings:

- **current storage**: the dashboard figure falls by about the deleted bytes;
  steady state is ~3–4 snapshots × ~0.46 GB, far inside 15 GB;
- **cumulative**: the figure does not fall; every refresh permanently spends
  ~0.46 GB, so roughly 26 more refreshes (~52 days at the two-day cadence)
  remain before creation pauses. That changes the cadence plan and must be
  recorded as a launch-relevant finding.

The last owner reading was **921.88 MB / 15 GB** with two snapshots
(Prompt 389 stage B), equal to the then-current listing (921,876,890 B),
which cannot tell the two readings apart because nothing had been deleted.
This run can, so the owner's before/after readings are part of acceptance.

### Approval of this prompt authorizes

On the fixed free-tier preview target only (team
`team_zE3mp7nrEZ6a7cxRavwUMYC4`, project `prj_q9ApajZWDgdYZetnm5s5oakEjrUD`,
`iad1`):

- the local tooling, tests and docs in §A and §C;
- at most one `vercel env pull --environment=preview --yes` into a **new**
  file in the run directory (Prompt 394 gotcha: pulling into an existing file
  keeps stale lines), to obtain a fresh OIDC token;
- read-only provider inspection: `Snapshot.get` by exact ID,
  `Snapshot.list`, `Sandbox.list`, deployment listing/inspect;
- **exactly one** `--confirm` run of the new CLI deleting **exactly**
  `snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA`, `snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y`
  and `snap_KtLdaJeG4SaLAwi4mI8G8XzURZat`, run by the agent, or by the owner
  through a prepared `retire.sh` if the auto-mode classifier refuses the
  agent's call (as it refused env writes in Prompt 391);
- the documentation record, the memory update and the local commit.

It does **not** authorize:

- deleting `snap_CARv…`, `snap_ngIw…` or `snap_KBaj…`, or any ID not in the
  tier-1 list, whatever the listing shows; an unexpected extra snapshot is
  reported, not deleted;
- a second `--confirm` run or any retry after a failed delete;
- a rebuild, a scan, a seam probe, an env write, a deployment, or deleting
  any deployment (the nine leaky previews stay with the owner);
- changing `build-scanner-snapshot.js`, `rebuild-scanner-cadence.js`, the
  adapter, the 8-day `SNAPSHOT_EXPIRATION_MS`, or the GitHub workflow;
- production, promotion, alias, domain, plan or paid-usage changes;
- Chrome automation or a push.

## Reference material read

- `AGENTS.md` §§2, 3, 5–7, 10; memory `vercel-migration-resume` (Node 24
  launcher, cached CLI path `~/.npm/_npx/*/node_modules/vercel/dist/vc.js`,
  zsh word-splitting, OIDC/Sandbox gotchas, classifier refusals, pull into a
  fresh file then `mv`, Bash safety check blocks `rm` inside `bash -c`).
- `docs/vercel-deployment.md`: "Resume here" (fixed target, access steps
  1–3, scanner proof commands), the scanner bullet, the Prompt 389 stage B
  storage reading (~line 2203), the Prompt 373 $0 basis (~lines 612, 756) and
  the Prompt 395 record (~lines 2590–2680).
- `infra/vercel/runbooks/managed-operations.md` §5 (rebuild CLI never
  deletes) and §5.5 step 4 ("Retain old snapshots while old deployments,
  queued/in-flight invocations or rollback dependencies can use them … needs
  account-bound inspection, dependency review and an explicit bounded
  cleanup/resource-budget plan outside this CLI").
- `prompts/395-scanner-refresh-two-rebuild-and-preview-adoption.md` (approval
  shape, custody conventions).
- Source checked while preparing:
  - `scripts/vercel/probe-platform.js`: `sandboxTarget(env, {
minRemainingMs })` (requires `ACRES_VERCEL_PROBE=isolated-synthetic-preview`,
    `VERCEL_ENV=preview`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`,
    `ACRES_VERCEL_PROBE_REGION`; checks OIDC `project_id`/`owner_id` claims
    and expiry; default 30 min remaining), `credentialsFor(config)` →
    `{ token, teamId, projectId }`, `SNAPSHOT_ID = /^snap_[A-Za-z0-9]+$/`.
  - `scripts/vercel/build-scanner-snapshot.js`: `replaceSnapshot` (the
    get → `delete({ signal })` → get-again, `status === "deleted"` or 404
    confirmation pattern), `assertOutsideRepo(file)`,
    `CONTROL_TIMEOUT_MS = 30_000` (local, not exported), `main(args, env,
sdk)` loading the SDK with `createRequire(server/package.json)`.
  - `scripts/vercel/rebuild-scanner-cadence.js`: CLI help/`parseArgs`
    style, `writeReceipt`, JSON receipt on stdout.
  - Installed `@vercel/sandbox` **3.8.0** (`dist/snapshot.d.ts`,
    `dist/sandbox.d.ts`, `dist/api-client/api-client.d.ts`):
    - `Snapshot.get({ snapshotId, ...credentials, signal })` → `Snapshot`
      with `snapshotId`, `status` (`"failed" | "created" | "deleted"`),
      `sizeBytes`, `regions`, `createdAt`, `expiresAt?`;
    - `snapshot.delete({ signal })` → `Promise<void>`;
    - `Snapshot.list({ projectId, limit?, cursor?, sortOrder?, ...credentials,
signal })` → async-iterable `Paginator` with `.toArray()`; each item has
      `id`, `status`, `sizeBytes`, `region`, `regions?`, `createdAt`,
      `expiresAt?`, `lastUsedAt?`, `creationMethod?`, **`parentId?`**;
    - `Sandbox.list(...)` → items with `name`, `status` (`"pending" |
"running" | "stopping" | "stopped" | "failed" | "aborted" |
"snapshotting"`), `region?`; **no source-snapshot field**, so in-use
      cannot be tied to a snapshot from the listing.
  - `server/src/scanner/vercel-sandbox-scanner.adapter.ts` `scanBuffer`
    (create failure → `scanner_unavailable`, fail closed).
- Custody listing (names only): `~/.config/acres/vercel-preview/` holds
  `preview.env`, `scanner.env`, `neon-*.env` and `prompt386…`–`prompt395…`
  run directories. Never modify earlier run directories.

No visual change, comp crop or measurement is involved, so the design-prompt
headings (reference deltas, breakpoint behaviour) do not apply.

## SKILLS USED

- `vercel:vercel-sandbox` — `Snapshot.get`/`list`/`delete`, `Sandbox.list`,
  snapshot retention and expiry semantics against installed
  `@vercel/sandbox` 3.8.0.
- `vercel:vercel-cli` — verify `env pull` and deployment listing flags
  against the cached CLI before use.
- `vercel:env-vars` — fresh preview pull for the OIDC token; stale-line
  behaviour.
- `javascript-testing-patterns` — `node:test` spec with an SDK double for
  every refusal and the delete/confirm path.
- `error-handling-patterns` — fail-fast stop on the first failed delete,
  partial-progress receipt, no retry.
- `deployment-pipeline-design` — ordered gates (inspect → plan → owner
  reading → confirm → verify → owner reading) and what rollback means for an
  irreversible delete.
- `secrets-management` — restricted custody, OIDC token never printed, names
  only.
- `requesting-code-review` — dispatch the reviewer subagent before
  recording.
- `receiving-code-review` — evaluate its findings with technical rigour.
- `caveman-commit` — the commit message.

No skill covers Vercel Hobby allowance accounting; that question is answered
by the owner's dashboard readings, stated as owner-reported.

## A. Local tooling

### A1. `scripts/vercel/retire-scanner-snapshots.js` (new, CommonJS)

Match the neighbouring scripts: `"use strict"`-free CommonJS as in
`build-scanner-snapshot.js`, the same comment density, `module.exports` of
the testable pieces, `if (require.main === module)` entry.

Imports: `sandboxTarget`, `credentialsFor`, `SNAPSHOT_ID` from
`./probe-platform`; `assertOutsideRepo` from `./build-scanner-snapshot`.
Do not modify either module. Define `CONTROL_TIMEOUT_MS = 30_000` locally
(the builder's is not exported; same value, same meaning).

**CLI.**

```
npm run vercel:scanner-retire -- --keep <snap_id> [--keep <snap_id>…]
  --retire <snap_id> [--retire <snap_id>…] [--confirm] [--output <file>]
```

- `--help`/`-h`: usage, exit 0, no credentials needed.
- Without `--confirm`: **plan mode**, read-only; never calls `delete`.
- `--output <file>`: write the receipt there too; `assertOutsideRepo`, then
  exclusive create (`flag: "wx"`, `mode: 0o600`). Checked before any SDK
  call, so a bad path costs nothing.
- Unknown option, missing value, malformed ID (fails `SNAPSHOT_ID`),
  duplicate ID within or across lists, no `--keep`, no `--retire`, or more
  than **5** `--retire` IDs (a bound, a judgement: one run should never be a
  bulk sweep) → usage error, exit 2, no SDK call.

**Target.** `sandboxTarget(env)` with the default 30 min OIDC floor (the
run takes seconds; the 75 min build floor is not needed). Pass
`credentialsFor(config)` explicitly to every SDK call (memory: without it the
SDK refreshes a token for the cwd link).

**Inspection** (both modes, before any decision):

1. `Snapshot.list({ ...credentials, projectId: config.projectId, signal })`
   → `.toArray()` (verify `.toArray()` on the installed `Paginator` before
   relying on it; fall back to iterating pages if absent). Record every item
   as `{ id, status, size_bytes, region, expires_at, last_used_at, parent_id }`.
2. `Snapshot.get` for every `--keep` and `--retire` ID. A thrown error with
   `error?.response?.status === 404`, or `status === "deleted"`, means
   **absent**. Any other error → refuse (`lookup_failed`), never guess.
3. `Sandbox.list({ ...credentials, projectId: config.projectId, signal })` →
   count items whose `status` is `pending`, `running`, `stopping` or
   `snapshotting` (`active_sandboxes`). Verify the `projectId` parameter name
   in `listSandboxes` before use.

**Refusals** (exit 1, no deletes, every applicable reason listed with a fixed
code; never a raw provider message):

| code                | condition                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `active_not_kept`   | `env.SCANNER_SANDBOX_SNAPSHOT_ID` or `env.ACRES_SCANNER_SNAPSHOT_ID` is set and not in `--keep`     |
| `active_unknown`    | neither variable is set (the active ID must be named by the environment, not only by the operator)  |
| `active_disagrees`  | both are set and differ                                                                             |
| `keep_unhealthy`    | a `--keep` ID is absent, not `created`, lacks the target region, or its `expires_at` is in the past |
| `parent_dependency` | a listed snapshot that is not being retired has `parent_id` equal to a `--retire` ID                |
| `active_sandbox`    | `active_sandboxes > 0` (a scan or build may be booting; the listing cannot say from which snapshot) |
| `wrong_region`      | a present `--retire` target's `regions`/`region` does not include the target region                 |
| `lookup_failed`     | any inspection call failed other than a 404                                                         |

A `--retire` target that is already absent is **not** a refusal: it is
reported as `already_absent` and skipped.

**Confirm mode** (only when no refusal): delete the present targets
**sequentially, in the given order**. For each: `delete({ signal })`, then
`Snapshot.get` again; `deleted` status or 404 → `deleted`; anything else →
`unconfirmed`. On the first thrown delete or `unconfirmed`, **stop**: mark
the rest `not_attempted`, exit 1. No retry. Then re-run `Snapshot.list` for
the after-state.

**Receipt** (stdout, one JSON line; also `--output`):

```json
{
  "schema_version": 1,
  "mode": "plan | retire",
  "target": { "team_id": "...", "project_id": "...", "region": "iad1" },
  "started_at": "ISO",
  "finished_at": "ISO",
  "active_snapshot_id": "snap_…",
  "keep": [{ "id": "snap_…", "status": "created", "expires_at": "ISO" }],
  "retire": [
    {
      "id": "snap_…",
      "status_before": "created",
      "size_bytes": 0,
      "parent_id": null,
      "outcome": "planned | deleted | already_absent | unconfirmed | delete_failed | not_attempted"
    }
  ],
  "refusals": ["code", "..."],
  "active_sandboxes": 0,
  "storage": {
    "before": { "created_count": 0, "created_bytes": 0 },
    "after": { "created_count": 0, "created_bytes": 0 }
  },
  "unlisted_snapshots": ["snap_… (created, not in keep or retire)"],
  "result": "planned | retired | refused | partial"
}
```

`storage.after` is `null` in plan mode. `unlisted_snapshots` lists every
`created` snapshot in neither list, for the operator to account for; it never
triggers a delete. The token, the OIDC claims and env values other than the
two snapshot IDs never appear in the receipt or in errors (snapshot IDs and
sizes are not secrets).

Exit codes: 0 planned/retired, 1 refused/partial/failed, 2 usage.

### A2. `scripts/vercel/retire-scanner-snapshots.spec.js` (new, `node:test`)

An SDK double (`Snapshot.get/list`, instance `delete`, `Sandbox.list`) that
records calls. A fake target env with a fabricated, well-formed OIDC JWT
(copy how `build-scanner-snapshot.spec.js` or `probe-platform.spec.js` builds
one; check before writing). Cases, each asserting exit code, `result`,
`refusals` and the recorded calls:

1. `--help` exits 0 and makes no SDK call.
2. Usage errors (each → 2, no SDK call): no `--keep`; no `--retire`; bad ID;
   duplicate across lists; six `--retire` IDs; unknown flag; `--output`
   inside the repository.
3. Plan mode with a healthy inventory → `planned`, **zero `delete` calls**,
   correct `storage.before`.
4. Each refusal in the table above, individually, with zero deletes.
5. Confirm mode, three present targets → three deletes in order, each
   confirmed (one via `deleted` status, one via a 404 on re-get), `retired`,
   correct `storage.after`.
6. A target already absent (404 on first get) → `already_absent`, no delete
   for it, the others deleted.
7. Second delete throws → first `deleted`, second `delete_failed`, third
   `not_attempted`, `partial`, exit 1, no retry call.
8. Re-get after delete still `created` → `unconfirmed`, stop, `partial`.
9. A `--keep` ID listed as a `--retire` ID → usage error (duplicate), no SDK
   call.
10. The receipt and stderr never contain the token string.
11. `unlisted_snapshots` reports an extra `created` snapshot without
    deleting it.

### A3. Wiring

- `package.json` root `scripts`: add `"vercel:scanner-retire": "node
scripts/vercel/retire-scanner-snapshots.js"` beside
  `vercel:scanner-snapshot`, and append
  `scripts/vercel/retire-scanner-snapshots.spec.js` to `vercel:probe-test`.
- Confirm `.vercelignore` keeps `scripts/` out of deploy uploads (read it; it
  is an allowlist since Prompt 392). No change expected; if `scripts/vercel/`
  is uploaded, report it and do not change the allowlist in this prompt.
- `infra/vercel/README.md`: one short paragraph under the scanner section
  naming the command, plan-by-default, the refusals and the fact that it
  never chooses targets itself.
- `infra/vercel/runbooks/managed-operations.md` §5.5 step 4: keep the rule,
  then add the procedure: list dependents per snapshot (configuration
  history, deployments, rollback), retire only snapshots whose dependents
  already fail closed or which were never configured, plan first, then one
  `--confirm` run, then owner storage reading. State tier 1 (this prompt) and
  that CARv/ngIw are tier 2.

### A4. Local checks before any live step

Node 24.21.0 (launcher per memory; confirm `node --version` inside `npm
run`). Run and quote real output:

```bash
node --test scripts/vercel/retire-scanner-snapshots.spec.js
npm run vercel:probe-test
npm run lint
npm run typecheck
npx prettier --check scripts/vercel/retire-scanner-snapshots.js \
  scripts/vercel/retire-scanner-snapshots.spec.js package.json \
  infra/vercel/README.md infra/vercel/runbooks/managed-operations.md
npm run ops:scan-secrets
git diff --check
```

`npm run build` is not required (no workspace source changes); state that it
was skipped and why. `npm run ops:check` is long and touches nothing changed
here; run it only if time allows, and say which was done.

Then run the **requesting-code-review / receiving-code-review** loop on the
tooling diff (§2.1) **before** §B: the live delete is irreversible, so the
tool is reviewed before it touches anything. Fix valid findings, re-run A4.
Commit the tooling first as its own commit (caveman-commit, e.g.
`feat(ops): add guarded scanner snapshot retire CLI`), so the live run uses
committed code.

## B. Live tier-1 retirement

Run directory: `~/.config/acres/vercel-preview/prompt396-<UTCstamp>/`,
created 0700; every file inside 0600. Never print a token or env value; list
names only (`cut -d= -f1`).

1. **Re-establish access.** Cached CLI `whoami`; the linked project is
   `acres`. Pull preview env into a **new** file in the run directory
   (`vc env pull <run>/preview.env --environment=preview --yes`), then check
   names only: `VERCEL_OIDC_TOKEN`, `SCANNER_SANDBOX_SNAPSHOT_ID` present.
   Privately compare `SCANNER_SANDBOX_SNAPSHOT_ID` to
   `snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf` and to `scanner.env`'s
   `ACRES_SCANNER_SNAPSHOT_ID` (print only `match`/`mismatch`). On any
   mismatch, **stop**: the active configuration moved and the dependency
   table is stale.
2. **Dependency facts.** List the project's preview deployments (MCP
   `list_deployments` or CLI) and record, for the ones named in the table,
   their state and creation time. Record which deployments were created
   while each snapshot was configured (from the docs' adoption times:
   Feg5 until Prompt 391's adoption `2026-10-18` ~13:4xZ; CARv until Prompt
   394's; ngIw until Prompt 395's `09:04:22Z`). This is the dependency
   record; deployment metadata names variables, not values, so it remains an
   inference from write-before-create ordering, stated as such.
3. **Plan run** (read-only), sourcing `<run>/preview.env` and exporting
   `ACRES_VERCEL_PROBE=isolated-synthetic-preview VERCEL_ENV=preview
VERCEL_TEAM_ID=team_zE3mp7nrEZ6a7cxRavwUMYC4
VERCEL_PROJECT_ID=prj_q9ApajZWDgdYZetnm5s5oakEjrUD
ACRES_VERCEL_PROBE_REGION=iad1`, through `bash -c` (zsh does not
   word-split):

   ```bash
   npm run vercel:scanner-retire -- \
     --keep snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf \
     --keep snap_ngIwnQplocPoUR0A6cewfCGrFAbX \
     --keep snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN \
     --retire snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA \
     --retire snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y \
     --retire snap_KtLdaJeG4SaLAwi4mI8G8XzURZat \
     --output <run>/plan.json
   ```

   Proceed only if `result` is `planned`, `refusals` is empty,
   `active_sandboxes` is 0, every keep is `created`, no `parent_id` points
   at a target, and `unlisted_snapshots` is empty. If `unlisted_snapshots`
   is non-empty (including a `snap_d2y7r2n9`), record it and **stop before
   confirm**: an unaccounted snapshot means the dependency table is
   incomplete. Record whether `snap_d2y7r2n9` appears (expected: no → fix the
   doc lines named in Scope).

4. **Owner reading, before.** Ask the owner for the dashboard figure: Usage
   → Sandbox → **Snapshot Storage** (value and the period shown). Record it
   as owner-reported, with the time. Compare with `storage.before.created_bytes`.
5. **Confirm run.** The same command with `--confirm` and `--output
<run>/retire.json`, run once. If the classifier refuses the agent's call,
   write `<run>/retire.sh` (0700; sources the run's env file; runs exactly
   that command; prints only the receipt) and ask the owner to run it with
   `! bash <run>/retire.sh`. Never edit the target list between plan and
   confirm.
6. **Verify.** `result: "retired"`, three `deleted` outcomes,
   `storage.after.created_count` = before − 3, the three keeps still
   `created` with unchanged `expires_at` (deletion must not touch them).
   `Sandbox.list` empty. If `partial`, stop: record exactly what was deleted,
   no retry; the remaining targets carry to tier 2.
7. **Owner reading, after.** Ask for the same figure immediately after, and,
   if it did not move, once more no sooner than 60 min later (the dashboard
   may lag; the lag is unknown). Classify:
   - fell by ≈ the deleted bytes → **current storage**; record headroom;
   - unchanged after the second reading → **cumulative (provisional)**;
     record remaining allowance ≈ 15 GB − reading and refreshes left at
     ~0.46 GB each, flag it as launch-relevant;
   - anything else → **inconclusive**, recorded as observed.
     Never present the classification as a provider statement.

**Rollback.** None exists: a deleted snapshot cannot be restored. That is why
only targets with no successful dependent are in scope. If a dependent
deployment's scan were needed later, the remedy is the normal refresh path
(rebuild → adopt → deploy), not recovery.

## C. Record, review, commit

- `docs/vercel-deployment.md`:
  - "Resume here" header list: add "Prompt 396 = snapshot retirement tier 1".
  - Scanner bullet: retained count and set after this run, tier 2 (CARv,
    ngIw) pending, the next refresh still first, and the storage-semantics
    finding in one sentence.
  - New section "Scanner snapshot retirement — Prompt 396 (2026-10-19)":
    the dependency table as verified, plan and confirm receipts (IDs, sizes,
    outcomes, times), keeps' expiries, owner readings and the
    classification, the `snap_d2y7r2n9` result and the doc fix.
  - Fix the `snap_d2y7r2n9` lines if step 3 found no such snapshot.
- `docs/operations.md`: "Prompt 396 — scanner snapshot retirement
  (2026-10-19)" execution record with the real check output from A4.
- `docs/build-plan.md` and `docs/launch-checklist.md`: one short entry each,
  mirroring how Prompt 395 recorded itself there (read those entries first).
- `infra/vercel/runbooks/managed-operations.md` and `infra/vercel/README.md`
  per A3.
- Memory `vercel-migration-resume`: Prompt 396 line (tool name, tier-1
  result, keeps, storage classification, tier 2 pending), refresh 3 still
  next.
- If B changed more than recorded numbers, run the review loop again on the
  docs diff; otherwise the A4 review covers the code and the docs are checked
  by `prettier --check` and `git diff --check`.
- Commit the record (caveman-commit, e.g. `docs(ops): record snapshot
retirement 396`). Stage only the files named here. Do not push.

## Expected impact

- No route, UI, API or deployment changes. One new operator CLI and spec,
  one npm script, test-list wiring, runbook/README text.
- Preview provider state: three snapshots deleted (Feg5, rz0cs, KtLd), three
  retained (KBaj active, ngIw rollback, CARv). Stored snapshot bytes fall by
  about 1.38 GB (three × ~0.46 GB; the exact figure comes from the receipt).
- Deployments pinned to Feg5 change failure code from signature age to
  `scanner_unavailable`; they were already failing closed.

## Non-goals

- Tier 2 (CARv, ngIw): deferred until their windows close and a newer
  rollback exists; most naturally with refresh 3.
- Refresh 3: its own prompt after ~2026-10-19T21:00Z.
- Automatic retirement in the rebuild/cadence CLI or the workflow: the
  runbook keeps preparation and retirement separate; a hosted cadence is a
  separate open item.
- Changing snapshot expiry (8 days) or Vercel's 30-day default.
- The nine leaky previews, production, the plan decision and the eleven
  sign-offs.

## Stop conditions (report, do not route around)

- Active-ID mismatch in B1; any refusal, active sandbox, parent dependency or
  unlisted snapshot in B3.
- Classifier refusal of the owner path as well, or owner unavailable for the
  readings: complete the deletion only if the before-reading exists;
  otherwise stop after the plan run (the storage question is half the value
  of this run).
- A `partial` result in B6.
- Any check in A4 failing after fixes.
