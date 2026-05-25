// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockSubmitTx = jest.fn() as jest.Mock<any>;
const mockConfirmTx = jest.fn() as jest.Mock<any>;

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
  };
}

describe('Milestone Registry - confirm gap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitTx.mockResolvedValue({ id: 'tx-1' });
    mockConfirmTx.mockResolvedValue(makeConfirmed());
    (global as any).mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('approveMilestoneOnRegistry should throw when confirm returns null (line 213)', async () => {
    const { approveMilestoneOnRegistry } = await import('../../services/milestone-registry.js');
    (global as any).mockPool.query.mockResolvedValueOnce({
      rows: [makeRegistryRow('submitted')],
      rowCount: 1,
    });
    mockConfirmTx.mockResolvedValueOnce(null);

    await expect(approveMilestoneOnRegistry(MILESTONE_ID, EM_WALLET))
      .rejects.toThrow('Failed to confirm transaction');
  });

  it('rejectMilestoneOnRegistry should throw when confirm returns null (line 271)', async () => {
    const { rejectMilestoneOnRegistry } = await import('../../services/milestone-registry.js');
    (global as any).mockPool.query.mockResolvedValueOnce({
      rows: [makeRegistryRow('submitted')],
      rowCount: 1,
    });
    mockConfirmTx.mockResolvedValueOnce(null);

    await expect(rejectMilestoneOnRegistry(MILESTONE_ID, EM_WALLET, 'bad work'))
      .rejects.toThrow('Failed to confirm transaction');
  });
});
