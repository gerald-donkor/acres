import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PostgisRegionGeometryRepository } from './postgis-region-geometry.repository';
import type { NormalizedGeoBoundariesLayer } from './geoboundaries.types';

type Tx = Prisma.TransactionClient;

export class GeoBoundariesImportError extends Error {
  constructor(
    readonly category: 'hierarchy' | 'checksum' | 'database',
    message: string,
  ) {
    super(message);
    this.name = 'GeoBoundariesImportError';
  }
}

export interface GeoBoundariesImportResult {
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly regionCount: number;
  readonly unchanged: boolean;
}

function slug(feature: {
  shapeId: string;
  shapeGroup: string;
  shapeType: string;
}): string {
  const digest = createHash('sha256')
    .update(`${feature.shapeGroup}/${feature.shapeType}/${feature.shapeId}`)
    .digest('hex')
    .slice(0, 16);
  return `gb-${feature.shapeGroup.toLowerCase()}-${feature.shapeType.toLowerCase()}-${digest}`;
}

@Injectable()
export class GeoBoundariesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geometries: PostgisRegionGeometryRepository,
  ) {}

  async importLayers(
    layers: readonly NormalizedGeoBoundariesLayer[],
    manifestIdentity: string,
    dryRun = false,
  ): Promise<GeoBoundariesImportResult> {
    if (layers.length === 0)
      throw new GeoBoundariesImportError(
        'database',
        'At least one normalized layer is required.',
      );
    for (const normalized of layers) {
      if (
        normalized.layer.level >= 'ADM2' &&
        normalized.layer.hierarchyMode === 'unresolved'
      )
        throw new GeoBoundariesImportError(
          'hierarchy',
          `${normalized.layer.countryCode}/${normalized.layer.level} has no reviewed parent map; publication is blocked.`,
        );
    }
    const sourceVersion = `gbOpen-${manifestIdentity.slice(0, 32)}`;
    if (dryRun)
      return {
        sourceId: 'dry-run',
        sourceVersion,
        regionCount: layers.reduce(
          (sum, item) => sum + item.features.length,
          0,
        ),
        unchanged: false,
      };
    try {
      return await this.prisma.$transaction(async (tx) =>
        this.persist(tx, layers, sourceVersion),
      );
    } catch (error) {
      if (error instanceof GeoBoundariesImportError) throw error;
      throw new GeoBoundariesImportError(
        'database',
        'Database transaction failed; no geography source revision was published.',
      );
    }
  }

  private async persist(
    tx: Tx,
    layers: readonly NormalizedGeoBoundariesLayer[],
    sourceVersion: string,
  ): Promise<GeoBoundariesImportResult> {
    const first = layers[0].layer;
    const source = await tx.regionSource.upsert({
      where: {
        provider_codeSystem_sourceVersion: {
          provider: 'geoBoundaries',
          codeSystem: 'gbOpen',
          sourceVersion,
        },
      },
      create: {
        name: 'geoBoundaries gbOpen administrative boundaries',
        provider: 'geoBoundaries',
        codeSystem: 'gbOpen',
        sourceVersion,
        sourceDate: new Date(first.buildDate),
        license: 'CC BY 4.0',
        provenanceUrl: 'https://www.geoboundaries.org/',
        redistributionNotes: `${first.attribution} ${first.modificationNote}`,
      },
      update: {},
    });
    const all = layers.flatMap((item) =>
      item.features.map((feature) => ({ feature, layer: item.layer })),
    );
    const existing = await tx.regionCode.findMany({
      where: {
        sourceId: source.id,
        codeSystem: 'geoBoundaries:shapeID',
        normalized: { in: all.map(({ feature }) => feature.shapeId) },
      },
      select: { normalized: true, regionId: true },
    });
    const existingByCode = new Map(
      existing.map((row) => [row.normalized, row.regionId]),
    );
    const regions = new Map<string, string>();
    for (const { feature, layer } of all) {
      let regionId = existingByCode.get(feature.shapeId);
      if (!regionId) {
        const parentId =
          layer.level === 'ADM1'
            ? regions.get(`${layer.countryCode}/ADM0`)
            : undefined;
        if (layer.level === 'ADM1' && !parentId)
          throw new GeoBoundariesImportError(
            'hierarchy',
            `ADM1 ${layer.countryCode} requires its ADM0 layer in the same manifest.`,
          );
        const region = await tx.region.upsert({
          where: { slug: slug(feature) },
          create: {
            slug: slug(feature),
            name: feature.shapeName,
            countryCode: feature.shapeGroup,
            level: layer.level,
            regionType: 'administrative',
            parentId,
          },
          update: { name: feature.shapeName, parentId },
        });
        regionId = region.id;
        await tx.regionCode.create({
          data: {
            regionId,
            sourceId: source.id,
            codeSystem: 'geoBoundaries:shapeID',
            code: feature.shapeId,
            normalized: feature.shapeId,
          },
        });
        await tx.regionAlias.create({
          data: {
            regionId,
            sourceId: source.id,
            alias: feature.shapeName,
            normalized: feature.shapeName.trim().toLowerCase(),
          },
        });
      }
      regions.set(`${layer.countryCode}/${layer.level}`, regionId);
      await this.geometries.writeGeometry(
        {
          regionId,
          sourceId: source.id,
          geometry: feature.geometry,
          sourcePrecision: 'geoBoundaries gbOpen',
          metadata: {
            boundaryId: layer.boundaryId,
            artifactUrl: layer.artifactUrl,
            sha256: layer.sha256,
            shapeId: feature.shapeId,
            representedYear: layer.representedYear,
            license: layer.boundaryLicense,
            licenseSource: layer.licenseSource,
          },
        },
        tx,
      );
    }
    return {
      sourceId: source.id,
      sourceVersion,
      regionCount: all.length,
      unchanged: existing.length === all.length,
    };
  }
}
