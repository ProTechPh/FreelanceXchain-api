import { Router, Request, Response } from 'express';
import { AuditLogService } from '../services/audit-log-service.js';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';

const router = Router();
const auditLogService = new AuditLogService();

// Get current user's audit logs
router.get('/me', authMiddleware, apiRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    
    const limit = parseInt(req.query.limit as string) || 100;

    const logs = await auditLogService.getUserAuditLogs(userId, limit);
    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get audit logs for a specific user (admin only)
router.get('/user/:userId', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.userId!; // Route param is always defined
    const limit = parseInt(req.query.limit as string) || 100;

    const logs = await auditLogService.getUserAuditLogs(userId, limit);
    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get audit logs for a specific resource (admin only)
router.get('/resource/:resourceType/:resourceId', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const resourceType = req.params.resourceType!; // Route param is always defined
    const resourceId = req.params.resourceId!; // Route param is always defined

    const logs = await auditLogService.getResourceAuditLogs(resourceType, resourceId);
    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get audit logs by action (admin only)
router.get('/action/:action', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const action = req.params.action!; // Route param is always defined
    const limit = parseInt(req.query.limit as string) || 100;

    const logs = await auditLogService.getAuditLogsByAction(action, limit);
    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get failed actions (admin only)
router.get('/failed', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;

    const logs = await auditLogService.getFailedActions(limit);
    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get audit logs by date range (admin only)
router.get('/range', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      res.status(400).json({ error: 'Invalid date format' });
      return;
    }

    const logs = await auditLogService.getAuditLogsByDateRange(startDate, endDate);
    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Generate user audit report (admin only)
router.get('/report/user/:userId', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.userId!; // Route param is always defined
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      res.status(400).json({ error: 'Invalid date format' });
      return;
    }

    const report = await auditLogService.generateUserAuditReport(userId, startDate, endDate);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Generate system audit report (admin only)
router.get('/report/system', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      res.status(400).json({ error: 'Invalid date format' });
      return;
    }

    const report = await auditLogService.generateSystemAuditReport(startDate, endDate);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific audit log by ID (admin only)
router.get('/:id', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!; // Route param is always defined

    const log = await auditLogService.getAuditLogById(id);
    if (!log) {
      res.status(404).json({ error: 'Audit log not found' });
      return;
    }

    res.json(log);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
