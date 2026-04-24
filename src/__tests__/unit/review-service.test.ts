import { describe, it, expect } from '@jest/globals';

describe('Review Service (merged into reputation-service)', () => {
  it('should export submitRating as submitReview alias', async () => {
    const { submitRating } = await import('../../services/reputation-service.js');
    expect(typeof submitRating).toBe('function');
  });

  it('should export getReviewById', async () => {
    const { getReviewById } = await import('../../services/reputation-service.js');
    expect(typeof getReviewById).toBe('function');
  });

  it('should export getUserReviews', async () => {
    const { getUserReviews } = await import('../../services/reputation-service.js');
    expect(typeof getUserReviews).toBe('function');
  });

  it('should export getProjectReviews', async () => {
    const { getProjectReviews } = await import('../../services/reputation-service.js');
    expect(typeof getProjectReviews).toBe('function');
  });

  it('should export canUserRate', async () => {
    const { canUserRate } = await import('../../services/reputation-service.js');
    expect(typeof canUserRate).toBe('function');
  });
});