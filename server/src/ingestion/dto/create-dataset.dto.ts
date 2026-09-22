import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { VALIDATION } from '@acres/shared';

export class CreateDatasetDto {
  @ApiProperty({
    maxLength: VALIDATION.dataset.name.maxLength,
    example: 'Regional housing starts',
  })
  @IsString()
  @MaxLength(VALIDATION.dataset.name.maxLength)
  name!: string;

  @ApiPropertyOptional({
    maxLength: VALIDATION.dataset.description.maxLength,
    example: 'Quarterly source file imported from the planning office.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(VALIDATION.dataset.description.maxLength)
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
