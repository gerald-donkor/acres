import { Test, type TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import {
  INSIGHT_REPORT_STATUSES,
  isInsightReportStatus,
  type RegionSummary,
} from '@acres/shared';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/api-exception';
import { RegionsService } from './regions.service';

describe('RegionsService', () => {
  let service: RegionsService;

  let mockTx: {
    region: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    $executeRaw: jest.Mock;
  };

  let mockPrisma: {
    region: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
  };

  const EXPECTED_WITH_METRICS = {
    metrics: { orderBy: { key: 'asc' } },
  } as const;

  const sampleRegionRowWithMetrics = {
    id: 'reg_01j9x0a0b1c2d3e4f5g6h7j8k9',
    slug: 'great-lakes',
    name: 'Great Lakes Region',
    countryCode: 'US',
    summary:
      'Water management and agricultural metrics for the Great Lakes basin.',
    metrics: [
      {
        id: 'met_01j9x0a0b1c2d3e4f5g6h7j8m1',
        regionId: 'reg_01j9x0a0b1c2d3e4f5g6h7j8k9',
        key: 'efficiency-improvement',
        label: 'Efficiency Improvement',
        value: 14.2,
        unit: '%',
        periodStart: new Date('2025-01-01T00:00:00.000Z'),
        periodEnd: new Date('2025-12-31T23:59:59.999Z'),
        source: 'USDA Regional Survey',
      },
      {
        id: 'met_01j9x0a0b1c2d3e4f5g6h7j8m2',
        regionId: 'reg_01j9x0a0b1c2d3e4f5g6h7j8k9',
        key: 'water-footprint-reduction',
        label: 'Water Footprint Reduction',
        value: 8.7,
        unit: 'ML',
        periodStart: null,
        periodEnd: null,
        source: 'Regional Water Authority',
      },
    ],
  };

  const sampleRegionRowWithoutMetrics = {
    id: 'reg_02j9x0a0b1c2d3e4f5g6h7j8k0',
    slug: 'pacific-northwest',
    name: 'Pacific Northwest',
    countryCode: 'US',
    summary: null,
    metrics: [],
  };

  const sampleRegionRowWithUndefinedDates = {
    id: 'reg_03j9x0a0b1c2d3e4f5g6h7j8k1',
    slug: 'corn-belt',
    name: 'Corn Belt',
    countryCode: 'US',
    summary: 'Central agricultural belt.',
    metrics: [
      {
        id: 'met_03j9x0a0b1c2d3e4f5g6h7j8m3',
        regionId: 'reg_03j9x0a0b1c2d3e4f5g6h7j8k1',
        key: 'nitrogen-efficiency',
        label: 'Nitrogen Efficiency',
        value: 91.5,
        unit: '%',
        periodStart: undefined,
        periodEnd: undefined,
        source: null,
      },
    ],
  };

  const expectedRegionSummary1: RegionSummary = {
    id: 'reg_01j9x0a0b1c2d3e4f5g6h7j8k9',
    slug: 'great-lakes',
    name: 'Great Lakes Region',
    countryCode: 'US',
    summary:
      'Water management and agricultural metrics for the Great Lakes basin.',
    metrics: [
      {
        id: 'met_01j9x0a0b1c2d3e4f5g6h7j8m1',
        regionId: 'reg_01j9x0a0b1c2d3e4f5g6h7j8k9',
        key: 'efficiency-improvement',
        label: 'Efficiency Improvement',
        value: 14.2,
        unit: '%',
        periodStart: '2025-01-01T00:00:00.000Z',
        periodEnd: '2025-12-31T23:59:59.999Z',
        source: 'USDA Regional Survey',
      },
      {
        id: 'met_01j9x0a0b1c2d3e4f5g6h7j8m2',
        regionId: 'reg_01j9x0a0b1c2d3e4f5g6h7j8k9',
        key: 'water-footprint-reduction',
        label: 'Water Footprint Reduction',
        value: 8.7,
        unit: 'ML',
        periodStart: null,
        periodEnd: null,
        source: 'Regional Water Authority',
      },
    ],
  };

  const expectedRegionSummary2: RegionSummary = {
    id: 'reg_02j9x0a0b1c2d3e4f5g6h7j8k0',
    slug: 'pacific-northwest',
    name: 'Pacific Northwest',
    countryCode: 'US',
    summary: null,
    metrics: [],
  };

  beforeEach(async () => {
    mockTx = {
      region: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
    };

    mockPrisma = {
      region: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
      ),
      $executeRaw: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegionsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<RegionsService>(RegionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('can be resolved and instantiated via NestJS TestingModule', () => {
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(RegionsService);
  });

  it('can be instantiated directly via constructor injection', () => {
    const directInstance = new RegionsService(
      mockPrisma as unknown as PrismaService,
    );
    expect(directInstance).toBeDefined();
    expect(directInstance).toBeInstanceOf(RegionsService);
  });

  describe('list', () => {
    it('fetches regions ordered by name asc with WITH_METRICS and maps to RegionSummary and RegionalMetric', async () => {
      mockPrisma.region.findMany.mockResolvedValue([
        sampleRegionRowWithMetrics,
        sampleRegionRowWithoutMetrics,
      ]);

      const result = await service.list();

      expect(mockPrisma.region.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.region.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        include: EXPECTED_WITH_METRICS,
      });
      expect(result).toHaveLength(2);
      expect(result).toEqual([expectedRegionSummary1, expectedRegionSummary2]);
    });

    it('converts Date objects in periodStart and periodEnd to ISO strings or null', async () => {
      mockPrisma.region.findMany.mockResolvedValue([
        sampleRegionRowWithMetrics,
        sampleRegionRowWithUndefinedDates,
      ]);

      const result = await service.list();

      expect(result).toHaveLength(2);
      // Metric 1: Dates converted to ISO strings
      expect(result[0].metrics[0].periodStart).toBe('2025-01-01T00:00:00.000Z');
      expect(result[0].metrics[0].periodEnd).toBe('2025-12-31T23:59:59.999Z');
      // Metric 2: null dates preserved as null
      expect(result[0].metrics[1].periodStart).toBeNull();
      expect(result[0].metrics[1].periodEnd).toBeNull();
      // Metric 3: undefined dates normalized to null
      expect(result[1].metrics[0].periodStart).toBeNull();
      expect(result[1].metrics[0].periodEnd).toBeNull();
    });

    it('handles empty array when no regions exist', async () => {
      mockPrisma.region.findMany.mockResolvedValue([]);

      const result = await service.list();

      expect(mockPrisma.region.findMany).toHaveBeenCalledTimes(1);
      expect(result).toEqual([]);
    });

    it('rethrows unexpected database errors', async () => {
      const dbError = new Error('Database connection failed');
      mockPrisma.region.findMany.mockRejectedValue(dbError);

      await expect(service.list()).rejects.toThrow(
        'Database connection failed',
      );
      expect(mockPrisma.region.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('listPage', () => {
    it('cursor pagination without afterId: passes take, without cursor or skip', async () => {
      mockPrisma.region.findMany.mockResolvedValue([
        sampleRegionRowWithMetrics,
      ]);

      const result = await service.listPage(10);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.region.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.region.findMany).toHaveBeenCalledWith({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        include: EXPECTED_WITH_METRICS,
        take: 10,
      });
      const findManyCalls = mockPrisma.region.findMany.mock
        .calls as unknown as [[Record<string, unknown>]];
      const callArg = findManyCalls[0][0];
      expect(callArg).not.toHaveProperty('cursor');
      expect(callArg).not.toHaveProperty('skip');
      expect(result).toEqual([expectedRegionSummary1]);
    });

    it('cursor pagination with afterId: passes cursor, skip: 1, and take', async () => {
      mockPrisma.region.findMany.mockResolvedValue([
        sampleRegionRowWithoutMetrics,
      ]);

      const afterId = 'reg_01j9x0a0b1c2d3e4f5g6h7j8k9';
      const result = await service.listPage(5, afterId);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.region.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.region.findMany).toHaveBeenCalledWith({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        include: EXPECTED_WITH_METRICS,
        cursor: { id: afterId },
        skip: 1,
        take: 5,
      });
      expect(result).toEqual([expectedRegionSummary2]);
    });

    it('without statementTimeoutMs: calls callback with this.prisma and does not open transaction', async () => {
      mockPrisma.region.findMany.mockResolvedValue([]);

      const result = await service.listPage(20, undefined, undefined);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.region.findMany).toHaveBeenCalledTimes(1);
      expect(mockTx.region.findMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('with statementTimeoutMs: executes within prisma.$transaction, executes raw SQL setting statement_timeout, and calls callback with tx', async () => {
      mockTx.region.findMany.mockResolvedValue([sampleRegionRowWithMetrics]);

      const timeoutMs = 3500;
      const result = await service.listPage(15, 'reg_prev', timeoutMs);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);

      // Verify raw SQL call arguments for statement_timeout
      const rawCalls = mockTx.$executeRaw.mock.calls as unknown as [
        [TemplateStringsArray, string],
      ];
      const [templateStrings, timeoutArg] = rawCalls[0];
      const fullQuery = templateStrings.join('');
      expect(fullQuery).toContain('set_config');
      expect(fullQuery).toContain('statement_timeout');
      expect(fullQuery).toContain('true');
      expect(timeoutArg).toBe(String(timeoutMs));

      // Verify callback used tx, not this.prisma
      expect(mockTx.region.findMany).toHaveBeenCalledTimes(1);
      expect(mockTx.region.findMany).toHaveBeenCalledWith({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        include: EXPECTED_WITH_METRICS,
        cursor: { id: 'reg_prev' },
        skip: 1,
        take: 15,
      });
      expect(mockPrisma.region.findMany).not.toHaveBeenCalled();
      expect(result).toEqual([expectedRegionSummary1]);
    });

    it('cursor error handling: catches P2025 error object and throws ApiException.cursorInvalid', async () => {
      mockPrisma.region.findMany.mockRejectedValue({
        code: 'P2025',
        message: 'Record to use as query cursor not found',
      });

      await expect(service.listPage(10, 'invalid-cursor-id')).rejects.toThrow(
        ApiException,
      );

      try {
        await service.listPage(10, 'invalid-cursor-id');
        throw new Error('Expected ApiException to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiException);
        const apiEx = err as ApiException;
        expect(apiEx.code).toBe('CURSOR_INVALID');
        expect(apiEx.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(apiEx.message).toBe(
          'The cursor is not valid for this connection.',
        );
      }
    });

    it('cursor error handling: catches PrismaClientKnownRequestError with P2025 and throws ApiException.cursorInvalid', async () => {
      const prismaP2025 = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found.',
        {
          code: 'P2025',
          clientVersion: '7.9.1',
        },
      );
      mockPrisma.region.findMany.mockRejectedValue(prismaP2025);

      await expect(service.listPage(10, 'missing-cursor')).rejects.toThrow(
        ApiException,
      );

      try {
        await service.listPage(10, 'missing-cursor');
        throw new Error('Expected ApiException to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiException);
        const apiEx = err as ApiException;
        expect(apiEx.code).toBe('CURSOR_INVALID');
        expect(apiEx.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
    });

    it('other errors: rethrows unexpected errors without modification', async () => {
      const unexpectedError = new Error('Database disk read failed');
      mockPrisma.region.findMany.mockRejectedValue(unexpectedError);

      await expect(service.listPage(10, 'some-cursor')).rejects.toThrow(
        unexpectedError,
      );
    });

    it('other errors: rethrows non-P2025 Prisma errors without modification', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint violation',
        {
          code: 'P2002',
          clientVersion: '7.9.1',
        },
      );
      mockPrisma.region.findMany.mockRejectedValue(p2002);

      await expect(service.listPage(10)).rejects.toThrow(p2002);
    });

    it('other errors: rethrows non-object errors without modification', async () => {
      mockPrisma.region.findMany.mockRejectedValue('raw-string-error');

      await expect(service.listPage(10)).rejects.toBe('raw-string-error');
    });

    it('returns empty array when no regions match page query', async () => {
      mockPrisma.region.findMany.mockResolvedValue([]);

      const result = await service.listPage(10);

      expect(result).toEqual([]);
    });
  });

  describe('findBySlug', () => {
    it('fetches unique region with WITH_METRICS and returns mapped RegionSummary if found', async () => {
      mockPrisma.region.findUnique.mockResolvedValue(
        sampleRegionRowWithMetrics,
      );

      const result = await service.findBySlug('great-lakes');

      expect(mockPrisma.region.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.region.findUnique).toHaveBeenCalledWith({
        where: { slug: 'great-lakes' },
        include: EXPECTED_WITH_METRICS,
      });
      expect(result).toEqual(expectedRegionSummary1);
    });

    it('throws ApiException.notFound when region is null', async () => {
      mockPrisma.region.findUnique.mockResolvedValue(null);

      const slug = 'unknown-region';
      await expect(service.findBySlug(slug)).rejects.toThrow(ApiException);

      try {
        await service.findBySlug(slug);
        throw new Error('Expected ApiException to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiException);
        const apiEx = err as ApiException;
        expect(apiEx.code).toBe('NOT_FOUND');
        expect(apiEx.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(apiEx.message).toBe(`No region matches "${slug}".`);
        expect(apiEx.getResponse()).toEqual({
          code: 'NOT_FOUND',
          message: `No region matches "${slug}".`,
          details: undefined,
        });
      }

      expect(mockPrisma.region.findUnique).toHaveBeenCalledWith({
        where: { slug },
        include: EXPECTED_WITH_METRICS,
      });
    });

    it('rethrows unexpected database errors', async () => {
      const dbError = new Error('Socket timeout');
      mockPrisma.region.findUnique.mockRejectedValue(dbError);

      await expect(service.findBySlug('great-lakes')).rejects.toThrow(
        'Socket timeout',
      );
      expect(mockPrisma.region.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('findBySlugs', () => {
    it('deduplicates input slugs, fetches with WITH_METRICS, and returns Map<string, RegionSummary> keyed by slug', async () => {
      mockPrisma.region.findMany.mockResolvedValue([
        sampleRegionRowWithMetrics,
        sampleRegionRowWithoutMetrics,
      ]);

      const duplicateSlugs = [
        'great-lakes',
        'pacific-northwest',
        'great-lakes',
        'pacific-northwest',
        'great-lakes',
      ];

      const result = await service.findBySlugs(duplicateSlugs);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.region.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.region.findMany).toHaveBeenCalledWith({
        where: {
          slug: {
            in: ['great-lakes', 'pacific-northwest'],
          },
        },
        include: EXPECTED_WITH_METRICS,
      });

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get('great-lakes')).toEqual(expectedRegionSummary1);
      expect(result.get('pacific-northwest')).toEqual(expectedRegionSummary2);
    });

    it('applies optional statement timeout via $transaction when statementTimeoutMs is provided', async () => {
      mockTx.region.findMany.mockResolvedValue([sampleRegionRowWithMetrics]);

      const timeoutMs = 5000;
      const slugs = ['great-lakes'];

      const result = await service.findBySlugs(slugs, timeoutMs);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);

      // Verify raw SQL call arguments for statement_timeout
      const rawCalls = mockTx.$executeRaw.mock.calls as unknown as [
        [TemplateStringsArray, string],
      ];
      const [templateStrings, timeoutArg] = rawCalls[0];
      const fullQuery = templateStrings.join('');
      expect(fullQuery).toContain('set_config');
      expect(fullQuery).toContain('statement_timeout');
      expect(fullQuery).toContain('true');
      expect(timeoutArg).toBe(String(timeoutMs));

      // Verify findMany was called on tx with deduplicated slugs
      expect(mockTx.region.findMany).toHaveBeenCalledTimes(1);
      expect(mockTx.region.findMany).toHaveBeenCalledWith({
        where: {
          slug: {
            in: ['great-lakes'],
          },
        },
        include: EXPECTED_WITH_METRICS,
      });
      expect(mockPrisma.region.findMany).not.toHaveBeenCalled();

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(1);
      expect(result.get('great-lakes')).toEqual(expectedRegionSummary1);
    });

    it('returns empty Map when input slugs array is empty', async () => {
      mockPrisma.region.findMany.mockResolvedValue([]);

      const result = await service.findBySlugs([]);

      expect(mockPrisma.region.findMany).toHaveBeenCalledWith({
        where: { slug: { in: [] } },
        include: EXPECTED_WITH_METRICS,
      });
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('returns Map containing only returned regions when some requested slugs are missing in database', async () => {
      mockPrisma.region.findMany.mockResolvedValue([
        sampleRegionRowWithMetrics,
      ]);

      const result = await service.findBySlugs(['great-lakes', 'non-existent']);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(1);
      expect(result.has('great-lakes')).toBe(true);
      expect(result.has('non-existent')).toBe(false);
      expect(result.get('great-lakes')).toEqual(expectedRegionSummary1);
    });

    it('rethrows unexpected database errors', async () => {
      const dbError = new Error('Database pool exhausted');
      mockPrisma.region.findMany.mockRejectedValue(dbError);

      await expect(service.findBySlugs(['great-lakes'])).rejects.toThrow(
        'Database pool exhausted',
      );
      expect(mockPrisma.region.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('isInsightReportStatus', () => {
    it('returns true for all canonical INSIGHT_REPORT_STATUSES', () => {
      for (const status of INSIGHT_REPORT_STATUSES) {
        expect(isInsightReportStatus(status)).toBe(true);
      }
    });

    it('returns false for invalid values, casing, and primitives', () => {
      expect(isInsightReportStatus('')).toBe(false);
      expect(isInsightReportStatus(' ')).toBe(false);
      expect(isInsightReportStatus('DRAFT')).toBe(false);
      expect(isInsightReportStatus('pending')).toBe(false);
      expect(isInsightReportStatus(null)).toBe(false);
      expect(isInsightReportStatus(undefined)).toBe(false);
      expect(isInsightReportStatus(123)).toBe(false);
      expect(isInsightReportStatus({})).toBe(false);
    });
  });
});
