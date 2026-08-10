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
      p => p.deadline && new Date(p.deadline) < now
    );

    if (expiredProjects.length > 0) {
      await Promise.all(
        expiredProjects.map((project) =>
          databases.updateDocument(
            DATABASE_ID,
            COLLECTIONS.PROJECTS,
            project.$id,
            {
              status: 'closed',
              updated_at: new Date().toISOString(),
            }
          )
        )
      );

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
        const userId = pref.user_id;

        // Fetch user info
        const userDoc = await databases.getDocument(DATABASE_ID, COLLECTIONS.USERS, userId).catch(() => null);
        if (!userDoc) continue;

        const userEmail = userDoc.email;
        const userFullName = userDoc.full_name || userDoc.name || 'User';

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
          p => new Date(p.created_at) >= weekAgo
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

        const milestoneCounts = await Promise.all(
          contractsResponse.documents.map(async (contract) => {
            try {
              const projectDoc = await databases.getDocument(
                DATABASE_ID,
                COLLECTIONS.PROJECTS,
                contract.project_id
              );
              const milestones = typeof projectDoc.milestones === 'string'
                ? JSON.parse(projectDoc.milestones)
                : projectDoc.milestones || [];
              return (milestones as Array<{ status?: string }>).filter(m => m.status === 'pending').length;
            } catch {
              return 0;
            }
          })
        );
        const pendingMilestonesCount = milestoneCounts.reduce((sum, n) => sum + n, 0);

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
          topProjects: topProjectsResponse.documents.map(p => ({
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
        const filters: Record<string, unknown> = typeof search.filters === 'string'
          ? JSON.parse(search.filters)
          : search.filters || {};
        const searchType = search.search_type;
        const collectionId = searchType === 'project' ? COLLECTIONS.PROJECTS : 'freelancer_profiles';

        // Build Appwrite queries from filters
        const queries: string[] = [Query.limit(10)];
        const ALLOWED_COLUMNS = new Set(['status', 'budget', 'category', 'title']);

        for (const [key, value] of Object.entries(filters)) {
          if (!ALLOWED_COLUMNS.has(key)) continue;
          // Only query-able primitive values can be passed to Appwrite's Query.equal.
          if (
            value !== undefined &&
            value !== null &&
            (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || Array.isArray(value))
          ) {
            queries.push(Query.equal(key, value));
          }
        }

        const results = await databases.listDocuments(
          DATABASE_ID,
          collectionId,
          queries
        );

        if (results.documents.length > 0) {
          // TODO: Create notification for new matches
          logger.info(`Found ${results.documents.length} results for saved search ${search.$id}`);
        }
      } catch (error) {
        logger.error(`Failed to execute saved search ${search.$id}:`, error);
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
      n => new Date(n.created_at) < thirtyDaysAgo
    );

    const deleteResults = await Promise.all(
      oldNotifications.map(async (notification) => {
        try {
          await databases.deleteDocument(
            DATABASE_ID,
            COLLECTIONS.NOTIFICATIONS,
            notification.$id
          );
          return 1;
        } catch {
          return 0;
        }
      })
    );
    const deletedTotal = deleteResults.reduce<number>((sum, n) => sum + n, 0);

    logger.info('Cleaned up old notifications', { deletedTotal });
  } catch (error) {
    logger.error('Failed to cleanup old notifications:', error);
  }
}

/**
 * Recover milestones stuck in the transient 'releasing' state (BUG-5).
 *
 * A milestone enters 'releasing' during the milestone-approval SAGA. If the on-chain
 * release fails AND the rollback also fails, the milestone can remain 'releasing'
 * forever (approveMilestone rejects any non-'submitted' status). This job re-reads
 * each active contract's project and, for any milestone stuck in 'releasing' beyond a
 * grace period, resets it back to 'submitted' so it can be retried.
 */
const RELEASING_STUCK_GRACE_MS = 15 * 60 * 1000; // 15 minutes

async function recoverStuckReleasingMilestones(): Promise<void> {
  try {
    const now = Date.now();
    const contractsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.CONTRACTS,
      [Query.equal('status', 'active'), Query.limit(1000)]
    );

    await Promise.all(
      contractsResponse.documents.map(async (contract) => {
        try {
          const projectId = contract.project_id;
          if (!projectId) return;

          const projectDoc = await databases.getDocument(DATABASE_ID, COLLECTIONS.PROJECTS, projectId);
          const milestones = typeof projectDoc.milestones === 'string'
            ? JSON.parse(projectDoc.milestones)
            : (projectDoc.milestones || []);

          const stuckIndexes = (milestones as Array<{ status?: string; updated_at?: string }>).reduce<number[]>((acc, m, i) => {
            if (m.status === 'releasing') {
              const updated = m.updated_at ? new Date(m.updated_at).getTime() : 0;
              if (updated > 0 && now - updated > RELEASING_STUCK_GRACE_MS) acc.push(i);
            }
            return acc;
          }, []);

          if (stuckIndexes.length === 0) return;

          const stuckIndexSet = new Set(stuckIndexes);
          const recovered = (milestones as Array<{ status?: string; updated_at?: string }>).map((m, i) =>
            stuckIndexSet.has(i) ? { ...m, status: 'submitted' } : m
          );

          await databases.updateDocument(DATABASE_ID, COLLECTIONS.PROJECTS, projectId, {
            milestones: JSON.stringify(recovered),
            updated_at: new Date().toISOString(),
          });

          logger.warn('Recovered stuck "releasing" milestones back to "submitted"', {
            contractId: contract.$id,
            recoveredMilestoneIndexes: stuckIndexes,
          });
        } catch (err) {
          logger.error('Failed to recover stuck releasing milestone for a contract', { contractId: contract.$id, error: err });
        }
      })
    );
  } catch (error) {
    logger.error('Failed to run recoverStuckReleasingMilestones job', error);
  }
}

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

  // Recover milestones stuck in 'releasing' - Every 10 minutes
  cron.schedule('*/10 * * * *', () => {
    logger.info('Running scheduled job: Recover stuck releasing milestones');
    recoverStuckReleasingMilestones();
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
