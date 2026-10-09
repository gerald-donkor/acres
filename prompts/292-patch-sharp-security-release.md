# Phase 12K — Patch sharp security release

## Scope and why this is next

Continue committed Phase 12K dependency hardening after `89be65b` on clean
`main`. Repair Next's optional sharp dependency from **0.35.4 to 0.35.5**,
within Next 16.3.8's unchanged `^0.35.4` range. The maintainer advisory
GHSA-wq5f-xc86-pv6w affects sharp <0.35.5 and identifies librsvg 2.63.2 as the
repair. This is one bounded residual supply-chain repair, not an assertion
about deployed exploitability or a ranking of other findings.

## References read

- `AGENTS.md`: prompt, execution, checks, review and commit requirements.
- `docs/build-plan.md`: Phase 12 and committed dependency-hardening evidence.
- `docs/operations.md`: dependency inventory, gates and Prompts 281–291.
- `docs/security.md`: supply-chain boundary and current/target distinctions.
- `docs/system-architecture.md`, `docs/backend.md`: runtime/persistence constraints.
- `docs/launch-checklist.md`: local checks cannot approve live launch.
- `docs/skills.md`: applicable skill triggers.
- `package.json`, `package-lock.json`, `client/package.json`, installed Next
  image optimizer and local Next image documentation under
  `node_modules/next/dist/docs/01-app/01-getting-started/12-images.md`.
- https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w
- https://github.com/lovell/sharp/releases/tag/v0.35.5
- Public npm metadata: sharp 0.35.5, Apache-2.0, Node >=20.9.0; native sharp
  optional packages 0.35.5 and libvips optional packages 1.3.4.

Verified sharp tarball integrity:
`sha512-Ywn4OnzGukp7CDMrp08RQ50YKmuwG47brZgIVPTvBaaAfQlRlygrRqSrxdCiL9M+LlzLBiJ68IR1QqvzHyjC7g==`.
There is no dedicated dependency-update skill. Primary package/release sources
own version facts. No component styling or geometry changes are planned, so
comps, pixel measurements and browser layout comparisons are inapplicable.

## Changes and expected impact

1. This numbered prompt, written before implementation and re-read at execution.
2. `package-lock.json`: npm-generated targeted sharp update and its necessary
   native/WASM/libvips optional closure. Inspect every changed node; preserve
   unrelated versions and all workspace manifests/overrides. Do not add a direct
   dependency or override when Next's range already admits the patch.
3. `docs/operations.md`: provenance, exact closure, actual compatibility/check
   results, audit limitation, independent review and rollback.
4. `docs/build-plan.md`: concise implementation evidence for Prompt 292.

Next image-processing dependency changes; route contracts, image configuration,
UI geometry, server code, schemas and tenancy stay unchanged. The user's current
instruction authorizes implementation immediately after prompt writing, as
already provided by AGENTS.md workflow step 8. No extra approval pause.

## Implementation and validation

1. Re-read this prompt and every listed skill before edits. Save baseline lock
   and manifests plus branch/SHA/toolchain under disposable `/tmp/acres-292`.
2. Use targeted `npm update sharp --package-lock-only --ignore-scripts
--no-audit --no-fund`. Compare all lock nodes, verify registry integrity for
   changed packages, and reject unrelated upgrades. Preserve platform coverage.
3. Run `npm ci --no-audit --no-fund`; compare lock hash before/after. Check
   `npm ls sharp --all` and Next-relative resolution. Inspect installed sharp
   declarations/source and optional native package metadata before fixtures.
4. Use bounded disposable real-library fixtures: generated small raw raster,
   PNG/JPEG/WebP/AVIF encode/decode, resize dimensions, benign SVG rasterization,
   invalid image rejection and input-pixel limit rejection. Assert native sharp,
   libvips and librsvg versions. No exploit payload or large resource tests.
5. Exercise installed Next `optimizeImage` with synthetic raster buffers using
   its verified source API: dimensions, output MIME/metadata and no upscaling.
   Verify native Linux glibc runtime here; describe untested musl/other-platform
   binaries honestly. No server or network is needed for these fixtures.
6. Run selected formatting, `npm run lint`, `npm run typecheck`,
   `npm run build`, `npm run ops:audit-test`, and `git diff --check`; retain logs
   and quote actual outputs. Run independent offline stages derived from
   `ops:check`, omitting only online `ops:audit`. Do not call this a complete
   operations aggregate pass. Existing npm audit dependency-metadata disclosure
   authorization is unresolved; do not perform a new audit or claim a fresh
   vulnerability-count reduction.
7. Self-review then dispatch one independent read-only reviewer per
   requesting-code-review with requirements, base SHA/current HEAD, unstaged
   diff and check logs. Verify feedback before fixes; recheck affected behavior
   and re-review significant changes.
8. Record evidence in owning docs, inspect final/staged diff, and commit this
   scope locally to `main` using caveman-commit. No push or deployment.

## Exit, limits and rollback

Require scoped reproducible lock/install, matching registry integrity, passing
native semantic and Next optimizer fixtures, required checks, independent review
and local commit. No live production, Docker platform, Node 24, database or
browser acceptance is implied by this host's checks. Other advisories, prompt
201, operator sign-offs and Phase 12 exit remain open. Rollback is a reviewed
normal revert of this lock repair with security exposure reassessed first.
Inspect locally with `npm ls sharp --all` and
`node -e 'console.log(require("sharp").versions)'` from the repository root.

## SKILLS USED

- `security-best-practices`: evidence-based supply-chain repair and unchanged controls.
- `javascript-testing-patterns`: bounded real-library semantic fixtures.
- `deployment-pipeline-design`: preserve gates and reviewed rollback semantics.
- `sast-configuration`: preserve scanner policy and distinguish audit evidence.
- `requesting-code-review`: independent read-only implementation review.
- `receiving-code-review`: verify findings before changes.
- `caveman-commit`: concise conventional commit with security rationale.
