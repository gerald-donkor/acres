import { Inject, Injectable, Optional } from '@nestjs/common';
import { ApiException } from '../../common/api-exception';
import { AcresConfigService } from '../../config/acres-config.service';
import { MetricsService } from '../../metrics/metrics.service';
import {
  PARSER_EXECUTOR,
  type ParserExecutorPort,
} from './parser-executor.port';
import { PARSER_MAX_BUFFER_BYTES } from './parser-utils';
import type {
  ParsedSourceSummary,
  ParserLimits,
  SourceKind,
} from './parser.types';

@Injectable()
export class SourceParserService {
  constructor(
    private readonly config: AcresConfigService,
    @Inject(PARSER_EXECUTOR)
    private readonly executor: ParserExecutorPort,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async inspect(
    buffer: Buffer,
    mediaType: string,
  ): Promise<ParsedSourceSummary> {
    const isCsv = mediaType === 'text/csv';
    const isXlsx =
      mediaType ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const isGeoJson =
      mediaType === 'application/geo+json' || mediaType === 'application/json';

    if (!isCsv && !isXlsx && !isGeoJson) {
      throw ApiException.validationFailed(['mediaType is not accepted.']);
    }

    const sourceKind: SourceKind = isXlsx
      ? 'xlsx'
      : isGeoJson
        ? 'geojson'
        : 'csv';

    if (buffer.length > PARSER_MAX_BUFFER_BYTES) {
      const summary: ParsedSourceSummary = {
        sourceKind,
        rowCount: 0,
        columnCount: 0,
        columnKeys: [],
        sampleRows: [],
        validationRows: [],
        issues: [
          {
            severity: 'error',
            code: 'file_size_limit_exceeded',
            message: 'Source file size exceeds the temporary parser limit.',
          },
        ],
        metadata: {},
      };
      this.metrics?.recordParserExecution(sourceKind, 'validation_issue', 0);
      return summary;
    }

    const limits: ParserLimits = {
      maxRows: this.config.parserMaxRows,
      maxColumns: this.config.parserMaxColumns,
      maxCellChars: this.config.parserMaxCellChars,
      maxSampleRows: this.config.parserMaxSampleRows,
      maxGeojsonFeatures: this.config.parserMaxGeojsonFeatures,
      maxGeojsonCoordinates: this.config.parserMaxGeojsonCoordinates,
    };

    const startTime = performance.now();
    const summary = await this.executor.execute(buffer, mediaType, limits);
    const durationSeconds = (performance.now() - startTime) / 1000;

    const hasErrors = summary.issues.some((i) => i.severity === 'error');
    const isTimeout = summary.issues.some(
      (i) => i.code === 'parser_execution_timed_out',
    );
    const isFailure = summary.issues.some(
      (i) => i.code === 'parser_execution_failed',
    );

    const status = isTimeout
      ? 'timeout'
      : isFailure
        ? 'failed'
        : hasErrors
          ? 'validation_issue'
          : 'success';

    this.metrics?.recordParserExecution(
      summary.sourceKind,
      status,
      durationSeconds,
    );

    return summary;
  }
}
