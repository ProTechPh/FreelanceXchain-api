# Architecture

FreelanceXchain is a decentralized freelance marketplace with AI skill matching and blockchain payments. This section provides comprehensive documentation of the system architecture.

## Documentation

- [AI-Powered Matching System](ai-matching.md) - LLM integration, skill matching, and recommendation algorithms
- [Middleware & Interceptors](middleware.md) - Request processing pipeline and security layers
- [Data Models](data-models.md) - Appwrite collections and TypeScript model mapping
- [Business Logic Layer](business-logic.md) - Service layer architecture and domain logic
- [Appwrite Schema Design](database-schema.md) - Collections, attributes, indexes, and security model
- [ADRs](adr/) - Architecture Decision Records (token sessions, partial refunds, rush fees, money-path audit, etc.)

## Architecture Overview

The system follows a layered architecture pattern:

```
Routes → Services → Repositories → Appwrite
         ↓
    Blockchain (Solidity contracts via Hardhat)
         ↓
    AI Services (OpenAI-compatible LLM APIs)
```

### Key Components

| Layer | Responsibility |
| ------- | --------------- |
| **Routes** | HTTP endpoints, request validation, authentication |
| **Services** | Business logic, orchestration, external integrations |
| **Repositories** | Data access, query optimization, persistence |
| **Blockchain** | Smart contracts for escrow, agreements, reputation |
| **AI** | Skill matching, extraction, gap analysis |
