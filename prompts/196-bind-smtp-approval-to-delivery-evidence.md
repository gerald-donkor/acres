# 196 — bind SMTP launch approval to delivery evidence

## Scope and why this is next

The committed baseline is `24ae51e` on `main`, with a clean worktree at planning time. Phase 12's launch gate remains open pending operator-owned production evidence. Prompt 195 bound Category 1 to Caddy routing evidence. The next checklist category, `smtp_delivery`, still accepts prose such as "Test delivery succeeded" without a delivery receipt or SPF/DKIM/DMARC result. Harden this one approval gate without sending mail or choosing an SMTP provider.

## References and measured contract

- Read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §13 and latest verification record; `docs/launch-checklist.md` §3.2; `docs/operations.md` launch-readiness section; `docs/security.md` production trust-boundary notes; `docs/skills.md`.
- Inspect `scripts/ops/check-launch-readiness.js`, its spec and fixture factory, and `infra/launch/readiness.example.json`. This is an operations-only change: no visual comp, pixel measurement, route, UI, schema migration, or Next API applies.
- Keep the existing `checkEvidenceFile` path resolution, wildcard behavior, and generic failure checks. Accept a structured child at any JSON path by content; a file name alone is insufficient. Every referenced SMTP child candidate must validate; malformed or failed candidates block beside valid ones.

## Evidence contract

An operator-created child JSON report has `drill_type: "smtp_delivery_verification"`, real nonfuture ISO UTC `timestamp`, `status: "success"`, `provider`, `host`, integer `port` from 1–65535, `tls_mode` (`STARTTLS` or `TLS`), and `from_address`. These values must match the approved readiness record (hostname/email comparison may be case-insensitive). Require:

- `delivery`: object with `status: "delivered"`, nonempty opaque `receipt_id`, and real nonfuture ISO UTC `timestamp`. It represents a provider/recipient delivery receipt, not merely SMTP acceptance.
- `dns`: object with `spf`, `dkim`, and `dmarc`, each `{ passed: true, record: <nonempty string> }`; `record` is a record reference or printout identifier, not raw secret material. Require `checked_at` as real nonfuture ISO UTC.
- `errors: []` exactly empty.
- `credentials_source_reference` in the approved record must equal `sections.secret_references.smtp_secret_source` and follow the existing indirect secret-reference policy. Reject empty/placeholder strings for `provider`, `host`, `delivery_policy`, `bounce_abuse_handling`, and `from_address`; require an integer port and valid sender email. Require the explicit `tls_mode` enum above.

The repository does not manufacture, sign, or fetch delivery receipts. The operator obtains live provider and DNS evidence out of band, stores a redacted structured child artifact locally, and references it in `smtp_delivery.evidence`. The validator checks internal consistency only; it cannot prove provenance of a hand-authored JSON file. Preserve this limitation in the docs.

## File changes

1. `scripts/ops/check-launch-readiness.js`: add `isSmtpDeliveryCandidate` and `validateSmtpDeliveryReport`; collect parsed SMTP evidence for approved Category 2; fail closed on no child, malformed/failed child, mismatch to the approved record, delivery or DNS failure, missing receipt/record references, invalid dates, or any errors. Every referenced JSON object in this category must be a valid SMTP child; a unified dossier, including one alongside a valid child, cannot qualify. Reuse existing date and email validation utilities if suitable; otherwise implement narrow local checks. Export the helpers for focused tests.
2. `scripts/ops/check-launch-readiness.spec.js`: add valid SMTP fixture to the approved-record factory; cover valid approval, missing child, prose only, malformed fields, status/delivery/DNS failure, future/invalid timestamps, record mismatch, credential-source mismatch, custom path, and wildcard valid-plus-failed child.
3. `docs/launch-checklist.md` §3.2: specify the artifact fields, command for readiness validation, and operator responsibility for real delivery/DNS proof.
4. `docs/operations.md` and `docs/build-plan.md`: record the actual checks and remaining live operator work.

## Impact, non-goals, rollback

Approved SMTP records now require a concrete, internally consistent delivery/DNS child report. The unresolved example stays blocked. No mail is sent by tests or launch tooling; no SMTP credentials are read or logged; no new package, route, UI, deployment topology, or external provider is introduced. Revert the validator, tests, and documentation in this prompt's commit to roll back.

## Verification and review

Run `node --test scripts/ops/check-launch-readiness.spec.js`, `npm run ops:templates`, `npm run ops:check`, and `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` (expected fail-closed). Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`; quote actual results and inspect the complete diff. Dispatch the `requesting-code-review` reviewer subagent with `BASE_SHA`, requirements, files, and results; evaluate its findings with `receiving-code-review`, fix valid issues, and rerun affected checks. Commit only prompt-scoped files locally on `main` using `caveman-commit`; do not push.

## SKILLS USED

- `deployment-pipeline-design` — preserve the operator approval boundary.
- `secrets-management` — keep credential references indirect and evidence redacted.
- `javascript-testing-patterns` — cover positive and fail-closed evidence cases.
- `requesting-code-review` — dispatch independent review after self-verification.
- `receiving-code-review` — evaluate and act on reviewer findings.
- `caveman-commit` — write the local commit message.
