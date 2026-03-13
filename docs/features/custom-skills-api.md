# Custom Skills API Usage Guide

## Overview
The Custom Skills feature allows users to add skills that aren't available in the global skill taxonomy. This is perfect for emerging technologies, specialized tools, or niche expertise areas.

## Key Features
- ✅ Create custom skills when global taxonomy doesn't have what you need
- ✅ Suggest custom skills for inclusion in global taxonomy
- ✅ Full CRUD operations on your custom skills
- ✅ Search through your custom skills
- ✅ Admin workflow for reviewing skill suggestions

## API Endpoints

### 1. Create Custom Skill
```http
POST /api/skills/custom
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Advanced React Patterns",
  "description": "Experience with render props, higher-order components, and compound components",
  "yearsOfExperience": 3,
  "categoryName": "Frontend Development",
  "suggestForGlobal": true
}
```

**Response (201):**
```json
{
  "id": "uuid-here",
  "userId": "user-uuid",
  "name": "Advanced React Patterns",
  "description": "Experience with render props, higher-order components, and compound components",
  "yearsOfExperience": 3,
  "categoryName": "Frontend Development",
  "isApproved": false,
  "suggestedForGlobal": true,
  "createdAt": "2024-03-13T10:00:00Z",
  "updatedAt": "2024-03-13T10:00:00Z"
}
```

### 2. Get Your Custom Skills
```http
GET /api/skills/custom
Authorization: Bearer <token>
```

**Response (200):**
```json
[
  {
    "id": "uuid-1",
    "name": "Advanced React Patterns",
    "description": "Experience with render props...",
    "yearsOfExperience": 3,
    "categoryName": "Frontend Development",
    "isApproved": false,
    "suggestedForGlobal": true,
    "createdAt": "2024-03-13T10:00:00Z",
    "updatedAt": "2024-03-13T10:00:00Z"
  }
]
```

### 3. Search Your Custom Skills
```http
GET /api/skills/custom/search?keyword=react
Authorization: Bearer <token>
```

### 4. Update Custom Skill
```http
PUT /api/skills/custom/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "yearsOfExperience": 4,
  "description": "Updated description with more experience"
}
```

### 5. Delete Custom Skill
```http
DELETE /api/skills/custom/{id}
Authorization: Bearer <token>
```

### 6. Add Skills to Profile (Mixed Global + Custom)
```http
POST /api/freelancers/profile/skills
Authorization: Bearer <token>
Content-Type: application/json

{
  "skills": [
    {
      "name": "JavaScript",
      "yearsOfExperience": 5
    },
    {
      "name": "Advanced React Patterns",
      "yearsOfExperience": 3
    }
  ]
}
```

## Admin Endpoints

### 7. Get Skill Suggestions (Admin Only)
```http
GET /api/skills/suggestions
Authorization: Bearer <admin-token>
```

**Response:**
```json
[
  {
    "id": "suggestion-uuid",
    "skillName": "Advanced React Patterns",
    "skillDescription": "Experience with render props...",
    "categoryName": "Frontend Development",
    "suggestedBy": "John Doe",
    "timesRequested": 5,
    "status": "pending",
    "createdAt": "2024-03-13T10:00:00Z"
  }
]
```

### 8. Approve/Reject Skill Suggestion (Admin Only)
```http
PUT /api/skills/suggestions/{id}/status
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "status": "approved"
}
```

## Error Responses

### Skill Already Exists Globally (409)
```json
{
  "error": {
    "code": "SKILL_EXISTS_GLOBALLY",
    "message": "Skill \"React.js\" already exists in the global skill taxonomy. Use the existing skill instead.",
    "details": [
      "Existing skill ID: global-skill-123",
      "Category: Frontend Development"
    ]
  },
  "timestamp": "2024-03-13T10:00:00Z",
  "requestId": "req-123"
}
```

### Duplicate Custom Skill (409)
```json
{
  "error": {
    "code": "DUPLICATE_USER_SKILL",
    "message": "You already have a custom skill named \"Advanced React Patterns\"."
  },
  "timestamp": "2024-03-13T10:00:00Z",
  "requestId": "req-123"
}
```

### Validation Error (400)
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      {
        "field": "name",
        "message": "Name must be between 2 and 100 characters"
      },
      {
        "field": "yearsOfExperience",
        "message": "Years of experience must be between 0 and 50"
      }
    ]
  },
  "timestamp": "2024-03-13T10:00:00Z",
  "requestId": "req-123"
}
```

## Validation Rules

### Custom Skill Creation
- **name**: 2-100 characters, required
- **description**: 10-500 characters, required  
- **yearsOfExperience**: 0-50, required
- **categoryName**: max 100 characters, optional
- **suggestForGlobal**: boolean, optional (default: false)

### Security
- Users can only access their own custom skills
- Row-level security enforced at database level
- Admin role required for skill suggestion management
- Input validation and sanitization on all endpoints

## Workflow Example

1. **User wants to add "Svelte Kit" skill**
2. **System checks global taxonomy** → Not found
3. **User creates custom skill** with `suggestForGlobal: true`
4. **Skill added to user's profile** and suggestion created
5. **Admin reviews suggestions** → Sees "Svelte Kit" requested by 10+ users
6. **Admin approves suggestion** → Skill added to global taxonomy
7. **Future users** can now use "Svelte Kit" from global taxonomy

## Benefits

- **No limitations** - Add any skill you need
- **Community-driven growth** - Popular skills get promoted to global taxonomy
- **Quality control** - Admin approval ensures taxonomy quality
- **Seamless integration** - Works with existing profile management
- **Future-proof** - Easily adapt to new technologies and trends