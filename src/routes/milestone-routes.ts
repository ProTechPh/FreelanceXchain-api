import { Router, type Request, type Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter, fileUploadRateLimiter } from '../middleware/rate-limiter.js';
import { createFileUploadMiddleware } from '../middleware/file-upload-middleware.js';
import { uploadFile } from '../utils/storage-uploader.js';
import { logger } from '../config/logger.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse, sendSuccessResponse } from '../utils/response-helpers.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository, type MilestoneEntity, type ProjectEntity } from '../repositories/project-repository.js';
import {
  rejectMilestone,
  getMilestoneById,
  getContractMilestones,
} from '../services/milestone-service.js';
import { requestMilestoneCompletion, approveMilestone as approveMilestoneWithPayment } from '../services/payment-service.js';

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
  const deliverableFiles = milestone.deliverableFiles || milestone.deliverable_files || [];
  const revisionCount = milestone.revisionCount ?? milestone.revision_count ?? 0;
  const submittedAt = milestone.submittedAt || milestone.submitted_at || submittedAtIso;
  const approvedAt = milestone.approvedAt || milestone.approved_at;
  const rejectedAt = milestone.rejectedAt || milestone.rejected_at;
  const completedAt = milestone.completedAt || milestone.completed_at;
  const rejectionReason = milestone.rejectionReason || milestone.rejection_reason;

  return {
    id: milestone.id,
    contractId,
    title: milestone.title,
    description: milestone.description,
    amount: milestone.amount,
    dueDate: milestone.dueDate || milestone.due_date,
    status: milestone.status,
    submittedAt,
    approvedAt,
    rejectedAt,
    completedAt,
    deliverableFiles,
    rejectionReason,
    revisionCount,
    notes: milestone.notes,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}

type MilestoneDeliverable = { filename: string; url: string; size: number; mimeType: string };

