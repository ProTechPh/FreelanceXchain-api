/**
 * Mock Repository Factory
 * Provides reusable mock repository implementations backed by in-memory stores
 */

import { jest } from '@jest/globals';

/**
 * Create an in-memory store for testing
 */
export function createInMemoryStore<T extends { id: string }>(): Map<string, T> {
  return new Map<string, T>();
}

/**
 * Create a mock repository with common CRUD operations
 */
export function createMockRepository<T extends { id: string; created_at: string; updated_at: string }>(
  store: Map<string, T>
) {
  const now = () => new Date().toISOString();

  return {
    create: jest.fn(async (entity: T) => {
      const created = { ...entity, created_at: now(), updated_at: now() };
      store.set(entity.id, created);
      return created;
    }),

    findById: jest.fn(async (id: string) => {
      return store.get(id) ?? null;
    }),

    getById: jest.fn(async (id: string) => {
      return store.get(id) ?? null;
    }),

    update: jest.fn(async (id: string, updates: Partial<T>) => {
      const entity = store.get(id);
      if (!entity) return null;
      const updated = { ...entity, ...updates, updated_at: now() };
      store.set(id, updated);
      return updated;
    }),

    delete: jest.fn(async (id: string) => {
      const entity = store.get(id);
      if (!entity) return false;
      store.delete(id);
      return true;
    }),

    getAll: jest.fn(async () => {
      return Array.from(store.values());
    }),

    clear: () => {
      store.clear();
    },
  };
}

/**
 * Create a mock user repository
 */
export function createMockUserRepository(store: Map<string, any>) {
  const base = createMockRepository(store);

  return {
    ...base,
    createUser: base.create,
    getUserById: base.findById,
    findUserByEmail: jest.fn(async (email: string) => {
      for (const user of store.values()) {
        if (user.email === email) return user;
      }
      return null;
    }),
    getAllUsers: jest.fn(async () => {
      return Array.from(store.values());
    }),
    updateUser: base.update,
  };
}

/**
 * Create a mock project repository
 */
export function createMockProjectRepository(store: Map<string, any>) {
  const base = createMockRepository(store);

  return {
    ...base,
    createProject: base.create,
    getProjectById: base.findById,
    findProjectById: base.findById,
    updateProject: base.update,
    getProjectsByEmployer: jest.fn(async (employerId: string) => {
      const items = Array.from(store.values()).filter(p => p.employer_id === employerId);
      return { items, hasMore: false };
    }),
    searchProjects: jest.fn(async (keyword: string, options?: any) => {
      const lowerKeyword = keyword.toLowerCase();
      const filtered = Array.from(store.values()).filter(project =>
        project.title?.toLowerCase().includes(lowerKeyword) ||
        project.description?.toLowerCase().includes(lowerKeyword)
      );
      const limit = options?.limit || filtered.length;
      const offset = options?.offset || 0;
      const items = filtered.slice(offset, offset + limit);
      return {
        items,
        hasMore: offset + limit < filtered.length,
        total: filtered.length,
      };
    }),
    getProjectsBySkills: jest.fn(async (skillIds: string[], options?: any) => {
      const skillIdSet = new Set(skillIds);
      const filtered = Array.from(store.values()).filter(project =>
        project.required_skills?.some((skill: any) => skillIdSet.has(skill.skill_id))
      );
      const limit = options?.limit || filtered.length;
      const offset = options?.offset || 0;
      const items = filtered.slice(offset, offset + limit);
      return {
        items,
        hasMore: offset + limit < filtered.length,
        total: filtered.length,
      };
    }),
    getProjectsByBudgetRange: jest.fn(async (minBudget: number, maxBudget: number, options?: any) => {
      const filtered = Array.from(store.values()).filter(project =>
        project.budget >= minBudget && project.budget <= maxBudget
      );
      const limit = options?.limit || filtered.length;
      const offset = options?.offset || 0;
      const items = filtered.slice(offset, offset + limit);
      return {
        items,
        hasMore: offset + limit < filtered.length,
        total: filtered.length,
      };
    }),
    getAllOpenProjects: jest.fn(async (options?: any) => {
      const filtered = Array.from(store.values()).filter(project =>
        project.status === 'open' || !project.status
      );
      const limit = options?.limit || filtered.length;
      const offset = options?.offset || 0;
      const items = filtered.slice(offset, offset + limit);
      return {
        items,
        hasMore: offset + limit < filtered.length,
        total: filtered.length,
      };
    }),
    getProjectsByCategory: jest.fn(async (categoryId: string, options?: any) => {
      const filtered = Array.from(store.values()).filter(project =>
        project.status === 'open' &&
        project.required_skills?.some((skill: any) => skill.category_id === categoryId)
      );
      const limit = options?.limit || filtered.length;
      const offset = options?.offset || 0;
      const items = filtered.slice(offset, offset + limit);
      return {
        items,
        hasMore: offset + limit < filtered.length,
        total: filtered.length,
      };
    }),
    getProjectsByMultipleCategories: jest.fn(async (categoryIds: string[], options?: any) => {
      if (categoryIds.length === 0) {
        return { items: [], hasMore: false, total: 0 };
      }
      const filtered = Array.from(store.values()).filter(project =>
        project.status === 'open' &&
        project.required_skills?.some((skill: any) => categoryIds.includes(skill.category_id))
      );
      const limit = options?.limit || filtered.length;
      const offset = options?.offset || 0;
      const items = filtered.slice(offset, offset + limit);
      return {
        items,
        hasMore: offset + limit < filtered.length,
        total: filtered.length,
      };
    }),
  };
}

