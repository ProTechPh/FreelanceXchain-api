/**
 * Supabase Storage Uploader Utility
 * Handles uploading validated files to Supabase Storage
 * Requirements: IAS Checklist - File upload validation
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseServiceClient, STORAGE_BUCKETS, StorageBucketName } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { sanitizeFilename } from '../middleware/file-upload-middleware.js';

export type FileMetadata = {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
};

export type UploadResult = {
  success: boolean;
  metadata?: FileMetadata;
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
 * Upload a file buffer to Supabase Storage
 * @param buffer - File buffer from multer
 * @param originalFilename - Original filename
 * @param mimeType - MIME type of the file
 * @param bucket - Storage bucket name
 * @param folder - Optional folder path within bucket
 * @returns Upload result with file metadata or error
 */
export async function uploadFileToStorage(
  buffer: Buffer,
  originalFilename: string,
  mimeType: string,
  bucket: StorageBucketName = STORAGE_BUCKETS.PROPOSAL_ATTACHMENTS,
  folder?: string
): Promise<UploadResult> {
  try {
    const supabase = getSupabaseServiceClient();
    
    // Generate unique filename
    const uniqueFilename = generateUniqueFilename(originalFilename);
    
    // Construct full path (with folder if provided)
    const filePath = folder ? `${folder}/${uniqueFilename}` : uniqueFilename;
    
    // Upload to Supabase Storage
    const { _data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: false, // Don't overwrite existing files
      });
    
    if (error) {
      logger.error('Supabase Storage upload failed', {
        error: error.message,
        filename: originalFilename,
        bucket,
        filePath,
      });
      
      return {
        success: false,
        error: `Failed to upload file: ${error.message}`,
      };
    }
    
    // Get public URL for the uploaded file
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);
    
    if (!urlData || !urlData.publicUrl) {
      logger.error('Failed to get public URL for uploaded file', {
        filename: originalFilename,
        bucket,
        filePath,
      });
      
      // Cleanup: delete the uploaded file since we can't get its URL
      await supabase.storage.from(bucket).remove([filePath]);
      
      return {
        success: false,
        error: 'Failed to generate file URL',
      };
    }
    
    // Construct file metadata
    const metadata: FileMetadata = {
      url: urlData.publicUrl,
      filename: originalFilename, // Keep original filename for display
      size: buffer.length,
      mimeType,
    };
    
    logger.info('File uploaded successfully to Supabase Storage', {
      filename: originalFilename,
      uniqueFilename,
      bucket,
      size: buffer.length,
      url: urlData.publicUrl,
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
      error: 'An unexpected error occurred during file upload',
    };
  }
}

/**
 * Upload multiple files to Supabase Storage
 * @param files - Array of multer files
 * @param bucket - Storage bucket name
 * @param folder - Optional folder path within bucket
 * @returns Array of upload results
 */
export async function uploadMultipleFiles(
  files: Express.Multer.File[],
  bucket: StorageBucketName = STORAGE_BUCKETS.PROPOSAL_ATTACHMENTS,
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
 * Delete a file from Supabase Storage
 * @param filePath - Full path to the file in storage
 * @param bucket - Storage bucket name
 * @returns Success status
 */
export async function deleteFileFromStorage(
  filePath: string,
  bucket: StorageBucketName = STORAGE_BUCKETS.PROPOSAL_ATTACHMENTS
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabaseServiceClient();
    
    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);
    
    if (error) {
      logger.error('Failed to delete file from Supabase Storage', {
        error: error.message,
        filePath,
        bucket,
      });
      
      return {
        success: false,
        error: `Failed to delete file: ${error.message}`,
      };
    }
    
    logger.info('File deleted successfully from Supabase Storage', {
      filePath,
      bucket,
    });
    
    return { success: true };
  } catch (error: any) {
    logger.error('Unexpected error during file deletion', {
      error: error.message,
      stack: error.stack,
      filePath,
      bucket,
    });
    
    return {
      success: false,
      error: 'An unexpected error occurred during file deletion',
    };
  }
}

/**
 * Extract file path from Supabase Storage URL
 * @param url - Full Supabase Storage URL
 * @returns File path or null if invalid URL
 */
export function extractFilePathFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    
    // Supabase storage URLs follow pattern: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
    const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    
    if (pathMatch && pathMatch[1]) {
      return decodeURIComponent(pathMatch[1]);
    }
    
    return null;
  } catch {
    logger.warn('Failed to extract file path from URL', { url });
    return null;
  }
}

/**
 * Cleanup uploaded files in case of transaction failure
 * @param fileMetadata - Array of file metadata to cleanup
 * @param bucket - Storage bucket name
 */
export async function cleanupUploadedFiles(
  fileMetadata: FileMetadata[],
  bucket: StorageBucketName = STORAGE_BUCKETS.PROPOSAL_ATTACHMENTS
): Promise<void> {
  const deletePromises = fileMetadata.map(metadata => {
    const filePath = extractFilePathFromUrl(metadata.url);
    if (filePath) {
      return deleteFileFromStorage(filePath, bucket);
    }
    return Promise.resolve({ success: false, error: 'Invalid URL' });
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
