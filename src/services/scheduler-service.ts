import cron from 'node-cron';
import { databases, DATABASE_ID, ID, Query } from '../config/appwrite.js';
import { COLLECTIONS } from '../config/collections.js';
import { logger } from '../config/logger.js';
import { sendWeeklyDigestEmail } from './email-delivery-service.js';
import { filterProjectsBySavedSearch, filterFreelancersBySavedSearch } from './saved-search-service.js';
import type { ProjectEntity } from '../repositories/project-repository.js';
import type { FreelancerProfileEntity } from '../repositories/freelancer-profile-repository.js';
import { fromAppwriteDoc } from '../repositories/base-repository.js';
import { parseField } from '../utils/index.js';

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
 * Execute saved searches and notify users of new matches.
 *
 * For each saved search with notify_on_new enabled, candidates are fetched via
 * the shared saved-search filter helpers (skills, budget ranges, keyword — the
 * old implementation only honored status/budget/category/title via Query.equal,
 * silently ignored the skills filter, and used the wrong semantics for budgets).
 * Only matches created after the last notification (or after the search itself)
 * trigger a notification, so a saved search is not re-notified every 6 hours
 * about the same results. `last_notified_at` acts as the dedup watermark.
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

    // Fetch the candidate datasets ONCE per type and reuse across all searches
    // (the old per-search fetch made N full paginated scans every 6 hours).
    const allProjects = await fetchAllProjectDocs();
    const allProfiles = await fetchAllProfileDocs();

    for (const search of searchesResponse.documents) {
      try {
        const filters: Record<string, unknown> = typeof search.filters === 'string'
          ? JSON.parse(search.filters)
          : search.filters || {};
        const searchType = search.search_type;

        const lastNotifiedAt = search.last_notified_at
          ? new Date(search.last_notified_at).getTime()
          : 0;
        // Never notified yet → only surface matches newer than the saved search
        // itself. Note raw Appwrite docs carry $createdAt, not created_at, so
        // fall back to $createdAt when the attribute is absent.
        const searchCreatedAt = search.created_at ?? search.$createdAt;
        const sinceTimestamp = lastNotifiedAt > 0
          ? lastNotifiedAt
          : (searchCreatedAt ? new Date(searchCreatedAt).getTime() : 0);

        let matches: Array<{ id: string; title: string; created_at: string }> = [];
        if (searchType === 'project') {
          const filtered = filterProjectsBySavedSearch(allProjects, filters);
          matches = filtered
            .filter(p => new Date(p.created_at).getTime() > sinceTimestamp)
            .map(p => ({ id: p.id, title: p.title, created_at: p.created_at }));
        } else {
          const filtered = filterFreelancersBySavedSearch(allProfiles, filters);
          matches = filtered
            .filter(fp => new Date(fp.created_at).getTime() > sinceTimestamp)
            .map(fp => ({ id: fp.id, title: fp.name || 'Freelancer', created_at: fp.created_at }));
        }

        if (matches.length === 0) {
          continue;
        }

        // Create in-app notification for the new matches. matchIds is capped so
        // a broad saved search can't overflow the notification data column.
        const matchIds = matches.slice(0, 50).map(m => m.id);
        await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.NOTIFICATIONS,
          ID.unique(),
          {
            user_id: search.user_id,
            type: 'saved_search_match',
            title: `New matches for "${search.name || 'saved search'}"`,
            message: `${matches.length} new ${searchType === 'project' ? 'project' : 'freelancer'}(s) match your saved search`,
            data: JSON.stringify({
              savedSearchId: search.$id,
              searchType,
              matchIds,
              matchCount: matches.length,
            }),
            is_read: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        );

        // Advance the dedup watermark so the same matches aren't re-notified
        await databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.SAVED_SEARCHES,
          search.$id,
          {
            last_notified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        );

        logger.info(`Notified user ${search.user_id} of ${matches.length} new match(es) for saved search ${search.$id}`);
      } catch (error) {
        logger.error(`Failed to execute saved search ${search.$id}:`, error);
      }
    }
  } catch (error) {
    logger.error('Failed to execute saved searches:', error);
  }
}

/**
 * Fetch ALL open projects (cursor pagination — no 1000-row truncation) and map
 * them to ProjectEntity shape so the shared saved-search filter helpers work.
 */
async function fetchAllProjectDocs(): Promise<ProjectEntity[]> {
  const all: ProjectEntity[] = [];
  let lastId: string | undefined;

  while (true) {
    const queries = [Query.equal('status', 'open'), Query.limit(100)];
    if (lastId) queries.push(Query.cursorAfter(lastId));

    const page = await databases.listDocuments(DATABASE_ID, COLLECTIONS.PROJECTS, queries);
    const docs = page.documents.map(doc => normalizeProjectDoc(doc));
    all.push(...docs);

    if (page.documents.length < 100) break;
    lastId = page.documents[page.documents.length - 1]?.$id;
    if (!lastId) break;
  }

  return all;
}

/**
 * Fetch ALL freelancer profiles (cursor pagination — no 1000-row truncation)
 * and map them to FreelancerProfileEntity shape.
 */
async function fetchAllProfileDocs(): Promise<FreelancerProfileEntity[]> {
  const all: FreelancerProfileEntity[] = [];
  let lastId: string | undefined;

  while (true) {
    const queries = [Query.limit(100)];
    if (lastId) queries.push(Query.cursorAfter(lastId));

    const page = await databases.listDocuments(DATABASE_ID, COLLECTIONS.FREELANCER_PROFILES, queries);
    const docs = page.documents.map(doc => normalizeProfileDoc(doc));
    all.push(...docs);

    if (page.documents.length < 100) break;
    lastId = page.documents[page.documents.length - 1]?.$id;
    if (!lastId) break;
  }

  return all;
}

function normalizeProjectDoc(doc: Record<string, unknown>): ProjectEntity {
  const entity = fromAppwriteDoc<Record<string, unknown>>(doc);
  return {
    ...entity as unknown as ProjectEntity,
    required_skills: parseField(entity.required_skills, []),
    milestones: parseField(entity.milestones, []),
    tags: parseField(entity.tags, []),
    attachments: parseField(entity.attachments, []),
  };
}

function normalizeProfileDoc(doc: Record<string, unknown>): FreelancerProfileEntity {
  const entity = fromAppwriteDoc<Record<string, unknown>>(doc);
  return {
    ...entity as unknown as FreelancerProfileEntity,
    skills: parseField(entity.skills, []),
    experience: parseField(entity.experience, []),
  };
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
