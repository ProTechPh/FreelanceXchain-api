// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { EmployerBusinessDocumentRepository } = await import('../../repositories/employer-business-document-repository.js');

describe('EmployerBusinessDocumentRepository', () => {
  let repo: any;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    repo = new EmployerBusinessDocumentRepository();
  });

  it('creates a document', async () => {
    mockDatabases.createDocument.mockResolvedValueOnce({ $id: 'd1', employer_id: 'e1', document_type: 'bir_2303' });
    const result = await repo.createDocument({ id: 'd1', employer_id: 'e1', document_type: 'bir_2303' });
    expect(result.id).toBe('d1');
  });

  it('gets a document by id', async () => {
    mockDatabases.getDocument.mockResolvedValueOnce({ $id: 'd1', employer_id: 'e1' });
    const result = await repo.getDocumentById('d1');
    expect(result.employer_id).toBe('e1');
  });

  it('deletes a document', async () => {
    mockDatabases.deleteDocument.mockResolvedValueOnce({});
    await expect(repo.deleteDocument('d1')).resolves.toBe(true);
  });

  it('lists documents for an employer', async () => {
    mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [{ $id: 'd1', employer_id: 'e1', document_type: 'mayors_permit' }], total: 1 });
    const result = await repo.findByEmployer('e1');
    expect(result).toEqual([expect.objectContaining({ id: 'd1', document_type: 'mayors_permit' })]);
  });
});
