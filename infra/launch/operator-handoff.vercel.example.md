# Acres operator handoff — INCOMPLETE TEMPLATE (Vercel-Managed Production)

Copy to the restricted operator store before filling. This template is not live
evidence, an access grant, an approved deployment, or a launch readiness record.
No action is authorized. `PENDING` means missing input, not a default.

## Target

| Field | Value | Classification |
| --- | --- | --- |
| Record ID / revision | PENDING | missing |
| Prepared at (UTC, ISO 8601) / preparer | PENDING | missing |
| Production environment opaque ID | PENDING | missing |
| Target architecture | vercel-managed-production | target topology |
| Vercel Team ID | PENDING (team_*) | missing |
| Vercel Project ID | PENDING (prj_*) | missing |
| Vercel primary compute region | iad1 (aws-us-east-1) | fixed configuration |
| Neon Project ID | PENDING | missing |
| Neon Branch ID | PENDING | missing |
| Neon pooled connection URL reference | PENDING (neon:connection#pooled) | missing |
| Neon direct migrator connection URL reference | PENDING (neon:connection#direct) | missing |
| Vercel Blob Store ID | PENDING (store_*) | missing |
| Sandbox Scanner Snapshot ID | PENDING (snap_*) | missing |
| Resend verified sender domain & policy reference | PENDING | missing |

## Candidate

Bind all records to this environment and release. Supply immutable deployment
identifiers (`dpl_*`), deployment URLs, and reviewed source Git commit SHA (40-char
lowercase hex); never replace unknown values with plausible examples.

| Field | Value | Classification |
| --- | --- | --- |
| Release ID / reviewed 40-character source SHA / review reference | PENDING | missing |
| Current Vercel Deployment ID (`dpl_*`) / Deployment URL | PENDING | missing |
| Previous Vercel Deployment ID (`dpl_*`) / Deployment URL (rollback target) | PENDING | missing |
| Build provenance and deployment protection policy reference | PENDING | missing |
| Instant rollback procedure / recovery plan reference | PENDING | missing |

A first deployment without a previous deployment retains an unresolved rollback
prerequisite. Do not duplicate current deployment IDs to manufacture a previous release.

## People

Role descriptions are recommended responsibilities, not assignments or grants.

| Responsibility | Named accountable person/team | Assignment reference |
| --- | --- | --- |
| Operations lead — coordinates target and category owners | PENDING | PENDING |
| Release manager — binds reviewed source commit and deployment IDs | PENDING | PENDING |
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
