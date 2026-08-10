import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import { storage, BUCKETS } from '../config/appwrite.js';
import { config } from '../config/env.js';

export interface FileInfo {
  name: string;
  bucket: string;
  path: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  publicUrl?: string;
}

export interface FileQuota {
  used: number;      // bytes used
  limit: number;     // bytes limit
  percentage: number; // usage percentage
  files: number;     // file count
}

// Default quota: 100MB per user
const DEFAULT_QUOTA_BYTES = 100 * 1024 * 1024;

/**
 * Check if a file is owned by a user based on Appwrite file permissions.
 * Files uploaded with write("user:{userId}") permission indicate ownership.
 */
function isFileOwnedByUser(file: { $permissions?: string[] }, userId: string): boolean {
  if (file.$permissions) {
    return file.$permissions.some(p => p === `write("user:${userId}")`);
  }
  return false;
}

/**
 * Get user's files from Appwrite Storage
 */
export async function getUserFiles(
  userId: string,
  bucket?: string
): Promise<ServiceResult<FileInfo[]>> {
  try {
    const buckets = bucket ? [bucket] : [BUCKETS.PORTFOLIO_IMAGES, BUCKETS.PROPOSAL_ATTACHMENTS];

    const bucketResults = await Promise.all(
      buckets.map(async (bucketName) => {
        try {
          const result = await storage.listFiles(bucketName);

          if (result.files) {
            return result.files.reduce<FileInfo[]>((acc, file) => {
              if (isFileOwnedByUser(file, userId)) {
                acc.push({
                  name: file.name,
                  bucket: bucketName,
                  path: file.$id,
                  size: file.sizeOriginal || 0,
                  createdAt: file.$createdAt || '',
                  updatedAt: file.$updatedAt || '',
                  publicUrl: `${config.appwrite.endpoint}/storage/buckets/${bucketName}/files/${file.$id}/view?project=${config.appwrite.projectId}`,
                });
              }
              return acc;
            }, []);
          }
        } catch (error) {
          logger.error('Failed to list files', { error, userId, bucket: bucketName });
        }
        return [];
      })
    );
    const allFiles: FileInfo[] = bucketResults.flat();

    return successResult(allFiles);
  } catch (error) {
    logger.error('Unexpected error in getUserFiles', { error, userId, bucket });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Delete a file from Appwrite Storage
 */
export async function deleteFile(
  userId: string,
  bucket: string,
  path: string
): Promise<ServiceResult<void>> {
  try {
    // Get file info to verify ownership via Appwrite permissions
    try {
      const file = await storage.getFile(bucket, path);
      // Verify file ownership by checking owner write permission
      if (!isFileOwnedByUser(file, userId)) {
        return errorResult('UNAUTHORIZED', 'You can only delete your own files');
      }
    } catch (error) {
      logger.error('Failed to get file info', { error, userId, bucket, path });
      return errorResult('NOT_FOUND', 'File not found');
    }

    await storage.deleteFile(bucket, path);

    return successResult(undefined as unknown as void);
  } catch (error) {
    logger.error('Unexpected error in deleteFile', { error, userId, bucket, path });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Get user's storage quota usage
 */
export async function getFileQuota(userId: string): Promise<ServiceResult<FileQuota>> {
  try {
    const filesResult = await getUserFiles(userId);
    
    if (!filesResult.success) {
      return {
        success: false,
        error: filesResult.error,
      };
    }
    /* istanbul ignore next -- getUserFiles always returns data as array; || [] is dead code */
    const files = filesResult.data || [];
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const percentage = (totalSize / DEFAULT_QUOTA_BYTES) * 100;

    return successResult({
      used: totalSize,
      limit: DEFAULT_QUOTA_BYTES,
      percentage: Math.min(percentage, 100),
      files: files.length,
    });
      } catch (error) {
      /* istanbul ignore next */
      logger.error('Unexpected error in getFileQuota', { error, userId });
      /* istanbul ignore next */
      return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
    }
}
