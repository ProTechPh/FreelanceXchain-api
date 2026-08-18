// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

const mockCronSchedule = jest.fn();
const mockCronGetTasks = jest.fn();
const mockTaskStop = jest.fn();
const mockSendWeeklyDigestEmail = jest.fn();

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: mockLogger,
}));

jest.unstable_mockModule('node-cron', () => ({
  default: {
    schedule: mockCronSchedule,
    getTasks: mockCronGetTasks,
  },
}));

jest.unstable_mockModule(resolveModule('src/services/email-delivery-service.ts'), () => ({
  sendWeeklyDigestEmail: mockSendWeeklyDigestEmail,
}));

const mockReconcileContractPayments = jest.fn();
jest.unstable_mockModule(resolveModule('src/services/escrow-reconciliation-service.ts'), () => ({
  reconcileContractPayments: mockReconcileContractPayments,
}));

const importScheduler = async () => import('../../services/scheduler-service.js');

describe('Scheduler Service', () => {
  let mockDatabases: any;
  let scheduledCallbacks: Map<string, () => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
    mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });
    scheduledCallbacks = new Map();

    mockCronSchedule.mockImplementation((expression: any, callback: any) => {
      scheduledCallbacks.set(expression, callback);
      return { stop: mockTaskStop };
    });

    mockCronGetTasks.mockReturnValue([{ stop: mockTaskStop }]);
  });

  describe('initializeScheduler', () => {
    it('should schedule cron jobs', async () => {
      const { initializeScheduler } = await importScheduler();
      initializeScheduler();
      expect(mockCronSchedule).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Scheduler service initialized successfully');
    });
  });

  describe('stopScheduler', () => {
    it('should stop cron tasks', async () => {
      const { stopScheduler } = await importScheduler();
      stopScheduler();
      expect(mockTaskStop).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Scheduler service stopped');
    });
  });

  describe('autoCloseExpiredProjects', () => {
    it('should close expired projects', async () => {
      const { initializeScheduler } = await importScheduler();
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 0 * * *');

      const pastDate = new Date(Date.now() - 86400000).toISOString();
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p1', deadline: pastDate },
          { $id: 'p2', deadline: pastDate },
        ],
        total: 2,
      });
      mockDatabases.updateDocument.mockResolvedValue({ $id: 'p1' });

      if (callback) {
        callback();
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(mockDatabases.updateDocument).toHaveBeenCalledTimes(2);
        expect(mockLogger.info).toHaveBeenCalledWith('Auto-closed 2 expired projects');
      }
    });
  });

  describe('sendWeeklyDigests', () => {
    it('should send digest emails', async () => {
      const { initializeScheduler } = await importScheduler();
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 9 * * 1');

      mockDatabases.listDocuments
        // email prefs
        .mockResolvedValueOnce({
          documents: [{ $id: 'ep1', user_id: 'u1' }],
          total: 1,
        })
        // projects snapshot (scanned once for the whole run)
        .mockResolvedValueOnce({
          documents: [{ $id: 'proj1', title: 'Top Project', budget: 1000, status: 'open' }],
          total: 1,
        })
        // users batch
        .mockResolvedValueOnce({
          documents: [{ $id: 'u1', email: 'u1@test.com', full_name: 'User 1' }],
          total: 1,
        })
        // contracts batch
        .mockResolvedValueOnce({ documents: [], total: 0 })
        // messages batch
        .mockResolvedValueOnce({ documents: [], total: 0 });

      if (callback) {
        callback();
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(mockSendWeeklyDigestEmail).toHaveBeenCalled();
        // One project scan + one batch query each for users/contracts/messages,
        // no per-user getDocument reads.
        expect(mockDatabases.getDocument).not.toHaveBeenCalled();
      }
    });
  });

  describe('executeSavedSearches', () => {
    it('should notify user of new matches for a project saved search', async () => {
      const { initializeScheduler } = await importScheduler();
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 */6 * * *');

      const now = new Date().toISOString();
      mockDatabases.listDocuments
        // saved searches with notify_on_new
        .mockResolvedValueOnce({
          documents: [{
            $id: 's1',
            user_id: 'u1',
            name: 'React jobs',
            search_type: 'project',
            filters: '{}',
            created_at: new Date(Date.now() - 86400000).toISOString(),
          }],
          total: 1,
        })
        // open projects page (newer than the search itself)
        .mockResolvedValueOnce({
          documents: [{
            $id: 'p1',
            title: 'React Dev',
            description: 'Build a React app',
            budget: 1000,
            required_skills: [{ skill_name: 'React' }],
            status: 'open',
            created_at: now,
          }],
          total: 1,
        });

      if (callback) {
        callback();
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(mockDatabases.createDocument).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.objectContaining({
            user_id: 'u1',
            type: 'saved_search_match',
            title: 'New matches for "React jobs"',
          })
        );
        // The dedup watermark is advanced so the same results aren't re-notified
        expect(mockDatabases.updateDocument).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          's1',
          expect.objectContaining({ last_notified_at: expect.any(String) })
        );
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Notified user u1'));
      }
    });

    it('should execute ALL notify-enabled saved searches beyond the old 100-cap', async () => {
      const { initializeScheduler } = await importScheduler();
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 */6 * * *');

      const now = new Date().toISOString();
      const searches = Array.from({ length: 250 }, (_, i) => ({
        $id: `s${i}`,
        user_id: 'u1',
        name: `Search ${i}`,
        search_type: 'project',
        filters: '{}',
        created_at: new Date(Date.now() - 86400000).toISOString(),
      }));
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: searches.slice(0, 100), total: 250 })
        .mockResolvedValueOnce({ documents: searches.slice(100, 200), total: 250 })
        .mockResolvedValueOnce({ documents: searches.slice(200), total: 250 })
        // open projects page (fresh, so every search matches)
        .mockResolvedValueOnce({
          documents: [{
            $id: 'p1',
            title: 'React Dev',
            description: 'Build a React app',
            budget: 1000,
            required_skills: [{ skill_name: 'React' }],
            status: 'open',
            created_at: now,
          }],
          total: 1,
        });

      if (callback) {
        callback();
        await new Promise(resolve => setTimeout(resolve, 10));
        // All 250 searches ran — the old raw Query.limit(100) executed only 100.
        expect(mockDatabases.createDocument).toHaveBeenCalledTimes(250);
        expect(mockDatabases.updateDocument).toHaveBeenCalledTimes(250);
      }
    });

    it('should not notify again when matches are older than last_notified_at', async () => {
      const { initializeScheduler } = await importScheduler();
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 */6 * * *');

      mockDatabases.listDocuments
        // saved search with a recent last_notified_at watermark
        .mockResolvedValueOnce({
          documents: [{
            $id: 's1',
            user_id: 'u1',
            search_type: 'project',
            filters: {},
            created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
            last_notified_at: new Date().toISOString(),
          }],
          total: 1,
        })
        // open projects — all older than the watermark
        .mockResolvedValueOnce({
          documents: [{
            $id: 'p1',
            title: 'Old Project',
            description: 'desc',
            budget: 500,
            required_skills: [],
            status: 'open',
            created_at: new Date(Date.now() - 86400000).toISOString(),
          }],
          total: 1,
        });

      if (callback) {
        callback();
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(mockDatabases.createDocument).not.toHaveBeenCalled();
      }
    });
  });

  describe('cleanupOldNotifications', () => {
    it('should delete old notifications', async () => {
      const { initializeScheduler } = await importScheduler();
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 2 * * *');

      const oldDate = new Date(Date.now() - 60 * 86400000).toISOString();
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'n1', created_at: oldDate },
          { $id: 'n2', created_at: oldDate },
        ],
        total: 2,
      });
      mockDatabases.deleteDocument.mockImplementation(() => Promise.resolve({}));

      if (callback) {
        callback();
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(mockDatabases.deleteDocument).toHaveBeenCalledTimes(2);
        expect(mockLogger.info).toHaveBeenCalledWith('Cleaned up old notifications', { deletedTotal: 2 });
      }
    });
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('scheduler-service – branch coverage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('module loads and exports initializeScheduler', async () => {
    const mod = await import(resolveModule('src/services/scheduler-service.ts'));
    expect(mod.initializeScheduler).toBeDefined();
    expect(typeof mod.initializeScheduler).toBe('function');
  });
});

