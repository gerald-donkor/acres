import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDatasetDto {
  @ApiProperty({ maxLength: 160, example: 'Regional housing starts' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({
    maxLength: 1000,
    example: 'Quarterly source file imported from the planning office.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { source: 'planning-office', period: '2026-Q2' },
  })
  @IsOptional()
  @IsObject()
  sourceMetadata?: Record<string, unknown>;
}
