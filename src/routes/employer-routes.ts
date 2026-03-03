import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { clampLimit } from '../utils/index.js';
import {
  getEmployerProfileByUserId,
  updateEmployerProfile,
} from '../services/employer-profile-service.js';
import { listProjectsByEmployer } from '../services/project-service.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployerProfile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         userId:
 *           type: string
 *         companyName:
 *           type: string
 *         description:
 *           type: string
 *         industry:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/employers/projects:
 *   get:
 *     summary: List employer's projects
 *     description: Retrieves all projects created by the authenticated employer with proposal counts
 *     tags:
 *       - Employers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of results per page
 *       - in: query
 *         name: continuationToken
 *         schema:
 *           type: string
 *         description: Token for pagination
 *     responses:
 *       200:
 *         description: Projects retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Project'
 *                       - type: object
 *                         properties:
 *                           proposalCount:
 *                             type: integer
 *                 hasMore:
 *                   type: boolean
 *                 continuationToken:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/projects', authMiddleware, requireRole('employer'), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const limit = clampLimit(req.query['limit'] ? Number(req.query['limit']) : undefined);
  const continuationToken = req.query['continuationToken'] as string | undefined;

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const options: { maxItemCount: number; continuationToken?: string } = { maxItemCount: limit };
  if (continuationToken) {
    options.continuationToken = continuationToken;
  }
  const result = await listProjectsByEmployer(userId, options);

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
 * /api/employers/profile:
 *   get:
 *     summary: Get current user's employer profile
 *     description: Retrieves the authenticated user's employer profile
 *     tags:
 *       - Employers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmployerProfile'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Profile not found
 */
router.get('/profile', authMiddleware, requireRole('employer'), async (req: Request, res: Response) => {
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

  const result = await getEmployerProfileByUserId(userId);

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
 * /api/employers/profile:
 *   patch:
 *     summary: Update employer profile
 *     description: Updates the authenticated user's employer profile
 *     tags:
 *       - Employers
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyName:
 *                 type: string
 *               description:
 *                 type: string
 *               industry:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmployerProfile'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Profile not found
 */
router.patch('/profile', authMiddleware, requireRole('employer'), async (req: Request, res: Response) => {
  const { companyName, description, industry } = req.body;
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

  // Validate input
  const errors: { field: string; message: string }[] = [];
  if (companyName !== undefined && (typeof companyName !== 'string' || companyName.trim().length < 2)) {
    errors.push({ field: 'companyName', message: 'Company name must be at least 2 characters' });
  }
  if (description !== undefined && (typeof description !== 'string' || description.trim().length < 10)) {
    errors.push({ field: 'description', message: 'Description must be at least 10 characters' });
  }
  if (industry !== undefined && (typeof industry !== 'string' || industry.trim().length < 2)) {
    errors.push({ field: 'industry', message: 'Industry must be at least 2 characters' });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await updateEmployerProfile(userId, { companyName, description, industry });

  if (!result.success) {
    const statusCode = result.error.code === 'PROFILE_NOT_FOUND' ? 404 : 400;
    res.status(statusCode).json({
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
 * /api/employers/{id}:
 *   get:
 *     summary: Get employer profile by user ID
 *     description: Retrieves an employer's public profile
 *     tags:
 *       - Employers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID of the employer (UUID)
 *     responses:
 *       200:
 *         description: Employer profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmployerProfile'
 *       400:
 *         description: Invalid UUID format
 *       404:
 *         description: Profile not found
 */
router.get('/:id', validateUUID(), async (req: Request, res: Response) => {
  const id = req.params['id'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const result = await getEmployerProfileByUserId(id);

  if (!result.success) {
    res.status(404).json({
      error: {
        code: result.error.code,
        message: result.error.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

export default router;
