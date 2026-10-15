# Prompt 372 — Vercel Sandbox scanner image (Prompt 370, checklist item 3)

## Scope and why this is next

Planning baseline: `c544da6` on `main` (clean tree).

Prompt 370 (Vercel-managed migration) is approved and still executing. The
"Resume here" checklist in `docs/vercel-deployment.md` lists, in order:
Queues consumer `[x]`; Blob browser upload `[ ]` (local work done in
Prompt 371, it only waits for the first preview deployment); **Scanner image
`[ ]`**; first preview deployment; production decision. The scanner item is
the earliest one with work that can be done now, and the first preview
deployment depends on it (the upload pipeline can't accept a file unless a
scanner is wired). The user entered `i`. This prompt is that item split out
of Prompt 370. It inherits 370's target, non-goals and authorization limits.
It does not replace 370.

The item, quoted from the checklist: "build and push a pinned VCR ClamAV
image with checksum-bound `main.cvd`/`daily.cvd`, then run the scanner probe
… plus the live failure cases (`vercel:vercel-sandbox`). Hobby: 45-minute
sessions, 5 CPU-hours/month."

This prompt delivers four things:

1. a reproducible, digest-pinned scanner image definition in the repository;
2. that image pushed to the `acres` project's Vercel Container Registry (VCR),
   behind a cost gate;
3. the existing scanner probe fixed (see the defect below) and extended with
   the live failure cases, then run against the pushed image;
4. a `vercel-sandbox` scanner adapter behind a new `SCANNER_PROVIDER`
   selection, built locally with unit tests and not yet deployed. This is
   the same shape as Prompt 371's Blob adapter.

### Defect found while planning: the probe would keep EICAR in a snapshot

`scripts/vercel/probe-platform.js` (`probeScanner`, around line 675) calls
`Sandbox.create({ … })` without `persistent`, and cleans up with
`sandbox.stop()` only. In `@vercel/sandbox` **3.8.0**, persistence is the
default. The Persistence page (last updated 2026-09-15) says: "**Persistence
is the default.** Every sandbox created with `Sandbox.create()` … is
persistent unless you explicitly opt out", and on stop the filesystem is
"automatically snapshotted". Snapshots default to a 30-day expiry and are
billed as Snapshot Storage. Deleting a sandbox does not delete its
snapshots unless `delete({ deleteOrphanSnapshots: true })` is passed
(`node_modules/@vercel/sandbox/dist/sandbox.d.ts`, `delete(opts?: {
deleteOrphanSnapshots?: boolean; … })`).

The probe was never run, so nothing leaked. If it had run, it would have kept
the EICAR file in a snapshot for 30 days. In production the same pattern
would keep uploaded **quarantined customer bytes** in snapshots. Fix it in
both the probe and the adapter: create with `persistent: false`, then in
`finally` call `stop()` and then `delete({ deleteOrphanSnapshots: true })`,
each with its own timeout. A cleanup error is a failure.

### Design decisions

