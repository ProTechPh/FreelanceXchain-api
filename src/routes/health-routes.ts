import { Router, Request, Response } from 'express';
import { databases, DATABASE_ID } from '../config/appwrite.js';
import { asyncHandler } from '../utils/async-handler.js';
import { getApiVersion } from '../utils/version.js';

const router = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const health = {
    status: 'ok',
    version: getApiVersion(),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: 'unknown',
      api: 'ok',
    },
  };

  try {
    await databases.listDocuments(DATABASE_ID, 'users', []);
    health.services.database = 'ok';
  } catch {
    health.services.database = 'error';
  }

  const statusCode = health.services.database === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
}));

/**
 * @swagger
 * /api/health/ready:
 *   get:
 *     summary: Readiness check
 *     tags: [Health]
 */
router.get('/ready', asyncHandler(async (_req: Request, res: Response) => {
  try {
    await databases.listDocuments(DATABASE_ID, 'users', []);
    res.status(200).json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
}));

export default router;
