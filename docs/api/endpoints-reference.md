# API Endpoints Quick Reference

> For full endpoint documentation (request/response schemas, examples, error codes), see the individual API docs linked below.

## Table of Contents

- [Authentication](#authentication)
- [Projects](#projects)
- [Proposals](#proposals)
- [Contracts](#contracts)
- [Payments](#payments)
- [Disputes](#disputes)
- [KYC Verification](#kyc-verification)
- [Matching](#matching)
- [Search](#search)
- [Reputation](#reputation)
- [Notifications](#notifications)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

---

## Authentication

[Full documentation →](auth.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | No | Register a new user |
| POST | `/api/auth/login` | No | Login with email/password |
| POST | `/api/auth/refresh` | No | Refresh access token |
| GET | `/api/auth/oauth/:provider` | No | Initiate OAuth (google, github, azure, linkedin) |
| GET | `/api/auth/callback` | No | OAuth callback handler |
| POST | `/api/auth/oauth/callback` | No | OAuth implicit flow callback |
| POST | `/api/auth/oauth/register` | No | Complete OAuth registration |
| POST | `/api/auth/resend-confirmation` | No | Resend email confirmation |
| POST | `/api/auth/forgot-password` | No | Send password reset email |
| POST | `/api/auth/reset-password` | No | Reset password with token |

## Projects

[Full documentation →](projects.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/projects` | No | List projects with filters |
| GET | `/api/projects/{id}` | No | Get project details |
| POST | `/api/projects` | JWT (employer) | Create a new project |
| PATCH | `/api/projects/{id}` | JWT (employer) | Update a project |
| POST | `/api/projects/{id}/milestones` | JWT (employer) | Set project milestones |
| GET | `/api/projects/{id}/proposals` | JWT (employer) | List proposals for a project |

## Proposals

[Full documentation →](proposals.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/proposals` | JWT (freelancer) | Submit a proposal |
| GET | `/api/proposals` | JWT | List user's proposals |
| GET | `/api/proposals/{id}` | JWT | Get proposal details |
| POST | `/api/proposals/{id}/accept` | JWT (employer) | Accept a proposal |
| POST | `/api/proposals/{id}/reject` | JWT (employer) | Reject a proposal |
| POST | `/api/proposals/{id}/withdraw` | JWT (freelancer) | Withdraw a proposal |
| GET | `/api/proposals/project/{projectId}` | JWT (employer) | List proposals for a project |
| GET | `/api/proposals/{id}/with-employer-history` | JWT | Get proposal with employer history |

## Contracts

[Full documentation →](contracts.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/contracts` | JWT | List user's contracts |
| GET | `/api/contracts/{id}` | JWT | Get contract details |
| POST | `/api/contracts/{id}/fund` | JWT (employer) | Fund contract escrow |
| GET | `/api/contracts/{id}/fund-info` | JWT (employer) | Get funding data for MetaMask |
| POST | `/api/contracts/{id}/cancel` | JWT | Cancel a pending contract |
| GET | `/api/contracts/{contractId}/disputes` | JWT | List disputes for a contract |

## Payments

[Full documentation →](payments.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/payments/milestones/{milestoneId}/complete` | JWT (freelancer) | Mark milestone complete |
| POST | `/api/payments/milestones/{milestoneId}/approve` | JWT (employer) | Approve milestone & release payment |
| POST | `/api/payments/milestones/{milestoneId}/dispute` | JWT | Dispute a milestone |
| GET | `/api/payments/contracts/{contractId}/status` | JWT | Get contract payment status |

## Disputes

[Full documentation →](disputes.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/disputes` | JWT | Create a dispute |
| GET | `/api/disputes/{disputeId}` | JWT | Get dispute details |
| POST | `/api/disputes/{disputeId}/evidence` | JWT | Submit evidence |
| POST | `/api/disputes/{disputeId}/resolve` | JWT (admin) | Resolve a dispute |
| GET | `/api/disputes/contract/{contractId}` | JWT | List disputes for a contract |

## KYC Verification

[Full documentation →](kyc.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/kyc/initiate` | JWT | Start KYC verification |
| GET | `/api/kyc/status` | JWT | Get verification status |
| GET | `/api/kyc/verified` | JWT | Check if user is verified |
| GET | `/api/kyc/profile-data` | JWT | Get KYC profile data |
| GET | `/api/kyc/history` | JWT | Get verification history |
| POST | `/api/kyc/refresh/{verificationId}` | JWT | Refresh a verification |
| POST | `/api/kyc/webhook` | No | Didit webhook receiver |
| GET | `/api/kyc/admin/verifications` | JWT (admin) | List all verifications |
| GET | `/api/kyc/admin/verifications/{id}` | JWT (admin) | Get verification details |
| POST | `/api/kyc/admin/verifications/{id}/approve` | JWT (admin) | Approve verification |
| POST | `/api/kyc/admin/verifications/{id}/reject` | JWT (admin) | Reject verification |
| GET | `/api/kyc/admin/stats` | JWT (admin) | Get KYC statistics |

## Matching

[Full documentation →](matching.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/matching/projects` | JWT | Get project recommendations for freelancer |
| GET | `/api/matching/freelancers/{projectId}` | JWT | Get freelancer recommendations for project |
| POST | `/api/matching/extract-skills` | JWT | Extract skills from text |
| POST | `/api/matching/skill-gap` | JWT | Analyze skill gaps |

## Search

[Full documentation →](search.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/search/projects` | No | Search projects with filters |
| GET | `/api/search/freelancers` | No | Search freelancers with filters |

## Reputation

[Full documentation →](reputation.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/reputation` | JWT | Submit a rating |
| GET | `/api/reputation/:userId` | No | Get user reputation |
| GET | `/api/reputation/:userId/score` | No | Get aggregated score |
| GET | `/api/reputation/:userId/breakdown` | No | Get star distribution |
| GET | `/api/reputation/:userId/reputation-history` | No | Get monthly history |
| GET | `/api/reputation/leaderboard` | No | Get top-rated users |

## Notifications

[Full documentation →](notifications.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/notifications` | JWT | List user notifications |
| GET | `/api/notifications/unread-count` | JWT | Get unread count |
| PATCH | `/api/notifications/{id}/read` | JWT | Mark notification as read |
| PATCH | `/api/notifications/read-all` | JWT | Mark all as read |

---

## Error Handling

All error responses follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "uuid"
}
```

Common HTTP status codes:

| Code | Meaning |
| --- | --- |
| 400 | Validation error (invalid input, missing fields) |
| 401 | Unauthorized (missing or invalid JWT) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Resource not found |
| 409 | Conflict (duplicate, locked resource) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

## Rate Limiting

| Limiter | Limit | Applied To |
| --- | --- | --- |
| `authRateLimiter` | 10 requests / 15 min | Auth endpoints (login, register, password reset) |
| `apiRateLimiter` | 100 requests / min | General API endpoints |
| `sensitiveRateLimiter` | 5 requests / hour | Sensitive operations |

Rate-limited responses include a `Retry-After` header.
