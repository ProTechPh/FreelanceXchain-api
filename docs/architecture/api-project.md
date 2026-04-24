# Project API

<cite>
**Referenced Files in This Document**
- [project-routes.ts](file://src/routes/project-routes.ts)
- [project-service.ts](file://src/services/project-service.ts)
- [project-repository.ts](file://src/repositories/project-repository.ts)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts)
- [swagger.ts](file://src/config/swagger.ts)
- [proposal-service.ts](file://src/services/proposal-service.ts)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts)
- [API-DOCUMENTATION.md](file://docs/API-DOCUMENTATION.md)
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
This document provides comprehensive API documentation for project management endpoints in the FreelanceXchain system. It covers HTTP methods, URL patterns, request/response schemas, authentication requirements (JWT Bearer), and validation rules. It also explains the project status lifecycle, modification constraints after proposal acceptance, and includes practical examples for creating projects with milestones and retrieving project proposals.

## Project Structure
The project management API is implemented as Express routes backed by service-layer logic and repository abstractions. Authentication is enforced via a JWT Bearer middleware, and request validation is performed using JSON schema-based middleware. Swagger/OpenAPI definitions are centrally configured and reused across route definitions.

```mermaid
graph TB
Client["Client"]
Routes["Routes<br/>project-routes.ts"]
Auth["Auth Middleware<br/>auth-middleware.ts"]
Validate["Validation Middleware<br/>validation-middleware.ts"]
Service["Project Service<br/>project-service.ts"]
Repo["Project Repository<br/>project-repository.ts"]
ProposalSvc["Proposal Service<br/>proposal-service.ts"]
Swagger["Swagger Config<br/>swagger.ts"]
Client --> Routes
Routes --> Auth
Routes --> Validate
Routes --> Service
Service --> Repo
Service --> ProposalSvc
Swagger -. "OpenAPI definitions" .-> Routes
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L1-L684)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L1-L800)
- [project-service.ts](file://src/services/project-service.ts#L1-L388)
- [project-repository.ts](file://src/repositories/project-repository.ts#L1-L191)
- [proposal-service.ts](file://src/services/proposal-service.ts#L1-L414)
- [swagger.ts](file://src/config/swagger.ts#L1-L233)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L1-L684)
- [swagger.ts](file://src/config/swagger.ts#L1-L233)

## Core Components
- Authentication: All protected endpoints require a Bearer token in the Authorization header. The middleware validates presence, format, and token validity, and attaches user metadata to the request.
- Validation: JSON schema-based validation enforces field types, lengths, formats, enums, and required properties for request bodies and parameters.
- Project Service: Orchestrates project creation, updates, milestone setting/addition, and search/filtering. Enforces business rules such as skill validation, milestone budget alignment, and project lock after proposal acceptance.
- Project Repository: Implements database queries for listing, filtering, and paginated retrieval of projects.
- Proposal Service: Interacts with proposals to enforce lifecycle transitions and project status changes upon proposal acceptance.

**Section sources**
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L1-L800)
- [project-service.ts](file://src/services/project-service.ts#L1-L388)
- [project-repository.ts](file://src/repositories/project-repository.ts#L1-L191)
- [proposal-service.ts](file://src/services/proposal-service.ts#L1-L414)

## Architecture Overview
The Project API follows a layered architecture:
- Route handlers define endpoints and apply middleware.
- Services encapsulate business logic and enforce constraints.
- Repositories abstract persistence and expose typed operations.
- Swagger defines reusable schemas for request/response documentation.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler<br/>project-routes.ts"
participant A as "Auth Middleware<br/>auth-middleware.ts"
participant V as "Validation Middleware<br/>validation-middleware.ts"
participant S as "Project Service<br/>project-service.ts"
participant P as "Proposal Service<br/>proposal-service.ts"
participant PR as "Project Repository<br/>project-repository.ts"
C->>R : "POST /api/projects"
R->>A : "authMiddleware()"
A-->>R : "Attach user info"
R->>V : "validate(createProjectSchema)"
V-->>R : "Validation OK"
R->>S : "createProject(userId, payload)"
S->>PR : "createProject()"
PR-->>S : "Project entity"
S-->>R : "Project"
R-->>C : "201 Created"
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L219-L332)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L520-L588)
- [project-service.ts](file://src/services/project-service.ts#L85-L119)
- [project-repository.ts](file://src/repositories/project-repository.ts#L35-L45)

## Detailed Component Analysis

### Authentication and Authorization
- JWT requirement: All protected endpoints require Authorization: Bearer <token>.
- Role enforcement: Employer-only endpoints are guarded by a role-check middleware.
- UUID validation: Path parameters are validated to be UUIDs.

**Section sources**
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- [project-routes.ts](file://src/routes/project-routes.ts#L271-L332)

### Project Endpoints

#### GET /api/projects
- Purpose: List projects with optional filters.
- Query parameters:
  - keyword: string; search in title/description.
  - skills: string; comma-separated skill IDs.
  - minBudget: number; minimum budget filter.
  - maxBudget: number; maximum budget filter.
  - limit: integer; default 20; max 100.
  - continuationToken: string; pagination token.
- Behavior:
  - If keyword present: search by keyword.
  - Else if skills present: filter by required skills.
  - Else if minBudget and maxBudget present: filter by budget range.
  - Otherwise: list open projects.
- Response: Paginated list of projects with items, hasMore, continuationToken.

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L75-L168)
- [project-repository.ts](file://src/repositories/project-repository.ts#L118-L188)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L690-L702)

#### GET /api/projects/{id}
- Purpose: Retrieve a specific project by ID.
- Path parameter: id (UUID).
- Response: Project object.

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L171-L215)
- [project-service.ts](file://src/services/project-service.ts#L121-L129)

#### POST /api/projects
- Purpose: Create a new project (employer only).
- Request body schema (validation):
  - title: string, min length 5.
  - description: string, min length 20.
  - requiredSkills: array; each item requires skillId (UUID).
  - budget: number, minimum 100.
  - deadline: string, date-time.
- Response: 201 Created with Project object.
- Errors: 400 Validation error, 401 Unauthorized.

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L219-L332)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L520-L541)
- [project-service.ts](file://src/services/project-service.ts#L85-L119)

#### PATCH /api/projects/{id}
- Purpose: Update an existing project (employer only).
- Constraints:
  - Cannot update if project has accepted proposals (locked).
  - Title and description min lengths apply when provided.
  - Budget minimum applies when provided.
- Request body schema (validation):
  - title: string, min length 5.
  - description: string, min length 20.
  - requiredSkills: array; each item requires skillId (UUID).
  - budget: number, minimum 100.
  - deadline: string, date-time.
  - status: enum draft, open, in_progress, completed, cancelled.
- Response: Updated Project object.
- Errors: 400 Validation error, 401 Unauthorized, 404 Not found, 409 Locked.

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L335-L447)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L544-L565)
- [project-service.ts](file://src/services/project-service.ts#L132-L199)

#### POST /api/projects/{id}/milestones
- Purpose: Set milestones for a project (employer only).
- Constraints:
  - Cannot modify milestones if project has accepted proposals (locked).
  - Sum of milestone amounts must equal project budget.
- Request body schema (validation):
  - milestones: array; each item requires:
    - title: string, min length 1.
    - description: string, min length 1.
    - amount: number, minimum 1.
    - dueDate: string, date-time.
- Response: Updated Project object.
- Errors: 400 Validation error, 401 Unauthorized, 404 Not found, 409 Locked.

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L450-L573)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L567-L588)
- [project-service.ts](file://src/services/project-service.ts#L202-L299)

#### GET /api/projects/{id}/proposals
- Purpose: List proposals for a specific project (employer only).
- Path parameter: id (UUID).
- Query parameters:
  - limit: integer; default 20; max 100.
  - continuationToken: string; pagination token.
- Response: Paginated list of proposals with items, hasMore, continuationToken.
- Errors: 400 Invalid UUID, 401 Unauthorized, 404 Not found.

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L575-L681)
- [proposal-service.ts](file://src/services/proposal-service.ts#L142-L163)

### Request/Response Schemas
- Project schema (OpenAPI):
  - id, employerId, title, description, requiredSkills, budget, deadline, status, milestones, createdAt, updatedAt.
  - Status enum: draft, open, in_progress, completed, cancelled.
  - Milestone schema: id, title, description, amount, dueDate, status enum pending, in_progress, submitted, approved, disputed.
- Error response schema (OpenAPI):
  - error: code, message, details (optional).
  - timestamp, requestId.

**Section sources**
- [swagger.ts](file://src/config/swagger.ts#L106-L138)
- [swagger.ts](file://src/config/swagger.ts#L1-L53)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L199-L250)

### Validation Rules Summary
- Title: minimum length 5.
- Description: minimum length 20.
- requiredSkills: non-empty array; each skillId must be a valid UUID.
- Budget: minimum 100.
- Deadline: required date-time.
- Milestones: each item requires title, description, amount (>0), dueDate (date-time).
- Status: enum draft, open, in_progress, completed, cancelled.

**Section sources**
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L520-L588)
- [project-service.ts](file://src/services/project-service.ts#L47-L56)

### Project Status Lifecycle and Constraints
- Status values: draft, open, in_progress, completed, cancelled.
- Lifecycle:
  - Creation: status defaults to open.
  - Proposal acceptance: project status transitions to in_progress.
  - Completion: project status can be set to completed (via update).
- Modification constraints:
  - After a proposal is accepted, the project becomes locked:
    - Updates are rejected with 409 Conflict.
    - Milestones cannot be added/modified with 409 Conflict.
  - Skill validation ensures required skills exist and are active.

**Section sources**
- [project-service.ts](file://src/services/project-service.ts#L132-L199)
- [project-service.ts](file://src/services/project-service.ts#L202-L299)
- [proposal-service.ts](file://src/services/proposal-service.ts#L174-L295)

### Client Implementation Examples

#### Example: Create a Project with Milestones
- Steps:
  1) Authenticate with JWT Bearer token.
  2) POST /api/projects with:
     - title, description, requiredSkills (array of skillId), budget, deadline.
  3) Optionally POST /api/projects/{id}/milestones with:
     - milestones array (title, description, amount, dueDate).
- Notes:
  - Ensure milestone amounts sum equals budget.
  - Employers can only create/update projects and manage milestones.

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L219-L332)
- [project-routes.ts](file://src/routes/project-routes.ts#L450-L573)

#### Example: Retrieve Project Proposals
- Steps:
  1) Authenticate with JWT Bearer token.
  2) GET /api/projects/{id}/proposals with:
     - limit (optional), continuationToken (optional).
- Notes:
  - Employers can only view proposals for their own projects.

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L575-L681)
- [proposal-service.ts](file://src/services/proposal-service.ts#L142-L163)

### Filtering and Search
- Keyword search: GET /api/projects with keyword query parameter.
- Skills filter: GET /api/projects with skills query parameter (comma-separated).
- Budget range filter: GET /api/projects with minBudget and maxBudget query parameters.
- Pagination: limit and continuationToken supported across endpoints.

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L75-L168)
- [project-repository.ts](file://src/repositories/project-repository.ts#L118-L188)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L690-L702)

## Dependency Analysis
```mermaid
classDiagram
class ProjectRoutes {
+GET /api/projects
+GET /api/projects/ : id
+POST /api/projects
+PATCH /api/projects/ : id
+POST /api/projects/ : id/milestones
+GET /api/projects/ : id/proposals
}
class AuthMiddleware {
+authMiddleware()
+requireRole()
}
class ValidationMiddleware {
+validate(schema)
+validateUUID()
}
class ProjectService {
+createProject()
+getProjectById()
+updateProject()
+setMilestones()
+addMilestones()
+listOpenProjects()
+searchProjects()
+listProjectsBySkills()
+listProjectsByBudgetRange()
}
class ProjectRepository {
+createProject()
+findProjectById()
+updateProject()
+getAllOpenProjects()
+searchProjects()
+getProjectsBySkills()
+getProjectsByBudgetRange()
}
class ProposalService {
+getProposalsByProject()
}
ProjectRoutes --> AuthMiddleware : "uses"
ProjectRoutes --> ValidationMiddleware : "uses"
ProjectRoutes --> ProjectService : "calls"
ProjectService --> ProjectRepository : "uses"
ProjectService --> ProposalService : "uses"
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L1-L684)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L1-L800)
- [project-service.ts](file://src/services/project-service.ts#L1-L388)
- [project-repository.ts](file://src/repositories/project-repository.ts#L1-L191)
- [proposal-service.ts](file://src/services/proposal-service.ts#L1-L414)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L1-L684)
- [project-service.ts](file://src/services/project-service.ts#L1-L388)
- [project-repository.ts](file://src/repositories/project-repository.ts#L1-L191)
- [proposal-service.ts](file://src/services/proposal-service.ts#L1-L414)

## Performance Considerations
- Pagination: All list/search endpoints support limit and continuationToken to control payload size.
- Filtering: Repository methods implement server-side filtering and ordering to reduce client-side processing.
- Validation: Early exit on invalid request bodies reduces unnecessary downstream calls.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common errors and resolutions:
- 400 Validation error:
  - Ensure required fields are present and formatted correctly (UUIDs, date-time, enums).
  - Check min lengths and numeric bounds.
- 401 Unauthorized:
  - Verify Authorization header format: Bearer <token>.
  - Confirm token is valid and not expired.
- 403 Forbidden:
  - Ensure user role is employer for employer-only endpoints.
- 404 Not found:
  - Confirm resource ID exists and belongs to the authenticated user (for owner-only checks).
- 409 Locked:
  - Cannot update or modify milestones after a proposal is accepted; cancel or withdraw the proposal first if applicable.

**Section sources**
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- [project-service.ts](file://src/services/project-service.ts#L132-L199)
- [project-service.ts](file://src/services/project-service.ts#L202-L299)

## Conclusion
The Project API provides robust endpoints for creating, updating, and retrieving projects with strong validation and clear lifecycle constraints. Employers can manage projects and milestones, while proposal acceptance triggers status transitions and locks modifications to protect ongoing work. Swagger definitions and middleware ensure consistent request/response handling and error reporting.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Endpoint Reference

- GET /api/projects
  - Filters: keyword, skills, minBudget, maxBudget, limit, continuationToken
  - Response: Paginated projects

- GET /api/projects/{id}
  - Response: Project

- POST /api/projects
  - Request: title, description, requiredSkills, budget, deadline
  - Response: 201 Project

- PATCH /api/projects/{id}
  - Request: title, description, requiredSkills, budget, deadline, status
  - Response: Updated Project

- POST /api/projects/{id}/milestones
  - Request: milestones array (title, description, amount, dueDate)
  - Response: Updated Project

- GET /api/projects/{id}/proposals
  - Query: limit, continuationToken
  - Response: Paginated proposals

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L75-L681)
- [swagger.ts](file://src/config/swagger.ts#L106-L138)

### Additional Notes
- Swagger/OpenAPI definitions centralize schemas for consistent documentation and client generation.
- The interactive documentation is available at the base URL’s api-docs path.

**Section sources**
- [swagger.ts](file://src/config/swagger.ts#L1-L233)
- [API-DOCUMENTATION.md](file://docs/API-DOCUMENTATION.md#L1-L20)

---

# Milestone Management

<cite>
**Referenced Files in This Document**
- [project-routes.ts](file://src/routes/project-routes.ts)
- [project-service.ts](file://src/services/project-service.ts)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts)
- [project-repository.ts](file://src/repositories/project-repository.ts)
- [payment-service.ts](file://src/services/payment-service.ts)
- [escrow-contract.ts](file://src/services/escrow-contract.ts)
- [FreelanceEscrow.sol](file://contracts/FreelanceEscrow.sol)
- [MilestoneRegistry.sol](file://contracts/MilestoneRegistry.sol)
- [milestone-registry.ts](file://src/services/milestone-registry.ts)
- [API-DOCUMENTATION.md](file://docs/API-DOCUMENTATION.md)
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

## Introduction
This document provides API documentation for milestone management in the FreelanceXchain system with a focus on the POST /api/projects/{id}/milestones endpoint. It explains how employers define project milestones, the required fields for each milestone, the critical business rule that the sum of milestone amounts equals the project budget, and the 400 Bad Request response for validation errors or budget mismatch. It also demonstrates how milestones are embedded in the Project response object and outlines their role in the escrow payment release process.

## Project Structure
The milestone management feature spans routing, service, repository, and model layers, plus blockchain integrations for milestone registry and escrow contracts.

```mermaid
graph TB
Client["Client"] --> Routes["Project Routes<br/>POST /api/projects/{id}/milestones"]
Routes --> Service["Project Service<br/>setMilestones()"]
Service --> Repo["Project Repository<br/>updateProject()"]
Service --> BudgetCheck["validateMilestoneBudget()"]
Service --> Model["Entity Mapper<br/>Project/Milestone Types"]
Service --> PaymentSvc["Payment Service<br/>Escrow init & status"]
PaymentSvc --> EscrowSim["Escrow Contract Simulation"]
PaymentSvc --> BlockReg["Milestone Registry Service"]
BlockReg --> BlockRegContract["MilestoneRegistry.sol"]
EscrowSim --> EscrowContract["FreelanceEscrow.sol"]
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L450-L573)
- [project-service.ts](file://src/services/project-service.ts#L253-L300)
- [project-repository.ts](file://src/repositories/project-repository.ts#L1-L50)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L198-L250)
- [payment-service.ts](file://src/services/payment-service.ts#L590-L642)
- [escrow-contract.ts](file://src/services/escrow-contract.ts#L38-L199)
- [FreelanceEscrow.sol](file://contracts/FreelanceEscrow.sol#L1-L264)
- [MilestoneRegistry.sol](file://contracts/MilestoneRegistry.sol#L1-L145)
- [milestone-registry.ts](file://src/services/milestone-registry.ts#L1-L135)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L450-L573)
- [project-service.ts](file://src/services/project-service.ts#L253-L300)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L198-L250)
- [project-repository.ts](file://src/repositories/project-repository.ts#L1-L50)
- [payment-service.ts](file://src/services/payment-service.ts#L590-L642)
- [escrow-contract.ts](file://src/services/escrow-contract.ts#L38-L199)
- [FreelanceEscrow.sol](file://contracts/FreelanceEscrow.sol#L1-L264)
- [MilestoneRegistry.sol](file://contracts/MilestoneRegistry.sol#L1-L145)
- [milestone-registry.ts](file://src/services/milestone-registry.ts#L1-L135)

## Core Components
- Endpoint: POST /api/projects/{id}/milestones
  - Purpose: Employers define milestones for a project. The request body requires an array named milestones, each containing title, description, amount, and dueDate.
  - Authentication: Requires a Bearer token and role employer.
  - Validation: Input validation ensures each milestone has required fields and types; a project lock check prevents modification if proposals have been accepted.
  - Business Rule: The sum of milestone amounts must equal the project’s budget; otherwise a 400 error is returned.
  - Response: On success, returns the updated Project object with milestones embedded.

- Project Service
  - setMilestones(): Validates milestones, checks project lock, computes milestone sum vs budget, and persists milestones to the project.
  - validateMilestoneBudget(): Computes sum and compares to project budget.

- Project Repository
  - updateProject(): Persists milestone updates to the database.

- Entity Mapper
  - Defines Project and Milestone types and maps between database entities and API models.

- Payment Service and Escrow
  - Initializes escrow with milestones and budget.
  - Provides contract payment status including milestone statuses and pending amounts.
  - Releases milestone payments to the freelancer upon employer approval.

- Blockchain Integrations
  - Milestone Registry: Submits and approves milestone records on-chain for verifiable history.
  - FreelanceEscrow.sol: Smart contract that holds funds and releases them upon milestone approval.

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L450-L573)
- [project-service.ts](file://src/services/project-service.ts#L253-L300)
- [project-repository.ts](file://src/repositories/project-repository.ts#L35-L50)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L198-L250)
- [payment-service.ts](file://src/services/payment-service.ts#L590-L642)
- [escrow-contract.ts](file://src/services/escrow-contract.ts#L38-L199)
- [FreelanceEscrow.sol](file://contracts/FreelanceEscrow.sol#L1-L264)
- [MilestoneRegistry.sol](file://contracts/MilestoneRegistry.sol#L1-L145)
- [milestone-registry.ts](file://src/services/milestone-registry.ts#L1-L135)

## Architecture Overview
The milestone lifecycle integrates REST endpoints, service-layer validation, persistence, and blockchain services.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Project Routes"
participant S as "Project Service"
participant P as "Project Repository"
participant PS as "Payment Service"
participant E as "Escrow Contract Simulation"
participant MR as "Milestone Registry Service"
participant BC as "MilestoneRegistry.sol"
C->>R : POST /api/projects/{id}/milestones
R->>S : setMilestones(projectId, employerId, milestones)
S->>S : validateMilestoneBudget(sum == budget)
S->>P : updateProject({ milestones })
S-->>R : Project with milestones
R-->>C : 200 OK (Project)
Note over C,PS : Later, during contract execution
C->>PS : Initialize escrow with project budget and milestones
PS->>E : deployEscrow + depositToEscrow
PS-->>C : Escrow address
C->>PS : Approve milestone (employer)
PS->>E : releaseMilestone(escrowAddress, milestoneId)
PS->>MR : approveMilestoneOnRegistry(milestoneId)
MR->>BC : approveMilestone(...)
PS-->>C : Payment released, contract status updated
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L450-L573)
- [project-service.ts](file://src/services/project-service.ts#L253-L300)
- [project-repository.ts](file://src/repositories/project-repository.ts#L35-L50)
- [payment-service.ts](file://src/services/payment-service.ts#L590-L642)
- [escrow-contract.ts](file://src/services/escrow-contract.ts#L38-L199)
- [milestone-registry.ts](file://src/services/milestone-registry.ts#L137-L186)
- [MilestoneRegistry.sol](file://contracts/MilestoneRegistry.sol#L83-L111)

## Detailed Component Analysis

### POST /api/projects/{id}/milestones
- Purpose: Employers define milestones for a project.
- Path: /api/projects/{id}/milestones
- Method: POST
- Security: Bearer token required; role employer.
- Request body:
  - milestones: array of milestone objects
    - Each milestone requires:
      - title: string
      - description: string
      - amount: number (positive)
      - dueDate: ISO date-time string
- Validation:
  - At least one milestone required.
  - Each milestone must include title, description, amount, and dueDate.
  - Amount must be a positive number.
  - UUID path parameter validated.
  - Project ownership verified; project must not have accepted proposals.
- Business Rule:
  - Sum of milestone amounts must equal project budget; otherwise returns 400 with error code MILESTONE_SUM_MISMATCH.
- Responses:
  - 200 OK: Project with milestones embedded.
  - 400 Bad Request: Validation errors or budget mismatch.
  - 401 Unauthorized: Not authenticated.
  - 404 Not Found: Project not found.
  - 409 Conflict: Project locked (has accepted proposals).

Embedded in Project response:
- Project.milestones: array of Milestone objects with id, title, description, amount, dueDate, status.

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L450-L573)
- [project-service.ts](file://src/services/project-service.ts#L253-L300)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L198-L250)
- [project-repository.ts](file://src/repositories/project-repository.ts#L1-L50)

### Example: Three Milestones for a $3000 Project
- Request body (JSON):
  - milestones:
    - [{ title: "...", description: "...", amount: 1000, dueDate: "YYYY-MM-DDT00:00:00Z" }, 
       { title: "...", description: "...", amount: 1200, dueDate: "YYYY-MM-DDT00:00:00Z" }, 
       { title: "...", description: "...", amount: 800, dueDate: "YYYY-MM-DDT00:00:00Z" }]
- Total: 1000 + 1200 + 800 = 3000 (equals project budget)
- Response: 200 OK with Project including milestones array.

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L450-L573)
- [project-service.ts](file://src/services/project-service.ts#L253-L300)

### Escrow Payment Release Process
- Initialization:
  - Payment service initializes escrow with project budget and milestones.
  - Escrow contract deployed and funds deposited.
- Completion and Approval:
  - Freelancer requests milestone completion; project milestone status transitions to submitted.
  - Employer approves milestone; escrow releases payment to freelancer; milestone status becomes approved.
  - Payment service updates project and contract statuses accordingly.
- Blockchain Registry:
  - Milestone submission and approval recorded on-chain via Milestone Registry service and contract.

```mermaid
flowchart TD
Start(["Approve Milestone"]) --> CheckLock["Verify contract parties and milestone status"]
CheckLock --> ReleaseEscrow["Release milestone to freelancer via escrow"]
ReleaseEscrow --> UpdateProject["Update project milestone status to approved"]
UpdateProject --> UpdateContract["Update contract status if all approved"]
UpdateContract --> Registry["Approve milestone on blockchain registry"]
Registry --> Notify["Send payment released notifications"]
Notify --> End(["Done"])
```

**Diagram sources**
- [payment-service.ts](file://src/services/payment-service.ts#L196-L352)
- [escrow-contract.ts](file://src/services/escrow-contract.ts#L134-L199)
- [milestone-registry.ts](file://src/services/milestone-registry.ts#L137-L186)
- [FreelanceEscrow.sol](file://contracts/FreelanceEscrow.sol#L136-L161)

**Section sources**
- [payment-service.ts](file://src/services/payment-service.ts#L196-L352)
- [escrow-contract.ts](file://src/services/escrow-contract.ts#L134-L199)
- [milestone-registry.ts](file://src/services/milestone-registry.ts#L137-L186)
- [FreelanceEscrow.sol](file://contracts/FreelanceEscrow.sol#L136-L161)

## Dependency Analysis
- Route depends on Project Service for business logic.
- Project Service depends on Project Repository for persistence and on Entity Mapper for types.
- Payment Service depends on Escrow Contract Simulation and Milestone Registry Service.
- Blockchain contracts (FreelanceEscrow.sol, MilestoneRegistry.sol) integrate with services via transactions and confirmations.

```mermaid
graph LR
Routes["project-routes.ts"] --> Service["project-service.ts"]
Service --> Repo["project-repository.ts"]
Service --> Mapper["entity-mapper.ts"]
Service --> PaySvc["payment-service.ts"]
PaySvc --> EscrowSim["escrow-contract.ts"]
PaySvc --> RegSvc["milestone-registry.ts"]
RegSvc --> RegContract["MilestoneRegistry.sol"]
EscrowSim --> EscrowContract["FreelanceEscrow.sol"]
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L450-L573)
- [project-service.ts](file://src/services/project-service.ts#L253-L300)
- [project-repository.ts](file://src/repositories/project-repository.ts#L1-L50)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L198-L250)
- [payment-service.ts](file://src/services/payment-service.ts#L590-L642)
- [escrow-contract.ts](file://src/services/escrow-contract.ts#L38-L199)
- [milestone-registry.ts](file://src/services/milestone-registry.ts#L1-L135)
- [MilestoneRegistry.sol](file://contracts/MilestoneRegistry.sol#L1-L145)
- [FreelanceEscrow.sol](file://contracts/FreelanceEscrow.sol#L1-L264)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L450-L573)
- [project-service.ts](file://src/services/project-service.ts#L253-L300)
- [project-repository.ts](file://src/repositories/project-repository.ts#L1-L50)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L198-L250)
- [payment-service.ts](file://src/services/payment-service.ts#L590-L642)
- [escrow-contract.ts](file://src/services/escrow-contract.ts#L38-L199)
- [milestone-registry.ts](file://src/services/milestone-registry.ts#L1-L135)
- [MilestoneRegistry.sol](file://contracts/MilestoneRegistry.sol#L1-L145)
- [FreelanceEscrow.sol](file://contracts/FreelanceEscrow.sol#L1-L264)

## Performance Considerations
- Validation occurs before persistence; keep milestone arrays reasonably sized to minimize compute overhead.
- Escrow operations simulate blockchain transactions; in production, network latency and gas fees impact performance.
- Notifications are best-effort in simulation; ensure they do not block primary flows.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 400 Bad Request with VALIDATION_ERROR:
  - Ensure each milestone includes title, description, amount, and dueDate.
  - Verify amount is a positive number.
- 400 Bad Request with MILESTONE_SUM_MISMATCH:
  - Adjust milestone amounts so their sum equals the project budget.
- 409 Conflict (PROJECT_LOCKED):
  - Cannot modify milestones if the project has accepted proposals; remove accepted proposals or create a new project.
- 404 Not Found:
  - Verify the project ID exists and is accessible to the authenticated employer.
- Escrow release failures:
  - Confirm the escrow address and milestone status; ensure sufficient balance and correct approver identity.

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L450-L573)
- [project-service.ts](file://src/services/project-service.ts#L253-L300)
- [escrow-contract.ts](file://src/services/escrow-contract.ts#L134-L199)

## Conclusion
The POST /api/projects/{id}/milestones endpoint enables employers to define project milestones with strict validation and a critical budget alignment rule. Milestones are embedded in the Project response and drive the escrow payment release process, integrating with blockchain registries for verifiable milestone completion. Adhering to the validation rules and budget constraint ensures smooth execution of milestone approvals and fund releases.

---

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
curl -X POST http://localhost:7860/api/projects \
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

---

# Project Retrieval

<cite>
**Referenced Files in This Document**
- [project-routes.ts](file://src/routes/project-routes.ts)
- [project-service.ts](file://src/services/project-service.ts)
- [project-repository.ts](file://src/repositories/project-repository.ts)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts)
- [swagger.ts](file://src/config/swagger.ts)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts)
- [base-repository.ts](file://src/repositories/base-repository.ts)
- [API-DOCUMENTATION.md](file://docs/API-DOCUMENTATION.md)
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

## Introduction
This document provides API documentation for project retrieval endpoints in the FreelanceXchain system. It covers:
- Listing open projects with filtering and pagination
- Retrieving a specific project by UUID
- Query parameters for filtering (keyword, skills, minBudget, maxBudget)
- Pagination using limit and continuationToken
- Response structure for paginated lists
- Single-project retrieval response and error handling

## Project Structure
The project retrieval functionality spans routing, service, repository, and model layers, with Swagger schemas and validation middleware.

```mermaid
graph TB
Client["Client"] --> Routes["Routes<br/>project-routes.ts"]
Routes --> Service["Services<br/>project-service.ts"]
Service --> Repo["Repositories<br/>project-repository.ts"]
Repo --> DB["Supabase DB"]
Routes --> Swagger["Swagger Schemas<br/>swagger.ts"]
Routes --> Validator["Validation Middleware<br/>validation-middleware.ts"]
Service --> Mapper["Entity Mapper<br/>entity-mapper.ts"]
Repo --> BaseRepo["Base Repository<br/>base-repository.ts"]
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L1-L215)
- [project-service.ts](file://src/services/project-service.ts#L1-L388)
- [project-repository.ts](file://src/repositories/project-repository.ts#L1-L191)
- [swagger.ts](file://src/config/swagger.ts#L1-L233)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L1-L815)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L1-L412)
- [base-repository.ts](file://src/repositories/base-repository.ts#L1-L149)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L1-L215)
- [swagger.ts](file://src/config/swagger.ts#L1-L233)

## Core Components
- Route handlers for GET /api/projects and GET /api/projects/{id}
- Service functions orchestrating filtering and pagination
- Repository methods querying Supabase with filters and pagination
- Validation middleware for UUID and query parameters
- Swagger schemas for Project and pagination metadata
- Entity mapper for consistent API model shape

Key responsibilities:
- GET /api/projects: applies keyword, skills, or budget filters; returns paginated items with hasMore and continuationToken
- GET /api/projects/{id}: retrieves a single project by UUID; returns 404 if not found

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L75-L215)
- [project-service.ts](file://src/services/project-service.ts#L325-L363)
- [project-repository.ts](file://src/repositories/project-repository.ts#L76-L188)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L758-L815)
- [swagger.ts](file://src/config/swagger.ts#L106-L138)

## Architecture Overview
The retrieval flow follows a layered architecture: routes -> services -> repositories -> database, with validation and schema enforcement.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Routes<br/>project-routes.ts"
participant S as "Service<br/>project-service.ts"
participant P as "Repository<br/>project-repository.ts"
participant D as "Supabase DB"
C->>R : GET /api/projects?keyword=...&skills=...&minBudget=...&maxBudget=...&limit=...&continuationToken=...
R->>R : validateUUID() middleware (for id path)
R->>R : parse query params and options
alt keyword provided
R->>S : searchProjects(keyword, options)
else skills provided
R->>S : listProjectsBySkills(skillIds, options)
else min/max budget provided
R->>S : listProjectsByBudgetRange(min, max, options)
else
R->>S : listOpenProjects(options)
end
S->>P : apply filters and pagination
P->>D : SELECT ... WHERE ... ORDER ... LIMIT/OFFSET
D-->>P : items, count
P-->>S : PaginatedResult
S-->>R : { items, hasMore, total }
R-->>C : 200 OK with items array and pagination metadata
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L132-L168)
- [project-service.ts](file://src/services/project-service.ts#L340-L363)
- [project-repository.ts](file://src/repositories/project-repository.ts#L167-L188)

## Detailed Component Analysis

### Endpoint: GET /api/projects
- Purpose: List open projects with optional filters and pagination
- Query parameters:
  - keyword: string; full-text search across title and description
  - skills: string; comma-separated skill IDs
  - minBudget: number; minimum budget filter
  - maxBudget: number; maximum budget filter
  - limit: integer; page size (default applied)
  - continuationToken: string; pagination token
- Behavior:
  - If keyword is present: searchProjects
  - Else if skills provided: listProjectsBySkills
  - Else if both minBudget and maxBudget provided: listProjectsByBudgetRange
  - Else: listOpenProjects
- Response:
  - 200 OK with object containing:
    - items: array of Project
    - hasMore: boolean indicating if more pages exist
    - continuationToken: string for next page (when applicable)
- Pagination:
  - Uses QueryOptions with limit and continuationToken
  - Repositories compute hasMore and total counts

```mermaid
flowchart TD
Start(["Route Entry"]) --> Parse["Parse query params"]
Parse --> Keyword{"keyword provided?"}
Keyword --> |Yes| CallSearch["Call searchProjects()"]
Keyword --> |No| Skills{"skills provided?"}
Skills --> |Yes| CallSkills["Call listProjectsBySkills()"]
Skills --> |No| Budget{"minBudget and maxBudget provided?"}
Budget --> |Yes| CallBudget["Call listProjectsByBudgetRange()"]
Budget --> |No| CallOpen["Call listOpenProjects()"]
CallSearch --> RepoSearch["Repository searchProjects()"]
CallSkills --> RepoSkills["Repository getProjectsBySkills()"]
CallBudget --> RepoBudget["Repository getProjectsByBudgetRange()"]
CallOpen --> RepoOpen["Repository getAllOpenProjects()"]
RepoSearch --> Result["PaginatedResult"]
RepoSkills --> Result
RepoBudget --> Result
RepoOpen --> Result
Result --> Send["Send 200 OK with items, hasMore, total"]
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L132-L168)
- [project-service.ts](file://src/services/project-service.ts#L340-L363)
- [project-repository.ts](file://src/repositories/project-repository.ts#L167-L188)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L75-L168)
- [project-service.ts](file://src/services/project-service.ts#L325-L363)
- [project-repository.ts](file://src/repositories/project-repository.ts#L76-L188)
- [base-repository.ts](file://src/repositories/base-repository.ts#L1-L149)

### Endpoint: GET /api/projects/{id}
- Purpose: Retrieve a specific project by UUID
- Path parameter:
  - id: string; UUID of the project
- Validation:
  - validateUUID middleware ensures UUID format
- Responses:
  - 200 OK with Project schema
  - 404 Not Found when project does not exist
- Error handling:
  - Service returns NOT_FOUND; route responds with 404 and standardized error envelope

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Routes<br/>project-routes.ts"
participant S as "Service<br/>project-service.ts"
participant P as "Repository<br/>project-repository.ts"
participant D as "Supabase DB"
C->>R : GET /api/projects/{id}
R->>R : validateUUID()
R->>S : getProjectById(id)
S->>P : findProjectById(id)
P->>D : SELECT by id
D-->>P : Project or null
P-->>S : Project or null
alt found
S-->>R : success=true, data=Project
R-->>C : 200 OK with Project
else not found
S-->>R : success=false, error={code : "NOT_FOUND"}
R-->>C : 404 Not Found with error envelope
end
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L171-L215)
- [project-service.ts](file://src/services/project-service.ts#L121-L129)
- [project-repository.ts](file://src/repositories/project-repository.ts#L47-L53)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L171-L215)
- [project-service.ts](file://src/services/project-service.ts#L121-L129)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L758-L815)

### Response Schemas and Examples

- Project schema (Swagger):
  - Fields include id, employerId, title, description, requiredSkills, budget, deadline, status, milestones, createdAt, updatedAt
- Pagination metadata (Swagger):
  - totalCount, pageSize, hasMore, continuationToken

Examples:
- Search for projects by JavaScript skill:
  - GET /api/projects?skills=skill-a,skill-b,skill-c&limit=20
  - Use comma-separated skill IDs
- Search for projects with $500–$1000 budget range:
  - GET /api/projects?minBudget=500&maxBudget=1000&limit=20

Notes:
- The repository applies filters and pagination; hasMore indicates whether more items are available
- continuationToken is used for pagination; the exact token format is handled by the repository layer

**Section sources**
- [swagger.ts](file://src/config/swagger.ts#L106-L138)
- [project-routes.ts](file://src/routes/project-routes.ts#L75-L168)
- [project-repository.ts](file://src/repositories/project-repository.ts#L118-L188)
- [API-DOCUMENTATION.md](file://docs/API-DOCUMENTATION.md#L613-L642)

## Dependency Analysis
```mermaid
classDiagram
class Routes {
+GET /api/projects
+GET /api/projects/ : id
}
class Service {
+listOpenProjects()
+searchProjects()
+listProjectsBySkills()
+listProjectsByBudgetRange()
+getProjectById()
}
class Repository {
+getAllOpenProjects()
+searchProjects()
+getProjectsBySkills()
+getProjectsByBudgetRange()
+findProjectById()
}
class BaseRepository {
+queryPaginated()
}
class Swagger {
+Project schema
+Pagination meta schema
}
class Validator {
+validateUUID()
}
class Mapper {
+mapProjectFromEntity()
}
Routes --> Service : "calls"
Service --> Repository : "calls"
Repository --|> BaseRepository : "extends"
Routes --> Swagger : "documents"
Routes --> Validator : "uses"
Service --> Mapper : "maps"
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L1-L215)
- [project-service.ts](file://src/services/project-service.ts#L1-L388)
- [project-repository.ts](file://src/repositories/project-repository.ts#L1-L191)
- [base-repository.ts](file://src/repositories/base-repository.ts#L1-L149)
- [swagger.ts](file://src/config/swagger.ts#L1-L233)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L758-L815)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L198-L250)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L1-L215)
- [project-service.ts](file://src/services/project-service.ts#L1-L388)
- [project-repository.ts](file://src/repositories/project-repository.ts#L1-L191)
- [base-repository.ts](file://src/repositories/base-repository.ts#L1-L149)
- [swagger.ts](file://src/config/swagger.ts#L1-L233)
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L758-L815)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L198-L250)

## Performance Considerations
- Filtering and pagination:
  - Repository methods use LIMIT and OFFSET with explicit ordering and count for hasMore computation
  - Budget range filtering is applied server-side; ensure indexes on status and budget for optimal performance
- In-memory filtering:
  - Skills filtering is performed in-memory after fetching open projects; consider moving to database-level filtering if scale grows
- Query conversion:
  - Validation middleware converts query strings to typed values (numbers, booleans, arrays) before service invocation

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 400 Bad Request for invalid UUID:
  - Occurs when path parameter id is not a valid UUID; ensure UUID format
- 404 Not Found:
  - Project not found by ID; verify project exists and UUID is correct
- 400 Bad Request for query validation:
  - Ensure numeric parameters (minBudget, maxBudget, limit) are valid and within allowed ranges
- Pagination:
  - Use continuationToken for subsequent pages; ensure limit is within supported bounds

Standardized error envelope:
- All errors include error.code, error.message, optional details, timestamp, and requestId

**Section sources**
- [validation-middleware.ts](file://src/middleware/validation-middleware.ts#L758-L815)
- [project-routes.ts](file://src/routes/project-routes.ts#L199-L215)
- [API-DOCUMENTATION.md](file://docs/API-DOCUMENTATION.md#L613-L642)

## Conclusion
The project retrieval endpoints provide flexible filtering (keyword, skills, budget range) and robust pagination. The route handlers delegate to services, which orchestrate repository queries to Supabase. Swagger schemas define the Project model and pagination metadata, while validation middleware ensures parameter correctness. Use the documented query parameters and response structure to integrate project listing and single-project retrieval seamlessly.

---

# Project Update

<cite>
**Referenced Files in This Document**
- [project-routes.ts](file://src/routes/project-routes.ts)
- [project-service.ts](file://src/services/project-service.ts)
- [project-repository.ts](file://src/repositories/project-repository.ts)
- [proposal-repository.ts](file://src/repositories/proposal-repository.ts)
- [swagger.ts](file://src/config/swagger.ts)
- [API-DOCUMENTATION.md](file://docs/API-DOCUMENTATION.md)
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

## Introduction
This document describes the PATCH /api/projects/{id} endpoint for updating a project in the FreelanceXchain system. It explains who can update a project, which fields are updatable, validation rules mirroring creation constraints, and the 409 Conflict response when a project has accepted proposals. It also details the response format returning the updated Project object.

## Project Structure
The project update flow spans route handlers, service logic, and repositories:
- Route handler validates authentication and role, applies lightweight input validation, and delegates to the service.
- Service enforces ownership, checks for accepted proposals (locking), validates skills and budget constraints, and persists updates.
- Repository performs the database update operation.

```mermaid
graph TB
Client["Client"] --> Routes["Routes: project-routes.ts"]
Routes --> Service["Service: project-service.ts"]
Service --> RepoProject["Repository: project-repository.ts"]
Service --> RepoProposal["Repository: proposal-repository.ts"]
RepoProject --> DB["Database"]
RepoProposal --> DB
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L335-L447)
- [project-service.ts](file://src/services/project-service.ts#L132-L200)
- [project-repository.ts](file://src/repositories/project-repository.ts#L39-L45)
- [proposal-repository.ts](file://src/repositories/proposal-repository.ts#L72-L82)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L335-L447)
- [project-service.ts](file://src/services/project-service.ts#L132-L200)
- [project-repository.ts](file://src/repositories/project-repository.ts#L39-L45)
- [proposal-repository.ts](file://src/repositories/proposal-repository.ts#L72-L82)

## Core Components
- Endpoint: PATCH /api/projects/{id}
- Authentication: Bearer token required
- Authorization: Only the project owner (employer) can update
- Locking rule: Cannot update a project that has accepted proposals (409 Conflict)
- Updatable fields: title, description, requiredSkills, budget, deadline, status
- Validation: Mirrors creation constraints (minimum lengths, budget minimum, skill IDs)
- Response: Updated Project object

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L335-L447)
- [project-service.ts](file://src/services/project-service.ts#L132-L200)
- [swagger.ts](file://src/config/swagger.ts#L106-L127)

## Architecture Overview
The update request follows this sequence:

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Routes : project-routes.ts"
participant S as "Service : project-service.ts"
participant PR as "ProposalRepo : proposal-repository.ts"
participant JR as "ProjectRepo : project-repository.ts"
C->>R : "PATCH /api/projects/{id}" with body
R->>R : "authMiddleware, requireRole('employer'), validateUUID()"
R->>S : "updateProject(projectId, employerId, payload)"
S->>JR : "find project by id"
S->>PR : "hasAcceptedProposal(projectId)?"
alt "accepted proposal exists"
S-->>R : "error : PROJECT_LOCKED"
R-->>C : "409 Conflict"
else "no accepted proposal"
S->>S : "validate skills and budget constraints"
S->>JR : "updateProject(projectId, updates)"
JR-->>S : "updated project"
S-->>R : "success"
R-->>C : "200 OK with Project"
end
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L395-L447)
- [project-service.ts](file://src/services/project-service.ts#L132-L200)
- [proposal-repository.ts](file://src/repositories/proposal-repository.ts#L72-L82)
- [project-repository.ts](file://src/repositories/project-repository.ts#L39-L45)

## Detailed Component Analysis

### Endpoint Definition and Behavior
- Path: /api/projects/{id}
- Method: PATCH
- Security: bearerAuth
- Role: employer
- Path parameter: id (UUID)
- Request body fields:
  - title (string, min length 5)
  - description (string, min length 20)
  - requiredSkills (array of objects with skillId)
  - budget (number, minimum 100)
  - deadline (date-time)
  - status (enum draft, open, in_progress, completed, cancelled)
- Responses:
  - 200: Project updated successfully
  - 400: Validation error or invalid UUID
  - 401: Unauthorized
  - 404: Not found
  - 409: Project locked (has accepted proposals)

Notes:
- Only the project owner (employer) can update.
- If the project has any accepted proposals, updates are rejected with 409 Conflict.
- Validation mirrors creation constraints for title, description, budget, and skill IDs.

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L335-L447)
- [swagger.ts](file://src/config/swagger.ts#L106-L127)

### Route Handler Logic
Key behaviors:
- Authentication and role enforcement occur before any business logic.
- UUID validation is performed on the path parameter.
- Lightweight validation is applied to fields present in the request body.
- Delegates to service layer for ownership, locking, and persistence.
- Maps service error codes to appropriate HTTP status codes (including 409 for PROJECT_LOCKED).

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L395-L447)

### Service Layer Validation and Business Rules
Key behaviors:
- Ownership check: project must belong to the authenticated employer.
- Locking check: if any proposal has status accepted, reject with PROJECT_LOCKED.
- Skill validation: requiredSkills skillId values must correspond to active skills.
- Budget constraint: when updating budget or milestones, ensure milestone amounts sum to the new budget.
- Partial updates: only provided fields are updated; others remain unchanged.
- Persistence: repository update returns the updated project entity.

**Section sources**
- [project-service.ts](file://src/services/project-service.ts#L132-L200)

### Repository Operations
- ProjectRepository.updateProject(id, updates) persists changes to the project record.
- ProposalRepository.hasAcceptedProposal(projectId) determines whether any proposal is accepted, enforcing the lock.

**Section sources**
- [project-repository.ts](file://src/repositories/project-repository.ts#L39-L45)
- [proposal-repository.ts](file://src/repositories/proposal-repository.ts#L72-L82)

### Validation Rules (Mirroring Creation Constraints)
- title: if provided, must be at least 5 characters
- description: if provided, must be at least 20 characters
- budget: if provided, must be at least 100
- requiredSkills: if provided, each skillId must be a valid UUID and correspond to an active skill
- deadline: if provided, must be a valid date-time string
- status: must be one of draft, open, in_progress, completed, cancelled

These rules are enforced during update and ensure consistency with creation constraints.

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L410-L429)
- [project-service.ts](file://src/services/project-service.ts#L132-L200)

### Example Request: Update Budget and Add a New Required Skill
- Purpose: Demonstrate updating budget and adding a new required skill to a project.
- Steps:
  - Send a PATCH request to /api/projects/{id}
  - Include budget and requiredSkills in the body
  - requiredSkills should include the new skillId
- Notes:
  - Ensure the project has no accepted proposals before sending
  - The service validates that the new skillId corresponds to an active skill

[No sources needed since this section provides a usage example without quoting specific code]

### Response Format
- On success (200 OK): Returns the updated Project object with all fields.
- Error responses (400/401/404/409): Return a standardized error envelope with code, message, and optional details.

Swagger schema for Project:
- id: string (uuid)
- employerId: string (uuid)
- title: string
- description: string
- requiredSkills: array of SkillReference
- budget: number
- deadline: string (date-time)
- status: enum draft, open, in_progress, completed, cancelled
- milestones: array of Milestone
- createdAt: string (date-time)
- updatedAt: string (date-time)

**Section sources**
- [swagger.ts](file://src/config/swagger.ts#L106-L127)
- [API-DOCUMENTATION.md](file://docs/API-DOCUMENTATION.md#L227-L290)

## Dependency Analysis
The update flow depends on:
- Route handler depends on auth middleware, role middleware, and UUID validator.
- Service depends on project repository and proposal repository.
- Repositories depend on shared base repository and Supabase client.

```mermaid
graph LR
Routes["project-routes.ts"] --> Service["project-service.ts"]
Service --> ProjRepo["project-repository.ts"]
Service --> PropRepo["proposal-repository.ts"]
ProjRepo --> BaseRepo["base-repository.ts"]
PropRepo --> BaseRepo
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L395-L447)
- [project-service.ts](file://src/services/project-service.ts#L132-L200)
- [project-repository.ts](file://src/repositories/project-repository.ts#L39-L45)
- [proposal-repository.ts](file://src/repositories/proposal-repository.ts#L72-L82)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L395-L447)
- [project-service.ts](file://src/services/project-service.ts#L132-L200)
- [project-repository.ts](file://src/repositories/project-repository.ts#L39-L45)
- [proposal-repository.ts](file://src/repositories/proposal-repository.ts#L72-L82)

## Performance Considerations
- The update is a single write operation to the project table.
- Skill validation iterates over provided skillIds; keep requiredSkills minimal to reduce overhead.
- Budget validation checks milestone sums when milestones exist; avoid frequent partial updates to minimize repeated checks.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized: Ensure a valid Bearer token is included in the Authorization header.
- 403 Forbidden: Only the project owner (employer) can update; verify the authenticated user owns the project.
- 404 Not Found: The project ID may be invalid or the project does not exist.
- 409 Conflict (PROJECT_LOCKED): The project has at least one accepted proposal. Withdraw or cancel the proposal before updating, or accept the business risk if applicable.
- 400 Validation Error: 
  - title must be at least 5 characters
  - description must be at least 20 characters
  - budget must be at least 100
  - requiredSkills skillId must be valid and correspond to an active skill
  - deadline must be a valid date-time string
  - status must be one of draft, open, in_progress, completed, cancelled

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L395-L447)
- [project-service.ts](file://src/services/project-service.ts#L132-L200)

## Conclusion
The PATCH /api/projects/{id} endpoint enables employers to update project details while maintaining strong safeguards. Ownership verification and the accepted-proposal lock prevent modifications when a project is actively engaged. Validation rules mirror creation constraints to preserve data quality. The response returns the updated Project object, ensuring clients have the latest state.

---

# Proposal Listing

<cite>
**Referenced Files in This Document**
- [project-routes.ts](file://src/routes/project-routes.ts)
- [proposal-service.ts](file://src/services/proposal-service.ts)
- [proposal-repository.ts](file://src/repositories/proposal-repository.ts)
- [base-repository.ts](file://src/repositories/base-repository.ts)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts)
- [swagger.ts](file://src/config/swagger.ts)
- [API-DOCUMENTATION.md](file://docs/API-DOCUMENTATION.md)
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

## Introduction
This document describes the GET /api/projects/{id}/proposals endpoint used to retrieve all proposals submitted for a given project. It explains the authentication and authorization requirements, pagination behavior, and the response structure. It also documents the 403 Forbidden response when a user attempts to access proposals for a project they do not own.

## Project Structure
The endpoint is implemented in the projects route module and orchestrated by the proposal service and repository layers. The Swagger/OpenAPI specification defines the endpoint’s parameters and response schema.

```mermaid
graph TB
Client["Client"] --> Routes["Project Routes<br/>GET /api/projects/:id/proposals"]
Routes --> Auth["Auth Middleware<br/>Bearer + Role Check"]
Auth --> Service["Proposal Service<br/>getProposalsByProject"]
Service --> Repo["Proposal Repository<br/>getProposalsByProject"]
Repo --> DB["Supabase DB"]
Service --> Mapper["Entity Mapper<br/>mapProposalFromEntity"]
Routes --> Client
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L575-L683)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- [proposal-service.ts](file://src/services/proposal-service.ts#L141-L163)
- [proposal-repository.ts](file://src/repositories/proposal-repository.ts#L39-L58)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L252-L279)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L575-L683)
- [swagger.ts](file://src/config/swagger.ts#L139-L152)

## Core Components
- Endpoint: GET /api/projects/{id}/proposals
- Authentication: Requires a valid Bearer token
- Authorization: Employer role required; caller must own the project
- Pagination: limit and continuationToken query parameters
- Response: items array of proposals, hasMore flag, and continuationToken

Key implementation references:
- Route handler and validation: [project-routes.ts](file://src/routes/project-routes.ts#L575-L683)
- Service method: [proposal-service.ts](file://src/services/proposal-service.ts#L141-L163)
- Repository method: [proposal-repository.ts](file://src/repositories/proposal-repository.ts#L39-L58)
- Pagination model: [base-repository.ts](file://src/repositories/base-repository.ts#L1-L17)
- Proposal model: [entity-mapper.ts](file://src/utils/entity-mapper.ts#L252-L279)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L575-L683)
- [proposal-service.ts](file://src/services/proposal-service.ts#L141-L163)
- [proposal-repository.ts](file://src/repositories/proposal-repository.ts#L39-L58)
- [base-repository.ts](file://src/repositories/base-repository.ts#L1-L17)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L252-L279)

## Architecture Overview
The request flow for retrieving proposals for a project:

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Project Routes"
participant A as "Auth Middleware"
participant S as "Proposal Service"
participant P as "Proposal Repository"
participant D as "Supabase DB"
C->>R : "GET /api/projects/{id}/proposals"
R->>A : "authMiddleware + requireRole('employer')"
A-->>R : "Authenticated user"
R->>R : "validateUUID(id)"
R->>S : "getProposalsByProject(projectId, options)"
S->>P : "getProposalsByProject(projectId, options)"
P->>D : "SELECT ... WHERE project_id=? ORDER BY created_at DESC LIMIT/OFFSET"
D-->>P : "Proposals + count"
P-->>S : "PaginatedResult<ProposalEntity>"
S-->>R : "PaginatedResult<Proposal>"
R-->>C : "200 OK { items, hasMore, continuationToken }"
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L575-L683)
- [proposal-service.ts](file://src/services/proposal-service.ts#L141-L163)
- [proposal-repository.ts](file://src/repositories/proposal-repository.ts#L39-L58)
- [base-repository.ts](file://src/repositories/base-repository.ts#L129-L147)

## Detailed Component Analysis

### Endpoint Definition and Behavior
- Path: /api/projects/{id}/proposals
- Method: GET
- Authentication: Bearer token required
- Authorization: Employer role required; endpoint verifies the requesting employer owns the project
- Parameters:
  - Path: id (UUID)
  - Query: limit (integer, default depends on route), continuationToken (string)
- Response body:
  - items: array of Proposal objects
  - hasMore: boolean indicating if more pages exist
  - continuationToken: string for subsequent pages (Swagger schema defines PaginationMeta with totalCount, pageSize, hasMore, continuationToken)

Implementation references:
- Route and validation: [project-routes.ts](file://src/routes/project-routes.ts#L575-L683)
- Swagger schema for Proposal: [swagger.ts](file://src/config/swagger.ts#L139-L152)
- Swagger PaginationMeta: [swagger.ts](file://src/config/swagger.ts#L215-L223)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L575-L683)
- [swagger.ts](file://src/config/swagger.ts#L139-L152)
- [swagger.ts](file://src/config/swagger.ts#L215-L223)

### Authentication and Authorization
- Bearer token validation occurs via authMiddleware
- Role enforcement ensures only employers can access this endpoint
- Ownership verification checks that the logged-in employer is the project owner

References:
- Auth middleware: [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- Employer role enforcement: [project-routes.ts](file://src/routes/project-routes.ts#L628-L683)

**Section sources**
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- [project-routes.ts](file://src/routes/project-routes.ts#L628-L683)

### Pagination
- Query parameters:
  - limit: number of items per page (defaults to 20 in route)
  - continuationToken: token for fetching the next page
- Repository-level pagination uses limit/offset under the hood
- Response includes hasMore and continuationToken for client-side pagination

References:
- Route pagination handling: [project-routes.ts](file://src/routes/project-routes.ts#L628-L683)
- Base repository pagination model: [base-repository.ts](file://src/repositories/base-repository.ts#L1-L17)
- Repository query with limit/offset: [proposal-repository.ts](file://src/repositories/proposal-repository.ts#L39-L58)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L628-L683)
- [base-repository.ts](file://src/repositories/base-repository.ts#L1-L17)
- [proposal-repository.ts](file://src/repositories/proposal-repository.ts#L39-L58)

### Response Structure
- items: array of Proposal objects
- hasMore: boolean
- continuationToken: string

Proposal model fields:
- id, projectId, freelancerId, coverLetter, proposedRate, estimatedDuration, status, createdAt, updatedAt

References:
- Proposal schema: [swagger.ts](file://src/config/swagger.ts#L139-L152)
- Proposal entity mapping: [entity-mapper.ts](file://src/utils/entity-mapper.ts#L252-L279)

**Section sources**
- [swagger.ts](file://src/config/swagger.ts#L139-L152)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L252-L279)

### Example Response
The endpoint returns an object with:
- items: array of Proposal entries
- hasMore: boolean
- continuationToken: string

Note: The repository returns total count; the route returns items, hasMore, and continuationToken. The Swagger PaginationMeta schema documents totalCount, pageSize, hasMore, continuationToken.

References:
- Route returns paginated result: [project-routes.ts](file://src/routes/project-routes.ts#L668-L681)
- Service maps to Proposal: [proposal-service.ts](file://src/services/proposal-service.ts#L141-L163)
- Proposal schema: [swagger.ts](file://src/config/swagger.ts#L139-L152)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L668-L681)
- [proposal-service.ts](file://src/services/proposal-service.ts#L141-L163)
- [swagger.ts](file://src/config/swagger.ts#L139-L152)

### Error Handling
- 401 Unauthorized: Missing or invalid Bearer token
- 403 Forbidden: Attempting to access proposals for a project owned by another employer
- 404 Not Found: Project not found or proposals not found
- 400 Bad Request: Invalid UUID format (validated by middleware)

References:
- Auth middleware errors: [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- Ownership check and 403: [project-routes.ts](file://src/routes/project-routes.ts#L644-L662)
- Project not found: [project-routes.ts](file://src/routes/project-routes.ts#L645-L653)
- Service-level not found: [proposal-service.ts](file://src/services/proposal-service.ts#L141-L163)

**Section sources**
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- [project-routes.ts](file://src/routes/project-routes.ts#L644-L662)
- [proposal-service.ts](file://src/services/proposal-service.ts#L141-L163)

## Dependency Analysis
```mermaid
graph LR
PR["project-routes.ts"] --> AM["auth-middleware.ts"]
PR --> PS["proposal-service.ts"]
PS --> PRV["proposal-repository.ts"]
PRV --> BR["base-repository.ts"]
PS --> EM["entity-mapper.ts"]
```

**Diagram sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L575-L683)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- [proposal-service.ts](file://src/services/proposal-service.ts#L141-L163)
- [proposal-repository.ts](file://src/repositories/proposal-repository.ts#L39-L58)
- [base-repository.ts](file://src/repositories/base-repository.ts#L1-L17)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L252-L279)

**Section sources**
- [project-routes.ts](file://src/routes/project-routes.ts#L575-L683)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- [proposal-service.ts](file://src/services/proposal-service.ts#L141-L163)
- [proposal-repository.ts](file://src/repositories/proposal-repository.ts#L39-L58)
- [base-repository.ts](file://src/repositories/base-repository.ts#L1-L17)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L252-L279)

## Performance Considerations
- Pagination defaults to 20 items per page; adjust limit as needed to balance responsiveness and payload size.
- The repository uses OFFSET/LIMIT for pagination; consider indexing on project_id and created_at for optimal query performance.
- The endpoint sorts by created_at descending; ensure appropriate indexes exist for efficient ordering.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized: Ensure Authorization header includes a valid Bearer token.
- 403 Forbidden: Only the employer who owns the project can list its proposals.
- 404 Not Found: Project ID may be invalid or the project does not exist.
- Invalid UUID: Confirm the id path parameter is a valid UUID.

References:
- Auth middleware behavior: [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- Ownership verification: [project-routes.ts](file://src/routes/project-routes.ts#L644-L662)
- Project not found: [project-routes.ts](file://src/routes/project-routes.ts#L645-L653)

**Section sources**
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- [project-routes.ts](file://src/routes/project-routes.ts#L644-L662)
- [project-routes.ts](file://src/routes/project-routes.ts#L645-L653)

## Conclusion
The GET /api/projects/{id}/proposals endpoint securely lists all proposals for a project with robust authentication, role-based authorization, and pagination. Employers can retrieve proposals for their own projects, and clients can paginate using limit and continuationToken. The response structure aligns with the Swagger schema for proposals and pagination metadata.