# API Documentation

Base URL: `http://localhost:3000/api`

Interactive documentation: `http://localhost:3000/api-docs`

## Authentication

All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <access_token>
```

---

## Auth Endpoints

### POST /auth/register
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "role": "freelancer"
}
```

**Response (201):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "freelancer",
    "createdAt": "2025-12-07T00:00:00.000Z"
  },
  "accessToken": "jwt_token",
  "refreshToken": "refresh_token"
}
```

### POST /auth/login
Authenticate and receive tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

### POST /auth/refresh
Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "refresh_token"
}
```

---

## Freelancer Endpoints

### GET /freelancers/me
Get current freelancer's profile. (Auth required)

### POST /freelancers/profile
Create freelancer profile. (Auth required)

**Request Body:**
```json
{
  "bio": "Experienced full-stack developer",
  "hourlyRate": 50,
  "availability": "available"
}
```

### PUT /freelancers/profile
Update freelancer profile. (Auth required)

### POST /freelancers/profile/skills
Add skills to profile. (Auth required)

**Request Body:**
```json
{
  "skills": [
    { "skillId": "uuid", "yearsOfExperience": 3 }
  ]
}
```

### DELETE /freelancers/profile/skills/:skillId
Remove skill from profile. (Auth required)

### POST /freelancers/profile/experience
Add work experience. (Auth required)

**Request Body:**
```json
{
  "title": "Senior Developer",
  "company": "Tech Corp",
  "description": "Led development team",
  "startDate": "2020-01-01",
  "endDate": "2023-12-31"
}
```

---

## Employer Endpoints

### GET /employers/me
Get current employer's profile. (Auth required)

### POST /employers/profile
Create employer profile. (Auth required)

**Request Body:**
```json
{
  "companyName": "Tech Startup Inc",
  "companyDescription": "Innovative software company",
  "website": "https://example.com",
  "industry": "Technology"
}
```

### PUT /employers/profile
Update employer profile. (Auth required)

---

## Project Endpoints

### GET /projects
List all open projects.

**Query Parameters:**
- `pageSize` (number): Items per page (default: 20)
- `continuationToken` (string): Pagination token

### GET /projects/:id
Get project by ID.

### POST /projects
Create new project. (Auth required - Employer only)

**Request Body:**
```json
{
  "title": "E-commerce Website Development",
  "description": "Build a modern e-commerce platform",
  "requiredSkills": [
    { "skillId": "uuid", "importance": "required" }
  ],
  "budget": 5000,
  "deadline": "2025-03-01T00:00:00.000Z",
  "milestones": [
    {
      "title": "Design Phase",
      "description": "UI/UX design",
      "amount": 1000,
      "dueDate": "2025-01-15T00:00:00.000Z"
    },
    {
      "title": "Development",
      "description": "Frontend and backend",
      "amount": 3000,
      "dueDate": "2025-02-15T00:00:00.000Z"
    },
    {
      "title": "Testing & Launch",
      "description": "QA and deployment",
      "amount": 1000,
      "dueDate": "2025-03-01T00:00:00.000Z"
    }
  ]
}
```

### PUT /projects/:id
Update project. (Auth required - Owner only)

### DELETE /projects/:id
Delete project. (Auth required - Owner only)

### GET /projects/employer/:employerId
List projects by employer.

### GET /projects/skills
List projects by required skills.

**Query Parameters:**
- `skillIds` (string): Comma-separated skill IDs

---

## Proposal Endpoints

### GET /proposals/:id
Get proposal by ID. (Auth required)

### GET /proposals/project/:projectId
Get all proposals for a project. (Auth required - Project owner)

### GET /proposals/freelancer/:freelancerId
Get all proposals by a freelancer. (Auth required)

### POST /proposals
Submit a proposal. (Auth required - Freelancer only)

**Request Body:**
```json
{
  "projectId": "uuid",
  "coverLetter": "I am interested in this project...",
  "proposedRate": 4500,
  "estimatedDuration": 60,
  "milestones": [
    {
      "title": "Design",
      "amount": 900,
      "duration": 10
    }
  ]
}
```

### POST /proposals/:id/accept
Accept a proposal. (Auth required - Project owner)

### POST /proposals/:id/reject
Reject a proposal. (Auth required - Project owner)

### POST /proposals/:id/withdraw
Withdraw a proposal. (Auth required - Proposal owner)

---

## Contract Endpoints

### GET /contracts/:id
Get contract by ID. (Auth required - Contract party)

### GET /contracts/user/:userId
Get all contracts for a user. (Auth required)

### GET /contracts/project/:projectId
Get contract for a project. (Auth required)

---

## Payment Endpoints

### POST /payments/escrow/initialize
Initialize escrow for a contract. (Auth required - Employer)

**Request Body:**
```json
{
  "contractId": "uuid"
}
```

### POST /payments/milestone/:milestoneIndex/complete
Request milestone completion. (Auth required - Freelancer)

**Request Body:**
```json
{
  "contractId": "uuid"
}
```

