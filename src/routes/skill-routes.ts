import { Router, Request, Response } from 'express';
import { 
  createCategory, 
  createSkill, 
  deprecateSkill, 
  getFullTaxonomy, 
  searchSkills 
} from '../services/skill-service.js';
import { CreateSkillCategoryInput, CreateSkillInput } from '../models/skill.js';

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
router.get('/', async (_req: Request, res: Response) => {
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
router.get('/search', async (req: Request, res: Response) => {
  const { keyword } = req.query;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

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
router.post('/categories', async (req: Request, res: Response) => {
  const { name, description } = req.body;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

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
router.post('/', async (req: Request, res: Response) => {
  const { categoryId, name, description } = req.body;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  // Validate input
  const errors: { field: string; message: string }[] = [];

  if (!categoryId || typeof categoryId !== 'string') {
    errors.push({ field: 'categoryId', message: 'Category ID is required' });
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
 *         description: ID of the skill to deprecate
 *     responses:
 *       200:
 *         description: Skill deprecated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Skill'
 *       404:
 *         description: Skill not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:id/deprecate', async (req: Request, res: Response) => {
  const { id } = req.params;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

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

export default router;
