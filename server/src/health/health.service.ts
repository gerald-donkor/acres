import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
  service: 'acres-api';
  /** npm sets this when the process is started through a package script. */
  version: string | null;
  uptimeSeconds: number;
}

@Injectable()
export class HealthService {
  check(): HealthStatus {
    return {
      status: 'ok',
      service: 'acres-api',
      version: process.env.npm_package_version ?? null,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
