import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
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
 * Get user's files from Appwrite Storage
 */
export async function getUserFiles(
  userId: string,
  bucket?: string
): Promise<ServiceResult<FileInfo[]>> {
  try {
    const buckets = bucket ? [bucket] : [BUCKETS.PORTFOLIO_IMAGES, BUCKETS.PROPOSAL_ATTACHMENTS];
    const allFiles: FileInfo[] = [];

    for (const bucketName of buckets) {
      try {
        // List files in bucket
        const result = await storage.listFiles(bucketName);

        if (result.files) {
          // Filter files that belong to the user (by filename pattern or metadata)
          const files = result.files
            .filter(file => file.name.startsWith(userId + '/') || file.name.startsWith(userId + '_'))
            .map(file => ({
              name: file.name,
              bucket: bucketName,
              path: file.$id,
              size: file.sizeOriginal || 0,
              createdAt: file.$createdAt || '',
              updatedAt: file.$updatedAt || '',
              publicUrl: `${config.appwrite.endpoint}/storage/buckets/${bucketName}/files/${file.$id}/view?project=${config.appwrite.projectId}`,
            }));

          allFiles.push(...files);
        }
      } catch (error) {
        logger.error('Failed to list files', { error, userId, bucket: bucketName });
        continue; // Skip this bucket and continue with others
      }
    }

    return {
      success: true,
      data: allFiles,
    };
  } catch (error) {
    logger.error('Unexpected error in getUserFiles', { error, userId, bucket });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
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
    // Get file info to verify ownership
    try {
      const file = await storage.getFile(bucket, path);
      // Verify file ownership by checking if filename starts with userId
      if (!file.name.startsWith(userId + '/') && !file.name.startsWith(userId + '_')) {
        return {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'You can only delete your own files',
          },
        };
      }
    } catch (error) {
      logger.error('Failed to get file info', { error, userId, bucket, path });
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found',
        },
      };
    }

    await storage.deleteFile(bucket, path);

    return {
      success: true,
      data: undefined as unknown as void,
    };
  } catch (error) {
    logger.error('Unexpected error in deleteFile', { error, userId, bucket, path });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
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
    const files = filesResult.data || [];
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const percentage = (totalSize / DEFAULT_QUOTA_BYTES) * 100;

    return {
      success: true,
      data: {
        used: totalSize,
        limit: DEFAULT_QUOTA_BYTES,
        percentage: Math.min(percentage, 100),
        files: files.length,
      },
    };
  } catch (error) {
    /* istanbul ignore next */
    logger.error('Unexpected error in getFileQuota', { error, userId });
    /* istanbul ignore next */
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}
