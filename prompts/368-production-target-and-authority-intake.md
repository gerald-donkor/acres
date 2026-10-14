# Prompt 368 — Phase 12 production target and authority intake

## Scope and why this is next

Planning baseline: `110236332489c24ebaf17fea58304fc1ab783028` on `main`,
with a clean worktree before this prompt was written. That commit adds Prompt
367 only. It proves the activation plan exists; it does not prove activation,
deployment, live evidence acquisition, or operator approval occurred.

The earliest unfinished build unit is Phase 12's operator-owned exit gate
(`docs/build-plan.md` §13), governed by Prompt 201. This prompt implements the
first prerequisite of Prompt 367: establish the production target, release
identity, accountable people, and restricted evidence-access procedure. It
does not repeat the completed V1 application work or the checklist alignment
from Prompts 365–366. Prompt 201 continues to own the eventual launch decision;
Prompt 367 continues to describe the broader activation sequence.

Produce a factual intake disposition and one explicit next action. When inputs
are absent, the correct result is an identified blocker and a concise operator
request. Do not create new tooling or repeatedly reconcile unchanged checklists
to substitute for missing operator decisions.

## References and evidence boundary

Read before execution:

- `AGENTS.md`, especially phase-control commands and §§2–7 and 10.
- `docs/build-plan.md` §§13–14 and its latest committed evidence records.
- `docs/project-status.md`, especially operator-owned launch work and the
  distinction between repository acceptance and production evidence.
- `docs/operations.md`, production topology and the most recent launch records.
- `docs/launch-checklist.md` §3 category contracts, §6A shared prerequisites
  and operator handoff, and §7 sign-off matrix.
- `docs/system-architecture.md` §11 and `docs/security.md` for runtime secret
  handling and production trust boundaries; `docs/skills.md` for skill triggers.
- `prompts/201-production-launch-evidence-and-signoff.md` and
  `prompts/367-operator-production-evidence-activation.md` as procedures,
  never as proof of implementation.
- `infra/launch/readiness.example.json`, `infra/launch/readiness.schema.json`,
  and `scripts/ops/check-launch-readiness.js` before interpreting readiness.

Planning inspected the current git history, the files above relevant to this
intake, root `package.json`, and the checked-in unresolved readiness example.
No restricted operator record or external production target was inspected.
Static design references, crops, visual measurements and breakpoint changes
are inapplicable: no UI or styling changes are planned. No Next.js API change
is planned; if scope changes, verify the appropriate installed documentation
and obtain a separate implementation prompt.

## SKILLS USED

- `deployment-pipeline-design` — loaded during planning; establish source,
  image, target, release authority and later promotion/rollback prerequisites.
- `secrets-management` — loaded during planning; request opaque references
  and scoped access while keeping credentials and raw evidence private.
- `requesting-code-review` — independently review the resulting repository
  intake record and diff after self-verification.
- `receiving-code-review` — verify findings against actual authority and
  evidence before making changes.
- `caveman-commit` — write the required local implementation commit message.

Re-read these skills during execution. This bounded intake does not change
infrastructure, CI, monitoring, SQL, authentication, or security controls, so
their implementation skills are deferred to the respective approved work.
There is no dedicated operator-intake skill; the existing launch contracts
own the factual intake requirements.

## Execution steps

1. Establish the actual starting state with `git status --short`,
   `git branch --show-current`, `git rev-parse HEAD`, and `git log -5 --oneline`.
   Preserve unrelated changes. Re-resolve committed state rather than assuming
   the planning SHA is still HEAD. Do not select that SHA or the historical
   `dd36684` candidate as the deployed source without operator confirmation.
2. Run the repository-visible readiness assessment:

   ```bash
   node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json
   ```

   Record actual exit status and summary. Historical output is 0 approved,
   11 unresolved categories and 70 blockers; treat these as historical until
   rerun. Failure of the unresolved example is expected. It says nothing about
   whether an operator's private record exists.

