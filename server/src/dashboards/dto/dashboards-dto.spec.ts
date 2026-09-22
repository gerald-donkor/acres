import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  CreateDashboardViewDto,
  DashboardFiltersDto,
  DashboardPresentationDto,
  UpdateDashboardViewDto,
} from './dashboard-view.dto';

describe('Dashboards DTOs validation', () => {
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

  describe('DashboardFiltersDto and DashboardPresentationDto', () => {
    it('accepts valid filters and presentation options', async () => {
      const filters = await transformDto(DashboardFiltersDto, {
        metricId: validUuid,
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-03-31T23:59:59.999Z',
      });
      expect(filters).toBeInstanceOf(DashboardFiltersDto);
      expect(filters.metricId).toBe(validUuid);

      for (const chart of ['bar', 'line', 'table'] as const) {
        const presentation = await transformDto(DashboardPresentationDto, {
          chart,
          compareBy: 'region',
        });
        expect(presentation).toBeInstanceOf(DashboardPresentationDto);
        expect(presentation.chart).toBe(chart);
        expect(presentation.compareBy).toBe('region');
      }
    });

    it('rejects unsupported chart or compareBy values', async () => {
      await expect(
        pipe.transform(
          { chart: 'pie' },
          { type: 'body', metatype: DashboardPresentationDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { compareBy: 'invalid' },
          { type: 'body', metatype: DashboardPresentationDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('CreateDashboardViewDto and UpdateDashboardViewDto', () => {
    it('accepts valid CreateDashboardViewDto with nested objects and trims name', async () => {
      const result = await transformDto(CreateDashboardViewDto, {
        name: '  Regional Housing Overview  ',
        description: '  Primary analyst saved view  ',
        filters: { metricId: validUuid },
        presentation: { chart: 'line', compareBy: 'period' },
      });
      expect(result).toBeInstanceOf(CreateDashboardViewDto);
      expect(result.name).toBe('Regional Housing Overview');
      expect(result.description).toBe('Primary analyst saved view');
      expect(result.filters).toBeInstanceOf(DashboardFiltersDto);
      expect(result.presentation).toBeInstanceOf(DashboardPresentationDto);
    });

    it('rejects empty name or name exceeding max length', async () => {
      await expect(
        pipe.transform(
          { name: '', filters: {} },
          { type: 'body', metatype: CreateDashboardViewDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { name: 'A'.repeat(121), filters: {} },
          { type: 'body', metatype: CreateDashboardViewDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts partial update in UpdateDashboardViewDto', async () => {
      const result = await transformDto(UpdateDashboardViewDto, {
        name: 'Updated Name',
        filters: { metricId: validUuid },
        presentation: { chart: 'table' },
      });
      expect(result).toBeInstanceOf(UpdateDashboardViewDto);
      expect(result.name).toBe('Updated Name');
      expect(result.filters).toBeInstanceOf(DashboardFiltersDto);
      expect(result.presentation).toBeInstanceOf(DashboardPresentationDto);
      expect(result.presentation?.chart).toBe('table');
    });

    it('rejects nested validation failure in filters', async () => {
      await expect(
        pipe.transform(
          {
            name: 'Valid Name',
            filters: { metricId: 'not-a-uuid' },
          },
          { type: 'body', metatype: CreateDashboardViewDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
