import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import { ContractEntity } from '../../repositories/contract-repository';
import { ProjectEntity } from '../../repositories/project-repository';
import { BlockchainRating } from '../reputation-contract';

// In-memory stores for testing - using entity types
let contractStore: Map<string, ContractEntity> = new Map();
let projectStore: Map<string, ProjectEntity> = new Map();

// Mock the repositories before importing services
jest.unstable_mockModule('../../repositories/contract-repository.js', () => ({
  contractRepository: {
    getContractById: jest.fn(async (id: string) => {
      return contractStore.get(id) ?? null;
    }),
    getUserContracts: jest.fn(async (userId: string) => {
      const contracts: ContractEntity[] = [];
      for (const contract of contractStore.values()) {
        if (contract.freelancer_id === userId || contract.employer_id === userId) {
          contracts.push(contract);
        }
      }
      return { items: contracts, hasMore: false };
    }),
  },
  ContractRepository: jest.fn(),
  ContractEntity: {} as ContractEntity,
}));

jest.unstable_mockModule('../../repositories/project-repository.js', () => ({
  projectRepository: {
    getProjectById: jest.fn(async (projectId: string) => {
      return projectStore.get(projectId) ?? null;
    }),
  },
  ProjectRepository: jest.fn(),
  ProjectEntity: {} as ProjectEntity,
}));

// Mock notification service
jest.unstable_mockModule('../notification-service.js', () => ({
  notifyRatingReceived: jest.fn(async () => ({ success: true, data: {} })),
}));

// Import after mocking
const {
  submitRating,
  serializeReputationRecord,
  deserializeReputationRecord,
} = await import('../reputation-service.js');

const {
  clearBlockchainRatings,
  computeAggregateScore,
} = await import('../reputation-contract.js');


// Helper to generate IDs
function generateTestId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Custom arbitraries for property-based testing
const validRatingArbitrary = () => fc.integer({ min: 1, max: 5 });

const invalidRatingArbitrary = () =>
  fc.oneof(
    fc.integer({ max: 0 }),
    fc.integer({ min: 6 }),
    fc.double({ min: 1.1, max: 4.9 }) // Non-integer values
  );

// Generates contract entities with snake_case properties
const validContractEntityArbitrary = () =>
  fc.record({
    id: fc.uuid(),
    project_id: fc.uuid(),
    proposal_id: fc.uuid(),
    freelancer_id: fc.uuid(),
    employer_id: fc.uuid(),
    escrow_address: fc.hexaString({ minLength: 40, maxLength: 40 }).map(s => '0x' + s),
    total_amount: fc.integer({ min: 100, max: 100000 }),
    status: fc.constant('completed' as const),
    created_at: fc.date().map(d => d.toISOString()),
    updated_at: fc.date().map(d => d.toISOString()),
  });



// Helper to create a blockchain rating with specific timestamp
function createRatingWithTimestamp(
  rating: number,
  timestamp: number,
  rateeId: string = generateTestId()
): BlockchainRating {
  return {
    id: generateTestId(),
    contractId: generateTestId(),
    raterId: generateTestId(),
    rateeId,
    rating,
    timestamp,
    transactionHash: '0x' + generateTestId(),
  };
}

