import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { 
  createInMemoryStore,
  createMockContractRepository,
  createMockProjectRepository
} from '../helpers/mock-repository-factory.js';
import { 
  createTestContract,
  createTestProject
} from '../helpers/test-data-factory.js';
import { generateId } from '../../utils/id.js';
import { BlockchainRating } from '../../services/reputation-contract.js';

// Create stores and mocks
const contractStore = createInMemoryStore();
const projectStore = createInMemoryStore();

const mockContractRepo = createMockContractRepository(contractStore);
const mockProjectRepo = createMockProjectRepository(projectStore);

// Add getUserContracts method to contract repository mock
mockContractRepo.getUserContracts = jest.fn<any>(async (userId: string) => {
  const contracts = Array.from(contractStore.values())
    .filter((c: any) => c.freelancer_id === userId || c.employer_id === userId);
  return { items: contracts, hasMore: false };
});

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock repositories
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));

// Mock notification service
jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  notifyRatingReceived: jest.fn<any>(async () => ({ success: true, data: {} })),
}));

// Import after mocking
const {
  submitRating,
  serializeReputationRecord,
  deserializeReputationRecord,
} = await import('../../services/reputation-service.js');

const {
  clearBlockchainRatings,
  computeAggregateScore,
} = await import('../../services/reputation-contract.js');

// Helper to create blockchain rating with timestamp
function createRatingWithTimestamp(
  rating: number,
  timestamp: number,
  rateeId: string = generateId()
): BlockchainRating {
  return {
    id: generateId(),
    contractId: generateId(),
    raterId: generateId(),
    rateeId,
    rating,
    timestamp,
    transactionHash: '0x' + generateId().padEnd(64, '0'),
  };
}

// Custom arbitraries
const validRatingArbitrary = () => fc.integer({ min: 1, max: 5 });
const invalidRatingArbitrary = () =>
  fc.oneof(
    fc.integer({ max: 0 }),
    fc.integer({ min: 6 }),
    fc.double({ min: 1.1, max: 4.9 })
  );

