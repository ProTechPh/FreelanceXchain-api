// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetContractById = jest.fn<any>();
const mockUpdateContract = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: {
    getContractById: mockGetContractById,
    updateContract: mockUpdateContract,
    getContractByIdWithRelations: jest.fn<any>(),
    getUserContracts: jest.fn<any>(),
    getContractsByFreelancer: jest.fn<any>(),
    getContractsByEmployer: jest.fn<any>(),
    getContractsByProject: jest.fn<any>(),
    findContractByProposalId: jest.fn<any>(),
  },
}));

const mockGetUserById = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: { getUserById: mockGetUserById },
}));

jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: { getDisputesByContract: jest.fn<any>() },
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockPoolQuery = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: mockPoolQuery },
}));

jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapContractFromEntity: (entity: any) => entity,
  ContractStatus: {},
}));

const { cancelPendingContract, getContractWalletAddresses } = await import('../../services/contract-service.js');

describe('Contract Service - Extended Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cancelPendingContract', () => {
    it('should cancel a pending contract successfully', async () => {
      mockGetContractById.mockResolvedValue({ id: 'c-1', status: 'pending', employer_id: 'user-1', freelancer_id: 'user-2' });
      mockPoolQuery.mockResolvedValue({ rows: [{ result: true }] });
      const result = await cancelPendingContract('c-1', 'user-1');
      expect(result.success).toBe(true);
    });

    it('should return NOT_FOUND if contract does not exist', async () => {
      mockGetContractById.mockResolvedValue(null);
      const result = await cancelPendingContract('c-999', 'user-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return UNAUTHORIZED if user is not employer or freelancer', async () => {
      mockGetContractById.mockResolvedValue({ id: 'c-1', status: 'pending', employer_id: 'user-1', freelancer_id: 'user-2' });
      const result = await cancelPendingContract('c-1', 'user-3');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return INVALID_STATUS if contract is not pending', async () => {
      mockGetContractById.mockResolvedValue({ id: 'c-1', status: 'active', employer_id: 'user-1', freelancer_id: 'user-2' });
      const result = await cancelPendingContract('c-1', 'user-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return UPDATE_FAILED if RPC returns false', async () => {
      mockGetContractById.mockResolvedValue({ id: 'c-1', status: 'pending', employer_id: 'user-1', freelancer_id: 'user-2' });
      mockPoolQuery.mockResolvedValue({ rows: [{ result: false }] });
      const result = await cancelPendingContract('c-1', 'user-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should allow freelancer to cancel', async () => {
      mockGetContractById.mockResolvedValue({ id: 'c-1', status: 'pending', employer_id: 'user-1', freelancer_id: 'user-2' });
      mockPoolQuery.mockResolvedValue({ rows: [{ result: true }] });
      const result = await cancelPendingContract('c-1', 'user-2');
      expect(result.success).toBe(true);
    });
  });

  describe('getContractWalletAddresses', () => {
    it('should return wallet addresses for both parties', async () => {
      mockGetContractById.mockResolvedValue({ id: 'c-1', employer_id: 'emp-1', freelancer_id: 'free-1' });
      mockGetUserById.mockImplementation((id: string) => {
        if (id === 'emp-1') return { id: 'emp-1', wallet_address: '0xEmployerWallet1234567890123456789012345678' };
        if (id === 'free-1') return { id: 'free-1', wallet_address: '0xFreelancerWallet12345678901234567890123456' };
        return null;
      });
      const result = await getContractWalletAddresses('c-1');
      expect(result.success).toBe(true);
      expect(result.data.employerWallet).toBe('0xEmployerWallet1234567890123456789012345678');
      expect(result.data.freelancerWallet).toBe('0xFreelancerWallet12345678901234567890123456');
    });

    it('should return NOT_FOUND if contract does not exist', async () => {
      mockGetContractById.mockResolvedValue(null);
      const result = await getContractWalletAddresses('c-999');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return MISSING_WALLET if employer has no wallet', async () => {
      mockGetContractById.mockResolvedValue({ id: 'c-1', employer_id: 'emp-1', freelancer_id: 'free-1' });
      mockGetUserById.mockImplementation((id: string) => {
        if (id === 'emp-1') return { id: 'emp-1', wallet_address: null };
        if (id === 'free-1') return { id: 'free-1', wallet_address: '0xFreelancerWallet12345678901234567890123456' };
        return null;
      });
      const result = await getContractWalletAddresses('c-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_WALLET');
    });

    it('should return MISSING_WALLET if freelancer has no wallet', async () => {
      mockGetContractById.mockResolvedValue({ id: 'c-1', employer_id: 'emp-1', freelancer_id: 'free-1' });
      mockGetUserById.mockImplementation((id: string) => {
        if (id === 'emp-1') return { id: 'emp-1', wallet_address: '0xEmployerWallet1234567890123456789012345678' };
        if (id === 'free-1') return { id: 'free-1', wallet_address: null };
        return null;
      });
      const result = await getContractWalletAddresses('c-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_WALLET');
    });

    it('should return MISSING_WALLET if user not found', async () => {
      mockGetContractById.mockResolvedValue({ id: 'c-1', employer_id: 'emp-1', freelancer_id: 'free-1' });
      mockGetUserById.mockResolvedValue(null);
      const result = await getContractWalletAddresses('c-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_WALLET');
    });
  });
});
