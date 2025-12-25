import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import {
  createProject,
  getProjectById,
  updateProject,
  setMilestones,
  listOpenProjects,
  searchProjects,
  listProjectsBySkills,
  listProjectsByBudgetRange,
} from '../services/project-service.js';
import { getProposalsByProject } from '../services/proposal-service.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Milestone:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         amount:
 *           type: number
 *         dueDate:
 *           type: string
 *           format: date-time
 *         status:
 *           type: string
 *           enum: [pending, in_progress, submitted, approved, disputed]
 *     Project:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         employerId:
 *           type: string
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         requiredSkills:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/SkillReference'
 *         budget:
 *           type: number
 *         deadline:
 *           type: string
 *           format: date-time
 *         status:
 *           type: string
 *           enum: [draft, open, in_progress, completed, cancelled]
 *         milestones:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Milestone'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */


/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: List projects with filters
 *     description: Retrieves a list of open projects with optional filters
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: Search keyword for title/description
 *       - in: query
 *         name: skills
 *         schema:
 *           type: string
 *         description: Comma-separated skill IDs
 *       - in: query
 *         name: minBudget
 *         schema:
 *           type: number
 *         description: Minimum budget filter
 *       - in: query
 *         name: maxBudget
 *         schema:
 *           type: number
 *         description: Maximum budget filter
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
 *                     $ref: '#/components/schemas/Project'
 *                 hasMore:
 *                   type: boolean
 *                 continuationToken:
 *                   type: string
 */
router.get('/', async (req: Request, res: Response) => {
  const keyword = req.query['keyword'] as string | undefined;
  const skillsParam = req.query['skills'] as string | undefined;
  const minBudget = req.query['minBudget'] ? Number(req.query['minBudget']) : undefined;
  const maxBudget = req.query['maxBudget'] ? Number(req.query['maxBudget']) : undefined;
  const limit = req.query['limit'] ? Number(req.query['limit']) : 20;
  const continuationToken = req.query['continuationToken'] as string | undefined;

  const options: { maxItemCount: number; continuationToken?: string } = { maxItemCount: limit };
  if (continuationToken) {
    options.continuationToken = continuationToken;
  }

  let result;

  if (keyword) {
    result = await searchProjects(keyword, options);
  } else if (skillsParam) {
    const skillIds = skillsParam.split(',').map(s => s.trim());
    result = await listProjectsBySkills(skillIds, options);
  } else if (minBudget !== undefined && maxBudget !== undefined) {
    result = await listProjectsByBudgetRange(minBudget, maxBudget, options);
  } else {
    result = await listOpenProjects(options);
  }

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] ?? 'unknown',
    });
    return;
  }

  res.status(200).json(result.data);
});


/**
 * @swagger
 * /api/projects/{id}:
 *   get:
 *     summary: Get project details
 *     description: Retrieves details of a specific project
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       404:
 *         description: Project not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  const id = req.params['id'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const result = await getProjectById(id);

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
 * /api/projects:
 *   post:
 *     summary: Create project
 *     description: Creates a new project (employer only)
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - requiredSkills
 *               - budget
 *               - deadline
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 5
 *               description:
 *                 type: string
 *                 minLength: 20
 *               requiredSkills:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     skillId:
 *                       type: string
 *               budget:
 *                 type: number
 *                 minimum: 100
 *               deadline:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Project created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', authMiddleware, requireRole('employer'), async (req: Request, res: Response) => {
  const { title, description, requiredSkills, budget, deadline } = req.body;
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
  if (!title || typeof title !== 'string' || title.trim().length < 5) {
    errors.push({ field: 'title', message: 'Title must be at least 5 characters' });
  }
  if (!description || typeof description !== 'string' || description.trim().length < 20) {
    errors.push({ field: 'description', message: 'Description must be at least 20 characters' });
  }
  if (!requiredSkills || !Array.isArray(requiredSkills) || requiredSkills.length === 0) {
    errors.push({ field: 'requiredSkills', message: 'At least one skill is required' });
  }
  if (!budget || typeof budget !== 'number' || budget < 100) {
    errors.push({ field: 'budget', message: 'Budget must be at least 100' });
  }
  if (!deadline || typeof deadline !== 'string') {
    errors.push({ field: 'deadline', message: 'Deadline is required' });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await createProject(userId, { title, description, requiredSkills, budget, deadline });

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error.code, message: result.error.message, details: result.error.details },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(201).json(result.data);
});


/**
 * @swagger
 * /api/projects/{id}:
 *   patch:
 *     summary: Update project
 *     description: Updates an existing project (employer only, project must not have accepted proposals)
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               requiredSkills:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     skillId:
 *                       type: string
 *               budget:
 *                 type: number
 *               deadline:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [draft, open, in_progress, completed, cancelled]
 *     responses:
 *       200:
 *         description: Project updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 *       409:
 *         description: Project locked (has accepted proposals)
 */
