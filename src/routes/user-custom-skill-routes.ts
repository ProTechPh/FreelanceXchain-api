import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import {
  createUserCustomSkill,
  getUserCustomSkills,
  getUserCustomSkillById,
  updateUserCustomSkill,
  deleteUserCustomSkill,
  searchUserCustomSkills,
  getPendingSkillSuggestions,
  updateSkillSuggestionStatus
} from '../services/user-custom-skill-service.js';
import { CreateUserCustomSkillInput, UpdateUserCustomSkillInput } from '../models/user-custom-skill.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     UserCustomSkill:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         userId:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         yearsOfExperience:
 *           type: number
 *         categoryName:
 *           type: string
 *           nullable: true
 *         isApproved:
 *           type: boolean
 *         suggestedForGlobal:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateUserCustomSkillInput:
 *       type: object
 *       required:
 *         - name
 *         - description
 *         - yearsOfExperience
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *         description:
 *           type: string
 *           minLength: 10
 *           maxLength: 500
 *         yearsOfExperience:
 *           type: number
 *           minimum: 0
 *           maximum: 50
 *         categoryName:
 *           type: string
 *           maxLength: 100
 *         suggestForGlobal:
 *           type: boolean
 *           default: false
 *     SkillSuggestion:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         userId:
 *           type: string
 *           format: uuid
 *         skillName:
 *           type: string
 *         skillDescription:
 *           type: string
 *         categoryName:
 *           type: string
 *           nullable: true
 *         suggestedBy:
 *           type: string
 *         timesRequested:
 *           type: number
 *         status:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/skills/custom:
 *   post:
 *     summary: Create a custom skill
 *     description: Create a new custom skill for the authenticated user
 *     tags:
 *       - User Custom Skills
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserCustomSkillInput'
 *     responses:
 *       201:
 *         description: Custom skill created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserCustomSkill'
 *       400:
 *         description: Validation error or skill already exists
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Skill already exists globally or user already has this skill
 */
