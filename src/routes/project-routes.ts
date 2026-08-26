import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole, requireVerifiedKyc } from '../middleware/auth-middleware.js';
import {
  validateUUID,
  validateAppwriteDocumentId,
  isValidUUID,
  validate,
  createProjectSchema,
  createProjectWithAttachmentsSchema,
  updateProjectSchema,
  addMilestonesSchema,
} from '../middleware/validation-middleware.js';
import { uploadProjectAttachments } from '../middleware/file-upload-middleware.js';
import { fileUploadRateLimiter, apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse, sendValidationError } from '../utils/response-helpers.js';
import { uploadMultipleFiles, cleanupUploadedFiles, type FileMetadata } from '../utils/storage-uploader.js';
import { BUCKETS as STORAGE_BUCKETS } from '../config/appwrite.js';
import { clampLimit, clampOffset } from '../utils/index.js';
import {
  createProject,
  getProjectById,
  updateProject,
  setMilestones,
  listOpenProjects,
  searchProjects,
  listProjectsBySkills,
  listProjectsByBudgetRange,
  listProjectsByEmployer,
  listProjectsByCategory,
  listProjectsByMultipleCategories,
  getProjectCategoryStats,
} from '../services/project-service.js';
import { getProposalsByProject } from '../services/proposal-service.js';
import { mapProjectFromEntity } from '../utils/entity-mapper.js';
import { asyncHandler } from '../utils/async-handler.js';

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
 *         proposalCount:
 *           type: integer
 *           minimum: 0
 *           description: Number of non-withdrawn proposals submitted for the project
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
 *         name: category
 *         schema:
 *           type: string
 *         description: Single category ID filter
 *       - in: query
 *         name: categories
 *         schema:
 *           type: string
 *         description: Comma-separated category IDs
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
router.get('/', apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
   const keyword = req.query['keyword'] as string | undefined;
   const skillsParam = req.query['skills'] as string | undefined;
   const minBudget = req.query['minBudget'] ? Number(req.query['minBudget']) : undefined;
   const maxBudget = req.query['maxBudget'] ? Number(req.query['maxBudget']) : undefined;
   const categoryParam = req.query['category'] as string | undefined;
   const categoriesParam = req.query['categories'] as string | undefined;
   const limit = clampLimit(req.query['limit'] ? Number(req.query['limit']) : undefined);

  const offset = clampOffset(req.query['offset'] ? Number(req.query['offset']) : undefined);
  const options = { limit, offset };

  let result;

  if (keyword) {
    result = await searchProjects(keyword, options);
  } else if (skillsParam) {
    const skillIds = skillsParam.split(',').map(s => s.trim());
    result = await listProjectsBySkills(skillIds, options);
  } else if (categoriesParam) {
    const categoryIds = categoriesParam.split(',').map(c => c.trim());
    result = await listProjectsByMultipleCategories(categoryIds, options);
  } else if (categoryParam) {
    result = await listProjectsByCategory(categoryParam, options);
  } else if (minBudget !== undefined && maxBudget !== undefined) {
    result = await listProjectsByBudgetRange(minBudget, maxBudget, options);
  } else {
    result = await listOpenProjects(options);
  }

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId: getRequestId(req) });
    return;
  }

  // Map entities to API models (snake_case to camelCase)
  const mappedItems = result.data.items.map(mapProjectFromEntity);
  res.status(200).json({
    ...result.data,
    items: mappedItems
  });
}));


