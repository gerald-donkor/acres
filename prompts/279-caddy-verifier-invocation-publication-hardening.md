# Phase 12K — Harden Caddy-verifier invocation and receipt publication

## Scope and why this is next

Prepare the next bounded producer step within the unfinished Phase 12 launch
gate in `docs/build-plan.md` §§13–14. Planning starts from clean `main` at
`d56058e2b283963105b6132f081e8b9e201f04ec`
(`fix(ops): harden volume evidence publication`). Resolve current implementation
again from code and Git before execution; prompts alone prove no implementation.

The committed unified runner invokes `verify-caddy-routing.js` in Stage 3 with
one positional Caddyfile and an explicit registered receipt destination. The
producer currently accepts repeated flags and multiple positional files, exits
early on mixed help, reads files without bounds, reflects source-derived values
in route/header/error output, writes receipts directly with overwrite semantics,
and calls `process.exit()` immediately after JSON output. These gaps remain
after the volume, container, SAST, SBOM, alert and capacity producer steps.

Implement strict invocation, bounded regular-source reading, safe CLI projection,
private exclusive verified receipt publication, controlled faults and complete
output. Preserve existing well-formed routing/security predicates, the twelve
route cases, HSTS approval semantics, all four public exports and unchanged
parent/dossier/readiness contracts. This remains static configuration simulation;
Category 1 live DNS/TLS/HTTPS approval, prompt 201, dependency advisories and
Phase 12 exit remain open.

Read-only planning baseline from the exported verifier against the installed
example:

```json
{
  "exports": [
    "parseCaddyfile",
    "evaluateRoute",
    "verifyCaddyfile",
    "DEFAULT_CADDYFILE_PATH"
  ],
  "valid": true,
  "errors": 0,
  "warnings": 0,
  "routes": 12,
  "passed": 12
}
```

This is a local declaration/route evaluation, not a test-suite result or live
ingress measurement. Planning ran no implementation tests, build, network
probe, Docker command or real drill.

## References read and execution prerequisites

- `AGENTS.md`: phase controls, prompt contract, checks, review and local commit.
- `docs/build-plan.md` §§13–14, Phase 12G record and records 275–278:
  unfinished launch gate, ingress foundation and producer predecessors.
- `docs/operations.md`: topology, Caddy qualification, simulation evidence and
  latest publication precedents. Re-read the Caddy section and Prompt 278.
- `docs/launch-checklist.md` Category 1 and §4: simulation/live separation,
  Stage 3 receipt and operator inspection requirements.
- `docs/system-architecture.md`: same-origin routing and the operator boundary.
- `docs/security.md`: tooling/evidence assets, diagnostic minimization and
  simulation/live qualification. No new threat-model report is requested.
- `docs/skills.md`: locked skill names and triggers.
- `scripts/ops/verify-caddy-routing.js` and complete spec: parser, content/path
  heuristic, four exports, policy checks, twelve routes and CLI/save behavior.
- `infra/caddy/Caddyfile.example`: placeholders, nested blocks, comments,
  quoted values, headers, matchers and three upstreams.
- `scripts/ops/run-launch-drills.sh` Stage 3 and
  `scripts/ops/run-launch-drills.spec.js`: installed child, private stage directory,
  deterministic stubs and actual-child fixture precedents.
- `scripts/ops/assemble-launch-dossier.js`: Caddy receipt registration, bounded
  child reads, target identity matching, Stage 3 baseline and route counts.
  Read relevant assembler spec cases before adding tests.
- `scripts/ops/check-launch-readiness.js`: `validateCaddyRoutingReport`,
  simulation acceptance and separate live approval. Read relevant spec cases.
- `scripts/ops/run-deployment-drill.sh` and
  `scripts/ops/check-production-templates.sh`: existing positional callers;
  inspect their specs before changing integration fixtures.
