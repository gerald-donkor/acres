# Acres upload scanner for Vercel Sandbox. Sandbox ignores ENTRYPOINT/CMD.
# Signatures are fetched at build time; runtime egress is deny-all.
FROM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS node

FROM clamav/clamav-debian:1.5.4_base@sha256:25420050b2b469d97990f074cf454d8a67e9c7c6013a11fa1f47ac6a11347ce6
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY freshclam.conf /etc/acres-freshclam.conf
RUN freshclam --config-file=/etc/acres-freshclam.conf --stdout \
 && test -s /var/lib/clamav/main.cvd \
 && test -s /var/lib/clamav/daily.cvd \
 && test -s /var/lib/clamav/bytecode.cvd \
 && ! ls /var/lib/clamav/*.cld 2>/dev/null \
 && chmod -R a+rX /var/lib/clamav \
 && sha256sum /var/lib/clamav/*.cvd \
 && node --version && clamscan --version && sigtool --version
