import { Field, ID, ObjectType } from '@nestjs/graphql';
import type { OrganizationRole } from '../generated/prisma/enums';

@ObjectType({ description: 'Pagination metadata for a bounded connection.' })
export class PageInfo {
  @Field({ description: 'Whether another page exists after this window.' })
  hasNextPage!: boolean;

  @Field(() => String, {
    nullable: true,
    description: 'Opaque cursor for the final edge in this window.',
  })
  endCursor!: string | null;
}

@ObjectType({ description: 'Authenticated Acres account.' })
export class AccountGql {
  @Field(() => ID, { description: 'Stable account identifier.' })
  id!: string;

  @Field({ description: 'Account email address.' })
  email!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Optional user-facing display name.',
  })
  displayName!: string | null;
}

@ObjectType({ description: 'Account membership in the selected organization.' })
export class MembershipGql {
  @Field(() => ID, { description: 'Stable membership identifier.' })
  id!: string;

  @Field(() => ID, { description: 'Account identifier for this membership.' })
  accountId!: string;

  @Field(() => String, { description: 'Organization role for this member.' })
  role!: OrganizationRole;
}

@ObjectType({ description: 'Authenticated viewer and selected membership.' })
export class ViewerGql {
  @Field(() => AccountGql, { description: 'Authenticated account.' })
  account!: AccountGql;

  @Field(() => MembershipGql, {
    description: 'Membership in the selected organization.',
  })
  membership!: MembershipGql;
}

@ObjectType({ description: 'Selected organization metadata.' })
export class OrganizationGql {
  @Field(() => ID, { description: 'Stable organization identifier.' })
  id!: string;

  @Field({ description: 'Organization display name.' })
  name!: string;

  @Field({ description: 'ISO timestamp when the organization was created.' })
  createdAt!: string;

  @Field({ description: 'ISO timestamp when the organization was updated.' })
  updatedAt!: string;
}

@ObjectType({ description: 'Organization member account and role metadata.' })
export class OrganizationMemberGql {
  @Field(() => ID, { description: 'Stable membership identifier.' })
  id!: string;

  @Field(() => ID, { description: 'Stable account identifier.' })
  accountId!: string;

  @Field({ description: 'Member email address.' })
  email!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Optional user-facing display name.',
  })
  displayName!: string | null;

  @Field(() => String, { description: 'Current or historical member role.' })
  role!: OrganizationRole;

  @Field({ description: 'ISO timestamp when membership was created.' })
  createdAt!: string;

  @Field({ description: 'ISO timestamp when membership was updated.' })
  updatedAt!: string;

  @Field(() => String, {
    nullable: true,
    description: 'ISO timestamp when membership was revoked, when applicable.',
  })
  revokedAt!: string | null;
}

@ObjectType({ description: 'Cursor edge for an organization member.' })
export class OrganizationMemberEdge {
  @Field({ description: 'Opaque cursor for this member edge.' })
  cursor!: string;

  @Field(() => OrganizationMemberGql, { description: 'Member node.' })
  node!: OrganizationMemberGql;
}

@ObjectType({ description: 'Bounded organization member connection.' })
export class OrganizationMemberConnection {
  @Field(() => [OrganizationMemberEdge], {
    description: 'Member edges in this page.',
  })
  edges!: OrganizationMemberEdge[];

  @Field(() => PageInfo, { description: 'Pagination metadata.' })
  pageInfo!: PageInfo;
}

@ObjectType({ description: 'Organization invitation metadata.' })
export class OrganizationInvitationGql {
  @Field(() => ID, { description: 'Stable invitation identifier.' })
  id!: string;

  @Field({ description: 'Invited email address.' })
  email!: string;

  @Field({ description: 'Role offered by the invitation.' })
  role!: string;

  @Field(() => ID, {
    description: 'Account identifier that issued the invite.',
  })
  invitedByAccountId!: string;

  @Field({ description: 'ISO timestamp when the invitation expires.' })
  expiresAt!: string;

  @Field({ description: 'ISO timestamp when the invitation was created.' })
  createdAt!: string;