/**
 * @swagger
 * /api/projects/my-projects:
 *   get:
 *     summary: Get employer's own projects
 *     description: Retrieves all projects created by the authenticated employer
 *     tags:
 *       - Projects
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
 *                     $ref: '#/components/schemas/Project'
 *                 hasMore:
 *                   type: boolean
 *                 continuationToken:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/my-projects', authMiddleware, requireRole('employer'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const limit = clampLimit(req.query['limit'] ? Number(req.query['limit']) : undefined);
  const offset = clampOffset(req.query['offset'] ? Number(req.query['offset']) : undefined);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const options = { limit, offset };

  const result = await listProjectsByEmployer(userId, options);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  // Map entities to API models (snake_case to camelCase)
  const mappedItems = result.data.items.map(mapProjectFromEntity);
  res.status(200).json({
    ...result.data,
    items: mappedItems
  });
}));

/**
 * @swagger
 * /api/projects/stats/categories:
 *   get:
 *     summary: Get project statistics by category
 *     description: Retrieves project counts grouped by skill categories
 *     tags:
 *       - Projects
 *       - Statistics
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include inactive categories in results
 *     responses:
 *       200:
 *         description: Category statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       categoryId:
 *                         type: string
 *                       categoryName:
 *                         type: string
 *                       projectCount:
 *                         type: integer
 *                       totalBudget:
 *                         type: number
 */
router.get('/stats/categories', apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const rawLimit = parseInt(String(req.query['limit'] ?? '100'), 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 10000) : 100;

  const result = await getProjectCategoryStats(limit);

  if (!result.success) {
    sendErrorResponse(res, 500, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

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
 *           format: uuid
 *         description: Project ID (UUID)
 *     responses:
 *       200:
 *         description: Project retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Invalid UUID format
 *       404:
 *         description: Project not found
 */
router.get('/:id', apiRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params['id'] ?? '';
  const requestId = getRequestId(req);

  const result = await getProjectById(id);

  if (!result.success) {
    sendErrorResponse(res, 404, result.error.code, result.error.message, { requestId });
    return;
  }

  // Map entity to API model (snake_case to camelCase)
  const projectModel = mapProjectFromEntity(result.data);
  res.status(200).json(projectModel);
}));

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
 *                 minimum: 0
 *                 exclusiveMinimum: true
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
router.post('/', authMiddleware, requireRole('employer'), requireVerifiedKyc, apiRateLimiter, validate(createProjectSchema), asyncHandler(async (req: Request, res: Response) => {
  const { title, description, requiredSkills, budget, deadline, tags, isRush, rushFeePercentage } = req.body;
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  // Deep check the middleware cannot express: per-item skillId UUIDs.
  const errors: { field: string; message: string }[] = [];
  if (Array.isArray(requiredSkills)) {
    for (let i = 0; i < requiredSkills.length; i++) {
      const skill = requiredSkills[i];
      if (skill.skillId && !isValidUUID(skill.skillId)) {
        errors.push({ field: `requiredSkills[${i}].skillId`, message: 'skillId must be a valid UUID' });
      }
    }
  }

  if (errors.length > 0) {
    sendValidationError(res, errors, requestId);
    return;
  }

  const processedTags: string[] | undefined = tags
    ? Array.from(new Set((tags as string[]).reduce<string[]>((acc, tag) => { const t = tag.trim(); if (t.length > 0) acc.push(t); return acc; }, []))) as string[]
    : undefined;
  
  const result = await createProject(userId, { 
    title, 
    description, 
    requiredSkills, 
    budget, 
    deadline,
    ...(isRush !== undefined && { isRush }),
    ...(rushFeePercentage !== undefined && { rushFeePercentage }),
    ...(processedTags && { tags: processedTags })
  });

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId, details: result.error.details });
    return;
  }

  res.status(201).json(result.data);
}));

/**
 * @swagger
 * /api/projects/with-attachments:
 *   post:
 *     summary: Create project with file attachments
 *     description: Create a new project with optional file attachments (images, documents) for reference materials (employer only)
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
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
 *                 type: string
 *                 description: JSON string array of skill objects with skillId
 *               budget:
 *                 type: number
 *                 minimum: 0
 *                 exclusiveMinimum: true
 *               deadline:
 *                 type: string
 *                 format: date-time
 *               tags:
 *                 type: string
 *                 description: JSON string array of tags (optional)
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 maxItems: 10
 *                 description: Reference files/images (optional, max 10 files, 10MB each)
 *     responses:
 *       201:
 *         description: Project created successfully with attachments
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
type WithAttachmentsValidation = {
  errors: { field: string; message: string }[];
  parsedRequiredSkills: Array<{ skillId: string }> | undefined;
  parsedTags?: string[];
};

/**
 * Validate and parse the project-with-attachments request body.
 * Returns any validation errors along with the parsed skills and tags.
 */
