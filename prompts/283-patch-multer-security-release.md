# Phase 12K — Patch the Multer security release

## Scope and why this is next

Continue Phase 12 after committed prompt 282 (`81f4f73`). The critical
production dependency gate and complete `ops:check` now pass, but its recorded
audit still contains 35 findings: 26 high, 9 moderate, zero critical. Resolve
one remaining server dependency family: Multer, pinned to **2.2.0** by the
installed and locked `@nestjs/platform-express` **11.2.1**. This is a bounded
repository supply-chain repair under Phase 12's dependency-scanning target;
live launch sign-offs remain separate and open.

The maintainer's [crafted multipart field advisory](https://github.com/expressjs/multer/security/advisories/GHSA-wc9g-mqfw-jrwm)
affects versions below 2.3.0. The later
[aborted disk-write advisory](https://github.com/expressjs/multer/security/advisories/GHSA-3pph-fpjx-jg34)
affects `>=2.2.0 <2.4.0`. The
[2.4.0 release](https://github.com/expressjs/multer/releases/tag/v2.4.0)
repairs the latter and carries the earlier security changes. Plan **2.4.0**,
not an intermediate 2.3.0 repair. Reverify all current Multer advisories and
registry metadata at execution; these historical audit totals are not a fresh
audit or a guarantee of the next result.

Source inspection during planning found no Multer import or Nest multipart
interceptor in `server/src`. `UploadsController` accepts JSON metadata and
returns a signed PUT URL; file bytes go to object storage. Thus an affected
installed package is established, but a reachable Acres multipart parser or
deployed exploit is not. Preserve this distinction. Do not add a production
multipart route to demonstrate the package update.

## References and preconditions

Read these again before implementation:

- `AGENTS.md` §§2–7, 8.2 and 10: phase-control, checks, review and commit.
- `docs/build-plan.md` §§13–14 and Prompt 282 record: Phase 12 dependency
  hardening, committed state, and remaining exit conditions.
- `docs/operations.md` Prompt 281/282 and Prompt 263 records: residual audit
  inventory, complete aggregate verification and unchanged critical audit gate.
- `docs/backend.md`: npm workspace/dependency ownership and server behavior.
- `docs/system-architecture.md`: modular monolith, storage ports and separate
  API/worker runtime; this repair changes none of those decisions.
- `docs/security.md` TM-18/TM-20 and `docs/launch-checklist.md`: dependency/DoS
  threats and distinct operator acceptance.
- `docs/skills.md`: locked skill paths and triggers.
- Root `package.json`, `package-lock.json`, `server/package.json`, installed
  `node_modules/@nestjs/platform-express/package.json`,
  `server/src/app.setup.ts`, `server/src/uploads/uploads.controller.ts`,
  `server/src/uploads/uploads.controller.spec.ts`,
  `server/src/uploads/uploads.service.spec.ts`,
  `server/src/uploads/dto/uploads-dto.spec.ts`, `server/test/jest-e2e.json`,
  and `scripts/ops/audit-dependencies.sh`: actual runtime, tests and audit.
- Maintainer advisory index and the advisory/release links above, plus
  [npm root and parent-scoped overrides documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides).

No visual component, token, comp crop, breakpoint or pixel measurement is
involved. Measurements are package versions and resolution paths, registry
integrity, fresh audit identities/counts, clean-install reproducibility, test
results and exact check exits. No dedicated dependency-remediation skill is
installed; use the named security/Nest/testing skills and verified npm and
maintainer documentation rather than inventing package-manager behavior.

## Intended change and file boundaries

Unlike the prior `proxy-addr` repair, the adapter declares an **exact** Multer
version; a plain compatible-range transitive update cannot satisfy that pin.
Use npm's supported **parent-scoped root override**, retaining the existing
`deepmerge-ts` override:

```json
{
  "overrides": {
    "deepmerge-ts": "^8.0.0",
    "@nestjs/platform-express": {
      "multer": "2.4.0"
    }
  }
}
```

This overrides the adapter's child, not the adapter itself. Keep Nest,
Express, Apollo, Prisma, Next and all unrelated dependency versions unchanged.
Do not add Multer as an unused direct dependency or use a global override.
Record why the scoped exception is necessary and remove it in a later reviewed
change once the supported adapter itself resolves a safe Multer release.
If an adapter incompatibility or additional Multer parent makes this narrow
repair insufficient, report the verified blocker before broadening scope.

Expected changed files:

1. Root `package.json`: only the scoped override.
2. `package-lock.json`: npm-generated Multer resolution and its necessary
   dependency closure; review removed/shared child packages carefully.
3. This prompt, `docs/operations.md`, and `docs/build-plan.md`: precise
   implementation record and concise Phase 12K status.

Production source, API contracts, migrations, upload behavior, edge policy,
CI thresholds, readiness records and other manifests should remain unchanged.
Only add a focused regression test if an actual compatibility failure requires
one; inspect and verify the relevant installed APIs before writing it. Avoid
version-assertion tests or new unused product features.

## Execution sequence

1. Re-read the approved prompt, guidance, owning docs and every named skill.
   Establish branch `main`, clean/preserved worktree state and `BASE_SHA`.
   Inspect `npm ls multer @nestjs/platform-express --all`,
   `npm explain multer`, the adapter's declared dependency and all locked nodes.
   Repeat the import/interceptor/source search to check the exposure statement
   against the actual implementation. Inspect Multer construction in the
   installed adapter, including any default options whose compatibility matters.
2. Fetch a fresh production audit (`npm audit --omit=dev --json`) into a private
   disposable `/tmp` file, retaining no raw report in git. Enumerate the Multer
   advisory IDs, severity, affected ranges, paths and npm's proposed remedies.
   Recheck the maintainer's advisory index and 2.4.0 registry manifest,
   engines, tarball and integrity. Distinguish registry/transport failure from
   a successful audit containing advisories. Stop before claiming remediation
   if required verification is unavailable or 2.4.0 remains affected.
3. Add only the parent-scoped override above and regenerate the lockfile with
   supported npm commands verified against local help/official docs. Review
   the complete diff immediately. Necessary Multer transitive changes are in
   scope; unrelated version churn is not. Never hand-edit lockfile integrity
   or apply `npm audit fix --force`. Do not upgrade Nest to bypass this plan.
4. Reinstall from the updated lockfile with `npm ci --no-audit --no-fund`.
   Inspect every installed Multer node, the adapter's own resolution and npm's
   override status; verify no affected nested copy remains. Document the exact
   version and registry integrity and explain any removed transitive packages.
   Ensure the clean install accepts the override without invalid dependency
   errors and leaves manifests/lockfile reproducible.
5. Run a new production audit and the unchanged `ops:audit` wrapper. Compare
   full finding identities and counts, including propagated adapter findings;
   retain all unrelated unresolved advisories in the record. No advisory
   suppression or threshold change is allowed. If the audit changes during
   execution, report new findings and preserve the fail-closed gate.
6. Run existing upload controller/service/DTO unit suites and the existing
   server e2e suite. The unit fixtures exercise signed upload metadata,
   permissions/service boundaries and lifecycle behavior; they do not exercise
   Multer parsing or live Garage. The server suite verifies Nest/Express
   bootstrap and existing routes. State the actual database/external-service
   fixture scope and any unavailable prerequisites. If a meaningful adapter
   smoke check is needed, use a temporary isolated test application, never a
   production controller; verify its APIs from installed sources and label it
   synthetic compatibility evidence. No live attack or capacity test is needed.

## Non-goals and impact

No public route or user flow is intended to change. Do not convert signed PUT
uploads to multipart, configure diskStorage, change scanning/storage controls,
repair other advisory families, alter trust proxy/throttling, run a live launch
drill, deploy, mutate credentials, approve production evidence, or push.
Prompt 201, operator categories, residual advisories and Phase 12 exit remain
open. An audit finding disappearing proves dependency inventory remediation,
not deployed exploitability or production launch readiness.

## SKILLS USED

- `security-best-practices`: Express dependency/upload guidance, affected
  package versus reachable parser, and narrowly scoped remediation.
- `nestjs-best-practices`: Adapter/Multer compatibility and existing server
  bootstrap/upload regression surfaces.
- `deployment-pipeline-design`: Preserve fail-closed audit and promotion gates
  and define dependency rollback without implying launch authorization.
- `javascript-testing-patterns`: Select meaningful existing unit/e2e coverage
  and label database/external-service test doubles accurately.
- `requesting-code-review`: Dispatch independent read-only dependency/diff
  review after all self-verification.
- `receiving-code-review`: Verify feedback against actual resolution, upstream
  advisories and observed runtime behavior before fixes.
- `caveman-commit`: Generate the required concise local commit message with a
  security-fix body explaining the scoped override.

These are the skills for this bounded Phase 12 step. No architecture, trust
boundary, CI implementation, secret handling, SAST implementation, browser,
observability or UI surface is changed. Reassess the manifest if a verified
failure would require expanding those boundaries. Re-read every listed skill
at execution; planning-stage reads do not substitute for that pass.

## Verification and completion

Run root checks with typecheck and build sequentially, capturing exact output,
exits, test counts and fixture limitations:

```bash
npm ls multer @nestjs/platform-express --all
npm explain multer
npm audit --omit=dev --audit-level=critical
npm run ops:audit
npm run ops:audit-test
npm run test --workspace=@acres/server -- --runInBand --testPathPatterns='uploads.controller.spec|uploads.service.spec|uploads-dto.spec'
npm run test:e2e --workspace=@acres/server -- --runInBand
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Confirm Jest selects the intended tests from the actual workspace config. Use
selected Prettier checks for the manifest, lockfile, prompt and new documentation
regions without reformatting unrelated historical docs. If an aggregate check
fails, identify its reached/unreached stages and run independently the affected
checks required for this repair; do not report an aggregate pass from history.

After self-verification, dispatch a reviewer subagent with this approved
prompt, `BASE_SHA`/`HEAD_SHA` and the uncommitted diff, old/new dependency
trees, adapter pin/override rationale, advisory evidence, audit comparisons,
checks and fixture limitations. Verify each finding using
`receiving-code-review`, fix valid issues and rerun affected checks; request
follow-up review for significant changes. Record actual versions/integrity,
exposure search, override removal condition, audit inventory, output and
residual gates in `docs/operations.md`; add a concise committed-state record
to `docs/build-plan.md`. No AGENTS invariant changes are needed.

Rollback is a reviewed normal revert of manifest and lockfile together, with
affected-version exposure reassessed before deployment. Stage only approved
files, inspect the staged diff, commit locally to `main` using `caveman-commit`
and do not push. Final inspection instructions should include the tree and
audit commands above. Preparing this prompt changes no implementation and
authorizes no dependency installation, staging or commit.
