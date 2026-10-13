# Phase 12K — Reconciliation terminal summary escaping

## Scope and why next

Continue the open recovery-evidence gate after committed Prompt 347
(`c59e73adf68737a71d194700d3729f53aac6abcf`). The CLI summary interpolates
accepted database identifiers and S3 keys directly into terminal output.
Newlines, carriage returns and ESC sequences can forge lines or manipulate
how recovery findings appear. Escape display text at the formatter boundary;
retain exact source values in machine-readable evidence. This is one bounded,
dependency-safe Phase 12K hardening unit. The user instructed implementation
when planning finishes; re-read this file and execute without asking again.

## References and authority

Read AGENTS.md §§2, 5–10; docs/build-plan.md Phase 12 and latest records;
docs/operations.md recovery sections and Prompt 347; docs/launch-checklist.md
Category 6; docs/security.md TM-19 and operational evidence contract;
docs/system-architecture.md §§11.3–11.4; docs/product.md product/data journey;
docs/backend.md current/target distinction; docs/skills.md skill triggers.
Inspect scripts/ops/reconcile-storage-objects.js formatter, comparison and main,
and its spec's existing formatter and runner fixtures. JavaScript built-ins
must be verified against installed TypeScript lib.es5.d.ts and existing code.
The security skill has no Node CLI terminal-specific reference: its general
safe-output principle applies; the concrete escaping policy below is a local
engineering decision, not a third-party standard claim. No visual surface,
measurement, Next/React API, SQL, schema or service topology changes.

## Implementation and exact policy

Allowed files: this prompt, scripts/ops/reconcile-storage-objects.{js,spec.js},
docs/operations.md, docs/build-plan.md, docs/security.md,
docs/launch-checklist.md. No dependency or script additions.

1. Append focused regression cases before source changes. Produce reports
   through reconcileObjects, using synthetic accepted keys/IDs containing
   LF/CR/tab/NUL/ESC, DEL/C1 controls, Unicode U+2028/U+2029 separators,
   U+202A–U+202E directional embedding/override controls, and U+2066–U+2069
   directional isolate controls. Include literal backslashes to distinguish
   a literal escape-looking key from a key containing the actual control.
   Exercise missing objectKey/organizationId/id, mismatch objectKey and orphan
   key. Preserve normal Unicode, quotes, spaces, punctuation and path separators.
2. Introduce a private formatter helper: convert the supplied display value
   to a string; replace backslash with two literal backslashes and each code
   unit in U+0000–U+001F, U+007F–U+009F, U+2028–U+202E and U+2066–U+2069
   with a lowercase six-character literal \\uXXXX escape. This includes U+2028
   and U+2029 along with the five embedding/override characters. Use a single
   replacement pass so generated escape backslashes are not escaped again.
   Do not export the helper or normalize/reject original inventory values.
3. Apply the helper to formatter text interpolations: timestamp, status,
   missing key/org/id/state, mismatch key and joined issues, orphan key.
   Numeric count/byte-count fields are already generated from validated numeric
   values; leave their presentation unchanged. Preserve existing structural
   newlines, fixed labels/headings, counts, status/exit behavior and ordinary
   text. Valid source text containing a backslash now displays doubled.
4. Assert all findings occupy their intended detail line, no embedded control
   survives except formatter-owned LF, escape-looking versus actual-control
   identifiers remain distinguishable, and input reports remain unchanged.
   Cover the helper's additional text call sites with a direct formatter case.
5. Add runner coverage with injected clients/inventories and temporary output:
   a missing or mismatching object remains exit 1 and an orphan remains warning
   (or exit 1 with --fail-on-orphans). Logs escape controls; JSON.parse of the
   exclusive receipt recovers the exact raw key/IDs; original inventories stay
   untouched; caller clients stay open and no .tmp files remain. Use synthetic
   values only. Also verify normal clean output remains compatible.

## Verification

Run new tests red before the source edit. Then npm run ops:reconcile-test;
source/spec node -c; CLI --help; installed Prettier check of appended tests and
new helper region; npm run lint; npm run build; subsequent sequential
npm run typecheck; git diff --check. Capture actual outputs in /tmp and quote
meaningful totals in docs/operations.md. Check the readiness example still
fails closed and record actual counts. Do not rerun unrelated full ops suites
or online audit; do not claim aggregate ops:check or a fresh audit inventory.

After self-verification, dispatch one independent read-only reviewer using
requesting-code-review (base/head c59e73a plus working diff, prompt and actual
check logs). No reviewer subdelegation. Evaluate feedback with
receiving-code-review, verify fixes and re-review significant changes.
Record the implementation, tests, review, compatibility and limits in
operations; add concise matching build-plan/security/Category 6 records.
Inspect staged diff and commit locally to main using caveman-commit; no push.

## Expected impact, non-goals and rollback

No route or product UI changes. Console identifiers become safely escaped;
JSON evidence keeps exact original values and existing schemas. This is display
escaping, not redaction, provenance verification, Unicode confusable detection,
or evidence authenticity/completeness/byte-integrity/atomic-snapshot proof.
Live restore and Category 6 operator sign-off remain separate, open gates;
Prompt 201 and Phase 12 exit remain open. No live services, credentials,
migrations, deployments, operator approvals or push. Ordinary revert restores
prior display without data mutation. Inspect with npm run ops:reconcile-test
and node scripts/ops/reconcile-storage-objects.js --help.

## SKILLS USED

- `deployment-pipeline-design`: preserve recovery and operator acceptance gates.
- `error-handling-patterns`: keep existing failure diagnostics and codes intact.
- `javascript-testing-patterns`: offline report/runner regression coverage.
- `security-best-practices`: safe display of untrusted metadata; CLI-specific guidance gap stated above.
- `requesting-code-review`: independent review after self-verification.
- `receiving-code-review`: verify feedback against the actual formatter and contracts.
- `caveman-commit`: required local Conventional Commit with security rationale.

Phase-wide architecture, Nest, CI, observability, secrets, browser, SQL,
accessibility and threat-model skills have no changed surface in this bounded
formatter task. No new trust boundary or formal threat-model work is introduced.
