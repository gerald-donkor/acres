import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { QueueClient } from '@vercel/queue';
import { AcresConfigService } from '../config/acres-config.service';
import { LeasedJobExecutorService } from '../worker/leased-job-executor.service';
import { createQueueConsumer } from './queue-consumer';

/**
 * Checks whether an incoming HTTP request matches the CloudEvents / Vercel Queues
 * delivery signature or warmup prime.
 */
export function isVercelQueueRequest(req: Request): boolean {
  if (req.method !== 'POST') return false;
  const path = req.path || req.url || '';
  if (
    path.startsWith('/api') ||
    (typeof req.originalUrl === 'string' && req.originalUrl.startsWith('/api'))
  ) {
    return false;
  }
  const ceType = req.headers['ce-type'];
  const prime = req.headers['x-vercel-queue-prime'];
  const contentType = req.headers['content-type'];
  return (
    typeof ceType === 'string' ||
    typeof prime === 'string' ||
    (typeof contentType === 'string' &&
      contentType.includes('application/cloudevents'))
  );
}

export function createVercelQueueMiddleware(
  app: INestApplication,
  queueClient?: QueueClient,
): (req: Request, res: Response, next: NextFunction) => void {
  const config = app.get(AcresConfigService);
  if (config.queueProvider !== 'vercel') {
    return (_req, _res, next) => next();
  }

  const executor = app.get(LeasedJobExecutorService);
  const logger = new Logger('VercelQueueConsumer');
  const consumer = createQueueConsumer(
    () =>
      Promise.resolve({
        execute: (message) => executor.execute(message),
        backoffMs: config.queueBackoffMs,
      }),
    logger,
  );

  const client =
    queueClient ??
    new QueueClient({
      region: 'iad1',
      ...(process.env.VERCEL_DEPLOYMENT_ID ? {} : { deploymentId: null }),
    });

  const handler = client.handleNodeCallback(consumer.handle, {
    retry: consumer.retry,
  });

  return (req, res, next) => {
    if (isVercelQueueRequest(req)) {
      handler(req, res).catch((error) => {
        logger.error(
          `Queue callback uncaught failure: ${error instanceof Error ? error.stack : String(error)}`,
        );
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to process queue message' });
        }
      });
      return;
    }
    next();
  };
}
