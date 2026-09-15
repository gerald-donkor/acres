import { parseSourceBuffer } from './parse-source-buffer';
import {
  PARSER_CHILD_EXECUTION_FAILED_CODE,
  PARSER_CHILD_EXECUTION_FAILED_MESSAGE,
  PARSER_CHILD_MALFORMED_REQUEST_MESSAGE,
  type ParserChildRequest,
  type ParserChildResponse,
} from './parser-ipc.types';
import type { ParserLimits } from './parser.types';

export function isParserLimits(value: unknown): value is ParserLimits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const limits = value as Record<string, unknown>;
  return (
    typeof limits.maxRows === 'number' &&
    Number.isInteger(limits.maxRows) &&
    limits.maxRows > 0 &&
    typeof limits.maxColumns === 'number' &&
    Number.isInteger(limits.maxColumns) &&
    limits.maxColumns > 0 &&
    typeof limits.maxCellChars === 'number' &&
    Number.isInteger(limits.maxCellChars) &&
    limits.maxCellChars > 0 &&
    typeof limits.maxSampleRows === 'number' &&
    Number.isInteger(limits.maxSampleRows) &&
    limits.maxSampleRows >= 0 &&
    typeof limits.maxGeojsonFeatures === 'number' &&
    Number.isInteger(limits.maxGeojsonFeatures) &&
    limits.maxGeojsonFeatures > 0 &&
    typeof limits.maxGeojsonCoordinates === 'number' &&
    Number.isInteger(limits.maxGeojsonCoordinates) &&
    limits.maxGeojsonCoordinates > 0
  );
}

export function isParserChildRequest(
  value: unknown,
): value is ParserChildRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const req = value as Record<string, unknown>;
  const isBuf =
    Buffer.isBuffer(req.buffer) ||
    (typeof req.buffer === 'object' &&
      req.buffer !== null &&
      req.buffer instanceof Uint8Array);
  return (
    req.type === 'parse' &&
    typeof req.id === 'string' &&
    req.id.trim().length > 0 &&
    isBuf &&
    typeof req.mediaType === 'string' &&
    req.mediaType.trim().length > 0 &&
    isParserLimits(req.limits)
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
          code: PARSER_CHILD_EXECUTION_FAILED_CODE,
          message: PARSER_CHILD_MALFORMED_REQUEST_MESSAGE,
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
          code: PARSER_CHILD_EXECUTION_FAILED_CODE,
          message: PARSER_CHILD_EXECUTION_FAILED_MESSAGE,
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
