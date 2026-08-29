import { Injectable } from '@nestjs/common';
import { parseSourceBuffer } from './parse-source-buffer';
import type { ParserExecutorPort } from './parser-executor.port';
import type { ParsedSourceSummary, ParserLimits } from './parser.types';

@Injectable()
export class InProcessParserExecutor implements ParserExecutorPort {
  async execute(
    buffer: Buffer,
    mediaType: string,
    limits: ParserLimits,
  ): Promise<ParsedSourceSummary> {
    return parseSourceBuffer(buffer, mediaType, limits);
  }
}
