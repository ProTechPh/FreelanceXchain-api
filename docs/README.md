# FreelanceXchain Documentation

## Architecture

System design, middleware, data models, and business logic.

- [Architecture Overview](architecture/README.md)
- [AI-Powered Matching](architecture/ai-matching.md) - LLM-based skill matching, extraction, gap analysis
- [API Endpoints Reference](architecture/api-endpoints.md) - All REST endpoints with examples
- [Middleware & Interceptors](architecture/middleware.md) - Auth, validation, rate limiting, security
- [Data Models](architecture/data-models.md) - Appwrite collections and TypeScript model mapping
- [Business Logic Layer](architecture/business-logic.md) - Service layer architecture
- [Appwrite Schema Design](architecture/database-schema.md) - Collections, attributes, indexes, security model
- [Architecture Decision Records](architecture/adr/) - ADR-001: access==refresh token sessions (BLF-4.1); ADR-002: milestone-granular partial escrow refunds (BLF-3.6)

## API Reference

REST API endpoints (also available via Swagger at `/api-docs`).

- [API Reference Overview](api/README.md)
- [Authentication](api/auth.md) - Registration, login, OAuth, token refresh, password recovery
- [AI Matching](api/matching.md) - Project/freelancer recommendations, skill extraction, gap analysis
- [Projects](api/projects.md) - CRUD, milestones, listing
- [Proposals](api/proposals.md) - Submit, accept, reject, withdraw, employer history
- [Contracts](api/contracts.md) - Contract management
- [Payments](api/payments.md) - Milestone approval, completion, disputes, status
- [Disputes](api/disputes.md) - Create, evidence, resolve, retrieve
- [KYC](api/kyc.md) - Didit-based verification, webhooks, admin management
- [Notifications](api/notifications.md) - Retrieve, mark read, unread count
- [Reputation](api/reputation.md) - Ratings, scores, breakdown, leaderboard, history
- [Search](api/search.md) - Public project and freelancer search with filters
- [Endpoints Reference](api/endpoints-reference.md) - Comprehensive endpoint listing

## Blockchain

Smart contracts, escrow, disputes, milestones, and on-chain integration.

- [Blockchain Overview](blockchain/README.md)
- [Blockchain Client](blockchain/client.md) - Dual-layer architecture, transaction management
- [Contract Agreements](blockchain/agreements.md) - On-chain terms, signing, lifecycle
- [Escrow System](blockchain/escrow.md) - FreelanceEscrow contract, milestone payments
- [Dispute Resolution](blockchain/disputes.md) - On-chain dispute handling
- [KYC Verification](blockchain/kyc.md) - Privacy-preserving identity verification
- [Milestone Registry](blockchain/milestones.md) - Verifiable work history
- [Reputation System](blockchain/reputation.md) - On-chain ratings and scoring
- [Integration Guide](blockchain/integration.md) - Setup, deployment, network config
- [Blockchain Testing](blockchain/testing.md) - Test strategy and coverage

## Database & Security

Appwrite schema, indexes, and security measures.

- [Database Overview](database/README.md)
- [Indexing Strategy](database/indexing.md) - Appwrite indexes (unique constraints for race fixes)
- [Security Documentation](database/security.md) - API security, auth, CSRF, RBAC, privacy

## Reliability

Service-level objectives, error budget, and recovery targets.

- [SLO & Error Budget](reliability/slo.md) - SLI definitions, latency budgets (dashboard/contracts), RPO/RTO, named error-budget owner

## Deployment & Guides

Setup, configuration, maintenance, testing, and troubleshooting.

- [Deployment Overview](deployment/README.md)
- [Project Overview](deployment/overview.md) - Platform goals and architecture
- [Product Overview](deployment/product.md) - Features and value propositions
- [Developer Setup](deployment/setup.md) - Environment configuration
- [Technology Stack](deployment/tech-stack.md) - Dependencies and rationale
- [Deployment Configuration](deployment/configuration.md) - Docker, env vars, secrets
- [Maintenance Runbook](deployment/maintenance.md) - Operational procedures
- [Migration Guide](deployment/migration.md) - New features deployment
- [Testing Strategy](deployment/testing.md) - Unit, integration, E2E testing
- [Troubleshooting](deployment/troubleshooting.md) - Issue resolution guide

## Email Templates

Appwrite authentication email templates.

- [Email Templates](email-templates/) - Confirmation, recovery, invite, magic link templates
