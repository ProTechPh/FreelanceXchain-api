// Routes barrel export
// This file will export all route modules as they are created
import { Router } from 'express';
import authRoutes from './auth-routes.js';
import skillRoutes from './skill-routes.js';
import freelancerRoutes from './freelancer-routes.js';
import employerRoutes from './employer-routes.js';
import projectRoutes from './project-routes.js';
import searchRoutes from './search-routes.js';
import matchingRoutes from './matching-routes.js';

const router = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the API
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes
router.use('/auth', authRoutes);

// Skill taxonomy routes
router.use('/skills', skillRoutes);

// Freelancer profile routes
router.use('/freelancers', freelancerRoutes);

// Employer profile routes
router.use('/employers', employerRoutes);

// Project routes
router.use('/projects', projectRoutes);

// Search routes
router.use('/search', searchRoutes);

// Matching routes (AI-powered recommendations)
router.use('/matching', matchingRoutes);

export default router;
