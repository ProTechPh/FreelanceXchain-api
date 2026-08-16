import cron from 'node-cron';
import { logger } from '../config/logger.js';
import { sendWeeklyDigestEmail } from './email-delivery-service.js';
import { projectRepository, type ProjectEntity, type ProjectStatus } from '../repositories/project-repository.js';
import { contractRepository, type ContractEntity } from '../repositories/contract-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { messageRepository } from '../repositories/message-repository.js';
import { notificationRepository } from '../repositories/notification-repository.js';
import { savedSearchRepository } from '../repositories/saved-search-repository.js';
import { emailPreferenceRepository } from '../repositories/email-preference-repository.js';
import { freelancerProfileRepository } from '../repositories/freelancer-profile-repository.js';

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

type WeeklyDigestData = {
  userEmail: string;
  userFullName: string;
  newProjectsCount: number;
  newMessagesCount: number;
  pendingMilestonesCount: number;
  topProjects: Array<{ title: string; budget: string; url: string }>;
};

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
  topProjects: WeeklyDigestData['topProjects'];
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

  const frontendUrl = process.env['FRONTEND_URL'] || 'http://localhost:3000';
  const topProjects = allProjects
    .filter(p => p.status === 'open')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map(p => ({
      title: p.title,
      budget: `$${p.budget}`,
      url: `${frontendUrl}/projects/${p.id}`,
    }));

  return {
    newProjectsCount,
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
    const [snapshot, usersById, contractsByFreelancer, unreadCountsByUser] = await Promise.all([
      loadWeeklyDigestSnapshot(),
      userRepository.getUsersByIds(userIds),
      contractRepository.findAllByFreelancers(userIds),
      messageRepository.getUnreadMessageCountsForUsers(userIds),
    ]);

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
 * Execute saved searches and notify users
 */
async function executeSavedSearches(): Promise<void> {
  try {
    const savedSearches = await savedSearchRepository.findAllWithNotifyEnabled();

    if (savedSearches.length === 0) {
      return;
    }

    for (const search of savedSearches) {
      try {
        const filters: Record<string, unknown> = typeof search.filters === 'string'
          ? JSON.parse(search.filters)
          : search.filters || {};
        const searchCollection = search.search_type === 'project'
          ? projectRepository
          : freelancerProfileRepository;

        const results = await searchCollection.findByFilters(filters, 10);

        if (results.length > 0) {
          // TODO: Create notification for new matches
          logger.info(`Found ${results.length} results for saved search ${search.id}`);
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

  logger.info('Scheduler service initialized successfully');
}

/**
 * Stop all scheduled jobs (for graceful shutdown)
 */
export function stopScheduler(): void {
  cron.getTasks().forEach(task => task.stop());
  logger.info('Scheduler service stopped');
}
