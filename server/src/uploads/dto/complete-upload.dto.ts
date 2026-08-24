import { IsInt, Matches, Max, Min } from 'class-validator';

export class CompleteUploadDto {
  @IsInt()
  @Min(1)
  @Max(52_428_800)
  byteCount!: number;

  @Matches(/^[a-f0-9]{64}$/i)
  checksumHex!: string;
}
