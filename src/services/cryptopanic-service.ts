/**
 * CryptoPanic news client — secondary/fallback crypto news source.
 *
 * Docs: https://cryptopanic.com/developers/api/
 *
 * Free tier: public=true, no auth_token required (~50 posts per page).
 * Authenticated tier: set CRYPTOPANIC_AUTH_TOKEN for higher limits and
 * additional filter options (bullish/bearish, rising, hot, etc.).
 *
 * Response articles are normalised into the same CryptoNewsArticle shape
 * used by the primary cryptocurrency.cv service so the aggregation layer
 * can merge results without branching.
 */
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { LRUCache } from '../utils/cache.js';
import { successResult, errorResult } from '../types/service-result.js';
import type { ServiceResult } from '../types/service-result.js';
import type { CryptoNewsArticle, CryptoNewsFeed } from './crypto-news-service.js';

const BASE_URL = (config.cryptoPanic?.baseUrl ?? 'https://cryptopanic.com/api/v1').replace(/\/+$/, '');

// Share the same cache TTL as the primary source.
const CACHE_MAX_SIZE = 100;
const cache =
  (config.cryptoNews?.cacheTtlMs ?? 60000) > 0
    ? new LRUCache<CryptoNewsFeed>(CACHE_MAX_SIZE, config.cryptoNews?.cacheTtlMs ?? 60000)
    : null;

// ---------------------------------------------------------------------------
// CryptoPanic raw response types
// ---------------------------------------------------------------------------
type CryptoPanicSource = { title?: string; region?: string; domain?: string };
type CryptoPanicCurrency = { code?: string; title?: string; slug?: string; url?: string };
type CryptoPanicPost = {
  title?: string;
  url?: string;
  published_at?: string;
  source?: CryptoPanicSource;
  currencies?: CryptoPanicCurrency[];
  kind?: string;         // 'news' | 'media'
  domain?: string;
  slug?: string;
};
type CryptoPanicResponse = {
  results?: CryptoPanicPost[];
  count?: number;
  next?: string | null;
};

// ---------------------------------------------------------------------------
// Normalise a raw CryptoPanic post → CryptoNewsArticle
// ---------------------------------------------------------------------------
function normalisePost(post: CryptoPanicPost): CryptoNewsArticle {
  const coins = post.currencies?.map((c) => c.code).filter(Boolean).join(', ');
  const article: CryptoNewsArticle = {
    title: post.title ?? 'Untitled',
    category: coins ?? post.kind ?? 'crypto',
    // CryptoPanic does not provide article images on the free tier; the
    // frontend falls back to category-based Unsplash images automatically.
  };
  if (post.url !== undefined) { article.url = post.url; article.link = post.url; }
  if (post.published_at !== undefined) article.pubDate = post.published_at;
  const src = post.source?.title ?? post.source?.domain ?? post.domain;
  if (src !== undefined) article.source = src;
  return article;
}

