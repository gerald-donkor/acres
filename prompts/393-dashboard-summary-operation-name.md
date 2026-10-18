# 393 — Name the dashboard-summary GraphQL operation

Sub-prompt of Prompt 370 (Vercel managed migration); inherits its approval
limits: preview only, free tiers only, no production promotion, no secret
printed, no project env write by the agent.

## Scope and why it is next

`docs/vercel-deployment.md` "Resume here" lists, after Prompt 392, "the `/app`
`dashboardSummary` SSR failure" as the next item (Prompt 391 finding 2). It
blocks the most basic hosted journey: an organization member opening `/app`
sees `AppError` ("Request Failed — The GraphQL request could not be
completed") instead of the dashboard workspace.

## Diagnosis (done while preparing this prompt, 2026-10-18)

Evidence, in order:

1. **Hosted reproduction on `dpl_7JR8wLUt14fPRdD7SHPmy6gM4QTC`** (Prompt 392's
   preview, source `feb6d9e`) through `vercel curl --deployment` with a cookie
   jar: register 201, organization create 201, `GET /app` 200 rendering
   `AppError`, request ID `94d1255c-ce74-4184-9af7-d0673401d9cd`. Custody:
   `~/.config/acres/vercel-preview/prompt393-diag-20261018T151547Z/` (jar,
   identity, bodies; 0700). Runtime logs for the deployment (MCP
   `get_runtime_logs`, grouped by path) contain no `/graphql` record: the
   failure logs nothing on the API side. A `vercel curl --trace` session
   trace of `/app` (`cwjhm-1792336601338-91f7fabcfae1`) shows no subrequest
   spans.
2. **Local, development mode** (`NODE_ENV=development`, built API on :3101,
   `next dev` on :3100): the same register → organization → `/app` sequence
   renders the workspace; a direct CSRF → `POST /graphql` of the client's
   `DASHBOARD_SUMMARY_QUERY` returns `data.dashboardSummary`.
3. **Local, `NODE_ENV=test`** (same API, same query, same CSRF sequence):
   HTTP 200 with
   `{"errors":[{"message":"GraphQL operationName is required.","extensions":{"code":"QUERY_LIMIT_EXCEEDED","requestId":"…"}}]}`.
   Adding `operationName: "DashboardSummary"` to the same request returns
   `{"data":{"dashboardSummary":{"metrics":[],"aggregates":[],"savedViews":[]}}}`.

**Cause.** `server/src/graphql/graphql-limits.ts` `didResolveOperation`
rejects any operation without `operationName` when
`config.nodeEnv !== 'development'` (preview runs `NODE_ENV=production`).
`client/lib/api/server.ts` `getDashboardSummary` calls
`graphqlPost(DASHBOARD_SUMMARY_QUERY, filters, organizationId)` without the
fourth `operationName` argument; `listOrganizationAuditEvents` passes
`"OrganizationAuditHistory"` and is unaffected. Every symptom matches:
HTTP 200, a `requestId` extension (the UUID shown), a code
(`QUERY_LIMIT_EXCEEDED`) with no specific copy case so the default
"Request Failed" title renders, and nothing logged (an expected
`ApiException`-style rejection, not an unhandled error).

**Why tests missed it.** `client/playwright.config.ts` starts the API with
`npm run start:server` and no `NODE_ENV`, i.e. development, where the gate
is off; the server e2e suite sends `operationName` itself.

## Reference material read

- `docs/vercel-deployment.md` (Resume here; Prompt 391 findings; Prompt 392)
- `docs/dashboards.md` "GraphQL read model" (server helper posts through
  `/graphql` with the CSRF pair)
- `docs/authenticated-app.md` (server/browser API clients) — re-read at
  execution
- `client/lib/api/server.ts`, `client/lib/api/graphql-response.ts`,
  `client/lib/api/audit-history.ts`, `client/app/app/page.tsx`,
  `client/app/app/dashboards/[viewId]/page.tsx`,
  `client/tests/audit-history.spec.ts`, `client/playwright.config.ts`
- `server/src/graphql/graphql-limits.ts`, `server/src/graphql/graphql.module.ts`

No visual reference applies: no markup, token or layout changes.

## Implementation

### 1. Move the dashboard query beside the audit query

Create `client/lib/api/dashboard-summary.ts`, following the shape of
`client/lib/api/audit-history.ts` (a plain module, no `"use client"`, so
exporting constants is allowed under §9.2):

```ts
export const DASHBOARD_SUMMARY_OPERATION = "DashboardSummary";
export const DASHBOARD_SUMMARY_QUERY = /* GraphQL */ `
  query DashboardSummary( … ) { … }   // moved verbatim from server.ts
`;
```

Move the document text **byte-for-byte** from `client/lib/api/server.ts`
(currently the `const DASHBOARD_SUMMARY_QUERY` block); delete it there and
import both names.

Add `AUDIT_HISTORY_OPERATION = "OrganizationAuditHistory"` to
`client/lib/api/audit-history.ts` and use it at the existing call site in
`listOrganizationAuditEvents` in place of the string literal.

### 2. Make the operation name mandatory

In `client/lib/api/server.ts`, change `graphqlPost`'s signature so
`operationName: string` is **required** (no `?`). Every caller must then name
its operation; TypeScript is the guard against a recurrence. Update
`getDashboardSummary` to pass `DASHBOARD_SUMMARY_OPERATION`. Grep the client
(`grep -rn "graphqlPost(" client --exclude-dir=node_modules`) and update any
other caller found; the preparation grep found exactly two.

Do not change the order of `graphqlPost`'s parameters (avoids touching
callers beyond the name).

