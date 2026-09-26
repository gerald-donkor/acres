# 205 — production domain and TLS evidence

## Scope and why this is next

The committed baseline is `dd1c933` on `main`. Phase 12K has a structural
readiness schema, a fail-closed executable validator, a target-bound drill
runner, and an eleven-category operator preflight. `docs/build-plan.md` §13
still requires operator-approved launch evidence. Prompt 201 is the umbrella
production sign-off procedure and remains unexecuted. This prompt takes its
first independently reviewable category, `production_domain_tls`, as a
dependency-safe evidence-intake step. It may close that category only if the
operator supplies an actual target, underlying live evidence, and the named
approval. It cannot close Phase 12 or approve the other ten categories.

## References and verified contract

- Re-read `AGENTS.md` §§0, 2–7, 10; `docs/build-plan.md` §§13, 14, 22;
  `docs/launch-checklist.md` §§2–4, 6A, 7; `docs/operations.md` Phase 12K;
  `docs/system-architecture.md` production topology; `docs/security.md`
  ingress threat boundary; `docs/skills.md`; and prompts 201–204.
- Inspect the current `infra/launch/readiness.example.json` and
  `infra/launch/readiness.schema.json`, `infra/caddy/Caddyfile.example`,
  `scripts/ops/verify-caddy-routing.js`, `scripts/ops/check-launch-readiness.js`,
  `scripts/ops/run-launch-drills.sh`, their focused tests, and the current
  operator-controlled materialized Caddyfile before invoking a live check.
  Resolve current flags and report fields from code; do not trust a stale
  command printed in a historical prompt.
- No static Acres design reference, crop, pixel measurement, breakpoint, or UI
  route is involved. The measurable Category 1 contract is one real production
  FQDN matching the Caddy child report; valid TLS contact; explicit HSTS
  approval; explicit custom-certificate boolean; a nonfuture successful child
  with at least 12 evaluated and passing routes, active approved HSTS with a
  positive `max-age`, security/proxy/SigV4 headers verified, and no errors.
  These are acceptance thresholds, not observed production results.

## Preconditions and operator handoff

1. Verify `main`, clean/known worktree, commit baseline, and the unchanged
   fail-closed example. Preserve unrelated changes. Treat every value in the
   example, including its date and `environment`, as a template value.
2. Obtain through the approved operator channel: selected production FQDN,
   TLS contact, certificate mode, exact materialized Caddyfile path, public DNS
   evidence, certificate issuance/expiry evidence, observed live HTTPS header
   evidence, the ops lead's recorded HSTS decision including `max-age`, the
   restricted evidence-store location, and the person authorized to sign
   Category 1. Request opaque references, not private keys, credentials,
   unredacted host inventories, or secrets in chat or git. For live network
   probes obtain the exact target and read-only access authorization; for any
   HSTS configuration change obtain separate change-window approval.
3. If any required item or access is unavailable, mark the category unresolved
   in a dated blocker note in `docs/launch-checklist.md` and stop before
   generating an approved record. A missing operator target is a real block,
   not an invitation to use the example domain or an invented local substitute.

## Evidence procedure after the preconditions hold

1. Independently inspect the materialized Caddyfile, DNS A/AAAA and relevant
   CAA records, certificate identity/chain/validity, and live HTTPS response
   headers through approved read-only channels. Record the observed source,
   timestamp, domain, and redacted artifact reference. Distinguish Caddyfile
   static validation from actual public ingress behavior. Reject a mismatch
   among the approved FQDN, site block, certificate, live host, and report.
   Do not enable HSTS merely to make the verifier pass.
2. With active HSTS already approved and deployed by the operator, run the
   verified script against the exact materialized file, with a restricted
   output path: `node scripts/ops/verify-caddy-routing.js
   <materialized-production-Caddyfile> --allow-hsts --output
   <restricted-evidence-dir>/caddy-routing-<UTC-timestamp>.json`. The tool
   verifies file structure and routes; inspect its child JSON and compare the
   parsed domain, active HSTS `max-age`, route counts, header assertions, and
   timestamp with the independently gathered live evidence. It must not be
   represented as a live TLS probe.