- `scripts/ops/verify-volume-encryption.js`: bounded reads, ancestor identities,
  owned staging, closed readback, exclusive link and naturally drained output.
  Read its fault tests before adapting patterns; avoid a shared publisher refactor.
- `package.json`: existing operations suites and root verification commands.
- `node_modules/@types/node/fs.d.ts`: verified `openSync`, `fstatSync`,
  `readSync`, `writeSync`, `linkSync`, `O_NOFOLLOW` and `O_NONBLOCK`.
  `node_modules/@types/node/process.d.ts` documents natural output draining
  through `exitCode`. Verify required stream and crypto APIs locally at execution.

This is a Node CLI step. No UI, Next/React, Tailwind, schema, application route
or runtime topology change is planned; visual references and comp measurements
do not apply. The security skill contains no standalone Node CLI reference;
use verified local APIs, current code and the committed producer patterns.

## Expected files and impact

Modify `scripts/ops/verify-caddy-routing.js` and its spec. Add real-Caddy-child
coverage to `scripts/ops/run-launch-drills.spec.js`; add focused assembler,
readiness or deployment spec cases only where existing integration lacks the
required evidence. Production consumers and shell invocation contracts stay
unchanged. No new package script or dependency is needed.

Record implementation, parity, actual checks, review and limitations in
`docs/operations.md`; add a concise Phase 12K verification record in
`docs/build-plan.md`; update Category 1/§4 regeneration guidance in
`docs/launch-checklist.md`. Add a narrow metadata-boundary note to
`docs/security.md` if the CLI projection changes its documented boundary.
Include this approved prompt in the eventual local commit. Customer routes and
behavior do not change.

## Implementation contract

### 1. Validate the complete invocation before work

Keep zero or one positional Caddyfile, `--json`, `--allow-hsts`, one
`--output FILE`/`-o FILE`, and standalone `--help`/`-h`. Add attached
`--output=FILE`; short `-o` remains the separate-value alias. Explicit relative
source/output paths resolve against caller cwd; the no-argument example default
stays installation-anchored. Paths are literal, with no expansion or shell use.
Attached output values may name literal dash-prefixed files; a positional source
with such a basename can use `./-name`. Do not add unrelated flags.

Reject multiple source positionals, repeated singleton/boolean options (including
mixed output aliases), mixed help, unknown arguments, values on booleans,
missing/empty/whitespace-only/control-bearing paths and ambiguous dash-leading
split output values. Validate all argv before source reads, parsing, destination
inspection or allocation. Invalid invocations emit a fixed diagnostic and no
report. Import and standalone help perform no file or destination work. No-save
runs never inspect/create output directories or staging.

Keep the valid exported content-or-path call and options shape. Reject nonstring
input, malformed options and nonboolean supplied `allowHsts` before filesystem
work or coercion; omitted `allowHsts` remains false. Preserve existing empty
content failure and missing-path direct-call behavior. Validate parser/evaluator
inputs sufficiently to prevent incidental coercion and uncontrolled errors;
valid `parseCaddyfile` and `evaluateRoute` calls retain their useful local data.
Keep all four exports; new CLI internals need not become public APIs.

### 2. Bound source work and control malformed input

CLI positional input is always a file path, even if its literal bytes resemble
inline content. Bounded reads apply to the direct verifier's file path as well;
direct inline content/parser input gets the same 1 MiB UTF-8 byte ceiling.
This is a local engineering safety limit, not measured production capacity.

Require regular-file source reads with verified nonblocking open, opened identity,
type/size checks, bounded incremental reading, growth/truncation/metadata checks
and owned closure. Ordinary source symlinks to regular files remain supported.
Directories/FIFOs/devices, oversized/growing sources and read/close faults fail
without blocking or exposing filesystem diagnostics. Document that ordinary
symlink support is not source confinement or hostile same-UID protection.

