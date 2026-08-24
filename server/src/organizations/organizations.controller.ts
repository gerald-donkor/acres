import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  IssuedInvitation,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationSummary,
} from '@acres/shared';
import {
  ApiCsrfHeader,
  ApiEnvelope,
  ApiIdempotencyHeader,
  ApiOrganizationHeader,
  ApiSessionAuth,
  arraySchema,
  issuedInvitationSchema,
  objectSchema,
  organizationInvitationSchema,
  organizationMemberSchema,
  organizationSummarySchema,
  stringSchema,
} from '../contracts/openapi';
import { SessionGuard } from '../sessions/session.guard';
import { CurrentAccount } from '../sessions/current-account.decorator';
import type { AccountProfile } from '@acres/shared';
import { CurrentOrganization } from './current-organization.decorator';
import {
  AcceptInvitationDto,
  ChangeMemberRoleDto,
  CreateOrganizationDto,
  InviteMemberDto,
  TransferOwnershipDto,
  UpdateOrganizationDto,
} from './dto';
import { OrganizationContextGuard } from './organization-context.guard';
import { PermissionGuard } from './permission.guard';
import { RequiresOrganizationPermission } from './permissions';
import type { OrganizationContext } from './organization-context';
import { OrganizationsService } from './organizations.service';

@Controller({ version: '1' })
@ApiTags('organizations')
@ApiSessionAuth()
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get('organizations')
  @UseGuards(SessionGuard)
  @ApiEnvelope({
    summary: 'List organizations',
    description: 'Returns active organizations for the authenticated account.',
    data: arraySchema(organizationSummarySchema),
  })
  list(
    @CurrentAccount() account: AccountProfile,
  ): Promise<OrganizationSummary[]> {
    return this.organizations.list(account.id);
  }

  @Post('organizations')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiCsrfHeader()
  @ApiIdempotencyHeader()
  @ApiEnvelope({
    summary: 'Create organization',
    status: HttpStatus.CREATED,
    description: 'Creates an organization and owner membership.',
    data: organizationSummarySchema,
  })
  create(
    @CurrentAccount() account: AccountProfile,
    @Body() body: CreateOrganizationDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ): Promise<OrganizationSummary> {
    return this.organizations.create(account.id, body.name, idempotencyKey);
  }

  @Get('organizations/:organizationId')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('organization.read')
  @ApiOrganizationHeader()
  @ApiEnvelope({
    summary: 'Get organization',
    description: 'Returns the selected organization and caller membership.',
    data: organizationSummarySchema,
  })
  get(
    @CurrentOrganization() organization: OrganizationContext,
  ): Promise<OrganizationSummary> {
    return this.organizations.get(organization);
  }

  @Patch('organizations/:organizationId')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('organization.update')
  @ApiOrganizationHeader()
  @ApiCsrfHeader()
  @ApiEnvelope({
    summary: 'Update organization',
    description: 'Renames the selected organization.',
    data: organizationSummarySchema,
  })
  update(
    @CurrentOrganization() organization: OrganizationContext,
    @Body() body: UpdateOrganizationDto,
  ): Promise<OrganizationSummary> {
    return this.organizations.update(organization, body.name);
  }

  @Get('organizations/:organizationId/members')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('members.read')
  @ApiOrganizationHeader()
  @ApiEnvelope({
    summary: 'List members',
    description:
      'Returns active and revoked members in the selected organization.',
    data: arraySchema(organizationMemberSchema),
  })
  members(
    @CurrentOrganization() organization: OrganizationContext,
  ): Promise<OrganizationMember[]> {
    return this.organizations.members(organization);
  }

  @Patch('organizations/:organizationId/members/:membershipId')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('members.change_role')
  @ApiOrganizationHeader()
  @ApiCsrfHeader()
  @ApiEnvelope({
    summary: 'Change member role',
    description: 'Changes a non-owner member role.',
    data: organizationMemberSchema,
  })
  changeMemberRole(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() body: ChangeMemberRoleDto,
  ): Promise<OrganizationMember> {
    return this.organizations.changeMemberRole(
      organization,
      membershipId,
      body.role,
    );
  }

  @Delete('organizations/:organizationId/members/:membershipId')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('members.revoke')
  @ApiOrganizationHeader()
  @ApiCsrfHeader()
  @ApiEnvelope({
    summary: 'Revoke member',
    description: 'Soft-revokes a non-owner member.',
    data: objectSchema({ revoked: { type: 'boolean', enum: [true] } }),
  })
  revokeMember(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ): Promise<{ revoked: true }> {
    return this.organizations.revokeMember(organization, membershipId);
  }

  @Post('organizations/:organizationId/ownership-transfers')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('ownership.transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOrganizationHeader()
  @ApiCsrfHeader()
  @ApiIdempotencyHeader()
  @ApiEnvelope({
    summary: 'Transfer ownership',
    description:
      'Promotes another active member to owner and demotes the actor.',
    data: objectSchema({ transferred: { type: 'boolean', enum: [true] } }),
  })
  transferOwnership(
    @CurrentOrganization() organization: OrganizationContext,
    @Body() body: TransferOwnershipDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ): Promise<{ transferred: true }> {
    return this.organizations.transferOwnership(
      organization,
      body.membershipId,
      idempotencyKey,
    );
  }

  @Get('organizations/:organizationId/invitations')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('invitations.read')
  @ApiOrganizationHeader()
  @ApiEnvelope({
    summary: 'List invitations',
    description: 'Returns invitation metadata without token hashes.',
    data: arraySchema(organizationInvitationSchema),
  })
  invitations(
    @CurrentOrganization() organization: OrganizationContext,
  ): Promise<OrganizationInvitation[]> {
    return this.organizations.invitations(organization);
  }

  @Post('organizations/:organizationId/invitations')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('members.invite')
  @HttpCode(HttpStatus.CREATED)
  @ApiOrganizationHeader()
  @ApiCsrfHeader()
  @ApiIdempotencyHeader()
  @ApiEnvelope({
    summary: 'Invite member',
    status: HttpStatus.CREATED,
    description: 'Issues one raw invitation token in the response.',
    data: issuedInvitationSchema,
  })
  invite(
    @CurrentOrganization() organization: OrganizationContext,
    @Body() body: InviteMemberDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ): Promise<IssuedInvitation> {
    return this.organizations.invite(
      organization,
      body.email,
      body.role,
      idempotencyKey,
    );
  }

  @Delete('organizations/:organizationId/invitations/:invitationId')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('invitations.revoke')
  @ApiOrganizationHeader()
  @ApiCsrfHeader()
  @ApiEnvelope({
    summary: 'Revoke invitation',
    description: 'Revokes an unaccepted invitation.',
    data: objectSchema({ revoked: { type: 'boolean', enum: [true] } }),
  })
  revokeInvitation(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<{ revoked: true }> {
    return this.organizations.revokeInvitation(organization, invitationId);
  }

  @Post('invitations/accept')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCsrfHeader()
  @ApiIdempotencyHeader()
  @ApiEnvelope({
    summary: 'Accept invitation',
    description: 'Accepts a live invitation token for the signed-in email.',
    data: objectSchema({
      organizationId: stringSchema('uuid'),
      membershipId: stringSchema('uuid'),
    }),
  })
  acceptInvitation(
    @CurrentAccount() account: AccountProfile,
    @Body() body: AcceptInvitationDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ): Promise<{ organizationId: string; membershipId: string }> {
    return this.organizations.accept(
      account.id,
      account.email,
      body.token,
      idempotencyKey,
    );
  }
}
