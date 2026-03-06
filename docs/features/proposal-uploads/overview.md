# Proposal File Uploads

## Overview

Proposals now support file attachments instead of text-based cover letters. Freelancers can upload 1-5 files (documents and images) when submitting a proposal.

## Architecture

The implementation supports **two upload patterns**:

### 1. Server-Side Upload (Recommended - New)
1. Client sends files via `multipart/form-data` to API
2. API validates files using multer middleware (extension, magic numbers, size)
3. API uploads validated files to Supabase Storage
4. API stores file metadata in database
5. API returns proposal with file URLs

**Benefits:**
- Defense-in-depth security with multiple validation layers
- Magic number validation prevents MIME type spoofing
- Filename sanitization prevents path traversal attacks
- Rate limiting prevents abuse
- Centralized file validation logic

### 2. URL Reference Pattern (Legacy - Backward Compatible)
1. Client uploads files directly to Supabase Storage
2. Client receives file URLs from Supabase
3. Client submits proposal with file metadata (URLs, filenames, sizes, MIME types)
4. API validates file metadata and stores references in the database

**Benefits:**
- Reduces server load (no file processing on API server)
- Leverages Supabase Storage's built-in features (CDN, access control)
- Simpler client implementation for existing integrations

## File Requirements

### Allowed File Types

**Documents:**
- PDF (`.pdf`)
- Microsoft Word (`.doc`, `.docx`)
- Plain Text (`.txt`)

**Images:**
- PNG (`.png`)
- JPEG (`.jpg`, `.jpeg`)
- GIF (`.gif`)

### File Size Limits

- **Per file:** 10MB maximum
- **Total per proposal:** 25MB maximum
- **File count:** 1-5 files required

### Security Validations

**Server-Side Upload (Multer):**
1. Extension validation (first line of defense)
2. Magic number validation (file signature detection)
3. Size validation (per file and total)
4. Count validation (1-5 files)
5. Filename sanitization (removes special characters, prevents path traversal)
6. Rate limiting (20 uploads per hour per user)

**URL Reference Pattern:**
1. URL domain validation (must be from Supabase Storage)
2. MIME type whitelist validation
3. Extension validation
4. Size validation (metadata-based)
5. Count validation (1-5 files)

## Database Schema

### Proposals Table

```sql
CREATE TABLE proposals (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  freelancer_id UUID REFERENCES users(id),
  cover_letter TEXT,  -- Legacy field (nullable)
  attachments JSONB DEFAULT '[]'::jsonb,  -- New field
  proposed_rate DECIMAL(10, 2),
  estimated_duration INTEGER,
  status VARCHAR(20),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### Attachments Structure

The `attachments` column stores a JSON array of file metadata:

```json
[
  {
    "url": "https://<project-ref>.supabase.co/storage/v1/object/public/proposal-attachments/...",
    "filename": "proposal.pdf",
    "size": 1048576,
    "mimeType": "application/pdf"
  }
]
```

## Supabase Storage Setup

### 1. Create Storage Bucket

In Supabase Dashboard:
1. Navigate to **Storage** section
2. Click **New bucket**
3. Bucket name: `proposal-attachments`
4. Set to **Private** (authenticated access only)
5. Click **Create bucket**

### 2. Configure Bucket Policies

Set up Row Level Security (RLS) policies for the bucket:

```sql
-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload proposal attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'proposal-attachments');

