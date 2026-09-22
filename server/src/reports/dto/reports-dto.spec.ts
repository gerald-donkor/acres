import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  CreateExportDto,
  CreateReportDto,
  CreateRevisionDto,
  ReportEvidenceDto,
  ReportInsightDto,
  UpdateReportDto,
  UpdateRevisionDto,
} from './report.dto';

describe('Reports DTOs validation', () => {
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

  describe('ReportInsightDto and ReportEvidenceDto', () => {
    it('accepts valid insight and trims strings', async () => {
      const result = await transformDto(ReportInsightDto, {
        heading: '  Key Demographic Shift  ',
        body: '  Observed 12% increase in regional population.  ',
      });
      expect(result).toBeInstanceOf(ReportInsightDto);
      expect(result.heading).toBe('Key Demographic Shift');
      expect(result.body).toBe('Observed 12% increase in regional population.');
    });

    it('accepts valid evidence with optional UUID references', async () => {
      const result = await transformDto(ReportEvidenceDto, {
        aggregateId: validUuid1,
        dashboardViewId: validUuid2,
      });
      expect(result).toBeInstanceOf(ReportEvidenceDto);
      expect(result.aggregateId).toBe(validUuid1);
      expect(result.dashboardViewId).toBe(validUuid2);
    });
  });

  describe('CreateReportDto and UpdateReportDto', () => {
    it('accepts valid CreateReportDto with nested insights and evidence', async () => {
      const result = await transformDto(CreateReportDto, {
        title: '  Executive Demographic Summary  ',
        summary: '  High-level overview of census metrics.  ',
        insights: [
          {
            heading: 'Population Growth',
            body: 'Growth concentrated in urban centers.',
          },
        ],
        evidence: [{ aggregateId: validUuid1 }],
      });
      expect(result).toBeInstanceOf(CreateReportDto);
      expect(result.title).toBe('Executive Demographic Summary');
      expect(result.summary).toBe('High-level overview of census metrics.');
      expect(result.insights).toHaveLength(1);
      expect(result.insights![0]).toBeInstanceOf(ReportInsightDto);
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence![0]).toBeInstanceOf(ReportEvidenceDto);
    });

    it('rejects empty title or title exceeding max length', async () => {
      await expect(
        pipe.transform(
          { title: '' },
          { type: 'body', metatype: CreateReportDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { title: 'A'.repeat(201) },
          { type: 'body', metatype: CreateReportDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts valid UpdateReportDto with expectedVersion', async () => {
      const result = await transformDto(UpdateReportDto, {
        title: 'Updated Report',
        expectedVersion: 2,
      });
      expect(result).toBeInstanceOf(UpdateReportDto);
      expect(result.title).toBe('Updated Report');
      expect(result.expectedVersion).toBe(2);
    });

    it('rejects expectedVersion below 1 or non-integer', async () => {
      await expect(
        pipe.transform(
          { expectedVersion: 0 },
          { type: 'body', metatype: UpdateReportDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('UpdateRevisionDto and CreateRevisionDto', () => {
    it('accepts valid revision update', async () => {
      const result = await transformDto(UpdateRevisionDto, {
        title: 'Revision 2 Title',
        expectedVersion: 1,
      });
      expect(result).toBeInstanceOf(UpdateRevisionDto);
      expect(result.title).toBe('Revision 2 Title');
      expect(result.expectedVersion).toBe(1);
    });

    it('works identically for CreateRevisionDto', async () => {
      const result = await transformDto(CreateRevisionDto, {
        title: 'Draft Revision',
        expectedVersion: 1,
      });
      expect(result).toBeInstanceOf(CreateRevisionDto);
    });
  });

  describe('CreateExportDto', () => {
    it('accepts canonical export formats csv and pdf', async () => {
      for (const format of ['csv', 'pdf'] as const) {
        const result = await transformDto(CreateExportDto, {
          reportId: validUuid1,
          format,
        });
        expect(result).toBeInstanceOf(CreateExportDto);
        expect(result.format).toBe(format);
      }
    });

    it('rejects unsupported export format', async () => {
      await expect(
        pipe.transform(
          { reportId: validUuid1, format: 'xlsx' },
          { type: 'body', metatype: CreateExportDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
