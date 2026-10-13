# Phase 12K — Reconciliation runner argument shape

## Scope and why next

Continue the earliest open phase, Phase 12K recovery evidence, after committed
Prompt 352 (`959b529`). Local inspection reproduced `main(null)` rejecting with
`TypeError: Cannot read properties of null (reading 'slice')`: main slices its
programmatic argv before the parser can classify invalid input. Correct this
bounded error boundary next. Live operator recovery evidence remains open;
this correction cannot satisfy that exit gate.

The user explicitly requested implementation when planning finishes. Re-read
this prompt and its skills, then execute without another approval question.

## References and verified APIs

Read AGENTS.md workflow, §§5–10 and phase-control commands; docs/build-plan.md
Phase 12 and latest records; docs/operations.md Prompt 352; docs/launch-checklist.md
Category 6/sign-off; docs/security.md latest recovery records;
docs/system-architecture.md §§11.3–11.4; docs/product.md product job;
docs/backend.md implemented-state introduction; docs/skills.md catalog.
Inspect scripts/ops/reconcile-storage-objects.js main and parseCliArguments,
its .spec.js frozen fixtures, throwing dependency getters and temporary receipt
conventions. Array.isArray, ReconcileUsageError, and usage catch are verified
in the existing parser. No external APIs or Next/React/Tailwind/SQL surfaces
change. No visual references, pixel measurements or browser checks apply.

## Implementation contract

Allowed paths: this prompt; scripts/ops/reconcile-storage-objects.js and its
.spec.js; docs/operations.md, docs/build-plan.md, docs/security.md and
docs/launch-checklist.md. Preserve unrelated changes; no dependencies or scripts.

1. Append offline tests prefixed `runner argument shape:`. Exercise null,
   booleans, numbers, bigint, Symbol, string, plain object, array-like object,
   and typed array. Include an object with a throwing slice getter and one
   with a callable slice returning plausible valid CLI arguments, proving
   non-array objects cannot bypass validation or execute their slice code.
2. Inside main's existing parsing try, before slicing or reading options.cwd,
   reject non-arrays using ReconcileUsageError with exactly
   `arguments must be an array of strings`. Reuse the established usage catch
   and preserve errors/help, return 1, and exitOnError behavior. Do not catch
   arbitrary exceptions or change io/options validation policies.
3. Tests assert exact usage diagnostic, a single help log, and return 1 before
   cwd, env, inventory or client access. Use throwing dependency getters and
   freeze object inputs; verify property descriptors remain unchanged. No live
   services or process.exit mocking. Undefined retains the existing default
   process.argv parameter semantics; do not reject it as an explicit value.
4. Positive controls: frozen full argv with both help flags still return 0;
   a frozen full dry-run argv publishes a clean simulation receipt using empty
   injected inventories in a real temporary directory. Preserve two-prefix
   slicing semantics, parser sparse validation, output exclusivity and all
   lifecycle policies. Custom array slice methods, proxies/getters and header
   content policy are outside this bounded shape correction.
5. Run new cases red before editing source, then green and full reconciliation
   suite. Source change should be a minimal guard; no parser refactor needed.

## Verification, review and records

Capture real results under /tmp/acres-353-*.log. Run source/spec node -c,
CLI --help, installed Prettier on only the appended test block, npm run lint,
npm run build then npm run typecheck sequentially; inspect git diff and
run git diff --check. If sandbox restrictions block checks, use supported
escalation and record the actual limitation and permitted outcome. Read-only
example readiness check must remain fail-closed. Unrelated ops suites and
online audit are out of scope; no aggregate ops:check claim.

After self-verification, dispatch one read-only reviewer with base/head
959b529 plus working diff, this prompt, requirements and check logs using
requesting-code-review. Reviewer must not edit or subdelegate. Evaluate with
receiving-code-review; fix verified defects and recheck, re-review significant
changes. Then document actual outputs/review/limits in operations and brief
matching build-plan/security/Category 6 notes. Stage only allowed paths,
inspect staged diff, commit locally to main using caveman-commit. No push.

## Impact, non-goals and rollback

Only malformed programmatic runner calls change: they now resolve through the
existing usage boundary rather than throwing or invoking non-array slice code.
Normal CLI, routes/UI, report schema, SDK ownership and receipt publication
stay compatible. No live recovery, authenticity, inventory completeness,
object-byte integrity or atomic snapshot proof. Prompt 201, Category 6 live
sign-off and Phase 12 exit remain open. No credentials, live services, SQL,
schema, operator approvals or deployment. Ordinary commit revert restores the
prior runner behavior without data mutation. Inspect with:

```bash
node --test --test-name-pattern='runner argument shape:' scripts/ops/reconcile-storage-objects.spec.js
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## SKILLS USED

- `deployment-pipeline-design`: preserve launch/recovery evidence gates.
- `error-handling-patterns`: classify malformed argv before property access.
- `javascript-testing-patterns`: behavioral offline cases and frozen ownership.
- `requesting-code-review`: independent review after self-verification.
- `receiving-code-review`: technically evaluate review findings.
- `caveman-commit`: required local Conventional Commit.

No skill covers Node CLI argument shape specifically; the local parser verifies
the APIs. UI, database, CI, credentials, telemetry, architecture and new trust
boundaries are untouched, so their phase skill triggers do not apply.
