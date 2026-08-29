import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AcresConfigService } from '../config/acres-config.service';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { IngestionController } from './ingestion.controller';
import { IngestionProcessorService } from './ingestion-processor.service';
import { IngestionService } from './ingestion.service';
import { ChildProcessParserExecutor } from './parsers/child-process-parser.executor';
import { PARSER_EXECUTOR } from './parsers/parser-executor.port';
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
  providers: [
    IngestionService,
    IngestionProcessorService,
    SourceParserService,
    {
      provide: PARSER_EXECUTOR,
      useFactory: (config: AcresConfigService) => {
        return new ChildProcessParserExecutor({
          timeoutMs: config.parserChildTimeoutMs,
          maxOldSpaceMb: config.parserChildMaxOldSpaceMb,
          nodeEnv: config.nodeEnv,
        });
      },
      inject: [AcresConfigService],
    },
  ],
  exports: [IngestionProcessorService, SourceParserService, PARSER_EXECUTOR],
})
export class IngestionModule {}
