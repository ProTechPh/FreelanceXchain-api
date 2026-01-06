import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import {
  serializeAIRequest,
  deserializeAIRequest,
  serializeAIResponse,
  deserializeAIResponse,
  keywordMatchSkills,
  keywordExtractSkills,
} from '../ai-client.js';
import {
  SkillMatchRequest,
  SkillExtractionRequest,
  SkillMatchResult,
  ExtractedSkill,
  SkillGapAnalysis,
  SkillInfo,
} from '../ai-types.js';

// Custom arbitraries for property-based testing

const skillInfoArbitrary = () =>
  fc.record({
    skillId: fc.uuid(),
    skillName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    categoryId: fc.oneof(fc.uuid(), fc.constant(undefined)),
    yearsOfExperience: fc.oneof(fc.integer({ min: 0, max: 30 }), fc.constant(undefined)),
  }) as fc.Arbitrary<SkillInfo>;

const skillMatchRequestArbitrary = () =>
  fc.record({
    freelancerSkills: fc.array(skillInfoArbitrary(), { minLength: 0, maxLength: 10 }),
    projectRequirements: fc.array(skillInfoArbitrary(), { minLength: 0, maxLength: 10 }),
    reputationScore: fc.oneof(fc.integer({ min: 0, max: 100 }), fc.constant(undefined)),
  }) as fc.Arbitrary<SkillMatchRequest>;

const skillExtractionRequestArbitrary = (): fc.Arbitrary<SkillExtractionRequest> =>
  fc.record({
    text: fc.string({ minLength: 1, maxLength: 500 }),
    availableSkills: fc.array(skillInfoArbitrary(), { minLength: 0, maxLength: 20 }),
  });

const skillGapPayloadArbitrary = () =>
  fc.record({
    freelancerSkills: fc.array(skillInfoArbitrary(), { minLength: 0, maxLength: 10 }),
  });

const skillMatchResultArbitrary = (): fc.Arbitrary<SkillMatchResult> =>
  fc.record({
    matchScore: fc.integer({ min: 0, max: 100 }),
    matchedSkills: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 10 }),
    missingSkills: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 10 }),
    reasoning: fc.string({ minLength: 0, maxLength: 200 }),
  });

const extractedSkillArbitrary = (): fc.Arbitrary<ExtractedSkill> =>
  fc.record({
    skillId: fc.uuid(),
    skillName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  });


const skillGapAnalysisArbitrary = (): fc.Arbitrary<SkillGapAnalysis> =>
  fc.record({
    currentSkills: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 10 }),
    recommendedSkills: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 10 }),
    marketDemand: fc.array(
      fc.record({
        skillName: fc.string({ minLength: 1, maxLength: 50 }),
        demandLevel: fc.constantFrom('high', 'medium', 'low') as fc.Arbitrary<'high' | 'medium' | 'low'>,
      }),
      { minLength: 0, maxLength: 10 }
    ),
    reasoning: fc.string({ minLength: 0, maxLength: 200 }),
  });