describe('Reputation Service - Property Tests', () => {
  beforeEach(() => {
    contractStore.clear();
    projectStore.clear();
    clearBlockchainRatings();
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 22: Rating validation bounds**
   * **Validates: Requirements 7.4**
   *
   * For any rating submission, the rating value must be between 1 and 5 inclusive;
   * values outside this range shall be rejected.
   */
  describe('Property 22: Rating validation bounds', () => {
    it('should accept ratings between 1 and 5 inclusive', async () => {
      await fc.assert(
        fc.asyncProperty(
          validContractEntityArbitrary(),
          validRatingArbitrary(),
          async (contractData, rating) => {
            // Clear stores
            contractStore.clear();
            projectStore.clear();
            clearBlockchainRatings();

            // Set up contract
            const contract: ContractEntity = contractData;
            contractStore.set(contract.id, contract);

            // Set up project
            const now = new Date().toISOString();
            const project: ProjectEntity = {
              id: contract.project_id,
              employer_id: contract.employer_id,
              title: 'Test Project',
              description: 'Test Description',
              required_skills: [],
              budget: 1000,
              deadline: now,
              status: 'completed',
              milestones: [],
              created_at: now,
              updated_at: now,
            };
            projectStore.set(project.id, project);

            // Submit rating from employer to freelancer
            const result = await submitRating({
              contractId: contract.id,
              raterId: contract.employer_id,
              rateeId: contract.freelancer_id,
              rating,
            });

            // Should succeed for valid ratings
            expect(result.success).toBe(true);
            if (result.success) {
              expect(result.data.rating.rating).toBe(rating);
              expect(result.data.rating.rating).toBeGreaterThanOrEqual(1);
              expect(result.data.rating.rating).toBeLessThanOrEqual(5);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject ratings outside 1-5 range', async () => {
      await fc.assert(
        fc.asyncProperty(
          validContractEntityArbitrary(),
          invalidRatingArbitrary(),
          async (contractData, invalidRating) => {
            // Clear stores
            contractStore.clear();
            projectStore.clear();
            clearBlockchainRatings();

            // Set up contract
            const contract: ContractEntity = contractData;
            contractStore.set(contract.id, contract);

            // Submit invalid rating
            const result = await submitRating({
              contractId: contract.id,
              raterId: contract.employer_id,
              rateeId: contract.freelancer_id,
              rating: invalidRating,
            });

            // Should fail for invalid ratings
            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.error.code).toBe('INVALID_RATING');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 23: Reputation time decay weighting**
   * **Validates: Requirements 7.5**
   *
   * For any user with multiple ratings, more recent ratings shall have higher weight
   * in the computed reputation score than older ratings.
   */
  describe('Property 23: Reputation time decay weighting', () => {
    it('should weight recent ratings higher than older ratings', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }), // old rating
          fc.integer({ min: 1, max: 5 }), // new rating
          async (oldRating, newRating) => {
            // Skip if ratings are equal (no way to distinguish weighting)
            if (oldRating === newRating) return;

            const userId = generateTestId();
            const now = Date.now();
            const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

            // Create ratings with different timestamps
            const oldRatingRecord = createRatingWithTimestamp(oldRating, oneYearAgo, userId);
            const newRatingRecord = createRatingWithTimestamp(newRating, now, userId);

            const ratings = [oldRatingRecord, newRatingRecord];

            // Compute score with time decay
            const scoreWithDecay = computeAggregateScore(ratings, 0.01);

            // Compute simple average (no decay)
            const simpleAverage = (oldRating + newRating) / 2;

            // The score with decay should be closer to the new rating than the simple average
            // because recent ratings have higher weight
            const distanceToNewWithDecay = Math.abs(scoreWithDecay - newRating);
            const distanceToNewSimple = Math.abs(simpleAverage - newRating);

            // With time decay, the score should be closer to the recent rating
            expect(distanceToNewWithDecay).toBeLessThanOrEqual(distanceToNewSimple + 0.01);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce higher score when recent ratings are higher', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }), // low old rating
          fc.integer({ min: 4, max: 5 }), // high new rating
          async (lowOldRating, highNewRating) => {
            const userId = generateTestId();
            const now = Date.now();
            const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

            // Scenario 1: Low rating is old, high rating is recent
            const scenario1Ratings = [
              createRatingWithTimestamp(lowOldRating, oneYearAgo, userId),
              createRatingWithTimestamp(highNewRating, now, userId),
            ];

            // Scenario 2: High rating is old, low rating is recent
            const scenario2Ratings = [
              createRatingWithTimestamp(highNewRating, oneYearAgo, userId),
              createRatingWithTimestamp(lowOldRating, now, userId),
            ];

            const score1 = computeAggregateScore(scenario1Ratings, 0.01);
            const score2 = computeAggregateScore(scenario2Ratings, 0.01);

            // Score should be higher when the high rating is recent
            expect(score1).toBeGreaterThan(score2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 24: Reputation record serialization round-trip**
   * **Validates: Requirements 7.6, 7.7**
   *
   * For any valid reputation record object, serializing to JSON and deserializing back
   * shall produce an equivalent object.
   */
  describe('Property 24: Reputation record serialization round-trip', () => {
    it('should preserve all fields through serialization round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            id: fc.uuid(),
            contractId: fc.uuid(),
            raterId: fc.uuid(),
            rateeId: fc.uuid(),
            rating: fc.integer({ min: 1, max: 5 }),
            comment: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
            timestamp: fc.integer({ min: 0, max: Date.now() }),
            transactionHash: fc.hexaString({ minLength: 64, maxLength: 64 }).map(s => '0x' + s),
          }),
          async (ratingRecord) => {
            const original: BlockchainRating = ratingRecord;

            // Serialize to JSON string
            const serialized = serializeReputationRecord(original);

            // Verify it's a valid JSON string
            expect(typeof serialized).toBe('string');
            expect(() => JSON.parse(serialized)).not.toThrow();

            // Deserialize back to object
            const deserialized = deserializeReputationRecord(serialized);

            // Verify all fields are preserved
            expect(deserialized.id).toBe(original.id);
            expect(deserialized.contractId).toBe(original.contractId);
            expect(deserialized.raterId).toBe(original.raterId);
            expect(deserialized.rateeId).toBe(original.rateeId);
            expect(deserialized.rating).toBe(original.rating);
            expect(deserialized.comment).toBe(original.comment);
            expect(deserialized.timestamp).toBe(original.timestamp);
            expect(deserialized.transactionHash).toBe(original.transactionHash);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle records with and without comments', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.uuid(),
          fc.integer({ min: 1, max: 5 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (hasComment, id, rating, commentText) => {
            const original: BlockchainRating = {
              id,
              contractId: generateTestId(),
              raterId: generateTestId(),
              rateeId: generateTestId(),
              rating,
              comment: hasComment ? commentText : undefined,
              timestamp: Date.now(),
              transactionHash: '0x' + generateTestId(),
            };

            const serialized = serializeReputationRecord(original);
            const deserialized = deserializeReputationRecord(serialized);

            expect(deserialized.comment).toBe(original.comment);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 25: Reputation score computation**
   * **Validates: Requirements 7.3**
   *
   * For any user with ratings, the computed reputation score shall be the weighted
   * average of all ratings using time decay.
   */
  describe('Property 25: Reputation score computation', () => {
    it('should compute weighted average with time decay', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 10 }),
          async (ratings) => {
            const userId = generateTestId();
            const now = Date.now();
            const decayLambda = 0.01;

            // Create ratings with varying timestamps (spread over past year)
            const ratingRecords = ratings.map((rating, index) => {
              const daysAgo = index * 30; // Each rating 30 days apart
              const timestamp = now - daysAgo * 24 * 60 * 60 * 1000;
              return createRatingWithTimestamp(rating, timestamp, userId);
            });

            // Compute score using the function
            const computedScore = computeAggregateScore(ratingRecords, decayLambda);

            // Manually compute expected weighted average
            let weightedSum = 0;
            let totalWeight = 0;
            for (const record of ratingRecords) {
              const ageInMs = now - record.timestamp;
              const ageInDays = ageInMs / (1000 * 60 * 60 * 24);
              const weight = Math.exp(-decayLambda * ageInDays);
              weightedSum += record.rating * weight;
              totalWeight += weight;
            }
            const expectedScore = Math.round((weightedSum / totalWeight) * 100) / 100;

            // Scores should match
            expect(computedScore).toBeCloseTo(expectedScore, 2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0 for users with no ratings', async () => {
      const score = computeAggregateScore([], 0.01);
      expect(score).toBe(0);
    });

    it('should return exact rating for single rating', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (rating) => {
            const userId = generateTestId();
            const ratingRecord = createRatingWithTimestamp(rating, Date.now(), userId);

            const score = computeAggregateScore([ratingRecord], 0.01);

            // Single rating should return that rating value
            expect(score).toBe(rating);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should bound score between 1 and 5', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 20 }),
          async (ratings) => {
            const userId = generateTestId();
            const now = Date.now();

            const ratingRecords = ratings.map((rating, index) => {
              const timestamp = now - index * 24 * 60 * 60 * 1000;
              return createRatingWithTimestamp(rating, timestamp, userId);
            });

            const score = computeAggregateScore(ratingRecords, 0.01);

            // Score should always be between 1 and 5
            expect(score).toBeGreaterThanOrEqual(1);
            expect(score).toBeLessThanOrEqual(5);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
