import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, requireVerifiedKyc } from '../middleware/auth-middleware.js';
import { validateUUID, isValidUUID } from '../middleware/validation-middleware.js';
import { uploadDisputeEvidence } from '../middleware/file-upload-middleware.js';
import { clampLimit } from '../utils/index.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import { fileUploadRateLimiter, apiRateLimiter } from '../middleware/rate-limiter.js';
import { uploadFileToStorage, cleanupUploadedFiles } from '../utils/storage-uploader.js';
import { BUCKETS as STORAGE_BUCKETS } from '../config/appwrite.js';
import {
  createDispute,
  submitEvidence,
  resolveDispute,
  getDisputeById,
  getAllDisputes,
} from '../services/dispute-service.js';
import { getContractById } from '../services/contract-service.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Evidence:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         submitterId:
 *           type: string
 *         type:
 *           type: string
 *           enum: [text, file, link]
 *         content:
 *           type: string
 *         submittedAt:
 *           type: string
 *           format: date-time
 *     DisputeResolution:
 *       type: object
 *       properties:
 *         decision:
 *           type: string
 *           enum: [freelancer_favor, employer_favor, split]
 *         reasoning:
 *           type: string
 *         resolvedBy:
 *           type: string
 *         resolvedAt:
 *           type: string
 *           format: date-time
 *     Dispute:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         contractId:
 *           type: string
 *         milestoneId:
 *           type: string
 *         initiatorId:
 *           type: string
 *         reason:
 *           type: string
 *         evidence:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Evidence'
 *         status:
 *           type: string
 *           enum: [open, under_review, resolved]
 *         resolution:
 *           $ref: '#/components/schemas/DisputeResolution'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateDisputeRequest:
 *       type: object
 *       required:
 *         - contractId
 *         - milestoneId
 *         - reason
 *       properties:
 *         contractId:
 *           type: string
 *         milestoneId:
 *           type: string
 *         reason:
 *           type: string
 *     SubmitEvidenceRequest:
 *       type: object
 *       required:
 *         - type
 *         - content
 *       properties:
 *         type:
 *           type: string
 *           enum: [text, file, link]
 *         content:
 *           type: string
 *     ResolveDisputeRequest:
 *       type: object
 *       required:
 *         - decision
 *         - reasoning
 *       properties:
 *         decision:
 *           type: string
 *           enum: [freelancer_favor, employer_favor, split]
 *         reasoning:
 *           type: string
 *         freelancerBps:
 *           type: integer
 *           minimum: 1
 *           maximum: 9999
 *           description: >
 *             Portion of the milestone awarded to the freelancer in basis points (0-10000).
 *             Only used when decision is 'split'; defaults to 5000 (50/50).
 */


/**
 * @swagger
 * /api/disputes:
 *   get:
 *     summary: List all disputes
 *     description: Get all disputes (admin sees all, users see only their own)
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, under_review, resolved]
 *         description: Filter by dispute status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of items to return
 *     responses:
 *       200:
 *         description: List of disputes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Dispute'
 *                 continuationToken:
 *                   type: string
 *                   nullable: true
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  authMiddleware,
  requireVerifiedKyc,
  apiRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const userRole = req.user?.role;
      const status = req.query['status'] as string | undefined;
      const limit = clampLimit(req.query['limit'] ? parseInt(req.query['limit'] as string) : undefined);

      if (!userId || !userRole) {
        sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', getRequestId(req));
        return;
      }

      const result = await getAllDisputes(userId, userRole, { 
        ...(status && { status }), 
        limit 
      });

      if (!result.success) {
        sendErrorResponse(res, 400, result.error.code, result.error.message, getRequestId(req), result.error.details);
        return;
      }

      res.json(result.data);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/disputes:
 *   post:
 *     summary: Create a new dispute
 *     description: Create a dispute for a milestone, locking associated funds
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateDisputeRequest'
 *     responses:
 *       201:
 *         description: Dispute created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dispute'
 *       400:
 *         description: Invalid request or milestone already disputed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User not authorized to create dispute
 *       404:
 *         description: Contract or milestone not found
 */
