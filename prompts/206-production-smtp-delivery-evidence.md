# 206 — production SMTP delivery evidence

## Scope and why this is next

The committed baseline is `8c3bb6c` on `main`. Phase 12K remains open: the
repository has a structural readiness schema, an executable fail-closed
validator, and an eleven-category operator gap register, but no operator-backed
production approval. Prompt 205 completed the first category's repository
intake and left `production_domain_tls` unresolved because no live target or
operator evidence was supplied. The next category in the checklist is
`smtp_delivery`. This prompt is its independent, dependency-safe evidence
intake under the umbrella sign-off procedure in prompt 201. It can approve
Category 2 only after the operator supplies real provider, delivery, DNS,
policy, credential-reference, and sign-off evidence. It cannot close Phase 12
or approve the other ten categories. An unresolved Category 1 does not make
read-only Category 2 inspection unsafe, but it still blocks final launch.

## References and verified contract

- Re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §§13, 14, 22;
  `docs/launch-checklist.md` §§2.2, 6A, 7; `docs/operations.md` Phase 12K and
  the Prompt 196 record; `docs/system-architecture.md` production topology;
  `docs/security.md` operational trust boundaries; `docs/skills.md`; and
  prompts 201, 203, 205. Reconcile these with current code and Git history.
- Inspect `infra/launch/readiness.example.json`,
  `infra/launch/readiness.schema.json`,
  `scripts/ops/check-launch-readiness.js` and its focused tests,
  `scripts/ops/launch-readiness.sh`, and any production SMTP environment
  contract before accepting an operator record. Resolve the exact current
  fields and commands from code. Do not infer a provider, domain, sender,
  secret-store path, or policy from the example.
- There is no visual surface, route change, static design reference, crop,
  pixel measurement, or breakpoint in this task. The measurable Category 2
  contract is an approved record with a real provider and host, integer port
  1–65535, `STARTTLS` or `TLS`, valid sender, matching indirect SMTP credential
  reference, delivery policy, bounce/abuse procedure, named approver, and a
  concrete successful `smtp_delivery_verification` JSON child in `evidence`.
  These are acceptance criteria, not observed production facts.
- The child must carry a real nonfuture ISO UTC `timestamp`, `status:
  "success"`, `errors: []`, provider/host/port/TLS mode/sender matching the
  approved section, `delivery.status: "delivered"`, a nonempty opaque
  `delivery.receipt_id` and nonfuture UTC delivery timestamp, plus a nonfuture
  UTC DNS check with SPF, DKIM, and DMARC each `passed: true` and a nonempty
  printout reference in `record`. Every referenced child, including wildcard
  matches, must pass. Independently inspect the actual provider delivery
  receipt and public DNS records: a hand-authored passing JSON is only a
  consistency report, not proof of live delivery.

## Preconditions and operator handoff

1. Verify current branch, commit, and worktree; preserve unrelated changes.
   Confirm that the checked-in readiness example remains unresolved. Search
   only approved, relevant repository paths for an existing materialized
   production SMTP record or evidence reference; do not assume that the
   operator's restricted store is absent because it is not in Git.
2. Obtain through an approved operator channel the designated production
   provider and relay host, port and transport mode, sender address and domain,
   delivery policy, bounce/abuse handling procedure, **indirect** SMTP
   credential reference, restricted evidence-store location, recipient/test
   mailbox under operator control, and named Category 2 ops-lead signer.
   Request opaque references to the provider receipt, delivery event,
   SPF/DKIM/DMARC printouts, and dated approval. Do not ask for the SMTP
   password, API token, raw email content, unrestricted mailbox access, or
   secret value in chat, logs, or Git.
3. Confirm the SMTP reference exactly matches
   `secret_references.smtp_secret_source` in the operator readiness record.
   Category 4 may remain `unresolved` while Category 2 is inspected; record
   the cross-category dependency honestly and never fabricate a Category 4
   approval just to satisfy the comparison.
4. Before sending a test email, obtain separate authorization naming the
   production provider, sender, controlled recipient, purpose, operator, and
   time window. If these are unavailable, inspect existing receipts through
   approved read-only access only. No generic approval of this prompt
   authorizes sending mail or changing DNS, provider configuration, secrets,
   or delivery policy.
5. If any required target, evidence, access, or approval is missing, record a
   dated, precise Category 2 blocker in `docs/launch-checklist.md` and stop
   before creating or approving a purported production record. The blocker
   must name its operator owner and the next safe action without publishing
   private identifiers.

## Evidence procedure after the preconditions hold

