// @ts-nocheck
/**
 * CryptoPanic Service Tests
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const originalEnv = process.env;
const mockFetch = jest.fn();

describe('CryptoPanic Service', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['CRYPTOPANIC_AUTH_TOKEN'];
    jest.resetModules();
    mockFetch.mockReset();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const importModule = async () => import('../../services/cryptopanic-service.js');

  describe('getCryptoPanicCurrencies', () => {
    it('returns top market currencies directly without network request', async () => {
      const { getCryptoPanicCurrencies } = await importModule();
      const result = await getCryptoPanicCurrencies(3);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data[0]).toEqual({ label: 'Bitcoin (BTC)', coin: 'BTC' });
        expect(result.data[1]).toEqual({ label: 'Ethereum (ETH)', coin: 'ETH' });
        expect(result.data[2]).toEqual({ label: 'Solana (SOL)', coin: 'SOL' });
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('getCryptoPanicNews', () => {
    it('returns empty feed if CRYPTOPANIC_AUTH_TOKEN is not set', async () => {
      const { getCryptoPanicNews } = await importModule();
      const result = await getCryptoPanicNews({ limit: 10 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.articles).toEqual([]);
        expect(result.data.count).toBe(0);
        expect(result.data.source).toBe('cryptopanic');
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('fetches posts if CRYPTOPANIC_AUTH_TOKEN is configured', async () => {
      process.env['CRYPTOPANIC_AUTH_TOKEN'] = 'test-token-123';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
        json: async () => ({
          results: [
            {
              title: 'Crypto Market Rebounds',
              url: 'https://example.com/news/1',
              published_at: '2026-09-06T00:00:00Z',
              source: { title: 'CoinDesk' },
              currencies: [{ code: 'BTC', title: 'Bitcoin' }],
            },
          ],
        }),
      });

      const { getCryptoPanicNews } = await importModule();
      const result = await getCryptoPanicNews({ limit: 5, coin: 'btc' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.articles).toHaveLength(1);
        expect(result.data.articles[0].title).toBe('Crypto Market Rebounds');
        expect(result.data.articles[0].category).toBe('BTC');
      }
      const [calledUrl] = mockFetch.mock.calls[0];
      expect(calledUrl).toContain('auth_token=test-token-123');
      expect(calledUrl).toContain('currencies=BTC');
    });
  });
});
