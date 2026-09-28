# 224 — scope production Garage environment and eliminate residual env_file

## Scope and why this is next

Phase 12K remains the earliest unfinished phase. At `c3fe3cfd0a8a1889ea0b85411c1eaf215c4c8d7b` on `main`, prompt 223 narrowed the worker process environment, following prompts 219 and 220 which removed the shared `env_file` from Caddy, Next, API and worker. However, `garage` remains the single service in `infra/compose/docker-compose.production.example.yml` that still specifies `env_file: - ../env/garage.production.env.example`.

Simultaneously, `garage` explicitly maps its three required environment variables:
`GARAGE_RPC_SECRET: ${GARAGE_RPC_SECRET:?inject Garage RPC secret}`,
`GARAGE_ADMIN_TOKEN: ${GARAGE_ADMIN_TOKEN:?inject Garage admin token}`, and
`GARAGE_METRICS_TOKEN_FILE: /run/secrets/garage_metrics_token`.
The `env_file` inclusion is redundant, injects unresolved sentinel placeholders (`__REQUIRED_SECRET_*__`) into the container namespace if not completely shadowed, and contradicts the strict container isolation standard established across the rest of the production Compose manifest.

Remove `env_file` from the `garage` service in `infra/compose/docker-compose.production.example.yml`. Enforce via `scripts/ops/check-garage-metrics.js` and `scripts/ops/check-production-templates.sh` that `garage` (and every other service in the production manifest) must not declare `env_file`. Add focused negative tests in `scripts/ops/check-garage-metrics.spec.js`. Reconcile `docs/launch-checklist.md`, `docs/operations.md`, and `docs/security.md`.

## Sources and authority to re-read before implementation

- `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §§13–14 and 22; `docs/operations.md` Phase 12K; `docs/launch-checklist.md` §6A Category 4; `docs/security.md` production topology and secret boundary; `docs/skills.md`.
- `infra/compose/docker-compose.production.example.yml`, `infra/env/garage.production.env.example`, `infra/env/production.env.example`, `scripts/ops/check-garage-metrics.js`, `scripts/ops/check-garage-metrics.spec.js`, `scripts/ops/check-production-templates.sh`, `scripts/ops/check-proxy-environment.js`, and `scripts/ops/check-application-environment.js`.
- This work has no visual surface. Static comps, crops, pixel measurements, and breakpoint behavior do not apply. The measured contract is container environment isolation, zero `env_file` declarations in production Compose, and strict variable interpolation.

## Consumer audit and decisions before editing

1. In `infra/compose/docker-compose.production.example.yml`, `services.garage` declares:
   - `image: dxflrs/garage:v2.1.0`
   - `restart: unless-stopped`
   - `env_file: - ../env/garage.production.env.example` (TO BE REMOVED)
   - `environment:`
     - `GARAGE_RPC_SECRET: ${GARAGE_RPC_SECRET:?inject Garage RPC secret}`
     - `GARAGE_ADMIN_TOKEN: ${GARAGE_ADMIN_TOKEN:?inject Garage admin token}`
     - `GARAGE_METRICS_TOKEN_FILE: /run/secrets/garage_metrics_token`
   Removing `env_file` leaves `environment` as the sole source of environment variables for `garage`.
2. `infra/env/garage.production.env.example` remains as the operator inventory file defining `GARAGE_RPC_SECRET` and `GARAGE_ADMIN_TOKEN` placeholders for host interpolation, matching `scripts/ops/check-production-templates.sh`'s `envExample` reading and documentation.
3. In `scripts/ops/check-garage-metrics.js`:
   - Assert `if (Object.hasOwn(garage, 'env_file')) errors.push('garage must not declare env_file');`.
4. In `scripts/ops/check-garage-metrics.spec.js`:
   - Add negative mutation regression ensuring any `garage.env_file` declaration is rejected with the exact error message `'garage must not declare env_file'`.
5. In `scripts/ops/check-production-templates.sh`:
   - Update lines 255-261: clarify the error message from "production Garage must override ${key}" to "production Garage must explicitly define ${key}".
   - Add a global check verifying that no service in `services` declares `env_file`.
6. Update documentation:
   - `docs/launch-checklist.md` §3.4 and Category 4: record that all production Compose services, including Garage, now use explicit environment maps without `env_file`.
   - `docs/operations.md`: document Prompt 224 under Phase 12K.
   - `docs/security.md`: reflect that `docker-compose.production.example.yml` enforces zero `env_file` usage across all services.

## Implementation contract

1. Edit `infra/compose/docker-compose.production.example.yml` to remove `env_file` from `garage`.
2. Edit `scripts/ops/check-garage-metrics.js` to reject `env_file` on `garage`.
3. Edit `scripts/ops/check-garage-metrics.spec.js` to add a mutation test for `garage` declaring `env_file`.
4. Edit `scripts/ops/check-production-templates.sh` to require explicit `GARAGE_RPC_SECRET` and `GARAGE_ADMIN_TOKEN` definitions without referring to "override", and enforce that zero services in `services` declare `env_file`.
5. Update `docs/launch-checklist.md`, `docs/operations.md`, and `docs/security.md`.

## Expected impact, non-goals and rollback

- No database schema, API route, client UI, or background worker behavior is changed.
- Reference template configuration changes: `garage` no longer mounts or reads an `env_file`. All 11 production services now use explicit environment maps or command-line parameters.
- Rollback: Revert the commit to restore `env_file` on `garage` and the previous checker logic.

## Verification, review and commit on approval

1. Run verification checks:
   - `npm run ops:templates-test`
   - `npm run ops:templates`
   - `npm run ops:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
   - `git diff --check`
2. Independent code review:
   - Dispatch review via `invoke_subagent` using the `requesting-code-review` pattern.
   - Evaluate findings using `receiving-code-review`.
3. Commit locally to `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design` — enforce strict service isolation and template hygiene across the production deployment reference.
- `secrets-management` — ensure least-privilege, explicit secret passing without ambient env file leakage.
- `security-best-practices` — eliminate unused and redundant secret injection mechanisms.
- `security-threat-model` — align container environment boundaries with the repository threat model.
- `javascript-testing-patterns` — author negative regression mutations for template validation.
- `requesting-code-review` — formulate review requests with explicit git bounds and verification evidence.
- `receiving-code-review` — systematically analyze review feedback against repository requirements.
- `caveman-commit` — construct ultra-compressed, conventional commit messages.
