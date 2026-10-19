# Prompt 398 — repair optimized image delivery on Vercel preview

## Scope and why this is next

The owner reported broken landing-page images on Prompt 397's deployed
preview, then asked to fix and redeploy. Baseline inspected: `58a4d39` on
clean `main`. Preview `dpl_BrTkKoGs8Ahyd3q1DQGEhSPCgFYE`, source `004d406`,
is Ready and its page/API smoke passed, but that smoke omitted image URLs.
Parent: Phase 12 managed-target deployment hardening under Prompt 370.

Repair the verified optimized-image failure, preserve the design and image
optimization, and deploy one corrected preview after review. Production
remains outside scope. Approval executes this prompt under AGENTS.md §2.

## Verified failure and remaining uncertainty

Read-only requests through Vercel CLI 64.5.0 against the exact preview:

| Request                                                                               | Result            |
| ------------------------------------------------------------------------------------- | ----------------- |
| `/assets/ui/landing/report-device-desktop.webp`                                       | 200, `image/webp` |
| `/assets/ui/landing/trusted-mark-01.png`                                              | 200, `image/png`  |
| `/_next/image?url=%2Fassets%2Fui%2Flanding%2Freport-device-desktop.webp&w=1080&q=100` | 404, HTML         |
| same optimized URL, `q=75`                                                            | 404               |
| `/_next/static/css/84c3c50c7b9a8ede.css`                                              | 200               |

Evidence: `/tmp/acres-image-diagnosis/` response headers/bodies. The deployed
HTML in `/tmp/acres-preview-397/home.body` references the failing optimizer
route. Both source image files are tracked. `client/next.config.ts` permits
qualities 75 and 100. The failure is not explained by a missing hero file
or by requesting a disallowed quality.

**The exact routing defect remains unverified.** The public catch-all already
selects `client`; adding another identical rewrite is not an established fix.
Inspect generated output and the service/image contract first. The screenshot
alone does not prove a CSS failure; one linked stylesheet was checked, not
every CSS/font/script request. Do not present a guessed platform cause as fact.

## Reference material

Read at execution, reconciling every API with installed source/current docs:

- `AGENTS.md`; `docs/skills.md`.
- `docs/vercel-deployment.md` and `docs/operations.md`, especially Prompts
  392, 395 and 397; `docs/build-plan.md` and `docs/launch-checklist.md`.
- `docs/landing.md` asset inventory, `docs/automation.md` browser evidence
  workflow. If component markup or styling must change, read
  `docs/design-system.md`, `docs/components.md`, `docs/motion.md`, and open
  the affected reference in `client/public/assets/ui/landing-pages/` first.
  No styling change is presently planned.
- `client/app/(marketing)/page.tsx`, `client/next.config.ts`, root
  `vercel.json`, `.vercelignore`, `package.json` and `.vercel/project.json`.
- `scripts/vercel/check-vercel-config.js`, its spec, and
  `scripts/vercel/check-deploy-manifest.js`.
- Installed Next 16.3.8 guide:
  `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`
  and the images configuration guide under `05-config/01-next-config-js/`.
- Official sources fetched during preparation:
  - https://vercel.com/docs/services
  - https://vercel.com/docs/services/routing
  - https://vercel.com/docs/services/config-reference
  - https://vercel.com/docs/image-optimization
  - https://github.com/vercel/vercel-plugin/blob/main/skills/vercel-services/SKILL.md

The services documents establish ordered top-level service selection and
service-local routing; they did not identify an image-specific fix in the
passages inspected. Fetch relevant Build Output API/image contracts and
inspect installed Vercel builder code as necessary. The Firecrawl shim could
not run because mise has no selected version for that shim; official docs
were fetched through the web tool as fallback. Do not install or reconfigure
tools as an incidental part of this task.

## SKILLS USED

- `deployment-pipeline-design` — diagnosis, reviewed release gates and
  preview recovery; loaded during preparation, reload for execution.
- `vercel-react-best-practices` — preserve Next image and server-rendering
  behavior; loaded during preparation, reload for execution.
- `firecrawl` — routing for current provider-documentation research;
  loaded during preparation; use available official-source fallback if
  the CLI remains unavailable.
