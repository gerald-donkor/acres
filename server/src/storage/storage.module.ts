import { Module } from '@nestjs/common';
import { OBJECT_STORAGE } from './storage.port';
import { S3ObjectStorageAdapter } from './s3-object-storage.adapter';

@Module({
  providers: [
    S3ObjectStorageAdapter,
    { provide: OBJECT_STORAGE, useExisting: S3ObjectStorageAdapter },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
