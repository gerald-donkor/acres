# Phase 12K — Reject duplicate database object keys

## Scope and why this is next

Continue the open Phase 12K recovery-evidence gate in `docs/build-plan.md`
§§13–14 after committed Prompt 311 (`9e70d45`). The repository is clean on
`main`. The shared inventory boundary rejects repeated database IDs but still
accepts different IDs sharing an object key. A synthetic planning probe returned
`status: "clean"`, `matchedObjects: 2`, `totalBucketObjects: 1`, `exitCode: 0`;
the query adapter also accepted both rows. This is a reproducible local evidence
gap, not an observed production incident.

The user instructed implementation after planning. Write and re-read this file,
load its skills for execution, then implement without another approval question.

## References and verified authority

- `AGENTS.md`: next-unit selection, prompt, verification, review and commit.
- `docs/build-plan.md` §§13–14 and the recent committed implementation records.
- `docs/skills.md`: bounded continuation skill selection and local skill paths.
- `docs/operations.md`: recovery topology and Prompts 305–311.
- `docs/launch-checklist.md` Category 6: simulation versus live approval.
- `docs/security.md`: recovery inventory/evidence and diagnostic boundaries.
- `docs/system-architecture.md` §§11.3–11.4: recovery and diagnostic policy.
- `docs/product.md`: product roles and journeys remain unchanged.
- `server/prisma/schema.prisma`, `StoredObject`: `objectKey String @unique`.
- `server/prisma/migrations/20260824170000_storage_queues_uploads/migration.sql`:
  the implemented `"objectKey" text NOT NULL UNIQUE` constraint. Uniqueness is
  global, not scoped by organization or bucket. Read these files only.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js`, `.ts`: validation,
  comparison, query adapter, injected runner, publication and facade.
- Root `package.json`: actual scripts and independent offline operations stages.

No visual surface or measurement changes; no comps or Next/React/Tailwind APIs
are involved. No installed skill specifically owns framework-free Node Set
validation; use inspected source and runtime probes. The security skill has no
standalone Node CLI reference; apply its general secure-input principles.

## Impact, compatibility and non-goals

Reject a complete database inventory containing repeated exact `objectKey`
strings, even when IDs, buckets, organizations, states or metadata differ.
Do so before filtering, lifecycle exclusions, query normalization or injected
service acquisition. Reuse `Database inventory is invalid` and existing fixed
runner errors. Invalid inventories must produce no summary or receipt.

Preserve exact, case-sensitive opaque key semantics: do not trim, lowercase,
normalize paths or Unicode, concatenate composite identities, or coerce values.
Distinct valid keys remain valid, including case/whitespace/path/Unicode
differences and keys resembling object prototype property names. Existing
repeated-ID and storage-key rejection remains intact. Arrays/records remain
caller-owned and work when frozen. Empty inventories remain valid.

No routes, CLI flags, SQL, schema/migrations, exports/signatures, TypeScript
facade, report schema/modes, comparison/exclusion policy, listing behavior,
receipt publication, dependencies or Stage 7 caller change. No checksum
algorithm changes, cross-field lifecycle rules, new bucket scope semantics,
content acquisition/hashing, snapshot/authenticity claims, resource caps,
hostile getters/proxies, live services, online dependency audit, deployment,
push or launch approval.

## Implementation steps

1. Add focused behavior regressions before changing source, retaining all 475
   existing tests. Demonstrate different IDs sharing one key cannot both match
   one storage entry. Cover conflicting sizes/checksums, cross-organization and
   cross-bucket duplicates and a nonadjacent duplicate following valid rows.
2. Extend private `validateInventory` with a database-only Set of exact object
   keys. Check each key only after required string identity validation, reject
   duplicates using the existing value-free error, then record it. Leave ID and
   storage-key checks and all other metadata validation in place. Use O(n)
   validation time and O(n) auxiliary memory, without mutating input.
3. Prove duplicates reject before bucket, organization, prefix, ignore,
   pending, deleted, expired and quarantine policies can hide either record.
   Assert the same fixed error without key, ID, organization or bucket leakage.
4. Test `queryDatabaseStoredObjects` whole-result rejection with a valid prefix
   and duplicate later row; assert one query and no partial return. Preserve
   valid unique-row bigint conversion and exact key spelling.
5. Test `main` invalid injected duplicate inventories before either pg/S3 client
   is touched, both with storage injected and with storage acquisition pending.
   Test queried duplicate rows before S3 acquisition. Assert exit 1, exact
   sanitized error, no formatted summary/success message, and empty temporary
   output directory. Use synthetic private sentinels, never real credentials.
6. Cover distinct opaque keys (case, whitespace, path syntax, Unicode, prototype
   names), frozen caller ownership, empty inventories, unchanged exclusion
   counts and successful unique-row simulation receipt publication. Do not
   accept duplicate keys across buckets: the DB constraint is global.

## Verification and completion

Re-read this file and invoke every named skill before writing code. Run focused
red/green `npm run ops:reconcile-test`, selected-region Prettier checks, both JS
syntax checks, help, `git diff --check`, `npm run lint`, `npm run typecheck` and
`npm run build`. Keep actual logs under `/tmp`; report failures and permitted
unchanged retries accurately. Run each independent offline stage from
`ops:check` and inspect every result. Omit online `ops:audit` under the standing
metadata-disclosure restriction; do not claim aggregate `ops:check` success or
a fresh vulnerability inventory. Check the example readiness validator remains
fail-closed without modifying readiness or operator values.

Self-review the complete implementation and diff, then dispatch one independent
read-only reviewer with base/head SHA (`9e70d459fee00093e833b5ca519505e2c52e193f`
plus the uncommitted working diff), this prompt, the schema constraint, exact
compatibility contract and actual checks. Apply `receiving-code-review`, verify
findings before fixes, and re-review significant changes.

After review record behavior, synthetic reproduction, compatibility, actual
checks, limits and ordinary commit-revert rollback in `docs/operations.md`;
add concise records to `docs/build-plan.md`, Category 6 of
`docs/launch-checklist.md` and `docs/security.md`. Prompt 201, Category 6 live
approval and Phase 12 exit remain open. Stage only this prompt, the JS utility,
its spec and these four docs; inspect the staged diff and commit locally to
`main` using `caveman-commit`. Return commit ID and safe help/test commands.

## SKILLS USED

- `architecture-patterns`: preserve pure validation/comparison and adapter boundaries.
- `deployment-pipeline-design`: keep recovery evidence gates fail-closed.
- `error-handling-patterns`: reject contradictory inventory before success/publication.
- `secrets-management`: retain value-free inventory and connection diagnostics.
- `security-best-practices`: secure-by-default evidence identity validation.
- `javascript-testing-patterns`: behavioral rejection, compatibility and runner tests.
- `requesting-code-review`: independent review after self-verification.
- `receiving-code-review`: verify feedback before fixes and re-verification.
- `caveman-commit`: required local Conventional Commit with integrity rationale.

Other full-phase skills are conditional for this bounded continuation: no server
framework, SQL/schema changes, CI, telemetry, Grafana, SAST, browser/E2E, UI or
durable architecture decision change. Load the owner if scope changes.
