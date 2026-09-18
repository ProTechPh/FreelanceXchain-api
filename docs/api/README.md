# FreelanceXchain API Reference

> Detailed API documentation is also available via Swagger at `/api-docs` when running the server.

## API Documentation

| Document | Description |
| ---------- | ------------- |
| [AI Matching API](matching.md) | AI-powered skill matching, project recommendations, freelancer recommendations, skill extraction, and skill gap analysis |
| [Authentication API](auth.md) | User registration, login, token refresh, OAuth integration, and password recovery |
| [Billing API](billing.md) | Subscription plans, Pro tier checkout sessions, Stripe Customer Portal, and entitlement management |
| [Contract API](contracts.md) | Contract listing and retrieval |
| [Crypto News API](crypto-news.md) | Proxy for the free cryptocurrency.cv news API: news, search, sentiment, prices, Fear & Greed, market movers |
| [Dispute API](disputes.md) | Dispute creation, evidence submission, resolution, and retrieval |
| [KYC Verification API](kyc.md) | Identity verification, face match, liveness checks, document submission, and admin review |
| [Notification API](notifications.md) | Notification retrieval, marking as read, and unread counts |
| [API Endpoints Reference](endpoints-reference.md) | Comprehensive reference for all API endpoints across the platform |
| [Payment API](payments.md) | Milestone-based payment processing, approval, completion, disputes, and status |
| [Project API](projects.md) | Project creation, retrieval, update, and milestone management |
| [Proposal API](proposals.md) | Proposal submission, acceptance, rejection, retrieval, employer history, and withdrawal |
| [Reputation API](reputation.md) | Reputation scores, rating submission, and work history |
| [Search API](search.md) | Freelancer and project search with filtering |
| [Saved Searches API](saved-searches.md) | Saving search filters and re-running them; skills accept IDs or names for both search types |

## Quick Reference

### Base URL

```
/api
```

### Authentication

All endpoints require JWT Bearer token authentication unless noted otherwise:

```
Authorization: Bearer <your_jwt_token>
```

### Common Response Codes

| Code | Description |
| ------ | ------------- |
| `200` | Success |
| `201` | Created |
| `400` | Bad Request / Validation Error |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | Not Found |
| `409` | Conflict |
| `429` | Too Many Requests |
| `500` | Internal Server Error |

### Error Response Format

All error responses share a single envelope (validation errors also include a `details` array):

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": [ { "field": "milestones", "message": "..." } ]
  },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "requestId": "uuid"
}
```