Preserve parsing of the existing supported Caddy subset: global/site blocks,
header/request-body/reverse-proxy/transport blocks, matchers, comments, quoted
hashtags, placeholder braces such as `{$ACRES_PRODUCTION_DOMAIN}`, `{host}` and
`{scheme}`, and valid nested transport directives. Do not count placeholder or
quoted braces as block delimiters. Add input/consumed-shape guards and explicit
failure for incomplete supported blocks that would otherwise permit successful
verification. Bound supported block nesting at 100 and parsed entries at 10,000;
these are safety judgments. Avoid converting this into a full Caddy grammar.

Retain all well-formed security predicates, matcher matching/order, exact expected
upstreams and route evaluation order. Do not tighten permissive target matching,
introduce new required routes, change placeholder policy, rewrite HSTS policy,
or advertise full Caddy syntax validation. If a syntax guard changes a previously
passing malformed case, document and test that deliberate rejection.

Preserve the existing CLI contract that a missing source with explicit output
can save a failed simulation report. Extend controlled source failures to a
fixed failed source report with zero evaluated routes, null domain and all
verification booleans false. Successfully parsed predicate failures retain their
actual results/counts. Invalid invocation/destination and internal
serialization/publication failures produce no success report. Every failed
source/report remains rejected by unchanged consumers.

### 3. Project public CLI evidence explicitly

Build a fresh allowlisted report for human output, JSON and saved receipts; do
not mutate direct parser/verifier/evaluator results. Preserve `drill_type`,
canonical UTC `timestamp`, `execution_mode: "simulation"`, `status`, `valid`,
verification booleans, actual `routesEvaluated`/`routesPassed`, and each route's
actual pass verdict in the existing twelve-case order. `hstsApproved` stays true
only when the explicit flag, active valid HSTS and overall passing verification
agree. Never infer live approval from it.

Retain canonical `targetPath` as the exact source identity required by Stage 3's
unchanged `sameFile` comparison. Retain the domain needed by unchanged consumer
matching only in bounded safe forms: the exact standard domain placeholder or
a syntactically safe plain host/site identifier. Do not echo arbitrary site
header content containing credentials, controls, URLs, multiple-address payloads
or private data; use null for unsafe domain projection, keeping the underlying
policy verdict unchanged. Document that source path and approved domain are
intentional restricted evidence identity fields and are not fully anonymous.

Route projections retain fixed test paths, method, expected target, actual passed
boolean and safe required matcher/upstream identities. Unexpected upstream values
must use a fixed unrecognized label or null, never the expected target fabricated
as an actual value. Omit source-derived `headersUp`, response header maps, removed
headers, timeout/body values, raw text, parsed config, email, comments and arbitrary
matcher/pattern values. Their verification booleans remain truthful.

Emit fixed predicate-specific errors/warnings that do not interpolate source
values; preserve failure count and meaningful policy families. Prefer explicit
internal classification rather than fragile free-text regex sanitization. Keep
the useful private diagnostics of direct helper results local. Human summaries
must not print all configured headers/timeouts or misleading passing marks when
checks failed; render the public projection and truthful simulation status.

Independently validate report consistency before serialization and after closed
readback: bounded strings, permitted keys, fixed route identities/order, counts,
boolean/status agreement, canonical timestamp, allowed fixed diagnostics and
simulation classification. Success requires twelve actual passing routes and
zero errors. Failure can contain zero or partial evaluated routes and cannot
have all verification booleans promoted to true. Existing consumers must remain
unchanged; safe projection must not accidentally manufacture route success.

### 4. Publish only to fresh destinations

Read-only output preflight follows full argv validation and precedes source work.
An explicit destination must be absent, including dangling links; reject root,
trailing separators, directories and nondirectory/symlink ancestors. Record
existing ancestor device/inode identities and recheck before allocation and
publication. Vanished recorded parents must not be silently recreated. Create
only missing parents with 0700; leave existing directory modes unchanged.

