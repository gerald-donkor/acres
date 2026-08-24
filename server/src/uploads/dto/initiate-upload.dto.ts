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

const MEDIA_TYPES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/geo+json',
  'application/json',
] as const;

export class InitiateUploadDto {
  @IsString()
  @MaxLength(180)
  filename!: string;

  @IsIn(MEDIA_TYPES)
  mediaType!: string;

  @IsInt()
  @Min(1)
  @Max(52_428_800)
  byteCount!: number;

  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/i)
  checksumHex?: string;
}
