import type { INestApplication } from '@nestjs/common';
import { GeoBoundariesImportService } from '../src/geography/geoboundaries-import.service';
import { GeometryError } from '../src/geography/geometry.errors';
import type { NormalizedGeoBoundariesLayer } from '../src/geography/geoboundaries.types';
import type { GeoJsonPolygon } from '../src/geography/geography.types';
import { PostgisRegionGeometryRepository } from '../src/geography/postgis-region-geometry.repository';
import { PrismaService } from '../src/prisma/prisma.service';
import { createRealDbTestApp } from './helpers/real-db-test-app';

const fixture = 'p49-synthetic-20260831';
const validIdentity = `49a${'1'.repeat(61)}`;
const conflictIdentity = `49b${'2'.repeat(61)}`;
const rollbackIdentity = `49c${'3'.repeat(61)}`;
const sourceVersion = (identity: string) => `gbOpen-${identity.slice(0, 32)}`;

const polygon = (x: number) => ({
  type: 'Polygon' as const,
  coordinates: [
    [
      [x, 0] as const,
      [x + 0.5, 0] as const,
      [x + 0.5, 0.5] as const,
      [x, 0.5] as const,
      [x, 0] as const,
    ],
  ],
});

const layer = (
  level: 'ADM0' | 'ADM1' | 'ADM2' | 'ADM3',
  features: readonly {
    shapeId: string;
    shapeName: string;
    geometry: GeoJsonPolygon;
  }[],
  explicitParentMap?: Record<string, string>,
): NormalizedGeoBoundariesLayer => ({
  layer: {
    provider: 'geoBoundaries',
    releaseType: 'gbOpen',
    countryCode: 'ZZZ',
    level,
    boundaryId: `${fixture}-${level}`,
    representedYear: '2026',
    sourceUpdateDate: '2026-01-01T00:00:00.000Z',
    buildDate: '2026-01-01T00:00:00.000Z',
    boundarySource: 'synthetic',
    boundaryLicense: 'CC0-1.0',
    licenseDetail: 'synthetic fixture',
    licenseSource: 'https://fixtures.local/license',
    sourceUrl: 'https://fixtures.local/source',
    artifactUrl: 'https://fixtures.local/artifact',
    sha256: 'a'.repeat(64),
    byteLength: 1,
    featureCount: features.length,
    attribution: 'synthetic fixture',
    modificationNote: 'test only',
    hierarchyMode: level === 'ADM0' ? 'country-root' : 'explicit-parent-map',
    ...(explicitParentMap ? { explicitParentMap } : {}),
  },
  features: features.map((feature) => ({
    ...feature,
    shapeGroup: 'ZZZ',
    shapeType: level,
  })),
});

const validLayers = (): NormalizedGeoBoundariesLayer[] => [
  layer(
    'ADM2',
    [
      {
        shapeId: `${fixture}-child-1`,
        shapeName: `${fixture} child one`,
        geometry: polygon(2),
      },
      {
        shapeId: `${fixture}-child-2`,
        shapeName: `${fixture} child two`,
        geometry: polygon(3),
      },
      {
        shapeId: `${fixture}-child-3`,
        shapeName: `${fixture} child three`,
        geometry: polygon(4),
      },
    ],
    {
      [`${fixture}-child-1`]: `${fixture}-parent-1`,
      [`${fixture}-child-2`]: `${fixture}-parent-1`,
      [`${fixture}-child-3`]: `${fixture}-parent-2`,
    },
  ),
  layer('ADM0', [
    {
      shapeId: `${fixture}-root`,
      shapeName: `${fixture} root`,
      geometry: polygon(0),
    },
  ]),
  layer(
    'ADM3',
    [
      {
        shapeId: `${fixture}-deep`,
        shapeName: `${fixture} deep child`,
        geometry: polygon(5),
      },
    ],
    { [`${fixture}-deep`]: `${fixture}-child-1` },
  ),
  layer(
    'ADM1',
    [
      {
        shapeId: `${fixture}-parent-1`,
        shapeName: `${fixture} parent one`,
        geometry: polygon(1),
      },
      {
        shapeId: `${fixture}-parent-2`,
        shapeName: `${fixture} parent two`,
        geometry: polygon(1.5),
      },
    ],
    {
      [`${fixture}-parent-1`]: `${fixture}-root`,
      [`${fixture}-parent-2`]: `${fixture}-root`,
    },
  ),
];

