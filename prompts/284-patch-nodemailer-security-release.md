# Phase 12K — Patch the Nodemailer security release

## Scope and why this is next

Continue Phase 12 operations and launch hardening after committed prompt 283
(`666bcf2`, Multer 2.4.0). The worktree was clean on `main` during planning.
The committed production audit record contains 33 findings: 24 high, nine
moderate and zero critical. Those are historical counts, not a fresh audit.
The unchanged critical gate and full operations aggregate passed in that
commit; residual dependency advisories and operator launch acceptance remain
open. Address one directly used server dependency family next: Nodemailer.

`server/package.json` declares `nodemailer: ^10.0.0`; the root lockfile and
installed package resolve **10.0.0**. `SmtpMailAdapter` constructs a transport
using operator-configured host/port/secure/auth values and sends from/to,
subject, text and optional HTML. Password recovery and invitation delivery
use the mail port. This is a runtime dependency, unlike an unused CLI package.
Select it ahead of a broader Apollo/Prisma dependency-family migration because
its same-major security repair is isolated and has existing mail coverage.

Target **10.0.13**, the maintainer release dated 2026-09-30. Do not stop at
10.0.11 or 10.0.12: the SMTP AUTH backtracking advisory includes versions
through 10.0.12 and names 10.0.13 as patched. Recheck the entire current
advisory set and registry publication before editing. If 10.0.13 has become
affected, report the blocker and proposed revised scope before replacing it.
Do not infer deployed exploitability from an installed affected version.

## References inspected and required execution reads

- `AGENTS.md`: phase-control, prompt numbering, checks, independent review,
  local commit and no-fabrication requirements.
- `docs/build-plan.md` §§13–14 and records for prompts 281–283: Phase 12
  dependency gate and committed remediation state.
- `docs/operations.md` records for prompts 281–283: complete residual package
  inventory, critical audit policy, install/review results and fixture limits.
- `docs/backend.md` resolved dependencies and mail subsystem record near the
  organization invitation/mail implementation: workspace ownership and
  transporter injection/memory delivery coverage.
- `docs/system-architecture.md` binding principles: keep provider-neutral mail
  behind its existing port; no topology or replacement-provider decision.
- `docs/security.md` TM-18/TM-20: supply-chain and dependency DoS risks.
- `docs/launch-checklist.md` introduction and prerequisites: repository checks
  cannot supply operator approval or live email deliverability evidence.
- `docs/skills.md`: installed skills and triggers.
- Root `package.json` and `package-lock.json`, `server/package.json`, installed
  `node_modules/nodemailer/package.json`, `scripts/ops/audit-dependencies.sh`.
- `server/src/mail/adapters/smtp-mail.adapter.ts` and its `.spec.ts`,
  `server/src/mail/mail.service.ts` and its `.spec.ts`,
  `server/src/mail/mail.interface.ts`, `server/test/jest-e2e.json` and
  `server/test/setup-env.ts`.

Public sources fetched while planning:

