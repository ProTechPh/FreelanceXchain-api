import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const router = Router();

// Health check endpoint
router.get('/', (_req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'FreelanceXchain API is running',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Robots.txt endpoint
router.get('/robots.txt', async (_req, res) => {
  try {
    const robotsPath = resolve(process.cwd(), 'robots.txt');
    const robotsContent = await readFile(robotsPath, 'utf8');
    res.type('text/plain');
    res.send(robotsContent);
  } catch (_error) {
    res.status(404).send('Not found');
  }
});

// Sitemap.xml endpoint
router.get('/sitemap.xml', async (_req, res) => {
  try {
    const sitemapPath = resolve(process.cwd(), 'sitemap.xml');
    const sitemapContent = await readFile(sitemapPath, 'utf8');
    res.type('application/xml');
    res.send(sitemapContent);
  } catch (_error) {
    res.status(404).send('Not found');
  }
});

// Backward-compatible alias for clients posting to /reset-password directly.
// The canonical endpoint remains POST /api/auth/reset-password.
router.post('/reset-password', (_req, res) => {
  res.redirect(307, '/api/auth/reset-password');
});

export default router;
