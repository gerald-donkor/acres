import { Controller, Get, Param } from '@nestjs/common';
import type { RegionSummary } from '@acres/shared';
import { RegionsService } from './regions.service';

@Controller('regions')
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  @Get()
  list(): Promise<RegionSummary[]> {
    return this.regions.list();
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string): Promise<RegionSummary> {
    return this.regions.findBySlug(slug);
  }
}