-- Allow users to read their own uploaded files
CREATE POLICY "Users can read their own proposal attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'proposal-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow employers to read attachments for proposals on their projects
-- (This requires additional logic - implement based on your access control needs)
```

### 3. Environment Configuration

Add to `.env`:

```env
SUPABASE_PROPOSAL_ATTACHMENTS_BUCKET=proposal-attachments
```

## API Usage

### Option 1: Server-Side Upload (Recommended)

**Endpoint:** `POST /api/proposals`

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `projectId` (string, required): Project UUID
- `proposedRate` (number, required): Proposed rate
- `estimatedDuration` (number, required): Duration in days
- `files` (file array, required): 1-5 files

**Example using fetch:**

```javascript
async function submitProposalWithFiles(files, proposalData, token) {
  const formData = new FormData();
  
  // Add form fields
  formData.append('projectId', proposalData.projectId);
  formData.append('proposedRate', proposalData.proposedRate);
  formData.append('estimatedDuration', proposalData.estimatedDuration);
  
  // Add files
  files.forEach(file => {
    formData.append('files', file);
  });
  
  const response = await fetch('/api/proposals', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      // Don't set Content-Type - browser will set it with boundary
    },
    body: formData,
  });
  
  return response.json();
}
```

**Response:** `201 Created`

```json
{
  "id": "uuid",
  "projectId": "uuid",
  "freelancerId": "uuid",
  "coverLetter": null,
  "attachments": [
    {
      "url": "https://<project>.supabase.co/storage/v1/object/public/proposal-attachments/user-id/uuid_proposal.pdf",
      "filename": "proposal.pdf",
      "size": 1048576,
      "mimeType": "application/pdf"
    }
  ],
  "proposedRate": 5000,
  "estimatedDuration": 30,
  "status": "pending",
  "createdAt": "2026-02-18T...",
  "updatedAt": "2026-02-18T..."
}
```

### Option 2: URL Reference Pattern (Legacy)

**Endpoint:** `POST /api/proposals`

**Content-Type:** `application/json`

**Request Body:**

```json
{
  "projectId": "uuid-here",
  "attachments": [
    {
      "url": "https://<project-ref>.supabase.co/storage/v1/object/public/proposal-attachments/user-id/file.pdf",
      "filename": "proposal.pdf",
      "size": 1048576,
      "mimeType": "application/pdf"
    }
  ],
  "proposedRate": 5000,
  "estimatedDuration": 30
}
```

**Response:** Same as Option 1

## Client Implementation Guide

### Option 1: Server-Side Upload (Recommended)

**HTML Form Example:**

```html
<form id="proposalForm" enctype="multipart/form-data">
  <input type="file" name="files" multiple accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif" required>
  <input type="number" name="proposedRate" required>
  <input type="number" name="estimatedDuration" required>
  <button type="submit">Submit Proposal</button>
</form>

<script>
document.getElementById('proposalForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  formData.append('projectId', projectId); // Add project ID
  
  const response = await fetch('/api/proposals', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });
  
  const result = await response.json();
  console.log('Proposal submitted:', result);
});
</script>
```

**React Example:**

```typescript
import { useState } from 'react';

function ProposalForm({ projectId, token }) {
  const [files, setFiles] = useState<File[]>([]);
  const [proposedRate, setProposedRate] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('projectId', projectId);
    formData.append('proposedRate', proposedRate);
    formData.append('estimatedDuration', estimatedDuration);
    
    files.forEach(file => {
      formData.append('files', file);
    });
    
    const response = await fetch('/api/proposals', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    const result = await response.json();
    console.log('Proposal submitted:', result);
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif"
        onChange={(e) => setFiles(Array.from(e.target.files || []))}
        required
      />
      <input
        type="number"
        value={proposedRate}
        onChange={(e) => setProposedRate(e.target.value)}
        placeholder="Proposed Rate"
        required
      />
      <input
        type="number"
        value={estimatedDuration}
        onChange={(e) => setEstimatedDuration(e.target.value)}
        placeholder="Duration (days)"
        required
      />
      <button type="submit">Submit Proposal</button>
    </form>
  );
}
```

### Option 2: URL Reference Pattern (Legacy)

**1. Upload Files to Supabase Storage**

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function uploadProposalFile(file: File, userId: string) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${Date.now()}.${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from('proposal-attachments')
    .upload(fileName, file);
  
  if (error) throw error;
  
  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('proposal-attachments')
    .getPublicUrl(fileName);
  
  return {
    url: publicUrl,
    filename: file.name,
    size: file.size,
    mimeType: file.type,
  };
}
```

### 2. Submit Proposal with File Metadata

```typescript
async function submitProposal(files: File[], proposalData: any) {
  // Upload all files
  const attachments = await Promise.all(
    files.map(file => uploadProposalFile(file, userId))
  );
  
  // Submit proposal with file metadata
  const response = await fetch('/api/proposals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...proposalData,
      attachments,
    }),
  });
  
  return response.json();
}
```

