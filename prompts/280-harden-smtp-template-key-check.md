# Phase 12K — Harden SMTP credential template-key validation

## Scope and why this is next

Continue the unfinished Phase 12 launch gate in `docs/build-plan.md` §§13–14
after committed prompt 279 (`c051719d1cea4da5370260edfbd3b6b4707f8cf7`).
This is a bounded, dependency-safe Stage 1 template-preflight step. The current
`checkSmtpTemplateKeys` helper checks only assignments beginning at column zero;
it can miss whitespace-prefixed or `export`-prefixed legacy credential names,
and a nonstring direct call throws. Harden the existing pure check while keeping
its fixed, value-free diagnostics and its exact public export. The production
template already uses `SMTP_USER`/`SMTP_PASS`, matching the server config; those
names and the existing template remain authoritative.

The helper is invoked by `check-production-templates.js`, which the Stage 1
template runner calls. It is **not** an SMTP delivery verifier: Category 2
requires separate inspected live provider/DNS evidence and operator approval.
Prompt 201, Phase 12 exit, dependency advisories and the other operator gates
remain open. Resolve code and Git state again on execution; a written prompt is
not evidence of implementation.

## References read and execution prerequisites

- `AGENTS.md` §§2–7, 8.2 and 10: phase controls, prompt contract, checks,
  review and local commit.
- `docs/build-plan.md` §§13–14 and Phase 12K records through prompt 279:
  launch dependencies, verification history and remaining operator gates.
- `docs/operations.md` Prompt 218, Phase 12K, Prompt 240 and Prompt 258:
  consumed credential names, simulation/live boundary and template-check call.
- `docs/launch-checklist.md` Category 2 and §4: live SMTP child receipt,
  provider/DNS observations and operator sign-off requirements.
- `docs/security.md` SMTP boundary and Prompt 240: secret minimization and
  unauthenticated evidence limitations. No new trust boundary is planned.
- `docs/skills.md`: locked skill triggers and exact local skill paths.
- `scripts/ops/check-smtp-template-keys.js` and `.spec.js`: one exported pure
  function, five current tests and fixed credential-key diagnostics.
- `scripts/ops/check-production-templates.js` and `.spec.js`: the caller passes
  the production env text and aggregates returned errors. Inspect the caller's
  other env-key scanning before changing semantics.
- `scripts/ops/check-production-templates.sh` and shell spec: Stage 1 template
  invocation and target-root behavior.
- `infra/env/production.env.example`: current declarations of `SMTP_USER` and
  `SMTP_PASS`, plus SMTP host/port/secure and sender placeholders.
- `server/src/config/env.validation.ts`: current runtime config reads `SMTP_USER`
  and `SMTP_PASS`; this is read-only context, not a server change.
- `package.json`: existing `ops:templates-test`, `ops:templates`, `ops:check`,
  lint, typecheck and build scripts.

No visual reference or pixel measurement applies to this pure Node template
validator. The check's measurable contract is the **two required keys exactly
once each, two forbidden legacy keys absent**, and fixed error identities.
There is no UI, Next/React, Tailwind, route, schema, SMTP traffic or runtime
topology change. Verify any Node API used from the installed runtime/types;
prefer the current language primitives without a dependency.

## Expected files and impact

Modify only `scripts/ops/check-smtp-template-keys.js` and its spec unless a
focused caller regression proves another file must change. Record implemented
behavior, actual checks and review in `docs/operations.md`; add the concise
Phase 12K verification record to `docs/build-plan.md`. Clarify the Category 2
template/live distinction in `docs/launch-checklist.md` only if its current
wording becomes inaccurate. Include this prompt in the eventual local commit.
No package script or dependency is needed. Template preflight will reject
ambiguous credential declarations rather than accepting them silently; no
customer route changes.

## Implementation contract

### 1. Preserve a small pure API

Keep `module.exports = { checkSmtpTemplateKeys }` and return an array of
static, value-free error strings for every string input. Do not add a CLI,
perform I/O, inspect `process.env`, print input, or load a provider SDK. Define
one explicit behavior for a nonstring argument: a fixed validation error array
or a fixed typed error, and test it; do not permit incidental `.split` stacks
or coercion of objects/arrays. Preserve the exact existing error strings for
missing, duplicated or legacy keys where those cases already have tests.

### 2. Parse only the assignment forms that matter

Recognize the template's canonical `KEY=value` declarations. Handle LF and
CRLF without changing the value; permit blank lines and comments (including
comments naming legacy keys), and do not interpret `#` inside a value as a
new declaration. For the four watched names, detect whitespace around the key
or delimiter and an optional `export` prefix as ambiguous declarations, rather
than treating them as absent or as a valid canonical declaration. Reject
malformed watched-key lines with fixed diagnostics that name only the key and
problem family; never echo assignment values or whole input lines. Count each
canonical required key exactly once. Any appearance of `SMTP_USERNAME` or
`SMTP_PASSWORD` as an assignment, canonical or ambiguous, is forbidden.

