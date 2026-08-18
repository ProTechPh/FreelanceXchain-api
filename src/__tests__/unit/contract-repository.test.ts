// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetDocument = jest.fn();
const mockListDocuments = jest.fn();
const mockCreateDocument = jest.fn();
const mockUpdateDocument = jest.fn();
const mockDeleteDocument = jest.fn();
const mockOrderDesc = jest.fn((...args: any[]) => ({ type: 'orderDesc', args }));

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
    orderDesc: mockOrderDesc,
    limit: jest.fn((...args: any[]) => ({ type: 'limit', args })),
    offset: jest.fn((...args: any[]) => ({ type: 'offset', args })),
    cursorAfter: jest.fn((...args: any[]) => ({ type: 'cursorAfter', args })),
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
    mockGetDocument.mockReset();
    mockListDocuments.mockReset();
    mockCreateDocument.mockReset();
    mockUpdateDocument.mockReset();
    mockDeleteDocument.mockReset();
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
        documents: [toAppwriteDoc({ id: 'c1' }), toAppwriteDoc({ id: 'c2' })],
        total: 2,
      });
      const result = await repo.getContractsByFreelancer('f1', { limit: 1, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    it('should reach contracts beyond the old 1000-cap (no truncation)', async () => {
      // 250 contracts across 3 cursor pages; page 3 (offset 200) must be
      // reachable — the old Query.limit(1000) made it empty.
      const docs = Array.from({ length: 250 }, (_, i) => toAppwriteDoc({ id: `c${i}` }));
      mockListDocuments
        .mockResolvedValueOnce({ documents: docs.slice(0, 100), total: 250 })
        .mockResolvedValueOnce({ documents: docs.slice(100, 200), total: 250 })
        .mockResolvedValueOnce({ documents: docs.slice(200), total: 250 });

      const result = await repo.getContractsByFreelancer('f1', { limit: 100, offset: 200 });
      expect(result.total).toBe(250);
      expect(result.items).toHaveLength(50);
      expect(result.items[0]!.id).toBe('c200');
      expect(result.items[49]!.id).toBe('c249');
      expect(result.hasMore).toBe(false);
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
      expect(mockOrderDesc).toHaveBeenCalledWith('$createdAt');
    });

    it('should reach contracts beyond the old 1000-cap (no truncation)', async () => {
      const docs = Array.from({ length: 250 }, (_, i) => toAppwriteDoc({ id: `c${i}` }));
      mockListDocuments
        .mockResolvedValueOnce({ documents: docs.slice(0, 100), total: 250 })
        .mockResolvedValueOnce({ documents: docs.slice(100, 200), total: 250 })
        .mockResolvedValueOnce({ documents: docs.slice(200), total: 250 });

      const result = await repo.getContractsByEmployer('e1', { limit: 100, offset: 200 });
      expect(result.total).toBe(250);
      expect(result.items).toHaveLength(50);
      expect(result.items[0]!.id).toBe('c200');
      expect(result.items[49]!.id).toBe('c249');
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

  describe('countContractsByUserAndStatus', () => {
    it('should sum active contracts across both roles', async () => {
      mockListDocuments
        .mockResolvedValueOnce({ documents: [], total: 3 }) // freelancer role
        .mockResolvedValueOnce({ documents: [], total: 2 }); // employer role

      const result = await repo.countContractsByUserAndStatus('u1', 'active');
      expect(result).toBe(5);
    });

    it('should return 0 when there are no matching contracts', async () => {
      mockListDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await repo.countContractsByUserAndStatus('u1', 'active');
      expect(result).toBe(0);
    });

    it('should return 0 when the count queries fail', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('DB down'));

      const result = await repo.countContractsByUserAndStatus('u1', 'active');
      expect(result).toBe(0);
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

    it('should not truncate at 25 documents per role (fetchAll multi-page regression)', async () => {
      // 120 freelancer contracts + 120 employer contracts. Each role query
      // exceeds one 100-doc page, exercising the cursor-pagination loop that
      // the old listWithQueries implementation (default 25-doc Appwrite limit)
      // silently dropped.
      const freelancerPage1 = Array.from({ length: 100 }, (_, i) =>
        toAppwriteDoc({ id: `f-${i}`, created_at: `2025-01-01T00:00:0${i % 10}Z` })
      );
      const freelancerPage2 = Array.from({ length: 20 }, (_, i) =>
        toAppwriteDoc({ id: `f-${100 + i}`, created_at: '2025-01-02T00:00:00Z' })
      );
      const employerPage1 = Array.from({ length: 100 }, (_, i) =>
        toAppwriteDoc({ id: `e-${i}`, created_at: '2025-02-01T00:00:00Z' })
      );
      const employerPage2 = Array.from({ length: 20 }, (_, i) =>
        toAppwriteDoc({ id: `e-${100 + i}`, created_at: '2025-02-02T00:00:00Z' })
      );

      mockListDocuments
        .mockResolvedValueOnce({ documents: freelancerPage1, total: 120 })
        .mockResolvedValueOnce({ documents: freelancerPage2, total: 120 })
        .mockResolvedValueOnce({ documents: employerPage1, total: 120 })
        .mockResolvedValueOnce({ documents: employerPage2, total: 120 });

      const result = await repo.getUserContracts('u1');
      expect(result.total).toBe(240);
      expect(result.items).toHaveLength(20); // default page limit
      // All 240 fetched (not truncated at 25+25=50)
      expect(mockListDocuments).toHaveBeenCalledTimes(4);
    });

    it('should return empty page when the database throws', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('DB down'));

      const result = await repo.getUserContracts('u1');
      expect(result).toEqual({ items: [], hasMore: false, total: 0 });
    });
  });

  describe('findAllByFreelancers', () => {
    it('should group contracts by freelancer id', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [
          toAppwriteDoc({ id: 'c1', project_id: 'p1', freelancer_id: 'u1' }),
          toAppwriteDoc({ id: 'c2', project_id: 'p2', freelancer_id: 'u1' }),
          toAppwriteDoc({ id: 'c3', project_id: 'p3', freelancer_id: 'u2' }),
        ],
        total: 3,
      });

      const result = await repo.findAllByFreelancers(['u1', 'u2']);
      expect(result.get('u1')).toHaveLength(2);
      expect(result.get('u2')).toHaveLength(1);
      expect(mockListDocuments).toHaveBeenCalledTimes(1);
      expect(mockListDocuments.mock.calls[0][2][0]).toEqual({
        type: 'equal',
        args: ['freelancer_id', ['u1', 'u2']],
      });
    });

    it('should return an empty map when no freelancer ids are given', async () => {
      const result = await repo.findAllByFreelancers([]);
      expect(result.size).toBe(0);
      expect(mockListDocuments).not.toHaveBeenCalled();
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

  describe('findContractByProposalId - error path', () => {
    it('should return null when the query fails', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('query failed'));
      const result = await repo.findContractByProposalId('p1');
      expect(result).toBeNull();
    });
  });

  describe('countCompletedByFreelancer', () => {
    it('should return the total number of completed contracts', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 3 });

      const result = await repo.countCompletedByFreelancer('f1');
      expect(result).toBe(3);
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      expect(queries.some(q => q.type === 'equal' && q.args[1] === 'completed')).toBe(true);
    });
  });

  describe('findActiveContracts', () => {
    it('should return all active contracts', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc({ id: 'c1', status: 'active' }), toAppwriteDoc({ id: 'c2', status: 'active' })],
        total: 2,
      });

      const result = await repo.findActiveContracts();
      expect(result).toHaveLength(2);
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      expect(queries.some(q => q.type === 'equal' && q.args[1] === 'active')).toBe(true);
    });
  });

  describe('findAllByFreelancer', () => {
    it('should return all contracts for a freelancer', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc({ id: 'c1', freelancer_id: 'f1' })],
        total: 1,
      });

      const result = await repo.findAllByFreelancer('f1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('c1');
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      expect(queries.some(q => q.type === 'equal' && q.args[1] === 'f1')).toBe(true);
    });
  });

  describe('getContractByIdWithRelations - profile field narrowing', () => {
    const baseMocks = () => {
      const contract = { id: 'c1', project_id: 'p1', freelancer_id: 'f1', employer_id: 'e1', status: 'active' };
      mockGetDocument
        .mockResolvedValueOnce(toAppwriteDoc(contract))
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'p1', title: 'Project' }))
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'f1', name: 'Freelancer', email: 'f@test.com' }))
        .mockResolvedValueOnce(toAppwriteDoc({ id: 'e1', name: 'Employer', email: 'e@test.com' }));
    };

    it('should read a numeric hourly_rate from the freelancer profile', async () => {
      baseMocks();
      mockListDocuments
        .mockResolvedValueOnce({ documents: [toAppwriteDoc({ id: 'fp1', user_id: 'f1', hourly_rate: 50 })], total: 1 })
        .mockResolvedValueOnce({ documents: [toAppwriteDoc({ id: 'ep1', user_id: 'e1', company_name: 'Acme', industry: 'dev' })], total: 1 });

      const result = await repo.getContractByIdWithRelations('c1');
      expect(result).not.toBeNull();
      expect(result.freelancer.profile).toMatchObject({ id: 'fp1', hourly_rate: 50 });
      expect(result.employer.profile).toMatchObject({ id: 'ep1', company_name: 'Acme', industry: 'dev' });
    });

    it('should leave hourly_rate undefined when the profile value is not a number', async () => {
      baseMocks();
      mockListDocuments
        .mockResolvedValueOnce({ documents: [toAppwriteDoc({ id: 'fp1', user_id: 'f1', hourly_rate: 'fifty' })], total: 1 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await repo.getContractByIdWithRelations('c1');
      expect(result).not.toBeNull();
      expect(result.freelancer.profile).toMatchObject({ id: 'fp1' });
      expect(result.freelancer.profile.hourly_rate).toBeUndefined();
    });
  });
});
