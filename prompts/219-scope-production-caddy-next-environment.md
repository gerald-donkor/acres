# 219 — scope production Caddy and Next environment

## Scope and why this is next

Phase 12K is the earliest unfinished build unit (`docs/build-plan.md` §§13–14,
22). Prompt 217's operator evidence intake cannot advance until a production
handoff and approved read-only source access exist; prompt 201 still owns launch
sign-off. The committed prompt 218 fixed a repository SMTP key mismatch, but
`docs/launch-checklist.md` §3.4 identifies another independent repository
defect: production Compose loads the shared `production.env.example` into
`caddy` and `next`, exposing PostgreSQL, session, storage, mail and Grafana
credentials to both containers. Remove that unnecessary container environment
exposure as a narrow Phase 12K reference-template remediation. This prompt
does not claim any production deployment is fixed or approved.

## Verified references and measurable contract

- Re-read `AGENTS.md` §§2–7 and 10, `docs/build-plan.md` §§13–14 and 22,
  `docs/operations.md` Phase 12K, `docs/launch-checklist.md` §§3.4 and 6A,
  `docs/security.md` TM-15 and production-boundary sections, and
  `docs/system-architecture.md` §11.1. Check current files and git history
  before editing; a prompt proves planning, not implementation.
- Re-open `infra/compose/docker-compose.production.example.yml`,
  `infra/env/production.env.example`, `infra/caddy/Caddyfile.example`,
  `scripts/ops/check-production-templates.sh`, its focused specs, relevant
  deployment-drill checks, and root `package.json`. Verify the installed
  Compose command/behavior if available before relying on rendered config.
- The Caddyfile currently references exactly these twelve `{$...}` names:
  `ACRES_TLS_CONTACT_EMAIL`, `ACRES_PRODUCTION_DOMAIN`,
  `ACRES_HSTS_MAX_AGE`, `ACRES_MAX_REQUEST_BODY`, and the API, Next and object
  `READ_TIMEOUT`, `WRITE_TIMEOUT`, `DIAL_TIMEOUT` triples. The HSTS directive
  is currently commented; keep the variable available for a separately
  approved HSTS change. The Next server reads `ACRES_API_ORIGIN` for its
  same-origin API bridge and already receives it in Compose, with `NODE_ENV`.
  Reconcile this inventory with the current code at execution time.
