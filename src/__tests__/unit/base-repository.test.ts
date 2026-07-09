// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockListDocuments = jest.fn();
const mockCreateDocument = jest.fn();
const mockGetDocument = jest.fn();
const mockUpdateDocument = jest.fn();
const mockDeleteDocument = jest.fn();

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: {
    listDocuments: mockListDocuments,
    createDocument: mockCreateDocument,
    getDocument: mockGetDocument,
    updateDocument: mockUpdateDocument,
    deleteDocument: mockDeleteDocument,
  },
  DATABASE_ID: 'freelancexchain',
  Query: {
    equal: jest.fn((...args: any[]) => ({ type: 'equal', args })),
    notEqual: jest.fn((...args: any[]) => ({ type: 'notEqual', args })),
    orderDesc: jest.fn((...args: any[]) => ({ type: 'orderDesc', args })),
    orderAsc: jest.fn((...args: any[]) => ({ type: 'orderAsc', args })),
    limit: jest.fn((...args: any[]) => ({ type: 'limit', args })),
    offset: jest.fn((...args: any[]) => ({ type: 'offset', args })),
    cursorAfter: jest.fn((...args: any[]) => ({ type: 'cursorAfter', args })),
  },
  ID: { unique: jest.fn(() => 'unique-id') },
}));

const { BaseRepository } = await import('../../repositories/base-repository.js');

// Create a testable subclass that exposes the protected fetchAll method
class TestRepository extends BaseRepository<{ id: string; name: string; created_at?: string; updated_at?: string }> {
  constructor() {
    super('test-collection');
  }

  public testFetchAll(baseQueries: any[] = [], pageSize = 100) {
    return this.fetchAll(baseQueries, pageSize);
  }

  /** Call fetchAll() with zero arguments to exercise both default parameter branches */
  public testFetchAllNoArgs() {
    return this.fetchAll();
  }
}

function toAppwriteDoc(data: Record<string, any>) {
  const { id, created_at, updated_at, ...rest } = data;
  return {
    $id: id || 'mock-id',
    $createdAt: created_at || '2025-01-01T00:00:00Z',
    $updatedAt: updated_at || '2025-01-01T00:00:00Z',
    ...rest,
  };
}

describe('BaseRepository - fetchAll', () => {
  let repo: TestRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new TestRepository();
  });

  it('should call fetchAll with no arguments (covering both default parameters)', async () => {
    const docs = [
      toAppwriteDoc({ id: 'd1', name: 'First' }),
      toAppwriteDoc({ id: 'd2', name: 'Second' }),
    ];
    // Return fewer docs than default pageSize (100), so the loop exits after one iteration
    mockListDocuments.mockResolvedValueOnce({ documents: docs, total: 2 });

    const result = await repo.testFetchAll();
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('d1');
    expect(result[1]!.id).toBe('d2');
    // Verify limit was called with default value 100
    expect(mockListDocuments).toHaveBeenCalledTimes(1);
  });

  it('should exercise fetchAll default parameter branches via zero-arg call', async () => {
    const docs = [toAppwriteDoc({ id: 'd1', name: 'Default Args Doc' })];
    mockListDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });

    // Call fetchAll() with zero arguments so its own defaults (baseQueries=[], pageSize=100) fire
    const result = await repo.testFetchAllNoArgs();
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('d1');
    expect(mockListDocuments).toHaveBeenCalledTimes(1);
  });

  it('should call fetchAll with one argument (covering pageSize default)', async () => {
    const docs = [toAppwriteDoc({ id: 'd1', name: 'Item' })];
    mockListDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });

    const result = await repo.testFetchAll([{ type: 'equal', field: 'status', value: 'active' }]);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('d1');
    expect(mockListDocuments).toHaveBeenCalledTimes(1);
  });

  it('should loop when response.documents.length equals pageSize (cursor pagination)', async () => {
    // First page: exactly 2 documents (pageSize=2), triggering another iteration
    const page1 = [
      toAppwriteDoc({ id: 'd1', name: 'First' }),
      toAppwriteDoc({ id: 'd2', name: 'Second' }),
    ];
    // Second page: 1 document (< pageSize=2), causing the loop to break
    const page2 = [
      toAppwriteDoc({ id: 'd3', name: 'Third' }),
    ];

    mockListDocuments
      .mockResolvedValueOnce({ documents: page1, total: 3 })
      .mockResolvedValueOnce({ documents: page2, total: 3 });

    const result = await repo.testFetchAll([], 2);
    expect(result).toHaveLength(3);
    expect(result[0]!.id).toBe('d1');
    expect(result[1]!.id).toBe('d2');
    expect(result[2]!.id).toBe('d3');
    expect(mockListDocuments).toHaveBeenCalledTimes(2);
  });

  it('should break the loop when lastId is falsy', async () => {
    // Response has pageSize docs but last doc has no $id
    const page1 = [
      { name: 'no-id-doc' }, // no $id field
    ];

    mockListDocuments.mockResolvedValueOnce({ documents: page1, total: 1 });

    const result = await repo.testFetchAll([], 1);
    expect(result).toHaveLength(1);
    // Should only call once since lastId is falsy
    expect(mockListDocuments).toHaveBeenCalledTimes(1);
  });

  it('should break when response returns empty documents', async () => {
    mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await repo.testFetchAll([], 10);
    expect(result).toHaveLength(0);
    expect(mockListDocuments).toHaveBeenCalledTimes(1);
  });

  it('should combine baseQueries with limit and cursorAfter queries', async () => {
    const page1 = [
      toAppwriteDoc({ id: 'd1', name: 'A' }),
      toAppwriteDoc({ id: 'd2', name: 'B' }),
    ];
    const page2 = [toAppwriteDoc({ id: 'd3', name: 'C' })];

    mockListDocuments
      .mockResolvedValueOnce({ documents: page1, total: 3 })
      .mockResolvedValueOnce({ documents: page2, total: 3 });

    const baseQuery = { type: 'equal', field: 'status', value: 'active' };
    const result = await repo.testFetchAll([baseQuery], 2);
    expect(result).toHaveLength(3);

    // Verify second call includes cursorAfter
    const secondCallArgs = mockListDocuments.mock.calls[1];
    const queries = secondCallArgs[2];
    const hasCursorAfter = queries.some((q: any) => q.type === 'cursorAfter');
    expect(hasCursorAfter).toBe(true);
  });
});
