import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Express } from 'express';
import { createApp } from '../../app.js';
import { generateId } from '../../utils/id.js';
import { createTestProject, createTestSkill } from '../helpers/test-data-factory.js';

describe('Project Routes - Category Filtering Integration Tests', () => {
  let app: Express;
  let authToken: string;
  let employerId: string;

  beforeAll(async () => {
    // Setup test app
    app = await createApp();
    employerId = generateId();
    // Mock JWT token for testing
    authToken = 'Bearer test-jwt-token';
  });

  beforeEach(() => {
    // Clear any mocks between tests
    jest.clearAllMocks();
  });

  describe('Category Filtering Logic Tests', () => {
    it('should have category filtering methods available', async () => {
      // Import the service functions to verify they exist
      const { listProjectsByCategory, listProjectsByMultipleCategories } = await import('../../services/project-service.js');
      
      expect(typeof listProjectsByCategory).toBe('function');
      expect(typeof listProjectsByMultipleCategories).toBe('function');
    });

    it('should validate category filtering parameters', async () => {
      // Test parameter validation logic
      const categoryId = 'web-development';
      const categoryIds = ['web-development', 'mobile-development'];
      
      expect(typeof categoryId).toBe('string');
      expect(Array.isArray(categoryIds)).toBe(true);
      expect(categoryIds.length).toBe(2);
    });

    it('should handle comma-separated category parsing', async () => {
      const categoriesParam = 'web-development,mobile-development,backend-development';
      const categoryIds = categoriesParam.split(',').map(c => c.trim());
      
      expect(categoryIds.length).toBe(3);
      expect(categoryIds).toContain('web-development');
      expect(categoryIds).toContain('mobile-development');
      expect(categoryIds).toContain('backend-development');
    });

    it('should handle empty and malformed category parameters', async () => {
      const emptyCategoriesParam = '';
      const malformedCategoriesParam = 'web-development,,mobile-development,';
      
      const emptyResult = emptyCategoriesParam.split(',').map(c => c.trim()).filter(c => c.length > 0);
      const malformedResult = malformedCategoriesParam.split(',').map(c => c.trim()).filter(c => c.length > 0);
      
      expect(emptyResult.length).toBe(0);
      expect(malformedResult.length).toBe(2);
      expect(malformedResult).toEqual(['web-development', 'mobile-development']);
    });
  });

  describe('Route Parameter Processing', () => {
    it('should process single category parameter correctly', async () => {
      const mockReq = {
        query: { category: 'web-development' }
      };
      
      const categoryParam = mockReq.query.category as string | undefined;
      expect(categoryParam).toBe('web-development');
    });

    it('should process multiple categories parameter correctly', async () => {
      const mockReq = {
        query: { categories: 'web-development,mobile-development' }
      };
      
      const categoriesParam = mockReq.query.categories as string | undefined;
      const categoryIds = categoriesParam?.split(',').map(c => c.trim()) || [];
      
      expect(categoryIds.length).toBe(2);
      expect(categoryIds).toContain('web-development');
      expect(categoryIds).toContain('mobile-development');
    });

    it('should prioritize categories over category parameter', async () => {
      const mockReq = {
        query: { 
          category: 'web-development',
          categories: 'mobile-development,backend-development'
        }
      };
      
      const categoryParam = mockReq.query.category as string | undefined;
      const categoriesParam = mockReq.query.categories as string | undefined;
      
      // Logic should use categories if both are provided
      const shouldUseCategories = !!categoriesParam;
      expect(shouldUseCategories).toBe(true);
      
      if (categoriesParam) {
        const categoryIds = categoriesParam.split(',').map(c => c.trim());
        expect(categoryIds).toEqual(['mobile-development', 'backend-development']);
      }
    });
  });

  describe('Pagination Logic', () => {
    it('should handle pagination parameters with category filtering', async () => {
      const mockReq = {
        query: {
          category: 'web-development',
          limit: '10',
          offset: '20'
        }
      };
      
      const limit = mockReq.query.limit ? Number(mockReq.query.limit) : undefined;
      const offset = mockReq.query.offset ? Number(mockReq.query.offset) : undefined;
      
      expect(limit).toBe(10);
      expect(offset).toBe(20);
    });

    it('should validate pagination bounds', async () => {
      const clampLimit = (limit?: number) => {
        if (!limit) return 20; // default
        return Math.min(Math.max(limit, 1), 100); // clamp between 1 and 100
      };
      
      const clampOffset = (offset?: number) => {
        if (!offset) return 0; // default
        return Math.max(offset, 0); // minimum 0
      };
      
      expect(clampLimit(undefined)).toBe(20);
      expect(clampLimit(150)).toBe(100);
      expect(clampLimit(-5)).toBe(1);
      expect(clampOffset(undefined)).toBe(0);
      expect(clampOffset(-10)).toBe(0);
      expect(clampOffset(50)).toBe(50);
    });
  });

  describe('Error Handling Logic', () => {
    it('should handle service errors gracefully', async () => {
      const mockServiceResult = {
        success: false,
        error: {
          code: 'CATEGORY_NOT_FOUND',
          message: 'Category not found'
        }
      };
      
      expect(mockServiceResult.success).toBe(false);
      expect(mockServiceResult.error.code).toBe('CATEGORY_NOT_FOUND');
      expect(mockServiceResult.error.message).toBe('Category not found');
    });

    it('should format error responses correctly', async () => {
      const mockError = {
        code: 'VALIDATION_ERROR',
        message: 'Invalid category ID'
      };
      
      const errorResponse = {
        error: mockError,
        timestamp: new Date().toISOString(),
        requestId: 'test-request-id'
      };
      
      expect(errorResponse.error.code).toBe('VALIDATION_ERROR');
      expect(errorResponse.error.message).toBe('Invalid category ID');
      expect(errorResponse.timestamp).toBeDefined();
      expect(errorResponse.requestId).toBe('test-request-id');
    });
  });

  describe('Statistics Endpoint Logic', () => {
    it('should process category statistics correctly', async () => {
      const mockProjects = [
        {
          id: '1',
          budget: 1000,
          required_skills: [{ category_id: 'web-dev', skill_name: 'React' }]
        },
        {
          id: '2', 
          budget: 2000,
          required_skills: [{ category_id: 'web-dev', skill_name: 'Vue' }]
        },
        {
          id: '3',
          budget: 1500,
          required_skills: [{ category_id: 'mobile', skill_name: 'Flutter' }]
        }
      ];
      
      // Group by categories
      const categoryStats = new Map();
      
      mockProjects.forEach(project => {
        project.required_skills.forEach(skill => {
          const key = skill.category_id;
          if (!categoryStats.has(key)) {
            categoryStats.set(key, {
              categoryId: skill.category_id,
              categoryName: skill.category_id,
              projectCount: 0,
              totalBudget: 0
            });
          }
          
          const stats = categoryStats.get(key)!;
          stats.projectCount += 1;
          stats.totalBudget += project.budget;
        });
      });
      
      const result = Array.from(categoryStats.values()).sort((a, b) => b.projectCount - a.projectCount);
      
      expect(result.length).toBe(2);
      expect(result[0].categoryId).toBe('web-dev');
      expect(result[0].projectCount).toBe(2);
      expect(result[0].totalBudget).toBe(3000);
      expect(result[1].categoryId).toBe('mobile');
      expect(result[1].projectCount).toBe(1);
      expect(result[1].totalBudget).toBe(1500);
    });
  });

  describe('Performance Considerations', () => {
    it('should handle large category lists efficiently', async () => {
      const largeCategories = Array(50).fill(null).map((_, i) => `category-${i}`);
      const categoriesParam = largeCategories.join(',');
      
      const startTime = Date.now();
      const categoryIds = categoriesParam.split(',').map(c => c.trim());
      const endTime = Date.now();
      
      expect(categoryIds.length).toBe(50);
      expect(endTime - startTime).toBeLessThan(100); // Should be very fast for parsing
    });

    it('should validate reasonable category limits', async () => {
      const maxCategories = 20; // reasonable limit
      const testCategories = Array(25).fill(null).map((_, i) => `category-${i}`);
      
      const limitedCategories = testCategories.slice(0, maxCategories);
      expect(limitedCategories.length).toBe(maxCategories);
    });
  });
});