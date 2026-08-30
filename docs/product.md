# Acres product definition

Status: canonical target product definition, approved 2026-08-23. This file
describes what Acres is meant to become; it does not claim that every target
application surface exists today. Current implementation evidence lives in
[`landing.md`](landing.md), [`backend.md`](backend.md), and
[`authenticated-app.md`](authenticated-app.md).

## Geography-provider decision — accepted 2026-08-30

geoBoundaries `gbOpen` is the first global administrative-boundary baseline.
Its global standardized coverage and CC BY 4.0 attribution model were preferred
to GADM's non-commercial restriction and OSM's broader ODbL database
obligations. This does not make it politically or legally authoritative for
every jurisdiction. Acres retains a provider seam for later jurisdictional
authoritative sources and preserves per-layer original-source and licence facts.

## 1. Product job

Acres is a B2B regional-data analytics SaaS. Its job is to turn unreadable
regional data into evidence a team can browse, compare, explain, and act on.
The product accepts organization-owned source data, preserves where it came
from, turns it into consistent regional observations, and lets authorized
people build dashboards, reports, and exports from those observations.

The current marketing site already promises browsing, comparing, reporting,
and understanding regional data. Its example device values are illustrative,
not a live dataset or a product contract. The target application specified here
is a user-approved product decision made on 2026-08-23.

“100% FREE” means that Acres' core software stack is free/open source and can
be self-hosted. It does not mean that hardware, storage, domains, networking,
backups, SMTP delivery, maintenance, or operator time have no cost.

## 2. People, roles, and permissions

An account can belong to several organizations. A membership has exactly one
organization-local role. The fixed role ladder is:

| role | purpose | representative permissions |
| --- | --- | --- |
| `owner` | Tenant lifecycle and ultimate access control | Everything an admin can do, plus transfer ownership and destructive organization lifecycle decisions |
| `admin` | Membership, datasets, configuration, and governance | Invite/revoke members within policy, configure organization settings, manage datasets, publish governed work |
| `analyst` | Import, validate, model, explore, and author | Upload and map data, resolve validation issues, create dashboards, draft reports, request exports |
| `viewer` | Consume approved work | Browse published dashboards and reports and export only where permission permits |

These names are now implemented for the organization administration surface in
`server/src/organizations/permissions.ts`. Permissions are the contract: a
centralized policy maps a role to allowed actions, and controllers, resolvers,
workers, and UI affordances call that policy. String comparisons scattered
through transports are prohibited. The server remains authoritative; hiding an
action in the client is only a usability measure.

Current implemented permissions are `organization.read`,
`organization.update`, `members.read`, `members.invite`,
`members.change_role`, `members.revoke`, `ownership.transfer`,
`invitations.read`, `invitations.revoke`, `audit.read`, `uploads.read`,
`uploads.create`, `datasets.read`, `datasets.create`, `datasets.update`,
`ingestion.read`, `ingestion.run`, `ingestion.cancel`, `analytics.read`,
`dashboards.manage`, `reports.read`, `reports.create`, `reports.update`,
`reports.publish`, `exports.create`, and `exports.read`.
`owner` has all of them; `admin` can manage organization administration,
uploads, datasets, ingestion, analytics reads, dashboards, reports, publishing,
and exports; `analyst` can upload, create/update datasets, run/cancel
ingestion, read analytics, manage dashboards, draft/update reports, and request
exports, but cannot publish reports; `viewer` can read organizations, uploads,
datasets, ingestion status, analytics, reports, and export metadata/downloads.
Generic role updates and invitations cannot assign `owner`.

Organization ownership has these invariants:

- an organization always has at least one owner;
- the last owner cannot be removed or demoted;
- ownership transfer is explicit, authorized, and audited;
- membership revocation takes effect for subsequent product requests even when
  the account session itself remains valid;
- every product request selects an organization the account may access.

Custom roles, SSO/SAML, SCIM, and externally managed identity are deferred.

## 3. Core journeys

### 3.1 Create or join an organization

