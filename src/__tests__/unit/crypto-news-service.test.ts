// @ts-nocheck
/**
 * Crypto News Service Tests
 * Covers the cryptocurrency.cv upstream client: success passthrough, param
 * encoding, upstream HTTP errors, non-JSON responses, network failures, and
 * the optional X-API-Key header.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const originalEnv = process.env;
const mockFetch = jest.fn();

describe('Crypto News Service', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['CRYPTO_NEWS_BASE_URL'];
    delete process.env['CRYPTO_NEWS_API_KEY'];
    delete process.env['CRYPTO_NEWS_CACHE_TTL_MS'];
    // Fresh module registry per test so the module-level cache never leaks
    // across tests (each test re-imports the service via importModule()).
    jest.resetModules();
    mockFetch.mockReset();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const importModule = async () => import('../../services/crypto-news-service.js');

  const okResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name === 'content-type' ? 'application/json' : null) },
    json: async () => body,
  });

  describe('getCryptoNews', () => {
    it('returns the upstream feed on success', async () => {
      const feed = {
        articles: [{ title: 'Bitcoin Surges Past $95K', source: 'CoinDesk', sentiment: 'positive' }],
        count: 1,
        source: 'aggregated',
      };
      mockFetch.mockResolvedValueOnce(okResponse(feed));

      const { getCryptoNews } = await importModule();
      const result = await getCryptoNews({ limit: 5 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.articles[0].title).toBe('Bitcoin Surges Past $95K');
      }
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://cryptocurrency.cv/api/news?limit=5');
    });

    it('encodes optional params and omits undefined ones', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ articles: [] }));

      const { getCryptoNews } = await importModule();
      await getCryptoNews({ limit: 10, coin: 'BTC', sort: 'newest', sources: 'coindesk,theblock' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://cryptocurrency.cv/api/news?limit=10&coin=BTC&sort=newest&sources=coindesk%2Ctheblock');
    });
  });

  describe('searchCryptoNews', () => {
    it('calls /api/search with the query', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ results: [] }));

      const { searchCryptoNews } = await importModule();
      const result = await searchCryptoNews('ethereum etf', 10);

      expect(result.success).toBe(true);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://cryptocurrency.cv/api/search?q=ethereum+etf&limit=10');
    });
  });

  describe('getCryptoSentiment', () => {
    it('calls /api/sentiment with asset and limit', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ sentiment: 'neutral' }));

      const { getCryptoSentiment } = await importModule();
      const result = await getCryptoSentiment({ limit: 20, asset: 'BTC' });

      expect(result.success).toBe(true);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://cryptocurrency.cv/api/sentiment?limit=20&asset=BTC');
    });
  });

  describe('getCryptoDigest', () => {
    it('calls /api/digest with period and format', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ digest: '...' }));

      const { getCryptoDigest } = await importModule();
      await getCryptoDigest({ period: '24h', format: 'full' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://cryptocurrency.cv/api/digest?period=24h&format=full');
    });
  });

  describe('getCryptoPrices', () => {
    it('calls /api/prices with coins list', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ bitcoin: { usd: 95000 } }));

      const { getCryptoPrices } = await importModule();
      const result = await getCryptoPrices('bitcoin,ethereum');

      expect(result.success).toBe(true);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://cryptocurrency.cv/api/prices?coins=bitcoin%2Cethereum');
    });
  });

  describe('getFearGreedIndex and getGlobalMarketStats', () => {
    it('calls /api/fear-greed without query params', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ value: 55, classification: 'Neutral' }));

      const { getFearGreedIndex } = await importModule();
      const result = await getFearGreedIndex();

      expect(result.success).toBe(true);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://cryptocurrency.cv/api/fear-greed');
    });

    it('calls /api/global', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ total_market_cap: 3000000000000 }));

      const { getGlobalMarketStats } = await importModule();
      const result = await getGlobalMarketStats();

      expect(result.success).toBe(true);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://cryptocurrency.cv/api/global');
    });
  });

  describe('getMarketMovers', () => {
    it('calls /api/market/gainers with limit and timeframe', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ coins: [] }));

      const { getMarketMovers } = await importModule();
      await getMarketMovers('gainers', { limit: 5, timeframe: '24h' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://cryptocurrency.cv/api/market/gainers?limit=5&timeframe=24h');
    });

    it('calls /api/market/losers', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ coins: [] }));

      const { getMarketMovers } = await importModule();
      await getMarketMovers('losers', { limit: 3 });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://cryptocurrency.cv/api/market/losers?limit=3');
    });
  });

  describe('error handling', () => {
    it('returns UPSTREAM_ERROR with the upstream message on non-2xx', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: { message: 'Rate limit exceeded' } }),
      });

      const { getCryptoNews } = await importModule();
      const result = await getCryptoNews();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UPSTREAM_ERROR');
        expect(result.error.message).toBe('Rate limit exceeded');
      }
    });

    it('falls back to the status message when the error body is not JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: () => 'text/html' },
        json: async () => { throw new Error('not json'); },
      });

      const { getCryptoNews } = await importModule();
      const result = await getCryptoNews();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UPSTREAM_ERROR');
        expect(result.error.message).toContain('503');
      }
    });

    it('returns UPSTREAM_ERROR when the success body is not JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        text: async () => '<html>gateway</html>',
      });

      const { getCryptoNews } = await importModule();
      const result = await getCryptoNews();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UPSTREAM_ERROR');
      }
    });

    it('returns UPSTREAM_UNAVAILABLE on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const { getCryptoNews } = await importModule();
      const result = await getCryptoNews();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UPSTREAM_UNAVAILABLE');
        expect(result.error.message).toContain('ECONNREFUSED');
      }
    });

    it('handles non-Error rejections', async () => {
      mockFetch.mockRejectedValueOnce('raw failure');

      const { getCryptoNews } = await importModule();
      const result = await getCryptoNews();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UPSTREAM_UNAVAILABLE');
      }
    });
  });

  describe('caching', () => {
    it('serves repeated identical requests from the in-memory cache', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ value: 55 }));

      const { getFearGreedIndex } = await importModule();
      const first = await getFearGreedIndex();
      const second = await getFearGreedIndex();

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('keeps distinct query params in separate cache entries', async () => {
      mockFetch.mockResolvedValue(okResponse({ articles: [] }));

      const { getCryptoNews } = await importModule();
      await getCryptoNews({ limit: 5 });
      await getCryptoNews({ limit: 10 });
      await getCryptoNews({ limit: 5 });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not cache upstream errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        headers: { get: () => 'text/html' },
        json: async () => { throw new Error('not json'); },
      });

      const { getFearGreedIndex } = await importModule();
      await getFearGreedIndex();
      await getFearGreedIndex();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('expires entries after the configured TTL', async () => {
      jest.useFakeTimers();
      try {
        process.env['CRYPTO_NEWS_CACHE_TTL_MS'] = '100';
        jest.resetModules();
        mockFetch.mockResolvedValue(okResponse({ value: 55 }));

        const { getFearGreedIndex } = await importModule();
        await getFearGreedIndex();
        jest.advanceTimersByTime(101);
        await getFearGreedIndex();

        expect(mockFetch).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('skips caching entirely when TTL is 0', async () => {
      process.env['CRYPTO_NEWS_CACHE_TTL_MS'] = '0';
      jest.resetModules();
      mockFetch.mockResolvedValue(okResponse({ value: 55 }));

      const { getFearGreedIndex } = await importModule();
      await getFearGreedIndex();
      await getFearGreedIndex();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('API key header', () => {
    it('sends X-API-Key when CRYPTO_NEWS_API_KEY is configured', async () => {
      process.env['CRYPTO_NEWS_API_KEY'] = 'sk-test-123';
      jest.resetModules();
      mockFetch.mockResolvedValueOnce(okResponse({ value: 50 }));

      const { getFearGreedIndex } = await importModule();
      await getFearGreedIndex();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['X-API-Key']).toBe('sk-test-123');
    });

    it('omits X-API-Key when not configured', async () => {
      jest.resetModules();
      mockFetch.mockResolvedValueOnce(okResponse({ value: 50 }));

      const { getFearGreedIndex } = await importModule();
      await getFearGreedIndex();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['X-API-Key']).toBeUndefined();
    });
  });

  describe('getDynamicCategories', () => {
    it('returns top currency pills and extracts tags from live articles', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({
        articles: [
          { title: 'DeFi protocol launches', category: 'defi, ethereum' },
          { title: 'NFT collection drops', category: 'nft' },
        ],
      }));

      const { getDynamicCategories } = await importModule();
      const result = await getDynamicCategories(10);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0]).toEqual({ label: 'All News' });
        expect(result.data.some((c) => c.coin === 'BTC')).toBe(true);
        expect(result.data.some((c) => c.coin === 'ETH')).toBe(true);
        expect(result.data.some((c) => c.coin === 'SOL')).toBe(true);
        expect(result.data.some((c) => c.filter === 'defi')).toBe(true);
        expect(result.data.some((c) => c.filter === 'nft')).toBe(true);
      }
    });
  });
});