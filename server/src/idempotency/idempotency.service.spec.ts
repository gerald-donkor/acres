import { createHash } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { ApiException } from '../common/api-exception';
import { AcresConfigService } from '../config/acres-config.service';
import type { TenantTransactionClient } from '../prisma/tenant-transaction.service';
import {
  IdempotencyService,
  type IdempotencyScope,
} from './idempotency.service';

type IdempotencyRecordPort = Pick<
  TenantTransactionClient['idempotencyRecord'],
  'deleteMany' | 'findFirst' | 'createMany' | 'update'
>;

type TransactionDouble = {
  idempotencyRecord: jest.Mocked<IdempotencyRecordPort>;
};

const FIXED_NOW = new Date('2026-09-05T12:00:00.000Z');
const ACCOUNT_ID = '018f7611-89ab-7abc-9234-111111111111';
const ORGANIZATION_ID = '018f7611-89ab-7abc-9234-222222222222';
const KEY = 'idempotency-key-0001';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: '018f7611-89ab-7abc-9234-333333333333',
    keyDigest: sha256(`idempotency-key:${KEY}`),
    accountId: ACCOUNT_ID,
    organizationId: ORGANIZATION_ID,
    operation: 'reports.create',
    requestHash: sha256(
      'idempotency-body:{"filters":{"active":true,"year":2026},"regions":["north","south"]}',
    ),
    state: 'in_progress' as const,
    responseStatus: null,
    responseBody: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    expiresAt: new Date('2026-09-06T12:00:00.000Z'),
    ...overrides,
  };
}

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let txDouble: TransactionDouble;
  let tx: TenantTransactionClient;

  const scope: IdempotencyScope = {
    key: KEY,
    accountId: ACCOUNT_ID,
    organizationId: ORGANIZATION_ID,
    operation: 'reports.create',
    requestBody: {
      regions: ['north', 'south'],
      filters: { year: 2026, active: true },
    },
    responseStatus: 201,
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);

    txDouble = {
      idempotencyRecord: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(null),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve(record(data as Record<string, unknown>)),
          ),
      } as jest.Mocked<IdempotencyRecordPort>,
    };
    tx = txDouble as unknown as TenantTransactionClient;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        {
          provide: AcresConfigService,
          useValue: { idempotencyTtlHours: 24 },
        },
      ],
    }).compile();

    service = module.get(IdempotencyService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each([
    ['absent', undefined],
    ['too short', 'x'.repeat(15)],
    ['too long', 'x'.repeat(129)],
    ['space', 'valid-key-has space'],
    ['control', `valid-key-000000\n`],
    ['non-ASCII', 'valid-key-00000é'],
  ])(
    'rejects an %s key before touching the transaction or callback',
    async (_, key) => {
      const callback = jest.fn();

      await expect(
        service.run(tx, { ...scope, key }, callback),
      ).rejects.toMatchObject({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
      } satisfies Partial<ApiException>);
      expect(txDouble.idempotencyRecord.deleteMany).not.toHaveBeenCalled();
      expect(txDouble.idempotencyRecord.findFirst).not.toHaveBeenCalled();
      expect(txDouble.idempotencyRecord.createMany).not.toHaveBeenCalled();
      expect(txDouble.idempotencyRecord.update).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    },
  );

  it.each([['!'.repeat(16)], ['~'.repeat(128)]])(
    'accepts a printable-ASCII boundary key of length %s',
    async (key) => {
      const callback = jest.fn().mockResolvedValue({ id: 'result-1' });

      await expect(
        service.run(tx, { ...scope, key }, callback),
      ).resolves.toEqual({ id: 'result-1' });
      expect(callback).toHaveBeenCalledTimes(1);
    },
  );

  it('uses exact scoped digests, deletes expiry first, and never persists raw inputs', async () => {
    const callback = jest.fn().mockResolvedValue({ id: 'result-1' });
    const keyDigest = sha256(`idempotency-key:${KEY}`);
    const requestHash = sha256(
      'idempotency-body:{"filters":{"active":true,"year":2026},"regions":["north","south"]}',
    );

    await service.run(tx, scope, callback);

    const where = {
      keyDigest,
      accountId: ACCOUNT_ID,
      organizationId: ORGANIZATION_ID,
      operation: 'reports.create',
    };
    expect(txDouble.idempotencyRecord.deleteMany).toHaveBeenCalledWith({
      where: { ...where, expiresAt: { lte: FIXED_NOW } },
    });
    expect(txDouble.idempotencyRecord.findFirst).toHaveBeenCalledWith({
      where: { ...where, expiresAt: { gt: FIXED_NOW } },
    });
    expect(
      txDouble.idempotencyRecord.deleteMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      txDouble.idempotencyRecord.findFirst.mock.invocationCallOrder[0],
    );
    expect(txDouble.idempotencyRecord.createMany).toHaveBeenCalledWith({
      data: {
        id: expect.any(String) as string,
        ...where,
        requestHash,
        state: 'in_progress',
        expiresAt: new Date('2026-09-06T12:00:00.000Z'),
      },
      skipDuplicates: true,
    });
    expect(
      JSON.stringify(txDouble.idempotencyRecord.createMany.mock.calls),
    ).not.toContain(KEY);
    expect(
      JSON.stringify(txDouble.idempotencyRecord.createMany.mock.calls),
    ).not.toContain('north');
  });

  it('canonicalizes nested object keys recursively', async () => {
    const matching = record({
      state: 'succeeded',
      responseBody: { id: 'same' },
    });
    txDouble.idempotencyRecord.findFirst.mockResolvedValue(matching);

    await expect(
      service.run(
        tx,
        {
          ...scope,
          requestBody: {
            filters: { active: true, year: 2026 },
            regions: ['north', 'south'],
          },
        },
        jest.fn(),
      ),
    ).resolves.toEqual({ id: 'same' });
  });

  it('preserves array order in the request hash', async () => {
    txDouble.idempotencyRecord.findFirst.mockResolvedValue(
      record({ state: 'succeeded', responseBody: { id: 'same' } }),
    );

    await expect(
      service.run(
        tx,
        {
          ...scope,
          requestBody: {
            regions: ['south', 'north'],
            filters: { year: 2026, active: true },
          },
        },
        jest.fn(),
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('preserves value types in the request hash', async () => {
    txDouble.idempotencyRecord.findFirst.mockResolvedValue(
      record({ state: 'succeeded', responseBody: { id: 'same' } }),
    );

    await expect(
      service.run(
        tx,
        {
          ...scope,
          requestBody: {
            regions: ['north', 'south'],
            filters: { year: '2026', active: true },
          },
        },
        jest.fn(),
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('replays a completed matching response without a side effect', async () => {
    const callback = jest.fn();
    txDouble.idempotencyRecord.findFirst.mockResolvedValue(
      record({
        state: 'succeeded',
        responseStatus: 201,
        responseBody: { id: 'result-1' },
      }),
    );

    await expect(service.run(tx, scope, callback)).resolves.toEqual({
      id: 'result-1',
    });
    expect(txDouble.idempotencyRecord.createMany).not.toHaveBeenCalled();
    expect(txDouble.idempotencyRecord.update).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it('rejects a changed body without a side effect', async () => {
    const callback = jest.fn();
    txDouble.idempotencyRecord.findFirst.mockResolvedValue(
      record({ requestHash: 'different' }),
    );

    await expect(service.run(tx, scope, callback)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(txDouble.idempotencyRecord.createMany).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it.each([
    ['in_progress', null],
    ['succeeded', null],
  ])(
    'fails closed for a matching %s record with no replayable body',
    async (state, responseBody) => {
      const callback = jest.fn();
      txDouble.idempotencyRecord.findFirst.mockResolvedValue(
        record({ state, responseBody }),
      );

      await expect(service.run(tx, scope, callback)).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(txDouble.idempotencyRecord.createMany).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    },
  );

  it('reserves, invokes once, and completes the same record', async () => {
    const response = { id: 'result-1' };
    const callback = jest.fn().mockResolvedValue(response);

    await expect(service.run(tx, scope, callback)).resolves.toEqual(response);

    const reservation = txDouble.idempotencyRecord.createMany.mock
      .calls[0][0] as { data: { id: string } };
    expect(callback).toHaveBeenCalledTimes(1);
    expect(txDouble.idempotencyRecord.update).toHaveBeenCalledWith({
      where: { id: reservation.data.id },
      data: {
        state: 'succeeded',
        responseStatus: 201,
        responseBody: response,
      },
    });
  });

  it('preserves callback rejection and relies on the enclosing transaction rollback', async () => {
    const failure = new Error('command failed');
    const callback = jest.fn().mockRejectedValue(failure);

    await expect(service.run(tx, scope, callback)).rejects.toBe(failure);
    expect(txDouble.idempotencyRecord.update).not.toHaveBeenCalled();
  });

  it('preserves a non-unique reservation failure', async () => {
    const failure = Object.assign(new Error('database unavailable'), {
      code: 'P1001',
    });
    txDouble.idempotencyRecord.createMany.mockRejectedValue(failure);

    await expect(service.run(tx, scope, jest.fn())).rejects.toBe(failure);
  });

  it.each([
    [
      'completed',
      record({ state: 'succeeded', responseBody: { id: 'winner' } }),
      'winner',
    ],
    ['in progress', record(), 'CONFLICT'],
    [
      'changed body',
      record({ requestHash: 'different' }),
      'IDEMPOTENCY_CONFLICT',
    ],
    ['missing', null, 'IDEMPOTENCY_CONFLICT'],
  ])(
    'fails closed or replays for a duplicate reservation whose winner is %s',
    async (_, winner, outcome) => {
      txDouble.idempotencyRecord.createMany.mockResolvedValue({ count: 0 });
      txDouble.idempotencyRecord.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(winner);
      const callback = jest.fn();

      const result = service.run(tx, scope, callback);
      if (outcome === 'winner') {
        await expect(result).resolves.toEqual({ id: 'winner' });
      } else {
        await expect(result).rejects.toMatchObject({ code: outcome });
      }
      expect(callback).not.toHaveBeenCalled();
      expect(txDouble.idempotencyRecord.update).not.toHaveBeenCalled();
    },
  );
});
