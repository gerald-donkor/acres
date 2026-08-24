import { Args, Context, Int, Query, Resolver } from '@nestjs/graphql';
import { UseFilters } from '@nestjs/common';
import type { RegionSummary } from '@acres/shared';
import { ApiException } from '../common/api-exception';
import { AcresConfigService } from '../config/acres-config.service';
import { DashboardsService } from '../dashboards/dashboards.service';
import { OrganizationPolicy } from '../organizations/permissions';
import { OrganizationsService } from '../organizations/organizations.service';
import { RegionsService } from '../regions/regions.service';
import { CursorCodec } from './cursor-codec';
import { GraphqlErrorFilter } from './graphql-error.filter';
import type { AcresGraphqlContext } from './graphql.context';
import { connectionFromWindow, connectionWindow } from './pagination';
import {
  OrganizationAuditEventConnection,
  DashboardSummaryGql,
  OrganizationGql,
  OrganizationInvitationConnection,
  OrganizationMemberConnection,
  RegionConnection,
  RegionGql,
  ViewerGql,
} from './graphql.types';

type RequiredGraphqlContext = AcresGraphqlContext & {
  session: NonNullable<AcresGraphqlContext['session']>;
  organization: NonNullable<AcresGraphqlContext['organization']>;
};

@Resolver()
@UseFilters(GraphqlErrorFilter)
export class AcresResolver {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly regionsService: RegionsService,
    private readonly dashboards: DashboardsService,
    private readonly cursors: CursorCodec,
    private readonly config: AcresConfigService,
  ) {}

  @Query(() => ViewerGql, {
    description:
      'The authenticated account and its membership in the selected organization.',
  })
  viewer(@Context() context: AcresGraphqlContext): ViewerGql {
    const required = this.requireContext(context);
    return {
      account: required.session.account,
      membership: {
        id: required.organization.membershipId,
        accountId: required.organization.accountId,
        role: required.organization.role,
      },
    };
  }

  @Query(() => OrganizationGql, {
    description: 'The selected organization from x-organization-id.',
  })
  async organization(
    @Context() context: AcresGraphqlContext,
  ): Promise<OrganizationGql> {
    const required = this.requireContext(context);
    const summary = await this.withTimeout(
      this.organizations.get(required.organization),
    );
    return {
      id: summary.id,
      name: summary.name,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
    };
  }

  @Query(() => OrganizationMemberConnection, {
    description: 'Active and historical members in the selected organization.',
  })
  async organizationMembers(
    @Context() context: AcresGraphqlContext,
    @Args('first', {
      type: () => Int,
      nullable: true,
      description: 'Maximum members to return, capped by GRAPHQL_MAX_FIRST.',
    })
    first?: number,
    @Args('after', {
      type: () => String,
      nullable: true,
      description: 'Opaque organizationMembers cursor from pageInfo.endCursor.',
    })
    after?: string,
  ): Promise<OrganizationMemberConnection> {
    const required = this.require(context, 'members.read');
    const window = connectionWindow({
      first,
      after,
      kind: 'organizationMembers',
      organizationId: required.organization.organizationId,
      codec: this.cursors,
      config: this.config,
    });
    const rows = await this.withTimeout(
      this.organizations.membersPage(
        required.organization,
        window.take,
        window.afterId,
      ),
    );
    return connectionFromWindow(rows, {
      first: window.first,
      kind: 'organizationMembers',
      organizationId: required.organization.organizationId,
      codec: this.cursors,
    });
  }

  @Query(() => OrganizationInvitationConnection, {
    description: 'Invitation metadata for the selected organization.',
  })
  async organizationInvitations(
    @Context() context: AcresGraphqlContext,
    @Args('first', {
      type: () => Int,
      nullable: true,
      description:
        'Maximum invitations to return, capped by GRAPHQL_MAX_FIRST.',
    })
    first?: number,
    @Args('after', {
      type: () => String,
      nullable: true,
      description:
        'Opaque organizationInvitations cursor from pageInfo.endCursor.',
    })
    after?: string,
  ): Promise<OrganizationInvitationConnection> {
    const required = this.require(context, 'invitations.read');
    const window = connectionWindow({
      first,
      after,
      kind: 'organizationInvitations',
      organizationId: required.organization.organizationId,
      codec: this.cursors,
      config: this.config,
    });
    const rows = await this.withTimeout(
      this.organizations.invitationsPage(
        required.organization,
        window.take,
        window.afterId,
      ),
    );
    return connectionFromWindow(rows, {
      first: window.first,
      kind: 'organizationInvitations',
      organizationId: required.organization.organizationId,
      codec: this.cursors,
    });
  }

  @Query(() => OrganizationAuditEventConnection, {
    description: 'Bounded audit-event metadata for the selected organization.',
  })
  async organizationAuditEvents(
    @Context() context: AcresGraphqlContext,
    @Args('first', {
      type: () => Int,
      nullable: true,
      description:
        'Maximum audit events to return, capped by GRAPHQL_MAX_FIRST.',
    })
    first?: number,
    @Args('after', {
      type: () => String,
      nullable: true,
      description:
        'Opaque organizationAuditEvents cursor from pageInfo.endCursor.',
    })
    after?: string,
  ): Promise<OrganizationAuditEventConnection> {
    const required = this.require(context, 'audit.read');
    const window = connectionWindow({
      first,
      after,
      kind: 'organizationAuditEvents',
      organizationId: required.organization.organizationId,
      codec: this.cursors,
      config: this.config,
    });
    const rows = await this.withTimeout(
      this.organizations.auditEventsPage(
        required.organization,
        window.take,
        window.afterId,
      ),
    );
    return connectionFromWindow(rows, {
      first: window.first,
      kind: 'organizationAuditEvents',
      organizationId: required.organization.organizationId,
      codec: this.cursors,
    });
  }

  @Query(() => RegionConnection, {
    description: 'Authenticated GraphQL view of global public regions.',
  })
  async regions(
    @Context() context: AcresGraphqlContext,
    @Args('first', {
      type: () => Int,
      nullable: true,
      description: 'Maximum regions to return, capped by GRAPHQL_MAX_FIRST.',
    })
    first?: number,
    @Args('after', {
      type: () => String,
      nullable: true,
      description: 'Opaque regions cursor from pageInfo.endCursor.',
    })
    after?: string,
  ): Promise<RegionConnection> {
    this.requireContext(context);
    const window = connectionWindow({
      first,
      after,
      kind: 'regions',
      organizationId: null,
      codec: this.cursors,
      config: this.config,
    });
    const rows = await this.withTimeout(
      this.regionsService.listPage(
        window.take,
        window.afterId,
        this.config.graphqlTimeoutMs,
      ),
    );
    return connectionFromWindow(rows, {
      first: window.first,
      kind: 'regions',
      organizationId: null,
      codec: this.cursors,
    });
  }

  @Query(() => RegionGql, {
    description: 'One global region by slug.',
  })
  region(
    @Context() context: AcresGraphqlContext,
    @Args('slug', { description: 'Stable region slug.' }) slug: string,
  ): Promise<RegionSummary> {
    const required = this.requireContext(context);
    return this.withTimeout(required.loaders.regionBySlug.load(slug));
  }

  @Query(() => DashboardSummaryGql, {
    description:
      'Dashboard-ready metrics, aggregates, and saved views for the selected organization.',
  })
  async dashboardSummary(
    @Context() context: AcresGraphqlContext,
    @Args('metricId', { nullable: true }) metricId?: string,
    @Args('regionId', { nullable: true }) regionId?: string,
    @Args('datasetVersionId', { nullable: true }) datasetVersionId?: string,
    @Args('dimensionHash', { nullable: true }) dimensionHash?: string,
    @Args('periodStart', { nullable: true }) periodStart?: string,
    @Args('periodEnd', { nullable: true }) periodEnd?: string,
  ) {
    const required = this.require(context, 'analytics.read');
    return this.withTimeout(
      this.dashboards.summary(required.organization, {
        metricId,
        regionId,
        datasetVersionId,
        dimensionHash,
        periodStart,
        periodEnd,
      }),
    );
  }

  private require(
    context: AcresGraphqlContext,
    permission:
      'members.read' | 'invitations.read' | 'audit.read' | 'analytics.read',
  ): RequiredGraphqlContext {
    const required = this.requireContext(context);
    if (!OrganizationPolicy.has(required.organization.role, permission)) {
      throw ApiException.forbidden();
    }
    return required;
  }

  private requireContext(context: AcresGraphqlContext): RequiredGraphqlContext {
    if (context.session == null) {
      throw ApiException.unauthenticated();
    }
    if (context.organization == null) {
      throw ApiException.notFound('Organization not found.');
    }
    return context as RequiredGraphqlContext;
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                ApiException.queryLimitExceeded('GraphQL execution timed out.'),
              ),
            this.config.graphqlTimeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
