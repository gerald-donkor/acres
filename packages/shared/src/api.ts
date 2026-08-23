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
  'NOT_FOUND',
  'CSRF_INVALID',
  'RATE_LIMITED',
  'NOT_READY',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiError<TData>(
  response: ApiResponse<TData>,
): response is ApiError {
  return response.ok === false;
}
