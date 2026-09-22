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
import { VALIDATION, type CreateAiDraftInput } from '@acres/shared';
import { trimValue } from '../../common/transform';

export class CreateAiDraftDto implements CreateAiDraftInput {
  @IsString()
  @Transform(trimValue)
  @MinLength(VALIDATION.aiDraft.purpose.minLength)
  @MaxLength(VALIDATION.aiDraft.purpose.maxLength)
  purpose!: string;

  @IsArray()
  @ArrayMinSize(VALIDATION.aiDraft.evidenceIds.minSize)
  @ArrayMaxSize(VALIDATION.aiDraft.evidenceIds.maxSize)
  @IsUUID('all', { each: true })
  evidenceIds!: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(VALIDATION.aiDraft.proposalCount.min)
  @Max(VALIDATION.aiDraft.proposalCount.max)
  proposalCount?: number;

  @IsDefined()
  acknowledgement!: boolean | string;
}