/**
 * Create a mock proposal repository
 */
export function createMockProposalRepository(store: Map<string, any>) {
  const base = createMockRepository(store);

  return {
    ...base,
    createProposal: base.create,
    getProposalById: base.findById,
    findProposalById: base.findById,
    updateProposal: base.update,
    getExistingProposal: jest.fn(async (projectId: string, freelancerId: string) => {
      for (const proposal of store.values()) {
        if (proposal.project_id === projectId && proposal.freelancer_id === freelancerId) {
          return proposal;
        }
      }
      return null;
    }),
    getProposalsByProject: jest.fn(async (projectId: string) => {
      const items = Array.from(store.values()).filter(p => p.project_id === projectId);
      return {
        items,
        hasMore: false,
        total: items.length,
      };
    }),
    getProposalsByFreelancer: jest.fn(async (freelancerId: string) => {
      return Array.from(store.values()).filter(p => p.freelancer_id === freelancerId);
    }),
    hasAcceptedProposal: jest.fn(async (projectId: string) => {
      for (const proposal of store.values()) {
        if (proposal.project_id === projectId && proposal.status === 'accepted') {
          return true;
        }
      }
      return false;
    }),
    getProposalCountByProject: jest.fn(async (projectId: string) => {
      let count = 0;
      for (const proposal of store.values()) {
        if (proposal.project_id === projectId) count++;
      }
      return count;
    }),
  };
}

/**
 * Create a mock contract repository
 */
export function createMockContractRepository(store: Map<string, any>) {
  const base = createMockRepository(store);

  return {
    ...base,
    createContract: base.create,
    getContractById: base.findById,
    getContractByIdWithRelations: base.findById,
    updateContract: base.update,
    getUserContracts: jest.fn(async (userId: string, options?: any) => {
      const items = Array.from(store.values()).filter(
        c => c.freelancer_id === userId || c.employer_id === userId
      );
      const limit = options?.limit || 20;
      const offset = options?.offset || 0;
      const paginatedItems = items.slice(offset, offset + limit);
      return {
        items: paginatedItems,
        hasMore: offset + limit < items.length,
        total: items.length,
      };
    }),
    getContractsByFreelancer: jest.fn(async (freelancerId: string, options?: any) => {
      const items = Array.from(store.values()).filter(c => c.freelancer_id === freelancerId);
      const limit = options?.limit || 20;
      const offset = options?.offset || 0;
      const paginatedItems = items.slice(offset, offset + limit);
      return {
        items: paginatedItems,
        hasMore: offset + limit < items.length,
        total: items.length,
      };
    }),
    getContractsByEmployer: jest.fn(async (employerId: string, options?: any) => {
      const items = Array.from(store.values()).filter(c => c.employer_id === employerId);
      const limit = options?.limit || 20;
      const offset = options?.offset || 0;
      const paginatedItems = items.slice(offset, offset + limit);
      return {
        items: paginatedItems,
        hasMore: offset + limit < items.length,
        total: items.length,
      };
    }),
    getContractsByProject: jest.fn(async (projectId: string) => {
      return Array.from(store.values()).filter(c => c.project_id === projectId);
    }),
    getAllContracts: jest.fn(async () => {
      return Array.from(store.values());
    }),
  };
}

