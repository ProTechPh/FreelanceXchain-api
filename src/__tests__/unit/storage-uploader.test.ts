// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateFile = jest.fn() as any;
const mockDeleteFile = jest.fn() as any;
const mockListFiles = jest.fn() as any;
const mockGetFile = jest.fn() as any;

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
    DATABASE_ID: 'freelancexchain',
  storage: {
    createFile: mockCreateFile,
    deleteFile: mockDeleteFile,
    listFiles: mockListFiles,
    getFile: mockGetFile,
  },
  // Query helpers used by listUserFiles pagination
  Query: {
    limit: (n: number) => `limit(${n})`,
    cursorAfter: (id: string) => `cursorAfter("${id}")`,
    orderDesc: (attr: string) => `orderDesc("${attr}")`,
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
  extractFileIdFromUrl,
  cleanupUploadedFiles,
  uploadFile,
  deleteFile,
  getSignedUrl,
  listUserFiles,
  getFileQuota,
} = await import('../../utils/storage-uploader.js');

const { logger } = await import('../../config/logger.js');
const mockLogger = logger;
const { sanitizeFilename } = await import('../../middleware/file-upload-middleware.js');
const { v4: uuidv4 } = await import('uuid');

const APPWRITE_ENDPOINT = 'https://cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = 'test-project-id';

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateFile.mockReset();
  mockDeleteFile.mockReset();
  mockListFiles.mockReset();
  mockGetFile.mockReset();
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

  describe('uploadFileToStorage', () => {
    const mockBuffer = Buffer.from('test file content');

    it('uploads a file and returns success with metadata', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id-123' });

      const result = await uploadFileToStorage({ buffer: mockBuffer, originalFilename: 'document.pdf', mimeType: 'application/pdf' });

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

      const result = await uploadFileToStorage({ buffer: mockBuffer, originalFilename: 'document.pdf', mimeType: 'application/pdf' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network failure');
      expect(logger.error).toHaveBeenCalledWith(
        'Unexpected error during file upload',
        expect.objectContaining({ error: 'Network failure' })
      );
    });

    it('uses default bucket when bucket parameter is omitted', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id' });

      await uploadFileToStorage({ buffer: mockBuffer, originalFilename: 'file.pdf', mimeType: 'application/pdf' });

      expect(mockCreateFile).toHaveBeenCalledWith(
        'proposal-attachments',
        expect.any(String),
        expect.anything(),
        expect.any(Array)
      );
    });

    it('uses custom bucket when provided', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id' });

      await uploadFileToStorage({ buffer: mockBuffer, originalFilename: 'file.pdf', mimeType: 'application/pdf', bucket: 'dispute-evidence' });

      expect(mockCreateFile).toHaveBeenCalledWith(
        'dispute-evidence',
        expect.any(String),
        expect.anything(),
        expect.any(Array)
      );
    });

    it('uses user-scoped permissions for sensitive buckets with userId (line 77)', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id' });

      await uploadFileToStorage({
        buffer: mockBuffer,
        originalFilename: 'evidence.pdf',
        mimeType: 'application/pdf',
        bucket: 'dispute-evidence',
        userId: 'user-123',
      });

      expect(mockCreateFile).toHaveBeenCalledWith(
        'dispute-evidence',
        expect.any(String),
        expect.anything(),
        ['read("user:user-123")', 'write("user:user-123")']
      );
    });

    it('uses user-scoped permissions for milestone-deliverables bucket with userId', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id' });

      await uploadFileToStorage({
        buffer: mockBuffer,
        originalFilename: 'deliverable.pdf',
        mimeType: 'application/pdf',
        bucket: 'milestone-deliverables',
        userId: 'user-456',
      });

      expect(mockCreateFile).toHaveBeenCalledWith(
        'milestone-deliverables',
        expect.any(String),
        expect.anything(),
        ['read("user:user-456")', 'write("user:user-456")']
      );
    });

    it('generates unique filename with uuid prefix', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id' });

      await uploadFileToStorage({ buffer: mockBuffer, originalFilename: 'document.pdf', mimeType: 'application/pdf' });

      expect(sanitizeFilename).toHaveBeenCalledWith('document.pdf');
      expect(uuidv4).toHaveBeenCalled();
    });

    it('preserves original filename in metadata', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id' });

      const result = await uploadFileToStorage({ buffer: mockBuffer, originalFilename: 'My Document.pdf', mimeType: 'application/pdf' });

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

    it('passes userId through for ownership prefixing', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-id' });

      const file = createMockFile({ originalname: 'evidence.pdf', mimetype: 'application/pdf' });
      await uploadMultipleFiles([file], 'dispute-evidence', 'user-1');

      expect(mockCreateFile).toHaveBeenCalledWith(
        'dispute-evidence',
        expect.any(String),
        expect.anything(),
        expect.arrayContaining([])
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

describe('Storage Uploader - Extended Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteFile.mockResolvedValue({});
  });

  describe('extractFileIdFromUrl', () => {
    it('should extract file ID from valid Appwrite URL', () => {
      const url = 'https://cloud.appwrite.io/v1/storage/buckets/proposal-attachments/files/abc123def/view?project=proj1';
      const result = extractFileIdFromUrl(url);
      expect(result).toBe('abc123def');
    });

    it('should return null for invalid URL (not a URL)', () => {
      const result = extractFileIdFromUrl('not-a-url');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = extractFileIdFromUrl('');
      expect(result).toBeNull();
    });

    it('should return null for URL without storage path pattern', () => {
      const url = 'https://example.com/some/other/path';
      const result = extractFileIdFromUrl(url);
      expect(result).toBeNull();
    });

    it('should handle URL with different bucket names', () => {
      const url = 'https://cloud.appwrite.io/v1/storage/buckets/project-attachments/files/xyz789/view?project=proj1';
      const result = extractFileIdFromUrl(url);
      expect(result).toBe('xyz789');
    });

  });

  describe('cleanupUploadedFiles', () => {
    it('should delete files with valid file IDs from metadata', async () => {
      const fileMetadata = [
        { url: 'https://cloud.appwrite.io/v1/storage/buckets/b/files/file1/view', filename: 'a.pdf', size: 100, mimeType: 'application/pdf', fileId: 'file1' },
        { url: 'https://cloud.appwrite.io/v1/storage/buckets/b/files/file2/view', filename: 'b.pdf', size: 200, mimeType: 'application/pdf', fileId: 'file2' },
      ];

      await cleanupUploadedFiles(fileMetadata);

      expect(mockDeleteFile).toHaveBeenCalledTimes(2);
    });

    it('should handle empty array without errors', async () => {
      await cleanupUploadedFiles([]);
      expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('should not throw when deleteFile throws', async () => {
      mockDeleteFile.mockRejectedValue(new Error('Delete failed'));

      const fileMetadata = [
        { url: 'https://cloud.appwrite.io/v1/storage/buckets/b/files/file1/view', filename: 'a.pdf', size: 100, mimeType: 'application/pdf', fileId: 'file1' },
      ];

      await expect(cleanupUploadedFiles(fileMetadata)).resolves.not.toThrow();
    });

    it('should extract file ID from URL when fileId is not in metadata', async () => {
      const fileMetadata = [
        { url: 'https://cloud.appwrite.io/v1/storage/buckets/proposal-attachments/files/extracted-id/view?project=p1', filename: 'c.pdf', size: 300, mimeType: 'application/pdf' },
      ];

      await cleanupUploadedFiles(fileMetadata);

      expect(mockDeleteFile).toHaveBeenCalledTimes(1);
    });

    it('should log warning when some files fail to delete', async () => {
      mockDeleteFile.mockRejectedValue(new Error('Network error'));

      const fileMetadata = [
        { url: 'https://cloud.appwrite.io/v1/storage/buckets/b/files/f1/view', filename: 'a.pdf', size: 100, mimeType: 'application/pdf', fileId: 'f1' },
        { url: 'https://cloud.appwrite.io/v1/storage/buckets/b/files/f2/view', filename: 'b.pdf', size: 200, mimeType: 'application/pdf', fileId: 'f2' },
      ];

      await cleanupUploadedFiles(fileMetadata);

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle metadata with invalid URL and no fileId', async () => {
      const fileMetadata = [
        { url: 'invalid-url', filename: 'd.pdf', size: 100, mimeType: 'application/pdf' },
      ];

      await cleanupUploadedFiles(fileMetadata);

      expect(mockDeleteFile).not.toHaveBeenCalled();
    });
  });

  describe('deleteFileFromStorage', () => {
    it('should return success when file is deleted', async () => {
      mockDeleteFile.mockResolvedValue({});
      const result = await deleteFileFromStorage('file-id-1', 'proposal-attachments');
      expect(result.success).toBe(true);
    });

    it('should return error when deletion fails', async () => {
      mockDeleteFile.mockRejectedValue(new Error('File not found'));
      const result = await deleteFileFromStorage('nonexistent', 'proposal-attachments');
      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });
  });
});

describe('Storage Uploader - Compatibility Wrappers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateFile.mockReset();
    mockDeleteFile.mockReset();
    mockListFiles.mockReset();
    process.env['APPWRITE_ENDPOINT'] = APPWRITE_ENDPOINT;
    process.env['APPWRITE_PROJECT_ID'] = APPWRITE_PROJECT_ID;
  });

  describe('uploadFile (compatibility wrapper)', () => {
    it('should upload file and return url and path', async () => {
      mockCreateFile.mockResolvedValue({ $id: 'file-123' });

      const result = await uploadFile({
        bucket: 'proposal-attachments',
        userId: 'user-1',
        file: Buffer.from('test content'),
        filename: 'test.pdf',
        mimetype: 'application/pdf',
      });

      expect(result.success).toBe(true);
      expect(result.url).toContain('file-123');
      expect(result.path).toBe('file-123');
    });

    it('should return error when upload fails', async () => {
      mockCreateFile.mockRejectedValue(new Error('Upload failed'));

      const result = await uploadFile({
        bucket: 'proposal-attachments',
        userId: 'user-1',
        file: Buffer.from('test'),
        filename: 'bad.pdf',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Upload failed');
    });
  });

  describe('deleteFile (compatibility wrapper)', () => {
    it('should delegate to deleteFileFromStorage', async () => {
      mockDeleteFile.mockResolvedValue({});

      const result = await deleteFile('proposal-attachments', 'file-id');

      expect(result.success).toBe(true);
      expect(mockDeleteFile).toHaveBeenCalledWith('proposal-attachments', 'file-id');
    });
  });

  describe('getSignedUrl', () => {
    it('should return a constructed view URL', async () => {
      const result = await getSignedUrl('proposal-attachments', 'file-id-abc');

      expect(result.success).toBe(true);
      expect(result.url).toContain('proposal-attachments');
      expect(result.url).toContain('file-id-abc');
      expect(result.url).toContain('/view');
    });
  });

  describe('listUserFiles', () => {
    it('should return files filtered by userId', async () => {
      mockListFiles.mockResolvedValue({
        files: [
          { name: 'user-1_file1.pdf', $id: 'f1' },
          { name: 'user-2_file2.pdf', $id: 'f2' },
          { name: 'user-1_file3.pdf', $id: 'f3' },
        ],
      });

      const result = await listUserFiles('proposal-attachments', 'user-1');

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
      expect(result.files[0].name).toContain('user-1');
      expect(result.files[1].name).toContain('user-1');
    });

    it('should return error when listFiles fails', async () => {
      mockListFiles.mockRejectedValue(new Error('Permission denied'));

      const result = await listUserFiles('proposal-attachments', 'user-1');

      expect(result.success).toBe(false);
      expect(result.files).toEqual([]);
      expect(result.error).toBe('Permission denied');
    });

    it('should page through every page so files beyond the first page are not dropped', async () => {
      // Page 1 is exactly PAGE_SIZE files (triggers a cursor-based follow-up call)
      const page1Files = Array.from({ length: 100 }, (_, i) => ({
        name: `user-1_file_${i}.pdf`,
        $id: `f${i}`,
      }));
      // Page 2 has fewer files (terminates the loop) and includes a foreign file
      const page2Files = [
        { name: 'user-1_file_100.pdf', $id: 'f100' },
        { name: 'user-2_other.pdf', $id: 'f101' },
      ];
      mockListFiles
        .mockResolvedValueOnce({ files: page1Files })
        .mockResolvedValueOnce({ files: page2Files });

      const result = await listUserFiles('proposal-attachments', 'user-1');

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(101);
      expect(result.files.every(f => f.name.startsWith('user-1_'))).toBe(true);
      expect(mockListFiles).toHaveBeenCalledTimes(2);
      // Second call continues after the last file id of the first page
      const secondCallQueries = mockListFiles.mock.calls[1]?.[1] ?? [];
      expect(secondCallQueries.some((q: string) => q.includes('cursorAfter("f99")'))).toBe(true);
    });
  });

  describe('ownership verification (BLF-11.2)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockGetFile.mockReset();
      mockDeleteFile.mockReset().mockResolvedValue({});
      process.env['APPWRITE_ENDPOINT'] = APPWRITE_ENDPOINT;
      process.env['APPWRITE_PROJECT_ID'] = APPWRITE_PROJECT_ID;
    });

    it('should delete a file owned by the user (userId prefix match)', async () => {
      mockGetFile.mockResolvedValue({ $id: 'f1', name: 'user-123_photo.png' });

      const result = await deleteFile('profile-images', 'f1', 'user-123');

      expect(result).toEqual({ success: true });
      expect(mockDeleteFile).toHaveBeenCalledWith('profile-images', 'f1');
    });

    it('should refuse to delete another user file', async () => {
      mockGetFile.mockResolvedValue({ $id: 'f1', name: 'user-999_photo.png' });

      const result = await deleteFile('profile-images', 'f1', 'user-123');

      expect(result).toEqual({ success: false, error: 'FORBIDDEN' });
      expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('should return FILE_NOT_FOUND when the stored file cannot be fetched', async () => {
      mockGetFile.mockRejectedValue(new Error('Not found'));

      const result = await deleteFile('profile-images', 'f1', 'user-123');

      expect(result).toEqual({ success: false, error: 'FILE_NOT_FOUND' });
      expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('should skip the ownership check when no userId is provided', async () => {
      const result = await deleteFile('profile-images', 'f1');

      expect(result).toEqual({ success: true });
      expect(mockGetFile).not.toHaveBeenCalled();
    });

    it('should return a signed URL only for files owned by the user', async () => {
      mockGetFile.mockResolvedValue({ $id: 'f1', name: 'user-123_doc.pdf' });

      const result = await getSignedUrl('contract-documents', 'f1', 'user-123');

      expect(result.success).toBe(true);
      expect(result.url).toContain('/contract-documents/files/f1/view');
    });

    it('should refuse a signed URL for another user file', async () => {
      mockGetFile.mockResolvedValue({ $id: 'f1', name: 'user-999_doc.pdf' });

      const result = await getSignedUrl('contract-documents', 'f1', 'user-123');

      expect(result).toEqual({ success: false, error: 'FORBIDDEN' });
    });

    it('should return FILE_NOT_FOUND when the file is missing for a signed URL', async () => {
      mockGetFile.mockResolvedValue(null);

      const result = await getSignedUrl('contract-documents', 'f1', 'user-123');

      expect(result).toEqual({ success: false, error: 'FILE_NOT_FOUND' });
    });
  });
});

describe('Storage Uploader - generateUniqueFilename edge case', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateFile.mockReset();
    process.env['APPWRITE_ENDPOINT'] = APPWRITE_ENDPOINT;
    process.env['APPWRITE_PROJECT_ID'] = APPWRITE_PROJECT_ID;
  });

  it('should prefix the stored filename with the userId for ownership verification', async () => {
    mockCreateFile.mockResolvedValue({ $id: 'file-owner-prefix' });

    await uploadFileToStorage({
      buffer: Buffer.from('data'),
      originalFilename: 'document.pdf',
      mimeType: 'application/pdf',
      bucket: 'proposal-attachments',
      userId: 'user-123',
    });

    // storage.createFile(bucket, fileId, inputFile, permissions) — the stored
    // name lives on the InputFile (third argument).
    const storedInputFile = mockCreateFile.mock.calls[0][2] as any;
    expect(storedInputFile.name).toMatch(/^user-123_.+document\.pdf$/);
  });

  it('should handle filename without extension', async () => {
    mockCreateFile.mockResolvedValue({ $id: 'file-noext' });

    // sanitizeFilename mock returns the input for simple names
    const result = await uploadFileToStorage({ buffer: Buffer.from('data'), originalFilename: 'README', mimeType: 'text/plain' });

    expect(result.success).toBe(true);
    expect(result.metadata?.filename).toBe('README');
  });
});

