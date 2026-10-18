// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { ContractOfferRepository } = await import('../../repositories/contract-offer-repository.js');
const { ContractSignatureRepository } = await import('../../repositories/contract-signature-repository.js');
const { ContractRepository } = await import('../../repositories/contract-repository.js');

const doc = (data: any) => {
  const { id, ...rest } = data;
  return { $id: id, $createdAt: '2026-01-01T00:00:00Z', $updatedAt: '2026-01-01T00:00:00Z', ...rest };
};

describe('hiring flow repositories', () => {
  let db: any;
  beforeEach(() => {
    jest.clearAllMocks();
    db = (globalThis as any).__mockDatabases;
  });

  it('ContractOfferRepository CRUD and listing', async () => {
    const repo = new ContractOfferRepository();
    db.createDocument.mockResolvedValueOnce(doc({ id: 'o1', contract_id: 'c1', milestones: '[{"title":"A"}]' }));
    const created = await repo.createOffer({ id: 'o1', contract_id: 'c1', milestones: [{ title: 'A' }] } as any);
    expect(created.milestones).toEqual([{ title: 'A' }]);
    db.getDocument.mockResolvedValueOnce(doc({ id: 'o1', contract_id: 'c1' }));
    expect((await repo.getOfferById('o1'))?.id).toBe('o1');
    db.updateDocument.mockResolvedValueOnce(doc({ id: 'o1', status: 'accepted' }));
    expect((await repo.updateOffer('o1', { status: 'accepted' }))?.status).toBe('accepted');
    db.listDocuments.mockResolvedValueOnce({ documents: [doc({ id: 'o1', contract_id: 'c1' })], total: 1 });
    expect(await repo.listByContract('c1')).toHaveLength(1);
  });

  it('ContractSignatureRepository creates, lists and voids', async () => {
    const repo = new ContractSignatureRepository();
    db.createDocument.mockResolvedValueOnce(doc({ id: 's1', contract_id: 'c1', status: 'valid' }));
    expect((await repo.createSignature({ id: 's1' } as any)).id).toBe('s1');
    db.listDocuments.mockResolvedValueOnce({
      documents: [doc({ id: 's1', contract_id: 'c1', status: 'valid' }), doc({ id: 's2', contract_id: 'c1', status: 'voided' })],
      total: 2,
    });
    db.updateDocument.mockResolvedValue(doc({ id: 's1', status: 'voided' }));
    expect(await repo.voidAllForContract('c1')).toBe(1);
    expect(db.updateDocument).toHaveBeenCalledWith(expect.any(String), 'contract_signatures', 's1', { status: 'voided' });
  });

  it('ContractRepository slot, funded and funding-deadline queries', async () => {
    const repo = new ContractRepository();
    db.listDocuments.mockResolvedValueOnce({ documents: [], total: 3 });
    expect(await repo.countReservedSlots('p1')).toBe(3);
    db.listDocuments.mockResolvedValueOnce({ documents: [], total: 1 });
    expect(await repo.countFundedContracts('p1')).toBe(1);
    db.listDocuments.mockResolvedValueOnce({ documents: [doc({ id: 'c1', status: 'awaiting_funding' })], total: 1 });
    expect(await repo.findAwaitingFundingBefore('2026-01-01T00:00:00Z')).toHaveLength(1);
    db.listDocuments.mockResolvedValueOnce({ documents: [doc({ id: 'c2', milestone_source: 'contract', milestones: '[]' })], total: 1 });
    expect(await repo.findActiveContractScopedMilestones()).toHaveLength(1);
  });
});