/**
 * Create a mock skill repository
 */
export function createMockSkillRepository(store: Map<string, any>) {
  const base = createMockRepository(store);

  return {
    ...base,
    createSkill: base.create,
    findSkillById: base.findById,
    updateSkill: base.update,
    getAllSkills: base.getAll,
  };
}

/**
 * Create a mock notification repository
 */
export function createMockNotificationRepository(store: Map<string, any>) {
  const base = createMockRepository(store);

  return {
    ...base,
    createNotification: base.create,
    getNotificationById: base.findById,
    markAsRead: jest.fn(async (id: string) => {
      const notification = store.get(id);
      if (!notification) return null;
      const updated = { ...notification, is_read: true, updated_at: new Date().toISOString() };
      store.set(id, updated);
      return updated;
    }),
    getNotificationsByUser: jest.fn(async (userId: string) => {
      return Array.from(store.values()).filter(n => n.user_id === userId);
    }),
    getAllNotificationsByUser: jest.fn(async (userId: string) => {
      return Array.from(store.values())
        .filter(n => n.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }),
    markAllAsRead: jest.fn(async (userId: string) => {
      let count = 0;
      for (const [id, notification] of store.entries()) {
        if (notification.user_id === userId && !notification.is_read) {
          const updated = { ...notification, is_read: true, updated_at: new Date().toISOString() };
          store.set(id, updated);
          count++;
        }
      }
      return count;
    }),
  };
}

export function createMockPaymentRepository(store: Map<string, any>) {
  const base = createMockRepository(store);

  return {
    ...base,
    createPayment: base.create,
    getPaymentById: base.findById,
    findByContractId: jest.fn(async (contractId: string) => {
      return Array.from(store.values()).filter(p => p.contract_id === contractId);
    }),
    findByPayerId: jest.fn(async (payerId: string) => {
      return Array.from(store.values()).filter(p => p.payer_id === payerId);
    }),
    findByPayeeId: jest.fn(async (payeeId: string) => {
      return Array.from(store.values()).filter(p => p.payee_id === payeeId);
    }),
    findByUserId: jest.fn(async (userId: string, options?: any) => {
      const allPayments = Array.from(store.values()).filter(
        p => p.payer_id === userId || p.payee_id === userId
      );
      const limit = options?.limit || allPayments.length;
      const offset = options?.offset || 0;
      const items = allPayments.slice(offset, offset + limit);
      return {
        items,
        total: allPayments.length,
        hasMore: offset + limit < allPayments.length,
      };
    }),
    findByTxHash: jest.fn(async (txHash: string) => {
      return Array.from(store.values()).find(p => p.tx_hash === txHash) || null;
    }),
    updateStatus: jest.fn(async (id: string, status: string, txHash?: string) => {
      const payment = store.get(id);
      if (!payment) return null;
      const updated = { 
        ...payment, 
        status, 
        ...(txHash !== undefined && { tx_hash: txHash }),
        updated_at: new Date().toISOString() 
      };
      store.set(id, updated);
      return updated;
    }),
    getTotalEarnings: jest.fn(async (userId: string) => {
      const payments = Array.from(store.values()).filter(
        p => p.payee_id === userId && p.status === 'completed'
      );
      return payments.reduce((sum, p) => sum + p.amount, 0);
    }),
    getTotalSpent: jest.fn(async (userId: string) => {
      const payments = Array.from(store.values()).filter(
        p => p.payer_id === userId && p.status === 'completed'
      );
      return payments.reduce((sum, p) => sum + p.amount, 0);
    }),
    clear: jest.fn(() => {
      store.clear();
    }),
  };
}

export function createMockReviewRepository(store: Map<string, any>) {
  const base = createMockRepository(store);

  return {
    ...base,
    createReview: base.create,
    getReviewById: base.findById,
    findByContractId: jest.fn(async (contractId: string) => {
      return Array.from(store.values()).filter(r => r.contract_id === contractId);
    }),
    findByRevieweeId: jest.fn(async (revieweeId: string, options?: any) => {
      const allReviews = Array.from(store.values()).filter(r => r.reviewee_id === revieweeId);
      const limit = options?.limit || allReviews.length;
      const offset = options?.offset || 0;
      const items = allReviews.slice(offset, offset + limit);
      return {
        items,
        total: allReviews.length,
        hasMore: offset + limit < allReviews.length,
      };
    }),
    getAverageRating: jest.fn(async (userId: string) => {
      const reviews = Array.from(store.values()).filter(r => r.reviewee_id === userId);
      if (reviews.length === 0) return { average: 0, count: 0 };
      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      return {
        average: sum / reviews.length,
        count: reviews.length,
      };
    }),
    hasReviewed: jest.fn(async (contractId: string, userId: string) => {
      const review = Array.from(store.values()).find(
        r => r.contract_id === contractId && r.reviewer_id === userId
      );
      return !!review;
    }),
    clear: jest.fn(() => {
      store.clear();
    }),
  };
}

/**
 * Create a mock freelancer profile repository
 */
export function createMockFreelancerProfileRepository(store: Map<string, any>) {
  const base = createMockRepository(store);

  return {
    ...base,
    create: base.create,
    createProfile: jest.fn(async (profile: any) => {
      const created = { ...profile, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      store.set(profile.user_id, created);
      return created;
    }),
    getProfileByUserId: jest.fn(async (userId: string) => {
      return store.get(userId) ?? null;
    }),
    findByUserId: jest.fn(async (userId: string) => {
      return store.get(userId) ?? null;
    }),
    updateProfile: jest.fn(async (id: string, updates: any) => {
      // Find by id or user_id
      let profile = null;
      for (const p of store.values()) {
        if (p.id === id || p.user_id === id) {
          profile = p;
          break;
        }
      }
      if (!profile) return null;
      const updated = { ...profile, ...updates, updated_at: new Date().toISOString() };
      store.set(profile.user_id, updated);
      return updated;
    }),
    getAllProfilesPaginated: jest.fn(async (options?: any) => {
      const allProfiles = Array.from(store.values());
      const limit = options?.limit || allProfiles.length;
      const offset = options?.offset || 0;
      const items = allProfiles.slice(offset, offset + limit);
      return {
        items,
        hasMore: offset + limit < allProfiles.length,
        total: allProfiles.length,
      };
    }),
    searchByKeyword: jest.fn(async (keyword: string, options?: any) => {
      const lowerKeyword = keyword.toLowerCase();
      const filtered = Array.from(store.values()).filter(profile =>
        profile.bio?.toLowerCase().includes(lowerKeyword)
      );
      const limit = options?.limit || filtered.length;
      const offset = options?.offset || 0;
      const items = filtered.slice(offset, offset + limit);
      return {
        items,
        hasMore: offset + limit < filtered.length,
        total: filtered.length,
      };
    }),
    searchBySkills: jest.fn(async (skillIds: string[], options?: any) => {
      const skillIdSet = new Set(skillIds);
      const filtered = Array.from(store.values()).filter(profile =>
        profile.skills?.some((skill: any) => skillIdSet.has(skill.skill_id))
      );
      const limit = options?.limit || filtered.length;
      const offset = options?.offset || 0;
      const items = filtered.slice(offset, offset + limit);
      return {
        items,
        hasMore: offset + limit < filtered.length,
        total: filtered.length,
      };
    }),
    clear: jest.fn(() => {
      store.clear();
    }),
  };
}

/**
 * Create a mock employer profile repository
 */
export function createMockEmployerProfileRepository(store: Map<string, any>) {
  const base = createMockRepository(store);

  return {
    ...base,
    create: base.create,
    createProfile: jest.fn(async (profile: any) => {
      const created = { ...profile, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      store.set(profile.user_id, created);
      return created;
    }),
    getProfileByUserId: jest.fn(async (userId: string) => {
      return store.get(userId) ?? null;
    }),
    findByUserId: jest.fn(async (userId: string) => {
      return store.get(userId) ?? null;
    }),
    updateProfile: jest.fn(async (id: string, updates: any) => {
      // Find by id or user_id
      let profile = null;
      for (const p of store.values()) {
        if (p.id === id || p.user_id === id) {
          profile = p;
          break;
        }
      }
      if (!profile) return null;
      const updated = { ...profile, ...updates, updated_at: new Date().toISOString() };
      store.set(profile.user_id, updated);
      return updated;
    }),
    clear: jest.fn(() => {
      store.clear();
    }),
  };
}