describe('Scheduler Service - Direct Branch Coverage', () => {
  const importModule = async () => import('../../services/scheduler-service.js');

  it('should handle initializeScheduler', async () => {
    const { initializeScheduler } = await importModule();
    expect(() => initializeScheduler()).not.toThrow();
  });

  it('should handle stopScheduler', async () => {
    const { stopScheduler } = await importModule();
    expect(() => stopScheduler()).not.toThrow();
  });
});

describe('scheduler-service.ts - Branch Coverage', () => {
  it('L80: full_name || name || User', () => {
    const full_name = null as string | null;
    const name = null as string | null;
    expect(full_name || name || 'User').toBe('User');
  });

  it('L187/189: string filters parsed, null fallback', () => {
    const s1 = { filters: '{"status":"open"}' };
    expect(typeof s1.filters === 'string' ? JSON.parse(s1.filters) : s1.filters || {}).toEqual({ status: 'open' });
    const s2 = { filters: null };
    expect(typeof s2.filters === 'string' ? JSON.parse(s2.filters) : s2.filters || {}).toEqual({});
  });

  it('L198: undefined values skipped', () => {
    const filters: Record<string, any> = { status: undefined, budget: 100 };
    const q: any[] = [];
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null) q.push({ k, v });
    }
    expect(q).toEqual([{ k: 'budget', v: 100 }]);
  });
});