router.patch('/:id', authMiddleware, requireRole('employer'), async (req: Request, res: Response) => {
  const projectId = req.params['id'] ?? '';
  const { title, description, requiredSkills, budget, deadline, status } = req.body;
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
  if (title !== undefined && (typeof title !== 'string' || title.trim().length < 5)) {
    errors.push({ field: 'title', message: 'Title must be at least 5 characters' });
  }
  if (description !== undefined && (typeof description !== 'string' || description.trim().length < 20)) {
    errors.push({ field: 'description', message: 'Description must be at least 20 characters' });
  }
  if (budget !== undefined && (typeof budget !== 'number' || budget < 100)) {
    errors.push({ field: 'budget', message: 'Budget must be at least 100' });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await updateProject(projectId, userId, { title, description, requiredSkills, budget, deadline, status });

  if (!result.success) {
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'PROJECT_LOCKED') statusCode = 409;
    
    res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message, details: result.error.details },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});


/**
 * @swagger
 * /api/projects/{id}/milestones:
 *   post:
 *     summary: Add milestones to project
 *     description: Sets milestones for a project (employer only, milestone amounts must sum to budget)
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - milestones
 *             properties:
 *               milestones:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - title
 *                     - description
 *                     - amount
 *                     - dueDate
 *                   properties:
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     dueDate:
 *                       type: string
 *                       format: date-time
 *     responses:
 *       200:
 *         description: Milestones added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Validation error or milestone sum mismatch
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 *       409:
 *         description: Project locked (has accepted proposals)
 */
router.post('/:id/milestones', authMiddleware, requireRole('employer'), async (req: Request, res: Response) => {
  const projectId = req.params['id'] ?? '';
  const { milestones } = req.body;
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
  if (!milestones || !Array.isArray(milestones) || milestones.length === 0) {
    errors.push({ field: 'milestones', message: 'At least one milestone is required' });
  } else {
    milestones.forEach((m, i) => {
      if (!m.title || typeof m.title !== 'string') {
        errors.push({ field: `milestones[${i}].title`, message: 'Title is required' });
      }
      if (!m.description || typeof m.description !== 'string') {
        errors.push({ field: `milestones[${i}].description`, message: 'Description is required' });
      }
      if (typeof m.amount !== 'number' || m.amount <= 0) {
        errors.push({ field: `milestones[${i}].amount`, message: 'Amount must be a positive number' });
      }
      if (!m.dueDate || typeof m.dueDate !== 'string') {
        errors.push({ field: `milestones[${i}].dueDate`, message: 'Due date is required' });
      }
    });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await setMilestones(projectId, userId, milestones);

  if (!result.success) {
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'PROJECT_LOCKED') statusCode = 409;
    
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
 * /api/projects/{id}/proposals:
 *   get:
 *     summary: List proposals for project
 *     description: Retrieves all proposals for a specific project (employer only)
 *     tags:
 *       - Projects
 *       - Proposals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
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
 *         description: Proposals retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Proposal'
 *                 hasMore:
 *                   type: boolean
 *                 continuationToken:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 */
router.get('/:id/proposals', authMiddleware, requireRole('employer'), async (req: Request, res: Response) => {
  const projectId = req.params['id'] ?? '';
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const limit = req.query['limit'] ? Number(req.query['limit']) : 20;
  const continuationToken = req.query['continuationToken'] as string | undefined;

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Verify employer owns this project
  const projectResult = await getProjectById(projectId);
  if (!projectResult.success) {
    res.status(404).json({
      error: { code: projectResult.error.code, message: projectResult.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (projectResult.data.employer_id !== userId) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'You can only view proposals for your own projects' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const options: { maxItemCount: number; continuationToken?: string } = { maxItemCount: limit };
  if (continuationToken) {
    options.continuationToken = continuationToken;
  }

  const result = await getProposalsByProject(projectId, options);

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

export default router;
