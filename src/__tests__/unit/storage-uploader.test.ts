import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateFile = jest.fn() as any;
const mockDeleteFile = jest.fn() as any;
const mockListFiles = jest.fn() as any;

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  storage: {
    createFile: mockCreateFile,
    deleteFile: mockDeleteFile,
    listFiles: mockListFiles,
  },
  BUCKETS: {
    PROPOSAL_ATTACHMENTS: 'proposal-attachments',
    PROJECT_ATTACHMENTS: 'project-attachments',
    DISPUTE_EVIDENCE: 'dispute-evidence',
    PORTFOLIO_IMAGES: 'portfolio-images',
    MILESTONE_DELIVERABLES: 'milestone-deliverables',
  },
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.unstable_mockModule(resolveModule('src/middleware/file-upload-middleware.ts'), () => ({
  sanitizeFilename: jest.fn((name: string) => {
    const basename = name.replace(/^.*[\\/]/, '');
    const sanitized = basename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.+/, '')
      .substring(0, 255);
    return sanitized || 'unnamed_file';
  }),
}));

jest.unstable_mockModule('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

jest.unstable_mockModule('node-appwrite/file', () => ({
  InputFile: {
    fromBuffer: jest.fn((buffer: Buffer, name: string) => ({ buffer, name })),
  },
}));

jest.unstable_mockModule('node-appwrite', () => ({
  ID: { unique: () => 'unique-id' },
}));

const {
  uploadFileToStorage,
  uploadMultipleFiles,
  deleteFileFromStorage,
  extractFilePathFromUrl,
  extractFileIdFromUrl,
  cleanupUploadedFiles,
} = await import('../../utils/storage-uploader.js');

const { logger } = await import('../../config/logger.js');
const { sanitizeFilename } = await import('../../middleware/file-upload-middleware.js');
const { v4: uuidv4 } = await import('uuid');

const APPWRITE_ENDPOINT = 'https://cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = 'test-project-id';

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateFile.mockReset();
  mockDeleteFile.mockReset();
  mockListFiles.mockReset();
  process.env['APPWRITE_ENDPOINT'] = APPWRITE_ENDPOINT;
  process.env['APPWRITE_PROJECT_ID'] = APPWRITE_PROJECT_ID;
});

