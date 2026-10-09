# Phase 12K — Repair deepmerge-ts lock resolution

## Scope and why this is next

Continue the committed Phase 12K dependency repairs from clean main at
`5044a7e`. The existing root override requires `deepmerge-ts ^8.0.0`, but the
lock and installed tree contain 7.1.5 under Prisma 7.9.1 / @prisma/config 7.9.1.
`npm ls deepmerge-ts --all` reports ELSPROBLEMS. Synchronize this existing
decision to verified stable **8.0.2**, without changing any manifest or override.

Maintainer GHSA-ggr8-5vv4-36mx / CVE-2026-40345 affects releases before 8.0.0:
recursive object graphs can exhaust the stack in merge APIs. This repairs an
inventory exposure and invalid tree; an attacker-controlled Acres config path
has not been established. Braces 3.0.3 remains separately unresolved: public
registry planning found no patched release. Do not invent a fix or suppress it.

## References read and verified

- `AGENTS.md`: numbered prompt, immediate-execution, checks, review and commit.
- `docs/build-plan.md`: Phase 12K, committed repairs through prompt 294.
- `docs/operations.md`: residual inventory, existing audit disclosure restriction.
- `docs/skills.md`: skill selection and paths.
- `docs/backend.md`, `docs/system-architecture.md`, `docs/security.md`:
  Prisma baseline, runtime boundaries, dependency and resource exhaustion risk.
- `docs/launch-checklist.md`: local evidence cannot approve production launch.
- Root manifests/lock, `server/package.json`, `server/prisma.config.ts`, installed
  deepmerge-ts manifest/README and @prisma/config manifest/loader source.
  The config loader dynamically imports deepmerge and passes it to c12.
- https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx
- https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0
- Public npm metadata verified this session for 8.0.0 and 8.0.2. Version 8.0.2
  remains BSD-3-Clause, requires Node >=16.9.0, has no runtime dependencies,
  and retains separate CJS/ESM exports and declarations.

No dedicated dependency-update skill exists; primary metadata owns version
facts. No component, route, styling, motion, visual measurement or schema changes
are planned, so visual references and frontend implementation skills do not apply.

## Expected files and behavior

1. This prompt, `prompts/295-repair-deepmerge-ts-lock-resolution.md`.
2. `package-lock.json`: only the deepmerge-ts node moves 7.1.5 to 8.0.2,
   including registry URL/integrity and verified engine metadata. Keep package
   classification intact; preserve every other node and manifest.
3. `docs/operations.md`: exact resolution, provenance, real outputs, compatibility,
   audit/environment limitations, review and rollback.
4. `docs/build-plan.md`: concise verified prompt 295 record.
5. `docs/backend.md`: explain synchronization of the existing override, its
   cross-major compatibility evidence and removal when upstream Prisma resolves
   a safe version itself. Do not claim upstream changed its exact 7.1.5 declaration.

All routes and application controls retain behavior. No runtime source, Prisma
upgrade, migration, production operation, online audit, deployment or push.

## Execution procedure

1. Re-read this prompt and all named skills before implementation. The user's
   instruction to implement immediately after writing supplies current approval.
   Save baseline lock and logs in disposable `/tmp/acres-295`.
2. Run targeted `npm update deepmerge-ts --package-lock-only --ignore-scripts
--no-audit --no-fund`. Inspect the entire JSON diff; reject unrelated nodes.
   Do not run broad update or audit fix, change overrides, or fabricate metadata.
3. Verify the repaired node against public npm metadata. Expected integrity:
   `sha512-uqbvqLUMrc6p0MO+WBRtTxY55hmyh94WRwI5a++PZe54X+bfVh59FSN7uWCBCW1CCVjzjnrwzfI8zidE2obMMw==`.
   Run `npm ci --no-audit --no-fund`; prove the lock hash stays unchanged and
   `npm ls deepmerge-ts --all` succeeds with Prisma's actual caller resolving 8.0.2.
   Preserve third-party install-script policy.
4. Read installed 8.0.2 documentation/source before writing disposable bounded
   fixtures. Verify CJS and ESM exports, nested records, arrays, undefined values,
   Maps/Sets, custom merging and merge-into behavior with real library calls.
   Test small self/mutual recursive graphs for all four advisory-named APIs in
   timeout-bounded subprocesses. Assert documented safe handling or deliberate
   rejection, never accept stack exhaustion; do not generate large attack inputs.
5. Exercise @prisma/config's real loadConfigFromFile with a synthetic no-secret
   config and check normalized schema/migration/datasource fields. Verify missing
   and malformed config handling. Run existing Prisma validate/generate and
   contracts checks without migration or database connections. Keep fixtures out
   of tracked application code and do not print local environment secrets.
6. Run selected Prettier, root lint, typecheck, build, and git diff --check.
   Derive independent offline operations stages from current ops:check and run
   them in order, omitting only ops:audit under the existing disclosure restriction.
   Quote actual outputs, failures and permitted reruns. Do not claim a fresh
   vulnerability count reduction or a complete ops:check pass.
7. Self-review then dispatch an independent read-only reviewer per
   requesting-code-review with baseline/current HEAD 5044a7e, actual unstaged
   diff, this brief and check logs. Evaluate findings with receiving-code-review;
   fix verified issues and recheck. Obtain follow-up review for significant fixes.
8. Record verified results in owning docs, inspect final/staged diff, and commit
   only this task locally on main using caveman-commit. Do not push.

## Exit, inspection and rollback

Require one-node lock scope, metadata integrity, reproducible install, valid
caller tree, safe recursive fixtures, Prisma config/CLI compatibility, repository
and offline operations checks, independent review and local commit.

Inspect from the repository root:

```bash
npm ls deepmerge-ts --all
```

Host checks do not prove Node 24, Docker, real database/browser or production
acceptance. Phase 12, prompt 201, other advisories and operator sign-offs remain
open. Rollback is a reviewed normal revert of the lock repair; it restores the
known vulnerable/invalid resolution, so reassess exposure before deployment.

## SKILLS USED

- `security-best-practices`: scoped dependency repair and evidence limits.
- `javascript-testing-patterns`: real-library recursive and config fixtures.
- `deployment-pipeline-design`: preserve release gates and rollback semantics.
- `sast-configuration`: preserve scanner policy and distinguish offline evidence.
- `requesting-code-review`: independent read-only review after verification.
- `receiving-code-review`: verify feedback before corrections.
- `caveman-commit`: conventional security commit and rationale.
