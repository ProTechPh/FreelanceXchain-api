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
import proposalRoutes from './proposal-routes.js';
import contractRoutes from './contract-routes.js';
import notificationRoutes from './notification-routes.js';
import paymentRoutes from './payment-routes.js';
import reputationRoutes from './reputation-routes.js';
import disputeRoutes from './dispute-routes.js';
import kycRoutes from './didit-kyc-routes.js';
import adminRoutes from './admin-routes.js';
import auditLogRoutes from './audit-logs.js';
import fileUploadRoutes from './file-upload.js';
import messageRoutes from './message-routes.js';
import reviewRoutes from './review-routes.js';
import healthRoutes from './health-routes.js';
import favoriteRoutes from './favorite-routes.js';
import transactionRoutes from './transaction-routes.js';
import analyticsRoutes from './analytics-routes.js';
import portfolioRoutes from './portfolio-routes.js';
import emailPreferenceRoutes from './email-preference-routes.js';
import savedSearchRoutes from './saved-search-routes.js';
import fileRoutes from './file-routes.js';

const router = Router();

// Health check routes
router.use('/health', healthRoutes);

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

// Audit log routes
router.use('/audit-logs', auditLogRoutes);

// File upload routes
router.use('/files', fileUploadRoutes);

// Message routes
router.use('/messages', messageRoutes);

// Review routes
router.use('/reviews', reviewRoutes);

// Transaction routes
router.use('/transactions', transactionRoutes);

// Analytics routes
router.use('/analytics', analyticsRoutes);

// Favorite routes
router.use('/favorites', favoriteRoutes);

// Portfolio routes
router.use('/portfolio', portfolioRoutes);

// Email preference routes
router.use('/email-preferences', emailPreferenceRoutes);

// Saved search routes
router.use('/saved-searches', savedSearchRoutes);

// File management routes
router.use('/file-management', fileRoutes);

export default router;
