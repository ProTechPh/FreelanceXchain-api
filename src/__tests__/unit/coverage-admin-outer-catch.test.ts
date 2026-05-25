// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockPool = { query: jest.fn<any>() };

jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPool,
}));

const mockLoggerError = jest
  .fn()
  .mockImplementationOnce(() => { throw new Error('Log failure'); })
  .mockImplementation(() => {});

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: mockLoggerError, info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

const { getSystemHealth } = await import('../../services/admin-service.js');

describe('Admin Service - outer catch in getSystemHealth (lines 384-385)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoggerError
      .mockReset()
      .mockImplementationOnce(() => { throw new Error('Log failure'); })
      .mockImplementation(() => {});
  });

  it('should trigger outer catch when inner catch logger.error throws', async () => {
    mockPool.query.mockRejectedValue(new Error('DB fail'));
    const result = await getSystemHealth();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});
