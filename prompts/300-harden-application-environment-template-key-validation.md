# Phase 12K — Harden application environment template-key validation

## Scope and why this is next

Continue the unfinished Phase 12 launch gate in `docs/build-plan.md` §§13–14 from
clean `main` at `e4acd72` (`fix(deps): patch handlebars security release`).
Phase 12K's dependency security audit series (Prompts 281–299) has concluded
successfully, eliminating the remaining critical vulnerabilities and unblocking
the Stage 1 security audit gate (`npm run ops:audit` passes with 0 critical
vulnerabilities; all 32 independent operations stages in `npm run ops:check` pass).

With dependency gates clear, resume the operational verifier and template-preflight
hardening series. Prompt 280 (`21f412d`) hardened `checkSmtpTemplateKeys` in
`scripts/ops/check-smtp-template-keys.js` against ambiguous key declarations
(leading whitespace, `export` prefixes, delimiter spacing, and malformed separators)
and non-string inputs. The application environment template verifier in
`scripts/ops/check-application-environment.js` (`checkApplicationEnvironment`)
suffers from the exact same structural vulnerability:

1. **Vulnerability to evasion & missed duplicates:**
   The current line scanner uses a simple column-zero regex:
   `const match = line.match(/^([A-Z][A-Z0-9_]*)=/);`
   Any line with leading whitespace (`  KEY=val`), an `export` prefix (`export KEY=val`),
   or whitespace around the delimiter (`KEY = val` or `KEY= val`) fails to match.
   Consequently, if an operator introduces a duplicate or conflicting assignment
   where one instance has leading whitespace or an `export` prefix (e.g.
   `DATABASE_URL=postgres://...` accompanied by `  DATABASE_URL=postgres://other...`),
   the regex counts only the first instance, reporting `counts.get("DATABASE_URL") === 1`
   and silently evading duplicate assignment detection.
2. **Misleading diagnostics on ambiguous single assignments:**
   If a required key is defined only with leading whitespace or an `export` prefix,
   it is uncounted, producing a generic error `production.env.example must define ${key} exactly once`
   rather than identifying that the assignment was ambiguous.
3. **Fragile input handling:**
   Calling `checkApplicationEnvironment` directly with non-string `inputText`
   immediately throws an unhandled `TypeError: inputText.split is not a function`.
   Passing `null`, an array, or a non-object `compose` produces inconsistent or
   unhandled exceptions rather than deterministic validation diagnostics.
4. **BOM vulnerability:**
   A UTF-8 Byte Order Mark (`\uFEFF`) at the beginning of `inputText` corrupts
   the first variable's key name.
5. **Secret leakage prevention:**
   Ensure all diagnostics remain strictly value-free and never reflect raw secret
   values or candidate assignments in error strings.

Harden `checkApplicationEnvironment` following the established pattern from
Prompt 280, keeping its exact public export, fixed diagnostic identities, and
compatibility with `scripts/ops/check-production-templates.js`.

Resolve Git and code state again on execution; a written prompt proves only that
it was prepared, not implemented.

## References read and execution prerequisites

- `AGENTS.md` §§2–7, 8.2, 10: phase controls, prompt file rules, checks, review,
  and local commit.
- `docs/build-plan.md` §§13–14 and Phase 12K records through Prompt 299:
  launch dependencies, verification history, and remaining operator gates.
- `docs/operations.md` Phase 12K, Prompts 220, 223, 224, 258, 280, 299:
  environment contract, API/worker isolation, template checking, and limits.
- `docs/launch-checklist.md` Category 4 (`secret_references_encryption`):
  contract requiring twelve distinct secret references, single-assignment integrity,
  and fail-closed template verification.
- `docs/security.md` Environment and credential boundary: minimization,
  placeholder retention, and zero secret reflection.
- `docs/skills.md`: locked skill triggers and exact local skill paths.
- `scripts/ops/check-application-environment.js` and `.spec.js`: pure function
  `checkApplicationEnvironment(compose, inputText)` and existing 13 unit tests.
- `scripts/ops/check-smtp-template-keys.js` and `.spec.js`: the Prompt 280
  reference implementation for ambiguous line scanning and BOM stripping.
- `scripts/ops/check-production-templates.js` and `.spec.js`: caller integration
  and template preflight assertions.
- `infra/env/production.env.example`: authoritative 40+ key environment template.
- `infra/compose/docker-compose.production.example.yml`: authoritative Compose
  production reference manifest.
- `package.json`: `ops:templates-test`, `ops:templates`, `ops:check`, lint,
  typecheck, and build scripts.

No visual comp, UI component, route, or database schema change is involved.
The measurable contract is:
- Clean validation of current `infra/env/production.env.example` and Compose reference;
- Strict detection and rejection of ambiguous assignments (`export`, leading whitespace, delimiter spacing);
- Deterministic duplicate detection regardless of formatting;
- Graceful error return (`['production.env.example must be text']` or `['compose must be an object']`) for non-text/invalid inputs;
- Zero reflection of secret values in error messages.

## Files, behavior and non-goals

### Files to change

