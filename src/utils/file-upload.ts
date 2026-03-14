import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';

// Use service role key for server-side operations (bypasses RLS)
const supabase = createClient(
  config.supabase.url, 
  config.supabase.serviceRoleKey || '', // Use service role key instead of anon key
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export interface UploadOptions {
  bucket: 'profile-images' | 'contract-documents' | 'proposal-attachments' | 'dispute-evidence' | 'milestone-deliverables';
  userId: string;
  file: File | Buffer; // Support both File (browser) and Buffer (Node.js)
  filename: string;
  mimetype?: string;
  folder?: string;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}

/**
 * Upload a file to Supabase Storage
 */
export async function uploadFile(options: UploadOptions): Promise<UploadResult> {
  const { bucket, userId, file, filename, mimetype, folder } = options;

  try {
    // Get file size - handle both File and Buffer
    const fileSize = file instanceof Buffer ? file.length : (file as any).size;
    
    // Validate file size based on bucket
    const maxSizes = {
      'profile-images': 5 * 1024 * 1024, // 5MB
      'contract-documents': 10 * 1024 * 1024, // 10MB
      'proposal-attachments': 10 * 1024 * 1024, // 10MB
      'dispute-evidence': 20 * 1024 * 1024, // 20MB
      'milestone-deliverables': 25 * 1024 * 1024, // 25MB
    };

    if (fileSize > maxSizes[bucket]) {
      return {
        success: false,
        error: `File size exceeds ${maxSizes[bucket] / 1024 / 1024}MB limit`,
      };
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${sanitizedName}`;
    
    // Build file path: userId/folder/filename or userId/filename
    const filePath = folder 
      ? `${userId}/${folder}/${fileName}`
      : `${userId}/${fileName}`;

    // Upload file - Supabase accepts both File and Buffer
    const uploadOptions: any = {
      cacheControl: '3600',
      upsert: false,
    };
    
    // Add content type if provided
    if (mimetype) {
      uploadOptions.contentType = mimetype;
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, uploadOptions);

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    // Get public URL for public buckets, signed URL for private buckets
    let url: string;
    if (bucket === 'profile-images') {
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);
      url = urlData.publicUrl;
    } else {
      const { data: urlData, error: urlError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(data.path, 3600); // 1 hour expiry

      if (urlError) {
        return {
          success: false,
          error: urlError.message,
        };
      }
      url = urlData.signedUrl;
    }

    return {
      success: true,
      url,
      path: data.path,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteFile(bucket: string, path: string): Promise<UploadResult> {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Get a signed URL for a private file
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 3600
): Promise<UploadResult> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      url: data.signedUrl,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * List files in a user's folder
 */
export async function listUserFiles(
  bucket: string,
  userId: string,
  folder?: string
): Promise<{ success: boolean; files?: any[]; error?: string }> {
  try {
    const path = folder ? `${userId}/${folder}` : userId;
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(path);

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      files: data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
