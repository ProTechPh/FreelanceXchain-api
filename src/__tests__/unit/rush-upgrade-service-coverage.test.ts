// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockRushUpgradeRequestRepository = {
  getRequestById: jest.fn<any>(),
  createRequest: jest.fn<any>(),
  updateRequest: jest.fn<any>(),
  getRequestsByContract: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/rush-upgrade-request-repository.ts'), () => ({
  rushUpgradeRequestRepository: mockRushUpgradeRequestRepository,
}));

const mockContractRepository = {
  getContractById: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepository,
}));

const mockProjectRepository = {
  findProjectById: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
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
  mapContractFromEntity: (entity: any) => ({ ...entity, totalAmount: entity.total_amount }),
  mapRushUpgradeRequestFromEntity: (entity: any) => ({ ...entity }),
}));

const {
  respondToRushUpgrade,
  acceptCounterOffer,
  declineCounterOffer,
} = await import('../../services/rush-upgrade-service.js');

describe('Rush Upgrade Service - Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('respondToRushUpgrade', () => {
    // Lines 116-117: request not found
    it('should return NOT_FOUND when request does not exist', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue(null);

      const result = await respondToRushUpgrade('freelancer-1', { requestId: 'req-1', action: 'accept' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    // Lines 163-167: contract not found or freelancer mismatch
    it('should return UNAUTHORIZED when freelancer does not match', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'pending' });
      mockContractRepository.getContractById.mockResolvedValue({ freelancer_id: 'other-freelancer' });

      const result = await respondToRushUpgrade('freelancer-1', { requestId: 'req-1', action: 'accept' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    // Lines 207-208: invalid status
    it('should return INVALID_STATUS when request is not pending', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'accepted' });
      mockContractRepository.getContractById.mockResolvedValue({ freelancer_id: 'freelancer-1' });

      const result = await respondToRushUpgrade('freelancer-1', { requestId: 'req-1', action: 'accept' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    // Lines 224-228: accept - update failed
    it('should return UPDATE_FAILED when accept update fails', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'pending', proposed_percentage: 10 });
      mockContractRepository.getContractById.mockResolvedValue({ freelancer_id: 'freelancer-1', employer_id: 'emp-1', project_id: 'p-1' });
      mockRushUpgradeRequestRepository.updateRequest.mockResolvedValue(null);

      const result = await respondToRushUpgrade('freelancer-1', { requestId: 'req-1', action: 'accept' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    // Lines 245-246: accept - RPC failed
    it('should return UPDATE_FAILED when RPC fails', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'pending', proposed_percentage: 10 });
      mockContractRepository.getContractById.mockResolvedValue({ freelancer_id: 'freelancer-1', employer_id: 'emp-1', project_id: 'p-1' });
      mockRushUpgradeRequestRepository.updateRequest.mockResolvedValue({ id: 'req-1' });
      mockPool.query.mockResolvedValue({ rows: [{ result: false }] });

      const result = await respondToRushUpgrade('freelancer-1', { requestId: 'req-1', action: 'accept' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    // Lines 267-271: decline - update failed
    it('should return UPDATE_FAILED when decline update fails', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'pending', proposed_percentage: 10 });
      mockContractRepository.getContractById.mockResolvedValue({ freelancer_id: 'freelancer-1', employer_id: 'emp-1', project_id: 'p-1' });
      mockRushUpgradeRequestRepository.updateRequest.mockResolvedValue(null);

      const result = await respondToRushUpgrade('freelancer-1', { requestId: 'req-1', action: 'decline' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    // Lines 289-290: counter_offer - invalid percentage
    it('should return VALIDATION_ERROR for invalid counter percentage', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'pending', proposed_percentage: 10 });
      mockContractRepository.getContractById.mockResolvedValue({ freelancer_id: 'freelancer-1', employer_id: 'emp-1', project_id: 'p-1' });

      const result = await respondToRushUpgrade('freelancer-1', { requestId: 'req-1', action: 'counter_offer', counterPercentage: 0 });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    // Lines 294-299: counter_offer - update failed
    it('should return UPDATE_FAILED when counter offer update fails', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'pending', proposed_percentage: 10 });
      mockContractRepository.getContractById.mockResolvedValue({ freelancer_id: 'freelancer-1', employer_id: 'emp-1', project_id: 'p-1' });
      mockRushUpgradeRequestRepository.updateRequest.mockResolvedValue(null);

      const result = await respondToRushUpgrade('freelancer-1', { requestId: 'req-1', action: 'counter_offer', counterPercentage: 15 });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    // Lines 308-312: invalid action
    it('should return INVALID_ACTION for unknown action', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'pending', proposed_percentage: 10 });
      mockContractRepository.getContractById.mockResolvedValue({ freelancer_id: 'freelancer-1', employer_id: 'emp-1', project_id: 'p-1' });

      const result = await respondToRushUpgrade('freelancer-1', { requestId: 'req-1', action: 'invalid' as any });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_ACTION');
    });
  });

  describe('acceptCounterOffer', () => {
    // Lines 344-348: request not found
    it('should return NOT_FOUND when request does not exist', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue(null);

      const result = await acceptCounterOffer('emp-1', 'req-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    // Lines 357-362: unauthorized
    it('should return UNAUTHORIZED when employer does not match', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'counter_offered', counter_percentage: 15 });
      mockContractRepository.getContractById.mockResolvedValue({ employer_id: 'other-emp' });

      const result = await acceptCounterOffer('emp-1', 'req-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    // Lines 386-387: invalid status
    it('should return INVALID_STATUS when not counter_offered', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'pending', counter_percentage: 15 });
      mockContractRepository.getContractById.mockResolvedValue({ employer_id: 'emp-1' });

      const result = await acceptCounterOffer('emp-1', 'req-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    // Lines 402-406: no counter percentage
    it('should return NO_COUNTER when counter_percentage is missing', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'counter_offered', counter_percentage: null });
      mockContractRepository.getContractById.mockResolvedValue({ employer_id: 'emp-1' });

      const result = await acceptCounterOffer('emp-1', 'req-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NO_COUNTER');
    });

    // Lines 431-435: update failed
    it('should return UPDATE_FAILED when update fails', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'counter_offered', counter_percentage: 15 });
      mockContractRepository.getContractById.mockResolvedValue({ employer_id: 'emp-1', freelancer_id: 'f-1', project_id: 'p-1' });
      mockRushUpgradeRequestRepository.updateRequest.mockResolvedValue(null);

      const result = await acceptCounterOffer('emp-1', 'req-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    // Lines 452-453: RPC failed
    it('should return UPDATE_FAILED when RPC fails', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'counter_offered', counter_percentage: 15 });
      mockContractRepository.getContractById.mockResolvedValue({ employer_id: 'emp-1', freelancer_id: 'f-1', project_id: 'p-1' });
      mockRushUpgradeRequestRepository.updateRequest.mockResolvedValue({ id: 'req-1' });
      mockPool.query.mockResolvedValue({ rows: [{ result: false }] });

      const result = await acceptCounterOffer('emp-1', 'req-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });

  describe('declineCounterOffer', () => {
    it('should return NOT_FOUND when request does not exist', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue(null);

      const result = await declineCounterOffer('emp-1', 'req-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return UNAUTHORIZED when employer does not match', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'counter_offered' });
      mockContractRepository.getContractById.mockResolvedValue({ employer_id: 'other-emp' });

      const result = await declineCounterOffer('emp-1', 'req-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return INVALID_STATUS when not counter_offered', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'pending' });
      mockContractRepository.getContractById.mockResolvedValue({ employer_id: 'emp-1' });

      const result = await declineCounterOffer('emp-1', 'req-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return UPDATE_FAILED when update fails', async () => {
      mockRushUpgradeRequestRepository.getRequestById.mockResolvedValue({ id: 'req-1', contract_id: 'c-1', status: 'counter_offered' });
      mockContractRepository.getContractById.mockResolvedValue({ employer_id: 'emp-1', freelancer_id: 'f-1' });
      mockRushUpgradeRequestRepository.updateRequest.mockResolvedValue(null);

      const result = await declineCounterOffer('emp-1', 'req-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });
});
