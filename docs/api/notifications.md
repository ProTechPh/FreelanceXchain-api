# Notifications API

API for retrieving, marking as read, and counting unread notifications. All endpoints require JWT Bearer authentication.

## Table of Contents

- [Endpoints](#endpoints)
  - [GET /api/notifications](#get-apinotifications)
  - [GET /api/notifications/unread-count](#get-apinotificationsunread-count)
  - [PATCH /api/notifications/:id/read](#patch-apinotificationsidread)
  - [PATCH /api/notifications/read-all](#patch-apinotificationsread-all)
- [Schemas](#schemas)
  - [Notification Object](#notification-object)
  - [Notification Types](#notification-types)
  - [List Response](#list-response)
  - [Unread Count Response](#unread-count-response)
  - [Error Response](#error-response)
- [Pagination](#pagination)
- [Client Implementation Notes](#client-implementation-notes)

---

## Endpoints

All endpoints require the header `Authorization: Bearer <JWT>`. Unauthorized requests receive a `401` response.

### GET /api/notifications

Retrieve notifications for the authenticated user, sorted newest first.

**Query Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| maxItemCount | integer (1-100) | No | Number of items per page. |
| continuationToken | string | No | Pagination token from a previous response. |

**Response:**

- `200 OK` -- Returns a [List Response](#list-response).
- `401 Unauthorized` -- Missing or invalid token.

**Example:**

```
GET /api/notifications?maxItemCount=20
Authorization: Bearer <token>
```

```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "type": "proposal_received",
      "title": "New Proposal Received",
      "message": "A freelancer submitted a proposal for your project.",
      "data": { "projectId": "...", "proposalId": "..." },
      "isRead": false,
      "createdAt": "2026-06-15T10:30:00.000Z"
    }
  ],
  "hasMore": true,
  "total": 120
}
```

---

### GET /api/notifications/unread-count

Get the count of unread notifications for the authenticated user. Designed for lightweight badge updates.

**Query Parameters:** None.

**Response:**

- `200 OK` -- `{ "count": 5 }`
- `401 Unauthorized` -- Missing or invalid token.

---

### PATCH /api/notifications/:id/read

Mark a specific notification as read. Enforces ownership -- only the notification's owner can mark it read.

**Path Parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| id | string (UUID) | Notification ID. |

**Response:**

- `200 OK` -- Updated [Notification Object](#notification-object).
- `400 Bad Request` -- Invalid UUID format.
- `401 Unauthorized` -- Missing or invalid token.
- `403 Forbidden` -- Notification belongs to another user.
- `404 Not Found` -- Notification does not exist.

**Note:** This endpoint is idempotent. Marking an already-read notification as read returns the same result without extra writes.

---

### PATCH /api/notifications/read-all

Mark all unread notifications for the authenticated user as read in a single bulk operation.

**Query Parameters:** None.

**Response:**

- `200 OK` -- `{ "count": 12 }` (number of notifications marked read).
- `401 Unauthorized` -- Missing or invalid token.

---

## Schemas

### Notification Object

| Field | Type | Description |
| --- | --- | --- |
| id | string (UUID) | Unique notification ID. |
| userId | string (UUID) | Owner user ID. |
| type | enum | Notification type (see below). |
| title | string | Notification title. |
| message | string | Notification body text. |
| data | object | Arbitrary JSON payload with context (e.g., projectId, milestoneId). |
| isRead | boolean | Whether the notification has been read. |
| createdAt | string (ISO 8601) | Creation timestamp. |

### Notification Types

| Type | Trigger |
| --- | --- |
| proposal_received | Freelancer submits a proposal. |
| proposal_accepted | Employer accepts a proposal. |
| proposal_rejected | Employer rejects a proposal. |
| milestone_submitted | Freelancer submits a milestone. |
| milestone_approved | Employer approves a milestone. |
| payment_released | Payment for a milestone is released. |
| dispute_created | A dispute is opened. |
| dispute_resolved | A dispute is resolved. |
| rating_received | User receives a rating. |
| message | General message notification. |

### List Response

Returned by `GET /api/notifications`:

```json
{
  "items": "Notification[]",
  "hasMore": "boolean",
  "total": "number (optional)"
}
```

### Unread Count Response

Returned by `GET /api/notifications/unread-count`:

```json
{
  "count": "number"
}
```

### Error Response

Returned on non-2xx responses:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": []
  },
  "timestamp": "string (ISO 8601)",
  "requestId": "string (UUID)"
}
```

---

## Pagination

- Results are ordered by `created_at DESC`.
- `maxItemCount` controls page size (1--100, default set by server).
- `hasMore` indicates whether additional pages exist.
- `total` may be included depending on query mode.
- Pass `continuationToken` from a previous response to fetch the next page.

---

## Client Implementation Notes

- **Polling:** Poll `GET /api/notifications/unread-count` every 15--30 seconds for badge updates. Debounce rapid updates to reduce network overhead.
- **Mark as read:** On success, update the local item to `isRead: true` and decrement the unread count in the UI.
- **Read all:** After `PATCH /read-all`, reset the unread badge to zero and update all cached items.
- **Optimistic updates:** For mark-as-read, update the UI immediately before the server responds. Roll back on error.
- **Infinite scroll:** Use `maxItemCount` + `continuationToken`. Stop loading when `hasMore` is `false`.
- **Real-time:** If WebSocket or SSE is available, merge incoming events with cached items and deduplicate by `id`.

---

[Back to API Reference](README.md)