**Base image: `clamav/clamav-debian` `1.5.4_base-debian13-slim`, pinned by
index digest.** Facts checked on 2026-10-15 from the Docker Hub tag API:
`1.5.4` is the current stable patch (`stable`/`latest` were updated
2026-10-12). The `_base` variant ships **no** signature databases (amd64
≈80 MB compressed). Debian rather than the default Alpine `clamav/clamav`:
the SDK runs `sh`, `bash` and `mkdir` inside the VM
(`dist/sandbox.js`, `dist/filesystem.js`, `dist/sandbox-user.js`), and the
Node binary we add needs glibc. The ClamAV Docker docs
(https://docs.clamav.net/manual/Installing/Docker.html) say signatures live
in `/var/lib/clamav` and that `_base` is meant for a mounted volume. Here the
image itself acts as that volume: signatures are added at build time.

**Node binary from `node:24.21.0-trixie-slim`, pinned by digest**, copied in
with a multi-stage `COPY` of `/usr/local/bin/node` only. `.node-version`
pins 24.21.0, and Debian 13 (trixie) matches the base. The probe's signature
check, and the adapter's, run `node -e`.

**Signatures fetched at build time with `freshclam`, with `ScriptedUpdates
no`**, so whole `main.cvd`, `daily.cvd` and `bytecode.cvd` files are
written, never `.cld` patches. The probe and adapter hash exactly those
files. Runtime network is `deny-all`: there is no signature download at scan
time and no fallback to old signatures. Freshness is enforced at every scan
against an adopted maximum age. A stale image therefore **fails closed**:
uploads stay `failed`/`scanner_unavailable` until the image is rebuilt.
Automating the rebuild is a non-goal here (see Non-goals) and is recorded as
a production blocker.

**The Sandbox user and file paths are verified, not assumed.** The skill
says managed images run commands as `ubuntu`. A custom Debian image's user is
not documented. Step 3's first command records `id` and checks read access
to `/var/lib/clamav` and write access to `/tmp`. The Dockerfile makes
`/var/lib/clamav` world-readable (`a+rX`), so the result doesn't depend on
which user runs. Scan inputs go under `/tmp/acres-scan/` with absolute paths.

**Adapter readiness doesn't spawn a sandbox.** `MalwareScannerPort.readiness()`
has no caller outside `server/src/scanner/` (verified with grep while
planning; `HealthService.readiness()` checks only the database and storage).
`readiness()` returns `true` only when the validated configuration is
complete. A paid, CPU-hour-consuming VM per health check is rejected.

### The cost gate (stop condition)

The user set **free tiers only**: stop and report if a gate needs paid
usage. VCR pricing (https://vercel.com/docs/container-registry/limits-and-pricing,
last updated 2026-09-22) lists "VCR image storage $0.10 per GB". It does not
say whether Hobby includes free storage. The Hobby plan limits are 10
repositories per project and 50 images per repository. The image is roughly
0.2 GB, so storing it costs about $0.02 a month if billed. That is still
paid usage. Step 1 resolves this before any push. If it can't be shown free,
**stop and ask the user**. Never push on a guess.

Sandbox on Hobby is free within 5 active-CPU hours, 5,000 creations, 10
concurrent sandboxes and 45-minute sessions per month, and pauses (not
bills) past quota (recorded in `docs/vercel-deployment.md` from the pricing
page). This prompt's probe budget is at most **12 sandbox creations** at one
vCPU with lifetimes of 120 s or less. That is well under 1 CPU-hour.

## References read for this prompt

- `AGENTS.md`; `docs/vercel-deployment.md` ("Resume here", "Hosted proofs",
  the Target and gates table row "Scanner"); `infra/vercel/README.md`
  (scanner probe contract); prompts 370 and 371 (structure, approval limits,
  the `STORAGE_PROVIDER` pattern); memory `vercel-migration-resume`.
- Code: `scripts/vercel/probe-platform.js` (`configuration`, `SIGNATURE_CHECK`,
  `probeScanner`), `scripts/vercel/probe-platform.spec.js` (`scannerFake`
  and the scanner tests), `server/src/scanner/{scanner.port.ts,
  scanner.module.ts,clamav-scanner.adapter.ts,clamav-scanner.adapter.spec.ts}`,
  `server/src/worker/job-processor.service.ts:144-149` (the only
  `scanBuffer` caller; it passes the whole object buffer),
  `server/src/storage/storage.module.ts` (provider factory pattern),
  `server/src/config/env.validation.ts` (`STORAGE_PROVIDERS`, the
  mixed-profile checks, `UPLOAD_MAX_BYTES` default `52428800`),
  `server/src/config/acres-config.service.ts`, `server/.env.example`
  (lines 73–105), `server/src/vercel/vercel-jobs.module.ts` (imports
  `ScannerModule`), `server/src/health/health.service.ts`.
- SDK `@vercel/sandbox` **3.8.0** (`server/package.json`, devDependency):
  `dist/sandbox.d.ts` (`CreateSandboxParams.image`/`persistent`/
  `networkPolicy`/`resources`/`timeout`/`signal`; `runCommand` `timeoutMs`/
  `signal`; `writeFiles`; `stop`; `delete`; `get image()` returning
  `"{repository}@{manifestDigest}"`), `dist/constants.d.ts`, `README.md`
  §"Custom images".
- Official docs, read 2026-10-15:
  [Vercel Container Registry](https://vercel.com/docs/container-registry) (2026-09-04),
  [VCR limits and pricing](https://vercel.com/docs/container-registry/limits-and-pricing) (2026-09-22),
  [Sandbox images](https://vercel.com/docs/sandbox/concepts/images) (2026-08-11),
  [Sandbox persistence](https://vercel.com/docs/sandbox/concepts/persistent-sandboxes) (2026-09-15),
  [ClamAV Docker](https://docs.clamav.net/manual/Installing/Docker.html).
- Docker Hub tag API for `clamav/clamav`, `clamav/clamav-debian` and
  `library/node:24.21.0-trixie-slim` (tags exist, amd64 present).
- Local tooling: Docker 29.7.2 (x86_64 daemon reachable), buildx 0.37.0.

There is no visual reference: this prompt changes no UI.

## SKILLS USED

- `vercel:vercel-sandbox` — Sandbox create/run/stop/delete, persistence, network policy, images, Hobby limits.
- `vercel:vercel-cli` — `vercel vcr login|build|push|ls|tag inspect` and project linking.
- `vercel:env-vars` — names of new variables; nothing is added to project env in this prompt.
- `nestjs-best-practices` — provider-selected `ScannerModule`, injectable adapter, no import-time side effects.
- `security-best-practices` — untrusted-file handling, deny-all egress, no secrets in the VM, fail-closed results.
- `secrets-management` — `VERCEL_TOKEN`/OIDC custody; never print values; restricted env injection.
- `error-handling-patterns` — map create/timeout/exit failures to the port's `ScanErrorCode`s; cleanup failures.
- `javascript-testing-patterns` — probe doubles and adapter unit tests for every exit/timeout/cleanup path.
- `deployment-pipeline-design` — pinned, reproducible image build; record the rebuild cadence as a gate.
- `requesting-code-review` — independent review after self-verification.
- `receiving-code-review` — verify findings before fixing.
- `caveman-commit` — every commit message.

## Ordered implementation

Use Node 24 for every check (see "Resume here" step 3 in
`docs/vercel-deployment.md`). In zsh, run multi-argument commands through
`bash -c`. Never print a secret value. List variable names only
(`cut -d= -f1`).

### Step 0 — Re-establish access (read-only)

1. `npx vercel@latest whoami`. If signed out, the user runs
   `! npx vercel@latest login`. Confirm `.vercel/project.json` links project
   `prj_q9ApajZWDgdYZetnm5s5oakEjrUD` in team
   `team_zE3mp7nrEZ6a7cxRavwUMYC4`.
2. Resolve the team slug and project name from Vercel MCP `get_project`. VCR
   references are `vcr.vercel.com/<team-slug>/acres/<repo>`. Record the slug.
   Don't guess it.
3. `npx vercel@latest vcr --help` and `npx vercel@latest vcr ls`, to check
   that the installed CLI has the `vcr` group and to list any existing
   repositories (expected: none).

### Step 1 — Cost gate (stop condition)

Before any push, establish whether storing an image of about 0.2 GB in VCR
is free on this Hobby team. Accepted evidence, in order:

1. An official Vercel page that says Hobby includes VCR storage (search the
   Hobby plan page and pricing page, and use `search_vercel_documentation`).
2. The project's dashboard **Images** page or team **Usage** page showing an
   included allotment. Ask the user to look and report it. Don't drive the
   browser.

If neither shows the storage is free, **stop** and ask the user to approve
the expected charge (about $0.10/GB-month, so about $0.02 a month), or
choose another option. Do steps 2, 4 and 5 (the local parts) while waiting.
Steps 3 and 6 wait for the answer. Record the evidence in the doc either way.

### Step 2 — Image definition: `infra/vercel/scanner/`

Create `infra/vercel/scanner/Dockerfile`, `infra/vercel/scanner/freshclam.conf`
and `infra/vercel/scanner/README.md`.

Resolve the digests at execution time and write them into the Dockerfile:

```bash
docker buildx imagetools inspect clamav/clamav-debian:1.5.4_base-debian13-slim
docker buildx imagetools inspect node:24.21.0-trixie-slim
```

Pin the **index** digest of each (`Digest:` line). Confirm a
`linux/amd64` manifest is listed.

`Dockerfile` (comments as shown; fill in the digests):

```dockerfile
# Acres upload scanner for Vercel Sandbox. Sandbox ignores ENTRYPOINT/CMD.
# Signatures are fetched at build time; runtime egress is deny-all.
FROM node:24.21.0-trixie-slim@sha256:<index> AS node

FROM clamav/clamav-debian:1.5.4_base-debian13-slim@sha256:<index>
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY freshclam.conf /etc/acres-freshclam.conf
RUN freshclam --config-file=/etc/acres-freshclam.conf --stdout \
 && test -s /var/lib/clamav/main.cvd \
 && test -s /var/lib/clamav/daily.cvd \
 && test -s /var/lib/clamav/bytecode.cvd \
 && ! ls /var/lib/clamav/*.cld 2>/dev/null \
 && chmod -R a+rX /var/lib/clamav \
 && sha256sum /var/lib/clamav/*.cvd \
 && node --version && clamscan --version && sigtool --version
```

`freshclam.conf` holds `DatabaseDirectory /var/lib/clamav`,
`DatabaseMirror database.clamav.net`, `ScriptedUpdates no`,
`DNSDatabaseInfo no` (only if this ClamAV version accepts it; drop it if
freshclam rejects the option and say so), `Foreground yes`, `LogTime yes`,
and no `NotifyClamd`. Verify every option name against
`freshclam.conf.sample` inside the base image
(`docker run --rm --entrypoint cat <base> /etc/clamav/freshclam.conf.sample`)
before using it. Don't add an option the sample doesn't document.

If the base image's user (`clamav`) cannot write `/var/lib/clamav` during
`RUN`, add `USER root` before the `RUN` and say so. Check the image's own
`USER` first.

Build locally first, with no push:

```bash
docker buildx build --platform linux/amd64 --load -t acres-scanner:local infra/vercel/scanner
docker run --rm --entrypoint sh acres-scanner:local -c 'sha256sum /var/lib/clamav/main.cvd /var/lib/clamav/daily.cvd; sigtool --info /var/lib/clamav/daily.cvd | grep -E "^(Build time|Version):"; sigtool --info /var/lib/clamav/main.cvd | grep -E "^(Build time|Version):"'
```

Local EICAR smoke test (no network). Write the EICAR string with `printf`
inside the container. Never commit it as a file:

```bash
docker run --rm --network none --entrypoint sh acres-scanner:local -c '
  mkdir -p /tmp/acres-scan && printf "region,value\nsynthetic,1\n" > /tmp/acres-scan/clean.csv &&
  printf "%s" "X5O!P%@AP[4\\PZX54(P^)7CC)7}\$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!\$H+H*" > /tmp/acres-scan/eicar.txt &&
  clamscan --no-summary --database=/var/lib/clamav /tmp/acres-scan/clean.csv; echo clean=$?;
  clamscan --no-summary --database=/var/lib/clamav /tmp/acres-scan/eicar.txt; echo eicar=$?'
```

Expected: `clean=0`, `eicar=1`. Measure and record wall time and peak memory
(`/usr/bin/time -v` if present, otherwise `docker stats --no-stream` taken
during the scan). Signature loading is the expensive part. The measured
number decides whether one vCPU (2048 MB) is enough. These are
**measurements on this machine**, not Sandbox capacity.

**Licensing.** ClamAV is GPL-2.0. Before pushing, read ClamAV's current
signature-database usage terms (the docs.clamav.net FAQ, or the Cisco Talos
page it links) and record whether private, non-redistributed use of
freshclam-downloaded CVDs inside a private image is allowed. If the terms
forbid it or are unclear, stop and report. Don't push.

`README.md`: what the image is, the pinned inputs, the build/push/inspect
commands, the signature-age policy, the rebuild requirement, and that no
EICAR file or signature file is committed.

### Step 3 — Push to VCR (only after Step 1 clears)

```bash
npx vercel@latest vcr login docker
npx vercel@latest vcr build docker infra/vercel/scanner acres-scanner:<YYYYMMDD>-clamav-1.5.4 --push
npx vercel@latest vcr tag inspect acres-scanner <YYYYMMDD>-clamav-1.5.4
```

Record the **manifest digest** and the full reference
`vcr.vercel.com/<team-slug>/acres/acres-scanner@sha256:<digest>`. Pull it
back (`docker pull <ref>`) and recompute `main.cvd`/`daily.cvd` SHA-256 from
the pulled image. These are the `ACRES_SCANNER_MAIN_SHA256` /
`ACRES_SCANNER_DAILY_SHA256` values, taken from the pushed artifact, not from
the local build. Wait for VCR readiness `Ready` (dashboard Images page, or
retry `Sandbox.create` on `image_not_ready`, at most 5 times, 30 s apart).

Digests and hashes are not secrets. Record them in the doc. The
`vcr login` OIDC credential lives in Docker's credential store. Never print
it. Afterwards run `docker logout vcr.vercel.com`.

### Step 4 — Probe fixes and live failure cases

Edit `scripts/vercel/probe-platform.js`:

1. **Persistence fix.** In `probeScanner`, pass `persistent: false`. Replace
   `finally { if (sandbox) await sandbox.stop(); }` with a cleanup helper
   that calls `stop()` and then `delete({ deleteOrphanSnapshots: true })`,
   each under a 30 s `AbortSignal.timeout`. Any error from either call
   makes the probe fail, even when the scans passed. Keep the existing
   "cleanup failure cannot mint success" behavior.
2. **Image reference.** Keep the digest-pinned check. Accept only
   `vcr.vercel.com/<slug>/<project>/<repo>@sha256:<64 hex>` (the existing
   regex already requires this form). Add a check that
   `sandbox.image` (SDK getter, `"{repository}@{manifestDigest}"`) ends with
   the configured digest. A mismatch fails the probe.
3. **Paths.** Write under `/tmp/acres-scan/` with absolute paths. The first
   command records `id -u`, `id -un`, read access to
   `/var/lib/clamav/daily.cvd` and write access to `/tmp`, and returns them
   in the summary as booleans and a uid number only.
4. **New mode `scanner-failures`**, sharing `configuration(env,"scanner")`.
   Each case is its own short-lived sandbox (`persistent:false`,
   `deny-all`, `vcpus: 1`, `timeout` ≤ 120 000 ms), cleaned up as in (1).
   Gate cases, all expected to **fail closed**:
   - **wrong-hash** — run `SIGNATURE_CHECK` with a `main.cvd` hash of 64
     zeros: exit 2.
   - **missing** — run `SIGNATURE_CHECK` after
     `sudo rm /var/lib/clamav/daily.cvd`. If `sudo` is absent from the image,
     instead run the check script with its database directory pointed at an
     empty `/tmp/acres-scan/emptydb`. To support that, make
     `SIGNATURE_CHECK` take the directory as `argv[4]` (default
     `/var/lib/clamav`). Expect a non-zero exit. Record which variant ran.
   - **stale** — run `SIGNATURE_CHECK` with `maxAgeHours = 0.001`. This
     needs the check to accept a fractional age only in this mode: pass it
     in the check script's `argv`, while `configuration` still enforces
     1–168 for real runs. Expect exit 3.
   - **egress-denied** — `node -e` doing a `fetch('https://database.clamav.net')`
     with a 5 s timeout must fail (exit ≠ 0). This proves signatures can't be
     refreshed or data sent out at scan time.
   - **command-timeout** — a `runCommand` of `sleep 60` with
     `timeoutMs: 3000` must reject or report a non-zero/killed status within
     10 s. Record which of the two.
   - **session-timeout** — create with `timeout: 15_000`, then run `sleep 60`
     with no `timeoutMs`. The command must reject when the session ends
     (skill: "in-flight `runCommand` rejects"). Cleanup must still succeed or
     report "already stopped" without error. Record the observed shape.
   - **size-limit** — write a 7 MiB random file and scan with
     `--max-filesize=6M --max-scansize=6M`. Record the exit code and stdout
     shape (ClamAV may report clean-but-truncated or a `Heuristics.Limits…`
     result). Then repeat with `--alert-exceeds-max=yes`. **The gate is that
     the alert flag makes it exit 1.** The adapter uses that flag (Step 5).
   - **malformed** — a 2 MiB truncated ZIP header followed by random bytes,
     scanned with the adapter's exact flags: exit 0 or 1 is acceptable,
     exit ≥ 2 is recorded. No crash of the probe.
   - **memory** — record `free -m` and the peak RSS of one `clamscan` run
     (`/usr/bin/time -v`, if present in the image) at one vCPU. This is a
     measurement, not a gate.
   Total sandbox creations across `scanner` + `scanner-failures`: 10 at
   most. Print one JSON summary with statuses, exit codes, booleans and
   durations only. Never print stdout bodies beyond a `FOUND` signature
   name, a URL or a token.
5. Update `--help` text and `infra/vercel/README.md` for the new mode.
   Update the README's scanner paragraph: replace "stops the sandbox in
   `finally`" with the non-persistent, stop + delete behavior, and remove
   "Image construction/license/signature acquisition … still unresolved"
   only for the parts this prompt resolves.

Extend `scripts/vercel/probe-platform.spec.js` (doubles only, no network):
`scannerFake` records `create` params and `delete` calls. Tests:
`persistent:false` and `deny-all` are passed; `delete` runs with
`deleteOrphanSnapshots:true` after `stop` on success **and** on every
failure path; a `delete` failure fails the probe; an image-digest mismatch
fails; each `scanner-failures` case passes only on its expected fail-closed
result and fails on the opposite result; the sandbox-creation count stays
within the budget; the summary JSON never contains the token or image URL
(assert by substring).

### Step 5 — `SCANNER_PROVIDER` and the Sandbox adapter (local only)

**Config** (`server/src/config/env.validation.ts`, following the
`STORAGE_PROVIDERS` pattern exactly):

- `export const SCANNER_PROVIDERS = ['clamav', 'vercel-sandbox'] as const;`
  plus `ScannerProvider`. Default `SCANNER_PROVIDER: 'clamav'`. Any other
  value throws `SCANNER_PROVIDER must be "clamav" or "vercel-sandbox",
  received "<v>"`.
- When `vercel-sandbox`, these are required:
  - `SCANNER_SANDBOX_IMAGE`: the same digest-pinned VCR regex as the probe.
  - `SCANNER_MAIN_SHA256`, `SCANNER_DAILY_SHA256`: `^[a-f0-9]{64}$`.
  - `SCANNER_MAX_SIGNATURE_AGE_HOURS`: integer 1–168, no default.
  - `SCANNER_SANDBOX_TIMEOUT_MS`: default `120000`, bounds 30 000–600 000.
  `CLAMAV_HOST`/`CLAMAV_PORT` must be **unset in the raw env**, otherwise
  throw (mixed profile, as with `VALKEY_URL` and `QUEUE_PROVIDER="vercel"`).
  `CLAMAV_SCAN_TIMEOUT_MS` is ignored. Don't fill unused fields with dummies.
- Reject `vercel-sandbox` together with `UPLOAD_MAX_BYTES` above
  `SCANNER_SANDBOX_MAX_BYTES`. That is a fixed constant of 50 MiB, matching
  the current default, so a larger configured upload limit cannot silently
  exceed what the scan flags cover.
- `AcresConfigService` getters next to `storageProvider`. No credential is
  added: on Vercel the SDK authenticates by OIDC. Off Vercel it reads
  `VERCEL_TOKEN`/`VERCEL_TEAM_ID`/`VERCEL_PROJECT_ID` from the environment
  itself. The adapter never reads or logs those.

**Adapter** `server/src/scanner/vercel-sandbox-scanner.adapter.ts`,
`@Injectable()`, implementing `MalwareScannerPort`. `scanBuffer(buffer)`:

1. If `buffer.length > SCANNER_SANDBOX_MAX_BYTES`, return
   `{ status:'failed', errorCode:'scanner_error' }` without creating a VM.
2. Create the sandbox with `{ image, persistent:false, networkPolicy:'deny-all',
   resources:{ vcpus:1 }, timeout: config.scannerSandboxTimeoutMs,
   signal: AbortSignal.timeout(60_000) }`. Pass no `env`, no `source` and no
   ports. If creation fails, return `scanner_unavailable`.
3. Check `sandbox.image` ends with the configured digest. Otherwise return
   `scanner_unavailable`.
4. Run the signature check (shared script text, see below) with
   `timeoutMs: 30_000`. A non-zero exit returns `scanner_unavailable`
   (stale, missing or mismatched signatures all mean "no trustworthy
   scanner").
5. `writeFiles([{ path:'/tmp/acres-scan/upload', content: buffer }])`.
   The name is fixed, so no user filename reaches the VM.
6. `clamscan --no-summary --database=/var/lib/clamav --max-filesize=50M
   --max-scansize=50M --alert-exceeds-max=yes /tmp/acres-scan/upload`, with
   `timeoutMs` equal to the remaining session budget minus 10 s. Exit 0 →
   `clean`. Exit 1 → `infected`, with `signature` parsed from
   `/: (.+) FOUND$/m` on stdout (at most 200 characters, otherwise
   omitted). Any other exit → `scanner_error`. A rejected command (timeout
   or session end) → `scanner_timeout`.
7. `finally`: `stop()` and then `delete({ deleteOrphanSnapshots:true })`,
   each with `AbortSignal.timeout(30_000)`. A cleanup failure turns a
   `clean` result into `{ status:'failed', errorCode:'scanner_error' }`.
   Quarantined bytes must not be left in a VM we can't confirm deleted, and
   the job retries under the existing ledger. An `infected` result stays
   infected. Log only a fixed message plus the sandbox name, never output,
   bytes, tokens or the image URL.

`readiness()` returns whether the configuration is complete. It never
creates a VM (see Design decisions).

Put the signature-check script in one module:
`server/src/scanner/sandbox-signature-check.ts` exporting the script string.
Have the probe keep its own copy, because the probe is CommonJS outside the
server build. Add a unit test in the server that asserts the two strings
are identical (read the probe file as text), so they can't drift.

**Module.** `scanner.module.ts` becomes a provider factory, like
`StorageModule`: only the selected adapter is constructed, and
`ClamavScannerAdapter` is never constructed in the Sandbox profile.
`@vercel/sandbox` moves from `devDependencies` to `dependencies` in
`server/package.json` at the same pinned `3.8.0`. Update the lockfile with
`npm install --workspace=@acres/server --save-exact @vercel/sandbox@3.8.0`
and confirm the version doesn't change. Load it only from the adapter file,
so the BullMQ/ClamAV profile never imports it at boot. Use a lazy
`require`/`import()` inside the adapter if the static import shows up in the
self-host worker's boot path. Check with
`node -e "require('./server/dist/worker.js')"`-style import tracing, or by
grepping the built output.

**Env example.** Add a commented block to `server/.env.example` after the
ClamAV lines, in the same style as the `STORAGE_PROVIDER` block. Use names
only, no values.

**Tests** `server/src/scanner/vercel-sandbox-scanner.adapter.spec.ts`, with
an SDK double injected through a small factory seam (constructor option, as
the Blob adapter tests do; check how `vercel-blob-storage.adapter.spec.ts`
mocks `@vercel/blob` and follow the same approach). Cover: clean; infected
with signature; the signature truncated or absent; exit 2 → `scanner_error`;
command rejection → `scanner_timeout`; create failure →
`scanner_unavailable`; signature-check failure → `scanner_unavailable`;
image digest mismatch; oversize buffer creates no VM; cleanup order (stop,
then delete) on every path; a cleanup failure turns clean into failed and
keeps infected; create params (persistent false, deny-all, one vCPU, no env).
Extend `env.validation.spec.ts` for every new rule (default, invalid
provider, each missing/invalid variable, mixed `CLAMAV_HOST`, the upload
size bound) and `acres-config.service.spec.ts` for the getters.

### Step 6 — Hosted runs (only after Steps 1 and 3)

With the restricted environment (never in chat or shell history; source the
values from a 0600 file in `~/.config/acres/vercel-preview/`, for example
`scanner.env`, holding only the digest/hash/age/region names listed in
`infra/vercel/README.md`, plus `VERCEL_TOKEN` taken from an existing
restricted source; if none exists, ask the user to create one scoped to the
`acres` project and write it there themselves):

```bash
bash -c 'set -a; . ~/.config/acres/vercel-preview/scanner.env; set +a; \
  ACRES_VERCEL_PROBE=isolated-synthetic-preview VERCEL_ENV=preview \
  VERCEL_TEAM_ID=team_zE3mp7nrEZ6a7cxRavwUMYC4 \
  VERCEL_PROJECT_ID=prj_q9ApajZWDgdYZetnm5s5oakEjrUD \
  ACRES_VERCEL_PROBE_REGION=iad1 ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS=48 \
  node scripts/vercel/probe-platform.js scanner && \
  node scripts/vercel/probe-platform.js scanner-failures'
```

48 h is a **probe choice**, not an adopted production policy. If the pushed
image is already older than that when the probe runs, rebuild and re-push.
Don't raise the threshold to make the probe pass.

Then confirm there is **no residue**: list sandboxes and snapshots for the
project (`npx vercel@latest sandbox list` and
`npx vercel@latest sandbox snapshots list`, after checking both commands
with `--help`). Expect zero sandboxes in a running state and zero snapshots
created by this run. If there are leftovers, delete exactly those (by the
names the probe printed) and report it as a cleanup defect.

Record the active-CPU usage these runs consumed, if the Usage page shows it.
Otherwise give the estimate from creation count × lifetime.

### Step 7 — Documentation (owning files)

- `docs/vercel-deployment.md`: a new section, "Scanner image — 2026-10-15",
  recording the cost-gate evidence, the license finding, the pinned inputs
  (base/node index digests, ClamAV 1.5.4, image tag and manifest digest, CVD
  hashes and build times, freshclam options), local measurements, every
  hosted case with its observed result, the residue check, the
  persistence defect and fix, and the adapter/config. Update the "Resume
  here" checklist: tick **Scanner image** only if both hosted modes passed
  every gate case. Otherwise leave it open with the exact failing case. Add
  to the **First preview deployment** item: set `SCANNER_PROVIDER=vercel-sandbox`
  and the `SCANNER_*` variables, leave `CLAMAV_*` unset, and prove an app
  upload → scan through the deployed preview. Update the "Scanner" row of
  "Target and gates".
- Record **image rebuild cadence** as an open production blocker: signatures
  go stale after the adopted age, and a stale image fails closed. Name the
  candidate (a scheduled GitHub Actions workflow using Vercel's VCR login
  action, or a protected Vercel Cron) without building it.
- `infra/vercel/README.md` (Step 4) and `infra/vercel/scanner/README.md`.
- `docs/security.md`: the scanner boundary row/acceptance case, a factual
  update covering deny-all egress, no secrets in the VM, non-persistent
  sandboxes with delete, and fail-closed results. Check what the file says
  first and change only the scanner lines.
- `docs/backend.md`: one line under configuration naming `SCANNER_PROVIDER`.
- Memory `vercel-migration-resume`: add "Prompt 372 = scanner image" and
  the persistence gotcha.

## Reference deltas

None visual. Process deltas: the probe's existing scanner code is changed
(persistence fix), and the old README claim that it "stops the sandbox in
`finally`" is corrected, because stop alone keeps a snapshot.

## Breakpoint behaviour

No UI change, so 375, 800 and 1280 are unaffected. Upload status
semantics are unchanged: the adapter returns the existing `ScanResult`
shapes.

## Non-goals

- No preview/production deployment, no project env changes, no
  `SCANNER_PROVIDER` set anywhere hosted (that belongs to the first preview
  deployment item).
- No automated image rebuild (recorded as a blocker), no clamd daemon, no
  persistent or renewing Sandbox, no signature download at scan time, no
  egress allow-list.
- No streaming or chunked scanning of objects above 50 MiB. No change to
  `UPLOAD_MAX_BYTES`.
- No change to the ClamAV/clamd adapter or the self-host Compose scanner.
- No public or shared VCR repository. It stays private to `acres`.
- No commit of EICAR bytes, CVD files, tokens, the VCR credential or
  `scanner.env`.
- No paid usage without the user's explicit yes (Step 1).

## Verification (quote real output, Node 24, sequential)

```bash
npm run vercel:probe-test
npm run lint
npm run typecheck
npm run build
npm run test --workspace=@acres/server -- --runInBand
npm run test:e2e --workspace=@acres/server -- --runInBand --testTimeout=30000
npm run contracts:check   # no drift expected: no public contract changes
npm run ops:check
git diff --check
```

Plus: the local image build log digest lines, the local clean/EICAR exits,
the VCR tag inspect output (digest only), and both hosted probe summary JSONs
plus the residue listing. If a check fails for an environment reason (DB
starting, `listen EPERM`, offline cache), say so and rerun. Never record an
environment failure as a pass. Format changed files only. The client e2e
suite is not required, because no client code changes. Say that it was not
run.

Then use `requesting-code-review` with this prompt, BASE `c544da6`, HEAD,
the diff, the check output and the probe summaries. Evaluate the findings
with `receiving-code-review`, fix the valid ones, and re-review if the
scanner module or adapter cleanup changes shape. Commit locally on `main`
with `caveman-commit`. Suggested split: (1) image definition + probe fix +
failure cases + tests; (2) provider/adapter/config + tests; (3) docs record.
Stage only task files. No push.

## Rollback

`git revert` of the commits. `SCANNER_PROVIDER` defaults to `clamav`, so
nothing changes unless the variable is set. To remove the hosted artifact,
delete the `acres-scanner` repository with `vercel vcr` (only on the user's
request). The probes leave no sandbox or snapshot, and the residue check
proves it.

## Completion statement to give the user

Report the cost-gate outcome and license finding; the image reference and
CVD hashes/build times; each hosted case's result; the residue check; and
whether the checklist item is ticked. Name the open blockers: image rebuild
cadence, app-level scan through a deployed preview, and the 50 MiB cap.
Don't say "scanner gate passed" for production. The probe proves the
platform seam and the adapter's building blocks, not application acceptance.
