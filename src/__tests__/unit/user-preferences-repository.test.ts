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
  },
  ID: { unique: jest.fn(() => 'unique-id') },
}));

const { UserPreferencesRepository, userPreferencesRepository } = await import(
  '../../repositories/user-preferences-repository.js'
);

function toAppwriteDoc(data: Record<string, any>) {
  const { id, created_at, updated_at, ...rest } = data;
  return {
    $id: id,
    $createdAt: created_at || '2026-01-01T00:00:00Z',
    $updatedAt: updated_at || '2026-01-01T00:00:00Z',
    ...rest,
  };
}

describe('UserPreferencesRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new UserPreferencesRepository();
  });

  it('should export userPreferencesRepository instance', () => {
    expect(userPreferencesRepository).toBeInstanceOf(UserPreferencesRepository);
  });

  describe('findByUserId', () => {
    it('should return preferences when record exists', async () => {
      const doc = {
        id: 'pref-1',
        user_id: 'user-1',
        tour_progress: JSON.stringify({ freelancer: { completedVersion: 1, autoStart: false } }),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc(doc)],
        total: 1,
      });

      const result = await repo.findByUserId('user-1');
      expect(result).not.toBeNull();
      expect(result.userId).toBe('user-1');
      expect(result.tourProgress).toEqual({
        freelancer: { completedVersion: 1, autoStart: false },
      });
    });

    it('should return null when no record found', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
      });

      const result = await repo.findByUserId('user-missing');
      expect(result).toBeNull();
    });

    it('should throw Error when databases.listDocuments fails', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('connection timeout'));

      await expect(repo.findByUserId('user-err')).rejects.toThrow(
        'Failed to get user preferences: connection timeout'
      );
    });
  });

  describe('createDefault', () => {
    it('should create default preferences with empty tour_progress', async () => {
      const createdDoc = {
        id: 'pref-new',
        user_id: 'user-2',
        tour_progress: JSON.stringify({}),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      mockCreateDocument.mockResolvedValueOnce(toAppwriteDoc(createdDoc));

      const result = await repo.createDefault('user-2');
      expect(result).not.toBeNull();
      expect(result.userId).toBe('user-2');
      expect(result.tourProgress).toEqual({});
    });
  });

  describe('updatePreferences', () => {
    it('should update existing preferences and return updated model', async () => {
      const existingDoc = {
        id: 'pref-1',
        user_id: 'user-1',
        tour_progress: JSON.stringify({}),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      // 1st listDocuments: findByUserId
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc(existingDoc)],
        total: 1,
      });
      // 2nd listDocuments: inside updatePreferences to get existingEntity
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc(existingDoc)],
        total: 1,
      });

      const updatedDoc = {
        ...existingDoc,
        tour_progress: JSON.stringify({ employer: { completedVersion: 2, autoStart: true } }),
      };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(updatedDoc));

      const result = await repo.updatePreferences('user-1', {
        tourProgress: { employer: { completedVersion: 2, autoStart: true } },
      });

      expect(result).not.toBeNull();
      expect(result.userId).toBe('user-1');
      expect(result.tourProgress).toEqual({
        employer: { completedVersion: 2, autoStart: true },
      });
    });

    it('should create default first if preferences do not exist yet, then update', async () => {
      // 1st findByUserId returns null
      mockListDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
      });

      // createDefault create call
      const createdDoc = {
        id: 'pref-new',
        user_id: 'user-3',
        tour_progress: JSON.stringify({}),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      mockCreateDocument.mockResolvedValueOnce(toAppwriteDoc(createdDoc));

      // 2nd call to updatePreferences -> findByUserId
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc(createdDoc)],
        total: 1,
      });
      // existingEntity in updatePreferences
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc(createdDoc)],
        total: 1,
      });

      const updatedDoc = {
        ...createdDoc,
        tour_progress: JSON.stringify({ freelancer: { completedVersion: 1, autoStart: false } }),
      };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(updatedDoc));

      const result = await repo.updatePreferences('user-3', {
        tourProgress: { freelancer: { completedVersion: 1, autoStart: false } },
      });

      expect(result).not.toBeNull();
      expect(result.userId).toBe('user-3');
    });

    it('should return null if existing document disappeared between check and update', async () => {
      const existingDoc = {
        id: 'pref-1',
        user_id: 'user-1',
        tour_progress: JSON.stringify({}),
      };

      // 1st listDocuments: findByUserId succeeds
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc(existingDoc)],
        total: 1,
      });
      // 2nd listDocuments: existingEntity query returns empty
      mockListDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
      });

      const result = await repo.updatePreferences('user-1', {
        tourProgress: {},
      });

      expect(result).toBeNull();
    });

    it('should update preferences without tourProgress if undefined', async () => {
      const existingDoc = {
        id: 'pref-1',
        user_id: 'user-1',
        tour_progress: JSON.stringify({}),
      };

      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc(existingDoc)],
        total: 1,
      });
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc(existingDoc)],
        total: 1,
      });
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(existingDoc));

      const result = await repo.updatePreferences('user-1', {});
      expect(result).not.toBeNull();
      expect(mockUpdateDocument).toHaveBeenCalledWith(
        'freelancexchain',
        'user_preferences',
        'pref-1',
        {}
      );
    });
  });

  describe('mapToModel error handling', () => {
    it('should fallback to empty object if tour_progress contains invalid JSON', async () => {
      const doc = {
        id: 'pref-broken-json',
        user_id: 'user-1',
        tour_progress: 'invalid-json-{',
      };
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc(doc)],
        total: 1,
      });

      const result = await repo.findByUserId('user-1');
      expect(result.tourProgress).toEqual({});
    });

    it('should fallback to empty object if tour_progress is undefined/null', async () => {
      const doc = {
        id: 'pref-no-progress',
        user_id: 'user-1',
      };
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc(doc)],
        total: 1,
      });

      const result = await repo.findByUserId('user-1');
      expect(result.tourProgress).toEqual({});
    });
  });
});
