import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class StartIngestionRunDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  uploadId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  mappingId!: string;
}
