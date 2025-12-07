import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { TokenPayload } from '../services/auth-types.js';
import {
  getProjectRecommendations,
  getFreelancerRecommendations,
  extractSkillsFromText,
  analyzeSkillGaps,
  isMatchingError,
} from '../services/matching-service.js';

// Type for authenticated request
type AuthenticatedRequest = Request & { user: TokenPayload };

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     ProjectRecommendation:
 *       type: object
 *       properties:
 *         projectId:
 *           type: string
 *           description: ID of the recommended project
 *         matchScore:
 *           type: number
 *           description: AI-computed match score (0-100)
 *         matchedSkills:
 *           type: array
 *           items:
 *             type: string
 *           description: Skills that matched between freelancer and project
 *         missingSkills:
 *           type: array
 *           items:
 *             type: string
 *           description: Required skills the freelancer is missing
 *         reasoning:
 *           type: string
 *           description: AI explanation for the match score
 *     FreelancerRecommendation:
 *       type: object
 *       properties:
 *         freelancerId:
 *           type: string
 *           description: ID of the recommended freelancer
 *         matchScore:
 *           type: number
 *           description: Skill match score (0-100)
 *         reputationScore:
 *           type: number
 *           description: Blockchain-verified reputation score
 *         combinedScore:
 *           type: number
 *           description: Combined score with reputation weighting
 *         matchedSkills:
 *           type: array
 *           items:
 *             type: string
 *           description: Skills that matched project requirements
 *         reasoning:
 *           type: string
 *           description: AI explanation for the match
 *     ExtractedSkill:
 *       type: object
 *       properties:
 *         skillId:
 *           type: string
 *           description: ID of the extracted skill in taxonomy
 *         skillName:
 *           type: string
 *           description: Name of the extracted skill
 *         confidence:
 *           type: number
 *           description: Confidence score (0-1)
 *     SkillGapAnalysis:
 *       type: object
 *       properties:
 *         currentSkills:
 *           type: array
 *           items:
 *             type: string
 *           description: Freelancer's current skills
 *         recommendedSkills:
 *           type: array
 *           items:
 *             type: string
 *           description: Skills recommended to acquire
 *         marketDemand:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               skillName:
 *                 type: string
 *               demandLevel:
 *                 type: string
 *                 enum: [high, medium, low]
 *         reasoning:
 *           type: string
 *           description: AI analysis and recommendations
 *     ExtractSkillsRequest:
 *       type: object
 *       required:
 *         - text
 *       properties:
 *         text:
 *           type: string
 *           description: Text to extract skills from
 */

/**
 * @swagger
 * /api/matching/projects:
 *   get:
 *     summary: Get project recommendations for freelancer
 *     description: Returns AI-powered project recommendations ranked by match score
 *     tags:
 *       - Matching
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 50
 *         description: Maximum number of recommendations to return
 *     responses:
 *       200:
 *         description: Project recommendations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ProjectRecommendation'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       404:
 *         description: Freelancer profile not found
 */
router.get('/projects', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const userId = authReq.user.userId;

  // Parse limit parameter
  const limitParam = req.query['limit'] as string | undefined;
  let limit = 10;
  if (limitParam) {
    limit = Number(limitParam);
    if (isNaN(limit) || limit < 1) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'limit must be a positive integer' },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }
    limit = Math.min(limit, 50); // Cap at 50
  }

  const result = await getProjectRecommendations(userId, limit);

  if (isMatchingError(result)) {
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
 * /api/matching/freelancers/{projectId}:
 *   get:
 *     summary: Get freelancer recommendations for a project
 *     description: Returns AI-powered freelancer recommendations ranked by combined skill and reputation score
 *     tags:
 *       - Matching
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the project to find freelancers for
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 50
 *         description: Maximum number of recommendations to return
 *     responses:
 *       200:
 *         description: Freelancer recommendations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FreelancerRecommendation'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       404:
 *         description: Project not found
 */
router.get('/freelancers/:projectId', authMiddleware, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const projectId = req.params['projectId'];

  if (!projectId) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'projectId is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Parse limit parameter
  const limitParam = req.query['limit'] as string | undefined;
  let limit = 10;
  if (limitParam) {
    limit = Number(limitParam);
    if (isNaN(limit) || limit < 1) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'limit must be a positive integer' },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }
    limit = Math.min(limit, 50); // Cap at 50
  }

  const result = await getFreelancerRecommendations(projectId, limit);

  if (isMatchingError(result)) {
    const statusCode = result.error.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
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
 * /api/matching/extract-skills:
 *   post:
 *     summary: Extract skills from text
 *     description: Uses AI to extract and map skills from text to the platform taxonomy
 *     tags:
 *       - Matching
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ExtractSkillsRequest'
 *     responses:
 *       200:
 *         description: Skills extracted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ExtractedSkill'
 *       400:
 *         description: Invalid request - text is required
 *       401:
 *         description: Unauthorized - Invalid or missing token
 */
router.post('/extract-skills', authMiddleware, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const { text } = req.body as { text?: string };

  if (!text || typeof text !== 'string') {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'text is required and must be a string' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await extractSkillsFromText(text);

  if (isMatchingError(result)) {
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
 * /api/matching/skill-gaps:
 *   get:
 *     summary: Analyze skill gaps for freelancer
 *     description: Uses AI to analyze freelancer's skills and suggest improvements based on market demand
 *     tags:
 *       - Matching
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Skill gap analysis completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SkillGapAnalysis'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       404:
 *         description: Freelancer profile not found
 */
router.get('/skill-gaps', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const userId = authReq.user.userId;

  const result = await analyzeSkillGaps(userId);

  if (isMatchingError(result)) {
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
