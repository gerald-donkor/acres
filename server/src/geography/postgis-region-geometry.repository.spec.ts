import { PostgisRegionGeometryRepository } from './postgis-region-geometry.repository';
import { GeometryError } from './geometry.errors';
import type { PrismaService } from '../prisma/prisma.service';
import type { WriteRegionGeometryInput } from './geography.types';

describe('PostgisRegionGeometryRepository', () => {
  let repository: PostgisRegionGeometryRepository;
  let mockPrisma: jest.Mocked<Partial<PrismaService>>;

  const validRegionId = '01918e95-7140-7000-8000-000000000001';
  const validSourceId = '01918e95-7140-7000-8000-000000000002';

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    };
    repository = new PostgisRegionGeometryRepository(
      mockPrisma as unknown as PrismaService,
    );
  });

  describe('writeGeometry', () => {
    it('fails prevalidation before making any database call', async () => {
      const invalidInput: WriteRegionGeometryInput = {
        regionId: '',
        sourceId: validSourceId,
        geometry: { type: 'Point', coordinates: [0, 0] },
      };

      await expect(repository.writeGeometry(invalidInput)).rejects.toThrow(
        GeometryError,
      );

      // Verify no DB query was made
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('rejects Feature wrappers before making any database call', async () => {
      const invalidInput = {
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry: {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
      } as unknown as WriteRegionGeometryInput;

      await expect(repository.writeGeometry(invalidInput)).rejects.toThrow(
        GeometryError,
      );
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('persists valid geometry and maps database-derived return values', async () => {
      const now = new Date();
      const mockRow = {
        id: '01918e95-7140-7000-8000-000000000003',
        regionId: validRegionId,
        sourceId: validSourceId,
        srid: 4326,
        geometryType: 'Polygon',
        isValid: true,
        sourcePrecision: '10m',
        metadata: { provider: 'census' },
        createdAt: now,
        updatedAt: now,
      };

      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([mockRow]);

      const input: WriteRegionGeometryInput = {
        regionId: validRegionId,
        sourceId: validSourceId,
        sourcePrecision: '10m',
        metadata: { provider: 'census' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [0, 1],
              [1, 1],
              [1, 0],
              [0, 0],
            ],
          ],
        },
      };

      const result = await repository.writeGeometry(input);

      expect(result).toEqual({
        id: mockRow.id,
        regionId: validRegionId,
        sourceId: validSourceId,
        srid: 4326,
        geometryType: 'Polygon',
        isValid: true,
        sourcePrecision: '10m',
        metadata: { provider: 'census' },
        createdAt: now,
        updatedAt: now,
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('maps 0-row return (PostGIS topological check rejection) to GeometryError.invalid', async () => {
      // Simulate PostGIS where evaluated e.is_valid = false caused 0 rows inserted
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const input: WriteRegionGeometryInput = {
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [2, 2],
              [2, 0],
              [0, 2],
              [0, 0],
            ],
          ],
        },
      };

      await expect(repository.writeGeometry(input)).rejects.toThrow(
        GeometryError,
      );
      await expect(repository.writeGeometry(input)).rejects.toMatchObject({
        code: 'INVALID_GEOMETRY',
      });
    });

    it('maps foreign key violations to GeometryError.referenceNotFound', async () => {
      const p2003Error = Object.assign(
        new Error('Foreign key constraint failed on the field: `regionId`'),
        { code: 'P2003' },
      );
      (mockPrisma.$queryRaw as jest.Mock).mockRejectedValueOnce(p2003Error);

      const input: WriteRegionGeometryInput = {
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry: { type: 'Point', coordinates: [0, 0] },
      };

      await expect(repository.writeGeometry(input)).rejects.toMatchObject({
        code: 'REFERENCE_NOT_FOUND',
      });
    });

    it('does not leak raw SQL, coordinates, or internal details in error messages', async () => {
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

      const input: WriteRegionGeometryInput = {
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.4194, 37.7749],
              [-122.4194, 37.78],
              [-122.41, 37.78],
              [-122.41, 37.7749],
              [-122.4194, 37.7749],
            ],
          ],
        },
      };

      try {
        await repository.writeGeometry(input);
        fail('Should have thrown GeometryError');
      } catch (err) {
        expect(err).toBeInstanceOf(GeometryError);
        const message = (err as Error).message;
        expect(message).not.toContain('-122.4194');
        expect(message).not.toContain('ST_GeomFromGeoJSON');
        expect(message).not.toContain('SELECT');
      }
    });
  });

  describe('findRegionsContainingPoint', () => {
    it('validates longitude and latitude bounds before querying', async () => {
      await expect(
        repository.findRegionsContainingPoint({ longitude: 200, latitude: 0 }),
      ).rejects.toThrow(GeometryError);

      await expect(
        repository.findRegionsContainingPoint({ longitude: 0, latitude: 100 }),
      ).rejects.toThrow(GeometryError);

      await expect(
        repository.findRegionsContainingPoint({ longitude: NaN, latitude: 0 }),
      ).rejects.toThrow(GeometryError);

      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('executes tagged query and returns projected records', async () => {
      const now = new Date();
      const mockRows = [
        {
          id: '01918e95-7140-7000-8000-000000000004',
          regionId: validRegionId,
          sourceId: validSourceId,
          srid: 4326,
          geometryType: 'Polygon',
          isValid: true,
          sourcePrecision: null,
          metadata: null,
          createdAt: now,
          updatedAt: now,
        },
      ];

      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce(mockRows);

      const results = await repository.findRegionsContainingPoint({
        longitude: -122.4194,
        latitude: 37.7749,
        limit: 5,
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe(mockRows[0]?.id);
      expect(results[0]?.geometryType).toBe('Polygon');
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('findByRegionAndSource and deleteByRegionAndSource', () => {
    it('finds record by region and source', async () => {
      const now = new Date();
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
        {
          id: '01918e95-7140-7000-8000-000000000005',
          regionId: validRegionId,
          sourceId: validSourceId,
          srid: 4326,
          geometryType: 'Point',
          isValid: true,
          sourcePrecision: null,
          metadata: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const record = await repository.findByRegionAndSource(
        validRegionId,
        validSourceId,
      );
      expect(record?.id).toBe('01918e95-7140-7000-8000-000000000005');
    });

    it('returns null when record not found', async () => {
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);
      const record = await repository.findByRegionAndSource(
        validRegionId,
        validSourceId,
      );
      expect(record).toBeNull();
    });

    it('deletes record by region and source', async () => {
      (mockPrisma.$executeRaw as jest.Mock).mockResolvedValueOnce(1);
      const deleted = await repository.deleteByRegionAndSource(
        validRegionId,
        validSourceId,
      );
      expect(deleted).toBe(true);
    });
  });
});
