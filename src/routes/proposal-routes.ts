import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole, requireVerifiedKyc } from '../middleware/auth-middleware.js';
import { validateAppwriteDocumentId, isValidUUID, validate, submitProposalSchema, submitProposalMultipartSchema } from '../middleware/validation-middleware.js';
import { uploadProposalAttachments } from '../middleware/file-upload-middleware.js';
import { fileUploadRateLimiter, apiRateLimiter, withdrawalRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse, sendValidationError } from '../utils/response-helpers.js';
import { uploadMultipleFiles, cleanupUploadedFiles } from '../utils/storage-uploader.js';
import { BUCKETS as STORAGE_BUCKETS } from '../config/appwrite.js';
import { logger } from '../config/logger.js';

import {
  submitProposal,
  getProposalById,
  getProposalWithEmployerHistory,
  getProposalsByFreelancer,
  acceptProposal,
  rejectProposal,
  withdrawProposal,
} from '../services/proposal-service.js';
import { getProjectById } from '../services/project-service.js';
import { asyncHandler } from '../utils/async-handler.js';

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
 *           description: Appwrite Storage URL of the uploaded file
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
// lgtm[js/missing-rate-limiting] - Rate limiting implemented via fileUploadRateLimiter middleware
router.post('/', authMiddleware, requireRole('freelancer'), requireVerifiedKyc, fileUploadRateLimiter, (req: Request, res: Response) => {
  const contentType = req.headers['content-type'] || '';

  // Route to appropriate handler based on Content-Type
  if (contentType.includes('multipart/form-data')) {
    // Server-side file upload pattern
    return handleMultipartProposalSubmission(req, res);
  }

  // URL-reference pattern (backward compatibility) — validate the JSON body first
  return validate(submitProposalSchema)(req, res, () => handleJsonProposalSubmission(req, res));
});

/**
 * Handle proposal submission with multipart/form-data (server-side upload)
 */
async function handleMultipartProposalSubmission(req: Request, res: Response) {
  // Apply file upload middleware
  const middleware = uploadProposalAttachments;

  // Execute middleware array
  let index = 0;
  const executeMiddleware = async () => {
    if (index >= middleware.length) {
      // All middleware executed: validate the (string) form fields, then process
      // the upload. submitProposalMultipartSchema coerces numeric fields.
      return validate(submitProposalMultipartSchema)(req, res, () => processMultipartProposal(req, res));
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
    const requestId = getRequestId(req);
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'An error occurred processing the upload', { requestId });
  }
}

/**
 * Process multipart proposal after files are validated
 */
async function processMultipartProposal(req: Request, res: Response) {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  
  if (!userId) {
    return sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
  }
  
  const files = req.files as Express.Multer.File[] | undefined;
  // Field presence/types are enforced by the middleware (submitProposalMultipartSchema),
  // which also coerces proposedRate/estimatedDuration to numbers.
  const { projectId, proposedRate, estimatedDuration } = req.body;
  const rate = Number(proposedRate);
  const duration = Number(estimatedDuration);

  if (!files || files.length === 0) {
    return sendErrorResponse(res, 400, 'NO_FILES', 'At least 1 file is required', { requestId });
  }
  
  const uploadResults = await uploadMultipleFiles(files, STORAGE_BUCKETS.PROPOSAL_ATTACHMENTS, userId);
  
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
    
    return sendErrorResponse(res, 500, 'UPLOAD_FAILED', 'Failed to upload one or more files', { requestId, details: failedUploads.map(r => r.error) });
  }
  
  const attachments = uploadResults.map(r => r.metadata!);
  
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
    
    return sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId, details: result.error.details });
  }

  return res.status(201).json(result.data.proposal);
}

/**
 * Handle proposal submission with application/json (URL-reference pattern)
 */
async function handleJsonProposalSubmission(req: Request, res: Response) {
  const { projectId, attachments, proposedRate, estimatedDuration } = req.body;
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  if (!userId) {
    return sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
  }

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
    return sendValidationError(res, errors, requestId);
  }

  const result = await submitProposal(userId, { 
    projectId, 
    attachments, 
    proposedRate, 
    estimatedDuration
  });

  if (!result.success) {
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'DUPLICATE_PROPOSAL') statusCode = 409;
    
    return sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId, details: result.error.details });
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
// lgtm[js/missing-rate-limiting] - Rate limiting implemented via apiRateLimiter middleware
router.get('/:id', authMiddleware, apiRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] ?? '';
    const requestId = getRequestId(req);
    const userId = req.user?.userId;

    const result = await getProposalById(id);

    if (!result.success) {
      sendErrorResponse(res, 404, result.error.code, result.error.message, { requestId });
      return;
    }

    // Authorization check - only the freelancer who submitted the proposal,
    // the employer who owns the project, or an admin can view it
    const proposal = result.data;
    if (req.user?.role !== 'admin' && proposal.freelancerId !== userId) {
      // Check if the user is the employer of the project
      const projectResult = await getProjectById(proposal.projectId);
      if (!projectResult.success || projectResult.data.employer_id !== userId) {
        sendErrorResponse(res, 403, 'UNAUTHORIZED', 'You are not authorized to view this proposal', { requestId });
        return;
      }
    }

    res.status(200).json(result.data);
  } catch (error) {
    logger.error('Error fetching proposal', error);
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch proposal', { requestId: getRequestId(req) });
  }
}));

