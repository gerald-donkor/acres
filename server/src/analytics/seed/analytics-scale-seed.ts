import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { dimensionHash } from '../mapping';
import type {
  DeterministicSeedPlan,
  ScaleSeedConfig,
  SeedAccount,
  SeedColumnMapping,
  SeedDashboardView,
  SeedDataset,
  SeedDatasetVersion,
  SeedMembership,
  SeedMetricAggregate,
  SeedMetricAggregateLineage,
  SeedMetricDefinition,
  SeedMetricObservation,
  SeedObservationQuality,
  SeedOrganization,
  SeedRegion,
  SeedStoredObject,
  SeedSummary,
  SeedUpload,
} from './analytics-scale-seed.types';

export function deterministicUuid(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    'a' + hash.substring(17, 20),
    hash.substring(20, 32),
  ].join('-');
}

const DUMMY_BCRYPT_HASH =
  '$2a$10$wT5g80nQk1d7c4pI7KzBqeYtL1m0vO3jZgM7eA3q2s6r1t4w6y8u2';

export const DEFAULT_SCALE_CONFIG: ScaleSeedConfig = {
  organizationPrefix: 'scale-seed-',
  primaryOrgId: deterministicUuid('scale-seed-org-primary'),
  secondaryOrgId: deterministicUuid('scale-seed-org-secondary'),
  primaryAccountId: deterministicUuid('scale-seed-acc-primary'),
  secondaryAccountId: deterministicUuid('scale-seed-acc-secondary'),
  regionCount: 6,
  metricCount: 4,
  periodMonths: 12,
  dimensions: [
    { segment: 'urban' },
    { segment: 'suburban' },
    { segment: 'rural' },
  ],
  datasetVersionCount: 2,
};

const METRIC_SPECS: ReadonlyArray<{
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count';
}> = [
  {
    key: 'synthetic_metric_01',
    label: 'Synthetic Metric 01 (Sum)',
    unit: 'count',
    aggregation: 'sum',
  },
  {
    key: 'synthetic_metric_02',
    label: 'Synthetic Metric 02 (Average)',
    unit: 'ratio',
    aggregation: 'avg',
  },
  {
    key: 'synthetic_metric_03',
    label: 'Synthetic Metric 03 (Count)',
    unit: 'units',
    aggregation: 'count',
  },
  {
    key: 'synthetic_metric_04',
    label: 'Synthetic Metric 04 (Max)',
    unit: 'index',
    aggregation: 'max',
  },
];

