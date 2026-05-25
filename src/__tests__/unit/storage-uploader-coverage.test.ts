// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateFile = jest.fn().mockResolvedValue({ $id: 'file-id-123' });
const mockDeleteFile = jest.fn().mockResolvedValue({});
const mockListFiles = jest.fn().mockResolvedValue({ files: [], total: 0 });

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  storage: { createFile: mockCreateFile, deleteFile: mockDeleteFile, listFiles: mockListFiles },
  BUCKETS: { PROPOSAL_ATTACHMENTS: 'proposal-attachments', PROJECT_ATTACHMENTS: 'project-attachments', PORTFOLIO_IMAGES: 'portfolio-images' },
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { uploadFile, deleteFile, getSignedUrl, listUserFiles } = await import('../../utils/storage-uploader.js');

describe('Storage Uploader - Coverage for compatibility wrappers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateFile.mockResolvedValue({ $id: 'file-id-123' });
    mockDeleteFile.mockResolvedValue({});
  });

  describe('uploadFile (compatibility wrapper)', () => {
    it('should upload file successfully', async () => {
      const result = await uploadFile({
        bucket: 'proposal-attachments',
        userId: 'user-1',
        file: Buffer.from('test content'),
        filename: 'test.pdf',
        mimetype: 'application/pdf',
      });
      expect(result.success).toBe(true);
      expect(result.url).toBeDefined();
    });

    it('should handle upload without mimetype', async () => {
      const result = await uploadFile({
        bucket: 'proposal-attachments',
        userId: 'user-1',
        file: Buffer.from('test'),
        filename: 'test.bin',
      });
      expect(result.success).toBe(true);
    });

    it('should handle upload failure', async () => {
      mockCreateFile.mockRejectedValueOnce(new Error('Upload failed'));
      const result = await uploadFile({
        bucket: 'proposal-attachments',
        userId: 'user-1',
        file: Buffer.from('test'),
        filename: 'test.pdf',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle upload with folder', async () => {
      const result = await uploadFile({
        bucket: 'project-attachments',
        userId: 'user-1',
        file: Buffer.from('test'),
        filename: 'test.pdf',
        folder: 'documents',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('deleteFile (compatibility wrapper)', () => {
    it('should delete file successfully', async () => {
      const result = await deleteFile('proposal-attachments', 'file-id-123');
      expect(result.success).toBe(true);
    });

    it('should handle delete failure', async () => {
      mockDeleteFile.mockRejectedValueOnce(new Error('Not found'));
      const result = await deleteFile('proposal-attachments', 'nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Not found');
    });
  });

  describe('getSignedUrl (compatibility wrapper)', () => {
    it('should return constructed URL', async () => {
      const result = await getSignedUrl('proposal-attachments', 'file-id-123');
      expect(result.success).toBe(true);
      expect(result.url).toContain('file-id-123');
      expect(result.url).toContain('proposal-attachments');
    });
  });

  describe('listUserFiles (compatibility wrapper)', () => {
    it('should return user files', async () => {
      mockListFiles.mockResolvedValueOnce({
        files: [
          { $id: 'f1', name: 'user-1_doc.pdf' },
          { $id: 'f2', name: 'user-2_other.pdf' },
          { $id: 'f3', name: 'user-1_img.png' },
        ],
        total: 3,
      });

      const result = await listUserFiles('proposal-attachments', 'user-1');
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
    });

    it('should return empty when no files match', async () => {
      mockListFiles.mockResolvedValueOnce({ files: [], total: 0 });

      const result = await listUserFiles('proposal-attachments', 'user-1');
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(0);
    });

    it('should handle listFiles error', async () => {
      mockListFiles.mockRejectedValueOnce(new Error('Storage error'));

      const result = await listUserFiles('proposal-attachments', 'user-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Storage error');
    });
  });
});
