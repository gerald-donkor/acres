# Phase 12K — Reconciliation receipt path display

## Scope and why next

Continue Phase 12K after committed Prompt 348 (76c81e9). Git history and the
runner show the recovery gate remains open and the latest terminal escaping
change covers report fields only. The success message interpolates outputFile
raw. Publication rejects C0/C1 controls but accepts Unicode line separators,
directional controls and backslashes in filenames and parent directories.
These can still change the displayed receipt location or introduce lines.
Reuse the existing display policy at this remaining interpolation boundary.
The user explicitly requested execution when planning finishes; re-read this
prompt and execute without another approval request.

## References read and authority

AGENTS.md §§2, 5–10; docs/build-plan.md Phase 12 and Prompt 348;
docs/operations.md Prompt 348 and recovery contract; docs/launch-checklist.md
Category 6 and formal sign-off matrix; docs/security.md TM-19 and Prompt 348;
docs/system-architecture.md §§11.3–11.4; docs/product.md §§1, 5;
docs/backend.md current/target bridge; docs/skills.md trigger catalog.
Inspect scripts/ops/reconcile-storage-objects.js summaryText, publishReceipt,
parseCliArguments and main, and the spec's receipt-directory and IO helpers.
No visual reference or measurement applies: no UI changes. No Next, React,
Tailwind, SQL or SDK API is introduced. The existing private helper and local
fs/path test APIs are verified in source. The security skill supplies general
safe-output guidance but has no Node CLI-specific reference; retain the local
policy already specified in Prompt 348, without claiming a universal standard.

## Exact implementation

Allowed files: this prompt; scripts/ops/reconcile-storage-objects.js and its
.spec.js; docs/operations.md, docs/build-plan.md, docs/security.md,
docs/launch-checklist.md. No dependency, environment or npm-script changes.

1. Append behavioral runner tests before source edits using existing temporary
   directory and IO helpers. Use filenames containing actual U+2028/U+2029,
   U+202E/U+2066/U+2069, literal backslash escape-looking text, and ordinary
   Unicode/spaces/quotes; cover a control-bearing existing parent directory.
   All values are synthetic and inventories injected; no database/S3 access.
2. For each accepted path, assert the receipt is created at the exact resolved
   original path with parseable unchanged report schema and correct status;
   the success log contains the expected literal escaped display path, with
   no embedded controls or extra LF beyond its existing leading newline.
   Ordinary paths must keep their prior message. Compare actual-control and
   literal-backslash names so they remain distinguishable. Assert no temporary
   files remain. Include a non-clean result to verify exit 1 still publishes.
3. Change only the success-message interpolation to summaryText(outputFile).
   Do not escape the filesystem destination, normalize filenames, export a
   helper, reject newly accepted paths or change publication/error behavior.
   Keep the structural leading newline and fixed message unchanged.
4. Add regression coverage for an existing receipt at a control-bearing path:
   retain exclusive-publication failure, unchanged file bytes, no success
   message and fixed diagnostics. Preserve input inventories and ownership.

## Verification and completion

Run the new tests red, then green and npm run ops:reconcile-test. Run source
and spec node -c, CLI --help, installed Prettier checking of added tests,
npm run lint, npm run build, then sequential npm run typecheck, and
 git diff --check. Capture real outputs under /tmp/acres-349-*.log and quote
actual totals in operations. Run the readiness example read-only to confirm
it remains fail-closed. Do not rerun unrelated full ops suites or online audit;
no aggregate ops:check pass or fresh vulnerability inventory claim.

Self-review all changed code, then dispatch one independent read-only reviewer
with requesting-code-review: base/head 76c81e9 plus working diff, this prompt,
implementation summary and real check logs. No reviewer subdelegation.
Evaluate feedback with receiving-code-review and fix verified defects; re-review
significant changes. Then record implementation, checks, review, compatibility,
limits and rollback in operations and brief matching build-plan/security and
Category 6 records. Inspect the staged diff and commit to main using
caveman-commit. No push.

## Impact, non-goals and rollback

Only the terminal receipt-location display changes. Filesystem paths, JSON
identity values, schema, status, exit codes, exclusive publication and resource
ownership remain intact. No routes, product UI, services, credentials,
migrations, deployments or operator approval. This does not establish Unicode
confusable detection, evidence authenticity/completeness, byte integrity or
atomic/live recovery. Prompt 201, Category 6 live approval and Phase 12 exit
remain open. Ordinary revert restores the prior message without data mutation.
Inspect with npm run ops:reconcile-test and
node scripts/ops/reconcile-storage-objects.js --help.

## SKILLS USED

- `deployment-pipeline-design`: preserve recovery acceptance and launch gates.
- `error-handling-patterns`: preserve publication failures and exit behavior.
- `javascript-testing-patterns`: focused offline runner regression coverage.
- `security-best-practices`: safe display of user-selected receipt paths; CLI guidance gap stated above.
- `requesting-code-review`: independent review after self-verification.
- `receiving-code-review`: verify feedback against source and approved scope.
- `caveman-commit`: required local Conventional Commit and security rationale.

Architecture, Nest, CI, observability, secret management, browser, SQL, UI and
formal threat-model skills have no changed surface in this bounded task.
