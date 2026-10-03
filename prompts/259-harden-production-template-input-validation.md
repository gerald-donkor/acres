# 259 — harden production template input validation

## Scope and why this is next

Parent phase: Phase 12K, within `docs/build-plan.md` §13/§22. Planning baseline:
`0ce3e88` (`fix(ops): modularize and test template checks`), clean worktree on
2026-10-03 before this prompt was written. Prompt 258's extraction is implemented
and committed. Its new module exposes two concrete input-validation defects:
CLI mistakes can pass silently, and syntactically valid but incorrectly shaped
configuration can escape as an uncaught JavaScript exception.

Fix these defects in `scripts/ops/check-production-templates.js` and its existing
test suite. Preserve all established infrastructure policy checks. This is a
dependency-safe repository hardening step, not completion of Phase 12. Prompt
201 still governs production evidence collection and human launch sign-off.

Planning reproduction against the committed module, without changing code:

```text
main(..., ['--unknown'], ..., {exitOnError:false}) -> code 0, errors []
main(..., ['--cwd'], ..., {exitOnError:false}) -> code 0, errors []
main(..., ['unexpected.json'], ..., {exitOnError:false}) -> code 0, errors []
validateComposeSecurityAndTopology({postgres:{volumes:{}}})
  -> TypeError: volumes.some is not a function
validateWorkerAndExporterScrape({}, {scrape_configs:{}}, '', '')
  -> TypeError: ((intermediate value) || []).map is not a function
validatePrometheusAlertsAndDashboard({groups:{}}, {}, '')
  -> TypeError: ((intermediate value) || []).flatMap is not a function
```

The `main` reproductions used the existing full `process.argv` convention:
`['node', 'check-production-templates.js', ...args]`, with captured output.

## References read and execution prerequisites

Planning read:

- `AGENTS.md`: workflow, phase commands, prompt contract, product, verification,
  standing review and local commit requirements.
- `docs/build-plan.md`: ordered phases, Phase 12 outcome/exit gate, Phase 12K
  evidence qualifications, and prompts 254–258 implemented records.
- `docs/operations.md`: production runbooks, Phase 12K, and prompt 258's current
  module/helper/test contracts.
- `docs/launch-checklist.md`: launch prerequisites, category map, §6A operator
  gap register, and production sign-off requirements.
- `docs/system-architecture.md` §§11–12: production topology, secret handling,
  health/shutdown, telemetry, and deferred decisions.
- `docs/security.md`: assets/trust boundaries and current Phase 12 evidence
  qualification; no new runtime boundary is proposed.
- `docs/skills.md`: locked skills and trigger manifest.
- `prompts/201-production-launch-evidence-and-signoff.md` and
  `prompts/258-modularize-and-test-production-template-checks.md`.

Code inspected:

- `scripts/ops/check-production-templates.js` and `.spec.js`.
- `scripts/ops/check-production-templates.sh`.
- Root `package.json`: existing `ops:templates-test`, `ops:templates`,
  `ops:check`, readiness and launch runner scripts.

At execution re-read those files, the approved prompt and every skill below.
Inspect imported checker implementations before choosing guards for their
arguments. Verify any new library API against installed source. No Next.js,
React, shadcn, Tailwind, browser or visual work is planned; static comps, crops,
CSS measurements and breakpoint requirements do not apply. No skill is needed
for a new surface beyond the manifest below.

## Expected impact and non-goals

- The Node template checker rejects invalid invocations with exit 1 instead of
  checking the default repository and returning success.
- Incorrectly shaped templates return `{ success: false, errors: [...] }` from
  `checkProductionTemplates`, and controlled failure output from the CLI.
- Valid repository templates retain their passing outcome. The shell wrapper
  keeps its prerequisite checks, downstream checks and success banner.
- No client/server routes, database schema, worker behavior, production template
  values, SLO thresholds, release images, readiness category contracts or
  operator approval rules change.
- No dependencies, generic validation framework, exhaustive Compose/Prometheus/
  Grafana schema implementation, live drill, infrastructure access, launch
  approval, dependency upgrade or push. Limit structure checks to the shapes
  actually consumed by this module and its imported validators.

## Implementation plan

