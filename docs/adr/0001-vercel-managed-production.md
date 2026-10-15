# ADR 0001 — Vercel-managed production target

Status: accepted target by the user in Prompt 370; hosted capability gates open.
Date: 2026-10-15.

## Context

Acres currently implements the Compose/Caddy reference profile. The user
selected Vercel compute and routing, private Blob, durable invocations and Cron,
with Neon/PostGIS and Resend provisioned through Vercel Marketplace. These
providers remain external processors. The reference profile remains supported.
The existing architecture decisions live in `docs/system-architecture.md`;
this is the first standalone ADR, not a retroactive renumbering of those decisions.

## Decision

Retain the Nest modular monolith, Prisma adapter-pg, database sessions, forced
RLS and durable outbox/job ledger. Replace infrastructure through ports without
reducing V1 behavior. Prefer one Vercel project with Next/API/job services if
account capabilities and isolated delivery proofs establish compatibility.
Services are documented in Beta; the selected account is not yet inspected.
Do not choose separate projects or commit active routing on an assumption.

Broad provider wiring depends on real synthetic-data proofs: pooled Neon RLS
and migrations, authenticated private Blob browser upload, fail-closed Sandbox
ClamAV scanning and isolated authenticated queue delivery/retry. An SDK install,
unit test or provider documentation cannot clear a hosted proof. No scanner
bypass, public quarantine, perpetual Sandbox daemon or external compute fallback.

## Consequences and implementation

Invocation processing must be separable from the BullMQ listener/timers.
Progress must survive stream expiry. Resend may reuse current templates behind
the mail port. These local preparations can proceed without provisioning.
Managed provider activation, ingress, shared throttling, Cron and job callbacks
remain gated by the selected topology and live proofs. Database migrations
remain explicit and use a direct migrator identity; runtime uses a bounded
pooled least-privilege connection with transaction-local tenant context.

The eleven launch responsibilities remain mandatory. Managed evidence needs
an explicit topology/version contract; old Compose evidence cannot approve the
new target. Recovery, retention, observability and rollback require actual
account-bound measurements and sign-off. No-AI production remains mandatory.

## Rollback

Local preparatory changes are reversible with ordinary Git revert. No schema
or hosted data migration is performed by this decision. Future hosted rollback
must bind immutable deployment and job versions and preserve the durable ledger;
first-deployment recovery must be resolved rather than inventing an older release.

## References

- [Approved scope](../../prompts/370-vercel-managed-migration-and-deployment.md)
- [Implementation and proof record](../vercel-deployment.md)
- [Vercel Services](https://vercel.com/docs/services), checked 2026-10-15
- [Nest deployment](https://vercel.com/docs/frameworks/backend/nestjs), checked 2026-10-15