Serialize one complete newline-terminated report and enforce the unchanged
consumer's 1 MiB receipt ceiling before any output allocation. Create exclusive
same-directory random staging at 0600. Handle short/zero writes, allocation,
stat, read and close faults without losing ownership tracking. Close/reopen
with no-follow/nonblocking checks; verify regular-file identity, bounded full
bytes, metadata and independently parsed consistency. Reject replacement,
growth/truncation and byte/semantic tampering before publication.

Publish through exclusive atomic hard link. Never overwrite via rename, truncate,
remove retained evidence or add a destructive fallback. Existing and late racing
files/links/directories survive unchanged. Cleanup only owned descriptors and
provably owned staging; preserve foreign replacements and published receipts.
Retain retryable ownership through close/unlink failure, attempt bounded cleanup,
and retain nonzero status even after a successful retry. Never recursively remove
parent directories. Publication or output/cleanup failure after publication must
preserve the published receipt and stay nonzero.

Record hard-link support, interrupted/orphan staging, conservative cleanup,
ancestor-race limitations, same-UID administrator limits and absence of durable
crash recovery. No new process/signal framework or shared publisher extraction.

### 5. Complete output and truthful exit status

Use fixed diagnostics for invocation, source/parser, projection/serialization,
publication, cleanup and stream faults. Exclude rejected tokens, raw source,
output paths, stacks and OS/parser error text from diagnostics; the intentional
source identity fields described above remain in complete reports.

Replace immediate exits after output with natural draining using verified
`process.exitCode` and stream callback/error handling. Success requires valid
invocation, completed passing evaluation, requested publication, cleanup and
output. Evaluated/source-failed JSON must drain fully and exit nonzero. Broken
pipes and synchronous/asynchronous stdout/stderr failures must exit nonzero
without uncaught stacks or recursion. Do not let a later write reset failure.

### 6. Hermetic tests and actual-child integration

Keep existing well-formed direct policy tests, four exports, content/path behavior,
quoted hashtags, routing/proxy/SigV4 invariants and HSTS cases. Compare baseline
verdicts/counts/route order against the planning commit using bounded well-formed
fixtures. Test missing closing supported blocks separately as deliberate malformed
input rejection. Avoid dependence on Caddy/network runtime semantics.

Use existing `node:test`, disposable installation roots, `process.execPath`, finite
timeouts, fixture-only Caddyfiles and finally teardown. Allowlist environments;
exclude credentials, proxy variables, NODE_OPTIONS, BASH_ENV and ENV. Scoped
deterministic fault hooks must restore before teardown. Do not introduce public
test-only APIs, privilege-dependent unreadability tests or flaky timing races.

Cover strict complete argv before any source/output work; help/import; default
installation versus changed caller cwd; spaced/relative/literal paths and attached
output; malformed direct shapes/types; regular source symlinks; special, missing,
oversized, growing/replaced/truncated sources; read/close faults; inline byte limits;
supported block/entry bounds and placeholder/quote preservation.

Cover passing and real predicate/source-failed human/JSON/save parity, private
canaries in headers, timeouts, email, comments, malformed directives/errors and
unexpected upstreams. Required target identity retention is an explicit exception,
not a failed redaction claim. Ensure unsafe domain projection does not echo private
values and route redaction never changes pass/fail counts.

Cover no-save allocation absence, invalid output rejection before source reads,
retained/racing destinations, ancestor identity changes, new/private modes,
short/zero writes, exclusive staging collisions, foreign staging preservation,
readback tampering, each publication fault family, close/unlink retry, oversized
serialized receipt rejection before allocation and output faults after publication.
Use slow bounded readers and finite sufficiently large valid JSON to prove drain
on both success and failure, rather than assuming console output is synchronous.

Install the real Caddy child in the existing unified-runner fixture; retain all
other deterministic stage stubs and use a real fixture template. Exercise passing
template, source-derived policy failure, malformed supported block, and controlled
child-only source fault. Parent preflight shares the Caddyfile, so inject faults
after parent validation or use actual child read faults; do not weaken parent
checks to reach the child. Assert registered receipt name, actual child exit,
target identity, twelve-route success versus truthful failed counts, complete
receipt, Stage 3 status and deployment baseline/compliance. A nonzero child must
prevent the subsequent deployment command from implying Stage 3 success.