### 3. Regression test

In `client/tests/` add `graphql-operations.spec.ts` (Playwright test runner,
same style as `audit-history.spec.ts`, no browser):

- for each `[query, operation]` pair — dashboard and audit — assert the
  document contains exactly one operation definition and that its name equals
  the exported constant. Parse with `graphql`'s `parse` if `graphql` resolves
  from the client workspace (check `node -p "require.resolve('graphql',
  {paths:['client']})"`); otherwise use the regex
  `/^\s*(query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/m` and assert a single
  match. Do **not** add a dependency for this.
- name the test so its intent is obvious: the server rejects unnamed
  operations outside development.

### 4. Not changed (non-goals)

- **No server change.** The `operationName` gate is deliberate operation
  hygiene (Prompt 30/limits); weakening it would be the wrong fix.
- **No copy change** for `QUERY_LIMIT_EXCEEDED` in `getApiErrorCopy`.
  Recorded as a residual: the default copy hid the cause.
- **No Playwright `NODE_ENV` change.** Running the e2e API in `test` or
  `production` mode alters mail, rate limits and config validation; record it
  as a residual gap instead.
- No GraphQL-failure logging on API or Next side (residual: an expected
  rejection leaves no runtime-log trace, which made Prompt 391's diagnosis
  impossible from logs).
- No preview cleanup of synthetic accounts, no snapshot work, no env writes.

## Verification

### Local (Node 24.21.0 launcher; see the "Resume here" Node note)

1. `npm run lint`, `npm run typecheck`, `npm run build` — quote output.
2. `cd client && npx playwright test tests/graphql-operations.spec.ts
   tests/audit-history.spec.ts tests/api-helpers.spec.ts` — quote the
   summary.
3. Behavioural repro of the fixed path in a non-development API: build, start
   `server/dist/main.js` with `server/.env`, `NODE_ENV=test PORT=3101
   SCHEDULER_ENABLED=false TENANCY_ENABLED=true
   CLIENT_ORIGIN=http://localhost:3100`; start the client with
   `ACRES_API_ORIGIN=http://localhost:3101` (`next dev -p 3100` from the root
   `node_modules/next`); run the register → CSRF → organization (with
   `idempotency-key`) → `GET /app` sequence with curl and a cookie jar.
   Expect: no "Request Failed" alert, and `id="dashboard-title"` present.
   Run it **before** the fix too (expected to fail) so the test is shown to
   discriminate. Stop both processes afterwards.

### Hosted (preview only)

After the commit, with a clean `main`:

1. `vercel deploy --dry --target=preview < /dev/null > <tmp>/dry.json`, then
   `npm run vercel:deploy-manifest -- --manifest <tmp>/dry.json`; deploy only
   on `deploy manifest ok`. Use the cached CLI
   `~/.npm/_npx/67eb4586ca667318/node_modules/vercel/dist/vc.js` (64.5.0).
2. `vercel deploy --target=preview`; record deployment ID, URL, Ready time,
   `target: null`, no aliases.
3. Run the hosted sequence (register → organization → `GET /app`) through
   `vercel curl --deployment <id>` with a fresh jar in a new custody
   directory `~/.config/acres/vercel-preview/prompt393-<UTC>/` (0700).
   Pass: `GET /app` 200, `id="dashboard-title"` present, no `AppError`
   alert. Also fetch `/app/audit` (the other `graphqlPost` caller) and
   confirm it renders without `AppError`.
4. Pull `get_runtime_logs` for the new deployment covering the window; record
   that no error-level entries other than the known `pg` SSL-mode warning
   appear.

If the hosted `/app` still fails, stop, record the evidence, and do not
attempt a second, unplanned fix.

## Documentation

- `docs/vercel-deployment.md`: mark Prompt 391 finding 2 resolved with cause,
  fix, deployment; update "Resume here" (next item: snapshot
  rebuild/adoption or retirement; the 48 h signature window closes
  ≈2026-10-20T01:00Z) and the prompt list.
- `docs/dashboards.md` "GraphQL read model": the helper sends a named
  operation; unnamed operations are rejected outside development.
- `docs/operations.md`: a "Prompt 393" execution record (checks, review,
  hosted evidence), matching the Prompt 392 section's shape.
- Memory `vercel-migration-resume.md`: update the status line.

## Expected impact

`/app`, `/app/dashboards` and `/app/dashboards/[viewId]` render for
organization members on any non-development deployment. No route, schema,
API contract, token or UI change.

## Breakpoint behaviour

Not applicable: no visual change at 375, 800 or 1280.

## Reference deltas

None.

## SKILLS USED

- `vercel-react-best-practices` — server-only module boundary for the moved query constants.
- `javascript-testing-patterns` — shape of the no-browser regression test.
- `playwright` — running the client test project.
- `error-handling-patterns` — confirming the error-path reasoning and recorded residuals.
- `vercel:deployments-cicd` — preview deploy and inspection.
- `requesting-code-review` — stage-1 reviewer dispatch.
- `receiving-code-review` — stage-2 evaluation of feedback.
- `caveman-commit` — every commit message.
