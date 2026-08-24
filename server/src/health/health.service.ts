import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../storage/storage.port';

export interface HealthStatus {
  status: 'ok';
  service: 'acres-api';
  /** npm sets this when the process is started through a package script. */
  version: string | null;
  uptimeSeconds: number;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  check(): HealthStatus {
    return {
      status: 'ok',
      service: 'acres-api',
      version: process.env.npm_package_version ?? null,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async readiness(): Promise<{
    status: 'ok';
    database: 'ok';
    storage: 'ok';
  }> {
    await this.prisma.$queryRaw`SELECT 1`;
    if (!(await this.storage.readiness())) {
      throw new Error('Object storage is not ready');
    }
    return { status: 'ok', database: 'ok', storage: 'ok' };
  }
}
