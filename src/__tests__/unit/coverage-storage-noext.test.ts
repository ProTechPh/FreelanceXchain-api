// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateFile = jest.fn();
const mockDeleteFile = jest.fn();
const mockListFiles = jest.fn();

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
    DATABASE_ID: 'freelancexchain',
  storage: { createFile: mockCreateFile, deleteFile: mockDeleteFile, listFiles: mockListFiles },
  BUCKETS: {
    PROPOSAL_ATTACHMENTS: 'proposal-attachments',
    PROJECT_ATTACHMENTS: 'project-attachments',
    PORTFOLIO_IMAGES: 'portfolio-images',
  },
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { uploadFile } = await import('../../utils/storage-uploader.js');

describe('Storage Uploader - no-extension filename (line 41)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateFile.mockResolvedValue({ $id: 'file-noext' });
  });

  it('should upload file with no-extension filename (line 41)', async () => {
    const result = await uploadFile({
      bucket: 'proposal-attachments',
      userId: 'user-1',
      file: Buffer.from('test'),
      filename: 'noextension',
    });
    expect(result.success).toBe(true);
    expect(mockCreateFile).toHaveBeenCalledTimes(1);
  });
});
