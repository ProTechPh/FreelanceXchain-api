/**
 * File Upload Middleware
 * Handles multipart/form-data file uploads with security validation
 * Requirements: IAS Checklist - File upload validation (type + size)
 */

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fileType from 'file-type';
import { logger } from '../config/logger.js';

// File size limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
export const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB total

// File count limits
export const MIN_FILE_COUNT = 1;
export const MAX_FILE_COUNT = 5;

// Allowed MIME types with their magic number signatures
export const ALLOWED_MIME_TYPES = {
  // Documents
  'application/pdf': true,
  'application/msword': true,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
  'text/plain': true,
  // Images
  'image/png': true,
  'image/jpeg': true,
  'image/jpg': true,
  'image/gif': true,
} as const;

// Allowed file extensions
const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
];

/**
 * Sanitize filename to prevent path traversal and special character issues
 */
export function sanitizeFilename(filename: string): string {
  // Remove path components
  const basename = filename.replace(/^.*[\\\/]/, '');
  
  // Remove or replace dangerous characters
  // Keep alphanumeric, dots, hyphens, underscores
  const sanitized = basename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.') // Replace multiple dots with single dot
    .replace(/^\.+/, '') // Remove leading dots
    .substring(0, 255); // Limit length
  
  return sanitized || 'unnamed_file';
}

/**
 * Validate file extension
 */
function hasValidExtension(filename: string): boolean {
  const lowerFilename = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some(ext => lowerFilename.endsWith(ext));
}

/**
 * Validate file MIME type using magic number detection
 */
async function validateFileMimeType(buffer: Buffer, filename: string): Promise<{ valid: boolean; detectedType?: string; error?: string }> {
  try {
    // Special handling for text files (no magic number)
    if (filename.toLowerCase().endsWith('.txt')) {
      // Check if buffer contains mostly text characters
      const isText = buffer.slice(0, 1024).every(byte => 
        (byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13
      );
      if (isText) {
        return { valid: true, detectedType: 'text/plain' };
      }
    }

    // Use file-type for magic number detection
    const detectedType = await fileType.fromBuffer(buffer);
    
    if (!detectedType) {
      // If no magic number detected, might be a text file or unsupported format
      return { valid: false, error: 'Could not detect file type' };
    }

    // Check if detected MIME type is allowed
    if (!(detectedType.mime in ALLOWED_MIME_TYPES)) {
      return { 
        valid: false, 
        detectedType: detectedType.mime,
        error: `File type ${detectedType.mime} is not allowed` 
      };
    }

    return { valid: true, detectedType: detectedType.mime };
  } catch (error) {
    logger.error('Error validating file MIME type', { error, filename });
    return { valid: false, error: 'Failed to validate file type' };
  }
}

/**
 * Configure multer for memory storage
 */
const storage = multer.memoryStorage();

/**
 * Multer file filter - first line of defense (extension-based)
 */
const fileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  // Check file extension
  if (!hasValidExtension(file.originalname)) {
    const error = new Error(`File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`);
    (error as any).code = 'INVALID_FILE_TYPE';
    return cb(error);
  }
  
  cb(null, true);
};

/**
 * Create multer upload instance
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILE_COUNT,
  },
});

/**
 * Middleware to handle file uploads with validation
 * @param fieldName - The name of the form field containing files
 * @param options - Upload options
 */
