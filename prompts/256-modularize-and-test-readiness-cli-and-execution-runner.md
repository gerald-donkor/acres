# Phase 12K follow-up — modularize and test readiness CLI argument parsing, summary formatting, and execution runner

## Scope and why this is next

Modularize the remaining command-line interface (CLI) argument parsing, human-readable summary formatting, end-to-end execution runner, and main entrypoint in `scripts/ops/check-launch-readiness.js`:
1. Extract `parseCliArguments(args, cwd)`: parses command-line arguments, rejects invalid flags (e.g. `--help`, `--flag`), rejects excessive positional arguments, and resolves the target readiness file path relative to `cwd` (defaulting to `infra/launch/readiness.example.json`).
2. Extract `formatReadinessSummary({ categoryBlockers, totalApproved, totalSections, targetPath, cwd })`: encapsulates rendering the human-readable report banner, per-category blocker listings, statistics summary table (total required, approved, unresolved, total blockers), and fail-closed vs. passing result notice.
3. Extract `runReadinessCheck(targetPath, options, io)`: orchestrates resolving the target path, asserting file existence, parsing JSON contents, delegating to `validateReadiness()`, rendering the summary via `formatReadinessSummary()`, dispatching lines to configurable `io` logging/error callbacks, and returning a structured result object `{ success, exitCode, targetPath, relativePath, totalApproved, totalSections, totalBlockersCount, categoryBlockers, summary, error }`.
4. Refactor `main(argv, io)`: delegates cleanly to `parseCliArguments()` and `runReadinessCheck()`, calling `process.exit(result.exitCode)` when executed directly as the script entrypoint (`require.main === module`), and returning `result.exitCode` when invoked programmatically.
5. Export `parseCliArguments`, `formatReadinessSummary`, `runReadinessCheck`, and `main` in `module.exports`.
6. Establish comprehensive unit and contract tests in `scripts/ops/check-launch-readiness.spec.js` verifying argument parsing, report formatting, execution runner flows (file-missing, parse-error, fail-closed unapproved record, passing approved record), and programmatic `main` invocations.

Following Prompts 246–255:
- All 11 checklist categories enforce discrete category section validators and syntax/format helpers.
- Document-level structure checks, placeholder scans, section structural verification, and evidence collection/routing have been extracted and tested in Prompt 255.
- The remaining procedural block in `scripts/ops/check-launch-readiness.js` is the inline `main()` function (lines 3628–3695), which tightly coupled argv parsing, direct `console.log`/`console.error` calls, and unconditional `process.exit()` calls.
- Modularizing this CLI execution runner completes 100% modularization and export coverage of `scripts/ops/check-launch-readiness.js`, enabling clean programmatic execution and thorough isolated testability without process exits or console pollution.

This is a repository-owned, dependency-safe hardening and refactoring step within Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning baseline: clean worktree at commit `7d3e83e` (`fix(ops): modularize readiness structure and evidence flow`).

## References read and execution prerequisites

Planning read:
- `AGENTS.md` phase-control, workflow, prompt, product, and standing rules
- `docs/build-plan.md` Phase 12 and Phase 12K (prompts 246–255)
- `docs/skills.md`
- `docs/system-architecture.md` §11–12
- `docs/security.md` TM-01, TM-04, TM-05, TM-15, and Phase 12K evidence integrity
- `docs/operations.md` Phase 12K and prompts 246–255
- `docs/launch-checklist.md` Categories 1–11
- `prompts/201-production-launch-evidence-and-signoff.md`
- `scripts/ops/launch-readiness.sh`

Code inspected:
- `scripts/ops/check-launch-readiness.js` (`main` lines 3628–3699, `module.exports` lines 3701–3795)
- `scripts/ops/check-launch-readiness.spec.js`

## Non-goals

- Altering any error messages, summary format, exit codes, or fail-closed behavior of `check-launch-readiness.js` or `launch-readiness.sh`.
- Modifying runtime server, client, or worker business logic.
- Altering production Docker or Caddy configurations.
- Fabricating production drill evidence or signing off on launch readiness without operator execution.

## Measurable requirements and implementation plan

### 1. Extract `parseCliArguments(args, cwd)` in `scripts/ops/check-launch-readiness.js`

Function signature:
`parseCliArguments(args = [], cwd = process.cwd())`
- Validates that `args` is an array.
- If `args.length > 1` or any item in `args` is not a string or starts with `--`:
  - Returns `{ valid: false, error: 'Usage: check-launch-readiness.js [readiness.json]' }`.
- Resolves `targetPath`:
  - If `args[0]` is provided, resolves `path.resolve(cwd, args[0])`.
  - Otherwise resolves default `path.resolve(cwd, 'infra/launch/readiness.example.json')`.
- Returns `{ valid: true, targetPath }`.

### 2. Extract `formatReadinessSummary` in `scripts/ops/check-launch-readiness.js`

Function signature:
`formatReadinessSummary({ categoryBlockers, totalApproved, totalSections, targetPath, cwd })`
- Computes `relativePath`: `targetPath ? path.relative(cwd || process.cwd(), targetPath) : ''`.
- Constructs header lines:
  - `================================================================================`
  - `ACRES LAUNCH READINESS EVALUATION`
  - `Target: ${relativePath}`
  - `================================================================================`
  - ``
- If `categoryBlockers` contains keys:
  - Adds `Unresolved Launch Blockers by Category:`, ``.
  - For each category:
    - Adds `[${category.toUpperCase()}]`.
    - For each blocker message:
      - Adds `  - ${message}`.
    - Adds ``.
