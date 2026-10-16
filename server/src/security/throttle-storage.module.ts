import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PostgresThrottlerStorage } from './postgres-throttler.storage';

/** Persistence only: importing this never mounts guards, controllers or timers. */
@Module({
  imports: [PrismaModule],
  providers: [PostgresThrottlerStorage],
  exports: [PostgresThrottlerStorage],
})
export class ThrottleStorageModule {}
