# Architecture Documentation

Deep dive into the system architecture, design patterns, and technical implementation.

# Architecture Documentation

Deep dive into the system architecture, design patterns, and technical implementation.

## Documentation

### AI-Powered Matching
- [AI Overview](ai-overview.md) - AI system architecture
- [AI Matching](ai-matching.md) - Matching algorithm details
- [AI Assistant](ai-assistant.md) - AI assistant implementation
- [AI Client](ai-client.md) - AI client integration

### API Endpoints
- [API Overview](api-overview.md) - API architecture overview
- [API Contract](api-contract.md) - Contract endpoints

### Services Layer
- [Services Overview](services-overview.md) - Business logic services
- [Auth Service](service-auth.md) - Authentication service
- [Contract Service](service-contract.md) - Contract management
- [Dispute Service](service-dispute.md) - Dispute resolution
- [KYC Service](service-kyc.md) - KYC verification
- [Matching Service](service-matching.md) - AI matching service
- [Notification Service](service-notification.md) - Notifications
- [Payment Service](service-payment.md) - Payment processing
- [Project Service](service-project.md) - Project management
- [Proposal Service](service-proposal.md) - Proposal handling
- [Reputation Service](service-reputation.md) - Reputation system

### Data Models
- [Models Overview](models-overview.md) - ORM and data models
- [User Model](model-user.md) - User entity
- [Project Model](model-project.md) - Project entity
- [Proposal Model](model-proposal.md) - Proposal entity
- [Contract Model](model-contract.md) - Contract entity
- [Dispute Model](model-dispute.md) - Dispute entity
- [Notification Model](model-notification.md) - Notification entity
- [Skill Model](model-skill.md) - Skill entity
- [KYC Model](model-kyc.md) - KYC entity

### Database Design
- [Database Overview](database-overview.md) - Schema design
- [Database Indexes](database-indexes.md) - Index optimization
- [Database RLS](database-rls.md) - Row-level security
- [Database Seeding](database-seeding.md) - Data seeding

### Middleware
- [Middleware Overview](middleware-overview.md) - Middleware architecture
- [Auth Middleware](middleware-auth.md) - Authentication
- [Error Middleware](middleware-errors.md) - Error handling
- [Logging Middleware](middleware-logging.md) - Request logging
- [Rate Limit Middleware](middleware-rate-limit.md) - Rate limiting
- [Security Middleware](middleware-security.md) - Security headers
- [Validation Middleware](middleware-validation.md) - Input validation

## Architecture Overview

The FreelanceXchain API follows a layered architecture:

1. **API Layer** - RESTful endpoints and request handling
2. **Middleware Layer** - Authentication, validation, logging
3. **Business Logic Layer** - Core business rules and workflows
4. **Data Access Layer** - ORM and database interactions
5. **Blockchain Layer** - Smart contract integration

## Key Design Patterns

- Repository pattern for data access
- Service layer for business logic
- Middleware chain for request processing
- Event-driven architecture for async operations

[← Back to Documentation Index](../README.md)
