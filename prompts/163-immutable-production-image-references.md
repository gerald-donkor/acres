# 163 — require immutable application images in production Compose

## Scope and why this is next

The committed baseline is `e921b06e3c68067dae91f4385ca683c4100e0d52` on
`main`; the worktree was clean before this prompt was written. Prompt 162 is
implemented and committed, and 162 was the highest existing prompt number.
The ordered product phases have implementation records through Phase 12K, but
Phase 12's exit still requires operator-approved live evidence. This is the
next dependency-safe Phase 12 release step: the production Compose template
currently builds `next`, `api`, and `worker` from the checkout, while the
operations runbook calls for immutable images from a reviewed commit and a
reproducible application rollback. CI now builds and smoke-tests both
Dockerfiles, so the missing boundary is a fail-closed production image input.

Make the reference production deployment consume two operator-supplied OCI
digest references: one client image and one server image shared by API and
worker. Add a deterministic, local preflight for those references. Do not
publish images, deploy a host, approve launch, or choose a registry or signing
provider. Those decisions remain in the 11-category operator readiness record.

## References read for planning

- `AGENTS.md` §§2–7, 8.2, 9–10; `docs/build-plan.md` Phase 12 (§13), sequence
  gates (§14), and Phase 12K (§22).
- `docs/operations.md` topology, artifacts, preflight/deploy/rollback, CI state,
  and Phase 12K; `docs/launch-checklist.md` categories 10–11 and formal sign-off;
  `docs/security.md` CI/deploy trust boundary and TM-18.
- `infra/compose/docker-compose.production.example.yml`: `next` has a client
  Dockerfile `build`, and `api`/`worker` each build `server/Dockerfile`; API and
  worker already differ by command and scheduler environment. The separate
  root `docker-compose.yml` serves local development.
- `infra/env/production.env.example` has operator sentinels but no application
  image references. `infra/launch/readiness.example.json` requires an OCI
  registry path, provenance policy, deployment/rollback owners, and a live
  readiness drill; all remain unresolved.
- `scripts/ops/check-production-templates.sh` verifies production services,
  network/mount/secret invariants, and that every Compose interpolation key has
  an environment-template entry. `scripts/ops/verify-container-security.js`
  checks Dockerfiles and Compose security. `scripts/ops/run-deployment-drill.sh`
  checks migration structure, probe contracts, drain periods, and a rollback
  command, but currently does not check application image pinning.
- `.github/workflows/ci.yml` builds and locally smoke-tests the API and client
  images; it has no publishing or production promotion job. `package.json`
  contains `ops:templates`, `ops:container-security`, `ops:deployment-drill`,
  and aggregate `ops:check`.
- No visual reference applies: this step changes deployment templates and
  preflights, not rendered UI. No pixel or breakpoint measurement is involved.
- Skills loaded during planning: `deployment-pipeline-design` for the release
  boundary and rollback gate; `secrets-management` for operator inputs and log
  redaction; `javascript-testing-patterns` for useful negative tests. The
  existing reviewed Compose and script APIs are the repository authority.
  Before execution, verify any Docker Compose behavior used by the
  implementation with the installed CLI or official docs, per §10 rule 2.

## Implementation contract

1. Change only the **reference production** Compose file so `next.image`
   requires `${ACRES_CLIENT_IMAGE:?...}`, and `api.image` and `worker.image`
   require the same `${ACRES_SERVER_IMAGE:?...}`. Remove their `build` blocks.
   Keep their commands, environment, health checks, networking, ports, mounts,
   dependencies, and stop behavior intact. The reference must never silently
   fall back to building application source on the production host. Leave the
   local development Compose file and both Dockerfiles intact.
2. Add `ACRES_CLIENT_IMAGE` and `ACRES_SERVER_IMAGE` to
   `infra/env/production.env.example` with clear `__REQUIRED_*__` sentinels
   that explain the `registry/path@sha256:<64 lowercase hex>` shape without
   embedding a plausible release image. Do not add registry credentials or
   signing keys to this template. The image references are deployment
   identifiers, not secrets, but avoid printing the whole production env.
3. Add a small pure validation module/CLI at
   `scripts/ops/check-release-images.js`. It must inspect the three app
   services in the checked-in Compose YAML and validate the two supplied
   environment values before a release is attempted. Require a complete
   registry/path and `@sha256:` with exactly 64 hexadecimal digits; reject
   empty values, sentinels, mutable tags (including tag-plus-digest ambiguity),
   whitespace/control characters, shell metacharacters, malformed hosts/ports,
   and non-`sha256` algorithms. Verify `next` uses the client input and both
   `api` and `worker` use the *same* server input, with no `build` on any of
   those services. Check for an actual registry component rather than treating
   a bare repository name as an operator-approved registry. Parse values as
   data; never evaluate them, interpolate into a shell command, or echo them
   in an error. The exact OCI reference grammar should be checked against an
   installed parser or official Docker/OCI documentation during execution;
   if that check reveals an edge case, document the accepted grammar in the
   module and its tests instead of guessing.
