import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CompleteUploadDto } from './complete-upload.dto';
import { InitiateUploadDto } from './initiate-upload.dto';

describe('Uploads DTOs validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });

  async function transformDto<T>(
    metatype: new () => T,
    value: unknown,
    type: 'body' | 'query' | 'param' = 'body',
  ): Promise<T> {
    const result: unknown = await pipe.transform(value, { type, metatype });
    return result as T;
  }

  const validChecksum =
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  describe('InitiateUploadDto', () => {
    it('accepts valid initiate upload payload for all supported media types', async () => {
      const mediaTypes = [
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/geo+json',
        'application/json',
      ];

      for (const mediaType of mediaTypes) {
        const result = await transformDto(InitiateUploadDto, {
          filename: 'dataset.csv',
          mediaType,
          byteCount: 1024,
          checksumHex: validChecksum,
        });
        expect(result).toBeInstanceOf(InitiateUploadDto);
        expect(result.mediaType).toBe(mediaType);
        expect(result.byteCount).toBe(1024);
      }
    });

    it('accepts initiate upload without optional checksum', async () => {
      const result = await transformDto(InitiateUploadDto, {
        filename: 'dataset.csv',
        mediaType: 'text/csv',
        byteCount: 2048,
      });
      expect(result).toBeInstanceOf(InitiateUploadDto);
      expect(result.checksumHex).toBeUndefined();
    });

    it('rejects unsupported media types', async () => {
      await expect(
        pipe.transform(
          {
            filename: 'malicious.exe',
            mediaType: 'application/x-msdownload',
            byteCount: 1024,
          },
          { type: 'body', metatype: InitiateUploadDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects byteCount below 1 or above 50MB limit', async () => {
      await expect(
        pipe.transform(
          {
            filename: 'zero.csv',
            mediaType: 'text/csv',
            byteCount: 0,
          },
          { type: 'body', metatype: InitiateUploadDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          {
            filename: 'too-big.csv',
            mediaType: 'text/csv',
            byteCount: 52_428_801,
          },
          { type: 'body', metatype: InitiateUploadDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects malformed checksumHex', async () => {
      await expect(
        pipe.transform(
          {
            filename: 'bad-hash.csv',
            mediaType: 'text/csv',
            byteCount: 100,
            checksumHex: 'not-a-sha256-hex',
          },
          { type: 'body', metatype: InitiateUploadDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('CompleteUploadDto', () => {
    it('accepts valid complete upload payload', async () => {
      const result = await transformDto(CompleteUploadDto, {
        byteCount: 4096,
        checksumHex: validChecksum,
      });
      expect(result).toBeInstanceOf(CompleteUploadDto);
      expect(result.byteCount).toBe(4096);
      expect(result.checksumHex).toBe(validChecksum);
    });

    it('rejects missing or invalid checksumHex', async () => {
      await expect(
        pipe.transform(
          { byteCount: 4096 },
          { type: 'body', metatype: CompleteUploadDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { byteCount: 4096, checksumHex: 'too-short' },
          { type: 'body', metatype: CompleteUploadDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
