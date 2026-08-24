import { Injectable } from '@nestjs/common';
import { ApiException } from '../../common/api-exception';
import { AcresConfigService } from '../../config/acres-config.service';
import { CsvSourceParser } from './csv-source.parser';
import { GeojsonSourceParser } from './geojson-source.parser';
import type { ParsedSourceSummary, ParserLimits } from './parser.types';
import { XlsxSourceParser } from './xlsx-source.parser';

@Injectable()
export class SourceParserService {
  private readonly csv: CsvSourceParser;
  private readonly xlsx: XlsxSourceParser;
  private readonly geojson: GeojsonSourceParser;

  constructor(config: AcresConfigService) {
    const limits: ParserLimits = {
      maxRows: config.parserMaxRows,
      maxColumns: config.parserMaxColumns,
      maxCellChars: config.parserMaxCellChars,
      maxSampleRows: config.parserMaxSampleRows,
      maxGeojsonFeatures: config.parserMaxGeojsonFeatures,
      maxGeojsonCoordinates: config.parserMaxGeojsonCoordinates,
    };
    this.csv = new CsvSourceParser(limits);
    this.xlsx = new XlsxSourceParser(limits);
    this.geojson = new GeojsonSourceParser(limits);
  }

  async inspect(
    buffer: Buffer,
    mediaType: string,
  ): Promise<ParsedSourceSummary> {
    try {
      if (mediaType === 'text/csv') return this.csv.inspect(buffer);
      if (
        mediaType ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ) {
        return await this.xlsx.inspect(buffer);
      }
      if (
        mediaType === 'application/geo+json' ||
        mediaType === 'application/json'
      ) {
        return this.geojson.inspect(buffer);
      }
    } catch (error) {
      return {
        sourceKind: mediaType.includes('sheet')
          ? 'xlsx'
          : mediaType.includes('json')
            ? 'geojson'
            : 'csv',
        rowCount: 0,
        columnCount: 0,
        columnKeys: [],
        sampleRows: [],
        validationRows: [],
        issues: [
          {
            severity: 'error',
            code: 'parser_exception',
            message:
              error instanceof Error
                ? error.message.slice(0, 180)
                : 'Parser failed.',
          },
        ],
        metadata: {},
      };
    }
    throw ApiException.validationFailed(['mediaType is not accepted.']);
  }
}