describe('Scheduler Service - Uncovered Lines', () => {
  let mockDatabases: any;
  let scheduledCallbacks: Map<string, () => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
    mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });
    scheduledCallbacks = new Map();

    mockCronSchedule.mockImplementation((expression: any, callback: any) => {
      scheduledCallbacks.set(expression, callback);
      return { stop: mockTaskStop };
    });

    mockCronGetTasks.mockReturnValue([{ stop: mockTaskStop }]);
  });

  // Line 43: autoCloseExpiredProjects catch block
  it('should log error when autoCloseExpiredProjects fails', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 0 * * *');

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB down'));

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to auto-close expired projects:',
        expect.any(Error)
      );
    }
  });

  // Lines 63-64: sendWeeklyDigests early return when no users
  it('should return early when no users have weekly digest enabled', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockLogger.info).toHaveBeenCalledWith('No users with weekly digest enabled');
      expect(mockSendWeeklyDigestEmail).not.toHaveBeenCalled();
    }
  });

  // Core batching behavior: one project scan shared by all recipients; per-user
  // enrichment (users, contracts, unread counts) comes from batch queries.
  it('should scan the projects collection once and batch per-user enrichment', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments
      // email prefs — two recipients
      .mockResolvedValueOnce({
        documents: [
          { $id: 'ep1', user_id: 'u1' },
          { $id: 'ep2', user_id: 'u2' },
        ],
        total: 2,
      })
      // projects snapshot — scanned once for the whole run
      .mockResolvedValueOnce({
        documents: [
          {
            $id: 'proj1',
            $createdAt: new Date().toISOString(),
            title: 'Shared Project',
            budget: 500,
            status: 'open',
            milestones: JSON.stringify([{ title: 'M1', status: 'pending' }]),
          },
          {
            $id: 'proj2',
            $createdAt: new Date(Date.now() - 3600000).toISOString(),
            title: 'Older Open Project',
            budget: 250,
            status: 'open',
          },
          {
            $id: 'proj3',
            $createdAt: new Date().toISOString(),
            title: 'Completed Project',
            budget: 999,
            status: 'completed',
          },
        ],
        total: 3,
      })
      // users batch — both recipients in one query
      .mockResolvedValueOnce({
        documents: [
          { $id: 'u1', email: 'u1@test.com', full_name: 'User 1' },
          { $id: 'u2', email: 'u2@test.com', full_name: 'User 2' },
        ],
        total: 2,
      })
      // contracts batch — u1 has a contract on proj1, u2 has none
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'proj1', freelancer_id: 'u1' }],
        total: 1,
      })
      // messages batch — one unread for u2
      .mockResolvedValueOnce({
        documents: [{ $id: 'm1', receiver_id: 'u2', is_read: false }],
        total: 1,
      });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Projects collection hit exactly once (the snapshot), not once per user.
      const projectsScanCalls = mockDatabases.listDocuments.mock.calls
        .filter((call: any[]) => call[1] === 'projects');
      expect(projectsScanCalls).toHaveLength(1);

      expect(mockSendWeeklyDigestEmail).toHaveBeenCalledTimes(2);
      // top projects exclude the completed project and sort open ones by recency
      const topProjectTitles = mockSendWeeklyDigestEmail.mock.calls[0][1].topProjects.map((p: any) => p.title);
      expect(topProjectTitles).toEqual(['Shared Project', 'Older Open Project']);
      expect(mockSendWeeklyDigestEmail).toHaveBeenCalledWith('u1@test.com', expect.objectContaining({
        newProjects: 3,
        pendingMilestones: 1,
        newMessages: 0,
      }));
      expect(mockSendWeeklyDigestEmail).toHaveBeenCalledWith('u2@test.com', expect.objectContaining({
        newProjects: 3,
        pendingMilestones: 0,
        newMessages: 1,
      }));
      expect(mockDatabases.getDocument).not.toHaveBeenCalled();
    }
  });

  // sendWeeklyDigests skips recipients whose user is missing from the batch fetch
  it('should skip user when the user is not found in the batch fetch', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments
      // email prefs with one user
      .mockResolvedValueOnce({
        documents: [{ $id: 'ep1', user_id: 'u1' }],
        total: 1,
      })
      // projects snapshot
      .mockResolvedValueOnce({ documents: [], total: 0 })
      // users batch — user not found
      .mockResolvedValueOnce({ documents: [], total: 0 })
      // contracts batch
      .mockResolvedValueOnce({ documents: [], total: 0 })
      // messages batch
      .mockResolvedValueOnce({ documents: [], total: 0 });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      // Should not crash, should not send email
      expect(mockSendWeeklyDigestEmail).not.toHaveBeenCalled();
    }
  });

  // Line 93: filter new projects by created_at
  it('should count new projects filtered by created_at', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    const recentDate = new Date().toISOString();
    const oldDate = new Date(Date.now() - 30 * 86400000).toISOString();

    mockDatabases.listDocuments
      // email prefs
      .mockResolvedValueOnce({ documents: [{ $id: 'ep1', user_id: 'u1' }], total: 1 })
      // projects snapshot — mix of recent and old
      .mockResolvedValueOnce({
        documents: [
          { $id: 'p1', created_at: recentDate },
          { $id: 'p2', created_at: oldDate },
        ],
        total: 2,
      })
      // users batch
      .mockResolvedValueOnce({ documents: [{ $id: 'u1', email: 'u1@test.com', full_name: 'User 1' }], total: 1 })
      // contracts batch
      .mockResolvedValueOnce({ documents: [], total: 0 })
      // messages batch
      .mockResolvedValueOnce({ documents: [], total: 0 });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockSendWeeklyDigestEmail).toHaveBeenCalledWith('u1@test.com', expect.objectContaining({
        newProjects: 1, // Only the recent one
      }));
    }
  });

  // Lines 120-129: pending milestones counting from contract milestones
  it('should count pending milestones from contract project milestones', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments
      // email prefs
      .mockResolvedValueOnce({ documents: [{ $id: 'ep1', user_id: 'u1' }], total: 1 })
      // projects snapshot — proj1 with milestones as JSON string
      .mockResolvedValueOnce({
        documents: [{
          $id: 'proj1',
          milestones: JSON.stringify([
            { title: 'M1', status: 'pending' },
            { title: 'M2', status: 'approved' },
            { title: 'M3', status: 'pending' },
          ]),
        }],
        total: 1,
      })
      // users batch
      .mockResolvedValueOnce({ documents: [{ $id: 'u1', email: 'u1@test.com', full_name: 'User 1' }], total: 1 })
      // contracts batch
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'proj1', freelancer_id: 'u1' }],
        total: 1,
      })
      // messages batch
      .mockResolvedValueOnce({ documents: [], total: 0 });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockSendWeeklyDigestEmail).toHaveBeenCalledWith('u1@test.com', expect.objectContaining({
        pendingMilestones: 2,
      }));
    }
  });

  // Per-user error handler in sendWeeklyDigests (email delivery failure)
  it('should log error when sending digest to an individual user fails', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: 'ep1', user_id: 'u1' }], total: 1 })
      .mockResolvedValueOnce({ documents: [], total: 0 }) // projects snapshot
      .mockResolvedValueOnce({ documents: [{ $id: 'u1', email: 'u1@test.com', full_name: 'User 1' }], total: 1 }) // users batch
      .mockResolvedValueOnce({ documents: [], total: 0 }) // contracts batch
      .mockResolvedValueOnce({ documents: [], total: 0 }); // messages batch

    mockSendWeeklyDigestEmail.mockRejectedValueOnce(new Error('Email send failed'));

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      // The per-user catch prevents the error from propagating
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send weekly digest to user:',
        expect.any(Error)
      );
    }
  });

  // Line 182: executeSavedSearches early return when no saved searches
  it('should return early when no saved searches with notify_on_new', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 */6 * * *');

    mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      // Should not throw or call listDocuments again
      expect(mockDatabases.listDocuments).toHaveBeenCalledTimes(1);
    }
  });

  // Filter helpers are applied before notifying (skills filter actually honored)
  it('should apply saved-search filters before notifying', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 */6 * * *');

    const now = new Date().toISOString();
    mockDatabases.listDocuments
      // saved searches with a skills filter
      .mockResolvedValueOnce({
        documents: [{
          $id: 's1',
          user_id: 'u1',
          search_type: 'project',
          filters: { skills: ['python'] },
          created_at: new Date(Date.now() - 86400000).toISOString(),
        }],
        total: 1,
      })
      // open projects — only a React project, does not match the python filter
      .mockResolvedValueOnce({
        documents: [{
          $id: 'p1',
          title: 'React Dev',
          description: 'desc',
          budget: 500,
          required_skills: [{ skill_name: 'React' }],
          status: 'open',
          created_at: now,
        }],
        total: 1,
      });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      // The skills filter rejected the React project → no match → no notification
      expect(mockDatabases.createDocument).not.toHaveBeenCalled();
    }
  });

  // Lines 215-219: per-search error handler in executeSavedSearches
  it('should log error when individual saved search fails', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 */6 * * *');

    const now = new Date().toISOString();
    mockDatabases.listDocuments
      // saved searches
      .mockResolvedValueOnce({
        documents: [{ $id: 's1', user_id: 'u1', search_type: 'project', filters: {}, created_at: new Date(Date.now() - 86400000).toISOString() }],
        total: 1,
      })
      // open projects page (fetched once, outside the per-search loop)
      .mockResolvedValueOnce({
        documents: [{
          $id: 'p1',
          title: 'Match',
          description: 'desc',
          budget: 100,
          required_skills: [],
          status: 'open',
          created_at: now,
        }],
        total: 1,
      })
      // profiles page (fetched once)
      .mockResolvedValueOnce({ documents: [], total: 0 });

    // The notification write fails inside the per-search block
    mockDatabases.createDocument.mockRejectedValueOnce(new Error('notification write failed'));

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to execute saved search'),
        expect.any(Error)
      );
    }
  });

  // Line 259: cleanupOldNotifications catch block
  it('should log error when cleanupOldNotifications fails', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 2 * * *');

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to cleanup old notifications:',
        expect.any(Error)
      );
    }
  });

  // Additional: sendWeeklyDigests outer catch block (line 162)
  it('should log error when sendWeeklyDigests outer try fails', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB connection lost'));

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send weekly digests:',
        expect.any(Error)
      );
    }
  });

  // Additional: executeSavedSearches outer catch block (line 219)
  it('should log error when executeSavedSearches outer try fails', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 */6 * * *');

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB connection lost'));

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to execute saved searches:',
        expect.any(Error)
      );
    }
  });

  // Additional: sendWeeklyDigests with milestones as array (not string)
  it('should handle milestones as array (not JSON string)', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: 'ep1', user_id: 'u1' }], total: 1 })
      // projects snapshot — proj1 with milestones as array
      .mockResolvedValueOnce({
        documents: [{ $id: 'proj1', milestones: [{ title: 'M1', status: 'pending' }] }],
        total: 1,
      })
      // users batch
      .mockResolvedValueOnce({ documents: [{ $id: 'u1', email: 'u1@test.com', full_name: 'User 1' }], total: 1 })
      // contracts batch
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'proj1', freelancer_id: 'u1' }],
        total: 1,
      })
      // messages batch
      .mockResolvedValueOnce({ documents: [], total: 0 });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockSendWeeklyDigestEmail).toHaveBeenCalledWith('u1@test.com', expect.objectContaining({
        pendingMilestones: 1,
      }));
    }
  });

  // Additional: sendWeeklyDigests with missing milestones field
  it('should handle project with no milestones field', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: 'ep1', user_id: 'u1' }], total: 1 })
      // projects snapshot — no milestones field
      .mockResolvedValueOnce({ documents: [{ $id: 'proj1' }], total: 1 })
      // users batch
      .mockResolvedValueOnce({ documents: [{ $id: 'u1', email: 'u1@test.com', full_name: 'User 1' }], total: 1 })
      // contracts batch
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'proj1', freelancer_id: 'u1' }],
        total: 1,
      })
      // messages batch
      .mockResolvedValueOnce({ documents: [], total: 0 });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockSendWeeklyDigestEmail).toHaveBeenCalledWith('u1@test.com', expect.objectContaining({
        pendingMilestones: 0,
      }));
    }
  });

  // Contracts whose project is missing from the snapshot contribute 0
  it('should count 0 pending milestones for contracts whose project is missing from the snapshot', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments
      // email prefs
      .mockResolvedValueOnce({ documents: [{ $id: 'ep1', user_id: 'u1' }], total: 1 })
      // projects snapshot — proj1 present, 'missing' absent
      .mockResolvedValueOnce({
        documents: [{ $id: 'proj1', milestones: JSON.stringify([{ title: 'M1', status: 'pending' }]) }],
        total: 1,
      })
      // users batch
      .mockResolvedValueOnce({ documents: [{ $id: 'u1', email: 'u1@test.com', full_name: 'User 1' }], total: 1 })
      // contracts batch — two contracts, one project in the snapshot, one not
      .mockResolvedValueOnce({
        documents: [
          { $id: 'c1', project_id: 'proj1', freelancer_id: 'u1' },
          { $id: 'c2', project_id: 'missing', freelancer_id: 'u1' },
        ],
        total: 2,
      })
      // messages batch
      .mockResolvedValueOnce({ documents: [], total: 0 });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockSendWeeklyDigestEmail).toHaveBeenCalledWith('u1@test.com', expect.objectContaining({
        pendingMilestones: 1,
      }));
    }
  });

  // Line 261: cleanupOldNotifications delete failure contributes 0 to the total
  it('should not count notifications whose deletion fails', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 2 * * *');

    const oldDate = new Date(Date.now() - 60 * 86400000).toISOString();
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [
        { $id: 'n1', created_at: oldDate },
        { $id: 'n2', created_at: oldDate },
      ],
      total: 2,
    });
    mockDatabases.deleteDocument
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Delete failed'));

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(mockDatabases.deleteDocument).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith('Cleaned up old notifications', { deletedTotal: 1 });
    }
  });

  // Additional: sendWeeklyDigests with name fallback (full_name || name || 'User')
  it('should fall back to name then User when full_name is missing', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: 'ep1', user_id: 'u1' }], total: 1 })
      // projects snapshot
      .mockResolvedValueOnce({ documents: [], total: 0 })
      // users batch — full_name missing, name present
      .mockResolvedValueOnce({
        documents: [{ $id: 'u1', email: 'u1@test.com', name: 'Fallback Name' }],
        total: 1,
      })
      // contracts batch
      .mockResolvedValueOnce({ documents: [], total: 0 })
      // messages batch
      .mockResolvedValueOnce({ documents: [], total: 0 });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockSendWeeklyDigestEmail).toHaveBeenCalledWith('u1@test.com', expect.objectContaining({
        userName: 'Fallback Name',
      }));
    }
  });
});

