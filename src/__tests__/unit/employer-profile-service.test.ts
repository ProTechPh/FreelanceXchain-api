import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { EmployerProfileEntity } from '../../repositories/employer-profile-repository.js';
import { createInMemoryStore, createMockEmployerProfileRepository } from '../helpers/mock-repository-factory.js';
import { createTestUser } from '../helpers/test-data-factory.js';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Create mocks using shared factories
const profileStore = createInMemoryStore();
const mockProfileRepo = createMockEmployerProfileRepository(profileStore as any);

// Mock KYC service
const mockKycService = {
  getProfileDataFromKyc: jest.fn(async (userId: string) => {
    if (userId === 'user-with-kyc') {
      return {
        success: true,
        data: {
          name: 'John Doe',
          nationality: 'US',
        },
      };
    }
    if (userId === 'user-without-kyc') {
      return {
        success: false,
        error: { code: 'KYC_NOT_APPROVED', message: 'KYC verification not approved' },
      };
    }
    return {
      success: false,
      error: { code: 'KYC_NOT_FOUND', message: 'KYC verification not found' },
    };
  }),
};

// Mock the employer profile repository
jest.unstable_mockModule(resolveModule('src/repositories/employer-profile-repository.ts'), () => ({
  employerProfileRepository: mockProfileRepo,
  EmployerProfileRepository: jest.fn(),
  EmployerProfileEntity: {} as EmployerProfileEntity,
}));

// Mock the didit-kyc-service
jest.unstable_mockModule(resolveModule('src/services/didit-kyc-service.ts'), () => ({
  getProfileDataFromKyc: mockKycService.getProfileDataFromKyc,
}));

// Import after mocking
const {
  createEmployerProfile,
  createEmployerProfileFromKyc,
  getEmployerProfileByUserId,
  updateEmployerProfile,
} = await import('../../services/employer-profile-service.js');

// Custom arbitraries for property-based testing
const validCompanyNameArbitrary = () =>
  fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length >= 1);

const validDescriptionArbitrary = () =>
  fc.string({ minLength: 10, maxLength: 1000 }).filter(s => s.trim().length >= 10);

const validIndustryArbitrary = () =>
  fc.constantFrom('Technology', 'Finance', 'Healthcare', 'Education', 'Retail', 'Manufacturing');

const validCreateProfileInputArbitrary = () =>
  fc.record({
    companyName: validCompanyNameArbitrary(),
    description: validDescriptionArbitrary(),
    industry: validIndustryArbitrary(),
  });

