// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: mockLogger,
}));

const { getUserFiles, deleteFile, getFileQuota } = await import('../../services/file-service.js');

describe('file-service', () => {
  let mockAppwriteStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAppwriteStorage = (globalThis as any).mockAppwriteStorage;
  });

  describe('getUserFiles', () => {
    it('lists files from default buckets when no bucket specified', async () => {
      const user123 = 'user-123';
      const file1 = { $id: 'f1', name: `${user123}/image.png`, sizeOriginal: 1024, $createdAt: '2024-01-01', $updatedAt: '2024-01-01' };
      const file2 = { $id: 'f2', name: `${user123}/doc.pdf`, sizeOriginal: 2048, $createdAt: '2024-01-01', $updatedAt: '2024-01-01' };

      mockAppwriteStorage.listFiles
        .mockResolvedValueOnce({ files: [file1] }) // First bucket
        .mockResolvedValueOnce({ files: [file2] }); // Second bucket

      const result = await getUserFiles(user123);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].name).toBe(file1.name);
        expect(result.data[1].name).toBe(file2.name);
      }
      expect(mockAppwriteStorage.listFiles).toHaveBeenCalledTimes(2);
    });

    it('lists files from specific bucket when provided', async () => {
      const user456 = 'user-456';
      const file = { $id: 'f3', name: `${user456}/file.jpg`, sizeOriginal: 512, $createdAt: '2024-01-01', $updatedAt: '2024-01-01' };
      mockAppwriteStorage.listFiles.mockResolvedValueOnce({ files: [file] });

      const result = await getUserFiles(user456, 'my-bucket');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].bucket).toBe('my-bucket');
      }
      expect(mockAppwriteStorage.listFiles).toHaveBeenCalledWith('my-bucket');
    });

    it('filters files that do not belong to the user', async () => {
      const userId = 'user-789';
      const myFile = { $id: 'f1', name: `${userId}/image.png`, sizeOriginal: 1024 };
      const otherFile = { $id: 'f2', name: 'other-user/image.png', sizeOriginal: 2048 };

      mockAppwriteStorage.listFiles.mockResolvedValueOnce({ files: [myFile, otherFile] });
      mockAppwriteStorage.listFiles.mockResolvedValueOnce({ files: [] });

      const result = await getUserFiles(userId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe(myFile.name);
      }
    });

    it('continues to next bucket when one bucket returns error', async () => {
      mockAppwriteStorage.listFiles
        .mockRejectedValueOnce(new Error('Bucket error'))
        .mockResolvedValueOnce({ files: [] });

      const result = await getUserFiles('user-1');

      expect(result.success).toBe(true);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('returns empty result when listFiles throws for all buckets', async () => {
      mockAppwriteStorage.listFiles.mockImplementation(() => { throw new Error('Fatal'); });

      const result = await getUserFiles('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });
  });

  describe('deleteFile', () => {
    it('deletes a file successfully', async () => {
      const userId = 'user-123';
      const fileId = 'file-id';
      const bucket = 'bucket';
      
      mockAppwriteStorage.getFile.mockResolvedValueOnce({ name: `${userId}/image.jpg` });
      mockAppwriteStorage.deleteFile.mockResolvedValueOnce({});

      const result = await deleteFile(userId, bucket, fileId);

      expect(result.success).toBe(true);
      expect(mockAppwriteStorage.deleteFile).toHaveBeenCalledWith(bucket, fileId);
    });

    it('returns unauthorized error when path does not belong to user', async () => {
      const userId = 'user-123';
      mockAppwriteStorage.getFile.mockResolvedValueOnce({ name: 'other-user/some-image.jpg' });

      const result = await deleteFile(userId, 'bucket', 'file-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNAUTHORIZED');
      }
      expect(mockAppwriteStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('returns not found when file does not exist', async () => {
      mockAppwriteStorage.getFile.mockRejectedValueOnce(new Error('Not found'));

      const result = await deleteFile('user-1', 'bucket', 'file-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('getFileQuota', () => {
    it('returns quota with file usage', async () => {
      const userId = 'user-1';
      const file1 = { $id: 'f1', name: `${userId}/f-1`, sizeOriginal: 10 * 1024 * 1024 }; // 10MB
      
      mockAppwriteStorage.listFiles
        .mockResolvedValueOnce({ files: [file1] })
        .mockResolvedValueOnce({ files: [] });

      const result = await getFileQuota(userId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.used).toBe(10 * 1024 * 1024);
        expect(result.data.limit).toBe(100 * 1024 * 1024);
        expect(result.data.files).toBe(1);
      }
    });
  });
});