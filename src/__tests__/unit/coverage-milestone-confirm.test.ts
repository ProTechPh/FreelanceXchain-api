// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockSubmitTx = jest.fn() as jest.Mock<any>;
const mockConfirmTx = jest.fn() as jest.Mock<any>;

const mockBlockchainMilestoneRecordRepository = {
  findByMilestoneIdHash: jest.fn(),
  createMilestoneRecord: jest.fn(),
  updateMilestoneRecord: jest.fn(),
};

jest.unstable_mockModule(resolveModule('src/repositories/blockchain-milestone-record-repository.ts'), () => ({
  blockchainMilestoneRecordRepository: mockBlockchainMilestoneRecordRepository,
}));

function makeConfirmed(hash = '0xabc123', blockNumber = 1) {
  return {
    id: 'tx-1',
    hash,
    blockNumber,
    gasUsed: BigInt(21000),
  };
}

jest.unstable_mockModule(resolveModule('src/services/blockchain-client.ts'), () => ({
  submitTransaction: mockSubmitTx,
  confirmTransaction: mockConfirmTx,
  generateWalletAddress: jest.fn(() => '0x' + 'a'.repeat(40)),
}));

const MILESTONE_ID = 'ms-confirm-gap';
const EM_WALLET = '0xEmployer';
const MOCK_HASH = '0x' + 'a'.repeat(64);

function makeRegistryRow(status = 'submitted') {
  return {
    id: MOCK_HASH,
    milestone_id_hash: MOCK_HASH,
    contract_id_hash: MOCK_HASH,
    work_hash: '0x' + 'b'.repeat(64),
    freelancer_wallet: '0xFreelancer',
    employer_wallet: EM_WALLET,
    amount: 500,
    status,
    submitted_at: Date.now(),
    completed_at: null,
    title: 'Phase 1',
    transaction_hash: null,
    block_number: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe('Milestone Registry - confirm gap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitTx.mockResolvedValue({ id: 'tx-1' });
    mockConfirmTx.mockResolvedValue(makeConfirmed());
    mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValue(null);
    mockBlockchainMilestoneRecordRepository.updateMilestoneRecord.mockResolvedValue({});
  });

  it('approveMilestoneOnRegistry should throw when confirm returns null (line 213)', async () => {
    const { approveMilestoneOnRegistry } = await import('../../services/milestone-registry.js');
    mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(makeRegistryRow('submitted'));
    mockConfirmTx.mockResolvedValueOnce(null);

    await expect(approveMilestoneOnRegistry(MILESTONE_ID, EM_WALLET))
      .rejects.toThrow('Failed to confirm transaction');
  });

  it('rejectMilestoneOnRegistry should throw when confirm returns null (line 271)', async () => {
    const { rejectMilestoneOnRegistry } = await import('../../services/milestone-registry.js');
    mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(makeRegistryRow('submitted'));
    mockConfirmTx.mockResolvedValueOnce(null);

    await expect(rejectMilestoneOnRegistry(MILESTONE_ID, EM_WALLET, 'bad work'))
      .rejects.toThrow('Failed to confirm transaction');
  });
});