describe('Employer Profile Service', () => {
  beforeEach(() => {
    mockProfileRepo.clear();
    jest.clearAllMocks();
  });

  describe('createEmployerProfile', () => {
    it('should create a new employer profile successfully', async () => {
      const userId = createTestUser().id;
      const input = {
        companyName: 'Tech Corp',
        description: 'A leading technology company',
        industry: 'Technology',
      };

      const result = await createEmployerProfile(userId, input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBe(userId);
        expect(result.data.companyName).toBe(input.companyName);
        expect(result.data.description).toBe(input.description);
        expect(result.data.industry).toBe(input.industry);
        expect(result.data.id).toBeDefined();
      }
    });

    it('should fail when profile already exists for user', async () => {
      const userId = createTestUser().id;
      const input = {
        companyName: 'Tech Corp',
        description: 'A leading technology company',
        industry: 'Technology',
      };

      // Create first profile
      await createEmployerProfile(userId, input);

      // Try to create second profile for same user
      const result = await createEmployerProfile(userId, input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROFILE_EXISTS');
        expect(result.error.message).toContain('already exists');
      }
    });

    it('should create profiles with different valid inputs (property-based)', async () => {
      await fc.assert(
        fc.asyncProperty(validCreateProfileInputArbitrary(), async (input) => {
          const userId = createTestUser().id;

          const result = await createEmployerProfile(userId, input);

          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.companyName).toBe(input.companyName);
            expect(result.data.description).toBe(input.description);
            expect(result.data.industry).toBe(input.industry);
          }

          mockProfileRepo.clear();
        }),
        { numRuns: 20 }
      );
    });

    it('should handle special characters in company name', async () => {
      const userId = createTestUser().id;
      const input = {
        companyName: 'Tech & Co. (Pty) Ltd.',
        description: 'A company with special characters in name',
        industry: 'Technology',
      };

      const result = await createEmployerProfile(userId, input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.companyName).toBe(input.companyName);
      }
    });
  });

  describe('createEmployerProfileFromKyc', () => {
    it('should create profile with KYC data successfully', async () => {
      const userId = 'user-with-kyc';
      const input = {
        companyName: 'My Company',
        description: 'Custom description',
        industry: 'Finance',
      };

      const result = await createEmployerProfileFromKyc(userId, input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBe(userId);
        expect(result.data.name).toBe('John Doe');
        expect(result.data.nationality).toBe('US');
        expect(result.data.companyName).toBe(input.companyName);
        expect(result.data.description).toBe(input.description);
        expect(result.data.industry).toBe(input.industry);
      }
    });

    it('should create profile with default values when input is empty', async () => {
      const userId = 'user-with-kyc';

      const result = await createEmployerProfileFromKyc(userId, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('John Doe');
        expect(result.data.nationality).toBe('US');
        expect(result.data.companyName).toBe('John Doe'); // Uses KYC name as default
        expect(result.data.description).toContain('Verified employer');
        expect(result.data.industry).toBe('Technology'); // Default industry
      }
    });

    it('should fail when KYC is not approved', async () => {
      const userId = 'user-without-kyc';
      const input = {
        companyName: 'My Company',
        description: 'Custom description',
        industry: 'Finance',
      };

      const result = await createEmployerProfileFromKyc(userId, input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('KYC_NOT_APPROVED');
        expect(result.error.message).toContain('KYC');
      }
    });

    it('should fail when profile already exists', async () => {
      const userId = 'user-with-kyc';

      // Create first profile
      await createEmployerProfileFromKyc(userId, {});

      // Try to create second profile
      const result = await createEmployerProfileFromKyc(userId, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROFILE_EXISTS');
      }
    });

    it('should handle partial input with KYC data', async () => {
      const userId = 'user-with-kyc';
      const input = {
        companyName: 'Custom Company',
        // description and industry will use defaults
      };

      const result = await createEmployerProfileFromKyc(userId, input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.companyName).toBe('Custom Company');
        expect(result.data.description).toContain('Verified employer');
        expect(result.data.industry).toBe('Technology');
      }
    });
  });

  describe('getEmployerProfileByUserId', () => {
    it('should retrieve existing profile successfully', async () => {
      const userId = createTestUser().id;
      const input = {
        companyName: 'Tech Corp',
        description: 'A leading technology company',
        industry: 'Technology',
      };

      // Create profile first
      await createEmployerProfile(userId, input);

      // Retrieve it
      const result = await getEmployerProfileByUserId(userId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBe(userId);
        expect(result.data.companyName).toBe(input.companyName);
      }
    });

    it('should fail when profile does not exist', async () => {
      const userId = createTestUser().id;

      const result = await getEmployerProfileByUserId(userId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROFILE_NOT_FOUND');
        expect(result.error.message).toContain('not found');
      }
    });

    it('should retrieve correct profile for multiple users', async () => {
      const userId1 = createTestUser().id;
      const userId2 = createTestUser().id;

      await createEmployerProfile(userId1, {
        companyName: 'Company 1',
        description: 'First company',
        industry: 'Technology',
      });

      await createEmployerProfile(userId2, {
        companyName: 'Company 2',
        description: 'Second company',
        industry: 'Finance',
      });

      const result1 = await getEmployerProfileByUserId(userId1);
      const result2 = await getEmployerProfileByUserId(userId2);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      if (result1.success && result2.success) {
        expect(result1.data.companyName).toBe('Company 1');
        expect(result2.data.companyName).toBe('Company 2');
      }
    });
  });

  describe('updateEmployerProfile', () => {
    it('should update profile successfully', async () => {
      const userId = createTestUser().id;

      // Create profile
      await createEmployerProfile(userId, {
        companyName: 'Old Company',
        description: 'Old description',
        industry: 'Technology',
      });

      // Update profile
      const result = await updateEmployerProfile(userId, {
        companyName: 'New Company',
        description: 'New description',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.companyName).toBe('New Company');
        expect(result.data.description).toBe('New description');
        expect(result.data.industry).toBe('Technology'); // Unchanged
      }
    });

    it('should update only specified fields', async () => {
      const userId = createTestUser().id;

      await createEmployerProfile(userId, {
        companyName: 'Tech Corp',
        description: 'Original description',
        industry: 'Technology',
      });

      // Update only company name
      const result = await updateEmployerProfile(userId, {
        companyName: 'New Tech Corp',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.companyName).toBe('New Tech Corp');
        expect(result.data.description).toBe('Original description');
        expect(result.data.industry).toBe('Technology');
      }
    });

    it('should fail when profile does not exist', async () => {
      const userId = createTestUser().id;

      const result = await updateEmployerProfile(userId, {
        companyName: 'New Company',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROFILE_NOT_FOUND');
      }
    });

    it('should handle empty update object', async () => {
      const userId = createTestUser().id;

      await createEmployerProfile(userId, {
        companyName: 'Tech Corp',
        description: 'Original description',
        industry: 'Technology',
      });

      const result = await updateEmployerProfile(userId, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.companyName).toBe('Tech Corp');
        expect(result.data.description).toBe('Original description');
      }
    });

    it('should update all fields when all are provided', async () => {
      const userId = createTestUser().id;

      await createEmployerProfile(userId, {
        companyName: 'Old Company',
        description: 'Old description',
        industry: 'Technology',
      });

      const result = await updateEmployerProfile(userId, {
        companyName: 'New Company',
        description: 'New description',
        industry: 'Finance',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.companyName).toBe('New Company');
        expect(result.data.description).toBe('New description');
        expect(result.data.industry).toBe('Finance');
      }
    });

    it('should handle multiple sequential updates', async () => {
      const userId = createTestUser().id;

      await createEmployerProfile(userId, {
        companyName: 'Company v1',
        description: 'Description v1',
        industry: 'Technology',
      });

      await updateEmployerProfile(userId, { companyName: 'Company v2' });
      await updateEmployerProfile(userId, { description: 'Description v2' });
      const result = await updateEmployerProfile(userId, { industry: 'Finance' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.companyName).toBe('Company v2');
        expect(result.data.description).toBe('Description v2');
        expect(result.data.industry).toBe('Finance');
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle very long company names', async () => {
      const userId = createTestUser().id;
      const longName = 'A'.repeat(200);

      const result = await createEmployerProfile(userId, {
        companyName: longName,
        description: 'A company with a very long name',
        industry: 'Technology',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.companyName).toBe(longName);
      }
    });

    it('should handle very long descriptions', async () => {
      const userId = createTestUser().id;
      const longDescription = 'Description '.repeat(100);

      const result = await createEmployerProfile(userId, {
        companyName: 'Tech Corp',
        description: longDescription,
        industry: 'Technology',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe(longDescription);
      }
    });

    it('should handle unicode characters in company name', async () => {
      const userId = createTestUser().id;

      const result = await createEmployerProfile(userId, {
        companyName: '科技公司 🚀',
        description: 'Company with unicode characters',
        industry: 'Technology',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.companyName).toBe('科技公司 🚀');
      }
    });
  });
});