An authenticated account creates an organization or accepts a single-use,
expiring invitation. The app establishes an active organization context and
shows only organizations the account can access. Owners and admins manage
members under the permission and last-owner rules.

### 3.2 Upload and validate a dataset

An analyst initiates an upload for CSV, XLSX, or GeoJSON. The browser sends the
file to an organization-scoped quarantine object, then completes the upload.
Acres checks its checksum and type, scans it, inspects its structure, and
reports validation issues without publishing partial analytics.

### 3.3 Map fields and regions

The analyst maps source columns to typed measures, time periods, dimensions,
and regions. Region matching uses stable codes and reviewed aliases against a
global, arbitrary-depth administrative hierarchy. Ambiguous and unmatched rows
stay visible and resolvable; Acres does not silently guess.

### 3.4 Publish an immutable dataset version

After validation, normalized rows and quality results are committed as an
immutable dataset version. Publishing makes that version available to
analytics. A correction creates another version; it does not mutate the source
history behind an existing report.

### 3.5 Browse regional metrics

An authorized member filters and compares metric observations across regions,
periods, and approved dimensions. Every presented value retains its definition,
unit, quality state, source dataset version, and stable evidence identity.

### 3.6 Save a view or dashboard

An analyst saves a query/view configuration and composes dashboards from
defined metrics. A saved view stores the selection and presentation intent, not
an opaque copy of untraceable numbers.

### 3.7 Draft and publish a report

An analyst creates a report revision from saved evidence. Insights may be
written by a person or proposed by optional AI (Phase 11A assistive draft
preview with mandatory user disclosure and acknowledgment), but remain drafts
until a permitted person publishes them. Published revisions are reproducible
from immutable evidence identities.

### 3.8 Export evidence

Where permitted, a member requests an export. The export is an asynchronous,
auditable artifact tied to the requesting organization and source versions.
Spreadsheet-capable output escapes formulas and downloads as an attachment.

### 3.9 Inspect job and audit history

Authorized members see ingestion/export progress and outcomes. Administrators
can inspect security- and governance-relevant audit events without gaining a
path to alter their historical meaning.

## 4. Version-one boundary

V1 includes:

- account sessions, organization membership, invitations, and the four fixed
  roles;
- CSV, XLSX, and GeoJSON organization uploads;
- a shared global administrative-region hierarchy with geospatial boundaries;
- immutable dataset versions, validation, normalized observations, quality
  flags, and deterministic aggregate metrics;
- read-heavy regional exploration through dashboards and saved views;
- versioned report revisions, evidence links, and asynchronous exports;
- auditable background jobs and an operationally recoverable self-hosted
  deployment;
- a complete no-AI path; the Phase 11A evidence-constrained assistive drafting
  preview is implemented as an optional, disabled-by-default preview using the
  unpaid Gemini Developer API with mandatory disclosure/acknowledgment. It is
  excluded from the production launch profile and is not a launch entitlement.

V1 explicitly excludes:

- a paid billing provider or invented price plans;
- a data or extension marketplace;
- customer-defined code or plugin execution;
- a public-data connector without a named provider, approved data license, and
  adapter review;
- a native mobile application;
- autonomous AI actions, AI-authored authoritative metrics, or AI publication;
- custom roles, enterprise federation, public anonymous dashboards, and a
  general-purpose GIS editor.

An optional entitlement boundary may represent feature availability without a
billing provider. It must not imply payment processing or a commercial plan.

## 5. Data classification

| class | examples | handling baseline |
| --- | --- | --- |
| Public reference geography | Region names, stable external codes, published administrative boundaries | Shared globally; provenance and license recorded; integrity and update governance required |
| Organization business data | Uploaded rows, dataset versions, mappings, observations, dashboards, reports, exports | Tenant-confidential by default; repository scope and RLS; TLS in transit; production volume-encryption gate for live storage; auditable lifecycle |
| Account and contact PII | Email, display name, contact-form contents, membership/invitation details | Minimize collection and exposure; authorization, retention decision, redacted logs, deletion workflow |
| Credentials and secrets | Password hashes, session tokens, CSRF/signing secrets, database/storage/SMTP credentials | Never client-visible or logged; least-privilege injection; rotation and incident procedure |
| Audit and security data | Audit events, auth failures, request/job IDs, security findings | Access restricted; append-oriented integrity; retention and export decisions; no raw secrets |
| Optional AI prompts and outputs | Evidence excerpts, versioned prompt, draft insight, evaluation result | Tenant-bound and disabled by default; minimize evidence; avoid raw prompt logging; human publication decision |

