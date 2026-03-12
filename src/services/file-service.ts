import { getSupabaseClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';

const supabase = getSupabaseClient();

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

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
 * Get user's files from Supabase Storage
 */
export async function getUserFiles(
  userId: string,
  bucket?: string
): Promise<ServiceResult<FileInfo[]>> {
  try {
    const buckets = bucket ? [bucket] : ['portfolio-images', 'message-attachments'];
    const allFiles: FileInfo[] = [];

    for (const bucketName of buckets) {
      // List files in user's folder
      const { data, error } = await supabase
        .storage
        .from(bucketName)
        .list(userId, {
          limit: 1000,
          sortBy: { column: 'created_at', order: 'desc' },
        });

      if (error) {
        logger.error('Failed to list files', { error, userId, bucket: bucketName });
        continue; // Skip this bucket and continue with others
      }

      if (data) {
        const files = data.map(file => ({
          name: file.name,
          bucket: bucketName,
          path: `${userId}/${file.name}`,
          size: file.metadata?.size || 0,
          createdAt: file.created_at || '',
          updatedAt: file.updated_at || '',
          publicUrl: supabase.storage.from(bucketName).getPublicUrl(`${userId}/${file.name}`).data.publicUrl,
        }));

        allFiles.push(...files);
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
 * Delete a file from Supabase Storage
 */
export async function deleteFile(
  userId: string,
  bucket: string,
  path: string
): Promise<ServiceResult<void>> {
  try {
    // Verify file ownership (path must contain userId)
    if (!path.startsWith(userId)) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only delete your own files',
        },
      };
    }

    const { error } = await supabase
      .storage
      .from(bucket)
      .remove([path]);

    if (error) {
      logger.error('Failed to delete file', { error, userId, bucket, path });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to delete file',
        },
      };
    }

    return {
      success: true,
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
    
    if (!filesResult.success || !filesResult.data) {
      return {
        success: false,
        error: filesResult.error || {
          code: 'INTERNAL_ERROR',
          message: 'Failed to calculate quota',
        },
      };
    }

    const files = filesResult.data;
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
    logger.error('Unexpected error in getFileQuota', { error, userId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}
