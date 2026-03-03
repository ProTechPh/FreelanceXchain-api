/**
 * Didit KYC Routes
 * API endpoints for KYC verification using Didit
 * 
 * Note: Didit handles all verification data. We only track session and decision.
 */

import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { verifyWebhookSignature } from '../services/didit-client.js';
import { logger } from '../config/logger.js';
import {
  initiateKycVerification,
  getKycStatus,
  getKycById,
  refreshVerificationStatus,
  processWebhook,
  adminReviewVerification,
  getPendingAdminReviews,
  getVerificationsByStatus,
  getUserVerificationHistory,
  isUserVerified,
  getProfileDataFromKyc,
} from '../services/didit-kyc-service.js';
import { DiditWebhookPayload, DiditWebhookStatus, DiditWebhookType, KycStatus } from '../models/didit-kyc.js';

const router = Router();

const VALID_WEBHOOK_TYPES: ReadonlySet<DiditWebhookType> = new Set(['status.updated', 'data.updated']);
const VALID_WEBHOOK_STATUSES: ReadonlySet<DiditWebhookStatus> = new Set([
  'Not Started',
  'In Progress',
  'Approved',
  'Declined',
  'In Review',
  'Expired',
  'Abandoned',
]);

function parseUnixTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return parseInt(value, 10);
  }

  return null;
}

function parseWebhookPayload(payload: unknown): DiditWebhookPayload | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const webhookPayload = payload as Record<string, unknown>;
  const webhookType = webhookPayload['webhook_type'];
  const sessionId = webhookPayload['session_id'];
  const status = webhookPayload['status'];
  const timestamp = parseUnixTimestamp(webhookPayload['timestamp']);
  const createdAt = parseUnixTimestamp(webhookPayload['created_at']);

  if (
    typeof webhookType !== 'string' ||
    !VALID_WEBHOOK_TYPES.has(webhookType as DiditWebhookType) ||
    typeof sessionId !== 'string' ||
    sessionId.trim().length === 0 ||
    typeof status !== 'string' ||
    !VALID_WEBHOOK_STATUSES.has(status as DiditWebhookStatus) ||
    timestamp === null ||
    createdAt === null
  ) {
    return null;
  }

  return {
    ...(webhookPayload as Omit<DiditWebhookPayload, 'webhook_type' | 'session_id' | 'status' | 'timestamp' | 'created_at'>),
    webhook_type: webhookType as DiditWebhookType,
    session_id: sessionId,
    status: status as DiditWebhookStatus,
    timestamp,
    created_at: createdAt,
  };
}

/**
 * @swagger
 * components:
 *   schemas:
 *     KycVerification:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         user_id:
 *           type: string
 *           format: uuid
 *         status:
 *           type: string
 *           enum: [pending, in_progress, completed, approved, rejected, expired]
 *         didit_session_id:
 *           type: string
 *         didit_session_url:
 *           type: string
 *           description: URL to redirect user for verification
 *         decision:
 *           type: string
 *           enum: [approved, declined, review]
 *         reviewed_by:
 *           type: string
 *           format: uuid
 *         reviewed_at:
 *           type: string
 *           format: date-time
 *         admin_notes:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         completed_at:
 *           type: string
 *           format: date-time
 *         expires_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/kyc/initiate:
 *   post:
 *     summary: Initiate KYC verification
 *     description: Creates a new Didit verification session and returns URL for user to complete verification
 *     tags:
 *       - KYC
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Verification session created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KycVerification'
 *       400:
 *         description: Validation error or user already has active verification
 *       401:
 *         description: Unauthorized
 */
