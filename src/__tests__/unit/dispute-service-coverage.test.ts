// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockDisputeRepository = {
  getDisputeById: jest.fn<any>(),
  createDispute: jest.fn<any>(),
  updateDispute: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: mockDisputeRepository,
}));

const mockContractRepository = {
  getContractById: jest.fn<any>(),
  updateContract: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepository,
}));

const mockProjectRepository = {
  findProjectById: jest.fn<any>(),
  updateProject: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
}));

const mockUserRepository = {
  getUserById: jest.fn<any>(),
  getUsersByRole: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepository,
}));

const mockNotificationRepository = {
  createNotification: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: mockNotificationRepository,
}));

const mockPool = { query: jest.fn<any>() };
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPool,
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'generated-id',
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapContractFromEntity: (entity: any) => ({ ...entity, freelancerId: entity.freelancer_id, employerId: entity.employer_id }),
  mapProjectFromEntity: (entity: any) => ({ ...entity }),
  mapMilestoneFromEntity: (entity: any) => ({ ...entity }),
  mapDisputeFromEntity: (entity: any) => ({ ...entity }),
  mapNotificationFromEntity: (entity: any) => ({ ...entity }),
}));

jest.unstable_mockModule(resolveModule('src/services/escrow-contract.ts'), () => ({
  getEscrowByContractId: jest.fn<any>(),
  releaseMilestone: jest.fn<any>(),
  refundMilestone: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/services/dispute-registry.ts'), () => ({
  createDisputeOnBlockchain: jest.fn<any>(),
  updateDisputeEvidence: jest.fn<any>(),
  resolveDisputeOnBlockchain: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/services/agreement-contract.ts'), () => ({
  disputeAgreement: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  notifyDisputeCreated: jest.fn<any>(),
  notifyDisputeResolved: jest.fn<any>(),
}));

const { submitEvidence, resolveDispute } = await import('../../services/dispute-service.js');

describe('Dispute Service - Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Lines 180-184: submitEvidence - dispute not found
  describe('submitEvidence', () => {
    it('should return NOT_FOUND when dispute does not exist', async () => {
      mockDisputeRepository.getDisputeById.mockResolvedValue(null);

      const result = await submitEvidence({
        disputeId: 'd-1', submitterId: 'user-1', type: 'text', content: 'evidence',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    // Lines 232-235: dispute is resolved
    it('should return INVALID_STATUS when dispute is resolved', async () => {
      mockDisputeRepository.getDisputeById.mockResolvedValue({ id: 'd-1', status: 'resolved', contract_id: 'c-1' });

      const result = await submitEvidence({
        disputeId: 'd-1', submitterId: 'user-1', type: 'text', content: 'evidence',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    // Lines 370-374: contract not found
    it('should return NOT_FOUND when contract does not exist', async () => {
      mockDisputeRepository.getDisputeById.mockResolvedValue({ id: 'd-1', status: 'open', contract_id: 'c-1' });
      mockContractRepository.getContractById.mockResolvedValue(null);

      const result = await submitEvidence({
        disputeId: 'd-1', submitterId: 'user-1', type: 'text', content: 'evidence',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    // Lines 380-384: unauthorized submitter
    it('should return UNAUTHORIZED when submitter is not part of contract', async () => {
      mockDisputeRepository.getDisputeById.mockResolvedValue({ id: 'd-1', status: 'open', contract_id: 'c-1' });
      mockContractRepository.getContractById.mockResolvedValue({ employer_id: 'emp-1', freelancer_id: 'free-1' });

      const result = await submitEvidence({
        disputeId: 'd-1', submitterId: 'outsider', type: 'text', content: 'evidence',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    // Lines 389-393: RPC failed
    it('should return UPDATE_FAILED when RPC fails', async () => {
      mockDisputeRepository.getDisputeById.mockResolvedValue({ id: 'd-1', status: 'open', contract_id: 'c-1' });
      mockContractRepository.getContractById.mockResolvedValue({ employer_id: 'user-1', freelancer_id: 'free-1' });
      mockPool.query.mockResolvedValue({ rows: [{ result: false }] });

      const result = await submitEvidence({
        disputeId: 'd-1', submitterId: 'user-1', type: 'text', content: 'evidence',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });

  // Lines 444-457: resolveDispute - unauthorized
  describe('resolveDispute', () => {
    it('should return UNAUTHORIZED when resolver is not admin', async () => {
      const result = await resolveDispute({
        disputeId: 'd-1', decision: 'freelancer_favor', reasoning: 'test', resolvedBy: 'user-1', resolverRole: 'freelancer',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    // Lines 507: dispute not found
    it('should return NOT_FOUND when dispute does not exist', async () => {
      mockDisputeRepository.getDisputeById.mockResolvedValue(null);

      const result = await resolveDispute({
        disputeId: 'd-1', decision: 'freelancer_favor', reasoning: 'test', resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return ALREADY_RESOLVED when dispute is already resolved', async () => {
      mockDisputeRepository.getDisputeById.mockResolvedValue({ id: 'd-1', status: 'resolved', contract_id: 'c-1' });

      const result = await resolveDispute({
        disputeId: 'd-1', decision: 'freelancer_favor', reasoning: 'test', resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ALREADY_RESOLVED');
    });
  });
});
