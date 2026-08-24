import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsUUID } from 'class-validator';

export class CreateMappingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  uploadId!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: {
      regionColumn: 'region',
      metrics: [
        {
          column: 'population',
          key: 'population',
          label: 'Population',
          valueType: 'numeric',
          unit: 'people',
          aggregation: 'sum',
          periodColumn: 'year',
          dimensionColumns: ['segment'],
        },
      ],
    },
  })
  @IsObject()
  mapping!: {
    regionColumn?: string;
    regionCodeColumn?: string;
    periodColumn?: string;
    valueColumns?: string[];
    dimensions?: string[];
    unitColumn?: string;
    notesColumn?: string;
  };
}
