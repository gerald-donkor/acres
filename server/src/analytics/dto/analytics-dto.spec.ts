import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AnalyticsAggregateQueryDto } from './analytics-aggregate-query.dto';
import { AnalyticsObservationQueryDto } from './analytics-observation-query.dto';
import { AggregateParamDto, MetricParamDto } from './analytics-param.dto';

describe('Analytics DTOs validation', () => {
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

  const validUuid = '018f0000-0000-7000-8000-000000000001';
  const validHash =
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  describe('MetricParamDto and AggregateParamDto', () => {
    it('accepts valid UUID metricId', async () => {
      const result = await transformDto(
        MetricParamDto,
        { metricId: validUuid },
        'param',
      );
      expect(result).toBeInstanceOf(MetricParamDto);
      expect(result.metricId).toBe(validUuid);
    });

    it('rejects non-UUID metricId', async () => {
      await expect(
        pipe.transform(
          { metricId: 'not-a-uuid' },
          { type: 'param', metatype: MetricParamDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts valid UUID aggregateId', async () => {
      const result = await transformDto(
        AggregateParamDto,
        { aggregateId: validUuid },
        'param',
      );
      expect(result).toBeInstanceOf(AggregateParamDto);
      expect(result.aggregateId).toBe(validUuid);
    });
  });

  describe('AnalyticsObservationQueryDto and AnalyticsAggregateQueryDto', () => {
    it('accepts empty query and sets default limit', async () => {
      const result = await transformDto(
        AnalyticsObservationQueryDto,
        {},
        'query',
      );
      expect(result).toBeInstanceOf(AnalyticsObservationQueryDto);
      expect(result.limit).toBe(50);
    });

    it('accepts complete filtered query with coerced limit and ISO8601 timestamps', async () => {
      const result = await transformDto(
        AnalyticsObservationQueryDto,
        {
          metricId: validUuid,
          regionId: validUuid,
          datasetVersionId: validUuid,
          dimensionHash: validHash,
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-03-31T23:59:59.999Z',
          limit: '25',
        },
        'query',
      );
      expect(result).toBeInstanceOf(AnalyticsObservationQueryDto);
      expect(result.metricId).toBe(validUuid);
      expect(result.limit).toBe(25);
    });

    it('works identically for AnalyticsAggregateQueryDto', async () => {
      const result = await transformDto(
        AnalyticsAggregateQueryDto,
        { limit: '10' },
        'query',
      );
      expect(result).toBeInstanceOf(AnalyticsAggregateQueryDto);
      expect(result.limit).toBe(10);
    });

    it('rejects limit exceeding 100 or below 1', async () => {
      await expect(
        pipe.transform(
          { limit: '0' },
          { type: 'query', metatype: AnalyticsObservationQueryDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { limit: '101' },
          { type: 'query', metatype: AnalyticsObservationQueryDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects malformed dimensionHash and invalid dates', async () => {
      await expect(
        pipe.transform(
          { dimensionHash: 'not-a-64-char-hash' },
          { type: 'query', metatype: AnalyticsObservationQueryDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { periodStart: 'not-a-date' },
          { type: 'query', metatype: AnalyticsObservationQueryDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
