import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { asyncHandler } from '../utils/async-handler.js';
import { getApiVersion } from '../utils/version.js';

const router = Router();

router.get('/', (_req, res) => {
  const version = getApiVersion();
  res.status(200).json({
    status: 'success',
    message: 'FreelanceXchain API is running',
    version
  });
});

router.get('/robots.txt', asyncHandler(async (_req, res) => {
  try {
    const robotsPath = resolve(process.cwd(), 'robots.txt');
    const robotsContent = await readFile(robotsPath, 'utf8');
    res.type('text/plain');
    res.send(robotsContent);
  } catch (_error) {
    res.status(404).send('Not found');
  }
}));

router.get('/sitemap.xml', asyncHandler(async (_req, res) => {
  try {
    const sitemapPath = resolve(process.cwd(), 'sitemap.xml');
    const sitemapContent = await readFile(sitemapPath, 'utf8');
    res.type('application/xml');
    res.send(sitemapContent);
  } catch (_error) {
    res.status(404).send('Not found');
  }
}));

// Backward-compatible alias — canonical endpoint is POST /api/auth/reset-password
router.post('/reset-password', (_req, res) => {
  res.redirect(307, '/api/auth/reset-password');
});

export default router;
