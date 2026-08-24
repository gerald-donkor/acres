import { Module } from '@nestjs/common';
import { AcresConfigModule } from '../config/config.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { ScannerModule } from '../scanner/scanner.module';
import { StorageModule } from '../storage/storage.module';
import { UploadWorkerService } from './upload-worker.service';

@Module({
  imports: [
    AcresConfigModule,
    PrismaModule,
    OutboxModule,
    QueueModule,
    ScannerModule,
    StorageModule,
    IngestionModule,
  ],
  providers: [UploadWorkerService],
})
export class WorkerModule {}