- There is no visual reference, crop, pixel measurement, breakpoint, client
  route, REST/GraphQL contract or database migration in this scope. The
  measurable result is that parsed Compose config gives `caddy` only its
  required Caddy variables and gives `next` only `NODE_ENV` and
  `ACRES_API_ORIGIN`; neither service has `env_file` or receives any of
  `POSTGRES_SUPERUSER_PASSWORD`, `ACRES_MIGRATOR_PASSWORD`,
  `ACRES_APP_PASSWORD`, `DATABASE_URL`, `DATABASE_MIGRATION_URL`,
  `SESSION_SECRET`, `VALKEY_PASSWORD`, `VALKEY_URL`,
  `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `SMTP_USER`,
  `SMTP_PASS`, or `GRAFANA_ADMIN_PASSWORD`. Do not assert that these are the
  complete secret inventory without rechecking the template.

## Implementation sequence

1. Record branch, `HEAD`, worktree state and baseline diff. Preserve unrelated
   changes. Load every skill below and recheck the actual Caddyfile environment
   placeholders, Next environment reads, Compose sections and operations
   preflight assumptions. Treat the `--env-file` passed to Compose for
   interpolation separately from a service's `env_file` container injection;
   confirm that distinction with installed Compose behavior or verified docs.
2. In the production Compose reference, remove the shared `env_file` from
   `caddy` and `next`. Add an explicit `caddy.environment` map containing
   exactly the Caddyfile's required variables, each interpolated from the
   operator-provided production env with a required-value form that fails
   clearly when absent. Keep `next.environment` to its consumed `NODE_ENV`
   and `ACRES_API_ORIGIN`; verify whether the existing `NODE_ENV` literal is
   sufficient. Do not inject shared secrets through an anchor, `extends`,
   implicit env inheritance, or a new catch-all file. Preserve public/private
   networks, volumes, ports, image pinning, proxy routes and drain settings.
3. Leave `api` and `worker` on the current shared `env_file` in this prompt.
   They need a separately audited service-variable inventory before those
   scopes can be narrowed safely. Leave Postgres, Valkey, Garage, Prometheus,
   Grafana, and exporter injection unchanged. Do not change secret values,
   source references, or the unresolved readiness example.
4. Extend `scripts/ops/check-production-templates.sh` with a semantic parsed
   Compose invariant: `caddy` and `next` must have no service `env_file`,
   forbidden secret keys, or unexpected environment entries; Caddy's declared
   keys must match the current Caddyfile placeholders (accounting for the
   deliberately retained HSTS setting), and their values must interpolate
   from the corresponding production env keys. Next must keep its private API
   origin and production mode. Check actual parsed assignments and mapping,
   not comments or arbitrary substring matches. Error messages name keys or
   services only, never resolved values. Keep existing template checks intact.
5. Add focused offline regression cases that exercise the check against a
   changed Compose document: the reference passes; restoring `env_file` on
   either service fails; adding a secret to either environment fails; dropping
   or miswiring a required Caddy variable fails; comments mentioning old
   settings do not fail. Use the existing Node test style and a small testable
   helper if needed; avoid modifying the tracked example during tests. Wire
   the focused test into the existing `ops:templates-test`/`ops:check` path
   without introducing an unverified script name.
6. Update `docs/launch-checklist.md` §3.4 and `docs/operations.md` Phase 12K
   with the actual repository fix, exact verification result, and migration
   note: operators must materialize and inspect the revised Compose config,
   then verify effective per-container key names through a redacted inventory
   before Category 4 approval. Correct `docs/security.md` if its implemented
   production-boundary statement changes. Keep the CSRF-source and
   Garage-metrics findings explicit and unresolved. Update `docs/build-plan.md`
   only if a verified phase-state fact changes; Phase 12 remains open.

## Boundaries, compatibility and rollback

- No live container, secret store, host, SMTP provider, DNS, HSTS policy,
  deployment, launch record, or readiness status changes here. Do not perform
  a live action or print a resolved production environment.
- Caddy must still receive all values its Caddyfile needs. An operator
  materializing an older Compose file must adopt the explicit map before
  deploying this revision; a config interpolation pass and a redacted
  container-key inspection are required. A missing required variable must
  fail the template/config check rather than silently use an unsafe default.
- Keep raw secret values and private host inventory out of code, tests, docs,
  command output and review context. No `NEXT_PUBLIC_*` secret is introduced.
  A rollback is a scoped revert of the Compose/preflight change, but it would
  restore the unnecessary Caddy/Next secret exposure; document that limitation.

## Verification, review and completion

1. Run the focused regression suite, `npm run ops:templates`,
   `npm run ops:templates-test`, `npm run ops:check`, `npm run lint`,
   `npm run typecheck`, `npm run build`, and `git diff --check`; quote their
   actual output. If installed Compose is usable without a real secret store,
   render only a fully synthetic placeholder-based config and inspect
   **variable names only**, never resolved values. Do not report a Compose
   render pass if it could not run. The checked-in readiness example must
   remain unresolved and fail closed.
2. Inspect the full diff for extra environment exposure, inaccurate docs,
   misplaced production claims, and secret disclosure. Dispatch independent
   review using `requesting-code-review` with requirements, BASE_SHA/HEAD_SHA,
   changed paths and exact checks. Evaluate feedback with
   `receiving-code-review`, fix verified issues, rerun affected checks and
   re-review material changes.
3. Stage only scoped files, inspect the staged diff, and commit locally to
   `main` using `caveman-commit`. Do not push. Report the exact inspection
   steps, the repository-only outcome and remaining operator/Phase 12 gates.

## SKILLS USED

- `deployment-pipeline-design` — keep Compose hardening inside the existing
  release and rollback gates.
- `secrets-management` — enforce least-privilege runtime secret exposure and
  safe evidence handling.
- `security-threat-model` — verify the changed Caddy/Next secret-exposure
  boundary against the repository threat model.
- `security-best-practices` — review secure-by-default JavaScript preflight
  behavior and production configuration implications.
- `javascript-testing-patterns` — exercise negative Compose-policy cases
  offline with meaningful tests.
- `requesting-code-review` — dispatch the required independent diff review.
- `receiving-code-review` — verify and resolve reviewer findings.
- `caveman-commit` — write the required local commit message after execution.
