import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { apiRateLimiter, webhookRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import { getEmailWebhookSecret } from '../config/env.js';
import {
  processInboundEmail,
  verifyWebhookSignature,
  recordInboundDeliveryFailure,
  getRecentDeliveryFailures,
  listEmails,
  getEmail,
  updateEmail,
  deleteEmail,
  sendNewEmail,
  replyToEmail,
  getUnreadCount,
  getSenderProfiles,
  type InboundEmailPayload,
} from '../services/email-inbox-service.js';
import type { EmailFolder } from '../repositories/email-inbox-repository.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.post('/webhook', webhookRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const signature = req.headers['x-webhook-signature'] as string;
  const secret = getEmailWebhookSecret();

  if (!secret) {
    sendErrorResponse(res, 500, 'CONFIG_ERROR', 'Webhook secret not configured', { requestId });
    return;
  }

  if (!signature) {
    sendErrorResponse(res, 401, 'AUTH_MISSING_SIGNATURE', 'Missing webhook signature', { requestId });
    return;
  }

  // Verify over the raw request bytes when available (captured by the
  // express.json verify hook for webhook paths), falling back to a
  // re-serialization. Re-serializing parsed JSON is not guaranteed to be
  // byte-identical to what the sender signed (key order, escaping, whitespace).
  const rawBody = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body ?? {});
  try {
    const valid = verifyWebhookSignature(rawBody, signature, secret);
    if (!valid) {
      sendErrorResponse(res, 401, 'AUTH_INVALID_SIGNATURE', 'Invalid webhook signature', { requestId });
      return;
    }
  } catch {
    sendErrorResponse(res, 401, 'AUTH_INVALID_SIGNATURE', 'Invalid webhook signature', { requestId });
    return;
  }

  const payload = req.body as InboundEmailPayload;
  const result = await processInboundEmail(payload);

  if (!result.success) {
    // Permanent rejections can never succeed on retry — record them so ops can
    // see undelivered mail instead of relying on Cloudflare's bounce alone.
    // Best-effort: recording never blocks the response.
    if (result.error.code === 'INVALID_RECIPIENT' || result.error.code === 'USER_NOT_FOUND') {
      await recordInboundDeliveryFailure(payload, result.error.code, result.error.message);
    }

    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId, details: result.error.details });
    return;
  }

  res.status(200).json(result.data);
}));

router.get('/', authMiddleware, requireRole('admin'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const requestId = getRequestId(req);

  const folder = (req.query['folder'] as EmailFolder) || 'inbox';
  const limit = Math.min(parseInt(req.query['limit'] as string) || 20, 100);
  const offset = parseInt(req.query['offset'] as string) || 0;
  const isRead = req.query['isRead'] !== undefined
    ? req.query['isRead'] === 'true'
    : undefined;

  const result = await listEmails(userId, { folder, limit, offset, ...(isRead !== undefined ? { isRead } : {}) });

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId, details: result.error.details });
    return;
  }

  res.status(200).json(result.data);
}));

router.get('/delivery-failures', authMiddleware, requireRole('admin'), apiRateLimiter, asyncHandler(async (_req: Request, res: Response) => {
  const failures = await getRecentDeliveryFailures(50);
  res.status(200).json({ items: failures, total: failures.length });
}));

router.get('/unread-count', authMiddleware, requireRole('admin'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const requestId = getRequestId(req);

  const folder = (req.query['folder'] as EmailFolder) || 'inbox';
  const result = await getUnreadCount(userId, folder);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId, details: result.error.details });
    return;
  }

  res.status(200).json(result.data);
}));

router.get('/profiles', authMiddleware, requireRole('admin'), apiRateLimiter, asyncHandler(async (_req: Request, res: Response) => {
  const profiles = getSenderProfiles();
  res.status(200).json({ profiles });
}));

router.get('/:id', authMiddleware, requireRole('admin'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const requestId = getRequestId(req);
  const emailId = req.params['id'] as string;

  const result = await getEmail(userId, emailId);

  if (!result.success) {
    const status = result.error.code === 'EMAIL_NOT_FOUND' ? 404 : 400;
    sendErrorResponse(res, status, result.error.code, result.error.message, { requestId, details: result.error.details });
    return;
  }

  res.status(200).json(result.data);
}));

router.patch('/:id', authMiddleware, requireRole('admin'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const requestId = getRequestId(req);
  const emailId = req.params['id'] as string;

  const { is_read, is_starred, folder } = req.body;
  const updates: { is_read?: boolean; is_starred?: boolean; folder?: EmailFolder } = {};
  if (is_read !== undefined) updates.is_read = is_read;
  if (is_starred !== undefined) updates.is_starred = is_starred;
  if (folder !== undefined) updates.folder = folder;

  const result = await updateEmail(userId, emailId, updates);

  if (!result.success) {
    const status = result.error.code === 'EMAIL_NOT_FOUND' ? 404 : 400;
    sendErrorResponse(res, status, result.error.code, result.error.message, { requestId, details: result.error.details });
    return;
  }

  res.status(200).json(result.data);
}));

router.delete('/:id', authMiddleware, requireRole('admin'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const requestId = getRequestId(req);
  const emailId = req.params['id'] as string;

  const result = await deleteEmail(userId, emailId);

  if (!result.success) {
    const status = result.error.code === 'EMAIL_NOT_FOUND' ? 404 : 400;
    sendErrorResponse(res, status, result.error.code, result.error.message, { requestId, details: result.error.details });
    return;
  }

  res.status(200).json(result.data);
}));

router.post('/send', authMiddleware, requireRole('admin'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const requestId = getRequestId(req);

  const { to, subject, text, html, senderProfile, senderName } = req.body;

  if (!to || !subject) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'to and subject are required', { requestId });
    return;
  }

  const result = await sendNewEmail({
    userId,
    to,
    subject,
    textBody: text || '',
    htmlBody: html || text || '',
    senderProfile,
    senderName,
  });

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId, details: result.error.details });
    return;
  }

  res.status(201).json(result.data);
}));

router.post('/:id/reply', authMiddleware, requireRole('admin'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const requestId = getRequestId(req);
  const emailId = req.params['id'] as string;

  const { text, html, senderProfile, senderName } = req.body;

  if (!text && !html) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'text or html body is required', { requestId });
    return;
  }

  /* istanbul ignore next -- validation guard above ensures at least one of text/html is truthy */
  const result = (senderProfile || senderName)
    ? await replyToEmail(userId, emailId, text || '', html || text || '', { senderProfile, senderName })
    : await replyToEmail(userId, emailId, text || '', html || text || '');

  if (!result.success) {
    const status = result.error.code === 'EMAIL_NOT_FOUND' ? 404 : 400;
    sendErrorResponse(res, status, result.error.code, result.error.message, { requestId, details: result.error.details });
    return;
  }

  res.status(201).json(result.data);
}));

export default router;
