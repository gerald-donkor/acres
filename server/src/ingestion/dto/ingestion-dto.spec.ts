import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateDatasetDto } from './create-dataset.dto';
import { CreateMappingDto } from './create-mapping.dto';
import { StartIngestionRunDto } from './start-ingestion-run.dto';
import { UpdateDatasetDto } from './update-dataset.dto';

describe('Ingestion DTOs validation', () => {
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

  const validUuid1 = '018f0000-0000-7000-8000-000000000001';
  const validUuid2 = '018f0000-0000-7000-8000-000000000002';

  describe('CreateDatasetDto and UpdateDatasetDto', () => {
    it('accepts valid dataset create payload with metadata', async () => {
      const result = await transformDto(CreateDatasetDto, {
        name: 'Regional Housing Census',
        description: 'Quarterly census data',
        sourceMetadata: { source: 'census-bureau', year: 2026 },
      });
      expect(result).toBeInstanceOf(CreateDatasetDto);
      expect(result.name).toBe('Regional Housing Census');
      expect(result.description).toBe('Quarterly census data');
      expect(result.sourceMetadata).toEqual({
        source: 'census-bureau',
        year: 2026,
      });
    });

    it('rejects name exceeding 160 characters', async () => {
      await expect(
        pipe.transform(
          { name: 'A'.repeat(161) },
          { type: 'body', metatype: CreateDatasetDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts partial update in UpdateDatasetDto', async () => {
      const result = await transformDto(UpdateDatasetDto, {
        name: 'Updated Name',
        description: 'Updated description',
        sourceMetadata: { updated: true },
      });
      expect(result).toBeInstanceOf(UpdateDatasetDto);
      expect(result.name).toBe('Updated Name');
      expect(result.description).toBe('Updated description');
      expect(result.sourceMetadata).toEqual({ updated: true });
    });

    it('rejects non-object sourceMetadata', async () => {
      await expect(
        pipe.transform(
          { name: 'Valid Name', sourceMetadata: 'not-an-object' },
          { type: 'body', metatype: CreateDatasetDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('CreateMappingDto', () => {
    it('accepts valid mapping specification with UUID uploadId', async () => {
      const mapping = {
        regionColumn: 'region_code',
        periodColumn: 'year',
        valueColumns: ['housing_units'],
      };
      const result = await transformDto(CreateMappingDto, {
        uploadId: validUuid1,
        mapping,
      });
      expect(result).toBeInstanceOf(CreateMappingDto);
      expect(result.uploadId).toBe(validUuid1);
      expect(result.mapping).toEqual(mapping);
    });

    it('rejects non-UUID uploadId or missing mapping', async () => {
      await expect(
        pipe.transform(
          { uploadId: 'invalid-uuid', mapping: {} },
          { type: 'body', metatype: CreateMappingDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { uploadId: validUuid1 },
          { type: 'body', metatype: CreateMappingDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('StartIngestionRunDto', () => {
    it('accepts valid uploadId and mappingId UUIDs', async () => {
      const result = await transformDto(StartIngestionRunDto, {
        uploadId: validUuid1,
        mappingId: validUuid2,
      });
      expect(result).toBeInstanceOf(StartIngestionRunDto);
      expect(result.uploadId).toBe(validUuid1);
      expect(result.mappingId).toBe(validUuid2);
    });

    it('rejects invalid UUIDs', async () => {
      await expect(
        pipe.transform(
          { uploadId: validUuid1, mappingId: 'not-a-uuid' },
          { type: 'body', metatype: StartIngestionRunDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
