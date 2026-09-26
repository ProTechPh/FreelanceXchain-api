import { Router, Request, Response } from 'express';
import { AuditLogService } from '../services/audit-log-service.js';
import type { AuditLogStatus } from '../repositories/audit-log-repository.js';
import { authMiddleware, requirePermission } from '../middleware/auth-middleware.js';
import { getRequestId, sendErrorResponse, sendSuccessResponse } from '../utils/response-helpers.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { logger } from '../config/logger.js';

const router = Router();
router.use(apiRateLimiter);
const auditLogService = new AuditLogService();

function sendServerError(res: Response, error: unknown): void {
  logger.error('Audit log server error', error);
  sendErrorResponse(
    res,
    500,
    'INTERNAL_ERROR',
    'Internal server error',
    { requestId: getRequestId(res.req) }
  );
}

// Get current user's audit logs
router.get('/me', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      sendErrorResponse(res, 401, 'UNAUTHORIZED', 'User not authenticated', { requestId: getRequestId(req) });
      return;
    }
    
    const limit = parseInt(req.query.limit as string) || 100;

    const logs = await auditLogService.getUserAuditLogs(userId, limit);
    sendSuccessResponse(res, 200, { logs }, getRequestId(req));
  } catch (error) {
    sendServerError(res, error);
  }
});

// Get audit logs for a specific user (admin only)
router.get('/user/:userId', authMiddleware, requirePermission('audit:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.userId!; // Route param is always defined
    const limit = parseInt(req.query.limit as string) || 100;

    const logs = await auditLogService.getUserAuditLogs(userId, limit);
    sendSuccessResponse(res, 200, { logs }, getRequestId(req));
  } catch (error) {
    sendServerError(res, error);
  }
});

// Get audit logs for a specific resource (admin only)
router.get('/resource/:resourceType/:resourceId', authMiddleware, requirePermission('audit:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const resourceType = req.params.resourceType!; // Route param is always defined
    const resourceId = req.params.resourceId!; // Route param is always defined

    const logs = await auditLogService.getResourceAuditLogs(resourceType, resourceId);
    sendSuccessResponse(res, 200, { logs }, getRequestId(req));
  } catch (error) {
    sendServerError(res, error);
  }
});

// Get audit logs by action (admin only)
router.get('/action/:action', authMiddleware, requirePermission('audit:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const action = req.params.action!; // Route param is always defined
    const limit = parseInt(req.query.limit as string) || 100;

    const logs = await auditLogService.getAuditLogsByAction(action, limit);
    sendSuccessResponse(res, 200, { logs }, getRequestId(req));
  } catch (error) {
    sendServerError(res, error);
  }
});

// Get failed actions (admin only)
router.get('/failed', authMiddleware, requirePermission('audit:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;

    const logs = await auditLogService.getFailedActions(limit);
    sendSuccessResponse(res, 200, { logs }, getRequestId(req));
  } catch (error) {
    sendServerError(res, error);
  }
});

// Get audit logs by date range (admin only)
router.get('/range', authMiddleware, requirePermission('audit:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid date format', { requestId: getRequestId(req) });
      return;
    }

    const logs = await auditLogService.getAuditLogsByDateRange(startDate, endDate);
    sendSuccessResponse(res, 200, { logs }, getRequestId(req));
  } catch (error) {
    sendServerError(res, error);
  }
});

// Combined filtered search with pagination (admin only)
router.get('/search', authMiddleware, requirePermission('audit:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { actor, user, action, resourceType, resourceId, status, startDate, endDate, limit, cursor } = req.query;

    const filters: {
      actorId?: string;
      userId?: string;
      action?: string;
      resourceType?: string;
      resourceId?: string;
      status?: AuditLogStatus;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      cursor?: string;
    } = {};

    if (typeof actor === 'string' && actor) filters.actorId = actor;
    if (typeof user === 'string' && user) filters.userId = user;
    if (typeof action === 'string' && action) filters.action = action;
    if (typeof resourceType === 'string' && resourceType) filters.resourceType = resourceType;
    if (typeof resourceId === 'string' && resourceId) filters.resourceId = resourceId;
    if (typeof status === 'string' && status) {
      if (status !== 'success' && status !== 'failure' && status !== 'pending') {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid status. Must be one of: success, failure, pending', { requestId: getRequestId(req) });
        return;
      }
      filters.status = status;
    }

    if (typeof startDate === 'string' && startDate) {
      const parsed = new Date(startDate);
      if (isNaN(parsed.getTime())) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid startDate format', { requestId: getRequestId(req) });
        return;
      }
      filters.startDate = parsed;
    }
    if (typeof endDate === 'string' && endDate) {
      const parsed = new Date(endDate);
      if (isNaN(parsed.getTime())) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid endDate format', { requestId: getRequestId(req) });
        return;
      }
      filters.endDate = parsed;
    }

    const parsedLimit = parseInt(limit as string, 10);
    if (typeof limit === 'string' && !isNaN(parsedLimit) && parsedLimit > 0) filters.limit = parsedLimit;
    if (typeof cursor === 'string' && cursor) filters.cursor = cursor;

    const result = await auditLogService.searchAuditLogs(filters);
    sendSuccessResponse(res, 200, { ...result }, getRequestId(req));
  } catch (error) {
    sendServerError(res, error);
  }
});

// Per-admin, per-day activity summary (admin only)
router.get('/summary/admin-activity', authMiddleware, requirePermission('audit:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid date format', { requestId: getRequestId(req) });
      return;
    }

    const summary = await auditLogService.getAdminActivitySummary(startDate, endDate);
    sendSuccessResponse(res, 200, { ...summary }, getRequestId(req));
  } catch (error) {
    sendServerError(res, error);
  }
});

// Generate user audit report (admin only)
router.get('/report/user/:userId', authMiddleware, requirePermission('audit:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.userId!; // Route param is always defined
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid date format', { requestId: getRequestId(req) });
      return;
    }

    const report = await auditLogService.generateUserAuditReport(userId, startDate, endDate);
    res.json(report);
  } catch (error) {
    sendServerError(res, error);
  }
});

// Generate system audit report (admin only)
router.get('/report/system', authMiddleware, requirePermission('audit:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid date format', { requestId: getRequestId(req) });
      return;
    }

    const report = await auditLogService.generateSystemAuditReport(startDate, endDate);
    res.json(report);
  } catch (error) {
    sendServerError(res, error);
  }
});

// Get specific audit log by ID (admin only)
router.get('/:id', authMiddleware, requirePermission('audit:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!; // Route param is always defined

    const log = await auditLogService.getAuditLogById(id);
    if (!log) {
      sendErrorResponse(res, 404, 'NOT_FOUND', 'Audit log not found', { requestId: getRequestId(req) });
      return;
    }

    res.json(log);
  } catch (error) {
    sendServerError(res, error);
  }
});

export default router;
