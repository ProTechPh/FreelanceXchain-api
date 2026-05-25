import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import type { Request, Response } from 'express';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    security: jest.fn(),
  },
}));

describe('Error Handler', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let setMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnThis();
    setMock = jest.fn().mockReturnThis();
    req = {
      path: '/test',
      method: 'POST',
      headers: { 'x-request-id': 'test-request-id' },
    };
    res = {
      status: statusMock as any,
      json: jsonMock as any,
      set: setMock as any,
    };
    next = jest.fn();
  });

  const importModule = async () => {
    return await import('../../middleware/error-handler.js');
  };

  describe('AppError handling', () => {
    it('should handle 4xx client errors with warn level', async () => {
      const { errorHandler, AppError } = await importModule();

      const error = new AppError('VALIDATION_ERROR', 'Invalid input', 400, [
        { field: 'email', message: 'Email is required' },
      ]);

      errorHandler(error, req as Request, res as Response, next as any);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: expect.any(Array),
          }),
          requestId: 'test-request-id',
        })
      );
    });

    it('should handle 5xx server errors with error level', async () => {
      const { errorHandler, AppError } = await importModule();

      const error = new AppError('INTERNAL_ERROR', 'Database connection failed', 500);

      errorHandler(error, req as Request, res as Response, next as any);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INTERNAL_ERROR',
            message: 'Database connection failed',
          }),
        })
      );
    });

    it('should handle 404 not found errors', async () => {
      const { errorHandler, AppError } = await importModule();

      const error = new AppError('NOT_FOUND', 'User not found', 404);

      errorHandler(error, req as Request, res as Response, next as any);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'NOT_FOUND',
            message: 'User not found',
          }),
        })
      );
    });

    it('should handle 403 forbidden errors', async () => {
      const { errorHandler, AppError } = await importModule();

      const error = new AppError('AUTH_UNAUTHORIZED', 'Access denied', 403);

      errorHandler(error, req as Request, res as Response, next as any);

      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should handle 401 unauthorized errors', async () => {
      const { errorHandler, AppError, errors } = await importModule();

      const error = errors.tokenExpired();

      errorHandler(error, req as Request, res as Response, next as any);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should handle 409 conflict errors', async () => {
      const { errorHandler, AppError, errors } = await importModule();

      const error = errors.duplicateEmail();

      errorHandler(error, req as Request, res as Response, next as any);

      expect(statusMock).toHaveBeenCalledWith(409);
    });

    it('should handle AppError without request ID header', async () => {
      const { errorHandler, AppError } = await importModule();

      req.headers = {};
      const error = new AppError('TEST_ERROR', 'Test', 400);

      errorHandler(error, req as Request, res as Response, next as any);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: expect.any(String),
        })
      );
    });
  });

  describe('regular Error handling', () => {
    it('should handle generic errors with 500 status', async () => {
      const { errorHandler } = await importModule();

      const error = new Error('Something went wrong');

      errorHandler(error, req as Request, res as Response, next as any);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
          }),
        })
      );
    });

    it('should handle errors with undefined message', async () => {
      const { errorHandler } = await importModule();

      const error = new Error();

      errorHandler(error, req as Request, res as Response, next as any);

      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });

  describe('error factory functions', () => {
    it('should create invalidCredentials error', async () => {
      const { errors } = await importModule();
      const error = errors.invalidCredentials();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('should create tokenExpired error', async () => {
      const { errors } = await importModule();
      const error = errors.tokenExpired();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTH_TOKEN_EXPIRED');
    });

    it('should create unauthorized error with custom message', async () => {
      const { errors } = await importModule();
      const error = errors.unauthorized('Custom unauthorized message');
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Custom unauthorized message');
    });

    it('should create duplicateEmail error', async () => {
      const { errors } = await importModule();
      const error = errors.duplicateEmail();
      expect(error.statusCode).toBe(409);
    });

    it('should create duplicateProposal error', async () => {
      const { errors } = await importModule();
      const error = errors.duplicateProposal();
      expect(error.statusCode).toBe(409);
    });

    it('should create projectLocked error', async () => {
      const { errors } = await importModule();
      const error = errors.projectLocked();
      expect(error.statusCode).toBe(409);
    });

    it('should create invalidSkill error', async () => {
      const { errors } = await importModule();
      const error = errors.invalidSkill('skill-123');
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('skill-123');
    });

    it('should create invalidDateRange error', async () => {
      const { errors } = await importModule();
      const error = errors.invalidDateRange();
      expect(error.statusCode).toBe(400);
    });

    it('should create invalidRating error', async () => {
      const { errors } = await importModule();
      const error = errors.invalidRating();
      expect(error.statusCode).toBe(400);
    });

    it('should create milestoneSumMismatch error', async () => {
      const { errors } = await importModule();
      const error = errors.milestoneSumMismatch();
      expect(error.statusCode).toBe(400);
    });

    it('should create notFound error', async () => {
      const { errors } = await importModule();
      const error = errors.notFound('User');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('User not found');
    });

    it('should create validationError with details', async () => {
      const { errors } = await importModule();
      const details = [{ field: 'email', message: 'Required' }];
      const error = errors.validationError(details);
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual(details);
    });

    it('should create geminiUnavailable error', async () => {
      const { errors } = await importModule();
      const error = errors.geminiUnavailable();
      expect(error.statusCode).toBe(503);
    });

    it('should create blockchainError error', async () => {
      const { errors } = await importModule();
      const error = errors.blockchainError('RPC timeout');
      expect(error.statusCode).toBe(503);
      expect(error.message).toBe('RPC timeout');
    });
  });

  describe('AppError class', () => {
    it('should create AppError with correct properties', async () => {
      const { AppError } = await importModule();
      const error = new AppError('TEST', 'Test message', 418, [{ field: 'x', message: 'y' }]);

      expect(error.code).toBe('TEST');
      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(418);
      expect(error.details).toEqual([{ field: 'x', message: 'y' }]);
      expect(error.name).toBe('AppError');
    });

    it('should capture stack trace', async () => {
      const { AppError } = await importModule();
      const error = new AppError('TEST', 'Test', 500);
      expect(error.stack).toBeDefined();
    });
  });
});
