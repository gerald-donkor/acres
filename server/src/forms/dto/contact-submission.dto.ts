import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { VALIDATION, type ContactSubmissionInput } from '@acres/shared';
import { normaliseEmailValue, trimValue } from '../../common/transform';

export class ContactSubmissionDto implements ContactSubmissionInput {
  @ApiProperty({
    minLength: VALIDATION.contact.name.minLength,
    maxLength: VALIDATION.contact.name.maxLength,
    example: 'Ada Lovelace',
  })
  @IsString()
  @MinLength(VALIDATION.contact.name.minLength)
  @MaxLength(VALIDATION.contact.name.maxLength)
  @Transform(trimValue)
  name!: string;

  @ApiProperty({
    format: 'email',
    maxLength: VALIDATION.email.maxLength,
    example: 'ada@example.com',
  })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(VALIDATION.email.maxLength)
  @Transform(normaliseEmailValue)
  email!: string;

  @ApiPropertyOptional({
    maxLength: VALIDATION.contact.organization.maxLength,
    example: 'Acres Analytics',
  })
  @IsOptional()
  @IsString()
  @MaxLength(VALIDATION.contact.organization.maxLength)
  @Transform(trimValue)
  organization?: string;

  @ApiProperty({
    minLength: VALIDATION.contact.message.minLength,
    maxLength: VALIDATION.contact.message.maxLength,
    example: 'We would like a walkthrough of the regional dataset.',
  })
  @IsString()
  @MinLength(VALIDATION.contact.message.minLength)
  @MaxLength(VALIDATION.contact.message.maxLength)
  @Transform(trimValue)
  message!: string;

  @ApiPropertyOptional({
    maxLength: VALIDATION.contact.source.maxLength,
    example: 'landing',
  })
  @IsOptional()
  @IsString()
  @MaxLength(VALIDATION.contact.source.maxLength)
  @Transform(trimValue)
  source?: string;
}
