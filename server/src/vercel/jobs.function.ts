import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { QueueClient } from '@vercel/queue';
import { createRuntimeResolver } from './jobs-runtime';
import { createQueueConsumer } from './queue-consumer';
import { VercelJobsModule } from './vercel-jobs.module';

/**
 * Vercel queue/v2beta consumer entrypoint (wired by the deployment config with
 * an `experimentalTriggers` entry, no `maxDeliveries` and no public rewrite).
 * It never calls `listen()` and starts no timers or listeners. `abortOnError`
 * is off so a failed boot rejects (and is retried) instead of aborting the
 * instance.
 */
const consumer = createQueueConsumer(
  createRuntimeResolver(() =>
    NestFactory.createApplicationContext(VercelJobsModule, {
      abortOnError: false,
    }),
  ),
);

export const POST = new QueueClient().handleCallback(consumer.handle, {
  retry: consumer.retry,
});
