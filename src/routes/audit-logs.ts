import { Router, Request, Response } from 'express';
import { AuditLogService } from '../services/audit-log-service.js';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { getRequestId, sendErrorResponse, sendSuccessResponse } from '../utils/response-helpers.js';

const router = Router();
const auditLogService = new AuditLogService();

function sendServerError(res: Response, error: unknown): void {
  sendErrorResponse(
    res,
    500,
    'INTERNAL_ERROR',
    error instanceof Error ? error.message : 'Internal server error',
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
router.get('/user/:userId', authMiddleware, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
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
router.get('/resource/:resourceType/:resourceId', authMiddleware, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
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
router.get('/action/:action', authMiddleware, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
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
router.get('/failed', authMiddleware, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;

    const logs = await auditLogService.getFailedActions(limit);
    sendSuccessResponse(res, 200, { logs }, getRequestId(req));
  } catch (error) {
    sendServerError(res, error);
  }
});

// Get audit logs by date range (admin only)
router.get('/range', authMiddleware, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
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

// Generate user audit report (admin only)
router.get('/report/user/:userId', authMiddleware, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
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
router.get('/report/system', authMiddleware, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
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
router.get('/:id', authMiddleware, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
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
