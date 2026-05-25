import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockSubmitTx = jest.fn() as jest.Mock<any>;
const mockConfirmTx = jest.fn() as jest.Mock<any>;
const mockGenerateWallet = jest.fn() as jest.Mock<any>;

let escrowStore: Map<string, any> = new Map();
let milestoneStore: Map<string, any[]> = new Map();

const mockPoolQuery = jest.fn(async (text: string) => {
  if (text.includes('blockchain_escrows WHERE address')) {
    const escrow = escrowStore.get('addr-1');
    return { rows: escrow ? [escrow] : [] };
  }
  if (text.includes('blockchain_escrow_milestones WHERE escrow_address')) {
    const ms = milestoneStore.get('addr-1') || [];
    return { rows: ms };
  }
  return { rows: [] };
});

const mockPool = { query: mockPoolQuery };

jest.unstable_mockModule(resolveModule('src/services/blockchain-client.ts'), () => ({
  submitTransaction: mockSubmitTx,
  confirmTransaction: mockConfirmTx,
  generateWalletAddress: mockGenerateWallet,
}));

jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPool,
}));

const {
  deployEscrow,
  depositToEscrow,
  releaseMilestone,
  refundMilestone,
  getEscrowBalance,
  getEscrowState,
  getMilestoneStatus,
  areAllMilestonesReleased,
  getEscrowByContractId,
  clearEscrows,
} = await import('../../services/escrow-contract.js');

const ESCROW_ADDR = '0xAddr1';
const EMPLOYER = '0xEmployer';
const FREELANCER = '0xFreelancer';

function makeTx(hash = 'tx-hash', blockNumber = 1) {
  return {
    id: 'tx-1',
    type: 'escrow_deploy',
    hash,
    blockNumber,
    gasUsed: BigInt(21000),
    status: 'confirmed',
  };
}

function makeEscrowRow(overrides: Record<string, any> = {}) {
  return {
    address: ESCROW_ADDR,
    contract_id: 'c-1',
    employer_address: EMPLOYER,
    freelancer_address: FREELANCER,
    total_amount: '1000',
    balance: '1000',
    deployed_at: Date.now(),
    deployment_tx_hash: 'deploy-hash',
    ...overrides,
  };
}

function makeMilestoneRows() {
  return [
    { id: 'ms-1', escrow_address: ESCROW_ADDR, amount: '500', status: 'pending' },
    { id: 'ms-2', escrow_address: ESCROW_ADDR, amount: '500', status: 'pending' },
  ];
}

