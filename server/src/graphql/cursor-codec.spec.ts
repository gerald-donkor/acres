import { createHmac } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import type { AcresConfigService } from '../config/acres-config.service';
import { CURSOR_KINDS, CursorCodec, isCursorKind } from './cursor-codec';
import type { CursorKind } from './cursor-codec';

describe('CursorCodec and cursor utilities', () => {
  const defaultSecret = 'acres-test-session-secret-32-chars-minimum-len!';
  const alternateSecret = 'different-secret-for-hmac-verification-key!!';

  function createMockConfig(secret = defaultSecret): AcresConfigService {
    return {
      sessionSecret: secret,
    } as unknown as AcresConfigService;
  }

  function expectCursorInvalid(action: () => unknown): void {
    expect(action).toThrow(ApiException);
    try {
      action();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiException);
      const apiError = err as ApiException;
      expect(apiError.code).toBe('CURSOR_INVALID');
      expect(apiError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(apiError.message).toBe(
        'The cursor is not valid for this connection.',
      );
    }
  }

  function createRawCursor(
    bodyBytes: Buffer,
    secret: string,
    options?: {
      omitDot?: boolean;
      tamperMac?: boolean;
      customMac?: Buffer;
    },
  ): string {
    if (options?.omitDot) {
      return bodyBytes.toString('base64url');
    }
    let mac =
      options?.customMac ??
      createHmac('sha256', secret)
        .update('acres.cursor.v1')
        .update(bodyBytes)
        .digest();
    if (options?.tamperMac) {
      mac = Buffer.from(mac);
      mac[0] ^= 0x01;
    }
    return Buffer.concat([bodyBytes, Buffer.from('.'), mac]).toString(
      'base64url',
    );
  }

  function createSignedCursor(
    payload: Record<string, unknown>,
    secret: string,
    options?: {
      omitDot?: boolean;
      tamperMac?: boolean;
      customMac?: Buffer;
    },
  ): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    return createRawCursor(body, secret, options);
  }

  describe('isCursorKind', () => {
    it('validates all values defined in CURSOR_KINDS', () => {
      expect(CURSOR_KINDS).toEqual([
        'organizationMembers',
        'organizationInvitations',
        'organizationAuditEvents',
        'regions',
      ]);

      for (const kind of CURSOR_KINDS) {
        expect(isCursorKind(kind)).toBe(true);
      }
    });

    it('rejects invalid strings', () => {
      expect(isCursorKind('')).toBe(false);
      expect(isCursorKind(' ')).toBe(false);
      expect(isCursorKind('unknown')).toBe(false);
      expect(isCursorKind('users')).toBe(false);
      expect(isCursorKind('organizations')).toBe(false);
      expect(isCursorKind('REGIONS')).toBe(false);
      expect(isCursorKind('organizationMember')).toBe(false);
    });

    it('rejects null and undefined', () => {
      expect(isCursorKind(null)).toBe(false);
      expect(isCursorKind(undefined)).toBe(false);
    });

    it('rejects numbers', () => {
      expect(isCursorKind(0)).toBe(false);
      expect(isCursorKind(1)).toBe(false);
      expect(isCursorKind(-42)).toBe(false);
      expect(isCursorKind(NaN)).toBe(false);
      expect(isCursorKind(Infinity)).toBe(false);
    });

    it('rejects objects, arrays, and other primitives', () => {
      expect(isCursorKind({})).toBe(false);
      expect(isCursorKind([])).toBe(false);
      expect(isCursorKind({ kind: 'regions' })).toBe(false);
      expect(isCursorKind(['regions'])).toBe(false);
      expect(isCursorKind(true)).toBe(false);
      expect(isCursorKind(false)).toBe(false);
      expect(isCursorKind(Symbol('regions'))).toBe(false);
      expect(isCursorKind(() => 'regions')).toBe(false);
    });
  });

  describe('CursorCodec', () => {
    let codec: CursorCodec;

    beforeEach(() => {
      codec = new CursorCodec(createMockConfig(defaultSecret));
    });

    describe('encode', () => {
      it('builds HMAC using config.sessionSecret and acres.cursor.v1 salt', () => {
        const payload = {
          kind: 'regions' as const,
          organizationId: null,
          sort: ['North America', 'reg_123'] as const,
        };

        const encoded = codec.encode(payload);
        const raw = Buffer.from(encoded, 'base64url');
        const split = raw.indexOf('.');
        expect(split).toBeGreaterThan(0);

        const body = raw.subarray(0, split);
        const mac = raw.subarray(split + 1);

        const expectedBody = Buffer.from(
          JSON.stringify({ v: 1, ...payload }),
          'utf8',
        );
        expect(body).toEqual(expectedBody);

        const expectedMac = createHmac('sha256', defaultSecret)
          .update('acres.cursor.v1')
          .update(body)
          .digest();
        expect(mac).toEqual(expectedMac);
      });

      it('produces different HMACs when sessionSecret changes', () => {
        const altCodec = new CursorCodec(createMockConfig(alternateSecret));
        const payload = {
          kind: 'organizationMembers' as const,
          organizationId: 'org_abc',
          sort: ['2026-01-01', 'mem_1'] as const,
        };

        const encoded1 = codec.encode(payload);
        const encoded2 = altCodec.encode(payload);

        expect(encoded1).not.toBe(encoded2);
      });

      it('outputs a valid base64url encoded string without padding', () => {
        const payload = {
          kind: 'organizationAuditEvents' as const,
          organizationId: 'org_aud_1',
          sort: ['2026-09-21T00:00:00Z', 'evt_999'] as const,
        };

        const encoded = codec.encode(payload);

        // base64url character set: [A-Za-z0-9_-] with no '+', '/', or '='
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(encoded).not.toContain('+');
        expect(encoded).not.toContain('/');
        expect(encoded).not.toContain('=');

        // Decoding base64url returns body.mac
        const raw = Buffer.from(encoded, 'base64url');
        const dotIndex = raw.indexOf('.');
        expect(dotIndex).toBeGreaterThan(0);

        const bodyJson = JSON.parse(
          raw.subarray(0, dotIndex).toString('utf8'),
        ) as Record<string, unknown>;
        expect(bodyJson).toEqual({
          v: 1,
          kind: 'organizationAuditEvents',
          organizationId: 'org_aud_1',
          sort: ['2026-09-21T00:00:00Z', 'evt_999'],
        });

        const mac = raw.subarray(dotIndex + 1);
        expect(mac.length).toBe(32); // SHA-256 digest is 32 bytes
      });
    });

    describe('decode', () => {
      it('roundtrips valid cursor successfully with non-null organizationId', () => {
        const input = {
          kind: 'organizationMembers' as const,
          organizationId: 'org_test_123',
          sort: ['admin', 'usr_456'] as const,
        };

        const cursor = codec.encode(input);
        const decoded = codec.decode(cursor, {
          kind: 'organizationMembers',
          organizationId: 'org_test_123',
        });

        expect(decoded).toEqual({
          v: 1,
          kind: 'organizationMembers',
          organizationId: 'org_test_123',
          sort: ['admin', 'usr_456'],
        });
      });

      it('roundtrips valid cursor successfully with null organizationId (e.g. regions)', () => {
        const input = {
          kind: 'regions' as const,
          organizationId: null,
          sort: ['Midwest', 'reg_mw_1'] as const,
        };

        const cursor = codec.encode(input);
        const decoded = codec.decode(cursor, {
          kind: 'regions',
          organizationId: null,
        });

        expect(decoded).toEqual({
          v: 1,
          kind: 'regions',
          organizationId: null,
          sort: ['Midwest', 'reg_mw_1'],
        });
      });

      it('roundtrips valid cursors for all CURSOR_KINDS', () => {
        const kinds: Array<{ kind: CursorKind; orgId: string | null }> = [
          { kind: 'organizationMembers', orgId: 'org_1' },
          { kind: 'organizationInvitations', orgId: 'org_2' },
          { kind: 'organizationAuditEvents', orgId: 'org_3' },
          { kind: 'regions', orgId: null },
        ];

        for (const { kind, orgId } of kinds) {
          const cursor = codec.encode({
            kind,
            organizationId: orgId,
            sort: ['2026-01-01', `id_${kind}`],
          });
          const result = codec.decode(cursor, {
            kind,
            organizationId: orgId,
          });
          expect(result).toEqual({
            v: 1,
            kind,
            organizationId: orgId,
            sort: ['2026-01-01', `id_${kind}`],
          });
        }
      });

      it('returns null if cursor is undefined, null, or empty string', () => {
        const expected = {
          kind: 'regions' as const,
          organizationId: null,
        };

        expect(codec.decode(undefined, expected)).toBeNull();
        expect(codec.decode(null, expected)).toBeNull();
        expect(codec.decode('', expected)).toBeNull();
      });

      it('throws ApiException.cursorInvalid() if cursor is missing dot delimiter', () => {
        const expected = {
          kind: 'regions' as const,
          organizationId: null,
        };

        // Base64url without any dot
        const noDotCursor = createSignedCursor(
          {
            v: 1,
            kind: 'regions',
            organizationId: null,
            sort: ['a', 'b'],
          },
          defaultSecret,
          { omitDot: true },
        );

        expectCursorInvalid(() => codec.decode(noDotCursor, expected));

        // Cursor starting with a dot (split index === 0 < 1)
        const dotFirst = Buffer.from('.rest-of-payload').toString('base64url');
        expectCursorInvalid(() => codec.decode(dotFirst, expected));
      });

      it('throws ApiException.cursorInvalid() if HMAC is tampered / invalid', () => {
        const expected = {
          kind: 'organizationMembers' as const,
          organizationId: 'org_sec',
        };

        // 1. Bit-flipped HMAC
        const tamperedMacCursor = createSignedCursor(
          {
            v: 1,
            kind: 'organizationMembers',
            organizationId: 'org_sec',
            sort: ['owner', 'mem_1'],
          },
          defaultSecret,
          { tamperMac: true },
        );
        expectCursorInvalid(() => codec.decode(tamperedMacCursor, expected));

        // 2. HMAC signed with wrong secret
        const wrongSecretCursor = createSignedCursor(
          {
            v: 1,
            kind: 'organizationMembers',
            organizationId: 'org_sec',
            sort: ['owner', 'mem_1'],
          },
          alternateSecret,
        );
        expectCursorInvalid(() => codec.decode(wrongSecretCursor, expected));

        // 3. Truncated HMAC
        const truncatedMacCursor = createSignedCursor(
          {
            v: 1,
            kind: 'organizationMembers',
            organizationId: 'org_sec',
            sort: ['owner', 'mem_1'],
          },
          defaultSecret,
          { customMac: Buffer.alloc(16, 0xaa) },
        );
        expectCursorInvalid(() => codec.decode(truncatedMacCursor, expected));

        // 4. Extended HMAC length
        const oversizedMacCursor = createSignedCursor(
          {
            v: 1,
            kind: 'organizationMembers',
            organizationId: 'org_sec',
            sort: ['owner', 'mem_1'],
          },
          defaultSecret,
          { customMac: Buffer.alloc(64, 0xbb) },
        );
        expectCursorInvalid(() => codec.decode(oversizedMacCursor, expected));
      });

      it('throws ApiException.cursorInvalid() if base64url is corrupted / invalid JSON', () => {
        const expected = {
          kind: 'regions' as const,
          organizationId: null,
        };

        // Malformed body that is not JSON, but has valid HMAC for that body
        const badJsonBody = Buffer.from(
          'this is definitely not valid json!',
          'utf8',
        );
        const badJsonCursor = createRawCursor(badJsonBody, defaultSecret);
        expectCursorInvalid(() => codec.decode(badJsonCursor, expected));

        // Completely invalid base64url string with non-base64 characters
        expectCursorInvalid(() => codec.decode('!@#$%^&*()', expected));
      });

      it('throws ApiException.cursorInvalid() if payload v !== 1', () => {
        const expected = {
          kind: 'regions' as const,
          organizationId: null,
        };

        // v: 2
        const v2Cursor = createSignedCursor(
          {
            v: 2,
            kind: 'regions',
            organizationId: null,
            sort: ['a', 'b'],
          },
          defaultSecret,
        );
        expectCursorInvalid(() => codec.decode(v2Cursor, expected));

        // v: 0
        const v0Cursor = createSignedCursor(
          {
            v: 0,
            kind: 'regions',
            organizationId: null,
            sort: ['a', 'b'],
          },
          defaultSecret,
        );
        expectCursorInvalid(() => codec.decode(v0Cursor, expected));

        // v as string
        const vStringCursor = createSignedCursor(
          {
            v: '1',
            kind: 'regions',
            organizationId: null,
            sort: ['a', 'b'],
          },
          defaultSecret,
        );
        expectCursorInvalid(() => codec.decode(vStringCursor, expected));
      });

      it('throws ApiException.cursorInvalid() if payload kind does not match expected kind', () => {
        // Encoded as regions, expected as organizationMembers
        const regionsCursor = codec.encode({
          kind: 'regions',
          organizationId: null,
          sort: ['region_a', 'reg_1'],
        });

        expectCursorInvalid(() =>
          codec.decode(regionsCursor, {
            kind: 'organizationMembers',
            organizationId: null,
          }),
        );

        // Encoded as organizationAuditEvents, expected as organizationInvitations
        const auditCursor = codec.encode({
          kind: 'organizationAuditEvents',
          organizationId: 'org_match',
          sort: ['2026-01-01', 'aud_1'],
        });

        expectCursorInvalid(() =>
          codec.decode(auditCursor, {
            kind: 'organizationInvitations',
            organizationId: 'org_match',
          }),
        );
      });

      it('throws ApiException.cursorInvalid() if payload organizationId does not match expected organizationId', () => {
        const cursor = codec.encode({
          kind: 'organizationMembers',
          organizationId: 'org_tenant_A',
          sort: ['member', 'mem_123'],
        });

        // Mismatched orgId: tenant_A vs tenant_B
        expectCursorInvalid(() =>
          codec.decode(cursor, {
            kind: 'organizationMembers',
            organizationId: 'org_tenant_B',
          }),
        );

        // Expected null orgId when cursor has 'org_tenant_A'
        expectCursorInvalid(() =>
          codec.decode(cursor, {
            kind: 'organizationMembers',
            organizationId: null,
          }),
        );

        // Encoded with null orgId, expected 'org_tenant_A'
        const nullOrgCursor = codec.encode({
          kind: 'regions',
          organizationId: null,
          sort: ['East', 'reg_east'],
        });

        expectCursorInvalid(() =>
          codec.decode(nullOrgCursor, {
            kind: 'regions',
            organizationId: 'org_tenant_A',
          }),
        );
      });

      it('throws ApiException.cursorInvalid() if payload sort is not a 2-element array', () => {
        const expected = {
          kind: 'regions' as const,
          organizationId: null,
        };

        // 1. sort is not an array (string)
        const stringSortCursor = createSignedCursor(
          {
            v: 1,
            kind: 'regions',
            organizationId: null,
            sort: 'invalid-sort-string',
          },
          defaultSecret,
        );
        expectCursorInvalid(() => codec.decode(stringSortCursor, expected));

        // 2. sort is an empty array
        const emptySortCursor = createSignedCursor(
          {
            v: 1,
            kind: 'regions',
            organizationId: null,
            sort: [],
          },
          defaultSecret,
        );
        expectCursorInvalid(() => codec.decode(emptySortCursor, expected));

        // 3. sort is a 1-element array
        const oneElementSortCursor = createSignedCursor(
          {
            v: 1,
            kind: 'regions',
            organizationId: null,
            sort: ['single-element'],
          },
          defaultSecret,
        );
        expectCursorInvalid(() => codec.decode(oneElementSortCursor, expected));

        // 4. sort is a 3-element array
        const threeElementSortCursor = createSignedCursor(
          {
            v: 1,
            kind: 'regions',
            organizationId: null,
            sort: ['one', 'two', 'three'],
          },
          defaultSecret,
        );
        expectCursorInvalid(() =>
          codec.decode(threeElementSortCursor, expected),
        );

        // 5. sort is null
        const nullSortCursor = createSignedCursor(
          {
            v: 1,
            kind: 'regions',
            organizationId: null,
            sort: null,
          },
          defaultSecret,
        );
        expectCursorInvalid(() => codec.decode(nullSortCursor, expected));

        // 6. sort is an object
        const objectSortCursor = createSignedCursor(
          {
            v: 1,
            kind: 'regions',
            organizationId: null,
            sort: { 0: 'a', 1: 'b' },
          },
          defaultSecret,
        );
        expectCursorInvalid(() => codec.decode(objectSortCursor, expected));
      });
    });
  });
});