## Validation

The API validates:

1. **File count:** 1-5 files required
2. **File size:** Each file ≤ 10MB, total ≤ 25MB
3. **File types:** Only allowed MIME types and extensions
4. **URL format:** Must be valid HTTPS URLs
5. **URL domain:** Must be from Supabase Storage domain
6. **URL path:** Must include `/storage/` path segment

Validation errors return `400 Bad Request` with detailed error messages.

## Security Considerations

### URL Validation

- Only Supabase Storage URLs are accepted
- Prevents external URL injection attacks
- Validates HTTPS protocol

### File Type Validation

- MIME type whitelist prevents malicious file uploads
- Extension validation provides additional security layer
- Size limits prevent storage abuse

### Access Control

- Storage bucket should be private (authenticated access only)
- Implement RLS policies to control who can read/write files
- Consider implementing file ownership checks

### Recommendations

1. **Virus Scanning:** Consider integrating virus scanning for uploaded files
2. **File Cleanup:** Implement cleanup for orphaned files (proposals that are deleted/rejected)
3. **Rate Limiting:** Add rate limits to prevent abuse
4. **Quota Management:** Track storage usage per user
5. **Audit Logging:** Log file uploads and access for security auditing

## Migration from Cover Letter

### Backward Compatibility

The `cover_letter` field remains in the database but is nullable. Existing proposals with text cover letters will continue to work.

### Data Migration (Optional)

If you want to convert existing text cover letters to files:

```sql
-- This is optional and can be done gradually
-- Example: Mark old proposals for manual review
UPDATE proposals
SET cover_letter = NULL
WHERE attachments = '[]'::jsonb
  AND cover_letter IS NOT NULL
  AND created_at < '2026-02-18';
```

## Testing

### Unit Tests

Test file validation logic:

```typescript
import { validateAttachments } from '../utils/file-validator';

describe('File Validation', () => {
  it('should accept valid attachments', () => {
    const attachments = [{
      url: 'https://project.supabase.co/storage/v1/object/public/proposal-attachments/file.pdf',
      filename: 'proposal.pdf',
      size: 1000000,
      mimeType: 'application/pdf',
    }];
    
    const errors = validateAttachments(attachments);
    expect(errors).toHaveLength(0);
  });
  
  it('should reject too many files', () => {
    const attachments = Array(6).fill({
      url: 'https://project.supabase.co/storage/v1/object/public/proposal-attachments/file.pdf',
      filename: 'file.pdf',
      size: 1000,
      mimeType: 'application/pdf',
    });
    
    const errors = validateAttachments(attachments);
    expect(errors.some(e => e.message.includes('Maximum'))).toBe(true);
  });
});
```

### Integration Tests

Test the full proposal submission flow with attachments.

## Troubleshooting

### "File URL must be from Supabase Storage domain"

- Ensure files are uploaded to Supabase Storage first
- Check that the URL includes your project reference
- Verify the URL format matches: `https://<project-ref>.supabase.co/storage/...`

### "MIME type not allowed"

- Check that the file type is in the allowed list
- Ensure the MIME type matches the file extension
- Some files may have incorrect MIME types - validate on client side

### "Total file size exceeds limit"

- Check individual file sizes (max 10MB each)
- Calculate total size before submission (max 25MB)
- Consider compressing large files or splitting into multiple proposals

### Storage bucket not found

- Verify the bucket exists in Supabase Dashboard
- Check the bucket name matches the configuration
- Ensure the bucket is accessible to authenticated users

## Future Enhancements

Potential improvements:

1. **Direct Upload API:** Add API endpoint for file uploads (alternative to client-side upload)
2. **File Preview:** Generate thumbnails for images and previews for documents
3. **Version Control:** Track file versions if proposals are updated
4. **Bulk Download:** Allow employers to download all proposal attachments as ZIP
5. **File Conversion:** Convert documents to PDF for consistent viewing
6. **OCR/Text Extraction:** Extract text from documents for search functionality
