import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../common/api-exception';

export class AiDisabledException extends ApiException {
  constructor(message = 'AI draft preview is disabled on this server.') {
    super('AI_DISABLED', message, HttpStatus.FORBIDDEN);
  }
}

export class AiUnavailableException extends ApiException {
  constructor(
    message = 'The AI draft service is currently unavailable. Please try again later.',
  ) {
    super('AI_UNAVAILABLE', message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

export class AiTimeoutException extends ApiException {
  constructor(
    message = 'The AI draft generation request timed out. Please try again.',
  ) {
    super('AI_TIMEOUT', message, HttpStatus.GATEWAY_TIMEOUT);
  }
}

export class AiRateLimitedException extends ApiException {
  constructor(
    message = 'AI draft preview quota or rate limit exceeded. Please wait before retrying.',
  ) {
    super('AI_RATE_LIMITED', message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class AiOutputInvalidException extends ApiException {
  constructor(
    message = 'The AI model returned output that could not be parsed into valid insight proposals.',
    details?: string[],
  ) {
    super('AI_OUTPUT_INVALID', message, HttpStatus.BAD_REQUEST, details);
  }
}

export class AiGroundingRejectedException extends ApiException {
  constructor(
    message = 'AI proposals were rejected because one or more claims did not reference valid evidence.',
    details?: string[],
  ) {
    super('AI_GROUNDING_REJECTED', message, HttpStatus.BAD_REQUEST, details);
  }
}
