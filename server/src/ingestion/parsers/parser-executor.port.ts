import type { ParsedSourceSummary, ParserLimits } from './parser.types';

export const PARSER_EXECUTOR = Symbol('PARSER_EXECUTOR');

export interface ParserExecutorPort {
  execute(
    buffer: Buffer,
    mediaType: string,
    limits: ParserLimits,
  ): Promise<ParsedSourceSummary>;
}
