import { ApiException } from '../common/api-exception';
import type { PrismaService } from '../prisma/prisma.service';
import { PostgresThrottlerStorage } from './postgres-throttler.storage';

const digest = 'a'.repeat(64);
describe('PostgresThrottlerStorage failure boundary', () => {
  const transaction = jest.fn();
  const storage = new PostgresThrottlerStorage({
    $transaction: transaction,
  } as unknown as PrismaService);
  beforeEach(() => transaction.mockReset());

  it.each([NaN, Infinity, 0, -1, 1.5, Number.MAX_SAFE_INTEGER])(
    'rejects invalid/beyond-bound numbers: %s',
    async (number) => {
      await expect(
        storage.increment(digest, number, 2, 1000, 'default'),
      ).rejects.toBeInstanceOf(ApiException);
      await expect(
        storage.increment(digest, 1000, number, 1000, 'default'),
      ).rejects.toBeInstanceOf(ApiException);
      await expect(
        storage.increment(digest, 1000, 2, number, 'default'),
      ).rejects.toBeInstanceOf(ApiException);
      expect(transaction).not.toHaveBeenCalled();
    },
  );
  it('rejects raw trackers before persistence', async () => {
    await expect(
      storage.increment('127.0.0.1', 1000, 2, 1000, 'default'),
    ).rejects.toBeInstanceOf(ApiException);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('sanitizes acquisition/query errors and cleanup errors without retaining a cause', async () => {
    transaction.mockRejectedValue(
      new Error('postgresql://password secret SQL tracker'),
    );
    for (const promise of [
      storage.increment(digest, 1000, 2, 1000, 'default'),
      storage.cleanupOnce(),
    ]) {
      const error = (await promise.catch((e: unknown) => e)) as ApiException;
      expect(error.getStatus()).toBe(503);
      expect(JSON.stringify(error)).not.toMatch(/password|SQL|tracker/);
      expect(error.cause).toBeUndefined();
    }
  });
});
