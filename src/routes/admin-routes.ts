import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { enforceMFAForAdmins } from '../middleware/mfa-enforcement.js';
import { getAllUsersWithKyc, getAdminStats, getAdminAnalytics } from '../services/admin-service.js';
import { getKycVerificationByUserId } from '../repositories/didit-kyc-repository.js';
import { UserRepository } from '../repositories/index.js';
import { logger } from '../config/logger.js';
import { auditMiddleware } from '../middleware/audit-logger.js';

const userRepository = new UserRepository();

const router = Router();

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get all users (admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all users
 */
router.get('/users', authMiddleware, requireRole('admin'), enforceMFAForAdmins, async (_req: Request, res: Response) => {
  try {
    const usersWithKyc = await getAllUsersWithKyc();
    res.json(usersWithKyc);
  } catch (error) {
    logger.error('Error fetching users', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch users',
      },
    });
  }
});

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: Get admin dashboard statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:
 *                   type: number
 *                 totalProjects:
 *                   type: number
 *                 totalFreelancers:
 *                   type: number
 *                 totalEmployers:
 *                   type: number
 */
router.get('/stats', authMiddleware, requireRole('admin'), enforceMFAForAdmins, async (_req: Request, res: Response) => {
  try {
    const stats = await getAdminStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching admin stats', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch admin statistics',
      },
    });
  }
});

/**
 * @swagger
 * /api/admin/analytics:
 *   get:
 *     summary: Get comprehensive analytics data for admin dashboard
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *  const stats = await getAdminStats();
    res.json(stats                type: number
 *                 userGrowth:
 *                   type: number
 *                 projectGrowth:
 *                   type: number
 */
router.get('/analytics', authMiddleware, requireRole('admin'), enforceMFAForAdmins, async (_req: Request, res: Response) => {
  try {
    const analytics = await getAdminAnalytics();
    res.json({
      totalUsers: analytics.totalUsers,
      totalProjects: analytics.totalProjects,
      totalRevenue: parseFloat(analytics.totalRevenue.toFixed(4)),
      activeContracts: analytics.activeContracts,
      userGrowth: parseFloat(analytics.userGrowth.toFixed(1)),
      projectGrowth: parseFloat(analytics.projectGrowth.toFixed(1)),
    });
  } catch (error) {
    logger.error('Error fetching analytics', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch analytics data',
      },
    });
  }
});

/**
 * @swagger
 * /api/admin/platform-stats:
 *   get:
 *     summary: Get platform statistics (admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalFreelancers:
 *                   type: number
 *                 totalEmployers:
 *                   type: number
 *                 totalProjects:
 *                   type: number
 *                 totalPaidOut:
 *                   type: string
 *                 satisfactionRate:
 *                   type: number
 */
router.get('/platform-stats', authMiddleware, requireRole('admin'), enforceMFAForAdmins, async (_req: Request, res: Response) => {
  try {
    const analytics = await getAdminAnalytics();
    res.json(analytics);
  } catch (error) {
    logger.error('Error fetching platform stats', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch platform statistics',
      },
    });
  }
});

/**
 * @swagger
 * /api/admin/users/{id}:
 *   patch:
 *     summary: Update user (admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [freelancer, employer, admin]
 *               name:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Invalid request
 *       403:
 *         description: Cannot edit own role
 *       404:
 *         description: User not found
 */
router.patch('/users/:id', authMiddleware, requireRole('admin'), enforceMFAForAdmins, auditMiddleware('admin_update_user', 'user'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role, name, isActive } = req.body;
    const currentUserId = req.user?.userId;

    if (!id) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'User ID is required',
        },
      });
      return;
    }

    // Prevent admin from changing their own role
    if (id === currentUserId && role !== undefined) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Cannot change your own role',
        },
      });
      return;
    }

    // Validate role value if provided
    const validRoles = ['freelancer', 'employer', 'admin'];
    if (role !== undefined && !validRoles.includes(role)) {
      res.status(400).json({
        error: {
          code: 'INVALID_ROLE',
          message: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
        },
      });
      return;
    }

    // Validate UUID format for user ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid user ID format',
        },
      });
      return;
    }

    const user = await userRepository.getUserById(id);
    if (!user) {
      res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }

    // Update user
    const updateData: any = {};
    if (role !== undefined) updateData.role = role;
    if (name !== undefined) updateData.name = name;
    if (isActive !== undefined) updateData.is_active = isActive;

    await userRepository.updateUser(id, updateData);

    // Get updated user with KYC status
    const updatedUser = await userRepository.getUserById(id);
    if (!updatedUser) {
      res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found after update',
        },
      });
      return;
    }
    const kycVerification = await getKycVerificationByUserId(id);
    const isKycVerified = updatedUser?.role === 'admin' || 
                         (kycVerification?.status === 'approved' && 
                          (!kycVerification.expires_at || new Date(kycVerification.expires_at) > new Date()));

    res.json({
      id: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      walletAddress: updatedUser.wallet_address || '',
      createdAt: updatedUser.created_at,
      name: updatedUser.name || '',
      kycVerified: isKycVerified,
      isActive: true,
    });
  } catch (error) {
    logger.error('Error updating user', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update user',
      },
    });
  }
});

export default router;
