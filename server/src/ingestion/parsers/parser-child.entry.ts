import { parseSourceBuffer } from './parse-source-buffer';
import type {
  ParserChildRequest,
  ParserChildResponse,
} from './parser-ipc.types';

function isParserChildRequest(value: unknown): value is ParserChildRequest {
  if (!value || typeof value !== 'object') return false;
  const req = value as Record<string, unknown>;
  const isBuf =
    Buffer.isBuffer(req.buffer) ||
    (typeof req.buffer === 'object' &&
      req.buffer !== null &&
      req.buffer instanceof Uint8Array);
  return (
    req.type === 'parse' &&
    typeof req.id === 'string' &&
    isBuf &&
    typeof req.mediaType === 'string' &&
    typeof req.limits === 'object' &&
    req.limits !== null
  );
}

export function runParserChild(): void {
  if (!process.send) {
    process.exit(1);
  }

  process.once('message', (rawMessage: unknown) => {
    void (async () => {
      if (!isParserChildRequest(rawMessage)) {
        const response: ParserChildResponse = {
          type: 'error',
          id:
            typeof (rawMessage as { id?: unknown })?.id === 'string'
              ? (rawMessage as { id: string }).id
              : '',
          code: 'parser_execution_failed',
          message: 'Malformed parser child request.',
        };
        process.send!(response, () => {
          process.exit(1);
        });
        return;
      }

      try {
        const buffer = Buffer.isBuffer(rawMessage.buffer)
          ? rawMessage.buffer
          : Buffer.from(rawMessage.buffer);
        const summary = await parseSourceBuffer(
          buffer,
          rawMessage.mediaType,
          rawMessage.limits,
        );
        const response: ParserChildResponse = {
          type: 'success',
          id: rawMessage.id,
          summary,
        };
        process.send!(response, () => {
          process.exit(0);
        });
      } catch {
        const response: ParserChildResponse = {
          type: 'error',
          id: rawMessage.id,
          code: 'parser_execution_failed',
          message: 'Parser execution failed.',
        };
        process.send!(response, () => {
          process.exit(1);
        });
      }
    })();
  });
}

if (require.main === module) {
  runParserChild();
}