- `firecrawl-developer-index` — upstream contracts/issues when needed;
  consulted during preparation, read fully before using on execution.
- `secrets-management` — restricted evidence and CLI auth; reload before
  touching credentials.
- `javascript-testing-patterns` — load fully if implementing or updating
  regression tests for routing/build-output behavior.
- `playwright` — load fully before browser verification; use supported
  computer-use tooling for a connected user browser rather than bypassing
  its automation rules.
- `requesting-code-review` — independent reviewer before release and final
  commit; loaded during preparation, reload for execution.
- `receiving-code-review` — verify findings and fix valid defects; loaded
  during preparation, reload for execution.
- `caveman-commit` — all local commit messages; loaded during preparation,
  reload for execution.

Provider plugin skills named in older transcripts are not available in this
session's catalog. Use verified CLI help, installed builder code and official
documentation instead of claiming those skills were loaded.

## Authorization and limits

On approval: local diagnosis and a minimal supported delivery/routing fix;
necessary regression checks; read-only inspection of this existing preview,
its build output and the fixed project; one corrected preview deployment;
documentation and local commits. Use the fixed team
`team_zE3mp7nrEZ6a7cxRavwUMYC4` / `dgsloxx417s-projects`, project
`prj_q9ApajZWDgdYZetnm5s5oakEjrUD` / `acres`, existing `iad1` services
and free-tier/basic build settings.

No production, alias, domain, promotion, push, environment write, migration,
resource deletion, scanner refresh, account creation, uploaded user data or
paid service. Existing Vercel Authentication stays enabled. Preserve the
private API binding, cron dispatch order and queue configuration.

Do not disable optimization globally, replace Next Image with raw `img`,
change design/crops, or split the project as an unapproved workaround.
If supported optimization cannot be restored without such a change, report
the verified constraint and ask for that specific scope decision.

## Implementation procedure

### 1. Establish the build-output cause

Recheck clean `main`, current SHA, linked team/project, Node 24.21.0 and
cached CLI 64.5.0. Save fresh evidence in a new 0700 directory under `/tmp`;
files 0600, no env values/cookies/token bodies in logs or chat.

Reproduce the table above against the existing deployment. Fetch the page's
other stylesheet and representative JS/font URLs, checking MIME types and
actual content rather than treating HTML status 200 as a successful asset.

Inspect the original 404 body, response headers, deployment/build metadata,
and generated client/root output for the optimizer's route and image config.
Use documented read-only provider APIs only after verifying exact flags or
schema. If a local provider build is needed, verify `vercel build` help first,
keep secrets outside the repo, and avoid resource-creating hooks. Do not
mutate the deployed preview while investigating.

Compare Next output with the Vercel Services composition: whether image
metadata survives composition, what route owns optimization, and whether
the requested source/query reaches that route. Separate a missing route
from invalid metadata, protection, quota or query handling. Read installed
builder code/current official contracts before selecting a patch.

### 2. Apply the smallest supported fix

Expected change surface is `vercel.json` and/or `client/next.config.ts`, only
as justified by step 1. Inspect and update the config validator/spec if its
existing invariants must accommodate the verified fix. Preserve client/API/
jobs topology, API isolation, deployment protection, cron precedence, image
qualities, responsive `picture` sources, sizing and source assets.

If the fix instead requires marketing markup, first load/read its owning
design/motion guidance and reference; justify it and keep all geometry and
breakpoint choices unchanged. Do not add a proxy that accepts arbitrary
remote URLs or exposes internal services. A topology/provider/package
upgrade outside the minimal supported fix requires a separate decision.

Add regression coverage only where it exercises the discovered failure:
for example built image configuration surviving service composition or
requests reaching the optimization handler with their parameters. Do not
write a test that merely duplicates the new configuration literal. Extend
the deployment smoke procedure to check actual assets and browser image
decoding, since page status alone missed this failure.

### 3. Verify and review before deploying

Use Node 24.21.0. Run relevant tests plus `npm run vercel:probe-test`,
`npm run lint`, `npm run typecheck`, `npm run build`, formatting on changed
files, `npm run ops:scan-secrets`, and `git diff --check`. Capture real output.
Node subprocesses/network/builds may need sandbox escalation, as in Prompt 397. Run fixture tests with normal umask 022, while keeping evidence private;
do not weaken permission assertions or classify sandbox failures as passes.

