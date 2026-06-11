import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import {
  submitEvidence,
  getDisputeEvidence,
  deleteEvidence,
  verifyEvidence,
} from '../services/dispute-evidence-service.js';
import { getRequestId } from '../utils/route-helpers.js';

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
router.post('/:disputeId/evidence', authMiddleware, validateUUID(['disputeId']), apiRateLimiter, async (req: Request, res: Response) => {
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
    console.error('Error submitting evidence:', error);
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
router.get('/:disputeId/evidence', authMiddleware, validateUUID(['disputeId']), apiRateLimiter, async (req: Request, res: Response) => {
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
    console.error('Error getting evidence:', error);
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
router.delete('/:disputeId/evidence/:evidenceId', authMiddleware, validateUUID(['disputeId', 'evidenceId']), apiRateLimiter, async (req: Request, res: Response) => {
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
    console.error('Error deleting evidence:', error);
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
router.post('/:disputeId/evidence/:evidenceId/verify', authMiddleware, validateUUID(['disputeId', 'evidenceId']), apiRateLimiter, async (req: Request, res: Response) => {
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
    console.error('Error verifying evidence:', error);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to verify evidence' },
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  }
});

export default router;
