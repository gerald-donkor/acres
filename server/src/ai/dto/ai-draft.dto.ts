import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { CreateAiDraftInput } from '@acres/shared';
import { trimValue } from '../../common/transform';

export class CreateAiDraftDto implements CreateAiDraftInput {
  @IsString()
  @Transform(trimValue)
  @MinLength(1)
  @MaxLength(500)
  purpose!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  evidenceIds!: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  proposalCount?: number;

  @IsDefined()
  acknowledgement!: boolean | string;
}
