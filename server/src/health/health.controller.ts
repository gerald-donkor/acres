import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { ApiEnvelope, objectSchema, stringSchema } from '../contracts/openapi';
import { HealthService, type HealthStatus } from './health.service';
import { ApiException } from '../common/api-exception';

/**
 * Liveness only. It reports on the HTTP process and takes no dependency on the
 * database, so a load balancer cannot be told the service is down when it is
 * the database that is unreachable.
 */
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
@ApiTags('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiEnvelope({
    summary: 'Liveness',
    description: 'Reports HTTP process liveness without checking the database.',
    data: objectSchema({
      status: { type: 'string', enum: ['ok'] },
      service: stringSchema(),
      version: { oneOf: [stringSchema(), { type: 'null' }] },
      uptimeSeconds: { type: 'number' },
    }),
  })
  check(): HealthStatus {
    return this.health.check();
  }

  @Get('ready')
  @ApiEnvelope({
    summary: 'Readiness',
    description: 'Reports database readiness for dependency-aware checks.',
    data: objectSchema({
      status: { type: 'string', enum: ['ok'] },
      database: { type: 'string', enum: ['ok'] },
    }),
  })
  async ready(): Promise<{ status: 'ok'; database: 'ok' }> {
    try {
      return await this.health.readiness();
    } catch {
      throw ApiException.notReady();
    }
  }
}
