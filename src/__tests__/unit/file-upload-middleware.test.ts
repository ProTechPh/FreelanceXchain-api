import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.unstable_mockModule('file-type', () => ({
  fileTypeFromBuffer: jest.fn(),
}));

describe('File Upload Middleware', () => {
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

  describe('sanitizeFilename', () => {
    it('should sanitize path traversal attempts', async () => {
      const { sanitizeFilename } = await importModule();
      expect(sanitizeFilename('../../../etc/passwd')).toBe('passwd');
      expect(sanitizeFilename('..\\..\\windows\\system32')).toBe('system32');
    });

    it('should remove dangerous characters', async () => {
      const { sanitizeFilename } = await importModule();
      expect(sanitizeFilename('file;rm -rf *')).toBe('file_rm_-rf__');
      expect(sanitizeFilename('test<script>')).toBe('test_script_');
    });

    it('should replace multiple dots with single dot', async () => {
      const { sanitizeFilename } = await importModule();
      expect(sanitizeFilename('file...txt')).toBe('file.txt');
    });

    it('should remove leading dots', async () => {
      const { sanitizeFilename } = await importModule();
      expect(sanitizeFilename('.hidden.txt')).toBe('hidden.txt');
    });

    it('should limit length to 255 characters', async () => {
      const { sanitizeFilename } = await importModule();
      const longName = 'a'.repeat(300) + '.txt';
      expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(255);
    });

    it('should return unnamed_file for empty string', async () => {
      const { sanitizeFilename } = await importModule();
      expect(sanitizeFilename('')).toBe('unnamed_file');
    });

    it('should preserve allowed characters', async () => {
      const { sanitizeFilename } = await importModule();
      expect(sanitizeFilename('my-file_2.txt')).toBe('my-file_2.txt');
    });
  });

  describe('scanFileForViruses', () => {
    it('should detect EICAR signature', async () => {
      const { scanFileForViruses } = await importModule();
      const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
      const result = await scanFileForViruses(Buffer.from(eicar), 'test.txt');
      expect(result.clean).toBe(false);
      expect(result.threat).toContain('EICAR');
    });

    it('should detect PE executable magic number', async () => {
      const { scanFileForViruses } = await importModule();
      const buffer = Buffer.from([0x4d, 0x5a, 0x00, 0x00]);
      const result = await scanFileForViruses(buffer, 'test.exe');
      expect(result.clean).toBe(false);
      expect(result.threat).toContain('PE executable');
    });

    it('should detect ELF executable magic number', async () => {
      const { scanFileForViruses } = await importModule();
      const buffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
      const result = await scanFileForViruses(buffer, 'test.bin');
      expect(result.clean).toBe(false);
      expect(result.threat).toContain('ELF executable');
    });

    it('should detect binary content in text file', async () => {
      const { scanFileForViruses } = await importModule();
      const buffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00]);
      const result = await scanFileForViruses(buffer, 'test.txt');
      expect(result.clean).toBe(false);
      expect(result.threat).toContain('Binary content');
    });

    it('should pass clean files', async () => {
      const { scanFileForViruses } = await importModule();
      const buffer = Buffer.from('Hello, World!');
      const result = await scanFileForViruses(buffer, 'test.txt');
      expect(result.clean).toBe(true);
    });

    it('should handle empty buffer', async () => {
      const { scanFileForViruses } = await importModule();
      const result = await scanFileForViruses(Buffer.alloc(0), 'test.txt');
      expect(result.clean).toBe(true);
    });
  });

  describe('createFileUploadMiddleware', () => {
    it('should return array of middleware functions', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files');
      expect(Array.isArray(middleware)).toBe(true);
      expect(middleware).toHaveLength(2);
    });

    it('should reject when no files uploaded and minFiles > 0', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 5 });

      req.files = undefined;
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

    it('should allow empty files when minFiles is 0', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 0, maxFiles: 5 });

      req.files = undefined;
      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
    });

    it('should reject when file count is below minimum', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 2, maxFiles: 5 });

      req.files = [
        { originalname: 'test.txt', size: 100, buffer: Buffer.from('test') } as any,
      ];
      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INSUFFICIENT_FILES',
          }),
        })
      );
    });

    it('should reject when file count exceeds maximum', async () => {
      const { createFileUploadMiddleware } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 2 });

      req.files = [
        { originalname: 'test1.txt', size: 100, buffer: Buffer.from('test1') } as any,
        { originalname: 'test2.txt', size: 100, buffer: Buffer.from('test2') } as any,
        { originalname: 'test3.txt', size: 100, buffer: Buffer.from('test3') } as any,
      ];
      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'TOO_MANY_FILES',
          }),
        })
      );
    });

    it('should reject when total size exceeds limit', async () => {
      const { createFileUploadMiddleware, MAX_TOTAL_SIZE } = await importModule();
      const middleware = createFileUploadMiddleware('files', { minFiles: 1, maxFiles: 10 });

      req.files = [
        { originalname: 'test.txt', size: MAX_TOTAL_SIZE + 1, buffer: Buffer.from('x'.repeat(MAX_TOTAL_SIZE + 1)) } as any,
      ];
      await middleware[1]!(req as Request, res as Response, next as NextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'TOTAL_SIZE_EXCEEDED',
          }),
        })
      );
    });
  });

  describe('preset middleware exports', () => {
    it('should export uploadProposalAttachments', async () => {
      const { uploadProposalAttachments } = await importModule();
      expect(Array.isArray(uploadProposalAttachments)).toBe(true);
    });

    it('should export uploadProjectAttachments', async () => {
      const { uploadProjectAttachments } = await importModule();
      expect(Array.isArray(uploadProjectAttachments)).toBe(true);
    });

    it('should export uploadDisputeEvidence', async () => {
      const { uploadDisputeEvidence } = await importModule();
      expect(Array.isArray(uploadDisputeEvidence)).toBe(true);
    });

    it('should export uploadPortfolioImages', async () => {
      const { uploadPortfolioImages } = await importModule();
      expect(Array.isArray(uploadPortfolioImages)).toBe(true);
    });
  });
});
