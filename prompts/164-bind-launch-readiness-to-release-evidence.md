# 164 — bind launch readiness to release evidence

## Scope and why this is next

The committed baseline is `05e3209` on `main`; the worktree was clean before
this prompt was written. Prompt 163 is implemented and committed. The ordered
product build reaches Phase 12K, but Phase 12's exit still needs an
operator-approved live launch record. This is the next dependency-safe Phase 12
step: production Compose now requires immutable client and server digests,
while `deployment_and_rollback` in the launch-readiness validator can still be
approved with a free-text provenance policy and a generic evidence string. It
does not bind the reviewed source commit, the promoted image pair, the previous
rollback pair, and the operator's verification evidence into one release.

Make that binding a fail-closed prerequisite for approving the deployment
category. The operator still chooses the registry, signing/attestation provider,
host, people, and provenance policy. This prompt neither publishes nor verifies
an OCI signature, grants a GitHub deployment permission, promotes an image, or
marks launch approved. It validates the completeness and internal consistency
of the operator's *recorded* evidence; the runbook must state that this is not
cryptographic provenance verification.

## References read for planning

- `AGENTS.md` §§2–7, 8.2, 9–10; `docs/build-plan.md` Phase 12 (§13), sequence
  gates (§14), and Phase 12K verification record (§22).
- `docs/operations.md` launch-readiness decision record, preflight/deploy/
  rollback, and CI state; `docs/launch-checklist.md` category 10 and sign-off;
  `docs/security.md` TM-18 supply-chain boundary.
- `infra/launch/readiness.example.json` deployment section;
  `scripts/ops/check-launch-readiness.js` and `.spec.js` generic approved
  evidence handling and deployment checks; `scripts/ops/check-release-images.js`
  and `.spec.js` pinned-reference grammar; `infra/compose/docker-compose.production.example.yml`
  client/server wiring; `scripts/ops/run-deployment-drill.sh` evidence output;
  root `package.json` scripts.
- `.github/workflows/ci.yml` builds and smoke-tests local API/client images,
  with `push: false`. No CI-produced registry digest, attestation, or protected
  promotion exists; the prompt must not imply otherwise.
- No visual reference applies: this step changes a release decision record,
  validator, tests, and operations docs. It changes no UI route, pixel value,
  breakpoint, or motion behavior.
- Skills loaded for planning: `deployment-pipeline-design` (approval and
  rollback gates), `secrets-management` (evidence and diagnostic redaction),
  and `javascript-testing-patterns` (behavioral negative cases). The existing
  CommonJS validator and Node test runner are repository authority; verify any
  new third-party API before implementation instead of relying on memory.

## Implementation contract

1. Extend only the `deployment_and_rollback` section of
   `infra/launch/readiness.example.json` with a structured `release` object.
   Use unresolved `__REQUIRED_*__` sentinels for a 40-hex reviewed source
   commit, **current** `client_image` and `server_image`, and **previous**
   `client_image` and `server_image`. Each image is a complete
   `registry/path@sha256:<64 lowercase hex>` reference, using the same narrow
   grammar as `check-release-images.js`. Record separate, non-empty evidence
   references for client and server provenance verification and a reference
   for the successful live promotion/rollback drill. Evidence references are
   paths or stable external artifact identifiers; never raw attestation tokens,
   signing keys, credentials, or copied registry auth. Keep the policy and
   named approver fields already present. Document the exact JSON field names
   chosen in `docs/operations.md` so the operator can fill them unambiguously.
2. Export or share the existing `validateImageReference` implementation with
   the launch-readiness validator; do not copy its regex or invent a looser
   second image grammar. Preserve the existing standalone release-image CLI
   behavior and redaction. Validate the source commit as exactly 40 ASCII hex
   characters, with no whitespace or sentinel. Reject an empty/invalid current
   or prior image, a current pair identical to the prior pair, and duplicate
   client/server image references inside a pair. The latter prevents a
   mistaken one-image deployment record, while API and worker still share the
   *server* image as Compose requires. Require the current image registry paths
   to fall under the approved `image_registry_path`; define and test whether
   that field denotes a registry host or repository prefix rather than using
   substring matching. Previous images may live under an older approved
   registry path, but must remain valid immutable references.
3. Verify the evidence **references**, not their truth: each of the three
   release-specific references must be a non-empty, non-placeholder string,
   distinct where it names a different artifact. If a reference is a local
   `.json` path, reuse the existing evidence-file resolution and success check
   and reject a missing/failed JSON artifact. Do not accept a wildcard for
   these release-specific references: it could resolve to an unrelated release.
   If a reference is external, require an explicit stable identifier/URI and
   describe in the runbook what the approver must inspect. A bare free-text
   sentence is not release evidence. Do not turn the validator into a network
   client or execute operator-supplied text.
