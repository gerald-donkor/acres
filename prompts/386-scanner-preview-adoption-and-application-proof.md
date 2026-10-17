# Prompt 386 — scanner preview adoption and application proof

## Scope and why this is next

Parent: Phase 12 managed-target operations, continuing approved Prompt 370.
Inspected baseline: `5247e3754a2eb222a47b0bc31932911fef5cb8ef` on `main`.
The worktree was clean before this prompt was prepared. The code and that
commit establish implementation of Prompt 385's offline runtime handoff;
its prompt file alone is not implementation evidence.

The next dependency-safe scanner gate is actual preview adoption and deployed
application acceptance. Prompts 384–385 prepare retained candidates and local
configuration, but neither has updated Vercel or verified an application using
a newly prepared candidate. Perform that bounded hosted step using the existing
tools. Do not create another offline lifecycle gate in place of doing it.

Deliver a retained restricted preparation/handoff/rollback inventory, adopt its
three scanner variables in the selected preview environment, deploy one new
Acres preview, and prove clean and EICAR uploads through real application
commands, durable dispatch and the deployed consumer. Preserve every scanner
snapshot. Record precisely which identities and behaviors were verified.

Approval of this prompt authorizes the preview actions described below, within
the previously selected free-tier target. It does not authorize production,
paid usage, snapshot retirement, account credential rotation or a push.

## Reference material read

- `AGENTS.md`: phase control, prompt contract, workflow and §§6–10.
- `docs/build-plan.md`: Phase 12, managed amendment and Prompts 378–385.
- `docs/project-status.md`, `docs/skills.md`.
- `docs/vercel-deployment.md`: fixed target, access procedure, hosted gates,
  scanner lifecycle and Prompt 385 limitations.
- `docs/operations.md`: operations contract and Prompts 384–385 actual checks.
- `docs/system-architecture.md`: managed target, dispatch and throttling boundaries.
- `docs/security.md`: operator/configuration, tenancy and quarantine boundaries.
- `docs/adr/0001-vercel-managed-production.md`.
- `docs/operator-handoff.md`, `docs/launch-checklist.md`: evidence custody,
  preview-versus-production distinction and unresolved launch responsibilities.
- `docs/backend.md`, `docs/authenticated-app.md`: session/CSRF, tenant context,
  same-origin bridge and dataset/upload workspace.
- `docs/automation.md`: browser evidence and build/check limitations.
- `infra/vercel/README.md`,
  `infra/vercel/runbooks/managed-operations.md` §5, and root `vercel.json`.
- `scripts/vercel/rebuild-scanner-cadence.js`,
  `scripts/vercel/prepare-scanner-handoff.js`,
  `scripts/vercel/probe-platform.js`, and
  `scripts/vercel/check-vercel-config.js`.
- `server/src/scanner/vercel-sandbox-scanner.adapter.ts`,
  `server/src/queue/vercel-queue.adapter.ts`,
  `server/src/vercel/queue-consumer.middleware.ts`,
  `server/src/uploads/uploads.controller.ts`,
  `server/src/uploads/dto/initiate-upload.dto.ts`, and
  `server/src/uploads/dto/complete-upload.dto.ts`.
- `package.json`, `server/package.json`, installed Sandbox type declarations,
  and `node_modules/next/dist/docs/01-app/01-getting-started/17-deploying.md`.

Local Vercel CLI 64.3.1 `deploy --help` and `env --help` were inspected during
preparation. They expose preview deployment, explicit project/scope selection,
and env add/update operations. Exact env subcommand flags, deployment inspection
and provider evidence capabilities must be verified at execution time from
installed CLI/SDK sources or current official documentation before use. The help
command's background update checker encountered a read-only cache error;
no login, account read or hosted action was performed during preparation.

No visual changes or geometry measurements are planned. No comp crop, token,
breakpoint or animation change is necessary. Browser evidence here proves
application behavior; do not start a visual redesign or screenshot comparison.

## SKILLS USED