describe('storage-uploader', () => {
  describe('extractFileIdFromUrl', () => {
    it('extracts file ID from a valid Appwrite storage URL', () => {
      const url = `${APPWRITE_ENDPOINT}/storage/buckets/proposal-attachments/files/file-abc-123/view?project=${APPWRITE_PROJECT_ID}`;
      const result = extractFileIdFromUrl(url);
      expect(result).toBe('file-abc-123');
    });

    it('returns null when URL does not match the storage path pattern', () => {
      const url = 'https://example.com/other/path/document.pdf';
      const result = extractFileIdFromUrl(url);
      expect(result).toBeNull();
    });

    it('returns null for an invalid URL string', () => {
      const result = extractFileIdFromUrl('not-a-valid-url');
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = extractFileIdFromUrl('');
      expect(result).toBeNull();
    });

    it('logs a warning when URL is invalid', () => {
      extractFileIdFromUrl('not-a-url');
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to extract file ID from URL',
        { url: 'not-a-url' }
      );
    });
  });

  describe('extractFilePathFromUrl', () => {
    it('is an alias for extractFileIdFromUrl', () => {
      const url = `${APPWRITE_ENDPOINT}/storage/buckets/proposal-attachments/files/file-abc-123/view?project=${APPWRITE_PROJECT_ID}`;
      expect(extractFilePathFromUrl(url)).toBe(extractFileIdFromUrl(url));
    });

    it('returns null for invalid URL', () => {
      expect(extractFilePathFromUrl('not-a-url')).toBeNull();
    });
  });

  describe('uploadFileToStorage', () => {
    const mockBuffer = Buffer.from('test file content');

    it('uploads a file and returns success with metadata', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id-123' });

      const result = await uploadFileToStorage(mockBuffer, 'document.pdf', 'application/pdf');

      expect(result.success).toBe(true);
      expect(result.metadata).toEqual(expect.objectContaining({
        filename: 'document.pdf',
        size: mockBuffer.length,
        mimeType: 'application/pdf',
        fileId: 'file-id-123',
      }));
      expect(result.metadata?.url).toContain('file-id-123');
      expect(logger.info).toHaveBeenCalledWith(
        'File uploaded successfully to Appwrite Storage',
        expect.objectContaining({ filename: 'document.pdf' })
      );
    });

    it('returns error on unexpected exception', async () => {
      mockCreateFile.mockRejectedValue(new Error('Network failure'));

      const result = await uploadFileToStorage(mockBuffer, 'document.pdf', 'application/pdf');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network failure');
      expect(logger.error).toHaveBeenCalledWith(
        'Unexpected error during file upload',
        expect.objectContaining({ error: 'Network failure' })
      );
    });

    it('uses default bucket when bucket parameter is omitted', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id' });

      await uploadFileToStorage(mockBuffer, 'file.pdf', 'application/pdf');

      expect(mockCreateFile).toHaveBeenCalledWith(
        'proposal-attachments',
        expect.any(String),
        expect.anything(),
        expect.any(Array)
      );
    });

    it('uses custom bucket when provided', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id' });

      await uploadFileToStorage(mockBuffer, 'file.pdf', 'application/pdf', 'dispute-evidence');

      expect(mockCreateFile).toHaveBeenCalledWith(
        'dispute-evidence',
        expect.any(String),
        expect.anything(),
        expect.any(Array)
      );
    });

    it('generates unique filename with uuid prefix', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id' });

      await uploadFileToStorage(mockBuffer, 'document.pdf', 'application/pdf');

      expect(sanitizeFilename).toHaveBeenCalledWith('document.pdf');
      expect(uuidv4).toHaveBeenCalled();
    });

    it('preserves original filename in metadata', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id' });

      const result = await uploadFileToStorage(mockBuffer, 'My Document.pdf', 'application/pdf');

      expect(result.metadata!.filename).toBe('My Document.pdf');
    });
  });

  describe('uploadMultipleFiles', () => {
    const createMockFile = (overrides: Record<string, any> = {}): Express.Multer.File => ({
      buffer: Buffer.from('file content'),
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      fieldname: 'files',
      encoding: '7bit',
      destination: '',
      filename: 'test.pdf',
      path: '',
      stream: {} as any,
      ...overrides,
    });

    it('uploads multiple files and returns array of results', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id' });

      const files = [
        createMockFile({ originalname: 'doc1.pdf' }),
        createMockFile({ originalname: 'doc2.pdf' }),
      ];

      const results = await uploadMultipleFiles(files);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
      expect(mockCreateFile).toHaveBeenCalledTimes(2);
    });

    it('uses detectedMimeType when available on file object', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id' });

      const file = createMockFile({
        originalname: 'image.png',
        mimetype: 'application/octet-stream',
        detectedMimeType: 'image/png',
      });

      await uploadMultipleFiles([file]);

      expect(mockCreateFile).toHaveBeenCalledTimes(1);
    });

    it('falls back to mimetype when detectedMimeType is not available', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id' });

      const file = createMockFile({ originalname: 'doc.pdf', mimetype: 'application/pdf' });

      await uploadMultipleFiles([file]);

      expect(mockCreateFile).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when given empty array', async () => {
      const results = await uploadMultipleFiles([]);

      expect(results).toEqual([]);
      expect(mockCreateFile).not.toHaveBeenCalled();
    });

    it('passes bucket parameter through to uploadFileToStorage', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id' });

      const file = createMockFile({ originalname: 'evidence.pdf', mimetype: 'application/pdf' });
      await uploadMultipleFiles([file], 'dispute-evidence');

      expect(mockCreateFile).toHaveBeenCalledWith(
        'dispute-evidence',
        expect.any(String),
        expect.anything(),
        expect.any(Array)
      );
    });

    it('handles mixed success and failure results', async () => {
      mockCreateFile
        .mockResolvedValueOnce({ $id: 'file-id-1' })
        .mockRejectedValueOnce(new Error('Quota exceeded'));

      const files = [
        createMockFile({ originalname: 'doc1.pdf' }),
        createMockFile({ originalname: 'doc2.pdf' }),
      ];

      const results = await uploadMultipleFiles(files);

      expect(results).toHaveLength(2);
      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(false);
    });
  });

  describe('deleteFileFromStorage', () => {
    it('deletes a file and returns success', async () => {
      mockDeleteFile.mockResolvedValue({});

      const result = await deleteFileFromStorage('file-id-123');

      expect(result).toEqual({ success: true });
      expect(mockDeleteFile).toHaveBeenCalledWith('proposal-attachments', 'file-id-123');
      expect(logger.info).toHaveBeenCalledWith(
        'File deleted successfully from Appwrite Storage',
        expect.objectContaining({ fileId: 'file-id-123' })
      );
    });

    it('returns error on unexpected exception', async () => {
      mockDeleteFile.mockRejectedValue(new Error('Connection timeout'));

      const result = await deleteFileFromStorage('file-id-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection timeout');
      expect(logger.error).toHaveBeenCalledWith(
        'Unexpected error during file deletion',
        expect.objectContaining({ error: 'Connection timeout' })
      );
    });

    it('uses default bucket when bucket parameter is omitted', async () => {
      mockDeleteFile.mockResolvedValue({});

      await deleteFileFromStorage('file-id');

      expect(mockDeleteFile).toHaveBeenCalledWith('proposal-attachments', 'file-id');
    });

    it('uses custom bucket when provided', async () => {
      mockDeleteFile.mockResolvedValue({});

      await deleteFileFromStorage('file-id', 'dispute-evidence');

      expect(mockDeleteFile).toHaveBeenCalledWith('dispute-evidence', 'file-id');
    });
  });

  describe('cleanupUploadedFiles', () => {
    it('deletes all files when fileId is present in metadata', async () => {
      mockDeleteFile.mockResolvedValue({});

      const metadata = [
        { url: 'https://example.com/file1', filename: 'file1.pdf', size: 1024, mimeType: 'application/pdf', fileId: 'id-1' },
        { url: 'https://example.com/file2', filename: 'file2.pdf', size: 2048, mimeType: 'application/pdf', fileId: 'id-2' },
      ];

      await cleanupUploadedFiles(metadata);

      expect(mockDeleteFile).toHaveBeenCalledTimes(2);
      expect(mockDeleteFile).toHaveBeenCalledWith('proposal-attachments', 'id-1');
      expect(mockDeleteFile).toHaveBeenCalledWith('proposal-attachments', 'id-2');
    });

    it('skips files with no fileId and invalid URL', async () => {
      mockDeleteFile.mockResolvedValue({});

      const metadata = [
        { url: 'https://example.com/not-appwrite', filename: 'invalid.pdf', size: 1024, mimeType: 'application/pdf' },
      ];

      await cleanupUploadedFiles(metadata);

      expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('logs a warning when some deletions fail', async () => {
      mockDeleteFile
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Permission denied'));

      const metadata = [
        { url: 'https://example.com/file1', filename: 'good.pdf', size: 1024, mimeType: 'application/pdf', fileId: 'id-1' },
        { url: 'https://example.com/file2', filename: 'bad.pdf', size: 2048, mimeType: 'application/pdf', fileId: 'id-2' },
      ];

      await cleanupUploadedFiles(metadata);

      expect(logger.warn).toHaveBeenCalledWith('Some files could not be cleaned up', {
        failedCount: 1,
        totalCount: 2,
      });
    });

    it('does not log warning when all deletions succeed', async () => {
      mockDeleteFile.mockResolvedValue({});

      const metadata = [
        { url: 'https://example.com/file', filename: 'file.pdf', size: 1024, mimeType: 'application/pdf', fileId: 'id-1' },
      ];

      await cleanupUploadedFiles(metadata);

      expect(logger.warn).not.toHaveBeenCalledWith('Some files could not be cleaned up', expect.any(Object));
    });

    it('uses custom bucket when provided', async () => {
      mockDeleteFile.mockResolvedValue({});

      const metadata = [
        { url: 'https://example.com/file', filename: 'file.pdf', size: 1024, mimeType: 'application/pdf', fileId: 'id-1' },
      ];

      await cleanupUploadedFiles(metadata, 'dispute-evidence');

      expect(mockDeleteFile).toHaveBeenCalledWith('dispute-evidence', 'id-1');
    });
  });
});
