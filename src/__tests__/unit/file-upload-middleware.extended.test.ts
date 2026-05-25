import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockMulterArray = jest.fn();
const mockFileTypeFromBuffer = jest.fn<(...args: any[]) => Promise<any>>();

jest.unstable_mockModule('multer', () => ({
  default: Object.assign(
    jest.fn(() => ({
      array: mockMulterArray,
    })),
    { memoryStorage: jest.fn(() => ({})) }
  ),
}));

jest.unstable_mockModule('file-type', () => ({
  fileTypeFromBuffer: mockFileTypeFromBuffer,
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('File Upload Middleware - Extended Tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnThis();
    req = {
      files: undefined,
      body: {},
    };
    res = {
      status: statusMock as unknown as Response['status'],
      json: jsonMock as unknown as Response['json'],
    };
    next = jest.fn();
  });

  const importModule = async () => {
    return await import('../../middleware/file-upload-middleware.js');
  };

  describe('multer error handling', () => {
    it('should handle LIMIT_FILE_SIZE error', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      const multerError = new Error('File too large') as any;
      multerError.code = 'LIMIT_FILE_SIZE';
      mockMulterArray.mockImplementationOnce((fieldName, maxCount) => {
        return (r: Request, res2: Response, cb: any) => cb(multerError);
      });

      await middleware[0]!(req as Request, res as Response, next as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'FILE_TOO_LARGE',
          }),
        })
      );
    });

    it('should handle LIMIT_FILE_COUNT error', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      const multerError = new Error('Too many files') as any;
      multerError.code = 'LIMIT_FILE_COUNT';
      mockMulterArray.mockImplementationOnce((fieldName, maxCount) => {
        return (r: Request, res2: Response, cb: any) => cb(multerError);
      });

      await middleware[0]!(req as Request, res as Response, next as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'TOO_MANY_FILES',
          }),
        })
      );
    });

    it('should handle INVALID_FILE_TYPE error', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      const multerError = new Error('File type not allowed') as any;
      multerError.code = 'INVALID_FILE_TYPE';
      mockMulterArray.mockImplementationOnce((fieldName, maxCount) => {
        return (r: Request, res2: Response, cb: any) => cb(multerError);
      });

      await middleware[0]!(req as Request, res as Response, next as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_FILE_TYPE',
          }),
        })
      );
    });

    it('should pass through unknown multer errors', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      const unknownError = new Error('Unknown multer error');
      mockMulterArray.mockImplementationOnce((fieldName, maxCount) => {
        return (r: Request, res2: Response, cb: any) => cb(unknownError);
      });

      await middleware[0]!(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(unknownError);
    });

    it('should call next when multer succeeds', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      mockMulterArray.mockImplementationOnce((fieldName, maxCount) => {
        return (r: Request, res2: Response, cb: any) => {
          r.files = [{ originalname: 'test.txt', size: 100, buffer: Buffer.from('hello') }] as any;
          cb();
        };
      });

      await middleware[0]!(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('MIME type validation through middleware', () => {
    it('should accept valid PNG file', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      mockFileTypeFromBuffer.mockResolvedValueOnce({ mime: 'image/png', ext: 'png' });

      req.files = [
        { originalname: 'test.png', size: 1000, buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) } as any,
      ];

      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
    });

    it('should reject disallowed MIME type', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      mockFileTypeFromBuffer.mockResolvedValueOnce({ mime: 'application/x-executable', ext: 'exe' });

      req.files = [
        { originalname: 'test.exe', size: 1000, buffer: Buffer.from([0x4d, 0x5a]) } as any,
      ];

      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_FILE_TYPE',
          }),
        })
      );
    });

    it('should handle undetectable file type', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      mockFileTypeFromBuffer.mockResolvedValueOnce(undefined);

      req.files = [
        { originalname: 'test.bin', size: 1000, buffer: Buffer.from('unknown') } as any,
      ];

      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should handle file-type detection error', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      mockFileTypeFromBuffer.mockRejectedValueOnce(new Error('Detection failed'));

      req.files = [
        { originalname: 'test.png', size: 1000, buffer: Buffer.from('data') } as any,
      ];

      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should accept text files by content analysis', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      req.files = [
        { originalname: 'test.txt', size: 100, buffer: Buffer.from('Hello, World!') } as any,
      ];

      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
    });

    it('should reject text files with binary content', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      req.files = [
        { originalname: 'test.txt', size: 100, buffer: Buffer.from([0x00, 0x01, 0x02, 0x03]) } as any,
      ];

      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should skip MIME validation when validateMagicNumbers is false', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5, validateMagicNumbers: false });

      req.files = [
        { originalname: 'test.bin', size: 100, buffer: Buffer.from('anything') } as any,
      ];

      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockFileTypeFromBuffer).not.toHaveBeenCalled();
    });
  });

  describe('virus scan through middleware', () => {
    it('should reject file with EICAR signature through middleware', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
      req.files = [
        { originalname: 'test.txt', size: 100, buffer: Buffer.from(eicar) } as any,
      ];

      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'MALICIOUS_FILE_DETECTED',
          }),
        })
      );
    });

    it('should reject PE executable through middleware', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      mockFileTypeFromBuffer.mockResolvedValueOnce({ mime: 'application/octet-stream', ext: 'bin' });

      req.files = [
        { originalname: 'test.bin', size: 100, buffer: Buffer.from([0x4d, 0x5a, 0x00, 0x00]) } as any,
      ];

      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe('middleware with empty files array', () => {
    it('should allow empty array when minFiles is 0', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 0, maxFiles: 5 });

      req.files = [];

      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
    });

    it('should reject empty array when minFiles > 0', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      req.files = [];

      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'NO_FILES_UPLOADED',
          }),
        })
      );
    });
  });

  describe('unexpected errors in middleware', () => {
    it('should handle unexpected errors gracefully', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      req.files = [
        { originalname: 'test.png', size: 100, buffer: Buffer.from('data') } as any,
      ];

      mockFileTypeFromBuffer.mockImplementationOnce(() => {
        throw new Error('Unexpected crash');
      });

      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_FILE_TYPE',
          }),
        })
      );
    });
  });
});
