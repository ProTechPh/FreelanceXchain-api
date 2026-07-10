# Project API

API documentation for project management in FreelanceXchain. All protected endpoints require a `Bearer` token in the `Authorization` header. Employer-only endpoints enforce role-based access control.

## Table of Contents

- [Endpoints](#endpoints)
  - [GET /api/projects](#get-apiprojects)
  - [GET /api/projects/{id}](#get-apiprojectsid)
  - [POST /api/projects](#post-apiprojects)
  - [PATCH /api/projects/{id}](#patch-apiprojectsid)
  - [POST /api/projects/{id}/milestones](#post-apiprojectsidmilestones)
  - [GET /api/projects/{id}/proposals](#get-apiprojectsidproposals)
- [Schemas](#schemas)
- [Project Status Lifecycle](#project-status-lifecycle)
- [Error Responses](#error-responses)

## Endpoints

### GET /api/projects

List projects with optional filters and pagination.

**Auth:** Not required (public)

**Query Parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| keyword | string | Search in title/description |
| skills | string | Comma-separated skill IDs |
| minBudget | number | Minimum budget filter |
| maxBudget | number | Maximum budget filter |
| limit | integer | Page size (default 20, max 100) |
| continuationToken | string | Pagination token |

**Filter priority:** keyword > skills > budget range > list all open projects.

**Response:** `200 OK`

```json
{
  "items": [/* Project objects */],
  "hasMore": true,
  "continuationToken": "..."
}
```

---

### GET /api/projects/{id}

Retrieve a specific project by ID.

**Auth:** Not required (public)

**Path Parameters:**

| Parameter | Type | Description |
|---|---|---|
| id | UUID | Project ID |

**Response:** `200 OK` -- Project object.
**Errors:** `404` Not found.

---

### POST /api/projects

Create a new project.

**Auth:** Bearer token required. **Role:** employer

**Request Body:**

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| title | string | yes | Min length 5 |
| description | string | yes | Min length 20 |
| requiredSkills | array | yes | Min 1 item; each has `skillId` (UUID) |
| budget | number | yes | Minimum 100 |
| deadline | string | yes | ISO date-time |

**Response:** `201 Created` -- Project object.

```bash
curl -X POST http://localhost:7860/api/projects \
  -H "Authorization: Bearer YOUR_JWT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Sample Project",
    "description": "A detailed description with at least twenty characters",
    "requiredSkills": [{ "skillId": "12345678-1234-1234-1234-123456789012" }],
    "budget": 1000,
    "deadline": "2025-12-31T23:59:59Z"
  }'
```

**Errors:** `400` Validation error (including `INVALID_SKILL`), `401` Unauthorized, `403` Forbidden (non-employer).

---

### PATCH /api/projects/{id}

Update an existing project.

**Auth:** Bearer token required. **Role:** employer (must be project owner)

**Path Parameters:**

| Parameter | Type | Description |
|---|---|---|
| id | UUID | Project ID |

**Request Body** (all fields optional):

| Field | Type | Constraints |
| --- | --- | --- |
| title | string | Min length 5 |
| description | string | Min length 20 |
| requiredSkills | array | Each item has `skillId` (UUID) |
| budget | number | Minimum 100 |
| deadline | string | ISO date-time |
| status | enum | `draft`, `open`, `in_progress`, `completed`, `cancelled` |

**Constraint:** Cannot update if project has accepted proposals (locked). Returns `409 Conflict`.

**Response:** `200 OK` -- Updated Project object.
**Errors:** `400` Validation error, `401` Unauthorized, `404` Not found, `409` Project locked.

---

### POST /api/projects/{id}/milestones

Set milestones for a project. Each milestone defines a deliverable with a budget amount and due date.

**Auth:** Bearer token required. **Role:** employer (must be project owner)

**Path Parameters:**

| Parameter | Type | Description |
|---|---|---|
| id | UUID | Project ID |

**Request Body:**

```json
{
  "milestones": [
    { "title": "Design Phase", "description": "...", "amount": 1000, "dueDate": "2025-06-01T00:00:00Z" },
    { "title": "Development", "description": "...", "amount": 1200, "dueDate": "2025-08-01T00:00:00Z" },
    { "title": "Testing & Delivery", "description": "...", "amount": 800, "dueDate": "2025-09-01T00:00:00Z" }
  ]
}
```

Each milestone requires: `title` (string), `description` (string), `amount` (number, > 0), `dueDate` (ISO date-time).

**Business rule:** Sum of milestone amounts must equal the project budget. Violation returns `400` with error code `MILESTONE_SUM_MISMATCH`.

**Constraint:** Cannot modify milestones if project has accepted proposals (locked).

**Response:** `200 OK` -- Updated Project object with milestones embedded.
**Errors:** `400` Validation error or budget mismatch, `401` Unauthorized, `404` Not found, `409` Project locked.

---

### GET /api/projects/{id}/proposals

List proposals submitted for a specific project.

**Auth:** Bearer token required. **Role:** employer (must be project owner)

**Path Parameters:**

| Parameter | Type | Description |
|---|---|---|
| id | UUID | Project ID |

**Query Parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| limit | integer | Page size (default 20, max 100) |
| continuationToken | string | Pagination token |

**Response:** `200 OK`

```json
{
  "items": [/* Proposal objects */],
  "hasMore": true,
  "continuationToken": "..."
}
```

**Errors:** `400` Invalid UUID, `401` Unauthorized, `404` Not found.

## Schemas

### Project

| Field | Type | Description |
| --- | --- | --- |
| id | UUID | Unique project ID |
| employerId | UUID | Owner's user ID |
| title | string | Project title |
| description | string | Project description |
| requiredSkills | array | Array of `SkillReference` objects |
| budget | number | Project budget |
| deadline | date-time | Project deadline |
| status | enum | See [Project Status Lifecycle](#project-status-lifecycle) |
| milestones | array | Array of `Milestone` objects |
| createdAt | date-time | Creation timestamp |
| updatedAt | date-time | Last update timestamp |

### Milestone

| Field | Type | Description |
| --- | --- | --- |
| id | UUID | Unique milestone ID |
| title | string | Milestone title |
| description | string | Milestone description |
| amount | number | Payment amount |
| dueDate | date-time | Milestone deadline |
| status | enum | `pending`, `in_progress`, `submitted`, `approved`, `disputed` |

### SkillReference

| Field | Type | Description |
| --- | --- | --- |
| skillId | UUID | Skill identifier |
| skillName | string | Display name |
| categoryId | UUID | Skill category |
| yearsOfExperience | number | Required experience |

### Error

```json
{
  "error": { "code": "ERROR_CODE", "message": "Human-readable message", "details": {} },
  "timestamp": "2025-01-01T00:00:00Z",
  "requestId": "req-uuid"
}
```

## Project Status Lifecycle

```mermaid
stateDiagram-v2
    [*] --> draft: Create project
    draft --> open: Publish
    open --> in_progress: Proposal accepted
    in_progress --> completed: Mark complete
    open --> cancelled: Cancel
    in_progress --> cancelled: Cancel
    draft --> cancelled: Cancel
```

**Key constraints:**

- **Creation:** Status defaults to `open` (can be set to `draft`).
- **Lock:** After a proposal is accepted (`in_progress`), the project is locked -- updates and milestone changes return `409 Conflict`.
- **Status transitions via PATCH:** Employers can manually set status to any valid value via `PATCH /api/projects/{id}`, subject to the lock constraint.

## Error Responses

| Code | Meaning | Common Cause |
| --- | --- | --- |
| 400 | Validation error | Missing/invalid fields, min length violations, `MILESTONE_SUM_MISMATCH`, `INVALID_SKILL` |
| 401 | Unauthorized | Missing, expired, or invalid Bearer token |
| 403 | Forbidden | Non-employer accessing employer-only endpoint |
| 404 | Not found | Project or resource ID does not exist |
| 409 | Conflict (locked) | Attempting to update or modify milestones on a project with accepted proposals |

All error responses use the standard error envelope with `error.code`, `error.message`, optional `error.details`, `timestamp`, and `requestId`.

---

[Back to API Reference](README.md)
