import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createDispatchHandler } from './dispatch-handler';
import { createDispatchRuntimeResolver } from './dispatch-runtime';
import { VercelDispatchModule } from './vercel-dispatch.module';

/**
 * Vercel Cron function entrypoint for protected managed outbox dispatch.
 * Exporting ONLY GET (Vercel Cron issues GET).
 *
 * NOTE: Not yet referenced by any deployment config; the next sub-prompt adds
 * it to the Services/functions config with explicit region `iad1`, a `maxDuration`
 * ≥ SWEEP_BUDGET_MS + boot headroom, and a daily `crons` entry on Hobby;
 * with no public rewrite other than the Cron path.
 */
const resolveRuntime = createDispatchRuntimeResolver(() =>
  NestFactory.createApplicationContext(VercelDispatchModule, {
    abortOnError: false,
  }),
);

export const GET = createDispatchHandler({
  resolveRuntime,
  readSecret: () => process.env.CRON_SECRET,
});
