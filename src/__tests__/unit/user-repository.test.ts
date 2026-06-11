// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { UserRepository } = await import('../../repositories/user-repository.js');

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
