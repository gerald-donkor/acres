import {
  buildDeterministicSeedPlan,
  deterministicUuid,
} from './analytics-scale-seed';

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
});