async function uploadMilestoneDeliverables(
  files: Express.Multer.File[],
  userId: string
): Promise<MilestoneDeliverable[]> {
  const uploadPromises = files.map(async (file) => {
    const result = await uploadFile({
      bucket: 'milestone-deliverables',
      userId,
      file: file.buffer,
      filename: file.originalname,
      mimetype: file.mimetype,
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

  return Promise.all(uploadPromises);
}

function sendMilestoneSubmitError(
  res: Response,
  errorResult: { code: string; message: string },
  requestId: string
): void {
  const statusCode = errorResult.code === 'NOT_FOUND' ? 404 :
    errorResult.code === 'UNAUTHORIZED' ? 403 : 400;
  sendErrorResponse(res, statusCode, errorResult.code, errorResult.message, requestId);
}

async function submitMilestoneFromProjectContext(
  milestoneId: string,
  freelancerId: string,
  deliverables: MilestoneDeliverable[],
  notes?: string
): Promise<{ success: true; data: ReturnType<typeof mapMilestoneResponse> } | { success: false; error: { code: string; message: string } }> {
  const context = await findFreelancerMilestoneContext(freelancerId, milestoneId);
  if (!context) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Milestone not found' },
    };
  }

  const completion = await requestMilestoneCompletion(context.contractId, milestoneId, freelancerId, {
    deliverables,
    ...(notes !== undefined ? { notes } : {}),
  });
  if (!completion.success) {
    const completionError = 'error' in completion
      ? completion.error
      : { code: 'SUBMIT_FAILED', message: 'Failed to submit milestone' };
    return { success: false, error: completionError };
  }

  const updatedProject = await projectRepository.findProjectById(context.project.id);
  if (!updatedProject) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }

  const milestoneIndex = (updatedProject.milestones || []).findIndex((m) => m.id === milestoneId);
  if (milestoneIndex === -1) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Milestone not found' },
    };
  }

  const updatedMilestone = updatedProject.milestones[milestoneIndex];
  if (!updatedMilestone) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Milestone not found' },
    };
  }

  const now = new Date().toISOString();

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
    const userId = req.user?.userId;
    // M15: Pass userId to enforce authorization check
    const result = await getMilestoneById(milestoneId, userId);

    if (!result.success) {
      const errorResult = 'error' in result ? result.error : { code: 'NOT_FOUND', message: 'Milestone not found' };
      return sendErrorResponse(res, 404, errorResult.code, errorResult.message, getRequestId(req));
    }

    return res.json(result.data.milestone);
  } catch (error) {
    logger.error('Error getting milestone', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to get milestone', getRequestId(req));
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
router.get('/contract/:contractId', authMiddleware, validateUUID(['contractId']), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const contractId = req.params['contractId'] ?? '';
    // BLF-9.1: Pass userId to enforce ownership check
    const result = await getContractMilestones(contractId, req.user?.userId);

    if (!result.success) {
      const errorResult = 'error' in result ? result.error : { code: 'FETCH_FAILED', message: 'Failed to get milestones' };
      return sendErrorResponse(res, 400, errorResult.code, errorResult.message, getRequestId(req));
    }

    return res.json(result.data);
  } catch (error) {
    logger.error('Error getting contract milestones', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to get milestones', getRequestId(req));
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
      const userId = req.user?.userId ?? '';
      const files = req.files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'No files provided', getRequestId(req));
      }

      // Verify milestone ownership via freelancer's contracts/projects
      const context = await findFreelancerMilestoneContext(userId, milestoneId);
      if (!context) {
        return sendErrorResponse(res, 404, 'NOT_FOUND', 'Milestone not found', getRequestId(req));
      }

      // Upload files to milestone-deliverables bucket
      const uploadedFiles = await uploadMilestoneDeliverables(files, userId);

      return sendSuccessResponse(res, 200, {
        success: true,
        files: uploadedFiles,
        message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
      }, getRequestId(req));
    } catch (error) {
      logger.error('Error uploading milestone deliverables', error);
      return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to upload files', getRequestId(req));
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
    const userId = req.user?.userId ?? '';
    const { deliverables, notes } = req.body;

    const result = await submitMilestoneFromProjectContext(milestoneId, userId, deliverables || [], notes);

    if (!result.success) {
      const errorResult = 'error' in result
        ? result.error
        : { code: 'SUBMIT_FAILED', message: 'Failed to submit milestone' };
      return sendMilestoneSubmitError(res, errorResult, getRequestId(req));
    }

    return res.json(result.data);
  } catch (error) {
    logger.error('Error submitting milestone', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to submit milestone', getRequestId(req));
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
      const userId = req.user?.userId ?? '';
      const { notes, existingDeliverables } = req.body;
      const files = req.files as Express.Multer.File[] | undefined;

      // Parse existing deliverables if provided
      let existingFiles = [];
      if (existingDeliverables) {
        try {
          existingFiles = JSON.parse(existingDeliverables);
        } catch {
          return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid existingDeliverables format', getRequestId(req));
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
        newFiles = await uploadMilestoneDeliverables(files, userId);
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
        return sendErrorResponse(res, statusCode, errorResult.code, errorResult.message, getRequestId(req));
      }

      return res.json({
        ...result.data,
        uploadedFiles: newFiles.length,
        totalFiles: allDeliverables.length,
      });
    } catch (error) {
      logger.error('Error submitting milestone with files', error);
      return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to submit milestone with files', getRequestId(req));
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
    const userId = req.user?.userId ?? '';

    // Find the contract containing this milestone by scanning employer's contracts
    const contractsResult = await contractRepository.getContractsByEmployer(userId, { limit: 1000, offset: 0 });
    let contractId: string | null = null;

    for (const contract of contractsResult.items) {
      const project = await projectRepository.findProjectById(contract.project_id);
      if (!project) continue;
      const found = (project.milestones || []).some((m) => m.id === milestoneId);
      if (found) {
        contractId = contract.id;
        break;
      }
    }

    if (!contractId) {
      return sendErrorResponse(res, 404, 'NOT_FOUND', 'Milestone not found in any of your contracts', getRequestId(req));
    }

    // Use payment-service approveMilestone which handles blockchain escrow release + project milestone update
    const result = await approveMilestoneWithPayment(contractId, milestoneId, userId);

    if (!result.success) {
      const message = 'error' in result ? result.error.message : 'Failed to approve milestone';
      const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
        result.error.code === 'UNAUTHORIZED' ? 403 :
        result.error.code === 'ESCROW_NOT_FOUND' || result.error.code === 'MISSING_WALLET' ? 422 : 400;
      return sendErrorResponse(res, statusCode, result.error.code, message, getRequestId(req));
    }

    return res.json(result.data);
  } catch (error) {
    logger.error('Error approving milestone', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to approve milestone', getRequestId(req));
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
    const userId = req.user?.userId ?? '';
    const { reason, requestRevision } = req.body;

    if (!reason) {
      return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Rejection reason is required', getRequestId(req));
    }

    const result = await rejectMilestone({
      milestoneId,
      employerId: userId,
      reason,
      requestRevision: requestRevision || false,
    });

    if (!result.success) {
      const errorResult = 'error' in result ? result.error : { code: 'REJECT_FAILED', message: 'Failed to reject milestone' };
      return sendErrorResponse(res, 400, errorResult.code, errorResult.message, getRequestId(req));
    }

    return res.json(result.data);
  } catch (error) {
    logger.error('Error rejecting milestone', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to reject milestone', getRequestId(req));
  }
});

export default router;
