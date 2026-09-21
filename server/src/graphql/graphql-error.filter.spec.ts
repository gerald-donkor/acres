import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { GraphqlErrorFilter } from './graphql-error.filter';
import { ApiException } from '../common/api-exception';
import type { AcresGraphqlContext } from './graphql.context';

function createMockHost(
  context?: Partial<AcresGraphqlContext> | null,
): ArgumentsHost {
  return {
    getType: jest.fn().mockReturnValue('graphql'),
    getArgs: jest.fn().mockReturnValue([null, {}, context, {}]),
    getArgByIndex: jest.fn((index: number) => {
      if (index === 2) return context;
      return undefined;
    }),
    switchToHttp: jest.fn(),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
  } as unknown as ArgumentsHost;
}

describe('GraphqlErrorFilter', () => {
  let filter: GraphqlErrorFilter;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new GraphqlErrorFilter();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ApiException', () => {
    it('unwraps code and message into GraphQLError with extensions.code', () => {
      const host = createMockHost({ requestId: 'req-api-1' });
      const exception = ApiException.forbidden('Custom permission denied');

      const result = filter.catch(exception, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('Custom permission denied');
      expect(result.extensions).toEqual({
        code: 'FORBIDDEN',
        requestId: 'req-api-1',
      });
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('propagates requestId from GraphQL context into extensions.requestId when present', () => {
      const host = createMockHost({ requestId: 'req-unique-999' });
      const exception = ApiException.validationFailed(['field is required']);

      const result = filter.catch(exception, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('The submitted values are not valid.');
      expect(result.extensions).toEqual({
        code: 'VALIDATION_FAILED',
        requestId: 'req-unique-999',
      });
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('omits requestId from extensions when context is missing', () => {
      const host = createMockHost(undefined);
      const exception = ApiException.unauthenticated();

      const result = filter.catch(exception, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('Sign in to continue.');
      expect(result.extensions).toEqual({
        code: 'UNAUTHENTICATED',
      });
      expect(result.extensions).not.toHaveProperty('requestId');
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('omits requestId from extensions when context is null', () => {
      const host = createMockHost(null);
      const exception = ApiException.cursorInvalid();

      const result = filter.catch(exception, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe(
        'The cursor is not valid for this connection.',
      );
      expect(result.extensions).toEqual({
        code: 'CURSOR_INVALID',
      });
      expect(result.extensions).not.toHaveProperty('requestId');
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('omits requestId from extensions when context has empty requestId', () => {
      const host = createMockHost({ requestId: '' });
      const exception = ApiException.queryLimitExceeded('Query depth exceeded');

      const result = filter.catch(exception, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('Query depth exceeded');
      expect(result.extensions).toEqual({
        code: 'QUERY_LIMIT_EXCEEDED',
      });
      expect(result.extensions).not.toHaveProperty('requestId');
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('HttpException with custom response object { code, message }', () => {
    it('unwraps code and message into GraphQLError extensions', () => {
      const host = createMockHost({ requestId: 'req-http-custom' });
      const exception = new HttpException(
        {
          code: 'CUSTOM_ERROR_CODE',
          message: 'A structured error occurred.',
        },
        HttpStatus.BAD_REQUEST,
      );

      const result = filter.catch(exception, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('A structured error occurred.');
      expect(result.extensions).toEqual({
        code: 'CUSTOM_ERROR_CODE',
        requestId: 'req-http-custom',
      });
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('propagates requestId when present and preserves other response fields ignored by unwrapping', () => {
      const host = createMockHost({ requestId: 'req-http-details' });
      const exception = new HttpException(
        {
          code: 'VALIDATION_FAILED',
          message: 'Invalid payload provided.',
          extraDetail: 'ignored',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      const result = filter.catch(exception, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('Invalid payload provided.');
      expect(result.extensions).toEqual({
        code: 'VALIDATION_FAILED',
        requestId: 'req-http-details',
      });
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('omits requestId when context has no requestId', () => {
      const host = createMockHost({});
      const exception = new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many requests.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );

      const result = filter.catch(exception, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('Too many requests.');
      expect(result.extensions).toEqual({
        code: 'RATE_LIMITED',
      });
      expect(result.extensions).not.toHaveProperty('requestId');
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('HttpException with standard string or non-matching response', () => {
    it('falls through to unhandled exception logic for plain string response', () => {
      const host = createMockHost({ requestId: 'req-str-1' });
      const exception = new HttpException(
        'Access Denied',
        HttpStatus.FORBIDDEN,
      );

      const result = filter.catch(exception, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('Something went wrong.');
      expect(result.extensions).toEqual({
        code: 'INTERNAL_ERROR',
        requestId: 'req-str-1',
      });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Unhandled GraphQL exception requestId=req-str-1',
        exception.stack,
      );
    });

    it('falls through when response object lacks code property', () => {
      const host = createMockHost({ requestId: 'req-no-code' });
      const exception = new HttpException(
        { statusCode: 404, message: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );

      const result = filter.catch(exception, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('Something went wrong.');
      expect(result.extensions).toEqual({
        code: 'INTERNAL_ERROR',
        requestId: 'req-no-code',
      });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Unhandled GraphQL exception requestId=req-no-code',
        exception.stack,
      );
    });

    it('falls through when response code is not a string', () => {
      const host = createMockHost({ requestId: 'req-non-str-code' });
      const exception = new HttpException(
        { code: 400, message: 'Bad request with numeric code' },
        HttpStatus.BAD_REQUEST,
      );

      const result = filter.catch(exception, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('Something went wrong.');
      expect(result.extensions).toEqual({
        code: 'INTERNAL_ERROR',
        requestId: 'req-non-str-code',
      });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Unhandled GraphQL exception requestId=req-non-str-code',
        exception.stack,
      );
    });

    it('falls through when response message is not a string', () => {
      const host = createMockHost({ requestId: 'req-non-str-msg' });
      const exception = new HttpException(
        { code: 'INVALID_INPUT', message: { reason: 'malformed' } },
        HttpStatus.BAD_REQUEST,
      );

      const result = filter.catch(exception, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('Something went wrong.');
      expect(result.extensions).toEqual({
        code: 'INTERNAL_ERROR',
        requestId: 'req-non-str-msg',
      });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Unhandled GraphQL exception requestId=req-non-str-msg',
        exception.stack,
      );
    });

    it('falls through when response is null or a primitive', () => {
      const host = createMockHost({ requestId: 'req-null-resp' });
      const exception = new HttpException(
        null as unknown as string,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      const result = filter.catch(exception, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('Something went wrong.');
      expect(result.extensions).toEqual({
        code: 'INTERNAL_ERROR',
        requestId: 'req-null-resp',
      });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Unhandled GraphQL exception requestId=req-null-resp',
        exception.stack,
      );
    });
  });

  describe('generic unhandled Error / unknown exceptions', () => {
    it('masks internal error with "Something went wrong.", code "INTERNAL_ERROR", and attaches requestId', () => {
      const host = createMockHost({ requestId: 'req-err-123' });
      const error = new Error('Database connection timed out');

      const result = filter.catch(error, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('Something went wrong.');
      expect(result.extensions).toEqual({
        code: 'INTERNAL_ERROR',
        requestId: 'req-err-123',
      });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Unhandled GraphQL exception requestId=req-err-123',
        error.stack,
      );
    });

    it('masks internal error and omits requestId when context has no requestId', () => {
      const host = createMockHost(undefined);
      const error = new Error('Unexpected crash');

      const result = filter.catch(error, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('Something went wrong.');
      expect(result.extensions).toEqual({
        code: 'INTERNAL_ERROR',
      });
      expect(result.extensions).not.toHaveProperty('requestId');
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Unhandled GraphQL exception',
        error.stack,
      );
    });

    it('catches non-Error string exception, logs string representation, and masks error', () => {
      const host = createMockHost({ requestId: 'req-raw-str' });
      const stringException = 'Fatal external dependency failure';

      const result = filter.catch(stringException, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('Something went wrong.');
      expect(result.extensions).toEqual({
        code: 'INTERNAL_ERROR',
        requestId: 'req-raw-str',
      });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Unhandled GraphQL exception requestId=req-raw-str',
        'Fatal external dependency failure',
      );
    });

    it('catches non-Error object exception, logs String(exception), and masks error without requestId', () => {
      const host = createMockHost(null);
      const rawObjectException = { custom: 'failure', status: 500 };

      const result = filter.catch(rawObjectException, host);

      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.message).toBe('Something went wrong.');
      expect(result.extensions).toEqual({
        code: 'INTERNAL_ERROR',
      });
      expect(result.extensions).not.toHaveProperty('requestId');
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Unhandled GraphQL exception',
        '[object Object]',
      );
    });
  });
});