/**
 * @swagger
 * /api/proposals/{id}/with-employer-history:
 *   get:
 *     summary: Get proposal with employer history
 *     description: Retrieves proposal details along with employer's rating and completed projects count (freelancer only)
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
 *         description: Proposal with employer history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 proposal:
 *                   $ref: '#/components/schemas/Proposal'
 *                 project:
 *                   type: object
 *                   description: Project details
 *                 employerHistory:
 *                   type: object
 *                   properties:
 *                     completedProjectsCount:
 *                       type: number
 *                       description: Number of completed projects by employer
 *                     averageRating:
 *                       type: number
 *                       description: Average rating of employer (0-5)
 *                     reviewCount:
 *                       type: number
 *                       description: Total number of reviews received
 *                     companyName:
 *                       type: string
 *                       description: Employer's company name
 *                     industry:
 *                       type: string
 *                       description: Employer's industry
 *       400:
 *         description: Invalid UUID format
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - only freelancers can view employer history
 *       404:
 *         description: Proposal not found
 */
// lgtm[js/missing-rate-limiting] - Rate limiting implemented via apiRateLimiter middleware
router.get('/:id/with-employer-history', authMiddleware, requireRole('freelancer'), apiRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] ?? '';
    const requestId = getRequestId(req);
    const userId = req.user?.userId;

    if (!userId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
      return;
    }

    const result = await getProposalWithEmployerHistory(id);

    if (!result.success) {
      const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 400;
      sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId });
      return;
    }

    // Authorization check - only the freelancer who submitted the proposal can view employer history
    if (result.data.proposal.freelancerId !== userId) {
      sendErrorResponse(res, 403, 'UNAUTHORIZED', 'You are not authorized to view this proposal', { requestId });
      return;
    }

    res.status(200).json(result.data);
  } catch (error) {
    logger.error('Error fetching proposal with employer history', error);
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch proposal with employer history', { requestId: getRequestId(req) });
  }
}));

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
// lgtm[js/missing-rate-limiting] - Rate limiting implemented via apiRateLimiter middleware
router.get('/freelancer/me', authMiddleware, requireRole('freelancer'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await getProposalsByFreelancer(userId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));


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
// lgtm[js/missing-rate-limiting] - Rate limiting implemented via apiRateLimiter middleware
router.post('/:id/accept', authMiddleware, requireRole('employer'), requireVerifiedKyc, apiRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  try {
    const proposalId = req.params['id'] ?? '';
    const userId = req.user?.userId;
    const requestId = getRequestId(req);

    if (!userId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
      return;
    }

    const result = await acceptProposal(proposalId, userId);

    if (!result.success) {
      let statusCode = 400;
      if (result.error.code === 'NOT_FOUND') statusCode = 404;
      if (result.error.code === 'UNAUTHORIZED') statusCode = 403;
      
      sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId });
      return;
    }

    res.status(200).json({
      proposal: result.data.proposal,
      contract: result.data.contract,
    });
  } catch (error) {
    logger.error('Error accepting proposal', error);
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to accept proposal', { requestId: getRequestId(req) });
  }
}));

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
// lgtm[js/missing-rate-limiting] - Rate limiting implemented via apiRateLimiter middleware
router.post('/:id/reject', authMiddleware, requireRole('employer'), requireVerifiedKyc, apiRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  try {
    const proposalId = req.params['id'] ?? '';
    const userId = req.user?.userId;
    const requestId = getRequestId(req);

    if (!userId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
      return;
    }

    const result = await rejectProposal(proposalId, userId);

    if (!result.success) {
      let statusCode = 400;
      if (result.error.code === 'NOT_FOUND') statusCode = 404;
      if (result.error.code === 'UNAUTHORIZED') statusCode = 403;
      
      sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId });
      return;
    }

    res.status(200).json(result.data.proposal);
  } catch (error) {
    logger.error('Error rejecting proposal', error);
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to reject proposal', { requestId: getRequestId(req) });
  }
}));


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
// lgtm[js/missing-rate-limiting] - Rate limiting implemented via withdrawalRateLimiter middleware
router.post('/:id/withdraw', authMiddleware, requireRole('freelancer'), requireVerifiedKyc, withdrawalRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  try {
    const proposalId = req.params['id'] ?? '';
    const userId = req.user?.userId;
    const requestId = getRequestId(req);

    if (!userId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
      return;
    }

    const result = await withdrawProposal(proposalId, userId);

    if (!result.success) {
      let statusCode = 400;
      if (result.error.code === 'NOT_FOUND') statusCode = 404;
      if (result.error.code === 'UNAUTHORIZED') statusCode = 403;
      
      sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId });
      return;
    }

    res.status(200).json(result.data);
  } catch (error) {
    logger.error('Error withdrawing proposal', error);
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to withdraw proposal', { requestId: getRequestId(req) });
  }
}));

export default router;
