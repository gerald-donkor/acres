# Managed migration prerequisites

Prompt 370 remains in progress. See [the migration record](../../docs/vercel-deployment.md).
There is deliberately no active Vercel routing/profile config before account
inspection and hosted seam proofs. Do not deploy the existing BullMQ/timer
application as if it were invocation-safe.

## Platform probes

The Queues layout/delivery probe is a separately deployed synthetic project
root: see [probes/queues](probes/queues/README.md).

Run `npm run vercel:probe -- --help` without credentials. `@vercel/sandbox` is a development-only dependency; `@vercel/blob` is a server runtime dependency since Prompt 371, and these probes are not bundled into serving code. Local behavior tests:
`npm run vercel:probe-test`. These tests use doubles and approve no hosted gate.

After selecting an isolated synthetic-only preview and permitted resource use
through Vercel MCP, inject these values through a restricted environment (never
paste keys into chat, source, shell history or documentation):

| Variable                                                  | Purpose                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `ACRES_VERCEL_PROBE=isolated-synthetic-preview`           | Explicit opt-in; does not establish target identity or permission by itself           |
| `VERCEL_ENV=preview`                                      | Reject accidental production invocation                                               |
| `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`                     | Selected account identities; resolve and check them through MCP first                 |
| `BLOB_READ_WRITE_TOKEN`                                   | Only for `blob`/`blob-browser`: token for the selected isolated private store         |
| `VERCEL_TOKEN`                                            | Only for `scanner`: restricted access to the selected preview project                 |
| `ACRES_VERCEL_PROBE_REGION`                               | Only for `scanner`: explicitly selected Vercel region (no implicit `iad1` fallback)   |
| `ACRES_SCANNER_IMAGE`                                     | Only for `scanner`: approved `vcr.vercel.com/...@sha256:<64 lowercase hex>` image     |
| `ACRES_SCANNER_MAIN_SHA256`, `ACRES_SCANNER_DAILY_SHA256` | Reviewed digests of `/var/lib/clamav/main.cvd` and `daily.cvd` in that pinned image   |
| `ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS`                   | Adopted freshness threshold, integer 1–168; probe bound, no default production policy |

`npm run vercel:probe -- blob` uploads a fresh random-path **5 MiB** synthetic
object, rejects unexpected non-private origins, checks anonymous read denial,
reads privately without cache, compares actual SHA-256/size and deletes exactly
that path in `finally`. Cleanup has a separate timeout. Success is only a
**server SDK** proof: scoped browser tokens, large direct browser upload,
callback provenance, tenant authorization, cancellation and download revocation
still need real application acceptance. A failed put can leave ambiguous remote
state; inspect only the test store if cleanup fails. No broad listing/deletion.

`npm run vercel:probe -- blob-browser` proves the presigned protocol the
`vercel-blob` storage adapter uses, from a real browser. It needs the same
inputs as `blob`, plus the client workspace's Playwright Chromium. It serves a
blank page on an ephemeral `127.0.0.1` port, so every request is cross-origin.
The page generates a seeded **12 MiB** payload (above the 4.5 MB function body
limit) and PUTs it to a URL from `issueSignedToken` + `presignUrl`, sending
only `content-type`. The probe then checks:

- server `head`/`get` size, type and SHA-256;
- refusal of an overwrite replay, a wrong type on an extensionless key, one
  byte over the signed size, a swapped `pathname` and an expired URL; each
  refusal also confirms on the server that nothing was written;
- anonymous denial of the plain private URL;
- a signed browser GET (bytes, type and disposition shape);
- that a read token cannot presign another path;
- a 404 from a still-valid GET URL after deletion.

Two diagnostics without a gate record that a `.csv` extension overrides a wrong
`content-type`, and that a wrong `x-content-type` is refused. Every pathname
lives under `acres-probes/<run>/` and is deleted in `finally`. The summary JSON
carries statuses, booleans and header _shapes_ only, never a URL, token or
signature. Exit code 1 means a gate case failed. This proves the storage seam,
not application acceptance through a deployed preview.

`npm run vercel:probe -- scanner` requires a prebuilt approved VCR image with
`node`, `sigtool`, `clamscan` and the two checksum-bound CVD files. It provisions
one Sandbox, denies all network egress, verifies both signature hashes/build
timestamps and daily signature freshness, writes synthetic clean/EICAR files,
requires clamscan exits 0/1 respectively, and stops the sandbox in `finally`.
A one-vCPU allocation and 120-second lifetime cap are **probe choices**,
not measured capacity or adopted production budgets. Each command has a
30-second kill limit. The SDK declares memory as 2048 MB per vCPU. No daemon,
package install, signature download, broad secrets or customer data is passed.
Image construction/license/signature acquisition and account availability are
still unresolved. No old-signature fallback. Main signatures may be older than
daily; both hashes and nonfuture build dates must verify.

The scripts suppress SDK exceptions, command output, tokens, URLs and signatures
from public console output. Inspect failure details through the restricted
provider console, including deletion/termination after interrupted requests.
A stop/delete error is failure, never success; creation-response loss is bounded
by the requested Sandbox lifetime and requires provider inspection. The simple
scanner probe is not production scanner acceptance: deliberate stale/missing
signatures, resource exhaustion, kill/timeout and large malformed inputs still
need live failure tests. No browser, RLS, queue delivery, launch or deployment
claim is emitted by either probe.

## Environment ownership and activation

Keep preview and production projects/bindings, database branches/roles, Blob
stores, topics, scanner sources, mail senders and evidence separate. Provision
Neon and Resend through the selected Vercel Marketplace scope. API/worker runtime
must never receive direct migration/owner credentials. Keep keys server-only;
no `NEXT_PUBLIC_` secret. Select plan/region/spend and verify actual project
identity before any resource creation. A connector authorizes inspection; it
does not prove launch policy adoption.

The optional local Resend transport uses `MAIL_TRANSPORT=resend`, a verified
explicit `MAIL_FROM` and server-only `RESEND_API_KEY`. A fixed HTTPS endpoint,
10-second request timeout and generic error prevent provider error leakage.
SMTP/memory remain defaults. No real mail test until an operator-owned test
address is designated. Do not infer production delivery from adapter tests.

Managed storage, queues, scanning, profile selection, protected Cron, distributed
throttling, service ingress, versioned managed launch evidence and recovery are
still required before activating a Vercel deployment. Preserve reference Compose
checks with their original meaning. Review source/runtime/job compatibility,
first-deployment disable/recovery and all eleven categories before promotion.
