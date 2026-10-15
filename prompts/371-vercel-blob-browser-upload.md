# Prompt 371 — Vercel Blob browser upload (Prompt 370, checklist item 2)

## Scope and why this is next

Planning baseline: `fa6518e` on `main` (clean tree).

Prompt 370 (Vercel-managed migration) is approved and still running. Its
"Resume here" checklist in `docs/vercel-deployment.md` lists, in order:
Queues consumer `[x]`, **Blob browser upload `[ ]`**, scanner image, first
preview deployment, production decision. The user entered `i` and named the
next item, Blob browser upload. This prompt is that item split out of
Prompt 370 as a separately approved, reviewable unit. It inherits 370's
target, non-goals and authorization limits. It does not replace 370.

**Process conflict, resolved here.** `docs/vercel-deployment.md` ("Resume
here") and the `vercel-migration-resume` memory say "do not write a new prompt
for its remaining scope". The user's explicit `i` on 2026-10-15 overrides
that line (AGENTS.md §2: a user request wins, and the stale line is fixed in
the same change). On execution, change that sentence to: "Remaining checklist
items may be split into numbered sub-prompts (Prompt 371 = Blob browser
upload); each inherits 370's approval limits." Update the memory file to say
the same.

The item, quoted from the checklist: "scoped client tokens, direct upload
above the function body limit, callback provenance, tenant authorization,
cancel/delete, download revocation (`vercel:vercel-storage`)".

Two Blob mechanisms exist today. This prompt uses the newer one:

| | `handleUpload` + client token (older) | **Presigned URLs (`issueSignedToken` + `presignUrl`)** — chosen |
| --- | --- | --- |
| Server credential | needs the long-lived `BLOB_READ_WRITE_TOKEN` | works with OIDC (`VERCEL_OIDC_TOKEN` + `BLOB_STORE_ID`); the RW token is only a fallback outside Vercel |
| What the browser holds | a client token (a bearer credential) | one signed URL for one exact pathname; "no Vercel-managed bearer token in flight" |
| Constraints | in the token | signed into the URL: `allowedContentTypes`, `maximumSizeInBytes`, `validUntil`, `allowOverwrite`, `addRandomSuffix` |
| Callback check | HMAC with the RW token over `JSON.stringify(body)` | Ed25519 with `BLOB_WEBHOOK_PUBLIC_KEY` |

Sources, read 2026-10-15: [Vercel Signed URLs](https://vercel.com/docs/vercel-blob/vercel-signed-urls)
(last updated 2026-09-15), [Client uploads](https://vercel.com/docs/vercel-blob/client-upload),
[Private storage](https://vercel.com/docs/vercel-blob/private-storage). The
installed `@vercel/blob` **2.8.2** exports `issueSignedToken`, `presignUrl`,
`head`, `get`, `put`, `del` and `BlobNotFoundError` from `@vercel/blob`
(verified in `node_modules/@vercel/blob/dist/index.d.ts`, line 2 and the
final export line). `presignUrl` builds the PUT URL as
`https://vercel.com/api/blob/?pathname=…&<signed params>` and the GET URL as
`https://<storeId>.private.blob.vercel-storage.com/<pathname>?<signed params>`
(`dist/chunk-XKVPKJPO.js`, `buildPresignedPutUrl` / `buildPresignedGetUrl`).

### Key design decision: keep the existing upload contract

A presigned Blob PUT really is "PUT these bytes to this URL with this
`content-type`" (the docs' own example is `fetch(presignedUrl, { method:
'PUT', headers: { 'content-type': … }, body })`). That fits the existing
`InitiateUploadResult.upload = { url, method: 'PUT', headers, expiresAt }`
and the existing browser code in `client/components/acres/app/dataset-actions.tsx`
(lines 289–307), which already sends whatever `headers` the server returns.

So: **no new transport variant, no `packages/shared` change, no
regenerated OpenAPI contract, no client dependency on `@vercel/blob`.**
This knowingly departs from Prompt 370 §4 ("explicit discriminated upload
transport … Do not cast the Blob SDK protocol into `PresignedPut`"). That
rule assumed the client-token protocol, which really is not a signed PUT. The
presigned protocol is. Record the departure in `docs/vercel-deployment.md`.

**This rests on one unproven fact:** that a plain browser `fetch` PUT, sent
cross-origin from the app's origin, is accepted by the Blob API, both for CORS
and for headers. Step 1 proves it on the real store **before any application
code changes**. If it fails, **stop**, record what was observed, and come
back to the user. Do not switch to `uploadPresigned` or a discriminated
transport on your own; that is a different contract and needs a new
decision.

### Callback provenance: no callback endpoint (decision)

No `onUploadCompleted` callback is configured and no callback route is added.
Reasons:

1. The browser's authenticated `POST /api/v1/uploads/:id/complete` already
   re-reads the object on the server and checks size, media type and
   SHA-256 before anything is accepted (`uploads.service.ts` `complete()`).
   A callback would add no trust that check lacks. Prompt 370 itself says "a
   completed provider callback is not acceptance of a source file".
2. A callback means a new unauthenticated public ingress, an Ed25519 key in
   project env, and a sessionless worker-context path into tenant data. Every
   preview also sits behind Vercel Authentication, which would block the
   callback anyway (the probe incident showed only the production alias is
   public).
3. Abandoned uploads (browser closed after the PUT, before `complete`)
   already expire through `UPLOAD_STALE_MINUTES` and
   `uploads.purge-expired`. Deleting their bytes belongs to the
   reconciliation sweeper (open under the Queues item).

So "callback provenance" is satisfied by **accepting no callback at all**:
no provider-originated request can change upload state. Record this as the
decision. If the user wants a callback instead, that is a follow-up prompt.

## References read for this prompt

- `AGENTS.md` (whole), `docs/vercel-deployment.md` (whole; "Resume here",
  "Hosted proofs", "Queues", gate table), `prompts/370-vercel-managed-migration-and-deployment.md`
  (whole; §2 Blob bullet, §4).
- `server/src/storage/{storage.port.ts,storage.module.ts,s3-object-storage.adapter.ts}`.
- `server/src/uploads/{uploads.service.ts,uploads.controller.ts,dto/*.ts}`.
- `packages/shared/src/uploads.ts`.
- `server/src/config/env.validation.ts` (lines 97–98 `QUEUE_PROVIDERS`;
  133–153 defaults; 291–347 queue/storage validation; 547–590 env mapping).
- `server/src/jobs/retention-maintenance.job.ts` (lines 61–82: expiry marks
  `StoredObject` `deleted` without deleting bytes).
- `server/src/worker/job-processor.service.ts` (lines 145, 158, 210–250).
- Storage callers: `uploads.service.ts` (presignPut, stat, getBuffer,
  presignGet), `worker/job-processor.service.ts:145`,
  `ingestion/ingestion-processor.service.ts:111`,
  `reports/reports.service.ts:607,658`, `health/health.service.ts:26`.
- `client/components/acres/app/dataset-actions.tsx` (lines 251–327),
  `client/lib/api/browser.ts` (lines 437–494), `client/next.config.ts` (no
  CSP is set, so `connect-src` does not need changing; confirm again at
  execution with `grep -rn "Content-Security-Policy\|connect-src" client server/src`).
- `scripts/vercel/probe-platform.js` (blob mode, lines 85–150),
  `infra/vercel/README.md`.
- `node_modules/@vercel/blob/dist/{index.d.ts,client.d.ts,create-folder-BM6BTlko.d.ts,chunk-XKVPKJPO.js}`
  (`PresignPutUrlOptions` at create-folder line 410: `operation`, `pathname`,
  `validUntil`, `allowedContentTypes`, `maximumSizeInBytes`,
  `onUploadCompleted`, `allowOverwrite`, `addRandomSuffix`,
  `cacheControlMaxAge`, `ifMatch`).
- Preview env names (names only): `BLOB_READ_WRITE_TOKEN`, `VERCEL_OIDC_TOKEN`
  are present; **`BLOB_STORE_ID` is absent**. The store is
  `acres-preview-probe` = `store_g2fmCH5CW7TJbkN3`.

No visual reference (§0) applies: nothing visible changes.

## SKILLS USED

- `vercel:vercel-storage` — Blob private storage, presigned URLs, OIDC vs RW token (loaded while planning).
- `nestjs-best-practices` — provider-selected storage module, adapter injection.
- `architecture-patterns` — keep the domain service behind `ObjectStoragePort`; adapter swap only.
- `api-design-principles` — confirm the public upload contract is unchanged and errors stay enveloped.
- `security-best-practices` — signed-URL scope, overwrite denial, no secret logging, download expiry.
- `security-threat-model` — update the upload trust boundary in `docs/security.md`.
- `secrets-management` — OIDC preferred; RW token as fallback only; preview-only scoping.
- `error-handling-patterns` — idempotent `putBuffer`, tolerant delete, post-commit cleanup failure.
- `javascript-testing-patterns` — adapter, config and service unit tests with SDK doubles.
- `playwright` — real-browser cross-origin PUT/GET in the hosted probe.
- `requesting-code-review` — independent reviewer after self-verification.
- `receiving-code-review` — verify feedback before changing code.
- `caveman-commit` — commit message(s).

No UI skill (`frontend-design`, `web-design-guidelines`, `accessibility-compliance`)
is needed because no markup, copy or interaction changes. If Step 1 forces a
client change, stop (see above) instead of loading them and continuing.

## Ordered implementation

Use Node 24 for every check (see `docs/vercel-deployment.md` "Re-establish
access" step 3 and "Verification": an explicit `node` **and** `npm` pair;
check `npm version --json` reports Node 24.21.0). Call scripts from bash, not
zsh. Secrets stay in `~/.config/acres/vercel-preview/`; list names only.

### Step 1 — Hosted seam probe (gate; run before any app change)

Add a mode `blob-browser` to `scripts/vercel/probe-platform.js` (keep `blob`
and `scanner` unchanged). Same opt-in guards as `blob`:
`ACRES_VERCEL_PROBE=isolated-synthetic-preview`, `VERCEL_ENV=preview`,
`VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `BLOB_READ_WRITE_TOKEN` (the probe runs
off Vercel, so it passes `token` to `issueSignedToken`; OIDC is not available
locally). Load Playwright from the client workspace the same way the script
loads server packages (`createRequire(path.resolve(__dirname,
"../../client/package.json"))`, then `require("@playwright/test").chromium`;
the client workspace declares `@playwright/test` `^1.62.1`). Serve one blank page from a throwaway
`node:http` server on `127.0.0.1:<ephemeral port>` so the browser makes real
cross-origin requests from an `http://127.0.0.1:<port>` origin. Run all
browser requests with `page.evaluate(fetch…)`.

Every pathname is `acres-probes/<randomUUID()>/<case>.csv`. Track all of
them and `del` each in `finally`, with a fresh 30 s signal, the same way the
existing `blob` mode does.

Payload: **12 MiB** (12 582 912 bytes) of synthetic bytes, generated in the
page from a seed so it doesn't have to cross the evaluate boundary. Compute
its SHA-256 in Node too. 12 MiB is above the 4.5 MB function body limit and
below `UPLOAD_MAX_BYTES` (52 428 800). Total transfer stays within a few
tens of MiB, well inside Hobby Blob limits.

Cases, each asserted, and each reported as a boolean or HTTP status, never a
URL, token or signature:

| # | case | expected |
| --- | --- | --- |
| 1 | token `operations:['put']`, exact pathname, `allowedContentTypes:['text/csv']`, `maximumSizeInBytes:N`, `validUntil` now+120 s; `presignUrl` put with `access:'private'`, `allowOverwrite:false`, `addRandomSuffix:false`, same constraints; browser PUT with only `content-type: text/csv` | 2xx, no CORS error. Record status and response JSON **key names** only. If the API needs other headers, record their names, then **stop** (see Scope) |
| 2 | server `head(pathname)` | `size === N`, `contentType === 'text/csv'` |
| 3 | server `get(pathname,{access:'private',useCache:false})`, bounded read | SHA-256 and length match |
| 4 | same PUT URL again (overwrite) | rejected (4xx) |
| 5 | fresh path, `content-type: text/plain` | rejected |
| 6 | fresh path, `maximumSizeInBytes: 1024`, body 1025 bytes | rejected |
| 7 | fresh path's URL with its `pathname` query param changed to another path | rejected (signature) |
| 8 | fresh path, URL `validUntil` now+5 s, wait 8 s, then PUT | rejected |
| 9 | anonymous browser GET of the plain private blob URL | 401/403/404 |
| 10 | token `operations:['get']`, `validUntil` now+60 s, `presignUrl` get `access:'private'`, `useCache:false`; browser GET | 200, bytes' SHA-256 matches; record `content-type`, `content-disposition` (value shape only: `attachment`/`inline`/absent) and whether CORS allowed reading the body |
| 11 | `presignUrl` get on a *different* pathname with case 10's token | throws locally (scope mismatch) |
| 12 | `del(pathname)`, then re-fetch case 10's still-valid URL | 404, which is how revocation works (deletion) |

Output: one JSON summary like the existing modes (`probe:
"private-blob-browser-presigned"`, booleans per case, `bytes`,
`cleanupSucceeded`, `launchApproved: false`). Unit tests in
`scripts/vercel/probe-platform.spec.js` cover the new mode's configuration
guards and the case logic with doubles (fake SDK, fake browser `evaluate`).
Doubles prove no hosted gate.

Run (bash, Node 24, from repo root):

```bash
(set -a; . ~/.config/acres/vercel-preview/preview.env; set +a; \
  ACRES_VERCEL_PROBE=isolated-synthetic-preview \
  VERCEL_TEAM_ID=team_zE3mp7nrEZ6a7cxRavwUMYC4 \
  VERCEL_PROJECT_ID=prj_q9ApajZWDgdYZetnm5s5oakEjrUD \
  node scripts/vercel/probe-platform.js blob-browser)
```

Then confirm via Vercel MCP (`get_storage_stores_by_id` for
`store_g2fmCH5CW7TJbkN3`), or the CLI listing restricted to the
`acres-probes/` prefix, that no probe object is left. No broad listing or
deletion outside that prefix.

**Gate outcomes:**
- Cases 1–12 as expected → continue to Step 2.
- Case 1 fails (CORS, or extra headers needed) → stop. Commit only the
  probe and its tests plus a doc record of the failure, then ask the user.
- Any of 4–8 accepted, so a constraint is not enforced → stop. That is a
  security finding. Record it and ask; do not build on it.
- Case 10 `content-disposition` is not `attachment` → continue, and record
  it as a reference delta (see "Download filename").

### Step 2 — Configuration: `STORAGE_PROVIDER`

In `server/src/config/env.validation.ts`, mirroring `QUEUE_PROVIDERS`:

- `export const STORAGE_PROVIDERS = ['s3', 'vercel-blob'] as const;`
  and `StorageProvider`. Default `STORAGE_PROVIDER: 's3'`. Any other value
  throws `STORAGE_PROVIDER must be "s3" or "vercel-blob", received "<v>"`.
- New `AcresEnv` fields: `storageProvider`, `blobStoreId: string | undefined`,
  `blobReadWriteToken: string | undefined` (never logged, never echoed in an
  error).
- When `vercel-blob`:
  - `BLOB_STORE_ID` is required and must match `^store_[A-Za-z0-9]+$`.
  - `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`,
    `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` and
    `STORAGE_FORCE_PATH_STYLE` must be **unset in the raw env**; a set value
    means a mixed profile and throws, like `VALKEY_URL` with
    `QUEUE_PROVIDER="vercel"`. Do not fill them with dummies.
  - `storageBucket` resolves to the `BLOB_STORE_ID` value, so the existing
    `StoredObject.bucket` writes in `uploads.service.ts` and
    `reports.service.ts` record which store holds the object, with no change
    at those call sites.
  - `BLOB_READ_WRITE_TOKEN` is optional (OIDC is the default on Vercel).
    If set, it must start with `vercel_blob_rw_`. Nothing else is checked.
  - Exclude the S3 `change-me` production placeholder check for this
    provider. Keep the Valkey part of that check unchanged.
- When `s3`, everything behaves exactly as today. `BLOB_*` values are
  ignored.
- Expose `storageProvider`, `blobStoreId` and `blobReadWriteToken` getters on
  `AcresConfigService`, next to `queueProvider`.

Update any env example or inventory files that list `QUEUE_PROVIDER`; find
them with `grep -rln "QUEUE_PROVIDER" --exclude-dir=node_modules .` and
add `STORAGE_PROVIDER` / `BLOB_STORE_ID` the same way, with no values.

### Step 3 — Port change (minimal)

`server/src/storage/storage.port.ts`: add `maxBytes: number` to
`presignPut`'s input. `uploads.service.ts` `initiate()` passes
`maxBytes: body.byteCount`. Uploads are bound to the declared size, the way
the Blob URL enforces `maximumSizeInBytes`. The S3 adapter accepts the field
and leaves its signing unchanged (S3 presigned PUT has no size cap here); add
one comment saying so. No other port signature changes.

### Step 4 — `VercelBlobStorageAdapter`

New `server/src/storage/vercel-blob-storage.adapter.ts`, `@Injectable()`,
implementing `ObjectStoragePort`. Import from `@vercel/blob` only (server
entry). Every SDK call carries `abortSignal: AbortSignal.timeout(…)` (30 s for
control calls, 120 s for `get`/`put` bodies) and `token:
config.blobReadWriteToken` only when that value is defined. Otherwise omit
it, so the SDK uses OIDC with `BLOB_STORE_ID`. Never log keys' URLs, tokens,
signatures or signed URLs.

- `presignPut({ key, mediaType, maxBytes })`: `validUntil = now +
  presignedUploadTtlSeconds*1000`.
  `issueSignedToken({ pathname: key, operations: ['put'], allowedContentTypes:
  [mediaType], maximumSizeInBytes: maxBytes, validUntil })`, then
  `presignUrl(token, { operation: 'put', pathname: key, access: 'private',
  allowedContentTypes: [mediaType], maximumSizeInBytes: maxBytes,
  allowOverwrite: false, addRandomSuffix: false, validUntil })`. Return
  `{ url, method: 'PUT', headers: { 'content-type': mediaType }, expiresAt }`,
  plus any extra header names Step 1 proved necessary. (If Step 1 needed any,
  you stopped at Step 1, so normally there are none.) `checksumHex` is
  ignored: Blob has no SHA-256 precondition, and `complete()` verifies it
  server-side.
- `presignGet({ key })`: `validUntil = now + acceptedDownloadTtlSeconds*1000`;
  token `operations: ['get']`, exact pathname; `presignUrl` get, `access:
  'private'`, `useCache: false`. Return `{ url, method: 'GET', headers: {},
  expiresAt }`. `filename`/`mediaType` cannot be applied (see delta).
- `stat(key)`: `head(key)` → `{ byteCount: BigInt(size), mediaType:
  contentType ?? null, checksumHex: null }`; `BlobNotFoundError` → `null`;
  everything else rethrows.
- `getBuffer(key)`: `get(key, { access: 'private', useCache: false })`;
  `null` or a non-200 `statusCode` → `null`. Read the stream with a byte cap
  of `config.uploadMaxBytes`; going over throws (an object larger than any
  accepted upload is never buffered). Same bounded-reader shape as the
  probe's `readBounded`.
- `putBuffer({ key, body, mediaType, checksumHex })`: `put(key, body, {
  access: 'private', contentType: mediaType, addRandomSuffix: false,
  allowOverwrite: false })`. If the SDK rejects because the pathname already
  exists (identify the exact error class or message from
  `node_modules/@vercel/blob/dist` at execution; do not guess), read the
  object back with `getBuffer`. If its SHA-256 equals `checksumHex`, treat it
  as success: an idempotent retry after "object written, DB not committed".
  Otherwise throw. Also verify `checksumHex` equals the SHA-256 of `body`
  before uploading, and throw on mismatch.
- `delete(key)`: `del(key)`; a not-found error is success.
- `readiness()`: `head('.acres-readiness')`. `BlobNotFoundError` → `true`;
  any other error → `false`. Same meaning as the S3 adapter.

Dependency: move `"@vercel/blob": "2.8.2"` in `server/package.json` from
`devDependencies` to `dependencies` (exact pin, same version), then run
`npm install` so the root lockfile reclassifies it. If it reports `ENOTCACHED`
offline, allow the metadata fetch, as the 370 record describes. Do not
upgrade the version.

### Step 5 — Provider-selected `StorageModule`

`server/src/storage/storage.module.ts`: provide `OBJECT_STORAGE` with
`useFactory` that injects `AcresConfigService` and constructs **only** the
selected adapter. In blob mode the S3 client must never be built; in s3 mode
the Blob SDK must never be called. Read `server/src/queue/` (its module and
how `QUEUE_PROVIDER` selects the adapter) and copy that pattern. Keep
`S3ObjectStorageAdapter` exported for its existing spec. Confirm that every
module composition importing `StorageModule` (API, `WorkerModule`,
`VercelJobsModule`) still boots: the existing test 7G boots both worker
compositions.

### Step 6 — Cancel deletes bytes that never reached quarantine

`uploads.service.ts` `cancel()`:

- Inside the existing transaction, remember whether the upload was in
  `pending_upload` before it is set to `cancelled`, and select its
  `storedObject.objectKey` and `storedObjectId`.
- **After** the transaction commits, and only if the prior state was
  `pending_upload`: call `storage.delete(objectKey)`. On success, run a second
  `organizationScoped` transaction that sets that `StoredObject` to `state:
  'deleted', deletedAt: now`, guarded by `state: 'pending_upload'`
  (`updateMany` with that where clause). If the delete throws, log a warning
  with the upload id only (no key, no URL) and still return the cancelled
  status. The `StoredObject` stays `pending_upload`, which the future
  reconciliation sweeper can find.
- An idempotent replay (already `cancelled`) does not delete again.
- From `completed`/`scanning`, do not delete. The processor already finishes
  cancelled work (`job-processor.service.ts:158,221`), and those quarantined
  bytes go to the sweeper. Record that.

A browser that keeps its signed PUT URL can still write until `validUntil`
(at most `PRESIGNED_UPLOAD_TTL_SECONDS`, 900 s by default), after the cancel
deleted the empty path. That leaves unreachable bytes that nothing reads
(the ledger is `cancelled`, so `complete()` returns 409). Record this
residual too, and leave it to the sweeper. Do not shorten the TTL in this
prompt.

### Step 7 — Unit tests

- `server/src/storage/vercel-blob-storage.adapter.spec.ts` (new;
  `jest.mock('@vercel/blob')` with typed mocks, no `any`):
  presignPut passes the exact pathname, `['put']`, `[mediaType]`,
  `maxBytes`, `allowOverwrite:false`, `addRandomSuffix:false`, `access:
  'private'` and a `validUntil` inside the TTL; it returns only
  `content-type`. presignGet uses `['get']`, `useCache:false`, the download
  TTL. `token` is omitted when undefined and passed when set. stat maps
  fields and returns `null` on `BlobNotFoundError` but rethrows others.
  getBuffer returns `null` on not-found and throws above the cap. putBuffer
  throws on a body/checksum mismatch, treats an existing equal object as
  success and an existing different one as an error. delete tolerates
  not-found. readiness covers not-found → true and other → false. One test
  asserts that no logger call receives a value containing `vercel_blob_rw_`
  or `vercel-blob-signature`-style query content.
- `server/src/storage/storage.module.spec.ts` (new): the factory returns the
  Blob adapter for `vercel-blob` and the S3 adapter for `s3`, and does not
  construct the other.
- Config tests (extend the existing env-validation unit spec, and the e2e
  `server/test/env-validation.e2e-spec.ts` only if that is where provider
  cases live today): invalid provider; missing or malformed `BLOB_STORE_ID`;
  each S3 variable set alongside `vercel-blob` rejected; malformed RW token
  rejected; `storageBucket` equals the store id; `s3` default unchanged.
- `uploads.service.spec.ts`: `initiate` passes `maxBytes`; cancel from
  `pending_upload` deletes after commit and marks the object deleted; a failed
  delete still returns cancelled and leaves the object `pending_upload`;
  cancel replay does not delete; cancel from `completed` does not delete.

The existing real-database e2e suites keep running against Garage (`s3`).
Nothing in CI calls Blob.

### Step 8 — Documentation (owning files)

- `docs/vercel-deployment.md`:
  - Fix the "do not write a new prompt" sentence (see Scope).
  - Tick the Blob item, or leave it `[ ]` with "local implementation done;
    hosted app proof waits for first preview" if that is the honest state.
    The app-level end-to-end upload through a deployed preview belongs to the
    "First preview deployment" item, so add it to that item's text: "app
    upload → complete → scan through the deployed preview with
    `STORAGE_PROVIDER=vercel-blob`, `BLOB_STORE_ID` set, OIDC".
  - Add a "Blob browser upload — <date>" section: the Step 1 table with the
    observed statuses, the presigned-vs-client-token decision and sources,
    the unchanged contract and the departure from 370 §4, the no-callback
    decision, cancel/delete semantics and both residuals, download
    revocation (short TTL + state/permission recheck at mint + deletion makes
    URLs 404; a minted URL cannot be revoked before expiry except by deleting
    the object), and the download-filename delta.
  - Update the Blob gate row's "Current state".
  - Add to the "First preview deployment" item: add `BLOB_STORE_ID`
    (`store_g2fmCH5CW7TJbkN3` for preview) to project env (it is absent
    today), and narrow or remove `BLOB_READ_WRITE_TOKEN` once OIDC is proven
    on the deployment.
- `infra/vercel/README.md`: document the `blob-browser` mode, its inputs,
  cases, cleanup and limits, next to `blob`.
- `docs/security.md`: in the upload/storage boundary entries, note the
  Vercel profile: exact-path, size- and type-bound signed PUT URLs,
  overwrite denial (which closes the S3 window where a still-valid PUT URL can
  replace bytes after `complete` and before the scan; state that the S3
  profile still has it), no provider callback ingress, and signed GET
  semantics. Change only the rows that describe these boundaries.
- `docs/backend.md`: the storage section gets `STORAGE_PROVIDER`, the two
  adapters, and the new env variables.
- Memory `vercel-migration-resume.md`: point at 371 and the sub-prompt
  convention; keep it short.

## Reference deltas

- **Download filename.** Presigned Blob GET has no per-URL
  `Content-Disposition` option (`PresignGetUrlOptions`), and the quarantine
  pathname is a UUID with no extension. Downloads in the Vercel profile will
  carry whatever Step 1 case 10 recorded rather than
  `attachment; filename="<declared>"` as on S3. Bytes come from a separate
  `*.private.blob.vercel-storage.com` origin, so there is no same-origin
  script risk. Record it as a known delta for the user. Streaming through a
  function to set the header is a later option (Private storage docs pattern;
  watch response-size limits). It is not in this prompt.
- **Contract.** No public API change; this departs from 370 §4 as explained
  under Scope.

## Breakpoint behaviour

No markup, style or copy changes. The upload step in `/app/datasets`
behaves the same at 375, 800 and 1280. No browser layout check is needed
beyond the existing client E2E run.

## Non-goals

- No callback route, no `BLOB_WEBHOOK_PUBLIC_KEY`, no `handleUpload` /
  `uploadPresigned` client SDK.
- No client UI change (for example a cancel button during the PUT). The
  API-level cancel is what the gate needs; a UI control would be a separate,
  design-reviewed prompt.
- No reconciliation sweeper, orphan deletion for expired, rejected or
  late-written objects, or retention byte deletion. That is the sweeper's work
  (Queues item, "Open").
- No Vercel deployment, Services config, project env writes, or production
  anything. That is the "First preview deployment" item. Reading store
  metadata via MCP is fine; creating, deleting or reconnecting stores is not.
- No scanner changes, no Sandbox, no S3 adapter behaviour change beyond
  accepting `maxBytes`.
- No `@vercel/blob` upgrade; no new dependency in `client/`.

## Verification (quote real output, Node 24, sequential)

```bash
npm run vercel:probe-test
npm run contracts:check          # must show no drift: the contract is unchanged
npm run lint
npm run typecheck
npm run build
npm run test --workspace=@acres/server -- --runInBand
npm run test:e2e --workspace=@acres/server -- --runInBand --testTimeout=30000
npm run test:e2e --workspace=@acres/client -- --workers=1
npm run ops:check
git diff --check
```

Plus the Step 1 hosted probe output (summary JSON only) and the store residue
check. If a check fails for an environment reason (DB starting, `listen
EPERM`, offline cache), say so and rerun with permission. Never record an
environment failure as a pass. Format changed files only.

Then: `requesting-code-review` with this prompt, `fa6518e` as BASE, HEAD,
the diff, the check output and the probe summary. Evaluate the findings with
`receiving-code-review`, fix valid ones, re-review if the storage module or
the cancel path changes shape. Record results in `docs/vercel-deployment.md`.
Commit locally on `main` with `caveman-commit` (suggested split: probe +
tests + doc record; then adapter/config/cancel + docs). Stage only task
files. No push.

## Rollback

`git revert` of the commits. `STORAGE_PROVIDER` defaults to `s3`, so even
with the code present nothing changes unless the variable is set. No schema
change, no hosted object kept (probe paths are deleted).

## Completion statement to give the user

Say which Step 1 cases passed, with their statuses. Say whether the checklist
item is ticked or stays waiting on the preview deployment. List the two
residuals (late PUT after cancel; quarantined bytes of cancelled, expired and
rejected uploads), the download-filename delta, and the no-callback decision.
Do not say "Blob gate passed": the gate needs the deployed app's upload, which
the next item provides.
