// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetUnreadCount = jest.fn<any>();
const mockCountContractsByUserAndStatus = jest.fn<any>();
const mockCountProposalsByFreelancerAndStatus = jest.fn<any>();
const mockCountProjectsByEmployerAndStatus = jest.fn<any>();
const mockGetAverageRating = jest.fn<any>();
const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger: mockLogger }));

jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  getUnreadCount: mockGetUnreadCount,
}));

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: { countContractsByUserAndStatus: mockCountContractsByUserAndStatus },
}));

jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({
  proposalRepository: { countProposalsByFreelancerAndStatus: mockCountProposalsByFreelancerAndStatus },
}));

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: { countProjectsByEmployerAndStatus: mockCountProjectsByEmployerAndStatus },
}));

jest.unstable_mockModule(resolveModule('src/repositories/review-repository.ts'), () => ({
  reviewRepository: { getAverageRating: mockGetAverageRating },
}));

const { getDashboardSummary } = await import('../../services/dashboard-service.js');

describe('Dashboard Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUnreadCount.mockResolvedValue({ success: true, data: 3 });
    mockCountContractsByUserAndStatus.mockResolvedValue(2);
    mockCountProposalsByFreelancerAndStatus.mockResolvedValue(2);
    mockCountProjectsByEmployerAndStatus.mockResolvedValue(1);
    mockGetAverageRating.mockResolvedValue({ average: 4.666, count: 3 });
  });

  it('should aggregate metrics from all sources', async () => {
    const result = await getDashboardSummary('user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unreadNotifications).toBe(3);
      expect(result.data.activeContracts).toBe(2);
      expect(result.data.pendingProposals).toBe(2);
      expect(result.data.openProjects).toBe(1);
      expect(result.data.averageRating).toBe(4.7); // rounded to 1 decimal
      expect(result.data.reviewCount).toBe(3);
    }

    expect(mockCountContractsByUserAndStatus).toHaveBeenCalledWith('user-1', 'active');
    expect(mockCountProposalsByFreelancerAndStatus).toHaveBeenCalledWith('user-1', 'pending');
    expect(mockCountProjectsByEmployerAndStatus).toHaveBeenCalledWith('user-1', 'open');
  });

  it('should round average rating to 1 decimal place', async () => {
    mockGetAverageRating.mockResolvedValue({ average: 5, count: 1 });
    const result = await getDashboardSummary('user-1');
    if (result.success) {
      expect(result.data.averageRating).toBe(5);
    }
  });

  it('should return 0 average rating when there are no reviews', async () => {
    mockGetAverageRating.mockResolvedValue({ average: 0, count: 0 });
    const result = await getDashboardSummary('user-1');
    if (result.success) {
      expect(result.data.averageRating).toBe(0);
      expect(result.data.reviewCount).toBe(0);
    }
  });

  it('should default unread count to 0 when the source fails', async () => {
    mockGetUnreadCount.mockResolvedValue({ success: false, error: { code: 'X', message: 'err' } });
    const result = await getDashboardSummary('user-1');
    if (result.success) {
      expect(result.data.unreadNotifications).toBe(0);
    }
  });

  it('should return INTERNAL_ERROR when an unexpected error occurs', async () => {
    mockCountContractsByUserAndStatus.mockRejectedValue(new Error('boom'));
    const result = await getDashboardSummary('user-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
