// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetDocument = jest.fn();
const mockListDocuments = jest.fn();
const mockCreateDocument = jest.fn();
const mockUpdateDocument = jest.fn();
const mockDeleteDocument = jest.fn();

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: {
    getDocument: mockGetDocument,
    listDocuments: mockListDocuments,
    createDocument: mockCreateDocument,
    updateDocument: mockUpdateDocument,
    deleteDocument: mockDeleteDocument,
  },
  DATABASE_ID: 'freelancexchain',
  Query: {
    equal: jest.fn((...args: any[]) => ({ type: 'equal', args })),
    orderDesc: jest.fn((...args: any[]) => ({ type: 'orderDesc', args })),
    limit: jest.fn((...args: any[]) => ({ type: 'limit', args })),
    offset: jest.fn((...args: any[]) => ({ type: 'offset', args })),
  },
  ID: { unique: jest.fn(() => 'unique-id') },
}));

const { ContractRepository } = await import('../../repositories/contract-repository.js');

function toAppwriteDoc(data: Record<string, any>) {
  const { id, created_at, updated_at, ...rest } = data;
  return {
    $id: id,
    $createdAt: created_at || '2025-01-01T00:00:00Z',
    $updatedAt: updated_at || '2025-01-01T00:00:00Z',
    ...rest,
  };
}

