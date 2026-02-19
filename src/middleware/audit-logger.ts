import { Request, Response, NextFunction } from 'express';
import { AuditLogRepository } from '../repositories/audit-log-repository.js';

// Note: Request.user type is defined in auth-middleware.ts

const auditLogRepo = new AuditLogRepository();

// Actions that should be audited
const AUDITABLE_ACTIONS = {
  // Authentication
  LOGIN: 'user_login',
  LOGOUT: 'user_logout',
  SIGNUP: 'user_signup',
  PASSWORD_CHANGE: 'user_password_change',
  
  // User management
  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  USER_DELETED: 'user_deleted',
  
  // Contract actions
  CONTRACT_CREATED: 'contract_created',
  CONTRACT_SIGNED: 'contract_signed',
  CONTRACT_UPDATED: 'contract_updated',
  CONTRACT_CANCELLED: 'contract_cancelled',
  
  // Payment actions
  PAYMENT_INITIATED: 'payment_initiated',
  PAYMENT_COMPLETED: 'payment_completed',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_REFUNDED: 'payment_refunded',
  
  // Dispute actions
  DISPUTE_CREATED: 'dispute_created',
  DISPUTE_RESOLVED: 'dispute_resolved',
  DISPUTE_ESCALATED: 'dispute_escalated',
  
  // KYC actions
  KYC_SUBMITTED: 'kyc_submitted',
  KYC_APPROVED: 'kyc_approved',
  KYC_REJECTED: 'kyc_rejected',
  
  // Project actions
  PROJECT_CREATED: 'project_created',
  PROJECT_UPDATED: 'project_updated',
  PROJECT_DELETED: 'project_deleted',
  
  // Proposal actions
  PROPOSAL_SUBMITTED: 'proposal_submitted',
  PROPOSAL_ACCEPTED: 'proposal_accepted',
  PROPOSAL_REJECTED: 'proposal_rejected',
} as const;

export { AUDITABLE_ACTIONS };

interface AuditLogOptions {
  action: string;
  resourceType: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  status?: 'success' | 'failure' | 'pending';
  errorMessage?: string | null;
}

// Helper function to log audit events
export async function logAuditEvent(
  req: Request,
  options: AuditLogOptions
): Promise<void> {
  try {
    const userId = req.user?.userId || null;
    const actorId = req.user?.email || null;
    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.get('user-agent') || null;

    await auditLogRepo.logAction({
      user_id: userId,
      actor_id: actorId,
      action: options.action,
      resource_type: options.resourceType,
      resource_id: options.resourceId || null,
      payload: options.payload || {},
      ip_address: ipAddress,
      user_agent: userAgent,
      status: options.status || 'success',
      error_message: options.errorMessage || null,
    });
  } catch (error) {
    // Don't fail the request if audit logging fails
    console.error('Failed to log audit event:', error);
  }
}

// Middleware to automatically audit certain routes
export function auditMiddleware(action: string, resourceType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original send function
    const originalSend = res.send;

    // Override send to capture response
    res.send = function (data: any): Response {
      // Restore original send
      res.send = originalSend;

      // Log the audit event
      const resourceId = req.params.id || req.body?.id || null;
      const status = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failure';
      
      logAuditEvent(req, {
        action,
        resourceType,
        resourceId,
        payload: {
          method: req.method,
          path: req.path,
          body: req.body,
          params: req.params,
          query: req.query,
        },
        status,
        errorMessage: status === 'failure' ? 'Request failed' : null,
      }).catch(err => console.error('Audit logging error:', err));

      // Send the response
      return originalSend.call(this, data);
    };

    next();
  };
}

// Middleware to audit all requests (optional - can be verbose)
export function auditAllRequests() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Store original send function
    const originalSend = res.send;

    // Override send to capture response
    res.send = function (data: any): Response {
      // Restore original send
      res.send = originalSend;

      const duration = Date.now() - startTime;
      const status = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failure';

      // Log the audit event
      logAuditEvent(req, {
        action: `${req.method.toLowerCase()}_${req.path.replace(/\//g, '_')}`,
        resourceType: 'http_request',
        payload: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
        },
        status,
      }).catch(err => console.error('Audit logging error:', err));

      // Send the response
      return originalSend.call(this, data);
    };

    next();
  };
}
