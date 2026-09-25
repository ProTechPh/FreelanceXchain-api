import cron from 'node-cron';
import { databases, DATABASE_ID, ID, Query } from '../config/appwrite.js';
import { COLLECTIONS } from '../config/collections.js';
import { logger } from '../config/logger.js';
import { sendWeeklyDigestEmail } from './email-delivery-service.js';
import { filterProjectsBySavedSearch, filterFreelancersBySavedSearch } from './saved-search-service.js';
import { resolveSkillFilterToNames } from './search-service.js';
import { projectRepository, type ProjectEntity, type ProjectStatus } from '../repositories/project-repository.js';
import { contractRepository, type ContractEntity } from '../repositories/contract-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { messageRepository } from '../repositories/message-repository.js';
import { notificationRepository } from '../repositories/notification-repository.js';
import { emailPreferenceRepository } from '../repositories/email-preference-repository.js';
import { savedSearchRepository } from '../repositories/saved-search-repository.js';
import type { FreelancerProfileEntity } from '../repositories/freelancer-profile-repository.js';
import { fromAppwriteDoc } from '../repositories/base-repository.js';
import { parseField } from '../utils/index.js';
import { reconcileContractPayments } from './escrow-reconciliation-service.js';

/**
 * Auto-close expired projects
 */
async function autoCloseExpiredProjects(): Promise<void> {
  try {
    const openProjects = await projectRepository.listOpenProjects(1000);

    const now = new Date();
    const expiredProjects = openProjects.filter(
      p => p.deadline && new Date(p.deadline) < now
    );

    if (expiredProjects.length > 0) {
      await Promise.all(
        expiredProjects.map((project) =>
          // 'closed' is the legacy terminal status this job writes; ProjectStatus
          // does not model it for the rest of the app.
          projectRepository.updateProject(project.id, { status: 'closed' as ProjectStatus })
        )
      );

      logger.info(`Auto-closed ${expiredProjects.length} expired projects`);
    }
  } catch (error) {
    logger.error('Failed to auto-close expired projects:', error);
  }
}

type StuckMilestone = { status?: string; updated_at?: string };

function parseMilestones(project: ProjectEntity): StuckMilestone[] {
  return project.milestones as StuckMilestone[];
}

/**
 * Count pending milestones across a user's contracts, using the projects
 * snapshot already loaded for the digest run. Projects missing from the
 * snapshot contribute 0.
 */
function countPendingMilestones(
  contracts: ContractEntity[],
  projectsById: Map<string, ProjectEntity>
): number {
  let total = 0;

  for (const contract of contracts) {
    const project = projectsById.get(contract.project_id);
    if (!project) continue;
    total += parseMilestones(project).filter(m => m.status === 'pending').length;
  }

  return total;
}

type WeeklyDigestSnapshot = {
  newProjectsCount: number;
  totalEscrowValue: string;
  topMatchRate: string;
  topProjects: Array<{ title: string; budget: string; url: string; matchRate?: string }>;
  projectsById: Map<string, ProjectEntity>;
};

/**
 * Scan the projects collection once for the whole digest run instead of once
 * per recipient. Yields the shared stats (new-project count, top projects)
 * plus an id → project map so per-user milestone counts need no extra reads.
 */
async function loadWeeklyDigestSnapshot(): Promise<WeeklyDigestSnapshot> {
  const allProjects = await projectRepository.listAllProjects(1000);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const newProjectsCount = allProjects.filter(
    p => new Date(p.created_at) >= weekAgo
  ).length;

  const totalEscrow = allProjects
    .filter(p => p.status === 'open' || p.status === 'in_progress')
    .reduce((sum, p) => sum + (Number(p.budget) || 0), 0);
  const formattedTotalEscrow = totalEscrow > 0 ? `$${totalEscrow.toLocaleString()}` : '$25,000+';

  const frontendUrl = process.env['FRONTEND_URL'] || 'https://freelancexchain.works';
  const topProjects = allProjects
    .filter(p => p.status === 'open')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((p, index) => ({
      title: p.title,
      budget: `$${Number(p.budget).toLocaleString()}`,
      url: `${frontendUrl}/projects/${p.id}`,
      matchRate: `${Math.max(88, 98 - index * 2)}%`,
    }));

  return {
    newProjectsCount,
    totalEscrowValue: formattedTotalEscrow,
    topMatchRate: '98%',
    topProjects,
    projectsById: new Map(allProjects.map(p => [p.id, p])),
  };
}

/**
 * Send weekly digest emails
 */
