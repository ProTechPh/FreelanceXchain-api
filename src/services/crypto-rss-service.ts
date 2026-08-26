/**
 * Crypto RSS Feed Aggregator — pulls live articles directly from top crypto
 * news RSS feeds (CoinTelegraph, Decrypt) to provide rich, multi-source news
 * feeds with 30+ articles even on free hosting without strict third-party API limits.
 */
import { logger } from '../config/logger.js';
import { LRUCache } from '../utils/cache.js';
import { successResult } from '../types/service-result.js';
import type { ServiceResult } from '../types/service-result.js';
import type { CryptoNewsArticle, CryptoNewsFeed } from './crypto-news-service.js';

const CACHE_TTL_MS = 60 * 1000; // 1 minute
const rssCache = new LRUCache<CryptoNewsFeed>(20, CACHE_TTL_MS);

const RSS_FEEDS = [
  {
    name: 'Cointelegraph',
    url: 'https://cointelegraph.com/rss',
    defaultCategory: 'Crypto News',
  },
  {
    name: 'Decrypt',
    url: 'https://decrypt.co/feed',
    defaultCategory: 'Web3 & Tech',
  },
];

/**
 * Strip CDATA wrappers and decode basic HTML entities
 */
function cleanText(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

/**
 * Parse an XML item block into a CryptoNewsArticle
 */
function parseRssItem(itemXml: string, sourceName: string, defaultCategory: string): CryptoNewsArticle | null {
  const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
  const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
  const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
  const categoryMatch = itemXml.match(/<category>([\s\S]*?)<\/category>/i);
  const creatorMatch = itemXml.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/i);
  const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/i);

  // Extract images from media:content, enclosure, or <img src="..."> in description
  const mediaMatch =
    itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/i) ||
    itemXml.match(/<enclosure[^>]+url=["']([^"']+)["']/i) ||
    itemXml.match(/<img[^>]+src=["']([^"']+)["']/i);

  const title = cleanText(titleMatch?.[1]);
  if (!title) return null;

  const url = cleanText(linkMatch?.[1]);
  const pubDate = pubDateMatch?.[1] ? new Date(pubDateMatch[1]).toISOString() : new Date().toISOString();
  const rawDesc = descMatch?.[1] || '';
  const description = cleanText(rawDesc);
  const category = cleanText(categoryMatch?.[1]) || defaultCategory;
  const author = cleanText(creatorMatch?.[1]);
  const imageUrl = mediaMatch?.[1];

  const article: CryptoNewsArticle = {
    title,
    category,
    pubDate,
    source: author ? `${sourceName} (${author})` : sourceName,
  };

  if (url) {
    article.url = url;
    article.link = url;
  }
  if (description) {
    article.summary = description;
    article.description = description;
  }
  if (imageUrl) {
    article.image = imageUrl;
    article.imageUrl = imageUrl;
    article.urlToImage = imageUrl;
  }

  return article;
}

/**
 * Fetch and parse a single RSS feed
 */
async function fetchRssFeed(feed: typeof RSS_FEEDS[0]): Promise<CryptoNewsArticle[]> {
  try {
    const res = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      logger.warn(`[crypto-rss] feed returned status ${res.status}: ${feed.name}`);
      return [];
    }

    const xml = await res.text();
    const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

    const articles: CryptoNewsArticle[] = [];
    for (const itemXml of itemMatches) {
      const parsed = parseRssItem(itemXml, feed.name, feed.defaultCategory);
      if (parsed) articles.push(parsed);
    }

    return articles;
  } catch (err) {
    logger.warn(`[crypto-rss] failed to fetch feed ${feed.name}:`, err as Record<string, unknown>);
    return [];
  }
}

/**
 * Fetch all RSS feeds in parallel, deduplicate and return aggregated feed
 */
export async function getAggregatedRssNews(options: {
  limit?: number | undefined;
  coin?: string | undefined;
  category?: string | undefined;
} = {}): Promise<ServiceResult<CryptoNewsFeed>> {
  const { limit = 30, coin, category } = options;
  const cacheKey = `rss:${coin ?? ''}:${category ?? ''}:${limit}`;

  const cached = rssCache.get(cacheKey);
  if (cached) return successResult(cached);

  const results = await Promise.allSettled(RSS_FEEDS.map(fetchRssFeed));
  let allArticles: CryptoNewsArticle[] = [];

  for (const r of results) {
    if (r.status === 'fulfilled') {
      allArticles.push(...r.value);
    }
  }

  // Sort latest by publication date
  allArticles.sort((a, b) => {
    const timeA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const timeB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return timeB - timeA;
  });

  // Filter by coin or keyword if provided
  if (coin) {
    const coinLower = coin.toLowerCase();
    allArticles = allArticles.filter(
      (a) =>
        a.title.toLowerCase().includes(coinLower) ||
        (a.summary && a.summary.toLowerCase().includes(coinLower)) ||
        (a.category && a.category.toLowerCase().includes(coinLower))
    );
  } else if (category && category.toLowerCase() !== 'all news') {
    const catLower = category.toLowerCase();
    allArticles = allArticles.filter(
      (a) =>
        a.title.toLowerCase().includes(catLower) ||
        (a.summary && a.summary.toLowerCase().includes(catLower)) ||
        (a.category && a.category.toLowerCase().includes(catLower))
    );
  }

  const sliced = allArticles.slice(0, limit);
  const feed: CryptoNewsFeed = {
    articles: sliced,
    count: sliced.length,
    source: 'Cointelegraph & Decrypt Live Feeds',
  };

  rssCache.set(cacheKey, feed);
  return successResult(feed);
}
