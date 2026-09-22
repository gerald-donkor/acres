import {
  buildDeterministicSeedPlan,
  cleanScaleSeed,
  deterministicUuid,
  seedAnalyticsScale,
} from './analytics-scale-seed';
import type { PrismaClient } from '../../generated/prisma/client';

describe('analytics-scale-seed', () => {
  describe('deterministicUuid', () => {
    it('produces valid 36-character UUID strings deterministically', () => {
      const id1 = deterministicUuid('test-seed-1');
      const id2 = deterministicUuid('test-seed-1');
      const id3 = deterministicUuid('test-seed-2');

      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe('buildDeterministicSeedPlan', () => {
    it('generates a stable, reproducible dataset plan', () => {
      const plan1 = buildDeterministicSeedPlan();
      const plan2 = buildDeterministicSeedPlan();

      expect(plan1.organizations).toEqual(plan2.organizations);
      expect(plan1.metricDefinitions).toEqual(plan2.metricDefinitions);
      expect(plan1.metricObservations.length).toBe(
        plan2.metricObservations.length,
      );
      expect(plan1.metricAggregates.length).toBe(plan2.metricAggregates.length);
      expect(plan1.metricAggregateLineages.length).toBe(
        plan2.metricAggregateLineages.length,
      );
    });

    it('generates multi-tenant structures with isolated organizations and accounts', () => {
      const plan = buildDeterministicSeedPlan();

      expect(plan.organizations).toHaveLength(2);
      expect(plan.accounts).toHaveLength(2);

      const primaryOrg = plan.organizations[0];
      const secondaryOrg = plan.organizations[1];

      expect(primaryOrg.id).not.toBe(secondaryOrg.id);

      // Verify all primary observations belong to primaryOrg and secondary observations belong to secondaryOrg
      const primaryObservations = plan.metricObservations.filter(
        (o) => o.organizationId === primaryOrg.id,
      );
      const secondaryObservations = plan.metricObservations.filter(
        (o) => o.organizationId === secondaryOrg.id,
      );

      expect(primaryObservations.length).toBeGreaterThan(1000);
      expect(secondaryObservations.length).toBeGreaterThan(0);
      expect(primaryObservations.length + secondaryObservations.length).toBe(
        plan.metricObservations.length,
      );

      // Verify no cross-tenant foreign key leakage
      const primaryMetricIds = new Set(
        plan.metricDefinitions
          .filter((m) => m.organizationId === primaryOrg.id)
          .map((m) => m.id),
      );
      for (const obs of primaryObservations) {
        expect(primaryMetricIds.has(obs.metricDefinitionId)).toBe(true);
      }
    });

    it('satisfies relational integrity constraints for all generated entities', () => {
      const plan = buildDeterministicSeedPlan();

      const regionIds = new Set(plan.regions.map((r) => r.id));
      const datasetVersionIds = new Set(plan.datasetVersions.map((v) => v.id));
      const observationIds = new Set(plan.metricObservations.map((o) => o.id));
      const aggregateIds = new Set(plan.metricAggregates.map((a) => a.id));

      for (const obs of plan.metricObservations) {
        expect(regionIds.has(obs.regionId)).toBe(true);
        expect(datasetVersionIds.has(obs.datasetVersionId)).toBe(true);
        expect(obs.dimensionHash).toMatch(/^[0-9a-f]{64}$/);
        expect(obs.periodEnd.getTime()).toBeGreaterThan(
          obs.periodStart.getTime(),
        );
        expect(obs.numericValue).toBeDefined();
      }

      for (const agg of plan.metricAggregates) {
        expect(regionIds.has(agg.regionId)).toBe(true);
        expect(datasetVersionIds.has(agg.datasetVersionId)).toBe(true);
        expect(agg.dimensionHash).toMatch(/^[0-9a-f]{64}$/);
        expect(agg.periodEnd.getTime()).toBeGreaterThan(
          agg.periodStart.getTime(),
        );
      }

      for (const lin of plan.metricAggregateLineages) {
        expect(aggregateIds.has(lin.aggregateId)).toBe(true);
        expect(observationIds.has(lin.observationId)).toBe(true);
        expect(datasetVersionIds.has(lin.datasetVersionId)).toBe(true);
      }
    });
  });

  describe('cleanScaleSeed & seedAnalyticsScale', () => {
    const createMockTx = () => ({
      $executeRaw: jest.fn().mockResolvedValue(0),
      dashboardView: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      metricAggregateLineage: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      metricAggregate: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      observationQuality: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      metricObservation: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      metricDefinition: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      datasetVersion: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      columnMapping: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      dataset: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      upload: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      storedObject: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      membership: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      organization: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      account: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      region: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
    });

    it('cleanScaleSeed sets session configs and deletes records across models', async () => {
      const mockTx = createMockTx();
      const mockPrisma = {
        $transaction: jest
          .fn()
          .mockImplementation(
            (callback: (tx: typeof mockTx) => Promise<unknown>) =>
              callback(mockTx),
          ),
      };

      const plan = buildDeterministicSeedPlan();
      await cleanScaleSeed(mockPrisma as unknown as PrismaClient, plan);

      const sqlCalls = mockTx.$executeRaw.mock.calls as unknown as Array<
        [TemplateStringsArray, ...unknown[]]
      >;
      expect(sqlCalls[0][0].join(' ')).toContain('acres.account_id');
      expect(sqlCalls[0][0].join(' ')).toContain('acres.worker_access');
      expect(sqlCalls[0][0].join(' ')).toContain('acres.organization_id');
      expect(sqlCalls[0].slice(1)).toEqual([plan.accounts[0].id]);
      expect(sqlCalls.slice(1).map((call) => call.slice(1))).toEqual(
        plan.organizations.map((org) => [org.id]),
      );

      const deleteOrder = [
        mockTx.dashboardView.deleteMany,
        mockTx.metricAggregateLineage.deleteMany,
        mockTx.metricAggregate.deleteMany,
        mockTx.observationQuality.deleteMany,
        mockTx.metricObservation.deleteMany,
        mockTx.metricDefinition.deleteMany,
        mockTx.datasetVersion.deleteMany,
        mockTx.columnMapping.deleteMany,
        mockTx.dataset.deleteMany,
        mockTx.upload.deleteMany,
        mockTx.storedObject.deleteMany,
        mockTx.membership.deleteMany,
        mockTx.organization.deleteMany,
        mockTx.account.deleteMany,
        mockTx.region.deleteMany,
      ];
      expect(mockTx.dashboardView.deleteMany).toHaveBeenCalledTimes(
        plan.organizations.length,
      );
      for (const deletion of deleteOrder) {
        expect(deletion).toHaveBeenCalled();
      }
      expect(
        deleteOrder.map((deletion) => deletion.mock.invocationCallOrder[0]),
      ).toEqual(
        [
          ...deleteOrder.map(
            (deletion) => deletion.mock.invocationCallOrder[0],
          ),
        ].sort((left, right) => left - right),
      );
      expect(mockTx.region.deleteMany).toHaveBeenCalledWith({
        where: { slug: { in: plan.regions.map((region) => region.slug) } },
      });
    });

    it('seedAnalyticsScale runs cleanScaleSeed and creates all plan entities', async () => {
      const mockTx = createMockTx();
      const mockPrisma = {
        $transaction: jest
          .fn()
          .mockImplementation(
            (callback: (tx: typeof mockTx) => Promise<unknown>) =>
              callback(mockTx),
          ),
      };

      const plan = buildDeterministicSeedPlan();
      const summary = await seedAnalyticsScale(
        mockPrisma as unknown as PrismaClient,
        plan,
      );

      expect(summary.organizationCount).toBe(plan.organizations.length);
      expect(summary.accountCount).toBe(plan.accounts.length);
      expect(summary.observationCount).toBe(plan.metricObservations.length);
      expect(summary.aggregateCount).toBe(plan.metricAggregates.length);
      expect(summary.sampleIds).toBeDefined();

      const createCalls = [
        [mockTx.account.create, plan.accounts.length],
        [mockTx.organization.create, plan.organizations.length],
        [mockTx.membership.create, plan.memberships.length],
        [mockTx.region.create, plan.regions.length],
        [mockTx.storedObject.create, plan.storedObjects.length],
        [mockTx.upload.create, plan.uploads.length],
        [mockTx.dataset.create, plan.datasets.length],
        [mockTx.columnMapping.create, plan.columnMappings.length],
        [mockTx.datasetVersion.create, plan.datasetVersions.length],
        [mockTx.metricDefinition.create, plan.metricDefinitions.length],
        [mockTx.dashboardView.create, plan.dashboardViews.length],
      ] as const;
      for (const [create, count] of createCalls) {
        expect(create).toHaveBeenCalledTimes(count);
      }
      expect(mockTx.metricObservation.createMany).toHaveBeenCalledWith({
        data: plan.metricObservations,
      });
      expect(mockTx.observationQuality.createMany).toHaveBeenCalledWith({
        data: plan.observationQualities,
      });
      expect(mockTx.metricAggregate.createMany).toHaveBeenCalledWith({
        data: plan.metricAggregates,
      });
      expect(mockTx.metricAggregateLineage.createMany).toHaveBeenCalledWith({
        data: plan.metricAggregateLineages,
      });
    });
  });
});