Do not turn the helper into a general dotenv parser or validate unrelated env
variables. Decide and document how BOM, duplicate aliases, carriage returns,
and line comments are handled, with tests matching the actual Compose/example
contract. Do not require nonempty real credentials in the checked-in example:
its `__REQUIRED_*__` placeholders are intentional and separately gated before
launch. Avoid broad regexes that identify a legacy-key word inside an unrelated
value or comment as an assignment. Keep work linear in the input size and
avoid exposing credential material in thrown errors.

### 3. Preserve the integrated gate

Keep `check-production-templates.js`'s existing `productionEnv` call and
error aggregation. A clean current `infra/env/production.env.example` must
still pass. For each supported ambiguous watched-key form, a fixture copy of
the template must fail the integrated template check with a fixed value-free
diagnostic. Confirm an unrelated env entry/comment containing a legacy name
does not fail. Do not weaken the caller's other interpolation/placeholder checks
or reinterpret its separate env-key map silently. If the caller's key map is
shown to permit an ambiguous declaration to satisfy an SMTP interpolation,
reject that ambiguity in this helper; change the caller only if a focused
regression proves the helper cannot close it alone.

### 4. Meaningful tests

Extend the existing `node:test` spec for canonical success, missing and
duplicate required names, both legacy names, blank/comment lines, CRLF, BOM
decision, whitespace and `export` ambiguity, deceptive values/comments,
nonstring direct calls, and canary values absent from errors. Include a focused
integration test of the production template checker using a disposable fixture
root or its existing injected I/O interface; do not mutate checked-in templates
or rely on external SMTP/DNS. Assert both the failure status and the absence of
the canary from returned errors/output. Avoid tests that merely restate the
implementation regex; assert behavior at the production checker boundary.

## Non-goals and remaining gates

No SMTP connection, test message, DNS lookup, provider receipt, credential
resolution/rotation, production record edit, launch approval, new mail adapter,
general env parser, dependency upgrade, deployment or push. This preflight
checks declaration names in a committed example only. It cannot establish that
runtime SMTP authentication or delivery succeeds. Keep Category 2's live
operator evidence requirement explicit.

## SKILLS USED

- `secrets-management`: Avoid credential values in diagnostics and fixtures.
- `deployment-pipeline-design`: Keep Stage 1 preflight separate from the live
  launch approval gate.
- `security-best-practices`: Secure-by-default JS handling for credential-key
  input; no dedicated standalone Node CLI reference is present.
- `javascript-testing-patterns`: Behavioral unit and integrated gate tests.
- `requesting-code-review`: Mandatory independent review after self-checks.
- `receiving-code-review`: Verify feedback against the actual helper/caller.
- `caveman-commit`: Required concise local Conventional Commit without push.

The Phase 12-wide Nest, architecture, CI, metrics, SQL, browser, UI and threat
model skills do not trigger in this bounded pure-helper change. Reassess if
scope expands. Re-read every named skill on approval before editing.

## Verification, review, documentation and completion

Record BASE_SHA, branch and worktree state. Preserve unrelated work. Run and
quote actual output/exits from:

```bash
node --check scripts/ops/check-smtp-template-keys.js
node --check scripts/ops/check-smtp-template-keys.spec.js
node --test scripts/ops/check-smtp-template-keys.spec.js
npm run ops:templates-test
npm run ops:templates
npm run ops:launch-drill-test
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Run typecheck then build sequentially. Check changed JS/prompt formatting with
installed Prettier; format new documentation sections without reformatting the
historical files. If the aggregate `ops:check` stops at dependency audit,
report its actual output and the unreached stages; independently run affected
template suites. The predecessor's audit result is context, not a current
check. No live provider or production drill is authorized by this prompt.

Inspect the complete changed files and diff. Request read-only independent
review with approved prompt, requirements, BASE_SHA/HEAD_SHA, uncommitted diff,
commands/results and known simulation/live limits. The reviewer must not mutate
or delegate. Use `receiving-code-review` to verify each finding, fix valid ones,
retest and seek follow-up review if gate semantics or diagnostics materially
change. Resolve Critical/Important findings before completion.

Document final contract, exact verification output, review and limitations in
the owning docs. Rollback is a reviewed normal revert. Give safe inspection
steps from the repo root: `node --test scripts/ops/check-smtp-template-keys.spec.js`
and `npm run ops:templates`. Stage only approved paths, inspect the staged diff
and commit locally to `main` with `caveman-commit`. Do not push. This prompt
preparation authorizes no implementation, install, staging or commit.
