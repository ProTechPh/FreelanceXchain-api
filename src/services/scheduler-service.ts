import cron from 'node-cron';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { COLLECTIONS } from '../config/collections.js';
import { logger } from '../config/logger.js';
import { sendWeeklyDigestEmail } from './email-delivery-service.js';

/**
 * Auto-close expired projects
 */
async function autoCloseExpiredProjects(): Promise<void> {
  try {
    // Fetch open projects and filter by deadline in memory
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.PROJECTS,
      [
        Query.equal('status', 'open'),
        Query.limit(1000),
      ]
    );

    const now = new Date();
    const expiredProjects = response.documents.filter(
      (p: any) => p.deadline && new Date(p.deadline) < now
    );

    if (expiredProjects.length > 0) {
      for (const project of expiredProjects) {
        await databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.PROJECTS,
          project.$id,
          {
            status: 'closed',
            updated_at: new Date().toISOString(),
          }
        );
      }

      logger.info(`Auto-closed ${expiredProjects.length} expired projects`);
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
    const emailPrefsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.EMAIL_PREFERENCES,
      [
        Query.equal('weekly_digest', true),
        Query.limit(1000),
      ]
    );

    if (emailPrefsResponse.documents.length === 0) {
      logger.info('No users with weekly digest enabled');
      return;
    }

    for (const pref of emailPrefsResponse.documents) {
      try {
        const userId = (pref as any).user_id;

        // Fetch user info
        let userDoc: Record<string, any> | null = null;
        try {
          userDoc = await databases.getDocument(DATABASE_ID, COLLECTIONS.USERS, userId) as any;
        } catch {
          continue;
        }

        const userEmail = (userDoc as any).email;
        const userFullName = (userDoc as any).full_name || (userDoc as any).name || 'User';

        // Get user stats for the week
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        // Count new projects (filter by created_at in memory)
        const projectsResponse = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.PROJECTS,
          [Query.limit(1000)]
        );
        const newProjectsCount = projectsResponse.documents.filter(
          (p: any) => new Date(p.created_at) >= weekAgo
        ).length;

        // Count new messages
        const messagesResponse = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.MESSAGES,
          [
            Query.equal('receiver_id', userId),
            Query.equal('is_read', false),
            Query.limit(1000),
          ]
        );
        const newMessagesCount = messagesResponse.total;

        // Count pending milestones (from project entities)
        const contractsResponse = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.CONTRACTS,
          [
            Query.equal('freelancer_id', userId),
            Query.limit(1000),
          ]
        );

        let pendingMilestonesCount = 0;
        for (const contract of contractsResponse.documents) {
          try {
            const projectDoc = await databases.getDocument(
              DATABASE_ID,
              COLLECTIONS.PROJECTS,
              (contract as any).project_id
            );
            const milestones = typeof (projectDoc as any).milestones === 'string'
              ? JSON.parse((projectDoc as any).milestones)
              : (projectDoc as any).milestones || [];
            pendingMilestonesCount += milestones.filter((m: any) => m.status === 'pending').length;
          } catch { /* skip */ }
        }

        // Get top projects
        const topProjectsResponse = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.PROJECTS,
          [
            Query.equal('status', 'open'),
            Query.orderDesc('created_at'),
            Query.limit(5),
          ]
        );

        await sendWeeklyDigestEmail(userEmail, {
          userName: userFullName,
          newProjects: newProjectsCount,
          newMessages: newMessagesCount,
          pendingMilestones: pendingMilestonesCount,
          topProjects: topProjectsResponse.documents.map((p: any) => ({
            title: p.title,
            budget: `$${p.budget}`,
            url: `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/projects/${p.$id}`,
          })),
        });

        logger.info(`Weekly digest sent to user ${userId}`);
      } catch (error) {
        logger.error(`Failed to send weekly digest to user:`, error);
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
    const searchesResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.SAVED_SEARCHES,
      [
        Query.equal('notify_on_new', true),
        Query.limit(100),
      ]
    );

    if (searchesResponse.documents.length === 0) {
      return;
    }

    for (const search of searchesResponse.documents) {
      try {
        const filters = typeof (search as any).filters === 'string'
          ? JSON.parse((search as any).filters)
          : (search as any).filters || {};
        const searchType = (search as any).search_type;
        const collectionId = searchType === 'project' ? COLLECTIONS.PROJECTS : 'freelancer_profiles';

        // Build Appwrite queries from filters
        const queries: any[] = [Query.limit(10)];
        const ALLOWED_COLUMNS = new Set(['status', 'budget', 'category', 'title']);

        for (const [key, value] of Object.entries(filters)) {
          if (!ALLOWED_COLUMNS.has(key)) continue;
          if (value !== undefined && value !== null) {
            queries.push(Query.equal(key, value as any));
          }
        }

        const results = await databases.listDocuments(
          DATABASE_ID,
          collectionId,
          queries
        );

        if (results.documents.length > 0) {
          // TODO: Create notification for new matches
          logger.info(`Found ${results.documents.length} results for saved search ${(search as any).$id}`);
        }
      } catch (error) {
        logger.error(`Failed to execute saved search ${(search as any).$id}:`, error);
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
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch read notifications older than 30 days and delete in batches
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.NOTIFICATIONS,
      [
        Query.equal('is_read', true),
        Query.limit(1000),
      ]
    );

    const oldNotifications = response.documents.filter(
      (n: any) => new Date(n.created_at) < thirtyDaysAgo
    );

    let deletedTotal = 0;
    for (const notification of oldNotifications) {
      try {
        await databases.deleteDocument(
          DATABASE_ID,
          COLLECTIONS.NOTIFICATIONS,
          notification.$id
        );
        deletedTotal++;
      } catch { /* skip individual failures */ }
    }

    logger.info('Cleaned up old notifications', { deletedTotal });
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
