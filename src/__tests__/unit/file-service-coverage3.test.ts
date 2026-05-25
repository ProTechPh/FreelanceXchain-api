// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockPool = { query: jest.fn<any>() };
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPool,
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

const mockStorage = {
  listFiles: jest.fn<any>(),
  getFile: jest.fn<any>(),
  deleteFile: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  storage: mockStorage,
  BUCKETS: { PORTFOLIO_IMAGES: 'portfolio', PROPOSAL_ATTACHMENTS: 'proposals' },
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: { appwrite: { endpoint: 'http://localhost', projectId: 'test-project' } },
}));

const { getUserFiles, deleteFile, getFileQuota } = await import('../../services/file-service.js');

describe('File Service - Coverage3', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserFiles', () => {
    it('should return files from multiple buckets', async () => {
      mockStorage.listFiles.mockResolvedValue({
        files: [
          { name: 'user-1-photo.jpg', $id: 'f-1', sizeOriginal: 1024, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
          { name: 'other-user-photo.jpg', $id: 'f-2', sizeOriginal: 2048, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
        ],
      });

      const result = await getUserFiles('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        // Only files containing userId should be returned
        expect(result.data.every(f => f.name.includes('user-1'))).toBe(true);
      }
    });

    it('should return files from specific bucket', async () => {
      mockStorage.listFiles.mockResolvedValue({
        files: [{ name: 'user-1-doc.pdf', $id: 'f-1', sizeOriginal: 5000, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' }],
      });

      const result = await getUserFiles('user-1', 'portfolio');
      expect(result.success).toBe(true);
    });

    it('should handle bucket listing error gracefully', async () => {
      mockStorage.listFiles.mockRejectedValue(new Error('Bucket error'));

      const result = await getUserFiles('user-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.length).toBe(0);
    });

    it('should handle empty file list', async () => {
      mockStorage.listFiles.mockResolvedValue({ files: [] });

      const result = await getUserFiles('user-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.length).toBe(0);
    });
  });

  describe('deleteFile', () => {
    it('should return UNAUTHORIZED when file does not belong to user', async () => {
      mockStorage.getFile.mockResolvedValue({ name: 'other-user-file.jpg' });

      const result = await deleteFile('user-1', 'portfolio', 'f-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return NOT_FOUND when file does not exist', async () => {
      mockStorage.getFile.mockRejectedValue(new Error('Not found'));

      const result = await deleteFile('user-1', 'portfolio', 'f-bad');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should delete file successfully', async () => {
      mockStorage.getFile.mockResolvedValue({ name: 'user-1-photo.jpg' });
      mockStorage.deleteFile.mockResolvedValue(undefined);

      const result = await deleteFile('user-1', 'portfolio', 'f-1');
      expect(result.success).toBe(true);
    });

    it('should handle unexpected error during delete', async () => {
      mockStorage.getFile.mockResolvedValue({ name: 'user-1-photo.jpg' });
      mockStorage.deleteFile.mockRejectedValue(new Error('Storage error'));

      const result = await deleteFile('user-1', 'portfolio', 'f-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('getFileQuota', () => {
    it('should return quota information', async () => {
      mockStorage.listFiles.mockResolvedValue({
        files: [
          { name: 'user-1-photo.jpg', $id: 'f-1', sizeOriginal: 1024, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
          { name: 'user-1-doc.pdf', $id: 'f-2', sizeOriginal: 2048, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
        ],
      });

      const result = await getFileQuota('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.files).toBeGreaterThan(0);
        expect(result.data.used).toBeGreaterThan(0);
      }
    });

    it('should handle getUserFiles failure', async () => {
      // Force an unexpected error by making listFiles throw in a way that propagates
      mockStorage.listFiles.mockImplementation(() => { throw new Error('Unexpected'); });

      const result = await getFileQuota('user-1');
      // The getUserFiles catches bucket errors, so this should still succeed with empty data
      expect(result.success).toBe(true);
    });

    it('should return zero quota when no files', async () => {
      mockStorage.listFiles.mockResolvedValue({ files: [] });

      const result = await getFileQuota('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.used).toBe(0);
        expect(result.data.files).toBe(0);
      }
    });
  });
});
