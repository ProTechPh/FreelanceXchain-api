# Proposals API

The Proposals API enables freelancers to submit proposals for open projects and employers to review, accept, or reject them. Accepting a proposal reserves a hiring slot and creates a contract in `negotiating`, where both parties agree on terms, sign, and the employer funds the escrow (see the [Contract API](contracts.md#negotiation-and-e-signature-endpoints)). All endpoints require a valid JWT Bearer token in the `Authorization` header.

## Table of Contents

- [Endpoints](#endpoints)
  - [POST /api/proposals](#post-apiproposals)
  - [GET /api/proposals/{id}](#get-apiproposalsid)
  - [GET /api/proposals/freelancer/me](#get-apiproposalsfreelancerme)
  - [GET /api/projects/{id}/proposals](#get-apiprojectsidproposals)
  - [POST /api/proposals/{id}/accept](#post-apiproposalsidaccept)
  - [POST /api/proposals/{id}/reject](#post-apiproposalsidreject)
  - [POST /api/proposals/{id}/withdraw](#post-apiproposalsidwithdraw)
  - [GET /api/proposals/{id}/with-employer-history](#get-apiproposalsidwith-employer-history)
- [Schemas](#schemas)
  - [Proposal](#proposal)
  - [Contract](#contract)
  - [EmployerHistory](#employerhistory)
- [Status Lifecycle](#status-lifecycle)
- [Error Codes](#error-codes)

## Endpoints

### POST /api/proposals

Submit a new proposal for an open project.

| | |
| --- | --- |
| **Auth** | JWT Bearer token |
| **Role** | `freelancer` |
| **Rate Limit** | Standard |

**Request Body**

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| `projectId` | string | yes | Valid UUID |
| `coverLetter` | string | yes | Min 10 characters |
| `proposedRate` | number | yes | >= 1 |
| `estimatedDuration` | number | yes | >= 1 (days) |

**Responses**

| Status | Description |
| --- | --- |
| 201 | Proposal created. Returns the [Proposal](#proposal) object. |
| 400 | Validation error (invalid fields) |
| 401 | Missing or invalid token |
| 404 | Project not found or not open |
| 409 | Duplicate -- freelancer already submitted a proposal for this project |

---

### GET /api/proposals/{id}

Retrieve a single proposal by its ID. Any authenticated user can access this endpoint.

| | |
| --- | --- |
| **Auth** | JWT Bearer token |
| **Role** | Any authenticated user |

**Path Parameters**

| Param | Type | Description |
|---|---|---|
| `id` | UUID | Proposal ID |

**Responses**

| Status | Description |
| --- | --- |
| 200 | Returns the [Proposal](#proposal) object. |
| 400 | Invalid UUID format |
| 401 | Missing or invalid token |
| 404 | Proposal not found |

---

### GET /api/proposals/freelancer/me

List all proposals submitted by the authenticated freelancer.

| | |
| --- | --- |
| **Auth** | JWT Bearer token |
| **Role** | `freelancer` |

**Responses**

| Status | Description |
| --- | --- |
| 200 | Array of [Proposal](#proposal) objects. |
| 401 | Missing or invalid token |
| 403 | Caller does not have the `freelancer` role |

---

### GET /api/projects/{id}/proposals

List all proposals for a project. Only the project owner (employer) can access this endpoint.

| | |
| --- | --- |
| **Auth** | JWT Bearer token |
| **Role** | `employer` (must own the project) |

**Path Parameters**

| Param | Type | Description |
|---|---|---|
| `id` | UUID | Project ID |

**Query Parameters**

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| `limit` | integer | 20 | Number of items per page |
| `continuationToken` | string | -- | Token for fetching the next page |

**Responses**

| Status | Description |
| --- | --- |
| 200 | `{ items: Proposal[], hasMore: boolean, continuationToken: string }` |
| 400 | Invalid UUID format |
| 401 | Missing or invalid token |
| 403 | Caller does not own the project |
| 404 | Project not found |

---

### POST /api/proposals/{id}/accept

Accept a pending proposal. Creates a contract in `negotiating` and reserves one of the project's hiring slots. The project stays `open` until every slot has a funded contract.

| | |
| --- | --- |
| **Auth** | JWT Bearer token |
| **Role** | `employer` (must own the project) |

**Path Parameters**

| Param | Type | Description |
|---|---|---|
| `id` | UUID | Proposal ID |

**Responses**

| Status | Description |
| --- | --- |
| 200 | `{ proposal: Proposal, contract: Contract }` |
| 400 | Invalid UUID, proposal is not in `pending` status, or all hiring slots are reserved (`FREELANCER_LIMIT_REACHED`) |
| 401 | Missing or invalid token |
| 403 | Caller is not the project owner |
| 404 | Proposal not found |

**Behavior**

1. Validates proposal status is `pending`
2. Verifies employer owns the associated project and a hiring slot is free (contracts that are negotiating, awaiting signatures, awaiting funding or active all hold a slot)
3. Updates proposal status to `accepted`
4. Creates a [Contract](#contract) in `negotiating` linked to the proposal and project, with the proposed rate as the minimum base amount
5. Creates a round-1 offer from the project posting (milestones rescaled to the proposed rate plus any rush fee) that the freelancer can accept as-is or counter
6. Sends a notification and email to the freelancer

The remaining pending proposals are rejected automatically only after every hiring slot has a funded contract.

---

### POST /api/proposals/{id}/reject

Reject a pending proposal. Sends a notification to the freelancer.

| | |
| --- | --- |
| **Auth** | JWT Bearer token |
| **Role** | `employer` (must own the project) |

**Path Parameters**

| Param | Type | Description |
|---|---|---|
| `id` | UUID | Proposal ID |

**Responses**

| Status | Description |
| --- | --- |
| 200 | Updated [Proposal](#proposal) with `status: "rejected"` |
| 400 | Invalid UUID or proposal is not in `pending` status |
| 401 | Missing or invalid token |
| 403 | Caller is not the project owner |
| 404 | Proposal not found |

---

### POST /api/proposals/{id}/withdraw

Withdraw a pending proposal. Only the freelancer who submitted the proposal can withdraw it.

| | |
| --- | --- |
| **Auth** | JWT Bearer token |
| **Role** | `freelancer` (must own the proposal) |

**Path Parameters**

| Param | Type | Description |
|---|---|---|
| `id` | UUID | Proposal ID |

**Responses**

| Status | Description |
| --- | --- |
| 200 | Updated [Proposal](#proposal) with `status: "withdrawn"` |
| 400 | Invalid UUID or proposal is not in `pending` status |
| 401 | Missing or invalid token |
| 403 | Caller does not have the `freelancer` role |
| 404 | Proposal not found |

---

### GET /api/proposals/{id}/with-employer-history

Retrieve a proposal along with the employer's track record (completed projects, average rating, company info). Only accessible by the freelancer who submitted the proposal.

| | |
| --- | --- |
| **Auth** | JWT Bearer token |
| **Role** | `freelancer` (must own the proposal) |

**Path Parameters**

| Param | Type | Description |
|---|---|---|
| `id` | UUID | Proposal ID |

**Responses**

| Status | Description |
| --- | --- |
| 200 | `{ proposal: Proposal, project: Project, employerHistory: EmployerHistory }` |
| 400 | Invalid UUID format |
| 401 | Missing or invalid token |
| 403 | Caller does not own the proposal |
| 404 | Proposal not found |
| 500 | Internal server error |

## Schemas

### Proposal

| Field | Type | Description |
| --- | --- | --- |
| `id` | string (UUID) | Unique proposal ID |
| `projectId` | string (UUID) | Associated project |
| `freelancerId` | string (UUID) | Freelancer who submitted |
| `coverLetter` | string | Proposal cover letter |
| `proposedRate` | number | Proposed rate |
| `estimatedDuration` | number | Estimated duration in days |
| `status` | string | `pending`, `accepted`, `rejected`, or `withdrawn` |
| `createdAt` | string (ISO 8601) | Creation timestamp |
| `updatedAt` | string (ISO 8601) | Last update timestamp |

### Contract

Created when a proposal is accepted.

| Field | Type | Description |
| --- | --- | --- |
| `id` | string (UUID) | Unique contract ID |
| `projectId` | string (UUID) | Associated project |
| `proposalId` | string (UUID) | Source proposal |
| `freelancerId` | string (UUID) | Freelancer |
| `employerId` | string (UUID) | Employer |
| `escrowAddress` | string | Blockchain escrow address (initially empty) |
| `totalAmount` | number | Contract total: proposed rate plus rush fee until terms are negotiated |
| `status` | string | `negotiating` after acceptance; see the [contract lifecycle](contracts.md#contract-status-lifecycle) |
| `createdAt` | string (ISO 8601) | Creation timestamp |
| `updatedAt` | string (ISO 8601) | Last update timestamp |

### EmployerHistory

Returned by the employer-history endpoint.

| Field | Type | Description |
| --- | --- | --- |
| `completedProjectsCount` | number | Total completed contracts by this employer |
| `averageRating` | number | Average review rating (0-5, one decimal) |
| `reviewCount` | number | Total reviews received |
| `companyName` | string | Employer's company name |
| `industry` | string | Employer's industry/sector |

## Status Lifecycle

```
pending  -->  accepted   (employer accepts)
pending  -->  rejected   (employer rejects)
pending  -->  withdrawn  (freelancer withdraws)
```

- `pending` -- initial state after submission
- `accepted` -- employer accepted; contract created in `negotiating`. If the contract is cancelled before funding (negotiation ended, cancelled, or funding deadline passed), the proposal becomes `rejected`, or `withdrawn` when the freelancer ended it, and the slot is released
- `rejected` -- employer rejected
- `withdrawn` -- freelancer withdrew

`rejected` and `withdrawn` are final.

## Error Codes

| HTTP Status | Error Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid request body or UUID format |
| 400 | `INVALID_STATUS` | Proposal is not in the required status (e.g., trying to accept a non-pending proposal) |
| 401 | `AUTH_UNAUTHORIZED` | Missing, invalid, or expired JWT token |
| 403 | `UNAUTHORIZED` | Caller lacks the required role or does not own the resource |
| 404 | `NOT_FOUND` | Proposal or project not found |
| 409 | `CONFLICT` | Duplicate proposal (same freelancer and project) |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

All error responses follow this shape:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  },
  "timestamp": "ISO 8601",
  "requestId": "req-xxx"
}
```

---

[Back to API Reference](README.md)
