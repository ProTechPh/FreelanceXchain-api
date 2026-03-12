# Project Tags Feature

## Overview

Employers can now add tags/hashtags to their projects to better categorize and highlight project requirements, making it easier for freelancers to search and filter relevant opportunities.

## Features

- Add up to 10 tags per project
- Tags are automatically cleaned (trimmed, deduplicated)
- Efficient tag-based searching with GIN indexes
- Optional field - projects can be created with or without tags

## API Usage

### Create Project with Tags

```bash
curl -X POST https://api.freelancexchain.com/api/projects \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build React Dashboard",
    "description": "Need an experienced developer to build a modern dashboard...",
    "requiredSkills": [
      {"skillId": "skill-uuid-1"},
      {"skillId": "skill-uuid-2"}
    ],
    "budget": 5000,
    "deadline": "2026-06-30T00:00:00Z",
    "tags": ["react", "typescript", "dashboard", "frontend"]
  }'
```

## Response Example

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "employerId": "EMPLOYER_UUID",
  "title": "Build React Dashboard",
  "description": "Need an experienced developer...",
  "requiredSkills": [...],
  "budget": 5000,
  "deadline": "2026-06-30T00:00:00Z",
  "status": "open",
  "milestones": [],
  "tags": ["react", "typescript", "dashboard", "frontend"],
  "createdAt": "2026-03-12T10:00:00Z",
  "updatedAt": "2026-03-12T10:00:00Z"
}
```

## Validation Rules

- Tags field is optional
- Maximum 10 tags per project
- Each tag must be a string
- Empty tags are automatically removed
- Duplicate tags are automatically removed
- Tags are trimmed of whitespace

## Database Queries

### Search projects by single tag
```sql
SELECT * FROM projects WHERE 'react' = ANY(tags);
```

### Search projects with multiple tags (OR)
```sql
SELECT * FROM projects WHERE tags && ARRAY['react', 'nodejs'];
```

### Search projects with all tags (AND)
```sql
SELECT * FROM projects WHERE tags @> ARRAY['react', 'nodejs'];
```

## Use Cases

- **Technology Stack**: Tag projects with tech requirements (e.g., "react", "nodejs", "postgresql")
- **Project Type**: Indicate project category (e.g., "frontend", "backend", "fullstack", "mobile")
- **Industry**: Specify industry domain (e.g., "fintech", "healthcare", "ecommerce")
- **Urgency**: Highlight time-sensitive projects (e.g., "urgent", "asap")
- **Experience Level**: Indicate required expertise (e.g., "senior", "junior", "expert")

## Benefits

- **For Freelancers**: Easier to find relevant projects matching their skills
- **For Employers**: Better project visibility and more targeted proposals
- **For Platform**: Improved search and recommendation algorithms

## Migration

The feature includes a database migration that:
1. Removes tags column from proposals table (moved from proposals to projects)
2. Adds tags column to projects table
3. Sets default value as empty array
4. Creates a GIN index for efficient tag searching
5. Adds documentation comment

Run the migration:
```bash
# Using Supabase CLI
supabase db push

# Or apply manually
psql -d your_database -f supabase/migrations/20260312000002_move_tags_to_projects.sql
```
