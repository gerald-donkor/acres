# Acres scanner image (Vercel Sandbox)

ClamAV for the `vercel-sandbox` scanner adapter and the `scanner*` platform
probes. Sandbox boots it as a VM and ignores `ENTRYPOINT`/`CMD`; the adapter
runs `node` and `clamscan` itself, with all egress denied.

## Pinned inputs

| input      | pin                                                                                  |
| ---------- | ------------------------------------------------------------------------------------ |
| ClamAV     | `clamav/clamav-debian:1.5.4_base` (Debian 13 trixie, no signatures), by index digest |
| Node       | `/usr/local/bin/node` only, from `node:24.21.0-trixie-slim`, by index digest         |
| signatures | `main.cvd`, `daily.cvd`, `bytecode.cvd` fetched by `freshclam` **at build time**     |

`freshclam.conf` sets `ScriptedUpdates no`, so whole `.cvd` files are written
and never `.cld` patches; the build fails if a `.cld` appears or a CVD is
missing. Every option is checked against the base image's
`freshclam.conf.sample`. `DNSDatabaseInfo` is left at its default: the sample
documents only a domain value and says not to change it. The build prints the
SHA-256 of each CVD, then `node`, `clamscan` and `sigtool` versions.
`/var/lib/clamav` is made world-readable (`a+rX`) because the base image leaves
it `0700 clamav` and the Sandbox user is not documented for custom images.

The digests change on every rebuild because the signatures do. The pushed
image's manifest digest and its `main.cvd`/`daily.cvd` hashes, taken from the
**pulled** artifact, are recorded in `docs/vercel-deployment.md`.

## Build, check, push

```bash
# local build and checks, no push
docker buildx build --platform linux/amd64 --load -t acres-scanner:local infra/vercel/scanner
docker run --rm --entrypoint sh acres-scanner:local -c \
  'sha256sum /var/lib/clamav/*.cvd; for f in main daily; do sigtool --info /var/lib/clamav/$f.cvd | grep -E "^(Build time|Version):"; done'

# push (project acres; needs the cost and licence decisions in docs/vercel-deployment.md)
npx vercel@latest vcr login docker
npx vercel@latest vcr build docker infra/vercel/scanner acres-scanner:<YYYYMMDD>-clamav-1.5.4 --push -- --provenance=false --sbom=false
npx vercel@latest vcr tag inspect acres-scanner <YYYYMMDD>-clamav-1.5.4
docker logout vcr.vercel.com
```

`--provenance=false --sbom=false` keeps a single `linux/amd64` manifest, so
the tag's digest is the one `sandbox.image` reports.

## Signature age and rebuilds

Runtime egress is `deny-all`: nothing refreshes signatures at scan time and
there is no fallback to older ones. Every scan checks that `daily.cvd` is no
older than `SCANNER_MAX_SIGNATURE_AGE_HOURS` (1–168). Past that age every scan
returns `failed`/`scanner_unavailable` until the image is rebuilt, pushed and
its new digest and hashes are configured. Automating that rebuild is an open
production blocker (see `docs/vercel-deployment.md`).

The in-VM check hashes `main.cvd` and `daily.cvd` only. `bytecode.cvd` is
covered by the image digest alone.

No EICAR file, signature file, token or VCR credential is committed. EICAR is
generated in memory by the probe, or with `printf` inside a local container.
