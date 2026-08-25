import { Router, Request, Response } from 'express';
import {
  getCryptoNews,
  searchCryptoNews,
  getCryptoSentiment,
  getCryptoDigest,
  getCryptoPrices,
  getFearGreedIndex,
  getGlobalMarketStats,
  getMarketMovers,
} from '../services/crypto-news-service.js';
import type { ServiceError } from '../types/service-result.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

const MAX_LIMIT = 100;

/**
 * Parse and validate the `limit` query param (1..100). Returns undefined when
 * absent, NaN when invalid (caller sends a 400), or the parsed integer.
 */
function parseLimit(raw: string | undefined): number | undefined | typeof NaN {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) return NaN;
  return parsed;
}

/**
 * Send the standardized 502 response when the upstream crypto news API fails.
 * Callers pass the narrowed failure branch of a ServiceResult.
 */
function sendUpstreamError(
  res: Response,
  error: ServiceError,
  requestId: string
): void {
  sendErrorResponse(res, 502, error.code, error.message, { requestId });
}

/**
 * @swagger
 * /api/crypto-news/news:
 *   get:
 *     summary: Latest crypto news
 *     description: Latest crypto news from 300+ sources, proxied from the free cryptocurrency.cv API. Optional coin filter (e.g. BTC, ETH).
 *     tags:
 *       - Crypto News
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of articles to return
 *       - in: query
 *         name: coin
 *         schema:
 *           type: string
 *         description: Coin symbol to filter by (e.g. BTC, ETH)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sort field
 *       - in: query
 *         name: sources
 *         schema:
 *           type: string
 *         description: Comma-separated list of news sources
 *     responses:
 *       200:
 *         description: News articles retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       502:
 *         description: Upstream crypto news API unavailable
 */
