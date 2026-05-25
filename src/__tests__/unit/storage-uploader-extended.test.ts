// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockDeleteFile = jest.fn();
const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  storage: {
    createFile: jest.fn().mockResolvedValue({ $id: 'file-id-123' }),
    deleteFile: mockDeleteFile,
    listFiles: jest.fn().mockResolvedValue({ files: [], total: 0 }),
  },
  BUCKETS: {
    PROPOSAL_ATTACHMENTS: 'proposal-attachments',
    PROJECT_ATTACHMENTS: 'project-attachments',
  },
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: mockLogger,
}));

const {
  cleanupUploadedFiles,
  extractFileIdFromUrl,
  extractFilePathFromUrl,
  deleteFileFromStorage,
} = await import('../../utils/storage-uploader.js');

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

    it('extractFilePathFromUrl should be an alias for extractFileIdFromUrl', () => {
      expect(extractFilePathFromUrl).toBe(extractFileIdFromUrl);
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

      // Should not call deleteFile since no valid fileId could be extracted
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