export function buildDeterministicSeedPlan(
  customConfig?: Partial<ScaleSeedConfig>,
): DeterministicSeedPlan {
  const config: ScaleSeedConfig = {
    ...DEFAULT_SCALE_CONFIG,
    ...customConfig,
  };

  const organizations: SeedOrganization[] = [
    {
      id: config.primaryOrgId,
      name: 'Synthetic Scale Primary Org',
    },
    {
      id: config.secondaryOrgId,
      name: 'Synthetic Scale Secondary Org',
    },
  ];

  const accounts: SeedAccount[] = [
    {
      id: config.primaryAccountId,
      email: `${config.organizationPrefix}primary@acres.test`,
      displayName: 'Synthetic Scale Primary Owner',
      passwordHash: DUMMY_BCRYPT_HASH,
    },
    {
      id: config.secondaryAccountId,
      email: `${config.organizationPrefix}secondary@acres.test`,
      displayName: 'Synthetic Scale Secondary Owner',
      passwordHash: DUMMY_BCRYPT_HASH,
    },
  ];

  const memberships: SeedMembership[] = [
    {
      id: deterministicUuid(`${config.primaryOrgId}-membership`),
      organizationId: config.primaryOrgId,
      accountId: config.primaryAccountId,
      role: 'owner',
    },
    {
      id: deterministicUuid(`${config.secondaryOrgId}-membership`),
      organizationId: config.secondaryOrgId,
      accountId: config.secondaryAccountId,
      role: 'owner',
    },
  ];

  const regions: SeedRegion[] = [];
  for (let r = 0; r < config.regionCount; r++) {
    const numStr = String(r + 1).padStart(3, '0');
    regions.push({
      id: deterministicUuid(`scale-seed-region-${numStr}`),
      slug: `synthetic-scale-region-${numStr}`,
      name: `Synthetic Scale Region ${numStr}`,
      countryCode: 'US',
      summary: `Synthetic region ${numStr} for deterministic plan testing.`,
    });
  }

  const storedObjects: SeedStoredObject[] = [];
  const uploads: SeedUpload[] = [];
  const datasets: SeedDataset[] = [];
  const columnMappings: SeedColumnMapping[] = [];
  const datasetVersions: SeedDatasetVersion[] = [];
  const metricDefinitions: SeedMetricDefinition[] = [];
  const metricObservations: SeedMetricObservation[] = [];
  const observationQualities: SeedObservationQuality[] = [];
  const metricAggregates: SeedMetricAggregate[] = [];
  const metricAggregateLineages: SeedMetricAggregateLineage[] = [];
  const dashboardViews: SeedDashboardView[] = [];

  // Generate primary organization dataset, metrics, observations, aggregates
  const primaryDatasetId = deterministicUuid(`${config.primaryOrgId}-dataset`);
  datasets.push({
    id: primaryDatasetId,
    organizationId: config.primaryOrgId,
    ownerAccountId: config.primaryAccountId,
    name: 'Synthetic Scale Dataset Primary',
    description: 'Deterministic scale dataset for plan verification.',
    state: 'active',
  });

  const primaryVersionIds: string[] = [];
  for (let v = 1; v <= config.datasetVersionCount; v++) {
    const storedObjId = deterministicUuid(`${config.primaryOrgId}-obj-v${v}`);
    storedObjects.push({
      id: storedObjId,
      organizationId: config.primaryOrgId,
      objectKey: `scale-seed/primary-v${v}.csv`,
      bucket: 'acres-quarantine',
      originalFilename: `scale-seed-v${v}.csv`,
      mediaType: 'text/csv',
      byteCount: BigInt(2048),
      checksumAlgorithm: 'sha256',
      checksumHex:
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      state: 'accepted',
    });

    const uploadId = deterministicUuid(`${config.primaryOrgId}-upload-v${v}`);
    uploads.push({
      id: uploadId,
      organizationId: config.primaryOrgId,
      actorAccountId: config.primaryAccountId,
      storedObjectId: storedObjId,
      declaredFilename: `scale-seed-v${v}.csv`,
      declaredMediaType: 'text/csv',
      declaredByteCount: BigInt(2048),
      checksumAlgorithm: 'sha256',
      checksumHex:
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      state: 'accepted',
      progressStage: 'complete',
      progressPercent: 100,
      version: 1,
      presignedUploadExpiresAt: new Date('2035-01-01T00:00:00Z'),
      expiresAt: new Date('2035-01-01T00:00:00Z'),
      completedAt: new Date('2026-01-01T00:00:00Z'),
      acceptedAt: new Date('2026-01-01T00:00:00Z'),
    });

    const mappingId = deterministicUuid(`${config.primaryOrgId}-mapping-v${v}`);
    columnMappings.push({
      id: mappingId,
      organizationId: config.primaryOrgId,
      datasetId: primaryDatasetId,
      uploadId,
      createdByAccountId: config.primaryAccountId,
      versionNumber: v,
      mapping: {
        regionCodeColumn: 'geoid',
        metrics: METRIC_SPECS.map((spec) => ({
          column: spec.key,
          key: spec.key,
          label: spec.label,
          valueType: 'numeric',
          unit: spec.unit,
          aggregation: spec.aggregation,
          periodColumn: 'period',
          dimensionColumns: ['segment'],
        })),
      },
      validationStatus: 'valid',
    });

    const versionId = deterministicUuid(`${config.primaryOrgId}-version-v${v}`);
    primaryVersionIds.push(versionId);
    datasetVersions.push({
      id: versionId,
      organizationId: config.primaryOrgId,
      datasetId: primaryDatasetId,
      versionNumber: v,
      sourceUploadId: uploadId,
      storedObjectId: storedObjId,
      mappingId,
      publicationStatus: 'published',
      checksumHex:
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      sourceSummary: { rowCount: 1728, columnCount: 6 },
      publishedAt: new Date(Date.UTC(2026, v - 1, 1, 0, 0, 0, 0)),
    });
  }

  const primaryMetricIds: string[] = [];
  for (let m = 0; m < config.metricCount; m++) {
    const spec = METRIC_SPECS[m];
    const metricId = deterministicUuid(
      `${config.primaryOrgId}-metric-${spec.key}`,
    );
    primaryMetricIds.push(metricId);
    metricDefinitions.push({
      id: metricId,
      organizationId: config.primaryOrgId,
      datasetId: primaryDatasetId,
      key: spec.key,
      label: spec.label,
      description: `Synthetic metric ${spec.key} for query plan testing.`,
      valueType: 'numeric',
      canonicalUnit: spec.unit,
      allowedAggregation: spec.aggregation,
      calculationVersion: '1.0.0',
      status: 'active',
    });
  }

  let rowCounter = 1;
  for (let vIdx = 0; vIdx < primaryVersionIds.length; vIdx++) {
    const datasetVersionId = primaryVersionIds[vIdx];
    const v = vIdx + 1;

    for (let r = 0; r < regions.length; r++) {
      const region = regions[r];

      for (let m = 0; m < config.metricCount; m++) {
        const metricId = primaryMetricIds[m];
        const spec = METRIC_SPECS[m];

        for (let p = 0; p < config.periodMonths; p++) {
          const periodStart = new Date(Date.UTC(2026, p, 1, 0, 0, 0, 0));
          const periodEnd = new Date(Date.UTC(2026, p + 1, 0, 23, 59, 59, 999));
          const periodLabel = `2026-${String(p + 1).padStart(2, '0')}`;

          for (let d = 0; d < config.dimensions.length; d++) {
            const dims = config.dimensions[d];
            const dHash = dimensionHash(dims);
            const obsId = deterministicUuid(`obs-p-${v}-${r}-${m}-${p}-${d}`);
            const valNum = (
              (r + 1) * 1000 +
              (m + 1) * 100 +
              (p + 1) * 10 +
              (d + 1) * 2.5 +
              v * 0.5
            ).toFixed(6);
            const numericValue = new Prisma.Decimal(valNum);

            metricObservations.push({
              id: obsId,
              organizationId: config.primaryOrgId,
              datasetVersionId,
              regionId: region.id,
              metricDefinitionId: metricId,
              periodStart,
              periodEnd,
              periodLabel,
              numericValue,
              unit: spec.unit,
              dimensionHash: dHash,
              dimensions: dims,
              sourceRowNumber: rowCounter++,
            });

            if ((r + m + p + d) % 15 === 0) {
              observationQualities.push({
                id: deterministicUuid(`qual-p-${v}-${r}-${m}-${p}-${d}`),
                organizationId: config.primaryOrgId,
                observationId: obsId,
                severity: 'warning',
                state: 'valid',
                code: 'synthetic_quality_flag',
                message: 'Synthetic validation observation state note.',
                details: { flag: 'scale_test', index: rowCounter },
              });
            }

            const aggId = deterministicUuid(`agg-p-${v}-${r}-${m}-${p}-${d}`);
            metricAggregates.push({
              id: aggId,
              organizationId: config.primaryOrgId,
              datasetVersionId,
              metricDefinitionId: metricId,
              regionId: region.id,
              periodStart,
              periodEnd,
              dimensionHash: dHash,
              dimensions: dims,
              aggregateType: spec.aggregation,
              numericValue,
              unit: spec.unit,
              calculationVersion: '1.0.0',
              observationCount: 1,
              qualitySummary: { valid: 1, warning: 0 },
              datasetVersionIds: [datasetVersionId],
            });

            metricAggregateLineages.push({
              id: deterministicUuid(`lin-p-${v}-${r}-${m}-${p}-${d}`),
              organizationId: config.primaryOrgId,
              aggregateId: aggId,
              observationId: obsId,
              datasetVersionId,
            });
          }
        }
      }
    }
  }

  // Saved dashboard views for primary org
  dashboardViews.push(
    {
      id: deterministicUuid(`${config.primaryOrgId}-view-01`),
      organizationId: config.primaryOrgId,
      ownerAccountId: config.primaryAccountId,
      name: 'Scale Test Primary Overview',
      description: 'Primary saved dashboard view for scale testing.',
      filters: {
        metricId: primaryMetricIds[0],
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-12-31T23:59:59.999Z',
      },
      presentation: { chart: 'bar', compareBy: 'region' },
      status: 'active',
    },
    {
      id: deterministicUuid(`${config.primaryOrgId}-view-02`),
      organizationId: config.primaryOrgId,
      ownerAccountId: config.primaryAccountId,
      name: 'Scale Test Regional Breakdown',
      description: 'Secondary saved dashboard view for regional analysis.',
      filters: {
        metricId: primaryMetricIds[1],
        regionId: regions[0].id,
      },
      presentation: { chart: 'line', compareBy: 'period' },
      status: 'active',
    },
  );

  // Secondary organization data (small footprint to verify tenant isolation)
  const secondaryDatasetId = deterministicUuid(
    `${config.secondaryOrgId}-dataset`,
  );
  datasets.push({
    id: secondaryDatasetId,
    organizationId: config.secondaryOrgId,
    ownerAccountId: config.secondaryAccountId,
    name: 'Synthetic Scale Dataset Secondary',
    description: 'Tenant isolation verification dataset.',
    state: 'active',
  });

  const secStoredObjId = deterministicUuid(`${config.secondaryOrgId}-obj-v1`);
  storedObjects.push({
    id: secStoredObjId,
    organizationId: config.secondaryOrgId,
    objectKey: `scale-seed/secondary-v1.csv`,
    bucket: 'acres-quarantine',
    originalFilename: 'scale-seed-sec-v1.csv',
    mediaType: 'text/csv',
    byteCount: BigInt(512),
    checksumAlgorithm: 'sha256',
    checksumHex:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    state: 'accepted',
  });

  const secUploadId = deterministicUuid(`${config.secondaryOrgId}-upload-v1`);
  uploads.push({
    id: secUploadId,
    organizationId: config.secondaryOrgId,
    actorAccountId: config.secondaryAccountId,
    storedObjectId: secStoredObjId,
    declaredFilename: 'scale-seed-sec-v1.csv',
    declaredMediaType: 'text/csv',
    declaredByteCount: BigInt(512),
    checksumAlgorithm: 'sha256',
    checksumHex:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    state: 'accepted',
    progressStage: 'complete',
    progressPercent: 100,
    version: 1,
    presignedUploadExpiresAt: new Date('2035-01-01T00:00:00Z'),
    expiresAt: new Date('2035-01-01T00:00:00Z'),
    completedAt: new Date('2026-01-01T00:00:00Z'),
    acceptedAt: new Date('2026-01-01T00:00:00Z'),
  });

  const secMappingId = deterministicUuid(`${config.secondaryOrgId}-mapping-v1`);
  columnMappings.push({
    id: secMappingId,
    organizationId: config.secondaryOrgId,
    datasetId: secondaryDatasetId,
    uploadId: secUploadId,
    createdByAccountId: config.secondaryAccountId,
    versionNumber: 1,
    mapping: {
      regionCodeColumn: 'geoid',
      metrics: [
        {
          column: 'synthetic_metric_01',
          key: 'synthetic_metric_01',
          valueType: 'numeric',
          unit: 'count',
          aggregation: 'sum',
        },
      ],
    },
    validationStatus: 'valid',
  });

  const secVersionId = deterministicUuid(`${config.secondaryOrgId}-version-v1`);
  datasetVersions.push({
    id: secVersionId,
    organizationId: config.secondaryOrgId,
    datasetId: secondaryDatasetId,
    versionNumber: 1,
    sourceUploadId: secUploadId,
    storedObjectId: secStoredObjId,
    mappingId: secMappingId,
    publicationStatus: 'published',
    checksumHex:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sourceSummary: { rowCount: 6, columnCount: 3 },
    publishedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0)),
  });

  const secMetricId = deterministicUuid(
    `${config.secondaryOrgId}-metric-synthetic_metric_01`,
  );
  metricDefinitions.push({
    id: secMetricId,
    organizationId: config.secondaryOrgId,
    datasetId: secondaryDatasetId,
    key: 'synthetic_metric_01',
    label: 'Synthetic Secondary Metric 01',
    description: 'Secondary tenant metric.',
    valueType: 'numeric',
    canonicalUnit: 'count',
    allowedAggregation: 'sum',
    calculationVersion: '1.0.0',
    status: 'active',
  });

  for (let r = 0; r < 2; r++) {
    const region = regions[r];
    for (let p = 0; p < 3; p++) {
      const periodStart = new Date(Date.UTC(2026, p, 1, 0, 0, 0, 0));
      const periodEnd = new Date(Date.UTC(2026, p + 1, 0, 23, 59, 59, 999));
      const periodLabel = `2026-${String(p + 1).padStart(2, '0')}`;
      const dHash = dimensionHash(config.dimensions[0]);
      const obsId = deterministicUuid(`obs-s-1-${r}-0-${p}-0`);
      const valNum = ((r + 1) * 500 + (p + 1) * 20).toFixed(6);
      const numericValue = new Prisma.Decimal(valNum);

      metricObservations.push({
        id: obsId,
        organizationId: config.secondaryOrgId,
        datasetVersionId: secVersionId,
        regionId: region.id,
        metricDefinitionId: secMetricId,
        periodStart,
        periodEnd,
        periodLabel,
        numericValue,
        unit: 'count',
        dimensionHash: dHash,
        dimensions: config.dimensions[0],
        sourceRowNumber: rowCounter++,
      });

      const aggId = deterministicUuid(`agg-s-1-${r}-0-${p}-0`);
      metricAggregates.push({
        id: aggId,
        organizationId: config.secondaryOrgId,
        datasetVersionId: secVersionId,
        metricDefinitionId: secMetricId,
        regionId: region.id,
        periodStart,
        periodEnd,
        dimensionHash: dHash,
        dimensions: config.dimensions[0],
        aggregateType: 'sum',
        numericValue,
        unit: 'count',
        calculationVersion: '1.0.0',
        observationCount: 1,
        qualitySummary: { valid: 1, warning: 0 },
        datasetVersionIds: [secVersionId],
      });

      metricAggregateLineages.push({
        id: deterministicUuid(`lin-s-1-${r}-0-${p}-0`),
        organizationId: config.secondaryOrgId,
        aggregateId: aggId,
        observationId: obsId,
        datasetVersionId: secVersionId,
      });
    }
  }

  dashboardViews.push({
    id: deterministicUuid(`${config.secondaryOrgId}-view-01`),
    organizationId: config.secondaryOrgId,
    ownerAccountId: config.secondaryAccountId,
    name: 'Scale Test Secondary View',
    description: 'Secondary tenant saved view.',
    filters: { metricId: secMetricId },
    presentation: { chart: 'bar', compareBy: 'region' },
    status: 'active',
  });

  return {
    config,
    organizations,
    accounts,
    memberships,
    regions,
    storedObjects,
    uploads,
    datasets,
    columnMappings,
    datasetVersions,
    metricDefinitions,
    metricObservations,
    observationQualities,
    metricAggregates,
    metricAggregateLineages,
    dashboardViews,
  };
}

