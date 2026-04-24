import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter, fileUploadRateLimiter } from '../middleware/rate-limiter.js';
import { uploadPortfolioImages } from '../middleware/file-upload-middleware.js';
import { uploadMultipleFiles, cleanupUploadedFiles } from '../utils/storage-uploader.js';
import { STORAGE_BUCKETS } from '../config/supabase.js';
import {
  createPortfolioItem,
  updatePortfolioItem,
  deletePortfolioItem,
  getFreelancerPortfolio,
  getPortfolioItem,
} from '../services/portfolio-service.js';

const router = Router();

router.post('/', authMiddleware, requireRole('freelancer'), fileUploadRateLimiter, async (req: Request, res: Response, next) => {
  const contentType = req.headers['content-type'] || '';
  
  if (contentType.includes('multipart/form-data')) {
    return handleMultipartPortfolio(req, res, next);
  } else {
    return handleJsonPortfolio(req, res);
  }
});

async function handleMultipartPortfolio(req: Request, res: Response, _next: any) {
  const middleware = uploadPortfolioImages;
  let index = 0;
  const executeMiddleware = async () => {
    if (index >= middleware.length) {
      return processMultipartPortfolio(req, res);
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
    if (res.headersSent) return;
    const requestId = req.headers['x-request-id'] as string ?? 'unknown';
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An error occurred processing the upload' },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
}

async function processMultipartPortfolio(req: Request, res: Response) {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const files = req.files as Express.Multer.File[] | undefined;
  const { title, description, projectUrl, skills, completedAt } = req.body;

  if (!userId) {
    return res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  if (!files || files.length === 0) {
    return res.status(400).json({
      error: { code: 'NO_FILES', message: 'At least 1 image is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  const uploadResults = await uploadMultipleFiles(files, STORAGE_BUCKETS.PORTFOLIO_IMAGES, userId);
  const failedUploads = uploadResults.filter(r => !r.success);
  
  if (failedUploads.length > 0) {
    const successfulUploads = uploadResults.filter(r => r.success && r.metadata);
    if (successfulUploads.length > 0) {
      await cleanupUploadedFiles(successfulUploads.map(r => r.metadata!), STORAGE_BUCKETS.PORTFOLIO_IMAGES);
    }
    return res.status(500).json({
      error: { code: 'UPLOAD_FAILED', message: 'Failed to upload one or more files' },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
    return res.status(400).json({
      error: { code: result.error?.code, message: result.error?.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  return res.status(201).json(result.data);
}

async function handleJsonPortfolio(req: Request, res: Response) {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const { title, description, projectUrl, images, skills, completedAt } = req.body;

  if (!userId) {
    return res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
    return res.status(400).json({
      error: { code: result.error?.code, message: result.error?.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  return res.status(201).json(result.data);
}

router.get('/freelancer/:freelancerId', apiRateLimiter, validateUUID(['freelancerId']), async (req: Request, res: Response) => {
  const freelancerId = req.params['freelancerId'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const result = await getFreelancerPortfolio(freelancerId);

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error?.code, message: result.error?.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

router.get('/:id', apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const portfolioId = req.params['id'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const result = await getPortfolioItem(portfolioId);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : 400;
    res.status(statusCode).json({
      error: { code: result.error?.code, message: result.error?.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

router.patch('/:id', authMiddleware, requireRole('freelancer'), apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const portfolioId = req.params['id'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const updates = req.body;

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await updatePortfolioItem(portfolioId, userId, updates);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : result.error?.code === 'UNAUTHORIZED' ? 403 : 400;
    res.status(statusCode).json({
      error: { code: result.error?.code, message: result.error?.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

router.delete('/:id', authMiddleware, requireRole('freelancer'), apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const portfolioId = req.params['id'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await deletePortfolioItem(portfolioId, userId);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : result.error?.code === 'UNAUTHORIZED' ? 403 : 400;
    res.status(statusCode).json({
      error: { code: result.error?.code, message: result.error?.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json({ message: 'Portfolio item deleted' });
});

export default router;
