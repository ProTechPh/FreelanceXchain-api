-- Migration: Create project-attachments storage bucket
-- Date: 2026-03-14
-- Description: Create storage bucket for project attachment files (reference materials from employers)

-- Create the project-attachments bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-attachments',
  'project-attachments',
  false, -- Private bucket, requires authentication
  10485760, -- 10MB file size limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/gif'
  ]
);

-- Set up RLS policies for project-attachments bucket
-- Allow employers to upload files to their own project folders
CREATE POLICY "Employers can upload project attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-attachments' 
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'employer'
  )
);

-- Allow authenticated users to view project attachments
CREATE POLICY "Authenticated users can view project attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-attachments' 
  AND auth.role() = 'authenticated'
);

-- Allow employers to delete their own project attachments
CREATE POLICY "Employers can delete their project attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-attachments' 
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'employer'
  )
);