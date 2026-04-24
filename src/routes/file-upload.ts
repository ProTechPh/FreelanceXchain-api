import { Router, Request, Response } from 'express';
import _multer from 'multer';
import { uploadFile, deleteFile, getSignedUrl, listUserFiles } from '../utils/file-upload.js';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { fileUploadRateLimiter } from '../middleware/rate-limiter.js';
import { createFileUploadMiddleware } from '../middleware/file-upload-middleware.js';
import { logger } from '../config/logger.js';

const router = Router();

// Allowed storage buckets — reject any bucket not in this list
const ALLOWED_BUCKETS = new Set([
  'profile-images',
  'contract-documents',
  'proposal-attachments',
  'dispute-evidence',
  'milestone-deliverables',
]);

// Use secure file upload middleware (validates magic numbers, sanitizes filenames, enforces limits)
const secureUpload = createFileUploadMiddleware('file', {
  minFiles: 1,
  maxFiles: 1,
  validateMagicNumbers: true,
});

/**
 * Upload a file
 * POST /api/files/upload
 */
// FIXED: Added fileUploadRateLimiter to prevent abuse (20 uploads/hour)
// FIXED: Switched from raw multer to createFileUploadMiddleware for magic number & AV validation
router.post('/upload', authMiddleware, fileUploadRateLimiter, ...secureUpload, async (req: Request, res: Response): Promise<void> => {
  try {
    const { bucket, folder } = req.body;
    // createFileUploadMiddleware parses into req.files array
    const files = req.files as Express.Multer.File[] | undefined;
    const file = files?.[0];
    const userId = req.user?.id; // Use the new id field

    if (!file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    if (!bucket) {
      res.status(400).json({ error: 'Bucket name is required' });
      return;
    }

    // Validate bucket against allowlist to prevent bucket injection
    if (!ALLOWED_BUCKETS.has(bucket)) {
      res.status(400).json({ error: `Invalid bucket. Allowed: ${[...ALLOWED_BUCKETS].join(', ')}` });
      return;
    }

    if (!userId) {
      logger.warn('[FILE UPLOAD] Authentication failed - no userId on request');
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Upload using the updated uploadFile function
    const result = await uploadFile({
      bucket: bucket as 'profile-images' | 'contract-documents' | 'proposal-attachments' | 'dispute-evidence',
      userId,
      file: file.buffer, // Use the buffer directly
      filename: file.originalname,
      mimetype: file.mimetype,
      folder,
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      url: result.url,
      path: result.path,
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

/**
 * Delete a file
 * DELETE /api/files/:bucket/:path
 */
router.delete('/:bucket/*', authMiddleware, fileUploadRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const bucket = req.params.bucket!; // Route param is always defined
    const path = req.params[0]; // Get the rest of the path
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Validate bucket against allowlist
    if (!ALLOWED_BUCKETS.has(bucket)) {
      res.status(400).json({ error: `Invalid bucket. Allowed: ${[...ALLOWED_BUCKETS].join(', ')}` });
      return;
    }

    if (!path) {
      res.status(400).json({ error: 'File path is required' });
      return;
    }

    // Verify the file belongs to the user (boundary-safe check with '/' separator)
    if (!path.startsWith(`${userId}/`) && path !== userId) {
      res.status(403).json({ error: 'Unauthorized to delete this file' });
      return;
    }

    const result = await deleteFile(bucket, path);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('File delete error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

/**
 * Get signed URL for a private file
 * GET /api/files/signed-url/:bucket/:path
 */
router.get('/signed-url/:bucket/*', authMiddleware, fileUploadRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const bucket = req.params.bucket!; // Route param is always defined
    const path = req.params[0];
    const userId = req.user?.id;
    const expiresIn = parseInt(req.query.expiresIn as string) || 3600;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Validate bucket against allowlist
    if (!ALLOWED_BUCKETS.has(bucket)) {
      res.status(400).json({ error: `Invalid bucket. Allowed: ${[...ALLOWED_BUCKETS].join(', ')}` });
      return;
    }

    if (!path) {
      res.status(400).json({ error: 'File path is required' });
      return;
    }

    // Cap expiresIn to a reasonable maximum (24 hours)
    const clampedExpiresIn = Math.min(Math.max(expiresIn, 60), 86400);

    // Verify the file belongs to the user (boundary-safe check with '/' separator)
    if (!path.startsWith(`${userId}/`) && path !== userId) {
      res.status(403).json({ error: 'Unauthorized to access this file' });
      return;
    }

    const result = await getSignedUrl(bucket, path, clampedExpiresIn);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      url: result.url,
    });
  } catch (error) {
    console.error('Get signed URL error:', error);
    res.status(500).json({ error: 'Failed to get signed URL' });
  }
});

/**
 * List user's files
 * GET /api/files/list/:bucket
 */
router.get('/list/:bucket', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const bucket = req.params.bucket!; // Route param is always defined
    const { folder } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Validate bucket against allowlist
    if (!ALLOWED_BUCKETS.has(bucket)) {
      res.status(400).json({ error: `Invalid bucket. Allowed: ${[...ALLOWED_BUCKETS].join(', ')}` });
      return;
    }

    const result = await listUserFiles(bucket, userId, folder as string | undefined);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      files: result.files,
    });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

export default router;
