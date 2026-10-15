import { Test } from '@nestjs/testing';
import { S3Client } from '@aws-sdk/client-s3';
import * as blob from '@vercel/blob';
import { AcresConfigService } from '../config/acres-config.service';
import { S3ObjectStorageAdapter } from './s3-object-storage.adapter';
import { StorageModule } from './storage.module';
import { OBJECT_STORAGE } from './storage.port';
import { VercelBlobStorageAdapter } from './vercel-blob-storage.adapter';

jest.mock('@aws-sdk/client-s3', () => {
  const actual =
    jest.requireActual<typeof import('@aws-sdk/client-s3')>(
      '@aws-sdk/client-s3',
    );
  return { ...actual, S3Client: jest.fn() };
});
jest.mock('@vercel/blob');

const config = {
  storageEndpoint: 'http://localhost:3900',
  storageRegion: 'garage',
  storageForcePathStyle: true,
  storageAccessKeyId: 'k',
  storageSecretAccessKey: 's',
};

async function resolveStorage(storageProvider: 's3' | 'vercel-blob') {
  const moduleRef = await Test.createTestingModule({
    imports: [
      {
        module: class ConfigStubModule {},
        global: true,
        providers: [
          {
            provide: AcresConfigService,
            useValue: { ...config, storageProvider },
          },
        ],
        exports: [AcresConfigService],
      },
      StorageModule,
    ],
  }).compile();
  const storage = moduleRef.get<unknown>(OBJECT_STORAGE);
  await moduleRef.close();
  return storage;
}

describe('StorageModule provider selection', () => {
  const S3ClientMock = jest.mocked(S3Client);

  beforeEach(() => jest.clearAllMocks());

  it('keeps the S3 adapter by default and never touches the Blob SDK', async () => {
    await expect(resolveStorage('s3')).resolves.toBeInstanceOf(
      S3ObjectStorageAdapter,
    );
    expect(S3ClientMock).toHaveBeenCalledTimes(1);
    for (const fn of [blob.head, blob.get, blob.put, blob.issueSignedToken]) {
      expect(jest.mocked(fn)).not.toHaveBeenCalled();
    }
  });

  it('selects Vercel Blob without building an S3 client', async () => {
    await expect(resolveStorage('vercel-blob')).resolves.toBeInstanceOf(
      VercelBlobStorageAdapter,
    );
    expect(S3ClientMock).not.toHaveBeenCalled();
  });
});