3. Inspect existing session inputs for the following intake facts. Ask one
   consolidated question for missing information using asynchronous input when
   available. Request references through an operator-approved channel; chat
   should contain only safe opaque IDs and names/roles the operator permits:

   | Intake group    | Facts or references needed                                                                                                                                                  |
   | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Target          | Designated environment ID; confirmation of the single-host Compose+Caddy topology or an explicit proposed deviation; approved channel for the actual FQDN and host identity |
   | Candidate       | Reviewed 40-character source SHA; current and previous immutable client/server image identities; provenance references; materialized Compose/Caddy identifiers              |
   | People          | Release manager, deployment approver, rollback authority, evidence custodian, and the evidence supplier/signer for each of the eleven categories                            |
   | Evidence access | Restricted evidence-store and readiness-record references; authorized access contact/procedure; allowed records and fields; whether only existing records may be inspected  |
   | Action boundary | Any existing exact-action authorization and its target, authority, window and recovery scope; otherwise state that none was supplied                                        |

   Keep the request focused on these shared prerequisites. Category-specific
   policy decisions, twelve secret references and live test arrangements remain
   in the existing category checklist and broader activation prompt.

4. Continue only independent repository inspection while awaiting the answer.
   Do not interpret silence or generic approval of this prompt as a target,
   credential-access grant, deployment approval, or authorization for live tests.
   If no answer arrives during this execution, report the missing inputs and
   leave dependent work pending; do not invent a second launch milestone.
5. Classify each supplied fact as `supplied, unverified` until its authorized
   source is independently inspected. For this prompt, inspection is limited
   to already-existing, explicitly designated read-only records. Do not search
   credential directories, dump environment variables, enumerate accounts,
   retrieve secret values, contact third parties, or probe a live endpoint to
   discover a target. If access is unavailable, retain the unverified state.
6. Check reference consistency where inspection is authorized: one environment
   and release throughout; exact source/image identities; named custodian and
   authorities; provenance and materialized deployment references rather than
   template paths. A first deployment with no previous image pair is an explicit
   unresolved rollback prerequisite, never a fabricated previous release.
7. Add one concise, dated Prompt 368 intake record to `docs/operations.md`.
   Include repository baseline, actual commands/results, which input groups
   are absent/supplied/inspected, permitted non-sensitive opaque references,
   remaining owners, and the single next action. Do not include private hosts,
   raw records, credentials, tenant data or secret-store contents. If blocked,
   state precisely that production activation has not occurred. Link to the
   existing checklist instead of copying its eleven category tables.

## Files and expected impact

- `prompts/368-production-target-and-authority-intake.md`: approved brief,
  included in its execution commit.
- `docs/operations.md`: the sole planned implementation edit, recording the
  actual intake disposition. Existing historical verification stays intact.
- No route, API, schema, package, runtime, production template, readiness
  example/schema, or public product behavior changes.
- Leave `docs/project-status.md`, `docs/build-plan.md`, and
  `docs/launch-checklist.md` unchanged unless actual verified facts require a
  narrowly explained correction. Intake alone does not increase completion
  estimates, approve any category, or close Phase 12.

## Verification, review and local commit

Inspect every changed line for factual support, privacy and valid local links.
Run `git diff --check`; check Markdown with an already-installed formatter if
available, without installing dependencies or reformatting historical files.
Run required root gates sequentially: `npm run lint`, `npm run typecheck`,
`npm run build`; quote actual output and record failures and limits honestly.
Do not claim a formatter, fresh full-ops, browser or database suite pass unless
actually run. New tests are unnecessary for this documentation-only intake.
Do not run the unified launch drill or live-category verifiers in this step.

After self-verification, dispatch the mandatory read-only reviewer subagent
with requirements, base/head SHA, uncommitted diff, changed paths, actual check
outputs, and evidence/access limits. Evaluate feedback with
`receiving-code-review`; fix verified findings and re-review material changes.
Stage only this prompt and reviewed task documentation. Inspect the staged
diff and commit locally to `main` using `caveman-commit`; do not push.

The result is inspected in `docs/operations.md` and the existing §6A handoff;
the readiness command above reproduces the repository example assessment.
There is no new application screen to run.

## Exit, non-goals and recovery

- **Blocked intake:** list missing target/release/people/access facts and the
  person who can supply them; dependent production work remains pending.
- **Intake established:** record verified shared prerequisites and the next
  category-specific evidence inspection under Prompts 201/367. This is not
  launch approval, and it does not authorize the next operational action.
- Do not deploy, promote, roll back, rotate keys, change DNS/HSTS, send mail,
  load-test, restore, create cloud resources, write external evidence records,
  approve categories or enable AI. These are outside this bounded intake.
- No production rollback is needed because no production operation occurs.
  An ordinary revert can remove this documentation change; it cannot revoke
  an actual operator decision, which must be managed in the operator's record.
