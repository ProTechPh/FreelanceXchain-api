import { Router, type Request, type Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter, fileUploadRateLimiter } from '../middleware/rate-limiter.js';
import { createFileUploadMiddleware } from '../middleware/file-upload-middleware.js';
import { uploadFile } from '../utils/file-upload.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository, type MilestoneEntity, type ProjectEntity } from '../repositories/project-repository.js';
import {
  approveMilestone,
  rejectMilestone,
  getMilestoneById,
  getContractMilestones,
} from '../services/milestone-service.js';
import { requestMilestoneCompletion } from '../services/payment-service.js';

const router = Router();

type MilestoneContext = {
  contractId: string;
  project: ProjectEntity;
  milestone: MilestoneEntity;
  milestoneIndex: number;
};

async function findFreelancerMilestoneContext(
  freelancerId: string,
  milestoneId: string
): Promise<MilestoneContext | null> {
  const contractsResult = await contractRepository.getContractsByFreelancer(freelancerId, { limit: 1000, offset: 0 });

  // Prefer active contracts first, then fall back to others.
  const contracts = [...contractsResult.items].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return b.created_at.localeCompare(a.created_at);
  });

  for (const contract of contracts) {
    const project = await projectRepository.findProjectById(contract.project_id);
    if (!project) continue;

    const milestoneIndex = (project.milestones || []).findIndex((m) => m.id === milestoneId);
    if (milestoneIndex === -1) continue;

    const milestone = project.milestones[milestoneIndex];
    if (!milestone) continue;

    return {
      contractId: contract.id,
      project,
      milestone,
      milestoneIndex,
    };
  }

  return null;
}

function mapMilestoneResponse(
  milestone: MilestoneEntity,
  contractId: string,
  project: ProjectEntity,
  submittedAtIso?: string
) {
  const deliverableFiles = (milestone as any).deliverableFiles || (milestone as any).deliverable_files || [];
  const revisionCount = (milestone as any).revisionCount ?? (milestone as any).revision_count ?? 0;
  const submittedAt = (milestone as any).submittedAt || (milestone as any).submitted_at || submittedAtIso;
  const approvedAt = (milestone as any).approvedAt || (milestone as any).approved_at;
  const rejectedAt = (milestone as any).rejectedAt || (milestone as any).rejected_at;
  const completedAt = (milestone as any).completedAt || (milestone as any).completed_at;
  const rejectionReason = (milestone as any).rejectionReason || (milestone as any).rejection_reason;

  return {
    id: milestone.id,
    contractId,
    title: milestone.title,
    description: milestone.description,
    amount: milestone.amount,
    dueDate: (milestone as any).dueDate || milestone.due_date,
    status: milestone.status,
    submittedAt,
    approvedAt,
    rejectedAt,
    completedAt,
    deliverableFiles,
    rejectionReason,
    revisionCount,
    notes: (milestone as any).notes,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}

async function submitMilestoneFromProjectContext(
  milestoneId: string,
  freelancerId: string,
  deliverables: Array<{ filename: string; url: string; size: number; mimeType: string }>,
  notes?: string
): Promise<{ success: true; data: any } | { success: false; error: { code: string; message: string } }> {
  const context = await findFreelancerMilestoneContext(freelancerId, milestoneId);
  if (!context) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Milestone not found' },
    };
  }

  const completion = await requestMilestoneCompletion(context.contractId, milestoneId, freelancerId);
  if (!completion.success) {
    const completionError = 'error' in completion
      ? completion.error
      : { code: 'SUBMIT_FAILED', message: 'Failed to submit milestone' };
    return { success: false, error: completionError };
  }

  const reloadedProject = await projectRepository.findProjectById(context.project.id);
  if (!reloadedProject) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }

  const milestoneIndex = (reloadedProject.milestones || []).findIndex((m) => m.id === milestoneId);
  if (milestoneIndex === -1) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Milestone not found' },
    };
  }

  const existing = reloadedProject.milestones[milestoneIndex];
  if (!existing) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Milestone not found' },
    };
  }

  const now = new Date().toISOString();
  const currentRevisionCount = Number((existing as any).revisionCount ?? (existing as any).revision_count ?? 0);
  const existingStatus = String((existing as any).status ?? '');
  const nextRevisionCount = existingStatus === 'rejected' ? currentRevisionCount + 1 : currentRevisionCount;

  const updatedMilestone: MilestoneEntity = {
    ...existing,
    status: 'submitted',
    submitted_at: now,
    submittedAt: now,
    deliverable_files: deliverables,
    deliverableFiles: deliverables,
    notes: notes ?? (existing as any).notes,
    revision_count: nextRevisionCount,
    revisionCount: nextRevisionCount,
    rejection_reason: null,
    rejectionReason: null,
  } as any;

  const updatedMilestones = [...reloadedProject.milestones];
  updatedMilestones[milestoneIndex] = updatedMilestone;

  const updatedProject = await projectRepository.updateProject(reloadedProject.id, {
    milestones: updatedMilestones,
  });

  if (!updatedProject) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update milestone submission data' },
    };
  }

  return {
    success: true,
    data: mapMilestoneResponse(updatedMilestone, context.contractId, updatedProject, now),
  };
}

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
      const message = 'error' in result ? result.error.message : 'Milestone not found';
      return res.status(404).json({ error: message });
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
      const message = 'error' in result ? result.error.message : 'Failed to get milestones';
      return res.status(400).json({ error: message });
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

      // Verify milestone ownership via freelancer's contracts/projects
      const context = await findFreelancerMilestoneContext(userId, milestoneId);
      if (!context) {
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

    const result = await submitMilestoneFromProjectContext(milestoneId, userId, deliverables || [], notes);

    if (!result.success) {
      const errorResult = 'error' in result
        ? result.error
        : { code: 'SUBMIT_FAILED', message: 'Failed to submit milestone' };
      const statusCode = errorResult.code === 'NOT_FOUND' ? 404 :
        errorResult.code === 'UNAUTHORIZED' ? 403 : 400;
      return res.status(statusCode).json({ error: errorResult.message });
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
      const result = await submitMilestoneFromProjectContext(milestoneId, userId, allDeliverables, notes);

      if (!result.success) {
        const errorResult = 'error' in result
          ? result.error
          : { code: 'SUBMIT_FAILED', message: 'Failed to submit milestone' };
        const statusCode = errorResult.code === 'NOT_FOUND' ? 404 :
          errorResult.code === 'UNAUTHORIZED' ? 403 : 400;
        return res.status(statusCode).json({ error: errorResult.message });
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
      const message = 'error' in result ? result.error.message : 'Failed to approve milestone';
      return res.status(400).json({ error: message });
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
      const message = 'error' in result ? result.error.message : 'Failed to reject milestone';
      return res.status(400).json({ error: message });
    }

    return res.json(result.data);
  } catch (error) {
    console.error('Error rejecting milestone:', error);
    return res.status(500).json({ error: 'Failed to reject milestone' });
  }
});

export default router;
