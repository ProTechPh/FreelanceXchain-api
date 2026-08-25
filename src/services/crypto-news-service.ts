/**
 * Crypto News API client — proxies the free cryptocurrency.cv API
 * (https://cryptocurrency.cv/developers). The backend is the single caller of
 * the upstream so the frontend never talks to it directly: API keys stay
 * server-side, query params are validated in the routes, and upstream errors
 * are normalized into the standard ServiceResult envelope.
 */
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { validateUrl } from '../utils/url-validator.js';
import { LRUCache } from '../utils/cache.js';
import { successResult, errorResult } from '../types/service-result.js';
import type { ServiceResult } from '../types/service-result.js';
import { getCryptoPanicNews, getCryptoPanicCurrencies } from './cryptopanic-service.js';
import type { NewsCategoryItem } from './cryptopanic-service.js';
import { getAggregatedRssNews } from './crypto-rss-service.js';

const BASE_URL = config.cryptoNews.baseUrl.replace(/\/+$/, '');

const urlValidation = validateUrl(BASE_URL);
/* istanbul ignore if -- config is validated at startup; covered by env tests */
if (!urlValidation.valid) {
  logger.error('Invalid CRYPTO_NEWS_BASE_URL configuration', undefined, {
    url: BASE_URL,
    error: urlValidation.error,
  });
  throw new Error(`Invalid CRYPTO_NEWS_BASE_URL: ${urlValidation.error}`);
}

// In-memory short-TTL cache keyed by the full upstream path+query. Only
// successful responses are cached (never upstream errors), and the cache is
// skipped entirely when CRYPTO_NEWS_CACHE_TTL_MS is 0. In-memory (per-process)
// matches the analytics/payment caches — good enough to absorb repeated
// frontend polling without hammering the upstream rate limit.
const CACHE_MAX_SIZE = 200;
const cryptoNewsCache =
  config.cryptoNews.cacheTtlMs > 0
    ? new LRUCache<unknown>(CACHE_MAX_SIZE, config.cryptoNews.cacheTtlMs)
    : null;

export type CryptoNewsArticle = {
  title: string;
  link?: string;
  url?: string;
  pubDate?: string;
  source?: string;
  category?: string;
  sentiment?: string;
  image?: string;
  imageurl?: string;
  imageUrl?: string;
  image_url?: string;
  thumbnail?: string;
  urlToImage?: string;
  summary?: string;
  description?: string;
};

export type CryptoNewsFeed = {
  articles: CryptoNewsArticle[];
  count?: number;
  source?: string;
};

export type CryptoNewsParams = Record<string, string | number | undefined>;

type UpstreamError = { error?: { code?: string; message?: string } };

/**
 * GET an upstream endpoint with the configured timeout and optional API key,
 * normalizing failures into a ServiceResult. The upstream body is passed
 * through untouched so the frontend receives the cryptocurrency.cv data shape.
 */
async function fetchCryptoNews<T>(
  path: string,
  params: CryptoNewsParams = {}
): Promise<ServiceResult<T>> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  // Cache key is the path + normalized query, so each distinct request has its
  // own entry and the cache never leaks across different params.
  const cacheKey = url.pathname + url.search;
  if (cryptoNewsCache) {
    const cached = cryptoNewsCache.get(cacheKey) as T | undefined;
    if (cached !== undefined) {
      return successResult(cached);
    }
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.cryptoNews.apiKey) {
    headers['X-API-Key'] = config.cryptoNews.apiKey;
  }

  try {
    const response = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(config.cryptoNews.timeoutMs),
    });

    if (!response.ok) {
      let upstreamMessage = `Upstream responded with status ${response.status}`;
      try {
        const errorBody = (await response.json()) as UpstreamError;
        if (errorBody?.error?.message) upstreamMessage = errorBody.error.message;
      } catch {
        // Non-JSON error body — keep the status-based message.
      }
      logger.warn('Crypto news upstream error', {
        path,
        status: response.status,
      });
      return errorResult('UPSTREAM_ERROR', upstreamMessage, undefined, undefined);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      logger.error('Crypto News upstream returned non-JSON response', undefined, {
        path,
        status: response.status,
      });
      return errorResult('UPSTREAM_ERROR', 'Upstream returned a non-JSON response.');
    }

    const data = (await response.json()) as T;
    // Only cache successful responses; upstream failures are never cached so a
    // transient outage resolves on the next request.
    if (cryptoNewsCache) {
      cryptoNewsCache.set(cacheKey, data);
    }
    return successResult(data);
  } catch (error) {
    logger.error('Crypto News upstream request failed', error as Error, { path });
    return errorResult(
      'UPSTREAM_UNAVAILABLE',
      error instanceof Error ? error.message : 'Failed to reach the crypto news API'
    );
  }
}


