import { ExecutionContext, CallHandler } from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { of, lastValueFrom } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

describe('ResponseEnvelopeInterceptor', () => {
  let interceptor: ResponseEnvelopeInterceptor<unknown>;
  let mockContext: ExecutionContext;
  let mockHandler: () => void;
  let mockRequest: { path?: string };

  beforeEach(() => {
    interceptor = new ResponseEnvelopeInterceptor();
    mockHandler = () => {};
    mockRequest = { path: '/api/v1/accounts/me' };

    mockContext = {
      getType: jest.fn().mockReturnValue('http'),
      getHandler: jest.fn().mockReturnValue(mockHandler),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  });

  afterEach(() => {
    Reflect.deleteMetadata(SSE_METADATA, mockHandler);
  });

  it('wraps successful handler payload in { ok: true, data }', async () => {
    const next: CallHandler = {
      handle: () => of({ id: '123', name: 'Test Org' }),
    };

    const result$ = interceptor.intercept(mockContext, next);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({
      ok: true,
      data: { id: '123', name: 'Test Org' },
    });
  });

  it('bypasses wrapping when context type is not http', async () => {
    (mockContext.getType as jest.Mock).mockReturnValue('rpc');
    const next: CallHandler = {
      handle: () => of('raw rpc message'),
    };

    const result$ = interceptor.intercept(mockContext, next);
    const result = await lastValueFrom(result$);

    expect(result).toBe('raw rpc message');
  });

  it('bypasses wrapping when handler is decorated with SSE metadata', async () => {
    Reflect.defineMetadata(SSE_METADATA, true, mockHandler);
    const next: CallHandler = {
      handle: () => of({ data: 'sse event payload' }),
    };

    const result$ = interceptor.intercept(mockContext, next);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ data: 'sse event payload' });
  });

  it('bypasses wrapping when request path is /metrics', async () => {
    mockRequest.path = '/metrics';
    const next: CallHandler = {
      handle: () => of('# HELP process_cpu_user_seconds_total'),
    };

    const result$ = interceptor.intercept(mockContext, next);
    const result = await lastValueFrom(result$);

    expect(result).toBe('# HELP process_cpu_user_seconds_total');
  });

  it('bypasses wrapping when request path ends with /events', async () => {
    mockRequest.path = '/api/v1/jobs/runs/abc-123/events';
    const next: CallHandler = {
      handle: () => of({ progress: 50 }),
    };

    const result$ = interceptor.intercept(mockContext, next);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ progress: 50 });
  });
});
