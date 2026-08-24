import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({
    minLength: VALIDATION.organization.name.minLength,
    maxLength: VALIDATION.organization.name.maxLength,
    example: 'Acme Analytics',
  })
  @Transform(trim)
  @IsString()
  @MinLength(VALIDATION.organization.name.minLength)
  @MaxLength(VALIDATION.organization.name.maxLength)
  name!: string;
}

export class UpdateOrganizationDto extends CreateOrganizationDto {}

export class InviteMemberDto {
  @ApiProperty({
    format: 'email',
    maxLength: VALIDATION.email.maxLength,
    example: 'teammate@example.com',
  })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(VALIDATION.email.maxLength)
  email!: string;

  @ApiProperty({
    enum: assignableRoles,
    example: 'viewer',
  })
  @IsIn(assignableRoles)
  role!: Exclude<OrganizationRole, 'owner'>;
}

export class ChangeMemberRoleDto {
  @ApiProperty({
    enum: assignableRoles,
    example: 'analyst',
  })
  @IsIn(assignableRoles)
  role!: Exclude<OrganizationRole, 'owner'>;
}

export class TransferOwnershipDto {
  @ApiProperty({
    format: 'uuid',
    example: '018f0000-0000-7000-8000-000000000002',
  })
  @IsUUID()
  membershipId!: string;
}

export class AcceptInvitationDto {
  @ApiProperty({
    minLength: 32,
    maxLength: 256,
    example: 'invitation_token_redacted',
  })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;
}
