import type { ParsedSourceSummary, ParserLimits } from './parser.types';

export interface ParserChildRequest {
  readonly type: 'parse';
  readonly id: string;
  readonly buffer: Buffer;
  readonly mediaType: string;
  readonly limits: ParserLimits;
}

export interface ParserChildSuccessResponse {
  readonly type: 'success';
  readonly id: string;
  readonly summary: ParsedSourceSummary;
}

export const PARSER_CHILD_MALFORMED_REQUEST_MESSAGE =
  'Malformed parser child request.' as const;
export const PARSER_CHILD_EXECUTION_FAILED_MESSAGE =
  'Parser execution failed.' as const;

export type ParserChildErrorMessage =
  | typeof PARSER_CHILD_MALFORMED_REQUEST_MESSAGE
  | typeof PARSER_CHILD_EXECUTION_FAILED_MESSAGE;

export const PARSER_CHILD_EXECUTION_FAILED_CODE =
  'parser_execution_failed' as const;

export type ParserChildErrorCode = typeof PARSER_CHILD_EXECUTION_FAILED_CODE;

export interface ParserChildErrorResponse {
  readonly type: 'error';
  readonly id: string;
  readonly code: ParserChildErrorCode;
  readonly message: ParserChildErrorMessage;
}

export type ParserChildResponse =
  ParserChildSuccessResponse | ParserChildErrorResponse;
