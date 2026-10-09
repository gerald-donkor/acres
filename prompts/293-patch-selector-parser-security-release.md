# Phase 12K — Patch selector parser security release

## Scope and why this is next

Continue the committed Phase 12K dependency hardening after `2d93eec` on clean
`main`. Patch the single `postcss-selector-parser` lock node from **7.1.5 to
7.1.6**, within unchanged shadcn's `^7.1.0` range. Maintainer advisory
GHSA-rj75-hqrm-r3gf identifies 7.1.6 as the repair for quadratic flat-selector
parsing. This is a bounded residual inventory repair, not proof of deployed
exploitability or completion of Phase 12. Other launch gates remain open.

## References read and verified

- `AGENTS.md`: phase resolution, immediate-execution exception, checks/review/commit.
- `docs/build-plan.md`: Phase 12 scope and committed repairs through Prompt 292.
- `docs/operations.md`: inventory and prior repair evidence/audit restrictions.
- `docs/security.md`: TM-18 supply-chain and TM-20 resource-exhaustion boundaries.
- `docs/system-architecture.md`, `docs/backend.md`: runtime and module constraints.
- `docs/launch-checklist.md`: local fixtures do not supply operator sign-off.
- `docs/skills.md`: exact applicable skill paths and triggers.
- Root manifests/lock, installed shadcn `dist/utils/index.js`, parser `API.md`.
- https://github.com/postcss/postcss-selector-parser/security/advisories/GHSA-rj75-hqrm-r3gf
- Public npm 7.1.6 metadata: MIT, Node >=4, unchanged dependency ranges,
  tarball `https://registry.npmjs.org/postcss-selector-parser/-/postcss-selector-parser-7.1.6.tgz`.

Verified integrity:
`sha512-7qASPzhKF2l2KLboRZux8CCTRMdGiV08vWmyKzPz22qZ7ZjQBOeY7rNzNoCLSUiftJ7HUq0GERHmxw/t0dCdMw==`.
No dedicated dependency-update skill exists; primary metadata owns version facts.
No visual change is planned; reference crops, geometry and breakpoints do not apply.

## Files, behavior and non-goals

1. Write this prompt before dependency edits; re-read it before execution under
   the user's explicit instruction to implement immediately after writing.
2. `package-lock.json`: targeted npm-generated patch; require exactly one changed
   node with only version/URL/integrity differences. Keep manifests, overrides,
   parents, dependency ranges and other nodes unchanged.
3. `docs/operations.md`: exact provenance, compatibility, actual outputs, review,
   audit limits, residual launch work and reviewed normal-revert rollback.
4. `docs/build-plan.md`: concise committed implementation record for Prompt 293.

Routes, UI, schemas, authentication, runtime topology, scanner policy and
thresholds do not change. No new override, major upgrade, dependency fork,
production action, push or exploit/stress test is authorized by this scope.

## Execution and verification

1. Re-read this file and load all listed skills before implementation. Retain
   baseline manifests/lock, toolchain, logs and disposable fixtures in
   `/tmp/acres-293`; these are not prerequisites for future clones.
2. Run `npm update postcss-selector-parser --package-lock-only --ignore-scripts
--no-audit --no-fund`. Reject unrelated resolution changes. Match tarball and
   integrity to public metadata, then run `npm ci --no-audit --no-fund`, preserve
   existing install-script approvals, and prove the lock hash did not change.
3. Inspect installed API/source and shadcn's actual caller. Verify caller-relative
   resolution and `npm ls postcss-selector-parser --all` without invalid ranges.
4. Create bounded real-library disposable fixtures: byte-preserving ordinary,
   escaped, pseudo/attribute/combinator/comment selector round trips; AST class
   rewriting and selector walking; small mixed flat class/id input preserving
   exact order/count; malformed selector rejection; CJS/ESM loading; async parser
   behavior; actual shadcn PostCSS transform behavior after inspecting its API.
   Use small inputs and assertions, not wall-clock performance claims or a large
   attack payload. Verify source uses the intended linear-membership repair.
5. Run selected Prettier, `npm run lint`, `npm run typecheck`, `npm run build`,
   `git diff --check`, and independent offline stages derived from `ops:check`.
   Omit only online `ops:audit`: existing explicit dependency-metadata disclosure
   authorization remains pending. Quote actual outputs; do not claim fresh
   audit reduction or a complete operations aggregate pass.
6. After self-verification dispatch one independent read-only reviewer using
   requesting-code-review, base/current HEAD `2d93eec`, actual unstaged diff,
   requirements and check logs. Do not delegate implementation. Verify feedback
   with receiving-code-review before fixes; recheck and re-review significant fixes.
7. Record results, inspect final/staged diff, and commit only approved files on
   `main` with caveman-commit. No push. Inspect with
   `npm ls postcss-selector-parser --all` from the repository root.

## Exit and rollback

Require scoped reproducible lock/install, verified integrity, semantic fixtures,
required checks, independent review and local commit. Host Node 26 fixtures do
not establish Node 24, Docker, production, browser or database acceptance.
Phase 12, prompt 201, other advisories and operator sign-offs remain open.
Rollback is a reviewed normal revert of the lockfile repair with affected
security exposure reassessed before deployment.

## SKILLS USED

- `security-best-practices`: evidence-based supply-chain repair and unchanged controls.
- `javascript-testing-patterns`: bounded real-library semantic fixtures.
- `deployment-pipeline-design`: preserve gates and reviewed rollback semantics.
- `sast-configuration`: preserve scanner policy and distinguish audit evidence.
- `requesting-code-review`: independent read-only implementation review.
- `receiving-code-review`: verify findings before fixes.
- `caveman-commit`: concise conventional commit with security rationale.