// Minimum number of articles the primary source must return before we skip
// supplementing with secondary & RSS sources.
const MIN_PRIMARY_ARTICLES = 10;

/**
 * Latest crypto news with multi-category aggregation.
 *
 * Aggregates in priority order:
 * 1. cryptocurrency.cv API
 * 2. CoinTelegraph & Decrypt live RSS feeds (unlimited free 30+ real articles with images)
 * 3. CryptoPanic API (if available)
 *
 * Deduplicates by title and sorts latest first.
 */
export async function getCryptoNews(
  options: {
    limit?: number | undefined;
    coin?: string | undefined;
    category?: string | undefined;
    sort?: string | undefined;
    sources?: string | undefined;
  } = {}
): Promise<ServiceResult<CryptoNewsFeed>> {
  const limit = options.limit ?? 24;

  // Fetch primary API and RSS feeds in parallel for maximum speed and freshness
  const [primaryResult, rssResult] = await Promise.allSettled([
    fetchCryptoNews<CryptoNewsFeed>('/api/news', {
      limit: options.limit,
      coin: options.coin,
      category: options.category,
      sort: options.sort,
      sources: options.sources,
    }),
    getAggregatedRssNews({
      limit,
      coin: options.coin,
      category: options.category,
    }),
  ]);

  const primaryArticles: CryptoNewsArticle[] =
    primaryResult.status === 'fulfilled' && primaryResult.value.success
      ? (primaryResult.value.data.articles ?? [])
      : [];

  const rssArticles: CryptoNewsArticle[] =
    rssResult.status === 'fulfilled' && rssResult.value.success
      ? (rssResult.value.data.articles ?? [])
      : [];

  // Deduplicate by title
  const seenTitles = new Set<string>();
  const combinedArticles: CryptoNewsArticle[] = [];

  for (const art of [...primaryArticles, ...rssArticles]) {
    const normTitle = (art.title || '').toLowerCase().trim();
    if (normTitle && !seenTitles.has(normTitle)) {
      seenTitles.add(normTitle);
      combinedArticles.push(art);
    }
  }

  // If still under desired count, try CryptoPanic
  if (combinedArticles.length < limit) {
    const needed = limit - combinedArticles.length;
    const secondaryResult = await getCryptoPanicNews({
      limit: needed,
      ...(options.coin !== undefined && { coin: options.coin }),
    });

    if (secondaryResult.success && Array.isArray(secondaryResult.data.articles)) {
      for (const secArt of secondaryResult.data.articles) {
        const normTitle = (secArt.title || '').toLowerCase().trim();
        if (normTitle && !seenTitles.has(normTitle)) {
          seenTitles.add(normTitle);
          combinedArticles.push(secArt);
        }
      }
    }
  }

  const finalArticles = combinedArticles.slice(0, limit);

  logger.info('[crypto-news] aggregated live news feed', {
    primary: primaryArticles.length,
    rss: rssArticles.length,
    total: finalArticles.length,
  } as Record<string, unknown>);

  return successResult({
    articles: finalArticles,
    count: finalArticles.length,
    source: 'Aggregated Live Feeds (CoinTelegraph, Decrypt, Cryptocurrency.cv)',
  });
}


/**
 * Full-text search across news, articles, and market data.
 */