describe('Reputation Service - Property-Based Tests', () => {
  beforeEach(async () => {
    contractStore.clear();
    projectStore.clear();
    await clearBlockchainRatings();
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 22: Rating validation bounds**
   * **Validates: Requirements 7.4**
   *
   * For any rating submission, the rating value must be between 1 and 5 inclusive;
   * values outside this range shall be rejected.
   */
  it('Property 22: Rating validation bounds - accept valid ratings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        validRatingArbitrary(),
        async (freelancerId, employerId, rating) => {
          contractStore.clear();
          projectStore.clear();
          await clearBlockchainRatings();

          const project = createTestProject({ employer_id: employerId });
          const contract = createTestContract({
            project_id: project.id,
            freelancer_id: freelancerId,
            employer_id: employerId,
            status: 'completed'
          });

          contractStore.set(contract.id, contract);
          projectStore.set(project.id, project);

          const result = await submitRating({
            contractId: contract.id,
            raterId: employerId,
            rateeId: freelancerId,
            rating,
          });

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

  it('Property 22: Rating validation bounds - reject invalid ratings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        invalidRatingArbitrary(),
        async (freelancerId, employerId, invalidRating) => {
          contractStore.clear();
          projectStore.clear();
          await clearBlockchainRatings();

          const project = createTestProject({ employer_id: employerId });
          const contract = createTestContract({
            project_id: project.id,
            freelancer_id: freelancerId,
            employer_id: employerId,
            status: 'completed'
          });

          contractStore.set(contract.id, contract);
          projectStore.set(project.id, project);

          const result = await submitRating({
            contractId: contract.id,
            raterId: employerId,
            rateeId: freelancerId,
            rating: invalidRating,
          });

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.code).toBe('INVALID_RATING');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 23: Reputation time decay weighting**
   * **Validates: Requirements 7.5**
   *
   * For any user with multiple ratings, more recent ratings shall have higher weight
   * in the computed reputation score than older ratings.
   */
  it('Property 23: Time decay weighting - recent ratings weighted higher', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        async (oldRating, newRating) => {
          if (oldRating === newRating) return;

          const userId = generateId();
          const now = Date.now();
          const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

          const oldRatingRecord = createRatingWithTimestamp(oldRating, oneYearAgo, userId);
          const newRatingRecord = createRatingWithTimestamp(newRating, now, userId);
          const ratings = [oldRatingRecord, newRatingRecord];

          const scoreWithDecay = computeAggregateScore(ratings, 0.01);
          const simpleAverage = (oldRating + newRating) / 2;

          const distanceToNewWithDecay = Math.abs(scoreWithDecay - newRating);
          const distanceToNewSimple = Math.abs(simpleAverage - newRating);

          expect(distanceToNewWithDecay).toBeLessThanOrEqual(distanceToNewSimple + 0.01);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 23: Time decay weighting - higher score when recent ratings are higher', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 4, max: 5 }),
        async (lowOldRating, highNewRating) => {
          const userId = generateId();
          const now = Date.now();
          const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

          const scenario1Ratings = [
            createRatingWithTimestamp(lowOldRating, oneYearAgo, userId),
            createRatingWithTimestamp(highNewRating, now, userId),
          ];

          const scenario2Ratings = [
            createRatingWithTimestamp(highNewRating, oneYearAgo, userId),
            createRatingWithTimestamp(lowOldRating, now, userId),
          ];

          const score1 = computeAggregateScore(scenario1Ratings, 0.01);
          const score2 = computeAggregateScore(scenario2Ratings, 0.01);

          expect(score1).toBeGreaterThan(score2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 24: Reputation record serialization round-trip**
   * **Validates: Requirements 7.6, 7.7**
   *
   * For any valid reputation record object, serializing to JSON and deserializing back
   * shall produce an equivalent object.
   */
  it('Property 24: Serialization round-trip preserves all fields', async () => {
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

          const serialized = serializeReputationRecord(original);
          expect(typeof serialized).toBe('string');
          expect(() => JSON.parse(serialized)).not.toThrow();

          const deserialized = deserializeReputationRecord(serialized);

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

  it('Property 24: Serialization handles records with and without comments', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.uuid(),
        fc.integer({ min: 1, max: 5 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (hasComment, id, rating, commentText) => {
          const original: BlockchainRating = {
            id,
            contractId: generateId(),
            raterId: generateId(),
            rateeId: generateId(),
            rating,
            comment: hasComment ? commentText : undefined,
            timestamp: Date.now(),
            transactionHash: '0x' + generateId().padEnd(64, '0'),
          };

          const serialized = serializeReputationRecord(original);
          const deserialized = deserializeReputationRecord(serialized);

          expect(deserialized.comment).toBe(original.comment);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 25: Reputation score computation**
   * **Validates: Requirements 7.3**
   *
   * For any user with ratings, the computed reputation score shall be the weighted
   * average of all ratings using time decay.
   */
  it('Property 25: Score computation - weighted average with time decay', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 10 }),
        async (ratings) => {
          const userId = generateId();
          const now = Date.now();
          const decayLambda = 0.01;

          const ratingRecords = ratings.map((rating, index) => {
            const daysAgo = index * 30;
            const timestamp = now - daysAgo * 24 * 60 * 60 * 1000;
            return createRatingWithTimestamp(rating, timestamp, userId);
          });

          const computedScore = computeAggregateScore(ratingRecords, decayLambda);

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

          expect(computedScore).toBeCloseTo(expectedScore, 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 25: Score computation - edge cases', async () => {
    // No ratings
    expect(computeAggregateScore([], 0.01)).toBe(0);

    // Single rating
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (rating) => {
          const userId = generateId();
          const ratingRecord = createRatingWithTimestamp(rating, Date.now(), userId);
          const score = computeAggregateScore([ratingRecord], 0.01);
          expect(score).toBe(rating);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 25: Score computation - always bounded between 1 and 5', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 20 }),
        async (ratings) => {
          const userId = generateId();
          const now = Date.now();

          const ratingRecords = ratings.map((rating, index) => {
            const timestamp = now - index * 24 * 60 * 60 * 1000;
            return createRatingWithTimestamp(rating, timestamp, userId);
          });

          const score = computeAggregateScore(ratingRecords, 0.01);

          expect(score).toBeGreaterThanOrEqual(1);
          expect(score).toBeLessThanOrEqual(5);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Reputation Service - Unit Tests', () => {
  beforeEach(async () => {
    contractStore.clear();
    projectStore.clear();
    await clearBlockchainRatings();
  });

  it('should submit valid rating successfully', async () => {
    const freelancerId = generateId();
    const employerId = generateId();

    const project = createTestProject({ employer_id: employerId });
    const contract = createTestContract({
      project_id: project.id,
      freelancer_id: freelancerId,
      employer_id: employerId,
      status: 'completed'
    });

    contractStore.set(contract.id, contract);
    projectStore.set(project.id, project);

    const result = await submitRating({
      contractId: contract.id,
      raterId: employerId,
      rateeId: freelancerId,
      rating: 5,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rating.rating).toBe(5);
      expect(result.data.rating.contractId).toBe(contract.id);
    }
  });

  it('should reject rating for non-completed contract', async () => {
    const freelancerId = generateId();
    const employerId = generateId();

    const project = createTestProject({ employer_id: employerId });
    const contract = createTestContract({
      project_id: project.id,
      freelancer_id: freelancerId,
      employer_id: employerId,
      status: 'active'
    });

    contractStore.set(contract.id, contract);
    projectStore.set(project.id, project);

    const result = await submitRating({
      contractId: contract.id,
      raterId: employerId,
      rateeId: freelancerId,
      rating: 5,
    });

    expect(result.success).toBe(false);
  });

  it('should compute correct aggregate score for multiple ratings', async () => {
    const userId = generateId();
    const now = Date.now();

    const ratings = [
      createRatingWithTimestamp(5, now, userId),
      createRatingWithTimestamp(4, now - 30 * 24 * 60 * 60 * 1000, userId),
      createRatingWithTimestamp(3, now - 60 * 24 * 60 * 60 * 1000, userId),
    ];

    const score = computeAggregateScore(ratings, 0.01);

    expect(score).toBeGreaterThan(3);
    expect(score).toBeLessThan(5);
    expect(score).toBeCloseTo(4.2, 1);
  });

  it('should serialize and deserialize rating with comment', async () => {
    const rating: BlockchainRating = {
      id: generateId(),
      contractId: generateId(),
      raterId: generateId(),
      rateeId: generateId(),
      rating: 5,
      comment: 'Excellent work!',
      timestamp: Date.now(),
      transactionHash: '0x' + generateId().padEnd(64, '0'),
    };

    const serialized = serializeReputationRecord(rating);
    const deserialized = deserializeReputationRecord(serialized);

    expect(deserialized.comment).toBe('Excellent work!');
    expect(deserialized.rating).toBe(5);
  });

  it('should serialize and deserialize rating without comment', async () => {
    const rating: BlockchainRating = {
      id: generateId(),
      contractId: generateId(),
      raterId: generateId(),
      rateeId: generateId(),
      rating: 4,
      timestamp: Date.now(),
      transactionHash: '0x' + generateId().padEnd(64, '0'),
    };

    const serialized = serializeReputationRecord(rating);
    const deserialized = deserializeReputationRecord(serialized);

    expect(deserialized.comment).toBeUndefined();
    expect(deserialized.rating).toBe(4);
  });
});
