import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { VALIDATION, type LoginInput } from '@acres/shared';
import { normaliseEmailValue } from '../../common/transform';

export class LoginDto implements LoginInput {
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(VALIDATION.email.maxLength)
  @Transform(normaliseEmailValue)
  email!: string;

  /**
   * Deliberately not length-checked: a rejection tied to the password policy
   * would tell an attacker which passwords are plausible for this account.
   */
  @IsString()
  @MaxLength(VALIDATION.password.maxLength)
  password!: string;
}
