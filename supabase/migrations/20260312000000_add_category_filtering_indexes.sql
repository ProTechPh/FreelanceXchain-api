-- Migration: Add indexes for category-based project filtering
-- Created: 2026-03-12
-- Description: Optimize performance for category-based project queries

-- Add GIN index on required_skills JSONB column for efficient category filtering
-- This allows fast queries on skill category_id within the JSONB array
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_required_skills_gin 
ON projects USING GIN (required_skills);

-- Add composite index for status and required_skills for filtered queries
-- This optimizes queries that filter by both status (e.g., 'open') and categories
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_status_skills 
ON projects (status, required_skills);

-- Add index for budget range queries combined with status
-- This optimizes queries that combine category, status, and budget filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_status_budget_created 
ON projects (status, budget, created_at DESC);

-- Add expression index for extracting category IDs from required_skills JSONB
-- This creates a functional index on the category_id values within the JSONB array
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_category_ids 
ON projects USING GIN ((
  SELECT array_agg(DISTINCT (skill->>'category_id'))
  FROM jsonb_array_elements(required_skills) AS skill
));

-- Add comment explaining the indexes
COMMENT ON INDEX idx_projects_required_skills_gin IS 'GIN index for efficient JSONB queries on required_skills';
COMMENT ON INDEX idx_projects_status_skills IS 'Composite index for status and skills filtering';
COMMENT ON INDEX idx_projects_status_budget_created IS 'Composite index for status, budget range, and ordering';
COMMENT ON INDEX idx_projects_category_ids IS 'Functional GIN index for category ID extraction from JSONB';