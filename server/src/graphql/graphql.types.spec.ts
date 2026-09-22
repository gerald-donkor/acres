import { LazyMetadataStorage } from '@nestjs/graphql/dist/schema-builder/storages/lazy-metadata.storage.js';
import { ID, Int, TypeMetadataStorage } from '@nestjs/graphql';
import * as types from './graphql.types';
import {
  AccountGql,
  DashboardAggregateGql,
  DashboardFiltersGql,
  DashboardMetricGql,
  DashboardPresentationGql,
  DashboardSummaryGql,
  DashboardValueGql,
  DashboardViewGql,
  MembershipGql,
  OrganizationAuditEventConnection,
  OrganizationAuditEventEdge,
  OrganizationAuditEventGql,
  OrganizationGql,
  OrganizationInvitationConnection,
  OrganizationInvitationEdge,
  OrganizationInvitationGql,
  OrganizationMemberConnection,
  OrganizationMemberEdge,
  OrganizationMemberGql,
  PageInfo,
  RegionConnection,
  RegionEdge,
  RegionGql,
  RegionalMetricGql,
  ViewerGql,
} from './graphql.types';

describe('graphql.types', () => {
  const fieldTypes: Record<
    string,
    {
      type: unknown;
      isArray: boolean;
      nullable: boolean | 'items' | 'itemsAndList' | undefined;
    }
  > = {};
  beforeAll(() => {
    // Load lazy metadata for all GraphQL type classes and execute all `@Field(() => ...)` arrow type resolvers
    const classes = Object.values(types).filter(
      (v) => typeof v === 'function' && v.name,
    );
    LazyMetadataStorage.load(classes);
    TypeMetadataStorage.compile();
    for (const objectType of TypeMetadataStorage.getObjectTypesMetadata()) {
      for (const field of objectType.properties ?? []) {
        fieldTypes[`${objectType.name}.${field.schemaName}`] = {
          type: field.typeFn(),
          isArray: field.options.isArray ?? false,
          nullable: field.options.nullable,
        };
      }
    }
  });

  it('preserves every GraphQL field resolver type', () => {
    const typeName = (value: unknown): string => {
      if (typeof value === 'function') return value.name;
      return String(value);
    };
    const fieldTypeName = (field: (typeof fieldTypes)[string]): string => {
      const name = typeName(field.type);
      if (!field.isArray) return `${name}${field.nullable === true ? '' : '!'}`;
      const nullableItems =
        field.nullable === 'items' || field.nullable === 'itemsAndList';
      const nullableList =
        field.nullable === true || field.nullable === 'itemsAndList';
      return `[${name}${nullableItems ? '' : '!'}]${nullableList ? '' : '!'}`;
    };
    const resolved = Object.fromEntries(
      Object.entries(fieldTypes)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([field, value]) => [field, fieldTypeName(value)]),
    );
    expect(resolved).toMatchSnapshot();
    expect(fieldTypes['AccountGql.id'].type).toBe(ID);
    expect(fieldTypes['PageInfo.hasNextPage'].type).toBe(Boolean);
    expect(fieldTypes['DashboardViewGql.schemaVersion'].type).toBe(Int);
    expect(fieldTypes['ViewerGql.account'].type).toBe(AccountGql);
    expect(fieldTypes['RegionGql.metrics']).toMatchObject({
      type: RegionalMetricGql,
      isArray: true,
    });
  });

  describe('PageInfo', () => {
    it('instantiates correctly with cursor and pagination flag', () => {
      const pageInfo = new PageInfo();
      pageInfo.hasNextPage = true;
      pageInfo.endCursor = 'cursor-123';
      expect(pageInfo.hasNextPage).toBe(true);
      expect(pageInfo.endCursor).toBe('cursor-123');
    });
  });

  describe('Account and Membership GQL types', () => {
    it('instantiates AccountGql, MembershipGql, and ViewerGql', () => {
      const account = new AccountGql();
      account.id = 'acc-1';
      account.email = 'test@example.com';
      account.displayName = 'Test User';

      const membership = new MembershipGql();
      membership.id = 'mem-1';
      membership.accountId = 'acc-1';
      membership.role = 'admin';

      const viewer = new ViewerGql();
      viewer.account = account;
      viewer.membership = membership;

      expect(viewer.account.id).toBe('acc-1');
      expect(viewer.membership.role).toBe('admin');
    });
  });

  describe('Organization GQL types', () => {
    it('instantiates OrganizationGql', () => {
      const org = new OrganizationGql();
      org.id = 'org-1';
      org.name = 'Test Org';
      org.createdAt = '2026-01-01T00:00:00.000Z';
      org.updatedAt = '2026-01-02T00:00:00.000Z';

      expect(org.id).toBe('org-1');
      expect(org.name).toBe('Test Org');
    });

    it('instantiates OrganizationMember and Connection', () => {
      const member = new OrganizationMemberGql();
      member.id = 'mem-1';
      member.accountId = 'acc-1';
      member.email = 'member@example.com';
      member.displayName = 'Member User';
      member.role = 'analyst';
      member.createdAt = '2026-01-01T00:00:00.000Z';
      member.updatedAt = '2026-01-02T00:00:00.000Z';
      member.revokedAt = null;

      const edge = new OrganizationMemberEdge();
      edge.cursor = 'cur-mem-1';
      edge.node = member;

      const connection = new OrganizationMemberConnection();
      connection.edges = [edge];
      connection.pageInfo = { hasNextPage: false, endCursor: 'cur-mem-1' };

      expect(connection.edges).toHaveLength(1);
      expect(connection.edges[0].node.email).toBe('member@example.com');
    });

    it('instantiates OrganizationInvitation and Connection', () => {
      const invite = new OrganizationInvitationGql();
      invite.id = 'inv-1';
      invite.email = 'invite@example.com';
      invite.role = 'analyst';
      invite.invitedByAccountId = 'acc-1';
      invite.expiresAt = '2026-01-08T00:00:00.000Z';
      invite.createdAt = '2026-01-01T00:00:00.000Z';
      invite.acceptedAt = null;
      invite.revokedAt = null;

      const edge = new OrganizationInvitationEdge();
      edge.cursor = 'cur-inv-1';
      edge.node = invite;

      const connection = new OrganizationInvitationConnection();
      connection.edges = [edge];
      connection.pageInfo = { hasNextPage: false, endCursor: 'cur-inv-1' };

      expect(connection.edges[0].node.role).toBe('analyst');
    });

    it('instantiates OrganizationAuditEvent and Connection', () => {
      const audit = new OrganizationAuditEventGql();
      audit.id = 'aud-1';
      audit.action = 'members.invite';
      audit.targetType = 'invitation';
      audit.targetId = 'inv-1';
      audit.actorAccountId = 'acc-1';
      audit.createdAt = '2026-01-01T00:00:00.000Z';

      const edge = new OrganizationAuditEventEdge();
      edge.cursor = 'cur-aud-1';
      edge.node = audit;

      const connection = new OrganizationAuditEventConnection();
      connection.edges = [edge];
      connection.pageInfo = { hasNextPage: false, endCursor: 'cur-aud-1' };

      expect(connection.edges[0].node.action).toBe('members.invite');
    });
  });

  describe('Region GQL types', () => {
    it('instantiates RegionalMetricGql, RegionGql, RegionEdge, and RegionConnection', () => {
      const metric = new RegionalMetricGql();
      metric.id = 'met-1';
      metric.regionId = 'reg-1';
      metric.key = 'population';
      metric.label = 'Total Population';
      metric.value = 100000;
      metric.unit = 'persons';

      const region = new RegionGql();
      region.id = 'reg-1';
      region.slug = 'accra';
      region.name = 'Accra';
      region.countryCode = 'GHA';
      region.summary = 'Capital region';
      region.metrics = [metric];

      const edge = new RegionEdge();
      edge.cursor = 'cur-reg-1';
      edge.node = region;

      const connection = new RegionConnection();
      connection.edges = [edge];
      connection.pageInfo = { hasNextPage: false, endCursor: 'cur-reg-1' };

      expect(connection.edges[0].node.slug).toBe('accra');
      expect(connection.edges[0].node.metrics[0].value).toBe(100000);
    });
  });

  describe('Dashboard GQL types', () => {
    it('instantiates DashboardMetricGql, DashboardValueGql, and DashboardAggregateGql', () => {
      const metric = new DashboardMetricGql();
      metric.id = 'met-1';
      metric.key = 'yield';
      metric.label = 'Crop Yield';
      metric.description = 'Metric description';
      metric.valueType = 'decimal';
      metric.canonicalUnit = 'kg/ha';
      metric.allowedAggregation = 'average';
      metric.calculationVersion = 'v1';
      metric.status = 'active';
      metric.createdAt = '2026-01-01T00:00:00.000Z';
      metric.updatedAt = '2026-01-02T00:00:00.000Z';

      const val = new DashboardValueGql();
      val.type = 'decimal';
      val.value = '42.5';

      const aggregate = new DashboardAggregateGql();
      aggregate.id = 'agg-1';
      aggregate.datasetVersionId = 'dv-1';
      aggregate.regionId = 'reg-1';
      aggregate.metric = metric;
      aggregate.aggregateType = 'average';
      aggregate.periodStart = '2026-01-01T00:00:00.000Z';
      aggregate.periodEnd = '2026-03-31T23:59:59.999Z';
      aggregate.value = val;
      aggregate.unit = 'kg/ha';
      aggregate.dimensionHash = 'hash-123';
      aggregate.observationCount = 10;
      aggregate.datasetVersionIds = ['dv-1'];
      aggregate.createdAt = '2026-01-01T00:00:00.000Z';

      expect(aggregate.metric.key).toBe('yield');
      expect(aggregate.value.value).toBe('42.5');
      expect(aggregate.observationCount).toBe(10);
    });

    it('instantiates DashboardFiltersGql, DashboardPresentationGql, DashboardViewGql, and DashboardSummaryGql', () => {
      const filters = new DashboardFiltersGql();
      filters.metricId = 'met-1';
      filters.regionId = 'reg-1';
      filters.datasetVersionId = 'dv-1';
      filters.dimensionHash = 'hash-1';
      filters.periodStart = '2026-01-01T00:00:00.000Z';
      filters.periodEnd = '2026-03-31T23:59:59.999Z';

      const presentation = new DashboardPresentationGql();
      presentation.chart = 'line';
      presentation.compareBy = 'region';

      const view = new DashboardViewGql();
      view.id = 'vw-1';
      view.name = 'Quarterly Overview';
      view.description = 'Dashboard description';
      view.filters = filters;
      view.presentation = presentation;
      view.schemaVersion = 1;
      view.ownerAccountId = 'acc-1';
      view.status = 'active';
      view.createdAt = '2026-01-01T00:00:00.000Z';
      view.updatedAt = '2026-01-02T00:00:00.000Z';

      const summary = new DashboardSummaryGql();
      summary.metrics = [];
      summary.aggregates = [];
      summary.savedViews = [view];

      expect(summary.savedViews[0].name).toBe('Quarterly Overview');
      expect(summary.savedViews[0].filters.metricId).toBe('met-1');
      expect(summary.savedViews[0].presentation.chart).toBe('line');
      expect(summary.savedViews[0].schemaVersion).toBe(1);
    });
  });
});
