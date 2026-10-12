# Phase 12K — Validate storage listing maximum key counts

## Scope, sequence and authorization

Continue the earliest open phase, Phase 12K recovery-evidence hardening in
`docs/build-plan.md` §§13–14, after committed Prompt 321 (`75efc96`). Code and
history confirm existing page/count/pagination/prefix defenses. Worktree began
clean on main. A synthetic probe returned one object from a terminal page with
`MaxKeys: 0`; the current adapter accepts contradictory declared capacity.
Validate optional page maxima before using the inventory as recovery evidence.

The user requested that after Prompt 321 finishes, write and implement the next
prompt too, using high effort. That supplies approval: write/re-read this prompt
and execute it without another approval question. This is the one follow-on
prompt authorized by that instruction.

## References and verified authority

Read `AGENTS.md`, `docs/build-plan.md` §§13–14 and Prompt 321 record,
`docs/skills.md`, `docs/operations.md` Stage 7 and recent reconciliation records,
`docs/launch-checklist.md` Category 6, `docs/security.md` TM-19/reconciliation
boundary, `docs/system-architecture.md` adapter and database authority, and
`docs/product.md`. Inspect `scripts/ops/reconcile-storage-objects.js`, `.spec.js`,
`.ts` and root `package.json`. Installed
`node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts`,
`ListObjectsV2Output`, declares `MaxKeys?: number | undefined` and states the
response may contain fewer keys than this maximum but never more; KeyCount is
also documented as no greater than MaxKeys. Existing flat-list validation rejects
nonempty CommonPrefixes and checks optional KeyCount equals Contents length.

No visual surface, measurements, application routes, Next/React/Tailwind/Nest
code or SQL changes. No skill supplies standalone Node CLI documentation;
repository code, installed SDK declarations and local Node probes are the
verified API authority. The security skill has no standalone Node CLI reference.

## Behavior and compatibility contract

For each response, validate supplied `MaxKeys` before entry conversion or further
pagination, beside the existing KeyCount/page metadata validation:

1. Omitted/undefined MaxKeys remains accepted, preserving current optional SDK
   semantics and compatible providers/test doubles.
2. Defined MaxKeys must be a nonnegative safe integer and at least the flat
   Contents array length (zero for absent Contents). No coercion. Null, numeric
   strings, fractions, negatives, infinities, NaN, unsafe integers, bigints,
   symbols, booleans, arrays, objects and boxed numbers reject.
3. Zero (including JavaScript negative zero) is valid for empty pages. Positive
   maxima may exceed returned count; this is a maximum, not an exact count.
   Accept large safe maxima, including values over 1000, without inventing a
   provider-specific cap. Existing KeyCount equality gives transitive consistency.
4. Do not infer terminal status from MaxKeys or count. Preserve explicit
   IsTruncated and continuation-token rules, including valid empty intermediate
   pages. MaxKeys can differ between pages; validate each independently.
5. First/later invalid pages reject the whole inventory immediately with fixed
   `Object storage listing is invalid or incomplete`; no partial result or
   further pagination. Runner returns 1 with fixed
   `Error: Object storage connection or listing failed`, no summary or receipt.
6. Caller-owned/frozen responses remain unmodified; keys, sizes, checksums and
   dates retain existing conversion and validation.

This detects contradictory declared page capacity, not provider honesty, total
inventory completeness, object-byte integrity or atomic DB/storage snapshots.
Non-goals: change requested MaxKeys/defaults, fixed AWS/Garage caps, Name echoes,
entry-prefix checks, request-input redesign, signature/facade/CLI/SQL/schema,
comparison/report/publication/Stage 7/dependency changes, network/resource caps,
hostile getters/proxies, live operations, deployment, push or launch approval.

## Target changes and implementation sequence

1. Extend `scripts/ops/reconcile-storage-objects.spec.js` using bounded
   listingClient/createIo/inventoryDbRecord and isolated temporary directories.
   Run direct focused tests before source changes to demonstrate red.
2. Parameterize invalid types/non-safe/negative/fractional maxima. Verify fixed
   errors and no coercion. Test both initial and later invalid pages; later
   failures must stop at two requests even when advertising a third page.
3. Test well-typed contradictions (0 with one entry, 1 with two entries), with
   omitted and supplied accurate KeyCount. Include empty/populated/frozen pages,
   omitted/undefined maxima, zero/-0 for empty pages, equal/greater maxima,
   Number.MAX_SAFE_INTEGER and >1000 compatibility. Verify per-page varying
   maxima, empty intermediate pages and stable request input (no MaxKeys added).
4. Add runner initial/later contradiction cases asserting exit 1, fixed errors,
   connection log only and empty output directory. Add a clean valid multi-page
   simulation receipt case with matching database evidence.
5. Add a compact guard in `scripts/ops/reconcile-storage-objects.js` using
   Number.isSafeInteger, nonnegative and Contents-length bound; preserve all
   existing 837 tests and contracts without weakening assertions.
6. Format changed regions only with existing single-quote/arrow-parens conventions.

## Verification, review and completion

Re-read this prompt and reload every listed skill before source changes. Run:
focused red/green direct Node tests and normal `npm run ops:reconcile-test`;
source/spec `node -c`; CLI --help; changed-region Prettier; `git diff --check`;
root `npm run lint`, `npm run typecheck`, permitted `npm run build`. Run all
33 independent offline stages from ops:check, omitting only online ops:audit
under the recorded metadata-disclosure restriction. Inspect every result; claim
neither aggregate ops:check success nor a fresh vulnerability inventory.
Readiness example must retain expected exit 1, 0 approved / 11 blocked / 70 blockers.

After self-verification and full diff inspection, dispatch one high-effort
independent read-only reviewer using requesting-code-review. Supply base/head
75efc96 plus working diff, this prompt, SDK semantics and actual checks. Evaluate
with receiving-code-review; verify/fix valid issues and re-test, re-review
significant changes. Record measured results, red/green evidence, compatibility,
sandbox limits and ordinary commit-revert rollback in docs/operations.md. Add
concise evidence to docs/build-plan.md, Category 6 of docs/launch-checklist.md
and docs/security.md. Prompt 201, Category 6 live approval and Phase 12 exit stay
open. Stage only prompt, source/spec and four docs, inspect staged diff, commit
locally to main using caveman-commit with a properly multiline rationale. Return
both task commits and safe local test/help commands. No further prompt or push.

## SKILLS USED

- `architecture-patterns`: preserve adapter and pure comparison boundaries.
- `deployment-pipeline-design`: preserve recovery evidence launch gates.
- `error-handling-patterns`: whole-inventory rejection and sanitized failures.
- `secrets-management`: keep provider values out of diagnostics.
- `security-best-practices`: strict untrusted metadata validation.
- `javascript-testing-patterns`: bounded adapter and runner behavior tests.
- `requesting-code-review`: independent high-effort review after checks.
- `receiving-code-review`: verify and evaluate feedback before fixes.
- `caveman-commit`: required local Conventional Commit with security rationale.
