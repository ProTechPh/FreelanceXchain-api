// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockListFiles = jest.fn();
const mockDeleteFile = jest.fn();

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  storage: { listFiles: mockListFiles, deleteFile: mockDeleteFile },
  BUCKETS: {
    PROPOSAL_ATTACHMENTS: 'proposal-attachments',
    PROJECT_ATTACHMENTS: 'project-attachments',
    PORTFOLIO_IMAGES: 'portfolio-images',
  },
}));

const mockLoggerError = jest
  .fn()
  .mockImplementationOnce(() => { throw new Error('Log fail'); })
  .mockImplementation(() => {});

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: mockLoggerError, info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { getUserFiles, getFileQuota } = await import('../../services/file-service.js');

describe('File Service - outer catch blocks (lines 70-71, 140)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoggerError
      .mockReset()
      .mockImplementationOnce(() => { throw new Error('Log fail'); })
      .mockImplementation(() => {});
  });

  it('should trigger outer catch when logger.error throws inside inner catch (line 70-71)', async () => {
    mockListFiles.mockRejectedValue(new Error('Storage error'));

    const result = await getUserFiles('user-1', 'bucket-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });

  it('should propagate getUserFiles failure to getFileQuota (line 140)', async () => {
    mockListFiles.mockRejectedValue(new Error('Storage error'));

    const result = await getFileQuota('user-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});
