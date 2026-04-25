import { Router, Request, Response } from 'express';
import { validateUUID, isValidUUID } from '../middleware/validation-middleware.js';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import {
  createCategory,
  createSkill,
  deprecateSkill,
  getFullTaxonomy,
  searchSkills,
  getActiveSkillsByCategory
} from '../services/skill-service.js';
import { CreateSkillCategoryInput, CreateSkillInput } from '../models/skill.js';
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
import { getRequestId, sendError, sendServiceError } from '../utils/route-helpers.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateSkillCategoryInput:
 *       type: object
 *       required:
 *         - name
 *         - description
 *       properties:
 *         name:
 *           type: string
 *           description: Category name
 *           example: "Web Development"
 *         description:
 *           type: string
 *           description: Category description
 *           example: "Skills related to web development technologies"
 *     CreateSkillInput:
 *       type: object
 *       required:
 *         - categoryId
 *         - name
 *         - description
 *       properties:
 *         categoryId:
 *           type: string
 *           format: uuid
 *           description: ID of the category this skill belongs to
 *         name:
 *           type: string
 *           description: Skill name
 *           example: "TypeScript"
 *         description:
 *           type: string
 *           description: Skill description
 *           example: "Typed superset of JavaScript"
 *     SkillTaxonomy:
 *       type: object
 *       properties:
 *         categories:
 *           type: array
 *           items:
 *             allOf:
 *               - $ref: '#/components/schemas/SkillCategory'
 *               - type: object
 *                 properties:
 *                   skills:
 *                     type: array
 *                     items:
 *                       $ref: '#/components/schemas/Skill'
 *     SkillWithCategory:
 *       allOf:
 *         - $ref: '#/components/schemas/Skill'
 *         - type: object
 *           properties:
 *             categoryName:
 *               type: string
 *               description: Name of the category this skill belongs to
 */


/**
 * @swagger
 * /api/skills:
 *   get:
 *     summary: Get full skill taxonomy
 *     description: Returns all active skill categories with their associated active skills in hierarchical format
 *     tags:
 *       - Skills
 *     responses:
 *       200:
 *         description: Skill taxonomy retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SkillTaxonomy'
 */
router.get('/', apiRateLimiter, async (_req: Request, res: Response) => {
  const taxonomy = await getFullTaxonomy();
  res.status(200).json(taxonomy);
});

/**
 * @swagger
 * /api/skills/search:
 *   get:
 *     summary: Search skills by keyword
 *     description: Returns skills matching the keyword in name or description, with category information
 *     tags:
 *       - Skills
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
 *                 $ref: '#/components/schemas/SkillWithCategory'
 *       400:
 *         description: Missing keyword parameter
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/search', apiRateLimiter, async (req: Request, res: Response) => {
  const { keyword } = req.query;
  const requestId = getRequestId(req);

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

  const results = await searchSkills(keyword);
  res.status(200).json(results);
});

/**
 * @swagger
 * /api/skills/categories/{categoryId}/skills:
 *   get:
 *     summary: Get skills by category
 *     description: Returns all active skills for a specific category
 *     tags:
 *       - Skills
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID of the category
 *     responses:
 *       200:
 *         description: Skills retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Skill'
 *       400:
 *         description: Invalid category ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/categories/:categoryId/skills', apiRateLimiter, validateUUID(['categoryId']), async (req: Request, res: Response) => {
  const { categoryId } = req.params;
  
  if (!categoryId) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Category ID is required',
      },
    });
    return;
  }
  
  const skills = await getActiveSkillsByCategory(categoryId);
  res.status(200).json(skills);
});


/**
 * @swagger
 * /api/skills/categories:
 *   post:
 *     summary: Create a skill category (admin)
 *     description: Creates a new skill category. Requires admin privileges.
 *     tags:
 *       - Skills
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSkillCategoryInput'
 *     responses:
 *       201:
 *         description: Category created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SkillCategory'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Category with this name already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/categories', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response) => {
  const { name, description } = req.body;
  const requestId = getRequestId(req);

  // Validate input
  const errors: { field: string; message: string }[] = [];

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name is required' });
  }
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    errors.push({ field: 'description', message: 'Description is required' });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const input: CreateSkillCategoryInput = { name: name.trim(), description: description.trim() };
  const result = await createCategory(input);

  if (!result.success) {
    const statusCode = result.error.code === 'DUPLICATE_CATEGORY' ? 409 : 400;
    res.status(statusCode).json({
      error: {
        code: result.error.code,
        message: result.error.message,
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
 * /api/skills:
 *   post:
 *     summary: Create a skill (admin)
 *     description: Creates a new skill within a category. Requires admin privileges.
 *     tags:
 *       - Skills
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSkillInput'
 *     responses:
 *       201:
 *         description: Skill created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Skill'
 *       400:
 *         description: Validation error or category not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Skill with this name already exists in the category
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response) => {
  const { categoryId, name, description } = req.body;
  const requestId = getRequestId(req);

  // Validate input
  const errors: { field: string; message: string }[] = [];

  if (!categoryId || typeof categoryId !== 'string') {
    errors.push({ field: 'categoryId', message: 'Category ID is required' });
  } else if (!isValidUUID(categoryId)) {
    errors.push({ field: 'categoryId', message: 'Category ID must be a valid UUID' });
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name is required' });
  }
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    errors.push({ field: 'description', message: 'Description is required' });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const input: CreateSkillInput = { 
    categoryId, 
    name: name.trim(), 
    description: description.trim() 
  };
  const result = await createSkill(input);

  if (!result.success) {
    const statusCode = result.error.code === 'DUPLICATE_SKILL' ? 409 : 400;
    res.status(statusCode).json({
      error: {
        code: result.error.code,
        message: result.error.message,
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
 * /api/skills/{id}/deprecate:
 *   patch:
 *     summary: Deprecate a skill (admin)
 *     description: Marks a skill as inactive/deprecated. Deprecated skills are excluded from new profile and project associations. Requires admin privileges.
 *     tags:
 *       - Skills
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID of the skill to deprecate (UUID)
 *     responses:
 *       200:
 *         description: Skill deprecated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Skill'
 *       400:
 *         description: Invalid UUID format
 *       404:
 *         description: Skill not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:id/deprecate', authMiddleware, requireRole('admin'), apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const { id } = req.params;
  const requestId = getRequestId(req);

  if (!id) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Skill ID is required',
        details: [{ field: 'id', message: 'Skill ID is required' }],
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await deprecateSkill(id);

  if (!result.success) {
    const statusCode = result.error.code === 'SKILL_NOT_FOUND' ? 404 : 400;
    res.status(statusCode).json({
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
  const requestId = getRequestId(req);

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const { name, description, yearsOfExperience, categoryName, suggestForGlobal }: CreateUserCustomSkillInput = req.body;

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
 *       401:
 *         description: Unauthorized
 */