router.post(
  '/',
  authMiddleware,
  requireVerifiedKyc,
  apiRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const { contractId, milestoneId, reason } = req.body as {
        contractId?: string;
        milestoneId?: string;
        reason?: string;
      };

      if (!userId) {
        sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', getRequestId(req));
        return;
      }

      if (!contractId || typeof contractId !== 'string') {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'contractId is required', getRequestId(req));
        return;
      }

      if (!isValidUUID(contractId)) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'contractId must be a valid UUID', getRequestId(req));
        return;
      }

      if (!milestoneId || typeof milestoneId !== 'string') {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'milestoneId is required', getRequestId(req));
        return;
      }

      if (!isValidUUID(milestoneId)) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'milestoneId must be a valid UUID', getRequestId(req));
        return;
      }

      if (!reason || typeof reason !== 'string') {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'reason is required', getRequestId(req));
        return;
      }

      const result = await createDispute({
        contractId,
        milestoneId,
        initiatorId: userId,
        reason,
      });

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                          result.error.code === 'UNAUTHORIZED' ? 403 :
                          result.error.code === 'ALREADY_DISPUTED' ? 409 :
                          result.error.code === 'DUPLICATE_DISPUTE' ? 409 : 400;
        sendErrorResponse(res, statusCode, result.error.code, result.error.message, getRequestId(req), result.error.details);
        return;
      }

      res.status(201).json(result.data);
    } catch (error) {
      next(error);
    }
  }
);


/**
 * @swagger
 * /api/disputes/{disputeId}:
 *   get:
 *     summary: Get dispute details
 *     description: Get details of a specific dispute
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: disputeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The dispute ID (UUID)
 *     responses:
 *       200:
 *         description: Dispute details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dispute'
 *       400:
 *         description: Invalid UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Dispute not found
 */
