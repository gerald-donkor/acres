import type { Request, Response, NextFunction } from 'express';
import { REQUEST_ID_HEADER_NAME } from '@acres/shared';
import {
  requestContextMiddleware,
  requestIdFrom,
  type RequestWithContext,
} from './request-context';

describe('request-context', () => {
  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  describe('requestContextMiddleware', () => {
    let mockRequest: Partial<RequestWithContext>;
    let mockResponse: {
      setHeader: jest.Mock;
    };
    let next: NextFunction;

    beforeEach(() => {
      mockRequest = {
        header: jest.fn(),
      };
      mockResponse = {
        setHeader: jest.fn(),
      };
      next = jest.fn();
    });

    it('preserves valid UUID from incoming header and trims whitespace', () => {
      const validUuid = '12345678-1234-4234-8234-123456789abc';
      (mockRequest.header as jest.Mock).mockReturnValue(`  ${validUuid}  `);

      requestContextMiddleware(
        mockRequest as Request,
        mockResponse as unknown as Response,
        next,
      );

      expect(mockRequest.header).toHaveBeenCalledWith(REQUEST_ID_HEADER_NAME);
      expect(mockRequest.requestContext?.requestId).toBe(validUuid);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        REQUEST_ID_HEADER_NAME,
        validUuid,
      );
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('generates a fresh UUID when header is missing', () => {
      (mockRequest.header as jest.Mock).mockReturnValue(undefined);

      requestContextMiddleware(
        mockRequest as Request,
        mockResponse as unknown as Response,
        next,
      );

      const generatedId = mockRequest.requestContext?.requestId;
      expect(generatedId).toBeDefined();
      expect(generatedId).toMatch(UUID_REGEX);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        REQUEST_ID_HEADER_NAME,
        generatedId,
      );
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('generates a fresh UUID when header is empty string or only whitespace', () => {
      (mockRequest.header as jest.Mock).mockReturnValue('   ');

      requestContextMiddleware(
        mockRequest as Request,
        mockResponse as unknown as Response,
        next,
      );

      const generatedId = mockRequest.requestContext?.requestId;
      expect(generatedId).toBeDefined();
      expect(generatedId).toMatch(UUID_REGEX);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        REQUEST_ID_HEADER_NAME,
        generatedId,
      );
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('generates a fresh UUID when header is malformed or invalid format', () => {
      (mockRequest.header as jest.Mock).mockReturnValue('not-a-valid-uuid');

      requestContextMiddleware(
        mockRequest as Request,
        mockResponse as unknown as Response,
        next,
      );

      const generatedId = mockRequest.requestContext?.requestId;
      expect(generatedId).toBeDefined();
      expect(generatedId).not.toBe('not-a-valid-uuid');
      expect(generatedId).toMatch(UUID_REGEX);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        REQUEST_ID_HEADER_NAME,
        generatedId,
      );
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('requestIdFrom', () => {
    it('returns the requestId from requestContext when present', () => {
      const request = {
        requestContext: { requestId: 'test-correlation-id' },
      } as unknown as Request;

      expect(requestIdFrom(request)).toBe('test-correlation-id');
    });

    it('returns empty string when requestContext is missing', () => {
      const request = {} as unknown as Request;
      expect(requestIdFrom(request)).toBe('');
    });

    it('returns empty string when request is undefined', () => {
      expect(requestIdFrom(undefined)).toBe('');
    });
  });
});