describe('ContractRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new ContractRepository();
  });

  describe('getContractById', () => {
    it('should return a contract', async () => {
      const contract = { id: 'c1', project_id: 'p1', status: 'active' };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(contract));
      const result = await repo.getContractById('c1');
      expect(result).toMatchObject({ id: 'c1', project_id: 'p1', status: 'active' });
    });

    it('should return null when not found', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getContractById('c1');
      expect(result).toBeNull();
    });
  });

  describe('getContractByIdWithRelations', () => {
    it('should return contract with relations', async () => {
      const contract = { id: 'c1', project_id: 'p1', freelancer_id: 'f1', employer_id: 'e1', status: 'active' };
      mockGetDocument
        .mockResolvedValueOnce(toAppwriteDoc(contract)) // contract
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'p1', title: 'Project 1', description: 'desc' })) // project
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'f1', name: 'Freelancer', email: 'f@test.com' })) // freelancer
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'e1', name: 'Employer', email: 'e@test.com' })); // employer
      mockListDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 }) // freelancer profile
        .mockResolvedValueOnce({ documents: [], total: 0 }); // employer profile

      const result = await repo.getContractByIdWithRelations('c1');
      expect(result).not.toBeNull();
      expect(result.id).toBe('c1');
      expect(result.project).toMatchObject({ id: 'p1', title: 'Project 1' });
      expect(result.freelancer).toMatchObject({ id: 'f1', name: 'Freelancer' });
      expect(result.employer).toMatchObject({ id: 'e1', name: 'Employer' });
    });

    it('should return null when not found', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getContractByIdWithRelations('c1');
      expect(result).toBeNull();
    });
  });

  describe('updateContract', () => {
    it('should update and return a contract', async () => {
      const contract = { id: 'c1', status: 'completed' };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(contract));
      const result = await repo.updateContract('c1', { status: 'completed' } as any);
      expect(result).toMatchObject({ id: 'c1', status: 'completed' });
    });

    it('should return null when not found', async () => {
      mockUpdateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.updateContract('c1', { status: 'completed' } as any);
      expect(result).toBeNull();
    });
  });

  describe('findContractByProposalId', () => {
    it('should return a contract by proposal id', async () => {
      const contract = { id: 'c1', proposal_id: 'p1' };
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc(contract)],
        total: 1,
      });
      const result = await repo.findContractByProposalId('p1');
      expect(result).toMatchObject({ id: 'c1', proposal_id: 'p1' });
    });

    it('should return null when not found', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.findContractByProposalId('p1');
      expect(result).toBeNull();
    });
  });

  describe('getContractsByFreelancer', () => {
    it('should return paginated contracts', async () => {
      const contracts = [
        toAppwriteDoc({ id: 'c1' }),
        toAppwriteDoc({ id: 'c2' }),
      ];
      mockListDocuments.mockResolvedValueOnce({
        documents: contracts,
        total: 2,
      });
      const result = await repo.getContractsByFreelancer('f1');
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should handle custom options', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc({ id: 'c1' })],
        total: 5,
      });
      const result = await repo.getContractsByFreelancer('f1', { limit: 1, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('getContractsByEmployer', () => {
    it('should return paginated contracts', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc({ id: 'c1' })],
        total: 1,
      });
      const result = await repo.getContractsByEmployer('e1');
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getContractsByProject', () => {
    it('should return contracts for a project', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc({ id: 'c1' })],
        total: 1,
      });
      const result = await repo.getContractsByProject('p1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getUserContracts', () => {
    it('should return user contracts', async () => {
      mockListDocuments
        .mockResolvedValueOnce({
          documents: [toAppwriteDoc({ id: 'c1', created_at: '2025-01-01T00:00:00Z' })],
          total: 1,
        }) // freelancer contracts
        .mockResolvedValueOnce({
          documents: [],
          total: 0,
        }); // employer contracts

      const result = await repo.getUserContracts('u1');
      expect(result.items).toHaveLength(1);
    });

    it('should merge and sort contracts from both roles', async () => {
      mockListDocuments
        .mockResolvedValueOnce({
          documents: [toAppwriteDoc({ id: 'c1', created_at: '2025-01-01T00:00:00Z' })],
          total: 1,
        })
        .mockResolvedValueOnce({
          documents: [toAppwriteDoc({ id: 'c2', created_at: '2025-06-01T00:00:00Z' })],
          total: 1,
        });

      const result = await repo.getUserContracts('u1');
      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('c2');
      expect(result.items[1].id).toBe('c1');
    });
  });

  describe('getContractByIdWithRelations - catch paths', () => {
    it('should handle getDocument failure for project', async () => {
      const contract = { id: 'c1', project_id: 'p1', freelancer_id: 'f1', employer_id: 'e1', status: 'active' };
      mockGetDocument
        .mockResolvedValueOnce(toAppwriteDoc(contract))
        .mockRejectedValueOnce(new Error('project not found'))
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'f1', name: 'Freelancer', email: 'f@test.com' }))
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'e1', name: 'Employer', email: 'e@test.com' }));
      mockListDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await repo.getContractByIdWithRelations('c1');
      expect(result).not.toBeNull();
      expect(result.project).toBeNull();
    });

    it('should handle freelancer profile fetch failure', async () => {
      const contract = { id: 'c1', project_id: 'p1', freelancer_id: 'f1', employer_id: 'e1', status: 'active' };
      mockGetDocument
        .mockResolvedValueOnce(toAppwriteDoc(contract))
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'p1', title: 'Project' }))
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'f1', name: 'Freelancer', email: 'f@test.com' }))
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'e1', name: 'Employer', email: 'e@test.com' }));
      mockListDocuments
        .mockRejectedValueOnce(new Error('profile fetch failed'))
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await repo.getContractByIdWithRelations('c1');
      expect(result).not.toBeNull();
      expect(result.freelancer.profile).toBeNull();
    });

    it('should handle employer profile fetch failure', async () => {
      const contract = { id: 'c1', project_id: 'p1', freelancer_id: 'f1', employer_id: 'e1', status: 'active' };
      mockGetDocument
        .mockResolvedValueOnce(toAppwriteDoc(contract))
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'p1', title: 'Project' }))
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'f1', name: 'Freelancer', email: 'f@test.com' }))
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'e1', name: 'Employer', email: 'e@test.com' }));
      mockListDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockRejectedValueOnce(new Error('profile fetch failed'));

      const result = await repo.getContractByIdWithRelations('c1');
      expect(result).not.toBeNull();
      expect(result.employer.profile).toBeNull();
    });

    it('should handle freelancer getDocument failure', async () => {
      const contract = { id: 'c1', project_id: 'p1', freelancer_id: 'f1', employer_id: 'e1', status: 'active' };
      mockGetDocument
        .mockResolvedValueOnce(toAppwriteDoc(contract))
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'p1', title: 'Project' }))
        .mockRejectedValueOnce(new Error('freelancer not found'))
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'e1', name: 'Employer', email: 'e@test.com' }));
      mockListDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await repo.getContractByIdWithRelations('c1');
      expect(result).not.toBeNull();
    });

    it('should handle employer getDocument failure', async () => {
      const contract = { id: 'c1', project_id: 'p1', freelancer_id: 'f1', employer_id: 'e1', status: 'active' };
      mockGetDocument
        .mockResolvedValueOnce(toAppwriteDoc(contract))
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'p1', title: 'Project' }))
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'f1', name: 'Freelancer', email: 'f@test.com' }))
        .mockRejectedValueOnce(new Error('employer not found'));
      mockListDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await repo.getContractByIdWithRelations('c1');
      expect(result).not.toBeNull();
    });

  });
});
