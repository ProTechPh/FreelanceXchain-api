// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateDocument = jest.fn();
const mockGetDocument = jest.fn();
const mockUpdateDocument = jest.fn();
const mockDeleteDocument = jest.fn();
const mockListDocuments = jest.fn();

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: {
    createDocument: mockCreateDocument,
    getDocument: mockGetDocument,
    updateDocument: mockUpdateDocument,
    deleteDocument: mockDeleteDocument,
    listDocuments: mockListDocuments,
  },
  DATABASE_ID: 'freelancexchain',
  Query: {
    equal: jest.fn((...args: any[]) => ({ type: 'equal', args })),
    limit: jest.fn((...args: any[]) => ({ type: 'limit', args })),
    offset: jest.fn((...args: any[]) => ({ type: 'offset', args })),
    orderAsc: jest.fn((...args: any[]) => ({ type: 'orderAsc', args })),
    orderDesc: jest.fn((...args: any[]) => ({ type: 'orderDesc', args })),
    contains: jest.fn((...args: any[]) => ({ type: 'contains', args })),
  },
  ID: { unique: jest.fn(() => 'unique-id') },
}));

const { EmailDeliveryFailureRepository } = await import('../../repositories/email-delivery-failure-repository.js');

function toAppwriteDoc(data: Record<string, any>) {
  const { id, created_at, updated_at, ...rest } = data;
  return {
    $id: id,
    $createdAt: created_at || '2025-01-01T00:00:00Z',
    $updatedAt: updated_at || '2025-01-01T00:00:00Z',
    ...rest,
  };
}

describe('EmailDeliveryFailureRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new EmailDeliveryFailureRepository();
  });

  describe('createFailure', () => {
    it('should create a failure record', async () => {
      mockCreateDocument.mockResolvedValueOnce(toAppwriteDoc({ id: 'f1', message_id: 'm1', failure_code: 'USER_NOT_FOUND' }));
      const result = await repo.createFailure({
        id: '',
        message_id: 'm1',
        from_address: 'a@b.com',
        to_address: 'x@other.com',
        subject: 'Hi',
        failure_code: 'USER_NOT_FOUND',
        failure_message: 'No user found',
        received_at: '2025-01-01T00:00:00Z',
      });
      expect(result.id).toBe('f1');
      expect(mockCreateDocument).toHaveBeenCalledWith(
        'freelancexchain',
        'email_delivery_failures',
        expect.any(String),
        expect.objectContaining({ message_id: 'm1', failure_code: 'USER_NOT_FOUND' })
      );
    });
  });

  describe('findRecent', () => {
    it('should return recent failures newest first', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc({ id: 'f1', failure_code: 'USER_NOT_FOUND' })],
        total: 1,
      });
      const result = await repo.findRecent(50);
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('f1');
      expect(mockListDocuments).toHaveBeenCalledWith(
        'freelancexchain',
        'email_delivery_failures',
        expect.arrayContaining([expect.objectContaining({ type: 'limit', args: [50] })])
      );
    });

    it('should return empty list on database error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.findRecent(50);
      expect(result).toEqual([]);
    });
  });
});
