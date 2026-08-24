import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import { AcresConfigService } from '../config/acres-config.service';

interface CursorPayload {
  v: 1;
  kind: string;
  organizationId: string | null;
  sort: readonly [string, string];
}

@Injectable()
export class CursorCodec {
  constructor(private readonly config: AcresConfigService) {}

  encode(payload: Omit<CursorPayload, 'v'>): string {
    const body = Buffer.from(JSON.stringify({ v: 1, ...payload }), 'utf8');
    const mac = this.mac(body);
    return Buffer.concat([body, Buffer.from('.'), mac]).toString('base64url');
  }

  decode(
    cursor: string | null | undefined,
    expected: { kind: string; organizationId: string | null },
  ): CursorPayload | null {
    if (!cursor) return null;
    try {
      const raw = Buffer.from(cursor, 'base64url');
      const split = raw.indexOf('.');
      if (split < 1) throw new Error('missing mac');
      const body = raw.subarray(0, split);
      const mac = raw.subarray(split + 1);
      const expectedMac = this.mac(body);
      if (
        mac.length !== expectedMac.length ||
        !timingSafeEqual(mac, expectedMac)
      ) {
        throw new Error('bad mac');
      }
      const parsed = JSON.parse(body.toString('utf8')) as CursorPayload;
      if (
        parsed.v !== 1 ||
        parsed.kind !== expected.kind ||
        parsed.organizationId !== expected.organizationId ||
        !Array.isArray(parsed.sort) ||
        parsed.sort.length !== 2
      ) {
        throw new Error('bad shape');
      }
      return parsed;
    } catch {
      throw ApiException.cursorInvalid();
    }
  }

  private mac(body: Buffer): Buffer {
    return createHmac('sha256', this.config.sessionSecret)
      .update('acres.cursor.v1')
      .update(body)
      .digest();
  }
}
