import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ORGANIZATION_ROLES,
  type OrganizationRole,
  VALIDATION,
} from '@acres/shared';

const assignableRoles = ORGANIZATION_ROLES.filter(
  (role): role is Exclude<OrganizationRole, 'owner'> => role !== 'owner',
);

function trim({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeEmail({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class CreateOrganizationDto {
  @Transform(trim)
  @IsString()
  @MinLength(VALIDATION.organization.name.minLength)
  @MaxLength(VALIDATION.organization.name.maxLength)
  name!: string;
}

export class UpdateOrganizationDto extends CreateOrganizationDto {}

export class InviteMemberDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(VALIDATION.email.maxLength)
  email!: string;

  @IsIn(assignableRoles)
  role!: Exclude<OrganizationRole, 'owner'>;
}

export class ChangeMemberRoleDto {
  @IsIn(assignableRoles)
  role!: Exclude<OrganizationRole, 'owner'>;
}

export class TransferOwnershipDto {
  @IsUUID()
  membershipId!: string;
}

export class AcceptInvitationDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;
}