export async function searchCryptoNews(
  query: string,
  limit?: number | undefined
): Promise<ServiceResult<Record<string, unknown>>> {
  const upstream = await fetchCryptoNews<Record<string, unknown>>('/api/search', {
    q: query,
    limit,
  });

  if (upstream.success && Array.isArray(upstream.data?.results) && upstream.data.results.length > 0) {
    return upstream;
  }

  // Fallback: search through live RSS feed articles
  const rssResult = await getAggregatedRssNews({ limit: limit ?? 20 });
  if (rssResult.success && Array.isArray(rssResult.data.articles)) {
    const qLower = query.toLowerCase();
    const matched = rssResult.data.articles.filter(
      (a) =>
        a.title.toLowerCase().includes(qLower) ||
        (a.summary && a.summary.toLowerCase().includes(qLower)) ||
        (a.category && a.category.toLowerCase().includes(qLower))
    );
    return successResult({
      results: matched,
      count: matched.length,
      source: 'RSS Feed Search (CoinTelegraph, Decrypt)',
    });
  }

  return upstream;
}

/**
 * Market sentiment analysis and indicators.
 */
export function getCryptoSentiment(
  options: { limit?: number | undefined; asset?: string | undefined } = {}
): Promise<ServiceResult<Record<string, unknown>>> {
  return fetchCryptoNews<Record<string, unknown>>('/api/sentiment', {
    limit: options.limit,
    asset: options.asset,
  });
}

/**
 * Daily crypto market digest.
 */
export function getCryptoDigest(
  options: { period?: string | undefined; format?: string | undefined } = {}
): Promise<ServiceResult<Record<string, unknown>>> {
  return fetchCryptoNews<Record<string, unknown>>('/api/digest', {
    period: options.period,
    format: options.format,
  });
}

/**
 * Real-time cryptocurrency prices. `coins` is a comma-separated list of
 * identifiers (e.g. `bitcoin,ethereum`).
 */
export function getCryptoPrices(
  coins?: string | undefined
): Promise<ServiceResult<Record<string, unknown>>> {
  return fetchCryptoNews<Record<string, unknown>>('/api/prices', { coins });
}

/**
 * Fear & Greed index.
 */
export function getFearGreedIndex(): Promise<ServiceResult<Record<string, unknown>>> {
  return fetchCryptoNews<Record<string, unknown>>('/api/fear-greed');
}

/**
 * Global cryptocurrency market statistics (market cap, dominance, volume).
 */
export function getGlobalMarketStats(): Promise<ServiceResult<Record<string, unknown>>> {
  return fetchCryptoNews<Record<string, unknown>>('/api/global');
}

/**
 * Top gaining/losing cryptocurrencies by timeframe.
 */
export function getMarketMovers(
  direction: 'gainers' | 'losers',
  options: { limit?: number | undefined; timeframe?: string | undefined } = {}
): Promise<ServiceResult<Record<string, unknown>>> {
  return fetchCryptoNews<Record<string, unknown>>(`/api/market/${direction}`, {
    limit: options.limit,
    timeframe: options.timeframe,
  });
}

/**
 * Dynamically extract and generate category filter options from live news
 * feeds and top currency listings. Zero hardcoded categories.
 */
export async function getDynamicCategories(limit = 10): Promise<ServiceResult<NewsCategoryItem[]>> {
  const [currenciesRes, newsRes] = await Promise.allSettled([
    getCryptoPanicCurrencies(5),
    getCryptoNews({ limit: 30 }),
  ]);

  const categories: NewsCategoryItem[] = [{ label: 'All News' }];
  const seen = new Set<string>(['all news']);

  // 1. Add top active coin symbols from live currency listings
  if (currenciesRes.status === 'fulfilled' && currenciesRes.value.success) {
    for (const c of currenciesRes.value.data) {
      const lower = c.label.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        categories.push(c);
      }
    }
  }

  // 2. Extract actual unique category tags from live articles currently in feed
  if (newsRes.status === 'fulfilled' && newsRes.value.success) {
    const articles = newsRes.value.data.articles || [];
    for (const art of articles) {
      if (!art.category) continue;
      const raw = art.category.trim();
      if (!raw || raw.toLowerCase() === 'crypto' || raw.toLowerCase() === 'latest news') continue;

      const parts = raw.split(/[,/]/).map((p) => p.trim()).filter(Boolean);
      for (const p of parts) {
        const lower = p.toLowerCase();
        if (!seen.has(lower) && categories.length < limit) {
          seen.add(lower);
          const formatted = p
            .split(' ')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
          categories.push({
            label: formatted,
            filter: lower,
          });
        }
      }
    }
  }

  return successResult(categories);
}