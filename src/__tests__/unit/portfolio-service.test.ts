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

describe('Portfolio Service', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/portfolio-service.js');
  };

  describe('createPortfolioItem', () => {
    it('should create portfolio item successfully', async () => {
      const { createPortfolioItem } = await importModule();

      const item = { id: 'pi-1', freelancer_id: 'user-1', title: 'My Project', description: 'A great project', images: ['img1.jpg'] };
      mockPool.query.mockResolvedValueOnce({ rows: item.images.length > 0 ? [{ name: 'React' }] : [], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [item], rowCount: 1 });

      const result = await createPortfolioItem('user-1', {
        title: 'My Project',
        description: 'A great project',
        images: ['img1.jpg'],
        skills: ['React'],
        projectUrl: 'https://example.com',
        completedAt: '2025-01-01',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(item);
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

      // Skills query returns fewer than provided
      mockPool.query.mockResolvedValueOnce({ rows: [{ name: 'React' }], rowCount: 1 });

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

      const item = { id: 'pi-1', freelancer_id: 'user-1', title: 'My Project' };
      mockPool.query.mockResolvedValueOnce({ rows: [item], rowCount: 1 });

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

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

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

      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'user-1' }], rowCount: 1 });
      const updated = { id: 'pi-1', title: 'Updated Title', description: 'Updated desc' };
      mockPool.query.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

      const result = await updatePortfolioItem('pi-1', 'user-1', { title: 'Updated Title', description: 'Updated desc' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(updated);
    });

    it('should fail when portfolio item not found', async () => {
      const { updatePortfolioItem } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await updatePortfolioItem('nonexistent', 'user-1', { title: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when user is not the owner', async () => {
      const { updatePortfolioItem } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'other-user' }], rowCount: 1 });

      const result = await updatePortfolioItem('pi-1', 'user-1', { title: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should update with all fields', async () => {
      const { updatePortfolioItem } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'user-1' }], rowCount: 1 });
      const updated = { id: 'pi-1', title: 'New', description: 'Desc', project_url: 'https://new.com', images: ['new.jpg'], skills: ['Node.js'], completed_at: '2025-06-01' };
      mockPool.query.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

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

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await updatePortfolioItem('pi-1', 'user-1', { title: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('deletePortfolioItem', () => {
    it('should delete portfolio item and cleanup images', async () => {
      const { deletePortfolioItem } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ freelancer_id: 'user-1', images: ['https://storage.com/img1.jpg', 'https://storage.com/img2.jpg'] }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await deletePortfolioItem('pi-1', 'user-1');

      expect(result.success).toBe(true);
      expect(mockDeleteFile).toHaveBeenCalledTimes(2);
    });

    it('should fail when portfolio item not found', async () => {
      const { deletePortfolioItem } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await deletePortfolioItem('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when user is not the owner', async () => {
      const { deletePortfolioItem } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'other-user', images: [] }], rowCount: 1 });

      const result = await deletePortfolioItem('pi-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle image cleanup failure gracefully', async () => {
      const { deletePortfolioItem } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ freelancer_id: 'user-1', images: ['https://storage.com/img1.jpg'] }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockDeleteFile.mockRejectedValueOnce(new Error('Storage error'));

      const result = await deletePortfolioItem('pi-1', 'user-1');

      expect(result.success).toBe(true); // Should still succeed
    });

    it('should handle null extractFileIdFromUrl', async () => {
      const { deletePortfolioItem } = await importModule();

      mockExtractFileIdFromUrl.mockReturnValueOnce(null);
      mockPool.query.mockResolvedValueOnce({
        rows: [{ freelancer_id: 'user-1', images: ['invalid-url'] }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await deletePortfolioItem('pi-1', 'user-1');

      expect(result.success).toBe(true);
      expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const { deletePortfolioItem } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await deletePortfolioItem('pi-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('getFreelancerPortfolio', () => {
    it('should return portfolio items', async () => {
      const { getFreelancerPortfolio } = await importModule();

      const items = [
        { id: 'pi-1', title: 'Project 1' },
        { id: 'pi-2', title: 'Project 2' },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: items, rowCount: 2 });

      const result = await getFreelancerPortfolio('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should return empty array when no items', async () => {
      const { getFreelancerPortfolio } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getFreelancerPortfolio('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle database errors', async () => {
      const { getFreelancerPortfolio } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getFreelancerPortfolio('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('getPortfolioItem', () => {
    it('should return a single portfolio item', async () => {
      const { getPortfolioItem } = await importModule();

      const item = { id: 'pi-1', title: 'My Project' };
      mockPool.query.mockResolvedValueOnce({ rows: [item], rowCount: 1 });

      const result = await getPortfolioItem('pi-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(item);
    });

    it('should return NOT_FOUND when item does not exist', async () => {
      const { getPortfolioItem } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getPortfolioItem('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should handle database errors', async () => {
      const { getPortfolioItem } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getPortfolioItem('pi-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
