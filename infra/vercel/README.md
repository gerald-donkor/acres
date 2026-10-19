# Managed migration prerequisites

Prompt 370 remains in progress. See [the migration record](../../docs/vercel-deployment.md).
There is deliberately no active Vercel routing/profile config before account
inspection and hosted seam proofs. Do not deploy the existing BullMQ/timer
application as if it were invocation-safe.

## Platform probes

The Queues layout/delivery probe is a separately deployed synthetic project
root: see [probes/queues](probes/queues/README.md).

Run `npm run vercel:probe -- --help` without credentials. `@vercel/blob` (since Prompt 371) and `@vercel/sandbox` (since Prompt 372, loaded lazily by the `vercel-sandbox` scanner adapter only) are server runtime dependencies; these probes are not bundled into serving code. Local behavior tests:
`npm run vercel:probe-test`. These tests use doubles and approve no hosted gate.

After selecting an isolated synthetic-only preview and permitted resource use
through Vercel MCP, inject these values through a restricted environment (never
paste keys into chat, source, shell history or documentation):

| Variable                                                  | Purpose                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `ACRES_VERCEL_PROBE=isolated-synthetic-preview`           | Explicit opt-in; does not establish target identity or permission by itself           |
| `VERCEL_ENV=preview`                                      | Reject accidental production invocation                                               |
| `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`                     | Selected account identities; resolve and check them through MCP first                 |
| `BLOB_READ_WRITE_TOKEN`                                   | Only for `blob`/`blob-browser`: token for the selected isolated private store         |
| `VERCEL_OIDC_TOKEN` or `VERCEL_TOKEN`                     | `scanner*` modes and the snapshot build: OIDC preferred (see below)                   |
| `ACRES_VERCEL_PROBE_REGION`                               | `scanner*` modes only: explicit Vercel region (no implicit `iad1` fallback)           |
| `ACRES_SCANNER_SNAPSHOT_ID`                               | `scanner*` modes only: the scanner snapshot (`snap_…`) printed by the build           |
| `ACRES_SCANNER_MAIN_SHA256`, `ACRES_SCANNER_DAILY_SHA256` | Digests of `/var/lib/clamav/main.cvd` and `daily.cvd` in that snapshot                |
| `ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS`                   | Adopted freshness threshold, integer 1–168; probe bound, no default production policy |

`npm run vercel:probe -- blob` uploads a fresh random-path **5 MiB** synthetic
object, rejects unexpected non-private origins, checks anonymous read denial,
reads privately without cache, compares actual SHA-256/size and deletes exactly
that path in `finally`. Cleanup has a separate timeout. Success is only a
**server SDK** proof: scoped browser tokens, large direct browser upload,
callback provenance, tenant authorization, cancellation and download revocation
still need real application acceptance. A failed put can leave ambiguous remote
state; inspect only the test store if cleanup fails. No broad listing/deletion.

`npm run vercel:probe -- blob-browser` proves the presigned protocol the
`vercel-blob` storage adapter uses, from a real browser. It needs the same
inputs as `blob`, plus the client workspace's Playwright Chromium. It serves a
blank page on an ephemeral `127.0.0.1` port, so every request is cross-origin.
The page generates a seeded **12 MiB** payload (above the 4.5 MB function body
limit) and PUTs it to a URL from `issueSignedToken` + `presignUrl`, sending
only `content-type`. The probe then checks:

- server `head`/`get` size, type and SHA-256;
- refusal of an overwrite replay, a wrong type on an extensionless key, one
  byte over the signed size, a swapped `pathname` and an expired URL; each
  refusal also confirms on the server that nothing was written;
- anonymous denial of the plain private URL;
- a signed browser GET (bytes, type and disposition shape);
- that a read token cannot presign another path;
- a 404 from a still-valid GET URL after deletion.

Two diagnostics without a gate record that a `.csv` extension overrides a wrong
`content-type`, and that a wrong `x-content-type` is refused. Every pathname
lives under `acres-probes/<run>/` and is deleted in `finally`. The summary JSON
carries statuses, booleans and header _shapes_ only, never a URL, token or
signature. Exit code 1 means a gate case failed. This proves the storage seam,
not application acceptance through a deployed preview.

