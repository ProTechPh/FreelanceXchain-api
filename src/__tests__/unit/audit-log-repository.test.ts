import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { AuditLogRepository } = await import('../../repositories/audit-log-repository.js');

describe('AuditLogRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new AuditLogRepository();
  });

  describe('logAction', () => {
    it('should create and return an audit log entry', async () => {
      const entry = { id: 'a1', action: 'login', user_id: 'u1' };
      mockAppwriteResult({ data: entry });
      const result = await repo.logAction({ action: 'login', user_id: 'u1' } as any);
      expect(result).toEqual(entry);
    });

    it('should use defaults for missing fields', async () => {
      mockAppwriteResult({ data: { id: 'a1' } });
      const result = await repo.logAction({} as any);
      expect(result.id).toBe('a1');
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(repo.logAction({} as any)).rejects.toThrow('Failed to create audit log');
    });
  });

  describe('getById', () => {
    it('should return an entry', async () => {
      const entry = { id: 'a1' };
      mockAppwriteResult({ data: entry });
      const result = await repo.getById('a1');
      expect(result).toEqual(entry);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getById('a1');
      expect(result).toBeNull();
    });

    it('should throw on other database errors', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getById('a1')).rejects.toThrow('Failed to get audit log');
    });
  });

  describe('getByUserId', () => {
    it('should return entries for a user', async () => {
      const entries = [{ id: 'a1', user_id: 'u1' }];
      mockAppwriteResult({ data: entries });
      const result = await repo.getByUserId('u1');
      expect(result).toEqual(entries);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getByUserId('u1')).rejects.toThrow('Failed to get audit logs');
    });
  });

  describe('getByAction', () => {
    it('should return entries by action', async () => {
      const entries = [{ id: 'a1', action: 'login' }];
      mockAppwriteResult({ data: entries });
      const result = await repo.getByAction('login');
      expect(result).toEqual(entries);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getByAction('login')).rejects.toThrow('Failed to get audit logs');
    });
  });

  describe('getByResource', () => {
    it('should return entries by resource type and id', async () => {
      const entries = [{ id: 'a1', resource_type: 'project', resource_id: 'p1' }];
      mockAppwriteResult({ data: entries });
      const result = await repo.getByResource('project', 'p1');
      expect(result).toEqual(entries);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getByResource('project', 'p1')).rejects.toThrow('Failed to get audit logs');
    });
  });

  describe('getByDateRange', () => {
    it('should return entries in date range', async () => {
      const entries = [{ id: 'a1' }];
      mockAppwriteResult({ data: entries });
      const result = await repo.getByDateRange(new Date('2024-01-01'), new Date('2024-12-31'));
      expect(result).toEqual(entries);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getByDateRange(new Date(), new Date())).rejects.toThrow('Failed to get audit logs');
    });
  });

  describe('getFailedActions', () => {
    it('should return failed actions', async () => {
      const entries = [{ id: 'a1', status: 'failure' }];
      mockAppwriteResult({ data: entries });
      const result = await repo.getFailedActions();
      expect(result).toEqual(entries);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getFailedActions()).rejects.toThrow('Failed to get audit logs');
    });
  });
});