4. Add `scripts/ops/check-release-images.spec.js` using the existing Node test
   runner. Cover a valid pair of digest references and negative cases for
   missing/sentinel input, tag-only input, tag-plus-digest, short/non-hex
   digest, malformed registry, leading/trailing whitespace, metacharacters,
   wrong Compose variable wiring, divergent API/worker references, and
   reintroduced `build`. Test that errors do not contain supplied image values.
   These are security/rollback properties, not tests that merely copy YAML.
5. Add an `ops:release-images-test` script to root `package.json` and run it
   from `ops:check`. Keep the production template static check and container
   security check in place. Make the existing `ops:templates` path enforce
   that the production app services use required image interpolation and have
   no `build`, so CI does not depend only on a unit test. If the new CLI is
   also wired into a release preflight, pass the two references as environment
   values and avoid checking operator placeholders as if they were real image
   digests. Do not add a production deploy command in this prompt.
6. Update `docs/operations.md` to show the exact operator sequence: build and
   publish reviewed client/server images externally, obtain and verify their
   immutable digests under the later approved provenance policy, inject both
   image references, run the new preflight and Compose `config --quiet`, then
   run the existing migration/deploy/readiness/rollback procedure. Record that
   CI still only smoke-tests local images; it does not publish, attest, or
   promote them. Update `docs/launch-checklist.md` category 10 so its evidence
   names the two digests, source commit, approved provenance verification, and
   previous known-good digests without treating a passing static preflight as
   live readiness. Update `docs/security.md` TM-18 only to distinguish the new
   immutable-reference control from still-open publication/provenance and
   protected promotion. Do not mark the launch checklist approved.

## Compatibility, failure, and rollback

- Existing local development and CI Dockerfile smoke tests continue to build
  from source. The production reference intentionally becomes unusable until
  both real image digests are supplied. A missing or mutable reference must
  fail before any app replacement or migration.
- API and worker must use one identical server digest, so an operator cannot
  accidentally run two server versions with different queue/schema behavior.
- Preserve all existing private-network, non-root, credential-injection,
  scheduler-singleton, and encrypted-volume contracts. No database migration,
  API, UI route, or runtime package change is authorized by this prompt.
- This step does not prove that an image was signed, that a digest belongs to
  the reviewed source commit, or that a host can safely roll back. Those need
  operator-controlled provenance and live drill evidence. The rollback for
  this *template change* is to restore the previous template while the release
  system is redesigned; never downgrade a running production host from a
  digest to an unreviewed source build as an emergency shortcut.

## Verification and review

1. Re-read this approved prompt, `AGENTS.md`, owning docs, current Compose
   and check scripts, plus every named skill before editing. Verify Docker
   Compose interpolation and image-reference syntax from the installed CLI or
   official current docs. Keep a baseline `git status` and `BASE_SHA`.
2. Run `npm run ops:release-images-test` and the CLI with synthetic valid and
   invalid digest inputs. Run `npm run ops:templates`,
   `npm run ops:container-security`, `npm run ops:deployment-drill`, and
   `npm run ops:check`; quote real output and exit codes. Validate Compose
   parsing without injecting production secrets or printing a resolved env
   document. If Docker Compose is unavailable, record that exact limitation;
   do not claim a live Compose validation passed.
3. Run `npm run lint`, `npm run typecheck`, `npm run build`,
   `npm run contracts:check`, and `git diff --check`. Inspect the complete
   diff. Run broader suites only if a concrete risk or required gate emerges.
4. Use `requesting-code-review` to dispatch a reviewer subagent with this
   prompt, changed paths, `BASE_SHA`, current `HEAD_SHA`, checks and known
   limits. Evaluate findings with `receiving-code-review`, fix verified issues,
   and request follow-up review if the Compose/release contract changes
   materially. Update the docs with observed evidence, stage only scoped
   files, inspect the staged diff, then commit locally to `main` using
   `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design` — keep immutable promotion inputs and rollback
  evidence separate from static CI checks.
- `secrets-management` — keep registry credentials and production environment
  values out of tracked templates and diagnostic output.
- `javascript-testing-patterns` — cover the release-input validator with
  behavior-focused negative tests.
- `requesting-code-review` — Stage 1 reviewer subagent after self-verification.
- `receiving-code-review` — verify and address reviewer findings.
- `caveman-commit` — required local commit message at execution time.
