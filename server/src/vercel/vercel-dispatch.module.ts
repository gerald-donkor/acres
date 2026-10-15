import { Module } from '@nestjs/common';
import { AcresWorkerConfigModule } from '../config/config.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';

/**
 * Lean module for the Vercel Cron dispatch endpoint.
 * Imports only what OutboxModule requires: configuration, Prisma persistence,
 * and Queue port/adapters. No feature controllers, SessionsModule, MetricsModule,
 * ScheduleModule, or listen() are mounted.
 */
@Module({
  imports: [AcresWorkerConfigModule, PrismaModule, QueueModule, OutboxModule],
})
export class VercelDispatchModule {}