router.get('/news', apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const limit = parseLimit(req.query['limit'] as string | undefined);
  if (Number.isNaN(limit)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', `limit must be an integer between 1 and ${MAX_LIMIT}`, { requestId });
    return;
  }

  const coin = req.query['coin'] as string | undefined;
  if (coin !== undefined && !/^[A-Za-z0-9]{1,10}$/.test(coin)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'coin must be a coin symbol (e.g. BTC)', { requestId });
    return;
  }

  const result = await getCryptoNews({
    limit,
    coin: coin?.toUpperCase(),
    category: req.query['category'] as string | undefined,
    sort: req.query['sort'] as string | undefined,
    sources: req.query['sources'] as string | undefined,
  });

  if (!result.success) {
    sendUpstreamError(res, result.error, requestId);
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/crypto-news/search:
 *   get:
 *     summary: Search crypto news
 *     description: Full-text search across crypto news, articles, and market data.
 *     tags:
 *       - Crypto News
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of results to return
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       502:
 *         description: Upstream crypto news API unavailable
 */
router.get('/search', apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const query = (req.query['q'] as string | undefined)?.trim();
  if (!query) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'q is required', { requestId });
    return;
  }

  const limit = parseLimit(req.query['limit'] as string | undefined);
  if (Number.isNaN(limit)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', `limit must be an integer between 1 and ${MAX_LIMIT}`, { requestId });
    return;
  }

  const result = await searchCryptoNews(query, limit);

  if (!result.success) {
    sendUpstreamError(res, result.error, requestId);
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/crypto-news/sentiment:
 *   get:
 *     summary: Crypto market sentiment
 *     description: Market sentiment analysis and indicators.
 *     tags:
 *       - Crypto News
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of results to return
 *       - in: query
 *         name: asset
 *         schema:
 *           type: string
 *         description: Asset identifier (e.g. BTC, ETH)
 *     responses:
 *       200:
 *         description: Sentiment data retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       502:
 *         description: Upstream crypto news API unavailable
 */
router.get('/sentiment', apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const limit = parseLimit(req.query['limit'] as string | undefined);
  if (Number.isNaN(limit)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', `limit must be an integer between 1 and ${MAX_LIMIT}`, { requestId });
    return;
  }

  const result = await getCryptoSentiment({
    limit,
    asset: req.query['asset'] as string | undefined,
  });

  if (!result.success) {
    sendUpstreamError(res, result.error, requestId);
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/crypto-news/digest:
 *   get:
 *     summary: Daily crypto market digest
 *     description: Daily crypto market digest.
 *     tags:
 *       - Crypto News
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *         description: Time period for data aggregation (e.g. 24h)
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *         description: Response format (e.g. full)
 *     responses:
 *       200:
 *         description: Digest retrieved successfully
 *       502:
 *         description: Upstream crypto news API unavailable
 */
router.get('/digest', apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const result = await getCryptoDigest({
    period: req.query['period'] as string | undefined,
    format: req.query['format'] as string | undefined,
  });

  if (!result.success) {
    sendUpstreamError(res, result.error, requestId);
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/crypto-news/prices:
 *   get:
 *     summary: Real-time crypto prices
 *     description: Real-time cryptocurrency prices. `coins` is a comma-separated list of identifiers (e.g. bitcoin,ethereum).
 *     tags:
 *       - Crypto News
 *     parameters:
 *       - in: query
 *         name: coins
 *         schema:
 *           type: string
 *         description: Comma-separated cryptocurrency identifiers
 *     responses:
 *       200:
 *         description: Prices retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       502:
 *         description: Upstream crypto news API unavailable
 */
router.get('/prices', apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const coins = req.query['coins'] as string | undefined;
  if (coins !== undefined && !/^[A-Za-z0-9,-]{1,200}$/.test(coins)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'coins must be comma-separated identifiers', { requestId });
    return;
  }

  const result = await getCryptoPrices(coins);

  if (!result.success) {
    sendUpstreamError(res, result.error, requestId);
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/crypto-news/fear-greed:
 *   get:
 *     summary: Fear & Greed index
 *     description: Current crypto Fear & Greed index.
 *     tags:
 *       - Crypto News
 *     responses:
 *       200:
 *         description: Fear & Greed index retrieved successfully
 *       502:
 *         description: Upstream crypto news API unavailable
 */
router.get('/fear-greed', apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const result = await getFearGreedIndex();

  if (!result.success) {
    sendUpstreamError(res, result.error, requestId);
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/crypto-news/global:
 *   get:
 *     summary: Global crypto market statistics
 *     description: Global cryptocurrency market statistics (market cap, dominance, volume).
 *     tags:
 *       - Crypto News
 *     responses:
 *       200:
 *         description: Global market statistics retrieved successfully
 *       502:
 *         description: Upstream crypto news API unavailable
 */
router.get('/global', apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const result = await getGlobalMarketStats();

  if (!result.success) {
    sendUpstreamError(res, result.error, requestId);
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/crypto-news/movers:
 *   get:
 *     summary: Top gaining and losing cryptocurrencies
 *     description: Top gaining and losing cryptocurrencies by timeframe.
 *     tags:
 *       - Crypto News
 *     parameters:
 *       - in: query
 *         name: direction
 *         schema:
 *           type: string
 *           enum: [gainers, losers]
 *           default: gainers
 *         description: Which movers to return
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of results to return
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *         description: Time period (e.g. 1h, 24h, 7d, 30d)
 *     responses:
 *       200:
 *         description: Market movers retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       502:
 *         description: Upstream crypto news API unavailable
 */
router.get('/movers', apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const directionRaw = (req.query['direction'] as string | undefined) ?? 'gainers';
  const direction = directionRaw === 'losers' ? 'losers' : 'gainers';

  const limit = parseLimit(req.query['limit'] as string | undefined);
  if (Number.isNaN(limit)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', `limit must be an integer between 1 and ${MAX_LIMIT}`, { requestId });
    return;
  }

  const result = await getMarketMovers(direction, {
    limit,
    timeframe: req.query['timeframe'] as string | undefined,
  });

  if (!result.success) {
    sendUpstreamError(res, result.error, requestId);
    return;
  }

  res.status(200).json(result.data);
}));

export default router;