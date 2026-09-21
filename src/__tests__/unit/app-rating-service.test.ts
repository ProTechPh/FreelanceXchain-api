// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const DAY_MS = 24 * 60 * 60 * 1000;

const store = new Map<string, any>();
let idCounter = 0;

const mockAppRatingRepo = {
  findLatestByUser: jest.fn<any>(async (userId: string) => {
    const rows = [...store.values()]
      .filter(r => r.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rows[0] ?? null;
  }),
  hasRatedForContext: jest.fn<any>(async (userId: string, source: string, contextId: string) =>
    [...store.values()].some(r => r.userId === userId && r.source === source && r.contextId === contextId)
  ),
  createRating: jest.fn<any>(async (entity: any) => {
    idCounter += 1;
    const now = new Date().toISOString();
    const rating = {
      id: `rating-${idCounter}`,
      userId: entity.user_id,
      userRole: entity.user_role,
      rating: entity.rating,
      comment: entity.comment,
      source: entity.source,
      contextId: entity.context_id,
      createdAt: now,
      updatedAt: now,
    };
    store.set(rating.id, rating);
    return rating;
  }),
  listAll: jest.fn<any>(async () => ({ ratings: [...store.values()], total: store.size })),
  fetchAllForSummary: jest.fn<any>(async () => [...store.values()]),
};

const mockUserRepo = {
  getUsersByIds: jest.fn<any>(async (ids: string[]) =>
    ids.map(id => ({ id, name: `User ${id}`, email: `${id}@example.com`, role: 'freelancer' }))
  ),
};

jest.unstable_mockModule(resolveModule('src/repositories/app-rating-repository.ts'), () => ({
  appRatingRepository: mockAppRatingRepo,
  AppRatingRepository: class {},
}));

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepo,
  UserRepository: class {},
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), security: jest.fn() },
}));

const importService = () => import(resolveModule('src/services/app-rating-service.ts'));

const baseInput = {
  userId: 'user-1',
  userRole: 'freelancer',
  rating: 5,
  source: 'contract_completed',
  contextId: 'contract-1',
};

beforeEach(() => {
  store.clear();
  idCounter = 0;
  jest.clearAllMocks();
});

describe('submitAppRating', () => {
  it('accepts a rating with no comment — a star on its own is a complete submission', async () => {
    const { submitAppRating } = await importService();

    const result = await submitAppRating(baseInput);

    expect(result.success).toBe(true);
    expect(result.data.rating).toBe(5);
    expect(result.data.comment).toBeUndefined();
  });

  it.each([0, 6, 2.5, Number.NaN])('rejects an out-of-range rating (%s)', async rating => {
    const { submitAppRating } = await importService();

    const result = await submitAppRating({ ...baseInput, rating });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_RATING');
  });

  it('rejects an unknown source', async () => {
    const { submitAppRating } = await importService();

    const result = await submitAppRating({ ...baseInput, source: 'made_up' });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_SOURCE');
  });

  it('rejects a comment over the length limit', async () => {
    const { submitAppRating } = await importService();

    const result = await submitAppRating({ ...baseInput, comment: 'x'.repeat(2001) });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('COMMENT_TOO_LONG');
  });

  it('refuses a second event-driven rating inside the 30-day cooldown', async () => {
    const { submitAppRating } = await importService();

    await submitAppRating(baseInput);
    const second = await submitAppRating({ ...baseInput, source: 'proposal_submitted', contextId: 'proposal-1' });

    expect(second.success).toBe(false);
    expect(second.error.code).toBe('RATE_LIMITED');
  });

  it('lets a manual rating through the cooldown — the user asked for the form', async () => {
    const { submitAppRating } = await importService();

    await submitAppRating(baseInput);
    const manual = await submitAppRating({
      userId: 'user-1',
      userRole: 'freelancer',
      rating: 3,
      source: 'manual',
    });

    expect(manual.success).toBe(true);
  });

  it('refuses a duplicate for the same event once the cooldown has lapsed', async () => {
    const { submitAppRating } = await importService();

    const stale = new Date(Date.now() - 31 * DAY_MS).toISOString();
    store.set('old', { ...baseInput, id: 'old', createdAt: stale, updatedAt: stale });

    const result = await submitAppRating(baseInput);

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('DUPLICATE_RATING');
  });
});

