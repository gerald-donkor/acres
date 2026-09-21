import { createHash } from 'node:crypto';
import { issueRawToken, hashToken, TOKEN_BYTES } from './tokens';

describe('tokens', () => {
  describe('TOKEN_BYTES', () => {
    it('is 32 bytes (256 bits of entropy)', () => {
      expect(TOKEN_BYTES).toBe(32);
    });
  });

  describe('issueRawToken', () => {
    it('generates a 43-character URL-safe base64url string', () => {
      const token = issueRawToken();

      expect(token).toHaveLength(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(token).not.toContain('+');
      expect(token).not.toContain('/');
      expect(token).not.toContain('=');
    });

    it('generates unique tokens across multiple calls', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 50; i++) {
        tokens.add(issueRawToken());
      }
      expect(tokens.size).toBe(50);
    });
  });

  describe('hashToken', () => {
    it('returns a 64-character lowercase hexadecimal sha256 hash', () => {
      const token = 'sample-test-token-123';
      const hash = hashToken(token);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('computes deterministic SHA-256 digest matching standard crypto', () => {
      const token = 'another-token-value';
      const expected = createHash('sha256').update(token).digest('hex');

      expect(hashToken(token)).toBe(expected);
      expect(hashToken(token)).toBe(hashToken(token));
    });

    it('produces distinct hashes for distinct input tokens', () => {
      expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
    });
  });
});
