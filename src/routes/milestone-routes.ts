import { Router, type Request, type Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter, fileUploadRateLimiter } from '../middleware/rate-limiter.js';
import { createFileUploadMiddleware } from '../middleware/file-upload-middleware.js';
import { uploadFile } from '../utils/file-upload.js';
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

// Create file upload middleware for milestone deliverables
const milestoneFileUpload = createFileUploadMiddleware('files', {
  minFiles: 1,
  maxFiles: 10,
  validateMagicNumbers: true,
});

/**
 * @swagger
 * /api/milestones/{id}/upload-deliverables:
 *   post:
 *     summary: Upload deliverable files for milestone
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Files uploaded successfully
 *       400:
 *         description: Invalid request or file validation failed
 */
router.post('/:id/upload-deliverables', 
  authMiddleware, 
  requireRole('freelancer'), 
  validateUUID(), 
  fileUploadRateLimiter, 
  ...milestoneFileUpload, 
  async (req: Request, res: Response) => {
    try {
      const milestoneId = req.params['id'] ?? '';
      const userId = req.user?.id ?? '';
      const files = req.files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
      }

      // Verify milestone ownership
      const milestoneResult = await getMilestoneById(milestoneId);
      if (!milestoneResult.success) {
        return res.status(404).json({ error: 'Milestone not found' });
      }

      // Upload files to milestone-deliverables bucket
      const uploadPromises = files.map(async (file) => {
        const result = await uploadFile({
          bucket: 'milestone-deliverables',
          userId,
          file: file.buffer,
          filename: file.originalname,
          mimetype: file.mimetype,
          folder: `milestone-${milestoneId}`,
        });

        if (!result.success) {
          throw new Error(`Failed to upload ${file.originalname}: ${result.error}`);
        }

        return {
          filename: file.originalname,
          url: result.url!,
          size: file.size,
          mimeType: file.mimetype,
        };
      });

      const uploadedFiles = await Promise.all(uploadPromises);

      return res.json({
        success: true,
        files: uploadedFiles,
        message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
      });
    } catch (error) {
      console.error('Error uploading milestone deliverables:', error);
      return res.status(500).json({ error: 'Failed to upload files' });
    }
  }
);

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
 *                 items:
 *                   type: object
 *                   properties:
 *                     filename:
 *                       type: string
 *                     url:
 *                       type: string
 *                     size:
 *                       type: number
 *                     mimeType:
 *                       type: string
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
 * /api/milestones/{id}/submit-with-files:
 *   post:
 *     summary: Submit milestone with file uploads
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               notes:
 *                 type: string
 *               existingDeliverables:
 *                 type: string
 *                 description: JSON string of existing file attachments
 *     responses:
 *       200:
 *         description: Milestone submitted successfully with files
 */
router.post('/:id/submit-with-files', 
  authMiddleware, 
  requireRole('freelancer'), 
  validateUUID(), 
  fileUploadRateLimiter, 
  ...milestoneFileUpload, 
  async (req: Request, res: Response) => {
    try {
      const milestoneId = req.params['id'] ?? '';
      const userId = req.user?.id ?? '';
      const { notes, existingDeliverables } = req.body;
      const files = req.files as Express.Multer.File[] | undefined;

      // Parse existing deliverables if provided
      let existingFiles = [];
      if (existingDeliverables) {
        try {
          existingFiles = JSON.parse(existingDeliverables);
        } catch (error) {
          return res.status(400).json({ error: 'Invalid existingDeliverables format' });
        }
      }

      // Upload new files if provided
      let newFiles: Array<{
        filename: string;
        url: string;
        size: number;
        mimeType: string;
      }> = [];
      if (files && files.length > 0) {
        const uploadPromises = files.map(async (file) => {
          const result = await uploadFile({
            bucket: 'milestone-deliverables',
            userId,
            file: file.buffer,
            filename: file.originalname,
            mimetype: file.mimetype,
            folder: `milestone-${milestoneId}`,
          });

          if (!result.success) {
            throw new Error(`Failed to upload ${file.originalname}: ${result.error}`);
          }

          return {
            filename: file.originalname,
            url: result.url!,
            size: file.size,
            mimeType: file.mimetype,
          };
        });

        newFiles = await Promise.all(uploadPromises);
      }

      // Combine existing and new files
      const allDeliverables = [...existingFiles, ...newFiles];

      // Submit milestone with all deliverables
      const result = await submitMilestone({
        milestoneId,
        freelancerId: userId,
        deliverables: allDeliverables,
        notes,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error.message });
      }

      return res.json({
        ...result.data,
        uploadedFiles: newFiles.length,
        totalFiles: allDeliverables.length,
      });
    } catch (error) {
      console.error('Error submitting milestone with files:', error);
      return res.status(500).json({ error: 'Failed to submit milestone with files' });
    }
  }
);

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
