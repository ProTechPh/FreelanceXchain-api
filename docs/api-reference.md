# API Reference

> Detailed API documentation is available via Swagger at `/api-docs` when running the server.

# AI Matching API

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
This document provides comprehensive API documentation for the AI-powered matching system in the FreelanceXchain platform. It covers:
- HTTP methods, URL patterns, request/response schemas, and authentication requirements (JWT Bearer)
- AI model inputs and outputs for project recommendations, freelancer recommendations, skill extraction, and skill gap analysis
- Match scores, confidence levels, and reasoning explanations
- Client implementation examples for integrating AI recommendations into user interfaces
- Rate limiting for AI service calls and the data sources used for skill matching and market demand analysis

## Project Structure
The AI matching endpoints are implemented as Express routes backed by a matching service that orchestrates AI clients and repositories. The system enforces JWT authentication and applies rate limiting.

```mermaid
graph TB
Client["Client Application"] --> Routes["Express Routes<br/>/api/matching/*"]
Routes --> Auth["Auth Middleware<br/>JWT Validation"]
Routes --> Service["Matching Service"]
Service --> RepoProj["Project Repository"]
Service --> RepoFP["Freelancer Profile Repository"]
Service --> SkillSvc["Skill Service"]
Service --> AIClient["AI Client"]
AIClient --> LLM["LLM API"]
AIClient --> Fallback["Keyword-based Fallback"]
```

## Core Components
- Matching Routes: Define endpoints for project recommendations, freelancer recommendations, skill extraction, and skill gap analysis. All endpoints require JWT Bearer authentication.
- Matching Service: Implements recommendation logic, integrates AI client, and falls back to keyword-based matching when AI is unavailable.
- AI Client: Manages LLM API connectivity, retries, timeouts, and response parsing. Provides prompts for skill matching, extraction, and gap analysis.
- Authentication Middleware: Validates JWT tokens and attaches user context to requests.
- Rate Limiter: Applies request quotas to protect the API and AI resources.
- Skill Service and Repositories: Provide taxonomy data (active skills) used for mapping and extraction.

## Architecture Overview
The AI Matching API follows a layered architecture:
- Presentation Layer: Express routes define endpoints and handle request validation.
- Application Layer: Matching service coordinates repositories and AI client.
- AI Layer: AI client communicates with LLM API and provides fallbacks.
- Persistence Layer: Supabase-backed repositories manage data access.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Routes"
participant M as "Matching Service"
participant A as "AI Client"
participant P as "LLM API"
C->>R : "GET /api/matching/projects?limit=N"
R->>R : "authMiddleware()"
R->>M : "getProjectRecommendations(userId, limit)"
M->>M : "Load freelancer profile and open projects"
M->>A : "analyzeSkillMatch(freelancerSkills, projectRequirements, reputationScore)"
alt "AI Available"
A->>P : "POST : generateContent"
P-->>A : "JSON response"
A-->>M : "SkillMatchResult"
else "Fallback"
M->>M : "keywordMatchSkills(...)"
end
M-->>R : "ProjectRecommendation[]"
R-->>C : "200 OK"
```

## Detailed Component Analysis

### Authentication and Security
- All matching endpoints require a Bearer token in the Authorization header.
- The auth middleware validates the token and attaches user context to the request.
- The Swagger configuration defines the bearerAuth security scheme.

### Rate Limiting
- General API rate limiter: 100 requests per minute per client IP.
- Sensitive operations can use a separate limiter if needed.
- The rate limiter responds with 429 Too Many Requests and Retry-After header.

### Endpoint Definitions

#### GET /api/matching/projects
- Purpose: Retrieve AI-powered project recommendations for a freelancer.
- Authentication: JWT Bearer required.
- Query Parameters:
  - limit (integer, default 10, min 1, max 50)
- Response: Array of ProjectRecommendation objects.
- Errors:
  - 401 Unauthorized (invalid or missing token)
  - 404 Not Found (freelancer profile not found)
  - 400 Bad Request (validation errors)

ProjectRecommendation schema:
- projectId: string
- matchScore: number (0–100)
- matchedSkills: string[]
- missingSkills: string[]
- reasoning: string

#### GET /api/matching/freelancers/{projectId}
- Purpose: Retrieve AI-powered freelancer recommendations for a project.
- Authentication: JWT Bearer required.
- Path Parameters:
  - projectId: string (UUID)
- Query Parameters:
  - limit (integer, default 10, min 1, max 50)
- Response: Array of FreelancerRecommendation objects.
- Errors:
  - 401 Unauthorized (invalid or missing token)
  - 400 Bad Request (invalid UUID or validation)
  - 404 Not Found (project not found)

FreelancerRecommendation schema:
- freelancerId: string
- matchScore: number (0–100)
- reputationScore: number (fixed default in service)
- combinedScore: number (weighted combination)
- matchedSkills: string[]
- reasoning: string

#### POST /api/matching/extract-skills
- Purpose: Extract skills from text and map them to the platform taxonomy.
- Authentication: JWT Bearer required.
- Request Body:
  - text: string (required)
- Response: Array of ExtractedSkill objects.
- Errors:
  - 400 Bad Request (invalid request)
  - 401 Unauthorized (invalid or missing token)

ExtractedSkill schema:
- skillId: string
- skillName: string
- confidence: number (0–1)

#### GET /api/matching/skill-gaps
- Purpose: Analyze freelancer’s skills and suggest improvements based on market demand.
- Authentication: JWT Bearer required.
- Response: SkillGapAnalysis object.
- Errors:
  - 401 Unauthorized (invalid or missing token)
  - 404 Not Found (freelancer profile not found)

SkillGapAnalysis schema:
- currentSkills: string[]
- recommendedSkills: string[]
- marketDemand: array of { skillName: string, demandLevel: "high" | "medium" | "low" }
- reasoning: string

### AI Model Inputs and Outputs

#### Skill Matching (Project Recommendations)
- Inputs:
  - freelancerSkills: array of SkillInfo (skillId, skillName, categoryId, yearsOfExperience)
  - projectRequirements: array of SkillInfo (skillId, skillName, categoryId, yearsOfExperience)
  - reputationScore: number (optional)
- Output:
  - matchScore: number (0–100)
  - matchedSkills: string[]
  - missingSkills: string[]
  - reasoning: string

Fallback behavior:
- If AI is unavailable or fails, the service uses keyword-based matching.

#### Skill Extraction (Text to Taxonomy)
- Inputs:
  - text: string
  - availableSkills: array of SkillInfo (from taxonomy)
- Output:
  - ExtractedSkill[] with confidence (0–1)

Fallback behavior:
- If AI is unavailable or fails, the service uses keyword-based extraction.

#### Skill Gap Analysis
- Inputs:
  - currentSkills: string[] (from freelancer profile)
- Output:
  - currentSkills: string[]
  - recommendedSkills: string[]
  - marketDemand: array of { skillName, demandLevel }
  - reasoning: string

Fallback behavior:
- If AI is unavailable, returns basic analysis with guidance.

### Data Sources Used for Skill Matching and Market Demand
- Active Skills Taxonomy:
  - Provided by the skill service/repository, filtered to is_active = true.
- Freelancer Profile:
  - Skills and experience from freelancer_profiles table (JSONB).
- Project Requirements:
  - required_skills from projects table (JSONB).
- Market Demand:
  - Derived from AI analysis when available; otherwise empty arrays.

### Client Implementation Examples
Below are conceptual examples of how to integrate AI recommendations into user interfaces. Replace placeholders with your actual API base URL and JWT token.

- Fetch Project Recommendations
  - Method: GET
  - URL: /api/matching/projects?limit=10
  - Headers: Authorization: Bearer <your_jwt>
  - Response: Array of ProjectRecommendation
  - UI Tip: Render cards with matchScore and reasoning; allow filtering by missingSkills.

- Fetch Freelancer Recommendations for a Project
  - Method: GET
  - URL: /api/matching/freelancers/{projectId}?limit=10
  - Headers: Authorization: Bearer <your_jwt>
  - Response: Array of FreelancerRecommendation
  - UI Tip: Sort by combinedScore; show reputationScore overlay.

- Extract Skills from Text
  - Method: POST
  - URL: /api/matching/extract-skills
  - Headers: Authorization: Bearer <your_jwt>, Content-Type: application/json
  - Body: { "text": "..." }
  - Response: Array of ExtractedSkill
  - UI Tip: Display confidence threshold; auto-suggest adding skills to profile.

- Analyze Skill Gaps
  - Method: GET
  - URL: /api/matching/skill-gaps
  - Headers: Authorization: Bearer <your_jwt>
  - Response: SkillGapAnalysis
  - UI Tip: Show recommendedSkills and marketDemand; link to learning resources.

[No sources needed since this section provides conceptual examples]

## Dependency Analysis

```mermaid
classDiagram
class Routes {
+GET /api/matching/projects
+GET /api/matching/freelancers/ : projectId
+POST /api/matching/extract-skills
+GET /api/matching/skill-gaps
}
class AuthMiddleware {
+authMiddleware()
}
class MatchingService {
+getProjectRecommendations()
+getFreelancerRecommendations()
+extractSkillsFromText()
+analyzeSkillGaps()
}
class AIService {
+analyzeSkillMatch()
+extractSkills()
+generateContent()
+keywordMatchSkills()
+keywordExtractSkills()
}
class SkillService {
+getActiveSkills()
}
class Repositories {
+projectRepository
+freelancerProfileRepository
}
Routes --> AuthMiddleware : "uses"
Routes --> MatchingService : "calls"
MatchingService --> AIService : "uses"
MatchingService --> SkillService : "uses"
MatchingService --> Repositories : "uses"
```

## Performance Considerations
- AI Call Limits:
  - The AI client enforces a request timeout and retry logic with exponential backoff for transient failures.
  - Configure LLM_API_KEY and LLM_API_URL to enable AI features.
- Keyword Fallback:
  - When AI is unavailable, keyword-based matching ensures minimal latency and avoids downtime.
- Recommendation Scope:
  - Project recommendations scan up to 100 open projects; adjust limit via query parameter.
- Rate Limiting:
  - Apply apiRateLimiter to protect the API and downstream LLM costs.

## Troubleshooting Guide
Common issues and resolutions:
- Unauthorized Access
  - Cause: Missing or invalid Authorization header.
  - Resolution: Ensure Bearer token is present and valid.
- Profile Not Found
  - Cause: Freelancer profile missing for user ID.
  - Resolution: Create a freelancer profile before requesting recommendations.
- AI Unavailable
  - Cause: LLM_API_KEY not configured.
  - Resolution: Set LLM_API_KEY and LLM_API_URL; verify network connectivity.
- AI Response Parsing Errors
  - Cause: Non-JSON or malformed AI response.
  - Resolution: Retry or fall back to keyword-based matching.
- Rate Limit Exceeded
  - Cause: Too many requests within the window.
  - Resolution: Respect Retry-After header and reduce request frequency.

## Conclusion
The AI Matching API provides robust, extensible endpoints for skill-based recommendations and analysis. It gracefully degrades to keyword-based matching when AI is unavailable, supports JWT authentication, and applies rate limiting to protect resources. Integrating these endpoints into client applications enables dynamic, data-driven matching experiences for freelancers and employers.

## Appendices

### Environment Variables
- LLM_API_KEY: LLM API key for AI features
- LLM_API_URL: LLM API base URL
- JWT_SECRET: Secret for JWT signing
- SUPABASE_URL, SUPABASE_ANON_KEY: Supabase connection credentials

### Example Request/Response Mapping
- Project Recommendations
  - Request: GET /api/matching/projects?limit=10
  - Response: Array of ProjectRecommendation
- Freelancer Recommendations
  - Request: GET /api/matching/freelancers/{projectId}?limit=10
  - Response: Array of FreelancerRecommendation
- Extract Skills
  - Request: POST /api/matching/extract-skills with { text }
  - Response: Array of ExtractedSkill
- Skill Gap Analysis
  - Request: GET /api/matching/skill-gaps
  - Response: SkillGapAnalysis

---

# Freelancer Recommendations API

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
This document describes the GET /api/matching/freelancers/{projectId} endpoint for retrieving AI-powered freelancer recommendations for a given project. It covers authentication, path and query parameters, response schema, AI matching logic, error handling, and client implementation guidance for integrating recommendations into a project management interface.

## Project Structure
The endpoint is implemented as part of the matching module:
- Route handler: GET /api/matching/freelancers/:projectId
- Service logic: getFreelancerRecommendations
- Data access: repositories for projects and freelancers
- AI integration: Gemini-based skill matching with fallbacks
- Validation: JWT auth middleware and UUID validation

```mermaid
graph TB
Client["Client"] --> Router["Route: GET /api/matching/freelancers/:projectId"]
Router --> AuthMW["Auth Middleware"]
Router --> UUIDMW["UUID Validation Middleware"]
Router --> Service["getFreelancerRecommendations"]
Service --> ProjRepo["ProjectRepository"]
Service --> FreelaRepo["FreelancerProfileRepository"]
Service --> AI["AI Client (LLM)"]
AI --> Service
ProjRepo --> Service
FreelaRepo --> Service
Service --> Router
Router --> Client
```

## Core Components
- Endpoint: GET /api/matching/freelancers/{projectId}
- Authentication: Bearer token required
- Path parameter: projectId (UUID)
- Query parameter: limit (integer, 1-50, default 10)
- Response: Array of FreelancerRecommendation objects
- AI matching: Skill match score plus reputation weighting
- Error responses: 400 (invalid UUID or limit), 401 (unauthorized), 404 (project not found)

## Architecture Overview
The endpoint follows a layered architecture:
- HTTP layer: Express route with middleware
- Service layer: Business logic for recommendation computation
- Data layer: Repositories for projects and freelancers
- AI layer: LLM integration with fallbacks

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler"
participant M1 as "Auth Middleware"
participant M2 as "UUID Validation"
participant S as "getFreelancerRecommendations"
participant PR as "ProjectRepository"
participant FR as "FreelancerProfileRepository"
participant AI as "AI Client"
C->>R : GET /api/matching/freelancers/{projectId}?limit=N
R->>M1 : Verify Bearer token
M1-->>R : OK or 401
R->>M2 : Validate projectId UUID
M2-->>R : OK or 400
R->>S : getFreelancerRecommendations(projectId, limit)
S->>PR : findProjectById(projectId)
PR-->>S : ProjectEntity or null
alt Project not found
S-->>R : Error(PROJECT_NOT_FOUND)
R-->>C : 404
else Project found
S->>FR : getAvailableProfiles()
FR-->>S : Profiles[]
loop For each freelancer
S->>AI : analyzeSkillMatch(freelancerSkills, projectRequirements, reputationScore)
AI-->>S : SkillMatchResult or AIError
alt AI error
S-->>S : Fallback to keywordMatchSkills
end
S-->>S : Compute combinedScore
end
S-->>R : Top-N recommendations
R-->>C : 200 [FreelancerRecommendation[]]
end
```

## Detailed Component Analysis

### Endpoint Definition
- Method: GET
- Path: /api/matching/freelancers/{projectId}
- Authentication: Required (Bearer token)
- Path parameters:
  - projectId: string, UUID format
- Query parameters:
  - limit: integer, default 10, min 1, max 50
- Response: 200 OK with array of FreelancerRecommendation objects
- Error responses:
  - 400: Invalid UUID format or invalid limit
  - 401: Unauthorized
  - 404: Project not found

### Response Schema: FreelancerRecommendation
Each recommendation object includes:
- freelancerId: string (UUID)
- matchScore: number (0-100)
- reputationScore: number (0-100)
- combinedScore: number (weighted average)
- matchedSkills: string[]
- reasoning: string

These fields are produced by the service and returned as-is to clients.

### AI Matching Logic and Weighting
The service computes a combined score by combining:
- Skill match score (0-100)
- Blockchain-verified reputation score (0-100)
Weighting constants:
- SKILL_MATCH_WEIGHT: 0.7
- REPUTATION_WEIGHT: 0.3
combinedScore = floor(matchScore × 0.7 + reputationScore × 0.3)

Fallback behavior:
- If AI is available, use analyzeSkillMatch; on AI error, fall back to keywordMatchSkills
- If AI is unavailable, use keywordMatchSkills

```mermaid
flowchart TD
Start(["Start"]) --> LoadProj["Load project by projectId"]
LoadProj --> ProjFound{"Project exists?"}
ProjFound --> |No| Err404["Return 404"]
ProjFound --> |Yes| LoadFrela["Load available freelancers"]
LoadFrela --> Loop["For each freelancer"]
Loop --> FetchSkills["Convert freelancer skills to SkillInfo"]
FetchSkills --> CallAI["Call analyzeSkillMatch or keywordMatchSkills"]
CallAI --> Score["Get matchScore and reasoning"]
Score --> RepScore["Set reputationScore (default 50)"]
RepScore --> Combine["Compute combinedScore = floor(matchScore*0.7 + repScore*0.3)"]
Combine --> Push["Push recommendation"]
Push --> Next{"More freelancers?"}
Next --> |Yes| Loop
Next --> |No| Sort["Sort by combinedScore desc"]
Sort --> Limit["Limit to N (min(50, limit))"]
Limit --> Done(["Return recommendations"])
```

### Validation and Error Handling
- Path parameter validation:
  - projectId must be a valid UUID; otherwise 400
- Query parameter validation:
  - limit must be a positive integer; otherwise 400
  - limit is capped at 50
- Project existence:
  - If project not found, return 404
- Authentication:
  - Missing or invalid token returns 401

### Example Request and Response

- Example request:
  - GET /api/matching/freelancers/{projectId}?limit=20
  - Headers: Authorization: Bearer <JWT>
  - Path parameter: projectId = a valid UUID
  - Query parameter: limit = 20

- Example response (array of recommendations):
  - [
      {
        "freelancerId": "f1c2d3e4-a5b6-c7d8-e9f0-a1b2c3d4e5f6",
        "matchScore": 87,
        "reputationScore": 65,
        "combinedScore": 76,
        "matchedSkills": ["React", "Node.js"],
        "reasoning": "Strong alignment on frontend/backend stack and sufficient experience."
      },
      {
        "freelancerId": "a2b3c4d5-b6c7-d8e9-f0a1-b2c3d4e5f6a7",
        "matchScore": 82,
        "reputationScore": 72,
        "combinedScore": 78,
        "matchedSkills": ["PostgreSQL", "GraphQL"],
        "reasoning": "High skill match on database and API technologies."
      }
    ]

Notes:
- The endpoint returns up to limit recommendations (default 10, max 50).
- The combinedScore reflects the weighted combination of skill match and reputation.

### Client Implementation Guidance
Recommended UI features for a project management interface:
- Display recommendations in a sortable table with columns:
  - Freelancer name/avatar (from user profile)
  - combinedScore (primary sort)
  - matchScore
  - reputationScore
  - matchedSkills (comma-separated)
  - reasoning (tooltip or expandable)
- Filtering options:
  - Filter by minimum combinedScore or matchScore thresholds
  - Filter by specific matchedSkills
- Actions:
  - View profile details
  - Contact freelancer (via messaging or proposal submission)
  - Submit a proposal to shortlisted freelancers
- UX tips:
  - Highlight top recommendations visually
  - Show “reasoning” as a tooltip to explain scoring
  - Allow bulk selection for mass outreach

[No sources needed since this section provides general guidance]

## Dependency Analysis
The endpoint depends on:
- Route handler for routing and middleware
- Service layer for recommendation computation
- Repositories for data access
- AI client for skill matching
- Validation middleware for UUID checks

```mermaid
graph LR
Routes["matching-routes.ts"] --> Service["matching-service.ts"]
Service --> ProjRepo["project-repository.ts"]
Service --> FreelaRepo["freelancer-profile-repository.ts"]
Service --> AI["ai-client.ts"]
Routes --> Val["validation-middleware.ts"]
```

## Performance Considerations
- Recommendation computation loops over available freelancers; consider pagination or caching for large datasets.
- AI calls are asynchronous with retries and timeouts; ensure client-side retry/backoff policies.
- Sorting and slicing occur server-side; keep limit reasonable (≤50) to avoid heavy computations.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 400 Bad Request:
  - Invalid UUID for projectId
  - Invalid limit (non-positive or out of range)
- 401 Unauthorized:
  - Missing or invalid Bearer token
- 404 Not Found:
  - Project does not exist
- AI-related issues:
  - If AI is unavailable or returns errors, the service falls back to keyword-based matching

## Conclusion
The GET /api/matching/freelancers/{projectId} endpoint provides employer-facing recommendations by combining AI-driven skill matching with a reputation weighting. It enforces JWT authentication, validates UUIDs and limits, and returns a ranked list of freelancers suitable for the specified project. Clients should display recommendations with filtering and contact actions to streamline hiring decisions.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Definition Summary
- Method: GET
- Path: /api/matching/freelancers/{projectId}
- Auth: Bearer token
- Path params:
  - projectId: UUID
- Query params:
  - limit: integer, default 10, min 1, max 50
- Response: 200 OK with array of FreelancerRecommendation
- Errors: 400 (invalid UUID or limit), 401 (unauthorized), 404 (project not found)

---

# Project Recommendations API

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
This document provides comprehensive API documentation for the GET /api/matching/projects endpoint in the FreelanceXchain system. It covers authentication requirements, query parameter validation, response schema, AI matching logic, error handling, and client integration guidance for building a dashboard UI that displays project recommendations.

## Project Structure
The recommendations endpoint is implemented as part of the matching module:
- Route handler: GET /api/matching/projects
- Middleware: JWT authentication
- Service: AI-powered skill matching between freelancer and open projects
- AI client: LLM integration with fallback logic
- Repositories: Access to project and freelancer profile data

```mermaid
graph TB
Client["Client App"] --> Auth["Auth Middleware<br/>JWT Validation"]
Auth --> Route["Route Handler<br/>GET /api/matching/projects"]
Route --> Service["Matching Service<br/>getProjectRecommendations()"]
Service --> RepoProj["Project Repository<br/>getAllOpenProjects()"]
Service --> RepoProf["Freelancer Profile Repository"]
Service --> AI["AI Client<br/>analyzeSkillMatch()"]
AI --> LLM["LLM API"]
Service --> Route
Route --> Client
```

## Core Components
- Endpoint: GET /api/matching/projects
- Authentication: Bearer JWT token required
- Query parameter:
  - limit: integer, default 10, minimum 1, maximum 50
- Response: Array of ProjectRecommendation objects
- Error responses:
  - 401 Unauthorized (invalid or missing token)
  - 404 Not Found (freelancer profile not found)

## Architecture Overview
The endpoint follows a layered architecture:
- Route layer validates JWT and parses query parameters
- Service layer orchestrates data fetching and AI matching
- Repository layer retrieves open projects and freelancer profile
- AI client layer interacts with LLM API and provides fallbacks

```mermaid
sequenceDiagram
participant C as "Client"
participant M as "Auth Middleware"
participant R as "Route Handler"
participant S as "Matching Service"
participant P as "Project Repository"
participant F as "Freelancer Profile Repository"
participant A as "AI Client"
participant L as "LLM API"
C->>M : "GET /api/matching/projects<br/>Authorization : Bearer <token>"
M-->>C : "401 if missing/invalid"
M->>R : "Authenticated request"
R->>R : "Parse limit (1-50)"
R->>S : "getProjectRecommendations(userId, limit)"
S->>F : "getProfileByUserId(userId)"
alt "Profile not found"
F-->>S : "null"
S-->>R : "{ error : PROFILE_NOT_FOUND }"
R-->>C : "404 Not Found"
else "Profile found"
S->>P : "getAllOpenProjects(limit=100)"
P-->>S : "Project entities"
loop "For each project"
S->>A : "analyzeSkillMatch(freelancerSkills, projectRequirements)"
alt "AI available and successful"
A->>L : "Generate content"
L-->>A : "JSON result"
A-->>S : "SkillMatchResult"
else "AI unavailable or error"
A-->>S : "keywordMatchSkills fallback"
end
S-->>S : "Build ProjectRecommendation"
end
S-->>R : "Top-N recommendations"
R-->>C : "200 OK with recommendations"
end
```

## Detailed Component Analysis

### Endpoint Definition
- Method: GET
- Path: /api/matching/projects
- Authentication: Required (Bearer JWT)
- Query parameters:
  - limit: integer, default 10, minimum 1, maximum 50
- Response: Array of ProjectRecommendation objects

### Request Flow and Validation
- JWT validation performed by auth middleware
- limit parameter parsing and validation:
  - If provided, must be a positive integer
  - Clamped to maximum 50
  - Default 10 if omitted

```mermaid
flowchart TD
Start(["Request Received"]) --> CheckAuth["Validate Authorization Header"]
CheckAuth --> AuthOK{"Valid JWT?"}
AuthOK --> |No| Err401["Return 401 Unauthorized"]
AuthOK --> |Yes| ParseLimit["Parse limit query param"]
ParseLimit --> LimitValid{"limit >= 1?"}
LimitValid --> |No| Err400["Return 400 VALIDATION_ERROR"]
LimitValid --> |Yes| Clamp["Clamp to <= 50"]
Clamp --> CallSvc["Call getProjectRecommendations(userId, limit)"]
CallSvc --> End(["Response Sent"])
```

### Response Schema: ProjectRecommendation
Each recommendation object includes:
- projectId: string
- matchScore: number (0-100)
- matchedSkills: string[]
- missingSkills: string[]
- reasoning: string

These fields are populated by the AI matching result and returned directly to clients.

### AI Matching Logic
The system computes match scores using either:
- LLM-powered analysis when API key is configured
- Keyword-based matching as fallback

Key steps:
- Retrieve freelancer profile and convert skills to SkillInfo
- Fetch up to 100 open projects
- For each project, convert required skills to SkillInfo
- Compute match score:
  - If AI available: analyzeSkillMatch
  - Else: keywordMatchSkills
- Sort recommendations by matchScore descending
- Return top N (limit)

```mermaid
flowchart TD
A["Get freelancer profile"] --> B["Convert skills to SkillInfo"]
B --> C["Fetch open projects (limit 100)"]
C --> D{"For each project"}
D --> E["Convert required skills to SkillInfo"]
E --> F{"AI available?"}
F --> |Yes| G["analyzeSkillMatch()"]
F --> |No| H["keywordMatchSkills()"]
G --> I["SkillMatchResult"]
H --> I
I --> J["Build ProjectRecommendation"]
D --> K{"More projects?"}
K --> |Yes| D
K --> |No| L["Sort by matchScore desc"]
L --> M["Slice to top N (limit)"]
M --> N["Return recommendations"]
```

### Error Handling
- 401 Unauthorized:
  - Missing Authorization header
  - Invalid Bearer format
  - Invalid/expired token
- 404 Not Found:
  - Freelancer profile not found when computing recommendations
- Validation errors:
  - limit must be a positive integer

### Example Request and Response

- Example request:
  - GET /api/matching/projects?limit=15
  - Authorization: Bearer <your_jwt_token>

- Example response (sample):
  - 200 OK
  - Body: Array of ProjectRecommendation objects

Note: The repository’s API documentation shows a different response shape with a recommendations array and nested project object. However, the route handler and service return the ProjectRecommendation objects directly as an array. The example below reflects the actual implementation.

```json
[
  {
    "projectId": "project-uuid-1",
    "matchScore": 92,
    "matchedSkills": ["React", "Node.js"],
    "missingSkills": ["GraphQL"],
    "reasoning": "High match on frontend/backend stack; missing specialized GraphQL skill."
  },
  {
    "projectId": "project-uuid-2",
    "matchScore": 78,
    "matchedSkills": ["TypeScript", "PostgreSQL"],
    "missingSkills": ["AWS", "Docker"],
    "reasoning": "Strong technical alignment; suggests cloud/container skills for scalability."
  }
]
```

## Dependency Analysis
The endpoint depends on:
- Route handler for JWT validation and parameter parsing
- Matching service for orchestration and scoring
- AI client for LLM integration and fallbacks
- Repositories for data access

```mermaid
graph LR
Routes["matching-routes.ts"] --> Service["matching-service.ts"]
Service --> RepoProj["project-repository.ts"]
Service --> RepoProf["freelancer-profile-repository"]
Service --> AI["ai-client.ts"]
AI --> Types["ai-types.ts"]
Routes --> Auth["auth-middleware.ts"]
Routes --> Swagger["swagger.ts"]
```

## Performance Considerations
- The service fetches up to 100 open projects and computes match scores for each, then sorts and slices to top N. This is efficient for typical workloads but consider:
  - Limiting limit to reasonable values (already enforced at 50)
  - Ensuring AI API key is configured to leverage LLM scoring
  - Caching frequently accessed freelancer profiles and project lists at higher layers if needed
- Network latency to LLM API impacts response time; implement retries and timeouts as configured

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized:
  - Verify Authorization header format: Bearer <token>
  - Ensure token is not expired
  - Confirm user role allows access
- 400 Bad Request (limit validation):
  - Ensure limit is a positive integer and ≤ 50
- 404 Not Found:
  - Ensure freelancer profile exists for the user
- 5xx errors:
  - LLM API unconfigured or unreachable
  - Retry after network stabilization

## Conclusion
The GET /api/matching/projects endpoint provides AI-driven project recommendations for freelancers. It enforces JWT authentication, validates the limit parameter, and returns a ranked list of recommendations with match scores, matched skills, missing skills, and reasoning. The system gracefully falls back to keyword-based matching when AI is unavailable and maintains clear error responses for common failure modes.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Client Implementation Guidance
- Authentication:
  - Store JWT securely (e.g., HttpOnly cookies or secure storage)
  - Attach Authorization header with each request
- Request:
  - Use GET /api/matching/projects?limit=N
  - Respect limit bounds (1-50)
- UI Integration:
  - Loading state: Show skeleton cards while fetching
  - Pagination: Use limit and server-side sorting by matchScore
  - Error handling: Display user-friendly messages for 401/404/400
  - Recommendations display: Show matchScore, matchedSkills, missingSkills, and reasoning
- Best practices:
  - Debounce repeated requests
  - Cache recent results for the same user
  - Provide “Try again” action for transient AI errors

[No sources needed since this section provides general guidance]

---

# Skill Extraction API

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
This document provides comprehensive API documentation for the skill extraction endpoint in the FreelanceXchain system. It covers the POST /api/matching/extract-skills endpoint, including authentication requirements, request/response schemas, the AI processing pipeline powered by Google Gemini, error handling, and practical client integration guidance for profile creation and project posting workflows.

## Project Structure
The skill extraction feature spans routing, service logic, AI client integration, and configuration. The endpoint is defined under the matching routes module and delegates to the matching service, which orchestrates AI extraction and keyword fallback logic. Environment variables configure the LLM API integration.

```mermaid
graph TB
Client["Client Application"] --> Routes["Express Route<br/>POST /api/matching/extract-skills"]
Routes --> Middleware["Auth Middleware"]
Middleware --> Service["Matching Service<br/>extractSkillsFromText()"]
Service --> AI["AI Client<br/>extractSkills()/generateContent()"]
AI --> LLM["Google Gemini API"]
Service --> DB["Skill Taxonomy<br/>Supabase skills table"]
Service --> Routes
Routes --> Client
```

## Core Components
- Endpoint: POST /api/matching/extract-skills
- Authentication: Bearer JWT token required
- Request body: JSON object with a required string field text
- Response: Array of ExtractedSkill objects with skillId, skillName, and confidence fields
- AI Pipeline: Uses Google Gemini via the AI client; falls back to keyword extraction if AI is unavailable

## Architecture Overview
The skill extraction pipeline integrates the Express route, authentication middleware, matching service, AI client, and the Supabase skill taxonomy. The service retrieves active skills from the taxonomy, attempts AI extraction, and falls back to keyword-based extraction when AI is unavailable.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler"
participant M as "Auth Middleware"
participant S as "Matching Service"
participant A as "AI Client"
participant G as "Gemini API"
participant D as "Supabase Skills"
C->>R : POST /api/matching/extract-skills {text}
R->>M : Verify JWT
M-->>R : Authorized user
R->>S : extractSkillsFromText(text)
S->>D : getActiveSkills()
D-->>S : Active skills (SkillInfo[])
alt AI Available
S->>A : extractSkills({text, availableSkills})
A->>G : generateContent(prompt)
G-->>A : JSON array ExtractedSkill[]
A-->>S : ExtractedSkill[]
else AI Unavailable
S->>S : keywordExtractSkills(text, availableSkills)
S-->>S : ExtractedSkill[]
end
S-->>R : ExtractedSkill[]
R-->>C : 200 OK [ExtractedSkill[]]
```

## Detailed Component Analysis

### Endpoint Definition and Authentication
- Method: POST
- Path: /api/matching/extract-skills
- Authentication: Requires a Bearer token in the Authorization header
- Request body:
  - text: string (required)
- Response:
  - Array of ExtractedSkill objects:
    - skillId: string
    - skillName: string
    - confidence: number (0–1)

Error responses:
- 400 Bad Request: Missing or invalid text input
- 401 Unauthorized: Missing or invalid JWT token

### AI Processing Pipeline
The pipeline uses Google Gemini to extract skills from unstructured text and map them to the platform’s standardized skill taxonomy. It follows a two-stage approach:
1. AI Extraction: Sends a structured prompt to Gemini with the input text and the active skill taxonomy. Gemini responds with a JSON array of ExtractedSkill objects.
2. Fallback: If AI is unavailable or fails, the service performs keyword-based extraction against the active skills.

```mermaid
flowchart TD
Start(["Function Entry"]) --> Validate["Validate text input"]
Validate --> TextValid{"text provided and non-empty?"}
TextValid --> |No| Return400["Return 400 VALIDATION_ERROR"]
TextValid --> |Yes| LoadTaxonomy["Load active skills from taxonomy"]
LoadTaxonomy --> AIEnabled{"AI available?"}
AIEnabled --> |Yes| CallAI["Call extractSkills(text, availableSkills)"]
CallAI --> AIResult{"AI success?"}
AIResult --> |Yes| NormalizeAI["Normalize ExtractedSkill[]"]
AIResult --> |No| KeywordFallback["keywordExtractSkills(text, availableSkills)"]
AIEnabled --> |No| KeywordFallback
KeywordFallback --> NormalizeKeywords["Normalize ExtractedSkill[]"]
NormalizeAI --> Filter["Filter by valid skill IDs"]
NormalizeKeywords --> Filter
Filter --> Return200["Return ExtractedSkill[]"]
```

### Data Models and Schemas
- ExtractedSkill: skillId, skillName, confidence
- SkillExtractionRequest: text, availableSkills (SkillInfo[])
- SkillInfo: skillId, skillName, categoryId?, yearsOfExperience?

These types define the shape of requests and responses exchanged between the route, service, and AI client.

### Skill Taxonomy and Validation
The service loads active skills from the Supabase skills table to form the taxonomy used for mapping. The service filters extracted skills to ensure their IDs correspond to active skills in the taxonomy.

```mermaid
erDiagram
SKILL_CATEGORIES ||--o{ SKILLS : "has"
SKILL_CATEGORIES {
uuid id PK
string name
boolean is_active
}
SKILLS {
uuid id PK
uuid category_id FK
string name
boolean is_active
}
```

### Example Request and Response
- Example request body:
  - text: "Looking for a developer with React, Node.js, and PostgreSQL experience"
- Example response (sample):
  - [
      { "skillId": "<uuid>", "skillName": "React", "confidence": 0.92 },
      { "skillId": "<uuid>", "skillName": "Node.js", "confidence": 0.88 },
      { "skillId": "<uuid>", "skillName": "PostgreSQL", "confidence": 0.85 }
    ]

Notes:
- The actual skillId values are UUIDs from the Supabase skills table.
- Confidence values are normalized to 0–1.

### Error Handling
- 400 Bad Request:
  - Missing or invalid text input
  - AI extraction failure (when AI is enabled)
- 401 Unauthorized:
  - Missing or invalid JWT token

The route validates the presence and type of text and forwards service errors to the client with appropriate status codes.

## Dependency Analysis
The skill extraction endpoint depends on:
- Express route handler for authentication and request validation
- Matching service for orchestration and fallback logic
- AI client for Gemini integration and response parsing
- Supabase skills table for the taxonomy

```mermaid
graph LR
Routes["matching-routes.ts"] --> Service["matching-service.ts"]
Service --> AI["ai-client.ts"]
Service --> DB["schema.sql (skills)"]
Routes --> Env["env.ts (LLM config)"]
```

## Performance Considerations
- AI latency: Gemini requests are subject to network latency and rate limits. The AI client implements retry logic and timeouts.
- Keyword fallback: When AI is unavailable, keyword extraction is efficient but less precise than AI.
- Tokenization: The service normalizes confidence values and filters invalid skill IDs to reduce downstream processing overhead.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Missing or invalid JWT token:
  - Ensure Authorization: Bearer <token> is included in the request header.
- Missing or empty text:
  - Provide a non-empty string for the text field.
- AI API misconfiguration:
  - Verify LLM_API_KEY and LLM_API_URL environment variables are set.
- AI failures:
  - The service automatically falls back to keyword extraction. If both fail, the service returns an empty array or a validation error.

## Conclusion
The POST /api/matching/extract-skills endpoint provides a robust mechanism to identify and map skills from unstructured text using Google Gemini, with a reliable keyword-based fallback. It enforces JWT authentication, validates inputs, and returns a standardized ExtractedSkill array suitable for enriching profiles and project requirements.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Client Implementation Guidance
- Real-time suggestions during profile creation:
  - As users type in a resume or portfolio, trigger skill extraction with short text fragments to prepopulate skill fields.
  - Merge AI-extracted skills with manual selections and allow users to adjust confidence thresholds.
- Manual review options:
  - Present extracted skills with confidence scores and allow users to accept, reject, or edit entries.
- Project posting workflows:
  - After drafting a job description, call the endpoint to extract required skills and auto-fill the project’s required skills list.
  - Combine AI suggestions with keyword extraction to improve recall for niche technologies.

[No sources needed since this section provides general guidance]

---

# Skill Gap Analysis API

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
This document provides comprehensive API documentation for the skill gap analysis endpoint in the FreelanceXchain system. It covers the GET /api/matching/skill-gaps endpoint, including authentication requirements, request and response schemas, error handling, and practical guidance for client-side implementation in a career development dashboard.

## Project Structure
The skill gap analysis endpoint is implemented as part of the matching module. The route handler delegates to a service that orchestrates AI analysis and repository access to produce a structured SkillGapAnalysis response.

```mermaid
graph TB
Client["Client Application"] --> Route["Route: GET /api/matching/skill-gaps"]
Route --> Auth["Auth Middleware"]
Route --> Service["Matching Service: analyzeSkillGaps()"]
Service --> Repo["Freelancer Profile Repository"]
Service --> AI["AI Client: generateContent()"]
AI --> LLM["LLM Provider"]
Service --> Route
Route --> Client
```

## Core Components
- Endpoint: GET /api/matching/skill-gaps
- Authentication: JWT via Bearer token
- No query parameters
- Response: SkillGapAnalysis object with currentSkills, recommendedSkills, marketDemand, and reasoning

Key implementation references:
- Route definition and Swagger schema: [matching-routes.ts](file://src/routes/matching-routes.ts#L327-L369)
- Service logic and AI integration: [matching-service.ts](file://src/services/matching-service.ts#L271-L353)
- AI prompt and response handling: [ai-client.ts](file://src/services/ai-client.ts#L58-L73), [ai-client.ts](file://src/services/ai-client.ts#L222-L247)
- Data model types: [ai-types.ts](file://src/services/ai-types.ts#L90-L100)
- Repository access: [freelancer-profile-repository.ts](file://src/repositories/freelancer-profile-repository.ts#L29-L31)
- Authentication middleware: [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L25-L70)

## Architecture Overview
The endpoint follows a layered architecture:
- HTTP Layer: Express route with auth middleware
- Service Layer: Business logic for skill gap analysis
- Data Access Layer: Repository for freelancer profile
- AI Layer: LLM integration for analysis

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler"
participant M as "Auth Middleware"
participant S as "Matching Service"
participant P as "Freelancer Profile Repo"
participant A as "AI Client"
participant L as "LLM Provider"
C->>R : "GET /api/matching/skill-gaps"
R->>M : "Validate JWT"
M-->>R : "User payload attached"
R->>S : "analyzeSkillGaps(userId)"
S->>P : "getProfileByUserId(userId)"
P-->>S : "Profile entity"
alt "AI available"
S->>A : "generateContent(SKILL_GAP_PROMPT)"
A->>L : "POST : generateContent"
L-->>A : "JSON text"
A-->>S : "Parsed JSON"
else "AI unavailable"
S-->>R : "Basic analysis (no recommendations)"
end
S-->>R : "SkillGapAnalysis"
R-->>C : "200 OK + JSON"
```

## Detailed Component Analysis

### Endpoint Definition
- Method: GET
- Path: /api/matching/skill-gaps
- Authentication: Required (Bearer JWT)
- Query Parameters: None
- Response: SkillGapAnalysis object

Swagger schema and route:

### Authentication Flow
- Validates Authorization header format and token signature
- Attaches user payload (userId, email, role) to request for downstream use

References:

### Service Logic and AI Integration
- Retrieves freelancer profile by userId
- Builds currentSkills from profile
- If AI is available, generates content using SKILL_GAP_PROMPT
- Parses and validates JSON response
- Returns SkillGapAnalysis with currentSkills, recommendedSkills, marketDemand, and reasoning
- On AI unavailability or errors, returns basic analysis with guidance

References:

```mermaid
flowchart TD
Start(["analyzeSkillGaps(userId)"]) --> LoadProfile["Load freelancer profile"]
LoadProfile --> HasProfile{"Profile found?"}
HasProfile --> |No| ReturnNotFound["Return PROFILE_NOT_FOUND error"]
HasProfile --> |Yes| BuildCS["Build currentSkills from profile"]
BuildCS --> AIEnabled{"AI enabled?"}
AIEnabled --> |No| BasicAnalysis["Return basic analysis<br/>recommendedSkills=[], marketDemand=[]"]
AIEnabled --> |Yes| CallLLM["generateContent(SKILL_GAP_PROMPT)"]
CallLLM --> ParseResp{"Parse JSON?"}
ParseResp --> |Success| Normalize["Normalize fields"]
ParseResp --> |Failure| Fallback["Return fallback analysis"]
Normalize --> Done(["Return SkillGapAnalysis"])
Fallback --> Done
BasicAnalysis --> Done
ReturnNotFound --> End(["Exit"])
Done --> End
```

### Data Model: SkillGapAnalysis
- currentSkills: string[]
- recommendedSkills: string[]
- marketDemand: Array with skillName and demandLevel (high | medium | low)
- reasoning: string

References:

### Repository Access
- getProfileByUserId(userId) returns the freelancer’s profile entity
- Used to extract currentSkills for analysis

References:

### AI Prompt and Response Handling
- SKILL_GAP_PROMPT defines the instruction for the LLM
- generateContent sends the prompt and returns either a string or an AIError
- Response parsing handles markdown code blocks and JSON validation

References:

### Example Request
- Method: GET
- Path: /api/matching/skill-gaps
- Headers:
  - Authorization: Bearer <your_jwt_token>
- Query Parameters: None
- Body: Not applicable

References:

### Example Response
Sample JSON structure:
{
  "currentSkills": ["React", "TypeScript", "Node.js"],
  "recommendedSkills": ["GraphQL", "Docker", "AWS"],
  "marketDemand": [
    { "skillName": "GraphQL", "demandLevel": "high" },
    { "skillName": "Docker", "demandLevel": "medium" },
    { "skillName": "AWS", "demandLevel": "high" }
  ],
  "reasoning": "Based on current skills and market trends, consider upskilling in GraphQL and AWS to increase project match potential."
}

References:

### Error Handling
- 401 Unauthorized: Missing or invalid Authorization header; invalid or expired token
- 404 Not Found: Profile not found for the authenticated user

References:

### Client Implementation Guidance
Recommended UI/UX patterns for a career development dashboard:
- Display currentSkills as a tag list with proficiency indicators
- Show recommendedSkills grouped by demandLevel (high/medium/low) with icons
- Render reasoning as a contextual explanation card
- Provide quick actions:
  - Link to learning resources (external URLs or internal course catalog)
  - Track progress per recommended skill
  - Suggest milestones to achieve proficiency
- Refresh button to re-run analysis when skills change
- Graceful degradation when AI is unavailable (show guidance message and basic fields)

[No sources needed since this section provides general guidance]

## Dependency Analysis
The endpoint depends on:
- Route handler for routing and Swagger documentation
- Auth middleware for JWT validation
- Matching service for orchestration and AI integration
- Repository for data access
- AI client for LLM communication

```mermaid
graph LR
Routes["matching-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Service["matching-service.ts"]
Service --> Repo["freelancer-profile-repository.ts"]
Service --> AI["ai-client.ts"]
AI --> Env["env.ts (LLM config)"]
Routes --> Swagger["swagger.ts"]
App["app.ts"] --> Routes
```

## Performance Considerations
- AI calls are asynchronous and include retry logic; network timeouts are handled
- The endpoint performs a single repository read for the profile
- Recommendations are generated once per request; caching strategies can be considered at the client level
- Ensure LLM API keys are configured to avoid fallback behavior

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized
  - Verify Authorization header format: Bearer <token>
  - Confirm token validity and expiration
  - References: [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L25-L70)
- 404 Not Found
  - Ensure the authenticated user has a freelancer profile
  - References: [matching-service.ts](file://src/services/matching-service.ts#L271-L284)
- AI Unavailable or Fallback
  - Configure LLM_API_KEY and LLM_API_URL
  - References: [env.ts](file://src/config/env.ts#L59-L62), [ai-client.ts](file://src/services/ai-client.ts#L76-L81)
- AI Response Parsing Failures
  - LLM may return unexpected format; endpoint falls back gracefully
  - References: [matching-service.ts](file://src/services/matching-service.ts#L301-L353)

## Conclusion
The GET /api/matching/skill-gaps endpoint provides a robust, AI-enhanced skill gap analysis for freelancers. It requires JWT authentication, returns a structured SkillGapAnalysis object, and gracefully degrades when AI is unavailable. Clients can integrate this endpoint into a career development dashboard to display actionable insights and learning recommendations.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Definition Summary
- Method: GET
- Path: /api/matching/skill-gaps
- Authentication: Bearer JWT
- Query Parameters: None
- Response Schema: SkillGapAnalysis
  - currentSkills: string[]
  - recommendedSkills: string[]
  - marketDemand: Array of { skillName: string, demandLevel: "high" | "medium" | "low" }
  - reasoning: string

References:

---

# Authentication API

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
This document provides comprehensive API documentation for the authentication module of the FreelanceXchain system. It covers all authentication endpoints, including user registration, login, token refresh, OAuth integration, and password recovery. It also documents request/response schemas, JWT-based authentication requirements, rate limiting policies, and client implementation guidance for JavaScript/TypeScript.

The authentication endpoints are implemented under the base path /api/auth and integrate with Supabase Auth for secure user management, email verification, and OAuth providers.

## Project Structure
The authentication module is organized into routes, services, middleware, and shared types. The OpenAPI/Swagger specification is configured to document the authentication endpoints.

```mermaid
graph TB
subgraph "Routes"
RAuth["src/routes/auth-routes.ts"]
end
subgraph "Services"
SAuth["src/services/auth-service.ts"]
STypes["src/services/auth-types.ts"]
end
subgraph "Middleware"
MRate["src/middleware/rate-limiter.ts"]
MAuth["src/middleware/auth-middleware.ts"]
end
subgraph "Models"
MUser["src/models/user.ts"]
end
subgraph "Config"
CEnv["src/config/env.ts"]
CSwag["src/config/swagger.ts"]
end
RAuth --> SAuth
RAuth --> MRate
MAuth --> SAuth
SAuth --> STypes
SAuth --> MUser
SAuth --> CEnv
CSwag --> RAuth
```

## Core Components
- Authentication routes: Define endpoints for registration, login, token refresh, OAuth, and password recovery.
- Authentication service: Implements business logic for Supabase Auth integration, token validation, and user synchronization.
- Rate limiter middleware: Applies rate limits to authentication endpoints.
- Auth middleware: Validates JWT Bearer tokens and enforces role-based access control.
- Shared types: Define request/response schemas and error codes.

## Architecture Overview
The authentication flow integrates with Supabase Auth for secure user management. The routes validate inputs, apply rate limiting, and delegate to the service layer. The service layer interacts with Supabase Auth and the database to manage users and tokens. The auth middleware validates JWT Bearer tokens for protected routes.

```mermaid
sequenceDiagram
participant Client as "Client"
participant Routes as "auth-routes.ts"
participant Service as "auth-service.ts"
participant Supabase as "Supabase Auth"
participant DB as "User Repository"
Client->>Routes : POST /api/auth/register
Routes->>Routes : Validate input
Routes->>Service : register(RegisterInput)
Service->>Supabase : signUp(email, password, role, metadata)
Supabase-->>Service : { user, session }
Service->>DB : getUserById(userId) or createUser(...)
DB-->>Service : UserEntity
Service-->>Routes : AuthResult
Routes-->>Client : 201 AuthResult
Client->>Routes : POST /api/auth/login
Routes->>Service : login(LoginInput)
Service->>Supabase : signInWithPassword(email, password)
Supabase-->>Service : { user, session }
Service->>DB : getUserById(userId)
DB-->>Service : UserEntity
Service-->>Routes : AuthResult
Routes-->>Client : 200 AuthResult
```

## Detailed Component Analysis

### Authentication Endpoints

#### POST /api/auth/register
- Purpose: Register a new user with email/password.
- Request body schema: RegisterInput
  - email: string, required
  - password: string, required, minimum length 8, must include uppercase, lowercase, digit, and special character
  - role: string, enum [freelancer, employer], required
  - name: string, optional, minimum length 2 if provided
  - walletAddress: string, optional, Ethereum address format 0x followed by 40 hex digits
- Responses:
  - 201: AuthResult with user, accessToken, refreshToken
  - 400: AuthError with VALIDATION_ERROR
  - 409: AuthError with DUPLICATE_EMAIL

Rate limiting: Yes (authRateLimiter)

Security considerations:
- Password strength enforced by service-level validation.
- Duplicate email detection via Supabase Auth and database checks.

#### POST /api/auth/login
- Purpose: Authenticate a user with email/password.
- Request body schema: LoginInput
  - email: string, required
  - password: string, required
- Responses:
  - 200: AuthResult with user, accessToken, refreshToken
  - 400: AuthError with VALIDATION_ERROR
  - 401: AuthError with AUTH_INVALID_CREDENTIALS

Notes:
- Requires email verification; unverified emails will fail login.

#### POST /api/auth/refresh
- Purpose: Refresh access and refresh tokens using a refresh token.
- Request body schema: RefreshInput
  - refreshToken: string, required
- Responses:
  - 200: AuthResult with user, accessToken, refreshToken
  - 400: AuthError with VALIDATION_ERROR
  - 401: AuthError with AUTH_TOKEN_EXPIRED or AUTH_INVALID_TOKEN

#### GET /api/auth/oauth/:provider
- Purpose: Initiate OAuth login with a provider (google, github, azure, linkedin).
- Responses:
  - 302: Redirect to provider authorization URL
  - 400: AuthError with VALIDATION_ERROR

#### GET /api/auth/callback
- Purpose: Handle OAuth callback. Supports PKCE flow (code in query) and implicit flow (tokens in URL fragment).
- Responses:
  - 200: AuthResult with tokens and user
  - 202: Registration required (user exists in Supabase but not in local users)
  - 400: AuthError with OAUTH_ERROR

#### POST /api/auth/oauth/callback
- Purpose: Receive access_token from frontend after OAuth redirect (implicit flow).
- Request body:
  - access_token: string, required
- Responses:
  - 200: Status success
  - 202: Registration required
  - 401: AuthError with AUTH_INVALID_TOKEN

#### POST /api/auth/oauth/register
- Purpose: Complete OAuth registration by selecting role and optionally providing name and walletAddress.
- Request body:
  - accessToken: string, required
  - role: string, enum [freelancer, employer], required
  - name: string, optional, minimum length 2 if provided
  - walletAddress: string, optional, Ethereum address format
- Responses:
  - 201: AuthResult with user, accessToken, refreshToken
  - 400: AuthError with VALIDATION_ERROR
  - 401: AuthError with AUTH_INVALID_TOKEN

Rate limiting: Yes (authRateLimiter)

#### POST /api/auth/resend-confirmation
- Purpose: Resend email confirmation link.
- Request body:
  - email: string, required
- Responses:
  - 200: Confirmation email sent
  - 400: AuthError with VALIDATION_ERROR

Rate limiting: Yes (authRateLimiter)

#### POST /api/auth/forgot-password
- Purpose: Send password reset email.
- Request body:
  - email: string, required
- Responses:
  - 200: Password reset email sent
  - 400: AuthError with VALIDATION_ERROR

Rate limiting: Yes (authRateLimiter)

#### POST /api/auth/reset-password
- Purpose: Update password using reset token.
- Request body:
  - accessToken: string, required
  - password: string, required, minimum length 8, must include uppercase, lowercase, digit, and special character
- Responses:
  - 200: Password updated successfully
  - 400: AuthError with VALIDATION_ERROR
  - 401: AuthError with INVALID_TOKEN

Rate limiting: Yes (authRateLimiter)

### Request and Response Schemas

#### RegisterInput
- email: string, required
- password: string, required
- role: string, enum [freelancer, employer], required
- name: string, optional
- walletAddress: string, optional

#### LoginInput
- email: string, required
- password: string, required

#### RefreshInput
- refreshToken: string, required

#### AuthResult
- user: object
  - id: string
  - email: string
  - role: string, enum [freelancer, employer, admin]
  - walletAddress: string
  - createdAt: string (date-time)
- accessToken: string
- refreshToken: string

#### AuthError
- error: object
  - code: string, enum including DUPLICATE_EMAIL, INVALID_CREDENTIALS, TOKEN_EXPIRED, INVALID_TOKEN, AUTH_EXCHANGE_FAILED, AUTH_INVALID_TOKEN, AUTH_INVALID_CREDENTIALS, AUTH_REQUIRE_REGISTRATION, VALIDATION_ERROR, INTERNAL_ERROR
  - message: string
  - details: array of validation errors (optional)
- timestamp: string (date-time)
- requestId: string

### Authentication Requirements (JWT)
- All protected routes require a Bearer token in the Authorization header.
- The auth middleware validates the token and attaches user info to the request.
- Supported roles: freelancer, employer, admin.

### Rate Limiting Policies
- authRateLimiter: 10 requests per 15 minutes per client IP.
- apiRateLimiter: 100 requests per minute per client IP.
- sensitiveRateLimiter: 5 requests per hour per client IP.

The auth endpoints use authRateLimiter. Exceeding the limit returns 429 with Retry-After header and RATE_LIMIT_EXCEEDED error.

### OAuth Integration
- Providers supported: google, github, azure, linkedin.
- PKCE flow: Redirect to provider, receive code in query, exchange code for tokens, then login.
- Implicit flow: Tokens in URL fragment; backend serves minimal HTML to extract tokens and POST to /api/auth/oauth/callback.

### Password Recovery
- forgot-password: Sends reset email via Supabase Auth.
- reset-password: Updates password using reset token.

### Client Implementation Examples (JavaScript/TypeScript)
Below are conceptual examples of how clients should interact with the authentication endpoints. Replace placeholders with actual values and handle responses accordingly.

- Registration with wallet address
  - Endpoint: POST /api/auth/register
  - Headers: Content-Type: application/json
  - Body: { email, password, role, name?, walletAddress? }
  - Success: Parse AuthResult to store accessToken and refreshToken
  - Error: Handle VALIDATION_ERROR or DUPLICATE_EMAIL

- Login
  - Endpoint: POST /api/auth/login
  - Headers: Content-Type: application/json
  - Body: { email, password }
  - Success: Store tokens and set Authorization: Bearer <accessToken> for subsequent requests

- Token Refresh
  - Endpoint: POST /api/auth/refresh
  - Body: { refreshToken }
  - Success: Replace stored accessToken and refreshToken

- OAuth Login Flow (Google/GitHub)
  - Initiate: GET /api/auth/oauth/:provider
  - Callback (PKCE): GET /api/auth/callback with code
  - Callback (implicit): GET /api/auth/callback (frontend receives tokens), then POST /api/auth/oauth/callback with access_token
  - Registration: POST /api/auth/oauth/register with accessToken, role, name?, walletAddress?

- Password Reset
  - Forgot password: POST /api/auth/forgot-password with email
  - Reset password: POST /api/auth/reset-password with accessToken, password

- Protected Route Example
  - Add Authorization: Bearer <accessToken> header
  - Handle 401 responses by refreshing tokens or prompting re-authentication

[No sources needed since this section provides conceptual client usage guidance]

## Dependency Analysis
The authentication routes depend on the service layer for business logic and on the rate limiter middleware for throttling. The service layer depends on Supabase Auth and the user repository. The auth middleware depends on the service layer for token validation.

```mermaid
graph LR
Routes["auth-routes.ts"] --> Service["auth-service.ts"]
Routes --> Rate["rate-limiter.ts"]
Service --> Supabase["Supabase Auth"]
Service --> Repo["User Repository"]
AuthMW["auth-middleware.ts"] --> Service
Types["auth-types.ts"] --> Service
Types --> Routes
Models["user.ts"] --> Service
Env["env.ts"] --> Service
```

## Performance Considerations
- Rate limiting reduces load on authentication endpoints and protects against brute force attacks.
- Token refresh and OAuth flows rely on external Supabase Auth; network latency affects response times.
- Avoid excessive polling of resend-confirmation and forgot-password endpoints.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 400 Validation Error: Ensure request body matches schemas and required fields are present.
- 401 Invalid Credentials: Verify email/password or token validity; ensure email is confirmed.
- 409 Duplicate Email: Use a different email address.
- 429 Rate Limit Exceeded: Wait until Retry-After seconds elapse before retrying.
- OAuth errors: Confirm provider configuration and redirect URLs; ensure correct provider name.

## Security Considerations
- Password storage: Supabase Auth manages password hashing; do not store raw passwords.
- Token expiration: Configure JWT secrets and expirations via environment variables.
- Brute force protection: Rate limiting and Supabase Auth constraints mitigate repeated login attempts.
- Token handling: Store refresh tokens securely; prefer short-lived access tokens and rotate refresh tokens.

## Conclusion
The authentication module provides a robust, standards-compliant API for user registration, login, token refresh, OAuth integration, and password recovery. It leverages Supabase Auth for secure identity management and includes built-in rate limiting and JWT-based authorization. Clients should implement proper error handling, token rotation, and secure storage of credentials and tokens.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### OpenAPI/Swagger Integration
- Swagger/OpenAPI is configured to document the authentication endpoints and shared schemas.
- Interactive documentation is available at /api-docs.

---

# Password Recovery

## Table of Contents
1. [Introduction](#introduction)
2. [Password Recovery Endpoints](#password-recovery-endpoints)
3. [Email Verification Process](#email-verification-process)
4. [Security Measures](#security-measures)
5. [Integration with Supabase](#integration-with-supabase)
6. [Implementation Details](#implementation-details)

## Introduction
The FreelanceXchain system provides a secure password recovery mechanism that allows users to reset their passwords through an email-based verification process. This documentation details the implementation of the password recovery functionality, including the requestPasswordReset and updatePassword flows, security measures, and integration with Supabase's authentication system.

## Password Recovery Endpoints
The password recovery functionality is exposed through two primary endpoints that handle the initiation and completion of the password reset process.

### Request Password Reset
The `/api/auth/forgot-password` endpoint initiates the password recovery process by sending a reset email to the user's registered email address.

```mermaid
sequenceDiagram
participant Client
participant Server
participant Supabase
Client->>Server : POST /api/auth/forgot-password
Server->>Server : Validate email format
Server->>Server : Apply rate limiting
Server->>Supabase : resetPasswordForEmail(email)
Supabase-->>Server : Send reset email
Server-->>Client : 200 OK
```

### Reset Password
The `/api/auth/reset-password` endpoint completes the password recovery process by updating the user's password using the access token provided in the reset email.

```mermaid
sequenceDiagram
participant Client
participant Server
participant Supabase
Client->>Server : POST /api/auth/reset-password
Server->>Server : Validate access token and password
Server->>Server : Apply rate limiting
Server->>Supabase : setSession(accessToken)
Server->>Supabase : updateUser(password)
Supabase-->>Server : Password updated
Server-->>Client : 200 OK
```

## Email Verification Process
The password recovery process uses an email-based verification system to ensure that only the legitimate account owner can reset their password.

### Token Generation and Expiration
When a user requests a password reset, Supabase generates a time-limited access token that is included in the reset email. The token has the following characteristics:

- **Expiration**: The reset token expires after a configurable period (default: 1 hour)
- **Single Use**: The token becomes invalid after it is used to update the password
- **Secure Transmission**: The token is transmitted via HTTPS and included in the redirect URL

The redirect URL is configured based on the environment:
- Production: Uses the PUBLIC_URL environment variable
- Development: Defaults to localhost with the configured port

```mermaid
flowchart TD
Start([User Requests Password Reset]) --> ValidateEmail["Validate Email Format"]
ValidateEmail --> RateLimit["Apply Rate Limiting"]
RateLimit --> SendRequest["Call Supabase resetPasswordForEmail()"]
SendRequest --> GenerateToken["Supabase Generates Reset Token"]
GenerateToken --> SendEmail["Send Email with Reset Link"]
SendEmail --> Complete([Reset Email Sent])
```

## Security Measures
The password recovery implementation includes multiple security measures to prevent abuse and protect user accounts.

### Rate Limiting
The system implements rate limiting to prevent brute force attacks and denial-of-service attempts:

- **Authentication Rate Limiter**: Limits password reset requests to 10 attempts per 15 minutes per IP address
- **Sensitive Operation Rate Limiter**: Additional protection for critical authentication operations

```mermaid
flowchart TD
Request["Password Reset Request"] --> CheckRateLimit["Check Rate Limit"]
CheckRateLimit --> |Within Limits| ProcessRequest["Process Request"]
CheckRateLimit --> |Exceeded| RejectRequest["Reject with 429"]
ProcessRequest --> SendEmail["Send Reset Email"]
RejectRequest --> Response429["Return 429 Too Many Requests"]
```

### Password Strength Requirements
The system enforces strong password policies to enhance account security:

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (@$!%*?&)

## Integration with Supabase
The password recovery functionality integrates with Supabase's authentication system while maintaining application-specific user data and session management.

### Supabase Authentication Flow
The implementation leverages Supabase's built-in password reset functionality while extending it with custom business logic:

1. **Token Handling**: The access token from Supabase is used to authenticate the password update request
2. **Session Management**: The system sets the session with the provided access token before updating the password
3. **User Data Synchronization**: Application-specific user data is maintained in the public.users table

```mermaid
classDiagram
class SupabaseAuth {
+resetPasswordForEmail(email)
+setSession(session)
+updateUser(user)
}
class AuthService {
+requestPasswordReset(email)
+updatePassword(accessToken, password)
+validatePasswordStrength(password)
}
class UserRepository {
+getUserById(id)
+getUserByEmail(email)
}
SupabaseAuth <.. AuthService : uses
AuthService <.. UserRepository : uses
```

### Application-Specific User Management
While Supabase handles the core authentication, the application maintains its own user data in the public.users table:

- **User Profile Data**: Role, wallet address, name, and other application-specific attributes
- **Data Synchronization**: User records are created and updated to maintain consistency between Supabase Auth and the application database
- **Session Integration**: The system combines Supabase tokens with application user data in the authentication response

## Implementation Details
The password recovery functionality is implemented across multiple service and route files, with clear separation of concerns.

### Service Layer Implementation
The core password recovery logic is implemented in the `auth-service.ts` file with two primary functions:

- **requestPasswordReset(email)**: Initiates the password recovery process by requesting Supabase to send a reset email
- **updatePassword(accessToken, newPassword)**: Completes the recovery by updating the user's password using the provided access token

Both functions include comprehensive error handling and return standardized response objects.

### Route Layer Implementation
The authentication routes are defined in `auth-routes.ts` with proper request validation and error handling:

- **Input Validation**: Email format and password strength are validated before processing
- **Rate Limiting**: The authRateLimiter middleware is applied to prevent abuse
- **Error Responses**: Standardized error responses with appropriate HTTP status codes
- **Request Tracing**: Each request includes a requestId for debugging and monitoring

---

# Token Refresh

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
This document describes the token refresh mechanism for the FreelanceXchain authentication system. It focuses on the POST /api/auth/refresh endpoint that accepts a refreshToken in the request body to obtain new accessToken and refreshToken pairs. It documents the RefreshInput schema, explains the token rotation strategy, and details the 200 success response with updated AuthResult, as well as error responses for 400 (missing token) and 401 (expired/invalid token). It also explains how the system validates token signatures and expiration using JWT standards, documents the implementation in auth-routes.ts and refreshTokens in auth-service.ts, and provides secure storage recommendations for refresh tokens on client applications.

## Project Structure
The token refresh flow spans routing, service logic, and configuration:
- Route handler: POST /api/auth/refresh
- Service function: refreshTokens(refreshToken)
- Types: RefreshInput, AuthResult, AuthError
- Middleware: authMiddleware for access token validation
- Configuration: JWT secrets and expirations

```mermaid
graph TB
Client["Client App"] --> Routes["auth-routes.ts<br/>POST /api/auth/refresh"]
Routes --> Service["auth-service.ts<br/>refreshTokens()"]
Service --> Supabase["Supabase Auth"]
Service --> Repo["User Repository"]
Routes --> Types["auth-types.ts<br/>RefreshInput, AuthResult, AuthError"]
Middleware["auth-middleware.ts<br/>validateToken()"] --> Service
Config["env.ts<br/>JWT config"]
Swagger["swagger.ts<br/>OpenAPI schemas"]
Routes --> Types
Service --> Types
Service --> Repo
Service --> Supabase
Service --> Config
Routes --> Swagger
```

## Core Components
- Endpoint: POST /api/auth/refresh
- Request body: RefreshInput with refreshToken
- Success response: 200 OK with AuthResult containing user, accessToken, and refreshToken
- Error responses:
  - 400 Bad Request for missing or invalid refreshToken
  - 401 Unauthorized for expired or invalid refresh token

Key implementation references:
- Route handler and OpenAPI schema for RefreshInput and AuthResult
- Service function refreshTokens that calls Supabase auth refreshSession
- Type definitions for RefreshInput, AuthResult, AuthError
- JWT configuration for secrets and expirations

## Architecture Overview
The refresh flow integrates with Supabase Auth to rotate tokens while ensuring the user still exists in the application’s database.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "auth-routes.ts"
participant S as "auth-service.ts"
participant U as "User Repository"
participant SB as "Supabase Auth"
C->>R : "POST /api/auth/refresh { refreshToken }"
R->>R : "Validate refreshToken presence/type"
alt "Missing or invalid"
R-->>C : "400 VALIDATION_ERROR"
else "Valid"
R->>S : "refreshTokens(refreshToken)"
S->>SB : "refreshSession({ refresh_token })"
SB-->>S : "{ session, user }"
alt "Session/user missing or error"
S-->>R : "AuthError INVALID_TOKEN"
R-->>C : "401 AUTH_INVALID_TOKEN or AUTH_TOKEN_EXPIRED"
else "Success"
S->>U : "getUserById(user.id)"
U-->>S : "UserEntity"
S-->>R : "AuthResult { user, accessToken, refreshToken }"
R-->>C : "200 AuthResult"
end
end
```

## Detailed Component Analysis

### Endpoint Definition: POST /api/auth/refresh
- Method: POST
- Path: /api/auth/refresh
- Request body: RefreshInput
  - refreshToken: string (required)
- Responses:
  - 200 OK: AuthResult
  - 400 Bad Request: AuthError with VALIDATION_ERROR
  - 401 Unauthorized: AuthError with AUTH_INVALID_TOKEN or AUTH_TOKEN_EXPIRED

OpenAPI schema definitions:
- RefreshInput: object with required refreshToken
- AuthResult: object with user, accessToken, refreshToken

Validation logic:
- Route checks for presence and type of refreshToken
- Returns 400 with details if missing or not a string

### Service Implementation: refreshTokens(refreshToken)
Behavior:
- Calls Supabase auth refreshSession with the provided refresh token
- On success, retrieves the associated user from the application’s user repository
- Returns AuthResult with updated access and refresh tokens
- On failure, returns AuthError with INVALID_TOKEN and explanatory message

JWT validation:
- Access tokens are validated by auth-middleware.ts using validateToken
- validateToken calls Supabase getUser with the access token to verify signature and expiration
- The service itself relies on Supabase for refresh token validation

### Token Rotation Strategy
- Access tokens are short-lived (configured via JWT_EXPIRES_IN)
- Refresh tokens are long-lived (configured via JWT_REFRESH_EXPIRES_IN)
- On successful refresh, both access and refresh tokens are rotated
- The system delegates signature verification and expiration checks to Supabase Auth

JWT configuration:
- JWT_SECRET and JWT_REFRESH_SECRET are loaded from environment
- Expirations are configured via JWT_EXPIRES_IN and JWT_REFRESH_EXPIRES_IN

### Data Models and Types
- RefreshInput: { refreshToken: string }
- AuthResult: { user, accessToken: string, refreshToken: string }
- AuthError: { code, message }

These types are used consistently across route and service layers.

### Example Requests and Responses
- Request body (JSON):
  - refreshToken: string
- Successful response body (JSON):
  - user: { id, email, role, walletAddress, createdAt }
  - accessToken: string
  - refreshToken: string
- Error response body (JSON):
  - error: { code, message, details? }
  - timestamp: string (ISO 8601)
  - requestId: string

Notes:
- The endpoint returns 400 for missing/invalid refreshToken
- Returns 401 for expired or invalid refresh token

### JWT Signature and Expiration Validation
- Access token validation:
  - auth-middleware.ts splits Authorization header and calls validateToken
  - validateToken uses Supabase getUser to verify token signature and expiration
  - Returns user claims or AuthError on failure
- Refresh token validation:
  - refreshTokens uses Supabase refreshSession
  - On error or missing session/user, returns AuthError INVALID_TOKEN

This design leverages Supabase’s JWT verification, ensuring robust signature and expiration checks without manual decoding.

## Dependency Analysis
The refresh flow depends on:
- Route handler for input validation and response formatting
- Service layer for token rotation and user lookup
- Supabase Auth for JWT validation and rotation
- User repository for user existence and profile data
- Configuration for JWT secrets and expirations
- OpenAPI schemas for documentation

```mermaid
graph LR
Routes["auth-routes.ts"] --> Service["auth-service.ts"]
Routes --> Types["auth-types.ts"]
Service --> Supabase["Supabase Auth"]
Service --> Repo["User Repository"]
Service --> Config["env.ts"]
Routes --> Swagger["swagger.ts"]
Middleware["auth-middleware.ts"] --> Service
```

## Performance Considerations
- Refresh calls involve network latency to Supabase; consider caching user data locally for short periods to reduce repeated lookups.
- Rate limiting is applied at the route level to mitigate abuse.
- Keep access token lifetime small and refresh token lifetime larger to balance security and UX.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 400 VALIDATION_ERROR:
  - Cause: Missing or invalid refreshToken in request body
  - Resolution: Ensure refreshToken is present and is a string
- 401 AUTH_INVALID_TOKEN or AUTH_TOKEN_EXPIRED:
  - Cause: Refresh token is invalid or expired
  - Resolution: Require the user to log in again to obtain a fresh refresh token
- Internal errors:
  - Cause: Unexpected failures from Supabase or user repository
  - Resolution: Check Supabase connectivity and logs; retry after verifying environment configuration

Operational checks:
- Verify JWT_SECRET/JWT_REFRESH_SECRET and expirations are set correctly
- Confirm Supabase URL and keys are configured
- Ensure the user still exists in the application database

## Conclusion
The token refresh mechanism in FreelanceXchain is implemented via a dedicated endpoint that rotates both access and refresh tokens using Supabase Auth. The route enforces input validation, while the service performs token rotation and user verification. JWT signature and expiration are validated by Supabase, ensuring secure sessions. Proper configuration of JWT secrets and expirations is essential for balancing security and usability.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Reference: POST /api/auth/refresh
- Request body: RefreshInput
  - refreshToken: string (required)
- Responses:
  - 200 OK: AuthResult
  - 400 Bad Request: AuthError with VALIDATION_ERROR
  - 401 Unauthorized: AuthError with AUTH_INVALID_TOKEN or AUTH_TOKEN_EXPIRED

### Secure Storage Recommendations for Refresh Tokens
- Store refresh tokens securely on clients:
  - Use secure, httpOnly cookies when possible
  - Prefer encrypted storage mechanisms (e.g., browser crypto APIs)
  - Avoid storing in localStorage or plain text
- Enforce strict SameSite and Secure attributes for cookies
- Rotate refresh tokens on sensitive actions and logout
- Monitor for suspicious activity and invalidate compromised tokens

[No sources needed since this section provides general guidance]

---

# User Login

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
This document provides comprehensive API documentation for the POST /api/auth/login endpoint in the FreelanceXchain system. It covers the LoginInput schema, authentication flow, credential validation, JWT token generation, response format, error handling, and security measures including the authRateLimiter middleware. It also explains how the auth-routes.ts integration works with the login function in auth-service.ts and how the system validates credentials against Supabase authentication while maintaining application-specific user data and roles.

## Project Structure
The login endpoint is implemented as part of the authentication module:
- Route handler: src/routes/auth-routes.ts
- Business logic: src/services/auth-service.ts
- Rate limiting: src/middleware/rate-limiter.ts
- Types: src/services/auth-types.ts
- Data access: src/repositories/user-repository.ts
- User model: src/models/user.ts
- Supabase client: src/config/supabase.ts
- OpenAPI/Swagger definitions: src/config/swagger.ts

```mermaid
graph TB
Client["Client"] --> Routes["auth-routes.ts<br/>POST /api/auth/login"]
Routes --> Limiter["rate-limiter.ts<br/>authRateLimiter"]
Routes --> Service["auth-service.ts<br/>login()"]
Service --> Supabase["supabase.ts<br/>Supabase Auth"]
Service --> Repo["user-repository.ts<br/>getUserById()"]
Repo --> DB["Supabase Postgres<br/>users table"]
Service --> Types["auth-types.ts<br/>AuthResult, AuthError"]
Routes --> Swagger["swagger.ts<br/>OpenAPI schemas"]
```

## Core Components
- Endpoint: POST /api/auth/login
- Request body: LoginInput schema with required fields email and password
- Response: AuthResult with user data, accessToken, and refreshToken
- Error responses: 400 for validation errors, 401 for invalid credentials
- Security: authRateLimiter middleware enforces rate limits to prevent brute force attacks
- Integration: Route handler delegates to auth-service.login; service validates against Supabase Auth and enriches with application user data

## Architecture Overview
The login flow integrates route validation, rate limiting, Supabase authentication, and application user data retrieval.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "auth-routes.ts"
participant L as "rate-limiter.ts"
participant S as "auth-service.ts"
participant SB as "supabase.ts"
participant U as "user-repository.ts"
C->>R : POST /api/auth/login {email,password}
R->>L : authRateLimiter
alt Too many requests
L-->>R : 429 RATE_LIMIT_EXCEEDED
R-->>C : JSON error
else Allowed
R->>S : login(LoginInput)
S->>SB : signInWithPassword()
SB-->>S : {user, session} or error
alt Auth fails
S-->>R : AuthError INVALID_CREDENTIALS
R-->>C : 401 AUTH_INVALID_CREDENTIALS
else Auth succeeds
S->>U : getUserById(user.id)
U-->>S : UserEntity
S-->>R : AuthResult {user, accessToken, refreshToken}
R-->>C : 200 AuthResult
end
end
```

## Detailed Component Analysis

### API Definition: POST /api/auth/login
- Method: POST
- Path: /api/auth/login
- Tags: Authentication
- Request body: LoginInput
  - email: string, required
  - password: string, required
- Responses:
  - 200 OK: AuthResult
  - 400 Bad Request: Validation error
  - 401 Unauthorized: Invalid credentials
  - 429 Too Many Requests: Rate limit exceeded

OpenAPI/Swagger schema definitions:
- LoginInput: required fields email and password
- AuthResult: user object with id, email, role, walletAddress, createdAt; accessToken, refreshToken
- AuthError: standardized error envelope with code and message

### Route Handler Behavior
- Input validation: checks email format and presence of password
- Error handling: returns 400 with VALIDATION_ERROR when validation fails
- Rate limiting: applies authRateLimiter before invoking login
- Success path: returns 200 with AuthResult
- Failure path: returns 401 with AUTH_INVALID_CREDENTIALS

### Service Layer: login()
- Normalizes email to lowercase
- Calls Supabase Auth signInWithPassword
- Handles Supabase errors:
  - Email not confirmed -> INVALID_CREDENTIALS
  - Other auth failures -> INVALID_CREDENTIALS
- Retrieves application user data from Supabase Postgres users table via user-repository
- Constructs AuthResult with accessToken and refreshToken from Supabase session

```mermaid
flowchart TD
Start(["login(LoginInput)"]) --> Normalize["Normalize email to lowercase"]
Normalize --> CallSupabase["Call Supabase signInWithPassword"]
CallSupabase --> HasError{"Supabase error?"}
HasError --> |Yes| MapError["Map to INVALID_CREDENTIALS"]
MapError --> ReturnError["Return AuthError"]
HasError --> |No| HasUser{"Has user and session?"}
HasUser --> |No| InvalidCreds["Return INVALID_CREDENTIALS"]
HasUser --> |Yes| GetUser["Get user from users table"]
GetUser --> Found{"User found?"}
Found --> |No| InvalidCreds
Found --> |Yes| BuildResult["Build AuthResult with tokens"]
BuildResult --> Done(["Return AuthResult"])
```

### Data Model: AuthResult and AuthError
- AuthResult:
  - user: id, email, role, walletAddress, createdAt
  - accessToken: string
  - refreshToken: string
- AuthError:
  - code: one of DUPLICATE_EMAIL, INVALID_CREDENTIALS, TOKEN_EXPIRED, INVALID_TOKEN, AUTH_EXCHANGE_FAILED, AUTH_INVALID_TOKEN, AUTH_INVALID_CREDENTIALS, AUTH_REQUIRE_REGISTRATION, VALIDATION_ERROR, INTERNAL_ERROR
  - message: string

These types define the response contract for successful logins and error scenarios.

### Middleware: authRateLimiter
- Enforces a sliding window policy:
  - Window: 15 minutes
  - Max requests: 10 attempts
- On limit exceeded:
  - Returns 429 with RATE_LIMIT_EXCEEDED
  - Sets Retry-After header
- Uses client IP (with support for X-Forwarded-For) as the key

```mermaid
flowchart TD
Enter(["Incoming request"]) --> GetKey["Compute client key"]
GetKey --> Store["Lookup store for 'auth' window"]
Store --> Exists{"Record exists and not expired?"}
Exists --> |No| Create["Create new record with resetTime"]
Exists --> |Yes| CheckLimit{"count >= maxRequests?"}
CheckLimit --> |Yes| Block["Respond 429 RATE_LIMIT_EXCEEDED"]
CheckLimit --> |No| Increment["Increment count"]
Create --> Next["Call next()"]
Increment --> Next
Block --> End(["Stop"])
Next --> End
```

### Supabase Integration and Application User Data
- Supabase Auth manages email/password credentials and sessions
- Application user data (role, walletAddress, timestamps) is stored in Supabase Postgres users table
- After successful Supabase login, the service retrieves the application user record and returns it alongside tokens
- This ensures:
  - Strong credential validation via Supabase
  - Application-specific roles and metadata remain synchronized

### Error Handling and Codes
- Validation errors (400):
  - VALIDATION_ERROR with details array
- Authentication errors (401):
  - AUTH_INVALID_CREDENTIALS for invalid email/password
  - INVALID_CREDENTIALS for Supabase-level failures (e.g., unconfirmed email)
- Rate limiting (429):
  - RATE_LIMIT_EXCEEDED with Retry-After

### Example Requests and Responses
- Successful login request:
  - POST /api/auth/login
  - Body: { "email": "<user@example.com>", "password": "<securePassword>" }
  - Response: 200 OK with AuthResult containing user, accessToken, refreshToken
- Validation error response (400):
  - Body: { "error": { "code": "VALIDATION_ERROR", "message": "Invalid request data", "details": [ { "field": "email", "message": "Valid email is required" } ] }, "timestamp": "...", "requestId": "..." }
- Invalid credentials response (401):
  - Body: { "error": { "code": "AUTH_INVALID_CREDENTIALS", "message": "Invalid email or password" }, "timestamp": "...", "requestId": "..." }
- Rate limit exceeded response (429):
  - Body: { "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "Too many authentication attempts, please try again later" }, "retryAfter": 900, "timestamp": "...", "requestId": "..." }

Note: These examples illustrate the structure and codes. See the referenced files for exact field names and shapes.

## Dependency Analysis
The login endpoint depends on:
- Route handler for request parsing and response formatting
- Rate limiter for security
- Service layer for business logic and external integrations
- Supabase client for authentication
- Repository for application user data

```mermaid
graph LR
Routes["auth-routes.ts"] --> Limiter["rate-limiter.ts"]
Routes --> Service["auth-service.ts"]
Service --> Supabase["supabase.ts"]
Service --> Repo["user-repository.ts"]
Repo --> Types["auth-types.ts"]
Routes --> Swagger["swagger.ts"]
```

## Performance Considerations
- Supabase calls incur network latency; keep payloads minimal
- Rate limiting reduces load during brute force attempts
- Consider caching user roles and metadata for subsequent requests if appropriate
- Monitor Supabase rate limits and adjust authRateLimiter as needed

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 400 Validation Error:
  - Ensure email is present and valid; ensure password is present
  - Check for typos in field names
- 401 Invalid Credentials:
  - Verify email and password are correct
  - Confirm email is verified in Supabase
  - Check that the user exists in the application users table
- 429 Rate Limit Exceeded:
  - Wait until the window resets (Retry-After seconds)
  - Reduce login attempts or adjust client-side retry logic
- Internal errors:
  - Inspect Supabase connectivity and configuration
  - Verify JWT secret and expiration settings

## Conclusion
The POST /api/auth/login endpoint provides a secure, validated authentication flow that leverages Supabase for credential management while preserving application-specific user data and roles. The route handler performs input validation and applies rate limiting, while the service layer coordinates with Supabase Auth and the application user repository to produce a standardized AuthResult. Clear error responses and rate limiting protect the system from abuse and provide predictable client experiences.

---

# User Registration

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
This document provides comprehensive API documentation for the user registration endpoint in the FreelanceXchain system. It covers the POST /api/auth/register endpoint, including request body schema, validation rules, success and error responses, and the interaction between the route handler and the authentication service. It also explains how the authRateLimiter middleware protects against abuse and how Supabase handles initial OAuth user creation before role assignment.

## Project Structure
The registration flow spans several layers:
- Route handler: validates inputs, applies rate limiting, and delegates to the service layer
- Service layer: orchestrates Supabase Auth and database operations
- Repository layer: interacts with the Supabase Postgres users table
- Middleware: enforces rate limits and request validation
- Configuration: Supabase client initialization and Swagger/OpenAPI definitions

```mermaid
graph TB
Client["Client"] --> Routes["auth-routes.ts<br/>POST /api/auth/register"]
Routes --> Limiter["rate-limiter.ts<br/>authRateLimiter"]
Routes --> Service["auth-service.ts<br/>register()"]
Service --> Supabase["supabase.ts<br/>Supabase Auth & DB"]
Service --> Repo["user-repository.ts<br/>public.users"]
Routes --> Swagger["swagger.ts<br/>OpenAPI schemas"]
```

## Core Components
- Endpoint: POST /api/auth/register
- Purpose: Create a new user account with email/password, assign role, and optionally set name and wallet address
- Success response: 201 with AuthResult schema
- Error responses: 400 for validation errors, 409 for duplicate email
- Rate limiting: authRateLimiter configured for 10 requests per 15 minutes

## Architecture Overview
The registration flow integrates Supabase Auth for identity and the application’s database for user profiles. The route handler performs input validation and rate limiting, then calls the service layer to register the user. The service layer registers with Supabase Auth, waits for the database trigger to populate public.users, and returns an AuthResult with tokens.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "auth-routes.ts"
participant RL as "rate-limiter.ts"
participant S as "auth-service.ts"
participant SB as "supabase.ts"
participant DB as "user-repository.ts"
C->>R : POST /api/auth/register {email,password,role,name?,walletAddress?}
R->>RL : apply authRateLimiter
RL-->>R : pass or 429
R->>R : validate inputs (email, password, role, optional name, optional wallet)
R->>S : register(RegisterInput)
S->>SB : signUp(email,password,{role,wallet_address,name})
SB-->>S : {user,session} or error
S->>DB : wait for trigger to create public.users
DB-->>S : user from public.users
S-->>R : AuthResult {user,accessToken,refreshToken}
R-->>C : 201 AuthResult
```

## Detailed Component Analysis

### Endpoint Definition and OpenAPI Schema
- Endpoint: POST /api/auth/register
- Tags: Authentication
- Request body schema: RegisterInput
  - email: string, format: email, required
  - password: string, min length 8, required
  - role: string, enum: freelancer, employer, required
  - name: string, min length 2, optional
  - walletAddress: string, pattern 0x[a-fA-F0-9]{40}, optional
- Responses:
  - 201: AuthResult
  - 400: AuthError (validation errors)
  - 409: AuthError (duplicate email)

### Request Validation Rules
- Email validation:
  - Format: email
  - Length: minimum 5 characters
- Password validation:
  - Minimum length: 8 characters
  - Requirements enforced by validatePasswordStrength:
    - At least one lowercase letter
    - At least one uppercase letter
    - At least one digit
    - At least one special character from [@ $ ! % * ? &]
- Role validation:
  - Enumerated values: freelancer, employer
- Optional name validation:
  - If provided, minimum length: 2 characters
- Optional wallet address validation:
  - Pattern: 0x followed by exactly 40 hexadecimal characters

These rules are enforced both in the route handler and in the service layer.

### Success Response: AuthResult
On successful registration, the endpoint returns:
- HTTP 201 Created
- Body: AuthResult
  - user: {
      - id: string
      - email: string
      - role: string (freelancer, employer, admin)
      - walletAddress: string
      - createdAt: string (ISO 8601)
    }
  - accessToken: string
  - refreshToken: string

The service constructs AuthResult from the Supabase user and session, and from the public.users row.

### Error Responses
- 400 Bad Request:
  - Validation errors: includes details array with field and message
  - Example codes: VALIDATION_ERROR
- 409 Conflict:
  - Duplicate email encountered
  - Code: DUPLICATE_EMAIL

The route handler translates service errors into appropriate HTTP status codes.

### Rate Limiting: authRateLimiter
- Window: 15 minutes
- Max requests: 10 per client IP
- Behavior: Returns 429 Too Many Requests with Retry-After header and RATE_LIMIT_EXCEEDED error

The middleware uses X-Forwarded-For when present, otherwise falls back to req.ip.

### Interaction Between auth-routes.ts and registerWithSupabase
- The route handler calls register(RegisterInput) in auth-service.ts
- registerWithSupabase is used for OAuth registration (separate endpoint)
- For email/password registration, the route handler calls register, which internally:
  - Normalizes email
  - Checks for duplicate email in public.users
  - Calls Supabase Auth signUp with role, wallet_address, and name in user options
  - Waits briefly for trigger to create public.users
  - Returns AuthResult with tokens

### Supabase OAuth User Creation and Role Assignment
- Initial OAuth flow:
  - getOAuthUrl redirects to provider
  - exchangeCodeForSession exchanges authorization code for tokens
  - loginWithSupabase validates access token and checks if a public.users record exists
  - If not found, returns AUTH_REQUIRE_REGISTRATION indicating role selection is required
- OAuth registration:
  - /api/auth/oauth/register accepts accessToken, role, optional name, optional walletAddress
  - registerWithSupabase updates user metadata in Supabase Auth and creates a record in public.users
  - Returns AuthResult with tokens

This separation ensures that Supabase creates the user record first, then the application assigns role and profile attributes.

### Wallet Address Pattern
- Pattern: 0x[a-fA-F0-9]{40}
- Matches Ethereum-style addresses with leading 0x and exactly 40 hex digits
- Enforced both in route-level validation and Swagger schema

## Dependency Analysis
The registration flow depends on:
- Supabase client for Auth operations and database access
- User repository for database interactions
- Rate limiter middleware for abuse protection
- Swagger/OpenAPI for schema definitions

```mermaid
graph LR
Routes["auth-routes.ts"] --> Service["auth-service.ts"]
Routes --> Limiter["rate-limiter.ts"]
Service --> Supabase["supabase.ts"]
Service --> Repo["user-repository.ts"]
Swagger["swagger.ts"] --> Routes
```

## Performance Considerations
- Input validation occurs in-memory before hitting Supabase, reducing unnecessary network calls
- The service waits briefly for a database trigger to populate public.users; this introduces a small latency but ensures consistency
- Rate limiting prevents brute-force attempts and protects downstream systems

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Validation failures (400):
  - Ensure email matches format and length requirements
  - Ensure password meets minimum length and complexity requirements
  - Ensure role is one of freelancer or employer
  - If name is provided, ensure minimum length of 2 characters
  - If walletAddress is provided, ensure it matches 0x followed by 40 hex characters
- Duplicate email (409):
  - Another user already registered with the same normalized email
  - Ask the user to log in or use a different email
- Rate limit exceeded (429):
  - Exceeded 10 requests in 15 minutes; wait for Retry-After seconds before retrying
- Internal errors:
  - Occur when Supabase operations fail; check logs and environment variables for Supabase configuration

## Conclusion
The POST /api/auth/register endpoint provides a robust, validated, and rate-limited pathway to create new user accounts. It integrates tightly with Supabase Auth for identity while persisting user profiles in the application database. The endpoint returns a standardized AuthResult on success and clearly defined error responses for validation and conflict scenarios. The authRateLimiter helps protect the system from abuse, and the separation of concerns across route, service, and repository layers keeps the code maintainable and testable.

---

# OAuth Integration

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
This document provides comprehensive API documentation for the OAuth integration system in FreelanceXchain. It covers the complete OAuth flow including initiating provider login, handling callbacks for both PKCE and implicit flows, and the “registration required” flow for new OAuth users. It also documents the exchangeCodeForSession and loginWithSupabase functions, explains security considerations around state management and token validation, and outlines how external identities are securely linked to internal user accounts with optional blockchain wallet integration.

## Project Structure
The OAuth integration spans routing, service logic, configuration, and data access layers:
- Routes define the OAuth endpoints and handle request/response flows.
- Services encapsulate Supabase OAuth interactions and internal user synchronization.
- Configuration supplies Supabase client initialization and environment variables.
- Repositories manage persistence of user records in the database.

```mermaid
graph TB
Client["Client App"] --> Routes["Express Routes<br/>auth-routes.ts"]
Routes --> Service["Auth Service<br/>auth-service.ts"]
Service --> Supabase["Supabase Client<br/>supabase.ts"]
Service --> Repo["User Repository<br/>user-repository.ts"]
Repo --> DB["Supabase Database"]
```

## Core Components
- OAuth initiation endpoint: GET /api/auth/oauth/:provider
- Callback handler: GET /api/auth/callback (PKCE) and POST /api/auth/oauth/callback (implicit)
- Registration continuation: POST /api/auth/oauth/register
- Supporting service functions:
  - getOAuthUrl(provider)
  - exchangeCodeForSession(code)
  - loginWithSupabase(accessToken)
  - registerWithSupabase(accessToken, role, walletAddress, name)

These components collectively implement a robust OAuth integration with Supabase, including handling new user registration and linking external identities to internal user profiles.

## Architecture Overview
The OAuth flow integrates with Supabase for provider redirection and token exchange. The backend validates tokens, checks for existing user records, and either returns app tokens or signals that registration is required.

```mermaid
sequenceDiagram
participant C as "Client App"
participant R as "Routes<br/>auth-routes.ts"
participant S as "Service<br/>auth-service.ts"
participant SB as "Supabase"
participant U as "User Repository<br/>user-repository.ts"
C->>R : "GET /api/auth/oauth/ : provider"
R->>S : "getOAuthUrl(provider)"
S->>SB : "signInWithOAuth(options)"
SB-->>S : "OAuth URL"
S-->>R : "OAuth URL"
R-->>C : "302 Redirect to provider"
C->>SB : "Provider login"
SB-->>R : "GET /api/auth/callback?code=..."
R->>S : "exchangeCodeForSession(code)"
S->>SB : "exchangeCodeForSession(code)"
SB-->>S : "{access_token, refresh_token}"
S-->>R : "{access_token, refresh_token}"
R->>S : "loginWithSupabase(access_token)"
S->>SB : "getUser(access_token)"
SB-->>S : "User"
S->>U : "getUserByEmail(user.email)"
U-->>S : "UserEntity or null"
alt "Existing user"
S-->>R : "AuthResult"
R-->>C : "200 OK with tokens"
else "New user"
S-->>R : "AUTH_REQUIRE_REGISTRATION"
R-->>C : "202 Registration Required"
end
```

## Detailed Component Analysis

### OAuth Initiation Endpoint: GET /api/auth/oauth/:provider
- Purpose: Redirect clients to the selected provider’s OAuth page.
- Providers supported: google, github, azure, linkedin.
- Behavior:
  - Validates provider parameter.
  - Calls getOAuthUrl(provider) to obtain a Supabase OAuth URL with configured redirect and parameters.
  - Responds with a 302 redirect to the provider.

Security considerations:
- The redirect URL is built from environment configuration and points to the backend’s callback endpoint.
- The provider mapping adjusts LinkedIn to the OIDC provider alias recognized by Supabase.

### Callback Handler: GET /api/auth/callback (PKCE)
- Purpose: Handle provider redirects containing an authorization code.
- Flow:
  - If an error is present, returns a 400 with error details.
  - If a code is present, exchanges it for session tokens via exchangeCodeForSession(code).
  - Validates the resulting access token with loginWithSupabase(access_token).
  - If the user exists, returns 200 with app tokens.
  - If the user does not exist, returns 202 with registration_required and the provider access token.

Implicit flow note:
- The route also serves a minimal HTML page that extracts tokens from the URL fragment and posts them to POST /api/auth/oauth/callback.

### Implicit Flow Handler: POST /api/auth/oauth/callback
- Purpose: Legacy support for implicit flow where tokens arrive in the URL fragment.
- Behavior:
  - Validates presence of access_token.
  - Calls loginWithSupabase(access_token).
  - Returns 200 on success or 202 if registration is required.
  - Returns 401 on invalid token.

### Registration Continuation: POST /api/auth/oauth/register
- Purpose: Finalize OAuth registration by assigning a role and optional profile details.
- Request body:
  - accessToken (required)
  - role (freelancer or employer)
  - name (optional)
  - walletAddress (optional, validated as Ethereum address)
- Behavior:
  - Validates inputs.
  - Calls registerWithSupabase(accessToken, role, walletAddress, name).
  - On success, returns 201 with app tokens and user profile.
  - On failure, returns 401 with error details.

### Service Functions: exchangeCodeForSession and loginWithSupabase
- exchangeCodeForSession(code):
  - Exchanges the authorization code received from the provider for Supabase session tokens.
  - Returns either an AuthError or a tuple of access and refresh tokens.

- loginWithSupabase(accessToken):
  - Validates the Supabase access token and retrieves the user.
  - Checks if a corresponding user record exists in the application database.
  - Returns AUTH_REQUIRE_REGISTRATION if the user does not exist.
  - Otherwise, returns an AuthResult with app tokens and user profile.

```mermaid
flowchart TD
Start(["exchangeCodeForSession(code)"]) --> CallSupabase["Call Supabase exchangeCodeForSession(code)"]
CallSupabase --> HasError{"Error or no session?"}
HasError --> |Yes| ReturnError["Return AuthError"]
HasError --> |No| ReturnTokens["Return {access_token, refresh_token}"]
subgraph "loginWithSupabase(accessToken)"
A["getUser(access_token)"] --> B{"User found?"}
B --> |No| E["Return INVALID_TOKEN"]
B --> |Yes| C["getUserByEmail(user.email)"]
C --> D{"User exists in DB?"}
D --> |No| F["Return AUTH_REQUIRE_REGISTRATION"]
D --> |Yes| G["getSession() for refresh_token"]
G --> H["Return AuthResult"]
end
```

### Data Model and Types
- AuthResult: includes user profile, accessToken, and refreshToken.
- AuthError: standardized error codes for authentication failures.
- UserRole: union of freelancer, employer, admin.

### Security Considerations
- Provider selection validation prevents unsupported providers.
- Redirect URL is constructed from environment variables to ensure callbacks reach the intended backend.
- Token validation occurs via Supabase getUser and local user lookup.
- The implicit flow handler responds with a minimal HTML page that posts tokens to a dedicated endpoint to reduce exposure of tokens in browser history.
- Registration requires explicit role selection, preventing ambiguous identity states.

### Frontend Integration Examples
- PKCE flow:
  - Client navigates to GET /api/auth/oauth/:provider.
  - After provider login, Supabase redirects to GET /api/auth/callback with an authorization code.
  - Backend exchanges code for tokens and returns either 200 with tokens or 202 with registration_required.
  - For new users, client calls POST /api/auth/oauth/register with accessToken and role.

- Implicit flow:
  - Client navigates to GET /api/auth/oauth/:provider.
  - After provider login, Supabase redirects to GET /api/auth/callback with tokens in the URL fragment.
  - The route serves a minimal HTML page that extracts tokens and posts them to POST /api/auth/oauth/callback.
  - Backend validates the token and returns 200 or 202.

- Reference documentation:
  - API overview and examples are documented in the project’s API documentation.

### Identity Linking and Blockchain Wallet Integration
- External identity linkage:
  - loginWithSupabase validates the provider token and checks for a corresponding user in the application database.
  - If the user does not exist, the system signals registration_required, prompting the client to call POST /api/auth/oauth/register.
  - registerWithSupabase updates Supabase user metadata (role, name, wallet address) and creates a record in the application database.

- Wallet integration:
  - The registration endpoint accepts an optional walletAddress parameter.
  - The user model includes a wallet_address field, enabling downstream blockchain features.

## Dependency Analysis
The OAuth integration depends on Supabase for provider authentication and token management, while the application maintains user records in the database.

```mermaid
graph LR
Routes["auth-routes.ts"] --> Service["auth-service.ts"]
Service --> Supabase["supabase.ts"]
Service --> Repo["user-repository.ts"]
Repo --> DB["Supabase DB"]
Service --> Types["auth-types.ts"]
Service --> Models["user.ts"]
Routes --> Env["env.ts"]
```

## Performance Considerations
- Token exchange and user lookup are lightweight operations; ensure Supabase connectivity is reliable and consider caching refresh tokens on the client to minimize repeated exchanges.
- Rate limiting is applied to authentication endpoints to mitigate abuse.
- Avoid long-running synchronous operations in the callback handlers; keep them asynchronous to reduce latency.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Invalid provider: Ensure provider is one of google, github, azure, linkedin.
- Missing or invalid access_token: Verify the implicit flow handler receives a valid token and that the token is posted to the correct endpoint.
- AUTH_REQUIRE_REGISTRATION: Client must call POST /api/auth/oauth/register with accessToken and role.
- AUTH_INVALID_TOKEN: Confirm the token is fresh and not expired; refresh if necessary.
- Redirect URL mismatch: Verify PUBLIC_URL or BASE_URL environment variables are correctly set.

## Conclusion
The OAuth integration in FreelanceXchain provides a secure, extensible foundation for external identity management. It supports multiple providers, handles both PKCE and implicit flows, and seamlessly links external identities to internal user accounts. The design emphasizes clear separation of concerns, robust error handling, and straightforward client integration patterns.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Endpoints Summary
- GET /api/auth/oauth/:provider
  - Redirects to provider login page.
- GET /api/auth/callback
  - Handles PKCE flow; returns tokens or registration_required.
- POST /api/auth/oauth/callback
  - Handles implicit flow; returns success or registration_required.
- POST /api/auth/oauth/register
  - Completes OAuth registration with role assignment.

---

# OAuth Callback Handling

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
This document explains the OAuth callback handling system used by FreelanceXchain. It covers:
- The GET /api/auth/callback endpoint for PKCE flows (authorization code in query parameters)
- The POST /api/auth/oauth/callback endpoint for implicit flows (access tokens in URL fragments)
- How authorization codes are exchanged for sessions using exchangeCodeForSession
- How tokens are extracted from URL fragments and forwarded to the backend
- The 202 “registration required” response logic for new OAuth users
- Error handling for OAuth failures and token validation
- Security considerations around state validation and token verification
- Implementation details from auth-service.ts and examples of frontend integration for both flow types

## Project Structure
The OAuth callback handling spans routing, service-layer logic, and configuration:
- Routes define the endpoints and orchestrate the flow
- Services encapsulate Supabase interactions and token validation
- Configuration provides the Supabase client used by services

```mermaid
graph TB
subgraph "Routes"
R1["GET /api/auth/callback"]
R2["POST /api/auth/oauth/callback"]
R3["GET /api/auth/oauth/:provider"]
end
subgraph "Services"
S1["exchangeCodeForSession(code)"]
S2["loginWithSupabase(accessToken)"]
S3["registerWithSupabase(accessToken, role, walletAddress, name)"]
end
subgraph "Config"
C1["getSupabaseClient()"]
end
R1 --> S1
R1 --> S2
R2 --> S2
R3 --> C1
S1 --> C1
S2 --> C1
S3 --> C1
```

## Core Components
- Route handlers for OAuth callbacks:
  - GET /api/auth/callback: PKCE flow handler; validates errors, exchanges code, logs in, and responds with either tokens or 202 registration required
  - POST /api/auth/oauth/callback: Implicit flow handler; validates access_token, logs in, and responds with success or 202/401
- Service functions:
  - exchangeCodeForSession(code): Exchanges an authorization code for Supabase session tokens
  - loginWithSupabase(accessToken): Validates a Supabase access token and returns app tokens; triggers 202 when user does not exist in the app
  - registerWithSupabase(accessToken, role, walletAddress, name): Completes OAuth registration by updating user metadata and creating a local user record
- Types and errors:
  - AuthResult and AuthError types define response shapes and error codes used across routes and services

## Architecture Overview
The system integrates with Supabase Auth to handle OAuth providers and exchange authorization codes for session tokens. The backend verifies tokens and synchronizes user records, returning either app JWT tokens or guiding the client to complete registration.

```mermaid
sequenceDiagram
participant Client as "Client Browser"
participant Routes as "Auth Routes"
participant Service as "Auth Service"
participant Supabase as "Supabase Auth"
participant DB as "Supabase DB"
Client->>Routes : GET /api/auth/oauth/ : provider
Routes->>Supabase : signInWithOAuth(options)
Supabase-->>Routes : redirect_url
Routes-->>Client : 302 Redirect
Client->>Routes : GET /api/auth/callback?code=...
Routes->>Service : exchangeCodeForSession(code)
Service->>Supabase : exchangeCodeForSession(code)
Supabase-->>Service : {access_token, refresh_token}
Service-->>Routes : tokens
Routes->>Service : loginWithSupabase(access_token)
Service->>Supabase : getUser(access_token)
alt User exists in app
Service->>DB : fetch user profile
DB-->>Service : user
Service-->>Routes : AuthResult
Routes-->>Client : 200 {access_token, refresh_token, user}
else User does not exist in app
Service-->>Routes : AUTH_REQUIRE_REGISTRATION
Routes-->>Client : 202 {status : "registration_required", access_token}
end
```

## Detailed Component Analysis

### GET /api/auth/callback (PKCE Flow)
Behavior:
- Validates OAuth error query parameters and returns 400 on failure
- If code is present, exchanges it for session tokens using exchangeCodeForSession
- Calls loginWithSupabase with the returned access token
- Responds with 200 and tokens if the user exists in the app
- Responds with 202 and access_token if the user does not exist in the app (registration required)
- Responds with 401 on invalid token or exchange failure

```mermaid
flowchart TD
Start(["GET /api/auth/callback"]) --> CheckError["Check 'error' query param"]
CheckError --> HasError{"Error present?"}
HasError --> |Yes| Return400["Return 400 OAuth error"]
HasError --> |No| HasCode{"Has 'code' query param?"}
HasCode --> |No| ImplicitFlow["Serve implicit flow HTML<br/>extract tokens from URL fragment"]
HasCode --> |Yes| Exchange["exchangeCodeForSession(code)"]
Exchange --> ExchangeOK{"Exchange success?"}
ExchangeOK --> |No| Return401["Return 401 AUTH_EXCHANGE_FAILED"]
ExchangeOK --> |Yes| Login["loginWithSupabase(access_token)"]
Login --> LoginOK{"Login success?"}
LoginOK --> |No| RegReq{"Is AUTH_REQUIRE_REGISTRATION?"}
RegReq --> |Yes| Return202["Return 202 registration_required"]
RegReq --> |No| Return401b["Return 401 AUTH_INVALID_TOKEN"]
LoginOK --> |Yes| Return200["Return 200 {access_token, refresh_token, user}"]
```

### POST /api/auth/oauth/callback (Implicit Flow)
Behavior:
- Validates presence of access_token in request body
- Calls loginWithSupabase with the access_token
- Responds with 200 on success
- Responds with 202 when registration is required
- Responds with 401 on invalid token

```mermaid
sequenceDiagram
participant Client as "Client Browser"
participant Routes as "Auth Routes"
participant Service as "Auth Service"
participant Supabase as "Supabase Auth"
Client->>Routes : POST /api/auth/oauth/callback {access_token}
Routes->>Service : loginWithSupabase(access_token)
Service->>Supabase : getUser(access_token)
alt User exists in app
Service-->>Routes : AuthResult
Routes-->>Client : 200 {status : "success"}
else Registration required
Service-->>Routes : AUTH_REQUIRE_REGISTRATION
Routes-->>Client : 202 {status : "registration_required", accessToken}
else Invalid token
Service-->>Routes : AuthError
Routes-->>Client : 401 {error}
end
```

### exchangeCodeForSession(code)
Purpose:
- Exchanges an authorization code received from the OAuth provider into a Supabase session containing access and refresh tokens

Implementation highlights:
- Uses the Supabase client to call exchangeCodeForSession
- Returns AuthError on failure with code AUTH_EXCHANGE_FAILED
- Returns token pair on success

Security considerations:
- The code is short-lived and bound to the original authorization request
- The exchange occurs server-side, preventing exposure of tokens to the client except via the intended flow

### loginWithSupabase(accessToken)
Purpose:
- Validates a Supabase access token and returns app tokens
- If the user does not exist in the app’s database, returns AUTH_REQUIRE_REGISTRATION (202)

Implementation highlights:
- Validates token via Supabase getUser
- Checks for user existence in the app’s user table
- Retrieves current session refresh token for completeness
- Returns AuthError with code AUTH_REQUIRE_REGISTRATION when user not found in app

Security considerations:
- Validates token with Supabase before proceeding
- Ensures the user’s email is available for app-level checks

### registerWithSupabase(accessToken, role, walletAddress, name)
Purpose:
- Completes OAuth registration by updating user metadata and creating a local user record

Implementation highlights:
- Validates access token and extracts user email
- Updates Supabase user metadata (role, wallet address, name)
- Creates a local user record in the app’s database
- Returns AuthResult with app tokens

Security considerations:
- Requires a valid Supabase access token
- Role must be one of the supported values
- Wallet address follows a strict format when provided

### Frontend Integration Examples
- PKCE flow (recommended):
  - Initiate OAuth by navigating to GET /api/auth/oauth/:provider
  - After provider consent, the browser is redirected to GET /api/auth/callback?code=...
  - The backend exchanges the code and returns either tokens (200) or registration required (202)
- Implicit flow (legacy):
  - The backend serves a minimal HTML page that extracts tokens from the URL fragment and posts them to POST /api/auth/oauth/callback
  - The backend responds with 200, 202, or 401

Documentation references:
- API endpoints and expected responses are documented in the API documentation

## Dependency Analysis
The OAuth callback system depends on:
- Supabase client for OAuth initiation, token exchange, and user validation
- Auth routes to coordinate flows and respond with standardized statuses
- Auth service functions to encapsulate business logic and error handling

```mermaid
graph LR
Routes["auth-routes.ts"] --> Service["auth-service.ts"]
Service --> Config["supabase.ts"]
Routes --> Types["auth-types.ts"]
Service --> Types
```

## Performance Considerations
- Minimal latency: exchangeCodeForSession and loginWithSupabase perform a single Supabase call each
- Reduced round trips: implicit flow HTML page posts tokens directly to the backend
- Caching: consider caching frequent user lookups if traffic increases
- Rate limiting: authentication endpoints are protected by rate limiter middleware

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- OAuth error returned (400): Indicates provider-level error; inspect error and error_description query parameters
- Exchange failure (401): The authorization code may be invalid or expired; retry the OAuth flow
- Registration required (202): The user authenticated with Supabase but does not exist in the app; call POST /api/auth/oauth/register to complete onboarding
- Invalid token (401): The access token is invalid or expired; re-authenticate or refresh tokens

Error codes and handling:
- AUTH_EXCHANGE_FAILED: exchangeCodeForSession returned an error
- AUTH_REQUIRE_REGISTRATION: user exists in Supabase but not in the app
- AUTH_INVALID_TOKEN: loginWithSupabase failed due to invalid token

## Conclusion
FreelanceXchain’s OAuth callback handling provides robust support for both PKCE and implicit flows:
- PKCE flow securely exchanges authorization codes for session tokens and returns either app tokens or registration-required status
- Implicit flow extracts tokens from URL fragments and forwards them to the backend for validation
- The system centralizes token validation and user synchronization via Supabase, returning standardized responses and error codes
- Security is strengthened by server-side exchanges and token verification before issuing app tokens

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Endpoint Reference
- GET /api/auth/oauth/:provider — Initiates OAuth with a provider and redirects to the provider login page
- GET /api/auth/callback — Handles PKCE flow; returns tokens or 202 registration required
- POST /api/auth/oauth/callback — Handles implicit flow; returns success, 202 registration required, or 401
- POST /api/auth/oauth/register — Completes OAuth registration by selecting role and creating a local user record

### Security Notes
- State validation: The current implementation does not validate state parameters in the callback. If you require state validation, add state parameter handling in getOAuthUrl and validate it in the callback route.
- Token verification: loginWithSupabase validates the Supabase access token before proceeding; ensure clients store tokens securely and rotate refresh tokens appropriately.
- Redirect URLs: getOAuthUrl constructs redirect URLs using PUBLIC_URL or localhost; ensure PUBLIC_URL is configured correctly for production.

---

# OAuth Provider Initiation

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
This document describes the OAuth provider initiation endpoint GET /api/auth/oauth/:provider in FreelanceXchain. It explains how the route validates the provider parameter, generates the OAuth URL via getOAuthUrl in auth-service.ts, and performs the redirection to the selected provider. It also covers redirect URL configuration, PKCE flow setup, state management for security, and how invalid provider requests are handled. Finally, it documents error responses for unsupported providers and server-side failures during URL generation.

## Project Structure
The OAuth initiation flow spans routing, service-layer logic, and configuration:

- Route handler: GET /api/auth/oauth/:provider
- Service function: getOAuthUrl(provider)
- Supabase client initialization
- Environment configuration for redirect URL and base URL
- OpenAPI/Swagger documentation

```mermaid
graph TB
Client["Client Browser"] --> Route["GET /api/auth/oauth/:provider<br/>in auth-routes.ts"]
Route --> Service["getOAuthUrl(provider)<br/>in auth-service.ts"]
Service --> Supabase["Supabase Auth Client<br/>in supabase.ts"]
Supabase --> Provider["OAuth Provider Login Page"]
Provider --> Callback["/api/auth/callback<br/>PKCE or implicit flow"]
```

## Core Components
- Route handler: Validates provider parameter and delegates to getOAuthUrl, then redirects to the generated URL. It returns 400 for invalid provider and 500 for internal errors.
- Service function: Builds the provider-specific Supabase OAuth URL, sets redirect URL and PKCE-related query parameters, and returns the URL.
- Supabase client: Provides the Supabase Auth client used to generate the OAuth URL.
- Environment configuration: Determines the redirect URL and base URL used in the OAuth flow.

Key behaviors:
- Supported providers: google, github, azure, linkedin
- Redirect URL: Uses PUBLIC_URL or falls back to http://localhost:<port>/api/auth/callback
- PKCE parameters: access_type=offline and prompt=consent are included
- No state parameter is explicitly set in getOAuthUrl; state management is handled by Supabase

## Architecture Overview
The OAuth initiation flow is a thin controller that delegates to a service function which uses the Supabase client to generate the provider URL. The browser is redirected to the provider’s OAuth page. After authentication, the provider redirects back to the configured callback endpoint.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler<br/>GET /api/auth/oauth/ : provider"
participant S as "Service<br/>getOAuthUrl()"
participant SB as "Supabase Client"
participant P as "OAuth Provider"
participant CB as "Callback Endpoint<br/>/api/auth/callback"
C->>R : "GET /api/auth/oauth/google"
R->>R : "Validate provider"
R->>S : "getOAuthUrl('google')"
S->>SB : "signInWithOAuth(options)"
SB-->>S : "OAuth URL"
S-->>R : "URL"
R-->>C : "302 Redirect to provider"
C->>P : "Login and consent"
P-->>CB : "Redirect with code or tokens"
CB-->>C : "App tokens or registration required"
```

## Detailed Component Analysis

### Route Handler: GET /api/auth/oauth/:provider
Responsibilities:
- Extracts provider from path parameters
- Validates provider against supported list
- Calls getOAuthUrl(provider)
- Redirects to the generated URL
- Returns 400 for invalid provider and 500 for internal errors

Security and validation:
- Provider validation prevents unsupported values
- No additional state parameter is set here; state is managed by Supabase

Error handling:
- 400: VALIDATION_ERROR with message “Invalid provider”
- 500: INTERNAL_ERROR with message “Failed to initiate OAuth flow”

Client-side initiation examples (conceptual):
- Google: GET /api/auth/oauth/google
- GitHub: GET /api/auth/oauth/github
- Azure: GET /api/auth/oauth/azure
- LinkedIn: GET /api/auth/oauth/linkedin

Notes:
- The route intentionally does not accept a role parameter at this stage; role selection occurs after callback.

### Service Function: getOAuthUrl(provider)
Responsibilities:
- Selects the correct provider identifier for Supabase (linkedin_oidc for LinkedIn)
- Determines redirect URL using PUBLIC_URL or falls back to configured base URL and port
- Calls Supabase signInWithOAuth with:
  - redirectTo set to the computed callback URL
  - skipBrowserRedirect set to true (client handles redirect)
  - queryParams: access_type=offline and prompt=consent for PKCE
- Returns the OAuth URL or throws on error

Security and PKCE:
- access_type=offline and prompt=consent enable offline access and re-consent prompts
- skipBrowserRedirect=true ensures the server returns the URL instead of performing automatic browser redirect
- No explicit state parameter is passed; Supabase manages state internally

Redirect URL resolution:
- Uses PUBLIC_URL environment variable if present
- Otherwise constructs http://localhost:<port>/api/auth/callback using config

### Supabase Client Initialization
- Ensures SUPABASE_URL and SUPABASE_ANON_KEY are configured
- Provides a singleton Supabase client instance used by getOAuthUrl

### OpenAPI/Swagger Documentation
- The route is documented with path parameter provider constrained to [google, github, azure, linkedin]
- Response is 302 redirect to provider

### PKCE Flow Setup and State Management
- PKCE parameters:
  - access_type=offline
  - prompt=consent
- State management:
  - The service does not explicitly pass a state parameter
  - Supabase handles state internally during signInWithOAuth

Note: The callback endpoint supports both PKCE (code in query) and implicit (tokens in URL fragment). The initiation endpoint focuses on generating the URL with PKCE parameters.

### Error Handling During URL Generation
- Validation failure: 400 with VALIDATION_ERROR
- Internal failure: 500 with INTERNAL_ERROR
- getOAuthUrl throws on Supabase error; the route catches and returns 500

## Dependency Analysis
The OAuth initiation endpoint depends on:
- Route handler for parameter validation and redirection
- Service function for URL generation and PKCE parameters
- Supabase client for OAuth integration
- Environment configuration for redirect URL and base URL

```mermaid
graph LR
Routes["auth-routes.ts"] --> Service["auth-service.ts"]
Service --> Supabase["supabase.ts"]
Service --> Env["env.ts"]
Routes --> Docs["API-DOCUMENTATION.md"]
```

## Performance Considerations
- The route is lightweight and delegates to a single service call; latency is dominated by network round-trips to Supabase and the OAuth provider.
- Using skipBrowserRedirect=true avoids unnecessary client-side redirects and lets the server return the URL promptly.
- Ensure PUBLIC_URL is configured correctly to minimize redirect hops and avoid mixed-content issues.

## Troubleshooting Guide
Common issues and resolutions:
- Unsupported provider:
  - Symptom: 400 VALIDATION_ERROR with message “Invalid provider”
  - Resolution: Use one of google, github, azure, linkedin
- Missing Supabase configuration:
  - Symptom: 500 INTERNAL_ERROR during URL generation
  - Resolution: Set SUPABASE_URL and SUPABASE_ANON_KEY
- Incorrect redirect URL:
  - Symptom: Redirect loops or callback failures
  - Resolution: Set PUBLIC_URL to your production origin or ensure local PORT is correct
- Provider-specific misconfiguration:
  - Symptom: Provider rejects the redirect URL or fails to return a code
  - Resolution: Verify provider OAuth app settings and allowed redirect URIs match PUBLIC_URL/api/auth/callback

## Conclusion
The GET /api/auth/oauth/:provider endpoint provides a secure and standardized way to initiate OAuth with supported providers. It validates inputs, generates a provider-specific URL with PKCE parameters, and redirects the client to the provider’s login page. Redirect URL configuration and environment variables are central to correctness. The service layer encapsulates Supabase integration, while the route enforces validation and error handling. For unsupported providers or server-side failures, the endpoint returns appropriate error responses.

---

# OAuth Registration Completion

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
This document provides comprehensive API documentation for the OAuth registration completion endpoint POST /api/auth/oauth/register in FreelanceXchain. The endpoint finalizes account creation for new OAuth users by assigning a role (freelancer or employer), optionally setting a full name, and validating an Ethereum wallet address format. It integrates with registerWithSupabase in auth-service.ts to validate the Supabase access token, synchronize user metadata in Supabase Auth, and create a corresponding user record in the public.users table. The document explains validation rules, response formats, error handling, and security considerations for token validation and role assignment.

## Project Structure
The OAuth registration flow spans route handlers, service logic, repository access, and Supabase integration. The following diagram shows the primary components involved in the POST /api/auth/oauth/register endpoint.

```mermaid
graph TB
Client["Client Application"] --> Routes["Auth Routes<br/>auth-routes.ts"]
Routes --> Service["Auth Service<br/>auth-service.ts"]
Service --> Repo["User Repository<br/>user-repository.ts"]
Service --> Supabase["Supabase Client<br/>supabase.ts"]
Repo --> DB["PostgreSQL Table<br/>public.users"]
Supabase --> Auth["Supabase Auth"]
```

## Core Components
- Route handler for POST /api/auth/oauth/register validates request fields and invokes registerWithSupabase.
- Service function registerWithSupabase validates the Supabase access token, checks for existing user records, updates Supabase user metadata, and creates a public.users record.
- Repository layer persists user data to the public.users table.
- Supabase client manages authentication and user metadata synchronization.

Key responsibilities:
- Validate accessToken presence and role selection.
- Validate optional name length and wallet address format.
- Authenticate and authorize via Supabase access token.
- Assign role (freelancer or employer) and optional profile metadata.
- Create user record in public.users and return AuthResult.

## Architecture Overview
The OAuth registration completion follows a layered architecture:
- Presentation: Express route validates input and delegates to service.
- Application: Service validates token, updates metadata, and creates user.
- Persistence: Repository writes to public.users.
- Integration: Supabase client synchronizes user metadata and sessions.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Auth Routes"
participant S as "Auth Service"
participant URepo as "User Repository"
participant Sup as "Supabase Client"
participant DB as "public.users"
C->>R : POST /api/auth/oauth/register {accessToken, role, name?, walletAddress?}
R->>R : Validate accessToken, role, name, walletAddress
R->>S : registerWithSupabase(accessToken, role, walletAddress, name)
S->>Sup : auth.getUser(accessToken)
Sup-->>S : {user} or error
S->>URepo : getUserByEmail(user.email)
alt user exists
S-->>R : AuthResult (existing user)
else user does not exist
S->>Sup : auth.updateUser({role, wallet_address, name})
S->>URepo : createUser({id, email, role, wallet_address, name})
URepo->>DB : INSERT INTO users
S-->>R : AuthResult (new user)
end
R-->>C : 201 AuthResult or 400/401/500
```

## Detailed Component Analysis

### Endpoint Definition: POST /api/auth/oauth/register
- Method: POST
- Path: /api/auth/oauth/register
- Purpose: Finalize OAuth user registration by assigning role and optional profile metadata.

Request body fields:
- accessToken: string, required. Supabase access token obtained from OAuth flow.
- role: string, required. Must be freelancer or employer.
- name: string, optional. Minimum 2 characters if provided.
- walletAddress: string, optional. Must match Ethereum address pattern 0x followed by 40 hexadecimal characters.

Response:
- 201 Created: AuthResult containing user id, email, role, walletAddress, createdAt, accessToken, refreshToken.
- 400 Bad Request: Validation error with details array indicating invalid fields.
- 401 Unauthorized: Invalid token or registration failure mapped to AUTH_INVALID_TOKEN.
- 500 Internal Server Error: Unexpected error during registration.

Security considerations:
- Access token must be validated via Supabase getUser before proceeding.
- Role must be one of the allowed values.
- Wallet address must conform to Ethereum address format.
- Name must meet minimum length requirement when present.

Validation logic highlights:
- accessToken presence and type checked.
- role restricted to freelancer or employer.
- name length enforced when provided.
- walletAddress format enforced using regex pattern.

Integration points:
- registerWithSupabase performs token validation and metadata update.
- User creation occurs in public.users via repository.
- Session refresh token is included in AuthResult.

### Service Layer: registerWithSupabase
Behavior:
- Validates access token by calling Supabase getUser.
- Checks if user already exists in public.users by email.
- Updates Supabase user metadata with role, wallet_address, and name.
- Creates a new user record in public.users with normalized email and provided attributes.
- Retrieves session refresh token and constructs AuthResult.

Error handling:
- Returns INVALID_TOKEN when token is invalid or user not found.
- Returns EXISTING_USER when user already exists (AuthResult).
- Propagates internal errors as AUTH_INVALID_TOKEN.

Data model mapping:
- UserEntity fields include id, email, role, wallet_address, name, created_at, updated_at.
- AuthResult includes user (id, email, role, walletAddress, createdAt) and tokens.

### Repository Layer: User Repository
Responsibilities:
- createUser inserts a new user into public.users with timestamps.
- getUserByEmail retrieves user by normalized email.
- getUserById retrieves user by id.
- emailExists checks for duplicate emails.

Database integration:
- Uses Supabase client to perform CRUD operations on the users table.
- Handles row-not-found errors gracefully.

### Supabase Integration
- getSupabaseClient initializes the Supabase client with configured URL and anon key.
- TABLES defines the users table constant used by the repository.
- registerWithSupabase uses Supabase auth.getUser to validate token and auth.updateUser to set metadata.

### Example Requests and Responses

- Successful registration request:
  - POST /api/auth/oauth/register
  - Body: { "accessToken": "<valid_supabase_access_token>", "role": "freelancer", "name": "John Doe", "walletAddress": "0x1234567890123456789012345678901234567890" }

- Minimal registration request:
  - POST /api/auth/oauth/register
  - Body: { "accessToken": "<valid_supabase_access_token>", "role": "employer" }

- Validation error response (invalid role):
  - Status: 400
  - Body: { "error": { "code": "VALIDATION_ERROR", "message": "Invalid request data", "details": [ { "field": "role", "message": "Valid role (freelancer or employer) is required" } ] }, "timestamp": "<iso_datetime>", "requestId": "<uuid>" }

- Invalid token response:
  - Status: 401
  - Body: { "error": { "code": "AUTH_INVALID_TOKEN", "message": "Registration failed" }, "timestamp": "<iso_datetime>", "requestId": "<uuid>" }

- Internal error response:
  - Status: 500
  - Body: { "error": { "code": "INTERNAL_ERROR", "message": "An unexpected error occurred during registration" }, "timestamp": "<iso_datetime>", "requestId": "<uuid>" }

Note: Replace placeholders with actual values. The AuthResult payload includes user and token fields as defined in the service types.

## Dependency Analysis
The endpoint depends on:
- Route handler for input validation and orchestration.
- Service function for token validation, metadata update, and user creation.
- Repository for persistence to public.users.
- Supabase client for authentication and metadata synchronization.

```mermaid
graph LR
Routes["auth-routes.ts"] --> Service["auth-service.ts"]
Service --> Repo["user-repository.ts"]
Service --> Supabase["supabase.ts"]
Repo --> DB["public.users"]
Service --> Types["auth-types.ts"]
Service --> Models["user.ts"]
Service --> Mapper["entity-mapper.ts"]
```

## Performance Considerations
- Token validation is performed synchronously via Supabase getUser; ensure low-latency network connectivity to Supabase.
- Public users table creation uses a short delay before querying; consider adjusting timing if triggers are slow.
- Repository operations are single-row queries; keep indexes on id and email for optimal performance.
- Avoid excessive retries on transient Supabase errors; implement exponential backoff if needed.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Invalid access token:
  - Symptom: 401 AUTH_INVALID_TOKEN.
  - Cause: Token expired or malformed.
  - Resolution: Obtain a fresh access token via OAuth flow and retry.

- Validation errors:
  - Symptom: 400 VALIDATION_ERROR with details array.
  - Causes: Missing accessToken, invalid role, invalid name length, or invalid wallet address format.
  - Resolution: Correct request payload according to validation rules.

- Duplicate user:
  - Symptom: 401 AUTH_INVALID_TOKEN indicating existing user.
  - Cause: User already exists in public.users.
  - Resolution: Log in with existing credentials or use a different OAuth account.

- Supabase metadata update failures:
  - Symptom: Registration proceeds but metadata not updated.
  - Resolution: Verify Supabase configuration and retry; check logs for error details.

- Internal server errors:
  - Symptom: 500 INTERNAL_ERROR.
  - Resolution: Inspect server logs and retry; confirm Supabase connectivity and database health.

## Conclusion
The POST /api/auth/oauth/register endpoint securely finalizes OAuth user registration by validating the access token, enforcing role and profile constraints, updating Supabase user metadata, and creating a public.users record. The service layer encapsulates Supabase integration and repository persistence, while the route layer enforces input validation and returns standardized responses. Following the documented validation rules and error handling ensures robust integration with the FreelanceXchain platform.

---

# Contract API

## Table of Contents
1. [Introduction](#introduction)
2. [API Endpoints](#api-endpoints)
3. [Contract Schema](#contract-schema)
4. [Contract Status Lifecycle](#contract-status-lifecycle)
5. [Relationships Between Contracts, Proposals, and Projects](#relationships-between-contracts-proposals-and-projects)
6. [Blockchain Escrow Integration](#blockchain-escrow-integration)
7. [Client Implementation Examples](#client-implementation-examples)
8. [Error Handling](#error-handling)

## Introduction
The Contract API provides read-only access to contract data within the FreelanceXchain system. Contracts are created when a proposal is accepted and represent formal agreements between freelancers and employers for project work. This API allows users to retrieve their contract history and view detailed contract information. All endpoints require JWT authentication and are designed to be read-only, with contract creation handled through the proposal acceptance workflow.

## API Endpoints

### List User Contracts
Retrieves all contracts for the authenticated user (as either freelancer or employer).

**HTTP Method**: GET  
**URL Pattern**: `/api/contracts`  
**Authentication**: JWT (Bearer token)  
**Parameters**:
- `limit` (integer, optional): Number of results per page (default: 20)
- `continuationToken` (string, optional): Token for pagination

**Response**:
```json
{
  "items": [
    {
      "id": "string",
      "projectId": "string",
      "proposalId": "string",
      "freelancerId": "string",
      "employerId": "string",
      "escrowAddress": "string",
      "totalAmount": number,
      "status": "active",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ],
  "hasMore": boolean,
  "continuationToken": "string"
}
```

**Status Codes**:
- 200: Contracts retrieved successfully
- 401: Unauthorized (missing or invalid JWT)

### Get Contract Details
Retrieves details of a specific contract.

**HTTP Method**: GET  
**URL Pattern**: `/api/contracts/{id}`  
**Authentication**: JWT (Bearer token)  
**Path Parameters**:
- `id` (string, required): Contract ID (UUID)

**Response**:
```json
{
  "id": "string",
  "projectId": "string",
  "proposalId": "string",
  "freelancerId": "string",
  "employerId": "string",
  "escrowAddress": "string",
  "totalAmount": number,
  "status": "active",
  "createdAt": "string",
  "updatedAt": "string"
}
```

**Status Codes**:
- 200: Contract retrieved successfully
- 400: Invalid UUID format
- 401: Unauthorized (missing or invalid JWT)
- 404: Contract not found

## Contract Schema
The contract object represents a formal agreement between a freelancer and employer for project work. Contracts are created when a proposal is accepted and contain references to the associated project, proposal, and parties involved.

```json
{
  "id": "string",
  "projectId": "string",
  "proposalId": "string",
  "freelancerId": "string",
  "employerId": "string",
  "escrowAddress": "string",
  "totalAmount": number,
  "status": "active",
  "createdAt": "string",
  "updatedAt": "string"
}
```

**Field Descriptions**:
- `id`: Unique identifier for the contract (UUID)
- `projectId`: Reference to the associated project
- `proposalId`: Reference to the accepted proposal that created this contract
- `freelancerId`: ID of the freelancer party
- `employerId`: ID of the employer party
- `escrowAddress`: Blockchain address of the escrow contract holding funds
- `totalAmount`: Total contract value in ETH
- `status`: Current status of the contract (active, completed, disputed, cancelled)
- `createdAt`: Timestamp when the contract was created
- `updatedAt`: Timestamp when the contract was last updated

## Contract Status Lifecycle
Contracts progress through a defined status lifecycle that governs their state transitions. The valid statuses are: `active`, `completed`, `disputed`, and `cancelled`.

```mermaid
stateDiagram-v2
[*] --> active
active --> completed : All milestones approved
active --> disputed : Milestone dispute initiated
active --> cancelled : Contract cancelled
disputed --> active : Dispute resolved, contract continues
disputed --> completed : Dispute resolved, work accepted
disputed --> cancelled : Dispute resolved, contract terminated
completed --> [*]
cancelled --> [*]
```

**State Transition Rules**:
- From `active`: Can transition to `completed`, `disputed`, or `cancelled`
- From `disputed`: Can transition to `active`, `completed`, or `cancelled`
- From `completed`: No further transitions allowed
- From `cancelled`: No further transitions allowed

## Relationships Between Contracts, Proposals, and Projects
Contracts are created through a workflow that begins with project creation, followed by proposal submission, and finalized by proposal acceptance. This creates a hierarchical relationship between these entities.

```mermaid
erDiagram
PROJECT {
uuid id PK
string title
string description
decimal budget
timestamp deadline
enum status
}
PROPOSAL {
uuid id PK
uuid projectId FK
uuid freelancerId FK
text coverLetter
decimal proposedRate
integer estimatedDuration
enum status
}
CONTRACT {
uuid id PK
uuid projectId FK
uuid proposalId FK
uuid freelancerId FK
uuid employerId FK
string escrowAddress
decimal totalAmount
enum status
}
PROJECT ||--o{ PROPOSAL : "has"
PROPOSAL }o--|| CONTRACT : "creates"
PROJECT ||--o{ CONTRACT : "has"
```

**Workflow**:
1. Employer creates a project
2. Freelancer submits a proposal for the project
3. Employer accepts the proposal
4. System automatically creates a contract linked to the project and accepted proposal
5. Contract status is set to `active` and escrow is established

## Blockchain Escrow Integration
Each contract is linked to a blockchain escrow address where funds are held securely. The escrow contract manages fund release according to milestone completion.

```mermaid
sequenceDiagram
participant Freelancer
participant FreelanceXchain
participant Blockchain
participant Employer
Employer->>FreelanceXchain : Accept Proposal
FreelanceXchain->>Blockchain : Deploy Escrow Contract
Blockchain-->>FreelanceXchain : Escrow Address
FreelanceXchain->>Employer : Request Funding
Employer->>Blockchain : Deposit Funds to Escrow
Blockchain-->>FreelanceXchain : Confirmation
FreelanceXchain->>Freelancer : Work on Milestones
Freelancer->>FreelanceXchain : Submit Milestone
FreelanceXchain->>Employer : Request Approval
Employer->>FreelanceXchain : Approve Milestone
FreelanceXchain->>Blockchain : Release Payment from Escrow
Blockchain-->>Freelancer : Funds Released
```

**Key Points**:
- Escrow address is stored in the contract's `escrowAddress` field
- Funds are deposited by the employer to the escrow address
- Payments are released to the freelancer upon milestone approval
- The escrow contract ensures funds are only released according to agreed terms

## Client Implementation Examples

### Retrieve User's Contract History
```javascript
// Example using fetch API
async function getUserContracts(limit = 20, continuationToken = null) {
  const url = new URL('/api/contracts', API_BASE_URL);
  if (limit) url.searchParams.append('limit', limit);
  if (continuationToken) url.searchParams.append('continuationToken', continuationToken);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

// Usage
const contractsData = await getUserContracts(10);
console.log('Contracts:', contractsData.items);
console.log('Has more:', contractsData.hasMore);
```

### Display Specific Contract Details
```javascript
// Example using async/await
async function getContractDetails(contractId) {
  const response = await fetch(`/api/contracts/${contractId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Contract not found');
    }
    throw new Error(`Failed to fetch contract: ${response.status}`);
  }

  return await response.json();
}

// Usage
try {
  const contract = await getContractDetails('a1b2c3d4-e5f6-7890-g1h2-i3j4k5l6m7n8');
  displayContract(contract);
} catch (error) {
  console.error('Error fetching contract:', error.message);
}
```

## Error Handling
The Contract API follows a consistent error response format for all endpoints.

**Error Response Format**:
```json
{
  "error": {
    "code": "string",
    "message": "string"
  },
  "timestamp": "string",
  "requestId": "string"
}
```

**Common Error Codes**:
- `AUTH_UNAUTHORIZED`: User not authenticated (401)
- `NOT_FOUND`: Contract not found (404)
- `INVALID_UUID_FORMAT`: Invalid UUID format (400)

All error responses include a timestamp and request ID for debugging purposes.

---

# Dispute API

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
This document provides comprehensive API documentation for the dispute resolution system in the FreelanceXchain platform. It covers all dispute-related endpoints: creating disputes, submitting evidence, resolving disputes, and retrieving dispute information. It also documents authentication requirements (JWT), validation rules, role-based access controls, the dispute status lifecycle, and blockchain recording of outcomes. Client implementation examples are included to help developers integrate dispute workflows.

## Project Structure
The dispute functionality spans routing, service orchestration, persistence, and blockchain integration layers. The routes define the HTTP endpoints and apply middleware for authentication and validation. The service layer enforces business rules, interacts with repositories, and triggers blockchain operations. The repository layer abstracts database access. The entity mapper converts between database entities and API models. The validation middleware ensures request payloads conform to schemas.

```mermaid
graph TB
Client["Client Application"] --> Routes["Dispute Routes<br/>src/routes/dispute-routes.ts"]
Routes --> AuthMW["Auth Middleware<br/>src/middleware/auth-middleware.ts"]
Routes --> ValidationMW["Validation Middleware<br/>src/middleware/validation-middleware.ts"]
Routes --> Service["Dispute Service<br/>src/services/dispute-service.ts"]
Service --> Repo["Dispute Repository<br/>src/repositories/dispute-repository.ts"]
Service --> Mapper["Entity Mapper<br/>src/utils/entity-mapper.ts"]
Service --> Registry["Dispute Registry (Blockchain)<br/>src/services/dispute-registry.ts"]
Repo --> DB["Supabase (via BaseRepository)"]
Registry --> Chain["Mock Blockchain Layer"]
```

## Core Components
- Dispute Routes: Define endpoints for creating disputes, retrieving dispute details, submitting evidence, resolving disputes, and listing disputes by contract.
- Dispute Service: Implements business logic for dispute creation, evidence submission, and resolution, including validations, status transitions, and blockchain interactions.
- Dispute Repository: Persists and retrieves dispute records, manages pagination, and enforces uniqueness constraints.
- Entity Mapper: Converts between database entities and API models for Disputes, Evidence, and DisputeResolution.
- Auth Middleware: Enforces JWT-based authentication and attaches user identity to requests.
- Validation Middleware: Provides robust request validation for UUIDs and payload schemas.
- Dispute Registry (Blockchain): Simulates on-chain recording of disputes, evidence updates, and resolutions.

## Architecture Overview
The dispute API follows a layered architecture:
- HTTP Layer: Routes define endpoints and apply middleware.
- Service Layer: Orchestrates business logic, repository interactions, and blockchain operations.
- Persistence Layer: Supabase-backed repository with typed entities.
- Presentation Layer: Entity mapper exposes API-friendly models.
- Security Layer: JWT authentication and role checks.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Routes"
participant A as "Auth Middleware"
participant V as "Validation Middleware"
participant S as "Dispute Service"
participant P as "Dispute Repository"
participant M as "Entity Mapper"
participant B as "Dispute Registry"
C->>R : "POST /api/disputes"
R->>A : "Authenticate JWT"
A-->>R : "Attach user info"
R->>V : "Validate request body"
V-->>R : "Validation OK"
R->>S : "createDispute(input)"
S->>P : "Persist dispute"
S->>B : "createDisputeOnBlockchain"
S->>M : "Map entity to model"
S-->>R : "Dispute model"
R-->>C : "201 Created"
```

## Detailed Component Analysis

### Endpoint Definitions and Schemas

#### Authentication
- All protected endpoints require a Bearer token in the Authorization header.
- Token format: Bearer <JWT>.
- Role checks:
  - Creating disputes: Contract party only.
  - Submitting evidence: Contract party only.
  - Resolving disputes: Admin only.

#### Create Dispute
- Method: POST
- URL: /api/disputes
- Authentication: JWT required
- Request body:
  - contractId: string (UUID)
  - milestoneId: string (UUID)
  - reason: string (non-empty)
- Response:
  - 201 Created with Dispute model
  - 400 Bad Request (validation errors)
  - 401 Unauthorized (missing/invalid token)
  - 403 Forbidden (not a contract party)
  - 404 Not Found (contract/milestone not found)
  - 409 Conflict (already disputed or duplicate dispute)
- Lifecycle:
  - Validates contract and milestone existence.
  - Ensures milestone is not already disputed or approved.
  - Prevents duplicate active disputes for the same milestone.
  - Sets initial status to open.
  - Updates milestone and contract statuses.
  - Records on blockchain and notifies both parties.

#### Retrieve Dispute Details
- Method: GET
- URL: /api/disputes/{disputeId}
- Path parameter: disputeId (UUID)
- Authentication: JWT required
- Response:
  - 200 OK with Dispute model
  - 400 Bad Request (invalid UUID)
  - 401 Unauthorized
  - 404 Not Found

#### Submit Evidence
- Method: POST
- URL: /api/disputes/{disputeId}/evidence
- Path parameter: disputeId (UUID)
- Authentication: JWT required
- Request body:
  - type: enum [text, file, link]
  - content: string (non-empty)
- Response:
  - 200 OK with updated Dispute model
  - 400 Bad Request (validation errors or resolved dispute)
  - 401 Unauthorized
  - 403 Forbidden (not a contract party)
  - 404 Not Found
- Lifecycle:
  - Validates dispute exists and is not resolved.
  - Verifies submitter is a contract party.
  - Adds evidence and transitions status to under_review if previously open.
  - Updates blockchain evidence hash.

#### Resolve Dispute (Admin)
- Method: POST
- URL: /api/disputes/{disputeId}/resolve
- Path parameter: disputeId (UUID)
- Authentication: JWT required, role=admin
- Request body:
  - decision: enum [freelancer_favor, employer_favor, split]
  - reasoning: string (non-empty)
- Response:
  - 200 OK with updated Dispute model
  - 400 Bad Request (validation errors or already resolved)
  - 401 Unauthorized
  - 403 Forbidden (not admin)
  - 404 Not Found
- Lifecycle:
  - Validates resolver role is admin.
  - Ensures dispute exists and is not already resolved.
  - Determines payment outcome based on decision:
    - freelancer_favor: release to freelancer, milestone approved.
    - employer_favor: refund to employer, milestone pending.
    - split: milestone approved (partial release handled separately).
  - Updates contract/project statuses.
  - Records resolution on blockchain and notifies both parties.

#### List Disputes by Contract
- Method: GET
- URL: /api/contracts/{contractId}/disputes
- Path parameter: contractId (UUID)
- Authentication: JWT required, contract party only
- Response:
  - 200 OK with array of Dispute models
  - 400 Bad Request (invalid UUID)
  - 401 Unauthorized
  - 403 Forbidden (not a contract party)
  - 404 Not Found

### Data Models and Schemas
- Dispute:
  - id: string (UUID)
  - contractId: string (UUID)
  - milestoneId: string (UUID)
  - initiatorId: string (UUID)
  - reason: string
  - evidence: array of Evidence
  - status: enum [open, under_review, resolved]
  - resolution: DisputeResolution or null
  - createdAt: string (date-time)
  - updatedAt: string (date-time)
- Evidence:
  - id: string (UUID)
  - submitterId: string (UUID)
  - type: enum [text, file, link]
  - content: string
  - submittedAt: string (date-time)
- DisputeResolution:
  - decision: enum [freelancer_favor, employer_favor, split]
  - reasoning: string
  - resolvedBy: string (UUID)
  - resolvedAt: string (date-time)

These models are mapped from repository entities and exposed via the API.

### Validation Rules
- UUID validation:
  - All UUID path parameters are validated using a dedicated middleware.
- Request body validation:
  - Create Dispute: contractId, milestoneId (UUID), reason (non-empty string).
  - Submit Evidence: type (enum), content (non-empty string).
  - Resolve Dispute: decision (enum), reasoning (non-empty string).
- Additional business validations:
  - Create Dispute: milestone must exist, not already disputed, not approved; no duplicate active dispute.
  - Submit Evidence: dispute must not be resolved; submitter must be a contract party.
  - Resolve Dispute: dispute must not be resolved; resolver must be admin.

### Dispute Status Lifecycle
- open: Initial state when a dispute is created.
- under_review: Automatically set when evidence is submitted to a previously open dispute; remains under_review if evidence is added later.
- resolved: Set when an admin resolves the dispute; cannot accept further evidence.

```mermaid
stateDiagram-v2
[*] --> open
open --> under_review : "Evidence submitted"
under_review --> under_review : "Additional evidence"
open --> resolved : "Admin resolution"
under_review --> resolved : "Admin resolution"
resolved --> [*]
```

### Role-Based Access Controls
- Any contract party (freelancer or employer) can:
  - Create disputes.
  - Submit evidence.
- Only administrators can:
  - Resolve disputes.

### Client Implementation Examples

#### Example: Create a Dispute
- Endpoint: POST /api/disputes
- Headers: Authorization: Bearer <JWT>
- Request body:
  - contractId: string (UUID)
  - milestoneId: string (UUID)
  - reason: string
- Expected response: 201 with Dispute model

#### Example: Submit Evidence
- Endpoint: POST /api/disputes/{disputeId}/evidence
- Path parameters: disputeId (UUID)
- Headers: Authorization: Bearer <JWT>
- Request body:
  - type: enum [text, file, link]
  - content: string
- Expected response: 200 with updated Dispute model

#### Example: Admin Resolve Dispute
- Endpoint: POST /api/disputes/{disputeId}/resolve
- Path parameters: disputeId (UUID)
- Headers: Authorization: Bearer <JWT>, role=admin
- Request body:
  - decision: enum [freelancer_favor, employer_favor, split]
  - reasoning: string
- Expected response: 200 with updated Dispute model

### Dispute Resolution Outcomes and Escrow Effects
- freelancer_favor:
  - Outcome recorded on blockchain.
  - Milestone status updated to approved.
  - Payment released to freelancer.
- employer_favor:
  - Outcome recorded on blockchain.
  - Milestone status updated to pending.
  - Payment refunded to employer.
- split:
  - Outcome recorded on blockchain.
  - Milestone status updated to approved.
  - Partial release handled separately.

## Dependency Analysis
The dispute module exhibits clear separation of concerns:
- Routes depend on auth and validation middleware and delegate to the service layer.
- Service depends on repository, mapper, and blockchain registry.
- Repository encapsulates database operations.
- Mapper centralizes model transformations.
- Blockchain registry simulates immutable records.

```mermaid
graph LR
Routes["dispute-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Valid["validation-middleware.ts"]
Routes --> Service["dispute-service.ts"]
Service --> Repo["dispute-repository.ts"]
Service --> Mapper["entity-mapper.ts"]
Service --> Registry["dispute-registry.ts"]
Repo --> DB["Supabase"]
Registry --> Chain["Blockchain Layer"]
```

## Performance Considerations
- Request validation occurs before service logic to fail fast and reduce unnecessary database calls.
- Pagination is supported for listing disputes by contract via repository methods.
- Blockchain operations are asynchronous and logged; failures do not block dispute resolution but are surfaced in logs.
- Status transitions minimize redundant writes by updating only necessary fields.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common error scenarios and resolutions:
- 400 Validation Error:
  - Ensure UUIDs are valid and request bodies match schemas.
  - Check enum values for type and decision.
- 401 Unauthorized:
  - Confirm Authorization header includes a valid Bearer token.
- 403 Forbidden:
  - Only contract parties can create disputes and submit evidence; only admins can resolve.
- 404 Not Found:
  - Verify contractId, milestoneId, or disputeId exist.
- Duplicate or Already Resolved:
  - Cannot create a dispute for an approved or already disputed milestone.
  - Cannot submit evidence or resolve a dispute already marked as resolved.

## Conclusion
The dispute API provides a secure, auditable, and extensible mechanism for managing disputes in the FreelanceXchain ecosystem. It enforces strict validation, role-based access, and a clear status lifecycle while integrating with blockchain for immutable records. Clients should implement robust error handling and adhere to the documented schemas and access controls.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Reference Summary

- Create Dispute
  - Method: POST
  - URL: /api/disputes
  - Auth: JWT, contract party
  - Body: contractId (UUID), milestoneId (UUID), reason (string)
  - Responses: 201, 400, 401, 403, 404, 409

- Get Dispute
  - Method: GET
  - URL: /api/disputes/{disputeId}
  - Auth: JWT
  - Path: disputeId (UUID)
  - Responses: 200, 400, 401, 404

- Submit Evidence
  - Method: POST
  - URL: /api/disputes/{disputeId}/evidence
  - Auth: JWT, contract party
  - Path: disputeId (UUID)
  - Body: type (enum), content (string)
  - Responses: 200, 400, 401, 403, 404

- Resolve Dispute (Admin)
  - Method: POST
  - URL: /api/disputes/{disputeId}/resolve
  - Auth: JWT, admin
  - Path: disputeId (UUID)
  - Body: decision (enum), reasoning (string)
  - Responses: 200, 400, 401, 403, 404

- List Disputes by Contract
  - Method: GET
  - URL: /api/contracts/{contractId}/disputes
  - Auth: JWT, contract party
  - Path: contractId (UUID)
  - Responses: 200, 400, 401, 403, 404

---

# Dispute Creation

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
This document describes the API for creating a dispute via POST /api/disputes. It covers the request schema, authentication and authorization, validation rules, response format, backend flow from route to service and blockchain integration, and common error scenarios. It also provides practical examples and client implementation guidance.

## Project Structure
The dispute creation endpoint is implemented in the routes layer and delegated to a service layer that orchestrates repository access, business validation, notifications, and blockchain recording.

```mermaid
graph TB
Client["Client"] --> Routes["Routes: POST /api/disputes"]
Routes --> Auth["Auth Middleware"]
Routes --> Validator["Validation Middleware"]
Routes --> Service["Dispute Service"]
Service --> Repo["Dispute Repository"]
Service --> Escrow["Escrow Contract Service"]
Service --> Registry["Dispute Registry (Blockchain)"]
Service --> Mapper["Entity Mapper"]
Service --> Notify["Notification Service"]
Service --> Contracts["Contract & Project Repositories"]
Service --> Users["User Repository"]
```

## Core Components
- Route handler enforces JWT authentication and validates request body fields.
- Service performs business validation (contract-party access, milestone existence, duplicate dispute checks) and updates domain state.
- Repository persists dispute records and related lookups.
- Blockchain registry records dispute lifecycle immutably.
- Entity mapper converts between internal entities and API models.

## Architecture Overview
The endpoint follows a layered architecture: route -> service -> repository/blockchain. The service ensures only a contract party can initiate a dispute, validates milestone eligibility, and records the dispute on-chain.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler"
participant A as "Auth Middleware"
participant V as "Validation Middleware"
participant S as "Dispute Service"
participant P as "Project Repository"
participant CR as "Contract Repository"
participant UR as "User Repository"
participant DR as "Dispute Repository"
participant BR as "Dispute Registry (Blockchain)"
participant N as "Notification Service"
C->>R : POST /api/disputes {contractId, milestoneId, reason}
R->>A : Validate Authorization
A-->>R : User validated
R->>V : Validate request body fields
V-->>R : Validated
R->>S : createDispute(input)
S->>CR : getContractById(contractId)
CR-->>S : Contract
S->>P : findProjectById(contract.projectId)
P-->>S : Project with milestones
S->>S : Validate milestone exists and not approved/disputed
S->>DR : getDisputeByMilestone(milestoneId)
DR-->>S : Existing dispute?
alt Duplicate dispute exists
S-->>R : Error 409 DUPLICATE_DISPUTE
else OK
S->>DR : createDispute(entity)
DR-->>S : Created
S->>UR : getUserById(initiatorId)
UR-->>S : Initiator
S->>BR : createDisputeOnBlockchain(...)
BR-->>S : Recorded
S->>P : Update milestone.status = disputed
S->>CR : Update contract.status = disputed
S->>N : notifyDisputeCreated(...)
S-->>R : 201 Dispute
end
```

## Detailed Component Analysis

### Endpoint Definition
- Method: POST
- Path: /api/disputes
- Authentication: Required (Bearer JWT)
- Role-based access: Any contract party (employer or freelancer) can initiate a dispute
- Request body fields:
  - contractId: string, required, UUID
  - milestoneId: string, required, UUID
  - reason: string, required, non-empty
- Response: 201 Created with the full Dispute object
- Common errors:
  - 400: Validation errors (missing/invalid fields)
  - 401: Unauthorized (missing/invalid JWT)
  - 403: Unauthorized (not a contract party)
  - 404: Contract or milestone not found
  - 409: Already disputed or duplicate active dispute for milestone

### Request Validation Rules
- contractId must be present and a valid UUID.
- milestoneId must be present and a valid UUID.
- reason must be present and a non-empty string.
- The route also applies a reusable UUID validator for path parameters in other endpoints.

### Authentication and Authorization
- Authentication: Route requires a valid Bearer JWT. The auth middleware extracts the token from the Authorization header and validates it.
- Authorization: The service verifies that the initiator is either the employer or freelancer on the contract. Other endpoints enforce role checks differently (e.g., admin-only resolution).

### Business Logic and Domain State
- Validates contract exists and loads project with milestones.
- Ensures milestone exists and is not already disputed or approved.
- Prevents duplicate active disputes for the same milestone.
- Creates a Dispute entity with status "open" and empty evidence array.
- Updates milestone status to "disputed" and contract status to "disputed".
- Sends notifications to both parties.

### Response Schema
The response is a Dispute object with:
- id: string
- contractId: string
- milestoneId: string
- initiatorId: string
- reason: string
- evidence: Evidence[]
- status: "open" | "under_review" | "resolved"
- resolution: DisputeResolution | null
- createdAt: string (ISO date-time)
- updatedAt: string (ISO date-time)

Evidence items include:
- id: string
- submitterId: string
- type: "text" | "file" | "link"
- content: string
- submittedAt: string (ISO date-time)

DisputeResolution includes:
- decision: "freelancer_favor" | "employer_favor" | "split"
- reasoning: string
- resolvedBy: string
- resolvedAt: string (ISO date-time)

### Backend Flow: Route to Service to Blockchain
- Route validates JWT and request body.
- Service:
  - Loads contract and project, validates milestone eligibility.
  - Checks for existing active dispute on milestone.
  - Persists dispute and updates statuses.
  - Calls blockchain registry to record dispute with wallets and amount.
  - Notifies both parties.
- Blockchain contract stores immutable records keyed by hashes.

```mermaid
flowchart TD
Start(["POST /api/disputes"]) --> Validate["Validate JWT and body fields"]
Validate --> LoadContract["Load contract and project"]
LoadContract --> CheckMilestone["Check milestone exists and status"]
CheckMilestone --> DuplicateCheck{"Duplicate active dispute?"}
DuplicateCheck --> |Yes| Return409["Return 409 DUPLICATE_DISPUTE"]
DuplicateCheck --> |No| Persist["Persist dispute and update statuses"]
Persist --> RecordBlock["Record on blockchain registry"]
RecordBlock --> Notify["Notify parties"]
Notify --> Return201["Return 201 Dispute"]
```

### Blockchain Integration with DisputeResolution Smart Contract
- On successful dispute creation, the service records a dispute on-chain using the Dispute Registry service, which simulates transactions and stores records in-memory.
- The Solidity contract DisputeResolution stores immutable records keyed by hashed identifiers and emits events for dispute creation, evidence updates, and resolution.
- The service also marks the agreement as disputed on-chain.

```mermaid
classDiagram
class DisputeService {
+createDispute(input)
}
class DisputeRegistry {
+createDisputeOnBlockchain(input)
+updateDisputeEvidence(disputeId, evidenceData, submitterWallet)
+resolveDisputeOnBlockchain(input)
}
class DisputeResolution {
+createDispute(...)
+updateEvidence(...)
+resolveDispute(...)
}
DisputeService --> DisputeRegistry : "calls"
DisputeRegistry --> DisputeResolution : "records on-chain"
```

### Practical Example: Milestone Delivery Issue
- Scenario: Employer initiates a dispute because the milestone deliverable was not received.
- Request payload:
  - contractId: "a1b2c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d6"
  - milestoneId: "f0e9d8c7-b6a5-f4e3-d2c1-b0a9f8e7d6c5"
  - reason: "Deliverable not received by due date"
- Expected response: 201 with a Dispute object having status "open" and empty evidence array.

### Common Errors
- 400 Validation errors:
  - Missing or invalid contractId (must be UUID).
  - Missing or invalid milestoneId (must be UUID).
  - Missing or empty reason (must be non-empty string).
- 401 Unauthorized:
  - Missing Authorization header or invalid/missing Bearer token.
- 403 Unauthorized:
  - Initiator is not a contract party (employer or freelancer).
- 404 Not Found:
  - Contract or milestone not found.
- 409 Conflict:
  - Milestone is already under dispute.
  - An active dispute already exists for the milestone.

## Dependency Analysis
The route depends on auth and validation middleware and delegates to the dispute service. The service depends on repositories, user and contract/project loaders, notification service, and blockchain registry.

```mermaid
graph LR
Routes["dispute-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Validator["validation-middleware.ts"]
Routes --> Service["dispute-service.ts"]
Service --> Repo["dispute-repository.ts"]
Service --> Contracts["contract-repository.ts"]
Service --> Projects["project-repository.ts"]
Service --> Users["user-repository.ts"]
Service --> Mapper["entity-mapper.ts"]
Service --> Registry["dispute-registry.ts"]
Service --> Notify["notification-service.ts"]
```

## Performance Considerations
- Validation is lightweight and occurs before any repository calls.
- Repository queries are simple and scoped to IDs.
- Blockchain operations are asynchronous and logged; failures do not block the primary flow.
- Notifications are sent after persistence and blockchain recording.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- If receiving 401 Unauthorized, ensure the Authorization header is present and formatted as "Bearer <token>".
- If receiving 403 Unauthorized, verify the user is either the employer or freelancer on the contract.
- If receiving 404 Not Found, confirm the contractId and milestoneId are valid and correspond to an existing contract and milestone.
- If receiving 409 Conflict, check that the milestone is not already disputed or has an active dispute.
- If blockchain recording fails, the service logs the error and still returns the created dispute; retry later or contact support.

## Conclusion
The dispute creation endpoint provides a secure, auditable way for any contract party to initiate a dispute. It enforces strict validation, prevents duplicates, updates domain state, and records immutable on-chain data. Clients should handle 400/401/403/404/409 responses appropriately and implement retry/backoff for transient blockchain errors.

## Appendices

### API Reference: POST /api/disputes
- Authentication: Bearer JWT
- Request body:
  - contractId: string (UUID)
  - milestoneId: string (UUID)
  - reason: string (non-empty)
- Responses:
  - 201: Dispute created
  - 400: Validation error
  - 401: Unauthorized
  - 403: Unauthorized (not a contract party)
  - 404: Contract or milestone not found
  - 409: Already disputed or duplicate active dispute

### Client Implementation Guidance
- Always attach a valid Bearer token in the Authorization header.
- Validate inputs server-side using the same rules (UUIDs, non-empty reason).
- Handle 409 Conflict by informing the user that a dispute already exists for the milestone.
- After creation, poll the dispute details endpoint to track status and evidence submissions.
- For error handling, implement exponential backoff for transient failures and display user-friendly messages.

[No sources needed since this section provides general guidance]

---

# Dispute Resolution

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
This document provides API documentation for the dispute resolution endpoint POST /api/disputes/{disputeId}/resolve. It explains who can use the endpoint, the request payload, state transitions, financial implications of each decision, integration with on-chain contracts, and error responses. It also includes guidance for audit trails and compliance logging.

## Project Structure
The dispute resolution feature spans the Express route layer, service layer, middleware, blockchain integration, and Solidity contracts:
- Route: enforces authentication and admin role checks, validates inputs, and delegates to the service.
- Service: orchestrates state updates, interacts with the escrow service, and records outcomes on-chain.
- Blockchain services: simulate transactions and persist records for auditability.
- On-chain contracts: DisputeResolution stores immutable outcomes; FreelanceEscrow executes fund transfers.

```mermaid
graph TB
Client["Client"]
Router["Express Router<br/>dispute-routes.ts"]
AuthMW["Auth Middleware<br/>auth-middleware.ts"]
ValMW["Validation Middleware<br/>validation-middleware.ts"]
Service["Dispute Service<br/>dispute-service.ts"]
EscrowSvc["Escrow Contract Service<br/>escrow-contract.ts"]
RegistrySvc["Dispute Registry Service<br/>dispute-registry.ts"]
EscrowSC["FreelanceEscrow.sol"]
DisputeSC["DisputeResolution.sol"]
Client --> Router
Router --> AuthMW
Router --> ValMW
Router --> Service
Service --> EscrowSvc
Service --> RegistrySvc
RegistrySvc --> DisputeSC
EscrowSvc --> EscrowSC
```

## Core Components
- Endpoint: POST /api/disputes/{disputeId}/resolve
- Authentication: Requires a valid Bearer token.
- Authorization: Only users with role admin can resolve disputes.
- Request body:
  - decision: one of freelancer_favor, employer_favor, split
  - reasoning: required text explanation
- Response: Returns the updated Dispute object with status resolved and resolution details.

Key behaviors:
- Admin role verification occurs in both route and service layers.
- Validates decision and reasoning presence and correctness.
- Updates dispute status to resolved and persists resolution metadata.
- Triggers on-chain recording of outcome and, where applicable, fund release/refund.

## Architecture Overview
The resolution flow integrates off-chain state updates with on-chain immutability and fund movement.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route : /disputes/ : id/resolve"
participant A as "Auth Middleware"
participant V as "Validation Middleware"
participant S as "Dispute Service"
participant E as "Escrow Contract Service"
participant D as "Dispute Registry Service"
participant SC1 as "DisputeResolution.sol"
participant SC2 as "FreelanceEscrow.sol"
C->>R : POST /api/disputes/{disputeId}/resolve
R->>A : Validate JWT
A-->>R : user.userId, user.role
R->>V : Validate decision and reasoning
V-->>R : OK or 400
R->>S : resolveDispute({disputeId, decision, reasoning, resolvedBy})
S->>S : Load dispute, verify not already resolved
alt decision == freelancer_favor
S->>E : releaseMilestone(escrowAddress, milestoneId, resolvedBy)
E-->>S : Transaction receipt
else decision == employer_favor
S->>E : refundMilestone(escrowAddress, milestoneId, resolvedBy)
E-->>S : Transaction receipt
else decision == split
S->>S : Mark milestone approved (partial release handled separately)
end
S->>D : resolveDisputeOnBlockchain({disputeId, outcome, reasoning, arbiterWallet})
D->>SC1 : resolveDispute(...)
SC1-->>D : Outcome recorded
D-->>S : Receipt
S-->>R : Updated Dispute
R-->>C : 200 OK
```

## Detailed Component Analysis

### Endpoint Definition and Behavior
- Path: POST /api/disputes/{disputeId}/resolve
- Security: Bearer token required.
- Role requirement: admin only.
- Request body:
  - decision: enum freelancer_favor, employer_favor, split
  - reasoning: string, required
- Response: Dispute with status resolved and resolution populated.

Behavior highlights:
- Admin role enforced in route and service.
- Decision validated and reasoning required.
- On-chain outcome recorded regardless of financial action.

### State Transition: Under Review to Resolved
- Evidence submission moves dispute from open to under_review.
- Resolution sets status to resolved and attaches resolution metadata.

```mermaid
stateDiagram-v2
[*] --> Open
Open --> UnderReview : "evidence submitted"
UnderReview --> Resolved : "admin resolves"
Resolved --> [*]
```

### Financial Implications by Decision
- freelancer_favor:
  - Releases milestone payment to freelancer via FreelanceEscrow.
  - Milestone status set to approved.
- employer_favor:
  - Refunds milestone payment to employer via FreelanceEscrow.
  - Milestone status set to pending.
- split:
  - Marks milestone as approved (partial release handled separately).
  - No automatic fund transfer in this endpoint; split outcome recorded on-chain.

```mermaid
flowchart TD
Start(["Admin selects decision"]) --> Choice{"Decision"}
Choice --> |freelancer_favor| Release["releaseMilestone -> FreelanceEscrow"]
Choice --> |employer_favor| Refund["refundMilestone -> FreelanceEscrow"]
Choice --> |split| Approve["Mark milestone approved (split)"]
Release --> Update["Update milestone status to approved"]
Refund --> Update2["Update milestone status to pending"]
Approve --> Update3["Update milestone status to approved"]
Update --> End(["Resolved"])
Update2 --> End
Update3 --> End
```

### On-Chain Recording and Fund Release
- Dispute outcome recorded immutably on DisputeResolution.sol.
- Arbitration decision stored with reasoning and arbiter wallet.
- Fund release/refund executed via FreelanceEscrow.sol methods invoked by the service.

```mermaid
sequenceDiagram
participant S as "Dispute Service"
participant D as "Dispute Registry Service"
participant SC as "DisputeResolution.sol"
participant E as "Escrow Contract Service"
participant ESC as "FreelanceEscrow.sol"
S->>D : resolveDisputeOnBlockchain({disputeId, outcome, reasoning, arbiterWallet})
D->>SC : resolveDispute(...)
SC-->>D : Outcome recorded
D-->>S : Receipt
alt decision == freelancer_favor
S->>E : releaseMilestone(...)
E->>ESC : resolveDispute(inFavorOfFreelancer=true)
else decision == employer_favor
S->>E : refundMilestone(...)
E->>ESC : resolveDispute(inFavorOfFreelancer=false)
end
```

### Example: Split Decision with Reasoning
- Scenario: Dispute resolved with split decision.
- Action: Mark milestone approved; partial release handled elsewhere.
- Reasoning: Include a detailed explanation in the reasoning field.

Note: The endpoint does not automatically split funds; it records the outcome and marks the milestone approved. Partial release logic is separate.

### Error Responses
Common HTTP statuses:
- 401 Unauthorized: Missing or invalid Bearer token.
- 403 Forbidden: Non-admin user attempts to resolve a dispute.
- 400 Bad Request: Invalid decision, missing reasoning, invalid UUID, or dispute already resolved.
- 404 Not Found: Dispute not found.

The route enforces admin role and validates inputs, while the service enforces uniqueness of roles and checks for already-resolved disputes.

### Audit Trails and Compliance Logging
- Off-chain:
  - DisputeService logs resolution actions and updates Dispute resolution metadata.
  - Notifications are sent to both parties upon resolution.
- On-chain:
  - DisputeResolution.sol emits DisputeResolved events with outcome, arbiter, and timestamp.
  - Escrow Contract Service records transaction receipts for fund releases/refunds.
- Recommendations:
  - Store timestamps, resolver identity, and reasoning in logs.
  - Maintain immutable chain of custody for evidence hashes and outcomes.
  - Ensure all sensitive fields are redacted or hashed in logs.

## Dependency Analysis
- Route depends on:
  - Auth middleware for JWT validation and role extraction.
  - Validation middleware for UUID and request body validation.
  - Dispute service for business logic.
- Service depends on:
  - Escrow contract service for fund release/refund.
  - Dispute registry service for on-chain outcome recording.
  - Repositories and mappers for data access and model conversion.
- Contracts depend on:
  - DisputeResolution.sol for immutable outcome storage.
  - FreelanceEscrow.sol for fund movement.

```mermaid
graph LR
Routes["dispute-routes.ts"] --> AuthMW["auth-middleware.ts"]
Routes --> ValMW["validation-middleware.ts"]
Routes --> Service["dispute-service.ts"]
Service --> EscrowSvc["escrow-contract.ts"]
Service --> RegistrySvc["dispute-registry.ts"]
RegistrySvc --> DisputeSC["DisputeResolution.sol"]
EscrowSvc --> EscrowSC["FreelanceEscrow.sol"]
```

## Performance Considerations
- Transaction latency: On-chain operations introduce network delays; batch or schedule notifications accordingly.
- Reentrancy protection: FreelanceEscrow.sol uses modifiers to prevent reentrancy during fund transfers.
- Validation overhead: Input validation is performed in middleware and service layers; keep schemas minimal and efficient.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- 401 Unauthorized:
  - Ensure Authorization header is present and formatted as Bearer <token>.
  - Verify token is not expired.
- 403 Forbidden:
  - Confirm the user has role admin.
- 400 Bad Request:
  - Check decision is one of freelancer_favor, employer_favor, split.
  - Ensure reasoning is present and non-empty.
  - Validate disputeId is a valid UUID.
  - If receiving 400 for “already resolved,” confirm dispute status.
- 404 Not Found:
  - Verify disputeId exists and belongs to a valid contract/milestone.

## Conclusion
The POST /api/disputes/{disputeId}/resolve endpoint enables admin-controlled dispute resolution with clear state transitions and financial implications. It integrates off-chain state updates with on-chain immutability and fund movements, ensuring transparent and auditable outcomes. Proper error handling and logging are essential for compliance and operational reliability.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Definition Summary
- Method: POST
- Path: /api/disputes/{disputeId}/resolve
- Path parameters:
  - disputeId: UUID
- Headers:
  - Authorization: Bearer <token>
- Request body:
  - decision: enum freelancer_favor, employer_favor, split
  - reasoning: string, required
- Responses:
  - 200 OK: Dispute object with status resolved
  - 400 Bad Request: Validation or already-resolved
  - 401 Unauthorized: Missing/invalid token
  - 403 Forbidden: Non-admin user
  - 404 Not Found: Dispute not found

---

# Dispute Retrieval

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
This document provides API documentation for dispute retrieval endpoints:
- GET /api/disputes/{disputeId}
- GET /api/contracts/{contractId}/disputes

It covers authentication requirements (JWT Bearer), access control (only involved parties and admins), request/response schemas, error handling, and the end-to-end data flow from route to service layer and database.

## Project Structure
The dispute retrieval functionality spans routing, middleware, service, repository, and data model layers.

```mermaid
graph TB
Client["Client"]
Router["Routes<br/>dispute-routes.ts"]
AuthMW["Auth Middleware<br/>auth-middleware.ts"]
ValMW["Validation Middleware<br/>validation-middleware.ts"]
Service["Dispute Service<br/>dispute-service.ts"]
Repo["Dispute Repository<br/>dispute-repository.ts"]
DB["Supabase DB<br/>schema.sql"]
Client --> Router
Router --> AuthMW
Router --> ValMW
Router --> Service
Service --> Repo
Repo --> DB
```

## Core Components
- Route handlers enforce JWT authentication and UUID parameter validation, then delegate to the service layer.
- Service layer enforces access control by verifying the user’s association with the contract and performs database queries.
- Repository layer encapsulates Supabase queries for dispute records.
- Swagger defines the JWT security scheme and response schemas for Dispute, Evidence, and DisputeResolution.

Key responsibilities:
- Authentication: Bearer JWT via Authorization header.
- Access control: Only parties involved in the contract (employer or freelancer) may view disputes.
- Data mapping: Entities are mapped to API models for consistent JSON responses.

## Architecture Overview
The retrieval flow follows a layered architecture: route -> middleware -> service -> repository -> database.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler<br/>GET /api/disputes/{disputeId}"
participant A as "Auth Middleware"
participant V as "UUID Validation"
participant S as "Dispute Service"
participant P as "Dispute Repository"
participant D as "Supabase DB"
C->>R : "GET /api/disputes/{disputeId}<br/>Authorization : Bearer <token>"
R->>A : "Validate JWT"
A-->>R : "User validated or error"
R->>V : "Validate path param disputeId as UUID"
V-->>R : "UUID OK or error"
R->>S : "getDisputeById(disputeId)"
S->>P : "findDisputeById(disputeId)"
P->>D : "SELECT * FROM disputes WHERE id = ?"
D-->>P : "DisputeEntity or null"
P-->>S : "DisputeEntity or null"
S-->>R : "{success : true, data : Dispute} or error"
R-->>C : "200 JSON or 404/400/401"
```

## Detailed Component Analysis

### Endpoint: GET /api/disputes/{disputeId}
- Authentication: Required. Bearer JWT in Authorization header.
- Path parameter:
  - disputeId: UUID string. Validated by UUID middleware.
- Access control:
  - No explicit role restriction in route; service enforces that the user is associated with the contract via the contract repository.
- Response:
  - 200 OK with Dispute object containing:
    - id, contractId, milestoneId, initiatorId, reason
    - evidence: array of Evidence objects
    - status: one of open, under_review, resolved
    - resolution: DisputeResolution object or null
    - createdAt, updatedAt
- Error responses:
  - 400 Bad Request: Invalid UUID format.
  - 401 Unauthorized: Missing/invalid/expired JWT.
  - 404 Not Found: Dispute not found.

Response schema (Swagger-defined):
- Dispute: id, contractId, milestoneId, initiatorId, reason, evidence[], status, resolution?, createdAt, updatedAt
- Evidence: id, submitterId, type, content, submittedAt
- DisputeResolution: decision, reasoning, resolvedBy, resolvedAt

### Endpoint: GET /api/contracts/{contractId}/disputes
- Authentication: Required. Bearer JWT.
- Path parameter:
  - contractId: UUID string. Validated by UUID middleware.
- Access control:
  - Only employer or freelancer associated with the contract may retrieve disputes.
- Response:
  - 200 OK with array of Dispute objects for the given contract.
- Error responses:
  - 400 Bad Request: Invalid UUID format.
  - 401 Unauthorized: Missing/invalid/expired JWT.
  - 403 Forbidden: User not associated with the contract.
  - 404 Not Found: Contract not found.

Pagination and filtering:
- Repository supports paginated queries with limit and offset, and ordering by created_at descending.
- Current route handler does not expose query parameters for pagination/filtering; consumers should implement client-side pagination or request server-side pagination parameters if needed.

### Data Flow and Database Queries
- Single dispute retrieval:
  - Route validates JWT and UUID.
  - Service calls repository to find dispute by ID.
  - Repository executes a SELECT query on the disputes table by id.
  - Service maps entity to API model and returns.
- Contract-level disputes:
  - Route validates JWT and UUID.
  - Service verifies contract existence and user association.
  - Service retrieves all disputes for the contract ordered by created_at desc.
  - Repository executes a SELECT with equality filter on contract_id and ordering.

```mermaid
flowchart TD
Start(["Route Entry"]) --> Auth["Validate JWT"]
Auth --> |Invalid| E401["401 Unauthorized"]
Auth --> |Valid| UUID["Validate UUID Param(s)"]
UUID --> |Invalid| E400["400 Bad Request"]
UUID --> |Valid| ServiceCall["Call Service Layer"]
ServiceCall --> RepoCall["Repository Query"]
RepoCall --> DBQuery["Supabase SELECT"]
DBQuery --> Result{"Found?"}
Result --> |No| E404["404 Not Found"]
Result --> |Yes| Map["Map Entity to Model"]
Map --> Ok["200 OK JSON"]
```

## Dependency Analysis
- Routes depend on:
  - Auth middleware for JWT validation.
  - Validation middleware for UUID parameter checks.
  - Dispute service for business logic.
- Service depends on:
  - Dispute repository for data access.
  - Contract repository to verify user association.
  - User repository to map wallets for blockchain recording.
- Repository depends on:
  - Supabase client configured in base repository.
  - Disputes table schema.

```mermaid
graph LR
Routes["dispute-routes.ts"] --> AuthMW["auth-middleware.ts"]
Routes --> ValMW["validation-middleware.ts"]
Routes --> Service["dispute-service.ts"]
Service --> Repo["dispute-repository.ts"]
Repo --> DB["schema.sql (disputes)"]
```

## Performance Considerations
- Indexing: The disputes table has an index on contract_id, which optimizes contract-level queries.
- Ordering: Results are ordered by created_at descending to show newest disputes first.
- Pagination: Repository supports limit/offset; current route handlers do not expose query parameters. Consider adding limit and offset query parameters to the contract-level endpoint for scalable retrieval.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized:
  - Missing Authorization header or invalid Bearer token format.
  - Token expired or invalid.
- 400 Bad Request:
  - Path parameter disputeId or contractId is not a valid UUID.
- 403 Forbidden:
  - Accessing contract-level disputes without being an employer or freelancer in that contract.
- 404 Not Found:
  - Dispute not found by ID.
  - Contract not found by ID.

Operational tips:
- Ensure Authorization header is present and formatted as "Bearer <token>".
- Confirm UUIDs are valid v4 UUIDs.
- Verify the user belongs to the contract for contract-level retrieval.

## Conclusion
The dispute retrieval endpoints are secured with JWT and enforce strict access control. The service layer ensures only parties involved in a contract can view its disputes. Responses conform to Swagger-defined schemas, and the repository layer efficiently queries the Supabase database with proper indexing and ordering.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Definitions

- GET /api/disputes/{disputeId}
  - Authentication: Bearer JWT
  - Path parameters:
    - disputeId: UUID
  - Responses:
    - 200: Dispute object
    - 400: Invalid UUID
    - 401: Unauthorized
    - 404: Dispute not found

- GET /api/contracts/{contractId}/disputes
  - Authentication: Bearer JWT
  - Path parameters:
    - contractId: UUID
  - Responses:
    - 200: Array of Dispute objects
    - 400: Invalid UUID
    - 401: Unauthorized
    - 403: Not authorized to view disputes
    - 404: Contract not found

### Response Schemas

- Dispute
  - Fields: id, contractId, milestoneId, initiatorId, reason, evidence[], status, resolution?, createdAt, updatedAt
- Evidence
  - Fields: id, submitterId, type, content, submittedAt
- DisputeResolution
  - Fields: decision, reasoning, resolvedBy, resolvedAt

### Example Requests and Expected Outcomes

- Retrieve a specific dispute:
  - Request: GET /api/disputes/{valid-dispute-id} with Authorization: Bearer <token>
  - Outcome: 200 OK with Dispute JSON

- List all disputes for a contract:
  - Request: GET /api/contracts/{valid-contract-id}/disputes with Authorization: Bearer <token>
  - Outcome: 200 OK with array of Dispute JSON

- Unauthorized access:
  - Request: GET /api/contracts/{contract-id}/disputes without valid JWT
  - Outcome: 401 Unauthorized

- Non-existent dispute:
  - Request: GET /api/disputes/{nonexistent-id} with valid JWT
  - Outcome: 404 Not Found

- Invalid UUID:
  - Request: GET /api/disputes/invalid-id with valid JWT
  - Outcome: 400 Bad Request

---

# Evidence Submission

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
This document describes the API for submitting evidence to an active dispute. It covers the endpoint path, authentication, request schema, validation rules, error responses, and the integration with the blockchain-based evidence logging contract. It also provides examples for each evidence type and client-side implementation tips.

## Project Structure
The evidence submission endpoint is implemented as a REST POST route that is secured with JWT authentication, validated by request and parameter schemas, and processed by a service layer that persists the evidence and updates the blockchain log.

```mermaid
graph TB
Client["Client"] --> Route["POST /api/disputes/{disputeId}/evidence<br/>Route handler"]
Route --> Auth["JWT Auth Middleware"]
Route --> Validator["Validation Middleware"]
Route --> Service["Dispute Service.submitEvidence()"]
Service --> Repo["Dispute Repository"]
Service --> Registry["Dispute Registry (Blockchain)"]
Registry --> Contract["DisputeResolution.sol"]
Repo --> DB["Supabase"]
Contract --> Chain["Ethereum-like Chain"]
```

## Core Components
- Endpoint: POST /api/disputes/{disputeId}/evidence
- Path parameter: disputeId (UUID)
- Authentication: Bearer JWT via auth middleware
- Request body schema:
  - type: string, enum [text, file, link]
  - content: string (required)
- Validation:
  - type must be one of the allowed values
  - content must be a non-empty string
  - disputeId must be a valid UUID
- Authorization:
  - Only parties to the underlying contract (employer or freelancer) may submit evidence while the dispute is open or under_review
- Response:
  - Updated Dispute object with appended evidence
- Blockchain integration:
  - Evidence hash is recorded on-chain via DisputeResolution contract

## Architecture Overview
The request flow for evidence submission:

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler"
participant A as "Auth Middleware"
participant V as "Validation Middleware"
participant S as "Dispute Service"
participant D as "Dispute Repository"
participant B as "Dispute Registry"
participant X as "DisputeResolution.sol"
C->>R : POST /api/disputes/{disputeId}/evidence
R->>A : Validate JWT
A-->>R : Authorized user
R->>V : Validate request body and path params
V-->>R : Valid
R->>S : submitEvidence({disputeId, submitterId, type, content})
S->>D : Load dispute and verify status
D-->>S : Dispute entity
S->>S : Append evidence and set status to under_review if needed
S->>D : Persist updated dispute
S->>B : updateDisputeEvidence(disputeId, evidenceData, submitterWallet)
B->>X : updateEvidence(disputeIdHash, evidenceHash)
X-->>B : Confirmed
B-->>S : Receipt
S-->>R : Updated Dispute with appended evidence
R-->>C : 200 OK with Dispute
```

## Detailed Component Analysis

### Endpoint Definition
- Method: POST
- Path: /api/disputes/{disputeId}/evidence
- Security: bearerAuth (JWT required)
- Path parameters:
  - disputeId: string, format uuid
- Request body:
  - type: string, enum [text, file, link]
  - content: string (non-empty)
- Responses:
  - 200 OK: Dispute object with appended evidence
  - 400 Bad Request: Validation errors or invalid status
  - 401 Unauthorized: Missing/invalid/expired JWT
  - 403 Forbidden: Not authorized to submit evidence
  - 404 Not Found: Dispute not found

### Authentication and Authorization
- Authentication: Route uses auth middleware to validate JWT and attach user info to the request.
- Authorization: Service verifies that the submitter is either the employer or freelancer in the contract associated with the dispute.

### Request Validation
- Body schema enforces:
  - type must be one of [text, file, link]
  - content must be a non-empty string
- Path parameter schema enforces:
  - disputeId must be a valid UUID

### Evidence Submission Logic
- Load dispute by ID
- Reject if dispute status is resolved
- Verify submitter is a party to the contract
- Create evidence entity with generated ID, submitterId, type, content, and timestamp
- Append evidence to dispute and set status to under_review if currently open
- Persist updated dispute
- Compute evidenceData JSON and update blockchain evidence hash

```mermaid
flowchart TD
Start(["submitEvidence"]) --> Load["Load dispute by ID"]
Load --> Found{"Dispute found?"}
Found --> |No| NotFound["Return NOT_FOUND"]
Found --> |Yes| StatusCheck["Check status != resolved"]
StatusCheck --> |Resolved| InvalidStatus["Return INVALID_STATUS"]
StatusCheck --> |Open/Under Review| PartyCheck["Verify submitter is employer or freelancer"]
PartyCheck --> |Unauthorized| Unauth["Return UNAUTHORIZED"]
PartyCheck --> |Authorized| Build["Build evidence entity"]
Build --> Append["Append to dispute evidence"]
Append --> StatusUpdate{"Was status open?"}
StatusUpdate --> |Yes| SetReview["Set status under_review"]
StatusUpdate --> |No| Keep["Keep current status"]
SetReview --> Persist["Persist updated dispute"]
Keep --> Persist
Persist --> Hash["Compute evidenceData JSON and hash"]
Hash --> Block["updateDisputeEvidence on blockchain"]
Block --> Done(["Return updated Dispute"])
```

### Blockchain Integration
- Backend computes a JSON string of the updated evidence array and hashes it.
- Calls updateDisputeEvidence with the disputeId, evidenceData hash, and submitter’s wallet address.
- The DisputeResolution.sol contract stores the evidenceHash for the given disputeIdHash.
- The registry simulates transaction submission and confirmation; in production, this would interact with a real Ethereum-like chain.

```mermaid
sequenceDiagram
participant S as "Dispute Service"
participant R as "Dispute Registry"
participant C as "DisputeResolution.sol"
S->>R : updateDisputeEvidence(disputeId, evidenceData, submitterWallet)
R->>R : compute evidenceData JSON and hash
R->>C : updateEvidence(disputeIdHash, evidenceHash)
C-->>R : Confirmed
R-->>S : Receipt
```

### Data Model and Response
- Evidence entity fields:
  - id: string
  - submitterId: string
  - type: "text" | "file" | "link"
  - content: string
  - submittedAt: ISO date-time string
- Dispute model includes:
  - evidence: Evidence[]
  - status: "open" | "under_review" | "resolved"
- Response returns the updated Dispute with the newly appended evidence.

## Dependency Analysis
- Route depends on:
  - auth-middleware for JWT validation
  - validation-middleware for request and path parameter validation
  - dispute-service for business logic
- Service depends on:
  - dispute-repository for persistence
  - dispute-registry for blockchain updates
  - entity-mapper for model conversion
- Registry depends on:
  - blockchain-client for transaction submission and confirmation
  - DisputeResolution.sol for on-chain operations

```mermaid
graph LR
Routes["dispute-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Val["validation-middleware.ts"]
Routes --> Service["dispute-service.ts"]
Service --> Repo["dispute-repository.ts"]
Service --> Registry["dispute-registry.ts"]
Registry --> Client["blockchain-client.ts"]
Registry --> Contract["DisputeResolution.sol"]
```

## Performance Considerations
- Evidence submission is lightweight: JSON serialization of evidence array and hashing are fast.
- Blockchain operations are asynchronous and simulated in this codebase; in production, latency depends on network confirmation times.
- Consider batching evidence submissions if clients need to upload multiple pieces of evidence.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common error scenarios and their causes:
- 400 Bad Request
  - Invalid type or missing content
  - Invalid UUID format for disputeId
  - Attempting to submit evidence to a resolved dispute
- 401 Unauthorized
  - Missing Authorization header or invalid/expired JWT
- 403 Forbidden
  - User is not a party to the contract associated with the dispute
- 404 Not Found
  - Dispute not found

## Conclusion
The evidence submission endpoint securely accepts text, file, or link-based evidence from authorized parties during open or under_review disputes. It persists the evidence locally and records an immutable evidence hash on-chain for transparency. Clients should ensure proper JWT usage, validate inputs, and handle asynchronous blockchain confirmations.

---

# KYC Verification API

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
This document provides comprehensive API documentation for the KYC verification system in the FreelanceXchain platform. It covers all KYC endpoints for submitting international identity and address information, managing verification documents, creating and completing liveness sessions, verifying face match, retrieving KYC status, and administrative review workflows. It also explains the KYC status lifecycle, required fields for international KYC, privacy considerations, and integration with the on-chain KYC verification smart contract.

## Project Structure
The KYC API is implemented as Express routes backed by service-layer logic, repository persistence, and blockchain integration. Swagger schemas define request/response structures. Authentication is enforced via a JWT Bearer token middleware.

```mermaid
graph TB
Client["Client Application"] --> Routes["KYC Routes<br/>src/routes/kyc-routes.ts"]
Routes --> Auth["Auth Middleware<br/>src/middleware/auth-middleware.ts"]
Routes --> Service["KYC Service<br/>src/services/kyc-service.ts"]
Service --> Repo["KYC Repository<br/>src/repositories/kyc-repository.ts"]
Service --> ContractSvc["Blockchain KYC Service<br/>src/services/kyc-contract.ts"]
ContractSvc --> Contract["KYCVerification.sol"]
```

## Core Components
- Routes: Define endpoints, request/response schemas, and security requirements.
- Service: Orchestrates validation, business rules, repository updates, and blockchain submissions.
- Repository: Persists KYC records to Supabase and maps entities to models.
- Models: Strongly typed request/response schemas and enums.
- Blockchain Service: Submits KYC to the smart contract and manages approvals/rejections.
- Smart Contract: Stores on-chain verification status and metadata.

## Architecture Overview
The KYC API follows a layered architecture:
- Presentation Layer: Express routes expose REST endpoints.
- Application Layer: Services encapsulate business logic and integrate with repositories and blockchain.
- Persistence Layer: Repository maps models to Supabase entities and performs CRUD.
- Integration Layer: Blockchain service interacts with the KYC smart contract.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "KYC Routes"
participant S as "KYC Service"
participant DB as "KYC Repository"
participant BC as "Blockchain KYC Service"
participant SC as "KYCVerification.sol"
C->>R : POST /api/kyc/submit (JWT)
R->>S : submitKyc(userId, input)
S->>DB : create/update KYC
S->>BC : submitKycToBlockchain(...)
BC->>SC : submitVerification(...)
SC-->>BC : emitted events
BC-->>S : receipt
S-->>R : KYCVerification
R-->>C : 201 Created
```

## Detailed Component Analysis

### Authentication and Security
- All protected KYC endpoints require a Bearer token in the Authorization header.
- The auth middleware validates the token and attaches user info to the request.
- Administrative endpoints additionally require the admin role.

### KYC Status Lifecycle
- pending: Initial state when a user registers or initiates KYC.
- submitted: After successful submission of personal and document information.
- under_review: Admin review phase (managed by admin endpoints).
- approved: Verified and approved; may have expiration.
- rejected: Verification denied with a rejection reason/code.

```mermaid
stateDiagram-v2
[*] --> pending
pending --> submitted : "submitKyc()"
submitted --> under_review : "admin review"
under_review --> approved : "approve"
under_review --> rejected : "reject"
approved --> pending : "re-submission"
```

### International KYC Requirements
- Address: addressLine1, city, country, countryCode are required.
- Document: type, documentNumber, issuingCountry, frontImageUrl are required; backImageUrl is optional.
- Selfie: selfieImageUrl is optional but recommended for face match.
- Tier: basic, standard, enhanced; defaults to country tier if not provided.

### Endpoint Reference

#### GET /api/kyc/countries
- Purpose: Retrieve supported countries and their KYC requirements.
- Response: Array of SupportedCountry entries.

#### GET /api/kyc/countries/{countryCode}
- Purpose: Retrieve KYC requirements for a specific country.
- Path Parameters: countryCode (ISO 3166-1 alpha-2).
- Response: SupportedCountry.

#### GET /api/kyc/status
- Purpose: Retrieve current user’s KYC status.
- Response: KycVerification.

#### POST /api/kyc/submit
- Purpose: Submit international KYC with personal info and identity documents.
- Request Body: KycSubmissionInput.
- Responses:
  - 201: KYC created/submitted.
  - 400: Validation error.
  - 409: KYC already pending or approved.

#### POST /api/kyc/liveness/session
- Purpose: Create a liveness verification session with randomized challenges.
- Request Body: LivenessSessionInput (optional challenges).
- Response: LivenessCheck.

#### GET /api/kyc/liveness/session
- Purpose: Retrieve current liveness session.
- Response: LivenessCheck or 404 if none.

#### POST /api/kyc/liveness/verify
- Purpose: Submit captured frames and challenge results to finalize liveness.
- Request Body: LivenessVerificationInput (sessionId, capturedFrames, challengeResults).
- Response: LivenessCheck.

#### POST /api/kyc/face-match
- Purpose: Verify face match between selfie and document.
- Request Body: FaceMatchInput (selfieImageUrl, documentImageUrl).
- Response: { matched: boolean, score: number }.

#### POST /api/kyc/documents
- Purpose: Add an additional document to an existing KYC.
- Request Body: KycDocument.
- Response: Updated KycVerification.

#### GET /api/kyc/admin/pending
- Purpose: Get pending KYC reviews (Admin only).
- Response: Array of KycVerification.

#### GET /api/kyc/admin/status/{status}
- Purpose: Get KYC verifications by status (Admin only).
- Path Parameters: status (pending, submitted, under_review, approved, rejected).
- Response: Array of KycVerification.

#### POST /api/kyc/admin/review/{kycId}
- Purpose: Approve or reject a KYC verification with AML screening results.
- Path Parameters: kycId (UUID).
- Request Body: KycReviewInput (status, rejectionReason, rejectionCode, riskLevel, riskScore, amlScreeningStatus, amlScreeningNotes).
- Response: Updated KycVerification.

### Request/Response Schemas

#### InternationalAddress
- Required fields: addressLine1, city, country, countryCode.

#### KycDocument
- Required fields: type, documentNumber, issuingCountry, frontImageUrl.
- Optional fields: backImageUrl, issuingAuthority, issueDate, expiryDate.

#### LivenessChallenge
- Enumerations: blink, smile, turn_left, turn_right, nod, open_mouth.
- Fields: type, completed, timestamp.

#### LivenessCheck
- Fields: id, sessionId, status (pending, passed, failed, expired), confidenceScore, challenges, capturedFrames, completedAt, expiresAt, createdAt.

#### KycSubmissionInput
- Required fields: firstName, lastName, dateOfBirth, nationality, address, document.
- Optional fields: middleName, placeOfBirth, secondaryNationality, taxResidenceCountry, taxIdentificationNumber, selfieImageUrl, tier.

#### KycVerification
- Fields: id, userId, status, tier, personal info, address, documents, livenessCheck, faceMatchScore, faceMatchStatus, selfieImageUrl, amlScreeningStatus, riskLevel, riskScore, timestamps.

#### SupportedCountry
- Fields: code, name, supportedDocuments, requiresLiveness, requiresAddressProof, tier.

### Client Implementation Examples

#### Example: Submitting Personal Information and Identity Documents
- Steps:
  - Authenticate and obtain a JWT.
  - Call POST /api/kyc/submit with a payload containing personal info, address, and document details.
  - Handle 201 on success, 400 for validation errors, 409 if KYC already pending/approved.

#### Example: Creating a Liveness Session and Completing Challenges
- Steps:
  - Call POST /api/kyc/liveness/session to create a session with optional challenges.
  - Poll or retrieve the session via GET /api/kyc/liveness/session.
  - Complete challenges and call POST /api/kyc/liveness/verify with captured frames and challenge results.
  - Handle 200 with updated LivenessCheck.

#### Example: Verifying Face Match
- Steps:
  - Call POST /api/kyc/face-match with selfieImageUrl and documentImageUrl.
  - Receive matched boolean and score; update local KYC accordingly.

#### Example: Retrieving KYC Status
- Steps:
  - Call GET /api/kyc/status with Authorization: Bearer <token>.
  - Receive KycVerification or 404 if not found.

### Administrative Workflows
- Retrieve pending reviews: GET /api/kyc/admin/pending.
- Filter by status: GET /api/kyc/admin/status/{status}.
- Review and approve/reject: POST /api/kyc/admin/review/{kycId} with KycReviewInput.

## Dependency Analysis

```mermaid
classDiagram
class KycRoutes {
+GET /api/kyc/countries
+GET /api/kyc/countries/ : countryCode
+GET /api/kyc/status
+POST /api/kyc/submit
+POST /api/kyc/liveness/session
+GET /api/kyc/liveness/session
+POST /api/kyc/liveness/verify
+POST /api/kyc/face-match
+POST /api/kyc/documents
+GET /api/kyc/admin/pending
+GET /api/kyc/admin/status/ : status
+POST /api/kyc/admin/review/ : kycId
}
class KycService {
+getSupportedCountries()
+getCountryRequirements()
+getKycStatus()
+submitKyc()
+createLivenessSession()
+verifyLiveness()
+verifyFaceMatch()
+addDocument()
+getPendingKycReviews()
+getAllKycByStatus()
+reviewKyc()
}
class KycRepository {
+createKyc()
+getKycById()
+getKycByUserId()
+updateKyc()
+getKycByStatus()
+getPendingReviews()
}
class KycContractService {
+submitKycToBlockchain()
+approveKycOnBlockchain()
+rejectKycOnBlockchain()
+isWalletVerified()
+getKycFromBlockchain()
}
class KYCVerificationContract {
+submitVerification()
+approveVerification()
+rejectVerification()
+expireVerification()
+isVerified()
+getVerification()
}
KycRoutes --> KycService : "calls"
KycService --> KycRepository : "persists"
KycService --> KycContractService : "on-chain ops"
KycContractService --> KYCVerificationContract : "interacts"
```

## Performance Considerations
- Liveness verification simulates confidence scoring; in production, use a dedicated ML model to compute scores efficiently.
- Face match uses simulated scoring; integrate a robust face recognition API for accuracy and latency.
- Batch administrative queries (pending and status filters) are paginated; tune limits for optimal response times.
- On-chain operations are asynchronous; use transaction polling or callbacks to avoid blocking requests.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Unauthorized: Ensure Authorization header includes a valid Bearer token.
- Invalid token: Token missing, malformed, or expired; re-authenticate.
- KYC not found: User has no KYC record; submit KYC first.
- Session expired: Liveness session timed out; recreate a new session.
- Validation errors: Missing required fields in submission or document upload; refer to schema requirements.
- KYC already pending/approved: Cannot resubmit until resolution; wait for admin review or re-submission window.

## Conclusion
The KYC API provides a comprehensive, secure, and extensible framework for international identity verification. It enforces strict validation, supports liveness checks, integrates with on-chain verification, and offers administrative controls. Clients should implement robust error handling, respect privacy constraints, and leverage the provided endpoints to deliver a seamless user experience.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Privacy Considerations
- Off-chain: Store only hashed identifiers and minimal data; keep personal details behind access-controlled APIs.
- On-chain: The smart contract stores status, tier, and dataHash, not personal data, aligning with privacy regulations.
- Face match and document images: Handle securely; avoid storing raw images on server; use signed URLs and short-lived access tokens.

### Integration with Third-Party Identity Verification Services
- The current implementation simulates liveness and face matching; integrate with external services by replacing the simulation logic in the service layer.
- Ensure compliance with GDPR and local privacy laws; use hashing and encryption for sensitive data.

---

# Face Match Verification API

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
This document describes the POST /api/kyc/face-match endpoint used to compare a user’s selfie with their identity document photo. It specifies the HTTP method, URL pattern, request body schema, authentication requirements, response schema, and the underlying confidence scoring and matching logic. It also provides guidance on image quality requirements and outlines privacy considerations for processing biometric data.

## Project Structure
The face match verification endpoint is implemented as part of the KYC module:
- Route handler: defines the endpoint, authentication, and request validation
- Service: performs the matching logic and updates KYC state
- Model: defines the request/response shapes and thresholds
- Repository: persists KYC updates to the database
- Swagger/OpenAPI: documents the endpoint and security scheme
- Test script: demonstrates usage in a real flow

```mermaid
graph TB
Client["Client"] --> Route["Route: POST /api/kyc/face-match"]
Route --> Auth["Auth Middleware"]
Route --> Service["Service: verifyFaceMatch()"]
Service --> Repo["Repository: kycRepository.updateKyc()"]
Repo --> DB["Database"]
Service --> Model["Model: FaceMatchInput, KycVerification"]
Swagger["Swagger Config"] --> Docs["OpenAPI Docs"]
```

## Core Components
- Endpoint: POST /api/kyc/face-match
- Authentication: Bearer JWT via Authorization header
- Request body: selfieImageUrl and documentImageUrl
- Response: matched (boolean) and score (number)
- Threshold: matched is true when score >= 0.80

Implementation highlights:
- Route enforces JWT and validates presence of selfieImageUrl and documentImageUrl
- Service simulates face matching and sets faceMatchStatus and faceMatchScore
- Repository persists updates to the KYC record

## Architecture Overview
The endpoint follows a layered architecture:
- Presentation layer: Express route
- Application layer: Service orchestrating business logic
- Persistence layer: Repository mapping to database
- Data model: Strong typing for inputs and outputs

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler"
participant S as "Service"
participant P as "Repository"
participant D as "Database"
C->>R : POST /api/kyc/face-match {selfieImageUrl, documentImageUrl}
R->>R : Auth middleware (Bearer JWT)
R->>S : verifyFaceMatch(userId, input)
S->>P : updateKyc(id, userId, updates)
P->>D : persist faceMatchScore, faceMatchStatus
S-->>R : {matched, score}
R-->>C : 200 OK {matched, score}
```

## Detailed Component Analysis

### Endpoint Definition
- Method: POST
- URL: /api/kyc/face-match
- Authentication: Bearer JWT (Authorization: Bearer <token>)
- Request body schema:
  - selfieImageUrl: string (required)
  - documentImageUrl: string (required)
- Response schema:
  - matched: boolean
  - score: number

Behavior:
- On success: returns 200 OK with matched and score
- On validation failure: returns 400 with error details
- On unauthorized: returns 401

### Matching Logic and Confidence Scoring
- Threshold: matched = true if score >= 0.80
- Current implementation simulates matching with a random score in [0.75, 1.00]
- In production, replace the simulation with a real face recognition API

```mermaid
flowchart TD
Start(["verifyFaceMatch Entry"]) --> LoadKyc["Load KYC by userId"]
LoadKyc --> Found{"KYC found?"}
Found --> |No| ReturnError["Return error: KYC_NOT_FOUND"]
Found --> |Yes| Simulate["Simulate face match score<br/>score = 0.75 + random * 0.25"]
Simulate --> ComputeMatch["matched = score >= 0.80"]
ComputeMatch --> Persist["Persist updates:<br/>faceMatchScore, faceMatchStatus, updatedAt"]
Persist --> ReturnOk["Return {matched, score}"]
ReturnError --> End(["Exit"])
ReturnOk --> End
```

### Request Validation and Error Handling
- Route-level validation ensures selfieImageUrl and documentImageUrl are present
- Unauthorized requests return 401
- Validation failures return 400 with structured error payload

Validation patterns used across the codebase:
- URI format validation for URLs
- Presence checks for required fields

### Response Schema
- matched: boolean
- score: number

These fields are persisted to the KYC record and returned to the client.

### Example Requests and Responses
- Successful match (example):
  - Request: POST /api/kyc/face-match with selfieImageUrl and documentImageUrl
  - Response: { matched: true, score: 0.85 }
- Non-match (example):
  - Request: Same as above
  - Response: { matched: false, score: 0.76 }

Note: The score is simulated in the current implementation.

## Dependency Analysis
- Route depends on auth middleware and service
- Service depends on repository and models
- Repository depends on Supabase client and entity mapping
- Swagger config defines the bearerAuth security scheme

```mermaid
graph LR
Routes["kyc-routes.ts"] --> Service["kyc-service.ts"]
Service --> Repo["kyc-repository.ts"]
Service --> Models["kyc.ts"]
Swagger["swagger.ts"] --> Routes
Security["security-middleware.ts"] --> Routes
```

## Performance Considerations
- Image resolution and compression: Higher resolution images generally improve matching accuracy but increase processing time and bandwidth usage
- Network latency: Fetching images from remote URLs adds latency; consider caching or pre-uploading images to reduce round trips
- Batch processing: If integrating with other KYC steps, coordinate timing to minimize redundant image fetches

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized: Ensure Authorization header includes a valid Bearer token
- 400 Validation Error: Confirm selfieImageUrl and documentImageUrl are present and valid URIs
- 404 Not Found: The KYC record may not exist for the authenticated user; submit KYC first
- Unexpected non-match: Lower scores can occur due to lighting, pose, or image quality; retry with improved images

## Conclusion
The POST /api/kyc/face-match endpoint enables biometric verification by comparing a selfie with an identity document photo. It uses a configurable threshold to determine a match and returns a numeric confidence score. While the current implementation simulates matching, integrating a robust face recognition API will enable production-grade accuracy. Proper image quality and secure handling of biometric data are essential for reliable verification.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Implementation Guidance: Image Quality Requirements
- Lighting: Even, well-lit conditions; avoid backlighting or shadows
- Pose: Front-facing, centered face with eyes open and mouth closed
- Resolution: Minimum recommended resolution to ensure facial feature clarity
- Background: Plain, non-distracting background
- Document: Clear front-facing photo with no glare or folds
- Cropping: Ensure the face occupies approximately 60–80% of the image width

[No sources needed since this section provides general guidance]

### Privacy Considerations
- Data minimization: Only transmit images necessary for verification
- Secure transport: Use HTTPS to prevent interception
- Storage: Store images securely and apply encryption at rest
- Retention: Define and enforce retention policies; delete images after verification completes
- Consent: Obtain explicit consent for biometric processing and explain purpose and duration
- Compliance: Adhere to applicable regulations (e.g., GDPR, CCPA) for sensitive biometric data

[No sources needed since this section provides general guidance]

---

# KYC Administration API

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
This document describes the KYC administration endpoints that are accessible only to admin users. It covers:
- GET /api/kyc/admin/pending: Retrieve all KYC verifications awaiting review.
- GET /api/kyc/admin/status/{status}: Filter KYC records by status (pending, submitted, under_review, approved, rejected).

It specifies HTTP methods, URL patterns, authentication requirements (JWT with admin role), response schemas, and error responses. It also explains the authorization flow using the requireRole('admin') middleware and how role-based access control prevents unauthorized access. Example responses and usage examples for admin dashboards are included.

## Project Structure
The KYC administration endpoints are implemented in the routing layer and backed by service and repository layers. The Swagger configuration defines the OpenAPI schema for the endpoints.

```mermaid
graph TB
Client["Admin Client"] --> Routes["KYC Routes<br/>src/routes/kyc-routes.ts"]
Routes --> AuthMW["Auth Middleware<br/>src/middleware/auth-middleware.ts"]
Routes --> Service["KYC Service<br/>src/services/kyc-service.ts"]
Service --> Repo["KYC Repository<br/>src/repositories/kyc-repository.ts"]
Repo --> DB["Supabase DB"]
Routes --> Swagger["Swagger Config<br/>src/config/swagger.ts"]
```

## Core Components
- Route handlers for admin endpoints:
  - GET /api/kyc/admin/pending
  - GET /api/kyc/admin/status/{status}
- Middleware:
  - authMiddleware: validates JWT Bearer token
  - requireRole('admin'): enforces admin role
- Service functions:
  - getPendingKycReviews()
  - getAllKycByStatus(status)
- Repository:
  - getPendingReviews()
  - getKycByStatus(status)
- Data model:
  - KycVerification and KycStatus

Key implementation references:
- Admin endpoints and validation: [kyc-routes.ts](file://src/routes/kyc-routes.ts#L767-L820)
- Role enforcement: [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L72-L100)
- Service functions: [kyc-service.ts](file://src/services/kyc-service.ts#L409-L415)
- Repository functions: [kyc-repository.ts](file://src/repositories/kyc-repository.ts#L119-L175)
- Data model: [kyc-model.ts](file://src/models/kyc.ts#L1-L120), [user-model.ts](file://src/models/user.ts#L1-L4)

## Architecture Overview
The admin endpoints follow a layered architecture:
- Router layer validates path parameters and applies auth and role middleware.
- Service layer orchestrates repository calls and returns typed results.
- Repository layer maps models to database entities and executes queries.
- Swagger defines the OpenAPI schema for the endpoints.

```mermaid
sequenceDiagram
participant C as "Admin Client"
participant R as "Route Handler<br/>GET /api/kyc/admin/pending"
participant A as "Auth Middleware"
participant RA as "Role Middleware<br/>requireRole('admin')"
participant S as "Service<br/>getPendingKycReviews()"
participant RP as "Repository<br/>getPendingReviews()"
participant DB as "Database"
C->>R : "GET /api/kyc/admin/pending"
R->>A : "authMiddleware()"
A-->>R : "Attach validated user"
R->>RA : "requireRole('admin')"
RA-->>R : "Allow if role=admin"
R->>S : "getPendingKycReviews()"
S->>RP : "getPendingReviews()"
RP->>DB : "SELECT by status=submitted"
DB-->>RP : "KYC rows"
RP-->>S : "KycVerification[]"
S-->>R : "KycVerification[]"
R-->>C : "200 OK with list"
```

## Detailed Component Analysis

### Endpoint: GET /api/kyc/admin/pending
- Purpose: Retrieve all KYC verifications awaiting review (status submitted).
- Authentication: JWT Bearer token required.
- Authorization: Admin role required.
- Response: Array of KycVerification objects.

Implementation highlights:
- Route handler: [kyc-routes.ts](file://src/routes/kyc-routes.ts#L767-L783)
- Service function: [kyc-service.ts](file://src/services/kyc-service.ts#L409-L411)
- Repository function: [kyc-repository.ts](file://src/repositories/kyc-repository.ts#L172-L175)
- Data model: [kyc-model.ts](file://src/models/kyc.ts#L84-L119)

Response schema (OpenAPI):
- Type: array of KycVerification
- KycVerification fields include identifiers, personal info, address, documents, livenessCheck, faceMatch fields, AML screening fields, risk fields, timestamps, and status.

Swagger references:
- Schema definitions: [swagger.ts](file://src/config/swagger.ts#L1-L233)
- Endpoint documentation: [kyc-routes.ts](file://src/routes/kyc-routes.ts#L767-L783)

Example response (conceptual):
- An array of KycVerification entries with fields such as id, userId, status, tier, name, nationality, address, documents, livenessCheck, faceMatchScore/status, amlScreeningStatus, riskLevel, timestamps, and optional blockchain fields.

Authorization flow:
- authMiddleware validates token and attaches user to request.
- requireRole('admin') checks user role and rejects non-admins with 403.

Error responses:
- 401 Unauthorized: missing or invalid token.
- 403 Forbidden: insufficient permissions (non-admin).

### Endpoint: GET /api/kyc/admin/status/{status}
- Purpose: Filter KYC verifications by status.
- Path parameter: status must be one of pending, submitted, under_review, approved, rejected.
- Authentication: JWT Bearer token required.
- Authorization: Admin role required.
- Response: Array of KycVerification objects.

Implementation highlights:
- Route handler validates status and calls service/repository: [kyc-routes.ts](file://src/routes/kyc-routes.ts#L785-L820)
- Service function: [kyc-service.ts](file://src/services/kyc-service.ts#L413-L415)
- Repository function: [kyc-repository.ts](file://src/repositories/kyc-repository.ts#L159-L170)
- Data model: [kyc-model.ts](file://src/models/kyc.ts#L1-L120)

Response schema (OpenAPI):
- Same as pending endpoint: array of KycVerification.

Validation and error handling:
- Invalid status returns 400 with INVALID_STATUS.
- Successful requests return 200 with filtered list.

Authorization flow:
- Same as pending endpoint.

Error responses:
- 400 Bad Request: invalid status value.
- 401 Unauthorized: missing or invalid token.
- 403 Forbidden: insufficient permissions (non-admin).

### Authorization Flow and Role-Based Access Control
The admin endpoints apply two middleware layers:
- authMiddleware: verifies Authorization header format and validates JWT. On success, attaches user with role to request.
- requireRole('admin'): ensures the user role includes 'admin'. Non-admin users receive 403.

```mermaid
flowchart TD
Start(["Incoming Request"]) --> CheckAuth["authMiddleware()<br/>Validate Bearer token"]
CheckAuth --> HasToken{"Token valid?"}
HasToken --> |No| Return401["401 Unauthorized"]
HasToken --> |Yes| AttachUser["Attach user with role"]
AttachUser --> CheckRole["requireRole('admin')"]
CheckRole --> IsAdmin{"Role includes 'admin'?"}
IsAdmin --> |No| Return403["403 Forbidden"]
IsAdmin --> |Yes| Next["Proceed to route handler"]
Return401 --> End(["End"])
Return403 --> End
Next --> End
```

### Data Model: KycVerification
The response schema for both endpoints is an array of KycVerification. Key fields include:
- Identity: id, userId, firstName, middleName, lastName, dateOfBirth, placeOfBirth, nationality, secondaryNationality, taxResidenceCountry, taxIdentificationNumber
- Address: InternationalAddress with addressLine1, addressLine2, city, stateProvince, postalCode, country, countryCode
- Documents: array of KycDocument with type, documentNumber, issuingCountry, issuingAuthority, issueDate, expiryDate, front/back image URLs, verification metadata
- Verification: selfieImageUrl, livenessCheck, faceMatchScore, faceMatchStatus, amlScreeningStatus, amlScreeningNotes, pepStatus, sanctionsStatus, riskLevel, riskScore
- Lifecycle: status, tier, submittedAt, reviewedAt, reviewedBy, rejectionReason, rejectionCode, expiresAt, createdAt, updatedAt

Swagger schema references:
- KycVerification and related schemas: [swagger.ts](file://src/config/swagger.ts#L1-L233)
- Model definitions: [kyc-model.ts](file://src/models/kyc.ts#L1-L120)

### Usage Examples for Admin Dashboard
- Fetch pending KYCs to display in a review queue:
  - Call GET /api/kyc/admin/pending with Authorization: Bearer <admin_token>
  - Render the returned array of KycVerification entries in a table/grid
- Filter by status to build status dashboards:
  - Call GET /api/kyc/admin/status/submitted with Authorization: Bearer <admin_token>
  - Paginate or sort by submittedAt as needed
- Integrate with admin UI:
  - Use the same JWT for subsequent admin actions (e.g., approve/reject)
  - Display riskLevel, amlScreeningStatus, and documents for review decisions

[No sources needed since this section provides general guidance]

## Dependency Analysis
The admin endpoints depend on the following chain:
- Router -> Auth Middleware -> Role Middleware -> Service -> Repository -> Database

```mermaid
graph LR
Routes["kyc-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Service["kyc-service.ts"]
Service --> Repo["kyc-repository.ts"]
Repo --> DB["Supabase"]
Routes --> Swagger["swagger.ts"]
```

## Performance Considerations
- Pagination: The repository limits results to a default small number (e.g., 50) to prevent large payloads. Admin dashboards should implement pagination or filtering to manage load.
- Sorting: Requests are sorted by submittedAt to prioritize recent submissions.
- Token validation: authMiddleware performs a single token validation per request; keep JWT short-lived and rotate tokens regularly.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized
  - Cause: Missing Authorization header or invalid/missing Bearer token.
  - Resolution: Ensure Authorization: Bearer <valid_jwt> is sent.
- 403 Forbidden
  - Cause: User authenticated but lacks admin role.
  - Resolution: Authenticate with an admin account or escalate privileges.
- 400 Bad Request (status filter)
  - Cause: status path parameter not one of the allowed values.
  - Resolution: Use one of pending, submitted, under_review, approved, rejected.
- 404 Not Found (other endpoints)
  - Cause: Resource not found in other KYC endpoints.
  - Resolution: Verify resource IDs and statuses.

Error response format:
- All errors include error.code, error.message, optional details, timestamp, and requestId.

## Conclusion
The KYC administration endpoints provide secure, role-gated access to KYC review data. Admin users can fetch pending verifications and filter by status using JWT authentication and admin role enforcement. The response schema is defined by the KycVerification model, and the implementation follows a clean separation of concerns across routing, service, and repository layers.

---

# KYC Data Retrieval API

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
This document specifies the KYC data retrieval API for the FreelanceXchain system. It covers:
- GET /api/kyc/status: Returns the current user’s complete KYC verification record, including personal information, document details, liveness check results, and verification status.
- GET /api/kyc/countries: Retrieves all supported countries for KYC.
- GET /api/kyc/countries/{countryCode}: Retrieves KYC requirements for a specific country.

It defines HTTP methods, authentication requirements (JWT for status endpoint), response schemas, and error handling. It also explains the KycVerification response schema lifecycle (pending, submitted, under_review, approved, rejected) and tier levels (basic, standard, enhanced). Guidance is included for building dynamic KYC forms based on country requirements.

## Project Structure
The KYC endpoints are implemented in the routing layer, backed by service logic, typed models, and a repository that persists to Supabase. Swagger definitions are centralized for OpenAPI documentation.

```mermaid
graph TB
Client["Client App"] --> Routes["Routes: kyc-routes.ts"]
Routes --> Auth["Auth Middleware"]
Routes --> Service["Service: kyc-service.ts"]
Service --> Repo["Repository: kyc-repository.ts"]
Repo --> DB["Supabase: kyc_verifications"]
Service --> Contract["Contract: KYCVerification.sol"]
Swagger["Swagger Config"] --> Routes
```

## Core Components
- Routes define endpoints, request validation, and response formatting.
- Service encapsulates business logic, country requirement checks, and integration with the repository and blockchain contract.
- Models define the KycVerification schema and related types.
- Repository maps domain models to Supabase entities and performs persistence.
- Swagger centralizes OpenAPI definitions for interactive docs and schema references.

## Architecture Overview
The KYC retrieval flow is a straightforward request-response pipeline with JWT authentication for the status endpoint.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "kyc-routes.ts"
participant A as "auth-middleware.ts"
participant S as "kyc-service.ts"
participant P as "kyc-repository.ts"
participant D as "Supabase DB"
C->>R : GET /api/kyc/status
R->>A : authMiddleware()
A-->>R : validated user or 401
R->>S : getKycStatus(userId)
S->>P : getKycByUserId(userId)
P->>D : SELECT * FROM kyc_verifications WHERE user_id=...
D-->>P : KYC record or null
P-->>S : mapped KycVerification or null
S-->>R : result
R-->>C : 200 {KycVerification} or 404
```

## Detailed Component Analysis

### Endpoint: GET /api/kyc/status
- Method: GET
- Path: /api/kyc/status
- Authentication: JWT Bearer token required
- Purpose: Retrieve the current user’s complete KYC verification record.
- Response:
  - 200 OK: KycVerification object
  - 401 Unauthorized: Missing or invalid token
  - 404 Not Found: No KYC verification found for the user
  - 400 Bad Request: Service-level error (e.g., validation failures)
- Notes:
  - Uses auth middleware to extract user identity from the token.
  - Calls service to fetch the latest KYC record by user ID.
  - Returns the mapped domain model to the client.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "kyc-routes.ts"
participant A as "auth-middleware.ts"
participant S as "kyc-service.ts"
participant P as "kyc-repository.ts"
C->>R : GET /api/kyc/status
R->>A : authMiddleware()
A-->>R : {userId} or 401
R->>S : getKycStatus(userId)
S->>P : getKycByUserId(userId)
P-->>S : KycVerification or null
S-->>R : result
alt found
R-->>C : 200 {KycVerification}
else not found
R-->>C : 404 {error}
else error
R-->>C : 400 {error}
end
```

### Endpoint: GET /api/kyc/countries
- Method: GET
- Path: /api/kyc/countries
- Authentication: Not required
- Purpose: Retrieve all supported countries and their KYC requirements.
- Response:
  - 200 OK: Array of SupportedCountry objects

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "kyc-routes.ts"
participant S as "kyc-service.ts"
C->>R : GET /api/kyc/countries
R->>S : getSupportedCountries()
S-->>R : SupportedCountry[]
R-->>C : 200 [SupportedCountry]
```

### Endpoint: GET /api/kyc/countries/{countryCode}
- Method: GET
- Path: /api/kyc/countries/{countryCode}
- Authentication: Not required
- Purpose: Retrieve KYC requirements for a specific country.
- Parameters:
  - countryCode: ISO 3166-1 alpha-2 country code (required)
- Response:
  - 200 OK: SupportedCountry object
  - 400 Bad Request: Invalid country code
  - 404 Not Found: Country not supported

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "kyc-routes.ts"
participant S as "kyc-service.ts"
C->>R : GET /api/kyc/countries/{countryCode}
R->>S : getCountryRequirements(countryCode)
S-->>R : SupportedCountry or null
alt found
R-->>C : 200 {SupportedCountry}
else not found
R-->>C : 404 {error}
end
```

### KycVerification Response Schema
The KycVerification object includes:
- Identity and demographic fields
- Address object with ISO country code
- Documents array with verification metadata
- LivenessCheck object (optional)
- Face match score and status (optional)
- AML screening status and risk indicators (optional)
- Lifecycle status and tier level
- Timestamps for creation/update/submission/review/expiry

Status lifecycle:
- pending
- submitted
- under_review
- approved
- rejected

Tier levels:
- basic
- standard
- enhanced

```mermaid
classDiagram
class KycVerification {
+string id
+string userId
+string status
+string tier
+string firstName
+string? middleName
+string lastName
+string dateOfBirth
+string? placeOfBirth
+string nationality
+string? secondaryNationality
+string? taxResidenceCountry
+string? taxIdentificationNumber
+InternationalAddress address
+KycDocument[] documents
+LivenessCheck? livenessCheck
+number? faceMatchScore
+string? faceMatchStatus
+string? selfieImageUrl
+string? videoVerificationUrl
+string? amlScreeningStatus
+string? amlScreeningNotes
+boolean? pepStatus
+boolean? sanctionsStatus
+string? riskLevel
+number? riskScore
+string? submittedAt
+string? reviewedAt
+string? reviewedBy
+string? rejectionReason
+string? rejectionCode
+string? expiresAt
+string createdAt
+string updatedAt
}
class InternationalAddress {
+string addressLine1
+string? addressLine2
+string city
+string? stateProvince
+string? postalCode
+string country
+string countryCode
}
class KycDocument {
+string id
+string type
+string documentNumber
+string issuingCountry
+string? issuingAuthority
+string? issueDate
+string? expiryDate
+string frontImageUrl
+string? backImageUrl
+string? mrzData
+string? ocrExtractedData
+string verificationStatus
+string? verificationNotes
+string uploadedAt
}
class LivenessCheck {
+string id
+string sessionId
+string status
+number confidenceScore
+LivenessChallenge[] challenges
+string[] capturedFrames
+string? completedAt
+string expiresAt
+string createdAt
}
class LivenessChallenge {
+string type
+boolean completed
+string? timestamp
}
KycVerification --> InternationalAddress : "has"
KycVerification --> KycDocument : "has many"
KycVerification --> LivenessCheck : "optional"
LivenessCheck --> LivenessChallenge : "has many"
```

### SupportedCountry Schema
- code: ISO 3166-1 alpha-2 country code
- name: Full country name
- supportedDocuments: Array of document types allowed for that country
- requiresLiveness: Boolean indicating if liveness check is required
- requiresAddressProof: Boolean indicating if address proof is required
- tier: KYC tier recommendation for the country

### Country Requirements Data Usage
Clients should:
- Fetch supported countries to populate a dropdown or region selector.
- On selecting a country, call GET /api/kyc/countries/{countryCode} to retrieve requirements.
- Dynamically render form fields based on supportedDocuments, requiresLiveness, requiresAddressProof, and tier.
- Enforce validation rules (e.g., required document types) before submission.

## Dependency Analysis
- Route dependencies:
  - kyc-routes.ts depends on auth-middleware.ts for JWT validation.
  - kyc-routes.ts depends on kyc-service.ts for business logic.
- Service dependencies:
  - kyc-service.ts depends on kyc-repository.ts for persistence and on KYCVerification.sol for blockchain integration.
- Repository dependencies:
  - kyc-repository.ts depends on supabase.ts for table names and DB client.
- Swagger dependencies:
  - swagger.ts defines OpenAPI components and security schemes used by the routes.

```mermaid
graph LR
Routes["kyc-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Service["kyc-service.ts"]
Service --> Repo["kyc-repository.ts"]
Repo --> Supabase["supabase.ts"]
Service --> Contract["KYCVerification.sol"]
Swagger["swagger.ts"] --> Routes
```

## Performance Considerations
- The status endpoint performs a single DB query by user ID with ordering and limit to fetch the latest record.
- Country endpoints return static lists from memory; caching at the application layer can reduce repeated computation.
- Liveness and face match endpoints involve additional processing; consider rate limiting and session expiration handling.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common error scenarios and responses:
- 401 Unauthorized:
  - Missing Authorization header or invalid Bearer token format.
  - Auth middleware returns standardized error payload.
- 404 Not Found:
  - GET /api/kyc/status returns 404 when no KYC record exists for the user.
  - GET /api/kyc/countries/{countryCode} returns 404 when the country is not supported.
- 400 Bad Request:
  - Validation errors or service-level errors (e.g., invalid request data).
- 409 Conflict:
  - Submitting KYC when already approved or pending (not covered in this document but relevant for completeness).

Standardized error shape:
- error: { code, message, details (optional) }
- timestamp: ISO date-time
- requestId: UUID or unknown

## Conclusion
The KYC data retrieval API provides a clear, secure, and extensible way to fetch user KYC records and country requirements. The status endpoint enforces JWT authentication, while country endpoints are publicly accessible for form-building. The response schemas and lifecycle/tier semantics enable robust client-side rendering and validation.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Definitions and Schemas

- GET /api/kyc/status
  - Authentication: Bearer JWT
  - Response: 200 KycVerification, 401 Unauthorized, 404 Not Found, 400 Bad Request
  - Schema reference: KycVerification

- GET /api/kyc/countries
  - Authentication: None
  - Response: 200 [SupportedCountry]

- GET /api/kyc/countries/{countryCode}
  - Authentication: None
  - Response: 200 SupportedCountry, 400 Bad Request, 404 Not Found
  - Schema reference: SupportedCountry

- Security Scheme (OpenAPI):
  - bearerAuth: HTTP Bearer JWT

- Error Response Schema (OpenAPI):
  - error: { code, message, details[] }
  - timestamp: date-time
  - requestId: string

### Example Responses

- Successful retrieval of KycVerification (200 OK)
  - Fields include identity, address, documents, optional liveness and face match, AML/risk fields, status, tier, timestamps.

- Country list (200 OK)
  - Array of SupportedCountry entries.

- Country requirements (200 OK)
  - Single SupportedCountry entry with code, name, supportedDocuments, requiresLiveness, requiresAddressProof, tier.

- Error response (404 Not Found)
  - Example: { error: { code: "KYC_NOT_FOUND", message: "No KYC verification found" }, timestamp: "...", requestId: "..." }

- Error response (400 Bad Request)
  - Example: { error: { code: "INVALID_COUNTRY_CODE", message: "Country code is required" }, timestamp: "...", requestId: "..." }

### Blockchain Integration Notes
- The system maintains a separate on-chain KYC contract for immutable verification status and tier. Off-chain KYC records can be augmented with on-chain verification details via service helpers.

---

# KYC Liveness Verification API

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
This document describes the face liveness verification endpoints used in the KYC module of the FreelanceXchain system. It covers:
- Creating a new liveness session
- Retrieving the current session
- Submitting verification results

It specifies HTTP methods, URL patterns, request/response schemas, authentication requirements (JWT), liveness challenge types, how challenges are randomized, required request parameters for verification, example flows, response schema and status values, and error handling guidance.

## Project Structure
The liveness verification endpoints are implemented in the KYC routes, backed by service logic and typed models. Authentication is enforced via a JWT bearer token.

```mermaid
graph TB
Client["Client App"] --> Routes["KYC Routes<br/>POST /api/kyc/liveness/session<br/>GET /api/kyc/liveness/session<br/>POST /api/kyc/liveness/verify"]
Routes --> Auth["Auth Middleware<br/>JWT Bearer"]
Routes --> Service["KYC Service<br/>createLivenessSession()<br/>getLivenessSession()<br/>verifyLiveness()"]
Service --> Models["Models<br/>LivenessCheck, LivenessChallenge, LivenessSessionInput, LivenessVerificationInput"]
Service --> Repo["KYC Repository<br/>getKycByUserId(), updateKyc()"]
```

## Core Components
- LivenessCheck: The session and result object containing status, confidence score, challenges, timestamps, and expiration.
- LivenessChallenge: Individual challenge entries with type, completion flag, and optional timestamp.
- LivenessSessionInput: Optional input to customize challenges during session creation.
- LivenessVerificationInput: Request payload for submitting verification results.

Key behaviors:
- Session creation sets a default set of challenges and an expiration time.
- Verification updates challenge completion and computes a confidence score; determines pass/fail/expired states.
- Sessions expire after a fixed duration.

## Architecture Overview
The liveness verification flow spans route handlers, authentication middleware, service logic, and persistence.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "KYC Routes"
participant A as "Auth Middleware"
participant S as "KYC Service"
participant P as "Persistence (Repo)"
C->>R : POST /api/kyc/liveness/session
R->>A : Validate JWT
A-->>R : Authorized user
R->>S : createLivenessSession(userId, input)
S->>P : updateKyc(kycId, { livenessCheck })
P-->>S : Updated KYC
S-->>R : LivenessCheck
R-->>C : 201 LivenessCheck
C->>R : GET /api/kyc/liveness/session
R->>A : Validate JWT
A-->>R : Authorized user
R->>S : getLivenessSession(userId)
S->>P : getKycByUserId(userId)
P-->>S : KYC with livenessCheck
S-->>R : LivenessCheck or null
R-->>C : 200 LivenessCheck or 404
C->>R : POST /api/kyc/liveness/verify
R->>A : Validate JWT
A-->>R : Authorized user
R->>S : verifyLiveness(userId, payload)
S->>P : getKycByUserId(userId)
S->>S : Validate sessionId, expiration, update challenges
S->>P : updateKyc(kycId, { livenessCheck })
S-->>R : LivenessCheck
R-->>C : 200 LivenessCheck
```

## Detailed Component Analysis

### Endpoint: POST /api/kyc/liveness/session
- Method: POST
- URL: /api/kyc/liveness/session
- Authentication: JWT Bearer
- Purpose: Create a new liveness verification session for the authenticated user.
- Request body:
  - challenges: optional array of challenge types to include in the session. Defaults to blink, turn_left, turn_right, smile if omitted.
- Response:
  - LivenessCheck object with status pending, empty challenges (completed=false), confidenceScore 0, and expiresAt set to a future timestamp.
- Notes:
  - The session is stored on the user’s KYC record.
  - Challenges are randomized by order in the input; defaults are used when not provided.

### Endpoint: GET /api/kyc/liveness/session
- Method: GET
- URL: /api/kyc/liveness/session
- Authentication: JWT Bearer
- Purpose: Retrieve the current liveness session for the authenticated user.
- Response:
  - LivenessCheck if present; otherwise 404 with “No active liveness session”.
- Notes:
  - If no session exists, clients should create one first.

### Endpoint: POST /api/kyc/liveness/verify
- Method: POST
- URL: /api/kyc/liveness/verify
- Authentication: JWT Bearer
- Purpose: Submit verification results for the current session.
- Request body (required):
  - sessionId: string, must match the active session
  - capturedFrames: array of base64-encoded image strings
  - challengeResults: array of objects with:
    - type: one of blink, smile, turn_left, turn_right, nod, open_mouth
    - completed: boolean
    - timestamp: ISO date-time string
- Response:
  - LivenessCheck reflecting updated challenges, confidenceScore, and computed status (pending, passed, failed, expired).
- Notes:
  - If sessionId mismatches, invalid session error is returned.
  - If session expired, status is set to expired and saved.
  - Status determination considers whether all challenges were completed and a confidence threshold.

### Liveness Challenge Types and Randomization
- Supported challenge types: blink, smile, turn_left, turn_right, nod, open_mouth.
- Default challenge set used when none are provided: blink, turn_left, turn_right, smile.
- Randomization:
  - The service constructs challenges from the provided input array. If omitted, defaults are used.
  - The order of challenges in the input defines the sequence presented to the user.

### LivenessCheck Response Schema and Status Values
- Schema fields:
  - id: string
  - sessionId: string
  - status: pending, passed, failed, expired
  - confidenceScore: number
  - challenges: array of LivenessChallenge
  - capturedFrames: array of base64 image strings
  - completedAt: optional timestamp
  - expiresAt: ISO date-time
  - createdAt: ISO date-time
- Status semantics:
  - pending: session created or challenges not yet completed
  - passed: all challenges completed and confidence meets threshold
  - failed: all challenges completed but confidence below threshold
  - expired: session timed out

### Example Client Flow
Below is a typical end-to-end flow a client should orchestrate:

```mermaid
sequenceDiagram
participant Client as "Client App"
participant API as "KYC Routes"
participant Service as "KYC Service"
Client->>API : POST /api/kyc/liveness/session
API->>Service : createLivenessSession(userId, input)
Service-->>API : LivenessCheck (status=pending)
API-->>Client : 201 LivenessCheck
loop Present challenges to user
Client->>Client : Capture frames for each challenge
end
Client->>API : POST /api/kyc/liveness/verify
API->>Service : verifyLiveness(userId, payload)
Service-->>API : LivenessCheck (status=passed/failed/expired)
API-->>Client : 200 LivenessCheck
```

## Dependency Analysis
The liveness endpoints depend on:
- Route handlers for routing and request validation
- Auth middleware for JWT enforcement
- Service layer for business logic and session management
- Models for type safety and schema definitions
- Persistence layer for reading/writing KYC records

```mermaid
graph LR
Routes["kyc-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Service["kyc-service.ts"]
Service --> Models["kyc.ts"]
Service --> Repo["kyc-repository.ts"]
```

## Performance Considerations
- Session expiration: Sessions expire after a fixed duration; clients should complete verification promptly.
- Confidence scoring: The service simulates confidence scoring; production deployments should integrate a robust ML model.
- Payload sizes: Base64-encoded frames can be large; consider compression or streaming where feasible.
- Rate limiting: Apply rate limits at the API gateway to protect sensitive endpoints.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Missing or invalid JWT:
  - Symptom: 401 Unauthorized
  - Resolution: Ensure Authorization header is present and formatted as Bearer <token>.
- No active liveness session:
  - Symptom: 404 Not Found with “No active liveness session”
  - Resolution: Call POST /api/kyc/liveness/session to create a session first.
- Invalid session ID:
  - Symptom: 400 Bad Request with “Invalid liveness session ID”
  - Resolution: Use the sessionId returned by the session creation endpoint.
- Session expired:
  - Symptom: 400 Bad Request with “Liveness session has expired”
  - Resolution: Create a new session and restart the verification.
- Validation errors:
  - Symptom: 400 Bad Request with “sessionId, capturedFrames, and challengeResults are required”
  - Resolution: Ensure all required fields are present in the verification request.

## Conclusion
The KYC liveness verification endpoints provide a structured flow for creating sessions, retrieving current sessions, and submitting verification results. They enforce JWT authentication, manage session lifecycle, and compute outcomes based on challenge completion and confidence thresholds. Clients should follow the documented request/response schemas and handle error conditions appropriately to ensure a smooth user experience.

---

# KYC Submission API

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
This document provides comprehensive API documentation for the KYC submission endpoint in the FreelanceXchain system. It focuses on the POST /api/kyc/submit endpoint, detailing the HTTP method, URL pattern, request body schema (KycSubmissionInput), authentication requirements (JWT Bearer), validation rules, response codes, and practical examples. It also covers privacy considerations and data handling practices for transmitting sensitive personal information.

## Project Structure
The KYC submission flow spans routing, middleware, service, repository, and data model layers, with Swagger OpenAPI definitions embedded in the routes for interactive documentation.

```mermaid
graph TB
Client["Client"] --> Routes["Routes: kyc-routes.ts"]
Routes --> AuthMW["Auth Middleware: auth-middleware.ts"]
Routes --> Service["Service: kyc-service.ts"]
Service --> Repo["Repository: kyc-repository.ts"]
Repo --> DB["Database: kyc_verifications (schema.sql)"]
Routes --> Swagger["Swagger Config: swagger.ts"]
```

## Core Components
- Endpoint: POST /api/kyc/submit
- Authentication: JWT Bearer token via Authorization header
- Request Body: KycSubmissionInput (international KYC schema)
- Response Codes:
  - 201 Created: KYC submitted successfully
  - 400 Bad Request: Validation error or invalid request data
  - 409 Conflict: KYC already pending or approved
  - 401 Unauthorized: Missing or invalid Authorization header
- Validation: Built-in validator checks required fields and formats; service-level country/document support checks

## Architecture Overview
The KYC submission request follows this flow:
1. Client sends a POST request with a valid JWT Bearer token.
2. Auth middleware validates the token and attaches user context.
3. Route handler validates the request payload using a dedicated validator.
4. Service layer performs business validations (country/document support, existing KYC state).
5. Repository persists the KYC verification record to the database.
6. Optional blockchain submission occurs if the user has a wallet address.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Routes : kyc-routes.ts"
participant A as "Auth Middleware"
participant S as "Service : kyc-service.ts"
participant P as "Repository : kyc-repository.ts"
participant D as "Database : kyc_verifications"
C->>R : POST /api/kyc/submit (JWT Bearer)
R->>A : authMiddleware()
A-->>R : validated user context
R->>R : validateKycSubmission()
alt validation fails
R-->>C : 400 Validation Error
else validation passes
R->>S : submitKyc(userId, input)
S->>S : validate country/document support<br/>check existing KYC state
alt conflict (already approved/pending)
S-->>R : error result
R-->>C : 409 Conflict
else success
S->>P : create/update KYC
P->>D : insert/update record
S-->>R : created KYC
R-->>C : 201 Created
end
end
```

## Detailed Component Analysis

### Endpoint Definition: POST /api/kyc/submit
- Method: POST
- URL Pattern: /api/kyc/submit
- Authentication: Requires Authorization: Bearer <JWT>
- Request Body: KycSubmissionInput (see schema below)
- Responses:
  - 201 Created: KYC verification created/updated
  - 400 Bad Request: Validation error or invalid request data
  - 409 Conflict: KYC already approved or pending
  - 401 Unauthorized: Missing/invalid Authorization header

### Request Body Schema: KycSubmissionInput
The request body must conform to the KycSubmissionInput schema. Required fields include:
- Personal Information
  - firstName (string)
  - lastName (string)
  - dateOfBirth (string, format: date)
  - nationality (string)
  - Optional: middleName, placeOfBirth, secondaryNationality, taxResidenceCountry, taxIdentificationNumber
- Address (InternationalAddress)
  - addressLine1 (string)
  - city (string)
  - country (string)
  - countryCode (string)
  - Optional: addressLine2, stateProvince, postalCode
- Identity Document (KycDocument)
  - type (enum: passport, national_id, drivers_license, residence_permit, voter_id, tax_id, social_security, birth_certificate, utility_bill, bank_statement)
  - documentNumber (string)
  - issuingCountry (string)
  - Optional: issuingAuthority, issueDate (date), expiryDate (date), frontImageUrl (string), backImageUrl (string)
- Optional Fields
  - selfieImageUrl (string)
  - tier (enum: basic, standard, enhanced)

Validation Rules:
- All required fields must be present and non-empty.
- dateOfBirth must be a valid date string (YYYY-MM-DD).
- countryCode must match supported countries.
- document.type must be one of the supported document types for the given country.
- address must include required address fields.
- Authorization header must be present and formatted as Bearer <token>.

### Validation Logic
- Route-level validation:
  - Ensures required fields exist and meet basic type/format requirements.
  - Validates address and document sub-schemas.
- Service-level validation:
  - Confirms the user exists.
  - Checks if the country is supported and the document type is supported for that country.
  - Prevents duplicate submissions if KYC is already approved or pending.

```mermaid
flowchart TD
Start(["Submit Request"]) --> CheckAuth["Check Authorization Header"]
CheckAuth --> |Missing/Invalid| Return401["Return 401 Unauthorized"]
CheckAuth --> |Valid| ValidateBody["Validate KycSubmissionInput"]
ValidateBody --> |Invalid| Return400V["Return 400 Validation Error"]
ValidateBody --> |Valid| CheckCountry["Check Country Support"]
CheckCountry --> |Unsupported| Return400C["Return 400 Country Not Supported"]
CheckCountry --> CheckDocType["Check Document Type Support"]
CheckDocType --> |Unsupported| Return400D["Return 400 Document Type Not Supported"]
CheckDocType --> CheckExisting["Check Existing KYC Status"]
CheckExisting --> |Already Approved| Return409A["Return 409 KYC Already Approved"]
CheckExisting --> |Already Pending| Return409P["Return 409 KYC Pending"]
CheckExisting --> Persist["Persist KYC Verification"]
Persist --> Return201["Return 201 Created"]
```

### Response Codes and Conditions
- 201 Created: KYC verification created or updated successfully.
- 400 Bad Request:
  - Validation error: missing or invalid fields.
  - Country not supported.
  - Document type not supported for the selected country.
- 409 Conflict:
  - KYC already approved.
  - KYC already pending review.
- 401 Unauthorized:
  - Missing Authorization header.
  - Invalid Bearer token format.
  - Token validation failure.

### Practical Examples

#### Example Request Payload (International KYC)
- Headers:
  - Authorization: Bearer <your-jwt-token>
  - Content-Type: application/json
- Body:
  - firstName: "John"
  - lastName: "Doe"
  - dateOfBirth: "1990-01-01"
  - nationality: "US"
  - address:
    - addressLine1: "123 Main St"
    - addressLine2: "Apt 4B"
    - city: "New York"
    - stateProvince: "NY"
    - postalCode: "10001"
    - country: "United States"
    - countryCode: "US"
  - document:
    - type: "passport"
    - documentNumber: "P12345678"
    - issuingCountry: "US"
    - frontImageUrl: "https://example.com/passport-front.jpg"
    - backImageUrl: "https://example.com/passport-back.jpg"
  - selfieImageUrl: "https://example.com/selfie.jpg"
  - tier: "enhanced"

#### Example Successful Response (201 Created)
- Status: 201 Created
- Body: KycVerification object reflecting the submitted KYC (with status set to submitted).

#### Example Validation Error Response (400)
- Status: 400 Bad Request
- Body:
  - error:
    - code: "VALIDATION_ERROR"
    - message: "Invalid request data"
    - details: ["firstName is required", "address.addressLine1 is required"]

#### Example Conflict Response (409)
- Status: 409 Conflict
- Body:
  - error:
    - code: "KYC_PENDING"
    - message: "KYC verification already pending review"

### Privacy Considerations and Data Handling
- Sensitive Data Transmission:
  - The endpoint accepts images (front/back of documents, selfie) via URLs. Ensure HTTPS endpoints are used to protect data in transit.
- Data Storage:
  - KYC records are stored in the kyc_verifications table with JSONB fields for address, documents, and optional liveness check data. The table includes timestamps and status tracking.
- Access Control:
  - Row Level Security (RLS) is enabled on the kyc_verifications table to restrict access. Service role policies grant full access for backend operations.
- Best Practices:
  - Avoid storing raw personal data unnecessarily; rely on secure image storage and metadata.
  - Implement rate limiting and input sanitization at the gateway level.
  - Consider tokenizing or hashing identifiers where feasible.

## Dependency Analysis
The KYC submission endpoint depends on:
- Routing and Swagger definitions for endpoint exposure and schema documentation.
- Authentication middleware for JWT validation.
- Service layer for business logic and external integrations (e.g., blockchain).
- Repository layer for persistence.
- Database schema for storage.

```mermaid
graph LR
Routes["kyc-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Service["kyc-service.ts"]
Service --> Repo["kyc-repository.ts"]
Repo --> DB["schema.sql (kyc_verifications)"]
Routes --> Swagger["swagger.ts"]
```

## Performance Considerations
- Validation Early Exit: The route-level validator short-circuits on missing required fields to reduce unnecessary processing.
- Minimal Database Writes: Updates only occur when KYC already exists; otherwise, a single insert is performed.
- Asynchronous Blockchain Submission: Blockchain submission is attempted asynchronously and does not block the primary response path.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common Issues and Resolutions:
- 401 Unauthorized
  - Cause: Missing or malformed Authorization header.
  - Resolution: Ensure Authorization: Bearer <valid-jwt> is present.
- 400 Validation Error
  - Cause: Missing required fields or invalid formats (e.g., date format).
  - Resolution: Provide all required fields with correct types and formats.
- 400 Country Not Supported
  - Cause: countryCode not in supported countries list.
  - Resolution: Use a supported country code.
- 400 Document Type Not Supported
  - Cause: Document type not supported for the selected country.
  - Resolution: Choose a supported document type for the given country.
- 409 Conflict (KYC Already Approved/Pending)
  - Cause: Attempting to submit when KYC is already approved or pending review.
  - Resolution: Wait until the current KYC completes or check status endpoint.

## Conclusion
The POST /api/kyc/submit endpoint provides a robust, standards-aligned international KYC submission flow with strong validation, clear error handling, and secure data handling practices. By adhering to the documented schema and authentication requirements, clients can reliably submit KYC applications while maintaining compliance with privacy and data protection principles.

## Appendices

### Appendix A: InternationalAddress Schema
- addressLine1 (string, required)
- addressLine2 (string, optional)
- city (string, required)
- stateProvince (string, optional)
- postalCode (string, optional)
- country (string, required)
- countryCode (string, required)

### Appendix B: KycDocument Schema
- type (enum, required)
- documentNumber (string, required)
- issuingCountry (string, required)
- issuingAuthority (string, optional)
- issueDate (string, date, optional)
- expiryDate (string, date, optional)
- frontImageUrl (string, required)
- backImageUrl (string, optional)

### Appendix C: Supported Countries and Document Types
- Supported countries include US, GB, CA, AU, DE, FR, JP, SG, AE, IN, PH, BR, MX, NG, KE, ZA with varying requirements and tiers.
- Document types include passport, national_id, drivers_license, residence_permit, voter_id, tax_id, social_security, birth_certificate, utility_bill, bank_statement.

---

# Notification API

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
This document provides comprehensive API documentation for the notification system endpoints in the FreelanceXchain platform. It covers HTTP methods, URL patterns, request/response schemas, authentication requirements (JWT Bearer), and pagination mechanisms. It also documents notification types, payload structures, and client implementation guidance for building a notification center with real-time updates. The goal is to enable developers to integrate notification retrieval, marking as read, and unread counts into their applications reliably and efficiently.

## Project Structure
The notification API is implemented as part of the Express route layer, backed by a service layer and a repository that interacts with the Supabase database. Authentication is enforced via a JWT Bearer middleware. The OpenAPI/Swagger specification defines response schemas and security schemes.

```mermaid
graph TB
Client["Client Application"] --> Routes["Routes: notification-routes.ts"]
Routes --> Auth["Auth Middleware: auth-middleware.ts"]
Routes --> Service["Service: notification-service.ts"]
Service --> Repo["Repository: notification-repository.ts"]
Repo --> DB["Supabase: notifications table"]
```

## Core Components
- Routes: Define endpoints for listing notifications, marking a notification as read, marking all as read, and retrieving unread counts. All endpoints require JWT Bearer authentication.
- Service: Orchestrates business logic for creating, retrieving, and updating notifications, and exposes helper functions for specific notification types.
- Repository: Implements database operations using Supabase client, including paginated queries, unread counts, and bulk updates.
- Auth Middleware: Validates Authorization header format and verifies JWT tokens.
- Swagger: Defines the Notification schema, error schema, and security scheme for Bearer JWT.

Key responsibilities:
- Enforce authentication and user identity on protected endpoints.
- Apply pagination and ordering for notification lists.
- Enforce ownership checks when marking notifications as read.
- Provide unread counts and bulk read operations.

## Architecture Overview
The notification API follows a layered architecture:
- Route handlers accept requests, enforce authentication, and delegate to the service.
- Services translate request options into repository calls and map entities to API models.
- Repositories encapsulate Supabase queries and handle pagination metadata.
- Swagger documents schemas and security for clients.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Routes"
participant A as "Auth Middleware"
participant S as "Service"
participant P as "Repository"
participant D as "Supabase DB"
C->>R : "GET /api/notifications"
R->>A : "Validate Authorization header"
A-->>R : "Attach validated user"
R->>S : "getNotificationsByUser(userId, options)"
S->>P : "getNotificationsByUser(userId, options)"
P->>D : "SELECT ... ORDER BY created_at DESC LIMIT/OFFSET"
D-->>P : "Items + Count"
P-->>S : "PaginatedResult<NotificationEntity>"
S-->>R : "PaginatedResult<Notification>"
R-->>C : "200 OK with items, hasMore, total"
```

## Detailed Component Analysis

### Authentication and Security
- All notification endpoints require a Bearer token in the Authorization header.
- The auth middleware validates the header format and verifies the token, attaching user identity to the request.
- Unauthorized responses include standardized error structure with code and message.

Security requirements:
- Header: Authorization: Bearer <JWT>
- Scope: User-bound access token

### Endpoints Reference

#### GET /api/notifications
- Purpose: Retrieve notifications for the authenticated user, sorted newest first.
- Authentication: Required (Bearer JWT).
- Query parameters:
  - maxItemCount (integer, min 1, max 100): Limit number of items returned.
  - continuationToken (string): Pagination token (used internally by repository).
- Response:
  - 200 OK: items (array of Notification), hasMore (boolean), total (optional number).
  - 401 Unauthorized: Missing or invalid token.

Notification schema (selected fields):
- id: string (UUID)
- userId: string (UUID)
- type: enum [proposal_received, proposal_accepted, proposal_rejected, milestone_submitted, milestone_approved, payment_released, dispute_created, dispute_resolved, rating_received, message]
- title: string
- message: string
- data: object (additional properties)
- isRead: boolean
- createdAt: string (ISO 8601)

Pagination:
- Uses Supabase range queries with ORDER BY created_at DESC.
- hasMore indicates whether more records exist beyond the current page.
- total may be included depending on count mode.

#### GET /api/notifications/unread-count
- Purpose: Get the count of unread notifications for the authenticated user.
- Authentication: Required (Bearer JWT).
- Response:
  - 200 OK: { count: number }
  - 401 Unauthorized: Missing or invalid token.

#### PATCH /api/notifications/:id/read
- Purpose: Mark a specific notification as read.
- Authentication: Required (Bearer JWT).
- Path parameters:
  - id: string (UUID)
- Response:
  - 200 OK: Notification object.
  - 400 Bad Request: Invalid UUID format.
  - 401 Unauthorized: Missing or invalid token.
  - 403 Forbidden: Not authorized to update (notification belongs to another user).
  - 404 Not Found: Notification not found.

Ownership enforcement:
- The service fetches the notification and verifies that user_id matches the authenticated user before marking as read.

#### PATCH /api/notifications/read-all
- Purpose: Mark all notifications for the authenticated user as read.
- Authentication: Required (Bearer JWT).
- Response:
  - 200 OK: { count: number } (number of notifications marked as read).
  - 401 Unauthorized: Missing or invalid token.

Bulk update:
- Repository performs an UPDATE with conditions to mark only unread notifications as read and returns the affected count.

### Notification Types
Supported notification types:
- proposal_received
- proposal_accepted
- proposal_rejected
- milestone_submitted
- milestone_approved
- payment_released
- dispute_created
- dispute_resolved
- rating_received
- message

These types are defined in the repository and mapped to the API model. Additional helper functions exist in the service to create notifications for specific workflow events.

### Pagination Mechanism
- The repository uses Supabase range queries with ORDER BY created_at DESC.
- QueryOptions supports limit/offset semantics; the route handler forwards maxItemCount and continuationToken to the service, which maps them to repository options.
- Response includes hasMore and total to guide client-side pagination.

```mermaid
flowchart TD
Start(["Route Handler"]) --> Parse["Parse query params<br/>maxItemCount, continuationToken"]
Parse --> BuildOptions["Build QueryOptions<br/>limit/offset"]
BuildOptions --> RepoCall["Repository getNotificationsByUser(userId, options)"]
RepoCall --> RangeQuery["Supabase range + order by created_at desc"]
RangeQuery --> Result["PaginatedResult { items, hasMore, total }"]
Result --> Map["Map entities to API models"]
Map --> Respond["Return 200 with items, hasMore, total"]
```

### Request/Response Schemas

#### Notification Object
- id: string (UUID)
- userId: string (UUID)
- type: enum of supported notification types
- title: string
- message: string
- data: object (arbitrary JSON)
- isRead: boolean
- createdAt: string (ISO 8601)

#### List Response
- items: array of Notification
- hasMore: boolean
- total: number (optional)

#### Unread Count Response
- count: number

#### Error Response
- error: { code: string, message: string, details?: array }
- timestamp: string (ISO 8601)
- requestId: string (UUID)

### Client Implementation Examples

#### Fetching a User’s Notification List
- Endpoint: GET /api/notifications
- Headers: Authorization: Bearer <JWT>
- Query parameters:
  - maxItemCount: integer (1–100)
  - continuationToken: string (pagination token)
- Response handling:
  - Store items in a local list.
  - Use hasMore to determine if more pages exist.
  - Persist total for progress indicators.

#### Marking a Notification as Read
- Endpoint: PATCH /api/notifications/:id/read
- Headers: Authorization: Bearer <JWT>
- Path parameter: id (UUID)
- On success:
  - Update the corresponding item in the client cache to isRead=true.
  - Decrement the unread count displayed in the UI.

#### Retrieving the Unread Notification Count
- Endpoint: GET /api/notifications/unread-count
- Headers: Authorization: Bearer <JWT>
- On success:
  - Update the badge or indicator showing unread count.

#### Building a Real-Time Notification Center
- Polling strategy:
  - Initial load: GET /api/notifications with maxItemCount and continuationToken.
  - Periodic polling: Every 15–30 seconds for unread count and/or recent notifications.
  - Debounce: Coalesce rapid updates to reduce network overhead.
- Real-time enhancements:
  - WebSocket or Server-Sent Events (if available) to push updates.
  - Merge incoming events with cached items and deduplicate by id.
- UX patterns:
  - Badge for unread count.
  - Timestamps and grouped by date.
  - Mark as read on click or after viewing.

[No sources needed since this section provides general guidance]

## Dependency Analysis
The notification API stack exhibits clear separation of concerns with low coupling between layers.

```mermaid
graph LR
Routes["notification-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Service["notification-service.ts"]
Service --> Repo["notification-repository.ts"]
Repo --> DB["schema.sql notifications table"]
Swagger["swagger.ts"] --> Routes
```

## Performance Considerations
- Pagination:
  - Use maxItemCount to cap page sizes (1–100) and continuationToken for subsequent pages.
  - Sort by created_at DESC to leverage database indexes.
- Indexes:
  - notifications(user_id) and notifications(is_read) improve filtering and counting performance.
- Bulk operations:
  - read-all endpoint updates only unread notifications, minimizing unnecessary writes.
- Polling cadence:
  - Avoid excessive polling intervals; 15–30 seconds is often sufficient for near-real-time updates.
  - Cache results locally and invalidate only changed items.
- Network efficiency:
  - Prefer incremental updates (unread count + recent items) over full reloads.
  - Debounce UI updates to prevent flickering.

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized:
  - Ensure Authorization header is present and formatted as Bearer <JWT>.
  - Verify token validity and expiration.
- 403 Forbidden (mark as read):
  - Occurs when attempting to update a notification that does not belong to the authenticated user.
  - Confirm the notification id belongs to the current user.
- 404 Not Found (mark as read):
  - The notification id may not exist or was deleted.
- 400 Bad Request (invalid UUID):
  - Validate the id parameter format as a UUID.
- Excessive polling:
  - Reduce polling interval or switch to event-driven updates.
- Pagination confusion:
  - Use hasMore and total to manage client-side pagination state.

## Conclusion
The notification API provides a robust, authenticated set of endpoints for retrieving, marking as read, and counting unread notifications. It supports efficient pagination and adheres to a clean layered architecture. By following the documented schemas, authentication requirements, and performance recommendations, clients can build reliable notification centers with real-time capabilities.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Appendix A: Notification Type Details
- proposal_received: Triggered when a freelancer submits a proposal for an employer’s project.
- proposal_accepted: Triggered when an employer accepts a freelancer’s proposal.
- proposal_rejected: Triggered when an employer rejects a freelancer’s proposal.
- milestone_submitted: Triggered when a freelancer submits a milestone for review.
- milestone_approved: Triggered when an employer approves a milestone.
- payment_released: Triggered when payment for a milestone is released.
- dispute_created: Triggered when a dispute is opened for a milestone.
- dispute_resolved: Triggered when a dispute is resolved.
- rating_received: Triggered when a user receives a rating.
- message: General message notifications.

### Appendix B: Example Requests and Responses
- Fetch notifications:
  - GET /api/notifications?maxItemCount=20
  - Response: { items: [...], hasMore: true, total: 120 }
- Mark as read:
  - PATCH /api/notifications/:id/read
  - Response: { id, userId, type, title, message, data, isRead: true, createdAt }
- Unread count:
  - GET /api/notifications/unread-count
  - Response: { count: 5 }

---

# Get Unread Notification Count

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
This document provides API documentation for the GET /api/notifications/unread-count endpoint. It returns the number of unread notifications for the authenticated user. The endpoint is lightweight, requiring no request parameters, and responds with a simple JSON payload containing a count field. This design enables efficient real-time badge updates in the UI without transferring full notification payloads.

## Project Structure
The endpoint is implemented using a layered architecture:
- Route handler validates authentication and delegates to the service layer.
- Service layer orchestrates repository operations.
- Repository executes a database query optimized for counting unread notifications.
- Supabase client and table constants define the data access layer.

```mermaid
graph TB
Client["Client App"] --> Routes["Routes: notification-routes.ts"]
Routes --> Auth["Auth Middleware: auth-middleware.ts"]
Routes --> Service["Service: notification-service.ts"]
Service --> Repo["Repository: notification-repository.ts"]
Repo --> Supabase["Supabase Client: supabase.ts"]
Supabase --> DB["PostgreSQL Table: notifications"]
```

## Core Components
- Endpoint: GET /api/notifications/unread-count
- Authentication: Bearer token required via Authorization header
- Request: No query parameters
- Response: JSON object with a count field representing unread notifications
- Example response: {"count": 3}

Implementation highlights:
- Lightweight response avoids transferring full notification payloads
- Optimized database query uses COUNT aggregation with user ID and is_read filters
- Real-time badge updates are enabled by frequent polling or push alternatives

## Architecture Overview
The endpoint follows a clean separation of concerns:
- Route layer: Validates authentication and constructs the response
- Service layer: Provides business logic and error handling wrapper
- Repository layer: Performs database operations with Supabase client
- Data model: Uses the notifications table with indexes for performance

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Routes"
participant A as "Auth Middleware"
participant S as "Service"
participant P as "Repository"
participant D as "Supabase/DB"
C->>R : "GET /api/notifications/unread-count"
R->>A : "Validate Bearer token"
A-->>R : "Authenticated user info"
R->>S : "getUnreadCount(userId)"
S->>P : "getUnreadCount(userId)"
P->>D : "COUNT unread notifications for user"
D-->>P : "count"
P-->>S : "count"
S-->>R : "{ success : true, data : count }"
R-->>C : "{ count }"
```

## Detailed Component Analysis

### Endpoint Definition and Behavior
- HTTP Method: GET
- Path: /api/notifications/unread-count
- Authentication: Required (Bearer token)
- Request body: Not applicable
- Query parameters: None
- Response: JSON with a single count field

Behavior:
- Returns the number of unread notifications for the authenticated user
- Uses user ID from the validated token to filter records
- Responds with a 200 status and a simple JSON object

### Authentication Flow
The route enforces authentication using a Bearer token. The middleware validates the Authorization header format and verifies the token, attaching user information to the request object.

```mermaid
flowchart TD
Start(["Request Received"]) --> CheckHeader["Check Authorization Header"]
CheckHeader --> HeaderValid{"Header Present<br/>and Format Correct?"}
HeaderValid --> |No| Send401["Send 401 Unauthorized"]
HeaderValid --> |Yes| ValidateToken["Validate Bearer Token"]
ValidateToken --> TokenValid{"Token Valid?"}
TokenValid --> |No| Send401b["Send 401 Unauthorized"]
TokenValid --> |Yes| AttachUser["Attach User Info to Request"]
AttachUser --> Next["Call Next Handler"]
Send401 --> End(["End"])
Send401b --> End
Next --> End
```

### Service Layer Implementation
The service layer wraps repository calls and returns a standardized result structure. For unread count, it simply delegates to the repository.

Responsibilities:
- Standardized success/error result pattern
- Delegation to repository for database operations
- Returning primitive counts for lightweight responses

### Repository and Database Query
The repository performs an optimized COUNT query:
- Filters by user_id
- Filters by is_read = false
- Uses head: true and count: 'exact' to return only the count
- Returns a numeric count

Database schema and indexes:
- Table: notifications
- Columns: id, user_id, type, title, message, data, is_read, created_at, updated_at
- Indexes: user_id, is_read

```mermaid
flowchart TD
StartRepo(["getUnreadCount(userId)"]) --> BuildQuery["Build Supabase Query"]
BuildQuery --> ApplyFilters["Apply filters:<br/>user_id = userId<br/>is_read = false"]
ApplyFilters --> SelectCount["Select with count: 'exact'<br/>head: true"]
SelectCount --> ExecQuery["Execute Query"]
ExecQuery --> ReturnCount["Return count"]
ReturnCount --> EndRepo(["End"])
```

### Real-Time Badge Updates
Why this endpoint is ideal for badges:
- Minimal payload: only a count integer
- Fast network transfer
- Low CPU/memory overhead on client
- Efficient server-side COUNT aggregation

How to integrate:
- Poll the endpoint at short intervals to keep the badge fresh
- Update the UI immediately upon receiving a new count
- Reset or hide the badge when count reaches zero

## Dependency Analysis
The endpoint’s dependencies form a straightforward chain from route to database.

```mermaid
graph LR
Routes["notification-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Service["notification-service.ts"]
Service --> Repo["notification-repository.ts"]
Repo --> Supabase["supabase.ts"]
Repo --> Schema["schema.sql (notifications)"]
```

## Performance Considerations
- Why COUNT is efficient:
  - Head-only query with count: 'exact'
  - Minimal data transfer compared to fetching rows
  - Database can leverage indexes on user_id and is_read
- Indexes:
  - notifications(user_id) and notifications(is_read) are created in schema
- Comparison to client-side counting:
  - Fetching all unread notifications and counting on the client increases payload size and processing time
  - Server-side COUNT reduces bandwidth and CPU usage
- Caching strategies:
  - Short-lived cache (e.g., Redis or in-memory) keyed by user_id
  - TTL aligned with polling interval to balance freshness and load
  - Invalidate cache on mark-as-read operations
- Rate limiting:
  - Apply per-user rate limits to prevent abuse
  - Consider exponential backoff for clients that poll aggressively

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized:
  - Missing or malformed Authorization header
  - Invalid or expired Bearer token
  - Resolution: Ensure Authorization: Bearer <token> is present and valid
- 400 Bad Request:
  - Service-level error from getUnreadCount
  - Resolution: Retry after a short delay; check server logs
- Database errors:
  - Supabase client errors during COUNT query
  - Resolution: Verify database connectivity and indexes; check Supabase logs

Operational checks:
- Confirm auth middleware attaches user info to the request
- Verify repository query executes with correct filters
- Ensure notifications table exists and indexes are present

## Conclusion
The GET /api/notifications/unread-count endpoint delivers a lightweight, efficient mechanism for real-time badge updates. By leveraging a server-side COUNT query filtered by user ID and unread status, it minimizes payload size and database load. Combined with appropriate polling intervals or push technologies, it provides responsive UI feedback while maintaining scalability.

---

# Mark Notification as Read

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
This document provides API documentation for the PATCH /api/notifications/:id/read endpoint that marks a specific notification as read. It covers the HTTP method, path parameter, request body, success and error responses, and the backend flow from route to service to repository and database. It also explains JWT-based ownership verification via auth-middleware, idempotency considerations, race conditions in high-frequency scenarios, and best practices for client-side state synchronization.

## Project Structure
The notification read endpoint is implemented as part of the notifications module:
- Route handler: defines the endpoint, applies middleware, and returns responses
- Service layer: orchestrates business logic and ownership checks
- Repository layer: performs database updates
- Middleware: JWT validation and UUID parameter validation
- Entity mapper: converts database rows to API models

```mermaid
graph TB
Client["Client"] --> Routes["Routes<br/>notification-routes.ts"]
Routes --> AuthMW["Auth Middleware<br/>auth-middleware.ts"]
Routes --> Validator["UUID Validator<br/>validation-middleware.ts"]
Routes --> Service["Notification Service<br/>notification-service.ts"]
Service --> Repo["Notification Repository<br/>notification-repository.ts"]
Repo --> DB["Supabase Table<br/>notifications"]
Service --> Mapper["Entity Mapper<br/>entity-mapper.ts"]
```

## Core Components
- Endpoint: PATCH /api/notifications/:id/read
- Path parameter: id (UUID)
- Request body: empty
- Authentication: Bearer token required
- Ownership verification: JWT subject must match notification’s user_id
- Success response: 200 with the updated notification model
- Error responses:
  - 400: Invalid UUID format
  - 401: Unauthorized (missing/invalid/expired token)
  - 403: Forbidden (not authorized to update)
  - 404: Not found (notification does not exist)
  - 500: Internal server error (unexpected failure)

## Architecture Overview
The PATCH /api/notifications/:id/read flow:
1. Route handler validates JWT and UUID
2. Service retrieves notification and verifies ownership
3. Repository updates is_read flag
4. Mapper transforms to API model
5. Route handler returns 200 with updated notification

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler<br/>notification-routes.ts"
participant A as "Auth Middleware<br/>auth-middleware.ts"
participant V as "UUID Validator<br/>validation-middleware.ts"
participant S as "Service<br/>notification-service.ts"
participant P as "Repository<br/>notification-repository.ts"
participant M as "Mapper<br/>entity-mapper.ts"
C->>R : "PATCH /api/notifications/ : id/read"
R->>A : "Validate Bearer token"
A-->>R : "req.user populated"
R->>V : "Validate path param id as UUID"
V-->>R : "Validation passed"
R->>S : "markNotificationAsRead(id, userId)"
S->>P : "getNotificationById(id)"
P-->>S : "NotificationEntity or null"
S->>S : "Ownership check (user_id vs userId)"
S->>P : "update id set is_read=true"
P-->>S : "Updated NotificationEntity"
S->>M : "mapNotificationFromEntity"
M-->>S : "Notification model"
S-->>R : "{ success : true, data : Notification }"
R-->>C : "200 OK with Notification"
```

## Detailed Component Analysis

### Endpoint Definition and Behavior
- Method: PATCH
- Path: /api/notifications/:id/read
- Path parameter: id (UUID)
- Request body: empty
- Authentication: Bearer token required
- Ownership verification: The authenticated user’s ID must match the notification’s user_id
- Success: 200 with the updated notification model
- Errors:
  - 400: Invalid UUID format
  - 401: Unauthorized (missing/invalid/expired token)
  - 403: Forbidden (not authorized to update)
  - 404: Not found (notification does not exist)
  - 500: Internal server error (unexpected failure)

### Route Handler
- Applies authMiddleware to enforce JWT presence and validity
- Applies validateUUID to ensure id is a valid UUID
- Calls markNotificationAsRead(service) with notificationId and authenticated userId
- Maps service error codes to HTTP status codes (404 for NOT_FOUND, 403 for UNAUTHORIZED)
- Returns 200 with the updated notification model on success

### Auth Middleware
- Extracts Authorization header and ensures format "Bearer <token>"
- Validates token via service and populates req.user with decoded claims
- Returns 401 for missing header, invalid format, expired, or invalid token

### UUID Validation Middleware
- Validates that path parameter id matches UUID v4 format
- Returns 400 with VALIDATION_ERROR when invalid

### Service Layer
- Retrieves notification by id
- Checks ownership: notification.user_id must equal authenticated userId
- Updates is_read to true via repository
- Maps entity to API model and returns success
- Returns error codes: NOT_FOUND, UNAUTHORIZED, UPDATE_FAILED

### Repository Layer
- getNotificationById(id) returns entity or null
- markAsRead(id) updates is_read to true and returns updated entity or null
- Throws on database errors

### Entity Mapper
- mapNotificationFromEntity converts NotificationEntity to Notification model (id, userId, type, title, message, data, isRead, createdAt)

### Practical Example: Proposal Acceptance Notification
Scenario: After viewing a proposal acceptance notification, the client calls PATCH /api/notifications/:id/read to mark it as read.

Steps:
1. Client obtains a valid Bearer token
2. Client sends PATCH with empty body to /api/notifications/{proposalAcceptedId}/read
3. Server validates token and UUID
4. Service loads the notification and verifies ownership
5. Repository sets is_read=true
6. Mapper returns the updated notification model
7. Client receives 200 with the updated notification

Best practices:
- Store the returned notification in local state to reflect the change immediately
- Update unread counters and lists accordingly
- Handle 404 gracefully (e.g., notification already read or deleted)

## Dependency Analysis
Key dependencies and interactions:
- Routes depend on auth-middleware and validation-middleware
- Routes call notification-service
- Service depends on notification-repository and entity-mapper
- Repository interacts with Supabase notifications table

```mermaid
graph LR
Routes["notification-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Validator["validation-middleware.ts"]
Routes --> Service["notification-service.ts"]
Service --> Repo["notification-repository.ts"]
Service --> Mapper["entity-mapper.ts"]
Repo --> DB["Supabase notifications table"]
```

## Performance Considerations
- Idempotency: The endpoint is idempotent. Repeatedly marking the same notification as read will return the same updated model without causing duplicates or extra writes.
- Race conditions: In high-frequency scenarios, multiple clients may attempt to mark the same notification as read concurrently. The repository update is a single-row write; the service enforces ownership before updating. While the database update itself is atomic, concurrent reads may briefly show is_read=false until the write completes. This is acceptable for UI state updates.
- Best practices:
  - Client-side optimistic updates: Immediately mark the notification as read locally upon receiving a successful response
  - Debounce rapid clicks to avoid redundant requests
  - Use a single source of truth for unread counts and lists

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 400 Invalid UUID format: Ensure the path parameter id is a valid UUID v4
- 401 Unauthorized: Verify the Authorization header is present and formatted as "Bearer <token>". Confirm the token is valid and not expired
- 403 Forbidden: The notification exists but does not belong to the authenticated user
- 404 Not found: The notification ID does not exist or has been deleted
- 500 Internal server error: Unexpected failure during database update; retry after a short delay

## Conclusion
The PATCH /api/notifications/:id/read endpoint provides a straightforward mechanism to mark a notification as read. It enforces JWT-based ownership verification, validates the UUID path parameter, and returns the updated notification model on success. The flow is idempotent and designed to handle typical client-side state synchronization patterns. For robust applications, apply optimistic UI updates and handle error responses gracefully.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Definition Summary
- Method: PATCH
- Path: /api/notifications/:id/read
- Path parameters:
  - id: string (UUID)
- Request body: empty
- Authentication: Bearer token
- Success: 200 with Notification model
- Errors: 400 (invalid UUID), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (internal error)

### Backend Flow Diagram (Code-Level)
```mermaid
flowchart TD
Start(["Route Entry"]) --> CheckAuth["Check Authorization Header"]
CheckAuth --> AuthOK{"Token Valid?"}
AuthOK -- "No" --> Resp401["Return 401 Unauthorized"]
AuthOK -- "Yes" --> ValidateUUID["Validate UUID Path Param"]
ValidateUUID --> UUIDOK{"UUID Valid?"}
UUIDOK -- "No" --> Resp400["Return 400 Invalid UUID"]
UUIDOK -- "Yes" --> LoadNotif["Load Notification By ID"]
LoadNotif --> Found{"Exists?"}
Found -- "No" --> Resp404["Return 404 Not Found"]
Found -- "Yes" --> CheckOwner["Verify Ownership (user_id == userId)"]
CheckOwner --> OwnerOK{"Authorized?"}
OwnerOK -- "No" --> Resp403["Return 403 Forbidden"]
OwnerOK -- "Yes" --> UpdateIsRead["Set is_read=true"]
UpdateIsRead --> MapModel["Map to Notification Model"]
MapModel --> Resp200["Return 200 with Notification"]
```

---

# Retrieve Notifications

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
This document provides API documentation for retrieving a user’s notifications via the GET /api/notifications endpoint. It covers the HTTP method, query parameters for pagination, response format, and the integration between the route handler, service layer, and database layer. It also explains how continuation tokens enable efficient cursor-based pagination for large datasets, and offers guidance for client-side implementation and error handling.

## Project Structure
The notifications feature is implemented across several layers:
- Route handler: defines the endpoint, validates JWT, parses query parameters, and returns paginated results.
- Service layer: orchestrates business logic and delegates database operations.
- Repository layer: encapsulates database queries using Supabase client.
- Entity mapping: converts database entities to API models.
- Middleware: enforces JWT authentication.
- Configuration: exposes table names and Supabase client.

```mermaid
graph TB
Client["Client"] --> Routes["Routes: notification-routes.ts"]
Routes --> AuthMW["Middleware: auth-middleware.ts"]
Routes --> Service["Service: notification-service.ts"]
Service --> Repo["Repository: notification-repository.ts"]
Repo --> Supabase["Supabase Client"]
Repo --> Config["Config: supabase.ts"]
Service --> Mapper["Mapper: entity-mapper.ts"]
Routes --> Response["JSON Response"]
```

## Core Components
- Endpoint: GET /api/notifications
- Authentication: Bearer token required via Authorization header
- Query parameters:
  - maxItemCount (integer, min 1, max 100): controls the number of items returned
  - continuationToken (string): cursor token for pagination
- Response format:
  - items: array of notifications
  - hasMore: boolean indicating if more pages exist
  - total: optional total count when supported by the underlying query

Each notification includes:
- id: string
- userId: string
- type: enum of supported notification types
- title: string
- message: string
- data: object with relevant metadata
- isRead: boolean
- createdAt: ISO timestamp

Supported notification types include proposal_received, proposal_accepted, proposal_rejected, milestone_submitted, milestone_approved, payment_released, dispute_created, dispute_resolved, rating_received, and message.

## Architecture Overview
The GET /api/notifications flow integrates the route handler, authentication middleware, service, repository, and Supabase client.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler<br/>notification-routes.ts"
participant MW as "Auth Middleware<br/>auth-middleware.ts"
participant S as "Service<br/>notification-service.ts"
participant RP as "Repository<br/>notification-repository.ts"
participant DB as "Supabase Client"
C->>R : "GET /api/notifications<br/>Authorization : Bearer <token><br/>maxItemCount, continuationToken"
R->>MW : "Validate JWT"
MW-->>R : "User info or 401"
alt "Unauthorized"
R-->>C : "401 Unauthorized"
else "Authorized"
R->>S : "getNotificationsByUser(userId, options)"
S->>RP : "getNotificationsByUser(userId, options)"
RP->>DB : "SELECT ... ORDER BY created_at DESC<br/>LIMIT/offset or cursor"
DB-->>RP : "Items, count"
RP-->>S : "PaginatedResult<NotificationEntity[]>"
S-->>R : "PaginatedResult<Notification[]>"
R-->>C : "200 OK { items, hasMore, total }"
end
```

## Detailed Component Analysis

### Route Handler: GET /api/notifications
- Validates JWT via auth middleware and extracts user identity.
- Parses query parameters maxItemCount and continuationToken.
- Calls service function getNotificationsByUser with userId and options.
- Returns JSON response with items, hasMore, and total.

```mermaid
flowchart TD
Start(["Route Entry"]) --> Parse["Parse query params<br/>maxItemCount, continuationToken"]
Parse --> Options["Build options object"]
Options --> CallService["Call getNotificationsByUser(userId, options)"]
CallService --> Result{"Service success?"}
Result --> |No| ReturnErr["Return 400 with error payload"]
Result --> |Yes| ReturnOK["Return 200 with items, hasMore, total"]
ReturnErr --> End(["Exit"])
ReturnOK --> End
```

### Service Layer: NotificationService
- getNotificationsByUser(userId, options):
  - Delegates to repository getNotificationsByUser.
  - Maps NotificationEntity[] to Notification[] using entity-mapper.
  - Wraps result in PaginatedResult with hasMore and total.

```mermaid
classDiagram
class NotificationService {
+getNotificationsByUser(userId, options) NotificationServiceResult
}
class NotificationRepository {
+getNotificationsByUser(userId, options) PaginatedResult<NotificationEntity>
}
class EntityMapper {
+mapNotificationFromEntity(entity) Notification
}
NotificationService --> NotificationRepository : "delegates"
NotificationService --> EntityMapper : "maps"
```

### Repository Layer: NotificationRepository
- getNotificationsByUser(userId, options):
  - Uses Supabase client to select notifications for the given user.
  - Orders by created_at descending.
  - Applies LIMIT and OFFSET derived from options.
  - Computes hasMore and total count.

```mermaid
flowchart TD
Enter(["Repository Entry"]) --> BuildQuery["Build SELECT with filters<br/>user_id, order by created_at desc"]
BuildQuery --> ApplyLimit["Apply LIMIT/OFFSET from options"]
ApplyLimit --> Exec["Execute query"]
Exec --> Count["Compute hasMore and total"]
Count --> Return(["Return PaginatedResult"])
```

### Authentication Middleware
- Ensures Authorization header is present and formatted as Bearer <token>.
- Validates token and attaches user info to request.
- Returns 401 for missing/invalid/expired tokens.

```mermaid
flowchart TD
Start(["Middleware Entry"]) --> CheckHeader["Check Authorization header"]
CheckHeader --> HeaderOK{"Header present and Bearer?"}
HeaderOK --> |No| Return401["Return 401 Unauthorized"]
HeaderOK --> |Yes| Validate["Validate token"]
Validate --> ValidRes{"Valid?"}
ValidRes --> |No| Return401
ValidRes --> |Yes| Attach["Attach user to request"] --> Next(["Call next()"])
```

### Response Format and Example
- Response shape:
  - items: array of notifications
  - hasMore: boolean
  - total: number (optional)
- Example request:
  - Method: GET
  - Path: /api/notifications
  - Headers: Authorization: Bearer <JWT>
  - Query: maxItemCount=50
- Example paginated response:
  - items: [
    { id, userId, type, title, message, data, isRead, createdAt },
    ...
  ]
  - hasMore: true
  - total: 1200

Note: The repository currently uses LIMIT/OFFSET semantics. The route handler documents continuationToken for pagination. For cursor-based pagination, the repository would need to be adapted to accept a cursor token and translate it into a LIMIT/OFFSET or equivalent query.

## Dependency Analysis
- Route handler depends on:
  - auth-middleware for JWT validation
  - notification-service for business logic
- Service depends on:
  - notification-repository for data access
  - entity-mapper for model conversion
- Repository depends on:
  - Supabase client from configuration
  - TABLES constant for table name

```mermaid
graph LR
Routes["notification-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Service["notification-service.ts"]
Service --> Repo["notification-repository.ts"]
Repo --> Config["supabase.ts"]
Service --> Mapper["entity-mapper.ts"]
```

## Performance Considerations
- Cursor-based pagination:
  - The route handler documents continuationToken, but the repository currently uses LIMIT/OFFSET. For very large datasets, cursor-based pagination (using a cursor derived from the last item’s created_at and id) can reduce scanning overhead compared to OFFSET.
- Sorting and indexing:
  - Queries sort by created_at DESC. Ensure database indexes exist on user_id and created_at for optimal performance.
- Batch size:
  - maxItemCount controls batch size. Keep reasonable limits (e.g., 50–100) to balance latency and round-trips.
- Total count:
  - Exact count queries can be expensive. Consider returning total only when needed or caching counts.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized:
  - Missing or invalid Authorization header. Ensure Bearer <token> is sent.
  - Expired token: client should refresh or re-authenticate.
- 400 Bad Request:
  - Validation errors from service or repository. Check query parameters and retry.
- 500 Internal Server Error:
  - Database connectivity or query failures. Verify Supabase configuration and network.

Client-side guidance:
- Infinite scroll:
  - On initial load, call GET /api/notifications with maxItemCount.
  - On subsequent loads, pass continuationToken to fetch next page.
  - Stop when hasMore is false.
- Error handling:
  - 401: prompt user to log in again or refresh token.
  - 403: inform user lacks permission.
  - 404: handle missing resource scenarios gracefully.
  - 400: display validation messages and allow retry.

## Conclusion
The GET /api/notifications endpoint provides paginated access to a user’s notifications with JWT authentication. While the route handler documents continuationToken, the current repository implementation uses LIMIT/OFFSET. For large-scale deployments, adopting cursor-based pagination in the repository would improve performance. Clients should implement infinite scroll with maxItemCount and continuationToken, and handle 401/403/404/400 responses appropriately.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Definition: GET /api/notifications
- Method: GET
- Path: /api/notifications
- Authentication: Bearer <token>
- Query Parameters:
  - maxItemCount (integer, min 1, max 100)
  - continuationToken (string)
- Response:
  - 200 OK: { items: Notification[], hasMore: boolean, total?: number }
  - 400 Bad Request: error payload
  - 401 Unauthorized: error payload
- Example request:
  - Authorization: Bearer <JWT>
  - maxItemCount: 50
- Example response:
  - items: Array of notifications
  - hasMore: true/false
  - total: optional

---

# API Endpoints Reference

## Table of Contents
1. [Introduction](#introduction)
2. [Authentication Endpoints](#authentication-endpoints)
3. [Projects Endpoints](#projects-endpoints)
4. [Proposals Endpoints](#proposals-endpoints)
5. [Contracts Endpoints](#contracts-endpoints)
6. [Payments Endpoints](#payments-endpoints)
7. [Disputes Endpoints](#disputes-endpoints)
8. [Notifications Endpoints](#notifications-endpoints)
9. [KYC Endpoints](#kyc-endpoints)
10. [Matching Endpoints](#matching-endpoints)
11. [Search Endpoints](#search-endpoints)
12. [Error Handling](#error-handling)
13. [Rate Limiting Policies](#rate-limiting-policies)
14. [Client Implementation Examples](#client-implementation-examples)
15. [Versioning Strategy](#versioning-strategy)

## Introduction
This document provides comprehensive API documentation for the FreelanceXchain system, a decentralized freelance marketplace with AI skill matching and blockchain payments. The API follows RESTful principles and uses JWT for authentication. All endpoints are versioned through the base URL path `/api` and return JSON responses.

The API is organized into logical groups based on functionality:
- **Authentication**: User registration, login, and token management
- **Projects**: Project creation, management, and discovery
- **Proposals**: Freelancer submissions for projects
- **Contracts**: Agreement management between parties
- **Payments**: Milestone-based payment processing
- **Disputes**: Conflict resolution for payment issues
- **Notifications**: Real-time communication between users
- **KYC**: Identity verification and compliance
- **Matching**: AI-powered skill and project recommendations
- **Search**: Filtering and discovery of projects and freelancers

All endpoints require authentication via JWT bearer tokens, except for public endpoints like health checks and OAuth initiation. The API uses consistent error response formats and implements rate limiting to prevent abuse.

## Authentication Endpoints

The authentication system provides standard user registration and login functionality with JWT token management. It also supports OAuth integration with external providers (Google, GitHub, Azure, LinkedIn) through Supabase.

```mermaid
sequenceDiagram
participant Client
participant AuthController
participant AuthService
Client->>AuthController : POST /api/auth/register
AuthController->>AuthService : register(input)
AuthService-->>AuthController : AuthResult or AuthError
AuthController-->>Client : 201 Created or 4xx Error
Client->>AuthController : POST /api/auth/login
AuthController->>AuthService : login(credentials)
AuthService-->>AuthController : AuthResult or AuthError
AuthController-->>Client : 200 OK or 401 Unauthorized
Client->>AuthController : POST /api/auth/refresh
AuthController->>AuthService : refreshTokens(refreshToken)
AuthService-->>AuthController : New tokens or AuthError
AuthController-->>Client : 200 OK or 401 Unauthorized
```

### User Registration
Registers a new user account and returns authentication tokens.

**HTTP Method**: `POST`  
**URL Pattern**: `/api/auth/register`  
**Authentication Required**: No  
**Rate Limit**: 10 attempts per 15 minutes

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "role": "freelancer",
  "name": "John Doe",
  "walletAddress": "0x742d35Cc6634C0532925a3b8D4C0cD1111111111"
}
```

**Response (201 Created)**:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "freelancer",
    "walletAddress": "0x742d35Cc6634C0532925a3b8D4C0cD1111111111",
    "createdAt": "2023-01-01T00:00:00Z",
    "updatedAt": "2023-01-01T00:00:00Z"
  },
  "accessToken": "jwt-token",
  "refreshToken": "refresh-token"
}
```

**Error Codes**:
- `400`: Validation error (invalid email, weak password, etc.)
- `409`: Email already registered

### User Login
Authenticates a user and returns JWT tokens.

**HTTP Method**: `POST`  
**URL Pattern**: `/api/auth/login`  
**Authentication Required**: No  
**Rate Limit**: 10 attempts per 15 minutes

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200 OK)**:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "freelancer",
    "walletAddress": "0x742d35Cc6634C0532925a3b8D4C0cD1111111111",
    "createdAt": "2023-01-01T00:00:00Z",
    "updatedAt": "2023-01-01T00:00:00Z"
  },
  "accessToken": "jwt-token",
  "refreshToken": "refresh-token"
}
```

**Error Codes**:
- `400`: Validation error
- `401`: Invalid credentials

### Token Refresh
Uses a refresh token to obtain new access and refresh tokens.

**HTTP Method**: `POST`  
**URL Pattern**: `/api/auth/refresh`  
**Authentication Required**: No  
**Rate Limit**: 10 attempts per 15 minutes

**Request Body**:
```json
{
  "refreshToken": "refresh-token"
}
```

**Response (200 OK)**:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "freelancer",
    "walletAddress": "0x742d35Cc6634C0532925a3b8D4C0cD1111111111",
    "createdAt": "2023-01-01T00:00:00Z",
    "updatedAt": "2023-01-01T00:00:00Z"
  },
  "accessToken": "new-jwt-token",
  "refreshToken": "new-refresh-token"
}
```

**Error Codes**:
- `400`: Validation error
- `401`: Invalid or expired refresh token

### OAuth Integration
Supports OAuth login with external providers. The flow involves redirecting to the provider, handling the callback, and exchanging the authorization code for tokens.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/auth/oauth/:provider`  
**Authentication Required**: No  
**Supported Providers**: `google`, `github`, `azure`, `linkedin`

**Response**: 302 redirect to the OAuth provider

## Projects Endpoints

The projects endpoints allow employers to create, manage, and discover projects. Projects represent work opportunities that freelancers can apply to with proposals.

```mermaid
sequenceDiagram
participant Employer
participant ProjectController
participant ProjectService
Employer->>ProjectController : POST /api/projects
ProjectController->>ProjectService : createProject()
ProjectService-->>ProjectController : Project or Error
ProjectController-->>Employer : 201 Created
Employer->>ProjectController : GET /api/projects
ProjectController->>ProjectService : listOpenProjects()
ProjectService-->>ProjectController : Project list
ProjectController-->>Employer : 200 OK
Employer->>ProjectController : PATCH /api/projects/{id}
ProjectController->>ProjectService : updateProject()
ProjectService-->>ProjectController : Updated project
ProjectController-->>Employer : 200 OK
```

### Create Project
Creates a new project (employer only).

**HTTP Method**: `POST`  
**URL Pattern**: `/api/projects`  
**Authentication Required**: Yes (Bearer JWT)  
**Required Role**: `employer`  
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "title": "Web Development Project",
  "description": "Need a full-stack developer for a React and Node.js application",
  "requiredSkills": [
    {
      "skillId": "uuid",
      "yearsOfExperience": 3
    }
  ],
  "budget": 5000,
  "deadline": "2023-12-31T00:00:00Z"
}
```

**Response (201 Created)**:
```json
{
  "id": "uuid",
  "employerId": "uuid",
  "title": "Web Development Project",
  "description": "Need a full-stack developer for a React and Node.js application",
  "requiredSkills": [
    {
      "skillId": "uuid",
      "skillName": "React",
      "categoryId": "uuid",
      "yearsOfExperience": 3
    }
  ],
  "budget": 5000,
  "deadline": "2023-12-31T00:00:00Z",
  "status": "draft",
  "milestones": [],
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-01T00:00:00Z"
}
```

**Error Codes**:
- `400`: Validation error
- `401`: Unauthorized
- `409`: Project locked (has accepted proposals)

### Get Project Details
Retrieves details of a specific project.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/projects/{id}`  
**Authentication Required**: No  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
```json
{
  "id": "uuid",
  "employerId": "uuid",
  "title": "Web Development Project",
  "description": "Need a full-stack developer for a React and Node.js application",
  "requiredSkills": [
    {
      "skillId": "uuid",
      "skillName": "React",
      "categoryId": "uuid",
      "yearsOfExperience": 3
    }
  ],
  "budget": 5000,
  "deadline": "2023-12-31T00:00:00Z",
  "status": "open",
  "milestones": [
    {
      "id": "uuid",
      "title": "Initial Design",
      "description": "Create wireframes and UI design",
      "amount": 1000,
      "dueDate": "2023-06-30T00:00:00Z",
      "status": "pending"
    }
  ],
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-01T00:00:00Z"
}
```

**Error Codes**:
- `400`: Invalid UUID format
- `404`: Project not found

### Update Project
Updates an existing project (employer only, project must not have accepted proposals).

**HTTP Method**: `PATCH`  
**URL Pattern**: `/api/projects/{id}`  
**Authentication Required**: Yes (Bearer JWT)  
**Required Role**: `employer`  
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "title": "Updated Project Title",
  "description": "Updated project description",
  "budget": 6000,
  "status": "open"
}
```

**Response (200 OK)**:
Returns the updated project object in the same format as GET.

**Error Codes**:
- `400`: Validation error
- `401`: Unauthorized
- `404`: Project not found
- `409`: Project locked (has accepted proposals)

### List Projects with Filters
Retrieves a list of open projects with optional filters.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/projects`  
**Authentication Required**: No  
**Rate Limit**: 100 requests per minute

**Query Parameters**:
- `keyword`: Search keyword for title/description
- `skills`: Comma-separated skill IDs
- `minBudget`: Minimum budget filter
- `maxBudget`: Maximum budget filter
- `limit`: Number of results per page (default: 20)
- `continuationToken`: Token for pagination

**Response (200 OK)**:
```json
{
  "items": [
    {
      "id": "uuid",
      "employerId": "uuid",
      "title": "Web Development Project",
      "description": "Need a full-stack developer for a React and Node.js application",
      "requiredSkills": [
        {
          "skillId": "uuid",
          "skillName": "React",
          "categoryId": "uuid",
          "yearsOfExperience": 3
        }
      ],
      "budget": 5000,
      "deadline": "2023-12-31T00:00:00Z",
      "status": "open",
      "milestones": [],
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-01T00:00:00Z"
    }
  ],
  "hasMore": true,
  "continuationToken": "next-page-token"
}
```

### Add Milestones to Project
Sets milestones for a project (employer only, milestone amounts must sum to budget).

**HTTP Method**: `POST`  
**URL Pattern**: `/api/projects/{id}/milestones`  
**Authentication Required**: Yes (Bearer JWT)  
**Required Role**: `employer`  
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "milestones": [
    {
      "title": "Initial Design",
      "description": "Create wireframes and UI design",
      "amount": 1000,
      "dueDate": "2023-06-30T00:00:00Z"
    },
    {
      "title": "Frontend Development",
      "description": "Implement React components",
      "amount": 2000,
      "dueDate": "2023-07-31T00:00:00Z"
    }
  ]
}
```

**Response (200 OK)**:
Returns the updated project object with milestones.

**Error Codes**:
- `400`: Validation error, milestone sum mismatch
- `401`: Unauthorized
- `404`: Project not found
- `409`: Project locked (has accepted proposals)

### List Proposals for Project
Retrieves all proposals for a specific project (employer only).

**HTTP Method**: `GET`  
**URL Pattern**: `/api/projects/{id}/proposals`  
**Authentication Required**: Yes (Bearer JWT)  
**Required Role**: `employer`  
**Rate Limit**: 100 requests per minute

**Query Parameters**:
- `limit`: Number of results per page (default: 20)
- `continuationToken`: Token for pagination

**Response (200 OK)**:
```json
{
  "items": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "freelancerId": "uuid",
      "coverLetter": "I'm excited to work on this project...",
      "proposedRate": 50,
      "estimatedDuration": 30,
      "status": "pending",
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-01T00:00:00Z"
    }
  ],
  "hasMore": false,
  "continuationToken": null
}
```

**Error Codes**:
- `400`: Invalid UUID format
- `401`: Unauthorized
- `404`: Project not found
- `403`: Forbidden (not project owner)

## Proposals Endpoints

The proposals endpoints allow freelancers to submit proposals for projects and employers to manage them. Proposals represent a freelancer's application to work on a project.

```mermaid
sequenceDiagram
participant Freelancer
participant ProposalController
participant ProposalService
Freelancer->>ProposalController : POST /api/proposals
ProposalController->>ProposalService : submitProposal()
ProposalService-->>ProposalController : Proposal or Error
ProposalController-->>Freelancer : 201 Created
Freelancer->>ProposalController : GET /api/proposals/freelancer/me
ProposalController->>ProposalService : getProposalsByFreelancer()
ProposalService-->>ProposalController : Proposal list
ProposalController-->>Freelancer : 200 OK
Employer->>ProposalController : POST /api/proposals/{id}/accept
ProposalController->>ProposalService : acceptProposal()
ProposalService-->>ProposalController : Proposal and Contract
ProposalController-->>Employer : 200 OK
```

### Submit Proposal
Submit a proposal for a project (freelancer only).

**HTTP Method**: `POST`  
**URL Pattern**: `/api/proposals`  
**Authentication Required**: Yes (Bearer JWT)  
**Required Role**: `freelancer`  
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "projectId": "uuid",
  "coverLetter": "I'm excited to work on this project because...",
  "proposedRate": 50,
  "estimatedDuration": 30
}
```

**Response (201 Created)**:
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "freelancerId": "uuid",
  "coverLetter": "I'm excited to work on this project because...",
  "proposedRate": 50,
  "estimatedDuration": 30,
  "status": "pending",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-01T00:00:00Z"
}
```

**Error Codes**:
- `400`: Validation error
- `401`: Unauthorized
- `404`: Project not found
- `409`: Duplicate proposal

### Get Proposal Details
Retrieves details of a specific proposal.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/proposals/{id}`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
Returns the proposal object in the same format as POST.

**Error Codes**:
- `400`: Invalid UUID format
- `401`: Unauthorized
- `404`: Proposal not found

### Get My Proposals
Retrieves all proposals submitted by the authenticated freelancer.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/proposals/freelancer/me`  
**Authentication Required**: Yes (Bearer JWT)  
**Required Role**: `freelancer`  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
```json
[
  {
    "id": "uuid",
    "projectId": "uuid",
    "freelancerId": "uuid",
    "coverLetter": "I'm excited to work on this project because...",
    "proposedRate": 50,
    "estimatedDuration": 30,
    "status": "pending",
    "createdAt": "2023-01-01T00:00:00Z",
    "updatedAt": "2023-01-01T00:00:00Z"
  }
]
```

**Error Codes**:
- `401`: Unauthorized

### Accept Proposal
Accept a proposal and create a contract (employer only).

**HTTP Method**: `POST`  
**URL Pattern**: `/api/proposals/{id}/accept`  
**Authentication Required**: Yes (Bearer JWT)  
**Required Role**: `employer`  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
```json
{
  "proposal": {
    "id": "uuid",
    "projectId": "uuid",
    "freelancerId": "uuid",
    "coverLetter": "I'm excited to work on this project because...",
    "proposedRate": 50,
    "estimatedDuration": 30,
    "status": "accepted",
    "createdAt": "2023-01-01T00:00:00Z",
    "updatedAt": "2023-01-01T00:00:00Z"
  },
  "contract": {
    "id": "uuid",
    "projectId": "uuid",
    "proposalId": "uuid",
    "freelancerId": "uuid",
    "employerId": "uuid",
    "escrowAddress": "0x742d35Cc6634C0532925a3b8D4C0cD1111111111",
    "totalAmount": 1500,
    "status": "active",
    "createdAt": "2023-01-01T00:00:00Z",
    "updatedAt": "2023-01-01T00:00:00Z"
  }
}
```

**Error Codes**:
- `400`: Invalid proposal status
- `401`: Unauthorized
- `404`: Proposal not found
- `403`: Forbidden (not project owner)

### Reject Proposal
Reject a proposal (employer only).

**HTTP Method**: `POST`  
**URL Pattern**: `/api/proposals/{id}/reject`  
**Authentication Required**: Yes (Bearer JWT)  
**Required Role**: `employer`  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
Returns the rejected proposal object.

**Error Codes**:
- `400`: Invalid proposal status
- `401`: Unauthorized
- `404`: Proposal not found
- `403`: Forbidden (not project owner)

### Withdraw Proposal
Withdraw a pending proposal (freelancer only).

**HTTP Method**: `POST`  
**URL Pattern**: `/api/proposals/{id}/withdraw`  
**Authentication Required**: Yes (Bearer JWT)  
**Required Role**: `freelancer`  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
Returns the withdrawn proposal object.

**Error Codes**:
- `400`: Invalid proposal status
- `401`: Unauthorized
- `404`: Proposal not found
- `403`: Forbidden (not proposal owner)

## Contracts Endpoints

The contracts endpoints allow users to retrieve contract information. Contracts represent formal agreements between employers and freelancers for project work.

```mermaid
sequenceDiagram
participant User
participant ContractController
participant ContractService
User->>ContractController : GET /api/contracts
ContractController->>ContractService : getUserContracts()
ContractService-->>ContractController : Contract list
ContractController-->>User : 200 OK
User->>ContractController : GET /api/contracts/{id}
ContractController->>ContractService : getContractById()
ContractService-->>ContractController : Contract or Error
ContractController-->>User : 200 OK or 404 Not Found
```

### List User's Contracts
Retrieves all contracts for the authenticated user (as freelancer or employer).

**HTTP Method**: `GET`  
**URL Pattern**: `/api/contracts`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Query Parameters**:
- `limit`: Number of results per page (default: 20)
- `continuationToken`: Token for pagination

**Response (200 OK)**:
```json
{
  "items": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "proposalId": "uuid",
      "freelancerId": "uuid",
      "employerId": "uuid",
      "escrowAddress": "0x742d35Cc6634C0532925a3b8D4C0cD1111111111",
      "totalAmount": 1500,
      "status": "active",
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-01T00:00:00Z"
    }
  ],
  "hasMore": false,
  "continuationToken": null
}
```

**Error Codes**:
- `401`: Unauthorized

### Get Contract Details
Retrieves details of a specific contract.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/contracts/{id}`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
Returns the contract object in the same format as above.

**Error Codes**:
- `400`: Invalid UUID format
- `401`: Unauthorized
- `404`: Contract not found

## Payments Endpoints

The payments endpoints handle milestone-based payment processing, including completion requests, approvals, disputes, and status checks.

```mermaid
sequenceDiagram
participant Freelancer
participant Employer
participant PaymentController
participant PaymentService
Freelancer->>PaymentController : POST /api/payments/milestones/{id}/complete
PaymentController->>PaymentService : requestMilestoneCompletion()
PaymentService-->>PaymentController : Completion result
PaymentController-->>Freelancer : 200 OK
Employer->>PaymentController : POST /api/payments/milestones/{id}/approve
PaymentController->>PaymentService : approveMilestone()
PaymentService-->>PaymentController : Approval result
PaymentController-->>Employer : 200 OK
Either->>PaymentController : POST /api/payments/milestones/{id}/dispute
PaymentController->>PaymentService : disputeMilestone()
PaymentService-->>PaymentController : Dispute result
PaymentController-->>Either : 200 OK
User->>PaymentController : GET /api/payments/contracts/{id}/status
PaymentController->>PaymentService : getContractPaymentStatus()
PaymentService-->>PaymentController : Status
PaymentController-->>User : 200 OK
```

### Mark Milestone as Complete
Freelancer marks a milestone as complete, triggering employer notification.

**HTTP Method**: `POST`  
**URL Pattern**: `/api/payments/milestones/{milestoneId}/complete`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Query Parameters**:
- `contractId`: The contract ID (UUID)

**Response (200 OK)**:
```json
{
  "milestoneId": "uuid",
  "status": "submitted",
  "notificationSent": true
}
```

**Error Codes**:
- `400`: Invalid request
- `401`: Unauthorized
- `404`: Contract or milestone not found
- `403`: Forbidden (not freelancer on contract)

### Approve Milestone Completion
Employer approves milestone completion, triggering payment release.

**HTTP Method**: `POST`  
**URL Pattern**: `/api/payments/milestones/{milestoneId}/approve`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Query Parameters**:
- `contractId`: The contract ID (UUID)

**Response (200 OK)**:
```json
{
  "milestoneId": "uuid",
  "status": "approved",
  "paymentReleased": true,
  "transactionHash": "0xabc123...",
  "contractCompleted": false
}
```

**Error Codes**:
- `400`: Invalid request
- `401`: Unauthorized
- `404`: Contract or milestone not found
- `403`: Forbidden (not employer on contract)

### Dispute Milestone
Either party disputes a milestone, locking funds and creating a dispute record.

**HTTP Method**: `POST`  
**URL Pattern**: `/api/payments/milestones/{milestoneId}/dispute`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Query Parameters**:
- `contractId`: The contract ID (UUID)

**Request Body**:
```json
{
  "reason": "The work delivered does not meet the requirements specified in the milestone."
}
```

**Response (200 OK)**:
```json
{
  "milestoneId": "uuid",
  "status": "disputed",
  "disputeId": "uuid",
  "disputeCreated": true
}
```

**Error Codes**:
- `400`: Invalid request
- `401`: Unauthorized
- `404`: Contract or milestone not found

### Get Contract Payment Status
Get detailed payment status for a contract including milestone statuses.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/payments/contracts/{contractId}/status`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
```json
{
  "contractId": "uuid",
  "escrowAddress": "0x742d35Cc6634C0532925a3b8D4C0cD1111111111",
  "totalAmount": 1500,
  "releasedAmount": 500,
  "pendingAmount": 1000,
  "milestones": [
    {
      "id": "uuid",
      "title": "Initial Design",
      "amount": 500,
      "status": "approved"
    },
    {
      "id": "uuid",
      "title": "Frontend Development",
      "amount": 1000,
      "status": "submitted"
    }
  ],
  "contractStatus": "in_progress"
}
```

**Error Codes**:
- `400`: Invalid UUID format
- `401`: Unauthorized
- `404`: Contract not found

## Disputes Endpoints

The disputes endpoints handle conflict resolution for payment issues, including dispute creation, evidence submission, and resolution by administrators.

```mermaid
sequenceDiagram
participant User
participant DisputeController
participant DisputeService
User->>DisputeController : POST /api/disputes
DisputeController->>DisputeService : createDispute()
DisputeService-->>DisputeController : Dispute or Error
DisputeController-->>User : 201 Created
User->>DisputeController : POST /api/disputes/{id}/evidence
DisputeController->>DisputeService : submitEvidence()
DisputeService-->>DisputeController : Updated dispute
DisputeController-->>User : 200 OK
Admin->>DisputeController : POST /api/disputes/{id}/resolve
DisputeController->>DisputeService : resolveDispute()
DisputeService-->>DisputeController : Resolved dispute
DisputeController-->>Admin : 200 OK
User->>DisputeController : GET /api/contracts/{id}/disputes
DisputeController->>DisputeService : getDisputesByContract()
DisputeService-->>DisputeController : Dispute list
DisputeController-->>User : 200 OK
```

### Create Dispute
Create a dispute for a milestone, locking associated funds.

**HTTP Method**: `POST`  
**URL Pattern**: `/api/disputes`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "contractId": "uuid",
  "milestoneId": "uuid",
  "reason": "The work delivered does not meet the requirements specified in the milestone."
}
```

**Response (201 Created)**:
```json
{
  "id": "uuid",
  "contractId": "uuid",
  "milestoneId": "uuid",
  "initiatorId": "uuid",
  "reason": "The work delivered does not meet the requirements specified in the milestone.",
  "evidence": [],
  "status": "open",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-01T00:00:00Z"
}
```

**Error Codes**:
- `400`: Validation error
- `401`: Unauthorized
- `403`: User not authorized to create dispute
- `404`: Contract or milestone not found
- `409`: Milestone already disputed

### Get Dispute Details
Get details of a specific dispute.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/disputes/{disputeId}`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
Returns the dispute object in the same format as POST.

**Error Codes**:
- `400`: Invalid UUID format
- `401`: Unauthorized
- `404`: Dispute not found

### Submit Evidence for Dispute
Submit evidence to support a dispute case.

**HTTP Method**: `POST`  
**URL Pattern**: `/api/disputes/{disputeId}/evidence`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "type": "text",
  "content": "The delivered code does not compile and fails to meet the requirements outlined in the milestone description."
}
```

**Response (200 OK)**:
Returns the updated dispute object with the new evidence.

**Error Codes**:
- `400`: Validation error
- `401`: Unauthorized
- `403`: User not authorized to submit evidence
- `404`: Dispute not found

### Resolve Dispute
Admin resolves a dispute, triggering payment based on decision.

**HTTP Method**: `POST`  
**URL Pattern**: `/api/disputes/{disputeId}/resolve`  
**Authentication Required**: Yes (Bearer JWT)  
**Required Role**: `admin`  
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "decision": "freelancer_favor",
  "reasoning": "After reviewing the evidence, the freelancer has completed the work as specified in the milestone requirements."
}
```

**Response (200 OK)**:
Returns the resolved dispute object with resolution details.

**Error Codes**:
- `400`: Validation error
- `401`: Unauthorized
- `403`: Only administrators can resolve disputes
- `404`: Dispute not found

### List Disputes for Contract
Get all disputes associated with a contract.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/contracts/{contractId}/disputes`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
```json
[
  {
    "id": "uuid",
    "contractId": "uuid",
    "milestoneId": "uuid",
    "initiatorId": "uuid",
    "reason": "The work delivered does not meet the requirements specified in the milestone.",
    "evidence": [],
    "status": "resolved",
    "resolution": {
      "decision": "freelancer_favor",
      "reasoning": "After reviewing the evidence, the freelancer has completed the work as specified in the milestone requirements.",
      "resolvedBy": "uuid",
      "resolvedAt": "2023-01-02T00:00:00Z"
    },
    "createdAt": "2023-01-01T00:00:00Z",
    "updatedAt": "2023-01-02T00:00:00Z"
  }
]
```

**Error Codes**:
- `400`: Invalid UUID format
- `401`: Unauthorized
- `403`: User not authorized to view disputes
- `404`: Contract not found

## Notifications Endpoints

The notifications endpoints allow users to manage their notifications, including retrieving, marking as read, and getting unread counts.

```mermaid
sequenceDiagram
participant User
participant NotificationController
participant NotificationService
User->>NotificationController : GET /api/notifications
NotificationController->>NotificationService : getNotificationsByUser()
NotificationService-->>NotificationController : Notification list
NotificationController-->>User : 200 OK
User->>NotificationController : GET /api/notifications/unread-count
NotificationController->>NotificationService : getUnreadCount()
NotificationService-->>NotificationController : Count
NotificationController-->>User : 200 OK
User->>NotificationController : PATCH /api/notifications/{id}/read
NotificationController->>NotificationService : markNotificationAsRead()
NotificationService-->>NotificationController : Updated notification
NotificationController-->>User : 200 OK
User->>NotificationController : PATCH /api/notifications/read-all
NotificationController->>NotificationService : markAllNotificationsAsRead()
NotificationService-->>NotificationController : Count
NotificationController-->>User : 200 OK
```

### Get User Notifications
Retrieves all notifications for the authenticated user, sorted by creation time (newest first).

**HTTP Method**: `GET`  
**URL Pattern**: `/api/notifications`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Query Parameters**:
- `maxItemCount`: Maximum number of notifications to return (1-100)
- `continuationToken`: Token for pagination

**Response (200 OK)**:
```json
{
  "items": [
    {
      "id": "uuid",
      "userId": "uuid",
      "type": "proposal_received",
      "title": "New Proposal Received",
      "message": "You have received a new proposal for your project 'Web Development Project'.",
      "data": {
        "projectId": "uuid",
        "proposalId": "uuid",
        "freelancerId": "uuid"
      },
      "isRead": false,
      "createdAt": "2023-01-01T00:00:00Z"
    }
  ],
  "continuationToken": "next-page-token",
  "hasMore": true
}
```

**Error Codes**:
- `401`: Unauthorized

### Get Unread Notification Count
Returns the count of unread notifications for the authenticated user.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/notifications/unread-count`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
```json
{
  "count": 5
}
```

**Error Codes**:
- `401`: Unauthorized

### Mark Notification as Read
Marks a specific notification as read.

**HTTP Method**: `PATCH`  
**URL Pattern**: `/api/notifications/{id}/read`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
Returns the updated notification object with `isRead: true`.

**Error Codes**:
- `400`: Invalid UUID format
- `401`: Unauthorized
- `404`: Notification not found
- `403`: Forbidden (not notification owner)

### Mark All Notifications as Read
Marks all notifications for the authenticated user as read.

**HTTP Method**: `PATCH`  
**URL Pattern**: `/api/notifications/read-all`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
```json
{
  "count": 5
}
```

**Error Codes**:
- `401`: Unauthorized

## KYC Endpoints

The KYC endpoints handle identity verification and compliance, including submission, review, and status checking.

```mermaid
sequenceDiagram
participant User
participant Admin
participant KYCController
participant KYCService
User->>KYCController : POST /api/kyc/submit
KYCController->>KYCService : submitKyc()
KYCService-->>KYCController : Submission result
KYCController-->>User : 201 Created
User->>KYCController : GET /api/kyc/status
KYCController->>KYCService : getKycStatus()
KYCService-->>KYCController : KYC status
KYCController-->>User : 200 OK
Admin->>KYCController : GET /api/kyc/admin/pending
KYCController->>KYCService : getPendingKycReviews()
KYCService-->>KYCController : Pending reviews
KYCController-->>Admin : 200 OK
Admin->>KYCController : GET /api/kyc/admin/status/{status}
KYCController->>KYCService : getKycByStatus()
KYCService-->>KYCController : KYC list
KYCController-->>Admin : 200 OK
```

### Get Supported Countries for KYC
Returns list of countries with their KYC requirements.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/kyc/countries`  
**Authentication Required**: No  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
```json
[
  {
    "code": "US",
    "name": "United States",
    "supportedDocuments": ["passport", "national_id", "drivers_license"],
    "requiresLiveness": true,
    "requiresAddressProof": true,
    "tier": "standard"
  }
]
```

### Get KYC Requirements for Country
Get KYC requirements for a specific country.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/kyc/countries/{countryCode}`  
**Authentication Required**: No  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
Returns the country requirements object in the same format as above.

**Error Codes**:
- `404`: Country not supported

### Get Current User's KYC Status
Get the current user's KYC verification status.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/kyc/status`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
```json
{
  "id": "uuid",
  "userId": "uuid",
  "status": "approved",
  "tier": "standard",
  "firstName": "John",
  "lastName": "Doe",
  "nationality": "US",
  "address": {
    "addressLine1": "123 Main St",
    "city": "New York",
    "country": "United States",
    "countryCode": "US"
  },
  "documents": [
    {
      "type": "passport",
      "documentNumber": "P12345678",
      "issuingCountry": "US",
      "frontImageUrl": "https://example.com/passport.jpg"
    }
  ],
  "livenessCheck": {
    "id": "uuid",
    "sessionId": "uuid",
    "status": "passed",
    "confidenceScore": 0.95,
    "challenges": [
      {
        "type": "blink",
        "completed": true,
        "timestamp": "2023-01-01T00:00:00Z"
      }
    ],
    "expiresAt": "2023-01-02T00:00:00Z"
  },
  "faceMatchScore": 0.92,
  "faceMatchStatus": "matched",
  "amlScreeningStatus": "clear",
  "riskLevel": "low"
}
```

**Error Codes**:
- `401`: Unauthorized
- `404`: No KYC verification found

### Submit KYC Verification
Submit identity documents and personal information for international KYC verification.

**HTTP Method**: `POST`  
**URL Pattern**: `/api/kyc/submit`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1980-01-01",
  "nationality": "US",
  "address": {
    "addressLine1": "123 Main St",
    "city": "New York",
    "country": "United States",
    "countryCode": "US"
  },
  "document": {
    "type": "passport",
    "documentNumber": "P12345678",
    "issuingCountry": "US",
    "frontImageUrl": "https://example.com/passport.jpg"
  },
  "selfieImageUrl": "https://example.com/selfie.jpg",
  "tier": "standard"
}
```

**Response (201 Created)**:
Returns the created KYC verification object.

**Error Codes**:
- `400`: Validation error
- `409`: KYC already pending or approved

### Create Face Liveness Session
Initiates a liveness check session with random challenges.

**HTTP Method**: `POST`  
**URL Pattern**: `/api/kyc/liveness/session`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "challenges": ["blink", "smile", "turn_left"]
}
```

**Response (201 Created)**:
```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "status": "pending",
  "challenges": [
    {
      "type": "blink",
      "completed": false,
      "timestamp": null
    }
  ],
  "expiresAt": "2023-01-02T00:00:00Z"
}
```

**Error Codes**:
- `400`: KYC not found or already approved

### Get Current Liveness Session
Get the current liveness session.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/kyc/liveness/session`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
Returns the current liveness session object.

**Error Codes**:
- `401`: Unauthorized
- `404`: No active liveness session

### Submit Liveness Verification Results
Submit captured frames and challenge results for liveness verification.

**HTTP Method**: `POST`  
**URL Pattern**: `/api/kyc/liveness/verify`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "sessionId": "uuid",
  "capturedFrames": ["base64-image-1", "base64-image-2"],
  "challengeResults": [
    {
      "type": "blink",
      "completed": true,
      "timestamp": "2023-01-01T00:00:00Z"
    }
  ]
}
```

**Response (200 OK)**:
Returns the updated liveness check object.

**Error Codes**:
- `400`: Validation error

### Verify Face Match
Verify face match between selfie and document.

**HTTP Method**: `POST`  
**URL Pattern**: `/api/kyc/face-match`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "selfieImageUrl": "https://example.com/selfie.jpg",
  "documentImageUrl": "https://example.com/passport.jpg"
}
```

**Response (200 OK)**:
```json
{
  "matched": true,
  "score": 0.92
}
```

**Error Codes**:
- `400`: Validation error

### Add Additional Document
Add an additional document to KYC verification.

**HTTP Method**: `POST`  
**URL Pattern**: `/api/kyc/documents`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "type": "utility_bill",
  "documentNumber": "UB123456",
  "issuingCountry": "US",
  "frontImageUrl": "https://example.com/bill.jpg"
}
```

**Response (200 OK)**:
Returns the updated KYC verification object.

**Error Codes**:
- `400`: Validation error

### Get Pending KYC Reviews
Get pending KYC reviews (Admin only).

**HTTP Method**: `GET`  
**URL Pattern**: `/api/kyc/admin/pending`  
**Authentication Required**: Yes (Bearer JWT)  
**Required Role**: `admin`  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "status": "submitted",
    "firstName": "John",
    "lastName": "Doe",
    "nationality": "US"
  }
]
```

### Get KYC Verifications by Status
Get KYC verifications by status (Admin only).

**HTTP Method**: `GET`  
**URL Pattern**: `/api/kyc/admin/status/{status}`  
**Authentication Required**: Yes (Bearer JWT)  
**Required Role**: `admin`  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
Returns a list of KYC verifications with the specified status.

**Error Codes**:
- `400`: Invalid status

## Matching Endpoints

The matching endpoints provide AI-powered recommendations for projects and freelancers, as well as skill extraction and gap analysis.

```mermaid
sequenceDiagram
participant Freelancer
participant Employer
participant MatchingController
participant MatchingService
Freelancer->>MatchingController : GET /api/matching/projects
MatchingController->>MatchingService : getProjectRecommendations()
MatchingService-->>MatchingController : Project recommendations
MatchingController-->>Freelancer : 200 OK
Employer->>MatchingController : GET /api/matching/freelancers/{projectId}
MatchingController->>MatchingService : getFreelancerRecommendations()
MatchingService-->>MatchingController : Freelancer recommendations
MatchingController-->>Employer : 200 OK
User->>MatchingController : POST /api/matching/extract-skills
MatchingController->>MatchingService : extractSkillsFromText()
MatchingService-->>MatchingController : Extracted skills
MatchingController-->>User : 200 OK
Freelancer->>MatchingController : GET /api/matching/skill-gaps
MatchingController->>MatchingService : analyzeSkillGaps()
MatchingService-->>MatchingController : Skill gap analysis
MatchingController-->>Freelancer : 200 OK
```

### Get Project Recommendations
Returns AI-powered project recommendations for a freelancer, ranked by match score.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/matching/projects`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Query Parameters**:
- `limit`: Maximum number of recommendations to return (default: 10, max: 50)

**Response (200 OK)**:
```json
[
  {
    "projectId": "uuid",
    "matchScore": 95,
    "matchedSkills": ["React", "Node.js", "TypeScript"],
    "missingSkills": ["GraphQL"],
    "reasoning": "You have strong experience in React and Node.js which are required for this project. Consider learning GraphQL to improve your match score."
  }
]
```

**Error Codes**:
- `401`: Unauthorized
- `404`: Freelancer profile not found

### Get Freelancer Recommendations
Returns AI-powered freelancer recommendations for a project, ranked by combined skill and reputation score.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/matching/freelancers/{projectId}`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Query Parameters**:
- `limit`: Maximum number of recommendations to return (default: 10, max: 50)

**Response (200 OK)**:
```json
[
  {
    "freelancerId": "uuid",
    "matchScore": 90,
    "reputationScore": 4.8,
    "combinedScore": 92,
    "matchedSkills": ["React", "Node.js", "TypeScript"],
    "reasoning": "This freelancer has excellent skills in React and Node.js with a strong reputation score. They have completed similar projects successfully."
  }
]
```

**Error Codes**:
- `400`: Invalid UUID format
- `401`: Unauthorized
- `404`: Project not found

### Extract Skills from Text
Uses AI to extract and map skills from text to the platform taxonomy.

**HTTP Method**: `POST`  
**URL Pattern**: `/api/matching/extract-skills`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "text": "I have 5 years of experience with React, Node.js, and MongoDB. I'm also familiar with Docker and Kubernetes."
}
```

**Response (200 OK)**:
```json
[
  {
    "skillId": "uuid",
    "skillName": "React",
    "confidence": 0.98
  },
  {
    "skillId": "uuid",
    "skillName": "Node.js",
    "confidence": 0.97
  },
  {
    "skillId": "uuid",
    "skillName": "MongoDB",
    "confidence": 0.95
  }
]
```

**Error Codes**:
- `400`: Validation error
- `401`: Unauthorized

### Analyze Skill Gaps
Uses AI to analyze a freelancer's skills and suggest improvements based on market demand.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/matching/skill-gaps`  
**Authentication Required**: Yes (Bearer JWT)  
**Rate Limit**: 100 requests per minute

**Response (200 OK)**:
```json
{
  "currentSkills": ["React", "Node.js", "JavaScript"],
  "recommendedSkills": ["TypeScript", "GraphQL", "Next.js"],
  "marketDemand": [
    {
      "skillName": "TypeScript",
      "demandLevel": "high"
    },
    {
      "skillName": "GraphQL",
      "demandLevel": "medium"
    }
  ],
  "reasoning": "Your skills in React and Node.js are strong, but adding TypeScript would make you more competitive as it's in high demand. GraphQL is also valuable for modern API development."
}
```

**Error Codes**:
- `401`: Unauthorized
- `404`: Freelancer profile not found

## Search Endpoints

The search endpoints provide filtering and discovery capabilities for projects and freelancers.

```mermaid
sequenceDiagram
participant User
participant SearchController
participant SearchService
User->>SearchController : GET /api/search/projects
SearchController->>SearchService : searchProjects()
SearchService-->>SearchController : Project search results
SearchController-->>User : 200 OK
User->>SearchController : GET /api/search/freelancers
SearchController->>SearchService : searchFreelancers()
SearchService-->>SearchController : Freelancer search results
SearchController-->>User : 200 OK
```

### Search Projects
Search for projects with keyword, skill, and budget filters.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/search/projects`  
**Authentication Required**: No  
**Rate Limit**: 100 requests per minute

**Query Parameters**:
- `keyword`: Search keyword for title/description
- `skills`: Comma-separated skill IDs to filter by
- `minBudget`: Minimum budget filter
- `maxBudget`: Maximum budget filter
- `pageSize`: Number of results per page (default: 20, max: 100)
- `continuationToken`: Token for pagination

**Response (200 OK)**:
```json
{
  "items": [
    {
      "id": "uuid",
      "employerId": "uuid",
      "title": "Web Development Project",
      "description": "Need a full-stack developer for a React and Node.js application",
      "requiredSkills": [
        {
          "skillId": "uuid",
          "skillName": "React",
          "categoryId": "uuid",
          "yearsOfExperience": 3
        }
      ],
      "budget": 5000,
      "deadline": "2023-12-31T00:00:00Z",
      "status": "open",
      "milestones": [],
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-01T00:00:00Z"
    }
  ],
  "metadata": {
    "pageSize": 20,
    "hasMore": true,
    "continuationToken": "next-page-token"
  }
}
```

**Error Codes**:
- `400`: Invalid request parameters

### Search Freelancers
Search for freelancers with keyword and skill filters.

**HTTP Method**: `GET`  
**URL Pattern**: `/api/search/freelancers`  
**Authentication Required**: No  
**Rate Limit**: 100 requests per minute

**Query Parameters**:
- `keyword`: Search keyword for bio
- `skills`: Comma-separated skill IDs to filter by
- `pageSize`: Number of results per page (default: 20, max: 100)
- `continuationToken`: Token for pagination

**Response (200 OK)**:
```json
{
  "items": [
    {
      "id": "uuid",
      "userId": "uuid",
      "bio": "Full-stack developer with 5 years of experience in React and Node.js",
      "hourlyRate": 50,
      "skills": [
        {
          "skillId": "uuid",
          "skillName": "React",
          "categoryId": "uuid",
          "yearsOfExperience": 5
        }
      ],
      "experience": [
        {
          "id": "uuid",
          "title": "Senior Developer",
          "company": "Tech Company",
          "description": "Led development of web applications",
          "startDate": "2018-01-01",
          "endDate": null
        }
      ],
      "availability": "available",
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-01T00:00:00Z"
    }
  ],
  "metadata": {
    "pageSize": 20,
    "hasMore": true,
    "continuationToken": "next-page-token"
  }
}
```

**Error Codes**:
- `400`: Invalid request parameters

## Error Handling

The API uses a consistent error response format across all endpoints. Error responses include a standardized structure with error code, message, timestamp, and request ID for debugging.

**Error Response Format**:
```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": [
      {
        "field": "string",
        "message": "string",
        "value": {}
      }
    ]
  },
  "timestamp": "2023-01-01T00:00:00Z",
  "requestId": "uuid"
}
```

### Common Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request data failed validation |
| `AUTH_MISSING_TOKEN` | 401 | Authorization header is required |
| `AUTH_INVALID_FORMAT` | 401 | Authorization header must be in format: Bearer <token> |
| `AUTH_TOKEN_EXPIRED` | 401 | JWT token has expired |
| `AUTH_INVALID_TOKEN` | 401 | Invalid JWT token |
| `AUTH_UNAUTHORIZED` | 401 | Authentication required |
| `AUTH_FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests, please try again later |

### Error Response Examples

**Validation Error**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      {
        "field": "email",
        "message": "Valid email is required"
      },
      {
        "field": "password",
        "message": "Password must contain at least 8 characters"
      }
    ]
  },
  "timestamp": "2023-01-01T00:00:00Z",
  "requestId": "uuid"
}
```

**Authentication Error**:
```json
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  },
  "timestamp": "2023-01-01T00:00:00Z",
  "requestId": "uuid"
}
```

**Not Found Error**:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Project not found"
  },
  "timestamp": "2023-01-01T00:00:00Z",
  "requestId": "uuid"
}
```

**Rate Limit Exceeded**:
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests, please try again later"
  },
  "retryAfter": 45,
  "timestamp": "2023-01-01T00:00:00Z",
  "requestId": "uuid"
}
```

## Rate Limiting Policies

The API implements rate limiting to prevent abuse and ensure fair usage. Different endpoints have different rate limits based on their sensitivity and usage patterns.

### Rate Limiter Configuration

The rate limiting is implemented through the `rate-limiter.ts` middleware with three preset configurations:

```mermaid
flowchart TD
A[Rate Limiter] --> B[authRateLimiter]
A --> C[apiRateLimiter]
A --> D[sensitiveRateLimiter]
B --> E["10 attempts per 15 minutes"]
C --> F["100 requests per minute"]
D --> G["5 attempts per hour"]
H[Authentication Endpoints] --> B
I[API Endpoints] --> C
J[Sensitive Operations] --> D
```

### Rate Limiting Rules

| Endpoint Group | Rate Limit | Window | Description |
|----------------|------------|--------|-------------|
| Authentication | 10 attempts | 15 minutes | Applies to login, registration, and token refresh |
| API Endpoints | 100 requests | 1 minute | Applies to all authenticated API endpoints |
| Sensitive Operations | 5 attempts | 1 hour | Applies to sensitive operations like KYC submission |

### Rate Limit Headers

When a rate limit is exceeded, the API returns a `429 Too Many Requests` response with the following headers:

- `Retry-After`: Number of seconds to wait before making another request
- `X-RateLimit-Limit`: The maximum number of requests in the rate limit window
- `X-RateLimit-Remaining`: The number of requests remaining in the current window
- `X-RateLimit-Reset`: The time at which the current rate limit window resets

### Rate Limit Response

When the rate limit is exceeded, the API returns:

**HTTP Status**: `429 Too Many Requests`  
**Response Body**:
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests, please try again later"
  },
  "retryAfter": 45,
  "timestamp": "2023-01-01T00:00:00Z",
  "requestId": "uuid"
}
```

## Client Implementation Examples

This section provides examples of how to implement client-side code for common operations using JavaScript/TypeScript.

### User Login Example

```typescript
async function login(email: string, password: string): Promise<AuthResult> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  return response.json();
}

// Usage
try {
  const authResult = await login('user@example.com', 'password123');
  // Store tokens for future requests
  localStorage.setItem('accessToken', authResult.accessToken);
  localStorage.setItem('refreshToken', authResult.refreshToken);
} catch (error) {
  console.error('Login failed:', error.message);
}
```

### Project Creation Example

```typescript
async function createProject(projectData: ProjectInput): Promise<Project> {
  const accessToken = localStorage.getItem('accessToken');
  
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(projectData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  return response.json();
}

// Usage
try {
  const newProject = await createProject({
    title: 'Web Development Project',
    description: 'Need a full-stack developer for a React and Node.js application',
    requiredSkills: [{ skillId: 'uuid', yearsOfExperience: 3 }],
    budget: 5000,
    deadline: '2023-12-31T00:00:00Z',
  });
  console.log('Project created:', newProject);
} catch (error) {
  console.error('Project creation failed:', error.message);
}
```

### Proposal Submission Example

```typescript
async function submitProposal(proposalData: ProposalInput): Promise<Proposal> {
  const accessToken = localStorage.getItem('accessToken');
  
  const response = await fetch('/api/proposals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(proposalData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  return response.json();
}

// Usage
try {
  const proposal = await submitProposal({
    projectId: 'uuid',
    coverLetter: 'I have extensive experience with React and Node.js...',
    proposedRate: 50,
    estimatedDuration: 30,
  });
  console.log('Proposal submitted:', proposal);
} catch (error) {
  console.error('Proposal submission failed:', error.message);
}
```

### Contract Initiation Example

```typescript
async function acceptProposal(proposalId: string): Promise<ContractResult> {
  const accessToken = localStorage.getItem('accessToken');
  
  const response = await fetch(`/api/proposals/${proposalId}/accept`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  return response.json();
}

// Usage
try {
  const result = await acceptProposal('proposal-uuid');
  console.log('Contract created:', result.contract);
  console.log('Proposal accepted:', result.proposal);
} catch (error) {
  console.error('Contract initiation failed:', error.message);
}
```

### Payment Release Example

```typescript
async function approveMilestone(milestoneId: string, contractId: string): Promise<MilestoneApprovalResult> {
  const accessToken = localStorage.getItem('accessToken');
  
  const response = await fetch(`/api/payments/milestones/${milestoneId}/approve?contractId=${contractId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  return response.json();
}

// Usage
try {
  const result = await approveMilestone('milestone-uuid', 'contract-uuid');
  console.log('Payment released:', result.paymentReleased);
  console.log('Transaction hash:', result.transactionHash);
} catch (error) {
  console.error('Payment release failed:', error.message);
}
```

### Handling Authentication Headers

```typescript
// Function to create authenticated API requests
async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  // Get access token from storage
  const accessToken = localStorage.getItem('accessToken');
  
  // Add authorization header
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    ...options.headers,
  };

  const config: RequestInit = {
    ...options,
    headers,
  };

  const response = await fetch(url, config);

  // Handle token expiration
  if (response.status === 401) {
    const error = await response.json();
    if (error.error.code === 'AUTH_TOKEN_EXPIRED') {
      // Try to refresh token
      const refreshed = await refreshTokens();
      if (refreshed) {
        // Retry request with new token
        return apiRequest<T>(url, options);
      } else {
        // Redirect to login
        window.location.href = '/login';
        throw new Error('Authentication required');
      }
    }
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  return response.json();
}

// Usage
try {
  const projects = await apiRequest<Project[]>('/api/projects');
  console.log('Projects:', projects);
} catch (error) {
  console.error('API request failed:', error.message);
}
```

### Parsing Responses

```typescript
// Generic function to handle API responses
function handleApiResponse<T>(response: Response): Promise<T> {
  return response.json().then(data => {
    // Check for error structure
    if (data.error && data.error.code) {
      throw new Error(data.error.message);
    }
    return data as T;
  });
}

// Usage with fetch
fetch('/api/projects')
  .then(handleApiResponse<Project[]>)
  .then(projects => {
    console.log('Projects:', projects);
  })
  .catch(error => {
    console.error('Failed to fetch projects:', error.message);
  });
```

## Versioning Strategy

The FreelanceXchain API implements a versioning strategy to ensure backward compatibility and smooth transitions between API versions.

### Base URL Versioning

The API uses base URL versioning with the `/api` prefix. This approach provides a clear and consistent way to identify the API version:

```
https://api.freelancexchain.com/api/v1/projects
https://api.freelancexchain.com/api/v1/proposals
```

Currently, the system uses a single version (`/api`) which serves as version 1. Future versions will be implemented as `/api/v2`, `/api/v3`, etc.

### Backward Compatibility

The API maintains backward compatibility through the following practices:

1. **No Breaking Changes in Minor Versions**: Minor version updates (e.g., 1.1, 1.2) only add new features and endpoints without modifying existing ones.

2. **Deprecation Policy**: When an endpoint or field needs to be removed, it is first marked as deprecated with a warning in the response headers:
   ```
   Deprecation: true
   Sunset: Wed, 31 Dec 2023 23:59:59 GMT
   ```

3. **Field Addition**: New optional fields can be added to response objects without breaking existing clients.

4. **Query Parameter Evolution**: New query parameters can be added to existing endpoints without affecting clients that don't use them.

### Migration Path

When a new major version is released, the following migration path is provided:

1. **Parallel Operation**: Both versions operate simultaneously for a minimum of 6 months.

2. **Documentation**: Comprehensive migration guides are provided in the API documentation.

3. **Monitoring**: Usage of deprecated endpoints is monitored to identify clients that need to migrate.

4. **Notification**: Registered developers receive email notifications about upcoming deprecations.

### Example Version Transition

**Version 1 (Current)**:
```
GET /api/projects
Response: { id, title, description, budget, status }
```

**Version 2 (Future)**:
```
GET /api/v2/projects
Response: { id, title, description, budget, status, createdAt, updatedAt }
```

During the transition period:
- `/api/projects` continues to work (v1)
- `/api/v2/projects` is available (v2)
- Both endpoints are documented

---

# Payment API

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
This document provides comprehensive API documentation for payment processing endpoints in the FreelanceXchain system. It covers milestone completion, approval, dispute creation, and contract payment status retrieval. It explains authentication requirements (JWT Bearer), request/response schemas, query parameters, and the end-to-end payment flow from milestone completion to approval and potential dispute resolution. It also outlines how the API integrates with blockchain transactions for payment release and milestone registry updates.

## Project Structure
The payment API is implemented as Express routes backed by a service layer that orchestrates database updates, notifications, and blockchain interactions. The key files are:
- Route handlers define endpoints, authentication, and parameter validation.
- Service layer enforces business rules, updates domain models, and triggers blockchain operations.
- Blockchain service simulates transactions and maintains in-memory state for escrow and milestone registry.
- Notification service emits system notifications upon state changes.
- Validation and authentication middleware enforce JWT and parameter correctness.

```mermaid
graph TB
Client["Client Application"] --> Routes["Payment Routes<br/>src/routes/payment-routes.ts"]
Routes --> Service["Payment Service<br/>src/services/payment-service.ts"]
Service --> Repo["Repositories<br/>src/repositories/*"]
Service --> Notif["Notification Service<br/>src/services/notification-service.ts"]
Service --> Escrow["Escrow Contract Service<br/>src/services/escrow-contract.ts"]
Service --> Registry["Milestone Registry Service<br/>src/services/milestone-registry.ts"]
Escrow --> Chain["Blockchain Simulation"]
Registry --> Chain
```

## Core Components
- Payment Routes: Expose endpoints for completing milestones, approving milestones, disputing milestones, and retrieving contract payment status. All endpoints require JWT Bearer authentication.
- Payment Service: Implements business logic for milestone lifecycle, contract completion checks, and blockchain integration points.
- Escrow Contract Service: Simulates deployment, funding, milestone release, and refund operations with blockchain receipts.
- Milestone Registry Service: Records milestone submissions and approvals on-chain for verifiable work history.
- Notification Service: Sends notifications to parties upon milestone submission, approval, payment release, and dispute creation.
- Validation and Auth Middleware: Enforce JWT Bearer format, UUID parameter validation, and user authorization.

## Architecture Overview
The payment flow integrates REST endpoints with internal services and blockchain simulation:
- Freelancer completes a milestone via a POST endpoint; the service updates the project’s milestone status, submits to the milestone registry, and notifies the employer.
- Employer approves the milestone via another POST endpoint; the service releases funds via the escrow contract, updates statuses, and notifies the freelancer. If all milestones are approved, the contract and project are marked completed and the agreement is finalized on-chain.
- Either party can dispute a milestone via a POST endpoint; the service creates a dispute record, updates statuses, and notifies both parties.
- Contract payment status is retrieved via a GET endpoint that computes totals and milestone statuses.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Payment Routes"
participant S as "Payment Service"
participant E as "Escrow Contract Service"
participant MR as "Milestone Registry Service"
participant N as "Notification Service"
Note over C,R : "Freelancer marks milestone complete"
C->>R : POST /api/payments/milestones/{milestoneId}/complete?contractId={uuid}
R->>S : requestMilestoneCompletion(contractId, milestoneId, freelancerId)
S->>MR : submitMilestoneToRegistry(...)
S->>N : notifyMilestoneSubmitted(...)
S-->>R : {milestoneId, status=submitted, notificationSent=true}
R-->>C : 200 OK
Note over C,R : "Employer approves milestone"
C->>R : POST /api/payments/milestones/{milestoneId}/approve?contractId={uuid}
R->>S : approveMilestone(contractId, milestoneId, employerId)
S->>E : releaseMilestone(escrowAddress, milestoneId, employerId)
S->>MR : approveMilestoneOnRegistry(...)
S->>N : notifyMilestoneApproved(...)
S->>N : notifyPaymentReleased(...)
S-->>R : {milestoneId, status=approved, paymentReleased=true, transactionHash?, contractCompleted?}
R-->>C : 200 OK
Note over C,R : "Either party disputes milestone"
C->>R : POST /api/payments/milestones/{milestoneId}/dispute?contractId={uuid}<br/>Body : { reason }
R->>S : disputeMilestone(contractId, milestoneId, initiatorId, reason)
S->>N : notifyDisputeCreated(...)
S-->>R : {milestoneId, status=disputed, disputeId, disputeCreated=true}
R-->>C : 200 OK
Note over C,R : "Check contract payment status"
C->>R : GET /api/payments/contracts/{contractId}/status
R->>S : getContractPaymentStatus(contractId, userId)
S-->>R : {contractId, escrowAddress, totalAmount, releasedAmount, pendingAmount, milestones[], contractStatus}
R-->>C : 200 OK
```

## Detailed Component Analysis

### Endpoint Definitions and Schemas

#### Authentication
- All protected endpoints require a Bearer token in the Authorization header.
- Token validation is performed by the authentication middleware.

#### POST /api/payments/milestones/{milestoneId}/complete
- Purpose: Freelancer marks a milestone as complete.
- Path parameters:
  - milestoneId: UUID (required)
- Query parameters:
  - contractId: UUID (required)
- Authentication: Bearer JWT
- Request body: None
- Responses:
  - 200: MilestoneCompletionResult
  - 400: Validation error (invalid UUID or missing contractId)
  - 401: Unauthorized
  - 404: Contract or milestone not found

Response schema (MilestoneCompletionResult):
- milestoneId: string
- status: "submitted"
- notificationSent: boolean

Notes:
- Validates UUID in path and presence of contractId query parameter.
- Only the freelancer associated with the contract can request completion.
- Updates project milestone status to submitted and notifies the employer.

#### POST /api/payments/milestones/{milestoneId}/approve
- Purpose: Employer approves milestone completion and releases payment.
- Path parameters:
  - milestoneId: UUID (required)
- Query parameters:
  - contractId: UUID (required)
- Authentication: Bearer JWT
- Request body: None
- Responses:
  - 200: MilestoneApprovalResult
  - 400: Validation error
  - 401: Unauthorized
  - 404: Contract or milestone not found

Response schema (MilestoneApprovalResult):
- milestoneId: string
- status: "approved"
- paymentReleased: boolean
- transactionHash: string (optional)
- contractCompleted: boolean

Notes:
- Only the employer associated with the contract can approve.
- Releases funds via the escrow contract and updates milestone status.
- If all milestones are approved, marks the contract and project as completed and finalizes the agreement on-chain.

#### POST /api/payments/milestones/{milestoneId}/dispute
- Purpose: Either party disputes a milestone, locking funds and creating a dispute record.
- Path parameters:
  - milestoneId: UUID (required)
- Query parameters:
  - contractId: UUID (required)
- Authentication: Bearer JWT
- Request body:
  - reason: string (required)
- Responses:
  - 200: MilestoneDisputeResult
  - 400: Validation error (missing reason or invalid UUID)
  - 401: Unauthorized
  - 404: Contract or milestone not found

Response schema (MilestoneDisputeResult):
- milestoneId: string
- status: "disputed"
- disputeId: string
- disputeCreated: boolean

Notes:
- Initiator must be a party to the contract.
- Creates an in-memory dispute record and updates statuses.
- Marks the contract as disputed and notifies both parties.

#### GET /api/payments/contracts/{contractId}/status
- Purpose: Retrieve detailed payment status for a contract including milestone statuses.
- Path parameters:
  - contractId: UUID (required)
- Authentication: Bearer JWT
- Request body: None
- Responses:
  - 200: ContractPaymentStatus
  - 400: Validation error
  - 401: Unauthorized
  - 404: Contract not found

Response schema (ContractPaymentStatus):
- contractId: string
- escrowAddress: string
- totalAmount: number
- releasedAmount: number
- pendingAmount: number
- milestones: array of:
  - id: string
  - title: string
  - amount: number
  - status: enum("pending","in_progress","submitted","approved","disputed")
- contractStatus: string

Notes:
- Only parties to the contract can view the status.
- Computes totals from project milestone statuses.

### Payment Flow and Conditions

#### From Completion to Approval
- Freelancer completes a milestone; the system updates the milestone status to submitted and records the event on-chain via the milestone registry.
- Employer approves the milestone; the system releases funds via the escrow contract, updates statuses, and notifies both parties. If all milestones are approved, the contract and project are marked completed and the agreement is finalized on-chain.

```mermaid
flowchart TD
Start(["Start"]) --> Complete["Freelancer completes milestone"]
Complete --> SubmitReg["Submit to milestone registry"]
SubmitReg --> Approve["Employer approves milestone"]
Approve --> Release["Release funds via escrow"]
Release --> UpdateStatus["Update milestone status to approved"]
UpdateStatus --> CheckAll["Check if all milestones approved"]
CheckAll --> |Yes| CompleteContract["Mark contract and project completed<br/>Finalize agreement on-chain"]
CheckAll --> |No| End(["End"])
CompleteContract --> End
```

#### Dispute Conditions
- A milestone cannot be disputed if it is already approved or already under dispute.
- Only parties to the contract (freelancer or employer) can initiate a dispute.
- On dispute, the system creates a dispute record, updates milestone and contract statuses, and notifies both parties.

### Blockchain Integration Details
- Escrow deployment and funding:
  - The service deploys an escrow contract and funds it with the project budget.
  - The escrow stores balances and milestone statuses.
- Milestone release:
  - Only the employer can release a milestone; the service submits a transaction and confirms it, updating the escrow state.
- Milestone registry:
  - Submissions and approvals are recorded on-chain with hashes derived from milestone and contract identifiers.
- Notifications:
  - The system sends notifications for milestone submission, approval, payment release, and dispute creation.

### Client Implementation Examples

#### Example: Complete a Milestone
- Endpoint: POST /api/payments/milestones/{milestoneId}/complete?contractId={uuid}
- Headers: Authorization: Bearer <access_token>
- Body: empty
- Expected response: 200 with MilestoneCompletionResult

#### Example: Check Contract Payment Status
- Endpoint: GET /api/payments/contracts/{contractId}/status
- Headers: Authorization: Bearer <access_token>
- Query: contractId (UUID)
- Expected response: 200 with ContractPaymentStatus

## Dependency Analysis

```mermaid
classDiagram
class PaymentRoutes {
+POST /milestones/ : milestoneId/complete
+POST /milestones/ : milestoneId/approve
+POST /milestones/ : milestoneId/dispute
+GET /contracts/ : contractId/status
}
class PaymentService {
+requestMilestoneCompletion()
+approveMilestone()
+disputeMilestone()
+getContractPaymentStatus()
+initializeContractEscrow()
}
class EscrowContractService {
+deployEscrow()
+depositToEscrow()
+releaseMilestone()
+refundMilestone()
+getEscrowByContractId()
}
class MilestoneRegistryService {
+submitMilestoneToRegistry()
+approveMilestoneOnRegistry()
}
class NotificationService {
+notifyMilestoneSubmitted()
+notifyMilestoneApproved()
+notifyPaymentReleased()
+notifyDisputeCreated()
}
PaymentRoutes --> PaymentService : "calls"
PaymentService --> EscrowContractService : "uses"
PaymentService --> MilestoneRegistryService : "uses"
PaymentService --> NotificationService : "uses"
```

## Performance Considerations
- Transaction simulation: The blockchain interactions are simulated in-memory. In production, replace with real RPC calls and handle asynchronous confirmation.
- Notification throughput: Batch notifications if many users are notified concurrently.
- Escrow state caching: Cache frequently accessed escrow states to reduce repeated computation.
- Pagination: The payment repository supports paginated queries for payment history; use it for efficient retrieval.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Missing or invalid Authorization header: Ensure Bearer token is present and valid.
- Invalid UUID format: Verify milestoneId and contractId are valid UUIDs.
- Unauthorized actions: Only the freelancer (for completion) or employer (for approval/dispute) can perform respective actions.
- Not found resources: Ensure the contract and milestone exist and belong to the requesting user.
- Dispute preconditions: Cannot dispute an already approved or already disputed milestone.

## Conclusion
The FreelanceXchain payment API provides a clear, secure, and auditable flow for milestone completion, approval, and dispute resolution. It integrates with blockchain simulations for fund management and milestone registry, while maintaining robust authentication, validation, and notification mechanisms. Clients should follow the documented endpoints, parameter requirements, and response schemas to implement reliable payment workflows.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Reference Summary
- Base URL: http://localhost:7860/api
- Interactive docs: http://localhost:7860/api-docs
- Authentication: Bearer JWT in Authorization header

Endpoints:
- POST /api/payments/milestones/{milestoneId}/complete?contractId={uuid}
- POST /api/payments/milestones/{milestoneId}/approve?contractId={uuid}
- POST /api/payments/milestones/{milestoneId}/dispute?contractId={uuid}
- GET /api/payments/contracts/{contractId}/status

---

# Milestone Approval

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
This document describes the POST /api/payments/milestones/{milestoneId}/approve endpoint used by employers to approve a completed milestone. Upon approval, the system triggers a payment release from the blockchain escrow and updates internal state accordingly. It covers authentication, request validation, service invocation, blockchain integration, and response handling.

## Project Structure
The milestone approval flow spans routing, middleware, service orchestration, blockchain client, and auxiliary repositories and services.

```mermaid
graph TB
Client["Client"] --> Routes["Routes<br/>payment-routes.ts"]
Routes --> AuthMW["Auth Middleware<br/>auth-middleware.ts"]
Routes --> UUIDMW["UUID Validation<br/>validation-middleware.ts"]
Routes --> Service["Payment Service<br/>payment-service.ts"]
Service --> Escrow["Escrow Contract Service<br/>escrow-contract.ts"]
Service --> Registry["Milestone Registry<br/>milestone-registry.ts"]
Service --> Repo["Repositories<br/>contract-repository.ts"]
Service --> Notify["Notifications<br/>notification-service.ts"]
Escrow --> Chain["Blockchain Client<br/>blockchain-client.ts"]
```

## Core Components
- Route handler enforces JWT authentication and UUID validation for milestoneId, requires contractId query parameter, and invokes approveMilestone.
- Payment service validates ownership and milestone status, executes blockchain release via escrow contract, updates project and contract state, and notifies participants.
- Escrow contract service simulates blockchain transactions and updates in-memory state.
- Blockchain client simulates transaction submission, confirmation, and receipts.
- Milestone registry updates blockchain records for milestone approval.
- Repositories persist contract and project updates.
- Notifications inform freelancers and employers of approval and payment release.

## Architecture Overview
The approval flow integrates REST routing, middleware validation, service orchestration, blockchain execution, and state updates.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler<br/>payment-routes.ts"
participant A as "Auth Middleware<br/>auth-middleware.ts"
participant V as "Validation Middleware<br/>validation-middleware.ts"
participant S as "Payment Service<br/>payment-service.ts"
participant E as "Escrow Contract Service<br/>escrow-contract.ts"
participant BC as "Blockchain Client<br/>blockchain-client.ts"
participant MR as "Milestone Registry<br/>milestone-registry.ts"
participant N as "Notifications<br/>notification-service.ts"
C->>R : POST /api/payments/milestones/{milestoneId}/approve?contractId={uuid}<br/>Authorization : Bearer {jwt}
R->>A : Validate Authorization
A-->>R : Validated user or 401
R->>V : Validate UUID params and query
V-->>R : OK or 400
R->>S : approveMilestone(contractId, milestoneId, employerId)
S->>E : releaseMilestone(escrowAddress, milestoneId, employerAddress)
E->>BC : submitTransaction(...)
BC-->>E : Transaction receipt
E-->>S : Receipt with transactionHash
S->>MR : approveMilestoneOnRegistry(milestoneId, employerWallet)
MR-->>S : Registry receipt
S->>N : notifyMilestoneApproved(...)
S->>N : notifyPaymentReleased(...)
S-->>R : 200 {milestoneId, status=approved, paymentReleased, transactionHash?, contractCompleted}
R-->>C : Response
```

## Detailed Component Analysis

### Endpoint Definition
- Method: POST
- URL Pattern: /api/payments/milestones/{milestoneId}/approve
- Path Parameter:
  - milestoneId: UUID (validated by middleware)
- Required Query Parameter:
  - contractId: UUID (validated by route handler)
- Authentication:
  - Bearer JWT token required; validated by auth middleware
- Purpose:
  - Approve a completed milestone and trigger payment release from escrow

### Request Flow
1. Authentication
   - Route uses auth middleware to extract and validate JWT.
   - On missing/invalid token, responds with 401.
2. Validation
   - UUID validation ensures milestoneId is a valid UUID.
   - contractId query parameter is required; otherwise 400.
3. Service Invocation
   - Calls approveMilestone with contractId, milestoneId, and employerId.
4. Response Handling
   - Returns 200 with MilestoneApprovalResult on success.
   - Maps service error codes to 404 (not found), 403 (unauthorized), or 400 (validation/invalid status).

```mermaid
flowchart TD
Start(["Request Received"]) --> Auth["Validate Authorization Header"]
Auth --> AuthOK{"JWT Valid?"}
AuthOK --> |No| Resp401["Respond 401 Unauthorized"]
AuthOK --> |Yes| ValidateUUID["Validate UUID Params"]
ValidateUUID --> UUIDOK{"UUID Valid?"}
UUIDOK --> |No| Resp400UUID["Respond 400 Validation Error"]
UUIDOK --> |Yes| ValidateQuery["Validate contractId Query"]
ValidateQuery --> QueryOK{"contractId Present?"}
QueryOK --> |No| Resp400Missing["Respond 400 Validation Error"]
QueryOK --> |Yes| Invoke["Invoke approveMilestone(...)"]
Invoke --> InvokeOK{"Success?"}
InvokeOK --> |No| MapErr["Map error code to 404/403/400"]
MapErr --> RespErr["Respond with mapped status"]
InvokeOK --> |Yes| Resp200["Respond 200 with MilestoneApprovalResult"]
Resp401 --> End(["Exit"])
Resp400UUID --> End
Resp400Missing --> End
RespErr --> End
Resp200 --> End
```

### Service Layer: approveMilestone
Responsibilities:
- Validate contract existence and employer ownership.
- Validate project and milestone existence and status (must not be approved or disputed).
- Execute blockchain release via escrow contract service.
- Update project milestone status to approved.
- Optionally complete contract and project if all milestones approved.
- Update blockchain milestone registry to approved.
- Send notifications to freelancer and employer.

Key behaviors:
- Escrow release returns a transaction receipt containing transactionHash.
- If blockchain release fails, the service logs and continues (best-effort simulation).
- After updating local state, it attempts to approve the milestone on the blockchain registry.
- If all milestones approved, updates contract and project to completed and completes the agreement on-chain.

### Blockchain Integration: Escrow Release
- Uses getEscrowByContractId to locate escrow.
- Calls releaseMilestone with escrow address, milestoneId, and approver address.
- Submits transaction and confirms it; captures receipt with transactionHash.
- Updates in-memory escrow state (balance, milestone status).

```mermaid
sequenceDiagram
participant S as "Payment Service"
participant EC as "Escrow Contract Service"
participant BC as "Blockchain Client"
S->>EC : getEscrowByContractId(contractId)
EC-->>S : EscrowState
S->>EC : releaseMilestone(escrowAddress, milestoneId, employerAddress)
EC->>BC : submitTransaction(...)
BC-->>EC : Transaction
EC->>BC : confirmTransaction(txId)
BC-->>EC : Confirmed Transaction
EC-->>S : Receipt with transactionHash
```

### Blockchain Integration: Milestone Registry
- After local approval, the service calls approveMilestoneOnRegistry to update the blockchain record.
- The registry stores a record keyed by a hash of milestoneId and updates status to approved upon successful transaction confirmation.

### Notifications
- On approval: notifyMilestoneApproved to freelancer.
- On payment release: notifyPaymentReleased to freelancer.
- Notifications are persisted and delivered to users.

### Response Schema: 200 Success
MilestoneApprovalResult:
- milestoneId: string (UUID)
- status: "approved"
- paymentReleased: boolean (always true after successful release)
- transactionHash: string (optional; present if blockchain release succeeded)
- contractCompleted: boolean (true if all milestones approved and contract/project updated)

### Error Responses
- 400 Bad Request
  - Missing or invalid contractId query parameter.
  - Invalid UUID format for milestoneId.
- 401 Unauthorized
  - Missing or invalid Authorization header.
  - Token validation failure.
- 403 Forbidden
  - Only the contract employer can approve milestones.
- 404 Not Found
  - Contract or milestone not found.

Mapping logic:
- Service returns error codes; route handler maps:
  - NOT_FOUND -> 404
  - UNAUTHORIZED -> 403
  - Otherwise -> 400

### Practical Example
- Employer calls POST /api/payments/milestones/{milestoneId}/approve?contractId={contractId} with a valid Bearer token.
- Backend validates JWT, UUID, and contractId.
- Service locates the escrow, submits a release transaction, receives a receipt with transactionHash, updates project and contract state, and notifies both parties.
- Response includes status=approved, paymentReleased=true, transactionHash, and contractCompleted if applicable.

## Dependency Analysis
- Route depends on auth middleware and validation middleware.
- Payment service depends on repositories, blockchain client, milestone registry, and notification service.
- Escrow contract service depends on blockchain client.
- Milestone registry depends on blockchain client.
- Entity mapper defines shared types used across services.

```mermaid
graph LR
PR["payment-routes.ts"] --> AMW["auth-middleware.ts"]
PR --> VMW["validation-middleware.ts"]
PR --> PS["payment-service.ts"]
PS --> ER["escrow-contract.ts"]
PS --> MR["milestone-registry.ts"]
PS --> CR["contract-repository.ts"]
PS --> NS["notification-service.ts"]
ER --> BC["blockchain-client.ts"]
MR --> BC
EM["entity-mapper.ts"] --> PS
```

## Performance Considerations
- Transaction confirmation is simulated and immediate in this environment; in production, confirmation waits could increase latency.
- Best-effort blockchain release: failures are logged and do not block response; consider retry policies and idempotency for production.
- Notification sends are synchronous; consider queuing for high throughput.

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized
  - Ensure Authorization header is present and formatted as Bearer {token}.
  - Verify token is unexpired and valid.
- 400 Validation Error
  - Provide contractId query parameter as a UUID.
  - Ensure milestoneId is a valid UUID.
- 403 Forbidden
  - Only the contract employer can approve milestones; verify user ownership.
- 404 Not Found
  - Contract or milestone does not exist; verify identifiers.
- Blockchain Release Failure
  - Escrow release may fail due to insufficient balance or invalid state; check escrow balance and milestone status.

## Conclusion
The milestone approval endpoint securely approves completed milestones, releases funds from the blockchain escrow, updates internal state, and notifies stakeholders. It enforces strict authentication and validation, integrates with blockchain services for immutability, and provides a clear success response schema with optional transaction details.

---

# Milestone Completion

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
This document describes the POST /api/payments/milestones/{milestoneId}/complete endpoint used by freelancers to mark a milestone as complete. Upon successful submission, the system updates the milestone status, notifies the employer, and records the action on the blockchain registry. The endpoint requires JWT authentication and UUID validation for both path and query parameters.

## Project Structure
The endpoint is defined in the payment routes module and implemented by the payment service. It integrates with repositories for contracts and projects, user repository for identity, notification service for employer alerts, and blockchain services for registry updates.

```mermaid
graph TB
Client["Client"]
Router["payment-routes.ts<br/>Route handler"]
Auth["auth-middleware.ts<br/>JWT validation"]
Validator["validation-middleware.ts<br/>UUID validation"]
Service["payment-service.ts<br/>requestMilestoneCompletion(...)"]
ContractRepo["contract-repository.ts"]
ProjectRepo["project-repository.ts"]
UserRepo["user-repository.ts"]
Notif["notification-service.ts<br/>notifyMilestoneSubmitted(...)"]
Registry["milestone-registry.ts<br/>submitMilestoneToRegistry(...)"]
Escrow["escrow-contract.ts<br/>releaseMilestone(...)"]
Client --> Router
Router --> Auth
Router --> Validator
Router --> Service
Service --> ContractRepo
Service --> ProjectRepo
Service --> UserRepo
Service --> Notif
Service --> Registry
Service --> Escrow
```

## Core Components
- Route handler: Validates JWT, validates UUID path parameter, checks presence of contractId query parameter, and invokes the service.
- Service: Validates ownership, finds the project and milestone, updates status to submitted, submits to blockchain registry, and sends a notification to the employer.
- Repositories: Access contract and project entities to validate and update milestone status.
- Notification service: Sends an employer notification upon milestone submission.
- Blockchain integration: Submits milestone metadata to the registry for transparency.

## Architecture Overview
The endpoint follows a layered architecture:
- Presentation layer: Express route handler
- Application layer: Payment service orchestrating business logic
- Domain layer: Repositories for persistence
- Integration layer: Notifications and blockchain registry

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler<br/>payment-routes.ts"
participant A as "Auth Middleware<br/>auth-middleware.ts"
participant V as "UUID Validator<br/>validation-middleware.ts"
participant S as "Service<br/>payment-service.ts"
participant CR as "Contract Repo<br/>contract-repository.ts"
participant PR as "Project Repo<br/>project-repository.ts"
participant UR as "User Repo<br/>user-repository.ts"
participant NS as "Notification Service<br/>notification-service.ts"
participant MR as "Milestone Registry<br/>milestone-registry.ts"
C->>R : POST /api/payments/milestones/{milestoneId}/complete?contractId={uuid}
R->>A : authMiddleware()
A-->>R : validated user or 401
R->>V : validateUUID(["milestoneId"])
V-->>R : valid UUID or 400
R->>R : check contractId query present
alt missing contractId
R-->>C : 400
else valid
R->>S : requestMilestoneCompletion(contractId, milestoneId, userId)
S->>CR : getContractById(contractId)
CR-->>S : contract or NOT_FOUND
S->>PR : findProjectById(contract.projectId)
PR-->>S : project or NOT_FOUND
S->>PR : locate milestone by id
PR-->>S : milestone or NOT_FOUND
S->>S : validate status != approved/disputed
S->>PR : update project.milestones with status=submitted
S->>UR : getUserById(freelancerId), getUserById(employerId)
UR-->>S : users
S->>MR : submitMilestoneToRegistry(...)
MR-->>S : receipt or log error
S->>NS : notifyMilestoneSubmitted(employerId,...)
NS-->>S : ok
S-->>R : {milestoneId, status=submitted, notificationSent=true}
R-->>C : 200 OK
end
```

## Detailed Component Analysis

### Endpoint Definition
- Method: POST
- URL Pattern: /api/payments/milestones/{milestoneId}/complete
- Path Parameters:
  - milestoneId: UUID (validated by validateUUID)
- Query Parameters:
  - contractId: UUID (required)
- Authentication: JWT via authMiddleware
- Response: 200 with MilestoneCompletionResult

### Request Flow
1. Authentication
   - authMiddleware extracts Bearer token from Authorization header and validates it. Returns 401 if missing or invalid.
2. UUID Validation
   - validateUUID ensures milestoneId is a valid UUID; returns 400 otherwise.
3. Query Parameter Validation
   - contractId query parameter is required; returns 400 if missing.
4. Service Invocation
   - requestMilestoneCompletion is invoked with contractId, milestoneId, and authenticated userId.
5. Response Handling
   - On success, returns 200 with MilestoneCompletionResult.
   - On failure, maps service error codes to 404/403/400.

```mermaid
flowchart TD
Start(["Request Entry"]) --> CheckAuth["Check Authorization Header"]
CheckAuth --> AuthOK{"JWT Valid?"}
AuthOK --> |No| Resp401["Return 401 Unauthorized"]
AuthOK --> |Yes| CheckUUID["Validate milestoneId UUID"]
CheckUUID --> UUIDOK{"Valid UUID?"}
UUIDOK --> |No| Resp400UUID["Return 400 Invalid UUID"]
UUIDOK --> |Yes| CheckContractId["Check contractId Query Param"]
CheckContractId --> HasContractId{"contractId present?"}
HasContractId --> |No| Resp400Missing["Return 400 Missing contractId"]
HasContractId --> |Yes| InvokeSvc["Invoke requestMilestoneCompletion(...)"]
InvokeSvc --> SvcOK{"Service success?"}
SvcOK --> |No| MapErr["Map error code to 404/403/400"]
MapErr --> RespErr["Return mapped status with error payload"]
SvcOK --> |Yes| Resp200["Return 200 with MilestoneCompletionResult"]
Resp200 --> End(["Response Sent"])
RespErr --> End
Resp400Missing --> End
Resp400UUID --> End
Resp401 --> End
```

### Service Implementation Details
- Ownership Verification
  - Ensures the authenticated user is the freelancer associated with the contract.
- Project and Milestone Lookup
  - Loads the project by contract’s projectId and locates the milestone by id.
- Status Validation
  - Prevents submission if milestone is already approved or under dispute.
- Persistence
  - Updates the milestone status to submitted in the project entity and persists the change.
- Blockchain Registry
  - Attempts to submit milestone metadata to the registry; logs failures but continues.
- Notification
  - Sends a notification to the employer indicating the milestone is submitted.

```mermaid
classDiagram
class PaymentService {
+requestMilestoneCompletion(contractId, milestoneId, freelancerId) PaymentServiceResult
}
class ContractRepository {
+getContractById(id) ContractEntity
}
class ProjectRepository {
+findProjectById(id) ProjectEntity
+updateProject(id, updates) ProjectEntity
}
class UserRepository {
+getUserById(id) User
}
class NotificationService {
+notifyMilestoneSubmitted(employerId, ...) NotificationServiceResult
}
class MilestoneRegistry {
+submitMilestoneToRegistry(input) Receipt
}
PaymentService --> ContractRepository : "loads contract"
PaymentService --> ProjectRepository : "loads project, updates milestones"
PaymentService --> UserRepository : "loads users"
PaymentService --> NotificationService : "notify employer"
PaymentService --> MilestoneRegistry : "submit to registry"
```

### Response Schema
- 200 Success: MilestoneCompletionResult
  - milestoneId: string (UUID)
  - status: string (enum: submitted)
  - notificationSent: boolean

### Error Responses
- 400 Bad Request
  - Missing contractId query parameter
  - Invalid UUID format for milestoneId
- 401 Unauthorized
  - Missing or invalid Authorization header
- 403 Forbidden
  - Non-freelancer attempts to submit milestone completion
- 404 Not Found
  - Contract not found
  - Project not found
  - Milestone not found

### Practical Example
A freelancer completes a milestone and calls:
- Method: POST
- URL: /api/payments/milestones/{milestoneId}/complete?contractId={contractId}
- Headers: Authorization: Bearer <JWT>
- Body: None (no body required)

The system verifies the JWT, validates UUIDs, ensures the user is the contract’s freelancer, updates the milestone status to submitted, and sends a notification to the employer.

### Integration with Payment Service and Repository
- Payment Service updates the project’s milestone status and persists the change via ProjectRepository.
- The endpoint does not directly call a payment-repository; payment releases occur in the approve endpoint.

## Dependency Analysis
- Route depends on:
  - authMiddleware for JWT
  - validateUUID for UUID validation
  - payment-service for business logic
- Payment service depends on:
  - contract-repository, project-repository, user-repository
  - notification-service
  - milestone-registry
  - escrow-contract (used by other endpoints; not directly here)

```mermaid
graph LR
Routes["payment-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Val["validation-middleware.ts"]
Routes --> Service["payment-service.ts"]
Service --> ContractRepo["contract-repository.ts"]
Service --> ProjectRepo["project-repository.ts"]
Service --> UserRepo["user-repository.ts"]
Service --> Notif["notification-service.ts"]
Service --> Registry["milestone-registry.ts"]
```

## Performance Considerations
- The endpoint performs a small number of synchronous repository reads and writes plus a best-effort blockchain submission. Typical latency is dominated by repository operations and network calls to the notification service and registry.
- Consider caching frequently accessed contracts/projects if traffic increases.

## Troubleshooting Guide
- 401 Unauthorized
  - Ensure Authorization header is present and formatted as Bearer <token>.
  - Verify the token is unexpired and valid.
- 400 Invalid UUID
  - Confirm milestoneId is a valid UUID v4.
  - Confirm contractId is a valid UUID v4 and passed as a query parameter.
- 403 Forbidden
  - Only the freelancer associated with the contract can submit milestone completion.
- 404 Not Found
  - Contract, project, or milestone may not exist, or the milestone id does not belong to the project.

## Conclusion
The POST /api/payments/milestones/{milestoneId}/complete endpoint enables freelancers to submit milestone completion safely and transparently. It enforces authentication and UUID validation, updates the milestone status, notifies the employer, and records the event on the blockchain registry. The design cleanly separates concerns across route handlers, middleware, services, and repositories.

---

# Milestone Dispute

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
This document describes the POST /api/payments/milestones/{milestoneId}/dispute endpoint for the FreelanceXchain system. It covers the HTTP method, URL pattern, path parameter, required query parameter, and request body. It explains that either party (freelancer or employer) can dispute a milestone, which locks the funds and creates a dispute record for resolution. Authentication uses JWT with UUID validation. The request flow includes user authentication, contractId validation, reason validation, service invocation via disputeMilestone, and response handling. The 200 success response schema (MilestoneDisputeResult) is documented, along with error responses for 400, 401, 403, and 404. A practical example demonstrates a freelancer disputing a milestone due to unsatisfactory requirements. Finally, it explains how this endpoint integrates with the dispute resolution system and locks associated escrow funds.

## Project Structure
The milestone dispute endpoint is implemented in the payment routes and payment service, with support from authentication and validation middleware. Disputes are persisted and integrated with blockchain registries and escrow contracts.

```mermaid
graph TB
Client["Client"] --> Routes["Payment Routes<br/>payment-routes.ts"]
Routes --> AuthMW["Auth Middleware<br/>auth-middleware.ts"]
Routes --> ValMW["Validation Middleware<br/>validation-middleware.ts"]
Routes --> Service["Payment Service<br/>payment-service.ts"]
Service --> Repo["Repositories & Mappers"]
Service --> Escrow["Escrow Contract Service<br/>escrow-contract.ts"]
Service --> DisputeSvc["Dispute Service<br/>dispute-service.ts"]
DisputeSvc --> DisputeRepo["Dispute Repository<br/>dispute-repository.ts"]
DisputeSvc --> DisputeReg["Dispute Registry<br/>dispute-registry.ts"]
```

## Core Components
- Endpoint definition and Swagger schema for the dispute route.
- Route handler that enforces JWT authentication, validates UUID parameters, checks for required contractId query parameter, validates reason in request body, and invokes disputeMilestone.
- Payment service disputeMilestone function that validates contract and milestone ownership, checks milestone status, creates a dispute record, updates milestone and contract statuses, and sends notifications.
- Dispute service that persists disputes, records on blockchain, updates milestone and contract statuses, and integrates with escrow for resolution outcomes.
- Validation middleware that ensures UUID format for path parameters and provides standardized error responses.

## Architecture Overview
The endpoint follows a layered architecture:
- HTTP layer: route handler validates inputs and delegates to service layer.
- Service layer: orchestrates repository and external integrations (notifications, blockchain, escrow).
- Persistence: dispute repository stores dispute records.
- External systems: blockchain dispute registry and escrow contract service.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler<br/>payment-routes.ts"
participant A as "Auth Middleware<br/>auth-middleware.ts"
participant V as "Validation MW<br/>validation-middleware.ts"
participant S as "Payment Service<br/>payment-service.ts"
participant D as "Dispute Service<br/>dispute-service.ts"
participant ER as "Escrow Contract<br/>escrow-contract.ts"
participant DR as "Dispute Registry<br/>dispute-registry.ts"
C->>R : POST /api/payments/milestones/{milestoneId}/dispute
R->>A : Authenticate JWT
A-->>R : User validated or error
R->>V : Validate UUID params and reason
V-->>R : Validation ok or error
R->>S : disputeMilestone(contractId, milestoneId, userId, reason)
S->>D : createDispute(...)
D->>ER : Lock funds via blockchain (record dispute)
D-->>S : Dispute created
S-->>R : MilestoneDisputeResult
R-->>C : 200 OK with MilestoneDisputeResult
```

## Detailed Component Analysis

### Endpoint Definition and Request Flow
- Method: POST
- URL pattern: /api/payments/milestones/{milestoneId}/dispute
- Path parameter:
  - milestoneId (UUID)
- Required query parameter:
  - contractId (UUID)
- Request body:
  - reason (string, required)
- Authentication:
  - Bearer JWT token in Authorization header
- Validation:
  - UUID validation for milestoneId
  - Presence and type validation for reason
  - Presence of contractId query parameter

The route handler performs:
- JWT authentication via authMiddleware
- UUID validation for milestoneId via validateUUID
- ContractId presence check
- Reason presence/type check
- Invocation of disputeMilestone
- Error mapping to 400/401/403/404 based on service error codes
- Success response with MilestoneDisputeResult

### Payment Service: disputeMilestone
Responsibilities:
- Validate contract existence and that the initiator is a party to the contract.
- Validate project and milestone existence and status (not approved, not already disputed).
- Create a dispute record (in-memory store in simulation).
- Update milestone status to disputed and contract status to disputed.
- Notify both parties.
- Return MilestoneDisputeResult with milestoneId, status=disputed, disputeId, and disputeCreated=true.

Integration points:
- Repository access for contract and project data.
- Notification service for dispute created notifications.
- Blockchain integration via dispute-registry and escrow-contract services (see Dispute Service for blockchain actions).

### Dispute Service: createDispute and Blockchain Integration
Responsibilities:
- Validate contract and project existence.
- Verify initiator is a party to the contract.
- Validate milestone exists and is not already disputed or approved.
- Create dispute entity with status=open.
- Persist dispute via disputeRepository.
- Record dispute on blockchain registry with wallets and amount.
- Update milestone status to disputed and contract status to disputed.
- Notify both parties.
- Return created dispute.

Blockchain and Escrow Integration:
- Dispute registry records dispute metadata and tracks user stats.
- Agreement contract is marked as disputed.
- Escrow contract status reflects dispute lifecycle during resolution.

### Response Schema: MilestoneDisputeResult
- milestoneId: string (UUID)
- status: "disputed"
- disputeId: string (UUID)
- disputeCreated: boolean

This schema is defined in the route’s Swagger documentation and returned by the service upon successful dispute creation.

### Error Responses
- 400 Bad Request:
  - Missing or invalid reason in request body.
  - Missing or invalid contractId query parameter.
  - Invalid UUID format for milestoneId.
- 401 Unauthorized:
  - Missing or invalid Authorization header.
  - Invalid/expired JWT token.
- 403 Forbidden:
  - Only contract parties (freelancer or employer) can dispute a milestone.
- 404 Not Found:
  - Contract or milestone not found.

The route handler maps service error codes to appropriate HTTP status codes.

### Practical Example: Freelancer Disputes a Milestone
Scenario:
- A freelancer initiates a dispute for milestoneId X due to unsatisfactory requirements.
- The freelancer calls POST /api/payments/milestones/X/dispute with:
  - Authorization: Bearer <JWT>
  - Query: contractId=Y (UUID)
  - Body: { reason: "Requirements were not met as specified" }
- The system validates JWT, UUIDs, reason, and contract/milestone existence/status.
- It creates a dispute record, sets milestone and contract status to disputed, and notifies both parties.
- The response returns MilestoneDisputeResult indicating status=disputed and disputeCreated=true.

Outcome:
- Funds remain locked in the escrow until the dispute is resolved.
- The dispute enters the resolution workflow managed by the dispute service.

### Integration with Dispute Resolution and Escrow Lock
- Dispute Creation:
  - Payment service creates a dispute record and updates statuses.
  - Dispute service persists the record and records the dispute on the blockchain registry.
- Escrow Lock:
  - The blockchain registry tracks dispute records and user statistics.
  - During resolution, depending on the decision, funds are released to the freelancer, refunded to the employer, or handled according to split decisions.
- Contract Status:
  - Contract status transitions to disputed while any milestone is under dispute and reverts to active when all disputes are resolved.

```mermaid
flowchart TD
Start(["Dispute Created"]) --> UpdateStatus["Update Milestone Status to Disputed"]
UpdateStatus --> UpdateContract["Update Contract Status to Disputed"]
UpdateContract --> NotifyParties["Notify Both Parties"]
NotifyParties --> RecordBlockchain["Record Dispute on Blockchain"]
RecordBlockchain --> EscrowLock["Escrow Funds Locked"]
EscrowLock --> Resolution["Resolution Workflow"]
Resolution --> Decision{"Decision"}
Decision --> |Freelancer Favor| Release["Release to Freelancer"]
Decision --> |Employer Favor| Refund["Refund to Employer"]
Decision --> |Split| SplitDecision["Partial Release / Further Action"]
Release --> End(["Resolved"])
Refund --> End
SplitDecision --> End
```

## Dependency Analysis
Key dependencies and relationships:
- Route depends on auth-middleware and validation-middleware for security and input validation.
- Route delegates to payment-service.disputeMilestone.
- Payment service coordinates with repositories and notification services.
- Dispute service manages persistence and blockchain interactions.
- Escrow contract service participates in fund locking and resolution outcomes.

```mermaid
graph LR
PR["payment-routes.ts"] --> AMW["auth-middleware.ts"]
PR --> VMW["validation-middleware.ts"]
PR --> PS["payment-service.ts"]
PS --> DS["dispute-service.ts"]
DS --> DR["dispute-repository.ts"]
DS --> EC["escrow-contract.ts"]
DS --> DReg["dispute-registry.ts"]
PS --> EM["entity-mapper.ts"]
```

## Performance Considerations
- Input validation occurs before heavy operations, reducing unnecessary service calls.
- Dispute creation is lightweight; blockchain recording is asynchronous and logged for failures.
- Notifications are sent after status updates to ensure clients receive accurate state.
- Consider caching frequently accessed contract and project data if scalability becomes a concern.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized:
  - Ensure Authorization header is present and formatted as Bearer <token>.
  - Verify the token is valid and not expired.
- 400 Bad Request:
  - Missing reason in request body or invalid type.
  - Missing contractId query parameter.
  - Invalid UUID format for milestoneId.
- 403 Forbidden:
  - Only the freelancer or employer associated with the contract can dispute a milestone.
- 404 Not Found:
  - Contract or milestone not found; verify contractId and milestoneId.
- Duplicate or Invalid Status:
  - Cannot dispute an approved milestone or a milestone already under dispute.

## Conclusion
The POST /api/payments/milestones/{milestoneId}/dispute endpoint enables either party to initiate a dispute, which locks funds and creates a dispute record. The implementation enforces JWT authentication, validates UUIDs and request parameters, and integrates with the dispute resolution system and escrow contracts. The response schema provides clear confirmation of the dispute creation and current status.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Definition Summary
- Method: POST
- URL: /api/payments/milestones/{milestoneId}/dispute
- Path parameters:
  - milestoneId (UUID)
- Query parameters:
  - contractId (UUID, required)
- Request body:
  - reason (string, required)
- Authentication:
  - Bearer JWT
- Success response:
  - 200 OK with MilestoneDisputeResult
- Error responses:
  - 400 Bad Request (validation errors)
  - 401 Unauthorized (missing/invalid token)
  - 403 Forbidden (unauthorized party)
  - 404 Not Found (contract or milestone not found)

---

# Payment Status

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
This document describes the GET /api/payments/contracts/{contractId}/status endpoint in the FreelanceXchain system. It explains the endpoint’s purpose, authentication and validation requirements, request flow, response schema, and error handling. It also clarifies how the endpoint aggregates data from on-chain and off-chain sources to present a comprehensive payment overview for a given contract.

## Project Structure
The endpoint is implemented as part of the Payments module:
- Route handler: defines the HTTP method, URL pattern, path parameter, middleware, and response handling
- Service: computes the payment status by combining off-chain data (project and contract entities) and on-chain data (escrow address)
- Middleware: enforces JWT authentication and validates UUID parameters
- Repositories: provide access to contract and project entities
- Swagger/OpenAPI: documents the endpoint and response schema

```mermaid
graph TB
Client["Client"] --> Router["Route Handler<br/>GET /api/payments/contracts/{contractId}/status"]
Router --> AuthMW["Auth Middleware<br/>JWT validation"]
Router --> UUIDMW["UUID Validation Middleware"]
Router --> Service["Payment Service<br/>getContractPaymentStatus()"]
Service --> ContractRepo["Contract Repository"]
Service --> ProjectRepo["Project Repository"]
ContractRepo --> DB["Supabase Contracts Table"]
ProjectRepo --> DB2["Supabase Projects Table"]
Service --> Chain["Blockchain (Escrow Address)"]
Router --> Client
```

## Core Components
- Endpoint definition and request flow:
  - HTTP method: GET
  - URL pattern: /api/payments/contracts/{contractId}/status
  - Path parameter: contractId (UUID)
  - Authentication: Bearer JWT token required
  - Validation: contractId must be a valid UUID
- Service function:
  - getContractPaymentStatus(contractId, userId) returns ContractPaymentStatus
  - Enforces that only a party to the contract (employer or freelancer) can access the status
  - Aggregates off-chain data (project budget, milestones, statuses) and on-chain data (escrow address)
- Response schema:
  - ContractPaymentStatus includes contractId, escrowAddress, totalAmount, releasedAmount, pendingAmount, milestones array, and contractStatus

## Architecture Overview
The endpoint follows a layered architecture:
- Presentation layer: Express route handler
- Application layer: Payment service orchestrating repositories and blockchain data
- Data layer: Supabase repositories for contracts and projects
- Security layer: JWT auth middleware and UUID validation middleware

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler"
participant A as "Auth Middleware"
participant V as "UUID Validation Middleware"
participant S as "Payment Service"
participant CR as "Contract Repository"
participant PR as "Project Repository"
C->>R : "GET /api/payments/contracts/{contractId}/status"
R->>A : "Validate Authorization header"
A-->>R : "Validated user (userId)"
R->>V : "Validate contractId UUID"
V-->>R : "UUID OK"
R->>S : "getContractPaymentStatus(contractId, userId)"
S->>CR : "getContractById(contractId)"
CR-->>S : "Contract entity"
S->>PR : "findProjectById(contract.projectId)"
PR-->>S : "Project entity"
S-->>R : "ContractPaymentStatus"
R-->>C : "200 OK with ContractPaymentStatus"
```

## Detailed Component Analysis

### Endpoint Definition and Behavior
- Purpose: Retrieve detailed payment status for a contract, including escrow details, total/pending/released amounts, and individual milestone statuses.
- Authentication: Requires a Bearer token; unauthorized responses are returned if missing or invalid.
- Validation: Validates that contractId is a UUID; invalid UUID returns a 400 error.
- Access control: Only the contract employer or freelancer can access the status; otherwise returns 403.

### Request Flow
- Route handler:
  - Extracts userId from validated JWT and contractId from path
  - Calls getContractPaymentStatus(contractId, userId)
  - Maps service result to HTTP status and JSON payload
- Service function:
  - Loads contract and project entities
  - Verifies the requesting user is a party to the contract
  - Computes totals from project milestones
  - Returns ContractPaymentStatus with aggregated data

```mermaid
flowchart TD
Start(["Request Received"]) --> CheckAuth["Check Authorization Header"]
CheckAuth --> AuthOK{"JWT Valid?"}
AuthOK --> |No| Return401["Return 401 Unauthorized"]
AuthOK --> |Yes| CheckUUID["Validate contractId UUID"]
CheckUUID --> UUIDOK{"UUID Valid?"}
UUIDOK --> |No| Return400["Return 400 Invalid UUID"]
UUIDOK --> |Yes| LoadContract["Load Contract by ID"]
LoadContract --> Found{"Contract Found?"}
Found --> |No| Return404["Return 404 Not Found"]
Found --> |Yes| CheckParty["Verify User is Contract Party"]
CheckParty --> IsParty{"Is Employer or Freelancer?"}
IsParty --> |No| Return403["Return 403 Forbidden"]
IsParty --> |Yes| LoadProject["Load Project by Contract.projectId"]
LoadProject --> Compute["Compute totals from milestones"]
Compute --> BuildResp["Build ContractPaymentStatus"]
BuildResp --> Return200["Return 200 OK"]
```

### Response Schema: ContractPaymentStatus
The endpoint returns a structured JSON object containing:
- contractId: string (UUID)
- escrowAddress: string (on-chain escrow address)
- totalAmount: number (project budget)
- releasedAmount: number (sum of approved milestone amounts)
- pendingAmount: number (totalAmount - releasedAmount)
- milestones: array of objects with:
  - id: string (UUID)
  - title: string
  - amount: number
  - status: string (one of pending, in_progress, submitted, approved, disputed)
- contractStatus: string (active, completed, disputed, cancelled)

Swagger/OpenAPI documentation for this schema is embedded in the route file.

### Authentication and UUID Validation
- JWT authentication:
  - Route handler applies authMiddleware
  - authMiddleware validates Authorization header format and token validity
  - On failure, returns 401 with standardized error structure
- UUID validation:
  - Route handler applies validateUUID(['contractId'])
  - validateUUID checks path parameter format and returns 400 on mismatch

### Error Responses
- 400 Bad Request:
  - Invalid UUID format for contractId
- 401 Unauthorized:
  - Missing or invalid Authorization header/token
- 403 Forbidden:
  - User is not a party to the contract
- 404 Not Found:
  - Contract or project not found

These mappings are handled in the route handler by inspecting the service result code and returning the appropriate HTTP status.

### Practical Example: Checking Contract Payment Progress
- Scenario: A freelancer wants to check the payment progress of a contract they are working on.
- Steps:
  1. Obtain a valid JWT access token from the authentication flow.
  2. Call GET /api/payments/contracts/{contractId}/status with the Authorization: Bearer <token> header.
  3. The server validates the token and UUID, loads the contract and project, computes totals, and returns the ContractPaymentStatus object.
- Outcome:
  - The response shows totalAmount, releasedAmount, pendingAmount, and a list of milestones with their current status, enabling the user to track progress.

### Aggregation of On-chain and Off-chain Data
- Off-chain data:
  - Contract entity (including escrowAddress and contract status)
  - Project entity (including budget and milestone list with amounts and statuses)
- On-chain data:
  - Escrow address is included in the response; while the route itself does not query blockchain balances, the service returns the escrow address for transparency and potential future integration.
- The service computes releasedAmount by summing approved milestone amounts and pendingAmount as the difference between totalAmount and releasedAmount.

## Dependency Analysis
The endpoint depends on:
- Route handler for routing and middleware application
- Auth middleware for JWT validation
- UUID validation middleware for parameter validation
- Payment service for business logic and aggregation
- Repositories for data access
- Swagger/OpenAPI for documentation

```mermaid
graph LR
Routes["payment-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> UUID["validation-middleware.ts"]
Routes --> Service["payment-service.ts"]
Service --> ContractRepo["contract-repository.ts"]
Service --> ProjectRepo["project-repository.ts"]
Routes --> Docs["API-DOCUMENTATION.md"]
```

## Performance Considerations
- The endpoint performs two database reads (contract and project) and a constant-time aggregation over milestones. Complexity is O(n) in the number of milestones.
- No blockchain queries are executed in the route handler; the escrow address is returned from the contract entity.
- Recommendations:
  - Ensure indexes on contract and project tables for efficient lookups by ID.
  - Keep milestone arrays reasonably sized to minimize aggregation overhead.
  - Consider caching frequently accessed contract/project data if latency becomes a concern.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized:
  - Cause: Missing or invalid Authorization header
  - Resolution: Include a valid Bearer token in the Authorization header
- 400 Bad Request (UUID):
  - Cause: contractId is not a valid UUID
  - Resolution: Ensure contractId follows UUID v4 format
- 403 Forbidden:
  - Cause: User is not the employer or freelancer associated with the contract
  - Resolution: Authenticate as a valid contract party
- 404 Not Found:
  - Cause: Contract or project not found
  - Resolution: Verify contractId and ensure the contract links to a valid project

## Conclusion
The GET /api/payments/contracts/{contractId}/status endpoint provides a comprehensive view of a contract’s payment status by combining off-chain data (project budget and milestone statuses) with on-chain metadata (escrow address). It enforces strict authentication and validation, returns a well-defined response schema, and maps service errors to appropriate HTTP statuses for predictable client handling.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Endpoint Reference
- Method: GET
- URL: /api/payments/contracts/{contractId}/status
- Path parameters:
  - contractId: string (UUID)
- Query parameters: None
- Headers:
  - Authorization: Bearer <token>
- Success response: 200 OK with ContractPaymentStatus
- Error responses: 400 (invalid UUID), 401 (unauthenticated), 403 (unauthorized), 404 (not found)

### Response Schema Details
- contractId: string (UUID)
- escrowAddress: string
- totalAmount: number
- releasedAmount: number
- pendingAmount: number
- milestones: array of objects with id, title, amount, status
- contractStatus: string

---

# Project API

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

## Core Components
- Authentication: All protected endpoints require a Bearer token in the Authorization header. The middleware validates presence, format, and token validity, and attaches user metadata to the request.
- Validation: JSON schema-based validation enforces field types, lengths, formats, enums, and required properties for request bodies and parameters.
- Project Service: Orchestrates project creation, updates, milestone setting/addition, and search/filtering. Enforces business rules such as skill validation, milestone budget alignment, and project lock after proposal acceptance.
- Project Repository: Implements database queries for listing, filtering, and paginated retrieval of projects.
- Proposal Service: Interacts with proposals to enforce lifecycle transitions and project status changes upon proposal acceptance.

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

## Detailed Component Analysis

### Authentication and Authorization
- JWT requirement: All protected endpoints require Authorization: Bearer <token>.
- Role enforcement: Employer-only endpoints are guarded by a role-check middleware.
- UUID validation: Path parameters are validated to be UUIDs.

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

#### GET /api/projects/{id}
- Purpose: Retrieve a specific project by ID.
- Path parameter: id (UUID).
- Response: Project object.

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

#### GET /api/projects/{id}/proposals
- Purpose: List proposals for a specific project (employer only).
- Path parameter: id (UUID).
- Query parameters:
  - limit: integer; default 20; max 100.
  - continuationToken: string; pagination token.
- Response: Paginated list of proposals with items, hasMore, continuationToken.
- Errors: 400 Invalid UUID, 401 Unauthorized, 404 Not found.

### Request/Response Schemas
- Project schema (OpenAPI):
  - id, employerId, title, description, requiredSkills, budget, deadline, status, milestones, createdAt, updatedAt.
  - Status enum: draft, open, in_progress, completed, cancelled.
  - Milestone schema: id, title, description, amount, dueDate, status enum pending, in_progress, submitted, approved, disputed.
- Error response schema (OpenAPI):
  - error: code, message, details (optional).
  - timestamp, requestId.

### Validation Rules Summary
- Title: minimum length 5.
- Description: minimum length 20.
- requiredSkills: non-empty array; each skillId must be a valid UUID.
- Budget: minimum 100.
- Deadline: required date-time.
- Milestones: each item requires title, description, amount (>0), dueDate (date-time).
- Status: enum draft, open, in_progress, completed, cancelled.

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

#### Example: Retrieve Project Proposals
- Steps:
  1) Authenticate with JWT Bearer token.
  2) GET /api/projects/{id}/proposals with:
     - limit (optional), continuationToken (optional).
- Notes:
  - Employers can only view proposals for their own projects.

### Filtering and Search
- Keyword search: GET /api/projects with keyword query parameter.
- Skills filter: GET /api/projects with skills query parameter (comma-separated).
- Budget range filter: GET /api/projects with minBudget and maxBudget query parameters.
- Pagination: limit and continuationToken supported across endpoints.

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

### Additional Notes
- Swagger/OpenAPI definitions centralize schemas for consistent documentation and client generation.
- The interactive documentation is available at the base URL’s api-docs path.

---

# Milestone Management

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

### Example: Three Milestones for a $3000 Project
- Request body (JSON):
  - milestones:
    - [{ title: "...", description: "...", amount: 1000, dueDate: "YYYY-MM-DDT00:00:00Z" }, 
       { title: "...", description: "...", amount: 1200, dueDate: "YYYY-MM-DDT00:00:00Z" }, 
       { title: "...", description: "...", amount: 800, dueDate: "YYYY-MM-DDT00:00:00Z" }]
- Total: 1000 + 1200 + 800 = 3000 (equals project budget)
- Response: 200 OK with Project including milestones array.

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

## Conclusion
The POST /api/projects/{id}/milestones endpoint enables employers to define project milestones with strict validation and a critical budget alignment rule. Milestones are embedded in the Project response and drive the escrow payment release process, integrating with blockchain registries for verifiable milestone completion. Adhering to the validation rules and budget constraint ensures smooth execution of milestone approvals and fund releases.

---

# Project Creation

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

### Authentication and Role-Based Access Control
- Authentication:
  - Authorization header must be present and formatted as "Bearer <token>"
  - Token is validated; expired or invalid tokens return 401
- Role enforcement:
  - Only users with role "employer" are permitted to create projects
  - Non-employer users receive 403 Forbidden

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

### Data Model and Response Schema
- Project object fields:
  - id, employerId, title, description, requiredSkills, budget, deadline, status, milestones, createdAt, updatedAt
- SkillReference fields:
  - skillId, skillName, categoryId, yearsOfExperience
- Milestone fields:
  - id, title, description, amount, dueDate, status

### Database Schema Context
- projects table stores:
  - employer_id, title, description, required_skills (JSONB), budget, deadline, status, milestones (JSONB), timestamps
- Skills and categories are stored in separate tables with is_active flags

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

---

# Project Retrieval

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

## Conclusion
The project retrieval endpoints provide flexible filtering (keyword, skills, budget range) and robust pagination. The route handlers delegate to services, which orchestrate repository queries to Supabase. Swagger schemas define the Project model and pagination metadata, while validation middleware ensures parameter correctness. Use the documented query parameters and response structure to integrate project listing and single-project retrieval seamlessly.

---

# Project Update

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

## Core Components
- Endpoint: PATCH /api/projects/{id}
- Authentication: Bearer token required
- Authorization: Only the project owner (employer) can update
- Locking rule: Cannot update a project that has accepted proposals (409 Conflict)
- Updatable fields: title, description, requiredSkills, budget, deadline, status
- Validation: Mirrors creation constraints (minimum lengths, budget minimum, skill IDs)
- Response: Updated Project object

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

### Route Handler Logic
Key behaviors:
- Authentication and role enforcement occur before any business logic.
- UUID validation is performed on the path parameter.
- Lightweight validation is applied to fields present in the request body.
- Delegates to service layer for ownership, locking, and persistence.
- Maps service error codes to appropriate HTTP status codes (including 409 for PROJECT_LOCKED).

### Service Layer Validation and Business Rules
Key behaviors:
- Ownership check: project must belong to the authenticated employer.
- Locking check: if any proposal has status accepted, reject with PROJECT_LOCKED.
- Skill validation: requiredSkills skillId values must correspond to active skills.
- Budget constraint: when updating budget or milestones, ensure milestone amounts sum to the new budget.
- Partial updates: only provided fields are updated; others remain unchanged.
- Persistence: repository update returns the updated project entity.

### Repository Operations
- ProjectRepository.updateProject(id, updates) persists changes to the project record.
- ProposalRepository.hasAcceptedProposal(projectId) determines whether any proposal is accepted, enforcing the lock.

### Validation Rules (Mirroring Creation Constraints)
- title: if provided, must be at least 5 characters
- description: if provided, must be at least 20 characters
- budget: if provided, must be at least 100
- requiredSkills: if provided, each skillId must be a valid UUID and correspond to an active skill
- deadline: if provided, must be a valid date-time string
- status: must be one of draft, open, in_progress, completed, cancelled

These rules are enforced during update and ensure consistency with creation constraints.

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

## Conclusion
The PATCH /api/projects/{id} endpoint enables employers to update project details while maintaining strong safeguards. Ownership verification and the accepted-proposal lock prevent modifications when a project is actively engaged. Validation rules mirror creation constraints to preserve data quality. The response returns the updated Project object, ensuring clients have the latest state.

---

# Proposal Listing

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

### Authentication and Authorization
- Bearer token validation occurs via authMiddleware
- Role enforcement ensures only employers can access this endpoint
- Ownership verification checks that the logged-in employer is the project owner

References:
- Auth middleware: [auth-middleware.ts](file://src/middleware/auth-middleware.ts#L1-L101)
- Employer role enforcement: [project-routes.ts](file://src/routes/project-routes.ts#L628-L683)

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

### Response Structure
- items: array of Proposal objects
- hasMore: boolean
- continuationToken: string

Proposal model fields:
- id, projectId, freelancerId, coverLetter, proposedRate, estimatedDuration, status, createdAt, updatedAt

References:
- Proposal schema: [swagger.ts](file://src/config/swagger.ts#L139-L152)
- Proposal entity mapping: [entity-mapper.ts](file://src/utils/entity-mapper.ts#L252-L279)

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

## Dependency Analysis
```mermaid
graph LR
PR["project-routes.ts"] --> AM["auth-middleware.ts"]
PR --> PS["proposal-service.ts"]
PS --> PRV["proposal-repository.ts"]
PRV --> BR["base-repository.ts"]
PS --> EM["entity-mapper.ts"]
```

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

## Conclusion
The GET /api/projects/{id}/proposals endpoint securely lists all proposals for a project with robust authentication, role-based authorization, and pagination. Employers can retrieve proposals for their own projects, and clients can paginate using limit and continuationToken. The response structure aligns with the Swagger schema for proposals and pagination metadata.

---

# Proposal API

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
This document provides comprehensive API documentation for the proposal system in the FreelanceXchain platform. It covers all endpoints for submitting, retrieving, and managing proposals, including acceptance and withdrawal workflows. It also documents authentication requirements (JWT), role-based access controls, validation rules, and the proposal status lifecycle (pending, accepted, rejected, withdrawn). Client implementation examples are included to show how to submit a proposal and handle the contract creation response when a proposal is accepted.

## Project Structure
The proposal system spans routing, service, repository, and mapping layers, plus Swagger definitions and authentication middleware.

```mermaid
graph TB
Client["Client"]
Routes["Routes<br/>proposal-routes.ts"]
Service["Services<br/>proposal-service.ts"]
Repo["Repositories<br/>proposal-repository.ts"]
Mapper["Entity Mappers<br/>entity-mapper.ts"]
Swagger["Swagger Config<br/>swagger.ts"]
Auth["Auth Middleware<br/>auth-middleware.ts"]
Client --> Routes
Routes --> Auth
Routes --> Service
Service --> Repo
Repo --> Mapper
Routes --> Swagger
```

## Core Components
- Routes define HTTP endpoints, request/response schemas, and apply authentication and role checks.
- Services encapsulate business logic, enforce status rules, and orchestrate repository operations and blockchain interactions.
- Repositories abstract persistence and expose typed CRUD operations.
- Entity mappers convert between database entities and API models.
- Swagger defines OpenAPI schemas for Proposal and Contract types.
- Auth middleware validates JWT and enforces role-based access.

## Architecture Overview
The proposal API follows a layered architecture:
- HTTP layer: Express routes
- Application layer: Service functions
- Persistence layer: Supabase repository
- Mapping layer: Entity mappers
- Security layer: JWT auth and role checks

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Routes"
participant A as "Auth Middleware"
participant S as "Proposal Service"
participant P as "Proposal Repository"
participant PM as "Entity Mapper"
participant B as "Blockchain"
C->>R : "POST /api/proposals"
R->>A : "Validate JWT and role"
A-->>R : "Authenticated"
R->>S : "submitProposal(freelancerId, payload)"
S->>P : "findProjectById(projectId)"
S->>P : "getExistingProposal(projectId, freelancerId)"
S->>P : "createProposal(entity)"
S->>PM : "mapProposalFromEntity(entity)"
S-->>R : "ProposalWithNotification"
R-->>C : "201 Proposal"
```

## Detailed Component Analysis

### Authentication and Authorization
- All protected endpoints require a Bearer token in the Authorization header.
- The auth middleware validates the token format and decodes user identity and role.
- Role checks restrict endpoints to freelancers or employers as indicated below.

Key behaviors:
- Missing or malformed Authorization header yields 401.
- Invalid/expired token yields 401 with specific error code.
- Missing role yields 403.

### Proposal Model and Schemas
Proposal schema includes:
- id, projectId, freelancerId
- coverLetter, proposedRate, estimatedDuration
- status: pending, accepted, rejected, withdrawn
- createdAt, updatedAt

Contract schema includes:
- id, projectId, proposalId, freelancerId, employerId
- escrowAddress, totalAmount
- status: active, completed, disputed, cancelled
- createdAt, updatedAt

These schemas are defined in Swagger and used across responses.

### Endpoints

#### Submit Proposal
- Method: POST
- URL: /api/proposals
- Authentication: JWT required; role: freelancer
- Request body:
  - projectId (string, UUID)
  - coverLetter (string, min length 10)
  - proposedRate (number, >= 1)
  - estimatedDuration (number, >= 1)
- Responses:
  - 201: Proposal created
  - 400: Validation error
  - 401: Unauthorized
  - 404: Project not found
  - 409: Duplicate proposal

Validation rules enforced:
- projectId must be a valid UUID
- coverLetter must be at least 10 characters
- proposedRate must be at least 1
- estimatedDuration must be at least 1 day
- Project must be open
- No duplicate proposal from the same freelancer for the same project

Success response includes the created Proposal.

#### Get Proposal by ID
- Method: GET
- URL: /api/proposals/{id}
- Authentication: JWT required
- Path parameter: id (UUID)
- Responses:
  - 200: Proposal
  - 400: Invalid UUID format
  - 401: Unauthorized
  - 404: Proposal not found

#### Get My Proposals (Freelancer)
- Method: GET
- URL: /api/proposals/freelancer/me
- Authentication: JWT required; role: freelancer
- Responses:
  - 200: Array of Proposal
  - 401: Unauthorized

#### Accept Proposal
- Method: POST
- URL: /api/proposals/{id}/accept
- Authentication: JWT required; role: employer
- Path parameter: id (UUID)
- Responses:
  - 200: { proposal: Proposal, contract: Contract }
  - 400: Invalid proposal status or UUID format
  - 401: Unauthorized
  - 403: Unauthenticated or unauthorized
  - 404: Proposal not found

Behavior:
- Validates proposal is pending
- Verifies employer owns the associated project
- Updates proposal status to accepted
- Creates a Contract entity linked to the proposal and project
- Attempts to create and sign a blockchain agreement (best-effort)
- Updates project status to in_progress
- Sends notification to freelancer

#### Reject Proposal
- Method: POST
- URL: /api/proposals/{id}/reject
- Authentication: JWT required; role: employer
- Path parameter: id (UUID)
- Responses:
  - 200: Proposal (status: rejected)
  - 400: Invalid proposal status or UUID format
  - 401: Unauthorized
  - 403: Unauthenticated or unauthorized
  - 404: Proposal not found

Behavior:
- Validates proposal is pending
- Verifies employer owns the associated project
- Updates proposal status to rejected
- Sends notification to freelancer

#### Withdraw Proposal
- Method: POST
- URL: /api/proposals/{id}/withdraw
- Authentication: JWT required; role: freelancer
- Path parameter: id (UUID)
- Responses:
  - 200: Proposal (status: withdrawn)
  - 400: Invalid proposal status or UUID format
  - 401: Unauthorized
  - 403: Unauthenticated or unauthorized
  - 404: Proposal not found

Behavior:
- Validates proposal is pending
- Ensures freelancer owns the proposal
- Updates proposal status to withdrawn

### Proposal Status Lifecycle
- pending: Initial state after submission
- accepted: Employer accepted the proposal; contract created
- rejected: Employer rejected the proposal
- withdrawn: Freelancer withdrew a pending proposal

```mermaid
stateDiagram-v2
[*] --> pending
pending --> accepted : "employer accepts"
pending --> rejected : "employer rejects"
pending --> withdrawn : "freelancer withdraws"
accepted --> [*]
rejected --> [*]
withdrawn --> [*]
```

### Role-Based Access Controls
- Submit Proposal: freelancer only
- Accept/Reject Proposal: employer only
- Withdraw Proposal: freelancer only
- Get Proposal Details: authenticated user
- Get My Proposals: freelancer only

### Validation Rules
- projectId: required, valid UUID
- coverLetter: required, min length 10
- proposedRate: required, numeric, >= 1
- estimatedDuration: required, numeric, >= 1 day
- Project must be open for submissions
- Duplicate proposal per freelancer per project is not allowed

### Client Implementation Examples

#### Example: Submit a Proposal
- Endpoint: POST /api/proposals
- Headers: Authorization: Bearer <JWT>, Content-Type: application/json
- Request body:
  - projectId: UUID
  - coverLetter: string (>= 10 chars)
  - proposedRate: number (>= 1)
  - estimatedDuration: number (>= 1)
- Expected responses:
  - 201: Created Proposal
  - 400: Validation error
  - 401: Unauthorized
  - 404: Project not found
  - 409: Duplicate proposal

#### Example: Handle Contract Creation on Accept
- Endpoint: POST /api/proposals/{id}/accept
- Expected response:
  - proposal: Proposal (status: accepted)
  - contract: Contract (with contract details)
- Client should:
  - Store the returned contract metadata
  - Track contract status transitions
  - Proceed with milestone workflows as per contract terms

## Dependency Analysis

```mermaid
classDiagram
class ProposalRoutes {
+POST "/api/proposals"
+GET "/api/proposals/ : id"
+GET "/api/proposals/freelancer/me"
+POST "/api/proposals/ : id/accept"
+POST "/api/proposals/ : id/reject"
+POST "/api/proposals/ : id/withdraw"
}
class ProposalService {
+submitProposal()
+getProposalById()
+getProposalsByFreelancer()
+acceptProposal()
+rejectProposal()
+withdrawProposal()
}
class ProposalRepository {
+createProposal()
+findProposalById()
+updateProposal()
+getProposalsByProject()
+getProposalsByFreelancer()
+hasAcceptedProposal()
+getExistingProposal()
}
class EntityMapper {
+mapProposalFromEntity()
+mapContractFromEntity()
}
ProposalRoutes --> ProposalService : "calls"
ProposalService --> ProposalRepository : "uses"
ProposalRepository --> EntityMapper : "returns mapped models"
```

## Performance Considerations
- Pagination is supported for listing proposals by project via repository methods; consider using limit/offset for large datasets.
- Accept/Reject/Withdraw operations perform a small number of database writes and a blockchain operation (best-effort); network latency may impact response time.
- Ensure clients cache frequently accessed Proposal and Contract details to reduce repeated requests.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 400 Validation Error: Review request body fields (UUID format, lengths, numeric bounds).
- 401 Unauthorized: Ensure Authorization header is present and contains a valid Bearer token.
- 403 Forbidden: Confirm the user’s role matches the endpoint requirement.
- 404 Not Found: Verify resource IDs exist (project, proposal).
- 409 Conflict (Duplicate Proposal): A proposal already exists for the same freelancer and project.

## Conclusion
The proposal system provides a robust, role-aware API for freelancers to submit proposals and for employers to manage them. It enforces strong validation, maintains clear status transitions, and integrates with contract and blockchain workflows upon acceptance. Clients should implement proper JWT handling, adhere to validation rules, and expect contract creation on successful acceptance.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Definitions

- Base URL: http://localhost:7860/api
- Interactive docs: http://localhost:7860/api-docs
- Authentication: Bearer token in Authorization header

### Proposal Schema
- Fields: id, projectId, freelancerId, coverLetter, proposedRate, estimatedDuration, status, createdAt, updatedAt

### Contract Schema
- Fields: id, projectId, proposalId, freelancerId, employerId, escrowAddress, totalAmount, status, createdAt, updatedAt

---

# Proposal Acceptance

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
This document provides API documentation for the proposal acceptance endpoint in the FreelanceXchain system. It covers the POST /api/proposals/{id}/accept endpoint that enables employers to accept a freelancer’s proposal. Upon acceptance, the system updates the proposal status to accepted and automatically creates a new contract via the contract service, initiating the escrow process. The response includes both the updated Proposal object and the newly created Contract object. The document outlines authentication via JWT, role-based restrictions, validation rules, and error handling behavior.

## Project Structure
The proposal acceptance flow spans routing, middleware, service, repository, and model layers, plus blockchain integration for escrow creation.

```mermaid
graph TB
Client["Client"]
Router["Proposal Routes<br/>POST /api/proposals/:id/accept"]
AuthMW["Auth Middleware<br/>JWT validation"]
RoleMW["Require Role 'employer'"]
UUIDMW["UUID Validation Middleware"]
Service["Proposal Service<br/>acceptProposal()"]
ProjRepo["Proposal Repository"]
ProjModel["Proposal Model"]
ContrRepo["Contract Repository"]
ContrModel["Contract Model"]
Mapper["Entity Mapper<br/>Proposal/Contract"]
Blockchain["Blockchain Agreement<br/>createAgreementOnBlockchain()"]
Client --> Router
Router --> AuthMW
Router --> RoleMW
Router --> UUIDMW
Router --> Service
Service --> ProjRepo
Service --> ContrRepo
Service --> Mapper
Service --> Blockchain
ProjRepo --> ProjModel
ContrRepo --> ContrModel
```

## Core Components
- Route handler enforces JWT authentication, employer role, and UUID path parameter validation.
- Service orchestrates proposal acceptance, status update, contract creation, blockchain agreement, and project status update.
- Repositories persist proposal and contract entities.
- Entity mapper converts database entities to API models.
- Blockchain integration creates and signs an agreement on-chain.

Key behaviors:
- Acceptance requires proposal status to be pending.
- Only the project owner (employer) can accept a proposal.
- On success, returns both the updated proposal and the newly created contract.

## Architecture Overview
The endpoint follows a layered architecture:
- HTTP layer: Express route with middleware.
- Application layer: Proposal service encapsulates business logic.
- Persistence layer: Repositories for proposal and contract.
- Mapping layer: Entity mapper for DTO conversion.
- Integration layer: Blockchain agreement creation.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Proposal Routes"
participant A as "Auth Middleware"
participant P as "Require Role 'employer'"
participant U as "UUID Validation"
participant S as "Proposal Service"
participant PR as "Proposal Repository"
participant CR as "Contract Repository"
participant M as "Entity Mapper"
participant B as "Blockchain Agreement"
C->>R : POST /api/proposals/{id}/accept
R->>A : Validate JWT
A-->>R : Authorized or 401
R->>P : Enforce employer role
P-->>R : Authorized or 403
R->>U : Validate UUID path param
U-->>R : Valid or 400
R->>S : acceptProposal(proposalId, employerId)
S->>PR : Load proposal by id
PR-->>S : Proposal entity
S->>S : Validate status 'pending'
S->>PR : Load project by proposal.project_id
PR-->>S : Project entity
S->>S : Verify employer owns project
S->>PR : Update proposal status to 'accepted'
PR-->>S : Updated proposal entity
S->>CR : Create contract entity
CR-->>S : Created contract entity
S->>B : createAgreementOnBlockchain(...)
B-->>S : Agreement created
S->>PR : Update project status to 'in_progress'
PR-->>S : Updated project
S->>M : Map entities to models
M-->>S : Proposal and Contract models
S-->>R : Result {proposal, contract}
R-->>C : 200 OK with {proposal, contract}
```

## Detailed Component Analysis

### Endpoint Definition
- Method: POST
- URL: /api/proposals/{id}/accept
- Path parameter: id (UUID)
- Authentication: Bearer JWT
- Roles: employer only
- Validation: UUID format enforced

Response schema:
- proposal: Proposal model
- contract: Contract model

Status codes:
- 200: Success
- 400: Invalid UUID format or invalid status
- 401: Unauthorized
- 403: Insufficient permissions
- 404: Proposal not found

Practical example:
- An employer calls the endpoint with a valid JWT and a proposal UUID.
- On success, the response includes the updated Proposal (status accepted) and the newly created Contract (with initial status active and empty escrow address pending blockchain initialization).

Validation checks:
- Proposal must exist and be pending.
- Only the project owner (employer) can accept.
- Path parameter must be a valid UUID.

### Route Handler Behavior
- Uses authMiddleware to validate JWT.
- Uses requireRole('employer') to restrict access.
- Uses validateUUID() to enforce UUID path parameter format.
- Calls acceptProposal(service) and returns combined result.

Error mapping:
- NOT_FOUND -> 404
- UNAUTHORIZED -> 403
- Otherwise -> 400

### Service Logic: acceptProposal
- Loads proposal by ID; returns NOT_FOUND if absent.
- Ensures proposal status is pending; otherwise INVALID_STATUS.
- Loads project and verifies employer ownership; returns UNAUTHORIZED if mismatch.
- Updates proposal status to accepted.
- Creates a new contract with:
  - project_id from proposal
  - proposal_id from proposal
  - freelancer_id and employer_id from proposal and project
  - total_amount from project budget
  - status active
  - escrow_address initially empty
- Attempts to create and sign a blockchain agreement (employer creates, freelancer auto-signs).
- Updates project status to in_progress.
- Returns { proposal, contract } mapped to models.

```mermaid
flowchart TD
Start(["acceptProposal(proposalId, employerId)"]) --> LoadProposal["Load proposal by id"]
LoadProposal --> Found{"Proposal exists?"}
Found --> |No| NotFound["Return NOT_FOUND"]
Found --> |Yes| CheckStatus["Check status == 'pending'"]
CheckStatus --> |No| InvalidStatus["Return INVALID_STATUS"]
CheckStatus --> |Yes| LoadProject["Load project by proposal.project_id"]
LoadProject --> FoundProj{"Project exists?"}
FoundProj --> |No| NotFound
FoundProj --> |Yes| VerifyOwner["Verify employer owns project"]
VerifyOwner --> |No| Unauthorized["Return UNAUTHORIZED"]
VerifyOwner --> |Yes| UpdateProposal["Update proposal status to 'accepted'"]
UpdateProposal --> CreateContract["Create contract entity"]
CreateContract --> TryBlockchain["Create blockchain agreement"]
TryBlockchain --> UpdateProject["Update project status to 'in_progress'"]
UpdateProject --> MapModels["Map to Proposal and Contract models"]
MapModels --> ReturnOK["Return {proposal, contract}"]
```

### Data Models and Mapping
- Proposal model fields include id, projectId, freelancerId, coverLetter, proposedRate, estimatedDuration, status, createdAt, updatedAt.
- Contract model fields include id, projectId, proposalId, freelancerId, employerId, escrowAddress, totalAmount, status, createdAt, updatedAt.
- Entity mapper converts repository entities to API models.

### Blockchain Integration
- On successful acceptance, the service attempts to create an agreement on the blockchain using the employer and freelancer wallet addresses and project terms.
- The freelancer auto-signs the agreement after acceptance.
- The contract’s escrow_address remains empty until the escrow is initialized externally.

### Contract Service Context
- The contract service provides additional operations (e.g., updating status transitions, setting escrow address, retrieving contracts by proposalId).
- These operations complement the acceptance flow by enabling subsequent contract lifecycle management.

## Dependency Analysis
The endpoint depends on:
- Route handler for authentication, role enforcement, and UUID validation.
- Proposal service for business logic.
- Repositories for persistence.
- Entity mapper for model conversion.
- Blockchain service for agreement creation.

```mermaid
graph LR
Routes["proposal-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Role["auth-middleware.ts"]
Routes --> UUID["validation-middleware.ts"]
Routes --> Service["proposal-service.ts"]
Service --> ProjRepo["proposal-repository.ts"]
Service --> ContrRepo["contract-repository.ts"]
Service --> Mapper["entity-mapper.ts"]
Service --> Block["blockchain agreement (service)"]
```

## Performance Considerations
- Minimizing database round-trips: The service performs a small fixed number of reads/writes per acceptance.
- Asynchronous blockchain operations: Agreement creation is attempted asynchronously; failures are logged and do not block the HTTP response.
- Caching: No caching is implemented in the acceptance flow; keep in mind that repeated acceptance attempts for the same proposal should be prevented by the pending status check.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized: Ensure a valid Bearer token is included in the Authorization header.
- 403 Forbidden: Confirm the user has the employer role and owns the project associated with the proposal.
- 400 Bad Request: Verify the proposal ID is a valid UUID and the proposal status is pending.
- 404 Not Found: The proposal may not exist or the project may have been deleted.
- Blockchain failure: Agreement creation errors are logged and do not prevent contract creation; initialize escrow separately if needed.

## Conclusion
The POST /api/proposals/{id}/accept endpoint provides a robust, role-restricted mechanism for employers to accept proposals. It enforces strict validation, updates statuses atomically, creates contracts, and initiates blockchain agreements. The response returns both the updated proposal and the new contract, enabling downstream escrow initialization and milestone management.

---

# Proposal Rejection

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
This document describes the POST /api/proposals/{id}/reject endpoint used by employers to reject a proposal. It covers the HTTP method, URL structure with UUID path parameter, authentication and role-based access control, workflow behavior, response schema, and status codes. It also explains backend validations that ensure only the project owner can reject proposals and only pending proposals can be rejected, along with the notification trigger that informs the freelancer.

## Project Structure
The proposal rejection endpoint is implemented as part of the proposals feature module:
- Route handler: defines the endpoint, applies middleware, and delegates to the service layer
- Service layer: enforces business rules, updates the proposal, and triggers notifications
- Middleware: authentication and role checks, plus UUID validation for path parameters
- Repositories and mappers: persistence and model mapping
- Notification service: creates a “proposal_rejected” notification for the freelancer

```mermaid
graph TB
Client["Client"] --> Routes["Routes<br/>proposal-routes.ts"]
Routes --> Auth["Auth Middleware<br/>auth-middleware.ts"]
Routes --> Role["Role Middleware<br/>auth-middleware.ts"]
Routes --> UUIDV["UUID Validation<br/>validation-middleware.ts"]
Routes --> Service["Proposal Service<br/>proposal-service.ts"]
Service --> Repo["Proposal Repository<br/>proposal-repository.ts"]
Service --> Mapper["Entity Mapper<br/>entity-mapper.ts"]
Service --> Notify["Notification Service<br/>notification-service.ts"]
Repo --> DB["Database"]
Mapper --> DB
Notify --> DB
```

## Core Components
- Endpoint definition: POST /api/proposals/{id}/reject
- Authentication: Bearer JWT token required
- Authorization: Only users with role “employer”
- Path parameter validation: {id} must be a valid UUID
- Business logic: Reject a pending proposal and send a notification to the freelancer
- Response: Updated Proposal object

## Architecture Overview
The rejection workflow spans route handling, middleware enforcement, service logic, and persistence/notification layers.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Routes<br/>proposal-routes.ts"
participant A as "Auth Middleware<br/>auth-middleware.ts"
participant V as "UUID Validation<br/>validation-middleware.ts"
participant S as "Proposal Service<br/>proposal-service.ts"
participant P as "Proposal Repository<br/>proposal-repository.ts"
participant M as "Entity Mapper<br/>entity-mapper.ts"
participant N as "Notification Service<br/>notification-service.ts"
C->>R : POST /api/proposals/{id}/reject
R->>A : authMiddleware()
A-->>R : validated user or 401
R->>A : requireRole("employer")
A-->>R : 403 if not employer or continue
R->>V : validateUUID(["id"])
V-->>R : 400 if invalid UUID or continue
R->>S : rejectProposal(proposalId, employerId)
S->>P : findProposalById(proposalId)
P-->>S : ProposalEntity or null
S->>S : validate status == "pending"
S->>P : findProjectById(projectId)
P-->>S : ProjectEntity
S->>S : verify employerId == project.employerId
S->>P : updateProposal(proposalId, {status : "rejected"})
P-->>S : updated ProposalEntity
S->>M : mapProposalFromEntity(...)
M-->>S : Proposal
S->>N : notifyProposalRejected(freelancerId, ...)
N-->>S : NotificationEntity
S-->>R : { proposal : Proposal }
R-->>C : 200 OK with Proposal
```

## Detailed Component Analysis

### Endpoint Definition
- Method: POST
- URL: /api/proposals/{id}/reject
- Path parameter: id (UUID)
- Authentication: Bearer JWT token required
- Authorization: employer role required
- Body: not used for rejection (no request body)
- Response: 200 OK with the updated Proposal object

### Authentication and Authorization
- Authentication middleware validates the Authorization header format and verifies the JWT token. On failure, returns 401 with an error payload.
- Role middleware ensures the authenticated user has role “employer”. On failure, returns 403 with an error payload.

### UUID Validation
- The route applies UUID validation for the path parameter {id}. If invalid, returns 400 with a validation error payload.

### Business Logic and Workflow
- Load proposal by ID; return 404 if not found.
- Ensure proposal status is “pending”; otherwise return 400 with an error indicating invalid state.
- Load project by proposal’s project_id; return 404 if not found.
- Verify that the employerId equals the project’s employerId; otherwise return 403 with unauthorized error.
- Update proposal status to “rejected”.
- Map the updated entity to the Proposal model.
- Create a notification of type “proposal_rejected” for the freelancer.
- Return the updated Proposal object with 200 OK.

```mermaid
flowchart TD
Start(["POST /api/proposals/{id}/reject"]) --> CheckAuth["Check Bearer Token"]
CheckAuth --> |Missing/Invalid| E401["401 Unauthorized"]
CheckAuth --> |Valid| CheckRole["Require Role 'employer'"]
CheckRole --> |Not Employer| E403["403 Forbidden"]
CheckRole --> |Employer| CheckUUID["Validate UUID {id}"]
CheckUUID --> |Invalid| E400U["400 Invalid UUID"]
CheckUUID --> |Valid| LoadProposal["Load Proposal by ID"]
LoadProposal --> |Not Found| E404["404 Not Found"]
LoadProposal --> CheckStatus["Check Status == 'pending'"]
CheckStatus --> |Not Pending| E400S["400 Invalid State"]
CheckStatus --> LoadProject["Load Project by Proposal's projectId"]
LoadProject --> |Not Found| E404P["404 Not Found"]
LoadProject --> VerifyOwner["Verify employerId == project.employerId"]
VerifyOwner --> |Mismatch| E403O["403 Unauthorized"]
VerifyOwner --> Update["Set Proposal Status to 'rejected'"]
Update --> Map["Map to Proposal Model"]
Map --> Notify["Create Notification 'proposal_rejected'"]
Notify --> Done["200 OK with Proposal"]
```

### Response Schema
- Success response: 200 OK with the updated Proposal object
- Error responses:
  - 400 Bad Request: invalid UUID format or invalid proposal state
  - 401 Unauthorized: missing or invalid Bearer token
  - 403 Forbidden: insufficient permissions (not employer) or unauthorized action (not project owner)
  - 404 Not Found: proposal or project not found

The Proposal object includes:
- id: string (UUID)
- projectId: string (UUID)
- freelancerId: string (UUID)
- coverLetter: string
- proposedRate: number
- estimatedDuration: number
- status: one of pending, accepted, rejected, withdrawn
- createdAt: string (ISO 8601)
- updatedAt: string (ISO 8601)

### Example Scenario
Scenario: An employer rejects a proposal because the freelancer’s skills do not match the project requirements.
- The employer calls POST /api/proposals/{proposalId}/reject with a valid JWT token and role “employer”.
- The system verifies the proposal is pending and owned by the employer.
- The proposal status is updated to “rejected”.
- A notification of type “proposal_rejected” is created for the freelancer.
- The endpoint returns 200 OK with the updated Proposal object.

## Dependency Analysis
- Route depends on:
  - auth-middleware for JWT validation and role checks
  - validation-middleware for UUID parameter validation
  - proposal-service for business logic
- proposal-service depends on:
  - proposal-repository for persistence
  - entity-mapper for model conversion
  - notification-service for creating notifications
- proposal-repository depends on Supabase client and the proposals table
- notification-service depends on notification-repository and Supabase

```mermaid
graph LR
Routes["proposal-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Val["validation-middleware.ts"]
Routes --> Service["proposal-service.ts"]
Service --> Repo["proposal-repository.ts"]
Service --> Mapper["entity-mapper.ts"]
Service --> Notify["notification-service.ts"]
Repo --> DB["Supabase"]
Mapper --> DB
Notify --> DB
```

## Performance Considerations
- The endpoint performs two database reads (proposal and project) and one write (proposal update). These are lightweight operations suitable for typical load.
- UUID validation occurs before any database calls, reducing unnecessary database traffic on malformed requests.
- Notification creation is performed synchronously in the service layer; consider offloading to a queue if high throughput is anticipated.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 400 Invalid UUID: Ensure the {id} path parameter is a valid UUID.
- 400 Invalid State: The proposal must be in “pending” status to be rejected.
- 401 Unauthorized: Confirm the Authorization header is present and contains a valid Bearer token.
- 403 Forbidden: The authenticated user must have role “employer” and must own the project containing the proposal.
- 404 Not Found: The proposal or project does not exist.

Validation and error handling are centralized in the route handlers and middleware, returning structured error payloads with timestamps and request IDs.

## Conclusion
The POST /api/proposals/{id}/reject endpoint provides a secure and robust mechanism for employers to reject proposals. It enforces JWT authentication, role-based access control, UUID parameter validation, and strict business rules (only pending proposals, only project owners). On success, it returns the updated Proposal object and triggers a notification for the freelancer. The implementation is modular, testable, and aligned with the broader system architecture.

---

# Proposal Retrieval

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
This document describes the proposal retrieval endpoints in the FreelanceXchain system. It covers:
- Two GET endpoints: retrieving a specific proposal by UUID and retrieving all proposals submitted by the authenticated freelancer.
- Authentication and authorization requirements.
- Response schemas aligned with the Proposal model.
- Access control rules and error responses.
- Usage examples for an employer viewing a proposal and a freelancer checking their submission history.
- How the service layer validates ownership and permissions before returning data.

## Project Structure
The proposal retrieval endpoints are implemented in the routing layer and backed by a service layer that interacts with repositories and uses entity mappers to produce the Proposal model.

```mermaid
graph TB
Client["Client"] --> Routes["Routes<br/>proposal-routes.ts"]
Routes --> AuthMW["Auth Middleware<br/>auth-middleware.ts"]
Routes --> Validator["UUID Validator<br/>validation-middleware.ts"]
Routes --> Service["Proposal Service<br/>proposal-service.ts"]
Service --> Repo["Proposal Repository<br/>proposal-repository.ts"]
Service --> Mapper["Entity Mapper<br/>entity-mapper.ts"]
Service --> Swagger["Swagger Config<br/>swagger.ts"]
Routes --> Swagger
```

## Core Components
- Route handlers for proposal retrieval:
  - GET /api/proposals/{id}
  - GET /api/proposals/freelancer/me
- Service layer functions:
  - getProposalById
  - getProposalsByFreelancer
- Repository for proposal persistence:
  - findProposalById
  - getProposalsByFreelancer
- Entity mapper for Proposal model:
  - mapProposalFromEntity
- Authentication and authorization:
  - authMiddleware
  - requireRole('freelancer')
- UUID validation:
  - validateUUID middleware and isValidUUID

## Architecture Overview
The retrieval flow follows a layered architecture: route handler -> middleware -> service -> repository -> mapper -> response.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler<br/>proposal-routes.ts"
participant A as "Auth Middleware<br/>auth-middleware.ts"
participant V as "UUID Validator<br/>validation-middleware.ts"
participant S as "Service<br/>proposal-service.ts"
participant P as "Repository<br/>proposal-repository.ts"
participant M as "Mapper<br/>entity-mapper.ts"
C->>R : "GET /api/proposals/{id}"
R->>A : "authMiddleware()"
A-->>R : "Attach validated user"
R->>V : "validateUUID()"
V-->>R : "Proceed if UUID valid"
R->>S : "getProposalById(id)"
S->>P : "findProposalById(id)"
P-->>S : "ProposalEntity or null"
alt "Proposal found"
S->>M : "mapProposalFromEntity(entity)"
M-->>S : "Proposal"
S-->>R : "{ success : true, data : Proposal }"
R-->>C : "200 OK + Proposal"
else "Proposal not found"
S-->>R : "{ success : false, error : { code : 'NOT_FOUND' } }"
R-->>C : "404 Not Found"
end
```

## Detailed Component Analysis

### Endpoint: GET /api/proposals/{id}
- Method: GET
- URL Pattern: /api/proposals/{id}
- Path Parameters:
  - id: string, format: uuid
- Authentication:
  - Requires a valid Bearer JWT token via authMiddleware.
- Authorization:
  - Any authenticated user can view a proposal if they have access. The route itself does not enforce role restrictions; however, the service layer checks for existence and returns a NOT_FOUND error if absent.
- Response Schema:
  - 200 OK: Proposal object aligned with the Proposal model.
  - 400 Bad Request: Returned when the UUID parameter fails validation.
  - 401 Unauthorized: Missing or invalid Authorization header.
  - 404 Not Found: Proposal not found.
- Error Responses:
  - 400: Invalid UUID format.
  - 404: Proposal not found.
- Usage Example:
  - An employer retrieves a specific proposal to review details before deciding whether to accept or reject it.

Access control note:
- The route does not restrict roles; any authenticated user can call this endpoint. Ownership checks are enforced at the service level by verifying existence and returning errors accordingly.

### Endpoint: GET /api/proposals/freelancer/me
- Method: GET
- URL Pattern: /api/proposals/freelancer/me
- Authentication:
  - Requires a valid Bearer JWT token via authMiddleware.
- Authorization:
  - Role requirement: freelancer. Only freelancers can access their own proposal list.
- Response Schema:
  - 200 OK: Array of Proposal objects aligned with the Proposal model.
  - 401 Unauthorized: Missing or invalid Authorization header.
  - 403 Forbidden: Insufficient permissions (non-freelancer).
- Error Responses:
  - 401: Authentication required.
  - 403: Insufficient permissions.
- Usage Example:
  - A freelancer checks their submission history and current status of proposals across projects.

Access control note:
- The route enforces requireRole('freelancer'), ensuring only freelancers can access their own submissions.

### Proposal Model
The Proposal model used in responses is defined in the entity mapper and Swagger components.

```mermaid
classDiagram
class Proposal {
+string id
+string projectId
+string freelancerId
+string coverLetter
+number proposedRate
+number estimatedDuration
+string status
+string createdAt
+string updatedAt
}
```

### Service Layer Ownership and Permission Validation
- getProposalById:
  - Fetches proposal by ID from the repository.
  - Returns NOT_FOUND if the proposal does not exist.
  - Does not enforce ownership; any authenticated user can retrieve a proposal if it exists.
- getProposalsByFreelancer:
  - Fetches proposals by freelancerId from the repository.
  - Returns all proposals submitted by the authenticated freelancer.
  - Ownership is implicitly enforced by passing the authenticated user’s ID as the freelancerId filter.

```mermaid
flowchart TD
Start(["Service Entry"]) --> Find["Find proposal by ID"]
Find --> Exists{"Exists?"}
Exists --> |No| NotFound["Return NOT_FOUND"]
Exists --> |Yes| Map["Map to Proposal model"]
Map --> ReturnOk["Return success with Proposal"]
NotFound --> End(["Exit"])
ReturnOk --> End
```

## Dependency Analysis
The retrieval endpoints depend on middleware for authentication and UUID validation, and on the service/repository layers for data access and mapping.

```mermaid
graph LR
Routes["proposal-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Val["validation-middleware.ts"]
Routes --> Service["proposal-service.ts"]
Service --> Repo["proposal-repository.ts"]
Service --> Mapper["entity-mapper.ts"]
Swagger["swagger.ts"] --> Routes
```

## Performance Considerations
- The freelancer proposal list endpoint returns all proposals ordered by creation time. Depending on the number of proposals, consider pagination in future enhancements.
- UUID validation occurs at the route level; keep the validation middleware lightweight and reuse the existing UUID validator.

## Troubleshooting Guide
Common issues and resolutions:
- 400 Bad Request (UUID invalid):
  - Cause: The id path parameter is not a valid UUID.
  - Resolution: Ensure the UUID is correctly formatted and passed in the path.
- 401 Unauthorized:
  - Cause: Missing or invalid Authorization header.
  - Resolution: Include a valid Bearer token in the Authorization header.
- 403 Forbidden:
  - Cause: Non-freelancer attempting to access /api/proposals/freelancer/me.
  - Resolution: Ensure the caller has the freelancer role.
- 404 Not Found:
  - Cause: Proposal does not exist for the given id.
  - Resolution: Verify the proposal id and that the proposal belongs to a project.

## Conclusion
The proposal retrieval endpoints provide authenticated access to proposal details and freelancer submission histories. The system enforces JWT-based authentication and role-based access for the freelancer list endpoint. UUID validation ensures robust input handling. The service layer focuses on data retrieval and mapping, returning standardized error responses aligned with the project’s error schema.

---

# Proposal Submission

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
This document provides comprehensive API documentation for the proposal submission endpoint in the FreelanceXchain system. It covers the POST /api/proposals endpoint, including HTTP method, URL pattern, request body schema, authentication via JWT, role-based access control, validation rules, response schema, and status codes. It also explains how the service layer interacts with the database through the proposal repository and triggers relevant notifications.

## Project Structure
The proposal submission feature spans routing, middleware, service, repository, and documentation layers:
- Routes define the endpoint and apply middleware.
- Middleware enforces JWT authentication and role checks.
- Service orchestrates business logic, validation, repository interactions, and notifications.
- Repository abstracts database operations.
- Swagger and API docs define schemas and responses.

```mermaid
graph TB
Client["Client"] --> Routes["Routes<br/>proposal-routes.ts"]
Routes --> AuthMW["Auth Middleware<br/>auth-middleware.ts"]
Routes --> Service["Proposal Service<br/>proposal-service.ts"]
Service --> Repo["Proposal Repository<br/>proposal-repository.ts"]
Service --> NotifSvc["Notification Service<br/>notification-service.ts"]
NotifSvc --> NotifRepo["Notification Repository<br/>notification-repository.ts"]
Swagger["Swagger Config<br/>swagger.ts"] --- Docs["API Docs<br/>API-DOCUMENTATION.md"]
```

## Core Components
- Endpoint: POST /api/proposals
- Authentication: Bearer JWT token required
- Role-based Access Control: Only users with role "freelancer" can submit proposals
- Request Body Schema:
  - projectId: string (UUID)
  - coverLetter: string (minimum length 10)
  - proposedRate: number (minimum 1)
  - estimatedDuration: number (minimum 1 day)
- Response Schema: Proposal model
- Status Codes:
  - 201 Created on success
  - 400 Bad Request for validation errors
  - 401 Unauthorized for missing/invalid token
  - 404 Not Found when project is not found
  - 409 Conflict for duplicate proposals

## Architecture Overview
The proposal submission flow integrates route validation, middleware enforcement, service orchestration, repository persistence, and notification dispatch.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Routes<br/>proposal-routes.ts"
participant M as "Auth Middleware<br/>auth-middleware.ts"
participant S as "Proposal Service<br/>proposal-service.ts"
participant P as "Proposal Repository<br/>proposal-repository.ts"
participant N as "Notification Service<br/>notification-service.ts"
participant NR as "Notification Repository<br/>notification-repository.ts"
C->>R : "POST /api/proposals" with JWT
R->>M : "authMiddleware + requireRole('freelancer')"
M-->>R : "validated user info"
R->>S : "submitProposal(userId, payload)"
S->>P : "findProjectById(projectId)"
P-->>S : "ProjectEntity or null"
S->>S : "check project status and duplicates"
S->>P : "createProposal(entity)"
P-->>S : "ProposalEntity"
S->>N : "notify employer (proposal_received)"
N->>NR : "createNotification(notification)"
NR-->>N : "NotificationEntity"
S-->>R : "{proposal, notification}"
R-->>C : "201 {proposal}"
```

## Detailed Component Analysis

### Endpoint Definition and Validation
- HTTP Method: POST
- URL Pattern: /api/proposals
- Authentication: Bearer token mandatory; enforced by authMiddleware
- Role Requirement: requireRole('freelancer')
- Request Body Validation:
  - projectId: required string and valid UUID
  - coverLetter: required string with minimum length 10
  - proposedRate: required number ≥ 1
  - estimatedDuration: required number ≥ 1 day
- Response: 201 with Proposal model on success; otherwise error responses with standardized shape

### Service Layer: submitProposal
Responsibilities:
- Validate project existence and open status
- Prevent duplicate proposals per freelancer per project
- Persist proposal with status "pending"
- Emit notification for employer ("proposal_received")

Key behaviors:
- Project existence checked via projectRepository
- Duplicate check via proposalRepository.getExistingProposal
- Proposal creation via proposalRepository.createProposal
- Notification creation via notification-service helper

### Repository Layer: ProposalRepository
- Provides createProposal, findProposalById, updateProposal
- Supports duplicate detection and project-scoped queries
- Uses Supabase client with explicit error handling

### Response Schema: Proposal Model
The Proposal model includes:
- id, projectId, freelancerId
- coverLetter, proposedRate, estimatedDuration
- status (pending, accepted, rejected, withdrawn)
- createdAt, updatedAt

Swagger and API docs define the schema and enums.

### Real-World Example
Submitting a proposal for a web development project:
- projectId: UUID of the target project
- coverLetter: "I am a skilled frontend developer with 5+ years of experience building responsive web applications..."
- proposedRate: 50 (representing USD per hour)
- estimatedDuration: 14 (days)

Expected outcome:
- 201 Created with the created Proposal object
- Employer receives a "proposal_received" notification

### Status Codes
- 201 Created: Successful proposal submission
- 400 Bad Request: Validation errors (missing/invalid fields)
- 401 Unauthorized: Missing or invalid Bearer token
- 404 Not Found: Project not found
- 409 Conflict: Duplicate proposal for the same project by the same freelancer

### Validation Flow
```mermaid
flowchart TD
Start(["Request Received"]) --> CheckAuth["Check Bearer Token"]
CheckAuth --> AuthOK{"Authenticated?"}
AuthOK --> |No| Return401["Return 401 Unauthorized"]
AuthOK --> |Yes| ValidateFields["Validate Fields:<br/>projectId, coverLetter,<br/>proposedRate, estimatedDuration"]
ValidateFields --> Valid{"All Valid?"}
Valid --> |No| Return400["Return 400 Validation Error"]
Valid --> |Yes| CheckProject["Check Project Exists and Open"]
CheckProject --> ProjectOK{"Project OK?"}
ProjectOK --> |No| Return404["Return 404 Not Found"]
ProjectOK --> CheckDup["Check Duplicate Proposal"]
CheckDup --> Dup{"Duplicate?"}
Dup --> |Yes| Return409["Return 409 Conflict"]
Dup --> |No| CreateProposal["Persist Proposal"]
CreateProposal --> Notify["Notify Employer"]
Notify --> Return201["Return 201 Created"]
```

## Dependency Analysis
- Routes depend on auth middleware and proposal service
- Service depends on proposal repository, project repository, user repository, and notification service
- Repositories depend on Supabase client and shared base repository
- Swagger defines schemas consumed by routes and docs

```mermaid
graph LR
Routes["proposal-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Service["proposal-service.ts"]
Service --> Repo["proposal-repository.ts"]
Service --> NotifSvc["notification-service.ts"]
NotifSvc --> NotifRepo["notification-repository.ts"]
Swagger["swagger.ts"] --- Docs["API-DOCUMENTATION.md"]
```

## Performance Considerations
- Input validation occurs before database calls to minimize unnecessary operations.
- Repository methods encapsulate Supabase queries; ensure indexes exist on project_id and freelancer_id for efficient duplicate checks.
- Notification creation is lightweight; ensure database indexing on user_id for notification retrieval.
- Consider caching project metadata if frequently accessed during proposal submissions.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 401 Unauthorized: Ensure Authorization header includes a valid Bearer token. Verify token expiration and format.
- 403 Forbidden: Confirm the user role is "freelancer".
- 400 Validation Error: Check that projectId is a valid UUID, coverLetter is at least 10 characters, proposedRate and estimatedDuration are ≥ 1.
- 404 Not Found: The project ID may not exist or is closed for proposals.
- 409 Conflict: The freelancer has already submitted a proposal for this project.

## Conclusion
The proposal submission endpoint enforces strict authentication and role-based access control, validates request payloads, prevents duplicate submissions, persists proposals, and notifies employers. The service layer cleanly separates concerns between validation, persistence, and notifications, while the repository layer abstracts database operations.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Reference: POST /api/proposals
- Authentication: Bearer JWT
- Roles: freelancer
- Request Body:
  - projectId: string (UUID)
  - coverLetter: string (≥10 chars)
  - proposedRate: number (≥1)
  - estimatedDuration: number (≥1)
- Responses:
  - 201: Proposal object
  - 400: Validation error
  - 401: Unauthorized
  - 404: Project not found
  - 409: Duplicate proposal

---

# Proposal with Employer History API

## Table of Contents
1. [Introduction](#introduction)
2. [Endpoint Specification](#endpoint-specification)
3. [Architecture Overview](#architecture-overview)
4. [Request Flow](#request-flow)
5. [Response Schema](#response-schema)
6. [Authorization Rules](#authorization-rules)
7. [Use Cases](#use-cases)
8. [Error Handling](#error-handling)
9. [Performance Considerations](#performance-considerations)
10. [Client Implementation Examples](#client-implementation-examples)

## Introduction

This endpoint allows freelancers to view proposal details along with the employer's track record, including completed projects count, average rating, and company information. This transparency helps freelancers make informed decisions about which proposals to pursue.

**Key Features:**
- View employer's completed project count
- See employer's average rating from previous freelancers
- Access employer's company information
- Freelancer-only access for privacy protection

## Endpoint Specification

### HTTP Method and URL
```
GET /api/proposals/{id}/with-employer-history
```

### Authentication
- **Required:** Yes
- **Type:** JWT Bearer Token
- **Role:** Freelancer only

### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Proposal ID |

### Headers
```http
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

## Architecture Overview

```mermaid
graph TB
    Client["Client<br/>(Freelancer)"]
    Router["Proposal Routes<br/>GET /api/proposals/:id/with-employer-history"]
    AuthMW["Auth Middleware<br/>JWT validation"]
    RoleMW["Require Role 'freelancer'"]
    Service["Proposal Service<br/>getProposalWithEmployerHistory()"]
    ProposalRepo["Proposal Repository"]
    ProjectRepo["Project Repository"]
    ContractRepo["Contract Repository"]
    ReviewRepo["Review Repository"]
    EmployerRepo["Employer Profile Repository"]
    
    Client --> Router
    Router --> AuthMW
    AuthMW --> RoleMW
    RoleMW --> Service
    Service --> ProposalRepo
    Service --> ProjectRepo
    Service --> ContractRepo
    Service --> ReviewRepo
    Service --> EmployerRepo
```

## Request Flow

```mermaid
sequenceDiagram
    participant F as "Freelancer"
    participant R as "Routes"
    participant A as "Auth Middleware"
    participant S as "Proposal Service"
    participant PR as "Proposal Repo"
    participant PJ as "Project Repo"
    participant CR as "Contract Repo"
    participant RR as "Review Repo"
    participant ER as "Employer Repo"
    
    F->>R: GET /api/proposals/{id}/with-employer-history
    R->>A: Validate JWT & role
    A-->>R: Authenticated (freelancer)
    R->>S: getProposalWithEmployerHistory(id)
    S->>PR: findProposalById(id)
    PR-->>S: Proposal entity
    S->>PJ: findProjectById(projectId)
    PJ-->>S: Project entity
    S->>CR: getContractsByEmployer(employerId)
    CR-->>S: All contracts
    Note over S: Filter completed contracts
    S->>RR: getAverageRating(employerId)
    RR-->>S: {average, count}
    S->>ER: getProfileByUserId(employerId)
    ER-->>S: Employer profile
    S-->>R: Combined data
    R->>R: Verify freelancer owns proposal
    R-->>F: 200 OK with employer history
```

## Response Schema

### Success Response (200 OK)

```json
{
  "proposal": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "projectId": "660e8400-e29b-41d4-a716-446655440000",
    "freelancerId": "770e8400-e29b-41d4-a716-446655440000",
    "coverLetter": null,
    "attachments": [
      {
        "url": "https://storage.supabase.co/...",
        "filename": "portfolio.pdf",
        "size": 1024000,
        "mimeType": "application/pdf"
      }
    ],
    "proposedRate": 5000,
    "estimatedDuration": 30,
    "tags": ["web-development", "react", "nodejs"],
    "status": "pending",
    "createdAt": "2026-03-12T10:00:00Z",
    "updatedAt": "2026-03-12T10:00:00Z"
  },
  "project": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "title": "E-commerce Website Development",
    "description": "Build a modern e-commerce platform with React and Node.js",
    "employerId": "880e8400-e29b-41d4-a716-446655440000",
    "budget": 5000,
    "deadline": "2026-04-30",
    "status": "open",
    "milestones": [
      {
        "title": "Frontend Development",
        "amount": 2500,
        "dueDate": "2026-04-15"
      },
      {
        "title": "Backend Integration",
        "amount": 2500,
        "dueDate": "2026-04-30"
      }
    ]
  },
  "employerHistory": {
    "completedProjectsCount": 15,
    "averageRating": 4.7,
    "reviewCount": 12,
    "companyName": "Tech Solutions Inc.",
    "industry": "Technology"
  }
}
```

### Field Descriptions

#### employerHistory Object

| Field | Type | Description |
|-------|------|-------------|
| completedProjectsCount | number | Total number of completed contracts by this employer |
| averageRating | number | Average rating from all reviews (0-5, rounded to 1 decimal) |
| reviewCount | number | Total number of reviews received |
| companyName | string | Employer's company name |
| industry | string | Employer's industry/sector |

## Authorization Rules

### Access Control
1. **Freelancer Role Required:** Only users with 'freelancer' role can access this endpoint
2. **Proposal Ownership:** Freelancer must be the one who submitted the proposal
3. **No Employer Access:** Employers cannot view their own history through this endpoint
4. **No Admin Override:** Even admins cannot access this freelancer-specific feature

### Authorization Flow
```typescript
// 1. JWT validation (authMiddleware)
// 2. Role check (requireRole('freelancer'))
// 3. Ownership verification
if (result.data.proposal.freelancerId !== userId) {
  return 403 Forbidden
}
```

## Use Cases

### 1. Assessing Employer Reliability
**Scenario:** Freelancer receives multiple proposals and wants to prioritize reliable employers

**Decision Factors:**
- `completedProjectsCount > 10` → Experienced employer
- `completedProjectsCount === 0` → New employer (higher risk)
- `averageRating >= 4.5` → Highly rated employer

**Example:**
```javascript
if (employerHistory.completedProjectsCount >= 10 && 
    employerHistory.averageRating >= 4.5) {
  // High priority - reliable employer
  priorityLevel = 'HIGH';
} else if (employerHistory.completedProjectsCount === 0) {
  // New employer - proceed with caution
  priorityLevel = 'LOW';
}
```

### 2. Risk Assessment
**Scenario:** Freelancer evaluates payment risk before accepting proposal

**Risk Indicators:**
- Low rating (`< 3.0`) → Payment issues or difficult client
- No completed projects → Unproven track record
- High rating (`>= 4.5`) + many projects → Safe bet

### 3. Company Verification
**Scenario:** Freelancer verifies legitimacy of employer

**Verification Steps:**
1. Check company name matches project description
2. Verify industry alignment with project type
3. Cross-reference with external sources if needed

## Error Handling

### Error Responses

#### 400 Bad Request
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid UUID format"
  },
  "timestamp": "2026-03-12T10:00:00Z",
  "requestId": "req-123"
}
```

#### 401 Unauthorized
```json
{
  "error": {
    "code": "AUTH_UNAUTHORIZED",
    "message": "User not authenticated"
  },
  "timestamp": "2026-03-12T10:00:00Z",
  "requestId": "req-123"
}
```

#### 403 Forbidden
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "You are not authorized to view this proposal"
  },
  "timestamp": "2026-03-12T10:00:00Z",
  "requestId": "req-123"
}
```

#### 404 Not Found
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Proposal not found"
  },
  "timestamp": "2026-03-12T10:00:00Z",
  "requestId": "req-123"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Failed to fetch proposal with employer history"
}
```

## Performance Considerations

### Database Queries
The endpoint executes multiple queries:
1. `findProposalById()` - Single row lookup (indexed)
2. `findProjectById()` - Single row lookup (indexed)
3. `getContractsByEmployer()` - Multiple rows (filtered by employer_id)
4. `getAverageRating()` - Aggregation query on reviews table
5. `getProfileByUserId()` - Single row lookup (indexed)

### Optimization Strategies

#### 1. Caching
```typescript
// Cache employer history for 1 hour
const cacheKey = `employer-history:${employerId}`;
const cached = await cache.get(cacheKey);
if (cached) return cached;

// ... fetch from database ...

await cache.set(cacheKey, employerHistory, 3600); // 1 hour TTL
```

#### 2. Parallel Queries
```typescript
// Execute independent queries in parallel
const [contracts, rating, profile] = await Promise.all([
  contractRepository.getContractsByEmployer(employerId),
  ReviewRepository.getAverageRating(employerId),
  employerProfileRepository.getProfileByUserId(employerId)
]);
```

#### 3. Database Indexing
Ensure indexes exist on:
- `contracts.employer_id`
- `reviews.reviewee_id`
- `employer_profiles.user_id`

### Expected Response Time
- **Without caching:** 200-500ms
- **With caching:** 50-100ms
- **Under load:** May increase to 1-2s

## Client Implementation Examples

### JavaScript/TypeScript (Fetch API)

```typescript
async function getProposalWithEmployerHistory(
  proposalId: string, 
  token: string
): Promise<ProposalWithEmployerHistory> {
  const response = await fetch(
    `https://api.freelancexchain.com/api/proposals/${proposalId}/with-employer-history`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  return await response.json();
}

// Usage
try {
  const data = await getProposalWithEmployerHistory(
    '550e8400-e29b-41d4-a716-446655440000',
    userToken
  );
  
  console.log(`Employer: ${data.employerHistory.companyName}`);
  console.log(`Rating: ${data.employerHistory.averageRating}/5`);
  console.log(`Completed: ${data.employerHistory.completedProjectsCount} projects`);
  
  // Risk assessment
  if (data.employerHistory.averageRating >= 4.5) {
    console.log('✓ Highly rated employer');
  }
} catch (error) {
  console.error('Failed to fetch proposal:', error);
}
```

### React Component Example

```tsx
import { useState, useEffect } from 'react';

interface EmployerHistory {
  completedProjectsCount: number;
  averageRating: number;
  reviewCount: number;
  companyName: string;
  industry: string;
}

function ProposalDetailWithHistory({ proposalId }: { proposalId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(
          `/api/proposals/${proposalId}/with-employer-history`,
          {
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );
        
        if (!response.ok) throw new Error('Failed to fetch');
        
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [proposalId]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!data) return null;

  const { proposal, project, employerHistory } = data;

  return (
    <div className="proposal-detail">
      <h2>{project.title}</h2>
      
      <div className="employer-info">
        <h3>Employer Information</h3>
        <p><strong>Company:</strong> {employerHistory.companyName}</p>
        <p><strong>Industry:</strong> {employerHistory.industry}</p>
        
        <div className="employer-stats">
          <div className="stat">
            <span className="label">Rating</span>
            <span className="value">
              {employerHistory.averageRating.toFixed(1)} / 5.0
              {employerHistory.averageRating >= 4.5 && ' ⭐'}
            </span>
            <span className="count">
              ({employerHistory.reviewCount} reviews)
            </span>
          </div>
          
          <div className="stat">
            <span className="label">Completed Projects</span>
            <span className="value">
              {employerHistory.completedProjectsCount}
            </span>
          </div>
        </div>
        
        {employerHistory.completedProjectsCount === 0 && (
          <div className="warning">
            ⚠️ This is a new employer with no completed projects yet
          </div>
        )}
        
        {employerHistory.averageRating < 3.0 && (
          <div className="warning">
            ⚠️ This employer has a low rating. Proceed with caution.
          </div>
        )}
      </div>
      
      <div className="proposal-details">
        <h3>Your Proposal</h3>
        <p><strong>Rate:</strong> ${proposal.proposedRate}</p>
        <p><strong>Duration:</strong> {proposal.estimatedDuration} days</p>
        <p><strong>Status:</strong> {proposal.status}</p>
      </div>
    </div>
  );
}
```

### Python Example

```python
import requests
from typing import Dict, Any

def get_proposal_with_employer_history(
    proposal_id: str, 
    token: str
) -> Dict[str, Any]:
    """
    Fetch proposal with employer history
    
    Args:
        proposal_id: UUID of the proposal
        token: JWT authentication token
        
    Returns:
        Dictionary containing proposal, project, and employer history
        
    Raises:
        requests.HTTPError: If request fails
    """
    url = f"https://api.freelancexchain.com/api/proposals/{proposal_id}/with-employer-history"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    
    return response.json()

# Usage
try:
    data = get_proposal_with_employer_history(
        proposal_id="550e8400-e29b-41d4-a716-446655440000",
        token=user_token
    )
    
    employer = data["employerHistory"]
    
    print(f"Employer: {employer['companyName']}")
    print(f"Rating: {employer['averageRating']}/5 ({employer['reviewCount']} reviews)")
    print(f"Completed Projects: {employer['completedProjectsCount']}")
    
    # Risk assessment
    if employer["averageRating"] >= 4.5 and employer["completedProjectsCount"] >= 10:
        print("✓ Highly reliable employer")
    elif employer["completedProjectsCount"] == 0:
        print("⚠ New employer - no track record")
        
except requests.HTTPError as e:
    print(f"Error: {e.response.json()['error']['message']}")
```

## Conclusion

The Proposal with Employer History endpoint provides freelancers with critical transparency into employer reliability and track record. By exposing completed project counts, average ratings, and company information, it enables informed decision-making and reduces risk for freelancers. The endpoint follows security best practices with role-based access control and ownership verification, ensuring that only authorized freelancers can view employer history for their own proposals.

**Key Takeaways:**
- Freelancer-only access for privacy protection
- Multiple database queries optimized with parallel execution
- Caching recommended for frequently accessed employer data
- Clear risk indicators help freelancers assess opportunities
- Comprehensive error handling for robust client integration

---

# Proposal Withdrawal

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
This document describes the POST /api/proposals/{id}/withdraw endpoint that enables freelancers to withdraw their pending proposals. It covers the HTTP method, URL pattern, authentication and authorization requirements, state transition rules, response schema, and error handling behavior. It also includes a practical use case and validation logic that prevents withdrawal of proposals that are already accepted, rejected, or withdrawn, and ensures ownership by the requesting freelancer.

## Project Structure
The proposal withdrawal feature spans routing, middleware, service, and repository layers:
- Route handler enforces JWT authentication, role checks, and UUID parameter validation.
- Service layer performs business validation and updates the proposal status.
- Repository layer persists the change to the database.
- Swagger defines the endpoint’s OpenAPI specification and response schema.

```mermaid
graph TB
Client["Client"] --> Routes["Routes<br/>proposal-routes.ts"]
Routes --> AuthMW["Auth Middleware<br/>auth-middleware.ts"]
Routes --> RoleMW["Role Middleware<br/>requireRole('freelancer')"]
Routes --> UUIDMW["UUID Validation<br/>validation-middleware.ts"]
Routes --> Service["Service<br/>proposal-service.ts"]
Service --> Repo["Repository<br/>proposal-repository.ts"]
Repo --> DB["Database"]
Service --> Swagger["Swagger Spec<br/>swagger.ts"]
```

## Core Components
- Endpoint: POST /api/proposals/{id}/withdraw
- Authentication: JWT via Authorization: Bearer <token>
- Authorization: Requires role 'freelancer'
- Path parameter: id must be a valid UUID
- Business rule: Only proposals with status 'pending' can be withdrawn; successful withdrawal sets status to 'withdrawn'
- Ownership: Only the freelancer who submitted the proposal can withdraw it
- Response: Updated Proposal object

HTTP status codes:
- 200 OK: Proposal successfully withdrawn
- 400 Bad Request: Invalid UUID format or invalid state transition
- 401 Unauthorized: Missing/invalid/expired JWT or missing/invalid Authorization header
- 403 Forbidden: Insufficient permissions (non-freelancer)
- 404 Not Found: Proposal not found

## Architecture Overview
The endpoint follows a layered architecture:
- Route layer validates JWT, role, and UUID format.
- Service layer enforces business rules (ownership and status).
- Repository layer updates the proposal record.
- Swagger documents the response schema.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler<br/>proposal-routes.ts"
participant A as "Auth Middleware<br/>auth-middleware.ts"
participant RM as "Role Middleware<br/>requireRole('freelancer')"
participant UM as "UUID Middleware<br/>validation-middleware.ts"
participant S as "Service<br/>proposal-service.ts"
participant P as "Repository<br/>proposal-repository.ts"
participant D as "Database"
C->>R : POST /api/proposals/{id}/withdraw
R->>A : Validate Authorization header and JWT
A-->>R : Validated user or error
R->>RM : Check role 'freelancer'
RM-->>R : Allowed or 403
R->>UM : Validate path param 'id' as UUID
UM-->>R : Valid or 400
R->>S : withdrawProposal(proposalId, freelancerId)
S->>P : findProposalById(proposalId)
P-->>S : ProposalEntity or null
alt Proposal not found
S-->>R : { success : false, error : NOT_FOUND }
R-->>C : 404 Not Found
else Proposal found
S->>P : updateProposal(proposalId, { status : 'withdrawn' })
P-->>S : Updated ProposalEntity
S-->>R : { success : true, data : Proposal }
R-->>C : 200 OK + Proposal
end
```

## Detailed Component Analysis

### Endpoint Definition and Behavior
- Method: POST
- URL: /api/proposals/{id}/withdraw
- Path parameter: id (UUID)
- Authentication: Bearer JWT
- Authorization: Role must be 'freelancer'
- Validation: UUID format enforced by middleware
- Business logic:
  - Only proposals with status 'pending' can be withdrawn
  - Only the freelancer who owns the proposal can withdraw it
  - On success, status transitions to 'withdrawn'

Response schema:
- Returns the updated Proposal object with fields: id, projectId, freelancerId, coverLetter, proposedRate, estimatedDuration, status, createdAt, updatedAt.

Status codes:
- 200: Successful withdrawal
- 400: Invalid UUID format or invalid state transition
- 401: Unauthorized (missing/invalid/expired token)
- 403: Permission denied (not a freelancer)
- 404: Proposal not found

### Validation and Authorization Flow
```mermaid
flowchart TD
Start(["Request received"]) --> CheckAuth["Check Authorization header"]
CheckAuth --> AuthOK{"JWT valid?"}
AuthOK --> |No| Return401["Return 401 Unauthorized"]
AuthOK --> |Yes| CheckRole["Check role 'freelancer'"]
CheckRole --> RoleOK{"Role is 'freelancer'?"}
RoleOK --> |No| Return403["Return 403 Forbidden"]
RoleOK --> |Yes| CheckUUID["Validate UUID param 'id'"]
CheckUUID --> UUIDOK{"UUID valid?"}
UUIDOK --> |No| Return400["Return 400 Bad Request"]
UUIDOK --> |Yes| CallService["Call withdrawProposal()"]
CallService --> End(["Handled by service"])
```

### Service Layer Logic
The service enforces:
- Proposal existence
- Ownership verification (freelancer_id equals caller)
- Status validation (must be 'pending')
- Update to 'withdrawn'

```mermaid
flowchart TD
SStart(["Service: withdrawProposal"]) --> Find["Find proposal by id"]
Find --> Found{"Exists?"}
Found --> |No| NotFound["Return NOT_FOUND"]
Found --> |Yes| Owner["Verify freelancer_id equals caller"]
Owner --> OwnerOK{"Owner?"}
OwnerOK --> |No| Unauth["Return UNAUTHORIZED"]
OwnerOK --> |Yes| Status["Check status == 'pending'"]
Status --> StatusOK{"Status is 'pending'?"}
StatusOK --> |No| Invalid["Return INVALID_STATUS"]
StatusOK --> |Yes| Update["Update status to 'withdrawn'"]
Update --> Success["Return updated Proposal"]
```

### Use Case: Withdraw After Accepting Another Project
Scenario:
- A freelancer submits Proposal A and later accepts a competing Proposal B for the same project.
- The freelancer decides to withdraw Proposal A while keeping Proposal B active.
- Steps:
  1. Ensure Proposal A exists and is still 'pending'.
  2. Authenticate with JWT and confirm role 'freelancer'.
  3. Call POST /api/proposals/{proposalAId}/withdraw.
  4. Server validates UUID, ownership, and status.
  5. Server updates Proposal A status to 'withdrawn'.
  6. Client receives 200 OK with the updated Proposal A.

Constraints:
- Proposal A must be 'pending' and owned by the freelancer.
- Proposal B’s acceptance does not affect the withdrawal of Proposal A; the withdrawal is independent.

## Dependency Analysis
```mermaid
graph LR
Routes["proposal-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Role["requireRole('freelancer')"]
Routes --> UUID["validateUUID()"]
Routes --> Service["proposal-service.ts"]
Service --> Repo["proposal-repository.ts"]
Repo --> Model["proposal.ts"]
Routes --> Swagger["swagger.ts"]
```

## Performance Considerations
- The endpoint performs two database reads: one to fetch the proposal and one to update it. Both are simple indexed lookups by id.
- No heavy computations are involved; performance is primarily bound by database latency.
- Consider adding database-level constraints to prevent concurrent conflicting updates if needed.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 400 Bad Request
  - Cause: Invalid UUID format in path parameter.
  - Resolution: Ensure id is a valid UUID.
- 401 Unauthorized
  - Cause: Missing Authorization header, invalid token format, or expired token.
  - Resolution: Provide a valid Bearer token in the Authorization header.
- 403 Forbidden
  - Cause: Caller is not authenticated as a freelancer.
  - Resolution: Authenticate with a freelancer account.
- 404 Not Found
  - Cause: Proposal does not exist.
  - Resolution: Verify the proposal id.
- 400 Invalid state transition
  - Cause: Proposal status is not 'pending'.
  - Resolution: Only 'pending' proposals can be withdrawn.

Validation logic highlights:
- UUID enforcement occurs at route level.
- Ownership and status checks occur in the service layer.
- Role enforcement occurs at route level.

## Conclusion
The POST /api/proposals/{id}/withdraw endpoint provides a controlled mechanism for freelancers to withdraw pending proposals. It enforces JWT authentication, role-based authorization, UUID parameter validation, and strict business rules around ownership and status. The response returns the updated Proposal object, and the endpoint adheres to standard HTTP status codes for clear client-side handling.

---

# Reputation API

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
This document provides comprehensive API documentation for the reputation system endpoints in the FreelanceXchain platform. It covers:
- HTTP methods, URL patterns, request/response schemas
- Authentication requirements (JWT Bearer)
- Rating scale and constraints
- Endpoints for submitting ratings, retrieving reputation scores, and accessing work history
- Integration between API endpoints and blockchain smart contracts for immutable storage
- Client implementation examples for submitting ratings and displaying reputation

## Project Structure
The reputation system spans route handlers, service logic, blockchain integration, and smart contracts:
- Routes define the HTTP endpoints and request/response schemas
- Services encapsulate business logic, validation, and blockchain interactions
- Blockchain client simulates transaction submission and confirmation
- Smart contract defines on-chain storage and constraints

```mermaid
graph TB
Client["Client Application"] --> Routes["Reputation Routes<br/>GET /api/reputation/:userId<br/>POST /api/reputation/rate<br/>GET /api/reputation/:userId/history<br/>GET /api/reputation/can-rate"]
Routes --> AuthMW["Auth Middleware<br/>JWT Bearer"]
Routes --> Service["Reputation Service"]
Service --> Repo["Repositories<br/>Contract/Project/User"]
Service --> Blockchain["Blockchain Client<br/>submitTransaction/confirmTransaction"]
Service --> Contract["Reputation Contract Interface<br/>serialize/deserialize"]
Contract --> SC["Smart Contract<br/>FreelanceReputation.sol"]
```

## Core Components
- Reputation Routes: Define endpoints, authentication, and response schemas
- Reputation Service: Validates inputs, enforces constraints, computes reputation, and orchestrates blockchain interactions
- Reputation Contract Interface: Serializes/deserializes ratings and interacts with blockchain client
- Smart Contract: On-chain storage of ratings with constraints and events
- Auth Middleware: Enforces JWT Bearer authentication
- Validation Middleware: Validates UUID parameters
- Blockchain Client: Simulates transaction lifecycle
- Notification Service: Notifies users upon receiving ratings

## Architecture Overview
The reputation API follows a layered architecture:
- HTTP Layer: Routes handle requests and responses
- Service Layer: Business logic, validation, and orchestration
- Blockchain Layer: Transaction submission and confirmation
- Smart Contract Layer: Immutable on-chain storage

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Reputation Routes"
participant S as "Reputation Service"
participant BC as "Blockchain Client"
participant SC as "Smart Contract"
C->>R : POST /api/reputation/rate (JWT Bearer)
R->>S : submitRating(input)
S->>S : Validate rating (1-5), contract existence, roles, duplicates
S->>BC : submitTransaction(...)
BC-->>S : Transaction receipt
S->>SC : Store rating on-chain
SC-->>S : Rating index/event
S-->>R : {rating, transactionHash}
R-->>C : 201 Created
```

## Detailed Component Analysis

### Endpoint: GET /api/reputation/:userId
- Purpose: Retrieve a user’s reputation score and ratings from the blockchain
- Authentication: None (public endpoint)
- Path Parameters:
  - userId: UUID (validated by middleware)
- Response Schema:
  - userId: string (UUID)
  - score: number (weighted average with time decay)
  - totalRatings: integer
  - averageRating: number (simple average without time decay)
  - ratings: array of BlockchainRating
- Error Responses:
  - 400: Invalid UUID format
  - 404: User not found (service returns error)

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Reputation Routes"
participant S as "Reputation Service"
participant RC as "Reputation Contract Interface"
C->>R : GET /api/reputation/ : userId
R->>S : getReputation(userId)
S->>RC : getRatingsFromBlockchain(userId)
RC-->>S : Ratings[]
S-->>R : {userId, score, totalRatings, averageRating, ratings}
R-->>C : 200 OK
```

### Endpoint: POST /api/reputation/rate
- Purpose: Submit a rating for another user after contract completion
- Authentication: Required (JWT Bearer)
- Request Body Schema (RatingInput):
  - contractId: string (UUID)
  - rateeId: string (UUID)
  - rating: integer (1-5)
  - comment: string (optional)
- Response Schema:
  - rating: BlockchainRating
  - transactionHash: string
- Constraints and Validation:
  - Only contract participants can submit ratings
  - Ratee must be a contract participant
  - Cannot rate self
  - Duplicate rating per contract is prevented
  - Rating must be integer between 1 and 5
- Error Responses:
  - 400: Validation error (missing fields, invalid rating, invalid UUID)
  - 401: Unauthorized (missing/invalid JWT)
  - 403: Unauthorized (not a contract participant)
  - 404: Contract not found
  - 409: Duplicate rating

```mermaid
flowchart TD
Start(["POST /api/reputation/rate"]) --> ValidateJWT["Validate JWT (authMiddleware)"]
ValidateJWT --> ParseBody["Parse request body"]
ParseBody --> CheckFields{"Required fields present?"}
CheckFields --> |No| Err400["Return 400 VALIDATION_ERROR"]
CheckFields --> |Yes| CheckUUIDs["Validate UUID format"]
CheckUUIDs --> |Invalid| Err400UUID["Return 400 INVALID_UUID"]
CheckUUIDs --> |Valid| LoadContract["Load contract by contractId"]
LoadContract --> Found{"Contract exists?"}
Found --> |No| Err404["Return 404 NOT_FOUND"]
Found --> |Yes| CheckRoles["Verify rater and ratee are participants"]
CheckRoles --> RolesOK{"Both participants and not self?"}
RolesOK --> |No| Err403["Return 403 UNAUTHORIZED or INVALID_RATEE/SELF_RATING"]
RolesOK --> CheckDup["Check duplicate rating for contract"]
CheckDup --> Dup{"Already rated?"}
Dup --> |Yes| Err409["Return 409 DUPLICATE_RATING"]
Dup --> |No| Submit["Submit rating to blockchain"]
Submit --> Notify["Notify ratee via notification service"]
Notify --> Done(["Return 201 with rating and transactionHash"])
```

### Endpoint: GET /api/reputation/:userId/history
- Purpose: Retrieve work history for a user including completed contracts and ratings
- Authentication: None (public endpoint)
- Path Parameters:
  - userId: UUID (validated by middleware)
- Response Schema: Array of WorkHistoryEntry
  - contractId: string (UUID)
  - projectId: string (UUID)
  - projectTitle: string
  - role: enum ["freelancer","employer"]
  - completedAt: string (ISO 8601)
  - rating?: integer (1-5)
  - ratingComment?: string
- Error Responses:
  - 400: Invalid UUID format
  - 404: User not found (service returns error)

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Reputation Routes"
participant S as "Reputation Service"
participant RC as "Reputation Contract Interface"
C->>R : GET /api/reputation/ : userId/history
R->>S : getWorkHistory(userId)
S->>S : Load user contracts (completed only)
S->>S : For each contract, load project and ratings
S->>RC : getRatingsByContract(contractId)
RC-->>S : Ratings[]
S-->>R : WorkHistoryEntry[]
R-->>C : 200 OK
```

### Endpoint: GET /api/reputation/can-rate
- Purpose: Check if the authenticated user can rate another user for a specific contract
- Authentication: Required (JWT Bearer)
- Query Parameters:
  - contractId: string (UUID)
  - rateeId: string (UUID)
- Response Schema:
  - canRate: boolean
  - reason?: string (present when false)
- Error Responses:
  - 400: Validation error (missing parameters)
  - 401: Unauthorized (missing/invalid JWT)

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Reputation Routes"
participant S as "Reputation Service"
C->>R : GET /api/reputation/can-rate?contractId=&rateeId=
R->>S : canUserRate(userId, rateeId, contractId)
S->>S : Validate contract existence, roles, duplicates
S-->>R : {canRate, reason?}
R-->>C : 200 OK
```

### Rating Scale and Constraints
- Rating Scale: Integer from 1 to 5
- Who can rate whom:
  - Only contract participants can submit ratings
  - Ratee must be a participant in the same contract
  - Users cannot rate themselves
  - Duplicate rating per contract is prevented
- Additional constraints enforced by smart contract:
  - Cannot rate zero address
  - Score must be between 1 and 5
  - Contract ID required
  - Duplicate rating per contract prevented

### Authentication Requirements (JWT)
- All protected endpoints require a Bearer token in the Authorization header:
  - Authorization: Bearer <access_token>
- Protected endpoints:
  - POST /api/reputation/rate
  - GET /api/reputation/can-rate
- Auth middleware validates:
  - Presence of Authorization header
  - Format "Bearer <token>"
  - Token validity and expiration

### Integration with Blockchain Smart Contracts
- Submission flow:
  - Route handler calls service
  - Service validates and calls blockchain client to submit transaction
  - Blockchain client simulates transaction submission and confirmation
  - Service stores serialized rating and returns transaction hash
- Retrieval flow:
  - Service retrieves ratings from blockchain interface
  - Aggregation uses time decay weighting
- Smart contract responsibilities:
  - Enforce rating constraints
  - Store ratings immutably
  - Emit events on rating submission
  - Provide getters for aggregates and indices

```mermaid
classDiagram
class ReputationRoutes {
+GET /api/reputation/ : userId
+POST /api/reputation/rate
+GET /api/reputation/ : userId/history
+GET /api/reputation/can-rate
}
class ReputationService {
+submitRating(input)
+getReputation(userId)
+getWorkHistory(userId)
+canUserRate(raterId, rateeId, contractId)
}
class ReputationContractInterface {
+submitRatingToBlockchain(params)
+getRatingsFromBlockchain(userId)
+computeAggregateScore(ratings, decayLambda)
+hasUserRatedForContract(raterId, rateeId, contractId)
}
class BlockchainClient {
+submitTransaction(input)
+confirmTransaction(txId)
}
class FreelanceReputation {
+submitRating(ratee, score, comment, contractId, isEmployerRating)
+getAverageRating(user)
+getUserRatingIndices(user)
+getGivenRatingIndices(user)
+hasRated(rater, ratee, contractId)
}
ReputationRoutes --> ReputationService : "calls"
ReputationService --> ReputationContractInterface : "uses"
ReputationContractInterface --> BlockchainClient : "submits/reads"
BlockchainClient --> FreelanceReputation : "simulates"
```

### Client Implementation Examples

#### Example 1: Submit a rating with comment after contract completion
- Steps:
  - Authenticate and obtain a JWT
  - Call POST /api/reputation/rate with:
    - contractId: UUID of the completed contract
    - rateeId: UUID of the user being rated
    - rating: integer 1-5
    - comment: optional string
  - Handle response containing the stored rating and transactionHash
- Notes:
  - Ensure the authenticated user is a participant in the contract
  - Ensure the ratee is a participant in the contract
  - Ensure the rating is not a duplicate for the contract

#### Example 2: Retrieve a user's reputation score with blockchain ratings
- Steps:
  - Call GET /api/reputation/:userId
  - Use the returned score (weighted average with time decay) and ratings array
- Notes:
  - The ratings array contains blockchain-stored ratings with timestamps and comments

#### Example 3: View work history with project details
- Steps:
  - Call GET /api/reputation/:userId/history
  - Iterate entries to show:
    - Project title
    - Role (freelancer or employer)
    - Completed date
    - Rating and comment (if available)
- Notes:
  - Only completed contracts are included
  - Ratings are fetched per contract

## Dependency Analysis
- Routes depend on:
  - Auth middleware for protected endpoints
  - Validation middleware for UUID parameters
  - Reputation service for business logic
- Reputation service depends on:
  - Repositories for contract/project/user data
  - Reputation contract interface for blockchain operations
  - Notification service for user notifications
- Reputation contract interface depends on:
  - Blockchain client for transaction submission/confirmation
  - In-memory store to simulate blockchain storage
- Smart contract defines:
  - Immutable storage and constraints
  - Events for rating submissions

```mermaid
graph LR
Routes["reputation-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Val["validation-middleware.ts"]
Routes --> Service["reputation-service.ts"]
Service --> Repo["Repositories"]
Service --> ContractIF["reputation-contract.ts"]
ContractIF --> BC["blockchain-client.ts"]
ContractIF --> SC["FreelanceReputation.sol"]
Service --> Notify["notification-service.ts"]
```

## Performance Considerations
- Time decay computation: Weighted average calculation scales linearly with the number of ratings per user
- Blockchain simulation: In-memory store and simulated confirmation add minimal overhead
- Recommendations:
  - Cache frequently accessed reputation scores for popular users
  - Paginate work history for users with many contracts
  - Use efficient sorting and filtering in repositories

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 400 Validation Error:
  - Missing required fields or invalid UUID format
  - Fix: Ensure contractId, rateeId, and rating are provided and valid UUIDs
- 401 Unauthorized:
  - Missing or invalid JWT
  - Fix: Include Authorization: Bearer <token> header
- 403 Unauthorized:
  - Not a contract participant or attempting self-rating
  - Fix: Verify user roles in the contract and ensure raterId != rateeId
- 404 Not Found:
  - Contract not found
  - Fix: Verify contractId exists
- 409 Conflict (Duplicate Rating):
  - Already rated for this contract
  - Fix: Do not submit duplicate ratings

## Conclusion
The reputation system provides secure, immutable rating storage integrated with blockchain technology. The API ensures proper authentication, strict validation, and clear constraints on who can rate whom. Clients can submit ratings, retrieve reputation scores with time-decayed weighting, and view work histories with project details.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Definitions

- Base URL: http://localhost:7860/api
- Interactive Docs: http://localhost:7860/api-docs
- Authentication: Bearer JWT

Endpoints:
- GET /api/reputation/:userId
  - Description: Get user reputation score and ratings
  - Response: ReputationScore
- POST /api/reputation/rate
  - Description: Submit a rating for another user after contract completion
  - Request: RatingInput
  - Response: { rating: BlockchainRating, transactionHash: string }
- GET /api/reputation/:userId/history
  - Description: Get work history for a user
  - Response: Array of WorkHistoryEntry
- GET /api/reputation/can-rate
  - Description: Check if authenticated user can rate another user for a contract
  - Query: contractId, rateeId
  - Response: { canRate: boolean, reason?: string }

### Data Models

- RatingInput
  - contractId: string (UUID)
  - rateeId: string (UUID)
  - rating: integer (1-5)
  - comment?: string

- BlockchainRating
  - id: string (UUID)
  - contractId: string (UUID)
  - raterId: string (UUID)
  - rateeId: string (UUID)
  - rating: integer (1-5)
  - comment?: string
  - timestamp: integer
  - transactionHash: string

- ReputationScore
  - userId: string (UUID)
  - score: number (time-decayed weighted average)
  - totalRatings: integer
  - averageRating: number (simple average)
  - ratings: array of BlockchainRating

- WorkHistoryEntry
  - contractId: string (UUID)
  - projectId: string (UUID)
  - projectTitle: string
  - role: enum ["freelancer","employer"]
  - completedAt: string (ISO 8601)
  - rating?: integer (1-5)
  - ratingComment?: string

---

# Get Reputation Score

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
This document provides API documentation for retrieving a user’s reputation score in the FreelanceXchain system. It covers the GET /api/reputation/:userId endpoint, JWT authentication requirements, optional time-range parameters, and the service’s aggregation logic that computes a weighted average score with time decay. It also documents the response schema, caching strategies, edge cases, and client-side implementation tips for displaying dynamic reputation indicators.

## Project Structure
The reputation feature spans routing, service, and blockchain abstraction layers:
- Routes define the endpoint and apply validation and authentication.
- Services orchestrate data retrieval and computation.
- Blockchain abstraction simulates on-chain interactions for development/testing.
- Smart contract defines on-chain data model and operations.

```mermaid
graph TB
Client["Client"] --> Router["Reputation Routes<br/>GET /api/reputation/:userId"]
Router --> Auth["Auth Middleware<br/>JWT Validation"]
Router --> Service["Reputation Service<br/>getReputation()"]
Service --> Contract["Reputation Contract Abstraction<br/>getRatingsFromBlockchain(), computeAggregateScore()"]
Contract --> Sim["In-memory Ratings Store<br/>(Simulated Blockchain)"]
Contract --> Solidity["FreelanceReputation.sol<br/>On-chain Storage"]
```

## Core Components
- Endpoint: GET /api/reputation/:userId
- Authentication: JWT Bearer token required
- Optional parameters: None currently defined on the route; time-range filtering is not exposed as a query parameter in the current implementation
- Response: Reputation score with weighted average, simple average, total ratings, and raw ratings

Key implementation references:
- Route handler and Swagger schema for GET /api/reputation/:userId
- Service function that fetches ratings and computes weighted average
- Contract abstraction that retrieves ratings and computes aggregate score
- On-chain smart contract that stores ratings and exposes read operations

## Architecture Overview
The GET /api/reputation/:userId flow:
1. Client sends a request with a JWT Bearer token.
2. Auth middleware validates the token and attaches user info to the request.
3. Route validates path parameters and delegates to the service.
4. Service fetches all ratings for the user from the blockchain abstraction.
5. Service computes a weighted average score using time decay and a simple average.
6. Service returns structured data including ratings, counts, and averages.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Reputation Routes"
participant A as "Auth Middleware"
participant S as "Reputation Service"
participant B as "Reputation Contract Abstraction"
participant M as "In-memory Ratings Store"
C->>R : "GET /api/reputation/ : userId"
R->>A : "Validate Authorization header"
A-->>R : "Attach validated user"
R->>S : "getReputation(userId)"
S->>B : "getRatingsFromBlockchain(userId)"
B->>M : "Fetch ratings for user"
M-->>B : "Return ratings"
B-->>S : "Return ratings"
S->>S : "computeAggregateScore(ratings, decayLambda)"
S-->>R : "ReputationScore"
R-->>C : "200 OK with ReputationScore"
```

## Detailed Component Analysis

### Endpoint Definition: GET /api/reputation/:userId
- Path parameter: userId (UUID)
- Authentication: Requires a Bearer token in the Authorization header
- Response: ReputationScore object containing:
  - userId
  - score (weighted average with time decay)
  - totalRatings
  - averageRating (simple average)
  - ratings (array of BlockchainRating)

Swagger schema and endpoint definition are declared in the routes file.

### Authentication and Authorization
- The route uses the auth middleware to validate JWT tokens.
- The middleware checks for a Bearer token and validates it, attaching user info to the request.
- If the token is missing, malformed, expired, or invalid, the middleware responds with 401.

### Service Layer: getReputation(userId, decayLambda?)
- Fetches all ratings for the user from the blockchain abstraction.
- Computes:
  - Weighted average score using time decay (default decayLambda = 0.01)
  - Simple average (no time decay)
- Returns a ReputationScore object.

```mermaid
flowchart TD
Start(["getReputation(userId)"]) --> Fetch["Fetch ratings from blockchain abstraction"]
Fetch --> HasRatings{"Any ratings?"}
HasRatings --> |No| ReturnZero["Set score = 0,<br/>averageRating = 0,<br/>totalRatings = 0"]
HasRatings --> |Yes| Compute["Compute weighted average with time decay"]
Compute --> Average["Compute simple average"]
Average --> Build["Build ReputationScore"]
ReturnZero --> Build
Build --> End(["Return result"])
```

### Blockchain Abstraction: Ratings Retrieval and Aggregation
- getRatingsFromBlockchain(userId): Returns all ratings for a user sorted by timestamp descending.
- computeAggregateScore(ratings, decayLambda): Implements time decay weighting:
  - Age in days computed from timestamp
  - Weight = e^(-lambda × age_in_days)
  - Weighted average rounded to two decimals
- Edge case: If no ratings, returns 0 for score.

```mermaid
flowchart TD
A["ratings[]"] --> B["Iterate ratings"]
B --> C["age_in_days = (now - timestamp)/ms"]
C --> D["weight = exp(-lambda * age_in_days)"]
D --> E["weightedSum += rating * weight"]
D --> F["totalWeight += weight"]
E --> G{"totalWeight == 0?"}
F --> G
G --> |Yes| H["Return 0"]
G --> |No| I["Return round((weightedSum/totalWeight)*100)/100"]
```

### On-chain Smart Contract: FreelanceReputation.sol
- Stores ratings with fields: rater, ratee, score (1–5), comment, contractId, timestamp, isEmployerRating.
- Provides read-only functions:
  - getAverageRating(address): returns totalScore * 100 / ratingCount (or 0 if no ratings)
  - getRatingCount(address): number of ratings
  - getUserRatingIndices(address): indices of received ratings
  - getGivenRatingIndices(address): indices of given ratings
  - getRating(index): returns rating details
  - getTotalRatings(): total count
  - hasRated(rater, ratee, contractId): duplicate check
- The current backend uses an in-memory store to simulate on-chain behavior during development.

### Response Schema
- ReputationScore:
  - userId: string
  - score: number (weighted average with time decay)
  - totalRatings: integer
  - averageRating: number (simple average)
  - ratings: array of BlockchainRating

- BlockchainRating:
  - id: string
  - contractId: string
  - raterId: string
  - rateeId: string
  - rating: integer (1–5)
  - comment: string (optional)
  - timestamp: integer
  - transactionHash: string

These schemas are defined in the routes file and referenced by the Swagger documentation.

### Optional Time-Range Parameters
- Current implementation does not expose time-range query parameters for GET /api/reputation/:userId.
- The service fetches all ratings for the user and applies time decay in-memory.
- If future enhancements add time-range filtering, it should be implemented in the service layer and reflected in the route and Swagger schema.

### Practical Example: Fetching a Freelancer’s Reputation Score
- Client calls GET /api/reputation/:userId with a valid JWT Bearer token.
- Backend returns a JSON payload containing:
  - userId
  - score (weighted average)
  - totalRatings
  - averageRating
  - ratings array with individual rating details

This response can be directly used to render a profile view with:
- Star rating visualization
- Total review count
- Recent ratings preview

### Caching Strategies
- Current implementation does not include explicit caching for reputation scores.
- Recommendations:
  - Cache the computed score per userId with TTL (e.g., 5–15 minutes) to reduce blockchain reads.
  - Invalidate cache on rating submission or significant changes.
  - Use a distributed cache (e.g., Redis) in production for horizontal scaling.
  - Cache the raw ratings list separately if needed for frequent profile rendering.

[No sources needed since this section provides general guidance]

### Edge Cases and Error Handling
- No ratings:
  - Service returns score = 0, averageRating = 0, totalRatings = 0.
- Invalid userId:
  - Route validation ensures userId is present; otherwise returns 400.
- JWT issues:
  - Auth middleware returns 401 for missing or invalid tokens.
- Unknown user:
  - The service fetches ratings regardless of user existence; if no ratings are found, it still returns a valid zero-score response.

### Client-Side Implementation Tips
- Display:
  - Render a star-based indicator using score (rounded to nearest half-star).
  - Show totalRatings and averageRating prominently.
  - Optionally show recent ratings with timestamps and comments.
- Interactions:
  - Refresh reputation after rating submission.
  - Debounce repeated requests to the same endpoint.
- UX:
  - Gracefully handle loading states and empty states.
  - Provide tooltips explaining the difference between weighted and simple averages.

[No sources needed since this section provides general guidance]

## Dependency Analysis
```mermaid
graph LR
Routes["reputation-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Service["reputation-service.ts"]
Service --> Contract["reputation-contract.ts"]
Contract --> Sim["In-memory Ratings Store"]
Contract --> Solidity["FreelanceReputation.sol"]
App["app.ts"] --> Routes
Env["env.ts"] --> App
```

## Performance Considerations
- Time decay computation is O(n) where n is the number of ratings; acceptable for typical user rating volumes.
- To reduce blockchain reads:
  - Cache aggregated score and raw ratings per user.
  - Batch updates and invalidate caches on rating submission.
- Consider pagination or time-range filtering in future iterations to limit dataset size.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- 401 Unauthorized:
  - Ensure Authorization header is present and formatted as Bearer <token>.
  - Verify token is not expired or revoked.
- 400 Validation Error:
  - Confirm userId is a valid UUID and present.
- 500 Internal Error:
  - Check server logs and environment configuration (JWT secrets, blockchain RPC settings).
- Unexpected zero score:
  - Confirm the user has received ratings; otherwise, zero is expected.

## Conclusion
The GET /api/reputation/:userId endpoint provides a robust, time-decayed reputation score backed by on-chain data. The current implementation focuses on correctness and simplicity, returning weighted and simple averages along with raw ratings. Future enhancements can include optional time-range filtering, caching, and richer client-side visualizations to improve user experience.

## Appendices

### Endpoint Reference
- Method: GET
- Path: /api/reputation/:userId
- Path Params:
  - userId: string (UUID)
- Query Params: None (time-range filtering not implemented)
- Authentication: Bearer JWT
- Success Response: 200 with ReputationScore
- Error Responses: 400, 401, 404 (as applicable)

---

# Submit Rating

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
This document provides API documentation for the rating submission endpoint in the FreelanceXchain reputation system. It covers the POST /api/reputation/rate endpoint, including JWT authentication, request body schema, validation rules, and the business logic flow. It also explains how the system integrates with the FreelanceReputation.sol smart contract via the reputation-service to store ratings immutably on-chain, and how blockchain transaction confirmation works. Guidance is included for client applications to handle transaction confirmation and user feedback.

## Project Structure
The rating submission flow spans the route handler, service layer, blockchain integration, and smart contract. The following diagram shows the high-level structure and interactions.

```mermaid
graph TB
Client["Client Application"] --> Routes["POST /api/reputation/rate<br/>reputation-routes.ts"]
Routes --> Auth["auth-middleware.ts"]
Routes --> Service["submitRating()<br/>reputation-service.ts"]
Service --> Repo["contract-repository.ts"]
Service --> Mapper["entity-mapper.ts"]
Service --> ContractSvc["submitRatingToBlockchain()<br/>reputation-contract.ts"]
ContractSvc --> BCClient["blockchain-client.ts"]
ContractSvc --> SC["FreelanceReputation.sol"]
Service --> Notif["notifyRatingReceived()"]
Routes --> Client
```

## Core Components
- Route handler: Validates JWT, parses request body, performs validation, and delegates to the service.
- Service: Enforces business rules (contract existence, eligibility, duplicate prevention), submits to blockchain, and notifies the ratee.
- Blockchain integration: Submits a transaction, confirms it, and stores a local representation of the rating.
- Smart contract: Enforces on-chain constraints and emits events.

## Architecture Overview
The rating submission follows a layered architecture:
- Presentation: Express route validates JWT and request payload.
- Application: Service enforces business rules and orchestrates blockchain submission.
- Persistence: Local in-memory blockchain store simulates on-chain storage during development.
- Consensus: Smart contract enforces immutability and uniqueness.

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler<br/>reputation-routes.ts"
participant M as "Auth Middleware<br/>auth-middleware.ts"
participant S as "Service<br/>reputation-service.ts"
participant RC as "Reputation Contract<br/>reputation-contract.ts"
participant BC as "Blockchain Client<br/>blockchain-client.ts"
participant SC as "Smart Contract<br/>FreelanceReputation.sol"
C->>R : POST /api/reputation/rate {contractId, rateeId, rating, comment}
R->>M : Validate Authorization : Bearer <token>
M-->>R : Authenticated user (userId)
R->>S : submitRating({contractId, raterId, rateeId, rating, comment})
S->>S : Validate rating (1-5), UUIDs, contract exists
S->>S : Verify rater/ratee are contract participants
S->>S : Prevent self-rating and duplicate rating
S->>RC : submitRatingToBlockchain(...)
RC->>BC : submitTransaction(...)
BC-->>RC : Transaction accepted (hash)
RC->>BC : confirmTransaction(txId)
BC-->>RC : Confirmed (receipt)
RC->>SC : submitRating(ratee, score, comment, contractId, isEmployerRating)
SC-->>RC : RatingIndex
RC-->>S : {rating, receipt}
S-->>R : {rating, transactionHash}
R-->>C : 201 Created {rating, transactionHash}
```

## Detailed Component Analysis

### Endpoint Definition
- Method: POST
- Path: /api/reputation/rate
- Security: Requires Bearer token JWT
- Request body schema:
  - contractId: string (UUID)
  - rateeId: string (UUID)
  - rating: integer (1-5)
  - comment: string (optional)
- Responses:
  - 201 Created: { rating: BlockchainRating, transactionHash: string }
  - 400 Bad Request: Validation errors (invalid rating, missing fields, invalid UUID)
  - 401 Unauthorized: Missing/invalid token
  - 403 Forbidden: Unauthorized (not a contract participant)
  - 404 Not Found: Contract not found
  - 409 Conflict: Duplicate rating

### Authentication and Authorization
- The route uses auth-middleware to extract and validate the Bearer token.
- On success, the authenticated user’s userId is attached to the request and used as raterId.
- On failure, the route responds with 401 Unauthorized.

### Request Validation
- Required fields: contractId, rateeId, rating.
- UUID validation: Both contractId and rateeId must be valid UUIDs.
- Rating value: Must be an integer between 1 and 5.
- On validation failure, the route returns 400 with details.

### Business Logic Flow
- Contract existence: Fetch contract by contractId; return 404 if not found.
- Eligibility checks:
  - raterId must be either freelancerId or employerId in the contract.
  - rateeId must be a contract participant.
  - raterId must not equal rateeId (self-rating prohibited).
- Duplicate prevention: Check if a rating already exists for the rater/ratee/contract combination.
- Blockchain submission: If all checks pass, submit rating to the smart contract and return the receipt’s transactionHash along with the rating.

```mermaid
flowchart TD
Start(["Start"]) --> ValidateReq["Validate required fields and UUIDs"]
ValidateReq --> Valid{"All validations pass?"}
Valid --> |No| Return400["Return 400 Bad Request"]
Valid --> |Yes| LoadContract["Load contract by contractId"]
LoadContract --> Exists{"Contract exists?"}
Exists --> |No| Return404["Return 404 Not Found"]
Exists --> |Yes| CheckEligibility["Check rater/ratee participation and self-rating"]
CheckEligibility --> Eligible{"Eligible?"}
Eligible --> |No| Return403["Return 403 Forbidden or UNAUTHORIZED"]
Eligible --> |Yes| CheckDuplicate["Check duplicate rating"]
CheckDuplicate --> Duplicate{"Already rated?"}
Duplicate --> |Yes| Return409["Return 409 Conflict"]
Duplicate --> |No| Submit["Submit rating to blockchain"]
Submit --> Done(["Return 201 with rating and transactionHash"])
```

### Blockchain Integration and Smart Contract
- The service calls submitRatingToBlockchain with the rating parameters.
- The blockchain client simulates transaction submission and confirmation.
- The smart contract enforces:
  - Ratee address must be non-zero and not equal to rater.
  - Rating must be between 1 and 5.
  - ContractId must be non-empty.
  - Duplicate rating prevention using a composite key.
- The service returns the transactionHash from the receipt.

```mermaid
sequenceDiagram
participant S as "Service<br/>reputation-service.ts"
participant RC as "Reputation Contract<br/>reputation-contract.ts"
participant BC as "Blockchain Client<br/>blockchain-client.ts"
participant SC as "Smart Contract<br/>FreelanceReputation.sol"
S->>RC : submitRatingToBlockchain({contractId, raterId, rateeId, rating, comment})
RC->>BC : submitTransaction({type : "escrow_deploy", from : raterId, to : reputationContractAddress, data : {...}})
BC-->>RC : Transaction accepted (hash)
RC->>BC : confirmTransaction(txId)
BC-->>RC : Confirmed (receipt)
RC->>SC : submitRating(ratee, score, comment, contractId, isEmployerRating)
SC-->>RC : RatingIndex
RC-->>S : {rating, receipt}
```

### Example: Freelancer Submits a 5-Star Rating with Comment After Contract Completion
- The route requires a Bearer token JWT in the Authorization header.
- The request body must include contractId, rateeId, rating (5), and an optional comment.
- The service verifies the contract exists, ensures the rater is a contract participant, prevents self-rating, and checks for duplicates.
- The service submits the rating to the smart contract and returns the rating and transactionHash.

Note: The repository simulates blockchain behavior. In production, replace the in-memory blockchain client with a real RPC connection.

## Dependency Analysis
The following diagram shows the key dependencies among components involved in rating submission.

```mermaid
graph LR
Routes["reputation-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Service["reputation-service.ts"]
Service --> Repo["contract-repository.ts"]
Service --> Mapper["entity-mapper.ts"]
Service --> ContractSvc["reputation-contract.ts"]
ContractSvc --> BC["blockchain-client.ts"]
ContractSvc --> SC["FreelanceReputation.sol"]
```

## Performance Considerations
- Transaction confirmation latency: The blockchain client simulates confirmation timing; in production, expect network latency and gas fees.
- Time decay computation: The service computes aggregate scores using time decay; this is efficient for small-to-medium datasets but consider caching for high-volume scenarios.
- Duplicate checks: The service performs a linear scan of stored ratings to detect duplicates; consider indexing or a dedicated duplicate-check function in production.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common error responses and their causes:
- 400 Bad Request
  - Missing required fields: contractId, rateeId, rating.
  - Invalid UUID format for contractId or rateeId.
  - Invalid rating value (non-integer or outside 1-5).
- 401 Unauthorized
  - Missing Authorization header or invalid Bearer token.
- 403 Forbidden
  - User is not a participant in the contract.
- 404 Not Found
  - Contract not found.
- 409 Conflict
  - Duplicate rating for the same rater/ratee/contract combination.
- Blockchain transaction failures
  - Transaction confirmation fails or smart contract reverts (e.g., duplicate rating, invalid parameters).

Client-side guidance:
- Show a loading indicator while awaiting the 201 response.
- On 400/409, display user-friendly messages indicating missing/invalid fields or duplicate rating.
- On 401, prompt the user to log in again.
- On 403/404, inform the user that they cannot rate or the contract was not found.
- For blockchain-related errors, retry after a delay or instruct the user to try again later.

## Conclusion
The rating submission endpoint enforces strict validation and eligibility rules, integrates with a smart contract to ensure immutable records, and returns a transaction hash for confirmation. Clients should handle various error responses gracefully and provide clear feedback to users. The current implementation simulates blockchain behavior; production deployments should connect to a real RPC endpoint.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Definition
- Method: POST
- Path: /api/reputation/rate
- Security: Bearer token JWT
- Request body:
  - contractId: string (UUID)
  - rateeId: string (UUID)
  - rating: integer (1-5)
  - comment: string (optional)
- Responses:
  - 201 Created: { rating: BlockchainRating, transactionHash: string }
  - 400 Bad Request: Validation errors
  - 401 Unauthorized: Missing/invalid token
  - 403 Forbidden: Unauthorized (not a contract participant)
  - 404 Not Found: Contract not found
  - 409 Conflict: Duplicate rating

### Smart Contract Constraints
- Ratee address must be non-zero and not equal to rater.
- Rating must be between 1 and 5.
- ContractId must be non-empty.
- Duplicate rating prevention using a composite key.

---

# Work History

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
This document explains the work history retrieval endpoint for the FreelanceXchain platform. It covers:
- Endpoint definition and authentication via JWT
- How the service combines on-chain reputation data from the smart contract with off-chain project metadata from Supabase
- Response structure and enrichment fields
- Real-world example of a client reviewing a freelancer’s history
- Pagination and performance considerations
- Data consistency model and discrepancy handling

## Project Structure
The work history feature spans routing, service orchestration, repositories, and blockchain integration:
- Route handler for GET /api/reputation/:userId/history
- Service layer that aggregates contracts, projects, and ratings
- Repositories for contracts and projects
- Blockchain client and reputation contract interface
- Swagger/OpenAPI schema for the endpoint

```mermaid
graph TB
Client["Client App"] --> Router["Reputation Routes<br/>GET /api/reputation/:userId/history"]
Router --> Auth["Auth Middleware<br/>JWT Bearer"]
Router --> Service["Reputation Service<br/>getWorkHistory(userId)"]
Service --> ContractsRepo["Contract Repository<br/>getUserContracts(userId)"]
Service --> ProjectsRepo["Project Repository<br/>getProjectById(projectId)"]
Service --> ContractMap["Entity Mapper<br/>mapContractFromEntity(...)"]
Service --> Ratings["Reputation Contract<br/>getRatingsByContract(contractId)"]
Service --> Response["Work History Entries"]
```

## Core Components
- Route: Defines the GET /api/reputation/:userId/history endpoint, validates userId, and delegates to the service.
- Service: Loads user contracts, filters to completed, enriches with project metadata, and attaches ratings from the blockchain.
- Repositories: ContractRepository.getUserContracts and ProjectRepository.getProjectById.
- Blockchain: ReputationContract interface simulates on-chain storage and retrieval for ratings.
- Auth: JWT Bearer token validated by auth middleware.

Key responsibilities:
- Enforce authentication and authorization
- Retrieve and filter contracts by status
- Fetch project titles and timestamps
- Fetch ratings per contract and attach to entries
- Sort by completion date descending

## Architecture Overview
The work history pipeline integrates on-chain and off-chain data:

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Reputation Routes"
participant M as "Auth Middleware"
participant S as "Reputation Service"
participant CR as "Contract Repository"
participant PR as "Project Repository"
participant RC as "Reputation Contract"
participant EM as "Entity Mapper"
C->>R : "GET /api/reputation/{userId}/history"
R->>M : "Validate JWT Bearer token"
M-->>R : "Authenticated user"
R->>S : "getWorkHistory(userId)"
S->>CR : "getUserContracts(userId)"
CR-->>S : "Paginated contracts"
loop For each completed contract
S->>PR : "getProjectById(projectId)"
PR-->>S : "Project entity"
S->>EM : "mapContractFromEntity(contractEntity)"
EM-->>S : "Contract model"
S->>RC : "getRatingsByContract(contractId)"
RC-->>S : "Blockchain ratings"
S-->>S : "Find rating for userId"
end
S-->>R : "Sorted work history entries"
R-->>C : "200 OK with entries"
```

## Detailed Component Analysis

### Endpoint Definition and Authentication
- Endpoint: GET /api/reputation/:userId/history
- Path parameter: userId (validated as UUID)
- Authentication: Requires Authorization: Bearer <JWT>. The auth middleware validates the token and attaches user info to the request.
- Response: Array of WorkHistoryEntry objects.

Swagger/OpenAPI schema defines the WorkHistoryEntry shape and the endpoint’s security scheme.

### Service Logic: getWorkHistory(userId)
- Load user contracts using ContractRepository.getUserContracts(userId).
- Filter to completed contracts.
- For each completed contract:
  - Determine role (freelancer or employer) based on userId.
  - Fetch project title via ProjectRepository.getProjectById(projectId).
  - Retrieve all ratings for the contract via getRatingsByContract(contractId).
  - Select the rating received by the user (rateeId === userId).
- Sort entries by completedAt descending.
- Return the enriched list.

```mermaid
flowchart TD
Start(["getWorkHistory(userId)"]) --> Load["Load user contracts"]
Load --> Filter["Filter to completed"]
Filter --> Loop{"For each contract"}
Loop --> |Yes| Proj["Fetch project by projectId"]
Proj --> Role["Determine role (freelancer/employer)"]
Role --> Ratings["Fetch ratings by contractId"]
Ratings --> Find["Find rating received by userId"]
Find --> Push["Push entry with projectTitle, role, completedAt, rating, ratingComment"]
Push --> Loop
Loop --> |No| Sort["Sort by completedAt desc"]
Sort --> Done(["Return entries"])
```

### On-chain Reputation Data Integration
- Ratings are retrieved per contract using getRatingsByContract(contractId).
- The service selects the rating where rateeId equals the queried userId.
- The blockchain interface simulates storage and retrieval; in production, this would call the FreelanceReputation.sol contract.

```mermaid
classDiagram
class ReputationContractInterface {
+getRatingsByContract(contractId) BlockchainRating[]
+getRatingsFromBlockchain(userId) BlockchainRating[]
+hasUserRatedForContract(raterId, rateeId, contractId) boolean
}
class FreelanceReputation {
+submitRating(ratee, score, comment, contractId, isEmployerRating) uint256
+getRatingCount(user) uint256
+getAverageRating(user) uint256
+getUserRatingIndices(user) uint256[]
+getGivenRatingIndices(user) uint256[]
+hasRated(rater, ratee, contractId) bool
}
ReputationContractInterface <|.. FreelanceReputation : "simulated interface"
```

### Off-chain Project Metadata
- Project titles and statuses are fetched from Supabase via ProjectRepository.getProjectById(projectId).
- The entity mapper converts database entities to API models for consistent field names.

### Response Structure
Each WorkHistoryEntry includes:
- contractId: UUID of the contract
- projectId: UUID of the project
- projectTitle: String title of the project
- role: Enum 'freelancer' or 'employer'
- completedAt: ISO date-time string
- rating: Integer 1–5 (optional)
- ratingComment: String (optional)

Swagger schema and route documentation define these fields.

### Real-world Example: Client Hiring Decision
Scenario:
- A client wants to hire a freelancer for a new project.
- The client opens the freelancer’s profile and navigates to the Work History tab.
- The client calls GET /api/reputation/:userId/history with a valid JWT.
- The system returns a list of past completed contracts, each with:
  - Project title
  - Completion date
  - Client’s rating and comment (if applicable)
  - The client’s role in the contract (employer)
- The client evaluates the history to decide whether to hire.

Outcome:
- The client sees a chronological list of completed projects, ratings, and comments, enabling informed decision-making.

### Filtering Parameters
Current endpoint:
- No query parameters are defined for filtering by project status or date range.
- The service filters contracts to completed only and sorts by completion date descending.

If future enhancements are introduced:
- Add query parameters for status and date range.
- Apply filters at the repository level (e.g., ContractRepository.getContractsByStatus and date range filters).
- Ensure pagination remains consistent.

## Dependency Analysis
High-level dependencies:
- Routes depend on auth middleware and reputation service.
- Service depends on repositories and reputation contract interface.
- Repositories depend on Supabase client and shared query options.
- Blockchain client provides transaction simulation and confirmation.

```mermaid
graph LR
Routes["reputation-routes.ts"] --> Auth["auth-middleware.ts"]
Routes --> Service["reputation-service.ts"]
Service --> ContractsRepo["contract-repository.ts"]
Service --> ProjectsRepo["project-repository.ts"]
Service --> ContractMap["entity-mapper.ts"]
Service --> ReputationContract["reputation-contract.ts"]
ReputationContract --> BlockchainClient["blockchain-client.ts"]
```

## Performance Considerations
- Pagination:
  - ContractRepository.getUserContracts returns paginated results with hasMore and total. The service currently iterates all items; consider applying pagination limits upstream to reduce memory usage and response latency.
- Sorting:
  - Sorting by completedAt occurs in-memory after collecting entries. For large histories, consider sorting at the database level or limiting the number of entries returned.
- Network calls:
  - Each completed contract triggers a project metadata fetch and a blockchain ratings query. For very large histories, consider batching or caching project titles and ratings per contract.
- Blockchain latency:
  - The blockchain client simulates confirmation. In production, transaction confirmation adds latency; consider caching recent ratings or using a read replica for ratings.

Recommendations:
- Limit pageSize for getUserContracts and cap the number of returned entries.
- Cache project titles keyed by projectId to avoid repeated lookups.
- Cache per-contract ratings keyed by contractId to avoid repeated blockchain queries.
- Add optional query parameters for date range and status to reduce payload size.

## Troubleshooting Guide
Common issues and resolutions:
- Authentication failures:
  - Missing or invalid Authorization header: 401 Unauthorized.
  - Token expired or invalid: 401 Unauthorized with specific error code.
- Validation errors:
  - Missing or invalid userId: 400 with VALIDATION_ERROR.
- Not found:
  - If no contracts exist for the user, the service returns an empty array.
- Blockchain availability:
  - In simulation mode, transactions are confirmed immediately; in production, ensure RPC connectivity and handle confirmation timeouts.

Operational tips:
- Verify JWT token format: Bearer <token>.
- Confirm userId is a valid UUID.
- Check Supabase connectivity for project metadata.
- Monitor blockchain client availability and transaction confirmation status.

## Conclusion
The work history endpoint provides clients with a comprehensive, time-ordered view of a freelancer’s completed projects, ratings, and comments. By combining on-chain reputation data with off-chain project metadata, the system delivers immutable, verifiable insights. Future enhancements should focus on pagination, caching, and optional filtering to improve performance and scalability.

## Appendices

### Endpoint Reference
- Method: GET
- Path: /api/reputation/:userId/history
- Security: Bearer JWT
- Path parameters:
  - userId: UUID
- Response: Array of WorkHistoryEntry
  - contractId: UUID
  - projectId: UUID
  - projectTitle: String
  - role: 'freelancer' | 'employer'
  - completedAt: ISO date-time
  - rating: Integer 1–5 (optional)
  - ratingComment: String (optional)

---

# Search API

## Table of Contents
1. [Introduction](#introduction)
2. [Project Search Endpoint](#project-search-endpoint)
3. [Freelancer Search Endpoint](#freelancer-search-endpoint)
4. [Search Algorithms and Relevance Scoring](#search-algorithms-and-relevance-scoring)
5. [Client Implementation Examples](#client-implementation-examples)
6. [Performance Considerations](#performance-considerations)
7. [Error Handling](#error-handling)

## Introduction
The FreelanceXchain system provides robust search and discovery endpoints that enable users to find projects and freelancers based on various criteria. These endpoints support keyword search, skill-based filtering, budget range filtering, pagination, and sorting. The search functionality is designed to be efficient and scalable, with optimized database queries and in-memory filtering for complex search scenarios. All search endpoints require JWT authentication to ensure secure access to the platform's data.

## Project Search Endpoint

The project search endpoint allows users to search for projects using keyword, skill, and budget filters. This endpoint supports pagination through the `pageSize` and `continuationToken` parameters, enabling efficient retrieval of large datasets.

### HTTP Method and URL Pattern
```
GET /api/search/projects
```

### Authentication Requirements
This endpoint requires JWT authentication. The Authorization header must contain a valid Bearer token:
```
Authorization: Bearer <JWT_TOKEN>
```

### Query Parameters
| Parameter | Type | Required | Description | Example |
|---------|------|---------|-------------|---------|
| `keyword` | string | No | Search keyword for project title and description | "web development" |
| `skills` | string | No | Comma-separated skill IDs to filter projects | "123e4567-e89b-12d3-a456-426614174000,123e4567-e89b-12d3-a456-426614174001" |
| `minBudget` | number | No | Minimum budget filter (inclusive) | 1000 |
| `maxBudget` | number | No | Maximum budget filter (inclusive) | 5000 |
| `pageSize` | integer | No | Number of results per page (default: 20, max: 100) | 25 |
| `continuationToken` | string | No | Token for pagination (offset value) | "20" |

### Request Examples
**Search projects by keyword:**
```
GET /api/search/projects?keyword=web+development&pageSize=10
```

**Search projects by skills:**
```
GET /api/search/projects?skills=123e4567-e89b-12d3-a456-426614174000,123e4567-e89b-12d3-a456-426614174001&pageSize=15
```

**Search projects by budget range:**
```
GET /api/search/projects?minBudget=1000&maxBudget=5000&pageSize=20
```

**Search projects with multiple filters:**
```
GET /api/search/projects?keyword=mobile+app&skills=123e4567-e89b-12d3-a456-426614174002&minBudget=2000&maxBudget=8000&pageSize=25
```

### Response Schema
The response follows a standardized format with items and metadata:

```json
{
  "items": [
    {
      "id": "string",
      "employerId": "string",
      "title": "string",
      "description": "string",
      "requiredSkills": [
        {
          "skillId": "string",
          "skillName": "string",
          "categoryId": "string",
          "yearsOfExperience": "number"
        }
      ],
      "budget": "number",
      "deadline": "string",
      "status": "string",
      "milestones": [
        {
          "id": "string",
          "title": "string",
          "description": "string",
          "amount": "number",
          "dueDate": "string",
          "status": "string"
        }
      ],
      "createdAt": "string",
      "updatedAt": "string"
    }
  ],
  "metadata": {
    "pageSize": "integer",
    "hasMore": "boolean",
    "continuationToken": "string"
  }
}
```

### Response Example
```json
{
  "items": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "employerId": "123e4567-e89b-12d3-a456-426614174001",
      "title": "E-commerce Website Development",
      "description": "Build a responsive e-commerce website with payment integration",
      "requiredSkills": [
        {
          "skillId": "123e4567-e89b-12d3-a456-426614174002",
          "skillName": "React",
          "categoryId": "123e4567-e89b-12d3-a456-426614174003"
        },
        {
          "skillId": "123e4567-e89b-12d3-a456-426614174004",
          "skillName": "Node.js",
          "categoryId": "123e4567-e89b-12d3-a456-426614174003"
        }
      ],
      "budget": 4500,
      "deadline": "2024-12-31T23:59:59Z",
      "status": "open",
      "milestones": [
        {
          "id": "123e4567-e89b-12d3-a456-426614174005",
          "title": "Design Phase",
          "description": "Complete UI/UX design",
          "amount": 1000,
          "dueDate": "2024-06-30T23:59:59Z",
          "status": "pending"
        }
      ],
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "metadata": {
    "pageSize": 20,
    "hasMore": true,
    "continuationToken": "20"
  }
}
```

## Freelancer Search Endpoint

The freelancer search endpoint enables users to discover freelancers based on keyword and skill filters. This endpoint supports pagination and returns comprehensive freelancer profile information.

### HTTP Method and URL Pattern
```
GET /api/search/freelancers
```

### Authentication Requirements
This endpoint requires JWT authentication. The Authorization header must contain a valid Bearer token:
```
Authorization: Bearer <JWT_TOKEN>
```

### Query Parameters
| Parameter | Type | Required | Description | Example |
|---------|------|---------|-------------|---------|
| `keyword` | string | No | Search keyword for freelancer bio | "full stack developer" |
| `skills` | string | No | Comma-separated skill IDs to filter freelancers | "123e4567-e89b-12d3-a456-426614174000,123e4567-e89b-12d3-a456-426614174001" |
| `pageSize` | integer | No | Number of results per page (default: 20, max: 100) | 30 |
| `continuationToken` | string | No | Token for pagination (offset value) | "30" |

### Request Examples
**Search freelancers by keyword:**
```
GET /api/search/freelancers?keyword=full+stack+developer&pageSize=15
```

**Search freelancers by skills:**
```
GET /api/search/freelancers?skills=123e4567-e89b-12d3-a456-426614174002,123e4567-e89b-12d3-a456-426614174004&pageSize=20
```

**Search freelancers with multiple filters:**
```
GET /api/search/freelancers?keyword=senior+developer&skills=123e4567-e89b-12d3-a456-426614174002&pageSize=25
```

### Response Schema
The response follows a standardized format with items and metadata:

```json
{
  "items": [
    {
      "id": "string",
      "userId": "string",
      "bio": "string",
      "hourlyRate": "number",
      "skills": [
        {
          "name": "string",
          "yearsOfExperience": "number"
        }
      ],
      "experience": [
        {
          "id": "string",
          "title": "string",
          "company": "string",
          "description": "string",
          "startDate": "string",
          "endDate": "string"
        }
      ],
      "availability": "string",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ],
  "metadata": {
    "pageSize": "integer",
    "hasMore": "boolean",
    "continuationToken": "string"
  }
}
```

### Response Example
```json
{
  "items": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174006",
      "userId": "123e4567-e89b-12d3-a456-426614174007",
      "bio": "Senior full stack developer with 8 years of experience in React, Node.js, and MongoDB",
      "hourlyRate": 75,
      "skills": [
        {
          "name": "React",
          "yearsOfExperience": 6
        },
        {
          "name": "Node.js",
          "yearsOfExperience": 7
        },
        {
          "name": "MongoDB",
          "yearsOfExperience": 5
        }
      ],
      "experience": [
        {
          "id": "123e4567-e89b-12d3-a456-426614174008",
          "title": "Senior Developer",
          "company": "Tech Solutions Inc.",
          "description": "Led development of multiple web applications",
          "startDate": "2020-01-01",
          "endDate": null
        }
      ],
      "availability": "available",
      "createdAt": "2023-05-10T08:15:00Z",
      "updatedAt": "2024-01-10T14:20:00Z"
    }
  ],
  "metadata": {
    "pageSize": 20,
    "hasMore": true,
    "continuationToken": "20"
  }
}
```

## Search Algorithms and Relevance Scoring

The FreelanceXchain search system implements different algorithms based on the type and combination of filters provided in the search request. The system optimizes performance by using database-level queries when possible and falling back to in-memory filtering for complex scenarios.

### Search Strategy Overview
The search service employs a decision tree to determine the most efficient search strategy based on the provided filters:

```mermaid
flowchart TD
Start([Start Search]) --> FilterCheck{Multiple Filters?}
FilterCheck --> |No| SingleFilter
FilterCheck --> |Yes| MultipleFilters
SingleFilter --> KeywordCheck{Keyword Only?}
KeywordCheck --> |Yes| DatabaseKeywordSearch["Database: ILIKE query on title/description"]
KeywordCheck --> |No| SkillCheck{Skills Only?}
SkillCheck --> |Yes| DatabaseSkillSearch["Database: Filter by required_skills array"]
SkillCheck --> |No| BudgetCheck{Budget Range Only?}
BudgetCheck --> |Yes| DatabaseBudgetSearch["Database: GTE/LTE on budget field"]
BudgetCheck --> |No| AllOpen["Database: Get all open projects"]
MultipleFilters --> GetAllOpen["Database: Get all open projects"]
GetAllOpen --> InMemoryFiltering["In-Memory: Apply all filters"]
InMemoryFiltering --> ReturnResults["Return Results"]
DatabaseKeywordSearch --> ReturnResults
DatabaseSkillSearch --> ReturnResults
DatabaseBudgetSearch --> ReturnResults
AllOpen --> ReturnResults
```

### Text Matching Algorithm
For keyword searches, the system uses case-insensitive partial matching on project titles and descriptions. The algorithm converts the search keyword to lowercase and checks if it appears anywhere within the title or description text:

```mermaid
flowchart TD
Start([Start Text Search]) --> Normalize["Normalize keyword to lowercase"]
Normalize --> CheckTitle["Check if keyword in title"]
CheckTitle --> CheckDescription["Check if keyword in description"]
CheckDescription --> Combine["Return projects where keyword in title OR description"]
Combine --> End([Return Results])
```

### Skill Matching Algorithm
When searching by skills, the system uses exact matching on skill IDs for projects and skill names for freelancers. For projects, the search checks if any required skill matches the provided skill IDs. For freelancers, the search performs case-insensitive matching on skill names:

```mermaid
flowchart TD
Start([Start Skill Search]) --> CreateSet["Create Set from skill IDs"]
CreateSet --> IterateProjects["Iterate through projects"]
IterateProjects --> CheckSkills["Check if any required skill ID in set"]
CheckSkills --> FilterProjects["Filter projects with matching skills"]
FilterProjects --> End([Return Results])
```

### Relevance Scoring
Currently, the system does not implement complex relevance scoring. Results are returned in chronological order (newest first) based on the project's creation date. Future enhancements could include:
- Boosting projects with exact keyword matches in the title
- Prioritizing projects with skills that exactly match the search criteria
- Incorporating freelancer ratings and reputation scores
- Considering project budget and complexity

## Client Implementation Examples

### JavaScript/TypeScript Implementation
```typescript
class FreelanceXchainClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  private async request<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined) {
        url.searchParams.append(key, params[key]);
      }
    });

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  // Search projects
  async searchProjects(
    keyword?: string,
    skillIds?: string[],
    minBudget?: number,
    maxBudget?: number,
    pageSize: number = 20,
    continuationToken?: string
  ) {
    return this.request('/api/search/projects', {
      keyword,
      skills: skillIds?.join(','),
      minBudget,
      maxBudget,
      pageSize,
      continuationToken
    });
  }

  // Search freelancers
  async searchFreelancers(
    keyword?: string,
    skillIds?: string[],
    pageSize: number = 20,
    continuationToken?: string
  ) {
    return this.request('/api/search/freelancers', {
      keyword,
      skills: skillIds?.join(','),
      pageSize,
      continuationToken
    });
  }
}

// Usage example
const client = new FreelanceXchainClient('https://api.freelancexchain.com', 'your-jwt-token');

// Search for web development projects
client.searchProjects('web development', ['skill-123', 'skill-456'], 1000, 5000, 25)
  .then(results => {
    console.log(`Found ${results.items.length} projects`);
    console.log('Has more results:', results.metadata.hasMore);
    console.log('Next page token:', results.metadata.continuationToken);
  })
  .catch(error => console.error('Search failed:', error));
```

### React Search Interface
```jsx
import React, { useState, useEffect } from 'react';

function ProjectSearch() {
  const [keyword, setKeyword] = useState('');
  const [skills, setSkills] = useState([]);
  const [minBudget, setMinBudget] = useState('');
  const [maxBudget, setMaxBudget] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [projects, setProjects] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [continuationToken, setContinuationToken] = useState(null);
  const [loading, setLoading] = useState(false);

  const searchProjects = async (token = null) => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/search/projects', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        params: {
          keyword: keyword || undefined,
          skills: skills.length > 0 ? skills.join(',') : undefined,
          minBudget: minBudget || undefined,
          maxBudget: maxBudget || undefined,
          pageSize,
          continuationToken: token || undefined
        }
      });

      const data = await response.json();
      setProjects(prev => token ? [...prev, ...data.items] : data.items);
      setHasMore(data.metadata.hasMore);
      setContinuationToken(data.metadata.continuationToken);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    searchProjects();
  };

  const loadMore = () => {
    if (hasMore && continuationToken) {
      searchProjects(continuationToken);
    }
  };

  return (
    <div>
      <div className="search-filters">
        <input
          type="text"
          placeholder="Search by keyword"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <input
          type="text"
          placeholder="Skill IDs (comma-separated)"
          value={skills.join(',')}
          onChange={(e) => setSkills(e.target.value.split(',').map(s => s.trim()).filter(s => s))}
        />
        <input
          type="number"
          placeholder="Min budget"
          value={minBudget}
          onChange={(e) => setMinBudget(e.target.value)}
        />
        <input
          type="number"
          placeholder="Max budget"
          value={maxBudget}
          onChange={(e) => setMaxBudget(e.target.value)}
        />
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          <option value={10}>10 per page</option>
          <option value={20}>20 per page</option>
          <option value={50}>50 per page</option>
        </select>
        <button onClick={handleSearch}>Search</button>
      </div>

      <div className="search-results">
        {projects.map(project => (
          <div key={project.id} className="project-card">
            <h3>{project.title}</h3>
            <p>{project.description}</p>
            <p>Budget: ${project.budget}</p>
            <p>Skills: {project.requiredSkills.map(s => s.skillName).join(', ')}</p>
          </div>
        ))}
      </div>

      {hasMore && (
        <button onClick={loadMore} disabled={loading}>
          {loading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
```

## Performance Considerations

The search system is designed to handle large datasets efficiently through several optimization strategies:

### Database Indexing
The system leverages Supabase/PostgreSQL indexing to accelerate search queries:
- **Text search**: GIN indexes on project title and description columns for ILIKE operations
- **Skill filtering**: GIN indexes on the required_skills JSONB array column
- **Budget filtering**: B-tree indexes on the budget column for range queries
- **Status filtering**: Index on the status column to quickly filter open projects

### Pagination Strategy
The system implements cursor-based pagination using the `continuationToken` parameter, which represents the offset in the result set. This approach avoids the performance degradation associated with LIMIT/OFFSET pagination on large datasets:

```mermaid
flowchart LR
A[Client Request] --> B["pageSize=20, continuationToken=0"]
B --> C[Server: Fetch records 0-19]
C --> D[Client: Display first 20 results]
D --> E["User clicks 'Next'"]
E --> F["pageSize=20, continuationToken=20"]
F --> G[Server: Fetch records 20-39]
G --> H[Client: Display next 20 results]
```

### Query Optimization
The search service optimizes queries by:
1. Using database-level filtering when only a single filter is applied
2. Minimizing the amount of data transferred from the database
3. Applying filters in the most efficient order
4. Caching frequently accessed data when possible

### Rate Limiting
To prevent abuse and ensure system stability, the search endpoints are subject to rate limiting:
- Maximum of 100 requests per minute per user
- Burst limit of 10 requests per second
- Higher limits for premium accounts

### Scalability Recommendations
For optimal performance with large datasets:
- Implement Redis caching for frequent search queries
- Use database read replicas to distribute query load
- Consider implementing Elasticsearch for more advanced text search capabilities
- Monitor query performance and adjust indexes as needed
- Implement client-side caching to reduce redundant requests

## Error Handling

The search endpoints implement comprehensive error handling to provide meaningful feedback to clients.

### Error Response Format
All error responses follow a standardized format:

```json
{
  "error": {
    "code": "string",
    "message": "string"
  },
  "timestamp": "string",
  "requestId": "string"
}
```

### Common Error Codes
| Error Code | HTTP Status | Description |
|----------|------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `AUTH_MISSING_TOKEN` | 401 | Authorization header is missing |
| `AUTH_INVALID_TOKEN` | 401 | Provided JWT token is invalid |
| `AUTH_TOKEN_EXPIRED` | 401 | JWT token has expired |

### Validation Rules
The system validates all input parameters:
- `pageSize` must be a positive integer between 1 and 100
- `minBudget` and `maxBudget` must be valid numbers
- `continuationToken` must be a valid string or number
- When both `minBudget` and `maxBudget` are provided, `minBudget` must be less than or equal to `maxBudget`

### Error Handling Flow
```mermaid
flowchart TD
Start([Request Received]) --> Validation["Validate Parameters"]
Validation --> Valid{Valid?}
Valid --> |No| ValidationError["Return 400: VALIDATION_ERROR"]
Valid --> |Yes| Authentication["Check JWT Token"]
Authentication --> Authenticated{Authenticated?}
Authenticated --> |No| AuthError["Return 401: AUTH errors"]
Authenticated --> |Yes| Search["Execute Search"]
Search --> Success{Success?}
Success --> |No| InternalError["Return 400: Service error"]
Success --> |Yes| ReturnResults["Return 200: Results"]
```

---

# Freelancer Search API

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
This document provides comprehensive API documentation for the GET /api/search/freelancers endpoint in the FreelanceXchain system. It covers the HTTP method, URL pattern, authentication requirements, query parameters, request and response schemas, server-side validation, pagination model, integration with the search-service and repositories, and the underlying database indexing strategy. Practical examples demonstrate searching by keyword, filtering by skills, and combining both filters. Guidance is included for client-side implementation patterns for filter combinations and infinite scrolling.

## Project Structure
The freelancer search endpoint is implemented as follows:
- Route handler: GET /api/search/freelancers
- Validation and pagination logic: route layer
- Business logic: search-service module
- Data access: freelancer-profile-repository using Supabase
- Pagination model: shared base-repository abstraction
- Documentation: OpenAPI/Swagger definitions and API docs

```mermaid
graph TB
Client["Client"] --> Routes["Routes: search-routes.ts"]
Routes --> Service["Service: search-service.ts"]
Service --> Repo["Repository: freelancer-profile-repository.ts"]
Repo --> BaseRepo["Base Repository: base-repository.ts"]
BaseRepo --> DB["Supabase: freelancer_profiles table"]
```

## Core Components
- Endpoint: GET /api/search/freelancers
- Authentication: Requires a Bearer token in the Authorization header
- Query parameters:
  - keyword (string): Bio search term
  - skills (string): Comma-separated skill identifiers
  - pageSize (integer, default 20, min 1, max 100)
  - continuationToken (string): Pagination token (converted to numeric offset)
- Response schema:
  - items: array of FreelancerProfile
  - metadata: SearchResultMetadata with pageSize, hasMore, offset
- Pagination model:
  - pageSize normalized to 1–100
  - offset derived from continuationToken
  - hasMore computed from count and range

## Architecture Overview
The endpoint flow:
1. Route parses query parameters and validates pageSize
2. Builds filters and pagination objects
3. Calls search-service.searchFreelancers
4. search-service applies normalization and delegates to repository methods
5. Repository executes Supabase queries with ilike and JSONB array matching
6. Results mapped to API models and returned with pagination metadata

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route : search-routes.ts"
participant S as "Service : search-service.ts"
participant P as "Repo : freelancer-profile-repository.ts"
participant B as "Base Repo : base-repository.ts"
participant D as "Supabase DB"
C->>R : GET /api/search/freelancers?keyword=...&skills=...&pageSize=...&continuationToken=...
R->>R : Parse and validate query params<br/>Normalize pageSize
R->>S : searchFreelancers(filters, pagination)
S->>S : normalizePageSize(), buildQueryOptions()
alt skill-only filter
S->>P : searchBySkills(skillNames, options)
else keyword-only filter
S->>P : searchByKeyword(keyword, options)
else no filters
S->>P : getAllProfilesPaginated(options)
else combined filters
S->>P : getAllProfilesPaginated(options)
S->>S : filter in-memory (keyword and skills)
end
P->>B : queryPaginated(options, order, range)
B->>D : SELECT *, COUNT, ORDER BY created_at DESC, RANGE
D-->>B : items, count
B-->>P : PaginatedResult
P-->>S : FreelancerProfileEntity[]
S->>S : map to FreelancerProfile
S-->>R : { items, metadata }
R-->>C : 200 OK JSON
```

## Detailed Component Analysis

### Endpoint Definition and Authentication
- Method: GET
- URL: /api/search/freelancers
- Authentication: Bearer token required in Authorization header
- Notes: The route handler does not attach a middleware to enforce JWT; however, the API documentation states that protected endpoints require a Bearer token. Clients should include the token as per the documented pattern.

### Query Parameters
- keyword (string): Filters profiles by bio text using case-insensitive partial matching
- skills (string): Comma-separated skill identifiers; service converts to skill names for matching
- pageSize (integer): Defaults to 20; constrained to 1–100
- continuationToken (string): Converted to numeric offset; used for pagination

Validation behavior:
- pageSize must be a positive integer; otherwise returns 400 with VALIDATION_ERROR
- skill IDs are parsed from comma-separated string and trimmed
- Keyword is optional; skill IDs are optional

### Request and Response Schema
- Request: Query parameters only (no body)
- Response: FreelancerSearchResult
  - items: array of FreelancerProfile
  - metadata: SearchResultMetadata
    - pageSize: number
    - hasMore: boolean
    - offset: number (present when pagination offset is used)

Swagger/OpenAPI definitions:
- FreelancerProfile schema includes id, userId, bio, hourlyRate, skills, experience, availability, createdAt, updatedAt
- SearchResultMetadata schema includes pageSize, hasMore, continuationToken

### Server-Side Validation Logic for pageSize
- If pageSize is missing or less than 1, defaults to 20
- If pageSize exceeds 100, caps at 100
- If pageSize is present but not a positive integer, returns 400 with VALIDATION_ERROR

```mermaid
flowchart TD
Start(["Validate pageSize"]) --> CheckMissing["pageSize provided?"]
CheckMissing --> |No| UseDefault["Use default 20"]
CheckMissing --> |Yes| ParseNum["Parse as number"]
ParseNum --> ValidNum{"Is number > 0?"}
ValidNum --> |No| Return400["Return 400 VALIDATION_ERROR"]
ValidNum --> |Yes| CapMax["Cap at 100 if > 100"]
UseDefault --> CapMax
CapMax --> Done(["Normalized pageSize"])
```

### Pagination Model and Continuation Token
- Pagination input: pageSize and offset
- continuationToken is converted to numeric offset; if empty or invalid, offset defaults to 0
- hasMore computed from count and range; offset included in metadata when provided

### Integration with search-service and Repositories
- searchFreelancers:
  - skill-only: calls repository.searchBySkills
  - keyword-only: calls repository.searchByKeyword
  - no filters: calls repository.getAllProfilesPaginated
  - combined filters: fetches all profiles and filters in-memory (keyword and skills)
- Repository methods:
  - searchBySkills: performs range query and filters by skill names (case-insensitive)
  - searchByKeyword: uses ilike on bio with range and count
  - getAllProfilesPaginated: generic paginated query with ordering by created_at desc

### Underlying Database Indexing Strategy
- Table: freelancer_profiles
- Fields: bio (TEXT), skills (JSONB), experience (JSONB), availability (VARCHAR), user_id (UUID)
- Indexes: primary key on id, unique index on user_id, and various auxiliary indexes on other tables
- Text search on bio uses ilike; JSONB skills array matching uses overlap checks and in-memory filtering

### Practical Examples
- Search by keyword “React expert”:
  - GET /api/search/freelancers?keyword=React+expert&pageSize=20
- Filter by skill IDs “3,7”:
  - GET /api/search/freelancers?skills=3,7&pageSize=20
- Combine keyword and skills:
  - GET /api/search/freelancers?keyword=React+expert&skills=3,7&pageSize=20
- Pagination:
  - Use continuationToken to fetch subsequent pages; token is treated as numeric offset

Notes:
- The service expects skill identifiers; however, repository filtering uses skill names. Ensure skill identifiers map to skill names consistently.

## Dependency Analysis
```mermaid
graph LR
Routes["search-routes.ts"] --> Service["search-service.ts"]
Service --> Repo["freelancer-profile-repository.ts"]
Repo --> BaseRepo["base-repository.ts"]
BaseRepo --> Supabase["Supabase Client"]
```

## Performance Considerations
- Text search on bio:
  - Uses ilike; consider adding a GIN index on bio for improved performance if frequent text searches occur.
- JSONB skills array:
  - Repository filters by skill names in-memory; consider normalizing skills to separate table with foreign keys for efficient joins and indexing.
- Pagination:
  - Range queries with exact counts; ensure indexes on frequently sorted columns (e.g., created_at) are present.
- Combined filters:
  - When multiple filters are used, the service retrieves all profiles and filters in-memory; this can be expensive for large datasets. Consider optimizing with composite indexes or materialized views if needed.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- 400 Validation Error for pageSize:
  - Ensure pageSize is a positive integer and within 1–100.
- 401 Unauthorized:
  - Include a valid Bearer token in the Authorization header.
- Unexpected empty results:
  - Verify keyword spelling and skill identifiers; remember case-insensitive matching and that skills are matched by names in the repository.
- Pagination gaps:
  - Use continuationToken as numeric offset; ensure consistent pageSize across requests.

## Conclusion
The GET /api/search/freelancers endpoint provides flexible filtering over freelancer profiles with keyword and skills criteria, robust pagination, and clear error handling. For optimal performance, consider enhancing database indexes and normalizing skills to enable efficient joins and indexing. Clients should implement filter combinations and infinite scrolling by maintaining consistent pageSize and using continuationToken-derived offsets.

---

# Project Search API

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
This document describes the GET /api/search/projects endpoint in the FreelanceXchain system. It covers the HTTP method, URL pattern, authentication requirements, query parameters, request and response schemas, server-side validation, pagination model, and the underlying search-service and repository implementation. It also explains the database indexing strategy used for project title/description and required skills, and provides practical examples and performance recommendations for large datasets.

## Project Structure
The project search endpoint is implemented as follows:
- Route handler: GET /api/search/projects
- Validation: Built-in parameter parsing and validation in the route handler
- Service layer: searchProjects(filter, pagination) orchestrating repository calls
- Repository layer: Supabase client queries with database-level filters and in-memory filtering for multi-criteria
- Response mapping: Entities mapped to API models

```mermaid
graph TB
Client["Client"] --> Routes["Routes: GET /api/search/projects"]
Routes --> Service["Service: searchProjects(filters, pagination)"]
Service --> Repo["Repository: ProjectRepository"]
Repo --> DB["Supabase: Projects table"]
Service --> Mapper["Mapper: mapProjectFromEntity"]
Mapper --> Routes
Routes --> Client
```

## Core Components
- Endpoint: GET /api/search/projects
- Authentication: Requires a Bearer JWT token in the Authorization header
- Query parameters:
  - keyword (string): Free-text search across title and description
  - skills (string): Comma-separated skill IDs to filter by
  - minBudget (number): Minimum budget filter
  - maxBudget (number): Maximum budget filter
  - pageSize (integer, default 20, min 1, max 100): Results per page
  - continuationToken (string): Pagination token (parsed as an integer offset)
- Response schema:
  - items: array of Project
  - metadata: object with pageSize, hasMore, offset

## Architecture Overview
The request lifecycle for GET /api/search/projects:

```mermaid
sequenceDiagram
participant C as "Client"
participant R as "Route Handler"
participant S as "Search Service"
participant P as "Project Repository"
participant M as "Entity Mapper"
participant D as "Supabase"
C->>R : GET /api/search/projects?keyword=&skills=&minBudget=&maxBudget=&pageSize=&continuationToken=
R->>R : Parse and validate query params
R->>S : searchProjects(filters, pagination)
alt Single filter : keyword
S->>P : searchProjects(keyword, options)
P->>D : SELECT ... WHERE status=open AND (title ILIKE OR description ILIKE)
else Single filter : skills
S->>P : getProjectsBySkills(skillIds, options)
P->>D : SELECT ... WHERE status=open ORDER BY created_at DESC
P->>P : Filter in-memory by required_skills
else Single filter : budget range
S->>P : getProjectsByBudgetRange(minBudget, maxBudget, options)
P->>D : SELECT ... WHERE status=open AND budget BETWEEN min..max
else No filters
S->>P : getAllOpenProjects(options)
P->>D : SELECT ... WHERE status=open ORDER BY created_at DESC
else Multiple filters
S->>P : getAllOpenProjects(options)
P->>D : SELECT ... WHERE status=open ORDER BY created_at DESC
S->>S : Filter in-memory by keyword, skills, budget
end
S->>M : mapProjectFromEntity(entity)
M-->>S : Project model
S-->>R : { items, metadata }
R-->>C : 200 OK JSON
```

## Detailed Component Analysis

### Endpoint Definition and Authentication
- HTTP method: GET
- URL pattern: /api/search/projects
- Authentication: Bearer JWT token required in Authorization header
- Swagger security scheme defines bearerAuth with JWT format

### Query Parameters and Validation
- keyword: string; used for ILIKE search on title and description
- skills: string; comma-separated skill IDs; parsed into an array
- minBudget: number; validated to be numeric and non-negative
- maxBudget: number; validated to be numeric and non-negative
- pageSize: integer; normalized to 1–100; default 20
- continuationToken: string; parsed as integer offset; used for pagination

Server-side validation logic:
- Numeric parameters minBudget and maxBudget are parsed and validated; non-numeric values return 400 with VALIDATION_ERROR
- pageSize must be a positive integer; otherwise returns 400 with VALIDATION_ERROR
- Filters are built conditionally based on presence of parameters

### Request and Response Schema
- Request: Query parameters as described above
- Response:
  - items: array of Project
  - metadata: object containing pageSize, hasMore, offset

Swagger/OpenAPI schemas define:
- ProjectSearchResult: items array of Project, metadata of type SearchResultMetadata
- SearchResultMetadata: pageSize, hasMore, offset

### Service Layer Implementation
- searchProjects(filters, pagination):
  - Normalizes pageSize to 1–100
  - Builds QueryOptions with limit and offset
  - Applies optimized repository methods when a single filter is present
  - Falls back to getAllOpenProjects and applies in-memory filters for multiple criteria
  - Maps entities to models and constructs a SearchResult with metadata

### Repository Layer and Database Indexing Strategy
- searchProjects(keyword, options):
  - Database-level ILIKE search on title and description for open projects
  - Uses Supabase orients query with or(title.ilike, description.ilike)
- getProjectsBySkills(skillIds, options):
  - Fetches open projects and filters in-memory by required_skills.skill_id
- getProjectsByBudgetRange(minBudget, maxBudget, options):
  - Database-level gte/bounded budget query for open projects
- getAllOpenProjects(options):
  - Fetches open projects ordered by created_at with pagination

Underlying database indexing strategy:
- Project titles and descriptions are searched using ILIKE with or() conditions
- Required skills are stored as an array of records in the projects table; repository filters by required_skills in memory
- Budget range filtering uses database operators gte/lte

### Entity Mapping
- mapProjectFromEntity(entity) converts repository entities to API models
- Project model includes id, employerId, title, description, requiredSkills, budget, deadline, status, milestones, createdAt, updatedAt

### Practical Examples
- Search by keyword:
  - GET /api/search/projects?keyword=web%20development
- Filter by skill IDs:
  - GET /api/search/projects?skills=1,5,9
- Budget range:
  - GET /api/search/projects?minBudget=500&maxBudget=5000
- Combined filters:
  - GET /api/search/projects?keyword=react&skills=10,15&minBudget=1000&maxBudget=10000&pageSize=20&continuationToken=20

Notes:
- pageSize defaults to 20 and is capped at 100
- continuationToken is parsed as an integer offset

## Dependency Analysis
```mermaid
graph LR
Routes["search-routes.ts"] --> Service["search-service.ts"]
Service --> Repo["project-repository.ts"]
Service --> Mapper["entity-mapper.ts"]
Routes --> Swagger["swagger.ts"]
Routes --> Docs["API-DOCUMENTATION.md"]
App["app.ts"] --> Routes
```

## Performance Considerations
- Single-filter optimization:
  - Keyword search uses database ILIKE with or() conditions
  - Skills filter uses database query and in-memory filtering
  - Budget range uses database gte/lte filters
- Multi-filter fallback:
  - When multiple filters are present, the service fetches all open projects and applies in-memory filters (keyword, skills, budget). This scales with dataset size and should be avoided for large datasets.
- Pagination:
  - pageSize is normalized to 1–100; continuationToken is parsed as an integer offset
- Recommendations:
  - Prefer single filters for optimal performance
  - For multi-filter scenarios, consider adding database indexes on required_skills arrays or denormalizing skills for efficient querying
  - Use smaller pageSize values and leverage continuationToken for progressive loading
  - Cache frequently accessed keyword lists and skill IDs where appropriate

## Troubleshooting Guide
Common validation errors:
- Invalid numeric parameters:
  - minBudget or maxBudget must be valid numbers; otherwise returns 400 with VALIDATION_ERROR
- Invalid pageSize:
  - pageSize must be a positive integer; otherwise returns 400 with VALIDATION_ERROR
- Authentication failures:
  - Missing Authorization header or invalid Bearer token format returns 401
  - Invalid/expired token returns 401 with AUTH_INVALID_TOKEN or AUTH_TOKEN_EXPIRED
- CORS and request ID:
  - Requests include X-Request-ID for tracing; CORS policies vary by environment

## Conclusion
The GET /api/search/projects endpoint provides flexible project discovery with keyword, skills, and budget filters. It enforces JWT authentication, validates numeric parameters, and supports pagination via pageSize and continuationToken. The service optimizes single-filter queries at the database level while falling back to in-memory filtering for multi-criteria. For large-scale deployments, consider enhancing database indexing and caching strategies to improve performance under multi-filter workloads.