describe('escrow-contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    escrowStore.clear();
    milestoneStore.clear();
    mockGenerateWallet.mockReturnValue(ESCROW_ADDR);
    mockSubmitTx.mockResolvedValue(makeTx());
    mockConfirmTx.mockResolvedValue(makeTx());
  });

  describe('deployEscrow', () => {
    it('should deploy a new escrow and save to DB', async () => {
      const params = {
        contractId: 'c-1',
        employerAddress: EMPLOYER,
        freelancerAddress: FREELANCER,
        totalAmount: BigInt(1000),
        milestones: [
          { id: 'ms-1', amount: BigInt(500), status: 'pending' as const },
          { id: 'ms-2', amount: BigInt(500), status: 'pending' as const },
        ],
      };
      const result = await deployEscrow(params);
      expect(result.escrowAddress).toBe(ESCROW_ADDR);
      expect(result.transactionHash).toBe('tx-hash');
      expect(mockSubmitTx).toHaveBeenCalledTimes(1);
      expect(mockConfirmTx).toHaveBeenCalledTimes(1);
    });
  });

  describe('depositToEscrow', () => {
    it('should throw when escrow not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      await expect(depositToEscrow(ESCROW_ADDR, BigInt(500), EMPLOYER)).rejects.toThrow('Escrow contract not found');
    });

    it('should throw when depositor is not the employer', async () => {
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow()] };
        return { rows: [] };
      });
      await expect(depositToEscrow(ESCROW_ADDR, BigInt(500), '0xOther')).rejects.toThrow('Only employer can deposit');
    });

    it('should throw when transaction confirmation fails', async () => {
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow()] };
        return { rows: makeMilestoneRows() };
      });
      mockConfirmTx.mockResolvedValue(null);
      await expect(depositToEscrow(ESCROW_ADDR, BigInt(500), EMPLOYER)).rejects.toThrow('Failed to confirm deposit');
    });

    it('should deposit successfully and return receipt', async () => {
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow()] };
        return { rows: makeMilestoneRows() };
      });
      const receipt = await depositToEscrow(ESCROW_ADDR, BigInt(500), EMPLOYER);
      expect(receipt.status).toBe('success');
      expect(receipt.transactionHash).toBe('tx-hash');
    });
  });

  describe('releaseMilestone', () => {
    it('should throw when escrow not found', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      await expect(releaseMilestone(ESCROW_ADDR, 'ms-1', EMPLOYER)).rejects.toThrow('Escrow contract not found');
    });

    it('should throw when releaser is not employer', async () => {
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow()] };
        return { rows: makeMilestoneRows() };
      });
      await expect(releaseMilestone(ESCROW_ADDR, 'ms-1', '0xOther')).rejects.toThrow('Only employer can release');
    });

    it('should throw when milestone not found', async () => {
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow()] };
        return { rows: makeMilestoneRows() };
      });
      await expect(releaseMilestone(ESCROW_ADDR, 'nonexistent', EMPLOYER)).rejects.toThrow('Milestone not found');
    });

    it('should throw when milestone is already released', async () => {
      const rows = [{ id: 'ms-1', escrow_address: ESCROW_ADDR, amount: '500', status: 'released' }];
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow()] };
        return { rows: rows };
      });
      await expect(releaseMilestone(ESCROW_ADDR, 'ms-1', EMPLOYER)).rejects.toThrow('already released');
    });

    it('should throw when milestone is refunded', async () => {
      const rows = [{ id: 'ms-1', escrow_address: ESCROW_ADDR, amount: '500', status: 'refunded' }];
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow()] };
        return { rows: rows };
      });
      await expect(releaseMilestone(ESCROW_ADDR, 'ms-1', EMPLOYER)).rejects.toThrow('refunded');
    });

    it('should throw when balance is insufficient', async () => {
      const rows = [{ id: 'ms-1', escrow_address: ESCROW_ADDR, amount: '9999', status: 'pending' }];
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow({ balance: '100' })] };
        return { rows: rows };
      });
      await expect(releaseMilestone(ESCROW_ADDR, 'ms-1', EMPLOYER)).rejects.toThrow('Insufficient escrow balance');
    });

    it('should release milestone and return receipt', async () => {
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow()] };
        return { rows: makeMilestoneRows() };
      });
      const receipt = await releaseMilestone(ESCROW_ADDR, 'ms-1', EMPLOYER);
      expect(receipt.status).toBe('success');
    });
  });

  describe('refundMilestone', () => {
    it('should throw when escrow not found', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      await expect(refundMilestone(ESCROW_ADDR, 'ms-1', EMPLOYER)).rejects.toThrow('Escrow contract not found');
    });

    it('should throw when resolver is not employer', async () => {
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow()] };
        return { rows: makeMilestoneRows() };
      });
      await expect(refundMilestone(ESCROW_ADDR, 'ms-1', '0xOther')).rejects.toThrow('employer or authorized resolver');
    });

    it('should refund milestone and return receipt', async () => {
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow()] };
        return { rows: makeMilestoneRows() };
      });
      const receipt = await refundMilestone(ESCROW_ADDR, 'ms-1', EMPLOYER);
      expect(receipt.status).toBe('success');
    });
  });

  describe('getEscrowBalance', () => {
    it('should throw when escrow not found', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      await expect(getEscrowBalance(ESCROW_ADDR)).rejects.toThrow('Escrow contract not found');
    });

    it('should return the escrow balance', async () => {
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow({ balance: '750' })] };
        return { rows: makeMilestoneRows() };
      });
      const balance = await getEscrowBalance(ESCROW_ADDR);
      expect(balance).toBe(BigInt(750));
    });
  });

  describe('getEscrowState', () => {
    it('should return null when not found', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      const state = await getEscrowState(ESCROW_ADDR);
      expect(state).toBeNull();
    });

    it('should return the escrow state', async () => {
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow()] };
        return { rows: makeMilestoneRows() };
      });
      const state = await getEscrowState(ESCROW_ADDR);
      expect(state).not.toBeNull();
      expect(state?.contractId).toBe('c-1');
    });
  });

  describe('getMilestoneStatus', () => {
    it('should return null when escrow not found', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      const ms = await getMilestoneStatus(ESCROW_ADDR, 'ms-1');
      expect(ms).toBeNull();
    });

    it('should return null when milestone not in escrow', async () => {
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow()] };
        return { rows: makeMilestoneRows() };
      });
      const ms = await getMilestoneStatus(ESCROW_ADDR, 'nonexistent');
      expect(ms).toBeNull();
    });

    it('should return milestone status', async () => {
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow()] };
        return { rows: makeMilestoneRows() };
      });
      const ms = await getMilestoneStatus(ESCROW_ADDR, 'ms-1');
      expect(ms).not.toBeNull();
      expect(ms?.status).toBe('pending');
    });
  });

  describe('areAllMilestonesReleased', () => {
    it('should return false when escrow not found', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      expect(await areAllMilestonesReleased(ESCROW_ADDR)).toBe(false);
    });

    it('should return false when some milestones are pending', async () => {
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow()] };
        return { rows: makeMilestoneRows() };
      });
      expect(await areAllMilestonesReleased(ESCROW_ADDR)).toBe(false);
    });

    it('should return true when all milestones are released', async () => {
      const allReleased = makeMilestoneRows().map(m => ({ ...m, status: 'released' }));
      mockPoolQuery.mockImplementation(async (text: string) => {
        if (text.includes('blockchain_escrows WHERE address')) return { rows: [makeEscrowRow()] };
        return { rows: allReleased };
      });
      expect(await areAllMilestonesReleased(ESCROW_ADDR)).toBe(true);
    });
  });

  describe('getEscrowByContractId', () => {
    it('should return null when not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      const result = await getEscrowByContractId('c-999');
      expect(result).toBeNull();
    });
  });

  describe('clearEscrows', () => {
    it('should call appwrite delete on both tables', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      await clearEscrows();
      expect(mockPoolQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM blockchain_escrow_milestones'));
      expect(mockPoolQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM blockchain_escrows'));
    });
  });
});
