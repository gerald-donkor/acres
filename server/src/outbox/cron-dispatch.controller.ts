import {
  Controller,
  Get,
  Logger,
  Req,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { createDispatchHandler } from '../vercel/dispatch-handler';
import { ManagedDispatchRunnerService } from './managed-dispatch-runner.service';

/**
 * Controller mounting the protected Cron dispatch sweep endpoint at `/cron/dispatch`.
 * Neutral versioning and excluded from global `/api` prefix so Vercel top-level
 * cron routing reaching the api service routes directly here.
 *
 * Delegates to the verified `createDispatchHandler` core for constant-time
 * bearer secret comparison and sanitized reporting.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller({ path: 'cron', version: VERSION_NEUTRAL })
export class CronDispatchController {
  private readonly handler: (request: Request) => Promise<Response>;

  constructor(runner: ManagedDispatchRunnerService) {
    this.handler = createDispatchHandler({
      resolveRuntime: () => Promise.resolve(runner),
      readSecret: () => process.env.CRON_SECRET,
      logger: new Logger(CronDispatchController.name),
    });
  }

  @Get('dispatch')
  async dispatch(
    @Req() req: ExpressRequest,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') {
        headers.set(k, v);
      } else if (Array.isArray(v)) {
        for (const item of v) {
          headers.append(k, item);
        }
      }
    }

    const host = req.get('host') ?? 'localhost';
    const protocol = req.protocol || 'http';
    const webReq = new Request(
      `${protocol}://${host}${req.originalUrl || req.url}`,
      {
        method: req.method,
        headers,
      },
    );

    const webRes = await this.handler(webReq);
    res.status(webRes.status);
    webRes.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const body = await webRes.text();
    res.send(body);
  }
}
