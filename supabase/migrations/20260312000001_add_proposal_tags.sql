-- Migration: Add tags column to proposals table
-- Description: Adds support for tags/hashtags in proposal submissions
-- Date: 2026-03-12

-- Add tags column to proposals table
ALTER TABLE proposals 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Add comment for documentation
COMMENT ON COLUMN proposals.tags IS 'Array of tags/hashtags for categorizing and filtering proposals';

-- Create GIN index for efficient tag searching
CREATE INDEX IF NOT EXISTS idx_proposals_tags ON proposals USING GIN (tags);

-- Example usage:
-- Search proposals by tag: SELECT * FROM proposals WHERE 'react' = ANY(tags);
-- Search proposals with multiple tags: SELECT * FROM proposals WHERE tags && ARRAY['react', 'nodejs'];
