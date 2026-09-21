import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PostgisRegionGeometryRepository } from './postgis-region-geometry.repository';
import {
  GEOBOUNDARIES_IMPORT_ERROR_CATEGORIES,
  GeoBoundariesImportError,
  GeoBoundariesImportService,
  isGeoBoundariesImportErrorCategory,
  providerIdentity,
  slug,
} from './geoboundaries-import.service';
import type { NormalizedGeoBoundariesLayer } from './geoboundaries.types';

type LayerGeometry =
  NormalizedGeoBoundariesLayer['features'][number]['geometry'];

describe('GeoBoundariesImportService and import helpers', () => {
  describe('GEOBOUNDARIES_IMPORT_ERROR_CATEGORIES', () => {
    it('contains all canonical import error categories in order', () => {
      expect(GEOBOUNDARIES_IMPORT_ERROR_CATEGORIES).toEqual([
        'hierarchy',
        'checksum',
        'database',
      ]);
    });
  });

  describe('isGeoBoundariesImportErrorCategory', () => {
    it('returns true for all canonical categories', () => {
      for (const cat of GEOBOUNDARIES_IMPORT_ERROR_CATEGORIES) {
        expect(isGeoBoundariesImportErrorCategory(cat)).toBe(true);
      }
    });

    it('returns false for invalid values or casing', () => {
      expect(isGeoBoundariesImportErrorCategory('DATABASE')).toBe(false);
      expect(isGeoBoundariesImportErrorCategory('selection')).toBe(false);
      expect(isGeoBoundariesImportErrorCategory('')).toBe(false);
      expect(
        isGeoBoundariesImportErrorCategory(null as unknown as string),
      ).toBe(false);
      expect(
        isGeoBoundariesImportErrorCategory(undefined as unknown as string),
      ).toBe(false);
    });
  });

  describe('GeoBoundariesImportError', () => {
    it('sets name, category, and message', () => {
      const err = new GeoBoundariesImportError('hierarchy', 'Parent missing');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(GeoBoundariesImportError);
      expect(err.name).toBe('GeoBoundariesImportError');
      expect(err.category).toBe('hierarchy');
      expect(err.message).toBe('Parent missing');
    });
  });

  describe('slug and providerIdentity helpers', () => {
    it('computes deterministic slug with sha256 prefix', () => {
      const feature = {
        shapeGroup: 'GHA',
        shapeType: 'ADM1',
        shapeId: 'test-123',
      };
      const result = slug(feature);
      expect(result).toMatch(/^gb-gha-adm1-[a-f0-9]{16}$/);
      expect(slug(feature)).toBe(result);
    });

    it('formats providerIdentity as country/level/shapeId', () => {
      const identity = providerIdentity(
        { countryCode: 'GHA', level: 'ADM1' },
        'shape-abc',
      );
      expect(identity).toBe('GHA/ADM1/shape-abc');
    });
  });

  describe('GeoBoundariesImportService.importLayers', () => {
    let service: GeoBoundariesImportService;
    let prisma: { $transaction: jest.Mock };
    let geometries: { writeGeometry: jest.Mock };

    const sampleAdm0Layer: NormalizedGeoBoundariesLayer = {
      layer: {
        provider: 'geoBoundaries',
        releaseType: 'gbOpen',
        countryCode: 'GHA',
        level: 'ADM0',
        boundaryId: 'GHA-ADM0-1',
        representedYear: '2023',
        sourceUpdateDate: '2023-01-01',
        buildDate: '2023-06-01',
        boundarySource: 'Source',
        boundaryLicense: 'CC BY 4.0',
        licenseDetail: 'License',
        licenseSource: 'Source URL',
        sourceUrl: 'https://example.com/source',
        artifactUrl: 'https://example.com/artifact.geojson',
        sha256: 'sha256-hash-0',
        byteLength: 1000,
        featureCount: 1,
        attribution: 'Attribution',
        modificationNote: 'Note',
        hierarchyMode: 'country-root',
      },
      features: [
        {
          shapeId: 'GHA-0',
          shapeName: 'Ghana',
          shapeGroup: 'GHA',
          shapeType: 'ADM0',
          geometry: {
            type: 'Polygon',
            coordinates: [],
          } as unknown as LayerGeometry,
        },
      ],
    };

    const sampleAdm1Layer: NormalizedGeoBoundariesLayer = {
      layer: {
        provider: 'geoBoundaries',
        releaseType: 'gbOpen',
        countryCode: 'GHA',
        level: 'ADM1',
        boundaryId: 'GHA-ADM1-1',
        representedYear: '2023',
        sourceUpdateDate: '2023-01-01',
        buildDate: '2023-06-01',
        boundarySource: 'Source',
        boundaryLicense: 'CC BY 4.0',
        licenseDetail: 'License',
        licenseSource: 'Source URL',
        sourceUrl: 'https://example.com/source',
        artifactUrl: 'https://example.com/artifact.geojson',
        sha256: 'sha256-hash-1',
        byteLength: 2000,
        featureCount: 1,
        attribution: 'Attribution',
        modificationNote: 'Note',
        hierarchyMode: 'explicit-parent-map',
      },
      features: [
        {
          shapeId: 'GHA-1-ACCRA',
          shapeName: 'Greater Accra',
          shapeGroup: 'GHA',
          shapeType: 'ADM1',
          geometry: {
            type: 'Polygon',
            coordinates: [],
          } as unknown as LayerGeometry,
        },
      ],
    };

    beforeEach(async () => {
      prisma = {
        $transaction: jest.fn(),
      };
      geometries = {
        writeGeometry: jest.fn().mockResolvedValue(undefined),
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GeoBoundariesImportService,
          { provide: PrismaService, useValue: prisma },
          { provide: PostgisRegionGeometryRepository, useValue: geometries },
        ],
      }).compile();
      service = module.get<GeoBoundariesImportService>(
        GeoBoundariesImportService,
      );
    });

    it('throws database error if layers array is empty', async () => {
      await expect(service.importLayers([], 'identity-123')).rejects.toThrow(
        new GeoBoundariesImportError(
          'database',
          'At least one normalized layer is required.',
        ),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws hierarchy error if layer level >= ADM2 and hierarchyMode is unresolved', async () => {
      const unresolvedAdm2: NormalizedGeoBoundariesLayer = {
        layer: {
          ...sampleAdm1Layer.layer,
          level: 'ADM2',
          hierarchyMode: 'unresolved',
        },
        features: [
          {
            shapeId: 'GHA-2-SUB',
            shapeName: 'District',
            shapeGroup: 'GHA',
            shapeType: 'ADM2',
            geometry: {
              type: 'Polygon',
              coordinates: [],
            } as unknown as LayerGeometry,
          },
        ],
      };

      await expect(
        service.importLayers([sampleAdm0Layer, unresolvedAdm2], 'ident'),
      ).rejects.toThrow(
        new GeoBoundariesImportError(
          'hierarchy',
          'GHA/ADM2 has no reviewed parent map; publication is blocked.',
        ),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('supports dryRun mode without executing database transaction', async () => {
      const result = await service.importLayers(
        [sampleAdm0Layer, sampleAdm1Layer],
        'abc12345678901234567890123456789012345',
        true,
      );

      expect(result).toEqual({
        sourceId: 'dry-run',
        sourceVersion: 'gbOpen-abc12345678901234567890123456789',
        regionCount: 2,
        unchanged: false,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws hierarchy error if ADM0 layer contains more than one feature', async () => {
      const invalidAdm0: NormalizedGeoBoundariesLayer = {
        ...sampleAdm0Layer,
        features: [
          sampleAdm0Layer.features[0],
          {
            ...sampleAdm0Layer.features[0],
            shapeId: 'GHA-0-EXTRA',
          },
        ],
      };

      prisma.$transaction.mockImplementation(
        (callback: (tx: unknown) => Promise<unknown>) => {
          const mockTx = {
            regionSource: {
              upsert: jest.fn().mockResolvedValue({ id: 'src-1' }),
            },
          };
          return callback(mockTx);
        },
      );

      await expect(
        service.importLayers([invalidAdm0], 'identity'),
      ).rejects.toThrow('GHA/ADM0 requires exactly one country root.');
    });

    it('throws hierarchy error if non-ADM0 layer has unresolved parent', async () => {
      const mockTx = {
        regionSource: {
          upsert: jest.fn().mockResolvedValue({ id: 'src-1' }),
        },
        regionCode: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        region: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      prisma.$transaction.mockImplementation(
        (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx),
      );

      await expect(
        service.importLayers([sampleAdm1Layer], 'identity'),
      ).rejects.toThrow(
        new GeoBoundariesImportError(
          'hierarchy',
          'GHA/ADM1 has an unresolved parent.',
        ),
      );
    });

    it('throws hierarchy error if existing region parent conflicts with reviewed hierarchy', async () => {
      const mockTx = {
        regionSource: {
          upsert: jest.fn().mockResolvedValue({ id: 'src-gha' }),
        },
        regionCode: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({ id: 'code-1' }),
        },
        region: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'reg-existing-id',
              slug: slug(sampleAdm1Layer.features[0]),
              parentId: 'conflicting-parent-id',
            },
          ]),
          upsert: jest.fn().mockResolvedValue({ id: 'reg-gha-adm0' }),
        },
        regionAlias: {
          create: jest.fn().mockResolvedValue({ id: 'alias-1' }),
        },
      };

      prisma.$transaction.mockImplementation(
        (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx),
      );

      await expect(
        service.importLayers([sampleAdm0Layer, sampleAdm1Layer], 'identity'),
      ).rejects.toThrow(
        new GeoBoundariesImportError(
          'hierarchy',
          'Existing region parent conflicts with reviewed hierarchy.',
        ),
      );
    });

    it('successfully persists layers into database in transaction', async () => {
      const mockTx = {
        regionSource: {
          upsert: jest.fn().mockResolvedValue({ id: 'src-gha' }),
        },
        regionCode: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({ id: 'code-1' }),
        },
        region: {
          findMany: jest.fn().mockResolvedValue([]),
          upsert: jest
            .fn()
            .mockImplementation(
              (args: { create: { slug: string; name: string } }) =>
                Promise.resolve({
                  id: `reg-${args.create.slug}`,
                  ...args.create,
                }),
            ),
        },
        regionAlias: {
          create: jest.fn().mockResolvedValue({ id: 'alias-1' }),
        },
      };

      prisma.$transaction.mockImplementation(
        (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx),
      );

      const result = await service.importLayers(
        [sampleAdm0Layer, sampleAdm1Layer],
        'manifest-hash-value',
      );

      expect(result).toEqual({
        sourceId: 'src-gha',
        sourceVersion: 'gbOpen-manifest-hash-value',
        regionCount: 2,
        unchanged: false,
      });

      const expectedCreate = expect.objectContaining({
        provider: 'geoBoundaries',
        codeSystem: 'gbOpen',
        sourceVersion: 'gbOpen-manifest-hash-value',
      }) as unknown;

      expect(mockTx.regionSource.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expectedCreate,
        }) as unknown,
      );

      expect(mockTx.region.upsert).toHaveBeenCalledTimes(2);
      expect(mockTx.regionCode.create).toHaveBeenCalledTimes(2);
      expect(mockTx.regionAlias.create).toHaveBeenCalledTimes(2);
      expect(geometries.writeGeometry).toHaveBeenCalledTimes(2);
    });

    it('reports unchanged: true when all features exist in regionCode', async () => {
      const mockTx = {
        regionSource: {
          upsert: jest.fn().mockResolvedValue({ id: 'src-gha' }),
        },
        regionCode: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { normalized: 'GHA/ADM0/GHA-0', regionId: 'reg-0' },
            ]),
          create: jest.fn(),
        },
        region: {
          findMany: jest.fn().mockResolvedValue([]),
          upsert: jest.fn(),
        },
        regionAlias: {
          create: jest.fn(),
        },
      };

      prisma.$transaction.mockImplementation(
        (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx),
      );

      const result = await service.importLayers(
        [sampleAdm0Layer],
        'manifest-hash',
      );

      expect(result.unchanged).toBe(true);
      expect(mockTx.region.upsert).not.toHaveBeenCalled();
      expect(geometries.writeGeometry).toHaveBeenCalledTimes(1);
    });

    it('rethrows existing GeoBoundariesImportError during transaction', async () => {
      prisma.$transaction.mockImplementation(() =>
        Promise.reject(
          new GeoBoundariesImportError('hierarchy', 'Hierarchy broken'),
        ),
      );

      await expect(
        service.importLayers([sampleAdm0Layer], 'hash'),
      ).rejects.toThrow('Hierarchy broken');
    });

    it('wraps unknown database transaction failure in database category error', async () => {
      prisma.$transaction.mockImplementation(() =>
        Promise.reject(new Error('Connection refused')),
      );

      await expect(
        service.importLayers([sampleAdm0Layer], 'hash'),
      ).rejects.toThrow(
        new GeoBoundariesImportError(
          'database',
          'Database transaction failed; no geography source revision was published.',
        ),
      );
    });
  });
});
