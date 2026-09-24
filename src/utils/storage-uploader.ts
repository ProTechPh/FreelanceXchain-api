/**
 * Appwrite Storage Uploader Utility
 * Handles uploading validated files to Appwrite Storage
 * Requirements: IAS Checklist - File upload validation
 */

import { v4 as uuidv4 } from 'uuid';
import { ID, type Models } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { storage, BUCKETS, Query, type BucketId } from '../config/appwrite.js';
import { logger } from '../config/logger.js';
import { sanitizeFilename } from '../middleware/file-upload-middleware.js';

export type FileMetadata = {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  fileId?: string; // Appwrite file ID for deletion
};

type UploadResult = {
  success: boolean;
  metadata?: FileMetadata;
  url?: string;
  path?: string;
  error?: string;
};

type UploadedFile = Express.Multer.File & { detectedMimeType?: string };

/**
 * Generate a unique filename with owner + UUID prefix
 * Format: {userId}_{uuid}_{sanitized_original_name}
 * The userId prefix is the ownership key: list/delete/signed-url verify it to
 * prevent cross-user access (BLF-11.2).
 */
function generateUniqueFilename(originalFilename: string, userId?: string): string {
  const sanitized = sanitizeFilename(originalFilename);
  const uuid = uuidv4();
  const ownerPrefix = userId ? `${userId}_` : '';
  
  const lastDotIndex = sanitized.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return `${ownerPrefix}${uuid}_${sanitized}`;
  }
  
  const name = sanitized.substring(0, lastDotIndex);
  const ext = sanitized.substring(lastDotIndex);
  
  return `${ownerPrefix}${uuid}_${name}${ext}`;
}

export type UploadFileOptions = {
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
  bucket?: BucketId;
  userId?: string;
};

/**
 * Generate a secure file access URL that routes through the proxy endpoint
 * instead of exposing direct Appwrite URLs.
 * @param bucket - Storage bucket ID
 * @param fileId - Appwrite file ID
 * @returns Secure proxy URL for file access
 */
export function getSecureFileUrl(bucket: BucketId, fileId: string): string {
  // Use the API's proxy endpoint for secure file access
  // This ensures authorization checks are performed before serving files
  return `/api/files/access/${bucket}/${fileId}`;
}

/**
 * Check if a URL is a legacy direct Appwrite URL
 * @param url - URL to check
 * @returns True if the URL is a direct Appwrite storage URL
 */
function isLegacyAppwriteUrl(url: string): boolean {
  if (!url) return false;
  // Check if URL contains Appwrite storage path pattern
  return url.includes('/storage/buckets/') && url.includes('/files/');
}

/**
 * Extract bucket and file ID from a legacy Appwrite URL and convert to secure URL
 * @param legacyUrl - Legacy direct Appwrite URL
 * @returns Secure proxy URL or null if parsing fails
 */
export function convertLegacyUrlToSecure(legacyUrl: string): string | null {
  if (!isLegacyAppwriteUrl(legacyUrl)) {
    // Already a secure URL or invalid
    return legacyUrl;
  }
  
  try {
    const bucketMatch = legacyUrl.match(/\/storage\/buckets\/([^/]+)/);
    const fileIdMatch = legacyUrl.match(/\/files\/([^/]+)/);
    
    if (bucketMatch?.[1] && fileIdMatch?.[1]) {
      return getSecureFileUrl(bucketMatch[1] as BucketId, fileIdMatch[1]);
    }
  } catch {
    logger.warn('Failed to convert legacy URL to secure URL', { legacyUrl });
  }
  
  return null;
}

/**
 * Upload a file buffer to Appwrite Storage
 * @returns Upload result with file metadata or error
 */
export async function uploadFileToStorage(options: UploadFileOptions): Promise<UploadResult> {
  const { buffer, originalFilename, mimeType, bucket = BUCKETS.PROPOSAL_ATTACHMENTS, userId } = options;
  try {
    // Generate unique filename (userId prefix enables ownership verification)
    const uniqueFilename = generateUniqueFilename(originalFilename, userId);

    const inputFile = InputFile.fromBuffer(buffer, uniqueFilename);

    // Sensitive buckets use user-scoped read permissions; public buckets use public read.
    // All user-uploaded files store the owner in a write permission for ownership verification.
    const SENSITIVE_BUCKETS = [BUCKETS.DISPUTE_EVIDENCE, BUCKETS.MILESTONE_DELIVERABLES];
    const permissions = SENSITIVE_BUCKETS.includes(bucket) && userId
      ? [`read("user:${userId}")`, `write("user:${userId}")`]
      : userId
        ? ['read("any")', `write("user:${userId}")`]
        : ['read("any")'];

    const file = await storage.createFile(
      bucket,
      ID.unique(),
      inputFile,
      permissions
    );
    
    // Use secure proxy URL instead of direct Appwrite URL
    const secureUrl = getSecureFileUrl(bucket, file.$id);
    
    const metadata: FileMetadata = {
      url: secureUrl,
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
      url: secureUrl,
    });
    
    return {
      success: true,
      metadata,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error('Unexpected error during file upload', {
      error: message,
      stack,
      filename: originalFilename,
      bucket,
    });
    
    return {
      success: false,
      error: `An unexpected error occurred during file upload: ${message}`,
    };
  }
}

