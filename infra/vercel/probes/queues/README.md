# Vercel Queues layout probe

Synthetic, opt-in probe for Prompt 370's durable-execution gate. It is not
application code and is never bundled into Acres. Results are recorded in
[the migration record](../../../../docs/vercel-deployment.md).

## What it answers

- Can a plain Node service (no framework) host a `queue/v2beta` trigger, and can
  two services share one root? (`producer` and `jobs` both use `svc/`.)
- Does a published message reach only the publishing deployment's consumer?
- Duplicate publish (same `idempotencyKey`), thrown-error retry, a lost instance
  (`process.exit`) and the retry callback's acknowledgement after a budget.
- Is the consumer reachable by a forged public POST?

The producer publishes only `{ probeId, mode }`; the consumer logs one
`ACRES_QUEUE_PROBE` JSON line per delivery and reads no project secrets.

## Run

1. Generate `ACRES_QUEUE_PROBE_SECRET` (32+ chars) into the restricted
   `~/.config/acres/vercel-preview/queue-probe.env` (mode 0600) and add it to the
   project as a **sensitive** variable. Without it every publish returns 404:
   the production alias is public, so the producer fails closed.
2. Deploy from this directory with `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` set to
   the selected team/project: `npx vercel@64.1.0 deploy --yes`. **A project's
   first deployment is promoted to production even without `--prod`.**
3. Call `/probe/send?mode=ok|fail-once|crash-once|always-fail[&copies=3]` through
   `vercel curl` with the secret header read from a 0600 header file
   (`-H @file`), so the secret never appears in arguments or output. The CLI
   creates the project's "Protection Bypass for Automation" secret if none
   exists; revoke it in Settings → Deployment Protection when no longer needed.
4. Read results with runtime logs filtered on `ACRES_QUEUE_PROBE`.

Delete probe deployments once the evidence is recorded; pending messages then
expire unconsumed (the retention here is one hour).
