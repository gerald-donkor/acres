import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({
    format: 'email',
    maxLength: VALIDATION.email.maxLength,
    example: 'ada@example.com',
  })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(VALIDATION.email.maxLength)
  @Transform(normaliseEmailValue)
  email!: string;

  @ApiProperty({
    minLength: VALIDATION.password.minLength,
    maxLength: VALIDATION.password.maxLength,
    format: 'password',
    writeOnly: true,
    example: 'a-long-enough-password',
  })
  @IsString()
  @MinLength(VALIDATION.password.minLength)
  @MaxLength(VALIDATION.password.maxLength)
  password!: string;

  @ApiPropertyOptional({
    maxLength: VALIDATION.displayName.maxLength,
    example: 'Ada Lovelace',
  })
  @IsOptional()
  @IsString()
  @MaxLength(VALIDATION.displayName.maxLength)
  @Transform(trimValue)
  displayName?: string;
}
