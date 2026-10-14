# Acres operator handoff — INCOMPLETE TEMPLATE

Copy to the restricted operator store before filling. This template is not live
evidence, an access grant, an approved deployment, or a launch readiness record.
No action is authorized. `PENDING` means missing input, not a default.

## Target

| Field | Value | Classification |
| --- | --- | --- |
| Record ID / revision | PENDING | missing |
| Prepared at (UTC, ISO 8601) / preparer | PENDING | missing |
| Production environment opaque ID | PENDING | missing |
| Recommended topology | single-host-compose-caddy | recommendation only |
| Selected topology / approval or deviation reference | PENDING | missing |
| Approved channel for host and FQDN | PENDING | missing |
| Restricted host/FQDN record reference | PENDING | missing |
| Materialized Compose ID / revision / checksum | PENDING | missing |
| Materialized Caddyfile ID / revision / checksum | PENDING | missing |

## Candidate

Bind all records to this environment and release. Supply immutable
`registry/path@sha256:<64 lowercase hex>` references from verified build
provenance; never replace unknown values with plausible examples.

| Field | Value | Classification |
| --- | --- | --- |
| Release ID / reviewed 40-character source SHA / review reference | PENDING | missing |
| Current client image / provenance reference | PENDING | missing |
| Current server image / provenance reference | PENDING | missing |
| Previous client image / provenance reference | PENDING | missing |
| Previous server image / provenance reference | PENDING | missing |
| Image signature / provenance policy reference | PENDING | missing |
| Rollback compatibility / recovery plan reference | PENDING | missing |

A first deployment without a previous image pair retains an unresolved rollback
prerequisite. Do not duplicate current images to manufacture a previous release.

## People

Role descriptions are recommended responsibilities, not assignments or grants.

| Responsibility | Named accountable person/team | Assignment reference |
| --- | --- | --- |
| Operations lead — coordinates target and category owners | PENDING | PENDING |
| Release manager — binds reviewed source and images | PENDING | PENDING |
| Deployment approver — authorizes an exact rollout | PENDING | PENDING |
| Rollback authority — authorizes recovery scope | PENDING | PENDING |
| Evidence custodian — controls record access | PENDING | PENDING |

Each supplier and signer below must be assigned to a named person/team in the
restricted record. Keep conflicts of responsibility visible; a reviewer should
inspect source evidence independently of the executor where practical.

| Category | Recommended supplier role | Recommended signer role | Named supplier / signer | Child-report reference | Independent live-source reference | Status |
| --- | --- | --- | --- | --- | --- | --- |
| production_domain_tls | Ops lead | Ops lead | PENDING | PENDING | PENDING | unresolved |
| smtp_delivery | Ops lead | Ops lead | PENDING | PENDING | PENDING | unresolved |
| secrets_management | Security lead | Security lead | PENDING | PENDING | PENDING | unresolved |
| secret_references | Security lead | Security lead | PENDING | PENDING | PENDING | unresolved |
| slo_and_alerting | SRE/on-call | SRE lead | PENDING | PENDING | PENDING | unresolved |
| backup_and_disaster_recovery | SRE | SRE lead | PENDING | PENDING | PENDING | unresolved |
| data_retention_policy | Legal and ops | Legal lead | PENDING | PENDING | PENDING | unresolved |
| volume_encryption | Infrastructure/key owner | Security lead + key-recovery owner | PENDING | PENDING | PENDING | unresolved |
| graphql_introspection | Security lead | Security lead | PENDING | PENDING | PENDING | unresolved |
| deployment_and_rollback | Release manager | Release manager | PENDING | PENDING | PENDING | unresolved |
| optional_ai_posture | Product/security | Product/security | PENDING | PENDING | PENDING | unresolved |

## Evidence access

| Field | Value | Classification |
| --- | --- | --- |
| Restricted evidence-store opaque reference | PENDING | missing |
| Operator readiness-record reference / revision | PENDING | missing |
| Access custodian / requester identity | PENDING | missing |
| Approved communication channel | PENDING | missing |
| Read-only access procedure / authorization reference | PENDING | missing |
| Allowed existing records and fields | PENDING | missing |
| Existing-record-only scope confirmed | PENDING | missing |
| Access expiry (UTC) / revocation owner and procedure | PENDING | missing |
| Inspection timestamp / inspector / consistency findings | PENDING | missing |

Exclude secret payloads, credentials, private keys, raw host inventories, tenant
data and unredacted reports from chat and git. A record reference does not grant
permission to enumerate accounts, retrieve credentials or probe production.

Use `missing`, `supplied, unverified`, `inspected`, or `inconsistent` for supplied
facts. `Inspected` requires reading the designated source within granted scope;
record inspector, UTC timestamp and source revision. It does not approve a
category. Category decisions remain in the canonical restricted readiness record.

## Action boundary

No production action is authorized by completing or reviewing this handoff.
Add one row per separately authorized action; absent approvals remain pending.

| Target/release ID | Exact action | Named approver | Window (UTC) | Recovery boundary / rollback authority | Approval reference | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | not authorized |

## Intake disposition

| Field | Value |
| --- | --- |
| Five intake groups complete and independently inspected? | PENDING |
| Conflicting or inaccessible references / remaining blockers | PENDING |
| Next bounded action / accountable owner | PENDING |
| Custodian acknowledgment / date / reference | PENDING |

Follow [the completion guide](../../docs/operator-handoff.md) and the existing
[launch category contracts](../../docs/launch-checklist.md#3-eleven-category-launch-readiness-checklist).
When copied elsewhere, retain canonical repository links in the private record.