describe('Geography database evidence', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService | undefined;
  let importer: GeoBoundariesImportService;
  let geometries: PostgisRegionGeometryRepository;
  const sourceIds = new Set<string>();
  const regionIds = new Set<string>();

  beforeAll(async () => {
    ({ app, prisma } = await createRealDbTestApp());
    try {
      await prisma.$queryRaw`SELECT PostGIS_Version()`;
      await prisma.$queryRaw`SELECT 1 FROM "RegionGeometry" LIMIT 1`;
    } catch {
      await app.close();
      app = undefined;
      throw new Error(
        'acres_test PostgreSQL/PostGIS is unreachable or unmigrated; start PostgreSQL, bootstrap roles, and deploy the committed migrations.',
      );
    }
    importer = app.get(GeoBoundariesImportService);
    geometries = app.get(PostgisRegionGeometryRepository);
  });

  afterAll(async () => {
    try {
      if (!prisma) return;
      const capturedSources = [...sourceIds];
      if (capturedSources.length > 0) {
        const sourceRegionCodes = await prisma.regionCode.findMany({
          where: { sourceId: { in: capturedSources } },
          select: { regionId: true },
        });
        sourceRegionCodes.forEach(({ regionId }) => regionIds.add(regionId));
      }
      const capturedRegions = [...regionIds];
      if (capturedSources.length > 0) {
        await prisma.regionGeometry.deleteMany({
          where: { sourceId: { in: capturedSources } },
        });
        await prisma.regionAlias.deleteMany({
          where: { sourceId: { in: capturedSources } },
        });
        await prisma.regionCode.deleteMany({
          where: { sourceId: { in: capturedSources } },
        });
      }
      if (capturedRegions.length > 0) {
        await prisma.region.deleteMany({
          where: { id: { in: capturedRegions } },
        });
      }
      if (capturedSources.length > 0) {
        await prisma.regionSource.deleteMany({
          where: { id: { in: capturedSources } },
        });
      }
    } finally {
      await app?.close();
    }
  });

  it('publishes a shuffled deep hierarchy and re-imports it idempotently', async () => {
    const layers = validLayers();
    expect(layers.map((item) => item.layer.level)).toEqual([
      'ADM2',
      'ADM0',
      'ADM3',
      'ADM1',
    ]);

    const first = await importer.importLayers(layers, validIdentity);
    sourceIds.add(first.sourceId);
    expect(first).toMatchObject({
      sourceVersion: sourceVersion(validIdentity),
      regionCount: 7,
      unchanged: false,
    });

    const source = await prisma!.regionSource.findUniqueOrThrow({
      where: { id: first.sourceId },
      select: {
        id: true,
        provider: true,
        codeSystem: true,
        sourceVersion: true,
      },
    });
    expect(source).toEqual({
      id: first.sourceId,
      provider: 'geoBoundaries',
      codeSystem: 'gbOpen',
      sourceVersion: sourceVersion(validIdentity),
    });

    const codes = await prisma!.regionCode.findMany({
      where: {
        sourceId: first.sourceId,
        codeSystem: 'geoBoundaries:shapeID',
      },
      select: {
        code: true,
        normalized: true,
        regionId: true,
        region: { select: { parentId: true } },
      },
      orderBy: { normalized: 'asc' },
      take: 20,
    });
    expect(codes).toHaveLength(7);
    codes.forEach((code) => {
      regionIds.add(code.regionId);
    });
    const byCode = new Map(codes.map((code) => [code.code, code]));
    for (const item of layers) {
      for (const feature of item.features) {
        expect(byCode.get(feature.shapeId)?.normalized).toBe(
          `ZZZ/${item.layer.level}/${feature.shapeId}`,
        );
      }
    }

    const id = (shapeId: string) => byCode.get(shapeId)!.regionId;
    expect(byCode.get(`${fixture}-root`)?.region.parentId).toBeNull();
    expect(byCode.get(`${fixture}-parent-1`)?.region.parentId).toBe(
      id(`${fixture}-root`),
    );
    expect(byCode.get(`${fixture}-parent-2`)?.region.parentId).toBe(
      id(`${fixture}-root`),
    );
    expect(byCode.get(`${fixture}-child-1`)?.region.parentId).toBe(
      id(`${fixture}-parent-1`),
    );
    expect(byCode.get(`${fixture}-child-2`)?.region.parentId).toBe(
      id(`${fixture}-parent-1`),
    );
    expect(byCode.get(`${fixture}-child-3`)?.region.parentId).toBe(
      id(`${fixture}-parent-2`),
    );
    expect(byCode.get(`${fixture}-deep`)?.region.parentId).toBe(
      id(`${fixture}-child-1`),
    );

    const aliases = await prisma!.regionAlias.findMany({
      where: { sourceId: first.sourceId },
      select: { regionId: true, normalized: true },
      orderBy: { regionId: 'asc' },
      take: 20,
    });
    const persistedGeometries = await prisma!.regionGeometry.findMany({
      where: { sourceId: first.sourceId },
      select: {
        regionId: true,
        srid: true,
        geometryType: true,
        isValid: true,
      },
      orderBy: { regionId: 'asc' },
      take: 20,
    });
    expect(aliases).toHaveLength(7);
    expect(new Set(aliases.map((alias) => alias.regionId))).toEqual(
      new Set(regionIds),
    );
    expect(persistedGeometries).toHaveLength(7);
    expect(
      persistedGeometries.every(
        (geometry) =>
          geometry.srid === 4326 &&
          geometry.geometryType === 'Polygon' &&
          geometry.isValid,
      ),
    ).toBe(true);

    const countsBeforeReimport = await scopedCounts(first.sourceId, [
      ...regionIds,
    ]);
    const parentsBefore = new Map(
      codes.map((code) => [code.regionId, code.region.parentId]),
    );
    const second = await importer.importLayers(layers, validIdentity);
    expect(second).toEqual({ ...first, unchanged: true });
    expect(await scopedCounts(first.sourceId, [...regionIds])).toEqual(
      countsBeforeReimport,
    );
    const parentsAfter = await prisma!.region.findMany({
      where: { id: { in: [...regionIds] } },
      select: { id: true, parentId: true },
      orderBy: { id: 'asc' },
      take: 20,
    });
    expect(new Map(parentsAfter.map((row) => [row.id, row.parentId]))).toEqual(
      parentsBefore,
    );

    const countsBeforeConflict = await scopedCounts(first.sourceId, [
      ...regionIds,
    ]);
    const reparented = validLayers().map((item) =>
      item.layer.level === 'ADM2'
        ? layer(
            item.layer.level,
            item.features.map((feature) => ({
              shapeId: feature.shapeId,
              shapeName: feature.shapeName,
              geometry: feature.geometry as GeoJsonPolygon,
            })),
            {
              [`${fixture}-child-1`]: `${fixture}-parent-2`,
              [`${fixture}-child-2`]: `${fixture}-parent-1`,
              [`${fixture}-child-3`]: `${fixture}-parent-2`,
            },
          )
        : item,
    );
    const originalChild = await prisma!.regionCode.findFirstOrThrow({
      where: {
        source: { sourceVersion: sourceVersion(validIdentity) },
        code: `${fixture}-child-1`,
      },
      select: { regionId: true, region: { select: { parentId: true } } },
    });

    await expect(
      importer.importLayers(reparented, conflictIdentity),
    ).rejects.toMatchObject({ category: 'hierarchy' });
    expect(
      await prisma!.regionSource.count({
        where: {
          provider: 'geoBoundaries',
          codeSystem: 'gbOpen',
          sourceVersion: sourceVersion(conflictIdentity),
        },
      }),
    ).toBe(0);
    expect(
      await prisma!.region.findUniqueOrThrow({
        where: { id: originalChild.regionId },
        select: { parentId: true },
      }),
    ).toEqual({ parentId: originalChild.region.parentId });
    expect(await scopedCounts(first.sourceId, [...regionIds])).toEqual(
      countsBeforeConflict,
    );
  });

  it('rolls back every row after a late invalid geometry', async () => {
    const rollbackPrefix = `${fixture}-rollback`;
    const invalidLayers = [
      layer('ADM0', [
        {
          shapeId: `${rollbackPrefix}-root`,
          shapeName: `${rollbackPrefix} root`,
          geometry: polygon(30),
        },
      ]),
      layer(
        'ADM1',
        [
          {
            shapeId: `${rollbackPrefix}-parent`,
            shapeName: `${rollbackPrefix} parent`,
            geometry: polygon(31),
          },
        ],
        { [`${rollbackPrefix}-parent`]: `${rollbackPrefix}-root` },
      ),
      layer(
        'ADM2',
        [
          {
            shapeId: `${rollbackPrefix}-child`,
            shapeName: `${rollbackPrefix} child`,
            geometry: polygon(32),
          },
        ],
        { [`${rollbackPrefix}-child`]: `${rollbackPrefix}-parent` },
      ),
      layer(
        'ADM3',
        [
          {
            shapeId: `${rollbackPrefix}-late`,
            shapeName: `${rollbackPrefix} late`,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 1],
                  [1, 0],
                  [0, 1],
                  [0, 0],
                ],
              ],
            },
          },
        ],
        { [`${rollbackPrefix}-late`]: `${rollbackPrefix}-child` },
      ),
    ];

    await expect(
      importer.importLayers(invalidLayers, rollbackIdentity),
    ).rejects.toMatchObject({ category: 'database' });
    expect(
      await prisma!.regionSource.count({
        where: {
          provider: 'geoBoundaries',
          codeSystem: 'gbOpen',
          sourceVersion: sourceVersion(rollbackIdentity),
        },
      }),
    ).toBe(0);
    const [regions, codes, aliases, geometryRows] = await Promise.all([
      prisma!.region.count({
        where: { name: { startsWith: rollbackPrefix } },
      }),
      prisma!.regionCode.count({
        where: {
          normalized: { startsWith: `ZZZ/ADM` },
          code: { startsWith: rollbackPrefix },
        },
      }),
      prisma!.regionAlias.count({
        where: { normalized: { startsWith: rollbackPrefix } },
      }),
      prisma!.regionGeometry.count({
        where: { region: { name: { startsWith: rollbackPrefix } } },
      }),
    ]);
    expect({ regions, codes, aliases, geometryRows }).toEqual({
      regions: 0,
      codes: 0,
      aliases: 0,
      geometryRows: 0,
    });
  });

  it('persists supported PostGIS types and preserves point semantics', async () => {
    const source = await prisma!.regionSource.create({
      data: {
        name: `${fixture} geometry source`,
        provider: `${fixture}-geometry`,
        codeSystem: 'synthetic',
        sourceVersion: 'v1',
        license: 'CC0-1.0',
        provenanceUrl: 'https://fixtures.local',
      },
    });
    sourceIds.add(source.id);

    const createRegion = async (kind: string) => {
      const region = await prisma!.region.create({
        data: {
          slug: `${fixture}-geometry-${kind}`,
          name: `${fixture} geometry ${kind}`,
          countryCode: 'ZZ',
          level: 'test',
          regionType: 'synthetic',
        },
      });
      regionIds.add(region.id);
      return region;
    };
    const polygonRegion = await createRegion('polygon');
    const pointRegion = await createRegion('point');
    const multiRegion = await createRegion('multipolygon');

    const polygonRecord = await geometries.writeGeometry({
      regionId: polygonRegion.id,
      sourceId: source.id,
      geometry: polygon(10),
    });
    const pointRecord = await geometries.writeGeometry({
      regionId: pointRegion.id,
      sourceId: source.id,
      geometry: { type: 'Point', coordinates: [11, 1] },
    });
    const multiRecord = await geometries.writeGeometry({
      regionId: multiRegion.id,
      sourceId: source.id,
      geometry: {
        type: 'MultiPolygon',
        coordinates: [polygon(12).coordinates],
      },
    });
    expect(
      [polygonRecord, pointRecord, multiRecord].map((record) => ({
        type: record.geometryType,
        srid: record.srid,
        valid: record.isValid,
      })),
    ).toEqual([
      { type: 'Polygon', srid: 4326, valid: true },
      { type: 'Point', srid: 4326, valid: true },
      { type: 'MultiPolygon', srid: 4326, valid: true },
    ]);
    expect(
      await prisma!.regionGeometry.count({ where: { sourceId: source.id } }),
    ).toBe(3);

    await expect(
      geometries.writeGeometry({
        regionId: polygonRegion.id,
        sourceId: source.id,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 1],
              [1, 0],
              [0, 1],
              [0, 0],
            ],
          ],
        },
      }),
    ).rejects.toBeInstanceOf(GeometryError);
    expect(
      await geometries.findByRegionAndSource(polygonRegion.id, source.id),
    ).toMatchObject({
      id: polygonRecord.id,
      geometryType: 'Polygon',
      isValid: true,
    });

    await expect(
      geometries.writeGeometry({
        regionId: '01918e95-7140-7000-8000-000000000999',
        sourceId: source.id,
        geometry: polygon(8),
      }),
    ).rejects.toMatchObject({ code: 'REFERENCE_NOT_FOUND' });
    await expect(
      geometries.writeGeometry({
        regionId: polygonRegion.id,
        sourceId: '01918e95-7140-7000-8000-000000000998',
        geometry: polygon(8),
      }),
    ).rejects.toMatchObject({ code: 'REFERENCE_NOT_FOUND' });

    const inside = await geometries.findRegionsContainingPoint({
      longitude: 10.25,
      latitude: 0.25,
    });
    const edge = await geometries.findRegionsContainingPoint({
      longitude: 10,
      latitude: 0.25,
    });
    const outside = await geometries.findRegionsContainingPoint({
      longitude: 20,
      latitude: 20,
    });
    expect(inside.some((row) => row.regionId === polygonRegion.id)).toBe(true);
    expect(edge.some((row) => row.regionId === polygonRegion.id)).toBe(true);
    expect(outside.some((row) => row.regionId === polygonRegion.id)).toBe(
      false,
    );
  });

  async function scopedCounts(sourceId: string, capturedRegionIds: string[]) {
    const [sources, regions, codes, aliases, geometryRows] = await Promise.all([
      prisma!.regionSource.count({ where: { id: sourceId } }),
      prisma!.region.count({ where: { id: { in: capturedRegionIds } } }),
      prisma!.regionCode.count({ where: { sourceId } }),
      prisma!.regionAlias.count({ where: { sourceId } }),
      prisma!.regionGeometry.count({ where: { sourceId } }),
    ]);
    return { sources, regions, codes, aliases, geometryRows };
  }
});
