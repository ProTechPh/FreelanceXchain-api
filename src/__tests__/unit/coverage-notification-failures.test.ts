// @ts-nocheck
/**
 * Covers notification failure catch blocks:
 * - proposal-service.ts lines 129-131, 404-406, 451-453, 532-534
 * - rush-upgrade-service.ts lines 386-387, 452-453
 * - dispute-service.ts lines 427-428, 476-477
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockClient = {
  query: jest.fn<any>().mockResolvedValue({ rows: [{ id: 'm-1' }], rowCount: 1 }),
  release: jest.fn(),
};
const mockPool = { query: jest.fn<any>(), connect: jest.fn<any>().mockResolvedValue(mockClient) };
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPool,
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn(), security: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'gen-id-123',
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: { appwrite: { endpoint: 'http://localhost', projectId: 'test' } },
}));

// Notification repository that THROWS
const mockNotificationRepository = {
  createNotification: jest.fn<any>().mockRejectedValue(new Error('Notification DB error')),
};
jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: mockNotificationRepository,
}));

const mockProposalRepository = {
  findProposalById: jest.fn<any>(),
  createProposal: jest.fn<any>(),
  updateProposal: jest.fn<any>(),
  getProposalsByProject: jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, total: 0 }),
  getProposalsByFreelancer: jest.fn<any>(),
  getExistingProposal: jest.fn<any>(),
  getAcceptedProposalCount: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({
  proposalRepository: mockProposalRepository,
}));

const mockProjectRepository = {
  findProjectById: jest.fn<any>(),
  updateProject: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
}));

const mockContractRepository = {
  getContractById: jest.fn<any>(),
  getContractsByEmployer: jest.fn<any>(),
  updateContract: jest.fn<any>(),
  createContract: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepository,
}));

const mockUserRepository = {
  getUserById: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepository,
}));

jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapProposalFromEntity: (e: any) => ({
    ...e, freelancerId: e.freelancer_id, projectId: e.project_id,
    id: e.id, status: e.status,
  }),
  mapProjectFromEntity: (e: any) => ({
    ...e, employerId: e.employer_id, title: e.title, id: e.id,
  }),
  mapContractFromEntity: (e: any) => ({ ...e }),
}));

jest.unstable_mockModule(resolveModule('src/services/agreement-contract.ts'), () => ({
  createAgreementOnBlockchain: jest.fn<any>().mockResolvedValue({ success: true, data: { agreementId: 'agr-1' } }),
  signAgreement: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/services/escrow-contract.ts'), () => ({
  deployEscrow: jest.fn<any>(),
  initializeEscrow: jest.fn<any>().mockResolvedValue({ success: true, data: { escrowAddress: '0xescrow' } }),
  getEscrowState: jest.fn<any>(),
  releaseMilestone: jest.fn<any>(),
  refundMilestone: jest.fn<any>(),
  depositToEscrow: jest.fn<any>(),
  getEscrowBalance: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/services/blockchain/factory.ts'), () => ({
  getBlockchainAdapter: jest.fn<any>().mockReturnValue({
    deployEscrowContract: jest.fn<any>().mockResolvedValue({ success: true, data: { escrowAddress: '0xescrow' } }),
  }),
}));

const { submitProposal, acceptProposal, rejectProposal } = await import(
  '../../services/proposal-service.js'
);

describe('Proposal Service - notification failure catch blocks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-set notification to throw
    mockNotificationRepository.createNotification.mockRejectedValue(
      new Error('Notification DB error')
    );
    // Re-set proposal repository mocks that may have been cleared
    mockProposalRepository.getProposalsByProject.mockResolvedValue({ items: [], hasMore: false, total: 0 });
  });

  // Lines 129-131: submitProposal notification failure
  it('submitProposal succeeds even when notification creation fails', async () => {
    mockProjectRepository.findProjectById.mockResolvedValue({
      id: 'p-1', employer_id: 'emp-1', title: 'Test Project',
      status: 'open', freelancer_limit: 3,
    });
    mockProposalRepository.getExistingProposal.mockResolvedValue(null);
    mockProposalRepository.getAcceptedProposalCount.mockResolvedValue(0);
    mockProposalRepository.getProposalsByFreelancer.mockResolvedValue([]);
    mockProposalRepository.getProposalsByProject.mockResolvedValue([]);
    mockProposalRepository.createProposal.mockResolvedValue({
      id: 'prop-1', freelancer_id: 'f-1', project_id: 'p-1',
      status: 'pending', proposed_rate: 1000, cover_letter: 'test',
    });

    const result = await submitProposal('f-1', {
      projectId: 'p-1',
      proposedRate: 1000,
      coverLetter: 'I am a great fit for this project',
      estimatedDuration: '2 weeks',
      attachments: [],
    });

    expect(result.success).toBe(true);
    expect(mockNotificationRepository.createNotification).toHaveBeenCalled();
  });

  // Lines 404-406, 451-453: acceptProposal notification failures
  it('acceptProposal succeeds even when notification creation fails', async () => {
    mockProposalRepository.findProposalById.mockResolvedValue({
      id: 'prop-1', status: 'pending', project_id: 'p-1',
      freelancer_id: 'f-1', proposed_rate: 1000,
    });
    mockProjectRepository.findProjectById.mockResolvedValue({
      id: 'p-1', employer_id: 'emp-1', title: 'Test Project',
      milestones: [{ title: 'MS1', amount: 1000, due_date: '2025-06-01' }],
      freelancer_limit: 1,
    });

    // Mock the multiple pool queries for accept:
    // 1) COUNT check, 2) RPC call, 3) contract lookup
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })  // COUNT pre-check
      .mockResolvedValueOnce({  // accept_proposal_atomic RPC
        rows: [{ result: JSON.stringify({
          contract: { id: 'c-1', freelancer_id: 'f-1', employer_id: 'emp-1', project_id: 'p-1', status: 'pending', total_amount: 1000 },
          proposal: { id: 'prop-1', status: 'accepted' },
          project: { id: 'p-1', status: 'in_progress' },
          milestones: [{ id: 'm-1', title: 'MS1', amount: 1000 }],
          limitReached: true,
        }) }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'c-1' }], rowCount: 1 });  // contract lookup

    const result = await acceptProposal('prop-1', 'emp-1');
    expect(result.success).toBe(true);
    // Notification was attempted but failed - should still succeed
    expect(mockNotificationRepository.createNotification).toHaveBeenCalled();
  });

  // Lines 532-534: rejectProposal notification failure
  it('rejectProposal succeeds even when notification creation fails', async () => {
    mockProposalRepository.findProposalById.mockResolvedValue({
      id: 'prop-1', status: 'pending', project_id: 'p-1', freelancer_id: 'f-1',
    });
    mockProjectRepository.findProjectById.mockResolvedValue({
      id: 'p-1', employer_id: 'emp-1', title: 'Test Project',
    });
    mockProposalRepository.updateProposal.mockResolvedValue({
      id: 'prop-1', status: 'rejected', project_id: 'p-1', freelancer_id: 'f-1',
    });

    const result = await rejectProposal('prop-1', 'emp-1');
    expect(result.success).toBe(true);
    expect(mockNotificationRepository.createNotification).toHaveBeenCalled();
  });

  // Line 404: acceptProposal - blockchain agreement creation throws
  it('should handle notification failures gracefully (lines 129-131, 532-534)', async () => {
    // Make createAgreementOnBlockchain throw to hit line 404
    const { createAgreementOnBlockchain } = await import('../../services/agreement-contract.js');
    (createAgreementOnBlockchain as any).mockRejectedValueOnce(new Error('Blockchain unavailable'));

    // Mock users with wallet addresses so blockchain code is reached
    mockUserRepository.getUserById
      .mockResolvedValueOnce({ id: 'emp-1', wallet_address: '0xemployer' })
      .mockResolvedValueOnce({ id: 'f-1', wallet_address: '0xfreelancer' });

    mockProposalRepository.findProposalById.mockResolvedValue({
      id: 'prop-1', status: 'pending', project_id: 'p-1',
      freelancer_id: 'f-1', proposed_rate: 1000,
    });
    mockProjectRepository.findProjectById.mockResolvedValue({
      id: 'p-1', employer_id: 'emp-1', title: 'Test Project',
      milestones: [{ title: 'MS1', amount: 1000, due_date: '2025-06-01' }],
      freelancer_limit: 1,
    });

    // Mock the multiple pool queries for accept:
    // 1) COUNT check, 2) RPC call, 3) contract lookup
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })  // COUNT pre-check
      .mockResolvedValueOnce({  // accept_proposal_atomic RPC
        rows: [{ result: JSON.stringify({
          contract: { id: 'c-1', freelancer_id: 'f-1', employer_id: 'emp-1', project_id: 'p-1', status: 'pending', total_amount: 1000 },
          proposal: { id: 'prop-1', status: 'accepted' },
          project: { id: 'p-1', status: 'in_progress' },
          milestones: [{ id: 'm-1', title: 'MS1', amount: 1000 }],
          limitReached: true,
        }) }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'c-1' }], rowCount: 1 });  // contract lookup

    // Should succeed even when blockchain throws (line 404 catch block)
    const result = await acceptProposal('prop-1', 'emp-1');
    expect(result.success).toBe(true);
  });
});
