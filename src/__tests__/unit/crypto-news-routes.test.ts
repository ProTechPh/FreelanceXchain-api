// @ts-nocheck
/**
 * Crypto News Routes Tests
 * Validates query params, delegates to the service, and maps upstream
 * failures to 502 Bad Gateway.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetCryptoNews = jest.fn();
const mockSearchCryptoNews = jest.fn();
const mockGetCryptoSentiment = jest.fn();
const mockGetCryptoDigest = jest.fn();
const mockGetCryptoPrices = jest.fn();
const mockGetFearGreedIndex = jest.fn();
const mockGetGlobalMarketStats = jest.fn();
const mockGetMarketMovers = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/crypto-news-service.ts'), () => ({
  getCryptoNews: mockGetCryptoNews,
  searchCryptoNews: mockSearchCryptoNews,
  getCryptoSentiment: mockGetCryptoSentiment,
  getCryptoDigest: mockGetCryptoDigest,
  getCryptoPrices: mockGetCryptoPrices,
  getFearGreedIndex: mockGetFearGreedIndex,
  getGlobalMarketStats: mockGetGlobalMarketStats,
  getMarketMovers: mockGetMarketMovers,
  getDynamicCategories: jest.fn(),
}));

const cryptoNewsRouter = (await import('../../routes/crypto-news-routes.js')).default;

const ok = (data: unknown) => ({ success: true, data });
const upstream = (code = 'UPSTREAM_ERROR', message = 'Upstream failed') => ({
  success: false,
  error: { code, message },
});

describe('Crypto News Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use('/api/crypto-news', cryptoNewsRouter);
  });

  describe('GET /news', () => {
    it('returns the feed and uppercases the coin symbol', async () => {
      mockGetCryptoNews.mockResolvedValue(ok({ articles: [{ title: 'BTC rally' }], count: 1 }));

      const res = await request(app).get('/api/crypto-news/news?limit=5&coin=btc');

      expect(res.status).toBe(200);
      expect(res.body.articles).toHaveLength(1);
      expect(mockGetCryptoNews).toHaveBeenCalledWith({ limit: 5, coin: 'BTC', sort: undefined, sources: undefined });
    });

    it('rejects invalid limit values', async () => {
      for (const limit of ['0', '101', 'abc']) {
        const res = await request(app).get(`/api/crypto-news/news?limit=${limit}`);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects invalid coin symbols', async () => {
      const res = await request(app).get('/api/crypto-news/news?coin=../etc/passwd');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('maps upstream errors to 502', async () => {
      mockGetCryptoNews.mockResolvedValue(upstream('UPSTREAM_UNAVAILABLE', 'ECONNREFUSED'));

      const res = await request(app).get('/api/crypto-news/news');

      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    });
  });

  describe('GET /search', () => {
    it('returns search results', async () => {
      mockSearchCryptoNews.mockResolvedValue(ok({ results: [{ title: 'ETF' }] }));

      const res = await request(app).get('/api/crypto-news/search?q=ethereum%20etf&limit=10');

      expect(res.status).toBe(200);
      expect(mockSearchCryptoNews).toHaveBeenCalledWith('ethereum etf', 10);
    });

    it('requires q', async () => {
      const res = await request(app).get('/api/crypto-news/search');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid limit', async () => {
      const res = await request(app).get('/api/crypto-news/search?q=btc&limit=0');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /sentiment', () => {
    it('returns sentiment data', async () => {
      mockGetCryptoSentiment.mockResolvedValue(ok({ sentiment: 'positive' }));

      const res = await request(app).get('/api/crypto-news/sentiment?asset=BTC&limit=10');

      expect(res.status).toBe(200);
      expect(mockGetCryptoSentiment).toHaveBeenCalledWith({ limit: 10, asset: 'BTC' });
    });

    it('rejects invalid limit', async () => {
      const res = await request(app).get('/api/crypto-news/sentiment?limit=999');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /digest', () => {
    it('returns the daily digest', async () => {
      mockGetCryptoDigest.mockResolvedValue(ok({ digest: '...' }));

      const res = await request(app).get('/api/crypto-news/digest?period=24h&format=full');

      expect(res.status).toBe(200);
      expect(mockGetCryptoDigest).toHaveBeenCalledWith({ period: '24h', format: 'full' });
    });

    it('maps upstream errors to 502', async () => {
      mockGetCryptoDigest.mockResolvedValue(upstream());

      const res = await request(app).get('/api/crypto-news/digest');

      expect(res.status).toBe(502);
    });
  });

  describe('GET /prices', () => {
    it('returns prices', async () => {
      mockGetCryptoPrices.mockResolvedValue(ok({ bitcoin: { usd: 95000 } }));

      const res = await request(app).get('/api/crypto-news/prices?coins=bitcoin,ethereum');

      expect(res.status).toBe(200);
      expect(mockGetCryptoPrices).toHaveBeenCalledWith('bitcoin,ethereum');
    });

    it('rejects invalid coins', async () => {
      const res = await request(app).get('/api/crypto-news/prices?coins=bad token!');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /fear-greed', () => {
    it('returns the fear & greed index', async () => {
      mockGetFearGreedIndex.mockResolvedValue(ok({ value: 55 }));

      const res = await request(app).get('/api/crypto-news/fear-greed');

      expect(res.status).toBe(200);
      expect(res.body.value).toBe(55);
    });

    it('maps upstream errors to 502', async () => {
      mockGetFearGreedIndex.mockResolvedValue(upstream());

      const res = await request(app).get('/api/crypto-news/fear-greed');

      expect(res.status).toBe(502);
    });
  });

  describe('GET /global', () => {
    it('returns global market stats', async () => {
      mockGetGlobalMarketStats.mockResolvedValue(ok({ total_market_cap: 3e12 }));

      const res = await request(app).get('/api/crypto-news/global');

      expect(res.status).toBe(200);
      expect(res.body.total_market_cap).toBe(3e12);
    });
  });

  describe('GET /movers', () => {
    it('defaults to gainers', async () => {
      mockGetMarketMovers.mockResolvedValue(ok({ coins: [] }));

      const res = await request(app).get('/api/crypto-news/movers?limit=5&timeframe=24h');

      expect(res.status).toBe(200);
      expect(mockGetMarketMovers).toHaveBeenCalledWith('gainers', { limit: 5, timeframe: '24h' });
    });

    it('supports direction=losers', async () => {
      mockGetMarketMovers.mockResolvedValue(ok({ coins: [] }));

      const res = await request(app).get('/api/crypto-news/movers?direction=losers');

      expect(res.status).toBe(200);
      expect(mockGetMarketMovers).toHaveBeenCalledWith('losers', { limit: undefined, timeframe: undefined });
    });

    it('rejects invalid limit', async () => {
      const res = await request(app).get('/api/crypto-news/movers?limit=101');

      expect(res.status).toBe(400);
    });

    it('maps upstream errors to 502', async () => {
      mockGetMarketMovers.mockResolvedValue(upstream());

      const res = await request(app).get('/api/crypto-news/movers');

      expect(res.status).toBe(502);
    });
  });
});