import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  requestId: string;
}

export interface RequestWithContext extends Request {
  requestContext: RequestContext;
}

const REQUEST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestContextMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const header = request.header('x-request-id')?.trim();
  const requestId =
    header && REQUEST_ID_RE.test(header) ? header : randomUUID();
  (request as RequestWithContext).requestContext = { requestId };
  response.setHeader('x-request-id', requestId);
  next();
}

export function requestIdFrom(request: Request | undefined): string {
  return (
    (request as RequestWithContext | undefined)?.requestContext?.requestId ?? ''
  );
}
