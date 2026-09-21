import { HttpStatus } from '@nestjs/common';
import {
  AI_ERROR_CODES,
  AiDisabledException,
  AiGroundingRejectedException,
  AiOutputInvalidException,
  AiRateLimitedException,
  AiTimeoutException,
  AiUnavailableException,
  isAiErrorCode,
} from './ai.errors';

describe('ai.errors', () => {
  describe('AiDisabledException', () => {
    it('initializes with default message and FORBIDDEN status', () => {
      const err = new AiDisabledException();
      expect(err.code).toBe('AI_DISABLED');
      expect(err.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(err.message).toBe('AI draft preview is disabled on this server.');
    });

    it('initializes with custom message', () => {
      const err = new AiDisabledException('Custom disabled message');
      expect(err.code).toBe('AI_DISABLED');
      expect(err.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(err.message).toBe('Custom disabled message');
    });
  });

  describe('AiUnavailableException', () => {
    it('initializes with default message and SERVICE_UNAVAILABLE status', () => {
      const err = new AiUnavailableException();
      expect(err.code).toBe('AI_UNAVAILABLE');
      expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(err.message).toBe(
        'The AI draft service is currently unavailable. Please try again later.',
      );
    });

    it('initializes with custom message', () => {
      const err = new AiUnavailableException('Service down');
      expect(err.code).toBe('AI_UNAVAILABLE');
      expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(err.message).toBe('Service down');
    });
  });

  describe('AiTimeoutException', () => {
    it('initializes with default message and GATEWAY_TIMEOUT status', () => {
      const err = new AiTimeoutException();
      expect(err.code).toBe('AI_TIMEOUT');
      expect(err.getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
      expect(err.message).toBe(
        'The AI draft generation request timed out. Please try again.',
      );
    });

    it('initializes with custom message', () => {
      const err = new AiTimeoutException('Operation timed out');
      expect(err.code).toBe('AI_TIMEOUT');
      expect(err.getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
      expect(err.message).toBe('Operation timed out');
    });
  });

  describe('AiRateLimitedException', () => {
    it('initializes with default message and TOO_MANY_REQUESTS status', () => {
      const err = new AiRateLimitedException();
      expect(err.code).toBe('AI_RATE_LIMITED');
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(err.message).toBe(
        'AI draft preview quota or rate limit exceeded. Please wait before retrying.',
      );
    });

    it('initializes with custom message', () => {
      const err = new AiRateLimitedException('Quota exhausted');
      expect(err.code).toBe('AI_RATE_LIMITED');
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(err.message).toBe('Quota exhausted');
    });
  });

  describe('AiOutputInvalidException', () => {
    it('initializes with default message, BAD_REQUEST status, and optional details', () => {
      const err = new AiOutputInvalidException();
      expect(err.code).toBe('AI_OUTPUT_INVALID');
      expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(err.message).toBe(
        'The AI model returned output that could not be parsed into valid insight proposals.',
      );
      expect(err.details).toBeUndefined();
    });

    it('preserves custom message and details array', () => {
      const details = ['Missing heading', 'Invalid markdown'];
      const err = new AiOutputInvalidException('Malformed output', details);
      expect(err.code).toBe('AI_OUTPUT_INVALID');
      expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(err.message).toBe('Malformed output');
      expect(err.details).toEqual(details);
    });
  });

  describe('AiGroundingRejectedException', () => {
    it('initializes with default message, BAD_REQUEST status, and optional details', () => {
      const err = new AiGroundingRejectedException();
      expect(err.code).toBe('AI_GROUNDING_REJECTED');
      expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(err.message).toBe(
        'AI proposals were rejected because one or more claims did not reference valid evidence.',
      );
      expect(err.details).toBeUndefined();
    });

    it('preserves custom message and details array', () => {
      const details = ['Evidence agg-1 not found'];
      const err = new AiGroundingRejectedException(
        'Ungrounded proposal',
        details,
      );
      expect(err.code).toBe('AI_GROUNDING_REJECTED');
      expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(err.message).toBe('Ungrounded proposal');
      expect(err.details).toEqual(details);
    });
  });

  describe('isAiErrorCode', () => {
    it('returns true for every code in AI_ERROR_CODES', () => {
      for (const code of AI_ERROR_CODES) {
        expect(isAiErrorCode(code)).toBe(true);
      }
    });

    it('returns false for lowercase or unknown codes', () => {
      expect(isAiErrorCode('ai_disabled')).toBe(false);
      expect(isAiErrorCode('AI_NOT_FOUND')).toBe(false);
      expect(isAiErrorCode('')).toBe(false);
      expect(isAiErrorCode('RANDOM')).toBe(false);
    });

    it('returns false for non-string types at runtime', () => {
      expect(isAiErrorCode(null as unknown as string)).toBe(false);
      expect(isAiErrorCode(undefined as unknown as string)).toBe(false);
      expect(isAiErrorCode(123 as unknown as string)).toBe(false);
      expect(isAiErrorCode({} as unknown as string)).toBe(false);
    });
  });
});
