// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

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
