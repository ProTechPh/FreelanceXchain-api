import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { createFileUploadMiddleware } from '../middleware/file-upload-middleware.js';
import { fileUploadRateLimiter } from '../middleware/rate-limiter.js';
import { uploadFile, deleteFile, getSignedUrl, listUserFiles } from '../utils/storage-uploader.js';

const router = Router();

const ALLOWED_BUCKETS = [
  'profile-images',
  'contract-documents',
  'proposal-attachments',
  'dispute-evidence',
  'milestone-deliverables',
];

function isValidBucket(bucket: string): boolean {
  return ALLOWED_BUCKETS.includes(bucket);
}

router.post(
  '/upload',
  authMiddleware,
  fileUploadRateLimiter,
  ...createFileUploadMiddleware(),
  async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { bucket, folder } = req.body as { bucket?: string; folder?: string };

    if (!bucket) {
      res.status(400).json({ error: 'Bucket name is required' });
      return;
    }

    if (!isValidBucket(bucket)) {
      res.status(400).json({ error: `Invalid bucket: ${bucket}` });
      return;
    }

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    try {
      const file = files[0]!;
      const uploadOptions: Parameters<typeof uploadFile>[0] = {
        bucket,
        userId,
        file: file.buffer,
        filename: file.originalname,
        mimetype: file.mimetype,
      };
      if (folder) uploadOptions.folder = folder;
      const result = await uploadFile(uploadOptions);

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(200).json({ success: true, url: result.url, path: result.path });
    } catch {
      res.status(500).json({ error: 'Failed to upload file' });
    }
  }
);

router.delete('/:bucket/*', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const bucket = req.params['bucket'] as string;
  const filePath = ((req.params as any)[0] as string | undefined) ?? '';

  if (!isValidBucket(bucket)) {
    res.status(400).json({ error: `Invalid bucket: ${bucket}` });
    return;
  }

  if (filePath.includes('..') || filePath.includes('\\')) {
    res.status(400).json({ error: 'Invalid file path' });
    return;
  }

  const pathStart = filePath.split('/')[0];
  if (pathStart && pathStart !== userId) {
    res.status(403).json({ error: 'Unauthorized: cannot delete another user\'s file' });
    return;
  }

  try {
    const result = await deleteFile(bucket, filePath || userId);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(200).json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

router.get('/signed-url/:bucket/*', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const bucket = req.params['bucket'] as string;
  const filePath = ((req.params as any)[0] as string | undefined) ?? '';

  if (!isValidBucket(bucket)) {
    res.status(400).json({ error: `Invalid bucket: ${bucket}` });
    return;
  }

  if (filePath.includes('..') || filePath.includes('\\')) {
    res.status(400).json({ error: 'Invalid file path' });
    return;
  }

  const pathStart = filePath.split('/')[0];
  if (pathStart && pathStart !== userId) {
    res.status(403).json({ error: 'Unauthorized: cannot access another user\'s file' });
    return;
  }

  try {
    const result = await getSignedUrl(bucket, filePath || userId);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(200).json({ success: true, url: result.url });
  } catch {
    res.status(500).json({ error: 'Failed to get signed URL' });
  }
});

router.get('/list/:bucket', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const bucket = req.params['bucket'] as string;

  if (!isValidBucket(bucket)) {
    res.status(400).json({ error: `Invalid bucket: ${bucket}` });
    return;
  }

  const folder = req.query['folder'] as string | undefined;

  try {
    const listOptions: Parameters<typeof listUserFiles> = [bucket, userId];
    if (folder) listOptions.push(folder);
    const result = await listUserFiles(...listOptions);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(200).json({ success: true, files: result.files });
  } catch {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

export default router;
