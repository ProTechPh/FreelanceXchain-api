import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { DisputeEvidenceRepository } = await import('../../repositories/dispute-evidence-repository.js');

describe('DisputeEvidenceRepository', () => {
  let repository: InstanceType<typeof DisputeEvidenceRepository>;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    repository = new DisputeEvidenceRepository();
  });

  describe('getEvidenceById', () => {
    it('returns evidence by id', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'ev-1',
        dispute_id: 'd1',
        submitted_by: 'user1',
        evidence_type: 'document',
        file_url: 'https://storage.example.com/file.pdf',
        description: 'Invoice for services rendered',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await repository.getEvidenceById('ev-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('ev-1');
      expect(result!.dispute_id).toBe('d1');
      expect(result!.submitted_by).toBe('user1');
      expect(result!.evidence_type).toBe('document');
      expect(mockDatabases.getDocument).toHaveBeenCalledWith('freelancexchain', 'dispute_evidence', 'ev-1');
    });

    it('returns null when not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('Not found'));
      const result = await repository.getEvidenceById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createEvidence', () => {
    it('creates evidence', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'ev-new',
        dispute_id: 'd1',
        submitted_by: 'user2',
        evidence_type: 'image',
        description: 'Screenshot of conversation',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await repository.createEvidence({
        id: 'ev-new',
        dispute_id: 'd1',
        submitted_by: 'user2',
        evidence_type: 'image',
        description: 'Screenshot of conversation',
      });
      expect(result).not.toBeNull();
      expect(result.id).toBe('ev-new');
      expect(result.evidence_type).toBe('image');
      expect(mockDatabases.createDocument).toHaveBeenCalled();
    });
  });

  describe('updateEvidence', () => {
    it('updates evidence', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce({
        $id: 'ev-1',
        verified_by: 'admin1',
        verified_at: '2025-01-02',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-02',
      });
      const result = await repository.updateEvidence('ev-1', { verified_by: 'admin1', verified_at: '2025-01-02' });
      expect(result).not.toBeNull();
      expect(result!.verified_by).toBe('admin1');
      expect(result!.verified_at).toBe('2025-01-02');
      expect(mockDatabases.updateDocument).toHaveBeenCalled();
    });

    it('returns null on error', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('Not found'));
      const result = await repository.updateEvidence('nonexistent', { description: 'updated' });
      expect(result).toBeNull();
    });
  });

  describe('deleteEvidence', () => {
    it('deletes evidence successfully', async () => {
      mockDatabases.deleteDocument.mockResolvedValueOnce({});
      const result = await repository.deleteEvidence('ev-1');
      expect(result).toBe(true);
      expect(mockDatabases.deleteDocument).toHaveBeenCalledWith('freelancexchain', 'dispute_evidence', 'ev-1');
    });

    it('returns false when deletion fails', async () => {
      mockDatabases.deleteDocument.mockRejectedValueOnce(new Error('Not found'));
      const result = await repository.deleteEvidence('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('findByDispute', () => {
    it('returns evidence for a dispute', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'ev-1', dispute_id: 'd1', created_at: '2025-01-01', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
          { $id: 'ev-2', dispute_id: 'd1', created_at: '2025-01-02', $createdAt: '2025-01-02', $updatedAt: '2025-01-02' },
        ],
        total: 2,
      });
      const result = await repository.findByDispute('d1');
      expect(result).toHaveLength(2);
      expect(result[0]!.dispute_id).toBe('d1');
      expect(result[1]!.dispute_id).toBe('d1');
    });

    it('returns empty array when no evidence', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.findByDispute('d-nobody');
      expect(result).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('timeout'));
      const result = await repository.findByDispute('d1');
      expect(result).toEqual([]);
    });
  });

  describe('findOwnerById', () => {
    it('returns submitted_by for existing evidence', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'ev-1',
        submitted_by: 'user1',
      });
      const result = await repository.findOwnerById('ev-1');
      expect(result).toBe('user1');
      expect(mockDatabases.getDocument).toHaveBeenCalledWith('freelancexchain', 'dispute_evidence', 'ev-1');
    });

    it('returns null when evidence not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('Not found'));
      const result = await repository.findOwnerById('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null when submitted_by is missing', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'ev-1',
      });
      const result = await repository.findOwnerById('ev-1');
      expect(result).toBeNull();
    });
  });

  describe('inherited CRUD', () => {
    it('create uses base repository create', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'doc-1',
        dispute_id: 'd1',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await (repository as any).create({ id: 'doc-1', dispute_id: 'd1' });
      expect(result).not.toBeNull();
      expect(result.id).toBe('doc-1');
      expect(mockDatabases.createDocument).toHaveBeenCalled();
    });

    it('getById uses base repository getById', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'doc-1',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await (repository as any).getById('doc-1');
      expect(result).not.toBeNull();
      expect(result.id).toBe('doc-1');
    });

    it('delete uses base repository delete', async () => {
      mockDatabases.deleteDocument.mockResolvedValueOnce({});
      const result = await (repository as any).delete('doc-1');
      expect(result).toBe(true);
      expect(mockDatabases.deleteDocument).toHaveBeenCalled();
    });

    it('findOne uses base repository findOne', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'doc-1', evidence_type: 'document' }],
        total: 1,
      });
      const result = await (repository as any).findOne('evidence_type', 'document');
      expect(result).not.toBeNull();
      expect(result.id).toBe('doc-1');
    });
  });
});
