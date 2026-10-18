# 392 — Vercel deploy upload allowlist

Sub-prompt of the approved Prompt 370 (Vercel managed migration). It inherits
370's approval limits: preview only, free tiers only, team
`team_zE3mp7nrEZ6a7cxRavwUMYC4`, project `acres`
(`prj_q9ApajZWDgdYZetnm5s5oakEjrUD`), region `iad1`. Nothing here touches
production, aliases, domains, env values or snapshots.

## 1. Scope and why it is next

`docs/vercel-deployment.md` "Resume here" names the next items, in order: a
`.vercelignore` for CLI deploys, then the `/app` `dashboardSummary` SSR
failure, then scanner rebuild/adoption or snapshot retirement. This prompt
closes the first one: Prompt 391 finding 1 ("Deploy uploads gitignored
files").

The repository has no `.vercelignore`. The Vercel CLI does **not** read
`.gitignore`, so a working-tree `vercel deploy` uploads secrets and local
evidence. Prompt 391 worked around it by deploying from `git archive HEAD`
plus `.vercel/project.json`. That works but depends on someone remembering it.
This prompt makes the safe path the default and adds a check that fails when
it is not.

Deliverables:

1. A root `.vercelignore` written as an **allowlist** (fail-closed: a new
   top-level path is excluded until someone adds it on purpose).
2. `scripts/vercel/check-deploy-manifest.js` plus a `node --test` spec: the
   upload manifest from `vercel deploy --dry` must equal exactly the
   git-tracked files inside the allowlisted scope.
3. One preview deployment from the **working tree** (secrets still on disk)
   to show the Services build still works with the smaller upload, and that
   its stored source has no ignored file in it.
4. A read-only inventory of earlier `acres` deployments whose stored source
   contains ignored files, reported to the user for a decision. **Nothing is
   deleted here.**

## 2. Evidence gathered while writing this prompt (2026-10-18)

All read-only; nothing uploaded.

- **CLI ignore logic**, read from the cached CLI 64.5.0
  (`~/.npm/_npx/67eb4586ca667318/node_modules/vercel/dist`, function
  `getVercelIgnore2`). Default ignores: `.hg .git .gitmodules .svn CVS .cache
  .next .now .vercel .npmignore .dockerignore .gitignore .*.swp .DS_Store
  .wafpicke-* .lock-wscript .env.local .env.*.local .venv .yarn/cache .pnp*
  npm-debug.log config.gypi node_modules __pycache__ venv` (+ `/target` with
  Cargo). **`.env` itself is not in the list**, which is why `/.env` and
  `server/.env` upload today. The CLI then appends the contents of
  `<cwd>/.vercelignore` (or `.nowignore`; both together are an error) using
  the `ignore` package (gitignore semantics, last match wins).
- **`--dry`**, from the same CLI's option table: "Inspect the detected
  framework preset and source files without uploading or creating a
  deployment. Non-TTY output includes every file as JSON". Running
  `node …/vc.js deploy --dry --target=preview < /dev/null > dry.json` from the
  repo root exited 0 (stderr: "Retrieving project…") and wrote JSON with keys
  `framework, basePath, fileCount, totalSize, ignoredCount, ignored,
  directories, largestFiles, files`; each `files[]` entry is
  `{path, size, mode, sha}` with repo-relative POSIX paths.
- **Current exposure** (that dry run vs `git ls-files -z`): 2,828 files,
  191 MB would upload; 1,328 are not tracked, including `.env`, `server/.env`,
  `backups/**` (drill logs and secret-rotation receipts), `ref/`, `scratch/`,
  `output/`, `.claude/scheduled_tasks.lock`, `server/dist` (764),
  `server/coverage` (251), `server/src/generated` (51), `packages/shared/dist`,
  `client/next-env.d.ts`, `client/tsconfig.tsbuildinfo`,
  `client/test-results/.last-run.json`.
- **Official docs**, <https://vercel.com/docs/deployments/vercel-ignore>
  (updated 2025-03-12): put `.vercelignore` in the project root; allowlist
  form is `/*` on the first line followed by `!` entries; in a monorepo a
  project-root-directory `.vercelignore` takes precedence over the repo-root
  one. The `acres` project has no root directory set and deploys from the
  repo root (Services), so the repo-root file is the one that applies.
- **What the build needs.** Services `client` (root `client`), `api` and
  `jobs` (root `server`) per `vercel.json`; root `package.json` workspaces and
  its `prepare` script build `packages/shared`; `package-lock.json`;
  `.node-version`. A grep of `server/src`, `client/app`, `client/lib`,
  `client/next.config.ts` and `server/prisma.config.ts` found no runtime read
  outside `client/`, `server/`, `packages/`. Prompt 391's archive deploy
  (1,503 tracked files, no `dist`/`generated`) built and passed, so build
  outputs are not needed in the upload.
- **Expected manifest**: `git ls-files -z client server packages package.json
  package-lock.json vercel.json .node-version` = **654** paths today. The
  exact number at execution time is whatever that command prints then.

## 3. Reference material read

- `AGENTS.md` (§2, §5, §6, §7, §10), `docs/vercel-deployment.md` ("Resume
  here", Prompt 391 record and findings), `docs/operations.md` (Prompt 391
  execution record), `prompts/391-scanner-candidate-preview-adoption.md`.
- `.gitignore`, `.dockerignore`, `vercel.json`, `package.json`,
  `scripts/vercel/check-vercel-config.js` (style: CommonJS, `'use strict'`,
  pure function returning `string[]` errors, JSDoc header).
- No visual reference: this prompt changes no UI.

## SKILLS USED

- `vercel:vercel-cli` — `deploy --dry`/`deploy` flags, `project inspect`,
  `vercel curl` for the protected preview; verify against `--help` of the
  installed CLI before use.
- `vercel:deployments-cicd` — preview deployment creation and inspection,
  stored-source file listing.
- `secrets-management` — classifying what leaked, and the rotation
  recommendation for local development credentials.
- `deployment-pipeline-design` — making the guarded deploy path the default
  and placing the manifest check before upload.
- `javascript-testing-patterns` — the `node --test` spec for the pure
  comparison function.
- `requesting-code-review` — stage 1 review via a reviewer subagent (§2.1).
- `receiving-code-review` — stage 2 evaluation of the review (§2.1).
- `caveman-commit` — the commit message (§3, §7).

## 4. Implementation

### 4.1 `.vercelignore` (repo root, new)

Exactly this shape (comments allowed; keep them short and factual):

```gitignore
# Allowlist: ignore everything at the root, then admit only build inputs.
# The CLI does not read .gitignore; see docs/vercel-deployment.md.
/*
!/client
!/server
!/packages
!/package.json
!/package-lock.json
!/vercel.json
!/.node-version

# Inside admitted directories: secrets, local state and build outputs.
.env*
!.env.example
*.pem
*.dump
*.tsbuildinfo
node_modules
coverage
dist
test-results
playwright-report
server/src/generated
client/next-env.d.ts
client/out
client/build
```

Rules to respect while writing it:

- `!.env.example` re-admits the two tracked placeholder files
  (`client/.env.example`, `server/.env.example`; no secrets, per
  `.gitignore`'s own comments). Without it the check's exact-equality rule
  would report them missing. No other `.env*` name is admitted. Writing-time
  check: `git ls-files client server packages | grep -E '(^|/)(dist|coverage|test-results|playwright-report|node_modules)/|\.env|tsbuildinfo|\.pem$|\.dump$'`
  printed only those two files.
- `dist` / `coverage` unanchored is intentional: no tracked file in scope
  lives in a directory named `dist` or `coverage`. Verify with
  `git ls-files client server packages | grep -E '(^|/)(dist|coverage|test-results|playwright-report)/'`
  — it must print nothing. If it prints anything, anchor the pattern instead
  and say so in the record.
- Do **not** add `.vercelignore` to `.gitignore`; it is tracked.

### 4.2 `scripts/vercel/check-deploy-manifest.js` (new)

CommonJS, `'use strict'`, styled like `check-vercel-config.js`.

Exports `compareDeployManifest({ uploaded, tracked, scope })`:

- `uploaded`: array of paths from the dry-run JSON `files[].path`.
- `tracked`: array of paths from `git ls-files -z` (NUL-split, empties
  dropped — filenames with spaces exist under `client/public`).
- `scope`: array of allowlisted roots, default
  `['client/', 'server/', 'packages/', 'package.json', 'package-lock.json',
  'vercel.json', '.node-version']` (a trailing `/` means a directory prefix;
  otherwise an exact path).
- Returns `{ errors: string[], expectedCount, uploadedCount }` where:
  - every uploaded path not in `tracked` → `untracked or ignored file in upload: <path>`;
  - every uploaded path in `tracked` but outside `scope` → `out-of-scope file in upload: <path>`;
  - every tracked in-scope path not uploaded → `build input missing from upload: <path>`;
  - a path matching `/(^|\/)\.env(\.|$)/` gets the error prefix
    `SECRET:` in addition (so a leaked env file is unmistakable in output).
  - Duplicates and non-string entries → an error, not a crash.

CLI (`require.main === module`):

```
node scripts/vercel/check-deploy-manifest.js --manifest <dry.json> [--cwd <repo>]
```

- Reads the manifest file (the operator produces it with `vercel deploy
  --dry --target=preview < /dev/null > <file>`, stdout only). The script
  never runs the Vercel CLI itself, so it needs no credentials or network and
  stays unit-testable.
- Runs `git ls-files -z` in `--cwd` (default: repo root resolved from
  `__dirname`) via `child_process.execFileSync` with no shell.
- Prints `deploy manifest ok: <n> files` and exits 0, or prints each error
  (at most 50, then `… and <k> more`) and exits 1. Exit 2 on usage errors
  (missing/unknown flag, unreadable file, JSON without a `files` array).
- Prints paths only, never file contents.

`package.json` scripts:

- add `"vercel:deploy-manifest": "node scripts/vercel/check-deploy-manifest.js"`;
- append `scripts/vercel/check-deploy-manifest.spec.js` to the existing
  `vercel:probe-test` file list.

### 4.3 `scripts/vercel/check-deploy-manifest.spec.js` (new)

`node:test` + `node:assert/strict`, mirroring `check-vercel-config.spec.js`.
Cases, each asserting exact error strings:

1. exact match → no errors, counts equal;
2. `.env` uploaded and untracked → `SECRET:` + untracked error;
3. `server/.env` uploaded → same;
4. `backups/x.json` uploaded (untracked) → untracked error;
5. tracked but out of scope (`docs/product.md`, `AGENTS.md`) uploaded → out-of-scope error;
6. tracked in-scope file missing (`client/package.json`) → missing error;
7. path with spaces (`client/public/assets/ui/images/Hero Image.png`) handled as one path;
8. `package.json` exact-match scope does not admit `package.json.bak`;
9. duplicate uploaded path → error;
10. CLI: a temp manifest + temp git repo (`git init` in `os.tmpdir()`
    subdir, commit two files) → exit 0; add an untracked `.env` to the
    manifest → exit 1 and stdout contains `SECRET:`; missing `--manifest` → exit 2.

### 4.4 Local verification (before any hosted step)

Run on Node 24.21.0 per "Resume here" step 3, and quote real output:

1. `npm run vercel:probe-test` — all pass, including the new spec.
2. Dry manifest: `node <cached CLI>/vc.js deploy --dry --target=preview < /dev/null > $CLAUDE_JOB_DIR/tmp/dry-392.json`
   from the repo root (verify `deploy --help` still lists `--dry` first).
   Then `npm run vercel:deploy-manifest -- --manifest $CLAUDE_JOB_DIR/tmp/dry-392.json`
   → `deploy manifest ok: <n>` where `<n>` equals the §2 `git ls-files`
   count at that moment. The working tree must still contain `.env`,
   `server/.env`, `backups/`, `server/dist` while this runs — that is the
   point of the test. Record `fileCount`, `totalSize`, and the `ignoredCount`.
3. Negative control: `touch client/.env.check-392`, re-run the dry run and
   the check → exit 0 and the file absent from the manifest (it is ignored by
   `.env*`); then `touch client/untracked-392.txt` → check exits 1 with
   `untracked or ignored file in upload: client/untracked-392.txt`. Delete
   both files afterwards and confirm `git status --short` shows only the
   prompt's intended changes.
4. `npm run lint`, `npm run typecheck`, `npm run build` (§6) — quote the tail
   of each.

Stop here and report if any step fails. Do not deploy with a failing check.

### 4.5 Hosted proof (one preview deployment)

Only after 4.4 passes and the changes are committed (so the deployed source
SHA is recorded).

1. `vercel project inspect --non-interactive` from the repo root → owner
   `dgsloxx417's projects`, project `acres`. Stop on mismatch or
   `link_required`; never link.
2. Re-run the dry run + manifest check on the committed tree; must pass.
3. `vercel deploy --target=preview` from the **working tree** (not an
   archive), default build machine, no `--prod`, no alias. Use the cached
   CLI path; `npx vercel@latest` can hang. Record deployment ID, URL,
   created/ready times, `target`, region, and the source SHA.
4. Inspect stored source with the Vercel MCP (`list_deployment_files` for the
   new deployment; load it via ToolSearch). Assert: no path containing
   `.env`, `backups`, `ref/`, `scratch/`, `output/`, `.claude`, `dist/`,
   `coverage/`, `generated/`; and the source file count equals the manifest
   count. Quote counts and the assertion result, not file contents.
5. Smoke: `vercel curl --deployment <url> /` → 200 and
   `vercel curl --deployment <url> /api/v1/health` (verify the health path
   in `server/src` first) → 200. No synthetic accounts, uploads or env
   changes; scanner signature age is irrelevant here.
6. If the build fails: keep the deployment for diagnosis, do not retry with
   a widened allowlist blindly — read the build log, identify the missing
   input, add the narrowest `!` entry, re-run 4.4 and record why.

### 4.6 Earlier deployments (inventory only)

Read-only. With the Vercel MCP, list every deployment of project `acres`
(follow pagination) and, for each, `list_deployment_files`; record
deployment ID, created date, target, and whether its stored source contains
`.env`, `server/.env` (shown as `src/.env` / `src/server/.env`) or
`backups/`. Known from Prompt 391: `dpl_Hr9VwjL5jrA5vmsZfx7Qvi2R966b` does.

Then **stop and ask** the user, in the final report, whether to delete the
affected preview deployments. Deletion is irreversible and outside this
prompt; production `acres-phi.vercel.app`'s deployment is never deleted
without a separate production decision.

Credential note for the report (from `secrets-management`): the leaked
values are local development passwords (`.env`, `server/.env`, documented as
disposable in `/.env.example`) and drill receipts, visible only to team
members with source access. Recommend rotating the local Postgres role
passwords if they are reused anywhere else; do not rotate anything in this
prompt.

## 5. Expected impact

- New tracked files: `.vercelignore`, `scripts/vercel/check-deploy-manifest.js`,
  `scripts/vercel/check-deploy-manifest.spec.js`, and this prompt.
- Changed: `package.json` (two script entries), `docs/vercel-deployment.md`,
  `docs/operations.md` (execution record, matching Prompt 391's pattern).
- No route, API, schema, env var or UI changes. CLI uploads shrink from
  ~2,828 files / 191 MB to the tracked in-scope set.
- Deploys from a dirty working tree are now safe for ignored files; untracked
  in-scope files still fail the check, so deploys stay tied to committed
  state.

## 6. Non-goals

- The `/app` `dashboardSummary` SSR failure (next prompt).
- Scanner rebuild, adoption, or snapshot retirement; the 48 h signature
  window closing ~2026-10-20T01:00Z is not this prompt's concern.
- Deleting old deployments, rotating credentials, editing env values,
  promoting, or touching production.
- A Git-connected deployment flow or CI deploy job (Git integration does not
  upload ignored files; that choice belongs to the production decision).
- Changing `.gitignore` or `.dockerignore`.

## 7. Rollback

Delete `.vercelignore` and revert the commit; deployments are immutable, so
the hosted preview from 4.5 stays as evidence and costs nothing on Hobby.

## 8. Checks and records

- Checks: §4.4 items 1–4 with quoted output; §4.5 assertions.
- Review: `requesting-code-review` with BASE/HEAD SHAs, then
  `receiving-code-review`; re-review if the allowlist or check semantics
  change.
- Records: `docs/vercel-deployment.md` — tick the `.vercelignore` item in
  "Resume here"/Scanner source "Next" line, mark Prompt 391 finding 1 as
  resolved with the deployment ID, add a short "Deploy upload allowlist —
  Prompt 392" section (rules, check command, counts, hosted evidence,
  inventory table). Replace the "deploy only from `git archive`" guidance
  with "run `vercel:deploy-manifest` on a `--dry` manifest before every CLI
  deploy". `docs/operations.md` — Prompt 392 execution record.
- Memory: update `vercel-migration-resume.md` (no more archive-only rule).
- Commit locally to `main` with `caveman-commit`; the doc record may be a
  second commit after the hosted step, as in Prompts 390–391. No push.
