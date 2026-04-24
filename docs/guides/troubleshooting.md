# FreelanceXchain API - Master Troubleshooting Guide

This document serves as a centralized index to all troubleshooting resources across the FreelanceXchain API documentation. Each section links to detailed troubleshooting guides for specific components.

## Table of Contents

1. [General Setup & Configuration](#general-setup--configuration)
2. [Blockchain Integration](#blockchain-integration)
3. [Authentication & Security](#authentication--security)
4. [Business Logic Services](#business-logic-services)
5. [API Endpoints](#api-endpoints)
6. [Data Models & Database](#data-models--database)
7. [AI-Powered Matching System](#ai-powered-matching-system)
8. [Common Issues](#common-issues)

---

## General Setup & Configuration

### Developer Environment Setup
- **Guide**: [Developer Setup Guide - Troubleshooting](../getting-started/setup.md#troubleshooting)
- **Common Issues**: 
  - Environment variable configuration
  - Database connection problems
  - Dependency installation failures
  - Port conflicts

### Deployment Issues
- **Guide**: [Deployment Configuration](deployment.md)
- **Common Issues**:
  - Docker container failures
  - Environment-specific configuration
  - Log aggregation setup

---

## Blockchain Integration

### Blockchain Client
- **Guide**: [Blockchain Client](../blockchain/client.md)
- **Common Issues**:
  - Misconfigured environment variables
  - Invalid private keys
  - Network connectivity problems
  - Transaction failures

### Contract Agreement
- **Guide**: [Contract Agreement](../blockchain/contracts.md)
- **Common Issues**:
  - Contract creation failures
  - Status transition errors
  - Blockchain synchronization issues

### Escrow System
- **Guide**: [Escrow System](../blockchain/escrow.md)
- **Common Issues**:
  - Fund deposit failures
  - Release/refund transaction errors
  - Balance synchronization problems

### KYC Verification
- **Guide**: [KYC Verification](../blockchain/kyc.md)
- **Common Issues**:
  - Verification submission failures
  - Status update delays
  - Document validation errors

### Milestone Registry
- **Guide**: [Milestone Registry](../blockchain/milestones.md)
- **Common Issues**:
  - Milestone creation failures
  - Status update problems
  - Payment release errors

### General Blockchain Troubleshooting
- **Guide**: [Blockchain Integration - Troubleshooting](../blockchain/integration.md#troubleshooting)
- **Testing Guide**: [Blockchain Testing](../blockchain/testing.md)

---

## Authentication & Security

### Authentication Service
- **Guide**: [Authentication Service](../architecture/service-auth.md)
- **Common Issues**:
  - Login failures
  - Token validation errors
  - OAuth integration problems
  - Session expiry issues

### Row Level Security (RLS)
- **Guide**: [Database RLS](../architecture/database-rls.md)
- **Common Issues**:
  - Permission denied errors
  - RLS policy conflicts
  - Role-based access problems

---

## Business Logic Services

### Matching Service
- **Guide**: [Matching Service](../architecture/service-matching.md)
- **Common Issues**:
  - AI matching failures
  - Score calculation errors
  - Performance degradation

### Notification Service
- **Guide**: [Notification Service](../architecture/service-notification.md)
- **Common Issues**:
  - Notification delivery failures
  - Template rendering errors
  - Batch notification problems

### Payment Service
- **Guide**: [Payment Service](../architecture/service-payment.md)
- **Common Issues**:
  - Payment processing failures
  - Escrow synchronization errors
  - Transaction status mismatches

### Project Service
- **Guide**: [Project Service](../architecture/service-project.md)
- **Common Issues**:
  - Project creation failures
  - Status transition errors
  - Search/filter problems

### Proposal Service
- **Guide**: [Proposal Service](../architecture/service-proposal.md)
- **Common Issues**:
  - Proposal submission failures
  - Acceptance/rejection errors
  - Status synchronization issues

### Reputation Service
- **Guide**: [Reputation Service](../architecture/service-reputation.md)
- **Common Issues**:
  - Score calculation errors
  - Rating submission failures
  - Blockchain synchronization delays

---

## API Endpoints

### Reputation API
- **Main Guide**: [Reputation Service](../architecture/service-reputation.md)

### Search API
- **Guide**: [API Overview](../architecture/api-overview.md)

---

## Data Models & Database

### Contract Model
- **Guide**: [Contract Model](../architecture/model-contract.md)
- **Common Issues**:
  - Model validation errors
  - Foreign key constraint violations
  - Status transition problems

### Dispute Model
- **Guide**: [Dispute Model](../architecture/model-dispute.md)
- **Common Issues**:
  - Dispute creation failures
  - Evidence submission errors
  - Resolution workflow problems

### KYC Verification Model
- **Guide**: [KYC Model](../architecture/model-kyc.md)
- **Common Issues**:
  - Model synchronization errors
  - Status update failures
  - Document URL validation

### Notification Model
- **Guide**: [Notification Model](../architecture/model-notification.md)
- **Common Issues**:
  - Notification persistence errors
  - Read status synchronization
  - Batch operation failures

### Project Model
- **Guide**: [Project Model](../architecture/model-project.md)
- **Common Issues**:
  - Project creation validation errors
  - Skill association problems
  - Status workflow violations

### Proposal Model
- **Guide**: [Proposal Model](../architecture/model-proposal.md)
- **Common Issues**:
  - Proposal validation failures
  - Milestone structure errors
  - Status transition problems

### Skill Model
- **Guide**: [Skill Model](../architecture/model-skill.md)
- **Common Issues**:
  - Skill seeding failures
  - Category hierarchy problems
  - Association errors

---

## AI-Powered Matching System

### AI Client
- **Guide**: [AI Client](../architecture/ai-client.md)
- **Common Issues**:
  - API connection failures
  - Rate limiting errors
  - Response parsing problems

### Matching Service
- **Guide**: [Matching Service](../architecture/service-matching.md)
- **Common Issues**:
  - Match calculation failures
  - Performance degradation
  - Score normalization errors

### AI-Powered Matching System Overview
- **Guide**: [AI Overview](../architecture/ai-overview.md)
- **Common Issues**:
  - System integration problems
  - Data pipeline failures
  - Algorithm tuning issues

---

## Common Issues

### Environment Configuration
**Problem**: Missing or incorrect environment variables  
**Solution**: 
1. Verify `.env` file exists and contains all required variables
2. Check `src/config/env.ts` for required variable names
3. Ensure Supabase credentials are correct
4. Validate blockchain RPC URLs and private keys

**Related Guides**:
- [Developer Setup Guide](../getting-started/setup.md#troubleshooting)

### Database Connection Errors
**Problem**: Cannot connect to PostgreSQL/Supabase  
**Solution**:
1. Verify `DATABASE_URL` or Supabase credentials
2. Check network connectivity
3. Ensure database migrations are applied
4. Verify RLS policies are not blocking access

**Related Guides**:
- [Database RLS](../architecture/database-rls.md)

### Blockchain Transaction Failures
**Problem**: Transactions fail or timeout  
**Solution**:
1. Check wallet has sufficient funds for gas
2. Verify RPC endpoint is responsive
3. Ensure contract addresses are correct
4. Check transaction parameters and nonce
5. Review blockchain network status

**Related Guides**:
- [Blockchain Integration](../blockchain/integration.md#troubleshooting)
- [Blockchain Client](../blockchain/client.md)

### Authentication Token Issues
**Problem**: JWT tokens invalid or expired  
**Solution**:
1. Verify `JWT_SECRET` is configured correctly
2. Check token expiration settings
3. Ensure Supabase Auth is properly initialized
4. Validate token format in Authorization header
5. Check for clock skew between client and server

**Related Guides**:
- [Authentication Service](../architecture/service-auth.md)

### API Rate Limiting
**Problem**: Requests being rate limited  
**Solution**:
1. Check rate limit configuration in middleware
2. Implement exponential backoff in client
3. Review IP-based vs user-based limits
4. Consider upgrading rate limit tiers for production

### Performance Issues
**Problem**: Slow API responses or timeouts  
**Solution**:
1. Enable query logging to identify slow queries
2. Check database indexes are properly created
3. Review N+1 query patterns in ORM usage
4. Monitor blockchain RPC response times
5. Implement caching for frequently accessed data
6. Use pagination for large result sets

**Related Guides**:
- [Request Logging Middleware](../architecture/middleware-logging.md)

### CORS Errors
**Problem**: Cross-origin requests blocked  
**Solution**:
1. Verify `CORS_ORIGIN` environment variable
2. Check security middleware configuration
3. Ensure frontend URL is whitelisted
4. Validate request headers and methods

### File Upload/URL Validation Errors
**Problem**: File URLs rejected or validation fails  
**Solution**:
1. Ensure URLs are properly formatted
2. Check SSRF protection rules
3. Verify allowed domains/protocols
4. Validate file size and type constraints

---

## Debugging Tools & Techniques

### Logging
- **Correlation IDs**: Every request has a unique correlation ID for tracing
- **Log Levels**: Use appropriate log levels (error, warn, info, debug)
- **Structured Logging**: Logs are JSON-formatted for easy parsing

**Related Guides**:
- [Request Logging Middleware](../architecture/middleware-logging.md)
- [Error Handling Middleware](../architecture/middleware-errors.md)

### Testing
- **Unit Tests**: Run `pnpm test` for comprehensive test suite
- **Integration Tests**: Test full API workflows
- **Blockchain Tests**: Dedicated blockchain integration tests

**Related Guides**:
- [Testing Strategy](testing.md)
- [Blockchain Testing](../blockchain/testing.md)

### Monitoring
- **Health Checks**: Use `/health` endpoint for system status
- **Error Tracking**: Centralized error logging with stack traces
- **Performance Metrics**: Request duration and response time tracking

---

## Getting Help

If you cannot resolve an issue using these guides:

1. **Check Logs**: Review application logs with correlation ID
2. **Review Documentation**: Consult the specific component documentation
3. **Run Tests**: Execute relevant test suites to identify failures
4. **Security Audit**: Run `pnpm run security:audit` for vulnerability checks
5. **Community Support**: Reach out to the development team

---

## Contributing to Troubleshooting Docs

Found a solution to a new issue? Help improve this documentation:

1. Document the problem clearly
2. Provide step-by-step solution
3. Add to the relevant component's troubleshooting section
4. Update this index if adding a new section

---

**Last Updated**: February 18, 2026  
**Maintained By**: FreelanceXchain Development Team
