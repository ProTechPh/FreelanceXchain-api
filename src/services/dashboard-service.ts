import { logger } from '../config/logger.js';
import { getUnreadCount } from './notification-service.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { proposalRepository } from '../repositories/proposal-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { reviewRepository } from '../repositories/review-repository.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';

export type DashboardSummary = {
  unreadNotifications: number;
  activeContracts: number;
  pendingProposals: number;
  openProjects: number;
  averageRating: number;
  reviewCount: number;
};

/**
 * Aggregate a user's marketplace activity into a single dashboard summary.
 *
 * Counts use dedicated count queries (contractRepository.countContractsByUserAndStatus,
 * proposalRepository.countProposalsByFreelancerAndStatus, projectRepository.countProjectsByEmployerAndStatus)
 * rather than materializing full lists, so the numbers are exact even for users with
 * more than a thousand contracts/proposals. Each repository already degrades to 0 on
 * a transient failure; the outer try/catch guards against unexpected service-level throws.
 */
export async function getDashboardSummary(userId: string): Promise<ServiceResult<DashboardSummary>> {
  try {
    const [unreadResult, activeContracts, pendingProposals, openProjects, rating] = await Promise.all([
      getUnreadCount(userId),
      contractRepository.countContractsByUserAndStatus(userId, 'active'),
      proposalRepository.countProposalsByFreelancerAndStatus(userId, 'pending'),
      projectRepository.countProjectsByEmployerAndStatus(userId, 'open'),
      reviewRepository.getAverageRating(userId),
    ]);

    return successResult({
      unreadNotifications: unreadResult.success ? unreadResult.data : 0,
      activeContracts,
      pendingProposals,
      openProjects,
      averageRating: rating.count > 0 ? Math.round(rating.average * 10) / 10 : 0,
      reviewCount: rating.count,
    });
  } catch (error) {
    logger.error('Unexpected error in getDashboardSummary', { error, userId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