### 1. Strict CLI contract

Introduce an exported parser named `parseTemplateCliArguments(args, cwd)` using
only application arguments; retain `main(argv, io, options)` accepting full
`process.argv` arrays for existing programmatic callers. The parser returns a
resolved `{ cwd }` on success and throws a controlled usage error on failure.

- Accept no arguments, one `--cwd <path>`, or one `--cwd=<path>`.
- Resolve relative paths against the explicit base cwd, defaulting to
  `process.cwd()`; allow paths with spaces as a single argument.
- Reject unknown flags, all positional arguments, repeated `--cwd` options,
  missing values, empty/whitespace-only values, and a next option supplied as a
  split-form value. Do not silently fall back to the default cwd.
- Reject non-array parser arguments and non-string entries with usage errors;
  do not call `.startsWith` on arbitrary values. Validate an explicit base cwd
  and explicit `options.cwd` before path resolution, including null, numeric
  and whitespace-only inputs. Omitted cwd retains the default.
- `--help`/`-h` remain unsupported and fail with usage; adding a help mode is
  outside this repair.
- `main` reports a concise reason and the accepted syntax, returns 1 on usage
  error, and starts no template reads/validation on invalid arguments. Preserve
  `exitOnError:false` for programmatic tests and existing CLI failure semantics.
  Successful programmatic and real-process calls still return/exit 0.
- Do not echo complete argument values or argv into errors. A supplied argument
  may accidentally contain a credential. Fixed reasons are sufficient.

### 2. Validate consumed document shapes before traversal

Add small reusable object/collection guards inside the existing module. Avoid
coercing malformed structures into passing defaults. Every malformed input must
contribute an error before that branch is skipped or replaced with an internal
safe traversal value. Preserve old diagnostic text for established semantic
policy violations on correctly shaped data.

Cover the traversal surfaces currently used:

- Compose documents and `services` must be non-null mappings, excluding arrays,
  strings and primitives. Each service entry consumed must be a mapping.
- Present `volumes`, `ports`, `expose` and `profiles` must have the collection
  types consumed by the checks. Validate volume entry structure sufficiently
  for `mountDetails`; preserve existing string and bind/volume object syntax.
- Environment and dependency mappings consumed through named keys must be
  checked before traversal; preserve the repository's explicit mapping-form
  environment and long-form health dependency policies. Do not reject valid
  unrelated fields merely because they are not checked here.
- Prometheus `scrape_configs`, jobs, `static_configs`, target lists and
  `metric_relabel_configs` must be guarded at each traversed level; null list
  entries cannot reach `job_name`, `targets` or `action` access.
- Alert `groups`, group entries, `rules` and rule entries must be guarded;
  required alert names and expression strings retain their semantic checks.
- Dashboard root, `panels`, panel entries, `targets`, target entries and present
  `expr` values must have the expected mapping/list/string shapes before
  iteration or string operations. Preserve job scopes, unit contracts and
  absent-data checks.
- Readiness root, `sections` and Category 5/6 objects must be mappings before
  their existing numeric and cron checks. Provisioning YAML files that are
  currently parse-only must at least reject empty/non-mapping roots.

Guard public helpers that currently throw incidental TypeErrors on malformed
configuration. Array-returning validators should return non-empty errors;
existing assertion-style helpers may throw a descriptive validation Error.
Do not change those established return conventions. Tests should distinguish
deliberate assertion failures from incidental traversal exceptions.

`checkProductionTemplates` must safely handle empty, malformed-syntax,
scalar-root, array-root and malformed nested files. Use file-relative field
locations in diagnostics without dumping YAML/JSON content or parser snippets.
Expected read/parse/shape failures must yield `{ success:false, errors }`, not
an unhandled stack trace. Inspect imported checker inputs and skip calls for
invalid prerequisite shapes only after recording failure. Avoid a blanket
try/catch that hides programmer defects or returns success after a skipped
validation. Keep independent valid branches checked where practical.

### 3. Regression tests in the existing Node test suite

Use `node:test` and `node:assert/strict`; do not introduce Jest or Vitest.

- Cover default cwd and both valid override forms, relative/spaced paths,
  duplicate flags, unknown flags, bare flag, empty values, extra positionals,
  option-as-value and malformed programmatic input.
