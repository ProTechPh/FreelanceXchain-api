/**
 * Admin Service
 * Business logic for admin operations
 */

import { userRepository } from '../repositories/user-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { getKycVerificationByUserId } from '../repositories/didit-kyc-repository.js';
import { logger } from '../config/logger.js';

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  walletAddress: string;
  createdAt: string;
  name: string;
  kycVerified: boolean;
  isActive: boolean;
}

export interface AdminStats {
  totalUsers: number;
  totalProjects: number;
  totalFreelancers: number;
  totalEmployers: number;
}

export interface AdminAnalytics {
  totalUsers: number;
  totalProjects: number;
  totalRevenue: number;
  activeContracts: number;
  userGrowth: number;
  projectGrowth: number;
}

/**
 * Get all users with KYC status
 */
export async function getAllUsersWithKyc(): Promise<AdminUser[]> {
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

    return usersWithKyc;
  } catch (error) {
    logger.error('Error fetching users with KYC status', error);
    throw new Error('Failed to fetch users');
  }
}

/**
 * Get admin dashboard statistics
 */
export async function getAdminStats(): Promise<AdminStats> {
  try {
    // Get total users count
    const allUsers = await userRepository.getAllUsers();
    const totalUsers = allUsers.length;
    const totalFreelancers = allUsers.filter(u => u.role === 'freelancer').length;
    const totalEmployers = allUsers.filter(u => u.role === 'employer').length;

    // Get total projects count
    const allProjects = await projectRepository.getAllProjects();
    const totalProjects = allProjects.length;

    return {
      totalUsers,
      totalProjects,
      totalFreelancers,
      totalEmployers,
    };
  } catch (error) {
    logger.error('Error fetching admin stats', error);
    throw new Error('Failed to fetch admin statistics');
  }
}

/**
 * Get comprehensive analytics data
 */
export async function getAdminAnalytics(): Promise<AdminAnalytics> {
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

    return {
      totalUsers,
      totalProjects,
      totalRevenue,
      activeContracts,
      userGrowth,
      projectGrowth,
    };
  } catch (error) {
    logger.error('Error fetching admin analytics', error);
    throw new Error('Failed to fetch admin analytics');
  }
}
