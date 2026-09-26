import { Router, Request, Response } from 'express';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { asyncHandler } from '../utils/async-handler.js';
import { getApiVersion } from '../utils/version.js';
import { config } from '../config/env.js';

const router = Router();

let lastDbCheckTime = 0;
let lastDbCheckStatus: 'ok' | 'error' = 'ok';
const DB_HEALTH_CACHE_MS = 15_000;

async function checkDatabaseHealth(): Promise<'ok' | 'error'> {
  const now = Date.now();
  const isTest = (config?.server?.nodeEnv ?? process.env.NODE_ENV) === 'test';
  if (!isTest && now - lastDbCheckTime < DB_HEALTH_CACHE_MS) {
    return lastDbCheckStatus;
  }
  try {
    const queries = typeof Query?.limit === 'function' ? [Query.limit(1)] : [];
    await databases.listDocuments(DATABASE_ID, 'users', queries);
    lastDbCheckStatus = 'ok';
  } catch {
    lastDbCheckStatus = 'error';
  }
  lastDbCheckTime = now;
  return lastDbCheckStatus;
}


/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const dbStatus = await checkDatabaseHealth();
  const health = {
    status: 'ok',
    version: getApiVersion(),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: dbStatus,
      api: 'ok',
    },
  };

  const statusCode = dbStatus === 'ok' ? 200 : 503;
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
  const dbStatus = await checkDatabaseHealth();
  if (dbStatus === 'ok') {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false });
  }
}));

export default router;
