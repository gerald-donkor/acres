import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PostgisRegionGeometryRepository } from './postgis-region-geometry.repository';
import { GeoBoundariesImportService } from './geoboundaries-import.service';

@Module({
  imports: [PrismaModule],
  providers: [PostgisRegionGeometryRepository, GeoBoundariesImportService],
  exports: [PostgisRegionGeometryRepository, GeoBoundariesImportService],
})
export class GeographyModule {}
