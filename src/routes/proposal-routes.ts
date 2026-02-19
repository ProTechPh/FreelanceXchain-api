import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validateUUID, isValidUUID } from '../middleware/validation-middleware.js';
import { uploadProposalAttachments } from '../middleware/file-upload-middleware.js';
import { fileUploadRateLimiter } from '../middleware/rate-limiter.js';
import { uploadMultipleFiles, cleanupUploadedFiles } from '../utils/storage-uploader.js';
import { STORAGE_BUCKETS } from '../config/supabase.js';
import {
  submitProposal,
  getProposalById,
  getProposalsByFreelancer,
  acceptProposal,
  rejectProposal,
  withdrawProposal,
} from '../services/proposal-service.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     FileAttachment:
 *       type: object
 *       required:
 *         - url
 *         - filename
 *         - size
 *         - mimeType
 *       properties:
 *         url:
 *           type: string
 *           format: uri
 *           description: Supabase Storage URL of the uploaded file
 *         filename:
 *           type: string
 *           description: Original filename
 *         size:
 *           type: number
 *           description: File size in bytes
 *         mimeType:
 *           type: string
 *           description: MIME type of the file
 *     Proposal:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         projectId:
 *           type: string
 *         freelancerId:
 *           type: string
 *         coverLetter:
 *           type: string
 *           nullable: true
 *           description: Legacy text cover letter (deprecated)
 *         attachments:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/FileAttachment'
 *           description: File attachments (1-5 files)
 *         proposedRate:
 *           type: number
 *         estimatedDuration:
 *           type: number
 *           description: Duration in days
 *         status:
 *           type: string
 *           enum: [pending, accepted, rejected, withdrawn]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */


/**
 * @swagger
 * /api/proposals:
 *   post:
 *     summary: Submit proposal
 *     description: Submit a proposal for a project with file attachments (freelancer only). Supports both multipart/form-data (server-side upload) and application/json (URL-reference pattern).
 *     tags:
 *       - Proposals
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - proposedRate
 *               - estimatedDuration
 *               - files
 *             properties:
 *               projectId:
 *                 type: string
 *                 format: uuid
 *               proposedRate:
 *                 type: number
 *                 minimum: 1
 *               estimatedDuration:
 *                 type: number
 *                 minimum: 1
 *                 description: Duration in days
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 minItems: 1
 *                 maxItems: 5
 *                 description: File attachments (1-5 files, max 10MB each, 25MB total)
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - attachments
 *               - proposedRate
 *               - estimatedDuration
 *             properties:
 *               projectId:
 *                 type: string
 *               attachments:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 5
 *                 items:
 *                   $ref: '#/components/schemas/FileAttachment'
 *                 description: File attachments (URL-reference pattern for backward compatibility)
 *               proposedRate:
 *                 type: number
 *                 minimum: 1
 *               estimatedDuration:
 *                 type: number
 *                 minimum: 1
 *                 description: Duration in days
 *     responses:
 *       201:
 *         description: Proposal submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Proposal'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 *       409:
 *         description: Duplicate proposal
 */
router.post('/', authMiddleware, requireRole('freelancer'), async (req: Request, res: Response, next) => {
  const contentType = req.headers['content-type'] || '';
  
  // Route to appropriate handler based on Content-Type
  if (contentType.includes('multipart/form-data')) {
    // Server-side file upload pattern
    return handleMultipartProposalSubmission(req, res, next);
  } else {
    // URL-reference pattern (backward compatibility)
    return handleJsonProposalSubmission(req, res);
  }
});

/**
 * Handle proposal submission with multipart/form-data (server-side upload)
 */
