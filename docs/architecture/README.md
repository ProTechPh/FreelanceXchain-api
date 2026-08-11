# Architecture

FreelanceXchain is a decentralized freelance marketplace with AI skill matching and blockchain payments. This section provides comprehensive documentation of the system architecture.

## Documentation

- [AI-Powered Matching System](ai-matching.md) - LLM integration, skill matching, and recommendation algorithms
- [API Endpoints Reference](api-endpoints.md) - Complete REST API documentation with examples
- [Middleware & Interceptors](middleware.md) - Request processing pipeline and security layers
- [Data Models](data-models.md) - Appwrite collections and TypeScript model mapping
- [Business Logic Layer](business-logic.md) - Service layer architecture and domain logic
- [Appwrite Schema Design](database-schema.md) - Collections, attributes, indexes, and security model

## Architecture Overview

The system follows a layered architecture pattern:

```
Routes → Services → Repositories → Appwrite
         ↓
    Blockchain (Solidity contracts via Hardhat)
         ↓
    AI Services (Gemini-compatible LLM APIs)
```

### Key Components

| Layer | Responsibility |
| ------- | --------------- |
| **Routes** | HTTP endpoints, request validation, authentication |
| **Services** | Business logic, orchestration, external integrations |
| **Repositories** | Data access, query optimization, persistence |
| **Blockchain** | Smart contracts for escrow, agreements, reputation |
| **AI** | Skill matching, extraction, gap analysis |