The exact retention period for each class is not selected here. The operator
and business owner must approve retention, deletion, legal-hold, and backup
interaction before launch.

## 6. Behavioral success criteria

Acres is successful when the implementation can demonstrate all of these
behaviors without relying on invented market metrics:

- **Tenant isolation:** attempts to read or mutate another organization's data
  fail through repositories, REST, GraphQL, exports, relations, and jobs.
- **Repeatable imports:** the same source, mapping, and code version produces a
  traceable result; retries do not duplicate published data.
- **Traceable metrics:** a displayed value resolves to its metric definition,
  unit, time period, quality state, immutable dataset version, and source.
- **Reproducible reports:** a published revision retains stable evidence links
  and is not changed by later dataset or draft edits.
- **Usable no-AI path:** every browse, analysis, report, and export journey
  works when AI is disabled or unavailable.
- **Accessible client journeys:** primary tasks meet WCAG 2.2 AA-oriented
  semantics, focus, keyboard, screen-reader, contrast, and error-feedback
  acceptance tests.
- **Observable and recoverable operations:** operators can distinguish
  liveness from dependency readiness, diagnose failed jobs without sensitive
  payloads in logs, restore authoritative state, and reconcile storage/queue
  side effects.

No user-count goal, latency SLO, RPO/RTO, compliance certification, upload
limit, or audit-retention number is asserted. Those need measured operational
or business input and must be set before the affected launch gate.

## 7. Open product decisions

The following decisions deliberately remain open:

- organization and account deletion semantics, grace periods, and export
  obligations;
- invitation, reset-token, session, audit, upload, rejected-object, export, and
  backup retention periods;
- upload byte/row/column limits and supported XLSX/GeoJSON subfeatures;
- performance SLOs, availability targets, RPO/RTO, and supported tenant scale;
- geography data providers, refresh cadence, redistribution rights, and source
  precedence;
- dashboard sharing/publishing rules and whether external viewers ever exist;
- exact entitlements, if any, and any future billing model;
- production SMTP provider and abuse/complaint handling;
- optional AI production profile: the unpaid Gemini Developer API preview is not approved for production launch; any future production AI enablement requires a separate decision regarding a paid, private, or local runtime, data processing agreements, and commercial terms;
- any regulatory or contractual obligations for launch markets.

These are not implementation-agent defaults. A phase that needs one must obtain
real input, record the decision, and update the owning document.

## 8. Glossary

| term | meaning |
| --- | --- |
| Organization | The tenant and primary authorization/data-isolation boundary |
| Member | An account's organization-local membership and role |
| Region | A globally shared administrative area in an arbitrary-depth hierarchy |
| Dataset | An organization-owned logical collection with one or more immutable versions |
| Dataset version | An immutable successfully published snapshot with source, mapping, schema, calculation, and quality lineage; failed attempts remain ingestion runs |
| Mapping | Versioned instructions that translate source fields/regions into Acres concepts |
| Observation | A typed metric value for a region, period, unit, and approved dimensions |
| Metric definition | The stable semantic definition, type, unit, and aggregation rules for observations |
| Dashboard | An organization-owned composition of saved analytical views |
| Saved view | A reusable, version-aware query and presentation configuration |
| Report | A governed publication whose content changes through explicit revisions |
| Report revision | An immutable snapshot of a report draft or published state |
| Insight | A human-authored or AI-proposed narrative statement within a report revision |
| Evidence | Stable links from a claim to immutable dataset/version/observation identities |
| Ingestion run | The observable state and attempts for staged dataset processing |
| Export | An asynchronous, permission-checked generated artifact |
| Audit event | An append-oriented record of a security- or governance-relevant action |
