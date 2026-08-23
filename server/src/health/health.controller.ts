import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService, type HealthStatus } from './health.service';

/**
 * Liveness only. It reports on the HTTP process and takes no dependency on the
 * database, so a load balancer cannot be told the service is down when it is
 * the database that is unreachable.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): HealthStatus {
    return this.health.check();
  }
}