- [Maintainer advisory index](https://github.com/nodemailer/nodemailer/security/advisories).
- [SMTP AUTH backtracking](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-4ffr-jq9g-5ffx): high; affected `>=3.0.0 <=10.0.12`, patched 10.0.13.
- [Addressparser fallback](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-v53p-9fqp-m79j): high; affected `<=10.0.5`, patched 10.0.6.
- [Comment-joined address parsing](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-prgh-xp8r-p3m5): high; affected `>=9.1.0 <=10.0.4`, patched 10.0.5.
- [DNS cache/TLS identity](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-6vj9-mwq6-2f5v): moderate; affected `>=5.0.0 <10.0.2`, patched 10.0.2. Use the updated structured patched field; its older narrative still says no patch was known when reported.
- [10.0.13 release](https://github.com/nodemailer/nodemailer/releases/tag/v10.0.13),
  [10.0.11 release](https://github.com/nodemailer/nodemailer/releases/tag/v10.0.11)
  and [changelog](https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md):
  security repair plus CommonJS entry point and bundled declaration fixes.
- [npm install](https://docs.npmjs.com/cli/v11/commands/npm-install/) and
  [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/): workspace,
  exact package selection and audit behavior. Verify local npm help as well.

These four advisories establish the repair; they are not an exhaustive audit
inventory. Inspect all advisory pages/current audit entries during execution.
No visual surface, reference crop, breakpoint or pixel measurement is involved.
Measurements are locked/installed versions, dependency paths, registry integrity,
before/after finding identities, test counts and actual command exits.
No dedicated dependency-remediation skill is installed; the security, Nest,
deployment and testing skills plus primary maintainer/npm sources cover this step.

## Explicit execution authorization and planning limitation

The planning audit failed with `getaddrinfo EAI_AGAIN registry.npmjs.org`.
Automatic approval review rejected its network-enabled retry because npm audit
transmits dependency names and versions to the public registry, potentially
including private package metadata, and `i` authorized planning only. No retry
or indirect audit workaround was performed. The public registry manifest URL
also could not be fetched through the web tool; tarball integrity and engines
for 10.0.13 remain execution preconditions, not verified planning facts.

Approval of this concrete prompt explicitly authorizes npm registry metadata
and package downloads, targeted installation/clean reinstall, and the standard
before/after `npm audit` requests to `https://registry.npmjs.org`, including
dependency names and versions sent by npm and by the existing operations audit
wrapper/aggregate. This does not authorize sending source files, secrets,
credentials, customer data, or mail payloads to a third party. Do not bypass a
remaining tool approval rejection; explain it and request any required explicit
permission. Never treat transport failure as a clean dependency audit.

## Intended changes and boundaries

1. `server/package.json`: set only `nodemailer` to exact `10.0.13`, so the
   manifest minimum cannot resolve the known affected 10.0.0 again.
2. `package-lock.json`: npm-generated workspace reference and Nodemailer
   resolution/necessary dependency closure only. Retain the existing
   `deepmerge-ts` and parent-scoped Multer overrides without modification.
3. `docs/operations.md`: detailed remediation/evidence/remaining-risk record.
4. `docs/build-plan.md`: concise Phase 12K committed-state record.
5. `docs/backend.md`: update the Nodemailer dependency row/current resolution
   and explain verified mail/type compatibility; preserve unrelated history.
6. This prompt accompanies the executed local commit.

No production source change is expected. Keep `@types/nodemailer` unchanged
unless a reproduced bundled-declaration conflict proves it must be removed;
that directly related removal and its lockfile cleanup are allowed only with
documented TypeScript evidence and review. Do not upgrade other type packages.
If compatibility needs a production adapter/contract change or unrelated
dependency upgrade, report the specific failure before expanding scope.

## Execution sequence

1. Re-read this approved prompt, guidance, owning docs and every named skill.
   Establish `BASE_SHA`, branch and worktree state; preserve unrelated edits.
   Inspect all Nodemailer nodes via `npm ls nodemailer @types/nodemailer --all`
   and `npm explain nodemailer`; search actual mail callers/configuration.
   Confirm installed runtime, Node engines, package exports and type resolution.
2. Fetch a complete fresh production audit to a disposable restricted `/tmp`
   file. Enumerate advisory IDs, severities, ranges, vulnerable nodes and npm
   remedies; retain a before baseline for comparison. Check the maintainer
   index including pagination and obtain 10.0.13 registry manifest, tarball,
   integrity, dependencies, exports and engines. Confirm this release resolves
   the observed advisories and remains compatible with the project's runtime.
3. Use verified npm workspace commands to install exact 10.0.13 in
   `@acres/server`, disabling incidental install audit/funding output. Review
   the entire manifest/lockfile diff immediately. Necessary dependency closure
   belongs in scope; unrelated version churn must be removed through a clean
   targeted regeneration. Never hand-edit integrity, use `audit fix --force`,
   introduce an override for this direct package, or migrate major versions.
4. Run `npm ci --no-audit --no-fund` from the root and recheck the complete
   dependency tree. Verify every Nodemailer copy is safe, registry integrity
   matches the regenerated lock, package loading works in the server's actual
   compiled module mode, and clean install leaves the lock reproducible.
5. Run existing mail units, auth and organization units, and full server e2e.
   SMTP adapter units mock the module; MailService tests use MemoryMailAdapter.
   They prove application behavior but do not exercise real SMTP parsing.
   Verify actual Nodemailer composition separately in a disposable `/tmp`
   Node smoke script using its documented non-network JSON or stream transport,
   after checking the installed implementation/types for those exact options.
   Compose benign from/to/subject/text/HTML fixtures matching the adapter and
   inspect generated envelope/body content and clean completion. Use only
   synthetic addresses and links, no real recipients or recovery tokens.
   Do not claim an offline composition check proves SMTP/TLS interoperability.
   No persistent version-assertion test or new mail-server package is needed.
6. Fetch a post-change complete audit and run unchanged critical gates. Compare
   identities and paths, including propagated findings, rather than just total
   counts. Record unrelated findings/new upstream changes accurately. A target
   finding disappearing verifies inventory remediation; it is not proof of
   production exploitability, delivery, DNS authentication or launch readiness.

## Non-goals and impact

No route, public contract, migration, UI, email template, mail-provider choice,
token lifecycle, SMTP configuration, transport policy, log policy or user flow
is intended to change. No live outbound email, hostile SMTP fixture, large DoS
payload, production credential access, live launch drill, deployment, push,
audit suppression or threshold change. Other advisory families and human
launch gates remain open. Preserve the memory transport and deterministic
no-AI path. Any newly discovered application issue is reported separately.

## SKILLS USED

- `security-best-practices`: Runtime mail dependency exposure and narrow
  remediation, following its Express dependency guidance and real reachability.
- `nestjs-best-practices`: Existing DI/transporter boundary and server module,
  bootstrap and type compatibility; keep production behavior unchanged.
- `deployment-pipeline-design`: Preserve fail-closed dependency/promotion gates
  and separate repository checks from operational acceptance and rollback.
- `javascript-testing-patterns`: Existing mail/auth/organization unit coverage,
  distinguish mocks from real offline composition and database e2e fixtures.
- `requesting-code-review`: Independent read-only dependency and diff review
  after self-verification, with exact SHAs, audit evidence and limits.
- `receiving-code-review`: Verify feedback against resolution/source/types and
  observed behavior before fixing; repeat review for significant changes.
- `caveman-commit`: Required concise Conventional Commit for local completion.

This manifest covers the bounded Phase 12 dependency step. No new architecture,
trust boundary, CI implementation, secret store, SAST, browser, metrics or UI
surface is planned. Reassess skills if a verified failure changes that scope.
Planning-stage skill reads never substitute for execution-stage reads.

## Verification, review, documentation and completion

Run from the root, recording exact outputs, exits, test counts and prerequisites:

```bash
npm ls nodemailer @types/nodemailer --all
npm explain nodemailer
npm audit --omit=dev --audit-level=critical
npm run ops:audit
npm run ops:audit-test
npm run test --workspace=@acres/server -- --runInBand --testPathPatterns='mail.service.spec|smtp-mail.adapter.spec|memory-mail.adapter.spec|auth.service.spec|organizations.service.spec'
npm run test:e2e --workspace=@acres/server -- --runInBand
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Capture full before/after `npm audit --omit=dev --json` separately for finding
comparison. Audit may exit nonzero for residual findings; record successful
JSON retrieval separately from the configured critical policy outcome. Run
typecheck and build sequentially. Confirm Jest actually selects intended tests.
Use only the test database protected by `server/test/setup-env.ts`; state which
suites use real DB, mocks or memory mail and any unavailable service fixture.
Never mutate a production database or silence tests to produce a pass.
Report the offline composition script's actual command/output and fixture
contents without committing temporary artifacts. Run selected Prettier checks
on changed JSON, prompt and new documentation regions, preserving unrelated
historical formatting. If aggregate fails, name reached/unreached stages and
independently verify the required affected checks; do not copy a historical pass.

After self-verification dispatch the required reviewer subagent with this
prompt, BASE_SHA/HEAD_SHA and uncommitted diff, old/new dependency trees,
manifest/lock integrity, current advisory evidence, audit comparisons, exact
checks and fixture limitations. Evaluate feedback with `receiving-code-review`,
fix verified issues and rerun affected checks; re-review significant changes.

Document actual version/integrity, all observed relevant advisory IDs/ranges,
reachability limitations, type/module compatibility, offline composition,
residual audit inventory, check output and rollback in `docs/operations.md`.
Update the backend dependency record and add a concise build-plan record.
No AGENTS invariant or launch approval record changes are required.

Rollback is a reviewed normal revert of manifest and lockfile together,
reassessing affected-version exposure before deployment; never silently
redeploy the vulnerable dependency. Stage only approved files, inspect the
staged diff and commit locally to `main` using `caveman-commit`. Do not push.
Final inspection steps include the dependency tree/audit commands above and
mail unit command. Preparing this file changes no implementation and leaves
only this new prompt uncommitted, awaiting the exact AGENTS approval question.
