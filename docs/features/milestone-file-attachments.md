# Milestone File Attachments

This feature allows freelancers to upload and submit deliverable files when completing milestones, enabling employers to review the work before approving payments.

## New Endpoints

### 1. Upload Deliverable Files
**POST** `/api/milestones/:id/upload-deliverables`

Upload files for a milestone without submitting it yet. This allows freelancers to upload files incrementally.

**Headers:**
- `Authorization: Bearer <token>` (freelancer role required)
- `Content-Type: multipart/form-data`

**Body:**
- `files`: Array of files (up to 10 files, 25MB each)

**Response:**
```json
{
  "success": true,
  "files": [
    {
      "filename": "project-source.zip",
      "url": "https://storage.url/milestone-deliverables/user123/milestone-456/project-source.zip",
      "size": 2048576,
      "mimeType": "application/zip"
    }
  ],
  "message": "Successfully uploaded 1 file(s)"
}
```

### 2. Submit Milestone with File Upload
**POST** `/api/milestones/:id/submit-with-files`

Upload files and submit the milestone in one request.

**Headers:**
- `Authorization: Bearer <token>` (freelancer role required)
- `Content-Type: multipart/form-data`

**Body:**
- `files`: Array of new files to upload
- `notes`: Optional submission notes
- `existingDeliverables`: JSON string of previously uploaded files

**Response:**
```json
{
  "id": "milestone-456",
  "status": "submitted",
  "submittedAt": "2026-03-14T10:00:00Z",
  "deliverableFiles": [
    {
      "filename": "project-source.zip",
      "url": "https://storage.url/...",
      "size": 2048576,
      "mimeType": "application/zip"
    }
  ],
  "uploadedFiles": 1,
  "totalFiles": 1
}
```

### 3. Submit Milestone (Enhanced)
**POST** `/api/milestones/:id/submit`

Submit milestone with pre-uploaded files or file references.

**Headers:**
- `Authorization: Bearer <token>` (freelancer role required)
- `Content-Type: application/json`

**Body:**
```json
{
  "deliverables": [
    {
      "filename": "project-source.zip",
      "url": "https://storage.url/...",
      "size": 2048576,
      "mimeType": "application/zip"
    }
  ],
  "notes": "Milestone completed as per requirements"
}
```

## Supported File Types

The system supports a wide range of file types for deliverables:

### Documents
- PDF (.pdf)
- Word Documents (.doc, .docx)
- Excel Spreadsheets (.xlsx)
- PowerPoint Presentations (.pptx)
- Text Files (.txt)
- CSV Files (.csv)

### Images
- PNG (.png)
- JPEG (.jpg, .jpeg)
- GIF (.gif)
- WebP (.webp)
- SVG (.svg)

### Archives
- ZIP (.zip)
- RAR (.rar)
- 7-Zip (.7z)

### Code Files
- HTML (.html)
- CSS (.css)
- JavaScript (.js)
- JSON (.json)
- XML (.xml)

### Video (for demos)
- MP4 (.mp4)
- WebM (.webm)
- QuickTime (.mov)

## File Limits

- **Maximum files per upload**: 10 files
- **Maximum file size**: 25MB per file
- **Storage bucket**: `milestone-deliverables`
- **File organization**: Files are stored in folders by milestone ID

## Usage Workflow

### For Freelancers:

1. **Upload files incrementally** (optional):
   ```bash
   POST /api/milestones/123/upload-deliverables
   # Upload work-in-progress files
   ```

2. **Submit milestone with all deliverables**:
   ```bash
   POST /api/milestones/123/submit-with-files
   # Upload final files and submit milestone
   ```

   OR

   ```bash
   POST /api/milestones/123/submit
   # Submit with previously uploaded file references
   ```

### For Employers:

- View submitted milestone with deliverable files
- Download and review files before approving
- Request revisions if needed

## Security Features

- **File type validation**: Only allowed file types can be uploaded
- **Magic number validation**: Files are validated by their actual content, not just extension
- **Malware scanning**: Files are checked for malicious content
- **Size limits**: Prevents abuse with oversized files
- **Rate limiting**: Upload endpoints are rate-limited to prevent spam
- **Authentication**: Only authenticated freelancers can upload to their milestones

## Error Handling

Common error responses:

```json
{
  "error": "No files provided"
}
```

```json
{
  "error": "File size exceeds 25MB limit"
}
```

```json
{
  "error": "Invalid file type. Only documents, images, archives, code files, and videos are allowed."
}
```

```json
{
  "error": "Milestone not found"
}
```

```json
{
  "error": "You are not authorized to submit this milestone"
}
```