1. Inspect the provider's redacted delivery event for a real acceptance and
   delivered receipt, its event time, sender, controlled recipient, and the
   designated provider/relay. Check that a provider `queued` or `accepted`
   event has not been described as `delivered`. Inspect public SPF, DKIM and
   DMARC records for the actual sender domain, including the applicable DKIM
   selector and alignment relevant to the observed message. Record the UTC
   observation time and opaque source reference for each check. A public DNS
   printout alone does not prove that the observed message used aligned
   authentication; review the permitted provider/message authentication
   result where available. Do not copy message body, recipient PII, raw
   headers containing secrets, or credential material into the repository.
2. Check the operator's delivery/bounce policy and abuse-response owner.
   Compare the provider host, port, TLS mode, sender, and indirect secret
   reference with the materialized runtime configuration through a redacted
   approved view. Reject mismatches, placeholder values, expired/contradictory
   receipts, or evidence for a different environment or sender.
3. Only after the source evidence is verified, produce or inspect the
   restricted `smtp_delivery_verification` child JSON with the exact fields
   above. The report's `dns.*.record` values may be opaque references if the
   operator can resolve them to the reviewed public printouts. Inspect every
   referenced child; a malformed or failed report alongside a valid one
   blocks Category 2. Do not treat a fixture, prose note, default drill,
   success-shaped filename, or unified dossier as the child report.
4. Prepare an operator-owned readiness record based on the schema, preserving
   all eleven sections and release fields. Set only `smtp_delivery.status` to
   `approved` after the ops lead has reviewed the raw evidence and given a
   dated sign-off. Fill provider, host, port, TLS mode, sender, credential
   reference, policy, bounce procedure, approver, and evidence from verified
   facts. Leave every other category's prior state intact, including unresolved
   Category 1 and Category 4 unless they have separately passed their own
   procedure. Never turn the checked-in example into a production attestation.
5. Run `npm run ops:readiness-schema-test` and
   `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`.
   The full validator will exit nonzero while other categories remain
   unresolved; inspect the per-category output to determine whether Category
   2 itself has blockers. Compare any green Category 2 result with the raw
   receipt, DNS, policy and human sign-off before accepting it. Store the
   signed record and raw evidence in the restricted operator store unless a
   redacted copy is explicitly approved for Git.
6. Record the dated Category 2 decision, reviewed source commit, redacted
   evidence identifiers, exact checks and remaining gates in
   `docs/launch-checklist.md`. Update `docs/operations.md` and the Phase 12K
   record in `docs/build-plan.md` only where verified findings need a durable
   correction. Prompt 201 still governs the final eleven-category sign-off.

## Scope boundaries, failure handling, and rollback

- No product code, API, UI, schema, migration, dependency, SMTP integration,
  DNS/provider configuration, secret rotation, deployment, or production
  promotion is planned. This prompt authorizes read-only evidence inspection
  after a concrete target and access are identified; a test delivery requires
  the separate authorization in the preconditions.
- If the operator cannot provide the required source records or sign-off,
  leave Category 2 `unresolved`; document the exact blockers rather than
  generating a passing child or reusing a test fixture. A successful local
  validator result does not authenticate provider evidence.
- If live delivery or DNS checks fail, retain the failure evidence in the
  approved store, notify the named operator through the approved channel, and
  follow the existing incident or provider procedure. Do not alter production
  configuration under this prompt. Revert only the scoped documentation commit
  if its record is wrong; preserve operator evidence and its audit trail.

## Verification, review, and completion

1. Quote actual command output and exit codes for any provider/DNS inspection
   permitted, the schema check, readiness validator, `npm run ops:templates`,
   `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`,
   and `git diff --check`. Distinguish an unavailable or failed network check
   from a pass. Do not run the full seven-stage drill or a live mail send as
   a shortcut. Review the full and staged diffs for private identifiers,
   email content, and secret values.
2. Dispatch a read-only reviewer subagent using `requesting-code-review` with
   requirements, base/head SHAs, scoped paths, real check results, and the
   distinction between validated JSON and independent provider/DNS proof.
   Evaluate feedback with `receiving-code-review`; verify claims against code
   and evidence, fix valid issues, rerun affected checks, and request follow-up
   review for material changes.
3. Stage only the approved prompt/documentation changes and any explicitly
   approved redacted record. Commit to local `main` using `caveman-commit`;
   do not push. Report Category 2's actual state, remaining Category 1 and
   Phase 12 gates, and the restricted evidence location through an approved
   operator channel without exposing its sensitive contents. Give the exact
   command to inspect the public readiness result. If no live evidence was
   supplied, state plainly that Category 2 remains unresolved.

## SKILLS USED

- `deployment-pipeline-design` — keep operational evidence, human approval, and final launch promotion separate.
- `secrets-management` — protect the SMTP credential reference and restricted provider evidence.
- `requesting-code-review` — independent review of the evidence record and scoped diff.
- `receiving-code-review` — verify reviewer claims before changing the record.
- `caveman-commit` — write the concise final local commit message.

If execution discovers a code defect or changes a security boundary, plan that
work separately and load the matching Phase 12 skills before touching it.
