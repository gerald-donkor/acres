# 161 — build and smoke-test the production client image in CI

## Scope and why this is next

The committed baseline is `a383fb2` on `main`; the worktree was clean before
this prompt was written. Prompt 160 is committed and 160 was the highest
existing prompt number. The ordered application phases have implementation
records through Phase 12K. This is a dependency-safe Phase 12 container and
launch verification follow-up: the production Compose example runs the Next
client from `infra/docker/client.Dockerfile.example`, but CI currently builds
and smoke-tests only `server/Dockerfile`. Static template checks cannot prove
that the client image contains a usable Next production build or starts under
its non-root runtime user. Add a fail-closed client image build and local HTTP
smoke test to the existing `docker` job after its API image smoke test.

This is build evidence for the checked-in reference image. It is not a hosted
CI result, deployment, full Compose ingress test, or operator launch approval.

## Reference material read

- `AGENTS.md` §§2, 2.1, 4–10; `docs/build-plan.md` Phase 12 (§13) and
  sequence gates (§14).
- `docs/operations.md` topology, Artifacts, and “CI State”;
  `docs/launch-checklist.md` build and promotion gates;
  `docs/security.md` CI/image trust boundary and TM-15/TM-18.
- `docs/automation.md` for verification discipline; no visual measurement or
  browser screenshot is involved.
- `.github/workflows/ci.yml`, `infra/docker/client.Dockerfile.example`, its
  adjacent `.dockerignore`, root `.dockerignore`,
  `infra/compose/docker-compose.production.example.yml`,
  `client/next.config.ts`, `client/package.json`, and `client/lib/api/server.ts`.
- Installed Next 16.3 guide at
  `node_modules/next/dist/docs/01-app/01-getting-started/17-deploying.md` and
  `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`: Docker and
  `next start` support the complete app; server-side env can be supplied at
  runtime while `NEXT_PUBLIC_*` is embedded at build time.
- `deployment-pipeline-design`, `github-actions-templates`,
  `requesting-code-review`, `receiving-code-review`, and `caveman-commit`
  skills. These guide the CI gate and review/commit workflow.
- No §0 comp or design-system board crop applies: this changes CI/container
  packaging only, not a rendered UI or layout. The existing 375/800/1280
  visual contract remains governed by the committed client suite.

## Baseline and acceptance evidence

- The `checks` job already runs lint, typecheck, build, contracts, operations,
  migrated PostGIS server tests, both query-plan gates, and 74 Playwright
  tests locally as recorded in `docs/operations.md`; `docker` has
  `needs: checks`. Do not change their order or turn failures into warnings.
- The `docker` job currently uses SHA-pinned checkout, Buildx, and
  `docker/build-push-action` with `push: false`, `load: true` for the API
  image, then starts it on host port 3001, polls `/health`, and cleans up.
- The client Dockerfile has four stages, uses Node 24 Alpine, copies the
  `client/.next` production output, runs as `USER node`, exposes port 3000,
  and starts `next start client --port 3000`. Its Dockerfile-specific ignore
  admits `client/**`; the root ignore intentionally omits client source for
  the API image. Build with `context: .` and the client Dockerfile path so
  Docker/BuildKit selects that adjacent ignore file.
- A successful gate means: the client image builds from the committed context;
  starts with no test harness or provider key; a bounded request to `/`
  returns HTTP 200 and recognizable Acres page content; at least one generated
  `/_next/static/` asset referenced by that HTML is served successfully; and
  the container is removed even when a probe fails. Capture actual image
  build, response, and cleanup status during execution. Do not infer hosted
  CI success from a local run.

## Expected impact and implementation

1. Extend only the existing `.github/workflows/ci.yml` `docker` job. After
   the current API container cleanup, add a `docker/build-push-action` step
   using the already pinned action SHA, `context: .`,
   `file: infra/docker/client.Dockerfile.example`, `push: false`,
   `load: true`, and a local tag such as `acres-client:ci`. Preserve the
   current API build and smoke steps, `needs: checks`, read-only GitHub
   permissions, and action pins. Do not add a registry, secret, or image push.
