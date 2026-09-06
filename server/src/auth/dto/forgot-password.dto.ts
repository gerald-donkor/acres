import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';
import { VALIDATION, type ForgotPasswordInput } from '@acres/shared';
import { normaliseEmailValue } from '../../common/transform';

export class ForgotPasswordDto implements ForgotPasswordInput {
  @ApiProperty({
    format: 'email',
    maxLength: VALIDATION.email.maxLength,
    example: 'ada@example.com',
  })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(VALIDATION.email.maxLength)
  @Transform(normaliseEmailValue)
  email!: string;
}