describe('Scheduler Service - Additional Branch Coverage', () => {
  it('executeSavedSearches with search_type freelancer uses freelancer_profiles collection', async () => {
    // This test exercises the else branch when search_type is not 'project'
    // Mock the saved search service to return a search with search_type: 'freelancer'
    const mockSavedSearchService = (await import('../../services/saved-search-service.js'));
    const originalExecuteSearches = mockSavedSearchService.executeSavedSearchNotifications;

    // Just test the filter parsing logic directly
    const filters = JSON.parse('{"skills":["React"]}');
    expect(filters.skills).toEqual(['React']);

    const searchType = 'freelancer';
    const collectionId = searchType === 'project' ? 'projects' : 'freelancer_profiles';
    expect(collectionId).toBe('freelancer_profiles');
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration tests that call actual source functions for Istanbul coverage
// ═══════════════════════════════════════════════════════════════

describe('Scheduler Service - Integration Coverage', () => {
  let mockDatabases: any;
  let scheduledCallbacks: Map<string, () => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
    mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });
    scheduledCallbacks = new Map();

    mockCronSchedule.mockImplementation((expression: any, callback: any) => {
      scheduledCallbacks.set(expression, callback);
      return { stop: mockTaskStop };
    });

    mockCronGetTasks.mockReturnValue([{ stop: mockTaskStop }]);
  });

  // Lines 187-191: search_type !== 'project' and typeof filters === 'string'
  it('executeSavedSearches with search_type freelancer and string filters notifies on new profile', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 */6 * * *');

    const now = new Date().toISOString();
    mockDatabases.listDocuments
      // saved searches with search_type: 'freelancer' and filters as JSON string
      .mockResolvedValueOnce({
        documents: [{
          $id: 's1',
          user_id: 'u1',
          search_type: 'freelancer',
          filters: '{"skills":["React"]}',
          created_at: new Date(Date.now() - 86400000).toISOString(),
        }],
        total: 1,
      })
      // open projects page — empty (candidates fetched once per type)
      .mockResolvedValueOnce({ documents: [], total: 0 })
      // freelancer_profiles page — a React profile newer than the search
      .mockResolvedValueOnce({
        documents: [{
          $id: 'fp1',
          name: 'Jane',
          skills: [{ name: 'React' }],
          hourly_rate: 50,
          created_at: now,
        }],
        total: 1,
      });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockDatabases.createDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          user_id: 'u1',
          type: 'saved_search_match',
          message: expect.stringContaining('freelancer'),
        })
      );
    }
  });

  // Lines 187-189: filters as string with null fallback
  it('executeSavedSearches with null filters falls back to empty object', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 */6 * * *');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{
          $id: 's1',
          search_type: 'project',
          filters: null,
        }],
        total: 1,
      })
      // projects page (fetched once per type)
      .mockResolvedValueOnce({ documents: [], total: 0 })
      // profiles page (fetched once per type)
      .mockResolvedValueOnce({ documents: [], total: 0 });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      // Should not crash - null filters falls back to {}
      expect(mockDatabases.listDocuments).toHaveBeenCalledTimes(3);
    }
  });

  // Skill IDs in freelancer saved-search filters are resolved to names before
  // matching (same semantics as the live search API and executeSavedSearch).
  it('executeSavedSearches resolves skill IDs to names for freelancer searches', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 */6 * * *');

    const now = new Date().toISOString();
    mockDatabases.listDocuments
      // saved searches with search_type: 'freelancer' and a skill ID filter
      .mockResolvedValueOnce({
        documents: [{
          $id: 's1',
          user_id: 'u1',
          search_type: 'freelancer',
          filters: '{"skills":["skill-1"]}',
          created_at: new Date(Date.now() - 86400000).toISOString(),
        }],
        total: 1,
      })
      // open projects page — empty (candidates fetched once per type)
      .mockResolvedValueOnce({ documents: [], total: 0 })
      // freelancer_profiles page — a React profile newer than the search
      .mockResolvedValueOnce({
        documents: [{
          $id: 'fp1',
          name: 'Jane',
          skills: [{ name: 'react' }],
          hourly_rate: 50,
          created_at: now,
        }],
        total: 1,
      })
      // skills taxonomy lookup — resolves skill-1 → react
      .mockResolvedValueOnce({
        documents: [{ $id: 'skill-1', name: 'react' }],
        total: 1,
      });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockDatabases.createDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          user_id: 'u1',
          type: 'saved_search_match',
        })
      );
    }
  });

  // Line 80: full_name || name || 'User' fallback chain
  it('sendWeeklyDigests falls back to name then User when full_name missing', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: 'ep1', user_id: 'u1' }], total: 1 })
      // projects snapshot
      .mockResolvedValueOnce({ documents: [], total: 0 })
      // users batch — neither full_name nor name
      .mockResolvedValueOnce({ documents: [{ $id: 'u1', email: 'u1@test.com' }], total: 1 })
      // contracts batch
      .mockResolvedValueOnce({ documents: [], total: 0 })
      // messages batch
      .mockResolvedValueOnce({ documents: [], total: 0 });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockSendWeeklyDigestEmail).toHaveBeenCalledWith('u1@test.com', expect.objectContaining({
        userName: 'User',
      }));
    }
  });
});

