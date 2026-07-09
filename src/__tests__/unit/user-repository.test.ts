// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { UserRepository } = await import('../../repositories/user-repository.js');
const { Query: MockQuery } = await import('../../config/appwrite.js');

describe('UserRepository', () => {
  let repo: any;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    repo = new UserRepository();
  });

  const toAppwriteDoc = (data: any) => {
    if (!data || typeof data !== 'object') return data;
    const { id, created_at, updated_at, ...rest } = data;
    const doc: any = { ...rest };
    if (id !== undefined) doc.$id = id;
    else doc.$id = 'mock-id';
    if (created_at !== undefined) doc.$createdAt = created_at;
    if (updated_at !== undefined) doc.$updatedAt = updated_at;
    return doc;
  };

  describe('createUser', () => {
    it('should create and return a user', async () => {
      const user = { id: 'u1', email: 'test@example.com', role: 'freelancer' };
      const doc = toAppwriteDoc(user);
      mockDatabases.createDocument.mockResolvedValueOnce(doc);

      const result = await repo.createUser(user as any);
      expect(result.id).toBe('u1');
      expect(result.email).toBe('test@example.com');
      expect(mockDatabases.createDocument).toHaveBeenCalled();
    });

    it('should throw on database error', async () => {
      mockDatabases.createDocument.mockRejectedValueOnce(new Error('insert failed'));
      await expect(repo.createUser({ id: 'u1' } as any)).rejects.toThrow('insert failed');
    });
  });

  describe('getUserById', () => {
    it('should return a user', async () => {
      const doc = { $id: 'u1', email: 'test@example.com' };
      mockDatabases.getDocument.mockResolvedValueOnce(doc);

      const result = await repo.getUserById('u1');
      expect(result).not.toBeNull();
      expect(result.id).toBe('u1');
      expect(mockDatabases.getDocument).toHaveBeenCalled();
    });

    it('should return null when not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getUserById('u1');
      expect(result).toBeNull();
    });
  });

  describe('getUserByEmail', () => {
    it('should return a user by email', async () => {
      const doc = { $id: 'u1', email: 'test@example.com', role: 'freelancer' };
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [doc],
        total: 1,
      });

      const result = await repo.getUserByEmail('test@example.com');
      expect(result).not.toBeNull();
      expect(result.email).toBe('test@example.com');
    });

    it('should return null when not found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getUserByEmail('test@example.com');
      expect(result).toBeNull();
    });

    it('should throw on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('connection lost'));
      await expect(repo.getUserByEmail('test@example.com')).rejects.toThrow('Failed to get user by email');
    });
  });

  describe('updateUser', () => {
    it('should update and return a user', async () => {
      const doc = { $id: 'u1', name: 'New Name', email: 'test@example.com' };
      mockDatabases.updateDocument.mockResolvedValueOnce(doc);

      const result = await repo.updateUser('u1', { name: 'New Name' });
      expect(result).not.toBeNull();
      expect(result.name).toBe('New Name');
      expect(mockDatabases.updateDocument).toHaveBeenCalled();
    });

    it('should return null when not found', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.updateUser('u1', { name: 'New Name' });
      expect(result).toBeNull();
    });
  });

  describe('deleteUser', () => {
    it('should delete and return true', async () => {
      mockDatabases.deleteDocument.mockResolvedValueOnce({});

      const result = await repo.deleteUser('u1');
      expect(result).toBe(true);
      expect(mockDatabases.deleteDocument).toHaveBeenCalled();
    });

    it('should return false when not found', async () => {
      mockDatabases.deleteDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.deleteUser('u1');
      expect(result).toBe(false);
    });
  });

  describe('emailExists', () => {
    it('should return true when email exists', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'u1', email: 'test@example.com' }],
        total: 1,
      });
      const result = await repo.emailExists('test@example.com');
      expect(result).toBe(true);
    });

    it('should return false when email does not exist', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.emailExists('test@example.com');
      expect(result).toBe(false);
    });
  });

  describe('getAllUsers', () => {
    it('should return all users', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'u1', role: 'freelancer' },
          { $id: 'u2', role: 'employer' },
        ],
        total: 2,
      });
      const result = await repo.getAllUsers();
      expect(result).toHaveLength(2);
    });

    it('should return empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('timeout'));
      const result = await repo.getAllUsers();
      expect(result).toEqual([]);
    });
  });

  describe('getUsersByRole', () => {
    it('should return users by role', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'u1', role: 'freelancer', name: 'Alice' }],
        total: 1,
      });
      const result = await repo.getUsersByRole('freelancer');
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('freelancer');
    });

    it('should return empty array when no users with role', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getUsersByRole('admin');
      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('connection refused'));
      await expect(repo.getUsersByRole('freelancer')).rejects.toThrow('Failed to get users by role');
    });
  });

  describe('updateUserName', () => {
    it('should update and return the user', async () => {
      const doc = { $id: 'u1', name: 'Updated Name', email: 'test@example.com' };
      mockDatabases.updateDocument.mockResolvedValueOnce(doc);

      const result = await repo.updateUserName('u1', 'Updated Name');
      expect(result).not.toBeNull();
      expect(result.name).toBe('Updated Name');
      expect(mockDatabases.updateDocument).toHaveBeenCalled();
    });

    it('should return null when not found', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.updateUserName('u1', 'Updated Name');
      expect(result).toBeNull();
    });
  });
});

