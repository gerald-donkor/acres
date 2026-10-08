# Phase 12K — Patch the Next.js security release

## Scope and why this is next

Continue the unfinished Phase 12 launch gate after committed prompt 280
(`21f412d`). The repository's installed and locked `next` and
`eslint-config-next` are both **16.3.4**. The Next.js maintainer's
[GHSA-vcvr-r3jv-pc5j advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j)
marks `next >=16.2.0 <16.3.6` affected by a critical `next/og ImageResponse`
issue, and the maintainer's
[September 2026 security release](https://nextjs.org/blog/september-2026-security-release)
recommends **16.3.8** for the 16.3 Active LTS line. The production audit gate
in `npm run ops:check` has repeatedly stopped at critical findings. Patch the
two aligned Next packages to the verified 16.3.8 release and re-evaluate the
entire production audit. This is one dependency-family repair, not a claim
that the other reported findings or the launch checklist are resolved.

The `client/` search made while preparing this prompt found no `next/og`,
`ImageResponse`, or metadata-image route import. That narrows the apparent
application exposure of this particular advisory, but does not change its
affected package version or clear the audit gate. Recheck the full source at
execution, including generated metadata routes and deployed behavior where
applicable.

The registry request `npm audit --omit=dev --json` failed in this planning
session with `EAI_AGAIN registry.npmjs.org`; it supplied **no current advisory
inventory**. The last completed repository aggregate reported 37 production
findings (9 moderate, 26 high, 2 critical). Treat those counts as historical,
not a fresh audit. Network/registry access is an execution prerequisite for a
real package update and a current audit; do not manufacture either result.

## References and execution prerequisites

- `AGENTS.md` §§2–7, 8.2 and 10: phase control, prompt contract, checks, review,
  documentation and local commit.
- `docs/build-plan.md` §§13–14 and prompt 280 record: Phase 12 exit gates and
  latest committed step.
- `docs/operations.md` Prompt 263 and Prompt 280: `ops:audit` behavior, recent
  failure and repository evidence limits.
- `docs/launch-checklist.md` §§2–4: live operator sign-offs remain separate.
- `docs/security.md`: dependency and deployment trust boundary.
- `docs/skills.md`: skill paths and triggers.
- `client/package.json`, `package-lock.json`, `package.json`,
  `scripts/ops/audit-dependencies.sh`, `scripts/ops/audit-dependencies.spec.js`,
  `client/next.config.ts`, and the relevant `client/app/` route and metadata
  files: actual version, package layout, audit gate and exposure.
- `node_modules/next/dist/docs/01-app/01-getting-started/18-upgrading.md`,
  `14-metadata-and-og-images.md`, and the corresponding docs from the newly
  installed version: verify Next behavior before any necessary source edit.
- The two Next.js maintainer links above, rechecked at execution for the
  affected range, current patched 16.3 release and any newer advisory. Verify
  registry package availability and integrity through npm before changing the
  lockfile. Do not infer a version from an untrusted search snippet.

No static comp, crop, pixel measurement, visual change or breakpoint decision
applies. The measurable target is a lockfile and installed tree on an official
patched **16.3.x** release, aligned `next`/`eslint-config-next` versions, and
the actual post-update audit result. Keep 16.3.8 as the planned version; if a
newer 16.3 patch is confirmed by the maintainer and registry during execution,
use that patch and record the reason. Do not jump to 16.4 or another major/minor
line as an incidental audit fix.

## Expected files and impact

Change `client/package.json` and `package-lock.json` for the Next patch and
its matching ESLint config. Change client source only if a concrete regression
from that patch requires it, after verifying the new API against the installed
docs. Record the implemented version, advisory scope, exact audit/check outputs,
review and remaining findings in `docs/operations.md`, with a concise Phase 12K
record in `docs/build-plan.md`. Add this prompt to the eventual local commit.
Do not change server/shared package families, image digests, production Compose,
CI gate thresholds, operator readiness status or public routes merely to make
the audit green. If the package update alters a generated artifact, inspect it
and include only a justified required change.

## Implementation sequence

1. Recheck `main`, worktree status, `BASE_SHA`, package manifests, lockfile
   version, installed version and the maintainer's current advisory. Preserve
   unrelated changes. Inventory current `next/og`, metadata routes, image
   optimization config, and client dependency consumers. Read the versioned
   local Next docs before writing source code. Keep the app's existing
   `next build --webpack` script unless the patch's verified docs or an actual
   failing build require a change.
2. Obtain a fresh `npm audit --omit=dev --json` using the configured registry.
   Keep its machine-readable raw output in a disposable private `/tmp` file,
   summarize package, advisory ID, severity, path, fix availability and
   timestamp without committing the raw report. Distinguish an audit transport
   failure from a clean or vulnerable result. If the registry is unreachable,
   report the blocker and stop before dependency mutation; do not claim that
   a cached lockfile edit is remediation.
3. Confirm the target patched 16.3.x release exists in npm and the maintainer
   release notes. Use npm workspace-aware package installation so the manifest
   and root lockfile update together. Keep `next` and `eslint-config-next`
   aligned. Avoid `npm audit fix --force`, broad overrides and unrelated
   transitive churn. Inspect `git diff` and `npm ls next eslint-config-next`
   immediately; reject accidental major/minor upgrades or unrelated manifest
   rewrites. Use `npm ci` or a clean equivalent to establish reproducibility
   from the committed lockfile after the update.
4. Re-run the production audit and map every remaining critical/high finding
   to its actual dependency path. This prompt repairs the Next family only;
   keep any independent finding open and give it an evidence-backed next owner
   or prompt. Do not lower the audit level, omit additional dependency classes,
   suppress advisory IDs, or describe the whole gate as passed unless its
   actual command exits zero.
5. Verify the client build and route behavior under the patched Next version.
   Inspect metadata/image output, same-origin API proxy/auth journey, 404 and
   protected app routing with existing targeted tests or browser fixtures. If
   a real regression needs source code, first verify the changed API in the
   **newly installed** `node_modules/next/dist/docs/`; keep the fix small,
   add a meaningful regression test only for observable behavior, and rerun
   the affected checks. Do not treat browser fixtures as live production proof.

## Non-goals and remaining gates

No deployment, production traffic, package major/minor migration, React/Nest/
Prisma upgrade, other advisory family's remediation, security-policy exception,
live operator evidence, Category approval, launch sign-off or push. The 16.3.8
patch addresses the stated Next maintainer advisories; `npm audit` may still
fail on another package. Preserve the failure and document it honestly. Prompt
201 and all live Phase 12 sign-offs remain open.

## SKILLS USED

- `security-best-practices`: Verify the Next security advisory and affected
  source paths without inferring exploitability from the package version alone.
- `deployment-pipeline-design`: Preserve the fail-closed production audit gate
  and distinguish repository remediation from deployment approval.
- `javascript-testing-patterns`: Choose behavioral regression coverage only
  for a concrete patch-induced source change.
- `requesting-code-review`: Independent implementation and lockfile review
  after self-verification.
- `receiving-code-review`: Verify and resolve reviewer findings against the
  installed release and repository behavior.
- `caveman-commit`: Required concise Conventional Commit on local `main`.

No new architecture, Nest, API, schema, UI, Tailwind, CI workflow, metric,
browser-automation or threat-model surface is planned. Reassess the manifest
if an actual regression expands scope. Re-read every named skill at execution.

## Verification, review, documentation and completion

Capture exact command exits and relevant output; run `typecheck` then `build`
sequentially. At minimum:

```bash
npm ls next eslint-config-next
npm audit --omit=dev --audit-level=critical
npm run ops:audit-test
npm run ops:templates
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Also run the existing targeted client route/browser checks whose setup is
available, stating their exact command and whether a real API/DB or fixtures
were used. If the full `ops:check` stops at a remaining advisory, identify
unreached stages and run relevant independent suites. Check package/lockfile
consistency and a clean-install result; do not substitute a manually edited
lockfile. Review the full dependency and generated-file diff, and run selected
format checks without reformatting historical Markdown.

After self-verification, dispatch a read-only reviewer subagent with the
approved prompt, advisory evidence, old/new version tree, `BASE_SHA`/`HEAD_SHA`,
changed files, test and audit outputs, remaining findings and no-production
boundary. The reviewer must not mutate or delegate. Use `receiving-code-review`
to evaluate each finding; fix valid issues, rerun affected checks and request
follow-up review for significant dependency/source changes. Record precise
results and residual limits in owning docs. Rollback is a reviewed normal
revert of the dependency/lockfile commit, with affected-release exposure
reassessed before any deployment. Stage only approved paths, inspect the
staged diff, commit locally to `main` using `caveman-commit`, and do not push.
This prompt preparation authorizes no package install, implementation,
staging or commit.
