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

function providerIdentity(
  layer: { countryCode: string; level: string },
  shapeId: string,
): string {
  return `${layer.countryCode}/${layer.level}/${shapeId}`;
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
    const ordered = [...layers].sort((a, b) =>
      `${a.layer.countryCode}/${a.layer.level}`.localeCompare(
        `${b.layer.countryCode}/${b.layer.level}`,
      ),
    );
    for (const normalized of ordered) {
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
        this.persist(tx, ordered, sourceVersion),
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
    for (const item of layers.filter((item) => item.layer.level === 'ADM0')) {
      if (item.features.length !== 1)
        throw new GeoBoundariesImportError(
          'hierarchy',
          `${item.layer.countryCode}/ADM0 requires exactly one country root.`,
        );
    }
    const existing = await tx.regionCode.findMany({
      where: {
        sourceId: source.id,
        codeSystem: 'geoBoundaries:shapeID',
        normalized: {
          in: all.map(({ feature, layer }) =>
            providerIdentity(layer, feature.shapeId),
          ),
        },
      },
      select: {
        normalized: true,
        regionId: true,
        region: { select: { parentId: true } },
      },
    });
    const existingByCode = new Map(
      existing.map((row) => [row.normalized, row]),
    );
    const existingRegions = await tx.region.findMany({
      where: { slug: { in: all.map(({ feature }) => slug(feature)) } },
      select: { id: true, slug: true, parentId: true },
    });
    const existingRegionBySlug = new Map(
      existingRegions.map((region) => [region.slug, region]),
    );
    const regions = new Map<string, string>();
    for (const { feature, layer } of all) {
      const identity = providerIdentity(layer, feature.shapeId);
      const prior = existingByCode.get(identity);
      const existingRegion = existingRegionBySlug.get(slug(feature));
      let regionId = prior?.regionId ?? existingRegion?.id;
      let parentId: string | undefined;
      if (layer.level === 'ADM1') {
        parentId = regions.get(
          `${layer.countryCode}/ADM0/${layers.find((item) => item.layer.countryCode === layer.countryCode && item.layer.level === 'ADM0')?.features[0]?.shapeId ?? ''}`,
        );
      } else if (layer.level !== 'ADM0') {
        const parentShapeId = layer.explicitParentMap?.[feature.shapeId];
        const parentLevel = `ADM${Number(layer.level.slice(3)) - 1}`;
        parentId = parentShapeId
          ? regions.get(`${layer.countryCode}/${parentLevel}/${parentShapeId}`)
          : undefined;
      }
      if (layer.level !== 'ADM0' && !parentId)
        throw new GeoBoundariesImportError(
          'hierarchy',
          `${layer.countryCode}/${layer.level} has an unresolved parent.`,
        );
      if (existingRegion && existingRegion.parentId !== (parentId ?? null))
        throw new GeoBoundariesImportError(
          'hierarchy',
          'Existing region parent conflicts with reviewed hierarchy.',
        );
      if (!regionId) {
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
          update: { name: feature.shapeName },
        });
        regionId = region.id;
        await tx.regionCode.create({
          data: {
            regionId,
            sourceId: source.id,
            codeSystem: 'geoBoundaries:shapeID',
            code: feature.shapeId,
            normalized: identity,
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
      regions.set(identity, regionId);
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
