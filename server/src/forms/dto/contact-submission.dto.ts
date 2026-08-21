import { Transform } from 'class-transformer';
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
  @IsString()
  @MinLength(VALIDATION.contact.name.minLength)
  @MaxLength(VALIDATION.contact.name.maxLength)
  @Transform(trimValue)
  name!: string;

  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(VALIDATION.email.maxLength)
  @Transform(normaliseEmailValue)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(VALIDATION.contact.organization.maxLength)
  @Transform(trimValue)
  organization?: string;

  @IsString()
  @MinLength(VALIDATION.contact.message.minLength)
  @MaxLength(VALIDATION.contact.message.maxLength)
  @Transform(trimValue)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(VALIDATION.contact.source.maxLength)
  @Transform(trimValue)
  source?: string;
}
