/**
 * Appwrite Storage Uploader Utility
 * Handles uploading validated files to Appwrite Storage
 * Requirements: IAS Checklist - File upload validation
 */

import { v4 as uuidv4 } from 'uuid';
import { ID } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { storage, BUCKETS, type BucketId } from '../config/appwrite.js';
import { logger } from '../config/logger.js';
import { sanitizeFilename } from '../middleware/file-upload-middleware.js';

export type FileMetadata = {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  fileId?: string; // Appwrite file ID for deletion
};

export type UploadResult = {
  success: boolean;
  metadata?: FileMetadata;
  url?: string;
  path?: string;
  error?: string;
};

/**
 * Generate a unique filename with UUID prefix
 * Format: {uuid}_{sanitized_original_name}
 */
function generateUniqueFilename(originalFilename: string): string {
  const sanitized = sanitizeFilename(originalFilename);
  const uuid = uuidv4();
  
  // Extract extension
  const lastDotIndex = sanitized.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return `${uuid}_${sanitized}`;
  }
  
  const name = sanitized.substring(0, lastDotIndex);
  const ext = sanitized.substring(lastDotIndex);
  
  return `${uuid}_${name}${ext}`;
}

/**
 * Upload a file buffer to Appwrite Storage
 * @param buffer - File buffer from multer
 * @param originalFilename - Original filename
 * @param mimeType - MIME type of the file
 * @param bucket - Storage bucket ID
 * @param folder - Optional folder path within bucket (not used in Appwrite, kept for compatibility)
 * @returns Upload result with file metadata or error
 */
export async function uploadFileToStorage(
  buffer: Buffer,
  originalFilename: string,
  mimeType: string,
  bucket: BucketId = BUCKETS.PROPOSAL_ATTACHMENTS,
  _folder?: string
): Promise<UploadResult> {
  try {
    // Generate unique filename
    const uniqueFilename = generateUniqueFilename(originalFilename);
    
    // Create InputFile from buffer
    const inputFile = InputFile.fromBuffer(buffer, uniqueFilename);
    
    // Upload to Appwrite Storage
    const file = await storage.createFile(
      bucket,
      ID.unique(),
      inputFile,
      ['read("any")'] // Public read access
    );
    
    // Get file view URL (public URL)
    const url = `${process.env.APPWRITE_ENDPOINT}/storage/buckets/${bucket}/files/${file.$id}/view?project=${process.env.APPWRITE_PROJECT_ID}`;
    
    // Construct file metadata
    const metadata: FileMetadata = {
      url,
      filename: originalFilename, // Keep original filename for display
      size: buffer.length,
      mimeType,
      fileId: file.$id, // Store Appwrite file ID for deletion
    };
    
    logger.info('File uploaded successfully to Appwrite Storage', {
      filename: originalFilename,
      uniqueFilename,
      bucket,
      fileId: file.$id,
      size: buffer.length,
      url,
    });
    
    return {
      success: true,
      metadata,
    };
  } catch (error: any) {
    logger.error('Unexpected error during file upload', {
      error: error.message,
      stack: error.stack,
      filename: originalFilename,
      bucket,
    });
    
    return {
      success: false,
      error: `An unexpected error occurred during file upload: ${error.message}`,
    };
  }
}

/**
 * Upload multiple files to Appwrite Storage
 * @param files - Array of multer files
 * @param bucket - Storage bucket ID
 * @param folder - Optional folder path within bucket (not used in Appwrite, kept for compatibility)
 * @returns Array of upload results
 */
export async function uploadMultipleFiles(
  files: Express.Multer.File[],
  bucket: BucketId = BUCKETS.PROPOSAL_ATTACHMENTS,
  folder?: string
): Promise<UploadResult[]> {
  const uploadPromises = files.map(file => {
    // Use detected MIME type from magic number validation if available
    const mimeType = (file as any).detectedMimeType || file.mimetype;
    
    return uploadFileToStorage(
      file.buffer,
      file.originalname,
      mimeType,
      bucket,
      folder
    );
  });
  
  return Promise.all(uploadPromises);
}

/**
 * Delete a file from Appwrite Storage
 * @param fileId - Appwrite file ID
 * @param bucket - Storage bucket ID
 * @returns Success status
 */