async function handleMultipartProposalSubmission(req: Request, res: Response, next: any) {
  // Apply rate limiting for file uploads
  fileUploadRateLimiter(req, res, async (err?: any) => {
    if (err || res.headersSent) return;
    
    // Apply file upload middleware
    const middleware = uploadProposalAttachments;
  
    // Execute middleware array
    let index = 0;
    const executeMiddleware = async () => {
      if (index >= middleware.length) {
        // All middleware executed, now process the upload
        return processMultipartProposal(req, res);
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
    } catch (error: any) {
      // Middleware already sent response for validation errors
      if (res.headersSent) return;
      
      // Handle unexpected errors
      const requestId = req.headers['x-request-id'] as string ?? 'unknown';
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'An error occurred processing the upload' },
        timestamp: new Date().toISOString(),
        requestId,
      });
    }
  });
}

/**
 * Process multipart proposal after files are validated
 */
async function processMultipartProposal(req: Request, res: Response) {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  
  if (!userId) {
    return res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
  
  const files = req.files as Express.Multer.File[] | undefined;
  const { projectId, proposedRate, estimatedDuration } = req.body;
  
  // Validate input
  const errors: { field: string; message: string }[] = [];
  if (!projectId || typeof projectId !== 'string') {
    errors.push({ field: 'projectId', message: 'Project ID is required' });
  } else if (!isValidUUID(projectId)) {
    errors.push({ field: 'projectId', message: 'Project ID must be a valid UUID' });
  }
  
  const rate = Number(proposedRate);
  const duration = Number(estimatedDuration);
  
  if (isNaN(rate) || rate < 1) {
    errors.push({ field: 'proposedRate', message: 'Proposed rate must be at least 1' });
  }
  if (isNaN(duration) || duration < 1) {
    errors.push({ field: 'estimatedDuration', message: 'Estimated duration must be at least 1 day' });
  }
  
  if (errors.length > 0) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
  
  if (!files || files.length === 0) {
    return res.status(400).json({
      error: { code: 'NO_FILES', message: 'At least 1 file is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
  
  // Upload files to Supabase Storage
  const uploadResults = await uploadMultipleFiles(files, STORAGE_BUCKETS.PROPOSAL_ATTACHMENTS, userId);
  
  // Check for upload failures
  const failedUploads = uploadResults.filter(r => !r.success);
  if (failedUploads.length > 0) {
    // Cleanup any successfully uploaded files
    const successfulUploads = uploadResults.filter(r => r.success && r.metadata);
    if (successfulUploads.length > 0) {
      await cleanupUploadedFiles(
        successfulUploads.map(r => r.metadata!),
        STORAGE_BUCKETS.PROPOSAL_ATTACHMENTS
      );
    }
    
    return res.status(500).json({
      error: { 
        code: 'UPLOAD_FAILED', 
        message: 'Failed to upload one or more files',
        details: failedUploads.map(r => r.error),
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
  
  // Extract file metadata
  const attachments = uploadResults.map(r => r.metadata!);
  
  // Submit proposal with file metadata
  const result = await submitProposal(userId, { 
    projectId, 
    attachments, 
    proposedRate: rate, 
    estimatedDuration: duration 
  });
  
  if (!result.success) {
    // Cleanup uploaded files if proposal submission fails
    await cleanupUploadedFiles(attachments, STORAGE_BUCKETS.PROPOSAL_ATTACHMENTS);
    
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'DUPLICATE_PROPOSAL') statusCode = 409;
    
    return res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message, details: result.error.details },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
  
  return res.status(201).json(result.data.proposal);
}

/**
 * Handle proposal submission with application/json (URL-reference pattern)
 */
async function handleJsonProposalSubmission(req: Request, res: Response) {
  const { projectId, attachments, proposedRate, estimatedDuration } = req.body;
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    return res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  // Validate input
  const errors: { field: string; message: string }[] = [];
  if (!projectId || typeof projectId !== 'string') {
    errors.push({ field: 'projectId', message: 'Project ID is required' });
  } else if (!isValidUUID(projectId)) {
    errors.push({ field: 'projectId', message: 'Project ID must be a valid UUID' });
  }
  if (!attachments || !Array.isArray(attachments)) {
    errors.push({ field: 'attachments', message: 'Attachments must be an array' });
  }
  if (!proposedRate || typeof proposedRate !== 'number' || proposedRate < 1) {
    errors.push({ field: 'proposedRate', message: 'Proposed rate must be at least 1' });
  }
  if (!estimatedDuration || typeof estimatedDuration !== 'number' || estimatedDuration < 1) {
    errors.push({ field: 'estimatedDuration', message: 'Estimated duration must be at least 1 day' });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  const result = await submitProposal(userId, { projectId, attachments, proposedRate, estimatedDuration });

  if (!result.success) {
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'DUPLICATE_PROPOSAL') statusCode = 409;
    
    return res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message, details: result.error.details },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  return res.status(201).json(result.data.proposal);
}


/**
 * @swagger
 * /api/proposals/{id}:
 *   get:
 *     summary: Get proposal details
 *     description: Retrieves details of a specific proposal
 *     tags:
 *       - Proposals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Proposal ID (UUID)
 *     responses:
 *       200:
 *         description: Proposal retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Proposal'
 *       400:
 *         description: Invalid UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Proposal not found
 */
router.get('/:id', authMiddleware, validateUUID(), async (req: Request, res: Response) => {
  const id = req.params['id'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const result = await getProposalById(id);

  if (!result.success) {
    res.status(404).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/proposals/freelancer/me:
 *   get:
 *     summary: Get my proposals
 *     description: Retrieves all proposals submitted by the authenticated freelancer
 *     tags:
 *       - Proposals
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Proposals retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Proposal'
 *       401:
 *         description: Unauthorized
 */
router.get('/freelancer/me', authMiddleware, requireRole('freelancer'), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await getProposalsByFreelancer(userId);

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});


/**
 * @swagger
 * /api/proposals/{id}/accept:
 *   post:
 *     summary: Accept proposal
 *     description: Accept a proposal and create a contract (employer only)
 *     tags:
 *       - Proposals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Proposal ID (UUID)
 *     responses:
 *       200:
 *         description: Proposal accepted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 proposal:
 *                   $ref: '#/components/schemas/Proposal'
 *                 contract:
 *                   $ref: '#/components/schemas/Contract'
 *       400:
 *         description: Invalid proposal status or UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Proposal not found
 */
router.post('/:id/accept', authMiddleware, requireRole('employer'), validateUUID(), async (req: Request, res: Response) => {
  const proposalId = req.params['id'] ?? '';
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await acceptProposal(proposalId, userId);

  if (!result.success) {
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'UNAUTHORIZED') statusCode = 403;
    
    res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json({
    proposal: result.data.proposal,
    contract: result.data.contract,
  });
});

/**
 * @swagger
 * /api/proposals/{id}/reject:
 *   post:
 *     summary: Reject proposal
 *     description: Reject a proposal (employer only)
 *     tags:
 *       - Proposals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Proposal ID (UUID)
 *     responses:
 *       200:
 *         description: Proposal rejected successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Proposal'
 *       400:
 *         description: Invalid proposal status or UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Proposal not found
 */
router.post('/:id/reject', authMiddleware, requireRole('employer'), validateUUID(), async (req: Request, res: Response) => {
  const proposalId = req.params['id'] ?? '';
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await rejectProposal(proposalId, userId);

  if (!result.success) {
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'UNAUTHORIZED') statusCode = 403;
    
    res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data.proposal);
});


/**
 * @swagger
 * /api/proposals/{id}/withdraw:
 *   post:
 *     summary: Withdraw proposal
 *     description: Withdraw a pending proposal (freelancer only)
 *     tags:
 *       - Proposals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Proposal ID (UUID)
 *     responses:
 *       200:
 *         description: Proposal withdrawn successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Proposal'
 *       400:
 *         description: Invalid proposal status or UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Proposal not found
 */
router.post('/:id/withdraw', authMiddleware, requireRole('freelancer'), validateUUID(), async (req: Request, res: Response) => {
  const proposalId = req.params['id'] ?? '';
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await withdrawProposal(proposalId, userId);

  if (!result.success) {
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'UNAUTHORIZED') statusCode = 403;
    
    res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

export default router;
