import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PostgisRegionGeometryRepository } from './postgis-region-geometry.repository';

@Module({
  imports: [PrismaModule],
  providers: [PostgisRegionGeometryRepository],
  exports: [PostgisRegionGeometryRepository],
})
export class GeographyModule {}
