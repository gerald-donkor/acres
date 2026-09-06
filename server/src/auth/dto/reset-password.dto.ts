import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { VALIDATION, type ResetPasswordInput } from '@acres/shared';
import { trimValue } from '../../common/transform';

export class ResetPasswordDto implements ResetPasswordInput {
  @ApiProperty({
    minLength: 16,
    maxLength: 256,
    example: 'aB3_...opaque_token',
  })
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  @Transform(trimValue)
  token!: string;

  @ApiProperty({
    minLength: VALIDATION.password.minLength,
    maxLength: VALIDATION.password.maxLength,
    format: 'password',
    writeOnly: true,
    example: 'a-new-strong-password',
  })
  @IsString()
  @MinLength(VALIDATION.password.minLength)
  @MaxLength(VALIDATION.password.maxLength)
  password!: string;
}
