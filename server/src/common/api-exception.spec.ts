import { HttpStatus } from '@nestjs/common';
import {
  API_ERROR_CODES,
  NODE_ENVS,
  isApiErrorCode,
  isNodeEnv,
} from '@acres/shared';
import { ApiException } from './api-exception';

describe('ApiException', () => {
  it('instantiates correctly with code, message, status, and details', () => {
    const error = new ApiException(
      'VALIDATION_FAILED',
      'Validation error',
      HttpStatus.BAD_REQUEST,
      ['field is required'],
    );
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('Validation error');
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.details).toEqual(['field is required']);
    expect(error.getResponse()).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Validation error',
      details: ['field is required'],
    });
  });

  describe('static factory methods', () => {
    it('validationFailed sets BAD_REQUEST, VALIDATION_FAILED code, and details', () => {
      const error = ApiException.validationFailed(['email invalid']);
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.message).toBe('The submitted values are not valid.');
      expect(error.details).toEqual(['email invalid']);
    });

    it('invalidCredentials sets UNAUTHORIZED, INVALID_CREDENTIALS code, and generic message', () => {
      const error = ApiException.invalidCredentials();
      expect(error.code).toBe('INVALID_CREDENTIALS');
      expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(error.message).toBe('Those credentials did not work.');
      expect(error.details).toBeUndefined();
    });

    it('unauthenticated sets UNAUTHORIZED and UNAUTHENTICATED code', () => {
      const error = ApiException.unauthenticated();
      expect(error.code).toBe('UNAUTHENTICATED');
      expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(error.message).toBe('Sign in to continue.');
    });

    it('forbidden sets FORBIDDEN with default message', () => {
      const error = ApiException.forbidden();
      expect(error.code).toBe('FORBIDDEN');
      expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(error.message).toBe('You do not have permission to do that.');
    });

    it('forbidden sets FORBIDDEN with custom message', () => {
      const error = ApiException.forbidden('Custom forbidden error.');
      expect(error.code).toBe('FORBIDDEN');
      expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(error.message).toBe('Custom forbidden error.');
    });

    it('conflict sets CONFLICT with message', () => {
      const error = ApiException.conflict('Organization already exists.');
      expect(error.code).toBe('CONFLICT');
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(error.message).toBe('Organization already exists.');
    });

    it('idempotencyKeyRequired sets BAD_REQUEST and IDEMPOTENCY_KEY_REQUIRED', () => {
      const error = ApiException.idempotencyKeyRequired();
      expect(error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.message).toBe(
        'This command requires an Idempotency-Key header.',
      );
    });

    it('idempotencyConflict sets CONFLICT and IDEMPOTENCY_CONFLICT', () => {
      const error = ApiException.idempotencyConflict();
      expect(error.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(error.message).toBe(
        'That Idempotency-Key was already used for a different request.',
      );
    });

    it('cursorInvalid sets BAD_REQUEST and CURSOR_INVALID', () => {
      const error = ApiException.cursorInvalid();
      expect(error.code).toBe('CURSOR_INVALID');
      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.message).toBe(
        'The cursor is not valid for this connection.',
      );
    });

    it('queryLimitExceeded sets BAD_REQUEST and default message', () => {
      const error = ApiException.queryLimitExceeded();
      expect(error.code).toBe('QUERY_LIMIT_EXCEEDED');
      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.message).toBe('The GraphQL query is too large.');
    });

    it('queryLimitExceeded sets BAD_REQUEST and custom message', () => {
      const error = ApiException.queryLimitExceeded(
        'Custom query limit error.',
      );
      expect(error.code).toBe('QUERY_LIMIT_EXCEEDED');
      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.message).toBe('Custom query limit error.');
    });

    it('notFound sets NOT_FOUND and message', () => {
      const error = ApiException.notFound('Item not found.');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(error.message).toBe('Item not found.');
    });

    it('notReady sets SERVICE_UNAVAILABLE and NOT_READY code', () => {
      const error = ApiException.notReady();
      expect(error.code).toBe('NOT_READY');
      expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(error.message).toBe('The database is not reachable.');
    });

    it('invalidOrExpiredToken sets BAD_REQUEST and INVALID_TOKEN', () => {
      const error = ApiException.invalidOrExpiredToken();
      expect(error.code).toBe('INVALID_TOKEN');
      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.message).toBe(
        'This password reset link is invalid or has expired.',
      );
    });
  });

  describe('isApiErrorCode', () => {
    it('returns true for all API_ERROR_CODES', () => {
      for (const code of API_ERROR_CODES) {
        expect(isApiErrorCode(code)).toBe(true);
      }
    });

    it('returns false for unknown codes or invalid types', () => {
      expect(isApiErrorCode('UNKNOWN_CODE')).toBe(false);
      expect(isApiErrorCode('validation_failed')).toBe(false);
      expect(isApiErrorCode('')).toBe(false);
      expect(isApiErrorCode(123 as unknown as string)).toBe(false);
    });
  });

  describe('isNodeEnv', () => {
    it('returns true for all NODE_ENVS', () => {
      for (const env of NODE_ENVS) {
        expect(isNodeEnv(env)).toBe(true);
      }
    });

    it('returns false for unknown environments or invalid types', () => {
      expect(isNodeEnv('staging')).toBe(false);
      expect(isNodeEnv('TEST')).toBe(false);
      expect(isNodeEnv('')).toBe(false);
      expect(isNodeEnv(undefined as unknown as string)).toBe(false);
    });
  });
});
