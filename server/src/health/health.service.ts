import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthStatus {
  status: 'ok';
  service: 'acres-api';
  /** npm sets this when the process is started through a package script. */
  version: string | null;
  uptimeSeconds: number;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  check(): HealthStatus {
    return {
      status: 'ok',
      service: 'acres-api',
      version: process.env.npm_package_version ?? null,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async readiness(): Promise<{ status: 'ok'; database: 'ok' }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'ok' };
  }
}
