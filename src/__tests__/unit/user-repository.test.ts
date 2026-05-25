import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mocks are handled by jest.setup.ts
const { UserRepository } = await import('../../repositories/user-repository.js');
const { pool } = await import('../../config/database.js');

describe('UserRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new UserRepository();
  });

  describe('createUser', () => {
    it('should create and return a user', async () => {
      const user = { id: 'u1', email: 'test@example.com', role: 'freelancer' };
      (pool.query as any).mockResolvedValueOnce({ rows: [user] });
      
      const result = await repo.createUser(user as any);
      expect(result).toEqual(user);
      expect(pool.query).toHaveBeenCalled();
    });

    it('should throw on database error', async () => {
      (pool.query as any).mockRejectedValueOnce(new Error('insert failed'));
      await expect(repo.createUser({ id: 'u1' } as any)).rejects.toThrow('Failed to create in users: insert failed');
    });
  });

  describe('getUserById', () => {
    it('should return a user', async () => {
      const user = { id: 'u1' };
      (pool.query as any).mockResolvedValueOnce({ rows: [user] });
      
      const result = await repo.getUserById('u1');
      expect(result).toEqual(user);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM users WHERE id = $1'), ['u1']);
    });

    it('should return null when not found', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [] });
      const result = await repo.getUserById('u1');
      expect(result).toBeNull();
    });
  });

  describe('getUserByEmail', () => {
    it('should return a user by email', async () => {
      const user = { id: 'u1', email: 'test@example.com' };
      (pool.query as any).mockResolvedValueOnce({ rows: [user] });
      
      const result = await repo.getUserByEmail('test@example.com');
      expect(result).toEqual(user);
    });

    it('should return null when not found', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [] });
      const result = await repo.getUserByEmail('test@example.com');
      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update and return a user', async () => {
      const user = { id: 'u1', name: 'New Name' };
      (pool.query as any).mockResolvedValueOnce({ rows: [user] });
      
      const result = await repo.updateUser('u1', { name: 'New Name' });
      expect(result).toEqual(user);
    });
  });

  describe('deleteUser', () => {
    it('should delete and return true when exists', async () => {
      // First query for getById, second for delete
      (pool.query as any)
        .mockResolvedValueOnce({ rows: [{ id: 'u1' }] }) // getById
        .mockResolvedValueOnce({ rowCount: 1 }); // delete
        
      const result = await repo.deleteUser('u1');
      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [] }); // getById returns null
      const result = await repo.deleteUser('u1');
      expect(result).toBe(false);
    });
  });

  describe('emailExists', () => {
    it('should return true when email exists', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [{ id: 'u1' }] });
      const result = await repo.emailExists('test@example.com');
      expect(result).toBe(true);
    });

    it('should return false when email does not exist', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [] });
      const result = await repo.emailExists('test@example.com');
      expect(result).toBe(false);
    });
  });

  describe('getAllUsers', () => {
    it('should return all users', async () => {
      const users = [{ id: 'u1' }, { id: 'u2' }];
      (pool.query as any).mockResolvedValueOnce({ rows: users });
      const result = await repo.getAllUsers();
      expect(result).toEqual(users);
    });
  });

  describe('getUsersByRole', () => {
    it('should return users by role', async () => {
      const users = [{ id: 'u1', role: 'freelancer' }];
      (pool.query as any).mockResolvedValueOnce({ rows: users });
      const result = await repo.getUsersByRole('freelancer');
      expect(result).toEqual(users);
    });
  });
});