3. Prepare an operator-owned readiness record that preserves all eleven
   sections and the release fields required by the schema. Set only
   `production_domain_tls` to `approved` after the ops lead has reviewed the
   raw evidence and supplied a dated sign-off. Fill its `domain`,
   `tls_contact_email`, `hsts_approved`, `custom_certificates`, `approver`,
   and `evidence` from verified facts. Reference the successful Caddy child
   JSON plus opaque DNS/certificate/live-header and approval evidence. Leave
   the other ten categories `unresolved`. Never edit the checked-in example
   into a purported production record.
4. Run `npm run ops:readiness-schema-test` for structural drift and
   `node scripts/ops/check-launch-readiness.js <operator-readiness.json>` to
   inspect the category blockers. The full validator must still exit nonzero
   while ten categories remain unresolved; assess Category 1 separately from
   its output and the raw operator evidence. Do not coerce the overall result
   to green or claim launch readiness. A successful child can be rejected if
   a second referenced child is malformed or failed.
5. Record the dated Category 1 decision and redacted evidence identifiers in
   `docs/launch-checklist.md`, with the reviewed source commit and explicit
   state of the other ten gates. Update `docs/operations.md` and the Phase 12K
   verification record in `docs/build-plan.md` only with verified results.
   Keep raw reports and the signed readiness record in the restricted
   operator store unless their reviewed, redacted form is explicitly approved
   for the repository. Prompt 201 continues to govern final eleven-category
   sign-off and any actual launch decision.

## Scope boundaries, failure handling, and rollback

- No code, product route, API, schema, UI, dependency, migration, production
  deployment, certificate issuance, DNS change, or HSTS activation is planned.
  This prompt authorizes read-only evidence gathering after concrete operator
  target/access approval and documentation of its result. It does not by
  itself authorize a live configuration mutation or production promotion.
- Reject example/default Caddyfiles, future or fabricated timestamps, failed
  or mixed child reports, a private/local target presented as production,
  active HSTS lacking the recorded operator decision, mismatched domains, and
  static-only evidence presented as live TLS proof. Do not log URL credentials,
  certificate private keys, secret references with values, or raw inventories.
- If the evidence fails or operator approval is missing, leave Category 1
  unresolved, record exact blockers and owner, and do not sign its matrix row.
  If a live condition degrades during read-only verification, notify the named
  operator and follow the existing incident runbook; this prompt does not
  authorize a rollback. Documentation rollback is a revert of the scoped
  commit, preserving operator evidence in its approved store.

## Verification, review, and completion

1. Quote actual outputs and exit codes for the schema check, Caddy verifier,
   readiness validator, `npm run ops:templates`, `npm run ops:check`,
   `npm run lint`, `npm run typecheck`, `npm run build`, and
   `git diff --check`. Run only commands appropriate to the available target;
   report any unrun live check as unverified. Inspect the full and staged diffs
   for private identifiers and secrets. Do not run a full seven-stage drill
   as a shortcut to this category's independent live checks.
2. Dispatch a read-only reviewer subagent with `requesting-code-review`, the
   requirements, baseline/head SHAs, changed paths, exact check results, and
   the redacted evidence/approval distinction. Evaluate feedback with
   `receiving-code-review`, fix verified issues, rerun affected checks, and
   request follow-up review for material changes.
3. Stage only the approved prompt/documentation changes and any explicitly
   approved redacted record. Commit to local `main` using `caveman-commit`;
   do not push. Report the Category 1 state and the exact operator location
   for inspecting restricted evidence without exposing it. If no real evidence
   was supplied, the completion statement must say Category 1 remains
   unresolved and Phase 12 remains open.

## SKILLS USED

- `deployment-pipeline-design` — keep production target, change authority, and sign-off separate from static verification.
- `secrets-management` — protect certificate material and restricted operational evidence.
- `security-best-practices` — review secure handling of the public ingress and HSTS decision if implementation or configuration changes arise.
- `security-threat-model` — check the existing ingress trust boundary if its assumptions change.
- `requesting-code-review` — independent review of the evidence record and scoped diff.
- `receiving-code-review` — verify reviewer findings before changing the record.
- `caveman-commit` — concise final local commit message.

If execution expands into other Phase 12 surfaces, load the matching skills
from `docs/build-plan.md` §13 before touching them; this prompt does not
pre-authorize that expansion.
