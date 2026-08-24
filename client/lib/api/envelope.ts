import type { ApiErrorCode, ApiResponse } from "@acres/shared";

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly details: string[];
  readonly requestId: string | null;
  readonly status: number;

  constructor(args: {
    code: ApiErrorCode;
    message: string;
    details?: string[];
    requestId?: string;
    status: number;
  }) {
    super(args.message);
    this.name = "ApiClientError";
    this.code = args.code;
    this.details = args.details ?? [];
    this.requestId = args.requestId ?? null;
    this.status = args.status;
  }
}

export type ApiErrorCopy = {
  title: string;
  message: string;
  action: string;
};

export async function parseApiResponse<TData>(
  response: Response,
): Promise<TData> {
  let payload: ApiResponse<TData> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<TData>;
  } catch {
    throw new ApiClientError({
      code: "INTERNAL_ERROR",
      message: "The API returned a response the client could not read.",
      status: response.status,
      requestId: response.headers.get("x-request-id") ?? undefined,
    });
  }

  if (payload.ok) {
    return payload.data;
  }

  throw new ApiClientError({
    code: payload.error.code,
    message: payload.error.message,
    details: payload.error.details,
    requestId: payload.error.requestId ?? response.headers.get("x-request-id") ?? undefined,
    status: response.status,
  });
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

export function getApiErrorCopy(error: unknown): ApiErrorCopy {
  if (!isApiClientError(error)) {
    return {
      title: "Network Problem",
      message: "Acres could not reach the API.",
      action: "Check your connection and try again.",
    };
  }

  switch (error.code) {
    case "VALIDATION_FAILED":
      return {
        title: "Check the Form",
        message: error.details[0] ?? "Some fields need attention.",
        action: "Update the highlighted fields and try again.",
      };
    case "INVALID_CREDENTIALS":
      return {
        title: "Sign In Failed",
        message: "The email or password is not valid.",
        action: "Check the credentials and try again.",
      };
    case "UNAUTHENTICATED":
      return {
        title: "Session Expired",
        message: "Your session is no longer active.",
        action: "Sign in again to continue.",
      };
    case "FORBIDDEN":
      return {
        title: "Access Denied",
        message: "Your role cannot complete this action.",
        action: "Ask an organization owner or admin for access.",
      };
    case "CSRF_INVALID":
      return {
        title: "Security Check Failed",
        message: "The form security token expired.",
        action: "Refresh the token and try again.",
      };
    case "IDEMPOTENCY_KEY_REQUIRED":
      return {
        title: "Request Key Missing",
        message: "This command needs a unique request key.",
        action: "Try again so Acres can create a fresh key.",
      };
    case "IDEMPOTENCY_CONFLICT":
      return {
        title: "Request Already Used",
        message: "That request key was already used with different details.",
        action: "Submit the form again with a fresh request.",
      };
    case "RATE_LIMITED":
      return {
        title: "Too Many Attempts",
        message: "Acres is receiving requests too quickly.",
        action: "Wait a moment, then try again.",
      };
    case "NOT_READY":
      return {
        title: "Service Not Ready",
        message: "This Acres service is not available yet.",
        action: "Try again after the API is ready.",
      };
    case "NOT_FOUND":
      return {
        title: "Not Found",
        message: "The requested record is not available to this account.",
        action: "Select another organization or try again.",
      };
    default:
      return {
        title: "Request Failed",
        message: error.message || "Acres could not complete the request.",
        action: "Try again. Share the request ID if it keeps failing.",
      };
  }
}
