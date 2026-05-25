import cron from 'node-cron';
import { pool } from '../config/database.js';
import { logger } from '../config/logger.js';
import { sendWeeklyDigestEmail } from './email-delivery-service.js';

/**
 * Auto-close expired projects
 */
async function autoCloseExpiredProjects(): Promise<void> {
  try {
    const expiredProjects = await pool.query(
      `SELECT id, title FROM projects 
       WHERE status = 'open' AND deadline < NOW()`
    );

    if (expiredProjects.rows.length > 0) {
      const projectIds = expiredProjects.rows.map(p => p.id);
      await pool.query(
        `UPDATE projects 
         SET status = 'closed', updated_at = NOW() 
         WHERE id = ANY($1)`,
        [projectIds]
      );

      logger.info(`Auto-closed ${expiredProjects.rows.length} expired projects`);
    }
  } catch (error) {
    logger.error('Failed to auto-close expired projects:', error);
  }
}

/**
 * Send weekly digest emails
 */
async function sendWeeklyDigests(): Promise<void> {
  try {
    // Get users with weekly digest enabled
    const usersResult = await pool.query(
      `SELECT ep.user_id, u.email, u.full_name 
       FROM email_preferences ep
       INNER JOIN users u ON u.id = ep.user_id
       WHERE ep.weekly_digest = true`
    );

    if (usersResult.rows.length === 0) {
      logger.info('No users with weekly digest enabled');
      return;
    }

    for (const user of usersResult.rows) {
      try {
        // Get user stats for the week
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        // Count new projects
        const newProjectsResult = await pool.query(
          'SELECT COUNT(*) as count FROM projects WHERE created_at >= $1',
          [weekAgo.toISOString()]
        );

        // Count new messages
        const newMessagesResult = await pool.query(
          'SELECT COUNT(*) as count FROM messages WHERE receiver_id = $1 AND is_read = false',
          [user.user_id]
        );

        // Count pending milestones
        const pendingMilestonesResult = await pool.query(
          `SELECT COUNT(*) as count FROM milestones m
           INNER JOIN contracts c ON c.id = m.contract_id
           WHERE c.freelancer_id = $1 AND m.status = 'pending'`,
          [user.user_id]
        );

        // Get top projects
        const topProjectsResult = await pool.query(
          `SELECT id, title, budget FROM projects 
           WHERE status = 'open' 
           ORDER BY created_at DESC 
           LIMIT 5`
        );

        await sendWeeklyDigestEmail(user.email, {
          userName: user.full_name || 'User',
          newProjects: parseInt(newProjectsResult.rows[0]?.count || '0'),
          newMessages: parseInt(newMessagesResult.rows[0]?.count || '0'),
          pendingMilestones: parseInt(pendingMilestonesResult.rows[0]?.count || '0'),
          topProjects: topProjectsResult.rows.map(p => ({
            title: p.title,
            budget: `$${p.budget}`,
            url: `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/projects/${p.id}`,
          })),
        });

        logger.info(`Weekly digest sent to user ${user.user_id}`);
      } catch (error) {
        logger.error(`Failed to send weekly digest to user ${user.user_id}:`, error);
      }
    }
  } catch (error) {
    logger.error('Failed to send weekly digests:', error);
  }
}

/**
 * Execute saved searches and notify users
 */
async function executeSavedSearches(): Promise<void> {
  try {
    // Get saved searches with notifications enabled
    const searchesResult = await pool.query(
      'SELECT * FROM saved_searches WHERE notify_on_new = true'
    );

    if (searchesResult.rows.length === 0) {
      return;
    }

    for (const search of searchesResult.rows) {
      try {
        // Execute search based on type
        const tableName = search.search_type === 'project' ? 'projects' : 'freelancer_profiles';
        const filters = search.filters as Record<string, any>;
        
        // Build dynamic query (simplified - in production, use proper query builder)
        const whereConditions: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        Object.keys(filters).forEach(key => {
          if (filters[key] !== undefined && filters[key] !== null) {
            whereConditions.push(`${key} = $${paramIndex++}`);
            values.push(filters[key]);
          }
        });

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        const results = await pool.query(
          `SELECT * FROM ${tableName} ${whereClause} LIMIT 10`,
          values
        );

        if (results.rows.length > 0) {
          // TODO: Create notification for new matches
          logger.info(`Found ${results.rows.length} results for saved search ${search.id}`);
        }
      } catch (error) {
        logger.error(`Failed to execute saved search ${search.id}:`, error);
      }
    }
  } catch (error) {
    logger.error('Failed to execute saved searches:', error);
  }
}

/**
 * Clean up old notifications
 */
async function cleanupOldNotifications(): Promise<void> {
  try {
    // Delete read notifications older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    await pool.query(
      `DELETE FROM notifications 
       WHERE is_read = true AND created_at < $1`,
      [thirtyDaysAgo.toISOString()]
    );

    logger.info('Cleaned up old notifications');
  } catch (error) {
    logger.error('Failed to cleanup old notifications:', error);
  }
}

/**
 * Initialize all scheduled jobs
 */
export function initializeScheduler(): void {
  logger.info('Initializing scheduler service...');

  // Auto-close expired projects - Daily at midnight
  cron.schedule('0 0 * * *', () => {
    logger.info('Running scheduled job: Auto-close expired projects');
    autoCloseExpiredProjects();
  });

  // Send weekly digests - Every Monday at 9 AM
  cron.schedule('0 9 * * 1', () => {
    logger.info('Running scheduled job: Send weekly digests');
    sendWeeklyDigests();
  });

  // Execute saved searches - Every 6 hours
  cron.schedule('0 */6 * * *', () => {
    logger.info('Running scheduled job: Execute saved searches');
    executeSavedSearches();
  });

  // Cleanup old notifications - Daily at 2 AM
  cron.schedule('0 2 * * *', () => {
    logger.info('Running scheduled job: Cleanup old notifications');
    cleanupOldNotifications();
  });

  logger.info('Scheduler service initialized successfully');
}

/**
 * Stop all scheduled jobs (for graceful shutdown)
 */
export function stopScheduler(): void {
  cron.getTasks().forEach(task => task.stop());
  logger.info('Scheduler service stopped');
}
