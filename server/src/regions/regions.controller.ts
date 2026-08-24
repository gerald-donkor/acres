import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { RegionSummary } from '@acres/shared';
import {
  ApiEnvelope,
  arraySchema,
  regionSummarySchema,
} from '../contracts/openapi';
import { RegionsService } from './regions.service';

@Controller({ path: 'regions', version: '1' })
@ApiTags('regions')
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  @Get()
  @ApiEnvelope({
    summary: 'List regions',
    description: 'Returns public region summaries with metrics.',
    data: arraySchema(regionSummarySchema),
  })
  list(): Promise<RegionSummary[]> {
    return this.regions.list();
  }

  @Get(':slug')
  @ApiEnvelope({
    summary: 'Get region',
    description: 'Returns one public region summary by slug.',
    data: regionSummarySchema,
  })
  findOne(@Param('slug') slug: string): Promise<RegionSummary> {
    return this.regions.findBySlug(slug);
  }
}
