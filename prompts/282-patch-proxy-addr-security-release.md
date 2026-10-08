# Phase 12K — Patch the proxy address security release

## Scope and why this is next

Continue Phase 12 after committed prompt 281 (`60c4aab`). Its fresh production
audit recorded 36 findings (9 moderate, 26 high, 1 critical), with the sole
critical finding on `proxy-addr` 2.0.7. The current installed tree and root
lockfile resolve that version for both Express 4.22.2 beneath `@apollo/server`
and Express 5.2.1 beneath the Nest/Express 5 integration. The maintainer's
[GHSA-jqcg-44mw-7w3h](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h)
marks `>=1.1.0 <2.0.8` affected and 2.0.8 patched. Repair this one transitive
dependency family and re-evaluate the fail-closed production audit. The
historical counts are a baseline, not a prediction of the next audit result.

The advisory concerns IP spoofing when a trust subnet uses IPv4-mapped IPv6
with a short prefix (or another zero-prefix IPv6 subnet). The current
`server/src/app.setup.ts` does not configure Express `trust proxy`;
`docs/backend.md` explicitly leaves production reverse-proxy trust and
client-IP-aware throttling as operator conditions. Therefore the installed
affected version is certain, while exploitable configuration in a deployed
environment is **not established**. Do not claim either live exploitability or
live safety from repository inspection alone. This patch does not close that
independent production trust-boundary condition.

## References and preconditions

- `AGENTS.md` §§2–7, 8.2 and 10: phase-control, prompt, checks, review and
  local-commit contract.
- `docs/build-plan.md` §§13–14 and prompt 281 record: Phase 12 exit gate and
  latest committed step.
- `docs/operations.md` Prompt 281 and Prompt 263: latest audit inventory and
  fail-closed audit command.
- `docs/backend.md` §§5 and 6 plus the later throttling trust-boundary note:
  Express `req.ip`, in-process throttler and deployment condition.
- `docs/security.md` TM-18/TM-20 and `docs/launch-checklist.md`: supply-chain,
  DoS and operator-owned launch requirements.
- `docs/skills.md`: locked skill paths and triggers.
- `server/package.json`, root `package.json`, `package-lock.json`,
  `server/src/app.setup.ts`, `server/src/main.ts`,
  `scripts/ops/audit-dependencies.sh`, and the existing server HTTP tests:
  actual dependency, route and audit behavior.
