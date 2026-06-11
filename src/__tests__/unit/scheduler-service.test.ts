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
  let mockDatabases: any;
  let scheduledCallbacks: Map<string, () => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
    mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });
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

      const pastDate = new Date(Date.now() - 86400000).toISOString();
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p1', deadline: pastDate },
          { $id: 'p2', deadline: pastDate },
        ],
        total: 2,
      });
      mockDatabases.updateDocument.mockResolvedValue({ $id: 'p1' });

      if (callback) {
        callback();
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(mockDatabases.updateDocument).toHaveBeenCalledTimes(2);
        expect(mockLogger.info).toHaveBeenCalledWith('Auto-closed 2 expired projects');
      }
    });
  });

  describe('sendWeeklyDigests', () => {
    it('should send digest emails', async () => {
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 9 * * 1');

      mockDatabases.listDocuments
        // email prefs
        .mockResolvedValueOnce({
          documents: [{ $id: 'ep1', user_id: 'u1' }],
          total: 1,
        })
        // projects
        .mockResolvedValueOnce({
          documents: [],
          total: 0,
        })
        // messages
        .mockResolvedValueOnce({ documents: [], total: 2 })
        // contracts
        .mockResolvedValueOnce({ documents: [], total: 0 })
        // top projects
        .mockResolvedValueOnce({
          documents: [{ $id: 'proj1', title: 'Top Project', budget: 1000 }],
          total: 1,
        });

      // getDocument for user info
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'u1',
        email: 'u1@test.com',
        full_name: 'User 1',
      });

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

      mockDatabases.listDocuments
        // saved searches
        .mockResolvedValueOnce({
          documents: [{ $id: 's1', search_type: 'project', filters: {} }],
          total: 1,
        })
        // search results
        .mockResolvedValueOnce({
          documents: [{ $id: 'r1' }],
          total: 1,
        });

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

      const oldDate = new Date(Date.now() - 60 * 86400000).toISOString();
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'n1', created_at: oldDate },
          { $id: 'n2', created_at: oldDate },
        ],
        total: 2,
      });
      mockDatabases.deleteDocument.mockImplementation(() => Promise.resolve({}));

      if (callback) {
        callback();
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(mockDatabases.deleteDocument).toHaveBeenCalledTimes(2);
        expect(mockLogger.info).toHaveBeenCalledWith('Cleaned up old notifications', { deletedTotal: 2 });
      }
    });
  });
});
