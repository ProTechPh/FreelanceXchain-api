import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter, fileUploadRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse, sendSuccessResponse } from '../utils/response-helpers.js';
import { uploadPortfolioImages } from '../middleware/file-upload-middleware.js';
import { uploadMultipleFiles, cleanupUploadedFiles } from '../utils/storage-uploader.js';
import { BUCKETS as STORAGE_BUCKETS } from '../config/appwrite.js';
import {
  createPortfolioItem,
  updatePortfolioItem,
  deletePortfolioItem,
  getFreelancerPortfolio,
  getPortfolioItem,
} from '../services/portfolio-service.js';

const router = Router();

router.post('/', authMiddleware, requireRole('freelancer'), fileUploadRateLimiter, async (req: Request, res: Response) => {
  const contentType = req.headers['content-type'] || '';
  
  if (contentType.includes('multipart/form-data')) {
    return handleMultipartPortfolio(req, res);
  } else {
    return handleJsonPortfolio(req, res);
  }
});

async function handleMultipartPortfolio(req: Request, res: Response) {
  const middleware = uploadPortfolioImages;
  let index = 0;
  const executeMiddleware = async () => {
    if (index >= middleware.length) {
      return processMultipartPortfolio(req, res);
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
    if (res.headersSent) return;
    const requestId = getRequestId(req);
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'An error occurred processing the upload', requestId);
  }
}

async function processMultipartPortfolio(req: Request, res: Response) {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const files = req.files as Express.Multer.File[] | undefined;
  const { title, description, projectUrl, skills, completedAt } = req.body;

  if (!userId) {
    return sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', requestId);
  }

  if (!files || files.length === 0) {
    return sendErrorResponse(res, 400, 'NO_FILES', 'At least 1 image is required', requestId);
  }

  const uploadResults = await uploadMultipleFiles(files, STORAGE_BUCKETS.PORTFOLIO_IMAGES, userId);
  const failedUploads = uploadResults.filter(r => !r.success);
  
  if (failedUploads.length > 0) {
    const successfulUploads = uploadResults.filter(r => r.success && r.metadata);
    if (successfulUploads.length > 0) {
      await cleanupUploadedFiles(successfulUploads.map(r => r.metadata!), STORAGE_BUCKETS.PORTFOLIO_IMAGES);
    }
    return sendErrorResponse(res, 500, 'UPLOAD_FAILED', 'Failed to upload one or more files', requestId);
  }

  const images = uploadResults.map(r => r.metadata!);
  const skillsArray = typeof skills === 'string' ? skills.split(',').map((s: string) => s.trim()) : skills;

  const result = await createPortfolioItem(userId, {
    title,
    description,
    projectUrl,
    images,
    skills: skillsArray,
    completedAt,
  });

  if (!result.success) {
    await cleanupUploadedFiles(images, STORAGE_BUCKETS.PORTFOLIO_IMAGES);
    return sendErrorResponse(res, 400, result.error.code, result.error.message, requestId);
  }

  return res.status(201).json(result.data);
}

async function handleJsonPortfolio(req: Request, res: Response) {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const { title, description, projectUrl, images, skills, completedAt } = req.body;

  if (!userId) {
    return sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', requestId);
  }

  const result = await createPortfolioItem(userId, {
    title,
    description,
    projectUrl,
    images,
    skills,
    completedAt,
  });

  if (!result.success) {
    return sendErrorResponse(res, 400, result.error.code, result.error.message, requestId);
  }

  return res.status(201).json(result.data);
}

router.get('/freelancer/:freelancerId', apiRateLimiter, validateUUID(['freelancerId']), async (req: Request, res: Response) => {
  const freelancerId = req.params['freelancerId'] ?? '';
  const requestId = getRequestId(req);

  const result = await getFreelancerPortfolio(freelancerId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, requestId);
    return;
  }

  res.status(200).json(result.data);
});

router.get('/:id', apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const portfolioId = req.params['id'] ?? '';
  const requestId = getRequestId(req);

  const result = await getPortfolioItem(portfolioId);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : 400;
    sendErrorResponse(res, statusCode, result.error.code, result.error.message, requestId);
    return;
  }

  res.status(200).json(result.data);
});

router.patch('/:id', authMiddleware, requireRole('freelancer'), apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const portfolioId = req.params['id'] ?? '';
  const requestId = getRequestId(req);
  const updates = req.body;

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', requestId);
    return;
  }

  const result = await updatePortfolioItem(portfolioId, userId, updates);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : result.error?.code === 'UNAUTHORIZED' ? 403 : 400;
    sendErrorResponse(res, statusCode, result.error.code, result.error.message, requestId);
    return;
  }

  res.status(200).json(result.data);
});

router.delete('/:id', authMiddleware, requireRole('freelancer'), apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const portfolioId = req.params['id'] ?? '';
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', requestId);
    return;
  }

  const result = await deletePortfolioItem(portfolioId, userId);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : result.error?.code === 'UNAUTHORIZED' ? 403 : 400;
    sendErrorResponse(res, statusCode, result.error.code, result.error.message, requestId);
    return;
  }

  sendSuccessResponse(res, 200, { message: 'Portfolio item deleted' }, requestId);
});

export default router;