1. `scripts/ops/check-application-environment.js`:
   - Validate `inputText`: return `['production.env.example must be text']` when `typeof inputText !== 'string'`.
   - Validate `compose`: return `['compose must be an object']` when `compose` is null, undefined, not of type `'object'`, or an `Array`.
   - Strip leading UTF-8 BOM (`^\uFEFF`).
   - Line parsing:
     - Ignore comment lines (`/^\s*(?:#|$)/`).
     - Use a comprehensive watched-key regex matching variable identifiers:
       `/^(?:\s*export\s+)?\s*([A-Z][A-Z0-9_]*)(?=$|[^A-Za-z0-9_])/`.
     - Detect canonical column-zero assignments:
       `line.startsWith(`${key}=`) && !/^\s/.test(line[key.length + 1] || '')`.
     - Flag ambiguous assignments (leading whitespace, `export` keyword, whitespace before/after `=`).
     - Track both canonical and ambiguous assignments in `counts` so duplicates across any syntax are accurately tallied.
     - Report `production.env.example has an ambiguous ${key} assignment` for any watched key detected with ambiguous syntax.
     - Preserve the exact existing error `production.env.example must define ${key} exactly once` when total occurrences !== 1.
   - Retain unchanged:
     - `SHARED`, `API_ONLY`, `FIXED` lists and constants.
     - Unresolved `CSRF_SECRET` placeholder check (`production.env.example must retain the unresolved CSRF_SECRET placeholder`).
     - Service-level environment map requirements (`compose missing ${name} service`, `must not declare env_file`, `must not extend another service`, `must declare an environment map`, `has unexpected environment key ${key}`, `missing environment key ${key}`, `must set ${key} to its fixed value`, `must require ${key} from the matching Compose input`).
     - Value-free error messages: ensure error messages never interpolate input values.

2. `scripts/ops/check-application-environment.spec.js`:
   - Add test cases covering:
     - Non-string `inputText` returns `['production.env.example must be text']`.
     - Null / primitive `compose` returns `['compose must be an object']`.
     - Leading UTF-8 BOM is cleanly stripped and accepted without diagnostics.
     - Commented-out variable assignments do not count as definitions or ambiguous errors.
     - Ambiguous assignments (whitespace prefix, `export` prefix, spaces around `=`) are rejected with `production.env.example has an ambiguous ${key} assignment`.
     - Duplicate definitions where one instance uses `export` or indentation are detected and rejected.
     - Verifying that sensitive values assigned in ambiguous or duplicate lines are never included in returned error messages.

3. `docs/operations.md`:
   - Record Prompt 300 implementation, contract details, actual check outputs, and rollback steps.

4. `docs/build-plan.md`:
   - Append concise Prompt 300 verification record under Phase 12K.

### Non-goals

- No changes to `infra/env/production.env.example` or `infra/compose/docker-compose.production.example.yml`.
- No modifications to NestJS server runtime, client application, or database schemas.
- No live production drills, network egress, or git pushes.
- No changes to unrelated validators (`check-smtp-template-keys.js`, `check-proxy-environment.js`, etc.).

## Implementation procedure

1. Re-read this prompt and loaded skills before writing code.
2. Inspect `scripts/ops/check-application-environment.js` and `scripts/ops/check-smtp-template-keys.js`.
3. Implement type validation, BOM stripping, line scanning, ambiguous assignment tracking, and error reporting in `scripts/ops/check-application-environment.js`.
4. Update `scripts/ops/check-application-environment.spec.js` with comprehensive positive and negative test cases.
5. Run focused checks:
   - `node --check scripts/ops/check-application-environment.js`
   - `node --check scripts/ops/check-application-environment.spec.js`
   - `node --test scripts/ops/check-application-environment.spec.js`
   - `npm run ops:templates-test`
   - `npm run ops:templates`
   - `npm run ops:check`
6. Run global verification:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
   - `git diff --check`
7. Dispatch code reviewer subagent via `requesting-code-review`.
8. Evaluate feedback with `receiving-code-review`, making any necessary technical corrections.
9. Document changes in `docs/operations.md` and `docs/build-plan.md`.
10. Commit changes locally using `caveman-commit`.

## SKILLS USED

- `security-best-practices`: Secure-by-default input handling, defensive regex parsing, and secret non-reflection.
- `javascript-testing-patterns`: Node.js test runner unit and integration tests for template validators.
- `requesting-code-review`: Mandatory independent code review request dispatch.
- `receiving-code-review`: Technical verification and evaluation of reviewer feedback.
- `caveman-commit`: Conventional Commits local commit message generation.

## Verification, review, documentation and completion

Record BASE_SHA, branch, and worktree state. Run and quote actual outputs and exit codes from:

```bash
node --check scripts/ops/check-application-environment.js
node --check scripts/ops/check-application-environment.spec.js
node --test scripts/ops/check-application-environment.spec.js
npm run ops:templates-test
npm run ops:templates
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Format new documentation without reformatting existing history.
Inspect the complete diff before dispatching `requesting-code-review`.
Verify feedback using `receiving-code-review`, resolve valid findings, and update documentation.
Stage approved files only, inspect staged diff, and commit locally with `caveman-commit`.
Do not push.
