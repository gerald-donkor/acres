import { expect, test } from "@playwright/test";

import {
  ApiClientError,
  getApiErrorCopy,
  isApiClientError,
} from "@/lib/api/envelope";

test.describe("Loading & Error Boundary Contracts", () => {
  test("isApiClientError correctly identifies ApiClientError instances", () => {
    const apiError = new ApiClientError({
      code: "FORBIDDEN",
      message: "Forbidden",
      status: 403,
      requestId: "req-abc-123",
    });
    const standardError = new Error("Standard error");
    const genericObj = { message: "Error object" };

    expect(isApiClientError(apiError)).toBe(true);
    expect(isApiClientError(standardError)).toBe(false);
    expect(isApiClientError(genericObj)).toBe(false);
    expect(isApiClientError(null)).toBe(false);
    expect(isApiClientError(undefined)).toBe(false);
  });

  test("getApiErrorCopy produces clear, user-facing copy for common error codes", () => {
    const unauthenticated = new ApiClientError({
      code: "UNAUTHENTICATED",
      message: "Unauthenticated",
      status: 401,
    });
    expect(getApiErrorCopy(unauthenticated)).toEqual({
      title: "Session Expired",
      message: "Your session is no longer active.",
      action: "Sign in again to continue.",
    });

    const forbidden = new ApiClientError({
      code: "FORBIDDEN",
      message: "Forbidden",
      status: 403,
    });
    expect(getApiErrorCopy(forbidden)).toEqual({
      title: "Access Denied",
      message: "Your role cannot complete this action.",
      action: "Ask an organization owner or admin for access.",
    });

    const notFound = new ApiClientError({
      code: "NOT_FOUND",
      message: "Not found",
      status: 404,
    });
    expect(getApiErrorCopy(notFound)).toEqual({
      title: "Not Found",
      message: "The requested record is not available to this account.",
      action: "Select another organization or try again.",
    });

    const rateLimited = new ApiClientError({
      code: "RATE_LIMITED",
      message: "Rate limited",
      status: 429,
    });
    expect(getApiErrorCopy(rateLimited)).toEqual({
      title: "Too Many Attempts",
      message: "Acres is receiving requests too quickly.",
      action: "Wait a moment, then try again.",
    });
  });

  test("getApiErrorCopy produces graceful network error copy for unknown errors", () => {
    const unknownError = new Error("Connection reset by peer");
    const copy = getApiErrorCopy(unknownError);

    expect(copy.title).toBe("Network Problem");
    expect(copy.message).toBe("Acres could not reach the API.");
    expect(copy.action).toBe("Check your connection and try again.");
  });

  test("preserves request ID and digest properties on error instances", () => {
    const errorWithDigest = Object.assign(new Error("Database timeout"), {
      digest: "NEXT_DIGEST_HASH_789",
    });

    expect(errorWithDigest.message).toBe("Database timeout");
    expect(errorWithDigest.digest).toBe("NEXT_DIGEST_HASH_789");

    const apiErrorWithReq = new ApiClientError({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      status: 500,
      requestId: "req-999-xyz",
    });

    expect(apiErrorWithReq.requestId).toBe("req-999-xyz");
    expect(apiErrorWithReq.status).toBe(500);
  });
});