/**
 * Upload multiple files to Appwrite Storage
 * @param files - Array of multer files
 * @param bucket - Storage bucket ID
 * @param userId - Owner user ID (used for ownership prefix + permissions)
 * @returns Array of upload results
 */
export async function uploadMultipleFiles(
  files: Express.Multer.File[],
  bucket: BucketId = BUCKETS.PROPOSAL_ATTACHMENTS,
  userId?: string
): Promise<UploadResult[]> {
  const uploadPromises = files.map(file => {
    // Use detected MIME type from magic number validation if available
    const mimeType = (file as UploadedFile).detectedMimeType || file.mimetype;

    return uploadFileToStorage({
      buffer: file.buffer,
      originalFilename: file.originalname,
      mimeType,
      bucket,
      ...(userId !== undefined ? { userId } : {}),
    });
  });
  
  return Promise.all(uploadPromises);
}

/**
 * Stream a file from Appwrite Storage
 * This function is used by the file access endpoint to proxy file content
 * with proper authorization checks.
 * @param bucket - Storage bucket ID
 * @param fileId - Appwrite file ID
 * @returns ReadableStream of file content or null if file not found
 */
export async function streamFileFromStorage(
  bucket: BucketId,
  fileId: string
): Promise<{ stream: ReadableStream; mimeType: string; size: number; filename: string } | null> {
  try {
    // Get file metadata first
    const file = await storage.getFile(bucket, fileId);
    
    // Download file content as buffer
    const buffer = await storage.getFileDownload(bucket, fileId);
    
    // Convert buffer to ReadableStream
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(buffer);
        controller.close();
      },
    });
    
    return {
      stream,
      mimeType: file.mimeType || 'application/octet-stream',
      size: file.sizeOriginal || 0,
      filename: file.name,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to stream file from storage', {
      error: message,
      bucket,
      fileId,
    });
    return null;
  }
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error('Unexpected error during file deletion', {
      error: message,
      stack,
      fileId,
      bucket,
    });
    
    return {
      success: false,
      error: `An unexpected error occurred during file deletion: ${message}`,
    };
  }
}

/**
 * Extract file ID from Appwrite Storage URL
 * Supports both legacy direct Appwrite URLs and new secure proxy URLs
 * @param url - Full Appwrite Storage URL or secure proxy URL
 * @returns File ID or null if invalid URL
 */