Before the live step, dispatch the required read-only reviewer with the
approved prompt, verified root cause, exact diff/base SHA, checks and release
limits. Evaluate feedback, fix valid issues, recheck and re-review significant
changes. Commit the prompt, fix and relevant local record on `main` using
`caveman-commit`. Do not deploy with dirty or unrelated changes.

### 4. Deploy one corrected preview

Verify the existing preview configuration and scanner are still usable; do
not source the stale root scanner.env. Historical signature upper bound is
about 2026-10-21T09:02Z, not a new scan proof. Stop on stale/unexpected
configuration or quota refusal rather than refreshing or purchasing anything.
An env pull, if essential for this read-only check, must target preview and
a new restricted outside-repo file, never an existing custody file.

From clean `main`, run the verified cached CLI with Node 24:

```bash
node <vc.js> deploy --dry --target=preview < /dev/null > <run>/dry.json
npm run vercel:deploy-manifest -- --manifest <run>/dry.json
```

Require `deploy manifest ok`, explain count changes from 656 via tracked
inputs, and inspect the final source SHA. Then run exactly once:

```bash
node <vc.js> deploy --target=preview --scope dgsloxx417s-projects
```

Record ID/URL/source, Ready time, basic build machine, region and service
build results. A failed build goes to diagnosis of that deployment's logs;
do not loop deployments or use force/prod/promote/alias commands.

### 5. Hosted acceptance and browser evidence

Through authenticated Vercel CLI requests to the new exact deployment:

- Recheck home/login/register, anonymous app login redirect and API CSRF.
  Preserve Prompt 397's distinction between a streamed 200 redirect and
  an authenticated dashboard proof; never print CSRF or cookie values.
- Direct assets and all CSS referenced by the landing document must return
  successful responses of the correct MIME type.
- Hero optimization at width 1080 and qualities 75 and 100 must return
  decodable image bytes, never an HTML fallback; also check another valid
  rendered width. Verify response dimensions against the requested size
  while respecting documented no-upscale behavior, not an invented rule.
- Check every landing `img` and `picture` source used across 375, 800 and
  1280 CSS-pixel viewports. Scroll to trigger lazy loading, wait for images
  to settle, require `complete` and nonzero `naturalWidth`, and inspect
  failed network requests/console errors. Verify the hero and section
  photographs, not only the direct logos.

Use browser access through supported tooling and normal authorized access;
do not disable Vercel protection. If no authenticated browser is available,
attempt a documented safe session mechanism without printing credentials;
report browser visual acceptance as blocked if it cannot be established.
HTTP probes alone do not prove the screenshot issue is fully resolved.

If capturing screenshots or comparing layout, read automation guidance and
the reference files first; save evidence for all three widths. No aesthetic
redesign or invented measurement belongs in this routing repair.

### 6. Record, review and commit

Update `docs/vercel-deployment.md` with root cause, exact supported fix,
source SHA, preview ID/URL, original failing and new passing requests,
MIME/decode results, browser evidence and limitations. Update
`docs/operations.md` with commands/check output and review findings;
`docs/landing.md` only if delivery behavior/markup changed. Add short linked
records in `docs/build-plan.md` and `docs/launch-checklist.md`. State that
Prompt 397's smoke omitted images; retain its historical checks accurately.
Carry storage accounting and production approvals forward as open.

Run final formatting/secret/diff checks, independent record review, evaluate
findings and commit the reviewed record locally using `caveman-commit`.
Return the new preview URL and image-verification result. Never claim
success on a Ready build alone or conceal a blocked browser acceptance.

## Expected impact, reference deltas and breakpoint behavior

Only delivery of previously broken optimized images changes. No intended
reference delta. Keep the existing 375/800/1280 image-source selection,
dimensions, crops, typography, colors and motion unchanged.

## Recovery

Keep the existing preview URL for comparison; no production traffic moves.
A failed corrected preview remains a reported failed candidate. Reverting
the small local change is possible, but restoring the old code does not
repair its known broken optimizer. No automatic promotion, env rollback or
resource deletion is authorized.
