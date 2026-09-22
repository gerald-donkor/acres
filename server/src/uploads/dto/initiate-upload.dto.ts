import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';
import { UPLOAD_MEDIA_TYPES } from '@acres/shared';

export class InitiateUploadDto {
  @IsString()
  @MaxLength(180)
  filename!: string;

  @IsIn(UPLOAD_MEDIA_TYPES)
  mediaType!: string;

  @IsInt()
  @Min(1)
  @Max(52_428_800)
  byteCount!: number;

  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/i)
  checksumHex?: string;
}
