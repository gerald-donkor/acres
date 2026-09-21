/**
 * The two envelopes every Acres HTTP response uses.
 *
 * `code` is stable and machine-readable; `message` is human-readable and may
 * change. Clients branch on `code`, never on `message`.
 */

export interface ApiSuccess<TData> {
  ok: true;
  data: TData;
}

export interface ApiError {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    requestId?: string;
    /** Field-level validation detail, present only for `VALIDATION_FAILED`. */
    details?: string[];
  };
}

export type ApiResponse<TData> = ApiSuccess<TData> | ApiError;

export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'INVALID_CREDENTIALS',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CONFLICT',
  'NOT_FOUND',
  'CSRF_INVALID',
  'RATE_LIMITED',
  'QUERY_LIMIT_EXCEEDED',
  'CURSOR_INVALID',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_CONFLICT',
  'NOT_READY',
  'INTERNAL_ERROR',
  'INVALID_TOKEN',
  'TOKEN_EXPIRED',
  'AI_DISABLED',
  'AI_UNAVAILABLE',
  'AI_TIMEOUT',
  'AI_RATE_LIMITED',
  'AI_OUTPUT_INVALID',
  'AI_GROUNDING_REJECTED',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiErrorCode(code: string): code is ApiErrorCode {
  return (API_ERROR_CODES as readonly string[]).includes(code);
}

export function isApiError<TData>(
  response: ApiResponse<TData>,
): response is ApiError {
  return response.ok === false;
}

export const REQUEST_ID_HEADER_NAME = 'x-request-id' as const;
export type RequestIdHeaderName = typeof REQUEST_ID_HEADER_NAME;

export const IDEMPOTENCY_HEADER_NAME = 'idempotency-key' as const;
export type IdempotencyHeaderName = typeof IDEMPOTENCY_HEADER_NAME;

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export function isNodeEnv(env: string): env is NodeEnv {
  return (NODE_ENVS as readonly string[]).includes(env);
}
