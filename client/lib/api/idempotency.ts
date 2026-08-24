export function createIdempotencyKey(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("crypto.randomUUID is required to create request keys.");
  }
  return globalThis.crypto.randomUUID();
}
