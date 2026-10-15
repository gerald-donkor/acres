import { Module } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import { OBJECT_STORAGE, type ObjectStoragePort } from './storage.port';
import { S3ObjectStorageAdapter } from './s3-object-storage.adapter';
import { VercelBlobStorageAdapter } from './vercel-blob-storage.adapter';

@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [AcresConfigService],
      // Only the selected adapter is constructed: the Blob profile never builds
      // an S3 client, and the S3 profile never calls the Blob SDK.
      useFactory: (config: AcresConfigService): ObjectStoragePort =>
        config.storageProvider === 'vercel-blob'
          ? new VercelBlobStorageAdapter(config)
          : new S3ObjectStorageAdapter(config),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