export function createFileUploadMiddleware(
  fieldName: string = 'files',
  options: {
    minFiles?: number;
    maxFiles?: number;
    validateMagicNumbers?: boolean;
  } = {}
) {
  const {
    minFiles = MIN_FILE_COUNT,
    maxFiles = MAX_FILE_COUNT,
    validateMagicNumbers = true,
  } = options;

  return [
    // First, use multer to parse multipart/form-data
    upload.array(fieldName, maxFiles),
    
    // Then, perform additional validation
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const files = req.files as Express.Multer.File[] | undefined;

        // Check if files were uploaded
        if (!files || files.length === 0) {
          res.status(400).json({
            error: {
              code: 'NO_FILES_UPLOADED',
              message: `At least ${minFiles} file(s) required`,
            },
          });
          return;
        }

        // Check minimum file count
        if (files.length < minFiles) {
          res.status(400).json({
            error: {
              code: 'INSUFFICIENT_FILES',
              message: `At least ${minFiles} file(s) required, received ${files.length}`,
            },
          });
          return;
        }

        // Check maximum file count
        if (files.length > maxFiles) {
          res.status(400).json({
            error: {
              code: 'TOO_MANY_FILES',
              message: `Maximum ${maxFiles} file(s) allowed, received ${files.length}`,
            },
          });
          return;
        }

        // Calculate total size
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        if (totalSize > MAX_TOTAL_SIZE) {
          res.status(400).json({
            error: {
              code: 'TOTAL_SIZE_EXCEEDED',
              message: `Total file size exceeds ${MAX_TOTAL_SIZE / (1024 * 1024)}MB limit`,
            },
          });
          return;
        }

        // Validate each file using magic numbers
        if (validateMagicNumbers) {
          for (const file of files) {
            const validation = await validateFileMimeType(file.buffer, file.originalname);
            
            if (!validation.valid) {
              logger.warn('File upload rejected - invalid MIME type', {
                filename: file.originalname,
                detectedType: validation.detectedType,
                error: validation.error,
              });
              
              res.status(400).json({
                error: {
                  code: 'INVALID_FILE_TYPE',
                  message: validation.error || 'Invalid file type detected',
                  details: {
                    filename: file.originalname,
                    detectedType: validation.detectedType,
                  },
                },
              });
              return;
            }

            // Store detected MIME type for later use
            (file as any).detectedMimeType = validation.detectedType;
          }
        }

        // Sanitize filenames
        files.forEach(file => {
          file.originalname = sanitizeFilename(file.originalname);
        });

        // Log successful upload
        logger.info('Files uploaded successfully', {
          count: files.length,
          totalSize,
          filenames: files.map(f => f.originalname),
        });

        next();
      } catch (error: any) {
        // Handle multer errors
        if (error.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            error: {
              code: 'FILE_TOO_LARGE',
              message: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
            },
          });
          return;
        }

        if (error.code === 'LIMIT_FILE_COUNT') {
          res.status(400).json({
            error: {
              code: 'TOO_MANY_FILES',
              message: `Maximum ${maxFiles} files allowed`,
            },
          });
          return;
        }

        if (error.code === 'INVALID_FILE_TYPE') {
          res.status(400).json({
            error: {
              code: 'INVALID_FILE_TYPE',
              message: error.message,
            },
          });
          return;
        }

        // Log unexpected errors
        logger.error('File upload error', { error: error.message, stack: error.stack });

        res.status(500).json({
          error: {
            code: 'FILE_UPLOAD_ERROR',
            message: 'An error occurred during file upload',
          },
        });
      }
    },
  ];
}

/**
 * Middleware for proposal attachments (1-5 files)
 */
export const uploadProposalAttachments = createFileUploadMiddleware('files', {
  minFiles: 1,
  maxFiles: 5,
  validateMagicNumbers: true,
});

/**
 * Middleware for dispute evidence (1-10 files, more lenient for evidence)
 */
export const uploadDisputeEvidence = createFileUploadMiddleware('files', {
  minFiles: 1,
  maxFiles: 10,
  validateMagicNumbers: true,
});

/**
 * Placeholder for future antivirus scanning integration
 * TODO: Integrate with antivirus service (e.g., ClamAV, VirusTotal API)
 */
export async function scanFileForViruses(buffer: Buffer, filename: string): Promise<{ clean: boolean; threat?: string }> {
  // Placeholder implementation
  // In production, this should call an antivirus service
  logger.debug('Antivirus scan placeholder', { filename, size: buffer.length });
  
  // For now, always return clean
  // TODO: Implement actual virus scanning
  return { clean: true };
}
