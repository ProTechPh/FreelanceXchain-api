import { Router, type Request, type Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter, fileUploadRateLimiter } from '../middleware/rate-limiter.js';
import { createFileUploadMiddleware } from '../middleware/file-upload-middleware.js';
import { uploadFile } from '../utils/storage-uploader.js';
import { logger } from '../config/logger.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse, sendSuccessResponse } from '../utils/response-helpers.js';
import {
  rejectMilestone,
  getMilestoneById,
  getContractMilestones,
  findFreelancerMilestoneContext,
  submitMilestoneFromProjectContext,
  findEmployerMilestoneContractId,
  type MilestoneDeliverable,
} from '../services/milestone-service.js';
import { approveMilestone as approveMilestoneWithPayment } from '../services/payment-service.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

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
  sendErrorResponse(res, statusCode, errorResult.code, errorResult.message, { requestId });
}

function validateDeliverablesList(deliverables: unknown): { valid: boolean; error?: string } {
  if (deliverables === undefined || deliverables === null) {
    return { valid: true };
  }
  if (!Array.isArray(deliverables)) {
    return { valid: false, error: 'Deliverables must be an array' };
  }
  if (deliverables.length > 20) {
    return { valid: false, error: 'Cannot submit more than 20 deliverable files' };
  }
  for (let i = 0; i < deliverables.length; i++) {
    const item = deliverables[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { valid: false, error: `Deliverable at index ${i} must be an object` };
    }
    const { filename, url, size } = item as Record<string, unknown>;
    if (filename !== undefined && (typeof filename !== 'string' || filename.trim().length === 0 || filename.length > 255 || filename.includes('..') || filename.includes('\0'))) {
      return { valid: false, error: `Invalid filename at deliverable index ${i}` };
    }
    if (typeof url !== 'string' || url.trim().length === 0) {
      return { valid: false, error: `Valid URL is required for deliverable at index ${i}` };
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { valid: false, error: `Deliverable URL at index ${i} must use http or https protocol` };
      }
      const host = parsed.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0' || host === '169.254.169.254' || host === 'metadata.google.internal') {
        return { valid: false, error: `Deliverable URL at index ${i} targets a restricted host` };
      }
    } catch {
      return { valid: false, error: `Invalid URL format at deliverable index ${i}` };
    }
    if (size !== undefined && (typeof size !== 'number' || !Number.isFinite(size) || size < 0 || size > 100 * 1024 * 1024)) {
      return { valid: false, error: `Invalid file size at deliverable index ${i}` };
    }
  }
  return { valid: true };
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
router.get('/:id', authMiddleware, validateUUID(), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const milestoneId = req.params['id'] ?? '';
    const userId = req.user?.userId;
    // M15: Pass userId to enforce authorization check
    const result = await getMilestoneById(milestoneId, userId);

    if (!result.success) {
      const errorResult = 'error' in result ? result.error : { code: 'NOT_FOUND', message: 'Milestone not found' };
      return sendErrorResponse(res, 404, errorResult.code, errorResult.message, { requestId: getRequestId(req) });
    }

    return res.json(result.data.milestone);
  } catch (error) {
    logger.error('Error getting milestone', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Something went wrong fetching this milestone', { requestId: getRequestId(req) });
  }
}));

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
router.get('/contract/:contractId', authMiddleware, validateUUID(['contractId']), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const contractId = req.params['contractId'] ?? '';
    // BLF-9.1: Pass userId to enforce ownership check
    const result = await getContractMilestones(contractId, req.user?.userId);

    if (!result.success) {
      const errorResult = 'error' in result ? result.error : { code: 'FETCH_FAILED', message: 'Failed to get milestones' };
      const statusCode = errorResult.code === 'NOT_FOUND' ? 404 : errorResult.code === 'UNAUTHORIZED' ? 403 : 400;
      return sendErrorResponse(res, statusCode, errorResult.code, errorResult.message, { requestId: getRequestId(req) });
    }

    return res.json(result.data);
  } catch (error) {
    logger.error('Error getting contract milestones', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to get milestones', { requestId: getRequestId(req) });
  }
}));

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
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const milestoneId = req.params['id'] ?? '';
      const userId = req.user?.userId ?? '';
      const files = req.files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'No files provided', { requestId: getRequestId(req) });
      }

      // Verify milestone ownership via freelancer's contracts/projects
      const context = await findFreelancerMilestoneContext(userId, milestoneId);
      if (!context) {
        return sendErrorResponse(res, 404, 'NOT_FOUND', 'Milestone not found', { requestId: getRequestId(req) });
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
      return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to upload files', { requestId: getRequestId(req) });
    }
  })
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
router.post('/:id/submit', authMiddleware, requireRole('freelancer'), validateUUID(), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const milestoneId = req.params['id'] ?? '';
    const userId = req.user?.userId ?? '';
    const { deliverables, notes } = req.body;

    if (deliverables !== undefined) {
      const val = validateDeliverablesList(deliverables);
      if (!val.valid) {
        return sendErrorResponse(res, 400, 'VALIDATION_ERROR', val.error || 'Invalid deliverables', { requestId: getRequestId(req) });
      }
    }
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 5000)) {
      return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Notes must be at most 5000 characters', { requestId: getRequestId(req) });
    }

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
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to submit milestone', { requestId: getRequestId(req) });
  }
}));

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
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const milestoneId = req.params['id'] ?? '';
      const userId = req.user?.userId ?? '';
      const { notes, existingDeliverables } = req.body;
      const files = req.files as Express.Multer.File[] | undefined;

      // Parse existing deliverables if provided
      let existingFiles: any[] = [];
      if (existingDeliverables) {
        try {
          existingFiles = typeof existingDeliverables === 'string' ? JSON.parse(existingDeliverables) : existingDeliverables;
        } catch {
          return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid existingDeliverables format', { requestId: getRequestId(req) });
        }
        const val = validateDeliverablesList(existingFiles);
        if (!val.valid) {
          return sendErrorResponse(res, 400, 'VALIDATION_ERROR', val.error || 'Invalid existingDeliverables', { requestId: getRequestId(req) });
        }
      }

      if (notes !== undefined && (typeof notes !== 'string' || notes.length > 5000)) {
        return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Notes must be at most 5000 characters', { requestId: getRequestId(req) });
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
        return sendErrorResponse(res, statusCode, errorResult.code, errorResult.message, { requestId: getRequestId(req) });
      }

      return res.json({
        ...result.data,
        uploadedFiles: newFiles.length,
        totalFiles: allDeliverables.length,
      });
    } catch (error) {
      logger.error('Error submitting milestone with files', error);
      return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to submit milestone with files', { requestId: getRequestId(req) });
    }
  })
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
router.post('/:id/approve', authMiddleware, requireRole('employer'), validateUUID(), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const milestoneId = req.params['id'] ?? '';
    const userId = req.user?.userId ?? '';

    // Find the contract containing this milestone by scanning employer's contracts
    const contractId = await findEmployerMilestoneContractId(userId, milestoneId);

    if (!contractId) {
      return sendErrorResponse(res, 404, 'NOT_FOUND', 'Milestone not found in any of your contracts', { requestId: getRequestId(req) });
    }

    // Use payment-service approveMilestone which handles blockchain escrow release + project milestone update
    const result = await approveMilestoneWithPayment(contractId, milestoneId, userId);

    if (!result.success) {
      const message = 'error' in result ? result.error.message : 'Failed to approve milestone';
      const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
        result.error.code === 'UNAUTHORIZED' ? 403 :
        result.error.code === 'ESCROW_NOT_FOUND' || result.error.code === 'MISSING_WALLET' ? 422 : 400;
      return sendErrorResponse(res, statusCode, result.error.code, message, { requestId: getRequestId(req) });
    }

    return res.json(result.data);
  } catch (error) {
    logger.error('Error approving milestone', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to approve milestone', { requestId: getRequestId(req) });
  }
}));

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
router.post('/:id/reject', authMiddleware, requireRole('employer'), validateUUID(), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const milestoneId = req.params['id'] ?? '';
    const userId = req.user?.userId ?? '';
    const { reason, requestRevision } = req.body;

    if (!reason) {
      return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Rejection reason is required', { requestId: getRequestId(req) });
    }

    const result = await rejectMilestone({
      milestoneId,
      employerId: userId,
      reason,
      requestRevision: requestRevision || false,
    });

    if (!result.success) {
      const errorResult = 'error' in result ? result.error : { code: 'REJECT_FAILED', message: 'Failed to reject milestone' };
      return sendErrorResponse(res, 400, errorResult.code, errorResult.message, { requestId: getRequestId(req) });
    }

    return res.json(result.data);
  } catch (error) {
    logger.error('Error rejecting milestone', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to reject milestone', { requestId: getRequestId(req) });
  }
}));

export default router;
