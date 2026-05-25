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

describe('Scheduler Service', () => {
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

  describe('initializeScheduler', () => {
    it('should schedule cron jobs', () => {
      initializeScheduler();
      expect(mockCronSchedule).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Scheduler service initialized successfully');
    });
  });

  describe('stopScheduler', () => {
    it('should stop cron tasks', () => {
      stopScheduler();
      expect(mockTaskStop).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Scheduler service stopped');
    });
  });

  describe('autoCloseExpiredProjects', () => {
    it('should close expired projects', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 0 * * *');
      
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'p1' }, { id: 'p2' }] }) // find expired
        .mockResolvedValueOnce({ rows: [] }); // update status

      if (callback) {
        callback();
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(mockLogger.info).toHaveBeenCalledWith('Auto-closed 2 expired projects');
      }
    });
  });

  describe('sendWeeklyDigests', () => {
    it('should send digest emails', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 9 * * 1');
      
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id: 'u1', email: 'u1@test.com', full_name: 'User 1' }] }) // get users
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // new projects
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // new messages
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // pending milestones
        .mockResolvedValueOnce({ rows: [{ id: 'proj1', title: 'Top Project', budget: 1000 }] }); // top projects

      if (callback) {
        callback();
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(mockSendWeeklyDigestEmail).toHaveBeenCalled();
      }
    });
  });

  describe('executeSavedSearches', () => {
    it('should execute searches and log results', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 */6 * * *');
      
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 's1', search_type: 'project', filters: {} }] }) // get searches
        .mockResolvedValueOnce({ rows: [{ id: 'r1' }] }); // execute search

      if (callback) {
        callback();
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(mockLogger.info).toHaveBeenCalledWith('Found 1 results for saved search s1');
      }
    });
  });

  describe('cleanupOldNotifications', () => {
    it('should delete old notifications', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 2 * * *');
      
      mockPool.query.mockResolvedValueOnce({ rowCount: 10 });

      if (callback) {
        callback();
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(mockLogger.info).toHaveBeenCalledWith('Cleaned up old notifications');
      }
    });
  });
});