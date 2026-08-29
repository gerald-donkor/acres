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

export interface ParserChildErrorResponse {
  readonly type: 'error';
  readonly id: string;
  readonly code: string;
  readonly message: string;
}

export type ParserChildResponse =
  ParserChildSuccessResponse | ParserChildErrorResponse;