// ---------------------------------------------------------------------------
// Coin-symbol → CryptoPanic currency filter
// CryptoPanic uses uppercase symbols (BTC, ETH, SOL …)
// ---------------------------------------------------------------------------
function buildCurrencies(coin?: string): string | undefined {
  if (!coin) return undefined;
  return coin.toUpperCase();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Currency list — used to build dynamic category pills
// ---------------------------------------------------------------------------
type CryptoPanicCurrencyEntry = {
  code?: string;
  title?: string;
};
type CryptoPanicCurrenciesResponse = {
  results?: CryptoPanicCurrencyEntry[];
};

export type NewsCategoryItem = {
  /** Display label, e.g. "Bitcoin (BTC)" */
  label: string;
  /** Uppercase coin symbol for coin-based filter, e.g. "BTC". Undefined for topic filters. */
  coin?: string;
  /** Keyword for topic-based filtering, e.g. "defi". Undefined for coin filters. */
  filter?: string;
};

const CURRENCIES_CACHE_KEY = '/currencies/';

/**
 * Fetch the top traded currencies from CryptoPanic and map them to
 * NewsCategoryItem objects ready for the frontend category pills.
 */
export async function getCryptoPanicCurrencies(limit = 10): Promise<ServiceResult<NewsCategoryItem[]>> {
  if (cache) {
    const cached = cache.get(CURRENCIES_CACHE_KEY) as unknown as NewsCategoryItem[] | undefined;
    if (cached) return successResult(cached);
  }

  const params = new URLSearchParams({ public: 'true' });
  if (config.cryptoPanic?.authToken) params.set('auth_token', config.cryptoPanic.authToken);

  const url = `${BASE_URL}/currencies/?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(config.cryptoPanic?.timeoutMs ?? 8000),
    });

    if (!response.ok) {
      logger.warn('CryptoPanic currencies upstream error', { status: response.status });
      return errorResult('UPSTREAM_ERROR', `CryptoPanic responded with status ${response.status}`);
    }

    const data = (await response.json()) as CryptoPanicCurrenciesResponse;
    const results = data.results ?? [];

    const categories: NewsCategoryItem[] = results.slice(0, limit).map((c) => {
      const code = (c.code ?? '').toUpperCase();
      const title = c.title ?? code;
      return { label: `${title} (${code})`, coin: code };
    });

    if (cache) cache.set(CURRENCIES_CACHE_KEY, categories as unknown as CryptoNewsFeed);
    return successResult(categories);
  } catch (error) {
    logger.error('CryptoPanic currencies request failed', error as Error);
    return errorResult(
      'UPSTREAM_UNAVAILABLE',
      error instanceof Error ? error.message : 'Failed to reach CryptoPanic',
    );
  }
}

/**
 * Fetch the latest posts from CryptoPanic and return them as a CryptoNewsFeed.
 *
 * @param limit   Maximum articles to return (default 20).
 * @param coin    Optional uppercase coin symbol, e.g. 'BTC'.
 * @param filter  Optional CryptoPanic filter: 'rising'|'hot'|'bullish'|'bearish'|'important'|'lol'.
 */
export async function getCryptoPanicNews(options: {
  limit?: number;
  coin?: string;
  filter?: string;
} = {}): Promise<ServiceResult<CryptoNewsFeed>> {
  const { limit = 20, coin, filter } = options;

  const params = new URLSearchParams();
  params.set('public', 'true');
  if (config.cryptoPanic?.authToken) {
    params.set('auth_token', config.cryptoPanic.authToken);
  }
  const currencies = buildCurrencies(coin);
  if (currencies) params.set('currencies', currencies);
  if (filter) params.set('filter', filter);

  const cacheKey = `/posts/?${params.toString()}`;
  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return successResult(cached);
  }

  const url = `${BASE_URL}/posts/?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(config.cryptoPanic?.timeoutMs ?? 8000),
    });

    if (!response.ok) {
      logger.warn('CryptoPanic upstream error', { status: response.status });
      return errorResult('UPSTREAM_ERROR', `CryptoPanic responded with status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return errorResult('UPSTREAM_ERROR', 'CryptoPanic returned a non-JSON response.');
    }

    const data = (await response.json()) as CryptoPanicResponse;
    const rawPosts = data.results ?? [];

    const articles: CryptoNewsArticle[] = rawPosts
      .slice(0, limit)
      .map(normalisePost);

    const feed: CryptoNewsFeed = {
      articles,
      count: articles.length,
      source: 'cryptopanic',
    };

    if (cache) cache.set(cacheKey, feed);
    return successResult(feed);
  } catch (error) {
    logger.error('CryptoPanic upstream request failed', error as Error);
    return errorResult(
      'UPSTREAM_UNAVAILABLE',
      error instanceof Error ? error.message : 'Failed to reach CryptoPanic',
    );
  }
}
