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

describe('Error Handler - Extended Tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let setMock: jest.Mock;
  let warnMock: jest.Mock;
  let errorMock: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
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
    const mod = await import('../../middleware/error-handler.js');
    warnMock = (await import(resolveModule('src/config/logger.ts'))).logger.warn;
    errorMock = (await import(resolveModule('src/config/logger.ts'))).logger.error;
    return mod;
  };

  describe('AppError statusCode < 400', () => {
    it('should not log warn or error for 3xx status', async () => {
      const { errorHandler, AppError } = await importModule();
      const error = new AppError('REDIRECT', 'Redirecting', 302);
      errorHandler(error, req as Request, res as Response, next as any);
      expect(statusMock).toHaveBeenCalledWith(302);
      expect(warnMock).not.toHaveBeenCalled();
      expect(errorMock).not.toHaveBeenCalled();
    });

    it('should not log for 1xx status', async () => {
      const { errorHandler, AppError } = await importModule();
      const error = new AppError('INFO', 'Continue', 100);
      errorHandler(error, req as Request, res as Response, next as any);
      expect(statusMock).toHaveBeenCalledWith(100);
      expect(warnMock).not.toHaveBeenCalled();
      expect(errorMock).not.toHaveBeenCalled();
    });
  });

  describe('errorHandler with missing request properties', () => {
    it('should handle missing path and method', async () => {
      const { errorHandler, AppError } = await importModule();
      delete (req as any).path;
      delete (req as any).method;
      const error = new AppError('TEST', 'Test error', 500);
      errorHandler(error, req as Request, res as Response, next as any);
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(errorMock).toHaveBeenCalled();
    });

    it('should handle missing headers', async () => {
      const { errorHandler } = await importModule();
      req.headers = {};
      const error = new Error('Generic error');
      errorHandler(error, req as Request, res as Response, next as any);
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: expect.any(String),
        })
      );
    });
  });

  describe('errors factory edge cases', () => {
    it('should use default unauthorized message', async () => {
      const { errors } = await importModule();
      const error = errors.unauthorized();
      expect(error.message).toBe('User lacks permission for this action');
      expect(error.statusCode).toBe(403);
    });

    it('should handle blockchainError with empty message', async () => {
      const { errors } = await importModule();
      const error = errors.blockchainError('');
      expect(error.message).toBe('');
      expect(error.statusCode).toBe(503);
    });

    it('should create validationError with empty details', async () => {
      const { errors } = await importModule();
      const error = errors.validationError([]);
      expect(error.details).toEqual([]);
      expect(error.statusCode).toBe(400);
    });

    it('should create notFound with empty resource', async () => {
      const { errors } = await importModule();
      const error = errors.notFound('');
      expect(error.message).toBe(' not found');
    });
  });
});
