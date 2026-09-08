// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockFindByUserId = jest.fn();
const mockCreateDefault = jest.fn();
const mockUpdatePreferences = jest.fn();

jest.unstable_mockModule(
  resolveModule('src/repositories/user-preferences-repository.ts'),
  () => ({
    userPreferencesRepository: {
      findByUserId: mockFindByUserId,
      createDefault: mockCreateDefault,
      updatePreferences: mockUpdatePreferences,
    },
  })
);

const {
  getUserPreferences,
  updateTourProgress,
  markTourCompleted,
  setTourAutoStart,
} = await import('../../services/user-preferences-service.js');

describe('UserPreferencesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserPreferences', () => {
    it('should return existing user preferences if found', async () => {
      const mockPref = {
        id: 'pref-1',
        userId: 'u1',
        tourProgress: { freelancer: { completedVersion: 1, autoStart: false } },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      mockFindByUserId.mockResolvedValueOnce(mockPref);

      const result = await getUserPreferences('u1');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockPref);
      expect(mockCreateDefault).not.toHaveBeenCalled();
    });

    it('should create default preferences if none exist', async () => {
      mockFindByUserId.mockResolvedValueOnce(null);
      const defaultPref = {
        id: 'pref-def',
        userId: 'u2',
        tourProgress: {},
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      mockCreateDefault.mockResolvedValueOnce(defaultPref);

      const result = await getUserPreferences('u2');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(defaultPref);
      expect(mockCreateDefault).toHaveBeenCalledWith('u2');
    });

    it('should return INTERNAL_ERROR on repository exception', async () => {
      mockFindByUserId.mockRejectedValueOnce(new Error('db down'));

      const result = await getUserPreferences('u3');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
      expect(result.error.message).toBe('An unexpected error occurred');
    });
  });

  describe('updateTourProgress', () => {
    it('should return INVALID_ROLE when role is invalid', async () => {
      const result = await updateTourProgress('u1', 'admin' as any, {
        completedVersion: 1,
        autoStart: false,
      });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_ROLE');
    });

    it('should update tour progress successfully for freelancer', async () => {
      mockFindByUserId.mockResolvedValueOnce({
        id: 'pref-1',
        userId: 'u1',
        tourProgress: { employer: { completedVersion: 1, autoStart: false } },
      });
      const updatedPref = {
        id: 'pref-1',
        userId: 'u1',
        tourProgress: {
          employer: { completedVersion: 1, autoStart: false },
          freelancer: { completedVersion: 2, autoStart: true },
        },
      };
      mockUpdatePreferences.mockResolvedValueOnce(updatedPref);

      const result = await updateTourProgress('u1', 'freelancer', {
        completedVersion: 2,
        autoStart: true,
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual(updatedPref);
      expect(mockUpdatePreferences).toHaveBeenCalledWith('u1', {
        tourProgress: {
          employer: { completedVersion: 1, autoStart: false },
          freelancer: { completedVersion: 2, autoStart: true },
        },
      });
    });

    it('should handle when existing preferences or tourProgress is missing/null', async () => {
      mockFindByUserId.mockResolvedValueOnce(null);
      const updatedPref = {
        id: 'pref-1',
        userId: 'u1',
        tourProgress: { employer: { completedVersion: 1, autoStart: true } },
      };
      mockUpdatePreferences.mockResolvedValueOnce(updatedPref);

      const result = await updateTourProgress('u1', 'employer', {
        completedVersion: 1,
        autoStart: true,
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual(updatedPref);
    });

    it('should return NOT_FOUND if updatePreferences returns null', async () => {
      mockFindByUserId.mockResolvedValueOnce({ id: 'pref-1', userId: 'u1', tourProgress: {} });
      mockUpdatePreferences.mockResolvedValueOnce(null);

      const result = await updateTourProgress('u1', 'freelancer', {
        completedVersion: 1,
        autoStart: false,
      });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return INTERNAL_ERROR on repository exception', async () => {
      mockFindByUserId.mockRejectedValueOnce(new Error('repo error'));

      const result = await updateTourProgress('u1', 'freelancer', {
        completedVersion: 1,
        autoStart: false,
      });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('markTourCompleted', () => {
    it('should mark tour as completed with version and autoStart=false', async () => {
      mockFindByUserId.mockResolvedValueOnce({ id: 'pref-1', userId: 'u1', tourProgress: {} });
      const updatedPref = {
        id: 'pref-1',
        userId: 'u1',
        tourProgress: { freelancer: { completedVersion: 3, autoStart: false } },
      };
      mockUpdatePreferences.mockResolvedValueOnce(updatedPref);

      const result = await markTourCompleted('u1', 'freelancer', 3);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(updatedPref);
      expect(mockUpdatePreferences).toHaveBeenCalledWith('u1', {
        tourProgress: { freelancer: { completedVersion: 3, autoStart: false } },
      });
    });
  });

  describe('setTourAutoStart', () => {
    it('should update autoStart while preserving existing role progress', async () => {
      mockFindByUserId
        .mockResolvedValueOnce({
          id: 'pref-1',
          userId: 'u1',
          tourProgress: { employer: { completedVersion: 2, autoStart: true } },
        })
        .mockResolvedValueOnce({
          id: 'pref-1',
          userId: 'u1',
          tourProgress: { employer: { completedVersion: 2, autoStart: true } },
        });

      const updatedPref = {
        id: 'pref-1',
        userId: 'u1',
        tourProgress: { employer: { completedVersion: 2, autoStart: false } },
      };
      mockUpdatePreferences.mockResolvedValueOnce(updatedPref);

      const result = await setTourAutoStart('u1', 'employer', false);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(updatedPref);
    });

    it('should handle when existing user has no tour progress yet', async () => {
      mockFindByUserId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const updatedPref = {
        id: 'pref-1',
        userId: 'u1',
        tourProgress: { freelancer: { autoStart: true } },
      };
      mockUpdatePreferences.mockResolvedValueOnce(updatedPref);

      const result = await setTourAutoStart('u1', 'freelancer', true);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(updatedPref);
    });

    it('should return INTERNAL_ERROR on exception', async () => {
      mockFindByUserId.mockRejectedValueOnce(new Error('fail'));

      const result = await setTourAutoStart('u1', 'employer', false);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