router.post('/custom', authMiddleware, requireRole('freelancer'), apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const userName = req.user?.email || 'Unknown User';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const { name, description, yearsOfExperience, categoryName, suggestForGlobal }: CreateUserCustomSkillInput = req.body;

  // Validate input
  const errors: { field: string; message: string }[] = [];
  
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    errors.push({ field: 'name', message: 'Name must be between 2 and 100 characters' });
  }
  
  if (!description || typeof description !== 'string' || description.trim().length < 10 || description.trim().length > 500) {
    errors.push({ field: 'description', message: 'Description must be between 10 and 500 characters' });
  }
  
  if (yearsOfExperience === undefined || typeof yearsOfExperience !== 'number' || yearsOfExperience < 0 || yearsOfExperience > 50) {
    errors.push({ field: 'yearsOfExperience', message: 'Years of experience must be between 0 and 50' });
  }
  
  if (categoryName !== undefined && (typeof categoryName !== 'string' || categoryName.trim().length > 100)) {
    errors.push({ field: 'categoryName', message: 'Category name must be less than 100 characters' });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await createUserCustomSkill(userId, userName, {
    name,
    description,
    yearsOfExperience,
    categoryName: categoryName || undefined,
    suggestForGlobal: suggestForGlobal || false
  });

  if (!result.success) {
    const statusCode = result.error.code === 'SKILL_EXISTS_GLOBALLY' || result.error.code === 'DUPLICATE_USER_SKILL' ? 409 : 400;
    res.status(statusCode).json({
      error: { 
        code: result.error.code, 
        message: result.error.message,
        details: result.error.details 
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(201).json(result.data);
});

/**
 * @swagger
 * /api/skills/custom:
 *   get:
 *     summary: Get user's custom skills
 *     description: Retrieve all custom skills for the authenticated user
 *     tags:
 *       - User Custom Skills
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Custom skills retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserCustomSkill'
 *       401:
 *         description: Unauthorized
 */
router.get('/custom', authMiddleware, requireRole('freelancer'), apiRateLimiter, async (req: Request, res: Response) => {
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

  const skills = await getUserCustomSkills(userId);
  res.status(200).json(skills);
});

/**
 * @swagger
 * /api/skills/custom/search:
 *   get:
 *     summary: Search user's custom skills
 *     description: Search through the authenticated user's custom skills
 *     tags:
 *       - User Custom Skills
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: keyword
 *         required: true
 *         schema:
 *           type: string
 *         description: Keyword to search for in skill names and descriptions
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserCustomSkill'
 *       400:
 *         description: Missing keyword parameter
 *       401:
 *         description: Unauthorized
 */
router.get('/custom/search', authMiddleware, requireRole('freelancer'), apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { keyword } = req.query;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (!keyword || typeof keyword !== 'string') {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Keyword parameter is required',
        details: [{ field: 'keyword', message: 'Keyword is required' }],
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const results = await searchUserCustomSkills(userId, keyword);
  res.status(200).json(results);
});

/**
 * @swagger
 * /api/skills/custom/{id}:
 *   get:
 *     summary: Get a specific custom skill
 *     description: Retrieve a specific custom skill by ID for the authenticated user
 *     tags:
 *       - User Custom Skills
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Custom skill retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserCustomSkill'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Custom skill not found
 */
router.get('/custom/:id', authMiddleware, requireRole('freelancer'), validateUUID(['id']), apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (!id) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Skill ID is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await getUserCustomSkillById(id, userId);

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
 * /api/skills/custom/{id}:
 *   put:
 *     summary: Update a custom skill
 *     description: Update a specific custom skill for the authenticated user
 *     tags:
 *       - User Custom Skills
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 500
 *               yearsOfExperience:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 50
 *               categoryName:
 *                 type: string
 *                 maxLength: 100
 *     responses:
 *       200:
 *         description: Custom skill updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserCustomSkill'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Custom skill not found
 *       409:
 *         description: Duplicate skill name
 */
router.put('/custom/:id', authMiddleware, requireRole('freelancer'), validateUUID(['id']), apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (!id) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Skill ID is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const { name, description, yearsOfExperience, categoryName }: UpdateUserCustomSkillInput = req.body;

  // Validate input
  const errors: { field: string; message: string }[] = [];
  
  if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100)) {
    errors.push({ field: 'name', message: 'Name must be between 2 and 100 characters' });
  }
  
  if (description !== undefined && (typeof description !== 'string' || description.trim().length < 10 || description.trim().length > 500)) {
    errors.push({ field: 'description', message: 'Description must be between 10 and 500 characters' });
  }
  
  if (yearsOfExperience !== undefined && (typeof yearsOfExperience !== 'number' || yearsOfExperience < 0 || yearsOfExperience > 50)) {
    errors.push({ field: 'yearsOfExperience', message: 'Years of experience must be between 0 and 50' });
  }
  
  if (categoryName !== undefined && (typeof categoryName !== 'string' || categoryName.trim().length > 100)) {
    errors.push({ field: 'categoryName', message: 'Category name must be less than 100 characters' });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const updateData: UpdateUserCustomSkillInput = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (yearsOfExperience !== undefined) updateData.yearsOfExperience = yearsOfExperience;
  if (categoryName !== undefined) updateData.categoryName = categoryName;

  const result = await updateUserCustomSkill(id, userId, updateData);

  if (!result.success) {
    const statusCode = result.error.code === 'SKILL_NOT_FOUND' ? 404 : 
                      result.error.code === 'DUPLICATE_USER_SKILL' ? 409 : 400;
    res.status(statusCode).json({
      error: { 
        code: result.error.code, 
        message: result.error.message,
        details: result.error.details 
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/skills/custom/{id}:
 *   delete:
 *     summary: Delete a custom skill
 *     description: Delete a specific custom skill for the authenticated user
 *     tags:
 *       - User Custom Skills
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Custom skill deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Custom skill not found
 */
router.delete('/custom/:id', authMiddleware, requireRole('freelancer'), validateUUID(['id']), apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (!id) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Skill ID is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await deleteUserCustomSkill(id, userId);

  if (!result.success) {
    const statusCode = result.error.code === 'SKILL_NOT_FOUND' ? 404 : 400;
    res.status(statusCode).json({
      error: { 
        code: result.error.code, 
        message: result.error.message,
        details: result.error.details 
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(204).send();
});

// Admin routes for managing skill suggestions

/**
 * @swagger
 * /api/skills/suggestions:
 *   get:
 *     summary: Get pending skill suggestions (Admin only)
 *     description: Retrieve all pending skill suggestions for admin review
 *     tags:
 *       - Admin - Skill Suggestions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Skill suggestions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SkillSuggestion'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.get('/suggestions', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response) => {
  const suggestions = await getPendingSkillSuggestions();
  res.status(200).json(suggestions);
});

/**
 * @swagger
 * /api/skills/suggestions/{id}/status:
 *   put:
 *     summary: Update skill suggestion status (Admin only)
 *     description: Approve or reject a skill suggestion
 *     tags:
 *       - Admin - Skill Suggestions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *     responses:
 *       200:
 *         description: Skill suggestion status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SkillSuggestion'
 *       400:
 *         description: Invalid status value
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Skill suggestion not found
 */
router.put('/suggestions/:id/status', authMiddleware, requireRole('admin'), validateUUID(['id']), apiRateLimiter, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!id) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Suggestion ID is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (!status || !['approved', 'rejected'].includes(status)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Status must be either "approved" or "rejected"',
        details: [{ field: 'status', message: 'Invalid status value' }],
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await updateSkillSuggestionStatus(id, status);

  if (!result.success) {
    const statusCode = result.error.code === 'SUGGESTION_NOT_FOUND' ? 404 : 400;
    res.status(statusCode).json({
      error: { 
        code: result.error.code, 
        message: result.error.message,
        details: result.error.details 
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

export default router;