### POST /payments/milestone/:milestoneIndex/approve
Approve milestone and release payment. (Auth required - Employer)

**Request Body:**
```json
{
  "contractId": "uuid"
}
```

### POST /payments/milestone/:milestoneIndex/dispute
Dispute a milestone. (Auth required - Contract party)

**Request Body:**
```json
{
  "contractId": "uuid",
  "reason": "Work does not meet requirements"
}
```

### GET /payments/contract/:contractId/status
Get payment status for a contract. (Auth required)

---

## Reputation Endpoints

### GET /reputation/:userId
Get user's reputation score and ratings.

**Response:**
```json
{
  "userId": "uuid",
  "averageRating": 4.5,
  "totalRatings": 12,
  "ratings": [
    {
      "id": "uuid",
      "score": 5,
      "comment": "Excellent work!",
      "contractId": "uuid",
      "raterRole": "employer",
      "createdAt": "2025-12-01T00:00:00.000Z"
    }
  ]
}
```

### POST /reputation/rate
Submit a rating. (Auth required)

**Request Body:**
```json
{
  "contractId": "uuid",
  "rateeId": "uuid",
  "score": 5,
  "comment": "Great collaboration, delivered on time!"
}
```

### GET /reputation/contract/:contractId
Get ratings for a specific contract.

### GET /reputation/:userId/history
Get work history for a user.

---

## Dispute Endpoints

### GET /disputes/:id
Get dispute by ID. (Auth required)

### GET /disputes/contract/:contractId
Get disputes for a contract. (Auth required)

### POST /disputes
Create a dispute. (Auth required - Contract party)

**Request Body:**
```json
{
  "contractId": "uuid",
  "milestoneIndex": 1,
  "reason": "Deliverables do not match requirements",
  "description": "Detailed explanation of the issue..."
}
```

### POST /disputes/:id/evidence
Submit evidence for a dispute. (Auth required - Dispute party)

**Request Body:**
```json
{
  "description": "Screenshot showing the issue",
  "attachmentUrl": "https://storage.example.com/evidence.png"
}
```

### POST /disputes/:id/resolve
Resolve a dispute. (Auth required - Admin/Arbiter)

**Request Body:**
```json
{
  "resolution": "in_favor_of_freelancer",
  "notes": "Evidence supports freelancer's claim"
}
```

---

## Search Endpoints

### GET /search/projects
Search projects with filters.

**Query Parameters:**
- `query` (string): Search text
- `skills` (string): Comma-separated skill IDs
- `minBudget` (number): Minimum budget
- `maxBudget` (number): Maximum budget
- `status` (string): Project status
- `pageSize` (number): Results per page
- `continuationToken` (string): Pagination token

### GET /search/freelancers
Search freelancers with filters.

**Query Parameters:**
- `query` (string): Search text
- `skills` (string): Comma-separated skill IDs
- `minRate` (number): Minimum hourly rate
- `maxRate` (number): Maximum hourly rate
- `availability` (string): available, busy, unavailable
- `pageSize` (number): Results per page

---

## Matching Endpoints (AI-Powered)

### GET /matching/projects
Get AI-recommended projects for freelancer. (Auth required - Freelancer)

**Query Parameters:**
- `limit` (number): Max recommendations (default: 10)

**Response:**
```json
{
  "recommendations": [
    {
      "project": { /* project object */ },
      "matchScore": 0.85,
      "matchReasons": [
        "Strong match on React.js skill",
        "Budget aligns with your rate"
      ],
      "skillGaps": ["GraphQL"]
    }
  ]
}
```

### GET /matching/freelancers/:projectId
Get AI-recommended freelancers for a project. (Auth required - Employer)

### POST /matching/extract-skills
Extract skills from text description.

**Request Body:**
```json
{
  "text": "Looking for a developer with React, Node.js, and PostgreSQL experience"
}
```

### POST /matching/analyze-gap
Analyze skill gaps between freelancer and project.

**Request Body:**
```json
{
  "freelancerId": "uuid",
  "projectId": "uuid"
}
```

---

## Skill Endpoints

### GET /skills
Get all skills.

### GET /skills/:id
Get skill by ID.

### GET /skills/category/:categoryId
Get skills by category.

### GET /skills/categories
Get all skill categories.

### POST /skills/categories
Create skill category. (Auth required - Admin)

### POST /skills
Create skill. (Auth required - Admin)

### GET /skills/search
Search skills by name.

**Query Parameters:**
- `q` (string): Search query

---

## Notification Endpoints

### GET /notifications
Get user's notifications. (Auth required)

**Query Parameters:**
- `unreadOnly` (boolean): Filter unread only
- `pageSize` (number): Results per page

### GET /notifications/unread/count
Get unread notification count. (Auth required)

### PUT /notifications/:id/read
Mark notification as read. (Auth required)

### PUT /notifications/read-all
Mark all notifications as read. (Auth required)

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  },
  "timestamp": "2025-12-07T00:00:00.000Z",
  "requestId": "uuid"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `INTERNAL_ERROR` | 500 | Server error |