function validateProjectWithAttachments(body: Record<string, unknown>): WithAttachmentsValidation {
  // title/description/budget/deadline shape is validated by the middleware
  // (createProjectWithAttachmentsSchema); this parses the JSON-string fields
  // and runs the deep checks (skillId UUIDs).
  const { requiredSkills, tags } = body;
  const errors: { field: string; message: string }[] = [];

  let parsedRequiredSkills: Array<{ skillId: string }> | undefined;
  try {
    parsedRequiredSkills = JSON.parse(requiredSkills as string) as Array<{ skillId: string }>;
    if (!Array.isArray(parsedRequiredSkills) || parsedRequiredSkills.length === 0) {
      errors.push({ field: 'requiredSkills', message: 'At least one skill is required' });
    } else {
      // Validate skillId UUIDs in requiredSkills array
      for (let i = 0; i < parsedRequiredSkills.length; i++) {
        const skill = parsedRequiredSkills[i];
        if (skill?.skillId && !isValidUUID(skill.skillId)) {
          errors.push({ field: `requiredSkills[${i}].skillId`, message: 'skillId must be a valid UUID' });
        }
      }
    }
  } catch {
    errors.push({ field: 'requiredSkills', message: 'requiredSkills must be a valid JSON array' });
  }

  let parsedTags: string[] | undefined;
  if (tags) {
    try {
      const parsed = JSON.parse(tags as string);
      if (!Array.isArray(parsed)) {
        errors.push({ field: 'tags', message: 'Tags must be an array' });
      } else if (parsed.some(tag => typeof tag !== 'string')) {
        errors.push({ field: 'tags', message: 'All tags must be strings' });
      } else if (parsed.length > 10) {
        errors.push({ field: 'tags', message: 'Maximum 10 tags allowed' });
      } else {
        parsedTags = Array.from(new Set((parsed as string[]).reduce<string[]>((acc, tag) => { const t = tag.trim(); if (t.length > 0) acc.push(t); return acc; }, [])));
      }
    } catch {
      errors.push({ field: 'tags', message: 'Tags must be a valid JSON array' });
    }
  }

  return {
    errors,
    parsedRequiredSkills,
    ...(parsedTags !== undefined ? { parsedTags } : {}),
  };
}

/**
 * Upload project attachments, throwing when any file fails to upload.
 */
async function uploadProjectFiles(files: Express.Multer.File[]): Promise<FileMetadata[]> {
  const uploadResults = await uploadMultipleFiles(
    files,
    STORAGE_BUCKETS.PROJECT_ATTACHMENTS
  );

  const failedUploads = uploadResults.filter(result => !result.success);
  if (failedUploads.length > 0) {
    const uploadErrors = failedUploads.map(result => result.error).join(', ');
    throw new Error(`Upload failed: ${uploadErrors}`);
  }

  return uploadResults.reduce<FileMetadata[]>((acc, result) => {
    if (result.success && result.metadata) acc.push(result.metadata!);
    return acc;
  }, []);
}

