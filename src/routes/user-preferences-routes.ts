import { Router } from 'express';
import { getUserPreferences, updateTourProgress, setTourAutoStart } from '../services/user-preferences-service.js';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { logger } from '../config/logger.js';
import type { UserRole } from '../models/user.js';

const router = Router();
router.use(apiRateLimiter);

/**
 * GET /api/user-preferences
 * Get user preferences (creates default if doesn't exist)
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await getUserPreferences(userId);

    if (!result.success) {
      const status = result.error.code === 'NOT_FOUND' ? 404 : 500;
      res.status(status).json({ error: result.error.message });
      return;
    }

    res.json(result.data);
  } catch (error) {
    logger.error('Error in GET /api/user-preferences', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/user-preferences/tour-progress
 * Update tour progress for a specific role
 */
router.patch('/tour-progress', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { role, completedVersion, autoStart } = req.body;

    if (!role || (role !== 'freelancer' && role !== 'employer')) {
      res.status(400).json({ error: 'Invalid role. Must be "freelancer" or "employer"' });
      return;
    }

    // If only updating autoStart, use the dedicated endpoint
    if (autoStart !== undefined && completedVersion === undefined) {
      const result = await setTourAutoStart(userId, role as UserRole, autoStart);
      
      if (!result.success) {
        const status = result.error.code === 'NOT_FOUND' ? 404 : 500;
        res.status(status).json({ error: result.error.message });
        return;
      }

      res.json(result.data);
      return;
    }

    // Update tour progress with completion
    const result = await updateTourProgress(userId, role as UserRole, {
      completedVersion,
      autoStart,
    });

    if (!result.success) {
      const status = result.error.code === 'NOT_FOUND' ? 404 : 500;
      res.status(status).json({ error: result.error.message });
      return;
    }

    res.json(result.data);
  } catch (error) {
    logger.error('Error in PATCH /api/user-preferences/tour-progress', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