- `deployment-pipeline-design` — ordered preview configuration adoption, deployment, acceptance and recovery.
- `secrets-management` — restricted credentials, previous configuration custody and sanitized provider evidence.
- `architecture-patterns` — preserve application/worker/provider boundaries without adding a controller or service.
- `security-best-practices` — preserve preview isolation, tenant authorization and quarantine; no standalone CLI-specific reference is installed, so verify any local scripting APIs before use.
- `security-threat-model` — use the existing operator and upload boundary model; no new trust boundary or separate threat-model report is requested.
- `error-handling-patterns` — distinguish partial configuration updates, build failures, unavailable scanning and inconclusive proof.
- `e2e-testing-patterns` — real application acceptance with isolated synthetic fixtures and durable terminal-state checks.
- `playwright` — browser login/workspace/direct-upload acceptance using the CLI workflow and fresh page references.
- `javascript-testing-patterns` — interpret existing Node/Jest regressions and maintain behavioral checks if a narrowly scoped local acceptance helper is necessary.
- `requesting-code-review` — independent read-only review of the operational record and repository diff after self-verification.
- `receiving-code-review` — verify findings against source and restricted evidence before corrections.
- `caveman-commit` — required local commit to main after execution and review.

Preparation loaded these skills. Execution must load them again. This focused
Phase 12 unit changes hosted preview configuration and documentation, not Nest
source, SQL/schema, workflow YAML, telemetry, Grafana or SAST policy. Their
parent-phase skills do not justify expanding into those unrelated surfaces.
Use the available Firecrawl skill if execution requires live-web documentation;
verify only official provider sources. Installed sources and CLI help may
instead settle an API. No skill establishes current account quota or billing.

## 1. Re-establish the target and recovery baseline

1. Re-read this prompt and owning records; inspect status, branch and HEAD.
   Preserve unrelated edits. Record the source SHA and exact deployment inputs.
   Do not assert that a deployment represents the eventual documentation commit
   when its upload predates that commit.
2. Use Node 24.21.0 from `.node-version`; verify both direct Node and npm's
   subprocess runtime. Reuse the installed toolchain and dependencies.
3. Re-establish authenticated Vercel access without printing credentials.
   Use the already designated Acres access locations only. Do not search
   unrelated credential stores or accounts. If interactive authentication is
   necessary, report the exact missing action and wait for it.
4. Confirm through the provider that the selected target is:

   - team `team_zE3mp7nrEZ6a7cxRavwUMYC4`;
   - project `prj_q9ApajZWDgdYZetnm5s5oakEjrUD` (`acres`);
   - environment `preview`, region `iad1`;
   - existing private preview Blob store `store_g2fmCH5CW7TJbkN3` and
     the already designated Acres Neon preview database;
   - existing free-tier resources, with no upgrade, payment method change,
     paid feature activation or new unrelated resource.

   Stop dependent mutations for mismatch, unavailable access or a required paid
   capability. Record quota visibility honestly; old pricing notes do not prove
   today's remaining allowance. Use only provider-enforced free operation.

5. Inspect the present preview scanner provider, snapshot ID and two hash
   variables, including any branch-specific precedence. Bind the current
   immutable application deployment and jobs consumer. Historical
   `dpl_Hr9VwjL5jrA5vmsZfx7Qvi2R966b` / `snap_d2y7r2n9` are clues,
   not assumed current state. Identify the actual deployed scanner settings
   separately from project settings that may have changed since deployment.
6. Preserve exact previous settings and their scope, including absent values,
   in new restricted files outside the repo. Reuse the designated durable
   Acres preview configuration parent where authorized; create unique run
   subdirectories, mode 0700, and files 0600. Preserve existing files. Do not
   treat `/tmp` as durable custody. Do not print full env files, database URLs,
   OIDC/session tokens, passwords or raw provider responses.

## 2. Prepare and retain one eligible live candidate

Use the existing cadence producer with explicit preview opt-in and exact target
bindings. Read the current snapshot ID from the inspected baseline. Use fresh
outside-repo paths for the receipt and optional probe env export; do not invoke
the standalone builder with `--replace`.

```text
node scripts/vercel/rebuild-scanner-cadence.js --force --current-snapshot-id <inspected active ID> --output <new restricted receipt> --write-env <new restricted probe env>
node scripts/vercel/prepare-scanner-handoff.js --receipt <that receipt> --output-dir <new durable restricted bundle>
```

The placeholders are deliberately not executable shell commands. Supply
validated values with argument arrays or properly quoted shell variables,
never by interpolating untrusted JSON into shell source. Do not source a receipt
or arbitrary generated env file. Load only validated assignments as data.

Bound this run to one live rebuild attempt, its existing clean/EICAR smoke
sandbox, and one new application deployment. Honor existing timeouts. No
automatic rebuild/deployment retry loop or quota-consuming failure matrix.
On failure retain confirmed candidate IDs for inspection and report ambiguity.
No old or new base snapshot is deleted by this prompt. Existing owned temporary
sandbox cleanup remains necessary; do not sweep unrelated sandboxes.

