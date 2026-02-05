/**
 * Property-Based Tests for Request Validation Middleware
 * 
 * **Property 41: Invalid data validation errors**
 * **Property 42: Missing field validation errors**
 * **Validates: Requirements 12.2, 12.3**
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import {
  validateRequest,
  registerSchema,
  loginSchema,
  createProjectSchema,
  submitProposalSchema,
  submitRatingSchema,
  createFreelancerProfileSchema,
  RequestSchema,
} from '../validation-middleware';

// Helper to extract body schema with proper typing
function getBodySchema(schema: RequestSchema) {
  return schema.body!;
}

describe('Validation Middleware - Property Tests', () => {
  /**
   * **Feature: blockchain-freelance-marketplace, Property 41: Invalid data validation errors**
   * **Validates: Requirements 12.2**
   * 
   * For any API request with invalid data, the response shall include
   * field-specific validation error messages identifying which fields are invalid.
   */
  describe('Property 41: Invalid data validation errors', () => {
    it('should return field-specific errors for invalid email format', () => {
      fc.assert(
        fc.property(
          // Generate strings that are NOT valid emails
          fc.string().filter(s => !s.includes('@') || s.length < 5),
          fc.string({ minLength: 8 }),
          fc.constantFrom('freelancer', 'employer'),
          (invalidEmail, password, role) => {
            const data = { email: invalidEmail, password, role };
            const result = validateRequest(data, getBodySchema(registerSchema));

            // Should have validation errors
            expect(result.valid).toBe(false);
            
            // Should have field-specific error for email
            const emailError = result.errors.find(e => e.field === 'email');
            expect(emailError).toBeDefined();
            expect(emailError?.message).toContain('email');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return field-specific errors for password too short', () => {
      fc.assert(
        fc.property(
          fc.emailAddress(),
          // Generate passwords that are too short (less than 8 chars)
          fc.string({ minLength: 1, maxLength: 7 }),
          fc.constantFrom('freelancer', 'employer'),
          (email, shortPassword, role) => {
            const data = { email, password: shortPassword, role };
            const result = validateRequest(data, getBodySchema(registerSchema));

            // Should have validation errors
            expect(result.valid).toBe(false);
            
            // Should have field-specific error for password
            const passwordError = result.errors.find(e => e.field === 'password');
            expect(passwordError).toBeDefined();
            expect(passwordError?.message).toContain('password');
            expect(passwordError?.message).toContain('8');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return field-specific errors for invalid role enum', () => {
      fc.assert(
        fc.property(
          fc.emailAddress(),
          fc.string({ minLength: 8 }),
          // Generate roles that are NOT valid enum values
          fc.string().filter(s => s !== 'freelancer' && s !== 'employer'),
          (email, password, invalidRole) => {
            const data = { email, password, role: invalidRole };
            const result = validateRequest(data, getBodySchema(registerSchema));

            // Should have validation errors
            expect(result.valid).toBe(false);
            
            // Should have field-specific error for role
            const roleError = result.errors.find(e => e.field === 'role');
            expect(roleError).toBeDefined();
            expect(roleError?.message).toContain('role');
            expect(roleError?.message).toContain('one of');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return field-specific errors for invalid number types', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10 }),
          // Generate non-number values for hourlyRate
          fc.string(),
          (bio, invalidRate) => {
            const data = { bio, hourlyRate: invalidRate };
            const result = validateRequest(data, getBodySchema(createFreelancerProfileSchema));

            // Should have validation errors
            expect(result.valid).toBe(false);
            
            // Should have field-specific error for hourlyRate
            const rateError = result.errors.find(e => e.field === 'hourlyRate');
            expect(rateError).toBeDefined();
            expect(rateError?.message).toContain('hourlyRate');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return field-specific errors for number below minimum', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10 }),
          // Generate numbers below minimum (1)
          fc.integer({ min: -1000, max: 0 }),
          (bio, invalidRate) => {
            const data = { bio, hourlyRate: invalidRate };
            const result = validateRequest(data, getBodySchema(createFreelancerProfileSchema));

            // Should have validation errors
            expect(result.valid).toBe(false);
            
            // Should have field-specific error for hourlyRate
            const rateError = result.errors.find(e => e.field === 'hourlyRate');
            expect(rateError).toBeDefined();
            expect(rateError?.message).toContain('hourlyRate');
            expect(rateError?.message).toContain('at least');
          }
        ),
        { numRuns: 100 }
      );
    });


    it('should return field-specific errors for rating outside bounds (1-5)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          // Generate ratings outside valid range (1-5)
          fc.oneof(
            fc.integer({ min: -100, max: 0 }),
            fc.integer({ min: 6, max: 100 })
          ),
          (contractId, rateeId, invalidRating) => {
            const data = { contractId, rateeId, rating: invalidRating };
            const result = validateRequest(data, getBodySchema(submitRatingSchema));

            // Should have validation errors
            expect(result.valid).toBe(false);
            
            // Should have field-specific error for rating
            const ratingError = result.errors.find(e => e.field === 'rating');
            expect(ratingError).toBeDefined();
            expect(ratingError?.message).toContain('rating');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return field-specific errors for string below minLength', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          // Generate cover letters that are too short (less than 10 chars)
          fc.string({ minLength: 0, maxLength: 9 }),
          fc.integer({ min: 1 }),
          fc.integer({ min: 1 }),
          (projectId, shortCoverLetter, proposedRate, estimatedDuration) => {
            const data = { projectId, coverLetter: shortCoverLetter, proposedRate, estimatedDuration };
            const result = validateRequest(data, getBodySchema(submitProposalSchema));

            // Should have validation errors
            expect(result.valid).toBe(false);
            
            // Should have field-specific error for coverLetter
            const coverLetterError = result.errors.find(e => e.field === 'coverLetter');
            expect(coverLetterError).toBeDefined();
            expect(coverLetterError?.message).toContain('coverLetter');
            expect(coverLetterError?.message).toContain('10');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return multiple field-specific errors when multiple fields are invalid', () => {
      fc.assert(
        fc.property(
          // Invalid email
          fc.string().filter(s => !s.includes('@')),
          // Invalid password (too short)
          fc.string({ minLength: 1, maxLength: 7 }),
          // Invalid role
          fc.string().filter(s => s !== 'freelancer' && s !== 'employer'),
          (invalidEmail, shortPassword, invalidRole) => {
            const data = { email: invalidEmail, password: shortPassword, role: invalidRole };
            const result = validateRequest(data, getBodySchema(registerSchema));

            // Should have validation errors
            expect(result.valid).toBe(false);
            
            // Should have errors for all three fields
            expect(result.errors.length).toBeGreaterThanOrEqual(3);
            
            const fields = result.errors.map(e => e.field);
            expect(fields).toContain('email');
            expect(fields).toContain('password');
            expect(fields).toContain('role');
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 42: Missing field validation errors**
   * **Validates: Requirements 12.3**
   * 
   * For any API request missing required fields, the response shall list
   * all missing required fields.
   */
  describe('Property 42: Missing field validation errors', () => {
    it('should list all missing required fields for registration', () => {
      fc.assert(
        fc.property(
          // Generate subsets of required fields to omit
          fc.subarray(['email', 'password', 'role'], { minLength: 1 }),
          (fieldsToOmit) => {
            // Create data with some required fields missing
            const fullData: Record<string, unknown> = {
              email: 'test@example.com',
              password: 'password123',
              role: 'freelancer',
            };
            
            const data: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(fullData)) {
              if (!fieldsToOmit.includes(key)) {
                data[key] = value;
              }
            }

            const result = validateRequest(data, getBodySchema(registerSchema));

            // Should have validation errors
            expect(result.valid).toBe(false);
            
            // Should have errors for all omitted fields
            const errorFields = result.errors.map(e => e.field);
            for (const omittedField of fieldsToOmit) {
              expect(errorFields).toContain(omittedField);
              
              // Error message should indicate the field is required
              const fieldError = result.errors.find(e => e.field === omittedField);
              expect(fieldError?.message).toContain('required');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should list all missing required fields for login', () => {
      fc.assert(
        fc.property(
          fc.subarray(['email', 'password'], { minLength: 1 }),
          (fieldsToOmit) => {
            const fullData: Record<string, unknown> = {
              email: 'test@example.com',
              password: 'password123',
            };
            
            const data: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(fullData)) {
              if (!fieldsToOmit.includes(key)) {
                data[key] = value;
              }
            }

            const result = validateRequest(data, getBodySchema(loginSchema));

            expect(result.valid).toBe(false);
            
            const errorFields = result.errors.map(e => e.field);
            for (const omittedField of fieldsToOmit) {
              expect(errorFields).toContain(omittedField);
              const fieldError = result.errors.find(e => e.field === omittedField);
              expect(fieldError?.message).toContain('required');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should list all missing required fields for project creation', () => {
      fc.assert(
        fc.property(
          fc.subarray(['title', 'description', 'requiredSkills', 'budget', 'deadline'], { minLength: 1 }),
          (fieldsToOmit) => {
            const fullData: Record<string, unknown> = {
              title: 'Test Project Title',
              description: 'This is a test project description that is long enough',
              requiredSkills: [{ skillId: 'skill-1' }],
              budget: 1000,
              deadline: '2025-12-31T23:59:59Z',
            };
            
            const data: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(fullData)) {
              if (!fieldsToOmit.includes(key)) {
                data[key] = value;
              }
            }

            const result = validateRequest(data, getBodySchema(createProjectSchema));

            expect(result.valid).toBe(false);
            
            const errorFields = result.errors.map(e => e.field);
            for (const omittedField of fieldsToOmit) {
              expect(errorFields).toContain(omittedField);
              const fieldError = result.errors.find(e => e.field === omittedField);
              expect(fieldError?.message).toContain('required');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should list all missing required fields for proposal submission', () => {
      fc.assert(
        fc.property(
          fc.subarray(['projectId', 'coverLetter', 'proposedRate', 'estimatedDuration'], { minLength: 1 }),
          (fieldsToOmit) => {
            const fullData: Record<string, unknown> = {
              projectId: 'project-123',
              coverLetter: 'This is my cover letter for the project',
              proposedRate: 50,
              estimatedDuration: 30,
            };
            
            const data: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(fullData)) {
              if (!fieldsToOmit.includes(key)) {
                data[key] = value;
              }
            }

            const result = validateRequest(data, getBodySchema(submitProposalSchema));

            expect(result.valid).toBe(false);
            
            const errorFields = result.errors.map(e => e.field);
            for (const omittedField of fieldsToOmit) {
              expect(errorFields).toContain(omittedField);
              const fieldError = result.errors.find(e => e.field === omittedField);
              expect(fieldError?.message).toContain('required');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should list all missing required fields for rating submission', () => {
      fc.assert(
        fc.property(
          fc.subarray(['contractId', 'rateeId', 'rating'], { minLength: 1 }),
          (fieldsToOmit) => {
            const fullData: Record<string, unknown> = {
              contractId: 'contract-123',
              rateeId: 'user-456',
              rating: 5,
            };
            
            const data: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(fullData)) {
              if (!fieldsToOmit.includes(key)) {
                data[key] = value;
              }
            }

            const result = validateRequest(data, getBodySchema(submitRatingSchema));

            expect(result.valid).toBe(false);
            
            const errorFields = result.errors.map(e => e.field);
            for (const omittedField of fieldsToOmit) {
              expect(errorFields).toContain(omittedField);
              const fieldError = result.errors.find(e => e.field === omittedField);
              expect(fieldError?.message).toContain('required');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty errors for valid complete data', () => {
      fc.assert(
        fc.property(
          fc.emailAddress(),
          fc.string({ minLength: 8, maxLength: 128 }),
          fc.constantFrom('freelancer', 'employer'),
          (email, password, role) => {
            const data = { email, password, role };
            const result = validateRequest(data, getBodySchema(registerSchema));

            // Should be valid with no errors
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty object with all required fields missing', () => {
      const result = validateRequest({}, getBodySchema(registerSchema));

      expect(result.valid).toBe(false);
      
      const errorFields = result.errors.map(e => e.field);
      expect(errorFields).toContain('email');
      expect(errorFields).toContain('password');
      expect(errorFields).toContain('role');
      
      // All errors should mention "required"
      for (const error of result.errors) {
        expect(error.message).toContain('required');
      }
    });
  });
});

