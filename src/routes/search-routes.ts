import { Router, Request, Response } from 'express';
import { searchProjects, searchFreelancers } from '../services/search-service';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     SearchResultMetadata:
 *       type: object
 *       properties:
 *         pageSize:
 *           type: integer
 *           description: Number of items per page
 *         hasMore:
 *           type: boolean
 *           description: Whether there are more results available
 *         continuationToken:
 *           type: string
 *           description: Token for fetching the next page
 *     ProjectSearchResult:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Project'
 *         metadata:
 *           $ref: '#/components/schemas/SearchResultMetadata'
 *     FreelancerSearchResult:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/FreelancerProfile'
 *         metadata:
 *           $ref: '#/components/schemas/SearchResultMetadata'
 */


/**
 * @swagger
 * /api/search/projects:
 *   get:
 *     summary: Search projects
 *     description: Search for projects with keyword, skill, and budget filters
 *     tags:
 *       - Search
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
 *         description: Comma-separated skill IDs to filter by
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
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
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
 *               $ref: '#/components/schemas/ProjectSearchResult'
 *       400:
 *         description: Invalid request parameters
 */
router.get('/projects', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  // Parse query parameters
  const keyword = req.query['keyword'] as string | undefined;
  const skillsParam = req.query['skills'] as string | undefined;
  const minBudgetParam = req.query['minBudget'] as string | undefined;
  const maxBudgetParam = req.query['maxBudget'] as string | undefined;
  const pageSizeParam = req.query['pageSize'] as string | undefined;
  const continuationToken = req.query['continuationToken'] as string | undefined;

  // Parse skill IDs
  const skillIds = skillsParam 
    ? skillsParam.split(',').map(s => s.trim()).filter(s => s.length > 0)
    : undefined;

  // Parse budget range
  const minBudget = minBudgetParam ? Number(minBudgetParam) : undefined;
  const maxBudget = maxBudgetParam ? Number(maxBudgetParam) : undefined;

  // Validate budget parameters
  if (minBudgetParam && isNaN(minBudget!)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'minBudget must be a valid number' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }
  if (maxBudgetParam && isNaN(maxBudget!)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'maxBudget must be a valid number' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Parse page size
  const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;
  if (pageSizeParam && (isNaN(pageSize!) || pageSize! < 1)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'pageSize must be a positive integer' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Build filters object conditionally to satisfy exactOptionalPropertyTypes
  const filters: import('../services/search-service.js').ProjectSearchFilters = {};
  if (keyword) filters.keyword = keyword;
  if (skillIds && skillIds.length > 0) filters.skillIds = skillIds;
  if (minBudget !== undefined) filters.minBudget = minBudget;
  if (maxBudget !== undefined) filters.maxBudget = maxBudget;

  // Build pagination object conditionally
  const pagination: import('../services/search-service.js').SearchPaginationInput = {};
  if (pageSize !== undefined) pagination.pageSize = pageSize;
  if (typeof continuationToken === 'string' && continuationToken) {
    pagination.offset = parseInt(continuationToken, 10) || 0;
  }

  const result = await searchProjects(filters, pagination);

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
 * /api/search/freelancers:
 *   get:
 *     summary: Search freelancers
 *     description: Search for freelancers with keyword and skill filters
 *     tags:
 *       - Search
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: Search keyword for bio
 *       - in: query
 *         name: skills
 *         schema:
 *           type: string
 *         description: Comma-separated skill IDs to filter by
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Number of results per page
 *       - in: query
 *         name: continuationToken
 *         schema:
 *           type: string
 *         description: Token for pagination
 *     responses:
 *       200:
 *         description: Freelancers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FreelancerSearchResult'
 *       400:
 *         description: Invalid request parameters
 */
router.get('/freelancers', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  // Parse query parameters
  const keyword = req.query['keyword'] as string | undefined;
  const skillsParam = req.query['skills'] as string | undefined;
  const pageSizeParam = req.query['pageSize'] as string | undefined;
  const continuationToken = req.query['continuationToken'] as string | undefined;

  // Parse skill IDs
  const skillIds = skillsParam 
    ? skillsParam.split(',').map(s => s.trim()).filter(s => s.length > 0)
    : undefined;

  // Parse page size
  const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;
  if (pageSizeParam && (isNaN(pageSize!) || pageSize! < 1)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'pageSize must be a positive integer' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Build filters object conditionally to satisfy exactOptionalPropertyTypes
  const filters: import('../services/search-service.js').FreelancerSearchFilters = {};
  if (keyword) filters.keyword = keyword;
  if (skillIds && skillIds.length > 0) filters.skillIds = skillIds;

  // Build pagination object conditionally
  const pagination: import('../services/search-service.js').SearchPaginationInput = {};
  if (pageSize !== undefined) pagination.pageSize = pageSize;
  if (typeof continuationToken === 'string' && continuationToken) {
    pagination.offset = parseInt(continuationToken, 10) || 0;
  }

  const result = await searchFreelancers(filters, pagination);

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

export default router;
