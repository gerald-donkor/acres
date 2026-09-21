# 152 — export canonical GraphQL and regional tuples, and add isolated unit tests across cursor codec, pagination, loaders, error filter, and resolver

## Scope, and why it is next

The committed repository is on `main` at `1bb44cd`
(`refactor(repos): export tuples and add tests`, the prompt 151 implementation).
The worktree is clean (verified via `git status`, clean working tree).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by external I/O adapter hardening, canonical
tuple exports, and isolated unit testing across scanner, queue, storage, mail, AI,
parser, upload, organization/audit, accounts/auth, security, tenancy guard, common
request/response, prisma/transactions, config, health, forms, job runs, all REST
controllers, data-access repositories, regions public service, and metrics middleware (prompts 136–151).

With the REST controller tier, repository tier, and HTTP middleware completely covered
by isolated unit tests, the remaining presentation-tier query/read surface without
isolated unit test coverage is the GraphQL subsystem (`server/src/graphql/`), alongside
residual canonical tuple predicate exports:

1. **`packages/shared/src/regions.ts`**:
   - Codify canonical predicate: `isInsightReportStatus` over `INSIGHT_REPORT_STATUSES`.
2. **`server/src/graphql/cursor-codec.ts`**:
   - Codify canonical const tuple and predicate: `CURSOR_KINDS`, `CursorKind`, and `isCursorKind`.
3. **`server/src/graphql/cursor-codec.spec.ts`** (NEW):
   - Isolated unit tests for `CursorCodec`:
     - `encode()`: builds HMAC using `sessionSecret` and salt `acres.cursor.v1`, outputs `base64url` encoded `body.mac`.
     - `decode()`: verifies HMAC with `timingSafeEqual`, decodes payload, validates version `v === 1`, verifies kind match, verifies organization match, verifies 2-element sort tuple.
     - Error handling: handles missing cursor (returns null), missing dot delimiter (throws `ApiException.cursorInvalid()`), invalid HMAC (throws `ApiException.cursorInvalid()`), invalid JSON / malformed base64url (throws `ApiException.cursorInvalid()`), mismatched kind (throws `ApiException.cursorInvalid()`), mismatched organizationId (throws `ApiException.cursorInvalid()`), wrong sort array shape (throws `ApiException.cursorInvalid()`).
     - `isCursorKind`: validates valid kinds and rejects invalid inputs.
4. **`server/src/graphql/pagination.spec.ts`** (NEW):
   - Isolated unit tests for pagination helpers:
     - `connectionWindow()`: returns default `first` (min(20, maxFirst)) when omitted, validates `first >= 1`, validates `first <= maxFirst`, rejects non-integers with `ApiException.queryLimitExceeded()`, decodes cursor with kind and organizationId, returns `take = first + 1` and `afterId`.
     - `connectionFromWindow()`: maps rows to edges using `codec.encode()`, calculates `hasNextPage` (rows.length > first), returns `endCursor` from last edge (or null if empty), tests sort value fallback (`createdAt` -> `name` -> `""`), slices rows to `first`.
5. **`server/src/graphql/graphql-error.filter.spec.ts`** (NEW):
   - Isolated unit tests for `GraphqlErrorFilter`:
     - Catches `ApiException`: unwraps code and message into `GraphQLError` extensions, passes `requestId` from context if present.
     - Catches `HttpException` with custom error payload (`{ code, message }`): unwraps into `GraphQLError` extensions.
     - Catches unhandled generic error / unknown exception: masks internal error with generic message "Something went wrong.", code "INTERNAL_ERROR", logs error via logger, attaches `requestId`.
6. **`server/src/graphql/graphql.loaders.spec.ts`** (NEW):
   - Isolated unit tests for `createGraphqlLoaders`:
     - Batches region lookups using `RegionsService.findBySlugs()` with statement timeout.
     - Resolves found regions and returns `ApiException.notFound()` for missing slugs.
     - Preserves requested slug ordering in output.
