/**
 * File validation utilities for proposal attachments
 * Validates file URLs, types, count, and size limits
 */

export type FileAttachment = {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
};

export type FileValidationError = {
  field: string;
  message: string;
};

// Allowed file types for proposal attachments
export const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  // Images
  'image/png',
  'image/jpeg',
  'image/gif',
] as const;

export const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
] as const;

// File size limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
export const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB total per proposal

// File count limits
export const MIN_FILE_COUNT = 0;
export const MAX_FILE_COUNT = 5;

// Project-specific limits
export const MAX_PROJECT_FILES = 10;

export type ValidationOptions = {
  maxFiles?: number;
  minFiles?: number;
  maxTotalSize?: number;
};

/**
 * Validates an array of file attachments
 * @param attachments - Array of file attachment objects
 * @param options - Optional validation parameters
 * @returns Array of validation errors (empty if valid)
 */
export function validateAttachments(attachments: unknown, options?: ValidationOptions): FileValidationError[] {
  const errors: FileValidationError[] = [];
  const maxFiles = options?.maxFiles ?? MAX_FILE_COUNT;
  const minFiles = options?.minFiles ?? MIN_FILE_COUNT;
  const maxTotalSize = options?.maxTotalSize ?? MAX_TOTAL_SIZE;

  // Check if attachments is an array
  if (!Array.isArray(attachments)) {
    errors.push({
      field: 'attachments',
      message: 'Attachments must be an array',
    });
    return errors;
  }

  // Check file count
  if (attachments.length < minFiles) {
    errors.push({
      field: 'attachments',
      message: `At least ${minFiles} file is required`,
    });
  }

  if (attachments.length > maxFiles) {
    errors.push({
      field: 'attachments',
      message: `Maximum ${maxFiles} files allowed`,
    });
  }

  // Validate each attachment
  let totalSize = 0;
  attachments.forEach((attachment, index) => {
    const attachmentErrors = validateSingleAttachment(attachment, index);
    errors.push(...attachmentErrors);

    // Calculate total size if attachment is valid
    if (typeof attachment === 'object' && attachment !== null && 'size' in attachment) {
      totalSize += (attachment as FileAttachment).size;
    }
  });

  // Check total size
  if (totalSize > maxTotalSize) {
    errors.push({
      field: 'attachments',
      message: `Total file size exceeds ${maxTotalSize / (1024 * 1024)}MB limit`,
    });
  }

  return errors;
}

/**
 * Validates a single file attachment object
 * @param attachment - File attachment object
 * @param index - Index in the attachments array
 * @returns Array of validation errors
 */
function validateSingleAttachment(attachment: unknown, index: number): FileValidationError[] {
  const errors: FileValidationError[] = [];
  const field = `attachments[${index}]`;

  // Check if attachment is an object
  if (typeof attachment !== 'object' || attachment === null) {
    errors.push({
      field,
      message: 'Attachment must be an object',
    });
    return errors;
  }

  const att = attachment as Record<string, unknown>;

  // Validate required fields
  if (!att.url || typeof att.url !== 'string') {
    errors.push({
      field: `${field}.url`,
      message: 'URL is required and must be a string',
    });
  } else {
    // Validate URL format and domain
    const urlErrors = validateFileUrl(att.url as string);
    if (urlErrors.length > 0) {
      errors.push({
        field: `${field}.url`,
        message: urlErrors.join(', '),
      });
    }
  }

  if (!att.filename || typeof att.filename !== 'string') {
    errors.push({
      field: `${field}.filename`,
      message: 'Filename is required and must be a string',
    });
  } else {
    // Validate filename extension
    const filename = att.filename as string;
    const hasValidExtension = ALLOWED_EXTENSIONS.some(ext => 
      filename.toLowerCase().endsWith(ext)
    );
    if (!hasValidExtension) {
      errors.push({
        field: `${field}.filename`,
        message: `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
      });
    }
  }

  if (typeof att.size !== 'number' || att.size <= 0) {
    errors.push({
      field: `${field}.size`,
      message: 'Size is required and must be a positive number',
    });
  } else if (att.size > MAX_FILE_SIZE) {
    errors.push({
      field: `${field}.size`,
      message: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
    });
  }

  if (!att.mimeType || typeof att.mimeType !== 'string') {
    errors.push({
      field: `${field}.mimeType`,
      message: 'MIME type is required and must be a string',
    });
  } else {
    // Validate MIME type
    const mimeType = att.mimeType as string;
    if (!ALLOWED_MIME_TYPES.includes(mimeType as any)) {
      errors.push({
        field: `${field}.mimeType`,
        message: `MIME type not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      });
    }
  }

  return errors;
}

/**
 * Validates that a file URL is from Supabase Storage
 * @param url - File URL to validate
 * @returns Array of error messages (empty if valid)
 */
function validateFileUrl(url: string): string[] {
  const errors: string[] = [];

  // Check if URL is valid
  try {
    const parsedUrl = new URL(url);
    
    // Check if URL is HTTPS
    if (parsedUrl.protocol !== 'https:') {
      errors.push('File URL must use HTTPS protocol');
    }

    // Check if URL is from Supabase Storage domain
    // Supabase storage URLs typically follow pattern: https://<project-ref>.supabase.co/storage/v1/object/...
    const hostname = parsedUrl.hostname;
    if (hostname !== 'supabase.co' && !hostname.endsWith('.supabase.co')) {
      errors.push('File URL must be from Supabase Storage domain');
    }

    // Check if URL path includes storage endpoint
    if (!parsedUrl.pathname.includes('/storage/')) {
      errors.push('File URL must be a valid Supabase Storage URL');
    }
  } catch (error) {
    errors.push('Invalid URL format');
  }

  return errors;
}

/**
 * Type guard to check if an object is a valid FileAttachment
 * @param obj - Object to check
 * @returns True if object is a valid FileAttachment
 */
export function isFileAttachment(obj: unknown): obj is FileAttachment {
  if (typeof obj !== 'object' || obj === null) return false;
  
  const att = obj as Record<string, unknown>;
  return (
    typeof att.url === 'string' &&
    typeof att.filename === 'string' &&
    typeof att.size === 'number' &&
    typeof att.mimeType === 'string'
  );
}

/**
 * Check if a file extension is allowed
 * @param filename - Filename to check
 * @returns True if extension is allowed
 */
export function hasValidExtension(filename: string): boolean {
  const lowerFilename = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some(ext => lowerFilename.endsWith(ext));
}

/**
 * Check if a MIME type is allowed
 * @param mimeType - MIME type to check
 * @returns True if MIME type is allowed
 */
export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType as any);
}