2. Start that image in the same job with a distinct name and host port 3100
   mapped to container 3000. Set only necessary nonsecret runtime values;
   never set `ENABLE_TEST_HARNESS=true` or a `GEMINI_API_KEY`. The landing
   route must render without backend credentials. Poll with a bounded retry
   window as the API smoke step does. Check HTTP status and a stable Acres
   content marker rather than relying on an open TCP port alone. Extract a
   generated `/_next/static/` URL from the returned page and request it; fail
   if missing or not served. Avoid brittle asset hash expectations.
3. Add `if: always()` client logs and removal steps. Do not let cleanup mask
   the original build/start/probe failure; ensure a failed build does not turn
   cleanup into a second, misleading failure. Use the same CI runner and
   existing Docker commands, with concise output and no environment dump.
4. If the actual image build or smoke test exposes a Dockerfile or runtime
   defect, reproduce and fix that defect in `infra/docker/` (or the minimal
   verified client packaging dependency) before declaring the gate complete.
   Follow installed Next 16.3 docs and repository contracts; do not switch to
   standalone output or alter app behavior merely to make CI green. Document
   any scope expansion and test it against the real image.
5. Update `docs/operations.md` “CI State” with the two-image gate, actual
   local evidence, and whether a GitHub-hosted run has been observed. Update
   `docs/launch-checklist.md` only if the operator procedure changes; retain
   the distinction between CI packaging checks and live launch readiness.
   Do not mark the 11-category launch record approved.

## Failure, security, compatibility, and rollback

- An unavailable Docker daemon, ignored client source, `npm ci` failure,
  Next build failure, missing runtime dependency, non-root permission error,
  timeout, non-200 landing page, or missing static asset fails the `docker`
  job. No `continue-on-error`, `|| true` around probes, or unconditional
  success response is acceptable.
- CI runs with disposable local containers only. The smoke test must not
  contact a production API, registry, external deployment, or secret store.
  Preserve the API image's existing isolation and cleanup.
- This changes CI acceptance and, only if a concrete fault is discovered,
  client image packaging. No application route, schema, API contract,
  production Compose topology, Caddy rule, or end-user layout is in scope.
  Rollback is removal of the added client image/probe steps and any narrowly
  coupled packaging fix, with the gate failure recorded in operations docs.

## Non-goals

- No release publication, image provenance/signing implementation, production
  deploy, protected environment, operator secrets, or live host drill. Those
  remain operator-gated by the Phase 12 checklist.
- No second browser suite inside the client container. The existing Playwright
  job covers journeys; this probe specifically verifies image build, startup,
  HTML, and an image-served asset.
- No design or copy change, screenshot, comp remeasurement, framework upgrade,
  action upgrade, or new CI matrix.

## Verification and review

- Parse `.github/workflows/ci.yml` with installed `js-yaml` and inspect the
  `docker` job structurally: `needs: checks`, client Dockerfile path, `load:
  true`, `push: false`, client smoke ordering after the API smoke, and
  unconditional cleanup. Inspect the Dockerfile-specific ignore behavior via
  a real build, not a text-only assumption.
- Run the exact local Docker client image build and smoke sequence with an
  unused host port. Capture the actual HTTP status, content marker, static
  asset response, container user, and process exit/cleanup. Check for
  conflicting listeners before interpreting port failures. If Docker is
  unavailable, state what could not be verified and do not claim the image
  passed; keep the CI gate fail-closed.
- Run `npm run lint`, `npm run typecheck`, `npm run build`,
  `npm run contracts:check`, `npm run ops:check`, and `git diff --check`;
  quote real output and fix discovered regressions. Run narrower tests only
  when a packaging fault requires a source change. Review every changed file
  and the final diff.
- Request Stage 1 review with `requesting-code-review`, the prompt,
  `BASE_SHA=a383fb2`, current `HEAD_SHA`, working diff, changed paths, and
  actual check evidence. Evaluate findings with `receiving-code-review`, fix
  valid issues, and re-review if the Dockerfile or runtime packaging changes
  materially. Stage only scoped paths, inspect the staged diff, and commit
  locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design` — place the image gate after repository checks
  and keep packaging failures blocking.
- `github-actions-templates` — structure the pinned, least-privilege Docker
  Actions steps.
- `requesting-code-review` — dispatch Stage 1 implementation review.
- `receiving-code-review` — verify and act on review findings.
- `caveman-commit` — produce the required local commit message.
