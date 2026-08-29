import type { AnalyticsPublicationService } from '../analytics/analytics-publication.service';
import type { Prisma } from '../generated/prisma/client';
import type { TenantTransactionService } from '../prisma/tenant-transaction.service';
import type { ObjectStoragePort } from '../storage/storage.port';
import { IngestionProcessorService } from './ingestion-processor.service';
import type { ParsedSourceSummary } from './parsers/parser.types';
import type { SourceParserService } from './parsers/source-parser.service';

interface StoredUpload {
  readonly id: string;
  readonly declaredMediaType: string;
  readonly checksumHex: string;
  readonly storedObject: {
    readonly id: string;
    readonly objectKey: string;
  };
}

interface StoredRun {
  readonly id: string;
  readonly organizationId: string;
  readonly actorAccountId: string;
  readonly state: string;
  readonly startedAt: Date | null;
  readonly datasetId: string;
  readonly mappingId: string;
  readonly uploadId: string;
  readonly upload: StoredUpload;
  readonly mapping: {
    readonly id: string;
    readonly mapping: {
      readonly regionColumn?: string;
      readonly regionCodeColumn?: string;
      readonly metrics: Array<{ sourceColumn: string; metricKey: string }>;
    };
  };
}

describe('IngestionProcessorService - Parser Failure Outcomes', () => {
  let processor: IngestionProcessorService;
  let fakeTenants: Partial<TenantTransactionService>;
  let fakeParsers: Partial<SourceParserService>;
  let fakeAnalytics: Partial<AnalyticsPublicationService>;
  let fakeStorage: Partial<ObjectStoragePort>;

  let mockRun: StoredRun;
  let validationIssuesCreated: Prisma.ValidationIssueCreateManyInput[] = [];
  let mappingUpdated: Record<string, unknown> | null = null;
  let runUpdated: Record<string, unknown> | null = null;
  let publishedVersion: Record<string, unknown> | null = null;

  beforeEach(() => {
    mockRun = {
      id: 'run-123',
      organizationId: 'org-456',
      actorAccountId: 'acc-789',
      state: 'queued',
      startedAt: null,
      datasetId: 'ds-1',
      mappingId: 'map-1',
      uploadId: 'up-1',
      upload: {
        id: 'up-1',
        declaredMediaType: 'text/csv',
        checksumHex: 'abc123',
        storedObject: {
          id: 'obj-1',
          objectKey: 'quarantine/org-456/up-1',
        },
      },
      mapping: {
        id: 'map-1',
        mapping: {
          regionColumn: 'region',
          metrics: [{ sourceColumn: 'val', metricKey: 'crop_yield' }],
        },
      },
    };

    validationIssuesCreated = [];
    mappingUpdated = null;
    runUpdated = null;
    publishedVersion = null;

    const fakeTx = {
      ingestionRun: {
        findUnique: jest.fn().mockResolvedValue(mockRun),
        findFirst: jest.fn().mockResolvedValue(mockRun),
        update: jest
          .fn()
          .mockImplementation((args: { data: Record<string, unknown> }) => {
            runUpdated = args.data;
            return Promise.resolve({ ...mockRun, ...args.data });
          }),
      },
      upload: {
        update: jest.fn(),
      },
      validationIssue: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest
          .fn()
          .mockImplementation(
            (args: { data: Prisma.ValidationIssueCreateManyInput[] }) => {
              validationIssuesCreated = args.data;
              return Promise.resolve({ count: args.data.length });
            },
          ),
      },
      stagedSourceSummary: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest
          .fn()
          .mockImplementation((args: { data: Record<string, unknown> }) => {
            return Promise.resolve(args.data);
          }),
      },
      columnMapping: {
        update: jest
          .fn()
          .mockImplementation((args: { data: Record<string, unknown> }) => {
            mappingUpdated = args.data;
            return Promise.resolve(args.data);
          }),
      },
      dataset: {
        update: jest.fn(),
      },
      datasetVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _max: { versionNumber: 0 } }),
        create: jest
          .fn()
          .mockImplementation((args: { data: Record<string, unknown> }) => {
            publishedVersion = { id: 'ver-1', ...args.data };
            return Promise.resolve(publishedVersion);
          }),
      },
      regionCode: {
        findMany: jest.fn().mockResolvedValue([{ regionId: 'reg-1' }]),
      },
      regionAlias: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    fakeTenants = {
      workerScoped: jest
        .fn()
        .mockImplementation((callback: (tx: unknown) => Promise<unknown>) => {
          return callback(fakeTx);
        }),
      organizationScoped: jest
        .fn()
        .mockImplementation(
          (
            _acc: string,
            _org: string,
            callback: (tx: unknown) => Promise<unknown>,
          ) => {
            return callback(fakeTx);
          },
        ),
    };

    fakeStorage = {
      getBuffer: jest
        .fn()
        .mockResolvedValue(Buffer.from('region,val\nUS-CA,10\n')),
    };

    fakeAnalytics = {
      validateMapping: jest.fn().mockReturnValue([]),
      publish: jest.fn().mockResolvedValue(undefined),
    };

    fakeParsers = {
      inspect: jest.fn(),
    };

    processor = new IngestionProcessorService(
      fakeTenants as TenantTransactionService,
      fakeParsers as SourceParserService,
      fakeAnalytics as AnalyticsPublicationService,
      fakeStorage as ObjectStoragePort,
    );
  });

  it('handles parser timeout as blocking validation failure and prevents publication', async () => {
    const timeoutSummary: ParsedSourceSummary = {
      sourceKind: 'csv',
      rowCount: 0,
      columnCount: 0,
      columnKeys: [],
      sampleRows: [],
      validationRows: [],
      issues: [
        {
          severity: 'error',
          code: 'parser_execution_timed_out',
          message: 'Parser execution timed out.',
        },
      ],
      metadata: {},
    };
    (fakeParsers.inspect as jest.Mock).mockResolvedValue(timeoutSummary);

    await processor.processRun('run-123');

    expect(validationIssuesCreated).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'parser_execution_timed_out',
          severity: 'error',
          message: 'Parser execution timed out.',
        }),
      ]),
    );
    expect(mappingUpdated).toEqual({ validationStatus: 'invalid' });
    expect(runUpdated).toMatchObject({
      state: 'validation_failed',
      stage: 'validate',
      failureCode: 'validation_failed',
    });
    expect(publishedVersion).toBeNull();
    expect(fakeAnalytics.publish).not.toHaveBeenCalled();
  });

  it('handles parser execution failure as blocking validation failure and prevents publication', async () => {
    const errorSummary: ParsedSourceSummary = {
      sourceKind: 'csv',
      rowCount: 0,
      columnCount: 0,
      columnKeys: [],
      sampleRows: [],
      validationRows: [],
      issues: [
        {
          severity: 'error',
          code: 'parser_execution_failed',
          message: 'Parser execution failed.',
        },
      ],
      metadata: {},
    };
    (fakeParsers.inspect as jest.Mock).mockResolvedValue(errorSummary);

    await processor.processRun('run-123');

    expect(validationIssuesCreated).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'parser_execution_failed',
          severity: 'error',
        }),
      ]),
    );
    expect(mappingUpdated).toEqual({ validationStatus: 'invalid' });
    expect(runUpdated).toMatchObject({
      state: 'validation_failed',
      stage: 'validate',
      failureCode: 'validation_failed',
    });
    expect(publishedVersion).toBeNull();
    expect(fakeAnalytics.publish).not.toHaveBeenCalled();
  });

  it('leaves storage failure on operational failed path without creating validation issues', async () => {
    (fakeStorage.getBuffer as jest.Mock).mockResolvedValue(null);

    await processor.processRun('run-123');

    expect(runUpdated).toMatchObject({
      state: 'failed',
      failureCode: 'object_missing',
    });
    expect(validationIssuesCreated).toHaveLength(0);
    expect(mappingUpdated).toBeNull();
    expect(publishedVersion).toBeNull();
    expect(fakeAnalytics.publish).not.toHaveBeenCalled();
  });
});
