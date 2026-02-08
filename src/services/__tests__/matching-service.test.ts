import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { sortRecommendationsByScore, sortFreelancerRecommendationsByCombinedScore, calculateMatchScore } from '../matching-service.js';
import type { SkillInfo, ProjectRecommendation, FreelancerRecommendation } from '../ai-types.js';
// Custom arbitraries for property-based testing
const skillInfoArbitrary = () =>
  fc.record({
    skillId: fc.uuid(),
    skillName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    categoryId: fc.oneof(fc.uuid(), fc.constant(undefined)),
    yearsOfExperience: fc.oneof(fc.integer({ min: 0, max: 30 }), fc.constant(undefined)),
  }) as fc.Arbitrary<SkillInfo>;
const projectRecommendationArbitrary = () =>
  fc.record({
    projectId: fc.uuid(),
    matchScore: fc.integer({ min: 0, max: 100 }),
    matchedSkills: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
    missingSkills: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
    reasoning: fc.string({ minLength: 0, maxLength: 200 }),
  }) as fc.Arbitrary<ProjectRecommendation>;
const freelancerRecommendationArbitrary = () =>
  fc.record({
    freelancerId: fc.uuid(),
    matchScore: fc.integer({ min: 0, max: 100 }),
    reputationScore: fc.integer({ min: 0, max: 100 }),
    combinedScore: fc.integer({ min: 0, max: 100 }),
    matchedSkills: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
    reasoning: fc.string({ minLength: 0, maxLength: 200 }),
  }) as fc.Arbitrary<FreelancerRecommendation>;