describe('Storage Uploader - getFileQuota', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListFiles.mockReset();
  });

  it('should sum usage across both personal buckets', async () => {
    mockListFiles
      .mockResolvedValueOnce({
        files: [
          { name: 'user-1_a.png', $id: 'f1', sizeOriginal: 1000 },
          { name: 'user-1_b.png', $id: 'f2', sizeOriginal: 2000 },
        ],
      })
      .mockResolvedValueOnce({
        files: [{ name: 'user-1_c.pdf', $id: 'f3', sizeOriginal: 7000 }],
      });

    const result = await getFileQuota('user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.used).toBe(10000);
      expect(result.files).toBe(3);
      expect(result.limit).toBe(100 * 1024 * 1024);
      expect(result.percentage).toBeCloseTo((10000 / (100 * 1024 * 1024)) * 100, 5);
    }
    // One listFiles call per personal bucket
    expect(mockListFiles).toHaveBeenCalledTimes(2);
  });

  it('should fall back to the generic message when the failure carries an empty error', async () => {
    mockListFiles
      .mockRejectedValueOnce('')
      .mockResolvedValueOnce({
        files: [],
      });

    const result = await getFileQuota('user-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Failed to list files');
    }
  });

  it('should ignore files that are not owned by the user', async () => {
    mockListFiles
      .mockResolvedValueOnce({
        files: [{ name: 'user-2_other.png', $id: 'f1', sizeOriginal: 999999 }],
      })
      .mockResolvedValueOnce({
        files: [],
      });

    const result = await getFileQuota('user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.used).toBe(0);
      expect(result.files).toBe(0);
    }
  });

  it('should cap the percentage at 100', async () => {
    mockListFiles
      .mockResolvedValueOnce({
        files: [{ name: 'user-1_big.bin', $id: 'f1', sizeOriginal: 200 * 1024 * 1024 }],
      })
      .mockResolvedValueOnce({
        files: [],
      });

    const result = await getFileQuota('user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.percentage).toBe(100);
    }
  });

  it('should return a failure when a bucket listing fails', async () => {
    mockListFiles
      .mockRejectedValueOnce(new Error('storage down'))
      .mockResolvedValueOnce({
        files: [],
      });

    const result = await getFileQuota('user-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('storage down');
    }
  });


  it('should treat missing sizeOriginal as 0 bytes when summing quota', async () => {
    mockListFiles
      .mockResolvedValueOnce({
        files: [{ name: 'user-1_a.png', $id: 'f1' }],
      })
      .mockResolvedValueOnce({
        files: [],
      });

    const result = await getFileQuota('user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.used).toBe(0);
      expect(result.files).toBe(1);
    }
  });

  describe('error and pagination branch coverage', () => {
    it('handles a non-Error rejection in uploadFileToStorage', async () => {
      mockCreateFile.mockRejectedValue('raw string failure');

      const result = await uploadFileToStorage({
        buffer: Buffer.from('x'),
        originalFilename: 'fail.txt',
        mimeType: 'text/plain',
        bucket: 'proposal-attachments',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('raw string failure');
    });

    it('handles a non-Error rejection in deleteFileFromStorage', async () => {
      mockDeleteFile.mockRejectedValue('delete exploded');

      const result = await deleteFileFromStorage('file-1', 'proposal-attachments');

      expect(result.success).toBe(false);
    });

    it('handles a non-Error rejection in listUserFiles', async () => {
      mockListFiles.mockRejectedValue('list exploded');

      const result = await listUserFiles('proposal-attachments', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('list exploded');
    });

    it('breaks the pagination loop when the last page has no usable id', async () => {
      const pageWithNoIds = Array.from({ length: 100 }, (_, i) => ({
        name: `user-1_no_id_${i}.pdf`,
      }));
      mockListFiles.mockResolvedValueOnce({ files: pageWithNoIds });

      const result = await listUserFiles('proposal-attachments', 'user-1');

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(100);
      // No cursorAfter follow-up call because no $id was available.
      expect(mockListFiles).toHaveBeenCalledTimes(1);
    });
  });

  it('omits userId from the upload options when not provided', async () => {
    mockCreateFile.mockResolvedValue({ $id: 'new-file', name: 'nofile.txt' });

    const results = await uploadMultipleFiles(
      [{ buffer: Buffer.from('x'), originalname: 'nofile.txt', mimetype: 'text/plain' }],
      'proposal-attachments'
    );

    expect(results[0].success).toBe(true);
    // The userId spread must be absent so the caller argument is exactly (bucket, name).
    expect(mockCreateFile).toHaveBeenCalledWith(
      'proposal-attachments',
      expect.any(String),
      expect.any(Object),
      expect.arrayContaining([])
    );
  });
});
