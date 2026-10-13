# Phase 12K — Reconciliation output path preflight

## Scope and why next

Continue Phase 12K recovery hardening after committed Prompt 353 (`5a60b05`).
The parser accepts `--output bad\0receipt.json`; main then reads environment
and can acquire/query live dependencies before publishReceipt rejects the
already-forbidden destination. Reproduced locally with a throwing env getter.
Reject that known invalid output early using the existing usage boundary.
Live operator evidence and Prompt 201 remain open; this is no launch approval.

The user explicitly requested implementation after planning. Re-read this
prompt and its skill manifest, then execute without another approval question.

## References and APIs

Read AGENTS.md workflow/phase controls/§§5–10; docs/build-plan.md Phase 12
and latest records; docs/operations.md Prompt 353; docs/launch-checklist.md
launch governance and Category 6; docs/security.md latest recovery notes;
docs/system-architecture.md §§11.3–11.4; docs/backend.md implemented-state
introduction; docs/product.md product job; docs/skills.md catalog.
Inspect scripts/ops/reconcile-storage-objects.js parser, usage catch and
publishReceipt path guard, plus its .spec.js fixtures and Unicode path cases.
Use only existing verified Array, RegExp, path.resolve, ReconcileUsageError,
node:test and fs temp-directory APIs. No Next/React/Tailwind/SQL APIs change.
No visual reference, geometry measurement or browser acceptance applies.

## Implementation contract

Allowed paths: this prompt; scripts/ops/reconcile-storage-objects.js and
.spec.js; docs/operations.md, docs/build-plan.md, docs/security.md and
docs/launch-checklist.md. No dependencies or package scripts.

1. Append offline behavioral tests named `output path preflight:`. For every
   C0 code point U+0000–001F and C1/DEL U+007F–009F, exercise separated
   `--output`, `-o`, attached `--output=` and `-o=` spellings. Freeze arrays
   and verify unchanged descriptors. Expect ReconcileUsageError exactly
   `output file path must be control-free`, with no raw path in the diagnostic.
2. Reject controls in the raw output operand before path normalization can
   erase a bad component (e.g. `bad\0/../receipt.json`). Also validate the
   resolved output, so controls inherited from --cwd or programmatic base cwd
   cannot reach main acquisition. No new restriction on cwd when no output
   is requested. Keep existing missing/blank/leading-hyphen/duplicate rules.
   Reuse the exact existing publishReceipt control range, without broadening
   it to Unicode display marks or whitespace. Keep its standalone guard.
3. Runner tests for representative controls in output, normalized-away raw
   components, --cwd and options.cwd assert return 1, one fixed usage error,
   one help message, and no env/inventory/client access. Combine --help with
   invalid output to prove validation is not bypassed. Use a real temp
   directory and assert no receipt/staging artifacts; preserve frozen inputs.
4. Positive parser controls: spaces, accented and astral names, U+061C,
   U+200E/U+200F, U+2028/U+2029, U+202A–202E and U+2066–2069 remain literal
   destinations. Existing Unicode publication tests must pass. Add one real
   temporary clean simulation receipt with a spaced/accented name and assert
   exact path, clean status and simulation mode. No new filesystem probing
   during parsing. Proxies/custom methods, environment validation, other CLI
   option policy, output-parent/exclusivity/race checks remain out of scope.
5. Run focused new tests red before editing source, then green and the full
   reconciliation suite. Keep source change bounded to output parsing.

## Verification, review and documentation

Save actual results to /tmp/acres-354-*.log. Run source/spec node -c,
CLI --help, installed Prettier on the new block, npm run lint,
npm run build then npm run typecheck sequentially, and git diff --check.
Use supported escalation if subprocess/build sandbox limits interfere and
record the actual result. Run read-only example readiness; expect fail-closed,
not a launch pass. No online audit or unrelated ops:check claim.

After self-verification dispatch one read-only reviewer using
requesting-code-review with base/head 5a60b05, working diff, this prompt,
constraints and check logs. No reviewer edits or subdelegation. Evaluate with
receiving-code-review, fix verified issues, recheck and re-review significant
changes. Record actual results and limits in operations; append brief
build-plan/security/Category 6 notes. Stage only allowed paths, inspect staged
diff, commit locally to main with caveman-commit. No push.

## Impact, non-goals, rollback and inspection

Malformed output destinations fail as usage before dependency acquisition;
normal CLI, Unicode destinations, routes/UI, report schema, lifecycle,
resource ownership and standalone publication remain compatible. No live
recovery, authenticity, inventory completeness, object-byte integrity or
atomic snapshot proof. No credentials, live services, SQL/schema, operator
approval or deployment. Prompt 201, Category 6 and Phase 12 exit stay open.
Ordinary commit revert restores prior late rejection without data mutation.

```bash
node --test --test-name-pattern='output path preflight:' scripts/ops/reconcile-storage-objects.spec.js
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## SKILLS USED

- `deployment-pipeline-design`: preserve recovery and launch approval gates.
- `error-handling-patterns`: reject invalid destinations before acquisition.
- `javascript-testing-patterns`: behavioral parser/runner regression cases.
- `requesting-code-review`: independent post-verification review.
- `receiving-code-review`: verify feedback against actual behavior.
- `caveman-commit`: required local Conventional Commit.

No skill covers Node CLI path parsing specifically; local code verifies its
APIs. UI, SQL, CI, secrets, telemetry and architecture surfaces do not change.