describe('Matching Service - Recommendation Properties', () => {
  /**
   * **Feature: blockchain-freelance-marketplace, Property 10: Recommendation ranking order**
   * **Validates: Requirements 4.1**
   * 
   * For any set of project recommendations returned for a freelancer,
   * the projects shall be sorted by match score in descending order.
   */
  describe('Property 10: Recommendation ranking order', () => {
    it('should sort project recommendations by match score in descending order', () => {
      fc.assert(
        fc.property(
          fc.array(projectRecommendationArbitrary(), { minLength: 0, maxLength: 20 }),
          (recommendations: ProjectRecommendation[]) => {
            // Sort recommendations
            const sorted = sortRecommendationsByScore(recommendations);
            // Verify descending order
            for (let i = 0; i < sorted.length - 1; i++) {
              const current = sorted[i];
              const next = sorted[i + 1];
              if (current && next) {
                expect(current.matchScore).toBeGreaterThanOrEqual(next.matchScore);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should preserve all recommendations after sorting', () => {
      fc.assert(
        fc.property(
          fc.array(projectRecommendationArbitrary(), { minLength: 0, maxLength: 20 }),
          (recommendations: ProjectRecommendation[]) => {
            const sorted = sortRecommendationsByScore(recommendations);
            // Same length
            expect(sorted.length).toBe(recommendations.length);
            // All original items present
            const originalIds = new Set(recommendations.map(r => r.projectId));
            const sortedIds = new Set(sorted.map(r => r.projectId));
            expect(sortedIds).toEqual(originalIds);
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should not modify the original array', () => {
      fc.assert(
        fc.property(
          fc.array(projectRecommendationArbitrary(), { minLength: 1, maxLength: 10 }),
          (recommendations: ProjectRecommendation[]) => {
            const originalOrder = recommendations.map(r => r.projectId);
            sortRecommendationsByScore(recommendations);
            // Original array unchanged
            const afterOrder = recommendations.map(r => r.projectId);
            expect(afterOrder).toEqual(originalOrder);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  /**
   * **Feature: blockchain-freelance-marketplace, Property 11: Freelancer recommendation ranking**
   * **Validates: Requirements 4.5**
   * 
   * For any set of freelancer recommendations returned for a project,
   * the freelancers shall be sorted by combined skill relevance and 
   * reputation score in descending order.
   */
  describe('Property 11: Freelancer recommendation ranking', () => {
    it('should sort freelancer recommendations by combined score in descending order', () => {
      fc.assert(
        fc.property(
          fc.array(freelancerRecommendationArbitrary(), { minLength: 0, maxLength: 20 }),
          (recommendations: FreelancerRecommendation[]) => {
            // Sort recommendations
            const sorted = sortFreelancerRecommendationsByCombinedScore(recommendations);
            // Verify descending order by combined score
            for (let i = 0; i < sorted.length - 1; i++) {
              const current = sorted[i];
              const next = sorted[i + 1];
              if (current && next) {
                expect(current.combinedScore).toBeGreaterThanOrEqual(next.combinedScore);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should preserve all recommendations after sorting', () => {
      fc.assert(
        fc.property(
          fc.array(freelancerRecommendationArbitrary(), { minLength: 0, maxLength: 20 }),
          (recommendations: FreelancerRecommendation[]) => {
            const sorted = sortFreelancerRecommendationsByCombinedScore(recommendations);
            // Same length
            expect(sorted.length).toBe(recommendations.length);
            // All original items present
            const originalIds = new Set(recommendations.map(r => r.freelancerId));
            const sortedIds = new Set(sorted.map(r => r.freelancerId));
            expect(sortedIds).toEqual(originalIds);
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should not modify the original array', () => {
      fc.assert(
        fc.property(
          fc.array(freelancerRecommendationArbitrary(), { minLength: 1, maxLength: 10 }),
          (recommendations: FreelancerRecommendation[]) => {
            const originalOrder = recommendations.map(r => r.freelancerId);
            sortFreelancerRecommendationsByCombinedScore(recommendations);
            // Original array unchanged
            const afterOrder = recommendations.map(r => r.freelancerId);
            expect(afterOrder).toEqual(originalOrder);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
describe('Matching Service - Skill Match Calculation', () => {
  it('should return 100% match when freelancer has all required skills', () => {
    fc.assert(
      fc.property(
        fc.array(skillInfoArbitrary(), { minLength: 1, maxLength: 5 }),
        (skills: SkillInfo[]) => {
          // Freelancer has exactly the required skills
          const result = calculateMatchScore(skills, skills);
          expect(result.matchScore).toBe(100);
          expect(result.matchedSkills.length).toBe(skills.length);
          expect(result.missingSkills.length).toBe(0);
        }
      ),
      { numRuns: 50 }
    );
  });
  it('should return 0% match when freelancer has no matching skills', () => {
    fc.assert(
      fc.property(
        fc.array(skillInfoArbitrary(), { minLength: 1, maxLength: 5 }),
        fc.array(skillInfoArbitrary(), { minLength: 1, maxLength: 5 }),
        (freelancerSkills: SkillInfo[], projectSkills: SkillInfo[]) => {
          // Ensure no overlap by using different skill IDs
          const modifiedProjectSkills = projectSkills.map((s, i) => ({
            ...s,
            skillId: `project-only-${i}`,
            skillName: `ProjectSkill${i}`,
          }));
          const result = calculateMatchScore(freelancerSkills, modifiedProjectSkills);
          expect(result.matchScore).toBe(0);
          expect(result.matchedSkills.length).toBe(0);
          expect(result.missingSkills.length).toBe(modifiedProjectSkills.length);
        }
      ),
      { numRuns: 50 }
    );
  });
  it('should handle empty project requirements', () => {
    fc.assert(
      fc.property(
        fc.array(skillInfoArbitrary(), { minLength: 0, maxLength: 5 }),
        (freelancerSkills: SkillInfo[]) => {
          const result = calculateMatchScore(freelancerSkills, []);
          expect(result.matchScore).toBe(0);
          expect(result.matchedSkills.length).toBe(0);
          expect(result.missingSkills.length).toBe(0);
        }
      ),
      { numRuns: 50 }
    );
  });
  it('should calculate partial match correctly', () => {
    const freelancerSkills: SkillInfo[] = [
      { skillId: 'skill-1', skillName: 'JavaScript' },
      { skillId: 'skill-2', skillName: 'TypeScript' },
    ];
    const projectRequirements: SkillInfo[] = [
      { skillId: 'skill-1', skillName: 'JavaScript' },
      { skillId: 'skill-3', skillName: 'Python' },
    ];
    const result = calculateMatchScore(freelancerSkills, projectRequirements);
    expect(result.matchScore).toBe(50); // 1 out of 2 skills matched
    expect(result.matchedSkills).toContain('JavaScript');
    expect(result.missingSkills).toContain('Python');
  });
});

