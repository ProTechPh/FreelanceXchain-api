# Saved Searches API

API for saving search filters and re-running them later (or receiving scheduled notifications of new matches). All endpoints require JWT Bearer authentication.

## Table of Contents

- [Endpoints](#endpoints)
  - [POST /api/saved-searches](#post-apisaved-searches)
  - [GET /api/saved-searches](#get-apisaved-searches)
  - [PATCH /api/saved-searches/:id](#patch-apisaved-searchesid)
  - [DELETE /api/saved-searches/:id](#delete-apisaved-searchesid)
  - [POST /api/saved-searches/:id/execute](#post-apisaved-searchesidexecute)
- [Schemas](#schemas)
  - [SavedSearch Object](#savedsearch-object)
  - [SavedSearchInput](#savedsearchinput)
- [Search Filters](#search-filters)
  - [Skills — IDs or names, both search types](#skills--ids-or-names-both-search-types)
- [Error Handling](#error-handling)

---

## Endpoints

All endpoints require the header `Authorization: Bearer <JWT>`. Unauthorized requests receive a `401` response.

### POST /api/saved-searches

Create a saved search.

**Request Body:** [SavedSearchInput](#savedsearchinput)

```json
{
  "name": "React freelancers",
  "searchType": "freelancer",
  "filters": {
    "skills": ["skill-id-1", "react", "node"],
    "minHourlyRate": 40
  },
  "notifyOnNew": true
}
```

**Response:**

- `201 Created` — Returns the created [SavedSearch](#savedsearch-object).
- `400 Bad Request` — `name`, `searchType`, or `filters` missing or invalid.
- `401 Unauthorized` — Missing or invalid token.

### GET /api/saved-searches

List the authenticated user's saved searches.

**Query Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `searchType` | `project` \| `freelancer` | No | Filter by search type. |

**Response:**

- `200 OK` — Returns an array of [SavedSearch](#savedsearch-object).
- `401 Unauthorized` — Missing or invalid token.

### PATCH /api/saved-searches/:id

Update a saved search. Only the owner may update it.

**Path Parameters:** `id` — UUID of the saved search.

**Request Body:** Partial [SavedSearchInput](#savedsearchinput).

**Response:**

- `200 OK` — Returns the updated [SavedSearch](#savedsearch-object).
- `400 Bad Request` — Invalid request body.
- `403 Forbidden` — The search belongs to another user.
- `404 Not Found` — No such saved search.

### DELETE /api/saved-searches/:id

Delete a saved search. Only the owner may delete it.

**Path Parameters:** `id` — UUID of the saved search.

**Response:**

- `200 OK` — Deleted.
- `403 Forbidden` — The search belongs to another user.
- `404 Not Found` — No such saved search.

### POST /api/saved-searches/:id/execute

Run a saved search against current data and return matches.

**Path Parameters:** `id` — UUID of the saved search.

**Response:**

- `200 OK` — Returns `{ results, count }` where `results` is an array of [Project](search.md#project) objects for `searchType: "project"` or [FreelancerProfile](search.md#freelancerprofile) objects for `searchType: "freelancer"`.
- `403 Forbidden` — The search belongs to another user.
- `404 Not Found` — No such saved search.

---

## Schemas

### SavedSearch Object

| Field | Type | Description |
| --- | --- | --- |
| `id` | string (uuid) | Saved search ID. |
| `userId` | string (uuid) | Owner's user ID. |
| `name` | string | Display name. |
| `searchType` | `project` \| `freelancer` | What the search targets. |
| `filters` | object | See [Search Filters](#search-filters). |
| `notifyOnNew` | boolean | Whether the scheduler notifies about new matches. |
| `lastNotifiedAt` | string (ISO date) \| null | Dedup watermark of the last notification run. |
| `createdAt` | string (ISO date) | Creation time. |
| `updatedAt` | string (ISO date) | Last update time. |

### SavedSearchInput

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | Display name. |
| `searchType` | `project` \| `freelancer` | Yes | What the search targets. |
| `filters` | object | Yes | See [Search Filters](#search-filters). |
| `notifyOnNew` | boolean | No | Default `false`. |

---

## Search Filters

The `filters` object mirrors the live search API's filters (see [Search API](search.md)) and is stored verbatim on the saved search.

| Key | Type | Supported search types | Description |
| --- | --- | --- | --- |
| `skills` | string[] | **Both** | Skill document IDs, skill names, or a mix. |
| `keyword` | string | project | Case-insensitive match on project title/description. |
| `minBudget` / `maxBudget` | number | project | Budget range (inclusive). |
| `minHourlyRate` / `maxHourlyRate` | number | freelancer | Hourly rate range (inclusive). |

### Skills — IDs or names, both search types

For **both** `searchType: "project"` and `searchType: "freelancer"`, the `skills` array accepts:

- skill document **IDs** (as stored in the `skills` collection),
- skill **names**,
- or a **mix** of both in a single array.

Matching is **case-insensitive**. Examples:

```json
{ "skills": ["skill-id-1"] }                    // project OR freelancer search
{ "skills": ["react", "node"] }                 // names only
{ "skills": ["skill-id-1", "react"] }           // mixed
```

At execution time, skill IDs are resolved against the skills taxonomy to their canonical names before matching — the same semantics as the live `/api/search/freelancers` endpoint. Project documents carry both `skill_id` and `skill_name`, so project searches match either representation directly.

---

## Error Handling

All endpoints share the standard error envelope documented in the [API Reference](README.md#error-response-format). Common codes:

| Code | Meaning |
| --- | --- |
| `AUTH_UNAUTHORIZED` | Missing or invalid token. |
| `VALIDATION_ERROR` | Missing `name`, `searchType`, or `filters`, or a malformed UUID path parameter. |
| `NOT_FOUND` | Saved search does not exist. |
| `UNAUTHORIZED` | The saved search belongs to another user. |
| `INTERNAL_ERROR` | Unexpected server error. |