  @Field(() => String, {
    nullable: true,
    description: 'ISO timestamp when the invitation was accepted.',
  })
  acceptedAt!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'ISO timestamp when the invitation was revoked.',
  })
  revokedAt!: string | null;
}

@ObjectType({ description: 'Cursor edge for an organization invitation.' })
export class OrganizationInvitationEdge {
  @Field({ description: 'Opaque cursor for this invitation edge.' })
  cursor!: string;

  @Field(() => OrganizationInvitationGql, {
    description: 'Invitation node.',
  })
  node!: OrganizationInvitationGql;
}

@ObjectType({ description: 'Bounded organization invitation connection.' })
export class OrganizationInvitationConnection {
  @Field(() => [OrganizationInvitationEdge], {
    description: 'Invitation edges in this page.',
  })
  edges!: OrganizationInvitationEdge[];

  @Field(() => PageInfo, { description: 'Pagination metadata.' })
  pageInfo!: PageInfo;
}

@ObjectType({ description: 'Organization audit event metadata.' })
export class OrganizationAuditEventGql {
  @Field(() => ID, { description: 'Stable audit event identifier.' })
  id!: string;

  @Field({ description: 'Audit action name.' })
  action!: string;

  @Field({ description: 'Type of entity affected by the event.' })
  targetType!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Identifier of the affected entity, when applicable.',
  })
  targetId!: string | null;

  @Field(() => ID, {
    nullable: true,
    description: 'Account identifier for the actor, when available.',
  })
  actorAccountId!: string | null;

  @Field({ description: 'ISO timestamp when the audit event was recorded.' })
  createdAt!: string;
}

@ObjectType({ description: 'Cursor edge for an organization audit event.' })
export class OrganizationAuditEventEdge {
  @Field({ description: 'Opaque cursor for this audit-event edge.' })
  cursor!: string;

  @Field(() => OrganizationAuditEventGql, {
    description: 'Audit event node.',
  })
  node!: OrganizationAuditEventGql;
}

@ObjectType({ description: 'Bounded organization audit-event connection.' })
export class OrganizationAuditEventConnection {
  @Field(() => [OrganizationAuditEventEdge], {
    description: 'Audit-event edges in this page.',
  })
  edges!: OrganizationAuditEventEdge[];

  @Field(() => PageInfo, { description: 'Pagination metadata.' })
  pageInfo!: PageInfo;
}

@ObjectType({ description: 'Metric attached to a region.' })
export class RegionalMetricGql {
  @Field(() => ID, { description: 'Stable metric identifier.' })
  id!: string;

  @Field(() => ID, { description: 'Region identifier for this metric.' })
  regionId!: string;

  @Field({ description: 'Machine-readable metric key.' })
  key!: string;

  @Field({ description: 'Human-readable metric label.' })
  label!: string;

  @Field({ description: 'Numeric metric value.' })
  value!: number;

  @Field(() => String, {
    nullable: true,
    description: 'Optional unit for the metric value.',
  })
  unit!: string | null;
}

@ObjectType({ description: 'Global regional profile and metrics.' })
export class RegionGql {
  @Field(() => ID, { description: 'Stable region identifier.' })
  id!: string;

  @Field({ description: 'Stable region slug.' })
  slug!: string;

  @Field({ description: 'Region display name.' })
  name!: string;

  @Field(() => String, {
    nullable: true,
    description: 'ISO country code, when the region maps to one country.',
  })
  countryCode!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Short regional summary.',
  })
  summary!: string | null;

  @Field(() => [RegionalMetricGql], {
    description: 'Metrics associated with this region.',
  })
  metrics!: RegionalMetricGql[];
}

@ObjectType({ description: 'Cursor edge for a region.' })
export class RegionEdge {
  @Field({ description: 'Opaque cursor for this region edge.' })
  cursor!: string;

  @Field(() => RegionGql, { description: 'Region node.' })
  node!: RegionGql;
}

@ObjectType({ description: 'Bounded region connection.' })
export class RegionConnection {
  @Field(() => [RegionEdge], { description: 'Region edges in this page.' })
  edges!: RegionEdge[];

  @Field(() => PageInfo, { description: 'Pagination metadata.' })
  pageInfo!: PageInfo;
}
