# 21 — Repair stale `picocolors` resolution

## Scope, diagnosis, and why it is next

The user reported a Next.js 16.3.1 Turbopack development overlay at
`http://localhost:3000/#benefits`. The overlay attributes the failure to
`client/app/globals.css`, but the actionable error is emitted by Next's bundled
PostCSS copy:

```text
Error: Cannot find module 'picocolors'
at node_modules/next/node_modules/postcss/lib/css-syntax-error.js
```

Repository triage on 2026-08-23 established all of the following:

- `package-lock.json` records `picocolors@1.1.1` at the hoisted
  `node_modules/picocolors` path.
- `node_modules/next/node_modules/postcss/package.json` declares
  `picocolors: ^1.1.1`.
- `npm ls picocolors postcss next --all` resolves the dependency cleanly through
  both `next@16.3.1` and `@tailwindcss/postcss@4.3.3`.
- `node -p "require.resolve('picocolors')"` resolves to
  `node_modules/picocolors/picocolors.js`.
- Resolution starting from Next's exact failing PostCSS module also succeeds:
  `require.resolve('picocolors', { paths: [require.resolve('next/node_modules/postcss/lib/css-syntax-error.js')] })`.
- The module files were installed shortly before the screenshot. A development
  process whose Turbopack graph survived dependency replacement can therefore
  retain a failed module lookup even though the current filesystem is healthy.

The evidence does **not** support a CSS syntax problem or a missing manifest
dependency. This prompt repairs and verifies the runtime/install state without
adding `picocolors` as a redundant direct dependency. It is an interrupting bug
fix ahead of the next product phase because the client cannot be inspected in
development until the overlay is cleared.

## Reference material read, by path

| path | what was established |
| --- | --- |
| `/home/dgk/Pictures/Screenshots/Screenshot_20260823_230023.png` | Next 16.3.1 Turbopack overlay at `/#benefits`; the first missing module is `picocolors`, required by Next's nested PostCSS implementation while processing `globals.css` |
| `package.json` | npm workspace coordinator; client commands run through `@acres/client`; installs belong at repository root |
| `client/package.json` | pinned `next@16.3.1`, Tailwind/PostCSS dependencies, and no direct `picocolors` dependency |
| `package-lock.json` | Next's nested `postcss@8.5.23` declares `picocolors@^1.1.1`, fulfilled by the hoisted `node_modules/picocolors@1.1.1` package |
| `client/postcss.config.mjs` | normal Tailwind 4 PostCSS registration; no custom loader or resolution override |
| `client/app/globals.css` | import-trace entry point only; no evidence that its content caused the missing-package lookup |
| `node_modules/next/dist/docs/01-app/01-getting-started/01-installation.md` | local Next 16.3 documentation confirms `next dev` is the normal development entry point and Node 24 exceeds the documented Node 20.9 minimum |
| `docs/automation.md` §4.2 | root-owned npm workspace install and script contract; `npm install` must run from repository root |
| `docs/build-plan.md` | phase 2 is committed and phase 3 is next; this runtime repair changes no phase scope or dependency |

No static design reference is applicable. The screenshot documents a build
failure, not a target visual state, and this prompt must not change page
geometry, styling, content, or interaction.

## Implementation procedure

### 1. Preserve the current repository state

- Re-read this prompt, `AGENTS.md`, `docs/automation.md`, and the local Next
  installation guide named above.
- Record `git status --short` before doing anything. Preserve every unrelated
  tracked or untracked change.
- Record the current Node/npm versions. The expected project runtime is Node 24
  LTS; do not change the runtime or dependency versions in this repair.
- Re-run the lockfile, filesystem, `npm ls`, and both `require.resolve` checks
  above. If the evidence differs materially from the triage record, stop and
  diagnose the new state instead of forcing the stale-process conclusion.

### 2. Restart only the client development process

- Identify the process listening on TCP port 3000 with a read-only process/port
  inspection. Resolve the exact PID and command; do not use `pkill`, a wildcard,
  or a repository-wide process kill.
- If the listener is the Acres `next dev` process, terminate only that process
  cleanly and wait for port 3000 to be released. If another application owns
  the port, do not kill it; report the conflict and run Acres on an explicit
  unused port for verification.
- Start a fresh client development server from the repository root through
  `npm run dev:client`. Capture its output in `/tmp`; do not add logs to the
  repository.
- Wait for the server's ready signal and request `/` and `/#benefits`. A URL
  fragment is browser-local, so server-side route verification is `/`; the
  browser check must additionally navigate to `/#benefits`.

### 3. Escalate to deterministic install repair only if a fresh process fails

If—and only if—the fresh process reproduces `Cannot find module 'picocolors'`:

1. Stop the exact fresh dev-server PID cleanly.
2. Run `npm install` from the repository root first. Inspect the real output and
   `git diff -- package-lock.json`; do not accept an unexplained lockfile change.
3. Re-run `npm ls` and both resolution checks, then start a second fresh client
   process and retest.
