# Crypto News API

The Crypto News API proxies the free [cryptocurrency.cv](https://cryptocurrency.cv/developers) news API so your frontend never talks to the upstream directly. The API key (if any) stays server-side, query parameters are validated, and upstream failures are normalized into the standard error envelope.

All endpoints are public (no authentication required) and return the upstream `cryptocurrency.cv` response shape untouched. They are rate-limited by the global API limiter.

## Table of Contents

- [Configuration](#configuration)
- [Endpoints](#endpoints)
  - [GET /api/crypto-news/news](#get-apicrypto-newsnews)
  - [GET /api/crypto-news/search](#get-apicrypto-newssearch)
  - [GET /api/crypto-news/sentiment](#get-apicrypto-newssentiment)
  - [GET /api/crypto-news/digest](#get-apicrypto-newsdigest)
  - [GET /api/crypto-news/prices](#get-apicrypto-newsprices)
  - [GET /api/crypto-news/fear-greed](#get-apicrypto-newsfear-greed)
  - [GET /api/crypto-news/global](#get-apicrypto-newsglobal)
  - [GET /api/crypto-news/movers](#get-apicrypto-newsmovers)
- [Error Handling](#error-handling)

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `CRYPTO_NEWS_BASE_URL` | `https://cryptocurrency.cv` | Upstream free crypto news API |
| `CRYPTO_NEWS_API_KEY` | unset | Optional API key, sent as the `X-API-Key` header (unlocks premium endpoints / higher rate limits) |
| `CRYPTO_NEWS_TIMEOUT_MS` | `10000` | Upstream request timeout |
| `CRYPTO_NEWS_CACHE_TTL_MS` | `60000` | In-memory response cache TTL in ms (`0` disables caching) |

## Caching

Responses are cached in memory for `CRYPTO_NEWS_CACHE_TTL_MS` (default 60 seconds), keyed by endpoint + query parameters. Repeated frontend calls for the same request are served from cache instead of hitting the upstream rate limit. Only successful responses are cached — upstream errors are never cached, so a transient outage resolves on the next request. Set `CRYPTO_NEWS_CACHE_TTL_MS=0` to disable caching. Because the cache is in-memory, it is per-process and resets on restart.

## Endpoints

### GET /api/crypto-news/news

Latest crypto news from 300+ sources.

**Query Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | integer | No | Maximum number of articles (1-100) |
| `coin` | string | No | Coin symbol to filter by (e.g. `BTC`, `ETH`) |
| `sort` | string | No | Sort field |
| `sources` | string | No | Comma-separated list of news sources |

**Request Examples:**

```
GET /api/crypto-news/news?limit=10
GET /api/crypto-news/news?coin=BTC&limit=5
```

**Response:** `200 OK` — an object with an `articles` array:

```json
{
  "articles": [
    {
      "title": "Bitcoin Surges Past $95K as Institutional Demand Grows",
      "source": "CoinDesk",
      "link": "https://coindesk.com/...",
      "pubDate": "2026-03-01T14:30:00Z",
      "category": "bitcoin",
      "sentiment": "positive"
    }
  ],
  "count": 1,
  "source": "aggregated"
}
```

### GET /api/crypto-news/search

Full-text search across crypto news, articles, and market data.

**Query Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `q` | string | Yes | Search query |
| `limit` | integer | No | Maximum number of results (1-100) |

**Request Example:**

```
GET /api/crypto-news/search?q=ethereum%20etf&limit=10
```

### GET /api/crypto-news/sentiment

Market sentiment analysis and indicators.

**Query Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | integer | No | Maximum number of results (1-100) |
| `asset` | string | No | Asset identifier (e.g. `BTC`, `ETH`) |

### GET /api/crypto-news/digest

Daily crypto market digest.

**Query Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `period` | string | No | Time period for data aggregation (e.g. `24h`) |
| `format` | string | No | Response format (e.g. `full`) |

### GET /api/crypto-news/prices

Real-time cryptocurrency prices.

**Query Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `coins` | string | No | Comma-separated cryptocurrency identifiers (e.g. `bitcoin,ethereum`) |

### GET /api/crypto-news/fear-greed

Current crypto Fear & Greed index.

### GET /api/crypto-news/global

Global cryptocurrency market statistics (market cap, dominance, volume).

### GET /api/crypto-news/movers

Top gaining and losing cryptocurrencies by timeframe.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `direction` | string | No | `gainers` | `gainers` or `losers` |
| `limit` | integer | No | - | Maximum number of results (1-100) |
| `timeframe` | string | No | - | Time period (e.g. `1h`, `24h`, `7d`, `30d`) |

## Error Handling

All error responses follow the standard envelope:

```json
{
  "error": {
    "code": "UPSTREAM_UNAVAILABLE",
    "message": "Failed to reach the crypto news API"
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "requestId": "abc-123"
}
```

| Status | Code | Cause |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid query parameter (e.g. `limit` outside 1-100, missing `q`) |
| 502 | `UPSTREAM_ERROR` | Upstream returned a non-2xx or non-JSON response |
| 502 | `UPSTREAM_UNAVAILABLE` | Upstream could not be reached (network error or timeout) |

---

[Back to API Reference](README.md)
