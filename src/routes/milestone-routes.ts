import { Router, type Request, type Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import {
  submitMilestone,
  approveMilestone,
  rejectMilestone,
  getMilestoneById,
  getContractMilestones,
} from '../services/milestone-service.js';

const router = Router();

/**
 * @swagger
 * /api/milestones/{id}:
 *   get:
 *     summary: Get milestone details
 *     tags:
 *       - Milestones
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Milestone details
 *       404:
 *         description: Milestone not found
 */
router.get('/:id', authMiddleware, validateUUID(), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const milestoneId = req.params['id'] ?? '';
    const result = await getMilestoneById(milestoneId);

    if (!result.success) {
      return res.status(404).json({ error: result.error.message });
    }

    return res.json(result.data);
  } catch (error) {
    console.error('Error getting milestone:', error);
    return res.status(500).json({ error: 'Failed to get milestone' });
  }
});

/**
 * @swagger
 * /api/milestones/contract/{contractId}:
 *   get:
 *     summary: Get all milestones for contract
 *     tags:
 *       - Milestones
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of milestones
 */
router.get('/contract/:contractId', authMiddleware, validateUUID(), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const contractId = req.params['contractId'] ?? '';
    const result = await getContractMilestones(contractId);

    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    return res.json(result.data);
  } catch (error) {
    console.error('Error getting contract milestones:', error);
    return res.status(500).json({ error: 'Failed to get milestones' });
  }
});

/**
 * @swagger
 * /api/milestones/{id}/submit:
 *   post:
 *     summary: Submit milestone with deliverables
 *     tags:
 *       - Milestones
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deliverables:
 *                 type: array
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Milestone submitted successfully
 */
router.post('/:id/submit', authMiddleware, requireRole('freelancer'), validateUUID(), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const milestoneId = req.params['id'] ?? '';
    const userId = req.user?.id ?? '';
    const { deliverables, notes } = req.body;

    const result = await submitMilestone({
      milestoneId,
      freelancerId: userId,
      deliverables: deliverables || [],
      notes,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    return res.json(result.data);
  } catch (error) {
    console.error('Error submitting milestone:', error);
    return res.status(500).json({ error: 'Failed to submit milestone' });
  }
});

/**
 * @swagger
 * /api/milestones/{id}/approve:
 *   post:
 *     summary: Approve milestone
 *     tags:
 *       - Milestones
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               feedback:
 *                 type: string
 *     responses:
 *       200:
 *         description: Milestone approved successfully
 */
router.post('/:id/approve', authMiddleware, requireRole('employer'), validateUUID(), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const milestoneId = req.params['id'] ?? '';
    const userId = req.user?.id ?? '';
    const { feedback } = req.body;

    const result = await approveMilestone({
      milestoneId,
      employerId: userId,
      feedback,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    return res.json(result.data);
  } catch (error) {
    console.error('Error approving milestone:', error);
    return res.status(500).json({ error: 'Failed to approve milestone' });
  }
});

/**
 * @swagger
 * /api/milestones/{id}/reject:
 *   post:
 *     summary: Reject milestone with reason
 *     tags:
 *       - Milestones
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *               requestRevision:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Milestone rejected successfully
 */
router.post('/:id/reject', authMiddleware, requireRole('employer'), validateUUID(), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const milestoneId = req.params['id'] ?? '';
    const userId = req.user?.id ?? '';
    const { reason, requestRevision } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const result = await rejectMilestone({
      milestoneId,
      employerId: userId,
      reason,
      requestRevision: requestRevision || false,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    return res.json(result.data);
  } catch (error) {
    console.error('Error rejecting milestone:', error);
    return res.status(500).json({ error: 'Failed to reject milestone' });
  }
});

export default router;
