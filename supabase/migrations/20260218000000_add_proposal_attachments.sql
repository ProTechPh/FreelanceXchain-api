-- Migration: Add attachments support to proposals table
-- Date: 2026-02-18
-- Description: Replace text-based cover_letter with file attachments (1-5 files per proposal)

-- Add attachments column to store file metadata as JSONB array
ALTER TABLE proposals
ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;

-- Make cover_letter nullable for backward compatibility
ALTER TABLE proposals
ALTER COLUMN cover_letter DROP NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN proposals.attachments IS 'Array of file attachments with metadata: [{url, filename, size, mimeType}]';
COMMENT ON COLUMN proposals.cover_letter IS 'Legacy text cover letter field - nullable for backward compatibility';