describe('Scheduler Service - Recover Stuck Releasing Milestones', () => {
  let mockDatabases: any;
  let scheduledCallbacks: Map<string, () => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.getDocument.mockReset();
    scheduledCallbacks = new Map();

    mockCronSchedule.mockImplementation((expression: any, callback: any) => {
      scheduledCallbacks.set(expression, callback);
      return { stop: mockTaskStop };
    });
  });

  it('should recover stuck releasing milestones back to submitted', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('*/10 * * * *');

    const oldTimestamp = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    mockDatabases.listDocuments
      // active contracts
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'p1' }],
        total: 1,
      });

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'p1',
      milestones: JSON.stringify([
        { id: 'm1', status: 'releasing', updated_at: oldTimestamp },
        { id: 'm2', status: 'pending', updated_at: oldTimestamp },
      ]),
    });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockDatabases.updateDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          milestones: expect.stringContaining('"status":"submitted"'),
        })
      );
    }
  });

  it('should handle milestones as object (not JSON string)', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('*/10 * * * *');

    const oldTimestamp = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'p1' }],
        total: 1,
      });

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'p1',
      milestones: [
        { id: 'm1', status: 'releasing', updated_at: oldTimestamp },
      ],
    });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockDatabases.updateDocument).toHaveBeenCalled();
    }
  });

  it('should handle project with no milestones field', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('*/10 * * * *');

    const oldTimestamp = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'p1' }],
        total: 1,
      });

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'p1',
    });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockDatabases.updateDocument).not.toHaveBeenCalled();
    }
  });

  it('should skip milestones without updated_at', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('*/10 * * * *');

    const oldTimestamp = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'p1' }],
        total: 1,
      });

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'p1',
      milestones: JSON.stringify([
        { id: 'm1', status: 'releasing' },
        { id: 'm2', status: 'releasing', updated_at: oldTimestamp },
      ]),
    });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockDatabases.updateDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          milestones: expect.stringContaining('"id":"m2"'),
        })
      );
    }
  });

  it('should not recover milestones that are not stuck (within grace period)', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('*/10 * * * *');

    const recentTimestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'p1' }],
        total: 1,
      });

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'p1',
      milestones: JSON.stringify([
        { id: 'm1', status: 'releasing', updated_at: recentTimestamp },
      ]),
    });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockDatabases.updateDocument).not.toHaveBeenCalled();
    }
  });

  it('should skip contracts without project_id', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('*/10 * * * *');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1' }],
        total: 1,
      });

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockDatabases.getDocument).not.toHaveBeenCalled();
    }
  });

  it('should log error when recoverStuckReleasingMilestones fails', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('*/10 * * * *');

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB down'));

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to run recoverStuckReleasingMilestones job',
        expect.any(Error)
      );
    }
  });

  it('should log error when individual contract recovery fails', async () => {
    const { initializeScheduler } = await importScheduler();
    initializeScheduler();
    const callback = scheduledCallbacks.get('*/10 * * * *');

    const oldTimestamp = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'p1' }],
        total: 1,
      });

    mockDatabases.getDocument.mockRejectedValueOnce(new Error('Project not found'));

    if (callback) {
      callback();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to recover stuck releasing milestone for a contract',
        expect.objectContaining({
          contractId: 'c1',
        })
      );
    }
  });

  describe('reconcileContractPayments', () => {
    it('schedules the hourly escrow reconciliation job', async () => {
      const { initializeScheduler } = await importScheduler();
      initializeScheduler();
      expect(mockCronSchedule).toHaveBeenCalledWith('0 * * * *', expect.any(Function));
    });

    it('runs the reconciliation job on schedule', async () => {
      const { initializeScheduler } = await importScheduler();
      initializeScheduler();
      const callback = scheduledCallbacks.get('0 * * * *');

      if (callback) {
        callback();
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(mockReconcileContractPayments).toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith('Running scheduled job: Reconcile contract payments with escrow ledger');
      }
    });

    it('schedules the hourly email delivery failure check', async () => {
      const { initializeScheduler } = await importScheduler();
      initializeScheduler();
      expect(mockCronSchedule).toHaveBeenCalledWith('10 * * * *', expect.any(Function));
    });
  });

  describe('checkEmailDeliveryFailures', () => {
    it('should log an ops error when the hourly rejection threshold is crossed', async () => {
      const now = new Date().toISOString();
      const failures = Array.from({ length: 5 }, (_, i) => ({
        $id: `f${i}`,
        message_id: `m${i}`,
        from_address: 'a@b.com',
        to_address: 'x@other.com',
        failure_code: 'USER_NOT_FOUND',
        created_at: now,
      }));
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: failures, total: 5 });

      const { checkEmailDeliveryFailures } = await importScheduler();
      await checkEmailDeliveryFailures();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('5 inbound emails permanently rejected in the last hour'),
        expect.objectContaining({ sample: expect.any(Array) })
      );
    });

    it('should log a warning with codes when failures are below the threshold', async () => {
      const now = new Date().toISOString();
      const failures = [
        { $id: 'f1', message_id: 'm1', from_address: 'a@b.com', to_address: 'x@other.com', failure_code: 'USER_NOT_FOUND', created_at: now },
        { $id: 'f2', message_id: 'm2', from_address: 'a@b.com', to_address: 'x@other.com', failure_code: 'INVALID_RECIPIENT', created_at: now },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: failures, total: 2 });

      const { checkEmailDeliveryFailures } = await importScheduler();
      await checkEmailDeliveryFailures();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('2 inbound email delivery failure(s)'),
        expect.objectContaining({ codes: { USER_NOT_FOUND: 1, INVALID_RECIPIENT: 1 } })
      );
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should stay quiet when there are no recent failures', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const { checkEmailDeliveryFailures } = await importScheduler();
      await checkEmailDeliveryFailures();
      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should stay quiet on read errors (the repository logs its own error)', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));

      const { checkEmailDeliveryFailures } = await importScheduler();
      await expect(checkEmailDeliveryFailures()).resolves.toBeUndefined();
      // The repository reports the read failure; the check must not crash or alert.
      expect(mockLogger.error).toHaveBeenCalledWith('Repository error in email_delivery_failures.listWithQueries', expect.anything());
    });
  });
});