Require the producer's successful live, target-bound receipt and all smoke and
cleanup checks. Consume it with the existing handoff validator. Independently
recompute receipt/runtime byte digests and compare the three runtime assignments
to `handoff.json`. Verify the candidate exists on the selected provider target.
Manifest consistency does not authenticate a provider or establish CVD freshness;
retain actual builder/signature evidence and the existing signature-age policy.
Never weaken max age or checksum validation to make a stale snapshot pass.

## 3. Adopt the runtime configuration and deploy preview

Update only these three preview-scoped project variables from validated bundle
data, preserving the inspected scope/precedence:

```text
SCANNER_SANDBOX_SNAPSHOT_ID
SCANNER_MAIN_SHA256
SCANNER_DAILY_SHA256
```

Keep `SCANNER_PROVIDER=vercel-sandbox` and all unrelated provider, database,
session, queue, AI and timeout settings unchanged. Do not create plaintext
secret values in tracked configuration. Use the verified CLI add/update stdin
contract or authenticated provider tool; do not delete/recreate unrelated env
records or print broad decrypted inventories. Verify each setting privately.
Three project-variable writes are not atomic: record which succeeded, stop
after a failed write, and apply the recovery procedure below before any deploy.

Create one non-production deployment of the current Acres application with
explicit project/team and preview selection, retaining root Services routing,
Node 24, `iad1`, private Blob and protected queue/dispatch boundaries. Verify the
actual invoked CLI syntax first. Never use `--prod`, `promote`, domain reassignment,
a temporary anonymous project or a paid build machine. Do not run migrations,
change DNS, send email, enable AI or alter the scheduled workflow.

Retain the immutable new deployment ID/URL, source identity and completion time.
Inspect its resolved scanner configuration privately, for both API and jobs
services. A project env update or successful build is insufficient. Establish
that the consumer serving this deployment resolves the exact candidate and both
hashes. Preserve old deployment configuration/snapshots for rollback; no
deletion or assertion of zero downtime follows from a new Ready deployment.

## 4. Prove the deployed application behavior

Use only fresh synthetic test data in an isolated test organization/account on
the approved preview. Reuse explicitly designated test credentials if present;
otherwise register a uniquely identified synthetic account through the existing
application without email delivery or changes to verification policy. If the
normal flow cannot create an authorized session, report that blocker rather
than inserting users or weakening authorization.

1. Open the immutable preview URL in a real browser with deployment protection
   intact. Sign in, establish CSRF and select the isolated organization through
   normal routes. Verify protected SSR/app rendering and same-origin API access.
2. Exercise the existing application upload protocol for a small clean CSV:
   authenticated initiate, direct private Blob PUT, authenticated complete with
   actual SHA-256/byte count, and bounded progress/status polling to terminal
   accepted/clean. Use unique idempotency keys. Do not substitute the standalone
   Blob/scanner probes or local doubles for this path.
3. Exercise a second upload carrying the standard EICAR test signature from the
   existing probe fixture. Use a supported upload media type and matching
   metadata/checksum so rejection comes from scanning. Require infected/rejected
   state, no accepted download access and no ingestion/publication. Do not print
   raw signatures or fixture bytes in user-facing diagnostics.
4. Correlate both fresh uploads with their outbox/durable job terminal results
   and the **new deployment's** queue consumer using provider deployment/event
   evidence. Inspect SDK deployment-partition behavior rather than assuming
   latest-alias traffic reaches that consumer. Do not manually execute jobs or
   overwrite ledger states to force the outcome. Use bounded polling with a
   stated observation deadline; timeout is inconclusive/failure, not success.
5. Prove the consumer's candidate identity from immutable deployment configuration
   and provider invocation evidence. The adapter checks `sourceSnapshotId` and
   both CVD hashes before a positive clean result; explain the inference and its
   limits. If actual Sandbox source metadata is independently available, bind
   it too. A clean upload processed by an unidentified or old deployment does
   not clear this gate. Do not add a public env/debug endpoint to obtain proof.
6. Confirm synthetic quarantined objects cannot be fetched anonymously and an
   unauthorized organization cannot read the two upload records. Use existing
   application authorization, not elevated SQL, for these negative checks.
7. Record owned test artifacts and observed sandbox cleanup. Use existing safe
   application cleanup/cancellation only where it actually applies; an upload
   cancel endpoint is not proof that its Blob was deleted. Leave retained ledger
   evidence explicit. No bulk storage/database cleanup or snapshot retirement.

Read relevant route/DTO/bridge implementations before each request. Restricted
read-only database inspection may supplement tenant API results using the
already approved preview runtime role and transaction-local context; do not
change roles/grants or print rows from unrelated organizations. Reuse the
previous hosted acceptance method where it remains verified and applicable.

