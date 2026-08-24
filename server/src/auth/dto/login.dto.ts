import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { VALIDATION, type LoginInput } from '@acres/shared';
import { normaliseEmailValue } from '../../common/transform';

export class LoginDto implements LoginInput {
  @ApiProperty({
    format: 'email',
    maxLength: VALIDATION.email.maxLength,
    example: 'ada@example.com',
  })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(VALIDATION.email.maxLength)
  @Transform(normaliseEmailValue)
  email!: string;

  /**
   * Deliberately not length-checked: a rejection tied to the password policy
   * would tell an attacker which passwords are plausible for this account.
   */
  @ApiProperty({
    maxLength: VALIDATION.password.maxLength,
    format: 'password',
    writeOnly: true,
    example: 'a-long-enough-password',
  })
  @IsString()
  @MaxLength(VALIDATION.password.maxLength)
  password!: string;
}
