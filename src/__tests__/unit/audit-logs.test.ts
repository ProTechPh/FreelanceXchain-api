import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetUserAuditLogs = jest.fn() as any;
const mockGetResourceAuditLogs = jest.fn() as any;
const mockGetAuditLogsByAction = jest.fn() as any;
const mockGetAuditLogsByDateRange = jest.fn() as any;
const mockGetFailedActions = jest.fn() as any;
const mockGetAuditLogById = jest.fn() as any;
const mockGenerateUserAuditReport = jest.fn() as any;
const mockGenerateSystemAuditReport = jest.fn() as any;

jest.unstable_mockModule(resolveModule('src/services/audit-log-service.ts'), () => ({
  AuditLogService: jest.fn().mockImplementation(() => ({
    getUserAuditLogs: mockGetUserAuditLogs,
    getResourceAuditLogs: mockGetResourceAuditLogs,
    getAuditLogsByAction: mockGetAuditLogsByAction,
    getAuditLogsByDateRange: mockGetAuditLogsByDateRange,
    getFailedActions: mockGetFailedActions,
    getAuditLogById: mockGetAuditLogById,
    generateUserAuditReport: mockGenerateUserAuditReport,
    generateSystemAuditReport: mockGenerateSystemAuditReport,
  })),
}));

const mockAuthMiddleware = jest.fn((req: any, _res: any, next: any) => {
  req.user = { id: 'admin-1', userId: 'admin-1', email: 'admin@test.com', role: 'admin' };
  next();
});

const mockRequireRole = jest.fn(() => (req: any, _res: any, next: any) => next());

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: mockAuthMiddleware,
  requireRole: mockRequireRole,
}));

const auditLogsRouter = (await import('../../routes/audit-logs.js')).default;

const sampleLogs = [
  { id: 'log-1', user_id: 'user-1', action: 'login', status: 'success', created_at: '2025-01-01' },
];

