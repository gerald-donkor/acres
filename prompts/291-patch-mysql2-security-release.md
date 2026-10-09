# Phase 12K — Repair Prisma's mysql2 dependency

## Scope and why this is next

Continue committed Phase 12K dependency hardening after `f278757` on clean
`main`. Repair transitive `mysql2` 3.15.3 to stable **3.24.5**. Prisma 7.9.1
pins mysql2 exactly, so use a root override scoped to `prisma@7.9.1`, preserving
Prisma and every workspace's direct versions. Remove this exception when a
supported Prisma release supplies a safe mysql2 itself. This is one bounded
remaining supply-chain repair, not a ranking of remaining exploitability.

The maintainer changelog records SQL object escaping hardening in 3.17.0 and
unbounded compressed-protocol decompression repair in 3.23.1. GHSA-rgwj-5xj2-c3m3
identifies <=3.23.0 as affected and 3.23.1 as patched. 3.24.5 incorporates these
repairs. Acres uses PostgreSQL through the pg adapter; transitive presence does
not establish customer exposure to the MySQL protocol. Braces 3.0.3 also remains
in the historical residual inventory, but the public registry still reports
3.0.3 as latest: do not invent a patched release or substitute a fork.

## References read

- `AGENTS.md`: phase control, prompt, verification, review and local commit rules.
- `docs/build-plan.md`: Phase 12 and recent Phase 12K dependency repair records.
- `docs/operations.md`: topology, dependency gate and Prompts 281–290 evidence.
- `docs/backend.md`: Prisma 7.9.1, PostgreSQL and scoped override precedent.
- `docs/system-architecture.md`: modular monolith and persistence boundary.
- `docs/security.md`: dependency threat boundary and TM-18.
- `docs/launch-checklist.md`: repository checks do not approve a live launch.
- `docs/skills.md`: project skill triggers and lock convention.
- `package.json`, `package-lock.json`, installed `prisma/package.json` and
  public mysql2 3.24.5 registry metadata (MIT; Node >=8; @types/node >=8 peer).
- https://github.com/sidorares/node-mysql2/releases/tag/v3.24.5
- https://github.com/sidorares/node-mysql2/blob/master/Changelog.md
- https://github.com/advisories/GHSA-rgwj-5xj2-c3m3

Registry tarball: `https://registry.npmjs.org/mysql2/-/mysql2-3.24.5.tgz`.
Verified metadata integrity:
`sha512-X6Ujsr2QSkkLpkQGjxzpKRAPn9nu4axpR63ntBzquFVEvPOArgbUQ1sJjFKI7hnaYtiVZxa17Z7q18KSubW0IQ==`.
No visual surface, measurements, Next API or Nest source API changes are planned;
static comps and framework guides are not applicable. There is no dedicated
dependency-update skill available; use primary release/package sources.

## Expected files and behavior

1. `package.json`: add only `"prisma@7.9.1": { "mysql2": "3.24.5" }` to overrides.
2. `package-lock.json`: npm-generated mysql2 repair and necessary dependency
   closure only. New mysql2 dependencies include sql-escaper and higher minimums
   for long, lru.min, iconv-lite, aws-ssl-profiles, named-placeholders. Remove old
   dependencies only if npm proves they have no other parent. Preserve unrelated
   resolutions and inspect every changed node, including peer metadata.
3. `docs/backend.md`: document exact scoped exception/removal condition.
4. `docs/operations.md`: record provenance, closure, semantic fixtures, actual
   check output, review, audit limitations and rollback.
5. `docs/build-plan.md`: append concise implemented evidence for Prompt 291.
6. This prompt, committed with implementation.
7. `AGENTS.md`: record the explicit current-task approval exception in workflow
   step 8, as required when the user overrides the usual approval pause.

No route, UI, DTO, schema, DB engine, deployment, audit threshold, scanner
suppression, provider or credential changes. No push or live operator sign-off.
User's current instruction explicitly authorizes execution after prompt writing;
do not ask for a redundant prompt approval. That exception applies to this task.

## Execution steps

1. Re-read this prompt and listed skills. Capture branch, base SHA, Node/npm and
   baseline manifest/lock in disposable `/tmp/acres-291`; preserve unrelated work.
2. Reconfirm exact Prisma parent pin, registry integrity and upstream repairs.
3. Add scoped override, then regenerate with npm using `--package-lock-only
--ignore-scripts --no-audit --no-fund`; never use forced audit fixes or invent
   integrity. Compare all lock nodes and reject unrelated upgrades.
4. Run `npm ci --no-audit --no-fund`; check lock hash before/after and
   `npm ls mysql2 --all`, verifying actual Prisma-relative resolution and peers.
5. Inspect installed README/types/source before writing disposable compatibility
   fixtures. Exercise real CJS/promise entrypoints, SQL escape/format (strings,
   identifiers, arrays and hostile object input), URI/IPv6 configuration,
   no-connect pool construction/closure, and compressed-protocol bounded inflate
   behavior using a small synthetic in-memory payload with explicit timeout.
   Assert outputs/errors; no production DB connection or large exploit payload.
   Verify Prisma generate/version/validate path and existing contracts unchanged.
6. Run formatting on changed JSON/prompt and appended doc sections without
   reformatting historical documents. Run `npm run lint`, `npm run typecheck`,
   `npm run build`, `npm run contracts:check`, `npm run ops:audit-test`, and
   `git diff --check`. Quote real successful output and any limitations.
7. Run independent offline operations stages from the existing `ops:check`
   script, omitting only online `ops:audit` while its metadata disclosure
   authorization remains pending. Do not call this a complete ops:check pass.
   Do not fetch a fresh npm audit without explicit authorization for disclosure
   of dependency metadata; preserve the baseline for a later audit comparison.
8. Self-review final dependency diff, then dispatch one read-only reviewer with
   requirements, changed paths, base SHA/current HEAD, unstaged diff and check
   logs. Evaluate feedback against actual code; fix valid findings and rerun
   affected checks; re-review significant fixes.
9. Record results in owning docs, inspect staged changes and commit only this
   scope to local `main` with caveman-commit. No push.

## Exit and rollback

Exit requires reproducible install, scoped dependency resolution, bounded real
library compatibility, passing repository checks, independent review and local
commit. Report blocked external checks accurately without claiming launch or
fresh audit clearance. Inspect with `npm ls mysql2 --all` from repository root.
Rollback is a reviewed normal revert of root manifest and lockfile together;
reassess affected-version exposure before deploying a revert. Phase 12, prompt
201, other dependency findings and operator sign-offs remain open.

## SKILLS USED

- `security-best-practices`: evidence-based dependency risk and unchanged controls.
- `javascript-testing-patterns`: real-library semantic compatibility fixtures.
- `deployment-pipeline-design`: preserve gates and reviewed rollback semantics.
- `sast-configuration`: preserve scanner policy and distinguish scan/audit evidence.
- `requesting-code-review`: dispatch independent read-only implementation reviewer.
- `receiving-code-review`: verify feedback before fixes.
- `caveman-commit`: required concise conventional local commit with security rationale.
