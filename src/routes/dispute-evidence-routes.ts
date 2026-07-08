import { Router, type Request, type Response } from 'express';
import { authMiddleware, requireVerifiedKyc } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { logger } from '../config/logger.js';
import {
  submitEvidence,
  getDisputeEvidence,
  deleteEvidence,
  verifyEvidence,
} from '../services/dispute-evidence-service.js';
import { getRequestId } from '../utils/route-helpers.js';

// M13: Validate fileUrl to prevent SSRF/XSS via malicious schemes
const ALLOWED_URL_SCHEMES = ['https:'];
const MAX_FILE_URL_LENGTH = 2048;

function isValidFileUrl(url: string | undefined): boolean {
  if (!url) return true; // Optional field
  if (url.length > MAX_FILE_URL_LENGTH) return false;
  try {
    const parsed = new URL(url);
    return ALLOWED_URL_SCHEMES.includes(parsed.protocol);
  } catch {
    return false;
  }
}

const router = Router();

/**
 * @swagger
 * /api/disputes/{disputeId}/evidence:
 *   post:
 *     summary: Submit evidence for dispute
 *     tags:
 *       - Dispute Evidence
 *     parameters:
 *       - in: path
 *         name: disputeId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - evidenceType
 *               - description
 *             properties:
 *               evidenceType:
 *                 type: string
 *                 enum: [document, screenshot, message, contract, other]
 *               fileUrl:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Evidence submitted successfully
 */
router.post('/:disputeId/evidence', authMiddleware, requireVerifiedKyc, validateUUID(['disputeId']), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const requestId = getRequestId(req);
    const disputeId = req.params['disputeId'] ?? '';
    const userId = req.user?.userId ?? '';
    const { evidenceType, fileUrl, description } = req.body;

    if (!evidenceType || !description) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Evidence type and description are required' },
        timestamp: new Date().toISOString(),
        requestId,
      });
    }

    // M13: Validate fileUrl scheme to prevent SSRF
    if (!isValidFileUrl(fileUrl)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid file URL. Only HTTPS URLs are allowed.' },
        timestamp: new Date().toISOString(),
        requestId,
      });
    }

    const result = await submitEvidence({
      disputeId,
      submittedBy: userId,
      evidenceType,
      fileUrl,
      description,
    });

    if (!result.success) {
      return res.status(400).json({
        error: { code: result.error.code ?? 'EVIDENCE_SUBMIT_FAILED', message: result.error.message },
        timestamp: new Date().toISOString(),
        requestId,
      });
    }

    return res.json(result.data);
  } catch (error) {
    logger.error('Error submitting evidence', error);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to submit evidence' },
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  }
});

/**
 * @swagger
 * /api/disputes/{disputeId}/evidence:
 *   get:
 *     summary: Get all evidence for dispute
 *     tags:
 *       - Dispute Evidence
 *     parameters:
 *       - in: path
 *         name: disputeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of evidence
 */
router.get('/:disputeId/evidence', authMiddleware, requireVerifiedKyc, validateUUID(['disputeId']), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const requestId = getRequestId(req);
    const disputeId = req.params['disputeId'] ?? '';
    const userId = req.user?.userId ?? '';

    const result = await getDisputeEvidence(disputeId, userId);

    if (!result.success) {
      return res.status(400).json({
        error: { code: result.error.code ?? 'EVIDENCE_FETCH_FAILED', message: result.error.message },
        timestamp: new Date().toISOString(),
        requestId,
      });
    }

    return res.json(result.data);
  } catch (error) {
    logger.error('Error getting evidence', error);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get evidence' },
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  }
});

/**
 * @swagger
 * /api/disputes/{disputeId}/evidence/{evidenceId}:
 *   delete:
 *     summary: Delete evidence
 *     tags:
 *       - Dispute Evidence
 *     parameters:
 *       - in: path
 *         name: disputeId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: evidenceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Evidence deleted successfully
 */
router.delete('/:disputeId/evidence/:evidenceId', authMiddleware, requireVerifiedKyc, validateUUID(['disputeId', 'evidenceId']), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const requestId = getRequestId(req);
    const evidenceId = req.params['evidenceId'] ?? '';
    const userId = req.user?.userId ?? '';

    const result = await deleteEvidence(evidenceId, userId);

    if (!result.success) {
      return res.status(400).json({
        error: { code: result.error.code ?? 'EVIDENCE_DELETE_FAILED', message: result.error.message },
        timestamp: new Date().toISOString(),
        requestId,
      });
    }

    return res.json({ message: 'Evidence deleted successfully' });
  } catch (error) {
    logger.error('Error deleting evidence', error);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete evidence' },
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  }
});

/**
 * @swagger
 * /api/disputes/{disputeId}/evidence/{evidenceId}/verify:
 *   post:
 *     summary: Verify evidence (arbiter only)
 *     tags:
 *       - Dispute Evidence
 *     parameters:
 *       - in: path
 *         name: disputeId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: evidenceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Evidence verified successfully
 */
router.post('/:disputeId/evidence/:evidenceId/verify', authMiddleware, requireVerifiedKyc, validateUUID(['disputeId', 'evidenceId']), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const requestId = getRequestId(req);
    const evidenceId = req.params['evidenceId'] ?? '';
    const userId = req.user?.userId ?? '';

    const result = await verifyEvidence({
      evidenceId,
      verifiedBy: userId,
    });

    if (!result.success) {
      return res.status(400).json({
        error: { code: result.error.code ?? 'EVIDENCE_VERIFY_FAILED', message: result.error.message },
        timestamp: new Date().toISOString(),
        requestId,
      });
    }

    return res.json(result.data);
  } catch (error) {
    logger.error('Error verifying evidence', error);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to verify evidence' },
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  }
});

export default router;
