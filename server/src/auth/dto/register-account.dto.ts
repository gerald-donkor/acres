import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { VALIDATION, type RegisterAccountInput } from '@acres/shared';
import { normaliseEmailValue, trimValue } from '../../common/transform';

/**
 * Decorated classes stay server-side: `ValidationPipe` needs a runtime class,
 * and a decorated DTO must never reach client-readable code. The `implements`
 * clause is what keeps it honest against the shared interface.
 */
export class RegisterAccountDto implements RegisterAccountInput {
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(VALIDATION.email.maxLength)
  @Transform(normaliseEmailValue)
  email!: string;

  @IsString()
  @MinLength(VALIDATION.password.minLength)
  @MaxLength(VALIDATION.password.maxLength)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(VALIDATION.displayName.maxLength)
  @Transform(trimValue)
  displayName?: string;
}
