import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { userRepository } from '../repositories/user-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { ReviewRepository } from '../repositories/review-repository.js';
import { getKycVerificationByUserId } from '../repositories/didit-kyc-repository.js';
import { logger } from '../config/logger.js';

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
router.get('/users', authMiddleware, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    const allUsers = await userRepository.getAllUsers();
    
    // Check KYC status for each user
    const usersWithKyc = await Promise.all(
      allUsers.map(async (user) => {
        // Admins are automatically considered KYC verified (exempt from KYC requirement)
        if (user.role === 'admin') {
          return {
            id: user.id,
            email: user.email,
            role: user.role,
            walletAddress: user.wallet_address || '',
            createdAt: user.created_at,
            name: user.name || '',
            kycVerified: true, // Admins bypass KYC requirement
            isActive: true,
          };
        }
        
        const kycVerification = await getKycVerificationByUserId(user.id);
        const isKycVerified = kycVerification?.status === 'approved' && 
                             (!kycVerification.expires_at || new Date(kycVerification.expires_at) > new Date());
        
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          walletAddress: user.wallet_address || '',
          createdAt: user.created_at,
          name: user.name || '',
          kycVerified: isKycVerified,
          isActive: true, // All users are active by default
        };
      })
    );

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
router.get('/stats', authMiddleware, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    // Get total users count
    const allUsers = await userRepository.getAllUsers();
    const totalUsers = allUsers.length;
    const totalFreelancers = allUsers.filter(u => u.role === 'freelancer').length;
    const totalEmployers = allUsers.filter(u => u.role === 'employer').length;

    // Get total projects count
    const allProjects = await projectRepository.getAllProjects();
    const totalProjects = allProjects.length;

    res.json({
      totalUsers,
      totalProjects,
      totalFreelancers,
      totalEmployers,
    });
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
 *     responses:
 *       200:
 *         description: Comprehensive analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:
 *                   type: number
 *                 totalProjects:
 *                   type: number
 *                 totalRevenue:
 *                   type: number
 *                 activeContracts:
 *                   type: number
 *                 userGrowth:
 *                   type: number
 *                 projectGrowth:
 *                   type: number
 */
router.get('/analytics', authMiddleware, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    // Get all users
    const allUsers = await userRepository.getAllUsers();
    const totalUsers = allUsers.length;

    // Get all projects
    const allProjects = await projectRepository.getAllProjects();
    const totalProjects = allProjects.length;

    // Get all contracts
    const allContracts = await contractRepository.getAllContracts();
    const activeContracts = allContracts.filter(c => c.status === 'active').length;

    // Calculate total revenue from completed contracts
    const completedContracts = allContracts.filter(c => c.status === 'completed');
    const totalRevenue = completedContracts.reduce((sum, contract) => sum + contract.total_amount, 0);

    // Calculate growth rates (comparing last 30 days vs previous 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // User growth
    const recentUsers = allUsers.filter(u => new Date(u.created_at) >= thirtyDaysAgo).length;
    const previousUsers = allUsers.filter(u => {
      const createdAt = new Date(u.created_at);
      return createdAt >= sixtyDaysAgo && createdAt < thirtyDaysAgo;
    }).length;
    const userGrowth = previousUsers > 0 ? ((recentUsers - previousUsers) / previousUsers) * 100 : 0;

    // Project growth
    const recentProjects = allProjects.filter(p => new Date(p.created_at) >= thirtyDaysAgo).length;
    const previousProjects = allProjects.filter(p => {
      const createdAt = new Date(p.created_at);
      return createdAt >= sixtyDaysAgo && createdAt < thirtyDaysAgo;
    }).length;
    const projectGrowth = previousProjects > 0 ? ((recentProjects - previousProjects) / previousProjects) * 100 : 0;

    res.json({
      totalUsers,
      totalProjects,
      totalRevenue: parseFloat(totalRevenue.toFixed(4)),
      activeContracts,
      userGrowth: parseFloat(userGrowth.toFixed(1)),
      projectGrowth: parseFloat(projectGrowth.toFixed(1)),
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
 *     summary: Get public platform statistics (no auth required)
 *     tags: [Platform]
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
router.get('/platform-stats', async (_req: Request, res: Response) => {
  try {
    // Get total users count
    const allUsers = await userRepository.getAllUsers();
    const totalFreelancers = allUsers.filter(u => u.role === 'freelancer').length;
    const totalEmployers = allUsers.filter(u => u.role === 'employer').length;

    // Get total projects count
    const allProjects = await projectRepository.getAllProjects();
    const totalProjects = allProjects.length;

    // Calculate total paid out from completed contracts
    const allContracts = await contractRepository.getAllContracts();
    const completedContracts = allContracts.filter(c => c.status === 'completed');
    const totalPaidOut = completedContracts.reduce((sum, contract) => sum + contract.total_amount, 0);

    // Calculate satisfaction rate from reviews
    let satisfactionRate = 0;
    const allReviews = await ReviewRepository.getAllReviews();

    if (allReviews.length > 0) {
      const totalRating = allReviews.reduce((sum, review) => sum + review.rating, 0);
      const averageRating = totalRating / allReviews.length;
      satisfactionRate = Math.round((averageRating / 5) * 100);
    }

    res.json({
      totalFreelancers,
      totalEmployers,
      totalProjects,
      totalPaidOut: totalPaidOut.toFixed(2),
      satisfactionRate,
    });
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
router.patch('/users/:id', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
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
    const kycVerification = await getKycVerificationByUserId(id);
    const isKycVerified = updatedUser?.role === 'admin' || 
                         (kycVerification?.status === 'approved' && 
                          (!kycVerification.expires_at || new Date(kycVerification.expires_at) > new Date()));

    res.json({
      id: updatedUser!.id,
      email: updatedUser!.email,
      role: updatedUser!.role,
      walletAddress: updatedUser!.wallet_address || '',
      createdAt: updatedUser!.created_at,
      name: updatedUser!.name || '',
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
