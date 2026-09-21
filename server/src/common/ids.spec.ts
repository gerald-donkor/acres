import { uuidV7 } from './ids';

describe('ids', () => {
  describe('uuidV7', () => {
    const UUID_V7_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    it('generates a valid RFC 9562 UUIDv7 string', () => {
      const id = uuidV7();

      expect(id).toHaveLength(36);
      expect(id).toMatch(UUID_V7_REGEX);
      expect(id[14]).toBe('7');
      expect(['8', '9', 'a', 'b']).toContain(id[19]);
    });

    it('generates unique values across multiple invocations', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(uuidV7());
      }
      expect(ids.size).toBe(100);
    });

    it('embeds timestamp in leading 48 bits that is monotonically non-decreasing', async () => {
      const id1 = uuidV7();
      await new Promise((resolve) => setTimeout(resolve, 5));
      const id2 = uuidV7();

      // Leading 48 bits = 12 hex characters (8 in group 1, 4 in group 2)
      const tsHex1 = id1.slice(0, 8) + id1.slice(9, 13);
      const tsHex2 = id2.slice(0, 8) + id2.slice(9, 13);

      const ts1 = BigInt(`0x${tsHex1}`);
      const ts2 = BigInt(`0x${tsHex2}`);

      expect(ts2).toBeGreaterThanOrEqual(ts1);
    });
  });
});
