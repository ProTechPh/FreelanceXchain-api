import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import {
  createProfile,
  getProfileByUserId,
  updateProfile,
  addSkillsToProfile,
  addExperience,
} from '../services/freelancer-profile-service.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     SkillReference:
 *       type: object
 *       properties:
 *         skillId:
 *           type: string
 *         skillName:
 *           type: string
 *         categoryId:
 *           type: string
 *         yearsOfExperience:
 *           type: number
 *     WorkExperience:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         title:
 *           type: string
 *         company:
 *           type: string
 *         description:
 *           type: string
 *         startDate:
 *           type: string
 *           format: date
 *         endDate:
 *           type: string
 *           format: date
 *           nullable: true
 *     FreelancerProfile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         userId:
 *           type: string
 *         bio:
 *           type: string
 *         hourlyRate:
 *           type: number
 *         skills:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/SkillReference'
 *         experience:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/WorkExperience'
 *         availability:
 *           type: string
 *           enum: [available, busy, unavailable]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */


/**
 * @swagger
 * /api/freelancers/{id}:
 *   get:
 *     summary: Get freelancer profile by user ID
 *     description: Retrieves a freelancer's public profile
 *     tags:
 *       - Freelancers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID of the freelancer (UUID)
 *     responses:
 *       200:
 *         description: Freelancer profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FreelancerProfile'
 *       400:
 *         description: Invalid UUID format
 *       404:
 *         description: Profile not found
 */
router.get('/:id', validateUUID(), async (req: Request, res: Response) => {
  const id = req.params['id'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const result = await getProfileByUserId(id);

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

/**
 * @swagger
 * /api/freelancers/profile:
 *   post:
 *     summary: Create freelancer profile
 *     description: Creates a new freelancer profile for the authenticated user
 *     tags:
 *       - Freelancers
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bio
 *               - hourlyRate
 *             properties:
 *               bio:
 *                 type: string
 *                 minLength: 10
 *               hourlyRate:
 *                 type: number
 *                 minimum: 1
 *               availability:
 *                 type: string
 *                 enum: [available, busy, unavailable]
 *     responses:
 *       201:
 *         description: Profile created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FreelancerProfile'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Profile already exists
 */
router.post('/profile', authMiddleware, requireRole('freelancer'), async (req: Request, res: Response) => {
  const { bio, hourlyRate, availability } = req.body;
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
  if (!bio || typeof bio !== 'string' || bio.trim().length < 10) {
    errors.push({ field: 'bio', message: 'Bio must be at least 10 characters' });
  }
  if (typeof hourlyRate !== 'number' || hourlyRate < 1) {
    errors.push({ field: 'hourlyRate', message: 'Hourly rate must be a positive number' });
  }
  if (availability && !['available', 'busy', 'unavailable'].includes(availability)) {
    errors.push({ field: 'availability', message: 'Invalid availability value' });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await createProfile(userId, { bio, hourlyRate, availability });

  if (!result.success) {
    const statusCode = result.error.code === 'PROFILE_EXISTS' ? 409 : 400;
    res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(201).json(result.data);
});


/**
 * @swagger
 * /api/freelancers/profile:
 *   patch:
 *     summary: Update freelancer profile
 *     description: Updates the authenticated user's freelancer profile
 *     tags:
 *       - Freelancers
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bio:
 *                 type: string
 *               hourlyRate:
 *                 type: number
 *               availability:
 *                 type: string
 *                 enum: [available, busy, unavailable]
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FreelancerProfile'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Profile not found
 */
router.patch('/profile', authMiddleware, requireRole('freelancer'), async (req: Request, res: Response) => {
  const { bio, hourlyRate, availability } = req.body;
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
  if (bio !== undefined && (typeof bio !== 'string' || bio.trim().length < 10)) {
    errors.push({ field: 'bio', message: 'Bio must be at least 10 characters' });
  }
  if (hourlyRate !== undefined && (typeof hourlyRate !== 'number' || hourlyRate < 1)) {
    errors.push({ field: 'hourlyRate', message: 'Hourly rate must be a positive number' });
  }
  if (availability !== undefined && !['available', 'busy', 'unavailable'].includes(availability)) {
    errors.push({ field: 'availability', message: 'Invalid availability value' });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await updateProfile(userId, { bio, hourlyRate, availability });

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
 * /api/freelancers/profile/skills:
 *   post:
 *     summary: Add skills to freelancer profile
 *     description: Adds skills to the authenticated user's profile. Skills are stored as free-form text for AI matching.
 *     tags:
 *       - Freelancers
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - skills
 *             properties:
 *               skills:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - yearsOfExperience
 *                   properties:
 *                     name:
 *                       type: string
 *                       description: Skill name (e.g., "React", "Node.js", "Solidity")
 *                       example: "React"
 *                     yearsOfExperience:
 *                       type: number
 *                       description: Years of experience with this skill
 *                       example: 3
 *           example:
 *             skills:
 *               - name: "React"
 *                 yearsOfExperience: 3
 *               - name: "Node.js"
 *                 yearsOfExperience: 2
 *     responses:
 *       200:
 *         description: Skills added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FreelancerProfile'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Profile not found
 */
router.post('/profile/skills', authMiddleware, requireRole('freelancer'), async (req: Request, res: Response) => {
  const { skills } = req.body;
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
  if (!Array.isArray(skills) || skills.length === 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Skills array is required', details: [{ field: 'skills', message: 'Skills must be a non-empty array' }] },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const errors: { field: string; message: string }[] = [];
  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    if (!skill.name || typeof skill.name !== 'string' || skill.name.trim().length === 0) {
      errors.push({ field: `skills[${i}].name`, message: 'Skill name is required' });
    }
    if (typeof skill.yearsOfExperience !== 'number' || skill.yearsOfExperience < 0) {
      errors.push({ field: `skills[${i}].yearsOfExperience`, message: 'Years of experience must be a non-negative number' });
    }
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await addSkillsToProfile(userId, skills);

  if (!result.success) {
    const statusCode = result.error.code === 'PROFILE_NOT_FOUND' ? 404 : 400;
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
 * /api/freelancers/profile/experience:
 *   post:
 *     summary: Add work experience to freelancer profile
 *     description: Adds a work experience entry to the authenticated user's profile
 *     tags:
 *       - Freelancers
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
 *               - company
 *               - description
 *               - startDate
 *             properties:
 *               title:
 *                 type: string
 *               company:
 *                 type: string
 *               description:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Experience added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FreelancerProfile'
 *       400:
 *         description: Validation error or invalid date range
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Profile not found
 */
router.post('/profile/experience', authMiddleware, requireRole('freelancer'), async (req: Request, res: Response) => {
  const { title, company, description, startDate, endDate } = req.body;
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
  if (!title || typeof title !== 'string' || title.trim().length < 2) {
    errors.push({ field: 'title', message: 'Title must be at least 2 characters' });
  }
  if (!company || typeof company !== 'string' || company.trim().length < 2) {
    errors.push({ field: 'company', message: 'Company must be at least 2 characters' });
  }
  if (!description || typeof description !== 'string' || description.trim().length < 10) {
    errors.push({ field: 'description', message: 'Description must be at least 10 characters' });
  }
  if (!startDate || typeof startDate !== 'string') {
    errors.push({ field: 'startDate', message: 'Start date is required' });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await addExperience(userId, { title, company, description, startDate, endDate });

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

export default router;