- Cover captured `main` output/exit values and real spawned CLI process exit
  codes for valid and invalid invocations. Invalid invocations must produce
  controlled usage output without validation output or stacks.
- Add table-driven helper regressions for the three reproduced exceptions and
  the remaining consumed nested structures, including null collection entries
  and non-string dashboard expressions.
- Build unique temporary fixture roots with `fs.mkdtempSync` under the system
  temp directory. Copy only public template/doc/script inputs actually read
  by the module; never copy `.env`, operator records or raw evidence.
- First prove an unmodified fixture returns `{success:true, errors:[]}`. Mutate
  one input at a time to establish real orchestrator failure on malformed YAML,
  JSON, document roots and nested collections. Capture `main` failures against
  fixtures too. Restore/clean fixtures with `try/finally` or test cleanup hooks.
- Assert errors name the affected file/field, success is false, and accidental
  fixture content markers are absent from diagnostics. Check mixed valid and
  invalid branches do not become a passing result.
- Preserve all existing semantic negative tests and the repository positive
  integration test. Add behavior tests, not assertions that mirror each line
  of new guards. Do not prescribe a test count in advance.

### 4. Documentation and compatibility

Update `docs/operations.md` with the strict Node CLI usage, input failure
contract, reproduced defects, remedy, test results and limitations. Append a
concise prompt 259 record to `docs/build-plan.md`, using real verification
output. Record that Phase 12 production exit/sign-off remains open.

Expected implementation paths: the existing JS module, its spec, these two
owning docs, and this approved prompt. Root scripts already include the spec:
no package change is expected. Leave the shell wrapper unchanged unless a
minimal integration correction proves necessary within these requirements.
If materially wider edits are needed, explain the finding before extending
scope. Rollback is a normal revert of this local hardening commit; no data or
production state changes.

## Verification, review and completion

Run the following commands, recording actual output and exit codes:

```bash
node --check scripts/ops/check-production-templates.js
node --check scripts/ops/check-production-templates.spec.js
node --test scripts/ops/check-production-templates.spec.js
npm run ops:templates-test
npm run ops:templates
npm run ops:launch-readiness-test
npm run ops:readiness-test
npm run ops:launch-drill-test
npm run ops:check
npm run lint
npm run typecheck
npm run build
node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json
git diff --check
```

The unresolved readiness example must still exit 1, with 0 approved categories,
11 unresolved/blocked and the current 70 blockers. Do not alter example values
to make it pass. Report external audit/network failures accurately; do not
claim an unrun or blocked check passed. Apply the existing repository formatter
to changed code/Markdown, checking relevant local configuration first. Review
the complete scoped diff after checks; avoid unrelated reformatting.

Dispatch a read-only reviewer subagent through `requesting-code-review` after
self-verification. Supply this prompt, baseline/full HEAD SHA, working-tree
diff, affected contracts, reproduced defects and actual check results. Specify
that the work is uncommitted against HEAD so the reviewer inspects it. Evaluate
findings through `receiving-code-review`, verify claims, fix valid issues and
rerun affected checks; re-review material changes. Then finalize the records,
stage only approved paths, inspect the staged diff and commit locally to `main`
using `caveman-commit`. Do not push.

In the final result give the commit, what changed, verification evidence and
inspection commands: `npm run ops:templates` for the normal entrypoint and
`node scripts/ops/check-production-templates.js --cwd <repository-root>` for
explicit root validation. No running web service is needed to see this result.

## SKILLS USED

- `error-handling-patterns` — controlled input failures and explicit error results.
- `javascript-testing-patterns` — isolated behavioral regression and CLI tests.
- `deployment-pipeline-design` — preserve fail-closed deployment preflight gates.
- `prometheus-configuration` — preserve scrape and alert semantics while guarding shapes.
- `grafana-dashboards` — preserve panel query/unit contracts while guarding shapes.
- `secrets-management` — avoid parser/argument diagnostics exposing input values.
- `requesting-code-review` — dispatch independent review after self-verification.
- `receiving-code-review` — verify findings before fixes and re-review as needed.
- `caveman-commit` — author the required concise local commit message.
