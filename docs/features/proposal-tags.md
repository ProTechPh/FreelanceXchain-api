# Proposal Tags Feature

## Overview

Freelancers can now add tags/hashtags to their proposals to better categorize and highlight their expertise, making it easier for employers to filter and search proposals.

## Features

- Add up to 10 tags per proposal
- Tags are automatically cleaned (trimmed, deduplicated)
- Support for both multipart/form-data and JSON submission
- Efficient tag-based searching with GIN indexes

## API Usage

### Multipart Form Submission

```bash
curl -X POST https://api.freelancexchain.com/api/proposals \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "projectId=PROJECT_UUID" \
  -F "proposedRate=1000" \
  -F "estimatedDuration=30" \
  -F 'tags=["react", "typescript", "nodejs"]' \
  -F "file=@proposal.pdf"
```

### JSON Submission

```bash
curl -X POST https://api.freelancexchain.com/api/proposals \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "PROJECT_UUID",
    "proposedRate": 1000,
    "estimatedDuration": 30,
    "tags": ["react", "typescript", "nodejs"],
    "attachments": [
      {
        "url": "https://storage.example.com/file.pdf",
        "filename": "proposal.pdf",
        "size": 12345,
        "mimeType": "application/pdf"
      }
    ]
  }'
```

## Response Example

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "projectId": "PROJECT_UUID",
  "freelancerId": "FREELANCER_UUID",
  "coverLetter": null,
  "attachments": [...],
  "proposedRate": 1000,
  "estimatedDuration": 30,
  "tags": ["react", "typescript", "nodejs"],
  "status": "pending",
  "createdAt": "2026-03-12T10:00:00Z",
  "updatedAt": "2026-03-12T10:00:00Z"
}
```

## Validation Rules

- Tags field is optional
- Maximum 10 tags per proposal
- Each tag must be a string
- Empty tags are automatically removed
- Duplicate tags are automatically removed
- Tags are trimmed of whitespace

## Database Queries

### Search proposals by single tag
```sql
SELECT * FROM proposals WHERE 'react' = ANY(tags);
```

### Search proposals with multiple tags (OR)
```sql
SELECT * FROM proposals WHERE tags && ARRAY['react', 'nodejs'];
```

### Search proposals with all tags (AND)
```sql
SELECT * FROM proposals WHERE tags @> ARRAY['react', 'nodejs'];
```

## Use Cases

- **Skill Highlighting**: Tag proposals with relevant technologies (e.g., "react", "python", "aws")
- **Specialization**: Indicate areas of expertise (e.g., "frontend", "backend", "fullstack")
- **Industry**: Specify industry experience (e.g., "fintech", "healthcare", "ecommerce")
- **Methodology**: Highlight work approaches (e.g., "agile", "tdd", "ci-cd")

## Migration

The feature includes a database migration that:
1. Adds the `tags` column to the proposals table
2. Sets default value as empty array
3. Creates a GIN index for efficient tag searching
4. Adds documentation comment

Run the migration:
```bash
# Using Supabase CLI
supabase db push

# Or apply manually
psql -d your_database -f supabase/migrations/20260312000001_add_proposal_tags.sql
```
