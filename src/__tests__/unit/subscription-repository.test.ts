// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockListDocuments = jest.fn<any>();
const mockGetDocument = jest.fn<any>();
const mockCreateDocument = jest.fn<any>();
const mockUpdateDocument = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: {
    listDocuments: mockListDocuments,
    getDocument: mockGetDocument,
    createDocument: mockCreateDocument,
    updateDocument: mockUpdateDocument,
    deleteDocument: jest.fn(),
  },
  DATABASE_ID: 'db',
  Query: {
    equal: (f: string, v: unknown) => `equal(${f},${JSON.stringify(v)})`,
    limit: (n: number) => `limit(${n})`,
  },
  ID: { unique: () => 'generated-id' },
}));

const { subscriptionRepository } = await import('../../repositories/subscription-repository.js');

const doc = (over: any = {}) => ({
  $id: 'u1', $createdAt: 'c', $updatedAt: 'u',
  user_id: 'u1', plan: 'pro', status: 'active', ...over,
});

describe('SubscriptionRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads by user id as a point read, not an index scan', async () => {
    // The document id IS the user id, which keeps the gate's hot path cheap.
    mockGetDocument.mockResolvedValue(doc());

    const result = await subscriptionRepository.getByUserId('u1');

    expect(mockGetDocument).toHaveBeenCalledWith('db', 'subscriptions', 'u1');
    expect(result?.user_id).toBe('u1');
  });

  it('returns null when there is no document', async () => {
    mockGetDocument.mockRejectedValue(new Error('404'));

    expect(await subscriptionRepository.getByUserId('nobody')).toBeNull();
  });

  it('finds a row by Stripe customer id', async () => {
    mockListDocuments.mockResolvedValue({ documents: [doc({ stripe_customer_id: 'cus_1' })] });

    const result = await subscriptionRepository.findByStripeCustomerId('cus_1');

    expect(result?.stripe_customer_id).toBe('cus_1');
  });

  it('finds a row by Stripe subscription id', async () => {
    mockListDocuments.mockResolvedValue({ documents: [doc({ stripe_subscription_id: 'sub_1' })] });

    expect((await subscriptionRepository.findByStripeSubscriptionId('sub_1'))?.stripe_subscription_id).toBe('sub_1');
  });

  describe('upsertForUser', () => {
    it('updates an existing row', async () => {
      mockGetDocument.mockResolvedValue(doc());
      mockUpdateDocument.mockResolvedValue(doc({ status: 'canceled' }));

      await subscriptionRepository.upsertForUser('u1', { status: 'canceled' });

      expect(mockUpdateDocument).toHaveBeenCalled();
      expect(mockCreateDocument).not.toHaveBeenCalled();
    });

    it('creates the row keyed on the user id when none exists', async () => {
      mockGetDocument.mockRejectedValue(new Error('404'));
      mockCreateDocument.mockResolvedValue(doc());

      await subscriptionRepository.upsertForUser('u1', { plan: 'pro' });

      expect(mockCreateDocument).toHaveBeenCalledWith('db', 'subscriptions', 'u1', expect.any(Object));
    });

    it('falls back to update when a concurrent webhook already created the row', async () => {
      // Two deliveries can race between the read and the write.
      mockGetDocument.mockRejectedValue(new Error('404'));
      mockCreateDocument.mockRejectedValue(new Error('409 already exists'));
      mockUpdateDocument.mockResolvedValue(doc());

      const result = await subscriptionRepository.upsertForUser('u1', { plan: 'pro' });

      expect(mockUpdateDocument).toHaveBeenCalled();
      expect(result).not.toBeNull();
    });
  });

  describe('getProUserIds', () => {
    it('returns an empty set for no ids, without querying', async () => {
      expect((await subscriptionRepository.getProUserIds([])).size).toBe(0);
      expect(mockListDocuments).not.toHaveBeenCalled();
    });

    it('returns only users whose status actually entitles them', async () => {
      mockListDocuments.mockResolvedValue({
        documents: [
          doc({ $id: 'a', user_id: 'a', status: 'active' }),
          doc({ $id: 'b', user_id: 'b', status: 'past_due' }),
          doc({ $id: 'c', user_id: 'c', status: 'canceled' }),
        ],
      });

      const pro = await subscriptionRepository.getProUserIds(['a', 'b', 'c']);

      expect([...pro].sort()).toEqual(['a', 'b']);
    });

    it('chunks past the 100-value cap Appwrite enforces on equal()', async () => {
      mockListDocuments.mockResolvedValue({ documents: [] });

      await subscriptionRepository.getProUserIds(Array.from({ length: 250 }, (_, i) => `u${i}`));

      expect(mockListDocuments).toHaveBeenCalledTimes(3);
    });

    it('de-duplicates ids before querying', async () => {
      mockListDocuments.mockResolvedValue({ documents: [] });

      await subscriptionRepository.getProUserIds(['a', 'a', 'a']);

      expect(mockListDocuments).toHaveBeenCalledTimes(1);
    });

    it('degrades to an empty set when the query fails', async () => {
      // Ranking must still work when billing lookups are down.
      mockListDocuments.mockRejectedValue(new Error('boom'));

      expect((await subscriptionRepository.getProUserIds(['a'])).size).toBe(0);
    });
  });
});