describe('User Repository - Extended Coverage', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
  });

  const importModule = async () => {
    return await import('../../repositories/user-repository.js');
  };

  describe('getUserByEmail', () => {
    it('should return user when found', async () => {
      const { userRepository } = await importModule();
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'u-1', email: 'test@test.com', role: 'freelancer' }],
        total: 1,
      });

      const result = await userRepository.getUserByEmail('test@test.com');
      expect(result).not.toBeNull();
      expect(result.email).toBe('test@test.com');
    });

    it('should return null when not found', async () => {
      const { userRepository } = await importModule();
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await userRepository.getUserByEmail('nonexistent@test.com');
      expect(result).toBeNull();
    });

    it('should throw on database error', async () => {
      const { userRepository } = await importModule();
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(userRepository.getUserByEmail('test@test.com')).rejects.toThrow('Failed to get user by email');
    });
  });

  describe('getAllUsers', () => {
    it('should return all users', async () => {
      const { userRepository } = await importModule();
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'u-1' }, { $id: 'u-2' }],
        total: 2,
      });

      const result = await userRepository.getAllUsers();
      expect(result).toHaveLength(2);
    });

    it('should return empty array on database error', async () => {
      const { userRepository } = await importModule();
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('Timeout'));

      const result = await userRepository.getAllUsers();
      expect(result).toEqual([]);
    });
  });

  describe('getUsersByRole', () => {
    it('should return users by role', async () => {
      const { userRepository } = await importModule();
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'u-1', role: 'admin' }],
        total: 1,
      });

      const result = await userRepository.getUsersByRole('admin');
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('admin');
    });

    it('should return empty array when no users with role', async () => {
      const { userRepository } = await importModule();
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await userRepository.getUsersByRole('admin');
      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      const { userRepository } = await importModule();
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

      await expect(userRepository.getUsersByRole('admin')).rejects.toThrow('Failed to get users by role');
    });
  });

  describe('emailExists', () => {
    it('should return true when email exists', async () => {
      const { userRepository } = await importModule();
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'u-1', email: 'test@test.com' }],
        total: 1,
      });

      const result = await userRepository.emailExists('test@test.com');
      expect(result).toBe(true);
    });

    it('should return false when email does not exist', async () => {
      const { userRepository } = await importModule();
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await userRepository.emailExists('nonexistent@test.com');
      expect(result).toBe(false);
    });
  });

  describe('updateUserName', () => {
    it('should update user name', async () => {
      const { userRepository } = await importModule();
      mockDatabases.updateDocument.mockResolvedValueOnce({
        $id: 'u-1', name: 'New Name',
      });

      const result = await userRepository.updateUserName('u-1', 'New Name');
      expect(result).not.toBeNull();
    });
  });

  describe('deleteUser', () => {
    it('should call delete', async () => {
      const { userRepository } = await importModule();

      await expect(userRepository.deleteUser('u-1')).resolves.not.toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Merged from repository-coverage.test.ts
// ═══════════════════════════════════════════════════════════════

describe('UserRepository - emailExists error handling', () => {
  let repo: any;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new UserRepository();
    mockDatabases = (globalThis as any).__mockDatabases;
  });

  it('should return false when database throws an error', async () => {
    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('Connection failed'));

    const result = await repo.emailExists('test@example.com');
    expect(result).toBe(false);
  });

  it('should return true when email exists', async () => {
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{ $id: 'u1', email: 'test@example.com' }],
      total: 1,
    });

    const result = await repo.emailExists('test@example.com');
    expect(result).toBe(true);
  });

  it('should return false when email does not exist', async () => {
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [],
      total: 0,
    });

    const result = await repo.emailExists('nonexistent@example.com');
    expect(result).toBe(false);
  });
});

describe('BaseRepository - fetchAll multi-page pagination', () => {
  let repo: any;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new UserRepository();
    mockDatabases = (globalThis as any).__mockDatabases;
  });

  it('should paginate with cursorAfter when first page is full (covers lines 142, 149)', async () => {
    // Generate exactly 100 docs for the first page (pageSize = 100)
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      $id: `user-${i + 1}`,
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      email: `user${i + 1}@test.com`,
      role: 'freelancer',
    }));
    // Second page with fewer docs to stop pagination
    const page2 = Array.from({ length: 10 }, (_, i) => ({
      $id: `user-${101 + i}`,
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      email: `user${101 + i}@test.com`,
      role: 'freelancer',
    }));

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: page1, total: 110 })
      .mockResolvedValueOnce({ documents: page2, total: 110 });

    const result = await repo.getAllUsers();
    expect(result).toHaveLength(110);
    expect(mockDatabases.listDocuments).toHaveBeenCalledTimes(2);
    // Verify cursorAfter was called with the last document ID from page 1
    expect(MockQuery.cursorAfter).toHaveBeenCalledWith('user-100');
  });

  it('should break loop when last document has no $id (covers line 150)', async () => {
    // Generate 100 docs where the last one has no $id property
    const docs = Array.from({ length: 100 }, (_, i) => {
      if (i === 99) {
        // Last document without $id
        return {
          $createdAt: '2025-01-01',
          $updatedAt: '2025-01-01',
          name: 'no-id-doc',
        };
      }
      return {
        $id: `user-${i + 1}`,
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
        email: `user${i + 1}@test.com`,
      };
    });

    mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 100 });

    const result = await repo.getAllUsers();
    // Should only have one call because last doc has no $id, breaking the loop
    expect(mockDatabases.listDocuments).toHaveBeenCalledTimes(1);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should break loop when first page has fewer than pageSize docs', async () => {
    const docs = Array.from({ length: 5 }, (_, i) => ({
      $id: `user-${i + 1}`,
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      email: `user${i + 1}@test.com`,
    }));

    mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 5 });

    const result = await repo.getAllUsers();
    expect(result).toHaveLength(5);
    expect(mockDatabases.listDocuments).toHaveBeenCalledTimes(1);
    // cursorAfter should not have been called
    expect(MockQuery.cursorAfter).not.toHaveBeenCalled();
  });
});
