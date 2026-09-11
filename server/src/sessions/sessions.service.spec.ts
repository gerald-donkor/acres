import { SessionsService } from './sessions.service';
import { RETENTION_PURGE_BATCH_LIMIT } from '../jobs/retention-maintenance.job';
import type { PrismaService } from '../prisma/prisma.service';
import type { AcresConfigService } from '../config/acres-config.service';

describe('SessionsService.purgeExpired', () => {
  function buildService(prisma: unknown) {
    const config = {} as unknown as AcresConfigService;
    return new SessionsService(prisma as PrismaService, config);
  }

  it('selects oldest-first bounded ids and deletes by id list', async () => {
    const prisma = {
      session: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'sess-1' }, { id: 'sess-2' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const service = buildService(prisma);

    const before = new Date('2026-09-11T00:00:00.000Z');
    const count = await service.purgeExpired(before);

    expect(count).toBe(2);
    expect(prisma.session.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ expiresAt: { lt: before } }, { revokedAt: { not: null } }],
      },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: RETENTION_PURGE_BATCH_LIMIT,
    });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['sess-1', 'sess-2'] } },
    });
  });

  it('returns 0 without a write when no rows match', async () => {
    const prisma = {
      session: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
    };
    const service = buildService(prisma);

    const count = await service.purgeExpired();

    expect(count).toBe(0);
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it('bounds each tick to the documented batch limit', async () => {
    const prisma = {
      session: {
        findMany: jest.fn().mockResolvedValue([{ id: 'sess-1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = buildService(prisma);

    await service.purgeExpired();

    const findCalls = prisma.session.findMany.mock.calls as unknown as [
      [{ take: number; orderBy: { expiresAt: string } }],
    ];
    expect(findCalls[0][0].take).toBe(500);
    expect(findCalls[0][0].orderBy).toEqual({ expiresAt: 'asc' });
    expect(RETENTION_PURGE_BATCH_LIMIT).toBe(500);
  });

  it('reclaims 500 rows when a larger backlog drains across ticks', async () => {
    const backlog = Array.from({ length: 500 }, (_, i) => ({
      id: `sess-${i}`,
    }));
    const prisma = {
      session: {
        findMany: jest.fn().mockResolvedValue(backlog),
        deleteMany: jest.fn().mockResolvedValue({ count: 500 }),
      },
    };
    const service = buildService(prisma);

    const count = await service.purgeExpired();

    expect(count).toBe(500);
    expect(prisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { expiresAt: 'asc' },
        take: 500,
      }),
    );
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: backlog.map((row) => row.id) } },
    });
  });
});
