import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import type { AcresConfigService } from '../config/acres-config.service';
import { CursorCodec } from './cursor-codec';
import type { CursorKind } from './cursor-codec';
import { connectionFromWindow, connectionWindow } from './pagination';

describe('GraphQL Pagination', () => {
  describe('connectionWindow', () => {
    let mockCodec: {
      decode: jest.Mock;
      encode: jest.Mock;
    };
    let mockConfig: {
      graphqlMaxFirst: number;
    };

    beforeEach(() => {
      mockCodec = {
        decode: jest.fn(),
        encode: jest.fn(),
      };
      mockConfig = {
        graphqlMaxFirst: 50,
      };
    });

    const createOptions = (
      overrides?: Partial<Parameters<typeof connectionWindow>[0]>,
    ) => ({
      first: undefined,
      after: undefined,
      kind: 'regions' as CursorKind,
      organizationId: '018f0000-0000-7000-8000-000000000001',
      codec: mockCodec as unknown as CursorCodec,
      config: mockConfig as unknown as AcresConfigService,
      ...overrides,
    });

    describe('first defaults', () => {
      it('defaults first to 20 when omitted and config.graphqlMaxFirst >= 20', () => {
        mockConfig.graphqlMaxFirst = 50;
        const window = connectionWindow(createOptions({ first: undefined }));

        expect(window.first).toBe(20);
        expect(window.take).toBe(21);
      });

      it('defaults first to config.graphqlMaxFirst when config.graphqlMaxFirst < 20', () => {
        mockConfig.graphqlMaxFirst = 10;
        const window = connectionWindow(createOptions({ first: undefined }));

        expect(window.first).toBe(10);
        expect(window.take).toBe(11);
      });

      it('uses the provided first when within allowed bounds', () => {
        const window = connectionWindow(createOptions({ first: 15 }));

        expect(window.first).toBe(15);
        expect(window.take).toBe(16);
      });
    });

    describe('first validation', () => {
      it('throws ApiException.queryLimitExceeded when first is 0', () => {
        expect(() => connectionWindow(createOptions({ first: 0 }))).toThrow(
          ApiException,
        );

        try {
          connectionWindow(createOptions({ first: 0 }));
          fail('expected exception');
        } catch (error) {
          expect(error).toBeInstanceOf(ApiException);
          const apiException = error as ApiException;
          expect(apiException.code).toBe('QUERY_LIMIT_EXCEEDED');
          expect(apiException.getStatus()).toBe(HttpStatus.BAD_REQUEST);
          expect(apiException.message).toBe('first must be between 1 and 50.');
        }
      });

      it('throws ApiException.queryLimitExceeded when first < 1 (negative)', () => {
        expect(() => connectionWindow(createOptions({ first: -5 }))).toThrow(
          ApiException,
        );

        try {
          connectionWindow(createOptions({ first: -1 }));
          fail('expected exception');
        } catch (error) {
          const apiException = error as ApiException;
          expect(apiException.code).toBe('QUERY_LIMIT_EXCEEDED');
          expect(apiException.message).toBe('first must be between 1 and 50.');
        }
      });

      it('throws ApiException.queryLimitExceeded when first > config.graphqlMaxFirst', () => {
        mockConfig.graphqlMaxFirst = 50;

        expect(() => connectionWindow(createOptions({ first: 51 }))).toThrow(
          ApiException,
        );

        try {
          connectionWindow(createOptions({ first: 100 }));
          fail('expected exception');
        } catch (error) {
          const apiException = error as ApiException;
          expect(apiException.code).toBe('QUERY_LIMIT_EXCEEDED');
          expect(apiException.getStatus()).toBe(HttpStatus.BAD_REQUEST);
          expect(apiException.message).toBe('first must be between 1 and 50.');
        }
      });

      it('throws ApiException.queryLimitExceeded when first is a non-integer float (e.g. 5.5)', () => {
        expect(() => connectionWindow(createOptions({ first: 5.5 }))).toThrow(
          ApiException,
        );

        try {
          connectionWindow(createOptions({ first: 5.5 }));
          fail('expected exception');
        } catch (error) {
          const apiException = error as ApiException;
          expect(apiException.code).toBe('QUERY_LIMIT_EXCEEDED');
        }
      });

      it('throws ApiException.queryLimitExceeded when first is NaN', () => {
        expect(() =>
          connectionWindow(createOptions({ first: Number.NaN })),
        ).toThrow(ApiException);

        try {
          connectionWindow(createOptions({ first: Number.NaN }));
          fail('expected exception');
        } catch (error) {
          const apiException = error as ApiException;
          expect(apiException.code).toBe('QUERY_LIMIT_EXCEEDED');
        }
      });

      it('throws ApiException.queryLimitExceeded when first is Infinity', () => {
        expect(() =>
          connectionWindow(createOptions({ first: Number.POSITIVE_INFINITY })),
        ).toThrow(ApiException);

        try {
          connectionWindow(createOptions({ first: Number.POSITIVE_INFINITY }));
          fail('expected exception');
        } catch (error) {
          const apiException = error as ApiException;
          expect(apiException.code).toBe('QUERY_LIMIT_EXCEEDED');
        }
      });

      it('throws ApiException.queryLimitExceeded when first is -Infinity', () => {
        expect(() =>
          connectionWindow(createOptions({ first: Number.NEGATIVE_INFINITY })),
        ).toThrow(ApiException);

        try {
          connectionWindow(createOptions({ first: Number.NEGATIVE_INFINITY }));
          fail('expected exception');
        } catch (error) {
          const apiException = error as ApiException;
          expect(apiException.code).toBe('QUERY_LIMIT_EXCEEDED');
        }
      });
    });

    describe('cursor decoding and return values', () => {
      it('decodes after cursor using codec.decode({ kind, organizationId })', () => {
        mockCodec.decode.mockReturnValue({
          v: 1,
          kind: 'regions',
          organizationId: '018f0000-0000-7000-8000-000000000001',
          sort: [
            '2026-09-01T12:00:00.000Z',
            '018f0000-0000-7000-8000-000000000099',
          ],
        });

        const window = connectionWindow(
          createOptions({
            first: 10,
            after: 'valid-cursor-token',
            kind: 'regions',
            organizationId: '018f0000-0000-7000-8000-000000000001',
          }),
        );

        expect(mockCodec.decode).toHaveBeenCalledTimes(1);
        expect(mockCodec.decode).toHaveBeenCalledWith('valid-cursor-token', {
          kind: 'regions',
          organizationId: '018f0000-0000-7000-8000-000000000001',
        });
        expect(window).toEqual({
          first: 10,
          take: 11,
          afterId: '018f0000-0000-7000-8000-000000000099',
        });
      });

      it('handles after: undefined (decoded is null, afterId: undefined)', () => {
        mockCodec.decode.mockReturnValue(null);

        const window = connectionWindow(
          createOptions({
            first: 25,
            after: undefined,
            kind: 'organizationMembers',
            organizationId: null,
          }),
        );

        expect(mockCodec.decode).toHaveBeenCalledTimes(1);
        expect(mockCodec.decode).toHaveBeenCalledWith(undefined, {
          kind: 'organizationMembers',
          organizationId: null,
        });
        expect(window).toEqual({
          first: 25,
          take: 26,
          afterId: undefined,
        });
      });

      it('propagates ApiException when codec.decode throws (e.g. cursorInvalid)', () => {
        mockCodec.decode.mockImplementation(() => {
          throw ApiException.cursorInvalid();
        });

        expect(() =>
          connectionWindow(
            createOptions({
              first: 10,
              after: 'corrupted-or-invalid-cursor',
            }),
          ),
        ).toThrow(ApiException);

        try {
          connectionWindow(
            createOptions({
              first: 10,
              after: 'corrupted-or-invalid-cursor',
            }),
          );
          fail('expected cursorInvalid exception');
        } catch (error) {
          const apiException = error as ApiException;
          expect(apiException.code).toBe('CURSOR_INVALID');
          expect(apiException.getStatus()).toBe(HttpStatus.BAD_REQUEST);
          expect(apiException.message).toBe(
            'The cursor is not valid for this connection.',
          );
        }
      });
    });
  });

  describe('connectionFromWindow', () => {
    let mockCodec: {
      decode: jest.Mock;
      encode: jest.Mock;
    };

    beforeEach(() => {
      let encodeCounter = 0;
      mockCodec = {
        decode: jest.fn(),
        encode: jest.fn(
          (payload: Parameters<CursorCodec['encode']>[0]) =>
            `encoded-cursor-${++encodeCounter}-${payload.sort[1]}`,
        ),
      };
    });

    const createOptions = (
      overrides?: Partial<Parameters<typeof connectionFromWindow>[1]>,
    ) => ({
      first: 3,
      kind: 'regions' as CursorKind,
      organizationId: 'org-abc',
      codec: mockCodec as unknown as CursorCodec,
      ...overrides,
    });

    describe('mapping rows and slicing window', () => {
      it('maps rows to edges using codec.encode({ kind, organizationId, sort: [sortValue(node), node.id] })', () => {
        const rows = [
          { id: 'id-1', createdAt: '2026-09-01T00:00:00Z', name: 'Region 1' },
          { id: 'id-2', createdAt: '2026-09-02T00:00:00Z', name: 'Region 2' },
        ];

        const connection = connectionFromWindow(
          rows,
          createOptions({ first: 5 }),
        );

        expect(mockCodec.encode).toHaveBeenCalledTimes(2);
        expect(mockCodec.encode).toHaveBeenNthCalledWith(1, {
          kind: 'regions',
          organizationId: 'org-abc',
          sort: ['2026-09-01T00:00:00Z', 'id-1'],
        });
        expect(mockCodec.encode).toHaveBeenNthCalledWith(2, {
          kind: 'regions',
          organizationId: 'org-abc',
          sort: ['2026-09-02T00:00:00Z', 'id-2'],
        });

        expect(connection.edges).toEqual([
          { cursor: 'encoded-cursor-1-id-1', node: rows[0] },
          { cursor: 'encoded-cursor-2-id-2', node: rows[1] },
        ]);
      });

      it('slices rows to first count, ignoring the extra +1 element from the database window', () => {
        const rows = [
          { id: 'row-1', name: 'Item 1' },
          { id: 'row-2', name: 'Item 2' },
          { id: 'row-3', name: 'Item 3' },
          { id: 'row-4-extra', name: 'Item 4' },
        ];

        const connection = connectionFromWindow(
          rows,
          createOptions({ first: 3 }),
        );

        expect(connection.edges).toHaveLength(3);
        expect(connection.edges.map((e) => e.node.id)).toEqual([
          'row-1',
          'row-2',
          'row-3',
        ]);
        expect(mockCodec.encode).toHaveBeenCalledTimes(3);
      });
    });

    describe('pageInfo calculation', () => {
      it('sets hasNextPage: true when rows.length > first', () => {
        const rows = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];

        const connection = connectionFromWindow(
          rows,
          createOptions({ first: 3 }),
        );

        expect(connection.pageInfo.hasNextPage).toBe(true);
      });

      it('sets hasNextPage: false when rows.length === first', () => {
        const rows = [{ id: '1' }, { id: '2' }, { id: '3' }];

        const connection = connectionFromWindow(
          rows,
          createOptions({ first: 3 }),
        );

        expect(connection.pageInfo.hasNextPage).toBe(false);
      });

      it('sets hasNextPage: false when rows.length < first', () => {
        const rows = [{ id: '1' }, { id: '2' }];

        const connection = connectionFromWindow(
          rows,
          createOptions({ first: 3 }),
        );

        expect(connection.pageInfo.hasNextPage).toBe(false);
      });

      it('sets endCursor to the cursor of the last edge when edges are present', () => {
        const rows = [{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }];

        const connection = connectionFromWindow(
          rows,
          createOptions({ first: 3 }),
        );

        expect(connection.edges).toHaveLength(3);
        const lastEdge = connection.edges[2];
        expect(connection.pageInfo.endCursor).toBe(lastEdge.cursor);
      });

      it('sets endCursor: null and hasNextPage: false when rows is empty', () => {
        const connection = connectionFromWindow(
          [],
          createOptions({ first: 10 }),
        );

        expect(connection.edges).toEqual([]);
        expect(connection.pageInfo).toEqual({
          hasNextPage: false,
          endCursor: null,
        });
        expect(mockCodec.encode).not.toHaveBeenCalled();
      });
    });

    describe('sortValue fallback resolution', () => {
      it('uses row.createdAt if present (even if row.name is present)', () => {
        const rows = [
          {
            id: 'item-1',
            createdAt: '2026-09-21T10:00:00.000Z',
            name: 'Named Item',
          },
        ];

        connectionFromWindow(rows, createOptions({ first: 1 }));

        expect(mockCodec.encode).toHaveBeenCalledWith({
          kind: 'regions',
          organizationId: 'org-abc',
          sort: ['2026-09-21T10:00:00.000Z', 'item-1'],
        });
      });

      it('falls back to row.name if createdAt is undefined', () => {
        const rows = [
          {
            id: 'item-2',
            name: 'Named Item',
          },
        ];

        connectionFromWindow(rows, createOptions({ first: 1 }));

        expect(mockCodec.encode).toHaveBeenCalledWith({
          kind: 'regions',
          organizationId: 'org-abc',
          sort: ['Named Item', 'item-2'],
        });
      });

      it('falls back to empty string if neither createdAt nor name is present', () => {
        const rows = [
          {
            id: 'item-3',
          },
        ];

        connectionFromWindow(rows, createOptions({ first: 1 }));

        expect(mockCodec.encode).toHaveBeenCalledWith({
          kind: 'regions',
          organizationId: 'org-abc',
          sort: ['', 'item-3'],
        });
      });

      it('uses empty string createdAt without falling back to name due to nullish coalescing', () => {
        const rows = [
          {
            id: 'item-4',
            createdAt: '',
            name: 'Fallback Name',
          },
        ];

        connectionFromWindow(rows, createOptions({ first: 1 }));

        expect(mockCodec.encode).toHaveBeenCalledWith({
          kind: 'regions',
          organizationId: 'org-abc',
          sort: ['', 'item-4'],
        });
      });
    });
  });

  describe('Integration with real CursorCodec', () => {
    it('successfully round-trips pagination tokens between connectionFromWindow and connectionWindow', () => {
      const realConfig = {
        sessionSecret: 'secret-key-that-is-at-least-32-chars-long-for-hmac',
        graphqlMaxFirst: 25,
      } as unknown as AcresConfigService;

      const realCodec = new CursorCodec(realConfig);
      const organizationId = '018f0000-0000-7000-8000-000000000001';

      // Page 1: fetched 3 items with take = 3 (first = 2 + 1)
      const page1Rows = [
        { id: 'id-01', createdAt: '2026-09-01T00:00:00Z', name: 'First' },
        { id: 'id-02', createdAt: '2026-09-02T00:00:00Z', name: 'Second' },
        { id: 'id-03', createdAt: '2026-09-03T00:00:00Z', name: 'Third' },
      ];

      const page1Connection = connectionFromWindow(page1Rows, {
        first: 2,
        kind: 'regions',
        organizationId,
        codec: realCodec,
      });

      expect(page1Connection.edges).toHaveLength(2);
      expect(page1Connection.pageInfo.hasNextPage).toBe(true);
      expect(page1Connection.pageInfo.endCursor).toBeDefined();

      const endCursor = page1Connection.pageInfo.endCursor!;

      // Client requests Page 2 with after: endCursor
      const page2Window = connectionWindow({
        first: 2,
        after: endCursor,
        kind: 'regions',
        organizationId,
        codec: realCodec,
        config: realConfig,
      });

      expect(page2Window.first).toBe(2);
      expect(page2Window.take).toBe(3);
      // afterId should correspond to the second item's ID (the last edge of page 1)
      expect(page2Window.afterId).toBe('id-02');
    });

    it('rejects cursor tampered with or used against wrong organizationId or kind', () => {
      const realConfig = {
        sessionSecret: 'secret-key-that-is-at-least-32-chars-long-for-hmac',
        graphqlMaxFirst: 25,
      } as unknown as AcresConfigService;

      const realCodec = new CursorCodec(realConfig);
      const rows = [{ id: 'item-01', name: 'Item 1' }];

      const connection = connectionFromWindow(rows, {
        first: 1,
        kind: 'regions',
        organizationId: 'org-1',
        codec: realCodec,
      });

      const cursor = connection.pageInfo.endCursor!;

      // Wrong organization
      expect(() =>
        connectionWindow({
          first: 1,
          after: cursor,
          kind: 'regions',
          organizationId: 'org-2',
          codec: realCodec,
          config: realConfig,
        }),
      ).toThrow(ApiException);

      // Wrong kind
      expect(() =>
        connectionWindow({
          first: 1,
          after: cursor,
          kind: 'organizationMembers',
          organizationId: 'org-1',
          codec: realCodec,
          config: realConfig,
        }),
      ).toThrow(ApiException);
    });
  });
});
