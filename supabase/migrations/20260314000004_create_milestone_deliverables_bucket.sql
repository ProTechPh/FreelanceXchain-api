-- Create milestone-deliverables storage bucket for file attachments
-- This bucket will store all deliverable files uploaded by freelancers

-- Create the bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'milestone-deliverables',
  'milestone-deliverables', 
  false, -- Private bucket, files accessed via signed URLs
  26214400, -- 25MB limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'text/html',
    'text/css',
    'text/javascript',
    'application/json',
    'text/xml',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for the milestone-deliverables bucket

-- Policy: Users can upload files to their own folders
CREATE POLICY "Users can upload milestone deliverables" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'milestone-deliverables' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can view files in milestones they're involved in
-- This allows both freelancers and employers to access milestone files
CREATE POLICY "Users can view milestone deliverables" ON storage.objects
FOR SELECT USING (
  bucket_id = 'milestone-deliverables' 
  AND (
    -- File owner can always access
    auth.uid()::text = (storage.foldername(name))[1]
    OR
    -- Contract parties can access files (freelancer or employer)
    EXISTS (
      SELECT 1 FROM contracts c
      WHERE (c.freelancer_id = auth.uid() OR c.employer_id = auth.uid())
      AND (storage.foldername(name))[2] LIKE 'milestone-%'
    )
  )
);

-- Policy: Users can delete their own uploaded files
CREATE POLICY "Users can delete their milestone deliverables" ON storage.objects
FOR DELETE USING (
  bucket_id = 'milestone-deliverables' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);