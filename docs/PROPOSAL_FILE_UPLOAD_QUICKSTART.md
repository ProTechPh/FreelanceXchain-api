# Proposal File Upload - Quick Start Guide

## For Backend Developers

### What Changed
- Proposals now use **file attachments** instead of text cover letters
- Clients must upload files to Supabase Storage first, then submit file metadata
- API validates file metadata (URLs, types, sizes, count)

### API Request Format
```typescript
POST /api/proposals
{
  "projectId": "uuid",
  "attachments": [
    {
      "url": "https://<project>.supabase.co/storage/v1/object/public/proposal-attachments/file.pdf",
      "filename": "proposal.pdf",
      "size": 1048576,
      "mimeType": "application/pdf"
    }
  ],
  "proposedRate": 5000,
  "estimatedDuration": 30
}
```

### File Requirements
- **Count**: 1-5 files required
- **Types**: PDF, DOCX, DOC, TXT, PNG, JPG, JPEG, GIF
- **Size**: 10MB per file, 25MB total
- **URL**: Must be from Supabase Storage

### Deployment Steps
1. Run migration: `supabase/migrations/20260218000000_add_proposal_attachments.sql`
2. Create Supabase Storage bucket: `proposal-attachments` (private)
3. Set environment variable: `SUPABASE_PROPOSAL_ATTACHMENTS_BUCKET=proposal-attachments`
4. Configure bucket RLS policies (see docs/PROPOSAL_FILE_UPLOADS.md)

---

## For Frontend Developers

### Upload Flow
1. **User selects files** (1-5 files, allowed types only)
2. **Upload to Supabase Storage**
   ```typescript
   const { data, error } = await supabase.storage
     .from('proposal-attachments')
     .upload(`${userId}/${Date.now()}.${ext}`, file);
   ```
3. **Get file URL**
   ```typescript
   const { data: { publicUrl } } = supabase.storage
     .from('proposal-attachments')
     .getPublicUrl(fileName);
   ```
4. **Submit proposal with file metadata**
   ```typescript
   const attachments = files.map(file => ({
     url: publicUrl,
     filename: file.name,
     size: file.size,
     mimeType: file.type,
   }));
   
   await fetch('/api/proposals', {
     method: 'POST',
     body: JSON.stringify({ projectId, attachments, proposedRate, estimatedDuration }),
   });
   ```

### Client-Side Validation
```typescript
// Validate before upload
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/gif',
];

function validateFiles(files: File[]): string[] {
  const errors: string[] = [];
  
  if (files.length < 1 || files.length > 5) {
    errors.push('Please select 1-5 files');
  }
  
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    errors.push('Total file size exceeds 25MB');
  }
  
  files.forEach(file => {
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.name} exceeds 10MB`);
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      errors.push(`${file.name} has invalid type`);
    }
  });
  
  return errors;
}
```

### Error Handling
```typescript
try {
  const response = await fetch('/api/proposals', { ... });
  const data = await response.json();
  
  if (!response.ok) {
    // Handle validation errors
    if (data.error.code === 'VALIDATION_ERROR') {
      console.error('Validation errors:', data.error.details);
      // Display errors to user
    }
  }
} catch (error) {
  console.error('Upload failed:', error);
}
```

### UI Components Needed
- File upload dropzone (drag & drop support)
- File list with preview (thumbnails for images, icons for documents)
- Progress indicators for uploads
- File size/type validation feedback
- Remove file button
- Total size indicator

---

## For QA/Testing

### Test Cases

#### Valid Submissions
- [ ] Submit with 1 PDF file
- [ ] Submit with 5 mixed files (PDF + images)
- [ ] Submit with maximum allowed sizes (10MB per file)
- [ ] Submit with all allowed file types

#### Validation Errors
- [ ] Submit with 0 files → "At least 1 file is required"
- [ ] Submit with 6 files → "Maximum 5 files allowed"
- [ ] Submit with file > 10MB → "File size exceeds 10MB limit"
- [ ] Submit with total > 25MB → "Total file size exceeds 25MB limit"
- [ ] Submit with invalid file type → "File type not allowed"
- [ ] Submit with external URL → "File URL must be from Supabase Storage"
- [ ] Submit with non-HTTPS URL → "File URL must use HTTPS protocol"

#### Edge Cases
- [ ] Submit with special characters in filename
- [ ] Submit with very long filename
- [ ] Submit with duplicate filenames
- [ ] Submit immediately after upload (race condition)
- [ ] Submit with deleted file URL (404)

#### Backward Compatibility
- [ ] View existing proposals with text cover letters
- [ ] Ensure old proposals still display correctly

### API Testing with cURL
```bash
# Valid request
curl -X POST http://localhost:3000/api/proposals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "projectId": "uuid-here",
    "attachments": [{
      "url": "https://project.supabase.co/storage/v1/object/public/proposal-attachments/test.pdf",
      "filename": "proposal.pdf",
      "size": 1048576,
      "mimeType": "application/pdf"
    }],
    "proposedRate": 5000,
    "estimatedDuration": 30
  }'

# Invalid request (no attachments)
curl -X POST http://localhost:3000/api/proposals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "projectId": "uuid-here",
    "attachments": [],
    "proposedRate": 5000,
    "estimatedDuration": 30
  }'
```

---

## Troubleshooting

### "File URL must be from Supabase Storage domain"
- Ensure files are uploaded to Supabase Storage first
- Check that the URL includes your project reference
- Verify URL format: `https://<project-ref>.supabase.co/storage/...`

### "Storage bucket not found"
- Create the bucket in Supabase Dashboard
- Verify bucket name matches configuration
- Check bucket is accessible to authenticated users

### "Permission denied" when uploading
- Check Supabase Storage RLS policies
- Ensure user is authenticated
- Verify bucket permissions allow uploads

### Files upload but proposal submission fails
- Check file metadata is correct (URL, filename, size, mimeType)
- Verify all required fields are present
- Check file URLs are accessible
- Ensure total size doesn't exceed limits

---

## Documentation Links

- **Full Documentation**: `docs/PROPOSAL_FILE_UPLOADS.md`
- **Implementation Details**: `docs/PROPOSAL_FILE_UPLOAD_IMPLEMENTATION.md`
- **API Reference**: Swagger UI at `/api-docs`
- **Database Migration**: `supabase/migrations/20260218000000_add_proposal_attachments.sql`
- **Validation Utility**: `src/utils/file-validator.ts`
