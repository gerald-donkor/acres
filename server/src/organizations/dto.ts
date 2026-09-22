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
  ASSIGNABLE_ROLES,
  type AssignableRole,
  VALIDATION,
} from '@acres/shared';
import { normaliseEmailValue, trimValue } from '../common/transform';

export class CreateOrganizationDto {
  @ApiProperty({
    minLength: VALIDATION.organization.name.minLength,
    maxLength: VALIDATION.organization.name.maxLength,
    example: 'Acme Analytics',
  })
  @Transform(trimValue)
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
  @Transform(normaliseEmailValue)
  @IsEmail()
  @MaxLength(VALIDATION.email.maxLength)
  email!: string;

  @ApiProperty({
    enum: ASSIGNABLE_ROLES,
    example: 'viewer',
  })
  @IsIn(ASSIGNABLE_ROLES)
  role!: AssignableRole;
}

export class ChangeMemberRoleDto {
  @ApiProperty({
    enum: ASSIGNABLE_ROLES,
    example: 'analyst',
  })
  @IsIn(ASSIGNABLE_ROLES)
  role!: AssignableRole;
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
