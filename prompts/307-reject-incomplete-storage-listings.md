# Phase 12K — Reject incomplete storage listings

## Scope and why this is next

Continue the unfinished Phase 12 operations exit gate in `docs/build-plan.md`
§§13–14 from `15cd24387ce7e7e94185222cf6797db4f4dbac00`. Receipt publication
is hardened by committed Prompt 306; the preceding S3 inventory boundary still
accepts incomplete data. A bounded, network-free planning probe returned zero
objects successfully for `{ IsTruncated: true, Contents: [] }` without a next
token. A repeated-token probe made five requests before its fixture stopped it.
Neither establishes a production incident. Complete inventory is required
before a reconciliation receipt can be trusted even as a simulation preflight.

The user requested implementation immediately after planning. Write and re-read
this prompt, then execute without another approval question.

## References read

- `AGENTS.md`: workflow, phase controls, prompt contract and commit rules.
- `docs/build-plan.md` §§13–14 and committed Prompts 305–306 records.
- `docs/skills.md`: scope-specific skill selection.
- `docs/operations.md`: restore/reconciliation runbook, Phase 12F and Prompt 306.
- `docs/system-architecture.md` §11: recovery and diagnostic boundaries.
- `docs/security.md`: Category 6 evidence integrity and Prompt 306 boundary.
- `docs/launch-checklist.md` Category 6 and publication guidance.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js` and `.ts` facade.
- `scripts/ops/run-launch-drills.sh` Stage 7 and
  `scripts/ops/assemble-launch-dossier.js` reconciliation consumption.
- `package.json`: existing checks and their offline independence.
- Installed `node_modules/@aws-sdk/client-s3/dist-types/commands/ListObjectsV2Command.d.ts`
  and `models/models_0.d.ts`: command input, object records, `IsTruncated`,
  `Contents`, opaque `NextContinuationToken` semantics. Fields are optional in
  SDK types; this evidence producer deliberately requires an explicit boolean
  terminal/truncation signal and valid object identity/size instead of guessing.

No visual surface or measurements change. Next.js, React, Tailwind, NestJS,
database schema/queries, CI, telemetry and provider configuration stay outside
scope. No skill specifically documents S3 pagination; use installed SDK source
as the verified API authority and fake clients as behavior evidence.

## Expected impact and non-goals

Only the S3 listing adapter and its tests change, plus owning documentation.
No product routes change. Preserve public signatures, CLI flags, JSON schema,
reconciliation policy, receipt publication, Stage 7 caller and mode semantics.
Malformed/truncated listings must reject before comparison/receipt publication.

Do not introduce arbitrary capacity/page limits, retry policy, timeouts, S3
mutation, content fetching, checksum attestation, client lifecycle refactoring,
organization scoping changes, dependencies or a new abstraction. Repeated-token
detection bounds cycles, not indefinitely many distinct tokens or stalled
network requests. A complete listing is not an atomic DB/S3 snapshot; concurrent
writes and independent operator live acceptance remain outside this change.
No live drill, secrets access, deployment, push or online dependency audit.

## Implementation steps

1. Add tests first to `scripts/ops/reconcile-storage-objects.spec.js` using the
   existing Node test runner and injected `send` clients. Import the already
   exported `listBucketObjects`. Bound fake responses by request count so the
   red repeated-token tests cannot hang even before the fix. No sleeps/network.
2. In `listBucketObjects`, validate every response is a non-array object with
   boolean `IsTruncated`. Accept omitted `Contents` as an empty page; reject
   null/non-array `Contents`. Validate each listed entry is a non-array object
   with a nonempty string key and nonnegative safe-integer numeric size.
   Reject duplicate keys across or within pages rather than silently letting
   the comparison map overwrite conflicting observations. Keep valid zero-byte
   directory-marker objects and all opaque key text unchanged.
3. Preserve optional timestamp conversion, rejecting supplied values that are
   not valid Date objects rather than allowing invalid timestamp exceptions to
   cross the adapter as raw diagnostics. Preserve existing optional checksum
   conversion without introducing claims that ListObjectsV2 verifies content.
4. For every truncated page, require a non-whitespace string next token.
   Preserve it byte-for-byte when passed to the next command. Track previously
   issued tokens in a Set and reject same-token or longer cycles before sending
   the repeated request. Empty pages with a new token are valid. Stop only on
   explicit `IsTruncated: false`; ignore a terminal page's unused next token.
5. Throw fixed value-free validation errors without interpolating tokens,
   bucket/endpoint, keys or provider responses. Preserve `main`'s existing
   fixed listing-error boundary and return code 1. No receipt, staging file,
   clean-summary output or success message may be emitted for a failed listing,
   including failure after earlier valid pages. Do not change filesystem code.
6. Leave the TypeScript facade unchanged unless a public signature changes
   (none is planned). Keep changes local to the adapter; no general paginator.

## Acceptance tests

- Explicit terminal empty page with omitted or empty Contents returns `[]`.
- Valid multi-page sequence aggregates all keys, sizes and optional dates;
  every command preserves Bucket/Prefix and uses the exact previous token.
- Empty intermediate page and opaque token containing whitespace work.
- Malformed response/boolean/Contents/entry/key/size/date rejects with fixed
  diagnostics; zero size and significant key whitespace stay valid.
- Truncated missing, empty, whitespace-only and non-string tokens reject.
- Repeated token and A→B→A cycle reject before another repeated request.
- Duplicate keys within/across pages reject, including conflicting sizes.
- A valid first page followed by malformed data or provider rejection rejects
  the entire listing, never returning partial results.
- `main` returns 1 with its fixed listing error, no receipt/staging artifact and
  no reconciliation summary for malformed pages/cycles/provider failures.
  Include private sentinel tokens, keys and provider errors to prove no leaks.
- `main` with a valid multi-page client writes the existing simulation JSON
  shape at a fresh path and returns the existing reconciliation exit status.
- Retain all 54 existing tests and unchanged launch/dossier/readiness suites.

## Verification and completion

Load every named skill before implementation; reuse already-read content unless
context was lost. Run `npm run ops:reconcile-test`, `npm run ops:templates`,
`npm run ops:launch-drill-test`, `npm run ops:readiness-test`, `npm run lint`,
`npm run typecheck`, `npm run build`, `node --check` for changed JS, selected
new/changed-region formatting and `git diff --check`. Run each independent
offline `ops:check` stage with recorded individual result; omit only online
`ops:audit` under the standing metadata-disclosure restriction. Quote actual
outputs, report environment limitations and never claim full ops:check or live
acceptance from the offline suite.

After self-verification, use `requesting-code-review` to dispatch an independent
read-only reviewer with baseline SHA, working diff, this prompt and checks.
Use `receiving-code-review` to verify findings and fix valid issues; re-review
significant changes. Then record final behavior, probes, actual checks,
compatibility/limitations and ordinary revert rollback in `docs/operations.md`;
add a concise `docs/build-plan.md` record, Category 6 operator guidance in
`docs/launch-checklist.md` and a narrow boundary update in `docs/security.md`.
Phase 12 and Prompt 201/operator sign-offs remain open.

Stage only these seven task files (prompt, adapter, spec, and four docs),
inspect staged diff, and commit locally to main using
`caveman-commit`. Give safe help/test commands in the final reply; no push.

## SKILLS USED

- `architecture-patterns`: preserve adapter versus pure comparison boundaries.
- `deployment-pipeline-design`: preserve Stage 7 failed-gate semantics.
- `error-handling-patterns`: fail on incomplete inventories without partial success.
- `secrets-management`: keep private tokens/keys/provider diagnostics out of errors.
- `security-best-practices`: validate external inventory before evidence generation; no standalone report.
- `javascript-testing-patterns`: bounded fake-client and receipt integration regressions.
- `requesting-code-review`: independent review after self-verification.
- `receiving-code-review`: verify and resolve review findings.
- `caveman-commit`: required local Conventional Commit with rationale.