router.post('/initiate', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await initiateKycVerification({ user_id: userId });

  if (!result.success) {
    const statusCode = result.error.code === 'USER_NOT_FOUND' ? 404 : 400;
    res.status(statusCode).json({
      error: result.error,
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(201).json(result.data);
});

/**
 * @swagger
 * /api/kyc/status:
 *   get:
 *     summary: Get current user's KYC verification status
 *     tags:
 *       - KYC
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KYC verification status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KycVerification'
 *       404:
 *         description: No verification found
 */
router.get('/status', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await getKycStatus(userId);

  if (!result.success) {
    res.status(400).json({
      error: result.error,
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (!result.data) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'No KYC verification found' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/kyc/verified:
 *   get:
 *     summary: Check if current user is verified
 *     tags:
 *       - KYC
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Verification status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 verified:
 *                   type: boolean
 */
router.get('/verified', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const verified = await isUserVerified(userId);
  res.status(200).json({ verified });
});

/**
 * @swagger
 * /api/kyc/profile-data:
 *   get:
 *     summary: Get KYC data for profile creation
 *     description: Returns verified KYC data that can be used to pre-populate user profile
 *     tags:
 *       - KYC
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile data from KYC
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                 first_name:
 *                   type: string
 *                 last_name:
 *                   type: string
 *                 location:
 *                   type: string
 *                 nationality:
 *                   type: string
 *                 kyc_verified:
 *                   type: boolean
 *                 kyc_verified_at:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: KYC not approved or not found
 */
router.get('/profile-data', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const result = await getProfileDataFromKyc(userId);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/kyc/history:
 *   get:
 *     summary: Get user's KYC verification history
 *     tags:
 *       - KYC
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Verification history
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/KycVerification'
 */
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const result = await getUserVerificationHistory(userId);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/kyc/refresh/{verificationId}:
 *   post:
 *     summary: Refresh verification status from Didit
 *     description: Manually fetch latest status from Didit API
 *     tags:
 *       - KYC
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: verificationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Status refreshed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KycVerification'
 */
router.post('/refresh/:verificationId', authMiddleware, validateUUID(['verificationId']), async (req: Request, res: Response) => {
  const verificationId = req.params['verificationId'];
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!verificationId) {
    res.status(400).json({
      error: { code: 'INVALID_ID', message: 'Verification ID required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Ownership check: verify this verification belongs to the requesting user
  const verification = await getKycById(verificationId);
  if (!verification || !verification.success || !verification.data) {
    res.status(404).json({
      error: { code: 'VERIFICATION_NOT_FOUND', message: 'Verification not found' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }
  if (verification.data.user_id !== userId && req.user?.role !== 'admin') {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'You can only refresh your own verifications' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await refreshVerificationStatus(verificationId);

  if (!result.success) {
    const statusCode = result.error.code === 'VERIFICATION_NOT_FOUND' ? 404 : 400;
    res.status(statusCode).json({
      error: result.error,
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/kyc/webhook:
 *   post:
 *     summary: Didit webhook endpoint
 *     description: Receives verification status updates from Didit
 *     tags:
 *       - KYC Webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed
 *       401:
 *         description: Invalid signature
 */
router.post('/webhook', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const signature = typeof req.headers['x-signature'] === 'string' ? req.headers['x-signature'] : '';
  const timestamp = typeof req.headers['x-timestamp'] === 'string' ? req.headers['x-timestamp'] : '';
  const payload = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body ?? {});
  const webhookPayload = parseWebhookPayload(req.body);

  if (!webhookPayload) {
    logger.security('Invalid Didit webhook payload', {
      requestId,
      ip: req.ip,
      bodyType: typeof req.body,
    });

    res.status(400).json({
      error: { code: 'INVALID_PAYLOAD', message: 'Invalid webhook payload' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Verify webhook signature
  if (!verifyWebhookSignature(payload, signature, timestamp)) {
    logger.security('Invalid Didit webhook signature', {
      requestId,
      timestamp,
      ip: req.ip,
      webhookType: webhookPayload.webhook_type,
    });
    
    res.status(401).json({
      error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  try {
    // Log webhook event
    logger.info('Didit webhook received', {
      requestId,
      webhookType: webhookPayload.webhook_type,
      status: webhookPayload.status,
      sessionId: webhookPayload.session_id,
    });

    const result = await processWebhook(webhookPayload);

    if (!result.success) {
      logger.error('Webhook processing error', undefined, {
        requestId,
        error: result.error,
        webhookType: webhookPayload.webhook_type,
        sessionId: webhookPayload.session_id,
      });

      res.status(400).json({
        error: result.error,
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    res.status(200).json({ message: 'Webhook processed', data: result.data });
  } catch (error) {
    logger.error('Unhandled Didit webhook processing error', error as Error, {
      requestId,
      webhookType: webhookPayload.webhook_type,
      sessionId: webhookPayload.session_id,
    });

    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to process webhook' },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
});

/**
 * @swagger
 * /api/kyc/admin/pending:
 *   get:
 *     summary: Get verifications pending admin review
 *     tags:
 *       - KYC Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending verifications
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/KycVerification'
 */
router.get('/admin/pending', authMiddleware, requireRole('admin'), async (_req: Request, res: Response) => {
  const result = await getPendingAdminReviews();

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/kyc/admin/status/{status}:
 *   get:
 *     summary: Get verifications by status
 *     tags:
 *       - KYC Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [pending, in_progress, completed, approved, rejected, expired]
 *     responses:
 *       200:
 *         description: Verifications list
 */
router.get('/admin/status/:status', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
  const status = req.params['status'] as KycStatus;
  const validStatuses: KycStatus[] = ['pending', 'in_progress', 'completed', 'approved', 'rejected', 'expired'];

  if (!validStatuses.includes(status)) {
    res.status(400).json({
      error: { code: 'INVALID_STATUS', message: 'Invalid status' },
    });
    return;
  }

  const result = await getVerificationsByStatus(status);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  // Transform snake_case to camelCase for frontend
  const transformedData = result.data.map(kyc => ({
    id: kyc.id,
    userId: kyc.user_id,
    status: kyc.status,
    firstName: kyc.first_name || '',
    lastName: kyc.last_name || '',
    dateOfBirth: kyc.date_of_birth,
    nationality: kyc.nationality,
    documentType: kyc.document_type,
    documentNumber: kyc.document_number,
    issuingCountry: kyc.issuing_country,
    documentVerified: kyc.document_verified,
    livenessCheck: kyc.liveness_passed ? {
      id: kyc.id,
      sessionId: kyc.didit_session_id,
      status: kyc.liveness_passed ? 'passed' : 'failed',
      confidenceScore: parseFloat(kyc.liveness_confidence_score || '0'),
      challenges: [],
      expiresAt: kyc.expires_at || '',
    } : undefined,
    faceMatchScore: kyc.face_similarity_score ? parseFloat(kyc.face_similarity_score) : undefined,
    faceMatchStatus: kyc.face_matched ? 'matched' : kyc.face_matched === false ? 'not_matched' : 'pending',
    rejectionReason: kyc.admin_notes,
    didit_session_url: kyc.didit_session_url,
    completed_at: kyc.completed_at,
    admin_notes: kyc.admin_notes,
    createdAt: kyc.created_at,
    updatedAt: kyc.updated_at,
    tier: 1,
    address: {
      addressLine1: '',
      city: '',
      country: kyc.nationality || '',
      countryCode: kyc.ip_country_code || '',
    },
    documents: [],
  }));

  res.status(200).json(transformedData);
});

/**
 * @swagger
 * /api/kyc/admin/review/{verificationId}:
 *   post:
 *     summary: Admin review verification
 *     description: Approve or reject a completed verification
 *     tags:
 *       - KYC Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: verificationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - decision
 *             properties:
 *               decision:
 *                 type: string
 *                 enum: [approved, rejected]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Review completed
 */
router.post('/admin/review/:verificationId', authMiddleware, requireRole('admin'), validateUUID(['verificationId']), async (req: Request, res: Response) => {
  const verificationId = req.params['verificationId'];
  const adminUserId = req.user?.userId;
  const { decision, notes } = req.body;

  if (!verificationId || !adminUserId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  if (!decision || !['approved', 'rejected'].includes(decision)) {
    res.status(400).json({
      error: { code: 'INVALID_DECISION', message: 'Decision must be approved or rejected' },
    });
    return;
  }

  const result = await adminReviewVerification(verificationId, adminUserId, decision, notes);

  if (!result.success) {
    const statusCode = result.error.code === 'VERIFICATION_NOT_FOUND' ? 404 : 400;
    res.status(statusCode).json({ error: result.error });
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/kyc/admin/verification/{verificationId}:
 *   get:
 *     summary: Get verification details (Admin)
 *     tags:
 *       - KYC Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: verificationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Verification details
 */
router.get('/admin/verification/:verificationId', authMiddleware, requireRole('admin'), validateUUID(['verificationId']), async (req: Request, res: Response) => {
  const verificationId = req.params['verificationId'];

  if (!verificationId) {
    res.status(400).json({
      error: { code: 'INVALID_ID', message: 'Verification ID required' },
    });
    return;
  }

  const result = await getKycById(verificationId);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  if (!result.data) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Verification not found' },
    });
    return;
  }

  res.status(200).json(result.data);
});

export default router;
