import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { RushUpgradeRequestRepository } = await import('../../repositories/rush-upgrade-request-repository.js');

describe('RushUpgradeRequestRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new RushUpgradeRequestRepository();
  });

  describe('createRequest', () => {
    it('should create and return a request', async () => {
      const request = { id: 'r1', contract_id: 'c1', status: 'pending' };
      mockAppwriteResult({ data: request });
      const result = await repo.createRequest(request as any);
      expect(result).toEqual(request);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(repo.createRequest({ id: 'r1' } as any)).rejects.toThrow('Failed to create');
    });
  });

  describe('getRequestById', () => {
    it('should return a request', async () => {
      const request = { id: 'r1' };
      mockAppwriteResult({ data: request });
      const result = await repo.getRequestById('r1');
      expect(result).toEqual(request);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getRequestById('r1');
      expect(result).toBeNull();
    });
  });

  describe('updateRequest', () => {
    it('should update and return a request', async () => {
      const request = { id: 'r1', status: 'accepted' };
      mockAppwriteResult({ data: request });
      const result = await repo.updateRequest('r1', { status: 'accepted' });
      expect(result).toEqual(request);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.updateRequest('r1', { status: 'accepted' });
      expect(result).toBeNull();
    });
  });

  describe('getRequestsByContract', () => {
    it('should return requests for a contract', async () => {
      const requests = [{ id: 'r1', contract_id: 'c1' }, { id: 'r2', contract_id: 'c1' }];
      mockAppwriteResult({ data: requests });
      const result = await repo.getRequestsByContract('c1');
      expect(result).toEqual(requests);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getRequestsByContract('c1')).rejects.toThrow('Failed to get rush upgrade requests by contract');
    });
  });

  describe('getPendingRequestByContract', () => {
    it('should return pending request', async () => {
      const request = { id: 'r1', contract_id: 'c1', status: 'pending' };
      mockAppwriteResult({ data: request });
      const result = await repo.getPendingRequestByContract('c1');
      expect(result).toEqual(request);
    });

    it('should return null when no pending request', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getPendingRequestByContract('c1');
      expect(result).toBeNull();
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getPendingRequestByContract('c1')).rejects.toThrow('Failed to get pending rush upgrade request');
    });
  });
});