4. Bind the recorded current pair to `ACRES_CLIENT_IMAGE` and
   `ACRES_SERVER_IMAGE` **when those values are supplied to the operator
   readiness command**. A mismatch must block approval before deployment;
   never print full environment values in an error. Define a strict operator
   mode or explicit argument for this binding so CI's inert example and
   existing unit tests do not unexpectedly require production env variables.
   The operator approval runbook must invoke this bound mode in the same shell
   that later runs `check-release-images.js` and Compose `config --quiet`, so
   all three checks examine the same pair. An approved deployment record
   must not pass its category if the binding mode was requested but either
   env value is absent. Do not make `ops:check` depend on real registry values.
5. Add focused cases to `scripts/ops/check-launch-readiness.spec.js` (and
   `check-release-images.spec.js` only if the shared validator changes). Cover
   a complete synthetic approved record; every missing/placeholder field;
   malformed source SHA and digest; swapped or duplicate current images;
   wrong registry prefix; current/prior pair equality; missing/failed local
   evidence; wildcard and free-text evidence; env absence/mismatch in bound
   mode; and error redaction for an operator-supplied image string. Keep the
   existing 11-category and no-AI tests passing. Test behavior through the
   exported validator/CLI, not a snapshot of the example JSON.
6. Update `docs/operations.md` with the ordered operator sequence: retain the
   reviewed source commit and old pair; publish the new pair externally;
   execute the separately approved provenance verification for each digest;
   store stable evidence references; complete the live drill; fill the record;
   export the exact current pair; run the bound readiness validation,
   release-image preflight, and Compose config validation before migration and
   replacement. Update `docs/launch-checklist.md` category 10 with the exact
   new fields and the approval inspection responsibility. Update `docs/security.md`
   TM-18 to distinguish **record consistency** from still-open cryptographic
   verification, image publication, protected promotion, and live operator
   approval. Do not change the 11 categories or claim Phase 12 is complete.

## Compatibility, failure, and rollback

- Existing `infra/launch/readiness.example.json` must remain intentionally
  unapproved and fail closed. The synthetic fully approved test fixture must
  be updated to satisfy the new contract; old operator records become invalid
  until they include release evidence, which is the intended gate tightening.
- The validation is local and deterministic. It cannot prove an attestation's
  signature, the registry's current contents, the reviewed commit's build
  origin, or whether a drill truly ran. Operators must inspect/verify those
  with their approved provider and record the result. Never label a structural
  check as "provenance verified."
- Preserve the local-development Compose file, production Compose wiring,
  Dockerfiles, CI `push: false`, non-root/private-network/secret boundaries,
  and the no-AI production posture. No database migration, API, client route,
  runtime package, or production deployment is in scope.
- Rollback of this code change is a revert of the validator/template/docs;
  a live application rollback uses the **recorded previous client/server pair**
  under the existing additive-migration rule. Never replace a pinned image
  with a mutable tag or a source build as a fallback.

## Verification, review, and completion

1. On approval, re-read this prompt, `AGENTS.md`, the owning docs and changed
   files, and every named skill before editing. Record `BASE_SHA` and initial
   `git status`; preserve unrelated changes. Verify any new API against local
   packages or official documentation.
2. Run the focused Node tests via `npm run ops:readiness-test` and
   `npm run ops:release-images-test`. Exercise the readiness CLI with a
   synthetic approved record in bound mode, including a mismatch case, without
   logging a production environment. Run `npm run ops:templates` and
   `npm run ops:check` and quote real output and exit codes. The checked-in
   example should still fail `npm run ops:launch-readiness` for its unresolved
   operator fields; quote that expected failure accurately.
3. Run `npm run lint`, `npm run typecheck`, `npm run build`,
   `npm run contracts:check`, and `git diff --check`; inspect the complete
   scoped diff. Broaden tests only for a concrete remaining risk.
4. Dispatch a reviewer subagent under `requesting-code-review` with this
   prompt, changed paths, `BASE_SHA`/`HEAD_SHA`, checks, and the unverified
   external-provenance limit. Evaluate its findings with
   `receiving-code-review`; fix confirmed defects, recheck, and request
   follow-up review if the release contract changes materially. Record the
   observed implementation and checks in `docs/operations.md`, stage only
   scoped files, inspect the staged diff, then commit locally to `main` using
   `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design` — keep approval, promotion, rollback, and
  source/digest evidence tied to one release.
- `secrets-management` — avoid credentials and sensitive environment output in
  release records and diagnostics.
- `javascript-testing-patterns` — cover fail-closed validator behavior and
  redaction with meaningful negative tests.
- `requesting-code-review` — Stage 1 reviewer subagent after self-verification.
- `receiving-code-review` — verify and address reviewer findings.
- `caveman-commit` — required local commit message at execution time.
