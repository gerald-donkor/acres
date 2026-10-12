# Phase 12K — Validate storage listing prefix echoes

## Scope and why this is next

Continue the open Phase 12K recovery-evidence gate in `docs/build-plan.md`
§§13–14 after committed Prompt 320 (`7e3441d`). Git and code confirm the
pagination safeguards are built; the worktree began clean. A local synthetic
probe accepted `{ IsTruncated: false, Prefix: 'unexpected/', Contents: [] }`
for a bucket-wide request, returning `[]`. A provider reporting a different
prefix can supply an incomplete inventory that generates misleading missing or
orphan counts. Validate this existing adapter boundary before publishing evidence.

The user explicitly instructed execution when planning finishes. Write and
re-read this prompt, then execute without another approval question.

## References and API authority

Read `AGENTS.md`, `docs/build-plan.md` §§13–14 and recent implementation records,
`docs/skills.md`, `docs/operations.md` Stage 7 and Prompts 305–320,
`docs/launch-checklist.md` Category 6, `docs/security.md` reconciliation boundary,
`docs/system-architecture.md` adapter and database authority, and `docs/product.md`.
Inspect `scripts/ops/reconcile-storage-objects.js`, `.spec.js`, `.ts`, and root
`package.json`. Installed `node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts`
`ListObjectsV2Output` declares `Prefix?: string | undefined` as the prefix of
returned keys. Request construction sends `Prefix: prefix || undefined`.

No visual surface, measurements, routes, Next, React, Nest, SQL, or Tailwind
changes. No skill specifically documents this framework-free Node CLI; installed
SDK declarations, repository code and local Node probes supply API authority.
Security skill references contain no standalone Node CLI guide.

## Behavior contract

On every page, before entry processing or advancing pagination:

- Omitted/undefined `response.Prefix` stays accepted for existing compatible
  providers and test doubles.
- A defined echo must be a primitive string exactly equal to the effective
  requested prefix (`prefix || ''`). An empty string is valid for bucket-wide
  requests (omitted, undefined or empty request prefix).
- Explicit nonempty prefixes require exact string identity, including case,
  whitespace, Unicode and percent characters. Never trim, decode, normalize or
  coerce either side. Null, boxed strings, numbers, booleans, arrays, symbols,
  bigints and coercible objects reject as response echoes.
- Mismatches on first or later pages throw the existing fixed error
  `Object storage listing is invalid or incomplete`; no partial inventory returns
  and no further page is requested after detection.
- Through `main`, return exit 1, fixed `Error: Object storage connection or listing failed`,
  no summary and no evidence file. Valid echoes retain simulation publication.
- Do not mutate responses or request options; frozen fixtures remain supported.

Echo validation detects declared scope contradictions. It does not prove
provider honesty, atomic snapshots, or that every returned key satisfies a prefix.

Non-goals: entry-prefix enforcement, Name/MaxKeys validation, request argument
redesign, required echoes, public signatures/facade, CLI flags, SQL/schema,
comparison/report/publication policy, dependencies, Stage 7, live services,
network scans, deployment, push, operator approval or launch acceptance.

## Implementation steps and files

1. Add behavioral tests to `scripts/ops/reconcile-storage-objects.spec.js` using
   existing bounded `listingClient`, `createIo`, temporary directories and
   `inventoryDbRecord` conventions. Demonstrate red before source changes.
2. Cover invalid echo types and mismatched primitive strings under both bucket-wide
   and explicit prefixes. Cover later page mismatch with a valid first page and
   assert request count stops at two even when the bad page advertises another token.
3. Cover omitted/undefined echoes, empty bucket-wide echo, exact explicit echoes,
   frozen pages, populated and empty listings, multi-page request prefix stability,
   and opaque prefixes with whitespace/Unicode/percent characters.
4. Add runner tests for first/later mismatch that assert fixed errors, connection
   message only, empty evidence directory and exit 1. Add a valid explicit-prefix
   multi-page runner case publishing a clean simulation receipt.
5. In `scripts/ops/reconcile-storage-objects.js`, add a small guard beside existing
   page metadata checks: reject defined Prefix unless primitive string and equal
   to `prefix || ''`. Preserve all existing 781 tests without weakening assertions.
6. Keep changes formatted locally, avoiding unrelated legacy formatting.

## Verification and completion

Re-read this prompt and named skills before implementation. Run focused red/green
`npm run ops:reconcile-test`, `node -c` for source/spec, CLI `--help`, changed-region
Prettier checks and `git diff --check`. Run root `npm run lint`, `npm run typecheck`,
`npm run build`. Run each independent offline stage of `ops:check`, omitting only
online `ops:audit` under the recorded metadata-disclosure restriction; inspect
all results and do not claim aggregate ops:check success or a fresh audit.
Check `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`
retains 0 approved / 11 blocked / 70 blockers (expected exit 1).

Self-review full diff; dispatch one read-only reviewer using
`requesting-code-review` with base/head `7e3441d` plus working diff, this prompt,
SDK declarations, contract and actual checks. Evaluate with `receiving-code-review`,
fix valid findings, re-test and re-review significant changes.
Record results, compatibility limits, actual command output and ordinary revert
rollback in `docs/operations.md`; add concise evidence to `docs/build-plan.md`,
Category 6 of `docs/launch-checklist.md` and `docs/security.md`. Keep Prompt 201,
live Category 6 approval and Phase 12 exit open. Stage only prompt, source/spec
and those four docs; review staged diff and commit locally to main with
`caveman-commit`. Return commit and safe local test/help commands. No push.

## SKILLS USED

- `architecture-patterns`: preserve adapter and pure comparison boundaries.
- `deployment-pipeline-design`: preserve recovery evidence launch gates.
- `error-handling-patterns`: reject whole inventories and sanitize failures.
- `secrets-management`: keep private provider scope values out of diagnostics.
- `security-best-practices`: strict untrusted metadata validation.
- `javascript-testing-patterns`: bounded adapter and runner behavior regressions.
- `requesting-code-review`: dispatch independent review after self-verification.
- `receiving-code-review`: verify reviewer claims before making fixes.
- `caveman-commit`: required local Conventional Commit with rationale.