**Authentication.** With `VERCEL_OIDC_TOKEN` set (`npx vercel@latest env pull
~/.config/acres/vercel-preview/preview.env --environment=preview --yes`, valid
about 12 hours), the scripts first decode the token's payload, without
verifying it, and require its `project_id` and `owner_id` claims to equal
`VERCEL_PROJECT_ID` and `VERCEL_TEAM_ID` and at least 30 minutes left before
`exp`. They then pass that token explicitly as `token`/`teamId`/`projectId`.
Passed nothing, the SDK would refresh an expiring token for the working
directory's `.vercel` link (`@vercel/oidc` `findProjectInfo`), not for the
checked project. The token and its claims are never printed. OIDC wins when
both are set; `VERCEL_TOKEN` is the fallback, passed the same way.

**Scanner snapshot build.** `npm run vercel:scanner-snapshot -- --write-env
~/.config/acres/vercel-preview/scanner.env` (same opt-in, target, region and
auth variables) boots one `vercel/sandbox/node:24` builder with two vCPUs, a
15-minute lifetime, `persistent: false` and egress limited to `github.com`,
`release-assets.githubusercontent.com` and `database.clamav.net`. In the VM it:

1. downloads the official `clamav-1.5.4.linux.x86_64.deb` with Node's
   `fetch` and installs it with `dpkg` only if its SHA-256 equals the pinned
   GitHub release digest;
2. fetches whole CVDs with `freshclam` into `/var/lib/clamav`, using
   [scanner/freshclam.conf](scanner/freshclam.conf) read from the repository,
   with the same checks as the Dockerfile;
3. records the OS, Node and ClamAV versions and each CVD's hash, version and
   build time;
4. runs the scan sandbox's own signature check, clean and EICAR scans as the
   default user, then deletes `/tmp/acres-scan` and `/tmp/acres-build` and
   checks they are gone;
5. sets the builder's policy to `deny-all`, snapshots it with an 8-day
   expiry (longer than the 168-hour age ceiling), and deletes the builder with
   `deleteOrphanSnapshots: false` (`true` would delete the scanner).