- The maintainer advisory above and
  [proxy-addr 2.0.8 release](https://github.com/jshttp/proxy-addr/releases/tag/v2.0.8),
  rechecked at execution, plus npm registry metadata/integrity for the selected
  release. Confirm the current advisory and package state before mutation.

No §0 visual reference, comp crop, pixel measurement, design token or browser
breakpoint applies. The measurable targets are: every production `proxy-addr`
node in a clean installed dependency tree is at a version outside the
maintainer's affected range; the root lockfile and `npm ci` agree; the fresh
production audit has no finding for GHSA-jqcg-44mw-7w3h; and the actual
`ops:audit` exit and residual finding inventory are reported, without inferring
that other high findings are resolved. Keep 2.0.8 as the planned patch, unless
a newer compatible, maintainer-verified security release is confirmed during
execution and recorded with its reason.

## Expected impact and files

The intended implementation is a **minimal transitive lockfile update** of
`proxy-addr`, because the existing Express 4 `~2.0.7` and Express 5 `^2.0.7`
requirements admit 2.0.8. Confirm these ranges against the installed and
locked package metadata at execution. Do not add an otherwise unused direct
dependency or broad root override just to force an audit result. If npm's
supported update path cannot produce a narrow, reproducible lockfile change,
stop and document the exact blocker rather than hand-editing integrity fields.

Expected changed files are `package-lock.json`, this prompt, and the
implementation records in `docs/operations.md` and `docs/build-plan.md`.
Only change `server/package.json` or server source/tests if verified dependency
resolution or an observed regression requires it, and explain the expansion in
the implementation record. No public route, response shape, auth rule, IP
trust setting, throttling budget, UI, schema, CI threshold or deployment
configuration is intended to change. The API, worker and client must still
build from the new lockfile; existing server HTTP behavior must remain intact.

## Execution sequence

1. Re-read this prompt, the owning docs and all named skills. Check `main`,
   worktree status and `BASE_SHA`; preserve unrelated changes. Inspect the
   current `npm ls proxy-addr express --all`, `npm explain proxy-addr`, both
   Express dependency declarations in `package-lock.json`, installed/locked
   versions, and the server's `trust proxy`/`req.ip` use. Recheck the maintainer
   advisory and npm registry for the patched package. Verify npm update syntax
   against the installed npm CLI help or official documentation, not memory.
2. Run a fresh `npm audit --omit=dev --json` before mutation, retaining raw
   machine-readable data only in a private disposable `/tmp` path. Distinguish
   audit transport/registry failure from advisory findings. Summarize the
   critical advisory ID, package, path and fix availability without committing
   the raw report. If registry verification is unavailable, report the blocker
   and stop before claiming remediation.
3. Use npm's supported targeted transitive update/lockfile workflow to resolve
   `proxy-addr` to the patched 2.0.8 line. Inspect the full lockfile diff
   immediately for unrelated churn, altered manifest dependencies, nested
   vulnerable copies, registry URLs and integrity fields. Reject an accidental
   Express, Apollo, Nest, React, Next or Prisma migration. Prefer a narrow
   lockfile resolution; if npm cannot produce it, investigate and document the
   dependency constraint rather than using `npm audit fix --force` or editing
   the lockfile by hand. Recreate installation with `npm ci` and verify the
   complete tree, including both Express 4 and Express 5 paths.
4. Re-run the raw production audit and `npm run ops:audit`. Compare advisory
   inventory and counts with the pre-update result; record any newly observed
   critical/high findings and dependency paths. `ops:audit` must retain its
   existing `critical` threshold and `dev` omission. If it fails for another
   finding or transport error, record that truthfully and leave the launch gate
   open. Never suppress an advisory, reduce the threshold or infer safety from
   a clean package-tree grep alone.
5. Run the existing server HTTP tests that exercise bootstrap, health,
   authentication/CSRF, and throttling/IP behavior with their actual required
   fixtures. For any source change prompted by a concrete regression, read the
   installed Nest/Express API source or versioned docs first and add an
   observable regression test. A local test is not production proxy-topology
   evidence. Preserve the documented reverse-proxy trust and shared-throttling
   requirement for later operator inspection.

## Non-goals and remaining gates

Do not modify or simulate production traffic, configure `trust proxy`, change
Caddy/Compose or production secrets, deploy, run a live launch drill, sign off a
category, broaden remediation to the other high advisory families, or push.
The product's proxy topology and correct client-IP handling require separate
production evidence. Prompt 201, live operator sign-offs and Phase 12 exit
remain open until their own evidence and approval. A newly clear critical
audit is a repository gate result, not launch authorization.

## SKILLS USED

- `security-best-practices`: Apply the Express proxy-trust and dependency
  guidance without claiming unobserved production exploitability.
- `nestjs-best-practices`: Check Nest's Express adapter and server regression
  surface if the dependency update affects bootstrap or tests.
- `deployment-pipeline-design`: Keep the production audit fail-closed and
  separate package remediation from promotion approval.
- `javascript-testing-patterns`: Select meaningful server HTTP regression
  coverage and distinguish fixtures from live evidence.
- `requesting-code-review`: Dispatch an independent read-only diff and
  dependency-resolution review after self-verification.
- `receiving-code-review`: Verify reviewer findings against the actual tree,
  advisory and tests before fixes.
- `caveman-commit`: Write the required concise Conventional Commit message for
  the local `main` commit.

No new architecture, trust-boundary configuration, API design, SAST, CI,
observability, UI, browser automation or threat-model artifact is planned.
Reassess the skill manifest if a demonstrated regression requires expanding
scope. Re-read each named skill at execution.

## Verification, review, documentation and completion

Capture exact command outputs/exits, with `typecheck` and `build` run
sequentially. At minimum, run the following after the update:

```bash
npm ls proxy-addr express --all
npm explain proxy-addr
npm audit --omit=dev --audit-level=critical
npm run ops:audit
npm run ops:audit-test
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Run `npm ci` before final tree/build verification and the existing relevant
server HTTP/e2e tests with the required fixture or real test database. State
the exact test command, passed/failed counts and fixture scope. If the
aggregate `ops:check` stops at a distinct remaining advisory, identify its
unreached stages and run affected independent checks needed to verify this
change. Review all package and generated-file changes and use selected format
checks without reformatting unrelated docs. Do not claim a test passed from a
historical record.

After self-verification, dispatch a read-only reviewer subagent with the
approved prompt, maintainer advisory, old/new full dependency tree,
`BASE_SHA`/`HEAD_SHA`, changed files, audit outputs, test results and
no-production boundary. Use `receiving-code-review` to verify each finding;
fix valid issues, rerun affected checks and re-review any significant
dependency/source change. Record precise version, integrity, advisory, audit,
test and residual operator limits in `docs/operations.md`, with a concise
Phase 12K record in `docs/build-plan.md`. Rollback is a reviewed normal revert
of the dependency/lockfile commit, with affected-version exposure reassessed
before deployment. Stage only approved paths, inspect the staged diff, commit
locally to `main` using `caveman-commit`, and do not push. Preparing this
prompt authorizes no package install, implementation, staging or commit.
