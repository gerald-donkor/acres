import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import type {
  IssuedInvitation,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationSummary,
} from '@acres/shared';
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

@Controller()
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get('organizations')
  @UseGuards(SessionGuard)
  list(
    @CurrentAccount() account: AccountProfile,
  ): Promise<OrganizationSummary[]> {
    return this.organizations.list(account.id);
  }

  @Post('organizations')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentAccount() account: AccountProfile,
    @Body() body: CreateOrganizationDto,
  ): Promise<OrganizationSummary> {
    return this.organizations.create(account.id, body.name);
  }

  @Get('organizations/:organizationId')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('organization.read')
  get(
    @CurrentOrganization() organization: OrganizationContext,
  ): Promise<OrganizationSummary> {
    return this.organizations.get(organization);
  }

  @Patch('organizations/:organizationId')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('organization.update')
  update(
    @CurrentOrganization() organization: OrganizationContext,
    @Body() body: UpdateOrganizationDto,
  ): Promise<OrganizationSummary> {
    return this.organizations.update(organization, body.name);
  }

  @Get('organizations/:organizationId/members')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('members.read')
  members(
    @CurrentOrganization() organization: OrganizationContext,
  ): Promise<OrganizationMember[]> {
    return this.organizations.members(organization);
  }

  @Patch('organizations/:organizationId/members/:membershipId')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('members.change_role')
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
  transferOwnership(
    @CurrentOrganization() organization: OrganizationContext,
    @Body() body: TransferOwnershipDto,
  ): Promise<{ transferred: true }> {
    return this.organizations.transferOwnership(
      organization,
      body.membershipId,
    );
  }

  @Get('organizations/:organizationId/invitations')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('invitations.read')
  invitations(
    @CurrentOrganization() organization: OrganizationContext,
  ): Promise<OrganizationInvitation[]> {
    return this.organizations.invitations(organization);
  }

  @Post('organizations/:organizationId/invitations')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('members.invite')
  @HttpCode(HttpStatus.CREATED)
  invite(
    @CurrentOrganization() organization: OrganizationContext,
    @Body() body: InviteMemberDto,
  ): Promise<IssuedInvitation> {
    return this.organizations.invite(organization, body.email, body.role);
  }

  @Delete('organizations/:organizationId/invitations/:invitationId')
  @UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
  @RequiresOrganizationPermission('invitations.revoke')
  revokeInvitation(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<{ revoked: true }> {
    return this.organizations.revokeInvitation(organization, invitationId);
  }

  @Post('invitations/accept')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  acceptInvitation(
    @CurrentAccount() account: AccountProfile,
    @Body() body: AcceptInvitationDto,
  ): Promise<{ organizationId: string; membershipId: string }> {
    return this.organizations.accept(account.id, account.email, body.token);
  }
}
