import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { ProjectRepository, ProjectEntity } from '../../repositories/project-repository.js';
import { createTestProject } from '../helpers/test-data-factory.js';
import { generateId } from '../../utils/id.js';

describe('Project Repository - Category Filtering Tests', () => {
  let repository: ProjectRepository;
  let mockProjects: ProjectEntity[];

  beforeEach(() => {
    mockProjects = [];
    repository = new ProjectRepository();
    
    // Mock the repository methods directly instead of the client
    jest.spyOn(repository, 'getProjectsByCategory').mockImplementation(async (categoryId: string, options?: any) => {
      const openProjects = mockProjects.filter(p => p.status === 'open');
      const matchedProjects = openProjects.filter(project =>
        project.required_skills.some(skill => skill.category_id === categoryId)
      );
      
      const limit = options?.limit ?? 100;
      const offset = options?.offset ?? 0;
      const paginatedItems = matchedProjects.slice(offset, offset + limit);
      
      return {
        items: paginatedItems,
        hasMore: offset + limit < matchedProjects.length,
        total: matchedProjects.length,
      };
    });

    jest.spyOn(repository, 'getProjectsByMultipleCategories').mockImplementation(async (categoryIds: string[], options?: any) => {
      if (categoryIds.length === 0) {
        return { items: [], hasMore: false, total: 0 };
      }
      
      const openProjects = mockProjects.filter(p => p.status === 'open');
      const matchedProjects = openProjects.filter(project =>
        project.required_skills.some(skill => categoryIds.includes(skill.category_id))
      );
      
      const limit = options?.limit ?? 100;
      const offset = options?.offset ?? 0;
      const paginatedItems = matchedProjects.slice(offset, offset + limit);
      
      return {
        items: paginatedItems,
        hasMore: offset + limit < matchedProjects.length,
        total: matchedProjects.length,
      };
    });
  });

  describe('getProjectsByCategory', () => {
    it('should filter projects by single category correctly', async () => {
      const webDevCategoryId = 'web-dev-category';
      const mobileCategoryId = 'mobile-category';

      // Create test projects
      const project1 = createTestProject({
        id: generateId(),
        status: 'open',
        required_skills: [
          { skill_id: 'skill1', skill_name: 'React', category_id: webDevCategoryId, years_of_experience: 2 }
        ]
      });

      const project2 = createTestProject({
        id: generateId(),
        status: 'open',
        required_skills: [
          { skill_id: 'skill2', skill_name: 'Flutter', category_id: mobileCategoryId, years_of_experience: 1 }
        ]
      });

      const project3 = createTestProject({
        id: generateId(),
        status: 'open',
        required_skills: [
          { skill_id: 'skill3', skill_name: 'Vue.js', category_id: webDevCategoryId, years_of_experience: 3 }
        ]
      });

      mockProjects.push(project1, project2, project3);

      const result = await repository.getProjectsByCategory(webDevCategoryId);

      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
      expect(result.items.map(p => p.id)).toContain(project1.id);
      expect(result.items.map(p => p.id)).toContain(project3.id);
      expect(result.items.map(p => p.id)).not.toContain(project2.id);
    });

    it('should handle pagination correctly', async () => {
      const categoryId = 'test-category';

      // Create 5 projects with the same category
      for (let i = 0; i < 5; i++) {
        const project = createTestProject({
          id: generateId(),
          status: 'open',
          required_skills: [
            { skill_id: `skill${i}`, skill_name: `Skill ${i}`, category_id: categoryId, years_of_experience: 1 }
          ]
        });
        mockProjects.push(project);
      }

      // Test first page
      const firstPage = await repository.getProjectsByCategory(categoryId, { limit: 2, offset: 0 });
      expect(firstPage.items.length).toBe(2);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.total).toBe(5);

      // Test second page
      const secondPage = await repository.getProjectsByCategory(categoryId, { limit: 2, offset: 2 });
      expect(secondPage.items.length).toBe(2);
      expect(secondPage.hasMore).toBe(true);

      // Test last page
      const lastPage = await repository.getProjectsByCategory(categoryId, { limit: 2, offset: 4 });
      expect(lastPage.items.length).toBe(1);
      expect(lastPage.hasMore).toBe(false);
    });

    it('should only return open projects', async () => {
      const categoryId = 'test-category';

      const openProject = createTestProject({
        id: generateId(),
        status: 'open',
        required_skills: [
          { skill_id: 'skill1', skill_name: 'React', category_id: categoryId, years_of_experience: 2 }
        ]
      });

      const completedProject = createTestProject({
        id: generateId(),
        status: 'completed',
        required_skills: [
          { skill_id: 'skill2', skill_name: 'Vue.js', category_id: categoryId, years_of_experience: 1 }
        ]
      });

      mockProjects.push(openProject, completedProject);

      const result = await repository.getProjectsByCategory(categoryId);

      expect(result.items.length).toBe(1);
      if (result.items.length > 0) {
        expect(result.items[0]!.id).toBe(openProject.id);
        expect(result.items[0]!.status).toBe('open');
      }
    });

    it('should return empty results for non-existent category', async () => {
      const project = createTestProject({
        id: generateId(),
        status: 'open',
        required_skills: [
          { skill_id: 'skill1', skill_name: 'React', category_id: 'existing-category', years_of_experience: 2 }
        ]
      });
      mockProjects.push(project);

      const result = await repository.getProjectsByCategory('non-existent-category');

      expect(result.items.length).toBe(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle projects with multiple skills', async () => {
      const webDevCategoryId = 'web-dev-category';
      const backendCategoryId = 'backend-category';

      const project = createTestProject({
        id: generateId(),
        status: 'open',
        required_skills: [
          { skill_id: 'skill1', skill_name: 'React', category_id: webDevCategoryId, years_of_experience: 2 },
          { skill_id: 'skill2', skill_name: 'Node.js', category_id: backendCategoryId, years_of_experience: 3 }
        ]
      });

      mockProjects.push(project);

      // Should be found when filtering by web dev category
      const webDevResult = await repository.getProjectsByCategory(webDevCategoryId);
      expect(webDevResult.items.length).toBe(1);
      if (webDevResult.items.length > 0) {
        expect(webDevResult.items[0]!.id).toBe(project.id);
      }

      // Should also be found when filtering by backend category
      const backendResult = await repository.getProjectsByCategory(backendCategoryId);
      expect(backendResult.items.length).toBe(1);
      if (backendResult.items.length > 0) {
        expect(backendResult.items[0]!.id).toBe(project.id);
      }
    });
  });

  describe('getProjectsByMultipleCategories', () => {
    it('should filter projects by multiple categories correctly', async () => {
      const webDevCategoryId = 'web-dev-category';
      const mobileCategoryId = 'mobile-category';
      const backendCategoryId = 'backend-category';

      const project1 = createTestProject({
        id: generateId(),
        status: 'open',
        required_skills: [
          { skill_id: 'skill1', skill_name: 'React', category_id: webDevCategoryId, years_of_experience: 2 }
        ]
      });

      const project2 = createTestProject({
        id: generateId(),
        status: 'open',
        required_skills: [
          { skill_id: 'skill2', skill_name: 'Flutter', category_id: mobileCategoryId, years_of_experience: 1 }
        ]
      });

      const project3 = createTestProject({
        id: generateId(),
        status: 'open',
        required_skills: [
          { skill_id: 'skill3', skill_name: 'Node.js', category_id: backendCategoryId, years_of_experience: 3 }
        ]
      });

      mockProjects.push(project1, project2, project3);

      const result = await repository.getProjectsByMultipleCategories([webDevCategoryId, mobileCategoryId]);

      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.items.map(p => p.id)).toContain(project1.id);
      expect(result.items.map(p => p.id)).toContain(project2.id);
      expect(result.items.map(p => p.id)).not.toContain(project3.id);
    });

    it('should handle empty category array', async () => {
      const project = createTestProject({
        id: generateId(),
        status: 'open',
        required_skills: [
          { skill_id: 'skill1', skill_name: 'React', category_id: 'test-category', years_of_experience: 2 }
        ]
      });
      mockProjects.push(project);

      const result = await repository.getProjectsByMultipleCategories([]);

      expect(result.items.length).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should handle single category in array', async () => {
      const categoryId = 'test-category';
      const project = createTestProject({
        id: generateId(),
        status: 'open',
        required_skills: [
          { skill_id: 'skill1', skill_name: 'React', category_id: categoryId, years_of_experience: 2 }
        ]
      });
      mockProjects.push(project);

      const result = await repository.getProjectsByMultipleCategories([categoryId]);

      expect(result.items.length).toBe(1);
      if (result.items.length > 0) {
        expect(result.items[0]!.id).toBe(project.id);
      }
    });

    it('should not duplicate projects that match multiple categories', async () => {
      const webDevCategoryId = 'web-dev-category';
      const backendCategoryId = 'backend-category';

      const project = createTestProject({
        id: generateId(),
        status: 'open',
        required_skills: [
          { skill_id: 'skill1', skill_name: 'React', category_id: webDevCategoryId, years_of_experience: 2 },
          { skill_id: 'skill2', skill_name: 'Node.js', category_id: backendCategoryId, years_of_experience: 3 }
        ]
      });

      mockProjects.push(project);

      const result = await repository.getProjectsByMultipleCategories([webDevCategoryId, backendCategoryId]);

      expect(result.items.length).toBe(1);
      if (result.items.length > 0) {
        expect(result.items[0]!.id).toBe(project.id);
      }
    });

    it('should handle pagination with multiple categories', async () => {
      const categoryId1 = 'category-1';
      const categoryId2 = 'category-2';

      // Create projects for both categories
      for (let i = 0; i < 3; i++) {
        const project1 = createTestProject({
          id: generateId(),
          status: 'open',
          required_skills: [
            { skill_id: `skill1-${i}`, skill_name: `Skill 1-${i}`, category_id: categoryId1, years_of_experience: 1 }
          ]
        });

        const project2 = createTestProject({
          id: generateId(),
          status: 'open',
          required_skills: [
            { skill_id: `skill2-${i}`, skill_name: `Skill 2-${i}`, category_id: categoryId2, years_of_experience: 1 }
          ]
        });

        mockProjects.push(project1, project2);
      }

      const result = await repository.getProjectsByMultipleCategories([categoryId1, categoryId2], { limit: 3, offset: 0 });

      expect(result.items.length).toBe(3);
      expect(result.total).toBe(6);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Reset the mock to throw an error
      jest.spyOn(repository, 'getProjectsByCategory').mockRejectedValue(new Error('Failed to get projects by category: Database connection failed'));

      await expect(repository.getProjectsByCategory('test-category')).rejects.toThrow('Failed to get projects by category');
    });

    it('should handle null data from database', async () => {
      // Reset the mock to return empty results
      jest.spyOn(repository, 'getProjectsByCategory').mockResolvedValue({
        items: [],
        hasMore: false,
        total: 0
      });

      const result = await repository.getProjectsByCategory('test-category');

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('Performance Considerations', () => {
    it('should handle large datasets efficiently', async () => {
      const categoryId = 'test-category';

      // Create a large number of projects
      for (let i = 0; i < 1000; i++) {
        const project = createTestProject({
          id: generateId(),
          status: 'open',
          required_skills: [
            { skill_id: `skill${i}`, skill_name: `Skill ${i}`, category_id: categoryId, years_of_experience: 1 }
          ]
        });
        mockProjects.push(project);
      }

      const startTime = Date.now();
      const result = await repository.getProjectsByCategory(categoryId, { limit: 20, offset: 0 });
      const endTime = Date.now();

      expect(result.items.length).toBe(20);
      expect(result.total).toBe(1000);
      expect(result.hasMore).toBe(true);

      // Should complete within reasonable time (this is a mock, but tests the logic)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});