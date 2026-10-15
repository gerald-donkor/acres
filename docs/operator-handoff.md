# Operator handoff completion guide

Use [the handoff form](../infra/launch/operator-handoff.example.md) to assemble
Phase 12's shared prerequisites for one production environment and release.
The package is prepared; the production intake remains missing until operators
supply and independently verify its facts. The launch checklist governs intake
inspection;
Prompt 201 and the [launch checklist](launch-checklist.md) govern launch evidence
and sign-off. This form supplements their contracts and does not replace them.

## Selected managed target — 2026-10-15

Prompt 370 supersedes the reference hosting recommendation for the selected
production target with Vercel compute/routing plus Marketplace Neon and Resend.
Its [migration record](vercel-deployment.md) owns in-progress implementation and
hosted proof gates. The reference procedure below remains useful only for the
implemented Compose profile. Do not require fictional Compose images/mounts for
Vercel or treat a Vercel receipt as accepted by the existing readiness schema.
Account-bound managed intake, evidence validation, recovery and all eleven
sign-offs remain open; this amendment supplies none of those facts.

## Recommended starting posture

Retain the approved reference architecture: single-host Compose+Caddy, separate
API/worker processes, private stateful dependencies, immutable client/server
images, forced tenant RLS, and disabled AI. Materialize the existing
[Compose](../infra/compose/docker-compose.production.example.yml),
[Caddy](../infra/caddy/Caddyfile.example), and
[environment](../infra/env/production.env.example) references after selecting a
target. These are recommendations, not evidence of a deployed host. Host sizing,
provider, region, purchasing and policy adoption remain operator decisions.

Caddy can automate certificate provisioning, renewal and HTTP-to-HTTPS redirects;
public DNS, reachable ports and persistent certificate state must be arranged.
Keep HSTS subject to its existing separate approval and recovery gate.
Source: [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

Use separate least-privilege identities, restricted runtime secret injection,
encrypted stateful mounts, separate key custody, encrypted off-host backups and
an isolated restore target. Keep raw evidence in a restricted operator store
outside the checkout, with named custodian, access expiry and revocation.
The existing production templates consume many secrets as injected environment
values and use restricted files for some monitoring credentials. Do not put real
values into the tracked environment example or print a rendered secret-bearing
Compose configuration into logs.

Prefer service-scoped file secrets where the actual consumer supports them.
Docker Compose grants secret files per service; `_FILE` variables are a consumer
convention, not automatic support in Acres. A universal file-secret migration
requires separate implementation and verification. Compose file mounts alone
do not provide encryption of the host files.
Source: [Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/).

## Completion order

1. The operations lead and evidence custodian create a private copy of the form
   in an approved restricted store outside this repository. Preserve the public
   template as incomplete. Establish a record ID/revision, UTC preparation date,
   approved communication channel and access policy. Do not infer that a local
   directory is an approved evidence store.
2. The operations lead supplies one environment opaque ID, the approved topology
   and designated restricted host/FQDN record. Supply materialized Compose/Caddy
   IDs, revisions and checksums. Reference templates are not materialized targets.
3. The release manager supplies the operator-reviewed source SHA, immutable current
   and previous client/server image pairs, signature/provenance policy and source
   artifacts. Confirm every reference binds to the same environment and release.
   The repository's historical RC snapshot is not automatically selected.
   A first deployment lacking previous images remains blocked for rollback intake;
   resolve it explicitly through the governing launch process rather than inventing
   history or silently waiving the prerequisite.
4. Name the release manager, deployment approver, rollback authority, custodian,
   and suppliers/signers for all eleven categories. Confirm responsibility from
   designated records. One person may hold multiple roles only when that assignment
   is explicit; job titles alone do not authorize an action.
5. The custodian supplies scoped read-only access to existing named records and
   allowed fields, with requester identity, expiry and revocation procedure. Keep
   secrets and private inventory out of chat/git. Inspect only designated sources;
   do not discover a host by searching credentials, accounts or live endpoints.
6. Classify facts as missing, supplied/unverified, inspected or inconsistent.
   Record source revision, inspector and UTC timestamp when inspected. Resolve
   environment/source/image mismatches and missing authority before dependent work.
7. Apply the existing [shared prerequisites and handoff](launch-checklist.md#6a-production-evidence-preflight-gap-register--2026-10-14)
   and [sign-off matrix](launch-checklist.md#7-formal-pre-launch-sign-off-matrix).
   Their category schemas, measurements and policy requirements remain authoritative.
   SLO/RPO/RTO, retention and capacity need accountable adoption and actual evidence;
   this guide creates no alternate thresholds or pre-approved policies.
8. Propose one bounded next action after intake inspection. Deployment, rollback,
   SMTP delivery, live load/DoS, restore, HSTS and secret rotation require separate
   target/action/authority/window/recovery approvals. A completed form authorizes
   none of them. Fresh live evidence and eleven category sign-offs remain required.

## Consolidated request to use through the approved channel

> Operations lead: please coordinate one UTC-dated handoff for the selected Acres
> production environment and release. Supply its opaque environment ID, approved
> topology, restricted host/FQDN reference, and materialized Compose/Caddy IDs and
> revisions. Release manager: supply the reviewed full source SHA, immutable current
> and previous client/server images and provenance references. Name the release
> manager, deployment approver, rollback authority, evidence custodian and each of
> the eleven category suppliers/signers. Custodian: supply restricted evidence-store
> and readiness-record references, the approved channel, scoped read-only procedure,
> allowed existing records/fields, and access expiry/revocation. Record any exact
> action approvals separately with target, action, authority, UTC window and recovery
> scope; leave absent approvals unauthorized. Keep credentials, private host inventory,
> tenant data, key material and unredacted reports outside chat and git. References
> remain supplied/unverified until their authorized sources are independently inspected.

This request is provided for operator use; creating this guide sends no message.

## Validation and handback

Compare the completed intake with the existing launch category contracts.
The Markdown form has no automated validator and is not accepted as readiness JSON.
For the actual restricted readiness record, use the existing command:

```bash
node scripts/ops/check-launch-readiness.js <restricted-operator-readiness.json>
```

Run it only through the custodian's authorized access procedure. A passing validator
does not replace independent source inspection, the unified dossier or human sign-off.
The checked-in example remains deliberately unresolved. Return the non-sensitive
intake disposition, blockers, responsible owners and one next safe action. Store
the completed form, actual identities and signed evidence in the restricted store;
only permitted opaque IDs and truthful summaries belong in repository records.