router.get('/custom', authMiddleware, requireRole('freelancer'), apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

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
 *     responses:
 *       200:
 *         description: Search results
 *       401:
 *         description: Unauthorized
 */
router.get('/custom/search', authMiddleware, requireRole('freelancer'), apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { keyword } = req.query;
  const requestId = getRequestId(req);

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
      error: { code: 'VALIDATION_ERROR', message: 'Keyword parameter is required', details: [{ field: 'keyword', message: 'Keyword is required' }] },
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
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Custom skill not found
 */
router.get('/custom/:id', authMiddleware, requireRole('freelancer'), validateUUID(['id']), apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;
  const requestId = getRequestId(req);

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
 *               description:
 *                 type: string
 *               yearsOfExperience:
 *                 type: number
 *               categoryName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Custom skill updated successfully
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
  const requestId = getRequestId(req);

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const { name, description, yearsOfExperience, categoryName }: UpdateUserCustomSkillInput = req.body;

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

  if (!id) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Skill ID is required' },
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
    const statusCode = result.error.code === 'SKILL_NOT_FOUND' ? 404 : result.error.code === 'DUPLICATE_USER_SKILL' ? 409 : 400;
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
 * /api/skills/custom/{id}:
 *   delete:
 *     summary: Delete a custom skill
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
  const requestId = getRequestId(req);

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
      error: { code: result.error.code, message: result.error.message, details: result.error.details },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(204).send();
});

/**
 * @swagger
 * /api/skills/suggestions:
 *   get:
 *     summary: Get pending skill suggestions (Admin only)
 *     tags:
 *       - Admin - Skill Suggestions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Skill suggestions retrieved successfully
 */
router.get('/suggestions', authMiddleware, requireRole('admin'), apiRateLimiter, async (_req: Request, res: Response) => {
  const suggestions = await getPendingSkillSuggestions();
  res.status(200).json(suggestions);
});

/**
 * @swagger
 * /api/skills/suggestions/{id}/status:
 *   put:
 *     summary: Update skill suggestion status (Admin only)
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
 *         description: Skill suggestion status updated
 *       404:
 *         description: Skill suggestion not found
 */
router.put('/suggestions/:id/status', authMiddleware, requireRole('admin'), validateUUID(['id']), apiRateLimiter, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const requestId = getRequestId(req);

  if (!status || !['approved', 'rejected'].includes(status)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Status must be either "approved" or "rejected"', details: [{ field: 'status', message: 'Invalid status value' }] },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (!id) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Suggestion ID is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await updateSkillSuggestionStatus(id, status);

  if (!result.success) {
    const statusCode = result.error.code === 'SUGGESTION_NOT_FOUND' ? 404 : 400;
    res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message, details: result.error.details },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

export default router;
