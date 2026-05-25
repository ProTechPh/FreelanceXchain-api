import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { SkillCategoryRepository } = await import('../../repositories/skill-category-repository.js');

describe('SkillCategoryRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new SkillCategoryRepository();
  });

  describe('createCategory', () => {
    it('should create and return a category', async () => {
      const category = { id: 'c1', name: 'Web Dev', description: 'Web development', is_active: true };
      mockAppwriteResult({ data: category });
      const result = await repo.createCategory(category as any);
      expect(result).toEqual(category);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(repo.createCategory({ id: 'c1' } as any)).rejects.toThrow('Failed to create');
    });
  });

  describe('getCategoryById', () => {
    it('should return a category', async () => {
      const category = { id: 'c1' };
      mockAppwriteResult({ data: category });
      const result = await repo.getCategoryById('c1');
      expect(result).toEqual(category);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getCategoryById('c1');
      expect(result).toBeNull();
    });
  });

  describe('updateCategory', () => {
    it('should update and return a category', async () => {
      const category = { id: 'c1', name: 'Updated' };
      mockAppwriteResult({ data: category });
      const result = await repo.updateCategory('c1', { name: 'Updated' });
      expect(result).toEqual(category);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.updateCategory('c1', { name: 'Updated' });
      expect(result).toBeNull();
    });
  });

  describe('deleteCategory', () => {
    it('should delete and return true when exists', async () => {
      mockAppwriteResult({ data: { id: 'c1' } });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await repo.deleteCategory('c1');
      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.deleteCategory('c1');
      expect(result).toBe(false);
    });
  });

  describe('getAllCategories', () => {
    it('should return all categories', async () => {
      const categories = [{ id: 'c1' }, { id: 'c2' }];
      mockAppwriteResult({ data: categories });
      const result = await repo.getAllCategories();
      expect(result).toEqual(categories);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getAllCategories()).rejects.toThrow('Failed to get all categories');
    });
  });

  describe('getActiveCategories', () => {
    it('should return active categories', async () => {
      const categories = [{ id: 'c1', is_active: true }];
      mockAppwriteResult({ data: categories });
      const result = await repo.getActiveCategories();
      expect(result).toEqual(categories);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getActiveCategories()).rejects.toThrow('Failed to get active categories');
    });
  });

  describe('getCategoryByName', () => {
    it('should return a category by name', async () => {
      const category = { id: 'c1', name: 'Web Dev' };
      mockAppwriteResult({ data: category });
      const result = await repo.getCategoryByName('Web Dev');
      expect(result).toEqual(category);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getCategoryByName('Unknown');
      expect(result).toBeNull();
    });

    it('should throw on other database errors', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getCategoryByName('Web Dev')).rejects.toThrow('Failed to get category by name');
    });
  });
});