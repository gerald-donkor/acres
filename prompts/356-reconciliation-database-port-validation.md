# Phase 12K — Reconciliation database port validation

## Scope and why next

Continue Phase 12K recovery hardening after committed Prompt 355 (`75994dd`).
The owned PostgreSQL client uses parseInt(env.PGPORT || '5432', 10), so malformed
port values silently select another target. A local installed-driver probe
confirmed `5432suffix` and `5432.5` become 5432, and `0x1538` becomes 5432 via
pg's falsy-zero fallback. Reject invalid configuration before acquiring a client.
This is a dependency-safe recovery correctness fix; live Category 6 evidence
and the Phase 12 exit remain blocked on operator work, governed by Prompt 201.

The user explicitly requested implementation after planning. Re-read this prompt
and its skills before implementation; no further approval question is needed.

## References and verified APIs

Read AGENTS.md; docs/build-plan.md Phase 12 and latest records;
docs/operations.md Prompt 355; docs/launch-checklist.md governance and Category 6;
docs/security.md recovery records; docs/system-architecture.md operations;
docs/backend.md introduction; docs/product.md product job; docs/skills.md.
Inspect scripts/ops/reconcile-storage-objects.js main and existing setup fixtures
in its .spec.js. Installed node_modules/pg/lib/connection-parameters.js confirms
pg parses ports and falls back on falsy configuration. Reuse local node:test,
assert, mock.method, temporary-filesystem and pg Client fixtures. No Next/React,
Tailwind, UI, schema or SQL API changes; no visual references or measurements
apply. The accepted range below is an explicit connection policy, not a comp
measurement or proof of a reachable endpoint.

## Implementation contract

Allowed files: this prompt, scripts/ops/reconcile-storage-objects.js and .spec.js,
docs/operations.md, docs/build-plan.md, docs/security.md, docs/launch-checklist.md.
No dependencies, package scripts, migrations or product routes.

1. Add tests prefixed `main database port validation:` before the source fix.
   Mock pg.Client with the existing descriptor-restoration approach and record
   constructor configuration/connect/query/end. Use empty acquired DB rows and
   injected empty storage inventory; never connect to live services. Invalid
   ports must return 1, emit exactly `Error: PostgreSQL connection failed`,
   perform no construction/connect/query/end, and create no receipt.
2. Validate only when the runner needs to construct its own PostgreSQL client,
   after the existing password-required check and before requiring pg.Client.
   Omitted/undefined PGPORT and the empty string retain default 5432. All other
   supplied values must be strings consisting entirely of ASCII decimal digits
   and convert to an integer between 1 and 65535 inclusive. Leading zeroes are
   valid if the resulting port is valid. Do not trim, accept signs, fractions,
   exponents, hexadecimal, suffixes or coercible non-string values.
3. Replace parseInt with the validated number, preserving the existing private
   connection failure catch. Do not expose the operand, password or driver error.
   Do not change other env variables or pg driver behavior globally.
4. Cover suffix, decimal, exponent, hex, whitespace, newline, signs, zero,
   overflow, unsafe/huge decimal text and non-string falsy/truthy operands.
   Preserve frozen env/options/argv descriptors. Verify omitted/undefined/empty,
   1, 5432, 65535 and zero-padded valid strings reach the exact expected numeric
   constructor port and produce a clean simulation receipt with one end call.
5. Verify injected pgClient and dbObjects bypass malformed PGPORT, --help bypasses
   all dependencies, and missing password keeps its original diagnostic and
   precedence. Hostile accessors/proxies, socket policy, timeout policy, client
   lifecycle refactoring, live recovery, environment isolation of pg internals
   and broader configuration validation are non-goals.

## Verification and review

Save actual outputs in /tmp/acres-356-*.log. Run focused red then green using
node --test --test-isolation=none --test-name-pattern='main database port validation:'
scripts/ops/reconcile-storage-objects.spec.js. Run full npm run ops:reconcile-test,
source/spec node -c, CLI --help, installed Prettier on the new test block only,
root npm run lint, npm run build then npm run typecheck sequentially, and git
diff --check. Use supported sandbox escalation if needed, recording real results.
Run read-only example launch readiness; expect fail-closed, never approval.
No unrelated ops:check, live operations or online audit claim.

After self-verification dispatch one read-only reviewer via
requesting-code-review, base/head 75994dd and working diff, with prompt, decisions,
files and check logs. No edits or subdelegation. Evaluate feedback using
receiving-code-review; fix verified defects and recheck/re-review significant
changes. Record evidence and limitations in operations and concise build-plan,
security and Category 6 notes. Stage only allowed files, inspect staged diff,
and commit locally to main using caveman-commit. Do not push.

## Impact, rollback and inspection

Malformed PGPORT can no longer silently select another database port for owned
clients. Ordinary decimal configuration, defaults and injection stay compatible.
No UI/API/SQL/credential/live-service changes. Validation proves neither target
identity, evidence authenticity/completeness, bytes nor atomic/live recovery.
Prompt 201 and Phase 12 sign-off remain open. Ordinary commit revert restores
old parsing without database/storage mutation.

```bash
node --test --test-isolation=none --test-name-pattern='main database port validation:' scripts/ops/reconcile-storage-objects.spec.js
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## SKILLS USED

- `deployment-pipeline-design`: preserve recovery and operator exit gates.
- `postgres-best-practices`: inspect PostgreSQL connection configuration.
- `error-handling-patterns`: reject invalid targets through private diagnostics.
- `javascript-testing-patterns`: offline behavioral regression coverage.
- `requesting-code-review`: independent review after verification.
- `receiving-code-review`: verify feedback against local code and contracts.
- `caveman-commit`: required local Conventional Commit.

No skill specifically owns Node CLI port parsing; installed code and existing
fixtures verify its APIs. No CI, telemetry, secrets-management, UI or architecture
implementation surface changes.