Test unchanged `validateCaddyRoutingReport` accepts a structurally passing
simulation without live requirements, rejects failed/source-failed reports and
rejects all simulations when `requireLive` is true. Include materialized fixture
domain and `--allow-hsts` matching without real HSTS activation. Do not weaken
dossier/readiness predicates or relabel fixture acceptance as production evidence.

## Non-goals and remaining gates

No live DNS, TLS handshake, certificate inspection, HTTPS requests, Caddy/Docker
execution, deployment, HSTS activation, source confinement, full Caddy parser,
cryptographic provenance, live operator evidence, launch approval, dependency
remediation, scanner/CI redesign, application changes or push. Static parser and
permissive well-formed matching limits remain explicit. Prompt 201, Phase 12,
Category 1 and dependency advisories remain unresolved.

## SKILLS USED

- `deployment-pipeline-design`: Stage 3 child/exit/receipt compatibility.
- `secrets-management`: Source-derived diagnostics and credential-free fixtures.
- `security-best-practices`: Safe CLI/artifact handling; no dedicated Node CLI reference.
- `error-handling-patterns`: Controlled faults, resource ownership and output drain.
- `javascript-testing-patterns`: Behavior tests, baseline parity and deterministic faults.
- `e2e-testing-patterns`: Focused actual-child integration with isolated teardown.
- `requesting-code-review`: Mandatory independent review after self-verification.
- `receiving-code-review`: Verify feedback, fix valid issues and re-review material changes.
- `caveman-commit`: Required concise local Conventional Commit without push.

Phase-wide Nest, architecture/topology, CI, telemetry/Grafana, SQL, SAST,
Playwright and UI skills do not trigger in this bounded CLI step. Reassess if
scope expands. Re-read every named skill on approval before editing. The existing
threat model was consulted; this task requests no separate threat assessment.

## Verification, documentation, review and completion

Record BASE_SHA, branch and worktree status; preserve unrelated work. Run:

```bash
node --check scripts/ops/verify-caddy-routing.js
node --check scripts/ops/verify-caddy-routing.spec.js
node scripts/ops/verify-caddy-routing.js --help
npm run ops:caddy-test
npm run ops:launch-drill-test
npm run ops:readiness-test
npm run ops:launch-readiness-test
npm run ops:deployment-test
npm run ops:volume-test
npm run ops:templates-test
npm run ops:templates
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Typecheck/build run sequentially. Use installed Prettier for changed JS and this
prompt; format new documentation regions without rewriting history. Quote actual
outputs/exits and aggregate failures/unreached stages; run affected suites
independently when the aggregate stops. The recorded predecessor audit failure
is context, not a current check result. Do not upgrade dependencies or bypass
audit. No unstubbed deployment/unified drill is authorized by this prompt.

Inspect complete changed files/diff. Dispatch one read-only independent reviewer
with the loaded review template, approved prompt, requirements, BASE_SHA/HEAD_SHA,
uncommitted diff, checks, retained identity fields and limits. Reviewer must not
mutate or delegate. Verify feedback with `receiving-code-review`, fix valid
findings, re-test and seek follow-up review for material publication/parser or
evidence-boundary changes. Resolve Critical/Important findings before completion.

Record final contracts, baseline parity, actual results, review and limits in the
owning docs, keeping production gates open. Rollback is a reviewed normal revert
preserving retained receipts. Give safe root inspection commands: standalone
help and `npm run ops:caddy-test`. Saved evidence requires a fresh restricted path;
never instruct deletion/overwrite of retained receipts. Stage only approved files,
inspect the staged diff and commit locally to `main` with `caveman-commit`.
No push. Prompt preparation authorizes no implementation, installation, migration,
staging or commit.
