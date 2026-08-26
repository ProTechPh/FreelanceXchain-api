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
import type { NewsCategoryItem } from './cryptopanic-service.js';

function getBaseUrl(): string {
  return (process.env['CRYPTO_NEWS_BASE_URL'] || config.cryptoNews?.baseUrl || 'https://cryptocurrency.cv').replace(/\/+$/, '');
}

function getApiKey(): string | undefined {
  return process.env['CRYPTO_NEWS_API_KEY'] || config.cryptoNews?.apiKey;
}

function getCacheTtlMs(): number {
  if (process.env['CRYPTO_NEWS_CACHE_TTL_MS'] !== undefined) {
    const val = Number(process.env['CRYPTO_NEWS_CACHE_TTL_MS']);
    return isNaN(val) ? 60000 : val;
  }
  return config.cryptoNews?.cacheTtlMs ?? 60000;
}

const CACHE_MAX_SIZE = 200;
let lastTtl = getCacheTtlMs();
let cryptoNewsCache: LRUCache<unknown> | null =
  lastTtl > 0 ? new LRUCache<unknown>(CACHE_MAX_SIZE, lastTtl) : null;

function getCache(): LRUCache<unknown> | null {
  const currentTtl = getCacheTtlMs();
  if (currentTtl <= 0) return null;
  if (!cryptoNewsCache || lastTtl !== currentTtl) {
    lastTtl = currentTtl;
    cryptoNewsCache = new LRUCache<unknown>(CACHE_MAX_SIZE, currentTtl);
  }
  return cryptoNewsCache;
}

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
  count: number;
  source: string;
};

export type CryptoNewsParams = Record<string, string | number | undefined>;

type UpstreamError = {
  error?: {
    message?: string;
  };
};

/**
 * Low-level GET helper. Builds the URL with query params, adds headers,
 * enforces timeouts, and normalizes errors into ServiceResult.
 */
async function fetchCryptoNews<T>(
  path: string,
  params: CryptoNewsParams = {}
): Promise<ServiceResult<T>> {
  const baseUrl = getBaseUrl();
  const urlValidation = validateUrl(baseUrl);
  /* istanbul ignore if -- config is validated at startup; covered by env tests */
  if (!urlValidation.valid) {
    logger.error('Invalid CRYPTO_NEWS_BASE_URL configuration', undefined, {
      url: baseUrl,
      error: urlValidation.error,
    });
    throw new Error(`Invalid CRYPTO_NEWS_BASE_URL: ${urlValidation.error}`);
  }

  const url = new URL(`${baseUrl}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  // Cache key is the path + normalized query, so each distinct request has its
  // own entry and the cache never leaks across different params.
  const cacheKey = url.pathname + url.search;
  const activeCache = getCache();
  if (activeCache) {
    const cached = activeCache.get(cacheKey) as T | undefined;
    if (cached !== undefined) {
      return successResult(cached);
    }
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  const apiKey = getApiKey();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  try {
    const timeoutMs = config.cryptoNews?.timeoutMs ?? 10000;
    const response = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
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
    if (activeCache) {
      activeCache.set(cacheKey, data);
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

  const primaryResult = await fetchCryptoNews<CryptoNewsFeed>('/api/news', {
    limit: options.limit,
    coin: options.coin,
    category: options.category,
    sort: options.sort,
    sources: options.sources,
  });

  if (primaryResult.success) {
    return primaryResult;
  }

  // If primary failed, try RSS and CryptoPanic fallback
  const seenTitles = new Set<string>();
  const combinedArticles: CryptoNewsArticle[] = [];

  try {
    const { getAggregatedRssNews } = await import('./crypto-rss-service.js');
    const rssResult = await getAggregatedRssNews({
      limit,
      coin: options.coin,
      category: options.category,
    });

    if (rssResult.success && Array.isArray(rssResult.data.articles)) {
      for (const art of rssResult.data.articles) {
        const normTitle = (art.title || '').toLowerCase().trim();
        if (normTitle && !seenTitles.has(normTitle)) {
          seenTitles.add(normTitle);
          combinedArticles.push(art);
        }
      }
    }
  } catch {
    // ignore
  }

  if (combinedArticles.length < limit) {
    try {
      const { getCryptoPanicNews } = await import('./cryptopanic-service.js');
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
    } catch {
      // ignore
    }
  }

  if (combinedArticles.length === 0) {
    return primaryResult;
  }

  const finalArticles = combinedArticles.slice(0, limit);

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

  if (upstream.success) {
    return upstream;
  }

  // Fallback: search through live RSS feed articles
  try {
    const { getAggregatedRssNews } = await import('./crypto-rss-service.js');
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
  } catch {
    // ignore
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
  const { getCryptoPanicCurrencies } = await import('./cryptopanic-service.js');
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