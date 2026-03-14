-- Add deliverable_files column to support milestone file attachments
-- This migration adds the necessary database schema for milestone deliverables

-- Add deliverable_files column to projects table (since milestones are stored as JSONB there)
-- This will be used when milestones are submitted with file attachments
ALTER TABLE projects ADD COLUMN IF NOT EXISTS milestone_deliverables JSONB DEFAULT '{}';

-- Create a comment to document the structure
COMMENT ON COLUMN projects.milestone_deliverables IS 'Stores file attachments for each milestone. Structure: {"milestone_id": [{"filename": "...", "url": "...", "size": 123, "mimeType": "..."}]}';

-- If you have a separate milestones table (which seems to be planned), add this:
-- ALTER TABLE milestones ADD COLUMN IF NOT EXISTS deliverable_files JSONB DEFAULT '[]';
-- COMMENT ON COLUMN milestones.deliverable_files IS 'Array of file attachments for this milestone';