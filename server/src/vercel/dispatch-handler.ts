import { createHash, timingSafeEqual } from 'node:crypto';
import type { Logger } from '@nestjs/common';
import { isUsableCronSecret } from '../config/env.validation';
import type { ManagedSweepResult } from '../outbox/managed-dispatch-runner.service';

export interface DispatchRuntime {
  sweep(): Promise<ManagedSweepResult>;
}

export function createDispatchHandler(deps: {
  resolveRuntime: () => Promise<DispatchRuntime>;
  readSecret: () => string | undefined;
  logger?: Pick<Logger, 'log' | 'error' | 'warn'>;
}): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    };

    const secret = deps.readSecret();
    if (!isUsableCronSecret(secret)) {
      deps.logger?.error('Dispatch cron secret is not configured or unusable.');
      return new Response(
        JSON.stringify({ ok: false, error: 'dispatch_unavailable' }),
        { status: 503, headers },
      );
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: 'unauthorized' }),
        { status: 401, headers },
      );
    }

    const expected = `Bearer ${secret}`;
    const authDigest = createHash('sha256').update(authHeader).digest();
    const expectedDigest = createHash('sha256').update(expected).digest();

    if (!timingSafeEqual(authDigest, expectedDigest)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'unauthorized' }),
        { status: 401, headers },
      );
    }

    let runtime: DispatchRuntime;
    try {
      runtime = await deps.resolveRuntime();
    } catch {
      deps.logger?.error('Dispatch runtime resolution failed.');
      return new Response(
        JSON.stringify({ ok: false, error: 'dispatch_unavailable' }),
        { status: 503, headers },
      );
    }

    let sweepResult: ManagedSweepResult;
    try {
      sweepResult = await runtime.sweep();
    } catch {
      deps.logger?.error('Managed outbox dispatch sweep failed.');
      return new Response(
        JSON.stringify({ ok: false, error: 'dispatch_failed' }),
        { status: 500, headers },
      );
    }

    const rawSchedule = request.headers.get('x-vercel-cron-schedule');
    const schedule = rawSchedule ? rawSchedule.slice(0, 64) : '';
    deps.logger?.log(
      `Managed outbox sweep completed: passes=${sweepResult.passes} stoppedBy=${sweepResult.stoppedBy} ` +
        `dispatched=${sweepResult.dispatch.dispatched} rearmed=${sweepResult.reconciliation.rearmed}` +
        (schedule ? ` schedule=${schedule}` : ''),
    );

    return new Response(
      JSON.stringify({
        ok: true,
        passes: sweepResult.passes,
        stoppedBy: sweepResult.stoppedBy,
        reconciliation: sweepResult.reconciliation,
        dispatch: sweepResult.dispatch,
      }),
      { status: 200, headers },
    );
  };
}
