// Routes barrel export
// This file will export all route modules as they are created
import { Router } from 'express';
import authRoutes from './auth-routes';
import skillRoutes from './skill-routes';
import freelancerRoutes from './freelancer-routes';
import employerRoutes from './employer-routes';
import projectRoutes from './project-routes';
import searchRoutes from './search-routes';
import matchingRoutes from './matching-routes';
import proposalRoutes from './proposal-routes';
import contractRoutes from './contract-routes';
import notificationRoutes from './notification-routes';
import paymentRoutes from './payment-routes';
import reputationRoutes from './reputation-routes';
import disputeRoutes from './dispute-routes';
import kycRoutes from './didit-kyc-routes';
import adminRoutes from './admin-routes';

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

// Proposal routes
router.use('/proposals', proposalRoutes);

// Contract routes
router.use('/contracts', contractRoutes);

// Notification routes
router.use('/notifications', notificationRoutes);

// Payment routes
router.use('/payments', paymentRoutes);

// Reputation routes
router.use('/reputation', reputationRoutes);

// Dispute routes
router.use('/disputes', disputeRoutes);

// KYC routes
router.use('/kyc', kycRoutes);

// Admin routes
router.use('/admin', adminRoutes);

export default router;
