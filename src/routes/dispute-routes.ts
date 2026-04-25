/**
 * Dispute Routes
 * API endpoints for dispute creation, evidence submission, and resolution
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, requireVerifiedKyc } from '../middleware/auth-middleware.js';
import { validateUUID, isValidUUID } from '../middleware/validation-middleware.js';
import { uploadDisputeEvidence } from '../middleware/file-upload-middleware.js';
import { clampLimit } from '../utils/index.js';
import { fileUploadRateLimiter, apiRateLimiter } from '../middleware/rate-limiter.js';
import { uploadFileToStorage, cleanupUploadedFiles } from '../utils/storage-uploader.js';
import { STORAGE_BUCKETS } from '../config/supabase.js';
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
 *           enum: [freelancer_favor, employer_favor]
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
 *           enum: [freelancer_favor, employer_favor]
 *         reasoning:
 *           type: string
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
        res.status(401).json({
          error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      const result = await getAllDisputes(userId, userRole, { 
        ...(status && { status }), 
        limit 
      });

      if (!result.success) {
        res.status(400).json({ error: result.error });
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
        res.status(401).json({
          error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      if (!contractId || typeof contractId !== 'string') {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'contractId is required' },
        });
        return;
      }

      if (!isValidUUID(contractId)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'contractId must be a valid UUID' },
        });
        return;
      }

      if (!milestoneId || typeof milestoneId !== 'string') {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'milestoneId is required' },
        });
        return;
      }

      if (!isValidUUID(milestoneId)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'milestoneId must be a valid UUID' },
        });
        return;
      }

      if (!reason || typeof reason !== 'string') {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'reason is required' },
        });
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
        res.status(statusCode).json({ error: result.error });
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
  apiRateLimiter,
  validateUUID(['disputeId']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const disputeId = req.params['disputeId'] ?? '';

      if (!userId) {
        res.status(401).json({
          error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      const result = await getDisputeById(disputeId);

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 400;
        res.status(statusCode).json({ error: result.error });
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
            res.status(403).json({
              error: { code: 'UNAUTHORIZED', message: 'You are not authorized to view this dispute' },
            });
            return;
          }
        } else {
          // Contract not found — deny access as a precaution
          res.status(403).json({
            error: { code: 'UNAUTHORIZED', message: 'You are not authorized to view this dispute' },
          });
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
  fileUploadRateLimiter(req, res, async (err?: any) => {
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
      currentMiddleware(req, res, (err?: any) => {
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
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An error occurred processing the upload' },
    });
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
      res.status(401).json({
        error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      });
      return;
    }

    if (!files || files.length === 0) {
      res.status(400).json({
        error: { code: 'NO_FILES', message: 'At least 1 file is required' },
      });
      return;
    }

    // For evidence, we typically upload one file at a time
    const file = files[0];
    if (!file) {
      res.status(400).json({
        error: { code: 'NO_FILES', message: 'At least 1 file is required' },
      });
      return;
    }
    const mimeType = (file as any).detectedMimeType || file.mimetype;
    
    // Upload file to Supabase Storage
    const uploadResult = await uploadFileToStorage(
      file.buffer,
      file.originalname,
      mimeType,
      STORAGE_BUCKETS.DISPUTE_EVIDENCE,
      `evidence/${disputeId}`
    );
    
    if (!uploadResult.success) {
      res.status(500).json({
        error: { 
          code: 'UPLOAD_FAILED', 
          message: uploadResult.error || 'Failed to upload file',
        },
      });
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
      res.status(statusCode).json({ error: result.error });
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
      res.status(401).json({
        error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      });
      return;
    }

    if (!type || !['text', 'file', 'link'].includes(type)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'type must be one of: text, file, link' },
      });
      return;
    }

    if (!content || typeof content !== 'string') {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'content is required' },
      });
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
      res.status(statusCode).json({ error: result.error });
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
      const { decision, reasoning } = req.body as {
        decision?: 'freelancer_favor' | 'employer_favor';
        reasoning?: string;
      };

      if (!userId) {
        res.status(401).json({
          error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      // Only admins can resolve disputes
      if (userRole !== 'admin') {
        res.status(403).json({
          error: { code: 'AUTH_UNAUTHORIZED', message: 'Only administrators can resolve disputes' },
        });
        return;
      }

      if (!decision || !['freelancer_favor', 'employer_favor'].includes(decision)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'decision must be one of: freelancer_favor, employer_favor' },
        });
        return;
      }

      if (!reasoning || typeof reasoning !== 'string') {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'reasoning is required' },
        });
        return;
      }

      const result = await resolveDispute({
        disputeId,
        decision,
        reasoning,
        resolvedBy: userId,
        resolverRole: 'admin',
      });

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                          result.error.code === 'ALREADY_RESOLVED' ? 400 : 400;
        res.status(statusCode).json({ error: result.error });
        return;
      }

      res.json(result.data);
    } catch (error) {
      next(error);
    }
  }
);


export default router;
