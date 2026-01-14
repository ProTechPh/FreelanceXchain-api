# Project Creation

<cite>
**Referenced Files in This Document**
- [project-routes.ts](file://src/routes/project-routes.ts)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts)
- [project-service.ts](file://src/services/project-service.ts)
- [swagger.ts](file://src/config/swagger.ts)
- [API-DOCUMENTATION.md](file://docs/API-DOCUMENTATION.md)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts)
- [schema.sql](file://supabase/schema.sql)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document provides comprehensive API documentation for the project creation endpoint in the FreelanceXchain system. It covers the POST /api/projects endpoint, including request payload requirements, authentication and role-based access control, validation rules enforced by middleware and service layer, successful and error responses, and a complete curl example.

## Project Structure
The project creation flow spans routing, middleware, service, and model layers:
- Route handler enforces authentication and role checks, performs request validation, and delegates to the service layer.
- Validation middleware enforces schema-based constraints for request bodies and parameters.
- Service layer validates skill IDs and persists the project entity.
- Swagger/OpenAPI definitions describe the endpoint and response schemas.
- Database schema defines the underlying storage for projects and related entities.

```mermaid
graph TB
Client["Client"] --> Router["Route: POST /api/projects"]
Router --> Auth["Auth Middleware"]
Router --> Role["Role Middleware (employer)"]
Router --> Validate["Validation Middleware"]
Router --> Service["Service: createProject()"]
Service --> Repo["Project Repository"]
Repo --> DB["Database: projects table"]
Service --> Model["Project Model"]
Model --> Client
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L271-L332)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L520-L542)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L25-L100)
- [project-service.ts](file://src/services/project-service.ts#L85-L119)
- [schema.sql](file://supabase/schema.sql#L65-L78)
- [swagger.ts](file://src/config/swagger.ts#L106-L127)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L271-L332)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L520-L542)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L25-L100)
- [project-service.ts](file://src/services/project-service.ts#L85-L119)
- [swagger.ts](file://src/config/swagger.ts#L106-L127)
- [schema.sql](file://supabase/schema.sql#L65-L78)

## Core Components
- Endpoint: POST /api/projects
- Authentication: Bearer JWT token required
- Role-based access control: Employers only
- Request body fields:
  - title: string, minimum length 5
  - description: string, minimum length 20
  - requiredSkills: array of objects with skillId (valid UUID)
  - budget: number, minimum 100
  - deadline: date-time string
- Response:
  - 201 Created with the full Project object
  - 400 Bad Request for validation failures
  - 401 Unauthorized for missing/invalid/expired tokens
  - 403 Forbidden for insufficient permissions

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L271-L332)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L520-L542)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L25-L100)
- [swagger.ts](file://src/config/swagger.ts#L106-L127)
- [API-DOCUMENTATION.md](file://docs/API-DOCUMENTATION.md#L239-L273)

## Architecture Overview
The endpoint follows a layered architecture:
- Router layer validates route parameters and invokes middleware.
- Authentication middleware verifies the Bearer token and attaches user info.
- Role middleware ensures the user has the employer role.
- Validation middleware enforces schema-based constraints.
- Service layer performs business logic (skill validation) and persistence.
- Model and repository layers handle mapping and database operations.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Router : POST /api/projects"
participant A as "Auth Middleware"
participant RA as "Require Role (employer)"
participant V as "Validation Middleware"
participant S as "Service : createProject()"
participant P as "Project Repository"
participant D as "Database"
C->>R : "POST /api/projects {payload}"
R->>A : "Validate Bearer token"
A-->>R : "Attach user info or error"
R->>RA : "Check role == employer"
RA-->>R : "Allow or error"
R->>V : "Validate request body"
V-->>R : "Allow or error"
R->>S : "createProject(userId, payload)"
S->>P : "Persist project"
P->>D : "INSERT projects"
S-->>R : "{success : true, data : Project}"
R-->>C : "201 Created {Project}"
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L271-L332)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L25-L100)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L520-L542)
- [project-service.ts](file://src/services/project-service.ts#L85-L119)
- [schema.sql](file://supabase/schema.sql#L65-L78)

## Detailed Component Analysis

### Endpoint Definition and Behavior
- Path: POST /api/projects
- Security: Requires Bearer token; employs requireRole('employer')
- Request body validation:
  - title: required, string, min length 5
  - description: required, string, min length 20
  - requiredSkills: required, array, min 1 item, each item requires skillId (valid UUID)
  - budget: required, number, min 100
  - deadline: required, date-time string
- Successful response: 201 Created with the created Project object
- Error responses:
  - 400: Validation errors (including schema and business rule violations)
  - 401: Unauthorized (missing/invalid/expired token)
  - 403: Forbidden (insufficient permissions)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L271-L332)
- [swagger.ts](file://src/config/swagger.ts#L23-L28)
- [API-DOCUMENTATION.md](file://docs/API-DOCUMENTATION.md#L239-L273)

### Authentication and Role-Based Access Control
- Authentication:
  - Authorization header must be present and formatted as "Bearer <token>"
  - Token is validated; expired or invalid tokens return 401
- Role enforcement:
  - Only users with role "employer" are permitted to create projects
  - Non-employer users receive 403 Forbidden

**Section sources**
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L25-L100)
- [project-routes.ts](file://src/routes/project-routes.ts#L271-L283)

### Validation Rules and Constraints
- Request body schema enforces:
  - title: string, min length 5
  - description: string, min length 20
  - requiredSkills: array, min 1 item, each item requires skillId (UUID format)
  - budget: number, minimum 100
  - deadline: date-time string
- Additional service-layer validation:
  - requiredSkills skillId values must correspond to active skills in the system
- Parameter validation:
  - UUID format validation for path parameters (when applicable)

**Section sources**
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L520-L542)
- [project-service.ts](file://src/services/project-service.ts#L58-L83)
- [project-routes.ts](file://src/routes/project-routes.ts#L285-L318)

### Service Layer Processing
- Skill validation:
  - Ensures each skillId corresponds to an active skill
  - Returns INVALID_SKILL error with details on invalid IDs
- Persistence:
  - Generates a unique project ID
  - Sets initial status to "open"
  - Stores requiredSkills as structured references
- Response:
  - On success: returns created Project entity
  - On failure: returns error code/message (e.g., INVALID_SKILL)

```mermaid
flowchart TD
Start(["createProject()"]) --> Extract["Extract requiredSkills"]
Extract --> ValidateSkills["Validate each skillId is active"]
ValidateSkills --> Valid{"All skills valid?"}
Valid --> |No| ReturnInvalid["Return INVALID_SKILL with details"]
Valid --> |Yes| BuildRefs["Build skill references"]
BuildRefs --> Persist["Persist project entity"]
Persist --> Success["Return created Project"]
ReturnInvalid --> End(["Exit"])
Success --> End
```

**Diagram sources**
- [project-service.ts](file://src/services/project-service.ts#L58-L119)

**Section sources**
- [project-service.ts](file://src/services/project-service.ts#L58-L119)

### Data Model and Response Schema
- Project object fields:
  - id, employerId, title, description, requiredSkills, budget, deadline, status, milestones, createdAt, updatedAt
- SkillReference fields:
  - skillId, skillName, categoryId, yearsOfExperience
- Milestone fields:
  - id, title, description, amount, dueDate, status

**Section sources**
- [swagger.ts](file://src/config/swagger.ts#L106-L138)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L202-L249)

### Database Schema Context
- projects table stores:
  - employer_id, title, description, required_skills (JSONB), budget, deadline, status, milestones (JSONB), timestamps
- Skills and categories are stored in separate tables with is_active flags

**Section sources**
- [schema.sql](file://supabase/schema.sql#L65-L78)

### Complete curl Example
The following curl command demonstrates creating a project with skills and milestones. Replace placeholders with valid values and ensure the Authorization header includes a valid Bearer token for an employer account.

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Authorization: Bearer YOUR_JWT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Sample Project",
    "description": "A detailed description with at least twenty characters",
    "requiredSkills": [
      { "skillId": "12345678-1234-1234-1234-123456789012" }
    ],
    "budget": 1000,
    "deadline": "2025-12-31T23:59:59Z"
  }'
```

Notes:
- Employers can optionally add milestones later via the milestones endpoint.
- Ensure the JWT token is valid and issued for an employer user.

**Section sources**
- [API-DOCUMENTATION.md](file://docs/API-DOCUMENTATION.md#L239-L273)
- [project-routes.ts](file://src/routes/project-routes.ts#L271-L332)

## Dependency Analysis
The endpoint depends on:
- Router: Defines the route, applies auth and role middleware, and orchestrates validation and service calls
- Validation middleware: Enforces schema-based constraints for request body and parameters
- Auth middleware: Validates JWT and attaches user context
- Service layer: Performs business logic and skill validation
- Swagger: Documents the endpoint and response schemas
- Database: Persists project records

```mermaid
graph LR
Routes["Routes: project-routes.ts"] --> AuthMW["Auth Middleware"]
Routes --> RoleMW["Role Middleware"]
Routes --> ValMW["Validation Middleware"]
Routes --> Service["Project Service"]
Service --> Repo["Project Repository"]
Repo --> DB["Database"]
Routes --> Swagger["Swagger Config"]
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L271-L332)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L25-L100)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L520-L542)
- [project-service.ts](file://src/services/project-service.ts#L85-L119)
- [swagger.ts](file://src/config/swagger.ts#L106-L127)
- [schema.sql](file://supabase/schema.sql#L65-L78)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L271-L332)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L25-L100)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L520-L542)
- [project-service.ts](file://src/services/project-service.ts#L85-L119)
- [swagger.ts](file://src/config/swagger.ts#L106-L127)
- [schema.sql](file://supabase/schema.sql#L65-L78)

## Performance Considerations
- Validation occurs before hitting the database; schema-based validation reduces unnecessary database calls.
- Skill validation iterates through requiredSkills; keep the array minimal to reduce overhead.
- Consider caching frequently used skill metadata to speed up validation.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized:
  - Missing Authorization header or incorrect format ("Bearer <token>")
  - Expired or invalid token
- 403 Forbidden:
  - User lacks employer role
- 400 Bad Request:
  - title shorter than 5 characters
  - description shorter than 20 characters
  - requiredSkills missing or empty
  - skillId not a valid UUID or not active
  - budget less than 100
  - deadline missing or invalid date-time
  - INVALID_SKILL error indicating one or more invalid skill IDs

**Section sources**
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L25-L100)
- [project-routes.ts](file://src/routes/project-routes.ts#L285-L318)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L520-L542)
- [project-service.ts](file://src/services/project-service.ts#L58-L119)

## Conclusion
The POST /api/projects endpoint provides a robust, secure mechanism for employers to create projects with strict validation and role enforcement. The combination of schema-based validation, JWT authentication, and service-layer skill verification ensures data integrity and access control. Clients should adhere to the documented constraints and use the provided curl example as a baseline for integration.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Definition Reference
- Endpoint: POST /api/projects
- Security: bearerAuth
- Request body fields:
  - title: string, min length 5
  - description: string, min length 20
  - requiredSkills: array of objects with skillId (UUID)
  - budget: number, minimum 100
  - deadline: date-time string
- Responses:
  - 201 Created: Project object
  - 400 Bad Request: Validation or business rule error
  - 401 Unauthorized: Missing/invalid/expired token
  - 403 Forbidden: Insufficient permissions

**Section sources**
- [swagger.ts](file://src/config/swagger.ts#L23-L28)
- [swagger.ts](file://src/config/swagger.ts#L106-L127)
- [API-DOCUMENTATION.md](file://docs/API-DOCUMENTATION.md#L239-L273)