async function sendWeeklyDigests(): Promise<void> {
  try {
    const preferences = await emailPreferenceRepository.findAllWithWeeklyDigestEnabled();

    if (preferences.length === 0) {
      logger.info('No users with weekly digest enabled');
      return;
    }

    const userIds = preferences.map(pref => pref.user_id);

    // Batch the per-user reads: one project scan, then one query each for
    // users, contracts, and unread counts across every recipient.
    const [snapshot, users, contractsByFreelancer, unreadCountsByUser] = await Promise.all([
      loadWeeklyDigestSnapshot(),
      userRepository.getUsersByIds(userIds),
      contractRepository.findAllByFreelancers(userIds),
      messageRepository.getUnreadMessageCountsForUsers(userIds),
    ]);
    const usersById = new Map(users.map(user => [user.id, user]));

    for (const pref of preferences) {
      try {
        const user = usersById.get(pref.user_id);
        if (!user) continue;

        const pendingMilestonesCount = countPendingMilestones(
          contractsByFreelancer.get(pref.user_id) ?? [],
          snapshot.projectsById
        );

        await sendWeeklyDigestEmail(user.email, {
          userName: user.full_name || user.name || 'User',
          newProjects: snapshot.newProjectsCount,
          newMessages: unreadCountsByUser.get(pref.user_id) ?? 0,
          pendingMilestones: pendingMilestonesCount,
          totalEscrowValue: snapshot.totalEscrowValue,
          topMatchRate: snapshot.topMatchRate,
          topProjects: snapshot.topProjects,
        });

        logger.info(`Weekly digest sent to user ${pref.user_id}`);
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
/* eslint-disable max-lines-per-function -- batch saved-search matcher; refactor follow-up */
async function executeSavedSearches(): Promise<void> {
  try {
    // Get saved searches with notifications enabled — via the repository's
    // fetchAll. The old raw Query.limit(100) here bypassed the repository fix
    // and the 101st+ notify-enabled search was never executed.
    const searches = await savedSearchRepository.findAllWithNotifyEnabled();

    if (searches.length === 0) {
      return;
    }

    // Fetch the candidate datasets ONCE per type and reuse across all searches
    // (the old per-search fetch made N full paginated scans every 6 hours).
    const allProjects = await fetchAllProjectDocs();
    const allProfiles = await fetchAllProfileDocs();

    for (const search of searches) {

      try {
        const filters: Record<string, unknown> = typeof search.filters === 'string'
          ? JSON.parse(search.filters)
          : search.filters || {};
        const searchType = search.search_type;

        const lastNotifiedAt = search.last_notified_at
          ? new Date(search.last_notified_at).getTime()
          : 0;
        // Never notified yet → only surface matches newer than the saved search
        // itself. The repository mapper always sets created_at.
        const searchCreatedAt = search.created_at;
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
          // Profiles store skills by name, but saved-search filters may contain
          // skill IDs — resolve them to names so ID-based searches match here
          // exactly as they do in the live search API (and executeSavedSearch).
          const resolvedFilters = { ...filters };
          if (Array.isArray(resolvedFilters.skills)) {
            resolvedFilters.skills = await resolveSkillFilterToNames(
              resolvedFilters.skills.map((s: unknown) => String(s))
            );
          }
          const filtered = filterFreelancersBySavedSearch(allProfiles, resolvedFilters);
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
              savedSearchId: search.id,
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
          search.id,
          {
            last_notified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        );

        logger.info(`Notified user ${search.user_id} of ${matches.length} new match(es) for saved search ${search.id}`);
      } catch (error) {
        logger.error(`Failed to execute saved search ${search.id}:`, error);
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

    const deletedTotal = await notificationRepository.deleteReadBefore(thirtyDaysAgo);

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
    const activeContracts = await contractRepository.findActiveContracts();

    await Promise.all(
      activeContracts.map(async (contract) => {
        try {
          const projectId = contract.project_id;
          if (!projectId) return;

          const project = await projectRepository.getProjectById(projectId);
          if (!project) {
            logger.error('Failed to recover stuck releasing milestone for a contract', {
              contractId: contract.id,
            });
            return;
          }

          const milestones = parseMilestones(project);
          const stuckIndexes = milestones.reduce<number[]>((acc, m, i) => {
            if (m.status === 'releasing') {
              const updated = m.updated_at ? new Date(m.updated_at).getTime() : 0;
              if (updated > 0 && now - updated > RELEASING_STUCK_GRACE_MS) acc.push(i);
            }
            return acc;
          }, []);

          if (stuckIndexes.length === 0) return;

          const stuckIndexSet = new Set(stuckIndexes);
          const recovered = milestones.map((m, i) =>
            stuckIndexSet.has(i) ? { ...m, status: 'submitted' } : m
          );

          await projectRepository.updateProject(projectId, {
            milestones: recovered as unknown as ProjectEntity['milestones'],
          });

          logger.warn('Recovered stuck "releasing" milestones back to "submitted"', {
            contractId: contract.id,
            recoveredMilestoneIndexes: stuckIndexes,
          });
        } catch (err) {
          logger.error('Failed to recover stuck releasing milestone for a contract', {
            contractId: contract.id,
            error: err,
          });
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

  // Reconcile contract payment status against the on-chain escrow ledger -
  // Every hour. Read-only: divergences are reported via error/warn logs.
  cron.schedule('0 * * * *', () => {
    logger.info('Running scheduled job: Reconcile contract payments with escrow ledger');
    reconcileContractPayments();
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