describe('AI Client - AI Serialization Properties', () => {
  /**
   * **Feature: blockchain-freelance-marketplace, Property 12: AI request/response serialization round-trip**
   * **Validates: Requirements 4.1.5, 4.1.6**
   * 
   * For any valid AI matching request object, serializing to JSON and 
   * deserializing back shall produce an equivalent object.
   */
  describe('Property 12: AI request/response serialization round-trip', () => {
    it('should round-trip skill_match requests correctly', () => {
      fc.assert(
        fc.property(
          skillMatchRequestArbitrary(),
          (payload: SkillMatchRequest) => {
            // Serialize
            const serialized = serializeAIRequest('skill_match', payload);
            
            // Deserialize
            const deserialized = deserializeAIRequest(serialized);
            
            // Should not be null
            expect(deserialized).not.toBeNull();
            
            if (deserialized) {
              // Type should match
              expect(deserialized.type).toBe('skill_match');
              
              // Payload should be equivalent
              const deserializedPayload = deserialized.payload as SkillMatchRequest;
              expect(deserializedPayload.freelancerSkills).toEqual(payload.freelancerSkills);
              expect(deserializedPayload.projectRequirements).toEqual(payload.projectRequirements);
              expect(deserializedPayload.reputationScore).toEqual(payload.reputationScore);
              
              // Timestamp and requestId should be present
              expect(deserialized.timestamp).toBeDefined();
              expect(deserialized.requestId).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should round-trip skill_extraction requests correctly', () => {
      fc.assert(
        fc.property(
          skillExtractionRequestArbitrary(),
          (payload: SkillExtractionRequest) => {
            // Serialize
            const serialized = serializeAIRequest('skill_extraction', payload);
            
            // Deserialize
            const deserialized = deserializeAIRequest(serialized);
            
            // Should not be null
            expect(deserialized).not.toBeNull();
            
            if (deserialized) {
              // Type should match
              expect(deserialized.type).toBe('skill_extraction');
              
              // Payload should be equivalent
              const deserializedPayload = deserialized.payload as SkillExtractionRequest;
              expect(deserializedPayload.text).toEqual(payload.text);
              expect(deserializedPayload.availableSkills).toEqual(payload.availableSkills);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should round-trip skill_gap requests correctly', () => {
      fc.assert(
        fc.property(
          skillGapPayloadArbitrary(),
          (payload) => {
            // Serialize
            const serialized = serializeAIRequest('skill_gap', payload);
            
            // Deserialize
            const deserialized = deserializeAIRequest(serialized);
            
            // Should not be null
            expect(deserialized).not.toBeNull();
            
            if (deserialized) {
              // Type should match
              expect(deserialized.type).toBe('skill_gap');
              
              // Payload should be equivalent
              expect(deserialized.payload).toEqual(payload);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should round-trip skill_match responses correctly', () => {
      fc.assert(
        fc.property(
          skillMatchResultArbitrary(),
          fc.integer({ min: 0, max: 10000 }),
          (payload: SkillMatchResult, processingTimeMs: number) => {
            // Serialize
            const serialized = serializeAIResponse('skill_match', payload, processingTimeMs);
            
            // Deserialize
            const deserialized = deserializeAIResponse(serialized);
            
            // Should not be null
            expect(deserialized).not.toBeNull();
            
            if (deserialized) {
              // Type should match
              expect(deserialized.type).toBe('skill_match');
              
              // Payload should be equivalent
              const deserializedPayload = deserialized.payload as SkillMatchResult;
              expect(deserializedPayload.matchScore).toEqual(payload.matchScore);
              expect(deserializedPayload.matchedSkills).toEqual(payload.matchedSkills);
              expect(deserializedPayload.missingSkills).toEqual(payload.missingSkills);
              expect(deserializedPayload.reasoning).toEqual(payload.reasoning);
              
              // Processing time should match
              expect(deserialized.processingTimeMs).toBe(processingTimeMs);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should round-trip skill_extraction responses correctly', () => {
      fc.assert(
        fc.property(
          fc.array(extractedSkillArbitrary(), { minLength: 0, maxLength: 10 }),
          fc.integer({ min: 0, max: 10000 }),
          (payload: ExtractedSkill[], processingTimeMs: number) => {
            // Serialize
            const serialized = serializeAIResponse('skill_extraction', payload, processingTimeMs);
            
            // Deserialize
            const deserialized = deserializeAIResponse(serialized);
            
            // Should not be null
            expect(deserialized).not.toBeNull();
            
            if (deserialized) {
              // Type should match
              expect(deserialized.type).toBe('skill_extraction');
              
              // Payload should be equivalent
              expect(deserialized.payload).toEqual(payload);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should round-trip skill_gap responses correctly', () => {
      fc.assert(
        fc.property(
          skillGapAnalysisArbitrary(),
          fc.integer({ min: 0, max: 10000 }),
          (payload: SkillGapAnalysis, processingTimeMs: number) => {
            // Serialize
            const serialized = serializeAIResponse('skill_gap', payload, processingTimeMs);
            
            // Deserialize
            const deserialized = deserializeAIResponse(serialized);
            
            // Should not be null
            expect(deserialized).not.toBeNull();
            
            if (deserialized) {
              // Type should match
              expect(deserialized.type).toBe('skill_gap');
              
              // Payload should be equivalent
              expect(deserialized.payload).toEqual(payload);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null for invalid JSON', () => {
      const invalidInputs = [
        'not json',
        '{"incomplete": ',
        '',
        '[]',
        'null',
        '{"type": "skill_match"}', // missing payload
        '{"payload": {}}', // missing type
      ];

      for (const input of invalidInputs) {
        expect(deserializeAIRequest(input)).toBeNull();
        expect(deserializeAIResponse(input)).toBeNull();
      }
    });
  });
});


describe('AI Client - Keyword Fallback Functions', () => {
  describe('keywordMatchSkills', () => {
    it('should calculate correct match score based on skill overlap', () => {
      fc.assert(
        fc.property(
          fc.array(skillInfoArbitrary(), { minLength: 1, maxLength: 5 }),
          (skills: SkillInfo[]) => {
            // Use same skills for both freelancer and project
            const result = keywordMatchSkills(skills, skills);
            
            // Perfect match should give 100%
            expect(result.matchScore).toBe(100);
            expect(result.matchedSkills.length).toBe(skills.length);
            expect(result.missingSkills.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return 0 score when no skills match', () => {
      const freelancerSkills: SkillInfo[] = [
        { skillId: 'skill-1', skillName: 'JavaScript' },
        { skillId: 'skill-2', skillName: 'TypeScript' },
      ];
      const projectRequirements: SkillInfo[] = [
        { skillId: 'skill-3', skillName: 'Python' },
        { skillId: 'skill-4', skillName: 'Java' },
      ];

      const result = keywordMatchSkills(freelancerSkills, projectRequirements);
      
      expect(result.matchScore).toBe(0);
      expect(result.matchedSkills.length).toBe(0);
      expect(result.missingSkills.length).toBe(2);
    });

    it('should handle empty project requirements', () => {
      const freelancerSkills: SkillInfo[] = [
        { skillId: 'skill-1', skillName: 'JavaScript' },
      ];

      const result = keywordMatchSkills(freelancerSkills, []);
      
      expect(result.matchScore).toBe(0);
      expect(result.matchedSkills.length).toBe(0);
      expect(result.missingSkills.length).toBe(0);
    });
  });

  describe('keywordExtractSkills', () => {
    it('should extract skills that appear in text', () => {
      const text = 'I have experience with JavaScript and TypeScript development';
      const availableSkills: SkillInfo[] = [
        { skillId: 'skill-1', skillName: 'JavaScript' },
        { skillId: 'skill-2', skillName: 'TypeScript' },
        { skillId: 'skill-3', skillName: 'Python' },
      ];

      const result = keywordExtractSkills(text, availableSkills);
      
      expect(result.length).toBe(2);
      expect(result.map(s => s.skillName)).toContain('JavaScript');
      expect(result.map(s => s.skillName)).toContain('TypeScript');
      expect(result.map(s => s.skillName)).not.toContain('Python');
    });

    it('should be case-insensitive', () => {
      const text = 'I know JAVASCRIPT and typescript';
      const availableSkills: SkillInfo[] = [
        { skillId: 'skill-1', skillName: 'JavaScript' },
        { skillId: 'skill-2', skillName: 'TypeScript' },
      ];

      const result = keywordExtractSkills(text, availableSkills);
      
      expect(result.length).toBe(2);
    });

    it('should return empty array when no skills match', () => {
      const text = 'I have no relevant skills';
      const availableSkills: SkillInfo[] = [
        { skillId: 'skill-1', skillName: 'JavaScript' },
        { skillId: 'skill-2', skillName: 'TypeScript' },
      ];

      const result = keywordExtractSkills(text, availableSkills);
      
      expect(result.length).toBe(0);
    });

    it('should assign higher confidence to exact word matches', () => {
      const text = 'JavaScript is great';
      const availableSkills: SkillInfo[] = [
        { skillId: 'skill-1', skillName: 'JavaScript' },
      ];

      const result = keywordExtractSkills(text, availableSkills);
      
      expect(result.length).toBe(1);
      expect(result[0]?.confidence).toBe(0.9); // Exact match
    });
  });
});


describe('AI Client - Skill Extraction Properties', () => {
  /**
   * **Feature: blockchain-freelance-marketplace, Property 13: Extracted skill taxonomy mapping**
   * **Validates: Requirements 4.1.2**
   * 
   * For any skill extracted by AI, if the skill name matches an entry in the 
   * skill taxonomy, it shall be mapped to the correct taxonomy skill ID.
   */
  describe('Property 13: Extracted skill taxonomy mapping', () => {
    it('should map extracted skills to correct taxonomy IDs', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              skillId: fc.uuid(),
              skillName: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (availableSkills) => {
            // Create text that contains some of the skill names
            const skillsToInclude = availableSkills.slice(0, Math.ceil(availableSkills.length / 2));
            const text = skillsToInclude.map(s => `I have experience with ${s.skillName}`).join('. ');
            
            // Extract skills using keyword fallback
            const extracted = keywordExtractSkills(text, availableSkills);
            
            // All extracted skills should have valid taxonomy IDs
            for (const skill of extracted) {
              const taxonomySkill = availableSkills.find(s => s.skillId === skill.skillId);
              expect(taxonomySkill).toBeDefined();
              
              // Skill name should match
              if (taxonomySkill) {
                expect(skill.skillName).toBe(taxonomySkill.skillName);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not extract skills that are not in taxonomy', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              skillId: fc.uuid(),
              skillName: fc.constantFrom('JavaScript', 'TypeScript', 'Python', 'Java', 'React'),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (availableSkills) => {
            // Text with skills NOT in taxonomy
            const text = 'I know Haskell, Erlang, and Prolog very well';
            
            // Extract skills
            const extracted = keywordExtractSkills(text, availableSkills);
            
            // Should not extract any skills since none match
            expect(extracted.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should assign confidence scores between 0 and 1', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              skillId: fc.uuid(),
              skillName: fc.constantFrom('JavaScript', 'TypeScript', 'Python', 'Java', 'React'),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (availableSkills) => {
            const text = 'I have extensive experience with JavaScript and TypeScript development';
            
            const extracted = keywordExtractSkills(text, availableSkills);
            
            // All confidence scores should be between 0 and 1
            for (const skill of extracted) {
              expect(skill.confidence).toBeGreaterThanOrEqual(0);
              expect(skill.confidence).toBeLessThanOrEqual(1);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should extract skills regardless of case in text', () => {
      const availableSkills: SkillInfo[] = [
        { skillId: 'skill-1', skillName: 'JavaScript' },
        { skillId: 'skill-2', skillName: 'TypeScript' },
      ];

      const variations = [
        'I know JAVASCRIPT and TYPESCRIPT',
        'I know javascript and typescript',
        'I know JavaScript and TypeScript',
        'I know JaVaScRiPt and TyPeScRiPt',
      ];

      for (const text of variations) {
        const extracted = keywordExtractSkills(text, availableSkills);
        expect(extracted.length).toBe(2);
        expect(extracted.map(s => s.skillId).sort()).toEqual(['skill-1', 'skill-2']);
      }
    });
  });
});
