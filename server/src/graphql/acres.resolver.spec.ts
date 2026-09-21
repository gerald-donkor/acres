import { HttpStatus } from '@nestjs/common';
import type {
  AccountProfile,
  DashboardSummary,
  OrganizationAuditEvent,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationSummary,
  RegionSummary,
} from '@acres/shared';
import { ApiException } from '../common/api-exception';
import type { AcresConfigService } from '../config/acres-config.service';
import type { DashboardsService } from '../dashboards/dashboards.service';
import { OrganizationPolicy } from '../organizations/permissions';
import type { OrganizationContext } from '../organizations/organization-context';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { RegionsService } from '../regions/regions.service';
import type { SessionContext } from '../sessions/authenticated-request';
import { AcresResolver } from './acres.resolver';
import { CursorCodec } from './cursor-codec';
import type { AcresGraphqlContext } from './graphql.context';
import type { AcresGraphqlLoaders } from './graphql.loaders';

describe('AcresResolver', () => {
  let resolver: AcresResolver;
  let mockOrganizationsService: {
    get: jest.Mock<Promise<OrganizationSummary>, [OrganizationContext]>;
    membersPage: jest.Mock<
      Promise<OrganizationMember[]>,
      [OrganizationContext, number, string?]
    >;
    invitationsPage: jest.Mock<
      Promise<OrganizationInvitation[]>,
      [OrganizationContext, number, string?]
    >;
    auditEventsPage: jest.Mock<
      Promise<OrganizationAuditEvent[]>,
      [OrganizationContext, number, string?]
    >;
  };
  let mockRegionsService: {
    listPage: jest.Mock<Promise<RegionSummary[]>, [number, string?, number?]>;
    findBySlugs: jest.Mock<
      Promise<Map<string, RegionSummary>>,
      [readonly string[], number?]
    >;
  };
  let mockDashboardsService: {
    summary: jest.Mock<
      Promise<DashboardSummary>,
      [OrganizationContext, Record<string, string | undefined>]
    >;
  };
  let cursorCodec: CursorCodec;
  let mockConfig: AcresConfigService;

  const testSecret = 'acres-test-session-secret-32-chars-minimum-len!';

  const mockAccount: AccountProfile = {
    id: '018f0000-0000-7000-8000-000000000001',
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    createdAt: '2026-08-20T00:00:00.000Z',
  };

  const mockSession: SessionContext = {
    sessionId: '018f0000-0000-7000-8000-000000000002',
    account: mockAccount,
    expiresAt: new Date('2026-09-20T00:00:00.000Z'),
  };

  const mockOrg: OrganizationContext = {
    organizationId: '018f0000-0000-7000-8000-000000000010',
    accountId: mockAccount.id,
    membershipId: '018f0000-0000-7000-8000-000000000020',
    role: 'owner',
    statementTimeoutMs: 5000,
  };

  const sampleOrgSummary: OrganizationSummary = {
    id: mockOrg.organizationId,
    name: 'Acres Farms',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-15T12:00:00Z',
    membership: {
      id: mockOrg.membershipId,
      role: 'owner',
    },
  };

  const sampleMember: OrganizationMember = {
    id: '018f0000-0000-7000-8000-000000000021',
    accountId: '018f0000-0000-7000-8000-000000000002',
    email: 'grace@example.com',
    displayName: 'Grace Hopper',
    role: 'analyst',
    createdAt: '2026-08-20T00:00:00Z',
    updatedAt: '2026-08-20T00:00:00Z',
    revokedAt: null,
  };

  const sampleMember2: OrganizationMember = {
    id: '018f0000-0000-7000-8000-000000000022',
    accountId: '018f0000-0000-7000-8000-000000000003',
    email: 'alan@example.com',
    displayName: 'Alan Turing',
    role: 'viewer',
    createdAt: '2026-08-21T00:00:00Z',
    updatedAt: '2026-08-21T00:00:00Z',
    revokedAt: null,
  };

  const sampleInvitation: OrganizationInvitation = {
    id: '018f0000-0000-7000-8000-000000000030',
    organizationId: mockOrg.organizationId,
    email: 'invitee@example.com',
    role: 'viewer',
    invitedByAccountId: mockAccount.id,
    expiresAt: '2026-08-27T00:00:00Z',
    createdAt: '2026-08-20T00:00:00Z',
    acceptedAt: null,
    revokedAt: null,
  };

  const sampleInvitation2: OrganizationInvitation = {
    id: '018f0000-0000-7000-8000-000000000031',
    organizationId: mockOrg.organizationId,
    email: 'invitee2@example.com',
    role: 'analyst',
    invitedByAccountId: mockAccount.id,
    expiresAt: '2026-08-28T00:00:00Z',
    createdAt: '2026-08-21T00:00:00Z',
    acceptedAt: null,
    revokedAt: null,
  };

  const sampleAuditEvent: OrganizationAuditEvent = {
    id: '018f0000-0000-7000-8000-000000000040',
    action: 'invitation_issued',
    targetType: 'invitation',
    targetId: '018f0000-0000-7000-8000-000000000030',
    actorAccountId: mockAccount.id,
    createdAt: '2026-08-20T00:00:00Z',
  };

  const sampleAuditEvent2: OrganizationAuditEvent = {
    id: '018f0000-0000-7000-8000-000000000041',
    action: 'organization_updated',
    targetType: 'organization',
    targetId: mockOrg.organizationId,
    actorAccountId: mockAccount.id,
    createdAt: '2026-08-21T00:00:00Z',
  };

  const sampleRegion: RegionSummary = {
    id: '018f0000-0000-7000-8000-000000000050',
    slug: 'north-america',
    name: 'North America',
    countryCode: 'US',
    summary: 'Continental regional metrics.',
    metrics: [
      {
        id: '018f0000-0000-7000-8000-000000000051',
        regionId: '018f0000-0000-7000-8000-000000000050',
        key: 'soil-organic-matter',
        label: 'Soil Organic Matter',
        value: 4.2,
        unit: '%',
        periodStart: '2026-01-01T00:00:00Z',
        periodEnd: '2026-06-30T00:00:00Z',
        source: 'Acres Survey',
      },
    ],
  };

  const sampleRegion2: RegionSummary = {
    id: '018f0000-0000-7000-8000-000000000052',
    slug: 'western-europe',
    name: 'Western Europe',
    countryCode: 'FR',
    summary: 'European agricultural indicators.',
    metrics: [],
  };

  const sampleDashboardSummary: DashboardSummary = {
    metrics: [
      {
        id: '018f0000-0000-7000-8000-000000000060',
        key: 'yield-per-acre',
        label: 'Yield Per Acre',
        description: 'Average yield measured across surveyed plots.',
        valueType: 'numeric',
        canonicalUnit: 'bu/acre',
        allowedAggregation: 'avg',
        calculationVersion: 'v1',
        status: 'active',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z',
      },
    ],
    aggregates: [
      {
        id: '018f0000-0000-7000-8000-000000000070',
        datasetVersionId: '018f0000-0000-7000-8000-000000000071',
        regionId: sampleRegion.id,
        metric: {
          id: '018f0000-0000-7000-8000-000000000060',
          key: 'yield-per-acre',
          label: 'Yield Per Acre',
          description: 'Average yield measured across surveyed plots.',
          valueType: 'numeric',
          canonicalUnit: 'bu/acre',
          allowedAggregation: 'avg',
          calculationVersion: 'v1',
          status: 'active',
          createdAt: '2026-08-01T00:00:00Z',
          updatedAt: '2026-08-01T00:00:00Z',
        },
        aggregateType: 'avg',
        periodStart: '2026-01-01T00:00:00Z',
        periodEnd: '2026-06-30T00:00:00Z',
        value: {
          type: 'numeric',
          value: '185.4',
        },
        unit: 'bu/acre',
        dimensionHash: 'd_all',
        observationCount: 42,
        datasetVersionIds: ['018f0000-0000-7000-8000-000000000071'],
        createdAt: '2026-08-02T00:00:00Z',
      },
    ],
    savedViews: [
      {
        id: '018f0000-0000-7000-8000-000000000080',
        name: 'Regional Overview',
        description: 'Standard team view',
        filters: {
          regionId: sampleRegion.id,
        },
        presentation: {
          chart: 'bar',
          compareBy: 'region',
        },
        schemaVersion: 1,
        ownerAccountId: mockAccount.id,
        status: 'active',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z',
      },
    ],
  };

  function createContext(
    overrides?: Partial<AcresGraphqlContext>,
  ): AcresGraphqlContext {
    return {
      req: {} as AcresGraphqlContext['req'],
      res: {} as AcresGraphqlContext['res'],
      requestId: 'req-test-123',
      session:
        overrides && 'session' in overrides ? overrides.session! : mockSession,
      organization:
        overrides && 'organization' in overrides
          ? overrides.organization!
          : mockOrg,
      loaders: {
        regionBySlug: {
          load: jest.fn(),
        } as unknown as AcresGraphqlLoaders['regionBySlug'],
        ...overrides?.loaders,
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    mockConfig = {
      graphqlTimeoutMs: 500,
      graphqlMaxFirst: 50,
      sessionSecret: testSecret,
    } as unknown as AcresConfigService;

    cursorCodec = new CursorCodec(mockConfig);

    mockOrganizationsService = {
      get: jest.fn<Promise<OrganizationSummary>, [OrganizationContext]>(),
      membersPage: jest.fn<
        Promise<OrganizationMember[]>,
        [OrganizationContext, number, string?]
      >(),
      invitationsPage: jest.fn<
        Promise<OrganizationInvitation[]>,
        [OrganizationContext, number, string?]
      >(),
      auditEventsPage: jest.fn<
        Promise<OrganizationAuditEvent[]>,
        [OrganizationContext, number, string?]
      >(),
    };

    mockRegionsService = {
      listPage: jest.fn<Promise<RegionSummary[]>, [number, string?, number?]>(),
      findBySlugs: jest.fn<
        Promise<Map<string, RegionSummary>>,
        [readonly string[], number?]
      >(),
    };

    mockDashboardsService = {
      summary: jest.fn<
        Promise<DashboardSummary>,
        [OrganizationContext, Record<string, string | undefined>]
      >(),
    };

    resolver = new AcresResolver(
      mockOrganizationsService as unknown as OrganizationsService,
      mockRegionsService as unknown as RegionsService,
      mockDashboardsService as unknown as DashboardsService,
      cursorCodec,
      mockConfig,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('viewer', () => {
    it('returns { account, membership } when session and organization are present in context', () => {
      const context = createContext();
      const result = resolver.viewer(context);

      expect(result).toEqual({
        account: mockAccount,
        membership: {
          id: mockOrg.membershipId,
          accountId: mockOrg.accountId,
          role: mockOrg.role,
        },
      });
    });

    it('throws ApiException.unauthenticated() when context.session is null', () => {
      const context = createContext({ session: null });

      expect(() => resolver.viewer(context)).toThrow(ApiException);
      try {
        resolver.viewer(context);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiException);
        const apiError = error as ApiException;
        expect(apiError.code).toBe('UNAUTHENTICATED');
        expect(apiError.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        expect(apiError.message).toBe('Sign in to continue.');
      }
    });

    it('throws ApiException.unauthenticated() when context.session is undefined', () => {
      const context = createContext({ session: undefined as unknown as null });

      expect(() => resolver.viewer(context)).toThrow(ApiException);
      try {
        resolver.viewer(context);
      } catch (error) {
        const apiError = error as ApiException;
        expect(apiError.code).toBe('UNAUTHENTICATED');
        expect(apiError.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      }
    });

    it('throws ApiException.notFound("Organization not found.") when context.organization is null', () => {
      const context = createContext({ organization: null });

      expect(() => resolver.viewer(context)).toThrow(ApiException);
      try {
        resolver.viewer(context);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiException);
        const apiError = error as ApiException;
        expect(apiError.code).toBe('NOT_FOUND');
        expect(apiError.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(apiError.message).toBe('Organization not found.');
      }
    });

    it('throws ApiException.notFound("Organization not found.") when context.organization is undefined', () => {
      const context = createContext({
        organization: undefined as unknown as null,
      });

      expect(() => resolver.viewer(context)).toThrow(ApiException);
      try {
        resolver.viewer(context);
      } catch (error) {
        const apiError = error as ApiException;
        expect(apiError.code).toBe('NOT_FOUND');
        expect(apiError.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(apiError.message).toBe('Organization not found.');
      }
    });
  });

  describe('organization', () => {
    it('calls organizations.get(context.organization) with withTimeout and returns { id, name, createdAt, updatedAt }', async () => {
      mockOrganizationsService.get.mockResolvedValueOnce(sampleOrgSummary);

      const context = createContext();
      const result = await resolver.organization(context);

      expect(mockOrganizationsService.get).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.get).toHaveBeenCalledWith(mockOrg);
      expect(result).toEqual({
        id: sampleOrgSummary.id,
        name: sampleOrgSummary.name,
        createdAt: sampleOrgSummary.createdAt,
        updatedAt: sampleOrgSummary.updatedAt,
      });
    });

    it('throws ApiException.unauthenticated() if context.session is null', async () => {
      const context = createContext({ session: null });

      await expect(resolver.organization(context)).rejects.toThrow(
        ApiException,
      );
      await expect(resolver.organization(context)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
        status: HttpStatus.UNAUTHORIZED,
      });
      expect(mockOrganizationsService.get).not.toHaveBeenCalled();
    });

    it('throws ApiException.notFound() if context.organization is null', async () => {
      const context = createContext({ organization: null });

      await expect(resolver.organization(context)).rejects.toThrow(
        ApiException,
      );
      await expect(resolver.organization(context)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Organization not found.',
        status: HttpStatus.NOT_FOUND,
      });
      expect(mockOrganizationsService.get).not.toHaveBeenCalled();
    });
  });

  describe('organizationMembers', () => {
    it('checks permission members.read: throws ApiException.forbidden() if role lacks permission (viewer)', async () => {
      const viewerOrg: OrganizationContext = { ...mockOrg, role: 'viewer' };
      const context = createContext({ organization: viewerOrg });

      await expect(resolver.organizationMembers(context)).rejects.toThrow(
        ApiException,
      );
      await expect(resolver.organizationMembers(context)).rejects.toMatchObject(
        {
          code: 'FORBIDDEN',
          status: HttpStatus.FORBIDDEN,
          message: 'You do not have permission to do that.',
        },
      );
      expect(mockOrganizationsService.membersPage).not.toHaveBeenCalled();
    });

    it('checks permission members.read: throws ApiException.forbidden() if role lacks permission (analyst)', async () => {
      const analystOrg: OrganizationContext = { ...mockOrg, role: 'analyst' };
      const context = createContext({ organization: analystOrg });

      await expect(resolver.organizationMembers(context)).rejects.toThrow(
        ApiException,
      );
      await expect(resolver.organizationMembers(context)).rejects.toMatchObject(
        {
          code: 'FORBIDDEN',
          status: HttpStatus.FORBIDDEN,
        },
      );
      expect(mockOrganizationsService.membersPage).not.toHaveBeenCalled();
    });

    it('throws ApiException.unauthenticated() if session is missing', async () => {
      const context = createContext({ session: null });

      await expect(resolver.organizationMembers(context)).rejects.toThrow(
        ApiException,
      );
      await expect(resolver.organizationMembers(context)).rejects.toMatchObject(
        {
          code: 'UNAUTHENTICATED',
        },
      );
    });

    it('computes connectionWindow with defaults and delegates to organizations.membersPage(organization, window.take, window.afterId)', async () => {
      mockOrganizationsService.membersPage.mockResolvedValueOnce([
        sampleMember,
        sampleMember2,
      ]);

      const context = createContext(); // role: 'owner'
      const result = await resolver.organizationMembers(context);

      // Default first is min(20, 50) = 20, take is 21, afterId is undefined
      expect(mockOrganizationsService.membersPage).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.membersPage).toHaveBeenCalledWith(
        mockOrg,
        21,
        undefined,
      );

      expect(result.edges).toHaveLength(2);
      expect(result.edges[0].node).toEqual(sampleMember);
      expect(result.edges[1].node).toEqual(sampleMember2);
      expect(result.pageInfo.hasNextPage).toBe(false);

      // Verify the cursors decode back to the member nodes
      const decodedEdge0 = cursorCodec.decode(result.edges[0].cursor, {
        kind: 'organizationMembers',
        organizationId: mockOrg.organizationId,
      });
      expect(decodedEdge0).toEqual({
        v: 1,
        kind: 'organizationMembers',
        organizationId: mockOrg.organizationId,
        sort: [sampleMember.createdAt, sampleMember.id],
      });

      expect(result.pageInfo.endCursor).toBe(result.edges[1].cursor);
    });

    it('supports explicit first and valid after cursor, correctly calculating hasNextPage', async () => {
      // Create a valid cursor for an initial item
      const afterCursor = cursorCodec.encode({
        kind: 'organizationMembers',
        organizationId: mockOrg.organizationId,
        sort: ['2026-08-19T00:00:00Z', 'mem_cursor_id'],
      });

      // take = first + 1 = 1 + 1 = 2
      mockOrganizationsService.membersPage.mockResolvedValueOnce([
        sampleMember,
        sampleMember2,
      ]);

      const adminOrg: OrganizationContext = { ...mockOrg, role: 'admin' };
      const context = createContext({ organization: adminOrg });

      const result = await resolver.organizationMembers(
        context,
        1,
        afterCursor,
      );

      expect(mockOrganizationsService.membersPage).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.membersPage).toHaveBeenCalledWith(
        adminOrg,
        2,
        'mem_cursor_id',
      );

      // first was 1, so edges should contain only the first row
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].node).toEqual(sampleMember);
      // Returned 2 rows when first was 1 -> hasNextPage is true
      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(result.pageInfo.endCursor).toBe(result.edges[0].cursor);
    });

    it('throws ApiException when cursor is invalid for organizationMembers', async () => {
      const context = createContext();

      await expect(
        resolver.organizationMembers(context, 10, 'invalid.cursor'),
      ).rejects.toThrow(ApiException);
      await expect(
        resolver.organizationMembers(context, 10, 'invalid.cursor'),
      ).rejects.toMatchObject({
        code: 'CURSOR_INVALID',
      });
    });

    it('throws ApiException when first is outside valid range', async () => {
      const context = createContext();

      await expect(resolver.organizationMembers(context, 0)).rejects.toThrow(
        ApiException,
      );
      await expect(resolver.organizationMembers(context, 9999)).rejects.toThrow(
        ApiException,
      );
    });
  });

  describe('organizationInvitations', () => {
    it('checks permission invitations.read: throws ApiException.forbidden() if role lacks permission (viewer)', async () => {
      const viewerOrg: OrganizationContext = { ...mockOrg, role: 'viewer' };
      const context = createContext({ organization: viewerOrg });

      await expect(resolver.organizationInvitations(context)).rejects.toThrow(
        ApiException,
      );
      await expect(
        resolver.organizationInvitations(context),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: HttpStatus.FORBIDDEN,
        message: 'You do not have permission to do that.',
      });
      expect(mockOrganizationsService.invitationsPage).not.toHaveBeenCalled();
    });

    it('checks permission invitations.read: throws ApiException.forbidden() if role lacks permission (analyst)', async () => {
      const analystOrg: OrganizationContext = { ...mockOrg, role: 'analyst' };
      const context = createContext({ organization: analystOrg });

      await expect(resolver.organizationInvitations(context)).rejects.toThrow(
        ApiException,
      );
      await expect(
        resolver.organizationInvitations(context),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: HttpStatus.FORBIDDEN,
      });
      expect(mockOrganizationsService.invitationsPage).not.toHaveBeenCalled();
    });

    it('throws ApiException.unauthenticated() if session is missing', async () => {
      const context = createContext({ session: null });

      await expect(resolver.organizationInvitations(context)).rejects.toThrow(
        ApiException,
      );
      await expect(
        resolver.organizationInvitations(context),
      ).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });

    it('delegates to organizations.invitationsPage(organization, window.take, window.afterId) and returns connectionFromWindow result', async () => {
      mockOrganizationsService.invitationsPage.mockResolvedValueOnce([
        sampleInvitation,
        sampleInvitation2,
      ]);

      const adminOrg: OrganizationContext = { ...mockOrg, role: 'admin' };
      const context = createContext({ organization: adminOrg });

      const result = await resolver.organizationInvitations(context, 10);

      expect(mockOrganizationsService.invitationsPage).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.invitationsPage).toHaveBeenCalledWith(
        adminOrg,
        11,
        undefined,
      );

      expect(result.edges).toHaveLength(2);
      expect(result.edges[0].node).toEqual(sampleInvitation);
      expect(result.edges[1].node).toEqual(sampleInvitation2);
      expect(result.pageInfo.hasNextPage).toBe(false);
      expect(result.pageInfo.endCursor).toBe(result.edges[1].cursor);

      // Verify decoded cursor
      const decodedEdge = cursorCodec.decode(result.edges[0].cursor, {
        kind: 'organizationInvitations',
        organizationId: adminOrg.organizationId,
      });
      expect(decodedEdge).toEqual({
        v: 1,
        kind: 'organizationInvitations',
        organizationId: adminOrg.organizationId,
        sort: [sampleInvitation.createdAt, sampleInvitation.id],
      });
    });

    it('supports pagination with after cursor for invitations', async () => {
      const afterCursor = cursorCodec.encode({
        kind: 'organizationInvitations',
        organizationId: mockOrg.organizationId,
        sort: ['2026-08-10T00:00:00Z', 'inv_prev_id'],
      });

      mockOrganizationsService.invitationsPage.mockResolvedValueOnce([
        sampleInvitation,
        sampleInvitation2,
      ]);

      const context = createContext(); // role: owner
      const result = await resolver.organizationInvitations(
        context,
        1,
        afterCursor,
      );

      expect(mockOrganizationsService.invitationsPage).toHaveBeenCalledWith(
        mockOrg,
        2,
        'inv_prev_id',
      );
      expect(result.edges).toHaveLength(1);
      expect(result.pageInfo.hasNextPage).toBe(true);
    });
  });

  describe('organizationAuditEvents', () => {
    it('checks permission audit.read: throws ApiException.forbidden() if role lacks permission (viewer)', async () => {
      const viewerOrg: OrganizationContext = { ...mockOrg, role: 'viewer' };
      const context = createContext({ organization: viewerOrg });

      await expect(resolver.organizationAuditEvents(context)).rejects.toThrow(
        ApiException,
      );
      await expect(
        resolver.organizationAuditEvents(context),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: HttpStatus.FORBIDDEN,
        message: 'You do not have permission to do that.',
      });
      expect(mockOrganizationsService.auditEventsPage).not.toHaveBeenCalled();
    });

    it('checks permission audit.read: throws ApiException.forbidden() if role lacks permission (analyst)', async () => {
      const analystOrg: OrganizationContext = { ...mockOrg, role: 'analyst' };
      const context = createContext({ organization: analystOrg });

      await expect(resolver.organizationAuditEvents(context)).rejects.toThrow(
        ApiException,
      );
      await expect(
        resolver.organizationAuditEvents(context),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: HttpStatus.FORBIDDEN,
      });
      expect(mockOrganizationsService.auditEventsPage).not.toHaveBeenCalled();
    });

    it('throws ApiException.unauthenticated() if session is missing', async () => {
      const context = createContext({ session: null });

      await expect(resolver.organizationAuditEvents(context)).rejects.toThrow(
        ApiException,
      );
      await expect(
        resolver.organizationAuditEvents(context),
      ).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });

    it('delegates to organizations.auditEventsPage(organization, window.take, window.afterId) and returns connectionFromWindow result', async () => {
      mockOrganizationsService.auditEventsPage.mockResolvedValueOnce([
        sampleAuditEvent,
        sampleAuditEvent2,
      ]);

      const context = createContext(); // role: owner
      const result = await resolver.organizationAuditEvents(context, 5);

      expect(mockOrganizationsService.auditEventsPage).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.auditEventsPage).toHaveBeenCalledWith(
        mockOrg,
        6,
        undefined,
      );

      expect(result.edges).toHaveLength(2);
      expect(result.edges[0].node).toEqual(sampleAuditEvent);
      expect(result.edges[1].node).toEqual(sampleAuditEvent2);
      expect(result.pageInfo.hasNextPage).toBe(false);

      const decodedEdge = cursorCodec.decode(result.edges[0].cursor, {
        kind: 'organizationAuditEvents',
        organizationId: mockOrg.organizationId,
      });
      expect(decodedEdge).toEqual({
        v: 1,
        kind: 'organizationAuditEvents',
        organizationId: mockOrg.organizationId,
        sort: [sampleAuditEvent.createdAt, sampleAuditEvent.id],
      });
    });

    it('supports pagination with after cursor for audit events', async () => {
      const afterCursor = cursorCodec.encode({
        kind: 'organizationAuditEvents',
        organizationId: mockOrg.organizationId,
        sort: ['2026-08-15T00:00:00Z', 'evt_prev_id'],
      });

      mockOrganizationsService.auditEventsPage.mockResolvedValueOnce([
        sampleAuditEvent,
        sampleAuditEvent2,
      ]);

      const adminOrg: OrganizationContext = { ...mockOrg, role: 'admin' };
      const context = createContext({ organization: adminOrg });

      const result = await resolver.organizationAuditEvents(
        context,
        1,
        afterCursor,
      );

      expect(mockOrganizationsService.auditEventsPage).toHaveBeenCalledWith(
        adminOrg,
        2,
        'evt_prev_id',
      );
      expect(result.edges).toHaveLength(1);
      expect(result.pageInfo.hasNextPage).toBe(true);
    });
  });

  describe('regions', () => {
    it('requires session in context: throws ApiException.unauthenticated() when null', async () => {
      const context = createContext({ session: null });

      await expect(resolver.regions(context)).rejects.toThrow(ApiException);
      await expect(resolver.regions(context)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
        status: HttpStatus.UNAUTHORIZED,
      });
      expect(mockRegionsService.listPage).not.toHaveBeenCalled();
    });

    it('requires organization in context: throws ApiException.notFound() when null', async () => {
      const context = createContext({ organization: null });

      await expect(resolver.regions(context)).rejects.toThrow(ApiException);
      await expect(resolver.regions(context)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Organization not found.',
        status: HttpStatus.NOT_FOUND,
      });
      expect(mockRegionsService.listPage).not.toHaveBeenCalled();
    });

    it('computes connectionWindow with kind: "regions" and organizationId: null, and delegates to regionsService.listPage', async () => {
      mockRegionsService.listPage.mockResolvedValueOnce([
        sampleRegion,
        sampleRegion2,
      ]);

      const context = createContext();
      const result = await resolver.regions(context, 10);

      expect(mockRegionsService.listPage).toHaveBeenCalledTimes(1);
      expect(mockRegionsService.listPage).toHaveBeenCalledWith(
        11,
        undefined,
        mockConfig.graphqlTimeoutMs,
      );

      expect(result.edges).toHaveLength(2);
      expect(result.edges[0].node).toEqual(sampleRegion);
      expect(result.edges[1].node).toEqual(sampleRegion2);
      expect(result.pageInfo.hasNextPage).toBe(false);

      // Verify that region cursor has organizationId: null
      const decodedEdge = cursorCodec.decode(result.edges[0].cursor, {
        kind: 'regions',
        organizationId: null,
      });
      expect(decodedEdge).toEqual({
        v: 1,
        kind: 'regions',
        organizationId: null,
        sort: [sampleRegion.name, sampleRegion.id],
      });
    });

    it('supports after cursor pagination for regions', async () => {
      const afterCursor = cursorCodec.encode({
        kind: 'regions',
        organizationId: null,
        sort: ['North America', 'reg_cursor_id'],
      });

      mockRegionsService.listPage.mockResolvedValueOnce([
        sampleRegion,
        sampleRegion2,
      ]);

      const context = createContext();
      const result = await resolver.regions(context, 1, afterCursor);

      expect(mockRegionsService.listPage).toHaveBeenCalledWith(
        2,
        'reg_cursor_id',
        mockConfig.graphqlTimeoutMs,
      );
      expect(result.edges).toHaveLength(1);
      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(result.pageInfo.endCursor).toBe(result.edges[0].cursor);
    });

    it('throws ApiException.cursorInvalid if after cursor organizationId is not null', async () => {
      const badCursor = cursorCodec.encode({
        kind: 'regions',
        organizationId: 'should-not-have-org-id',
        sort: ['North America', 'reg_cursor_id'],
      });

      const context = createContext();
      await expect(resolver.regions(context, 5, badCursor)).rejects.toThrow(
        ApiException,
      );
      await expect(
        resolver.regions(context, 5, badCursor),
      ).rejects.toMatchObject({
        code: 'CURSOR_INVALID',
      });
    });
  });

  describe('region(slug)', () => {
    it('requires session and organization in context', () => {
      const noSession = createContext({ session: null });
      expect(() => void resolver.region(noSession, 'north-america')).toThrow(
        ApiException,
      );
      try {
        void resolver.region(noSession, 'north-america');
      } catch (err) {
        expect(err).toMatchObject({
          code: 'UNAUTHENTICATED',
          status: HttpStatus.UNAUTHORIZED,
        });
      }

      const noOrg = createContext({ organization: null });
      expect(() => void resolver.region(noOrg, 'north-america')).toThrow(
        ApiException,
      );
      try {
        void resolver.region(noOrg, 'north-america');
      } catch (err) {
        expect(err).toMatchObject({
          code: 'NOT_FOUND',
          status: HttpStatus.NOT_FOUND,
        });
      }
    });

    it('calls context.loaders.regionBySlug.load(slug) with withTimeout and returns region', async () => {
      const loadMock = jest.fn().mockResolvedValueOnce(sampleRegion);
      const context = createContext({
        loaders: {
          regionBySlug: {
            load: loadMock,
          } as unknown as AcresGraphqlLoaders['regionBySlug'],
        },
      });

      const result = await resolver.region(context, 'north-america');

      expect(loadMock).toHaveBeenCalledTimes(1);
      expect(loadMock).toHaveBeenCalledWith('north-america');
      expect(result).toEqual(sampleRegion);
    });

    it('propagates error when loader rejects or resolves with error', async () => {
      const notFoundErr = ApiException.notFound(
        'No region matches "invalid-slug".',
      );
      const loadMock = jest.fn().mockRejectedValue(notFoundErr);
      const context = createContext({
        loaders: {
          regionBySlug: {
            load: loadMock,
          } as unknown as AcresGraphqlLoaders['regionBySlug'],
        },
      });

      const promise = resolver.region(context, 'invalid-slug');
      await expect(promise).rejects.toThrow(ApiException);
      await expect(promise).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'No region matches "invalid-slug".',
      });
    });
  });

  describe('dashboardSummary', () => {
    it('checks permission analytics.read: throws ApiException.forbidden() if role lacks permission', async () => {
      const hasSpy = jest
        .spyOn(OrganizationPolicy, 'has')
        .mockReturnValue(false);

      const context = createContext();

      const promise = resolver.dashboardSummary(context);
      await expect(promise).rejects.toThrow(ApiException);
      await expect(promise).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: HttpStatus.FORBIDDEN,
        message: 'You do not have permission to do that.',
      });
      expect(mockDashboardsService.summary).not.toHaveBeenCalled();
      hasSpy.mockRestore();
    });

    it('throws ApiException.unauthenticated() if session is missing', async () => {
      const context = createContext({ session: null });

      await expect(resolver.dashboardSummary(context)).rejects.toThrow(
        ApiException,
      );
      await expect(resolver.dashboardSummary(context)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });

    it('throws ApiException.notFound() if organization is missing', async () => {
      const context = createContext({ organization: null });

      await expect(resolver.dashboardSummary(context)).rejects.toThrow(
        ApiException,
      );
      await expect(resolver.dashboardSummary(context)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('forwards all query filters to dashboards.summary(organization, filters)', async () => {
      mockDashboardsService.summary.mockResolvedValueOnce(
        sampleDashboardSummary,
      );

      const context = createContext(); // role: owner (has analytics.read)
      const result = await resolver.dashboardSummary(
        context,
        'metric_123',
        'reg_west',
        'ver_v1',
        'hash_abc',
        '2026-01-01',
        '2026-03-31',
      );

      expect(mockDashboardsService.summary).toHaveBeenCalledTimes(1);
      expect(mockDashboardsService.summary).toHaveBeenCalledWith(mockOrg, {
        metricId: 'metric_123',
        regionId: 'reg_west',
        datasetVersionId: 'ver_v1',
        dimensionHash: 'hash_abc',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
      });
      expect(result).toEqual(sampleDashboardSummary);
    });

    it('forwards undefined filters when query arguments are omitted', async () => {
      mockDashboardsService.summary.mockResolvedValueOnce(
        sampleDashboardSummary,
      );

      const context = createContext();
      const result = await resolver.dashboardSummary(context);

      expect(mockDashboardsService.summary).toHaveBeenCalledTimes(1);
      expect(mockDashboardsService.summary).toHaveBeenCalledWith(mockOrg, {
        metricId: undefined,
        regionId: undefined,
        datasetVersionId: undefined,
        dimensionHash: undefined,
        periodStart: undefined,
        periodEnd: undefined,
      });
      expect(result).toEqual(sampleDashboardSummary);
    });

    it('allows viewer role because viewer has analytics.read permission', async () => {
      mockDashboardsService.summary.mockResolvedValueOnce(
        sampleDashboardSummary,
      );

      const viewerOrg: OrganizationContext = { ...mockOrg, role: 'viewer' };
      const context = createContext({ organization: viewerOrg });

      const result = await resolver.dashboardSummary(context);

      expect(mockDashboardsService.summary).toHaveBeenCalledTimes(1);
      expect(result).toEqual(sampleDashboardSummary);
    });
  });

  describe('withTimeout', () => {
    it('resolves successfully when operation resolves within config.graphqlTimeoutMs', async () => {
      const fastPromise = Promise.resolve('fast-result');
      const result = await (
        resolver as unknown as {
          withTimeout: (op: Promise<string>) => Promise<string>;
        }
      ).withTimeout(fastPromise);

      expect(result).toBe('fast-result');
    });

    it('rejects with ApiException.queryLimitExceeded("GraphQL execution timed out.") if operation does not resolve within config.graphqlTimeoutMs', async () => {
      jest.useFakeTimers();
      try {
        const hangingPromise = new Promise<string>(() => {
          // intentionally never resolves
        });

        const timedPromise = (
          resolver as unknown as {
            withTimeout: (op: Promise<string>) => Promise<string>;
          }
        ).withTimeout(hangingPromise);

        // Advance past config.graphqlTimeoutMs (500ms)
        jest.advanceTimersByTime(mockConfig.graphqlTimeoutMs + 50);

        await expect(timedPromise).rejects.toThrow(ApiException);
        await expect(timedPromise).rejects.toMatchObject({
          code: 'QUERY_LIMIT_EXCEEDED',
          message: 'GraphQL execution timed out.',
          status: HttpStatus.BAD_REQUEST,
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('cleans up timeout timer when operation completes successfully', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      await (
        resolver as unknown as {
          withTimeout: (op: Promise<string>) => Promise<string>;
        }
      ).withTimeout(Promise.resolve('quick-done'));

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('cleans up timeout timer when operation rejects with its own error before timeout', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const operationalError = new Error('Database query failure');

      await expect(
        (
          resolver as unknown as {
            withTimeout: (op: Promise<string>) => Promise<string>;
          }
        ).withTimeout(Promise.reject(operationalError)),
      ).rejects.toThrow(operationalError);

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('applies timeout to resolver methods such as organization query', async () => {
      jest.useFakeTimers();
      try {
        mockOrganizationsService.get.mockReturnValue(
          new Promise<OrganizationSummary>(() => {
            // never resolves
          }),
        );

        const context = createContext();
        const promise = resolver.organization(context);

        jest.advanceTimersByTime(mockConfig.graphqlTimeoutMs + 50);

        await expect(promise).rejects.toThrow(ApiException);
        await expect(promise).rejects.toMatchObject({
          code: 'QUERY_LIMIT_EXCEEDED',
          message: 'GraphQL execution timed out.',
        });
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
