import { Router, Request, Response } from 'express';
import multer from 'multer';
import { uploadFile, deleteFile, getSignedUrl, listUserFiles } from '../utils/file-upload.js';
import { authMiddleware } from '../middleware/auth-middleware.js';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max
  },
});

/**
 * Upload a file
 * POST /api/files/upload
 */
router.post('/upload', authMiddleware, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { bucket, folder } = req.body;
    const file = req.file;
    const userId = req.user?.id; // Use the new id field

    console.log('[FILE UPLOAD] Request received:', {
      bucket,
      folder,
      hasFile: !!file,
      fileName: file?.originalname,
      fileSize: file?.size,
      userId,
      hasUser: !!req.user,
      userObject: req.user, // Debug the full user object
    });

    if (!file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    if (!bucket) {
      res.status(400).json({ error: 'Bucket name is required' });
      return;
    }

    if (!userId) {
      console.log('[FILE UPLOAD] Authentication failed:', { 
        user: req.user, 
        headers: req.headers.authorization,
        userId: req.user?.userId, // Check both id and userId
        id: req.user?.id,
      });
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Upload using the updated uploadFile function
    const result = await uploadFile({
      bucket: bucket as any,
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
router.delete('/:bucket/*', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const bucket = req.params.bucket!; // Route param is always defined
    const path = req.params[0]; // Get the rest of the path
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!path) {
      res.status(400).json({ error: 'File path is required' });
      return;
    }

    // Verify the file belongs to the user
    if (!path.startsWith(userId)) {
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
router.get('/signed-url/:bucket/*', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const bucket = req.params.bucket!; // Route param is always defined
    const path = req.params[0];
    const userId = req.user?.id;
    const expiresIn = parseInt(req.query.expiresIn as string) || 3600;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!path) {
      res.status(400).json({ error: 'File path is required' });
      return;
    }

    // Verify the file belongs to the user
    if (!path.startsWith(userId)) {
      res.status(403).json({ error: 'Unauthorized to access this file' });
      return;
    }

    const result = await getSignedUrl(bucket, path, expiresIn);

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
