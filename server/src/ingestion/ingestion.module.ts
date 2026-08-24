import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { IngestionController } from './ingestion.controller';
import { IngestionProcessorService } from './ingestion-processor.service';
import { IngestionService } from './ingestion.service';
import { SourceParserService } from './parsers/source-parser.service';

@Module({
  imports: [
    PrismaModule,
    IdempotencyModule,
    QueueModule,
    StorageModule,
    AnalyticsModule,
  ],
  controllers: [IngestionController],
  providers: [IngestionService, IngestionProcessorService, SourceParserService],
  exports: [IngestionProcessorService],
})
export class IngestionModule {}
