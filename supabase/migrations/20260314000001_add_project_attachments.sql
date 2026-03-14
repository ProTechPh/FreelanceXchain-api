-- Migration: Add attachments support to projects table
-- Date: 2026-03-14
-- Description: Add file attachments support to projects so employers can attach reference materials (images, documents, etc.)

-- Add attachments column to store file metadata as JSONB array
ALTER TABLE projects
ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN projects.attachments IS 'Array of file attachments with metadata: [{url, filename, size, mimeType}] - Reference materials from employer (max 10 files)';

-- Create GIN index for efficient attachment searching
CREATE INDEX IF NOT EXISTS idx_projects_attachments ON projects USING GIN (attachments);

-- Example usage:
-- Search projects with attachments: SELECT * FROM projects WHERE jsonb_array_length(attachments) > 0;
-- Search by file type: SELECT * FROM projects WHERE attachments @> '[{"mimeType": "image/jpeg"}]';