describe('getRatingEligibility', () => {
  it('prompts a user who has never rated', async () => {
    const { getRatingEligibility } = await importService();

    const result = await getRatingEligibility('nobody');

    expect(result.data.shouldPrompt).toBe(true);
  });

  it('holds off inside the cooldown and reports when it lifts', async () => {
    const { submitAppRating, getRatingEligibility } = await importService();
    await submitAppRating(baseInput);

    const result = await getRatingEligibility('user-1');

    expect(result.data.shouldPrompt).toBe(false);
    expect(result.data.reason).toBe('COOLDOWN');
    expect(new Date(result.data.nextEligibleAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('prompts again once the cooldown has lapsed', async () => {
    const { getRatingEligibility } = await importService();
    const stale = new Date(Date.now() - 31 * DAY_MS).toISOString();
    store.set('old', { ...baseInput, id: 'old', createdAt: stale, updatedAt: stale });

    const result = await getRatingEligibility('user-1');

    expect(result.data.shouldPrompt).toBe(true);
  });

  it('stays quiet rather than guessing when the lookup fails', async () => {
    const { getRatingEligibility } = await importService();
    mockAppRatingRepo.findLatestByUser.mockRejectedValueOnce(new Error('appwrite down'));

    const result = await getRatingEligibility('user-1');

    expect(result.success).toBe(true);
    expect(result.data.shouldPrompt).toBe(false);
    expect(result.data.reason).toBe('LOOKUP_FAILED');
  });
});

describe('summarize', () => {
  it('returns zeroes rather than NaN for an empty set', async () => {
    const { summarize } = await importService();

    const summary = summarize([]);

    expect(summary).toMatchObject({ total: 0, average: 0, positivePercentage: 0, recentTotal: 0 });
    expect(summary.histogram).toEqual({ '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 });
  });

  it('computes the average, histogram and per-source split', async () => {
    const { summarize } = await importService();
    const now = Date.now();
    const at = (daysAgo: number) => new Date(now - daysAgo * DAY_MS).toISOString();

    const summary = summarize(
      [
        { rating: 5, source: 'manual', createdAt: at(1) },
        { rating: 4, source: 'manual', createdAt: at(2) },
        { rating: 2, source: 'contract_completed', createdAt: at(45) },
      ],
      now
    );

    expect(summary.total).toBe(3);
    expect(summary.average).toBe(3.7);
    expect(summary.histogram).toEqual({ '1': 0, '2': 1, '3': 0, '4': 1, '5': 1 });
    // Only the two inside 30 days count as recent.
    expect(summary.recentTotal).toBe(2);
    expect(summary.positivePercentage).toBe(67);
    expect(summary.bySource[0]).toEqual({ source: 'manual', total: 2, average: 4.5 });
  });
});

describe('listAppRatings', () => {
  it('attributes each row to its submitter', async () => {
    const { submitAppRating, listAppRatings } = await importService();
    await submitAppRating(baseInput);

    const result = await listAppRatings();

    expect(result.success).toBe(true);
    expect(result.data.ratings[0]).toMatchObject({
      userName: 'User user-1',
      userEmail: 'user-1@example.com',
    });
  });

  it('labels a row whose author no longer exists rather than dropping it', async () => {
    const { submitAppRating, listAppRatings } = await importService();
    await submitAppRating(baseInput);
    mockUserRepo.getUsersByIds.mockResolvedValueOnce([]);

    const result = await listAppRatings();

    expect(result.data.ratings[0]).toMatchObject({ userName: 'Deleted user', userEmail: '—' });
  });
});