## 5. Failure handling and recovery

- Before mutation: missing access, wrong target, insufficient free allowance,
  missing rollback settings or invalid candidate stops dependent work.
- Partial env adoption: restore only the exact touched preview records from the
  captured previous values/scopes. Verify restoration privately. Do not delete
  an originally absent/new record without first confirming this invocation
  created it; do not disturb concurrent operator edits.
- Deployment failure: retain the previous immutable deployment and all snapshots.
  Restore project preview scanner settings where safe and record both the
  failed deployment and actual recovery result. No blind promotion/rollback of
  production domains and no assumption that restoring project vars rewrites
  immutable deployments.
- Acceptance failure: stop additional synthetic work. Keep both deployments and
  candidate evidence. Restore future preview project settings to the captured
  baseline if still owned/unchanged by others. Do not weaken scanning, replay
  exhausted jobs or perform an unplanned extra deployment. If serving aliases
  need a separate action beyond this scope, report their state and required
  recovery precisely.
- If previous signatures have expired, restoration preserves identity but does
  not prove a working scanner. State that fact; do not claim rollback health.

This prompt authorizes restoring its own three configuration edits on failure,
not broad resource cleanup or credential rotation. A blocked hosted gate must
remain blocked in the record even if every local check passes.

## Verification, records and completion

Run the existing local checks on Node 24.21.0, sequential build then typecheck:

```bash
node scripts/vercel/check-vercel-config.js
npm run vercel:probe-test
npm run ops:check
npm run lint
npm run build
npm run typecheck
npm run ops:scan-secrets
git diff --check
```

Use the installed formatter on changed supported files; there is no root format
script. Quote real outputs and exits. Distinguish local tests from hosted proof
and report audit/network limitations without claiming an aggregate pass. Do not
rerun the entire database/browser suite against live preview by changing a local
test database URL. The two explicit synthetic upload journeys above are the
hosted acceptance scope.

Repository changes are documentation only unless a separate implementation
defect is discovered. Update these existing owners with a Prompt 386 record:

- `docs/vercel-deployment.md`: current inspected baseline, exact new candidate,
  adoption/deployment and each hosted acceptance result; preserve historical
  evidence and identify newly closed preview gates only when proven.
- `docs/operations.md`: UTC execution window, sanitized outputs, input/source
  identity, evidence digests/custody, partial failures, recovery and review.
- `infra/vercel/runbooks/managed-operations.md` §5.5: verified adoption/proof
  procedure and actual recovery caveats; retain retirement separation.
- `docs/build-plan.md`: concise outcome and remaining parent-phase gates.
- `docs/launch-checklist.md`: concise cross-reference; no category approval.

Keep raw configuration, cookies, credentials, test identities, presigned URLs,
unredacted provider logs and detailed receipts in restricted outside-repo
storage. Tracked records may contain the already-public target identifiers,
candidate hashes, immutable deployment ID/URL, timestamps and sanitized
statuses. Do not invent a production evidence-store approval for this preview
inventory or edit immutable preparation manifests to say activation happened;
record later stages separately with input digests.

After self-verification, dispatch an independent read-only reviewer using
`requesting-code-review`, baseline SHA, current HEAD/diff, requirements and
sanitized evidence. Do not copy credentials to the reviewer. Evaluate findings
with `receiving-code-review`, verify corrections and re-review significant
changes. Commit this prompt and approved records locally to `main` with
`caveman-commit`; do not push. Report the immutable preview inspection steps
and any unresolved hosted gate. If a product/runtime defect prevents acceptance,
record it and prepare its separate scope instead of broadening this prompt.

## Impact, non-goals and remaining gates

No route, API/schema, UI, design token, application source, provider adapter,
dependency or workflow behavior change. The selected preview receives new
scanner configuration and one application deployment; existing preview URLs
retain immutable configurations. Only synthetic test application data is added.

No production deployment/promotion, paid-plan decision, Resend/domain work,
scheduled live rebuild, artifact-store selection for CI, snapshot deletion,
retirement controller, load/DoS/restore drill, production sign-off or completion
percentage increase. Dependency-aware retirement, in-flight/old-deployment and
rollback coverage, hosted cadence, free-tier lifecycle resource budget, the
commercial hosting-plan decision and eleven launch approvals remain open.
Manual successful adoption proves only that bounded preview operation.

Reverting the documentation commit does not roll back Vercel state. Hosted
recovery follows the captured preview baseline and §5; all snapshots remain
retained pending a separately authorized retirement plan.
