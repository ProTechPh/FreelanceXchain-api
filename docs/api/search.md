# Search API

The Search API provides endpoints to discover projects and freelancers using keyword, skill, and budget filters with cursor-based pagination.

## Table of Contents

- [Endpoints](#endpoints)
  - [GET /api/search/projects](#get-apisearchprojects)
  - [GET /api/search/freelancers](#get-apisearchfreelancers)
- [Schemas](#schemas)
  - [SearchResultMetadata](#searchresultmetadata)
  - [ProjectSearchResult](#projectsearchresult)
  - [FreelancerSearchResult](#freelancersearchresult)
  - [Project](#project)
  - [FreelancerProfile](#freelancerprofile)
- [Search Filters](#search-filters)
- [Pagination](#pagination)
- [Error Handling](#error-handling)

## Endpoints

### GET /api/search/projects

Search for projects with keyword, skill, and budget filters.

**Auth:** None required (public endpoint).

**Rate Limit:** Subject to the global API rate limiter.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `keyword` | string | No | - | Case-insensitive search across project title and description |
| `skills` | string | No | - | Comma-separated skill IDs to filter by |
| `minBudget` | number | No | - | Minimum budget (inclusive) |
| `maxBudget` | number | No | - | Maximum budget (inclusive) |
| `pageSize` | integer | No | 20 | Results per page (1-100) |
| `continuationToken` | string | No | - | Pagination offset token |

**Response:** `200 OK` with [ProjectSearchResult](#projectsearchresult)

**Request Examples:**

```
GET /api/search/projects?keyword=web+development&pageSize=10
GET /api/search/projects?skills=123e4567-e89b-12d3-a456-426614174000&pageSize=15
GET /api/search/projects?minBudget=1000&maxBudget=5000
GET /api/search/projects?keyword=mobile+app&skills=skill-id-1&minBudget=2000&maxBudget=8000&pageSize=25
```

---

### GET /api/search/freelancers

Search for freelancers with keyword and skill filters.

**Auth:** None required (public endpoint).

**Rate Limit:** Subject to the global API rate limiter.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `keyword` | string | No | - | Case-insensitive search on freelancer bio |
| `skills` | string | No | - | Comma-separated skill IDs to filter by |
| `pageSize` | integer | No | 20 | Results per page (1-100) |
| `continuationToken` | string | No | - | Pagination offset token |

**Response:** `200 OK` with [FreelancerSearchResult](#freelancersearchresult)

**Request Examples:**

```
GET /api/search/freelancers?keyword=full+stack+developer&pageSize=15
GET /api/search/freelancers?skills=skill-id-1,skill-id-2&pageSize=20
GET /api/search/freelancers?keyword=senior+developer&skills=skill-id-1&pageSize=25
```

## Schemas

### SearchResultMetadata

```json
{
  "pageSize": 20,
  "hasMore": true,
  "continuationToken": "20"
}
```

| Field | Type | Description |
| --- | --- | --- |
| `pageSize` | integer | Number of items returned per page |
| `hasMore` | boolean | Whether additional pages exist |
| `continuationToken` | string | Pass as the `continuationToken` query parameter to fetch the next page |

### ProjectSearchResult

```json
{
  "items": [ ... ],
  "metadata": { "pageSize": 20, "hasMore": true, "continuationToken": "20" }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `items` | Project[] | Array of matching projects |
| `metadata` | SearchResultMetadata | Pagination metadata |

### FreelancerSearchResult

```json
{
  "items": [ ... ],
  "metadata": { "pageSize": 20, "hasMore": true, "continuationToken": "20" }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `items` | FreelancerProfile[] | Array of matching freelancers |
| `metadata` | SearchResultMetadata | Pagination metadata |

### Project

| Field | Type | Description |
| --- | --- | --- |
| `id` | string (UUID) | Project ID |
| `employerId` | string (UUID) | Employer who created the project |
| `title` | string | Project title |
| `description` | string | Project description |
| `requiredSkills` | Skill[] | Array of required skills (each has `skillId`, `skillName`, `categoryId`, `yearsOfExperience`) |
| `budget` | number | Project budget |
| `deadline` | string (ISO 8601) | Project deadline |
| `status` | string | Project status (e.g. `open`) |
| `milestones` | Milestone[] | Array of milestones (each has `id`, `title`, `description`, `amount`, `dueDate`, `status`) |
| `createdAt` | string (ISO 8601) | Creation timestamp |
| `updatedAt` | string (ISO 8601) | Last update timestamp |

### FreelancerProfile

| Field | Type | Description |
| --- | --- | --- |
| `id` | string (UUID) | Profile ID |
| `userId` | string (UUID) | Associated user ID |
| `bio` | string | Freelancer bio |
| `hourlyRate` | number | Hourly rate |
| `skills` | Skill[] | Array of skills (each has `name`, `yearsOfExperience`) |
| `experience` | Experience[] | Work history (each has `id`, `title`, `company`, `description`, `startDate`, `endDate`) |
| `availability` | string | Availability status (e.g. `available`) |
| `createdAt` | string (ISO 8601) | Creation timestamp |
| `updatedAt` | string (ISO 8601) | Last update timestamp |

## Search Filters

Both endpoints use the same general approach to filtering:

- **Keyword:** Case-insensitive partial text match (`ILIKE`). For projects, matches against `title` and `description`. For freelancers, matches against `bio`.
- **Skills:** Comma-separated skill IDs. For projects, matches against `requiredSkills[].skillId`. For freelancers, matched by skill name after ID-to-name resolution.
- **Budget range** (projects only): `minBudget` and `maxBudget` filter projects whose budget falls within the range (inclusive).

When a single filter is provided, the query is optimized at the database level. When multiple filters are combined, the service fetches all open results and applies filters in memory.

## Pagination

Both endpoints support cursor-based pagination:

1. Send an initial request without `continuationToken` to get the first page.
2. If `metadata.hasMore` is `true`, pass `metadata.continuationToken` as the `continuationToken` query parameter to fetch the next page.
3. Repeat until `hasMore` is `false`.

The `continuationToken` value represents a numeric offset. `pageSize` is clamped to 1-100 (defaults to 20).

## Error Handling

All error responses follow this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "pageSize must be a positive integer"
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "requestId": "abc-123"
}
```

| Status | Code | Cause |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid query parameter (e.g. non-numeric budget, non-positive pageSize) |
| 400 | Service error | Internal search service failure |

---

[Back to API Reference](README.md)
