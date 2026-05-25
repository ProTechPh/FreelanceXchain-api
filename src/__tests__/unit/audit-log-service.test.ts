import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetByUserId = jest.fn() as any;
const mockGetByResource = jest.fn() as any;
const mockGetByAction = jest.fn() as any;
const mockGetByDateRange = jest.fn() as any;
const mockGetFailedActions = jest.fn() as any;
const mockGetById = jest.fn() as any;

jest.unstable_mockModule(resolveModule('src/repositories/audit-log-repository.ts'), () => ({
  AuditLogRepository: jest.fn().mockImplementation(() => ({
    getByUserId: mockGetByUserId,
    getByResource: mockGetByResource,
    getByAction: mockGetByAction,
    getByDateRange: mockGetByDateRange,
    getFailedActions: mockGetFailedActions,
    getById: mockGetById,
  })),
  AuditLogEntry: {},
  CreateAuditLogEntry: {},
  AuditLogStatus: {},
}));

const { AuditLogService } = await import('../../services/audit-log-service.js');

const sampleLog = (overrides: Record<string, any> = {}) => ({
  id: 'log-1',
  user_id: 'user-1',
  actor_id: null,
  action: 'login',
  resource_type: 'auth',
  resource_id: null,
  payload: {},
  ip_address: null,
  user_agent: null,
  status: 'success',
  error_message: null,
  created_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

describe('AuditLogService', () => {
  let service: InstanceType<typeof AuditLogService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuditLogService();
  });

  describe('getUserAuditLogs', () => {
    it('should return logs for a user', async () => {
      const logs = [sampleLog(), sampleLog({ id: 'log-2' })];
      mockGetByUserId.mockResolvedValue(logs);

      const result = await service.getUserAuditLogs('user-1');

      expect(result).toEqual(logs);
      expect(mockGetByUserId).toHaveBeenCalledWith('user-1', 100);
    });

    it('should pass custom limit', async () => {
      mockGetByUserId.mockResolvedValue([]);
      await service.getUserAuditLogs('user-1', 50);
      expect(mockGetByUserId).toHaveBeenCalledWith('user-1', 50);
    });

    it('should return empty array when no logs', async () => {
      mockGetByUserId.mockResolvedValue([]);
      const result = await service.getUserAuditLogs('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('getResourceAuditLogs', () => {
    it('should return logs for a resource', async () => {
      const logs = [sampleLog({ resource_type: 'project', resource_id: 'res-1' })];
      mockGetByResource.mockResolvedValue(logs);

      const result = await service.getResourceAuditLogs('project', 'res-1');

      expect(result).toEqual(logs);
      expect(mockGetByResource).toHaveBeenCalledWith('project', 'res-1');
    });
  });

  describe('getAuditLogsByAction', () => {
    it('should return logs for an action', async () => {
      const logs = [sampleLog({ action: 'login' })];
      mockGetByAction.mockResolvedValue(logs);

      const result = await service.getAuditLogsByAction('login');

      expect(result).toEqual(logs);
      expect(mockGetByAction).toHaveBeenCalledWith('login', 100);
    });

    it('should pass custom limit', async () => {
      mockGetByAction.mockResolvedValue([]);
      await service.getAuditLogsByAction('delete', 10);
      expect(mockGetByAction).toHaveBeenCalledWith('delete', 10);
    });
  });

  describe('getAuditLogsByDateRange', () => {
    it('should return logs in date range', async () => {
      const start = new Date('2025-01-01');
      const end = new Date('2025-01-31');
      const logs = [sampleLog()];
      mockGetByDateRange.mockResolvedValue(logs);

      const result = await service.getAuditLogsByDateRange(start, end);

      expect(result).toEqual(logs);
      expect(mockGetByDateRange).toHaveBeenCalledWith(start, end);
    });
  });

  describe('getFailedActions', () => {
    it('should return failed action logs', async () => {
      const logs = [sampleLog({ status: 'failure' })];
      mockGetFailedActions.mockResolvedValue(logs);

      const result = await service.getFailedActions();

      expect(result).toEqual(logs);
      expect(mockGetFailedActions).toHaveBeenCalledWith(100);
    });

    it('should pass custom limit', async () => {
      mockGetFailedActions.mockResolvedValue([]);
      await service.getFailedActions(25);
      expect(mockGetFailedActions).toHaveBeenCalledWith(25);
    });
  });

  describe('getAuditLogById', () => {
    it('should return a log by id', async () => {
      const log = sampleLog();
      mockGetById.mockResolvedValue(log);

      const result = await service.getAuditLogById('log-1');

      expect(result).toEqual(log);
      expect(mockGetById).toHaveBeenCalledWith('log-1');
    });

    it('should return null when not found', async () => {
      mockGetById.mockResolvedValue(null);
      const result = await service.getAuditLogById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('generateUserAuditReport', () => {
    it('should generate report with all success logs', async () => {
      const logs = [
        sampleLog({ user_id: 'user-1', action: 'login', status: 'success' }),
        sampleLog({ id: 'log-2', user_id: 'user-1', action: 'login', status: 'success' }),
        sampleLog({ id: 'log-3', user_id: 'user-2', action: 'logout', status: 'success' }),
      ];
      mockGetByDateRange.mockResolvedValue(logs);

      const report = await service.generateUserAuditReport('user-1', new Date('2025-01-01'), new Date('2025-01-31'));

      expect(report.totalActions).toBe(2);
      expect(report.successfulActions).toBe(2);
      expect(report.failedActions).toBe(0);
      expect(report.actionBreakdown).toEqual({ login: 2 });
      expect(report.logs.length).toBe(2);
    });

    it('should count failures', async () => {
      const logs = [
        sampleLog({ user_id: 'user-1', action: 'login', status: 'success' }),
        sampleLog({ id: 'log-2', user_id: 'user-1', action: 'delete', status: 'failure' }),
      ];
      mockGetByDateRange.mockResolvedValue(logs);

      const report = await service.generateUserAuditReport('user-1', new Date('2025-01-01'), new Date('2025-01-31'));

      expect(report.successfulActions).toBe(1);
      expect(report.failedActions).toBe(1);
      expect(report.actionBreakdown).toEqual({ login: 1, delete: 1 });
    });

    it('should handle logs with pending status', async () => {
      const logs = [
        sampleLog({ user_id: 'user-1', action: 'create', status: 'pending' }),
      ];
      mockGetByDateRange.mockResolvedValue(logs);

      const report = await service.generateUserAuditReport('user-1', new Date('2025-01-01'), new Date('2025-01-31'));

      expect(report.totalActions).toBe(1);
      expect(report.successfulActions).toBe(0);
      expect(report.failedActions).toBe(0);
    });

    it('should return empty report for no matching user logs', async () => {
      mockGetByDateRange.mockResolvedValue([
        sampleLog({ user_id: 'other-user' }),
      ]);

      const report = await service.generateUserAuditReport('user-1', new Date('2025-01-01'), new Date('2025-01-31'));

      expect(report.totalActions).toBe(0);
      expect(report.successfulActions).toBe(0);
      expect(report.failedActions).toBe(0);
      expect(report.actionBreakdown).toEqual({});
      expect(report.logs).toEqual([]);
    });
  });

  describe('generateSystemAuditReport', () => {
    it('should generate system-wide report', async () => {
      const logs = [
        sampleLog({ user_id: 'user-1', action: 'login', status: 'success', resource_type: 'auth' }),
        sampleLog({ id: 'log-2', user_id: 'user-2', action: 'create_project', status: 'success', resource_type: 'project' }),
        sampleLog({ id: 'log-3', user_id: 'user-1', action: 'delete', status: 'failure', resource_type: 'project' }),
      ];
      mockGetByDateRange.mockResolvedValue(logs);

      const report = await service.generateSystemAuditReport(new Date('2025-01-01'), new Date('2025-01-31'));

      expect(report.totalActions).toBe(3);
      expect(report.successfulActions).toBe(2);
      expect(report.failedActions).toBe(1);
      expect(report.actionBreakdown).toEqual({ login: 1, create_project: 1, delete: 1 });
      expect(report.resourceBreakdown).toEqual({ auth: 1, project: 2 });
    });

    it('should track top users and sort by count', async () => {
      const logs = [
        ...Array.from({ length: 5 }, (_, i) => sampleLog({ id: `log-a${i}`, user_id: 'user-1' })),
        ...Array.from({ length: 3 }, (_, i) => sampleLog({ id: `log-b${i}`, user_id: 'user-2' })),
        ...Array.from({ length: 1 }, (_, i) => sampleLog({ id: `log-c${i}`, user_id: 'user-3' })),
      ];
      mockGetByDateRange.mockResolvedValue(logs);

      const report = await service.generateSystemAuditReport(new Date('2025-01-01'), new Date('2025-01-31'));

      expect(report.topUsers).toEqual([
        { userId: 'user-1', count: 5 },
        { userId: 'user-2', count: 3 },
        { userId: 'user-3', count: 1 },
      ]);
    });

    it('should limit top users to 10', async () => {
      const logs = Array.from({ length: 15 }, (_, i) => sampleLog({ id: `log-${i}`, user_id: `user-${i}` }));
      mockGetByDateRange.mockResolvedValue(logs);

      const report = await service.generateSystemAuditReport(new Date('2025-01-01'), new Date('2025-01-31'));

      expect(report.topUsers.length).toBe(10);
    });

    it('should skip logs with null user_id for top users', async () => {
      const logs = [
        sampleLog({ user_id: 'user-1' }),
        sampleLog({ id: 'log-2', user_id: null }),
      ];
      mockGetByDateRange.mockResolvedValue(logs);

      const report = await service.generateSystemAuditReport(new Date('2025-01-01'), new Date('2025-01-31'));

      expect(report.topUsers).toEqual([{ userId: 'user-1', count: 1 }]);
    });

    it('should handle pending status logs in system report', async () => {
      const logs = [
        sampleLog({ status: 'pending' }),
      ];
      mockGetByDateRange.mockResolvedValue(logs);

      const report = await service.generateSystemAuditReport(new Date('2025-01-01'), new Date('2025-01-31'));

      expect(report.totalActions).toBe(1);
      expect(report.successfulActions).toBe(0);
      expect(report.failedActions).toBe(0);
    });

    it('should return empty report when no logs', async () => {
      mockGetByDateRange.mockResolvedValue([]);

      const report = await service.generateSystemAuditReport(new Date('2025-01-01'), new Date('2025-01-31'));

      expect(report.totalActions).toBe(0);
      expect(report.successfulActions).toBe(0);
      expect(report.failedActions).toBe(0);
      expect(report.actionBreakdown).toEqual({});
      expect(report.resourceBreakdown).toEqual({});
      expect(report.topUsers).toEqual([]);
    });
  });
});