/**
 * Secure File Access Routes
 * Provides authenticated file access through proxy endpoints
 * Prevents direct Appwrite URL access that bypasses authorization
 * Requirements: IAS Checklist - IDOR prevention (SEC-FILE-001)
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import { asyncHandler } from '../utils/async-handler.js';
import { storage, BUCKETS, type BucketId } from '../config/appwrite.js';
import { logger } from '../config/logger.js';
import { proposalRepository } from '../repositories/proposal-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { disputeRepository } from '../repositories/dispute-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';

const router = Router();

/**
 * Verify file ownership by checking the filename prefix
 * Format: {userId}_{uuid}_{filename}
 */
async function isFileOwnedBy(bucket: BucketId, fileId: string, userId: string): Promise<boolean> {
  try {
    const file = await storage.getFile(bucket, fileId);
    return file.name.startsWith(`${userId}_`);
  } catch {
    return false;
  }
}

function valueReferencesFile(value: unknown, fileId: string): boolean {
  if (typeof value === 'string') {
    if (value === fileId || value.split(/[/?#]/).includes(fileId)) return true;
    try {
      return valueReferencesFile(JSON.parse(value), fileId);
    } catch {
      return false;
    }
  }
  if (Array.isArray(value)) return value.some(item => valueReferencesFile(item, fileId));
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some(item => valueReferencesFile(item, fileId));
  return false;
}

async function hasResourceFileAccess(bucket: BucketId, fileId: string, userId: string): Promise<boolean> {
  if (bucket === BUCKETS.PROJECT_ATTACHMENTS) return true;

  if (bucket === BUCKETS.PROPOSAL_ATTACHMENTS) {
    const proposals = await proposalRepository.queryAll();
    const proposal = proposals.find(item => valueReferencesFile(item.attachments, fileId));
    if (!proposal) return false;
    if (proposal.freelancer_id === userId) return true;
    const project = await projectRepository.findProjectById(proposal.project_id);
    return project?.employer_id === userId;
  }

  if (bucket === BUCKETS.DISPUTE_EVIDENCE) {
    const disputes = await disputeRepository.queryAll();
    const dispute = disputes.find(item => valueReferencesFile(item.evidence, fileId));
    if (!dispute) return false;
    const contract = await contractRepository.getContractById(dispute.contract_id);
    return contract?.employer_id === userId || contract?.freelancer_id === userId;
  }

  if (bucket === BUCKETS.MILESTONE_DELIVERABLES) {
    const projects = await projectRepository.queryAll();
    const project = projects.find(item => valueReferencesFile(item.milestones, fileId));
    if (!project) return false;
    const contracts = await contractRepository.getContractsByProject(project.id);
    return contracts.some(contract => contract.employer_id === userId || contract.freelancer_id === userId);
  }

  return false;
}

/**
 * Check if user has access to a file based on its context
 */
async function hasFileAccess(
  bucket: BucketId,
  fileId: string,
  userId: string,
  userRole: string
): Promise<{ allowed: boolean; reason?: string }> {
  if (userRole === 'admin') {
    return { allowed: true };
  }

  // First check direct ownership
  const isOwner = await isFileOwnedBy(bucket, fileId, userId);
  if (isOwner) {
    return { allowed: true };
  }

  // Portfolio images are public for viewing by authenticated users
  if (bucket === BUCKETS.PORTFOLIO_IMAGES) {
    return { allowed: true };
  }

  if (await hasResourceFileAccess(bucket, fileId, userId)) {
    return { allowed: true };
  }

  // For other buckets, only owner or admin can access
  return {
    allowed: false,
    reason: 'Only authorized parties or admin can access this file',
  };
}

/**
 * GET /api/files/access/:bucket/:fileId
 * Access a file securely through proxy
 */
router.get(
  '/:bucket/:fileId',
  authMiddleware,
  apiRateLimiter,
  validateUUID(['fileId']),
  asyncHandler(async (req: Request, res: Response) => {
    const { bucket, fileId } = req.params as { bucket: string; fileId: string };
    const userId = req.user?.userId;
    const userRole = req.user?.role || 'user';
    const requestId = getRequestId(req);
    const download = req.query.download === 'true';

    if (!userId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
      return;
    }

    // Validate bucket
    if (!Object.values(BUCKETS).includes(bucket as BucketId)) {
      sendErrorResponse(res, 400, 'INVALID_BUCKET', `Invalid bucket: ${bucket}`, { requestId });
      return;
    }

    const bucketId = bucket as BucketId;

    try {
      // Get file metadata
      const file = await storage.getFile(bucketId, fileId);

      // Check access permissions
      const access = await hasFileAccess(bucketId, fileId, userId, userRole);
      if (!access.allowed) {
        logger.warn('Unauthorized file access attempt', {
          userId,
          bucket,
          fileId,
          reason: access.reason,
          requestId,
        });

        /* istanbul ignore next -- hasFileAccess always supplies a reason when access is denied */
        sendErrorResponse(res, 403, 'FORBIDDEN', access.reason || 'You do not have access to this file', { requestId });
        return;
      }

      // Log successful access
      logger.info('File access granted', {
        userId,
        bucket,
        fileId,
        filename: file.name,
        size: file.sizeOriginal,
        requestId,
      });

      // Get file content
      const fileContent = await storage.getFileDownload(bucketId, fileId);

      // Set appropriate headers
      const mimeType = file.mimeType || 'application/octet-stream';
      const filename = file.name.replace(/^[^_]+_[^_]+_/, '');

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', file.sizeOriginal.toString());

      if (download) {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      } else {
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
      }

      res.send(fileContent);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        sendErrorResponse(res, 404, 'FILE_NOT_FOUND', 'File not found', { requestId });
        return;
      }

      logger.error('Error streaming file', {
        error: errorMessage,
        userId,
        bucket,
        fileId,
        requestId,
      });

      sendErrorResponse(res, 500, 'FILE_STREAM_ERROR', 'Failed to retrieve file', { requestId });
    }
  })
);

/**
 * GET /api/files/access/:bucket/:fileId/info
 * Get file metadata without downloading
 */
router.get(
  '/:bucket/:fileId/info',
  authMiddleware,
  apiRateLimiter,
  validateUUID(['fileId']),
  asyncHandler(async (req: Request, res: Response) => {
    const { bucket, fileId } = req.params as { bucket: string; fileId: string };
    const userId = req.user?.userId;
    const userRole = req.user?.role || 'user';
    const requestId = getRequestId(req);

    if (!userId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
      return;
    }

    if (!Object.values(BUCKETS).includes(bucket as BucketId)) {
      sendErrorResponse(res, 400, 'INVALID_BUCKET', `Invalid bucket: ${bucket}`, { requestId });
      return;
    }

    const bucketId = bucket as BucketId;

    try {
      const file = await storage.getFile(bucketId, fileId);

      const access = await hasFileAccess(bucketId, fileId, userId, userRole);
      if (!access.allowed) {
        /* istanbul ignore next -- hasFileAccess always supplies a reason when access is denied */
        sendErrorResponse(res, 403, 'FORBIDDEN', access.reason || 'Access denied', { requestId });
        return;
      }

      res.json({
        id: file.$id,
        name: file.name.replace(/^[^_]+_[^_]+_/, ''),
        originalName: file.name,
        size: file.sizeOriginal,
        mimeType: file.mimeType,
        createdAt: file.$createdAt,
        updatedAt: file.$updatedAt,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        sendErrorResponse(res, 404, 'FILE_NOT_FOUND', 'File not found', { requestId });
        return;
      }

      sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to retrieve file information', { requestId });
    }
  })
);

/**
 * POST /api/files/access/batch
 * Convert Appwrite URLs to secure proxy URLs
 */
router.post(
  '/batch',
  authMiddleware,
  apiRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const requestId = getRequestId(req);
    const { urls } = req.body as { urls?: string[] };

    if (!userId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
      return;
    }

    if (!Array.isArray(urls)) {
      sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'urls must be an array', { requestId });
      return;
    }

    const converted = await Promise.all(urls.map(async (url) => {
      try {
        const appwriteMatch = url.match(/\/storage\/buckets\/([^/]+)\/files\/([^/]+)/);
        if (appwriteMatch) {
          const [, bucket, fileId] = appwriteMatch;
          if (!bucket || !fileId || !Object.values(BUCKETS).includes(bucket as BucketId)) {
            return { original: url, secure: null, accessible: false };
          }
          const access = await hasFileAccess(bucket as BucketId, fileId, userId, req.user?.role || 'user');
          return {
            original: url,
            secure: access.allowed ? `/api/files/access/${bucket}/${fileId}` : null,
            accessible: access.allowed,
          };
        }
        return { original: url, secure: null, accessible: false };
      } catch {
        return { original: url, secure: null, accessible: false };
      }
    }));

    res.json({ urls: converted });
  })
);

export default router;