export async function deleteFileFromStorage(
  fileId: string,
  bucket: BucketId = BUCKETS.PROPOSAL_ATTACHMENTS
): Promise<{ success: boolean; error?: string }> {
  try {
    await storage.deleteFile(bucket, fileId);
    
    logger.info('File deleted successfully from Appwrite Storage', {
      fileId,
      bucket,
    });
    
    return { success: true };
  } catch (error: any) {
    logger.error('Unexpected error during file deletion', {
      error: error.message,
      stack: error.stack,
      fileId,
      bucket,
    });
    
    return {
      success: false,
      error: `An unexpected error occurred during file deletion: ${error.message}`,
    };
  }
}

/**
 * Extract file ID from Appwrite Storage URL
 * @param url - Full Appwrite Storage URL
 * @returns File ID or null if invalid URL
 */
export function extractFileIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    
    // Appwrite storage URLs follow pattern: https://{endpoint}/storage/buckets/{bucket}/files/{fileId}/view?project=${process.env.APPWRITE_PROJECT_ID}
    const pathMatch = urlObj.pathname.match(/\/storage\/buckets\/[^/]+\/files\/([^/]+)/);
    
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }
    
    return null;
  } catch {
    logger.warn('Failed to extract file ID from URL', { url });
    return null;
  }
}

/**
 * Cleanup uploaded files in case of transaction failure
 * @param fileMetadata - Array of file metadata to cleanup
 * @param bucket - Storage bucket ID
 */
export async function cleanupUploadedFiles(
  fileMetadata: FileMetadata[],
  bucket: BucketId = BUCKETS.PROPOSAL_ATTACHMENTS
): Promise<void> {
  const deletePromises = fileMetadata.map(metadata => {
    // Try to get fileId from metadata first, then extract from URL
    const fileId = metadata.fileId || extractFileIdFromUrl(metadata.url);
    if (fileId) {
      return deleteFileFromStorage(fileId, bucket);
    }
    return Promise.resolve({ success: false, error: 'Invalid file ID or URL' });
  });
  
  const results = await Promise.all(deletePromises);
  
  const failedDeletions = results.filter(r => !r.success);
  if (failedDeletions.length > 0) {
    logger.warn('Some files could not be cleaned up', {
      failedCount: failedDeletions.length,
      totalCount: fileMetadata.length,
    });
  }
}

/**
 * Alias for extractFileIdFromUrl for backward compatibility
 */
export const extractFilePathFromUrl = extractFileIdFromUrl;

/**
 * Compatibility wrapper for legacy uploadFile calls
 */
export async function uploadFile(options: {
  bucket: BucketId;
  userId: string;
  file: Buffer;
  filename: string;
  mimetype?: string;
  folder?: string;
}): Promise<UploadResult> {
  const result = await uploadFileToStorage(
    options.file,
    options.filename,
    options.mimetype || 'application/octet-stream',
    options.bucket,
    options.folder
  );

  const finalResult: UploadResult = {
    success: result.success,
  };

  if (result.metadata?.url) finalResult.url = result.metadata.url;
  if (result.metadata?.fileId) finalResult.path = result.metadata.fileId;
  if (result.error) finalResult.error = result.error;

  return finalResult;
}

/**
 * Compatibility wrapper for legacy deleteFile calls
 */
export async function deleteFile(bucket: BucketId, path: string): Promise<{ success: boolean; error?: string }> {
  return deleteFileFromStorage(path, bucket);
}

/**
 * Compatibility wrapper for legacy getSignedUrl calls
 */
export async function getSignedUrl(bucket: BucketId, path: string): Promise<UploadResult> {
  // Appwrite doesn't have "signed URLs" in the same way Appwrite does for public view
  const url = `${process.env.APPWRITE_ENDPOINT}/storage/buckets/${bucket}/files/${path}/view?project=${process.env.APPWRITE_PROJECT_ID}`;
  return {
    success: true,
    url,
  };
}

/**
 * Compatibility wrapper for legacy listUserFiles calls
 */
export async function listUserFiles(bucket: BucketId, userId: string): Promise<{ success: boolean; files: any[]; error?: string }> {
  try {
    const result = await storage.listFiles(bucket);
    // Filter by userId in filename prefix
    const userFiles = result.files.filter(f => f.name.includes(userId));
    return {
      success: true,
      files: userFiles,
    };
  } catch (error: any) {
    return {
      success: false,
      files: [],
      error: error.message,
    };
  }
}