router.post('/with-attachments', authMiddleware, requireRole('employer'), requireVerifiedKyc, fileUploadRateLimiter, uploadProjectAttachments, validate(createProjectWithAttachmentsSchema), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const { errors, parsedRequiredSkills, parsedTags } = validateProjectWithAttachments(req.body);

  /* istanbul ignore next -- validation guarantees requiredSkills parses successfully */
  const skills = parsedRequiredSkills!;
  if (errors.length > 0) {
    sendValidationError(res, errors, requestId);
    return;
  }

  let attachments: FileMetadata[] = [];

  if (files && files.length > 0) {
    try {
      attachments = await uploadProjectFiles(files);
    } catch (uploadError) {
      // Clean up any partially uploaded files
      /* istanbul ignore next */
      if (attachments.length > 0) {
        await cleanupUploadedFiles(attachments, STORAGE_BUCKETS.PROJECT_ATTACHMENTS);
      }

      /* istanbul ignore next */
      sendErrorResponse(res, 500, 'FILE_UPLOAD_ERROR', 'Failed to upload attachments', { requestId, details: uploadError instanceof Error ? uploadError.message : 'Failed to upload attachments' });
      /* istanbul ignore next */
      return;
    }
  }

  const { title, description, budget, deadline, isRush, rushFeePercentage } = req.body;

  const result = await createProject(userId, {
    title,
    description,
    requiredSkills: skills,
    budget: Number(budget),
    deadline,
    ...(isRush !== undefined && { isRush }),
    ...(rushFeePercentage !== undefined && { rushFeePercentage }),
    ...(parsedTags && { tags: parsedTags }),
    ...(attachments.length > 0 && { attachments })
  });

  if (!result.success) {
    // Clean up uploaded files on project creation failure
    if (attachments.length > 0) {
      await cleanupUploadedFiles(attachments, STORAGE_BUCKETS.PROJECT_ATTACHMENTS);
    }

    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId, details: result.error.details });
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
 *           format: uuid
 *         description: Project ID (UUID)
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
 *         description: Validation error or invalid UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 *       409:
 *         description: Project locked (has accepted proposals)
 */
router.patch('/:id', authMiddleware, requireRole('employer'), requireVerifiedKyc, apiRateLimiter, validateUUID(), validate(updateProjectSchema), asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params['id'] ?? '';
  const { title, description, requiredSkills, budget, deadline, status, isRush, rushFeePercentage } = req.body;
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  // Shape validation is handled by the middleware; status transitions and rush
  // fee bounds are enforced by the service.
  const result = await updateProject(projectId, userId, { 
    title, description, requiredSkills, budget, deadline, status,
    ...(isRush !== undefined && { isRush }),
    ...(rushFeePercentage !== undefined && { rushFeePercentage }),
  });

  if (!result.success) {
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'PROJECT_LOCKED') statusCode = 409;
    
    sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId, details: result.error.details });
    return;
  }

  res.status(200).json(result.data);
}));


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
 *           format: uuid
 *         description: Project ID (UUID)
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
 *         description: Validation error, invalid UUID format, or milestone sum mismatch
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 *       409:
 *         description: Project locked (has accepted proposals)
 */
router.post('/:id/milestones', authMiddleware, requireRole('employer'), requireVerifiedKyc, apiRateLimiter, validateUUID(), validate(addMilestonesSchema), asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params['id'] ?? '';
  const { milestones } = req.body;
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  // Per-item fields are validated by the middleware (addMilestonesSchema); the
  // service enforces the business rules (amounts sum to budget, project state).
  const result = await setMilestones(projectId, userId, milestones);

  if (!result.success) {
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'PROJECT_LOCKED') statusCode = 409;
    
    sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

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
 *           format: uuid
 *         description: Project ID (UUID)
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
 *       400:
 *         description: Invalid UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 */
router.get('/:id/proposals', authMiddleware, requireRole('employer'), apiRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params['id'] ?? '';
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const limit = clampLimit(req.query['limit'] ? Number(req.query['limit']) : undefined);
  const offset = clampOffset(req.query['offset'] ? Number(req.query['offset']) : undefined);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const projectResult = await getProjectById(projectId);
  if (!projectResult.success) {
    sendErrorResponse(res, 404, projectResult.error.code, projectResult.error.message, { requestId });
    return;
  }

  if (projectResult.data.employer_id !== userId) {
    sendErrorResponse(res, 403, 'FORBIDDEN', 'You can only view proposals for your own projects', { requestId });
    return;
  }

  const options = { limit, offset };

  const result = await getProposalsByProject(projectId, options);

  if (!result.success) {
    sendErrorResponse(res, 404, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

export default router;
