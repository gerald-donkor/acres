const DEFAULT_RETURN_TO = "/app";

export function sanitizeReturnTo(
  value: string | string[] | null | undefined,
  fallback = DEFAULT_RETURN_TO,
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === undefined || candidate === null || candidate.trim() === "") {
    return fallback;
  }

  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  if (candidate.includes("\\") || /[\u0000-\u001f\u007f]/.test(candidate)) {
    return fallback;
  }

  return candidate;
}

export { DEFAULT_RETURN_TO };
