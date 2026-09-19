import { ApiException } from '../../common/api-exception';
import type { AcresConfigService } from '../../config/acres-config.service';
import type { MetricsService } from '../../metrics/metrics.service';
import { PARSER_MAX_BUFFER_BYTES } from './parser-utils';
import type { ParsedSourceSummary, ParserLimits } from './parser.types';
import { SourceParserService } from './source-parser.service';

describe('SourceParserService', () => {
  let service: SourceParserService;
  let mockConfig: {
    parserMaxRows: number;
    parserMaxColumns: number;
    parserMaxCellChars: number;
    parserMaxSampleRows: number;
    parserMaxGeojsonFeatures: number;
    parserMaxGeojsonCoordinates: number;
  };
  let mockExecutor: {
    execute: jest.Mock<
      Promise<ParsedSourceSummary>,
      [Buffer, string, ParserLimits]
    >;
  };
  let mockMetrics: {
    recordParserExecution: jest.Mock;
  };

  const expectedLimits: ParserLimits = {
    maxRows: 500,
    maxColumns: 25,
    maxCellChars: 300,
    maxSampleRows: 15,
    maxGeojsonFeatures: 150,
    maxGeojsonCoordinates: 1500,
  };

  function createValidSummary(
    overrides?: Partial<ParsedSourceSummary>,
  ): ParsedSourceSummary {
    return {
      sourceKind: 'csv',
      rowCount: 10,
      columnCount: 3,
      columnKeys: ['id', 'name', 'value'],
      sampleRows: [],
      validationRows: [],
      issues: [],
      metadata: {},
      ...overrides,
    };
  }

  beforeEach(() => {
    mockConfig = {
      parserMaxRows: 500,
      parserMaxColumns: 25,
      parserMaxCellChars: 300,
      parserMaxSampleRows: 15,
      parserMaxGeojsonFeatures: 150,
      parserMaxGeojsonCoordinates: 1500,
    };

    mockExecutor = {
      execute: jest
        .fn<Promise<ParsedSourceSummary>, [Buffer, string, ParserLimits]>()
        .mockResolvedValue(createValidSummary()),
    };

    mockMetrics = {
      recordParserExecution: jest.fn(),
    };

    service = new SourceParserService(
      mockConfig as unknown as AcresConfigService,
      mockExecutor,
      mockMetrics as unknown as MetricsService,
    );
  });

  describe('mediaType validation', () => {
    it('throws ApiException when mediaType is not accepted', async () => {
      const buffer = Buffer.from('test content');

      await expect(service.inspect(buffer, 'application/pdf')).rejects.toThrow(
        ApiException,
      );

      await expect(
        service.inspect(buffer, 'application/pdf'),
      ).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        message: 'The submitted values are not valid.',
        details: ['mediaType is not accepted.'],
      });

      expect(mockExecutor.execute).not.toHaveBeenCalled();
      expect(mockMetrics.recordParserExecution).not.toHaveBeenCalled();
    });

    it('accepts valid media types', async () => {
      const buffer = Buffer.from('test content');

      const acceptedTypes = [
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/geo+json',
        'application/json',
      ];

      for (const mediaType of acceptedTypes) {
        await expect(service.inspect(buffer, mediaType)).resolves.toBeDefined();
      }

      expect(mockExecutor.execute).toHaveBeenCalledTimes(acceptedTypes.length);
    });
  });

  describe('buffer size enforcement', () => {
    it('returns error summary and records metric without calling executor when buffer exceeds max limit', async () => {
      const largeBuffer = Buffer.alloc(PARSER_MAX_BUFFER_BYTES + 1);

      const summary = await service.inspect(largeBuffer, 'text/csv');

      expect(mockExecutor.execute).not.toHaveBeenCalled();
      expect(summary.sourceKind).toBe('csv');
      expect(summary.rowCount).toBe(0);
      expect(summary.columnCount).toBe(0);
      expect(summary.issues).toEqual([
        {
          severity: 'error',
          code: 'file_size_limit_exceeded',
          message: 'Source file size exceeds the temporary parser limit.',
        },
      ]);
      expect(mockMetrics.recordParserExecution).toHaveBeenCalledWith(
        'csv',
        'validation_issue',
        0,
      );
    });
  });

  describe('execution and status categorization', () => {
    it('passes mapped config limits to the executor and records success status', async () => {
      const buffer = Buffer.from('id,name\n1,Alpha');
      const expectedSummary = createValidSummary();
      mockExecutor.execute.mockResolvedValueOnce(expectedSummary);

      const result = await service.inspect(buffer, 'text/csv');

      expect(mockExecutor.execute).toHaveBeenCalledWith(
        buffer,
        'text/csv',
        expectedLimits,
      );
      expect(result).toBe(expectedSummary);
      expect(mockMetrics.recordParserExecution).toHaveBeenCalledWith(
        'csv',
        'success',
        expect.any(Number),
      );
    });

    it('records timeout status when issue contains parser_execution_timed_out', async () => {
      const buffer = Buffer.from('id,name\n1,Alpha');
      const timedOutSummary = createValidSummary({
        issues: [
          {
            severity: 'error',
            code: 'parser_execution_timed_out',
            message: 'Parser execution timed out.',
          },
        ],
      });
      mockExecutor.execute.mockResolvedValueOnce(timedOutSummary);

      const result = await service.inspect(buffer, 'text/csv');

      expect(result).toBe(timedOutSummary);
      expect(mockMetrics.recordParserExecution).toHaveBeenCalledWith(
        'csv',
        'timeout',
        expect.any(Number),
      );
    });

    it('records failed status when issue contains parser_execution_failed', async () => {
      const buffer = Buffer.from('id,name\n1,Alpha');
      const failedSummary = createValidSummary({
        issues: [
          {
            severity: 'error',
            code: 'parser_execution_failed',
            message: 'Parser execution failed.',
          },
        ],
      });
      mockExecutor.execute.mockResolvedValueOnce(failedSummary);

      const result = await service.inspect(buffer, 'text/csv');

      expect(result).toBe(failedSummary);
      expect(mockMetrics.recordParserExecution).toHaveBeenCalledWith(
        'csv',
        'failed',
        expect.any(Number),
      );
    });

    it('records validation_issue status when issue has error severity', async () => {
      const buffer = Buffer.from('id,name\n1,Alpha');
      const validationErrorSummary = createValidSummary({
        issues: [
          {
            severity: 'error',
            code: 'row_limit_exceeded',
            message: 'CSV row count exceeds the temporary development limit.',
          },
        ],
      });
      mockExecutor.execute.mockResolvedValueOnce(validationErrorSummary);

      const result = await service.inspect(buffer, 'text/csv');

      expect(result).toBe(validationErrorSummary);
      expect(mockMetrics.recordParserExecution).toHaveBeenCalledWith(
        'csv',
        'validation_issue',
        expect.any(Number),
      );
    });

    it('records success status when issues only contain warnings', async () => {
      const buffer = Buffer.from('id,name\n1,Alpha');
      const warningSummary = createValidSummary({
        issues: [
          {
            severity: 'warning',
            code: 'formula_as_data',
            message: 'Formula-looking cell was treated as text.',
          },
        ],
      });
      mockExecutor.execute.mockResolvedValueOnce(warningSummary);

      const result = await service.inspect(buffer, 'text/csv');

      expect(result).toBe(warningSummary);
      expect(mockMetrics.recordParserExecution).toHaveBeenCalledWith(
        'csv',
        'success',
        expect.any(Number),
      );
    });

    it('executes cleanly when optional metrics service is omitted', async () => {
      const serviceWithoutMetrics = new SourceParserService(
        mockConfig as unknown as AcresConfigService,
        mockExecutor,
      );

      const buffer = Buffer.from('id,name\n1,Alpha');
      const result = await serviceWithoutMetrics.inspect(buffer, 'text/csv');

      expect(result).toBeDefined();
      expect(result.sourceKind).toBe('csv');
    });
  });
});