export function extractFileIdFromUrl(url: string): string | null {
  try {
    // Handle secure proxy URLs: /api/files/access/{bucket}/{fileId}
    const proxyMatch = url.match(/\/api\/files\/access\/[^/]+\/([^/]+)/);
    if (proxyMatch && proxyMatch[1]) {
      return proxyMatch[1];
    }
    
    // Handle legacy Appwrite URLs: https://{endpoint}/storage/buckets/{bucket}/files/{fileId}/view
    const urlObj = new URL(url);
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
 * Extract bucket ID from URL
 * Supports both legacy direct Appwrite URLs and new secure proxy URLs
 * @param url - Full Appwrite Storage URL or secure proxy URL
 * @returns Bucket ID or null if invalid URL
 */
export function extractBucketFromUrl(url: string): BucketId | null {
  try {
    // Handle secure proxy URLs: /api/files/access/{bucket}/{fileId}
    const proxyMatch = url.match(/\/api\/files\/access\/([^/]+)/);
    if (proxyMatch && proxyMatch[1]) {
      return proxyMatch[1] as BucketId;
    }
    
    // Handle legacy Appwrite URLs: https://{endpoint}/storage/buckets/{bucket}/files/{fileId}/view
    const urlObj = new URL(url);
    const pathMatch = urlObj.pathname.match(/\/storage\/buckets\/([^/]+)/);
    
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1] as BucketId;
    }
    
    return null;
  } catch {
    logger.warn('Failed to extract bucket from URL', { url });
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
 * Compatibility wrapper for legacy uploadFile calls
 */
export async function uploadFile(options: {
  bucket: BucketId;
  userId: string;
  file: Buffer;
  filename: string;
  mimetype?: string;
}): Promise<UploadResult> {
  const result = await uploadFileToStorage({
    buffer: options.file,
    originalFilename: options.filename,
    mimeType: options.mimetype || 'application/octet-stream',
    bucket: options.bucket,
    userId: options.userId,
  });

  const finalResult: UploadResult = {
    success: result.success,
  };

  if (result.metadata?.url) finalResult.url = result.metadata.url;
  if (result.metadata?.fileId) finalResult.path = result.metadata.fileId;
  if (result.error) finalResult.error = result.error;

  return finalResult;
}

/**
 * Fetch a file's stored name so ownership can be verified server-side.
 * Returns null when the file does not exist or is inaccessible.
 */
async function getStoredFileName(bucket: BucketId, fileId: string): Promise<string | null> {
  try {
    const file = await storage.getFile(bucket, fileId);
    return file?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Verify the file name carries the given userId owner prefix.
 */
async function isFileOwnedBy(bucket: BucketId, fileId: string, userId: string): Promise<'owned' | 'missing' | 'forbidden'> {
  const name = await getStoredFileName(bucket, fileId);
  if (!name) return 'missing';
  return name.startsWith(`${userId}_`) ? 'owned' : 'forbidden';
}

/**
 * Delete a file owned by the given user. When userId is provided, ownership is
 * verified server-side from the stored file name before deletion (BLF-11.2).
 * Error strings: 'FORBIDDEN' (another user's file), 'FILE_NOT_FOUND'.
 */
export async function deleteFile(
  bucket: BucketId,
  path: string,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  if (userId) {
    const ownership = await isFileOwnedBy(bucket, path, userId);
    if (ownership === 'missing') return { success: false, error: 'FILE_NOT_FOUND' };
    if (ownership === 'forbidden') return { success: false, error: 'FORBIDDEN' };
  }
  return deleteFileFromStorage(path, bucket);
}

/**
 * Get a signed URL for a file owned by the given user. When userId is provided,
 * ownership is verified server-side from the stored file name (BLF-11.2).
 * Returns a secure proxy URL instead of direct Appwrite URL.
 * Error strings: 'FORBIDDEN' (another user's file), 'FILE_NOT_FOUND'.
 */
export async function getSignedUrl(bucket: BucketId, path: string, userId?: string): Promise<UploadResult> {
  if (userId) {
    const ownership = await isFileOwnedBy(bucket, path, userId);
    if (ownership === 'missing') return { success: false, error: 'FILE_NOT_FOUND' };
    if (ownership === 'forbidden') return { success: false, error: 'FORBIDDEN' };
  }
  // Return secure proxy URL instead of direct Appwrite URL
  const secureUrl = getSecureFileUrl(bucket, path);
  return {
    success: true,
    url: secureUrl,
  };
}

/**
 * List files owned by the given user (matched by the userId filename prefix).
 * Pages through Appwrite's cursor-based pagination so files beyond the first
 * page are not silently dropped.
 */
export async function listUserFiles(bucket: BucketId, userId: string): Promise<{ success: boolean; files: Models.File[]; error?: string }> {
  try {
    const PAGE_SIZE = 100;
    const allFiles: Models.File[] = [];
    let lastId: string | undefined;

    for (;;) {
      // Explicit ordering keeps the cursor stable across pages (default ordering
      // is not guaranteed); matches base-repository.fetchAll's cursor pattern.
      const queries = [Query.orderDesc('$createdAt'), Query.limit(PAGE_SIZE)];
      if (lastId) {
        queries.push(Query.cursorAfter(lastId));
      }

      const result = await storage.listFiles(bucket, queries);
      allFiles.push(...result.files);

      if (result.files.length < PAGE_SIZE) break;
      lastId = result.files[result.files.length - 1]?.$id;
      if (!lastId) break;
    }

    // Files uploaded via uploadFileToStorage carry a {userId}_ prefix (BLF-11.2)
    const userFiles = allFiles.filter(f => f.name.startsWith(`${userId}_`));
    return {
      success: true,
      files: userFiles,
    };
  } catch (error) {
    return {
      success: false,
      files: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Storage quota usage for a user (bytes used, limit, percentage, file count).
 * The quota covers the user's personal upload buckets (portfolio + proposal).
 */
export async function getFileQuota(userId: string): Promise<{
  success: boolean;
  used: number;
  limit: number;
  percentage: number;
  files: number;
  error?: string;
}> {
  const DEFAULT_QUOTA_BYTES = 100 * 1024 * 1024;

  const buckets: BucketId[] = [BUCKETS.PORTFOLIO_IMAGES, BUCKETS.PROPOSAL_ATTACHMENTS];
  const results = await Promise.all(
    buckets.map(bucket => listUserFiles(bucket, userId))
  );

  // listUserFiles never throws, but a bucket listing can fail — surface that
  // instead of reporting a silently-undersized quota.
  const failed = results.find(r => !r.success);
  if (failed) {
    return {
      success: false,
      used: 0,
      limit: DEFAULT_QUOTA_BYTES,
      percentage: 0,
      files: 0,
      error: failed.error || 'Failed to list files',
    };
  }

  const files = results.flatMap(r => r.files);
  const used = files.reduce((sum, f) => sum + (f.sizeOriginal || 0), 0);
  const percentage = Math.min((used / DEFAULT_QUOTA_BYTES) * 100, 100);

  return {
    success: true,
    used,
    limit: DEFAULT_QUOTA_BYTES,
    percentage,
    files: files.length,
  };
}
