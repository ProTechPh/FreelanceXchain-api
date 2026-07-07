// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockDeleteFile = jest.fn<any>().mockResolvedValue({});
jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
    DATABASE_ID: 'freelancexchain',
  storage: { deleteFile: mockDeleteFile },
  BUCKETS: { PORTFOLIO_IMAGES: 'portfolio-images' },
}));

const mockExtractFileIdFromUrl = jest.fn<any>().mockReturnValue('file-id-123');
jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  extractFileIdFromUrl: mockExtractFileIdFromUrl,
}));

const mockPortfolioRepository = {
  create: jest.fn<any>(),
  findOwnerById: jest.fn<any>(),
  update: jest.fn<any>(),
  getById: jest.fn<any>(),
  delete: jest.fn<any>(),
  findByFreelancer: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/portfolio-repository.ts'), () => ({
  portfolioRepository: mockPortfolioRepository,
}));

const mockSkillRepository = {
  getAllSkills: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: mockSkillRepository,
}));

describe('Portfolio Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const importModule = async () => {
    return await import('../../services/portfolio-service.js');
  };

  describe('createPortfolioItem', () => {
    it('should create portfolio item successfully', async () => {
      const { createPortfolioItem } = await importModule();

      mockSkillRepository.getAllSkills.mockResolvedValueOnce([{ name: 'React' }]);
      const item = { id: 'pi-1', freelancer_id: 'user-1', title: 'My Project', description: 'A great project', images: '["img1.jpg"]', skills: '["React"]', created_at: '2025-01-01', updated_at: '2025-01-01' };
      mockPortfolioRepository.create.mockResolvedValueOnce(item);

      const result = await createPortfolioItem('user-1', {
        title: 'My Project',
        description: 'A great project',
        images: ['img1.jpg'],
        skills: ['React'],
        projectUrl: 'https://example.com',
        completedAt: '2025-01-01',
      });

      expect(result.success).toBe(true);
    });

    it('should fail when no images provided', async () => {
      const { createPortfolioItem } = await importModule();

      const result = await createPortfolioItem('user-1', {
        title: 'My Project',
        description: 'A great project',
        images: [],
        projectUrl: null,
        completedAt: null,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('image');
    });

    it('should fail when skills are invalid', async () => {
      const { createPortfolioItem } = await importModule();

      mockSkillRepository.getAllSkills.mockResolvedValueOnce([{ name: 'React' }]);

      const result = await createPortfolioItem('user-1', {
        title: 'My Project',
        description: 'A great project',
        images: ['img1.jpg'],
        skills: ['React', 'InvalidSkill'],
        projectUrl: null,
        completedAt: null,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('InvalidSkill');
    });

    it('should create without skills', async () => {
      const { createPortfolioItem } = await importModule();

      const item = { id: 'pi-1', freelancer_id: 'user-1', title: 'My Project', created_at: '2025-01-01', updated_at: '2025-01-01' };
      mockPortfolioRepository.create.mockResolvedValueOnce(item);

      const result = await createPortfolioItem('user-1', {
        title: 'My Project',
        description: 'A great project',
        images: ['img1.jpg'],
        projectUrl: null,
        completedAt: null,
      });

      expect(result.success).toBe(true);
    });

    it('should handle database errors', async () => {
      const { createPortfolioItem } = await importModule();

      mockSkillRepository.getAllSkills.mockResolvedValueOnce([{ name: 'React' }]);
      mockPortfolioRepository.create.mockRejectedValueOnce(new Error('DB error'));

      const result = await createPortfolioItem('user-1', {
        title: 'My Project',
        description: 'A great project',
        images: ['img1.jpg'],
        skills: ['React'],
        projectUrl: null,
        completedAt: null,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('updatePortfolioItem', () => {
    it('should update portfolio item successfully', async () => {
      const { updatePortfolioItem } = await importModule();

      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('user-1');
      const updated = { id: 'pi-1', title: 'Updated Title', description: 'Updated desc', created_at: '2025-01-01', updated_at: '2025-01-02' };
      mockPortfolioRepository.update.mockResolvedValueOnce(updated);

      const result = await updatePortfolioItem('pi-1', 'user-1', { title: 'Updated Title', description: 'Updated desc' });

      expect(result.success).toBe(true);
    });

    it('should fail when portfolio item not found', async () => {
      const { updatePortfolioItem } = await importModule();

      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce(null);

      const result = await updatePortfolioItem('nonexistent', 'user-1', { title: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when user is not the owner', async () => {
      const { updatePortfolioItem } = await importModule();

      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('other-user');

      const result = await updatePortfolioItem('pi-1', 'user-1', { title: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should update with all fields', async () => {
      const { updatePortfolioItem } = await importModule();

      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('user-1');
      const updated = { id: 'pi-1', title: 'New', description: 'Desc', project_url: 'https://new.com', images: '["new.jpg"]', skills: '["Node.js"]', completed_at: '2025-06-01', created_at: '2025-01-01', updated_at: '2025-06-01' };
      mockPortfolioRepository.update.mockResolvedValueOnce(updated);

      const result = await updatePortfolioItem('pi-1', 'user-1', {
        title: 'New',
        description: 'Desc',
        projectUrl: 'https://new.com',
        images: ['new.jpg'],
        skills: ['Node.js'],
        completedAt: '2025-06-01',
      });

      expect(result.success).toBe(true);
    });

    it('should handle database errors', async () => {
      const { updatePortfolioItem } = await importModule();

      mockPortfolioRepository.findOwnerById.mockRejectedValueOnce(new Error('DB error'));

      const result = await updatePortfolioItem('pi-1', 'user-1', { title: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });

    it('should return existing item when no update fields provided', async () => {
      const { updatePortfolioItem } = await importModule();

      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockPortfolioRepository.getById.mockResolvedValueOnce({
        id: 'pi-1', freelancer_id: 'user-1', title: 'Original Title',
        description: 'Original Desc', project_url: 'https://example.com',
        images: '["img1.jpg"]', skills: '["React"]',
        completed_at: '2025-01-01', created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await updatePortfolioItem('pi-1', 'user-1', {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Original Title');
        expect(result.data.description).toBe('Original Desc');
        expect(result.data.images).toEqual(['img1.jpg']);
        expect(result.data.skills).toEqual(['React']);
        expect(result.data.completedAt).toEqual(new Date('2025-01-01'));
      }
    });

    it('should update only projectUrl when other fields undefined', async () => {
      const { updatePortfolioItem } = await importModule();

      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('user-1');
      const updated = { id: 'pi-1', project_url: 'https://new.com', created_at: '2025-01-01', updated_at: '2025-01-02' };
      mockPortfolioRepository.update.mockResolvedValueOnce(updated);

      const result = await updatePortfolioItem('pi-1', 'user-1', { projectUrl: 'https://new.com' });

      expect(result.success).toBe(true);
    });
  });

  describe('deletePortfolioItem', () => {
    it('should delete portfolio item and cleanup images', async () => {
      const { deletePortfolioItem } = await importModule();

      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockPortfolioRepository.getById.mockResolvedValueOnce({
        id: 'pi-1', freelancer_id: 'user-1', images: '["https://storage.com/img1.jpg","https://storage.com/img2.jpg"]',
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockPortfolioRepository.delete.mockResolvedValueOnce(true);

      const result = await deletePortfolioItem('pi-1', 'user-1');

      expect(result.success).toBe(true);
      expect(mockDeleteFile).toHaveBeenCalledTimes(2);
    });

    it('should fail when portfolio item not found', async () => {
      const { deletePortfolioItem } = await importModule();

      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce(null);

      const result = await deletePortfolioItem('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when user is not the owner', async () => {
      const { deletePortfolioItem } = await importModule();

      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('other-user');

      const result = await deletePortfolioItem('pi-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle image cleanup failure gracefully', async () => {
      const { deletePortfolioItem } = await importModule();

      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockPortfolioRepository.getById.mockResolvedValueOnce({
        id: 'pi-1', freelancer_id: 'user-1', images: '["https://storage.com/img1.jpg"]',
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockPortfolioRepository.delete.mockResolvedValueOnce(true);
      mockDeleteFile.mockRejectedValueOnce(new Error('Storage error'));

      const result = await deletePortfolioItem('pi-1', 'user-1');

      expect(result.success).toBe(true); // Should still succeed
    });

    it('should handle null extractFileIdFromUrl', async () => {
      const { deletePortfolioItem } = await importModule();

      mockExtractFileIdFromUrl.mockReturnValueOnce(null);
      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockPortfolioRepository.getById.mockResolvedValueOnce({
        id: 'pi-1', freelancer_id: 'user-1', images: '["invalid-url"]',
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockPortfolioRepository.delete.mockResolvedValueOnce(true);

      const result = await deletePortfolioItem('pi-1', 'user-1');

      expect(result.success).toBe(true);
      expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const { deletePortfolioItem } = await importModule();

      mockPortfolioRepository.findOwnerById.mockRejectedValueOnce(new Error('DB error'));

      const result = await deletePortfolioItem('pi-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });

    it('should handle images stored as array instead of JSON string', async () => {
      const { deletePortfolioItem } = await importModule();

      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockPortfolioRepository.getById.mockResolvedValueOnce({
        id: 'pi-1', freelancer_id: 'user-1', images: ['https://storage.com/img1.jpg'],
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockPortfolioRepository.delete.mockResolvedValueOnce(true);

      const result = await deletePortfolioItem('pi-1', 'user-1');

      expect(result.success).toBe(true);
      expect(mockDeleteFile).toHaveBeenCalledTimes(1);
    });

    it('should handle invalid JSON in images field gracefully', async () => {
      const { deletePortfolioItem } = await importModule();

      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockPortfolioRepository.getById.mockResolvedValueOnce({
        id: 'pi-1', freelancer_id: 'user-1', images: 'not-valid-json',
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockPortfolioRepository.delete.mockResolvedValueOnce(true);

      const result = await deletePortfolioItem('pi-1', 'user-1');

      expect(result.success).toBe(true);
      expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('should handle null existing item after delete', async () => {
      const { deletePortfolioItem } = await importModule();

      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockPortfolioRepository.getById.mockResolvedValueOnce(null);
      mockPortfolioRepository.delete.mockResolvedValueOnce(true);

      const result = await deletePortfolioItem('pi-1', 'user-1');

      expect(result.success).toBe(true);
      expect(mockDeleteFile).not.toHaveBeenCalled();
    });
  });

  describe('getFreelancerPortfolio', () => {
    it('should return portfolio items', async () => {
      const { getFreelancerPortfolio } = await importModule();

      const items = [
        { id: 'pi-1', title: 'Project 1', freelancer_id: 'user-1', created_at: '2025-01-01', updated_at: '2025-01-01' },
        { id: 'pi-2', title: 'Project 2', freelancer_id: 'user-1', created_at: '2025-01-02', updated_at: '2025-01-02' },
      ];
      mockPortfolioRepository.findByFreelancer.mockResolvedValueOnce(items);

      const result = await getFreelancerPortfolio('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should return empty array when no items', async () => {
      const { getFreelancerPortfolio } = await importModule();

      mockPortfolioRepository.findByFreelancer.mockResolvedValueOnce([]);

      const result = await getFreelancerPortfolio('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle database errors', async () => {
      const { getFreelancerPortfolio } = await importModule();

      mockPortfolioRepository.findByFreelancer.mockRejectedValueOnce(new Error('DB error'));

      const result = await getFreelancerPortfolio('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('getPortfolioItem', () => {
    it('should return a single portfolio item', async () => {
      const { getPortfolioItem } = await importModule();

      const item = { id: 'pi-1', title: 'My Project', freelancer_id: 'user-1', created_at: '2025-01-01', updated_at: '2025-01-01' };
      mockPortfolioRepository.getById.mockResolvedValueOnce(item);

      const result = await getPortfolioItem('pi-1');

      expect(result.success).toBe(true);
    });

    it('should return NOT_FOUND when item does not exist', async () => {
      const { getPortfolioItem } = await importModule();

      mockPortfolioRepository.getById.mockResolvedValueOnce(null);

      const result = await getPortfolioItem('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should handle database errors', async () => {
      const { getPortfolioItem } = await importModule();

      mockPortfolioRepository.getById.mockRejectedValueOnce(new Error('DB error'));

      const result = await getPortfolioItem('pi-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
