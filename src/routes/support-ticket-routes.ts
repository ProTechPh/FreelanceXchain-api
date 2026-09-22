import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import {
  validate,
  submitSupportTicketSchema,
  updateSupportTicketStatusSchema,
} from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId, sendServiceError } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  submitSupportTicket,
  listMySupportTickets,
  listSupportTickets,
  updateSupportTicketStatus,
} from '../services/support-ticket-service.js';
import type { SupportTicketCategory, SupportTicketStatus } from '../models/support-ticket.js';

const router = Router();

const STATUS_MAP = {
  INVALID_CATEGORY: 400,
  INVALID_SUBJECT: 400,
  INVALID_DESCRIPTION: 400,
  INVALID_STATUS: 400,
  INVALID_TRANSITION: 400,
  RESOLUTION_REQUIRED: 400,
  RESOLUTION_TOO_LONG: 400,
  TICKET_NOT_FOUND: 404,
  TOO_MANY_OPEN_TICKETS: 429,
  SUBMIT_FAILED: 500,
  LIST_FAILED: 500,
  UPDATE_FAILED: 500,
} as const;

/**
 * POST /api/support-tickets
 *
 * Open to any authenticated participant. Deliberately not gated on
 * `requireVerifiedKyc`: someone stuck partway through verification is exactly
 * the person most likely to need support, and that gate would lock them out of
 * the only channel for saying so.
 */
router.post(
  '/',
  authMiddleware,
  apiRateLimiter,
  validate(submitSupportTicketSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = getRequestId(req);
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
      return;
    }

    const { subject, description, category } = req.body;

    const result = await submitSupportTicket({
      userId,
      userRole: userRole ?? 'unknown',
      subject,
      description,
      category: category as SupportTicketCategory,
    });

    if (!result.success) {
      sendServiceError(res, result, requestId, STATUS_MAP);
      return;
    }

    res.status(201).json(result.data);
  })
);

/** GET /api/support-tickets/me — the caller's own tickets and their replies. */
router.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = getRequestId(req);
    const userId = req.user?.userId;

    if (!userId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
      return;
    }

    const result = await listMySupportTickets(userId);

    if (!result.success) {
      sendServiceError(res, result, requestId, STATUS_MAP);
      return;
    }

    res.status(200).json(result.data);
  })
);

/**
 * GET /api/support-tickets/admin — the moderation queue.
 *
 * Returns the filtered rows *and* the per-status counts together: the page
 * needs both to render, and splitting them cost a second round trip for data
 * the first one had already read.
 */
router.get(
  '/admin',
  authMiddleware,
  requireRole('admin'),
  apiRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = getRequestId(req);
    const status = req.query['status'] as string | undefined;
    const category = req.query['category'] as string | undefined;

    const result = await listSupportTickets({
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
    });

    if (!result.success) {
      sendServiceError(res, result, requestId, STATUS_MAP);
      return;
    }

    res.status(200).json(result.data);
  })
);

/** PATCH /api/support-tickets/admin/:id/status — pick up, resolve or close a ticket. */
router.patch(
  '/admin/:id/status',
  authMiddleware,
  requireRole('admin'),
  apiRateLimiter,
  validate(updateSupportTicketStatusSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = getRequestId(req);
    const adminId = req.user?.userId;
    // The route only matches with a non-empty :id segment — an empty one 404s
    // before reaching here — so this is present by construction.
    const ticketId = req.params['id'] as string;

    if (!adminId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
      return;
    }

    const { status, resolutionNote } = req.body;

    const result = await updateSupportTicketStatus({
      ticketId,
      adminId,
      status: status as SupportTicketStatus,
      resolutionNote,
    });

    if (!result.success) {
      sendServiceError(res, result, requestId, STATUS_MAP);
      return;
    }

    res.status(200).json(result.data);
  })
);

export default router;