router.get(
  '/:disputeId',
  authMiddleware,
  requireVerifiedKyc,
  apiRateLimiter,
  validateUUID(['disputeId']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const disputeId = req.params['disputeId'] ?? '';

      if (!userId) {
        sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', getRequestId(req));
        return;
      }

      const result = await getDisputeById(disputeId);

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 400;
        sendErrorResponse(res, statusCode, result.error.code, result.error.message, getRequestId(req), result.error.details);
        return;
      }

      // Authorization check - only dispute parties and admins can view dispute details
      const dispute = result.data;
      if (req.user?.role !== 'admin' && dispute.initiatorId !== userId) {
        // Check if user is the other contract party via the contract
        const contractResult = await getContractById(dispute.contractId);
        if (contractResult.success) {
          const contract = contractResult.data;
          if (contract.freelancerId !== userId && contract.employerId !== userId) {
            sendErrorResponse(res, 403, 'UNAUTHORIZED', 'You are not authorized to view this dispute', getRequestId(req));
            return;
          }
        } else {
          // Contract not found — deny access as a precaution
          sendErrorResponse(res, 403, 'UNAUTHORIZED', 'You are not authorized to view this dispute', getRequestId(req));
          return;
        }
      }

      res.json(result.data);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/disputes/{disputeId}/evidence:
 *   post:
 *     summary: Submit evidence for a dispute
 *     description: Submit evidence to support a dispute case. Supports both multipart/form-data (server-side upload) and application/json (URL-reference pattern).
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: disputeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The dispute ID (UUID)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - files
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [file]
 *                 description: Must be 'file' for multipart uploads
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 minItems: 1
 *                 maxItems: 1
 *                 description: Single file upload (max 10MB)
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SubmitEvidenceRequest'
 *     responses:
 *       200:
 *         description: Evidence submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dispute'
 *       400:
 *         description: Invalid request, invalid UUID format, or dispute already resolved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User not authorized to submit evidence
 *       404:
 *         description: Dispute not found
 */
router.post(
  '/:disputeId/evidence',
  authMiddleware,
  requireVerifiedKyc,
  apiRateLimiter,
  validateUUID(['disputeId']),
  async (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers['content-type'] || '';
    
    // Route to appropriate handler based on Content-Type
    if (contentType.includes('multipart/form-data')) {
      // Server-side file upload pattern
      return handleMultipartEvidenceSubmission(req, res, next);
    } else {
      // URL-reference pattern (backward compatibility)
      return handleJsonEvidenceSubmission(req, res, next);
    }
  }
);

/**
 * Handle evidence submission with multipart/form-data (server-side upload)
 */
async function handleMultipartEvidenceSubmission(req: Request, res: Response, next: NextFunction) {
  // Apply rate limiting for file uploads
  fileUploadRateLimiter(req, res, async (err?: unknown) => {
    if (err || res.headersSent) return;
    
    // Apply file upload middleware (single file for evidence)
    const middleware = uploadDisputeEvidence;
  
  // Execute middleware array
  let index = 0;
  const executeMiddleware = async () => {
    if (index >= middleware.length) {
      // All middleware executed, now process the upload
      return processMultipartEvidence(req, res, next);
    }
    
    const currentMiddleware = middleware[index++];
    if (!currentMiddleware) return;
    await new Promise<void>((resolve, reject) => {
      currentMiddleware(req, res, (err?: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    return executeMiddleware();
  };
  
  try {
    await executeMiddleware();
  } catch {
    // Middleware already sent response for validation errors
    if (res.headersSent) return;
    
    // Handle unexpected errors
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'An error occurred processing the upload', getRequestId(req));
  }
  });
}

/**
 * Process multipart evidence after file is validated
 */
async function processMultipartEvidence(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    const disputeId = req.params['disputeId'] ?? '';
    const files = req.files as Express.Multer.File[] | undefined;
    const { _type } = req.body;

    if (!userId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', getRequestId(req));
      return;
    }

    if (!files || files.length === 0) {
      sendErrorResponse(res, 400, 'NO_FILES', 'At least 1 file is required', getRequestId(req));
      return;
    }

    // For evidence, we typically upload one file at a time
    const file = files[0];
    if (!file) {
      sendErrorResponse(res, 400, 'NO_FILES', 'At least 1 file is required', getRequestId(req));
      return;
    }
    const mimeType = (file as Express.Multer.File & { detectedMimeType?: string }).detectedMimeType || file.mimetype;
    
    // Upload file to Appwrite Storage
    const uploadResult = await uploadFileToStorage(
      file.buffer,
      file.originalname,
      mimeType,
      STORAGE_BUCKETS.DISPUTE_EVIDENCE,
      userId
    );
    
    if (!uploadResult.success) {
      sendErrorResponse(res, 500, 'UPLOAD_FAILED', uploadResult.error || 'Failed to upload file', getRequestId(req));
      return;
    }
    
    // Submit evidence with file URL as content
    const result = await submitEvidence({
      disputeId,
      submitterId: userId,
      type: 'file',
      content: uploadResult.metadata!.url,
    });

    if (!result.success) {
      // Cleanup uploaded file if evidence submission fails
      if (uploadResult.metadata) {
        await cleanupUploadedFiles([uploadResult.metadata], STORAGE_BUCKETS.DISPUTE_EVIDENCE);
      }
      
      const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                        result.error.code === 'UNAUTHORIZED' ? 403 :
                        result.error.code === 'INVALID_STATUS' ? 400 : 400;
      sendErrorResponse(res, statusCode, result.error.code, result.error.message, getRequestId(req), result.error.details);
      return;
    }

    res.json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Handle evidence submission with application/json (URL-reference pattern)
 */
async function handleJsonEvidenceSubmission(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    const disputeId = req.params['disputeId'] ?? '';
    const { type, content } = req.body as {
      type?: 'text' | 'file' | 'link';
      content?: string;
    };

    if (!userId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', getRequestId(req));
      return;
    }

    if (!type || !['text', 'file', 'link'].includes(type)) {
      sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'type must be one of: text, file, link', getRequestId(req));
      return;
    }

    if (!content || typeof content !== 'string') {
      sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'content is required', getRequestId(req));
      return;
    }

    const result = await submitEvidence({
      disputeId,
      submitterId: userId,
      type,
      content,
    });

    if (!result.success) {
      const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                        result.error.code === 'UNAUTHORIZED' ? 403 :
                        result.error.code === 'INVALID_STATUS' ? 400 : 400;
      sendErrorResponse(res, statusCode, result.error.code, result.error.message, getRequestId(req), result.error.details);
      return;
    }

    res.json(result.data);
  } catch (error) {
    next(error);
  }
}


/**
 * @swagger
 * /api/disputes/{disputeId}/resolve:
 *   post:
 *     summary: Resolve a dispute (admin only)
 *     description: Admin resolves a dispute, triggering payment based on decision
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: disputeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The dispute ID (UUID)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResolveDisputeRequest'
 *     responses:
 *       200:
 *         description: Dispute resolved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dispute'
 *       400:
 *         description: Invalid request, invalid UUID format, or dispute already resolved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User not authorized to resolve disputes
 *       404:
 *         description: Dispute not found
 */
router.post(
  '/:disputeId/resolve',
  authMiddleware,
  requireVerifiedKyc,
  apiRateLimiter,
  validateUUID(['disputeId']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const userRole = req.user?.role;
      const disputeId = req.params['disputeId'] ?? '';
      const { decision, reasoning, freelancerBps } = req.body as {
        decision?: 'freelancer_favor' | 'employer_favor' | 'split';
        reasoning?: string;
        freelancerBps?: number;
      };

      if (!userId) {
        sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', getRequestId(req));
        return;
      }

      // Only admins can resolve disputes
      if (userRole !== 'admin') {
        sendErrorResponse(res, 403, 'AUTH_UNAUTHORIZED', 'Only administrators can resolve disputes', getRequestId(req));
        return;
      }

      if (!decision || !['freelancer_favor', 'employer_favor', 'split'].includes(decision)) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'decision must be one of: freelancer_favor, employer_favor, split', getRequestId(req));
        return;
      }

      if (freelancerBps !== undefined && (
        typeof freelancerBps !== 'number' ||
        !Number.isInteger(freelancerBps) ||
        freelancerBps < 0 ||
        freelancerBps > 10000
      )) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'freelancerBps must be an integer between 0 and 10000', getRequestId(req));
        return;
      }

      // Basis points are only meaningful for split decisions; freelancer_favor = 10000,
      // employer_favor = 0 are computed in the service. Reject an explicit bps that would
      // contradict the chosen decision to avoid ambiguous resolutions.
      if (decision !== 'split' && freelancerBps !== undefined) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'freelancerBps can only be provided when decision is split', getRequestId(req));
        return;
      }

      if (decision === 'split' && (freelancerBps === 0 || freelancerBps === 10000)) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'freelancerBps must be between 1 and 9999 for a split decision', getRequestId(req));
        return;
      }

      if (!reasoning || typeof reasoning !== 'string') {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'reasoning is required', getRequestId(req));
        return;
      }

      const result = await resolveDispute({
        disputeId,
        decision,
        reasoning,
        resolvedBy: userId,
        resolverRole: 'admin',
        ...(decision === 'split' && freelancerBps !== undefined ? { freelancerBps } : {}),
      });

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                          result.error.code === 'ALREADY_RESOLVED' ? 400 : 400;
        sendErrorResponse(res, statusCode, result.error.code, result.error.message, getRequestId(req), result.error.details);
        return;
      }

      res.json(result.data);
    } catch (error) {
      next(error);
    }
  }
);


export default router;
