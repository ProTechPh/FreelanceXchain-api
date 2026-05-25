import { Router, Request, Response } from 'express';
import { pool } from '../config/database.js';

const router = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 */
router.get('/', async (_req: Request, res: Response) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: 'unknown',
      api: 'ok',
    },
  };

  try {
    await pool.query('SELECT 1');
    health.services.database = 'ok';
  } catch {
    health.services.database = 'error';
  }

  const statusCode = health.services.database === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * @swagger
 * /api/health/ready:
 *   get:
 *     summary: Readiness check
 *     tags: [Health]
 */
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

export default router;