Build failures emit only fixed diagnostic fields: `step`, `kind`,
`builder_cleanup` and `snapshot_confirmed`. Raw command/provider errors are never
printed. The cadence wrapper adds these as `build_failure` only to failed
build-stage receipts; failed receipts cannot be adopted. See
[managed operations §5](runbooks/managed-operations.md#5-clamav-scanner-sandbox-snapshot-rebuild).

Every step needs exit 0 **and** a marker line. A failed step aborts before the
snapshot and still deletes the builder. The summary JSON (snapshot id, size,
expiry, versions, hashes, build times) goes to stdout. `--write-env <path>`
writes `ACRES_SCANNER_SNAPSHOT_ID` and the two hashes to a 0600 file and
refuses any path inside the repository or through a symlink. `--replace
<snap_id>` deletes that one old snapshot after the new one reports `created`
**and** its summary and env file are saved, so a failed replace loses nothing;
nothing is ever deleted by listing. Deleting a snapshot that a deployment's
`SCANNER_SANDBOX_SNAPSHOT_ID` still names makes every scan there fail closed
(`scanner_unavailable`) until the variable is updated and redeployed. For a
live deployment, build **without** `--replace`, switch the variables and
redeploy, then delete the old one (`npx vercel@latest sandbox snapshots delete
<snap_id>`). `--persistent-builder` is the
documented fallback if `snapshot()` refuses a non-persistent sandbox.

`npm run vercel:probe -- scanner` needs that snapshot: `node`, `sigtool`,
`clamscan` and the two checksum-bound CVD files. It creates **one** Sandbox
from it with `persistent: false`, `deny-all` egress, one vCPU and a
120-second lifetime, and checks that the SDK's `sandbox.sourceSnapshotId` is
the configured id. A first command records
the VM's uid and whether it can read `/var/lib/clamav/daily.cvd` and write
`/tmp/acres-scan`. The signature check (identical to the server's
`sandbox-signature-check.ts`) verifies both hashes, non-future build dates and
daily freshness, and must print its `signatures-ok` marker. Synthetic clean and
EICAR files under `/tmp/acres-scan/` are scanned with the adapter's exact
flags; clean needs exit 0 **and** the file's `OK` line, EICAR exit 1 **and** a
`FOUND` line, because SDK 3.8.0 reports a missing exit code as 0.

`npm run vercel:probe -- scanner-failures` runs nine cases, each in its own
short-lived Sandbox with the same settings, and passes each only on its
expected fail-closed result: a wrong `main.cvd` hash (exit 2); an empty
database directory, so the real one is untouched (non-zero exit); a 0.001-hour age
(exit 3); egress to `database.clamav.net` (the script's fetch-failed exit 7);
a 3-second command `timeoutMs` (must reject or exit non-zero after 2.5–10 s); a
15-second session (`sleep 60` must reject or exit non-zero after 8–40 s;
hosted, it resolves with exit 143; the lower bounds stop an
instant unrelated rejection from passing); a 7 MiB file under 6M limits, which reads `OK` without
`--alert-exceeds-max=yes` and must report `Heuristics.Limits.Exceeded` with a
non-zero exit with it (ClamAV 1.5.4 exits **2** there, measured locally); a
malformed ZIP (any completed exit); and a memory measurement. The two modes
together create at most **ten** Sandboxes. Exit code 1 means a case failed.

Both modes end with one more gate, `baseSnapshotSurvived`: 30 seconds after
the last scan sandbox is deleted (orphan deletion is asynchronous),
`Snapshot.get` must still report the scanner snapshot `created`. Three
diagnostics never affect a result: the raw `exitCode` of a killed command
(`command-timeout`); the session-end error's type, HTTP status and stream
code, plus the sandbox's session count, because `runCommand` resumes a
stopped session (`session-timeout`; `listSessions` is not resume-wrapped);
and whether `writeFiles` creates a missing parent directory (`size-limit`).

Cleanup is `stop()` then `delete({ deleteOrphanSnapshots: true })`, each with a
30-second timeout. Sandboxes are persistent by default and snapshot on stop, so
stop alone would keep scanned bytes in a snapshot for 30 days. A stop or delete
error is failure, never success; only the session-timeout case tolerates a stop
error after its session ended, and only when delete succeeds. Sandbox names are
printed to stderr so an operator can confirm no residue; they are not secrets.
No daemon, package install, signature download, broad secret or customer data
is passed. No old-signature fallback. Main signatures may be older than daily;
both hashes and non-future build dates must verify.

The scripts suppress SDK exceptions, command output, tokens, URLs and signatures
other than a `FOUND` name from public console output. Inspect failure details
through the restricted provider console. Creation-response loss is bounded by
the requested Sandbox lifetime and requires provider inspection. Neither mode is
production scanner acceptance: that needs an app upload scanned through a
deployed preview. No browser, RLS, queue delivery, launch or deployment claim is
emitted by any probe.

## Environment ownership and activation

Keep preview and production projects/bindings, database branches/roles, Blob
stores, topics, scanner sources, mail senders and evidence separate. Provision
Neon and Resend through the selected Vercel Marketplace scope. API/worker runtime
must never receive direct migration/owner credentials. Keep keys server-only;
no `NEXT_PUBLIC_` secret. Select plan/region/spend and verify actual project
identity before any resource creation. A connector authorizes inspection; it
does not prove launch policy adoption.

The optional local Resend transport uses `MAIL_TRANSPORT=resend`, a verified
explicit `MAIL_FROM` and server-only `RESEND_API_KEY`. A fixed HTTPS endpoint,
10-second request timeout and generic error prevent provider error leakage.
SMTP/memory remain defaults. No real mail test until an operator-owned test
address is designated. Do not infer production delivery from adapter tests.

Managed storage, queues, scanning, profile selection, protected Cron, distributed
throttling, service ingress, versioned managed launch evidence and recovery are
still required before activating a Vercel deployment. Preserve reference Compose
checks with their original meaning. Review source/runtime/job compatibility,
first-deployment disable/recovery and all eleven categories before promotion.

## Candidate cadence safety — Prompt 384

`npm run vercel:scanner-rebuild -- --help` and `--dry-run` require no credentials
or SDK calls. Simulation never writes scanner configuration. Live preparation
builds/smoke-tests a retained candidate and optionally creates a **new** outside-repo
0600 env file; it never activates or deletes snapshots. `--skip-prune` is a
deprecated no-op. Existing env/receipt files and symlinks are rejected, including
colliding paths, before cloud work. Parent directories must exist. Use fresh
per-run filenames, then preserve restricted configuration for manual handoff.

Scheduled/default manual workflow runs simulate; only explicit manual
`prepare_candidate: true` runs live against the documented Acres preview target
in iad1. `force` alone cannot enable live execution. The sanitized summary retains
candidate ID/hashes before local cleanup, but does not persist runtime adoption.
See [managed operations §5](runbooks/managed-operations.md#5-clamav-scanner-sandbox-snapshot-rebuild)
for separate activation, application verification and retirement requirements.
The standalone builder's destructive `--replace` warning above still applies.
Snapshot age is not CVD freshness; receipt reason `snapshot_recent` supersedes
`signatures_fresh`. No hosted freshness, zero downtime or launch claim follows.

## Offline runtime handoff — Prompt 385

`node scripts/vercel/prepare-scanner-handoff.js --help` describes the offline
receipt-to-bundle interface. Supply `--receipt <file>` and `--output-dir <new
outside-repo directory>` under an existing writable parent on Linux with procfs.
Use operator-selected durable restricted storage; `/tmp` is an inspection fixture.
The new directory is 0700 and its `runtime.env` and `handoff.json` are 0600.
Only successful live v1 cadence receipts bound to the fixed Acres preview
team/project/iad1 target with passing clean/EICAR/cleanup are accepted. Simulation
has a null target. Legacy receipts are rejected without an override.

Probe/builder `ACRES_SCANNER_*` exports remain unchanged. The runtime bundle uses
exactly `SCANNER_SANDBOX_SNAPSHOT_ID`, `SCANNER_MAIN_SHA256` and
`SCANNER_DAILY_SHA256`; it adds no credentials, provider or freshness defaults.
The allowlisted manifest binds original receipt and runtime bytes by SHA-256.
It is consistency evidence from operator input, not authentication, provider
attestation or deployed identity. All activation/verification/retirement statuses
remain `not_performed`. Failed output is retained as incomplete for inspection;
retry into a new directory. No SDK or network operation occurs. The workflow
remains unchanged and does not persist this bundle. See [the handoff and later
activation procedure](runbooks/managed-operations.md#54-offline-runtime-configuration-handoff),
including separate previous-configuration retention for rollback.

## Snapshot retirement — Prompt 396

`npm run vercel:scanner-retire -- --keep <snap_id>… --retire <snap_id>…`
(same opt-in, target and region as the snapshot build) plans by default and
deletes only with `--confirm`. It never chooses targets: the operator names
every retained snapshot with `--keep` and at most five targets with
`--retire`. The active snapshot is read from `SCANNER_SANDBOX_SNAPSHOT_ID` or
`ACRES_SCANNER_SNAPSHOT_ID`; at least one must be set, both must agree if both
are, and it must be a `--keep`. It refuses, with no delete, on an unhealthy
keep, an ID missing from the project's snapshot listing (get and delete are
team-scoped), a snapshot derived from a target, a sandbox whose current
snapshot is a target, any active sandbox, a target in another region or any
failed lookup. Deletes run in order, each confirmed by a re-read. The first
failure stops the run; the tool never retries, though the SDK transport may
retry a 5xx, so a delete that lands and then errors is recorded as
`deleted_after_error`. `--output` takes a new outside-repo file (0600). The
one-line JSON receipt reports `unlisted_snapshots`, created bytes before and
after, and the keeps' after-state. See
[managed operations §5.5](runbooks/managed-operations.md#55-manual-activation-verification-and-retirement).
