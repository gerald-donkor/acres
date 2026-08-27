/**
 * Calculates SHA-256 hex string using Web Crypto API.
 */
export async function calculateSha256(
  input: Blob | ArrayBuffer | Uint8Array,
): Promise<string> {
  let buffer: ArrayBuffer;
  if (input instanceof Blob) {
    buffer = await input.arrayBuffer();
  } else if (input instanceof Uint8Array) {
    buffer = input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength,
    ) as ArrayBuffer;
  } else {
    buffer = input;
  }

  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
