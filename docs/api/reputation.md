# Reputation API

The reputation system provides on-chain rating storage and retrieval for the FreelanceXchain platform. Users can submit ratings after contract completion, view reputation scores with time-decayed weighting, and browse work history. Ratings are stored immutably via the `FreelanceReputation.sol` smart contract.

## Table of Contents

1. [Endpoints](#endpoints)
   - [GET /api/reputation/:userId](#get-apireputationuserid)
   - [GET /api/reputation/:userId/score](#get-apireputationuseridscore)
   - [GET /api/reputation/:userId/breakdown](#get-apireputationuseridbreakdown)
   - [GET /api/reputation/:userId/reputation-history](#get-apireputationuseridreputation-history)
   - [GET /api/reputation/:userId/history](#get-apireputationuseridhistory)
   - [GET /api/reputation/leaderboard](#get-apireputationleaderboard)
   - [GET /api/reputation/can-rate](#get-apireputationcan-rate)
   - [POST /api/reputation/rate](#post-apireputationrate)
2. [Schemas](#schemas)
3. [Error Codes](#error-codes)

## Endpoints

### GET /api/reputation/:userId

Retrieve a user's reputation score and all blockchain-stored ratings.

- **Auth:** None (public)
- **Path params:**
  - `userId` — UUID, required
- **Success response (200):**

  ```json
  {
    "userId": "uuid",
    "score": 4.25,
    "totalRatings": 12,
    "averageRating": 4.33,
    "ratings": [ ... ]
  }
  ```

  - `score`: weighted average with time decay (lambda = 0.01)
  - `averageRating`: simple arithmetic mean
- **Errors:** 400 invalid UUID, 404 user not found

---

### GET /api/reputation/:userId/score

Get the aggregated reputation score for a user.

- **Auth:** None (public)
- **Path params:**
  - `userId` — UUID, required
- **Success response (200):** aggregated score object
- **Errors:** 400 invalid UUID or service error

---

### GET /api/reputation/:userId/breakdown

Get reputation breakdown by star rating (distribution of 1-5 star ratings).

- **Auth:** None (public)
- **Path params:**
  - `userId` — UUID, required
- **Success response (200):** breakdown by stars object

---

### GET /api/reputation/:userId/reputation-history

Get reputation history over time (monthly aggregation).

- **Auth:** None (public)
- **Path params:**
  - `userId` — UUID, required
- **Query params:**
  - `months` — integer, default 12
- **Success response (200):** reputation history array

---

### GET /api/reputation/:userId/history

Retrieve work history for a user: completed contracts with project metadata and ratings.

- **Auth:** None (public)
- **Path params:**
  - `userId` — UUID, required
- **Success response (200):** array of `WorkHistoryEntry`
- **Errors:** 400 invalid UUID

---

### GET /api/reputation/leaderboard

Get the platform reputation leaderboard of top-rated users.

- **Auth:** None (public)
- **Query params:**
  - `limit` — integer, default 10
- **Success response (200):** array of top users with reputation scores

---

### GET /api/reputation/can-rate

Check if the authenticated user can rate another user for a specific contract.

- **Auth:** JWT Bearer token required
- **Query params:**
  - `contractId` — UUID, required
  - `rateeId` — UUID, required
- **Success response (200):**

  ```json
  { "canRate": true }
  ```

  or

  ```json
  { "canRate": false, "reason": "Already rated" }
  ```

- **Errors:** 400 missing params, 401 unauthorized

---

### POST /api/reputation/rate

Submit a rating for another user after contract completion. Rating must be an integer between 1 and 5.

- **Auth:** JWT Bearer token required
- **Request body:**

  ```json
  {
    "contractId": "uuid",
    "rateeId": "uuid",
    "rating": 5,
    "comment": "Great work"
  }
  ```

- **Validations:**
  - `contractId`, `rateeId`, `rating` are required
  - `contractId` and `rateeId` must be valid UUIDs
  - `rating` must be an integer 1-5
  - Rater and ratee must be contract participants
  - Cannot rate yourself
  - One rating per rater/ratee/contract combination
- **Success response (201):**

  ```json
  {
    "rating": { ... },
    "transactionHash": "0x..."
  }
  ```

- **Errors:**
  - 400: missing fields, invalid UUID, or invalid rating
  - 401: missing or invalid JWT
  - 403: not a contract participant or self-rating attempt
  - 404: contract not found
  - 409: duplicate rating

## Schemas

### BlockchainRating

| Field            | Type    | Description                          |
|------------------|---------|--------------------------------------|
| `id`             | string  | Rating UUID                          |
| `contractId`     | string  | UUID of the associated contract      |
| `raterId`        | string  | UUID of the user who submitted rating|
| `rateeId`        | string  | UUID of the user being rated         |
| `rating`         | integer | 1-5                                  |
| `comment`        | string  | Optional comment                     |
| `timestamp`      | integer | Unix timestamp                       |
| `transactionHash`| string  | Blockchain transaction hash          |

### ReputationScore

| Field           | Type              | Description                          |
|-----------------|-------------------|--------------------------------------|
| `userId`        | string            | UUID of the user                     |
| `score`         | number            | Weighted average with time decay     |
| `totalRatings`  | integer           | Total number of ratings              |
| `averageRating` | number            | Simple average (no time decay)       |
| `ratings`       | BlockchainRating[]| All ratings for the user             |

### WorkHistoryEntry

| Field          | Type    | Description                                |
|----------------|---------|--------------------------------------------|
| `contractId`   | string  | UUID of the contract                       |
| `projectId`    | string  | UUID of the project                        |
| `projectTitle` | string  | Project title                              |
| `role`         | string  | `"freelancer"` or `"employer"`             |
| `completedAt`  | string  | ISO 8601 datetime                          |
| `rating`       | integer | 1-5 (optional, the rating received)        |
| `ratingComment`| string  | Optional comment from the rater            |

### RatingInput

| Field        | Type    | Required | Description               |
|--------------|---------|----------|---------------------------|
| `contractId` | string  | Yes      | UUID of the contract      |
| `rateeId`    | string  | Yes      | UUID of the user to rate  |
| `rating`     | integer | Yes      | 1-5                       |
| `comment`    | string  | No       | Optional feedback         |

## Error Codes

| Code                | HTTP Status | Meaning                                    |
|---------------------|-------------|--------------------------------------------|
| `VALIDATION_ERROR`  | 400         | Missing or invalid fields                  |
| `INVALID_UUID`      | 400         | Path or body parameter is not a valid UUID |
| `NOT_FOUND`         | 404         | Contract or user not found                 |
| `AUTH_UNAUTHORIZED` | 401         | Missing or invalid JWT                     |
| `UNAUTHORIZED`      | 403         | Not a contract participant or self-rating  |
| `DUPLICATE_RATING`  | 409         | Already rated for this contract            |

---

[Back to API Reference](README.md)
