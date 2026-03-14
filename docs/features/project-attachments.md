# Project Attachments Feature

## Overview
Employers can now attach reference files (images, documents) when creating projects to help freelancers better understand the project requirements.

## API Endpoints

### Create Project with Attachments
```
POST /api/projects/with-attachments
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

**Form Fields:**
- `title` (string, required): Project title (min 5 characters)
- `description` (string, required): Project description (min 20 characters)  
- `requiredSkills` (JSON string, required): Array of skill objects with skillId
- `budget` (number, required): Project budget (> 0)
- `deadline` (string, required): Project deadline (ISO date)
- `tags` (JSON string, optional): Array of project tags (max 10)
- `files` (files, optional): Reference files/images (max 10 files, 10MB each)

**Example:**
```javascript
const formData = new FormData();
formData.append('title', 'E-commerce Website Development');
formData.append('description', 'Need a modern e-commerce website with payment integration...');
formData.append('requiredSkills', JSON.stringify([{skillId: 'uuid-here'}]));
formData.append('budget', '5000');
formData.append('deadline', '2026-06-01T00:00:00Z');
formData.append('tags', JSON.stringify(['react', 'ecommerce', 'payment']));
formData.append('files', imageFile1);
formData.append('files', documentFile2);
```

## File Restrictions
- **File Types**: PDF, DOC, DOCX, TXT, PNG, JPG, JPEG, GIF
- **File Size**: Max 10MB per file
- **File Count**: Max 10 files per project
- **Storage**: Files stored in Supabase Storage with RLS policies

## Database Changes
- Added `attachments` JSONB column to `projects` table
- Created `project-attachments` storage bucket
- Added RLS policies for secure file access

## Benefits for Freelancers
- Visual references help understand project scope
- Design mockups and wireframes provide clear direction
- Sample documents show expected quality and style
- Reduces back-and-forth communication during proposal phase