- Computes `unapprovedCount = totalSections - totalApproved`.
- Computes `totalBlockersCount`: sum of all category blocker array lengths.
- Adds summary box lines:
  - `--------------------------------------------------------------------------------`
  - `SUMMARY:`
  - `  Total Required Categories: ${totalSections}`
  - `  Approved Categories:       ${totalApproved}`
  - `  Unresolved / Blocked:      ${unapprovedCount}`
  - `  Total Blockers Detected:   ${totalBlockersCount}`
  - `================================================================================`
- Computes `passed = totalBlockersCount === 0 && unapprovedCount === 0`.
- If not `passed`:
  - Adds ``, `Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.`, `This repository intentionally fails closed until real operator decisions and live drills are recorded.`, ``.
- If `passed`:
  - Adds ``, `Result: PASSED. All launch criteria approved with verified evidence.`, ``.
- Returns `{ lines, text: lines.join('\n'), passed, totalBlockersCount, unapprovedCount, relativePath }`.

### 3. Extract `runReadinessCheck(targetPath, options, io)` in `scripts/ops/check-launch-readiness.js`

Function signature:
`runReadinessCheck(targetPath, options = {}, io = {})`
- Resolves `log = typeof io.log === 'function' ? io.log : console.log`.
- Resolves `error = typeof io.error === 'function' ? io.error : console.error`.
- Resolves `cwd = options.cwd || process.cwd()`.
- Resolves `resolvedPath = path.isAbsolute(targetPath) ? targetPath : path.resolve(cwd, targetPath)`.
- If `!fs.existsSync(resolvedPath)`:
  - Calls `error('ERROR: Readiness record file not found at: ' + resolvedPath + '\n')`.
  - Returns `{ success: false, exitCode: 1, targetPath: resolvedPath, error: 'Readiness record file not found at: ' + resolvedPath }`.
- Reads file with `fs.readFileSync(resolvedPath, 'utf8')` inside a `try/catch`:
  - If JSON parse fails, calls `error('ERROR: Failed to parse readiness JSON file (' + resolvedPath + '): ' + err.message + '\n')`.
  - Returns `{ success: false, exitCode: 1, targetPath: resolvedPath, error: 'Failed to parse readiness JSON file (' + resolvedPath + '): ' + err.message }`.
- Executes `validateReadiness(record, resolvedPath, { env: options.env !== undefined ? options.env : process.env, now: options.now })`.
- Formats summary via `formatReadinessSummary({ categoryBlockers, totalApproved, totalSections, targetPath: resolvedPath, cwd })`.
- Dispatches each line of `summary.lines` to `log(line)`.
- Returns:
  ```js
  {
    success: summary.passed,
    exitCode: summary.passed ? 0 : 1,
    targetPath: resolvedPath,
    relativePath: summary.relativePath,
    totalApproved: validationResult.totalApproved,
    totalSections: validationResult.totalSections,
    totalBlockersCount: summary.totalBlockersCount,
    categoryBlockers: validationResult.categoryBlockers,
    summary,
  }
  ```

### 4. Refactor `main(argv, io)` in `scripts/ops/check-launch-readiness.js`

Function signature:
`main(argv = process.argv.slice(2), io = {})`
- Resolves `error = typeof io.error === 'function' ? io.error : console.error`.
- Calls `parseCliArguments(argv)`.
- If `!cli.valid`:
  - Calls `error(cli.error)`.
  - If `require.main === module`, calls `process.exit(1)`.
  - Returns `1`.
- Calls `result = runReadinessCheck(cli.targetPath, { env: process.env }, io)`.
- If `require.main === module`, calls `process.exit(result.exitCode)`.
- Returns `result.exitCode`.

### 5. Export all 4 functions in `module.exports`

Add to `module.exports`:
- `parseCliArguments`
- `formatReadinessSummary`
- `runReadinessCheck`
- `main`

### 6. Unit and contract test suite in `scripts/ops/check-launch-readiness.spec.js`

Add comprehensive unit test suites covering:
1. `parseCliArguments`:
   - Default target path when no arguments provided (`infra/launch/readiness.example.json`).
   - Resolves explicit target path with relative path.
   - Rejects flag arguments (`--help`, `--foo`) with usage error.
   - Rejects multiple arguments (>1) with usage error.
   - Handles custom `cwd` parameter cleanly.
2. `formatReadinessSummary`:
   - Renders passing summary banner and conclusion when zero blockers and all approved.
   - Renders category blockers breakdown and fail-closed notice when blockers exist.
   - Correctly calculates `totalBlockersCount` and `unapprovedCount`.
3. `runReadinessCheck`:
   - Returns `exitCode: 1` and calls `io.error` when file does not exist.
   - Returns `exitCode: 1` and calls `io.error` when JSON is malformed.
   - Evaluates `infra/launch/readiness.example.json` returning `exitCode: 1`, `success: false`, `totalApproved: 0`, `totalBlockersCount: 70`.
   - Evaluates mock fully approved record returning `exitCode: 0`, `success: true`, 0 blockers.
   - Captures output cleanly into custom `io.log` and `io.error` mocks without process stdout pollution.
4. `main`:
   - Returns `exitCode: 1` on invalid CLI arguments.
   - Returns `exitCode: 1` on unapproved readiness record.
   - Returns `exitCode: 0` on passing readiness record.

## Verification commands

```bash
npm run ops:readiness-test
npm run ops:launch-drill-test
npm run ops:templates
npm run ops:templates-test
npm run lint
npm run typecheck
npm run build
git diff --check
```
