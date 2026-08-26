import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (req.path === '/metrics' || req.path.startsWith('/metrics/')) {
      next();
      return;
    }

    const start = process.hrtime.bigint();
    this.metrics.httpActiveRequests.inc();

    let recorded = false;
    const recordMetrics = () => {
      if (recorded) return;
      recorded = true;
      this.metrics.httpActiveRequests.dec();
      const end = process.hrtime.bigint();
      const durationSeconds = Number(end - start) / 1e9;
      this.metrics.recordHttpRequest(
        req.method,
        req.path,
        res.statusCode || 499,
        durationSeconds,
      );
    };

    res.once('finish', recordMetrics);
    res.once('close', recordMetrics);

    next();
  }
}