7. **`server/src/graphql/acres.resolver.spec.ts`** (NEW):
   - Isolated unit tests for `AcresResolver`:
     - `viewer`: returns authenticated account and membership; throws unauthenticated if session missing; throws notFound if organization missing.
     - `organization`: loads organization via `OrganizationsService.get()` with timeout.
     - `organizationMembers`: checks `members.read` permission (throws forbidden if denied); calculates window; calls `organizations.membersPage()`; returns connection.
     - `organizationInvitations`: checks `invitations.read` permission; calculates window; calls `organizations.invitationsPage()`; returns connection.
     - `organizationAuditEvents`: checks `audit.read` permission; calculates window; calls `organizations.auditEventsPage()`; returns connection.
     - `regions`: calculates window with `kind: 'regions'` and `organizationId: null`; calls `regionsService.listPage()`; returns connection.
     - `region(slug)`: loads slug from `context.loaders.regionBySlug` with timeout.
     - `dashboardSummary`: checks `analytics.read` permission; forwards filter arguments to `dashboards.summary()`; returns summary.
     - `withTimeout`: throws `ApiException.queryLimitExceeded("GraphQL execution timed out.")` when operation exceeds configured timeout.

## Subsystems and changes

1. `packages/shared/src/regions.ts`:
   - Export `isInsightReportStatus` predicate.
2. `server/src/graphql/cursor-codec.ts`:
   - Export canonical const tuple `CURSOR_KINDS`, type `CursorKind`, and predicate `isCursorKind`.
3. `server/src/graphql/cursor-codec.spec.ts` (NEW):
   - 10+ unit tests covering all encode/decode paths, HMAC verification, shape validation, and predicate checks.
4. `server/src/graphql/pagination.spec.ts` (NEW):
   - 10+ unit tests covering window sizing, validation limits, cursor decoding, edge building, hasNextPage, and sort fallbacks.
5. `server/src/graphql/graphql-error.filter.spec.ts` (NEW):
   - 8+ unit tests covering `ApiException`, `HttpException`, unhandled errors, logging, and requestId propagation.
6. `server/src/graphql/graphql.loaders.spec.ts` (NEW):
   - 6+ unit tests covering batch loading, missing slug mapping, and order preservation.
7. `server/src/graphql/acres.resolver.spec.ts` (NEW):
   - 18+ unit tests covering all resolver queries, permissions, timeouts, and edge cases.
8. `docs/backend.md`:
   - Record the new canonical tuples, predicate, and isolated unit test suites under the build record.

## Non-goals

- No Prisma schema alterations, migrations, or database DDL changes.
- No modifications to GraphQL schema SDL or frontend query components.
- No changes to REST controllers.

## Security, tenancy, and failure cases

- HMAC integrity: Cursors are signed with `sessionSecret` and SHA-256 HMAC, verified with constant-time comparison `timingSafeEqual` to prevent timing attacks.
- Tamper rejection: Any modification to cursor payload or signature triggers `ApiException.cursorInvalid()`.
- Tenancy isolation: Cursors bind `organizationId`; decoding with a mismatched organization ID fails immediately.
- Query limits: Pagination `first` parameter is strictly bounded between 1 and `graphqlMaxFirst` to prevent denial-of-service node requests.
- Error masking: GraphQL error filter intercepts unexpected exceptions and sanitizes them into generic `INTERNAL_ERROR` responses to prevent internal stack trace leaks.
- Request tracing: Errors and cursors carry request IDs and tenant context for auditable logging without sensitive data leakage.

## Testing and verification plan

1. Run isolated unit test suites for the 5 targeted GraphQL components:
   ```bash
   npm run test --workspace=@acres/server -- src/graphql/cursor-codec.spec.ts
   npm run test --workspace=@acres/server -- src/graphql/pagination.spec.ts
   npm run test --workspace=@acres/server -- src/graphql/graphql-error.filter.spec.ts
   npm run test --workspace=@acres/server -- src/graphql/graphql.loaders.spec.ts
   npm run test --workspace=@acres/server -- src/graphql/acres.resolver.spec.ts
   ```
2. Run full repository verification:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
   - `npm run test:server`
   - `npm run contracts:check`
3. Execute code review loop (`requesting-code-review`, `receiving-code-review`) with subagents.
4. Document changes in `docs/backend.md`.
5. Stage and inspect diff.
6. Commit using `caveman-commit`.

## Required skill manifest

- `requesting-code-review` (.agents/skills/requesting-code-review/SKILL.md)
- `receiving-code-review` (.agents/skills/receiving-code-review/SKILL.md)
- `caveman-commit` (.agents/skills/caveman-commit/SKILL.md)
- `nestjs-best-practices` (.agents/skills/nestjs-best-practices/SKILL.md)
- `javascript-testing-patterns` (.agents/skills/javascript-testing-patterns/SKILL.md)
- `api-design-principles` (.agents/skills/api-design-principles/SKILL.md)
