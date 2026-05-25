import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { ContractRepository } = await import('../../repositories/contract-repository.js');

describe('ContractRepository', () => {
  let repo: any;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new ContractRepository();
    mockPool = (globalThis as any).mockPool;
  });

  describe('createContract', () => {
    it('should create and return a contract', async () => {
      const contract = { id: 'c1', project_id: 'p1', freelancer_id: 'f1', employer_id: 'e1', status: 'active' };
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...contract, created_at: 'now', updated_at: 'now' }] });
      
      const result = await repo.createContract(contract as any);
      expect(result.id).toBe(contract.id);
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('insert failed'));
      await expect(repo.createContract({ id: 'c1' } as any)).rejects.toThrow('Failed to create');
    });
  });

  describe('getContractById', () => {
    it('should return a contract', async () => {
      const contract = { id: 'c1' };
      mockPool.query.mockResolvedValueOnce({ rows: [contract] });
      const result = await repo.getContractById('c1');
      expect(result).toEqual(contract);
    });

    it('should return null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await repo.getContractById('c1');
      expect(result).toBeNull();
    });
  });

  describe('getContractByIdWithRelations', () => {
    it('should return contract with relations', async () => {
      const contract = { id: 'c1', project: { id: 'p1' }, freelancer: { id: 'f1' }, employer: { id: 'e1' } };
      mockPool.query.mockResolvedValueOnce({ rows: [contract] });
      const result = await repo.getContractByIdWithRelations('c1');
      expect(result).toEqual(contract);
    });

    it('should return null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await repo.getContractByIdWithRelations('c1');
      expect(result).toBeNull();
    });

    it('should throw on other errors', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('db error'));
      await expect(repo.getContractByIdWithRelations('c1')).rejects.toThrow('Failed to get contract with relations');
    });
  });

  describe('updateContract', () => {
    it('should update and return a contract', async () => {
      const contract = { id: 'c1', status: 'completed' };
      mockPool.query.mockResolvedValueOnce({ rows: [contract] });
      const result = await repo.updateContract('c1', { status: 'completed' });
      expect(result).toEqual(contract);
    });

    it('should return null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await repo.updateContract('c1', { status: 'completed' });
      expect(result).toBeNull();
    });
  });

  describe('findContractByProposalId', () => {
    it('should return a contract by proposal id', async () => {
      const contract = { id: 'c1', proposal_id: 'p1' };
      mockPool.query.mockResolvedValueOnce({ rows: [contract] });
      const result = await repo.findContractByProposalId('p1');
      expect(result).toEqual(contract);
    });

    it('should return null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await repo.findContractByProposalId('p1');
      expect(result).toBeNull();
    });
  });

  describe('getContractsByFreelancer', () => {
    it('should return paginated contracts', async () => {
      const contracts = [{ id: 'c1' }, { id: 'c2' }];
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // count query
        .mockResolvedValueOnce({ rows: contracts }); // data query
        
      const result = await repo.getContractsByFreelancer('f1');
      expect(result.items).toEqual(contracts);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should handle custom options and hasMore=true', async () => {
      const contracts = [{ id: 'c1' }];
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: contracts });
        
      const result = await repo.getContractsByFreelancer('f1', { limit: 1, offset: 0 });
      expect(result.items).toEqual(contracts);
      expect(result.hasMore).toBe(true);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getContractsByFreelancer('f1')).rejects.toThrow('select failed');
    });
  });

  describe('getContractsByEmployer', () => {
    it('should return paginated contracts', async () => {
      const contracts = [{ id: 'c1' }];
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: contracts });
        
      const result = await repo.getContractsByEmployer('e1');
      expect(result.items).toEqual(contracts);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getContractsByEmployer('e1')).rejects.toThrow('select failed');
    });
  });

  describe('getContractsByProject', () => {
    it('should return contracts for a project', async () => {
      const contracts = [{ id: 'c1' }];
      mockPool.query.mockResolvedValueOnce({ rows: contracts });
      const result = await repo.getContractsByProject('p1');
      expect(result).toEqual(contracts);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getContractsByProject('p1')).rejects.toThrow('Failed to get contracts by project');
    });
  });

  describe('getContractsByStatus', () => {
    it('should return contracts by status', async () => {
      const contracts = [{ id: 'c1', status: 'active' }];
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: contracts });
        
      const result = await repo.getContractsByStatus('active');
      expect(result.items).toEqual(contracts);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getContractsByStatus('active')).rejects.toThrow('select failed');
    });

    it('should throw on data query error (line 186)', async () => {
      // Count query succeeds, data query fails
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockRejectedValueOnce(new Error('data query failed'));
      await expect(repo.getContractsByStatus('active')).rejects.toThrow('Failed to get contracts by status');
    });
  });

  describe('getUserContracts', () => {
    it('should return user contracts with project info', async () => {
      const contracts = [{ id: 'c1', project: { id: 'p1' } }];
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: contracts });
        
      const result = await repo.getUserContracts('u1');
      expect(result.items).toEqual(contracts);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getUserContracts('u1')).rejects.toThrow('select failed');
    });
  });

  describe('getAllContracts', () => {
    it('should return all contracts', async () => {
      const contracts = [{ id: 'c1' }, { id: 'c2' }];
      mockPool.query.mockResolvedValueOnce({ rows: contracts });
      const result = await repo.getAllContracts();
      expect(result).toEqual(contracts);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getAllContracts()).rejects.toThrow('Failed to query');
    });
  });
});
