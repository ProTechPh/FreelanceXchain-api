import cron from 'node-cron';
import { getSupabaseClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { sendWeeklyDigestEmail } from './email-delivery-service.js';

/**
 * Auto-close expired projects
 */
async function autoCloseExpiredProjects(): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    
    const { data: expiredProjects, error } = await supabase
      .from('projects')
      .select('id, title')
      .eq('status', 'open')
      .lt('deadline', new Date().toISOString());

    if (error) throw error;

    if (expiredProjects && expiredProjects.length > 0) {
      const { error: updateError } = await supabase
        .from('projects')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .in('id', expiredProjects.map(p => p.id));

      if (updateError) throw updateError;

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
    const supabase = getSupabaseClient();

    // Get users with weekly digest enabled
    const { data: users, error } = await supabase
      .from('email_preferences')
      .select('user_id, users!inner(email, full_name)')
      .eq('weekly_digest', true);

    if (error) throw error;

    if (!users || users.length === 0) {
      logger.info('No users with weekly digest enabled');
      return;
    }

    for (const user of users) {
      try {
        // Get user stats for the week
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        // Count new projects
        const { count: newProjects } = await supabase
          .from('projects')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', weekAgo.toISOString());

        // Count new messages
        const { count: newMessages } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('receiver_id', user.user_id)
          .eq('is_read', false);

        // Count pending milestones
        const { count: pendingMilestones } = await supabase
          .from('milestones')
          .select('*, contracts!inner(freelancer_id)', { count: 'exact', head: true })
          .eq('contracts.freelancer_id', user.user_id)
          .eq('status', 'pending');

        // Get top projects
        const { data: topProjects } = await supabase
          .from('projects')
          .select('title, budget')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(5);

        await sendWeeklyDigestEmail((user.users as any).email, {
          userName: (user.users as any).full_name || 'User',
          newProjects: newProjects || 0,
          newMessages: newMessages || 0,
          pendingMilestones: pendingMilestones || 0,
          topProjects: (topProjects || []).map(p => ({
            title: p.title,
            budget: `$${p.budget}`,
            url: `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/projects/${(p as any).id}`,
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
    const supabase = getSupabaseClient();

    // Get saved searches with notifications enabled
    const { data: searches, error } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('notify_on_new', true);

    if (error) throw error;

    if (!searches || searches.length === 0) {
      return;
    }

    for (const search of searches) {
      try {
        // Execute search based on type
        let query = supabase.from(search.search_type === 'project' ? 'projects' : 'freelancer_profiles').select('*');

        // Apply filters from saved search
        const filters = search.filters as Record<string, any>;
        Object.keys(filters).forEach(key => {
          if (filters[key] !== undefined && filters[key] !== null) {
            query = query.eq(key, filters[key]);
          }
        });

        const { data: results } = await query.limit(10);

        if (results && results.length > 0) {
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
    const supabase = getSupabaseClient();

    // Delete read notifications older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('is_read', true)
      .lt('created_at', thirtyDaysAgo.toISOString());

    if (error) throw error;

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
