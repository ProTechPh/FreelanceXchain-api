// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

const mockCronSchedule = jest.fn();
const mockCronGetTasks = jest.fn();
const mockTaskStop = jest.fn();
const mockSendWeeklyDigestEmail = jest.fn();

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: mockLogger,
}));

jest.unstable_mockModule('node-cron', () => ({
  default: {
    schedule: mockCronSchedule,
    getTasks: mockCronGetTasks,
  },
}));

jest.unstable_mockModule(resolveModule('src/services/email-delivery-service.ts'), () => ({
  sendWeeklyDigestEmail: mockSendWeeklyDigestEmail,
}));

const { initializeScheduler, stopScheduler } = await import('../../services/scheduler-service.js');

describe('Scheduler Service - Coverage Gaps', () => {
  let mockPool: any;
  let scheduledCallbacks: Map<string, () => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    scheduledCallbacks = new Map();

    mockCronSchedule.mockImplementation((expression: any, callback: any) => {
      scheduledCallbacks.set(expression, callback);
      return { stop: mockTaskStop };
    });

    mockCronGetTasks.mockReturnValue([{ stop: mockTaskStop }]);
  });

  describe('initializeScheduler - all cron jobs registered', () => {
    it('should register all 4 cron jobs and log initialization', () => {
      initializeScheduler();
      expect(mockCronSchedule).toHaveBeenCalledTimes(4);
      expect(mockCronSchedule).toHaveBeenCalledWith('0 0 * * *', expect.any(Function));
      expect(mockCronSchedule).toHaveBeenCalledWith('0 9 * * 1', expect.any(Function));
      expect(mockCronSchedule).toHaveBeenCalledWith('0 */6 * * *', expect.any(Function));
      expect(mockCronSchedule).toHaveBeenCalledWith('0 2 * * *', expect.any(Function));
      expect(mockLogger.info).toHaveBeenCalledWith('Initializing scheduler service...');
      expect(mockLogger.info).toHaveBeenCalledWith('Scheduler service initialized successfully');
    });
  });

  describe('autoCloseExpiredProjects - error handling', () => {
    it('should log error when query fails', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 0 * * *');

      mockPool.query.mockRejectedValueOnce(new Error('DB connection failed'));

      callback();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to auto-close expired projects:', expect.any(Error));
    });

    it('should skip when no expired projects found', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 0 * * *');

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      callback();
      await new Promise(resolve => setTimeout(resolve, 20));
      // Should not call update query
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should log running message', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 0 * * *');

      mockPool.query.mockResolvedValueOnce({ rows: [] });
      callback();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLogger.info).toHaveBeenCalledWith('Running scheduled job: Auto-close expired projects');
    });
  });

  describe('sendWeeklyDigests - error handling', () => {
    it('should log error when outer query fails', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 9 * * 1');

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      callback();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to send weekly digests:', expect.any(Error));
    });

    it('should log info when no users have digest enabled', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 9 * * 1');

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      callback();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLogger.info).toHaveBeenCalledWith('No users with weekly digest enabled');
    });

    it('should handle per-user errors gracefully', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 9 * * 1');

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id: 'u1', email: 'u1@test.com', full_name: 'User 1' }] })
        .mockRejectedValueOnce(new Error('Stats query failed'));

      callback();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send weekly digest to user u1'),
        expect.any(Error)
      );
    });

    it('should log running message', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 9 * * 1');

      mockPool.query.mockResolvedValueOnce({ rows: [] });
      callback();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLogger.info).toHaveBeenCalledWith('Running scheduled job: Send weekly digests');
    });
  });

  describe('executeSavedSearches - error handling', () => {
    it('should return early when no saved searches found', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 */6 * * *');

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      callback();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should log error when outer query fails', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 */6 * * *');

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      callback();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to execute saved searches:', expect.any(Error));
    });

    it('should handle per-search errors gracefully', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 */6 * * *');

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 's1', search_type: 'project', filters: { status: 'open' } }] })
        .mockRejectedValueOnce(new Error('Search query failed'));

      callback();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to execute saved search s1'),
        expect.any(Error)
      );
    });

    it('should execute search with filters', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 */6 * * *');

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 's1', search_type: 'project', filters: { status: 'open', budget: 1000 } }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p1' }, { id: 'p2' }] });

      callback();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLogger.info).toHaveBeenCalledWith('Found 2 results for saved search s1');
    });

    it('should log running message', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 */6 * * *');

      mockPool.query.mockResolvedValueOnce({ rows: [] });
      callback();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLogger.info).toHaveBeenCalledWith('Running scheduled job: Execute saved searches');
    });
  });

  describe('cleanupOldNotifications - error handling', () => {
    it('should log error when cleanup fails', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 2 * * *');

      mockPool.query.mockRejectedValueOnce(new Error('Delete failed'));

      callback();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to cleanup old notifications:', expect.any(Error));
    });

    it('should log running message', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 2 * * *');

      mockPool.query.mockResolvedValueOnce({ rowCount: 5 });
      callback();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLogger.info).toHaveBeenCalledWith('Running scheduled job: Cleanup old notifications');
    });

    it('should log success after cleanup', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 2 * * *');

      mockPool.query.mockResolvedValueOnce({ rowCount: 3 });
      callback();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockLogger.info).toHaveBeenCalledWith('Cleaned up old notifications');
    });
  });

  describe('stopScheduler', () => {
    it('should stop all tasks and log', () => {
      stopScheduler();
      expect(mockCronGetTasks).toHaveBeenCalled();
      expect(mockTaskStop).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Scheduler service stopped');
    });
  });
});
