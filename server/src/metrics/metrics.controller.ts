import { Controller, Get, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

/**
 * Version-neutral Prometheus metrics exposition endpoint.
 * Bypasses global JSON response envelope and throttling. Kept on private API network.
 */
@SkipThrottle()
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
@ApiTags('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @ApiProduces('text/plain; version=0.0.4; charset=utf-8')
  @ApiOkResponse({
    description: 'Prometheus metrics text exposition format',
    schema: { type: 'string' },
  })
  async getMetrics(@Res() response: Response): Promise<void> {
    const output = await this.metrics.getMetrics();
    response.setHeader('Content-Type', this.metrics.contentType);
    response.send(output);
  }
}