4. If the same missing-module error still reproduces, use root `npm ci` as the
   deterministic clean-install fallback. This intentionally rebuilds
   `node_modules` from the committed lockfile; do not manually delete
   `node_modules`, do not use `--force`, and do not change package versions.
5. Re-run the resolution checks and browser acceptance check after `npm ci`.

If the error survives a verified `npm ci`, stop. Capture the exact server log,
Node/npm versions, lockfile package entries, and reproduction command. Do not
mask a deeper Next/Turbopack problem by adding transitive packages to
`client/package.json`.

### 4. Real-browser acceptance

- Confirm `npx` exists, then use the repository's Playwright CLI wrapper at
  `.agents/skills/playwright/scripts/playwright_cli.sh`.
- Open the freshly started local URL and take a fresh accessibility snapshot.
- Navigate to `/#benefits`, snapshot again, and confirm the landing page is
  rendered rather than the Next error overlay.
- Check browser console output for the reported missing-module/build error.
- Store any useful temporary Playwright artifact under `output/playwright/`;
  remove purely diagnostic artifacts before committing unless they add durable
  value.
- Stop only the verification server started by this implementation, leaving
  the user with the exact root command to restart it interactively.

### 5. Durable documentation

Update `docs/automation.md` with a short troubleshooting entry that records:

- why a missing transitive module can be a stale dev-process/install-state
  symptom when the lockfile, filesystem, and Node resolution all agree;
- the ordered checks used here;
- the rule to restart first, repair from the root lockfile second, and avoid
  declaring a transitive dependency directly without dependency-graph evidence;
- the exact-PID process rule already used elsewhere in the document.

Do not claim `npm install` or `npm ci` was necessary unless execution evidence
shows that it was. Record the actual successful repair path.

## Expected repository impact

- `prompts/21-repair-picocolors-resolution.md` is committed as the approved
  implementation record.
- `docs/automation.md` gains the verified troubleshooting record.
- `package.json`, `client/package.json`, `package-lock.json`,
  `client/postcss.config.mjs`, and `client/app/globals.css` remain unchanged
  unless fresh-process evidence disproves the current diagnosis. Any manifest
  or lockfile change requires an evidence-backed explanation and must remain
  within this missing-module repair.
- No route, API, schema, component, style, token, copy, or animation changes.

## Non-goals

- Do not add `picocolors` as a direct root or client dependency merely to make a
  transitive dependency visible.
- Do not upgrade or downgrade Next.js, PostCSS, Tailwind CSS, Node, npm, or any
  other package.
- Do not edit `globals.css`; its presence in the import trace identifies the
  compilation entry, not the missing module's ownership.
- Do not clear arbitrary global npm caches, use `npm install --force`, manually
  remove broad directories, or kill unrelated Node processes.
- Do not change phase 3 scope or begin organizations/RLS implementation.
- Do not perform visual regression work; the rendered page should be unchanged.

## Verification and required evidence

Run and quote real output for:

```bash
node --version
npm --version
npm ls picocolors postcss next --all
node -p "require.resolve('picocolors')"
node -p "require.resolve('picocolors', {paths: [require.resolve('next/node_modules/postcss/lib/css-syntax-error.js')]})"
npm run lint
npm run typecheck
npm run build
npm run test:server
git diff --check
git status --short
```

Also quote the fresh `next dev` ready output, the HTTP result for `/`, and the
Playwright result for `/#benefits`. Review the complete diff and confirm that no
manifest, lockfile, CSS, or source change slipped in without evidence.

The first attempted diagnostic `npm run build:client` during prompt preparation
could not serve as application evidence because the agent sandbox denied
Turbopack's internal port binding (`Operation not permitted (os error 1)`). That
environmental failure is separate from the user's `picocolors` error. Execute
the required build in an environment where the project's established build
command can open its internal loopback endpoint; never report the sandboxed
attempt as an application build failure.

After self-verification, complete the mandatory two-stage review loop. Give the
reviewer the user report, this prompt, actual repair path, changed files,
verification output, and `BASE_SHA`/`HEAD_SHA`. Evaluate every finding with
`receiving-code-review`, fix verified issues, rerun affected checks, and request
follow-up review if any significant behavior or dependency change was required.

Record the result in `docs/automation.md`, stage only approved files, inspect the
staged diff, and commit locally to `main` with a message produced by
`caveman-commit`. Do not push.

## SKILLS USED

- `tailwind-4-docs` — diagnostic boundary only: establish that no Tailwind v4
  syntax, configuration, token, or CSS change is justified; its uninitialized
  optional docs snapshot must not be fetched because implementation applies no
  Tailwind guidance.
- `playwright` — verify the repaired development server in a real browser at
  `/` and `/#benefits`, including the absence of the Next error overlay.
- `requesting-code-review` — dispatch the mandatory reviewer subagent after
  self-verification with exact requirements, evidence, and git context.
- `receiving-code-review` — validate review findings against the actual runtime
  and dependency graph before applying any change.
- `caveman-commit` — produce the required terse Conventional Commit message for
  the final local commit.
