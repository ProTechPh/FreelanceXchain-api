-- Migration: Move tags from proposals to projects
-- Description: Removes tags from proposals and adds them to projects for better categorization
-- Date: 2026-03-12

-- Remove tags column from proposals table
ALTER TABLE proposals 
DROP COLUMN IF EXISTS tags;

-- Drop the GIN index on proposals.tags
DROP INDEX IF EXISTS idx_proposals_tags;

-- Add tags column to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Add comment for documentation
COMMENT ON COLUMN projects.tags IS 'Array of tags/hashtags for categorizing and filtering projects';

-- Create GIN index for efficient tag searching on projects
CREATE INDEX IF NOT EXISTS idx_projects_tags ON projects USING GIN (tags);

-- Example usage:
-- Search projects by tag: SELECT * FROM projects WHERE 'react' = ANY(tags);
-- Search projects with multiple tags: SELECT * FROM projects WHERE tags && ARRAY['react', 'nodejs'];