export async function cleanScaleSeed(
  prisma: PrismaClient,
  plan: DeterministicSeedPlan,
): Promise<void> {
  const orgIds = plan.organizations.map((org) => org.id);
  const regionSlugs = plan.regions.map((region) => region.slug);
  const accountIds = plan.accounts.map((acc) => acc.id);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`
        SELECT
          set_config('acres.worker_access', 'true', true),
          set_config('acres.organization_id', '', true)
      `;

      await tx.dashboardView.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await tx.metricAggregateLineage.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await tx.metricAggregate.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await tx.observationQuality.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await tx.metricObservation.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await tx.metricDefinition.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await tx.datasetVersion.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await tx.columnMapping.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await tx.dataset.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await tx.upload.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await tx.storedObject.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await tx.membership.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await tx.organization.deleteMany({
        where: { id: { in: orgIds } },
      });
      await tx.account.deleteMany({
        where: { id: { in: accountIds } },
      });
      await tx.region.deleteMany({
        where: { slug: { in: regionSlugs } },
      });
    },
    { timeout: 30000 },
  );
}

export async function seedAnalyticsScale(
  prisma: PrismaClient,
  customPlan?: DeterministicSeedPlan,
): Promise<SeedSummary> {
  const plan = customPlan ?? buildDeterministicSeedPlan();

  await cleanScaleSeed(prisma, plan);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`
        SELECT
          set_config('acres.worker_access', 'true', true),
          set_config('acres.organization_id', '', true)
      `;

      for (const org of plan.organizations) {
        await tx.organization.create({
          data: {
            id: org.id,
            name: org.name,
          },
        });
      }

      for (const acc of plan.accounts) {
        await tx.account.create({
          data: {
            id: acc.id,
            email: acc.email,
            displayName: acc.displayName,
            passwordHash: acc.passwordHash,
          },
        });
      }

      for (const mem of plan.memberships) {
        await tx.membership.create({
          data: {
            id: mem.id,
            organizationId: mem.organizationId,
            accountId: mem.accountId,
            role: mem.role,
          },
        });
      }

      for (const reg of plan.regions) {
        await tx.region.create({
          data: {
            id: reg.id,
            slug: reg.slug,
            name: reg.name,
            countryCode: reg.countryCode,
            summary: reg.summary,
          },
        });
      }

      for (const obj of plan.storedObjects) {
        await tx.storedObject.create({ data: obj });
      }

      for (const up of plan.uploads) {
        await tx.upload.create({ data: up });
      }

      for (const ds of plan.datasets) {
        await tx.dataset.create({ data: ds });
      }

      for (const cm of plan.columnMappings) {
        await tx.columnMapping.create({ data: cm });
      }

      for (const dv of plan.datasetVersions) {
        await tx.datasetVersion.create({ data: dv });
      }

      for (const md of plan.metricDefinitions) {
        await tx.metricDefinition.create({ data: md });
      }

      if (plan.metricObservations.length > 0) {
        await tx.metricObservation.createMany({
          data: plan.metricObservations,
        });
      }

      if (plan.observationQualities.length > 0) {
        await tx.observationQuality.createMany({
          data: plan.observationQualities,
        });
      }

      if (plan.metricAggregates.length > 0) {
        await tx.metricAggregate.createMany({
          data: plan.metricAggregates,
        });
      }

      if (plan.metricAggregateLineages.length > 0) {
        await tx.metricAggregateLineage.createMany({
          data: plan.metricAggregateLineages,
        });
      }

      for (const view of plan.dashboardViews) {
        await tx.dashboardView.create({ data: view });
      }
    },
    { timeout: 60000 },
  );

  return {
    organizationCount: plan.organizations.length,
    accountCount: plan.accounts.length,
    regionCount: plan.regions.length,
    datasetCount: plan.datasets.length,
    datasetVersionCount: plan.datasetVersions.length,
    metricDefinitionCount: plan.metricDefinitions.length,
    observationCount: plan.metricObservations.length,
    observationQualityCount: plan.observationQualities.length,
    aggregateCount: plan.metricAggregates.length,
    aggregateLineageCount: plan.metricAggregateLineages.length,
    dashboardViewCount: plan.dashboardViews.length,
    sampleIds: {
      primaryOrgId: plan.config.primaryOrgId,
      secondaryOrgId: plan.config.secondaryOrgId,
      primaryAccountId: plan.config.primaryAccountId,
      secondaryAccountId: plan.config.secondaryAccountId,
      metricId: plan.metricDefinitions[0].id,
      regionId: plan.regions[0].id,
      datasetVersionId: plan.datasetVersions[0].id,
      dimensionHash: plan.metricObservations[0].dimensionHash,
      periodStart: plan.metricObservations[0].periodStart,
      periodEnd: plan.metricObservations[0].periodEnd,
      aggregateId: plan.metricAggregates[0].id,
      viewId: plan.dashboardViews[0].id,
    },
  };
}
