import type { Prisma } from '../../generated/prisma/client';

export interface ScaleSeedConfig {
  readonly organizationPrefix: string;
  readonly primaryOrgId: string;
  readonly secondaryOrgId: string;
  readonly primaryAccountId: string;
  readonly secondaryAccountId: string;
  readonly regionCount: number;
  readonly metricCount: number;
  readonly periodMonths: number;
  readonly dimensions: ReadonlyArray<Record<string, string>>;
  readonly datasetVersionCount: number;
}

export interface SeedOrganization {
  readonly id: string;
  readonly name: string;
}

export interface SeedAccount {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
}

export interface SeedMembership {
  readonly id: string;
  readonly organizationId: string;
  readonly accountId: string;
  readonly role: 'owner' | 'admin' | 'analyst' | 'viewer';
}

export interface SeedRegion {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly countryCode: string;
  readonly summary: string;
}

export interface SeedStoredObject {
  readonly id: string;
  readonly organizationId: string;
  readonly objectKey: string;
  readonly bucket: string;
  readonly originalFilename: string;
  readonly mediaType: string;
  readonly byteCount: bigint;
  readonly checksumAlgorithm: string;
  readonly checksumHex: string;
  readonly state: 'accepted';
}

export interface SeedUpload {
  readonly id: string;
  readonly organizationId: string;
  readonly actorAccountId: string;
  readonly storedObjectId: string;
  readonly declaredFilename: string;
  readonly declaredMediaType: string;
  readonly declaredByteCount: bigint;
  readonly checksumAlgorithm: string;
  readonly checksumHex: string;
  readonly state: 'accepted';
  readonly progressStage: string;
  readonly progressPercent: number;
  readonly version: number;
  readonly presignedUploadExpiresAt: Date;
  readonly expiresAt: Date;
  readonly completedAt: Date;
  readonly acceptedAt: Date;
}

export interface SeedDataset {
  readonly id: string;
  readonly organizationId: string;
  readonly ownerAccountId: string;
  readonly name: string;
  readonly description: string;
  readonly state: 'active';
}

export interface SeedColumnMapping {
  readonly id: string;
  readonly organizationId: string;
  readonly datasetId: string;
  readonly uploadId: string;
  readonly createdByAccountId: string;
  readonly versionNumber: number;
  readonly mapping: Prisma.InputJsonValue;
  readonly validationStatus: 'valid';
}

export interface SeedDatasetVersion {
  readonly id: string;
  readonly organizationId: string;
  readonly datasetId: string;
  readonly versionNumber: number;
  readonly sourceUploadId: string;
  readonly storedObjectId: string;
  readonly mappingId: string;
  readonly publicationStatus: 'published';
  readonly checksumHex: string;
  readonly sourceSummary: Prisma.InputJsonValue;
  readonly publishedAt: Date;
}

export interface SeedMetricDefinition {
  readonly id: string;
  readonly organizationId: string;
  readonly datasetId: string;
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly valueType: 'numeric' | 'text' | 'boolean';
  readonly canonicalUnit: string;
  readonly allowedAggregation: 'sum' | 'avg' | 'min' | 'max' | 'count';
  readonly calculationVersion: string;
  readonly status: 'active';
}

export interface SeedMetricObservation {
  readonly id: string;
  readonly organizationId: string;
  readonly datasetVersionId: string;
  readonly regionId: string;
  readonly metricDefinitionId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly periodLabel: string;
  readonly numericValue: Prisma.Decimal;
  readonly unit: string;
  readonly dimensionHash: string;
  readonly dimensions: Prisma.InputJsonValue;
  readonly sourceRowNumber: number;
}

export interface SeedObservationQuality {
  readonly id: string;
  readonly organizationId: string;
  readonly observationId: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly state:
    | 'valid'
    | 'coerced'
    | 'missing'
    | 'invalid'
    | 'duplicate'
    | 'low_confidence';
  readonly code: string;
  readonly message: string;
  readonly details: Prisma.InputJsonValue;
}

export interface SeedMetricAggregate {
  readonly id: string;
  readonly organizationId: string;
  readonly datasetVersionId: string;
  readonly metricDefinitionId: string;
  readonly regionId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly dimensionHash: string;
  readonly dimensions: Prisma.InputJsonValue;
  readonly aggregateType: 'sum' | 'avg' | 'min' | 'max' | 'count';
  readonly numericValue: Prisma.Decimal;
  readonly unit: string;
  readonly calculationVersion: string;
  readonly observationCount: number;
  readonly qualitySummary: Prisma.InputJsonValue;
  readonly datasetVersionIds: Prisma.InputJsonValue;
}

export interface SeedMetricAggregateLineage {
  readonly id: string;
  readonly organizationId: string;
  readonly aggregateId: string;
  readonly observationId: string;
  readonly datasetVersionId: string;
}

export interface SeedDashboardView {
  readonly id: string;
  readonly organizationId: string;
  readonly ownerAccountId: string;
  readonly name: string;
  readonly description: string;
  readonly filters: Prisma.InputJsonValue;
  readonly presentation: Prisma.InputJsonValue;
  readonly status: 'active';
}

export interface DeterministicSeedPlan {
  readonly config: ScaleSeedConfig;
  readonly organizations: SeedOrganization[];
  readonly accounts: SeedAccount[];
  readonly memberships: SeedMembership[];
  readonly regions: SeedRegion[];
  readonly storedObjects: SeedStoredObject[];
  readonly uploads: SeedUpload[];
  readonly datasets: SeedDataset[];
  readonly columnMappings: SeedColumnMapping[];
  readonly datasetVersions: SeedDatasetVersion[];
  readonly metricDefinitions: SeedMetricDefinition[];
  readonly metricObservations: SeedMetricObservation[];
  readonly observationQualities: SeedObservationQuality[];
  readonly metricAggregates: SeedMetricAggregate[];
  readonly metricAggregateLineages: SeedMetricAggregateLineage[];
  readonly dashboardViews: SeedDashboardView[];
}

export interface SeedSampleIds {
  readonly primaryOrgId: string;
  readonly secondaryOrgId: string;
  readonly primaryAccountId: string;
  readonly secondaryAccountId: string;
  readonly metricId: string;
  readonly regionId: string;
  readonly datasetVersionId: string;
  readonly dimensionHash: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly aggregateId: string;
  readonly viewId: string;
}

export interface SeedSummary {
  readonly organizationCount: number;
  readonly accountCount: number;
  readonly regionCount: number;
  readonly datasetCount: number;
  readonly datasetVersionCount: number;
  readonly metricDefinitionCount: number;
  readonly observationCount: number;
  readonly observationQualityCount: number;
  readonly aggregateCount: number;
  readonly aggregateLineageCount: number;
  readonly dashboardViewCount: number;
  readonly sampleIds: SeedSampleIds;
}
