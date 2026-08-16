# API Endpoints Quick Reference

> The **exhaustive, machine-checked** reference is the OpenAPI specification served by the API itself: enable it with `ENABLE_API_DOCS=true` and open `/api-docs` (Swagger UI). The spec is regenerated from the route validation middleware via `pnpm run openapi:generate` and drift-checked in CI (`pnpm run openapi:check`), so it cannot go stale.
>
> The tables below are a curated, hand-maintained quick reference. For request/response schemas and examples, see the individual API docs linked in each section or the Swagger UI.

All routes are mounted under the `/api` prefix. JWT auth = `Authorization: Bearer <token>`.

## Health

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | No | Health status (503 when Appwrite is unreachable) |
| GET | `/api/health/ready` | No | Readiness probe |

## Authentication

[Full documentation →](auth.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | No | Register a new user |
| POST | `/api/auth/login` | No | Login with email/password |
| POST | `/api/auth/login/mfa-verify` | No | Complete login with an MFA code |
| POST | `/api/auth/login/email-otp` | No | Request an email OTP login code |
| POST | `/api/auth/login/magic-url` | No | Request a magic-link login email |
| POST | `/api/auth/login/verify-token` | No | Verify a magic-link/OTP login token |
| POST | `/api/auth/refresh` | No | Refresh access token |
| POST | `/api/auth/logout` | JWT | Invalidate the session |
| GET | `/api/auth/oauth/:provider` | No | Initiate OAuth (google, github, azure, linkedin) |
| GET | `/api/auth/callback` | No | OAuth callback handler |
| POST | `/api/auth/oauth/callback` | No | OAuth implicit flow callback |
| POST | `/api/auth/oauth/register` | No | Complete OAuth registration |
| POST | `/api/auth/resend-confirmation` | No | Resend email confirmation |
| POST | `/api/auth/forgot-password` | No | Send password reset email |
| POST | `/api/auth/reset-password` | No | Reset password with token |
| POST | `/api/auth/csrf-token` | No | Issue a CSRF token (signed cookie) |
| POST | `/api/auth/mfa/enroll` | JWT | Enroll an MFA factor |
| POST | `/api/auth/mfa/verify-enrollment` | JWT | Confirm MFA enrollment |
| POST | `/api/auth/mfa/challenge` | JWT | Start an MFA challenge |
| POST | `/api/auth/mfa/verify` | JWT | Verify an MFA challenge code |
| GET | `/api/auth/mfa/factors` | JWT | List enrolled MFA factors |
| POST | `/api/auth/mfa/disable` | JWT | Disable MFA |
| GET | `/api/auth/me` | JWT | Get the current user |
| PATCH | `/api/auth/wallet` | JWT | Update the current user's wallet address |

## Skills

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/skills` | No | List skills |
| GET | `/api/skills/search` | No | Search skills |
| GET | `/api/skills/categories/:categoryId/skills` | No | Skills in a category |
| POST | `/api/skills/categories` | Admin | Create a skill category |
| POST | `/api/skills` | Admin | Create a skill |
| PATCH | `/api/skills/:id/deprecate` | Admin | Deprecate a skill |
| POST | `/api/skills/custom` | JWT | Add a custom skill |
| GET | `/api/skills/custom` | JWT | List the user's custom skills |
| GET | `/api/skills/custom/search` | JWT | Search custom skills |
| GET | `/api/skills/custom/:id` | JWT | Get a custom skill |
| PUT | `/api/skills/custom/:id` | JWT | Update a custom skill |
| DELETE | `/api/skills/custom/:id` | JWT | Delete a custom skill |
| GET | `/api/skills/suggestions` | JWT | Get skill suggestions |
| PUT | `/api/skills/suggestions/:id/status` | JWT | Accept/reject a suggestion |

## Freelancers & Employers

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/freelancers/profile` | JWT (freelancer) | Create the freelancer profile |
| GET | `/api/freelancers/profile` | JWT | Get own freelancer profile |
| PATCH | `/api/freelancers/profile` | JWT (freelancer) | Update the freelancer profile |
| POST | `/api/freelancers/profile/skills` | JWT (freelancer) | Add profile skills |
| DELETE | `/api/freelancers/profile/skills/:name` | JWT (freelancer) | Remove a profile skill |
| POST | `/api/freelancers/profile/experience` | JWT (freelancer) | Add experience entry |
| PATCH | `/api/freelancers/profile/experience/:id` | JWT (freelancer) | Update experience entry |
| DELETE | `/api/freelancers/profile/experience/:id` | JWT (freelancer) | Delete experience entry |
| GET | `/api/freelancers/:id` | No | Get a public freelancer profile |
| GET | `/api/employers/projects` | JWT (employer) | List the employer's projects |
| GET | `/api/employers/profile` | JWT (employer) | Get the employer profile |
| PATCH | `/api/employers/profile` | JWT (employer) | Update the employer profile |
| GET | `/api/employers/:id` | No | Get a public employer profile |

## Projects

[Full documentation →](projects.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/projects` | No | List projects with filters |
| GET | `/api/projects/my-projects` | JWT | List the user's projects |
| GET | `/api/projects/stats/categories` | No | Category statistics |
| GET | `/api/projects/:id` | No | Get project details |
| POST | `/api/projects` | JWT (employer) | Create a new project |
| POST | `/api/projects/with-attachments` | JWT (employer) | Create a project with attachment files (multipart) |
| PATCH | `/api/projects/:id` | JWT (employer) | Update a project |
| POST | `/api/projects/:id/milestones` | JWT (employer) | Set project milestones |
| GET | `/api/projects/:id/proposals` | JWT (employer) | List proposals for a project |

## Search & Matching

[Search](search.md) · [Matching](matching.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/search/projects` | No | Search projects with filters |
| GET | `/api/search/freelancers` | No | Search freelancers with filters |
| GET | `/api/matching/projects` | JWT | Project recommendations for a freelancer |
| GET | `/api/matching/freelancers/:projectId` | JWT | Freelancer recommendations for a project |
| POST | `/api/matching/extract-skills` | JWT | Extract skills from text |
| GET | `/api/matching/skill-gaps` | JWT | Analyze skill gaps |

## Proposals

[Full documentation →](proposals.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/proposals` | JWT (freelancer, KYC-verified) | Submit a proposal (JSON) |
| GET | `/api/proposals/freelancer/me` | JWT (freelancer) | List the user's proposals |
| GET | `/api/proposals/:id` | JWT | Get proposal details |
| GET | `/api/proposals/:id/with-employer-history` | JWT (freelancer) | Proposal with employer history |
| POST | `/api/proposals/:id/accept` | JWT (employer) | Accept a proposal |
| POST | `/api/proposals/:id/reject` | JWT (employer) | Reject a proposal |
| POST | `/api/proposals/:id/withdraw` | JWT (freelancer) | Withdraw a proposal |

Multipart proposal submission with attachments is exposed at `/api/proposals` with `Content-Type: multipart/form-data` (validated by the same schema as the JSON variant).

## Contracts

[Full documentation →](contracts.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/contracts` | JWT | List the user's contracts |
| GET | `/api/contracts/:id` | JWT | Get contract details |
| POST | `/api/contracts/:id/fund` | JWT (employer) | Fund contract escrow |
| GET | `/api/contracts/:id/fund-info` | JWT (employer) | Funding data for MetaMask |
| GET | `/api/contracts/:id/escrow/withdrawable` | JWT | Withdrawable escrow balance |
| POST | `/api/contracts/:id/escrow/withdraw` | JWT | Withdraw from escrow |
| POST | `/api/contracts/:id/cancel` | JWT | Cancel a pending contract |
| GET | `/api/contracts/:contractId/disputes` | JWT | List disputes for a contract |

## Payments & Milestones

[Payments](payments.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/payments/milestones/:milestoneId/complete` | JWT (freelancer) | Mark milestone complete |
| POST | `/api/payments/milestones/:milestoneId/approve` | JWT (employer) | Approve milestone & release payment |
| POST | `/api/payments/milestones/:milestoneId/dispute` | JWT | Dispute a milestone |
| GET | `/api/payments/contracts/:contractId/status` | JWT | Contract payment status |
| GET | `/api/milestones/:id` | JWT | Get milestone details |
| GET | `/api/milestones/contract/:contractId` | JWT | List milestones for a contract |
| POST | `/api/milestones/:id/upload-deliverables` | JWT (freelancer) | Upload milestone deliverables |
| POST | `/api/milestones/:id/submit` | JWT (freelancer) | Submit a milestone |
| POST | `/api/milestones/:id/submit-with-files` | JWT (freelancer) | Submit with attached files |
| POST | `/api/milestones/:id/approve` | JWT (employer) | Approve a milestone |
| POST | `/api/milestones/:id/reject` | JWT (employer) | Reject a milestone |

## Escrow Refunds

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/escrow/:contractId/refund-request` | JWT | Request a partial escrow refund |
| GET | `/api/escrow/:contractId/refunds` | JWT | List refund requests for a contract |
| POST | `/api/escrow/refunds/:refundId/approve` | JWT (employer) | Approve a refund request |
| POST | `/api/escrow/refunds/:refundId/reject` | JWT (employer) | Reject a refund request |

## Disputes

[Full documentation →](disputes.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/disputes` | JWT | List disputes |
| POST | `/api/disputes` | JWT | Create a dispute |
| GET | `/api/disputes/:disputeId` | JWT | Get dispute details |
| POST | `/api/disputes/:disputeId/evidence` | JWT | Submit evidence |
| GET | `/api/disputes/:disputeId/evidence` | JWT | List evidence |
| DELETE | `/api/disputes/:disputeId/evidence/:evidenceId` | JWT | Remove evidence |
| POST | `/api/disputes/:disputeId/evidence/:evidenceId/verify` | JWT (admin) | Verify evidence |
| POST | `/api/disputes/:disputeId/resolve` | JWT (admin) | Resolve a dispute |

## KYC Verification

[Full documentation →](kyc.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/kyc/initiate` | JWT | Start KYC verification |
| GET | `/api/kyc/status` | JWT | Get verification status |
| GET | `/api/kyc/verified` | JWT | Check if the user is verified |
| GET | `/api/kyc/profile-data` | JWT | Get KYC profile data |
| GET | `/api/kyc/history` | JWT | Get verification history |
| POST | `/api/kyc/refresh/:verificationId` | JWT | Refresh a verification |
| POST | `/api/kyc/webhook` | No | Didit webhook receiver (HMAC-verified) |
| GET | `/api/kyc/admin/pending` | JWT (admin) | List pending verifications |
| GET | `/api/kyc/admin/status/:status` | JWT (admin) | List verifications by status |
| POST | `/api/kyc/admin/review/:verificationId` | JWT (admin) | Approve/reject a verification |
| GET | `/api/kyc/admin/verification/:verificationId` | JWT (admin) | Get verification details |

## Reputation & Reviews

[Full documentation →](reputation.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/reputation/can-rate` | JWT | Check whether the user can rate |
| POST | `/api/reputation/rate` | JWT | Submit a rating |
| GET | `/api/reputation/leaderboard` | No | Top-rated users |
| GET | `/api/reputation/:userId` | No | Get user reputation |
| GET | `/api/reputation/:userId/score` | No | Aggregated score |
| GET | `/api/reputation/:userId/breakdown` | No | Star distribution |
| GET | `/api/reputation/:userId/history` | No | Rating history |
| GET | `/api/reputation/:userId/reputation-history` | No | Monthly reputation history |
| POST | `/api/reviews` | JWT | Submit a review |
| GET | `/api/reviews/:id` | No | Get a review |
| GET | `/api/reviews/user/:userId` | No | Reviews for a user |
| GET | `/api/reviews/project/:projectId` | No | Reviews for a project |
| GET | `/api/reviews/can-review/:contractId` | JWT | Check review eligibility |

## Notifications & Messages

[Notifications](notifications.md)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/notifications` | JWT | List user notifications |
| GET | `/api/notifications/unread-count` | JWT | Unread count |
| PATCH | `/api/notifications/:id/read` | JWT | Mark notification as read |
| PATCH | `/api/notifications/read-all` | JWT | Mark all as read |
| GET | `/api/notifications/stream` | JWT | SSE stream of live notifications |
| GET | `/api/notifications/sse-stats` | JWT | SSE connection stats |
| GET | `/api/messages/conversations` | JWT | List conversations |
| POST | `/api/messages/send` | JWT | Send a message |
| GET | `/api/messages/conversations/:conversationId` | JWT | Get a conversation with messages |
| PATCH | `/api/messages/conversations/:conversationId/read` | JWT | Mark conversation read |
| GET | `/api/messages/unread-count` | JWT | Unread messages count |

## Email Inbox & Preferences

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/inbox/webhook` | No | Email inbound webhook (HMAC-verified) |
| GET | `/api/inbox` | JWT | List inbox emails |
| GET | `/api/inbox/unread-count` | JWT | Unread emails count |
| GET | `/api/inbox/:id` | JWT | Get an email |
| PATCH | `/api/inbox/:id` | JWT | Update an email (read flag) |
| DELETE | `/api/inbox/:id` | JWT | Delete an email |
| POST | `/api/inbox/send` | JWT | Send an email |
| POST | `/api/inbox/:id/reply` | JWT | Reply to an email |
| GET | `/api/email-preferences` | JWT | Get notification preferences |
| PATCH | `/api/email-preferences` | JWT | Update notification preferences |
| POST | `/api/email-preferences/unsubscribe-all` | JWT | Unsubscribe from all emails |

## Saved Searches & Favorites & Portfolio

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/saved-searches` | JWT | Save a search |
| GET | `/api/saved-searches` | JWT | List saved searches |
| PATCH | `/api/saved-searches/:id` | JWT | Update a saved search |
| DELETE | `/api/saved-searches/:id` | JWT | Delete a saved search |
| POST | `/api/saved-searches/:id/execute` | JWT | Run a saved search |
| POST | `/api/favorites` | JWT | Add a favorite |
| GET | `/api/favorites` | JWT | List favorites |
| DELETE | `/api/favorites/:targetType/:targetId` | JWT | Remove a favorite |
| GET | `/api/favorites/check/:targetType/:targetId` | JWT | Check favorite status |
| POST | `/api/portfolio` | JWT (freelancer) | Add a portfolio item |
| GET | `/api/portfolio/freelancer/:freelancerId` | No | List a freelancer's portfolio |
| GET | `/api/portfolio/:id` | No | Get a portfolio item |
| PATCH | `/api/portfolio/:id` | JWT (freelancer) | Update a portfolio item |
| DELETE | `/api/portfolio/:id` | JWT (freelancer) | Delete a portfolio item |

## Admin, Audit Logs & Files

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/admin/stats` | JWT (admin) | Platform stats |
| GET | `/api/admin/analytics` | JWT (admin) | Analytics overview |
| GET | `/api/admin/users` | JWT (admin) | List users |
| PATCH | `/api/admin/users/:userId` | JWT (admin) | Update a user |
| POST | `/api/admin/users/:userId/suspend` | JWT (admin) | Suspend a user |
| POST | `/api/admin/users/:userId/unsuspend` | JWT (admin) | Unsuspend a user |
| POST | `/api/admin/users/:userId/verify` | JWT (admin) | Verify a user |
| GET | `/api/admin/disputes` | JWT (admin) | List all disputes |
| GET | `/api/admin/system/health` | JWT (admin) | System health |
| GET | `/api/admin/platform-stats` | JWT (admin) | Platform statistics |
| GET | `/api/audit-logs/me` | JWT | The user's audit log entries |
| GET | `/api/audit-logs/user/:userId` | JWT (admin) | Audit entries for a user |
| GET | `/api/audit-logs/resource/:resourceType/:resourceId` | JWT (admin) | Audit entries for a resource |
| GET | `/api/audit-logs/action/:action` | JWT (admin) | Audit entries by action |
| GET | `/api/audit-logs/failed` | JWT (admin) | Failed audit entries |
| GET | `/api/audit-logs/range` | JWT (admin) | Audit entries in a time range |
| GET | `/api/audit-logs/search` | JWT (admin) | Search audit entries |
| GET | `/api/audit-logs/summary/admin-activity` | JWT (admin) | Admin activity summary |
| GET | `/api/audit-logs/report/user/:userId` | JWT (admin) | User audit report |
| GET | `/api/audit-logs/report/system` | JWT (admin) | System audit report |
| GET | `/api/audit-logs/:id` | JWT (admin) | Get an audit entry |
| DELETE | `/api/files/:bucket/*` | JWT (owner) | Delete an uploaded file |
| GET | `/api/files/signed-url/:bucket/*` | JWT (owner) | Signed download URL |
| GET | `/api/files/list/:bucket` | JWT | List files in a bucket |
| GET | `/api/files/quota` | JWT | Upload quota status |

## Webhooks, Rush Upgrades, Transactions & Metrics

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/webhooks/blockchain` | No | Blockchain events webhook (HMAC-verified) |
| POST | `/api/contracts/:id/rush-upgrade` | JWT (employer) | Request a rush upgrade |
| GET | `/api/contracts/:id/rush-upgrade-requests` | JWT | List rush-upgrade requests for a contract |
| POST | `/api/rush-upgrade-requests/:id/respond` | JWT (freelancer) | Respond to a rush-upgrade request |
| POST | `/api/rush-upgrade-requests/:id/accept-counter` | JWT (freelancer) | Accept a counter-offer |
| POST | `/api/rush-upgrade-requests/:id/decline-counter` | JWT (freelancer) | Decline a counter-offer |
| GET | `/api/transactions` | JWT | List the user's transactions |
| GET | `/api/transactions/:id` | JWT | Get a transaction |
| GET | `/api/transactions/contract/:contractId` | JWT | Transactions for a contract |
| GET | `/api/analytics/freelancer` | JWT (freelancer) | Freelancer analytics |
| GET | `/api/analytics/employer` | JWT (employer) | Employer analytics |
| GET | `/api/analytics/skill-trends` | JWT | Skill trend analytics |
| GET | `/api/analytics/platform` | JWT (admin) | Platform analytics |
| GET | `/api/dashboard` | JWT | Dashboard summary |
| GET | `/api/metrics/sli` | JWT (admin) | Service-level indicator metrics |

---

## Error Handling

All error responses follow a single envelope (validation errors add a `details` array):

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
| `authRateLimiter` (login) | 10 requests / 15 min | Login attempts (fails closed) |
| `registerRateLimiter` | 5 requests / hour | Registration (fails closed) |
| `passwordResetRateLimiter` | 5 requests / 15 min | Password reset (fails closed) |
| `sensitiveRateLimiter` | 5 requests / hour | Sensitive ops: manual KYC review, admin overrides (fails closed) |
| `fileUploadRateLimiter` | 20 requests / hour | File uploads |
| `apiRateLimiter` | 100 requests / min | General API endpoints |
| `webhookRateLimiter` | 60 requests / min | Webhook endpoints (`/api/inbox/webhook`, `/api/kyc/webhook`, `/api/webhooks/blockchain`) |

Rate-limited responses include a `Retry-After` header.