describe('Audit Logs Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { id: 'admin-1', userId: 'admin-1', email: 'admin@test.com', role: 'admin' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/audit-logs', auditLogsRouter);
  });

  describe('GET /me', () => {
    it('should return current user audit logs', async () => {
      mockGetUserAuditLogs.mockResolvedValue(sampleLogs);

      const res = await request(app).get('/api/audit-logs/me');

      expect(res.status).toBe(200);
      expect(res.body.logs).toEqual(sampleLogs);
    });

    it('should pass custom limit from query', async () => {
      mockGetUserAuditLogs.mockResolvedValue([]);

      await request(app).get('/api/audit-logs/me?limit=50');

      expect(mockGetUserAuditLogs).toHaveBeenCalledWith('admin-1', 50);
    });

    it('should default limit to 100', async () => {
      mockGetUserAuditLogs.mockResolvedValue([]);

      await request(app).get('/api/audit-logs/me');

      expect(mockGetUserAuditLogs).toHaveBeenCalledWith('admin-1', 100);
    });

    it('should return 401 when user not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get('/api/audit-logs/me');

      expect(res.status).toBe(401);
    });

    it('should handle service errors', async () => {
      mockGetUserAuditLogs.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/audit-logs/me');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });

  describe('GET /user/:userId', () => {
    it('should return audit logs for a specific user', async () => {
      mockGetUserAuditLogs.mockResolvedValue(sampleLogs);

      const res = await request(app).get('/api/audit-logs/user/user-1');

      expect(res.status).toBe(200);
      expect(res.body.logs).toEqual(sampleLogs);
      expect(mockGetUserAuditLogs).toHaveBeenCalledWith('user-1', 100);
    });

    it('should pass limit query parameter', async () => {
      mockGetUserAuditLogs.mockResolvedValue([]);

      await request(app).get('/api/audit-logs/user/user-1?limit=10');

      expect(mockGetUserAuditLogs).toHaveBeenCalledWith('user-1', 10);
    });

    it('should handle errors', async () => {
      mockGetUserAuditLogs.mockRejectedValue(new Error('Service error'));

      const res = await request(app).get('/api/audit-logs/user/user-1');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /resource/:resourceType/:resourceId', () => {
    it('should return audit logs for a resource', async () => {
      mockGetResourceAuditLogs.mockResolvedValue(sampleLogs);

      const res = await request(app).get('/api/audit-logs/resource/project/proj-1');

      expect(res.status).toBe(200);
      expect(res.body.logs).toEqual(sampleLogs);
      expect(mockGetResourceAuditLogs).toHaveBeenCalledWith('project', 'proj-1');
    });

    it('should handle errors', async () => {
      mockGetResourceAuditLogs.mockRejectedValue(new Error('Error'));

      const res = await request(app).get('/api/audit-logs/resource/project/proj-1');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /action/:action', () => {
    it('should return audit logs by action', async () => {
      mockGetAuditLogsByAction.mockResolvedValue(sampleLogs);

      const res = await request(app).get('/api/audit-logs/action/login');

      expect(res.status).toBe(200);
      expect(res.body.logs).toEqual(sampleLogs);
      expect(mockGetAuditLogsByAction).toHaveBeenCalledWith('login', 100);
    });

    it('should pass limit query parameter', async () => {
      mockGetAuditLogsByAction.mockResolvedValue([]);

      await request(app).get('/api/audit-logs/action/login?limit=25');

      expect(mockGetAuditLogsByAction).toHaveBeenCalledWith('login', 25);
    });

    it('should handle errors', async () => {
      mockGetAuditLogsByAction.mockRejectedValue(new Error('Error'));

      const res = await request(app).get('/api/audit-logs/action/login');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /failed', () => {
    it('should return failed action logs', async () => {
      mockGetFailedActions.mockResolvedValue(sampleLogs);

      const res = await request(app).get('/api/audit-logs/failed');

      expect(res.status).toBe(200);
      expect(res.body.logs).toEqual(sampleLogs);
    });

    it('should pass limit query parameter', async () => {
      mockGetFailedActions.mockResolvedValue([]);

      await request(app).get('/api/audit-logs/failed?limit=10');

      expect(mockGetFailedActions).toHaveBeenCalledWith(10);
    });

    it('should handle errors', async () => {
      mockGetFailedActions.mockRejectedValue(new Error('Error'));

      const res = await request(app).get('/api/audit-logs/failed');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /range', () => {
    it('should return logs by date range', async () => {
      mockGetAuditLogsByDateRange.mockResolvedValue(sampleLogs);

      const res = await request(app).get('/api/audit-logs/range?startDate=2025-01-01&endDate=2025-01-31');

      expect(res.status).toBe(200);
      expect(res.body.logs).toEqual(sampleLogs);
    });

    it('should return 400 for invalid start date', async () => {
      const res = await request(app).get('/api/audit-logs/range?startDate=invalid&endDate=2025-01-31');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid date format');
    });

    it('should return 400 for invalid end date', async () => {
      const res = await request(app).get('/api/audit-logs/range?startDate=2025-01-01&endDate=invalid');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid date format');
    });

    it('should handle service errors', async () => {
      mockGetAuditLogsByDateRange.mockRejectedValue(new Error('Error'));

      const res = await request(app).get('/api/audit-logs/range?startDate=2025-01-01&endDate=2025-01-31');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /report/user/:userId', () => {
    it('should generate user audit report', async () => {
      const report = { totalActions: 5, successfulActions: 4, failedActions: 1, actionBreakdown: { login: 5 }, logs: [] };
      mockGenerateUserAuditReport.mockResolvedValue(report);

      const res = await request(app).get('/api/audit-logs/report/user/user-1?startDate=2025-01-01&endDate=2025-01-31');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(report);
    });

    it('should return 400 for invalid dates', async () => {
      const res = await request(app).get('/api/audit-logs/report/user/user-1?startDate=invalid&endDate=2025-01-31');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid date format');
    });

    it('should handle service errors', async () => {
      mockGenerateUserAuditReport.mockRejectedValue(new Error('Error'));

      const res = await request(app).get('/api/audit-logs/report/user/user-1?startDate=2025-01-01&endDate=2025-01-31');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /report/system', () => {
    it('should generate system audit report', async () => {
      const report = { totalActions: 10, successfulActions: 8, failedActions: 2, actionBreakdown: {}, resourceBreakdown: {}, topUsers: [] };
      mockGenerateSystemAuditReport.mockResolvedValue(report);

      const res = await request(app).get('/api/audit-logs/report/system?startDate=2025-01-01&endDate=2025-01-31');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(report);
    });

    it('should return 400 for invalid dates', async () => {
      const res = await request(app).get('/api/audit-logs/report/system?startDate=bad&endDate=2025-01-31');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid date format');
    });

    it('should handle service errors', async () => {
      mockGenerateSystemAuditReport.mockRejectedValue(new Error('Error'));

      const res = await request(app).get('/api/audit-logs/report/system?startDate=2025-01-01&endDate=2025-01-31');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /:id', () => {
    it('should return audit log by id', async () => {
      const log = { id: 'log-1', action: 'login' };
      mockGetAuditLogById.mockResolvedValue(log);

      const res = await request(app).get('/api/audit-logs/log-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(log);
    });

    it('should return 404 when audit log not found', async () => {
      mockGetAuditLogById.mockResolvedValue(null);

      const res = await request(app).get('/api/audit-logs/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Audit log not found');
    });

    it('should handle service errors', async () => {
      mockGetAuditLogById.mockRejectedValue(new Error('Error'));

      const res = await request(app).get('/api/audit-logs/log-1');

      expect(res.status).toBe(500);
    });
  });
});