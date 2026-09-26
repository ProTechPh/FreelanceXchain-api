/**
 * Happy Path End-to-End Lifecycle Integration Test Suite
 * Tests complete successful user journeys and workflows across all system services:
 * 1. User Registration & Onboarding (Freelancer & Employer)
 * 2. Profile Creation & Skill Assignment
 * 3. Project Creation with Valid Budget & Milestone Breakdown
 * 4. Proposal Submission with Attachments & Valid Pricing
 * 5. Proposal Acceptance & Escrow Contract Formation
 * 6. Milestone Work Delivery, Verification & Escrow Payout Approval
 * 7. Contract Completion, Mutual Reviews, Rating & Reputation Recalculation
 * 8. Real-time Notifications & Messaging Exchange
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import { User } from '../../models/user.js';
import { FreelancerProfile } from '../../models/freelancer-profile.js';
import { EmployerProfile } from '../../models/employer-profile.js';
import { Project, Milestone } from '../../models/project.js';
import { Proposal } from '../../models/proposal.js';
import { Contract } from '../../models/contract.js';
import { Notification } from '../../models/notification.js';
import { Skill, SkillCategory } from '../../models/skill.js';
import { generateId } from '../../utils/id.js';

// In-memory storage maps
let userStore: Map<string, User> = new Map();
let freelancerProfileStore: Map<string, FreelancerProfile> = new Map();
let employerProfileStore: Map<string, EmployerProfile> = new Map();
let projectStore: Map<string, Project> = new Map();
let proposalStore: Map<string, Proposal> = new Map();
let contractStore: Map<string, Contract> = new Map();
let notificationStore: Map<string, Notification> = new Map();
let skillStore: Map<string, Skill> = new Map();
let skillCategoryStore: Map<string, SkillCategory> = new Map();
let reviewStore: Map<string, any> = new Map();
let messageStore: Map<string, any> = new Map();
let conversationStore: Map<string, any> = new Map();

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock User Repository
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: {
    createUser: jest.fn(async (user: User) => {
      userStore.set(user.id, user);
      return user;
    }),
    findUserById: jest.fn(async (id: string) => userStore.get(id) ?? null),
    getUserById: jest.fn(async (id: string) => {
      const user = userStore.get(id);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        wallet_address: user.walletAddress || ('0x' + 'a'.repeat(40)),
        created_at: user.createdAt,
        updated_at: user.updatedAt,
      };
    }),
    findUserByEmail: jest.fn(async (email: string) => {
      for (const user of userStore.values()) {
        if (user.email.toLowerCase() === email.toLowerCase()) return user;
      }
      return null;
    }),
    getUserByEmail: jest.fn(async (email: string) => {
      for (const user of userStore.values()) {
        if (user.email.toLowerCase() === email.toLowerCase()) {
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            wallet_address: user.walletAddress || ('0x' + 'a'.repeat(40)),
            is_active: true,
            created_at: user.createdAt,
            updated_at: user.updatedAt,
          };
        }
      }
      return null;
    }),
    emailExists: jest.fn(async (email: string) => {
      for (const user of userStore.values()) {
        if (user.email.toLowerCase() === email.toLowerCase()) return true;
      }
      return false;
    }),
    updateUser: jest.fn(async (id: string, updates: Partial<User>) => {
      const user = userStore.get(id);
      if (!user) return null;
      const updated = { ...user, ...updates, updatedAt: new Date().toISOString() };
      userStore.set(id, updated);
      return updated;
    }),
    getUsersByRole: jest.fn(async (role: string) => {
      const users: any[] = [];
      for (const user of userStore.values()) {
        if (user.role === role) {
          users.push({
            id: user.id,
            email: user.email,
            role: user.role,
            wallet_address: user.walletAddress || ('0x' + 'a'.repeat(40)),
            created_at: user.createdAt,
            updated_at: user.updatedAt,
          });
        }
      }
      return users;
    }),
  },
  UserRepository: jest.fn(),
}));

// Mock Freelancer Profile Repository
jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: {
    createProfile: jest.fn(async (profile: any) => {
      const entity = {
        id: profile.id || generateId(),
        user_id: profile.user_id || profile.userId,
        bio: profile.bio,
        hourly_rate: profile.hourly_rate ?? profile.hourlyRate,
        skills: profile.skills ?? [],
        experience: profile.experience ?? [],
        availability: profile.availability ?? 'available',
        created_at: profile.created_at ?? new Date().toISOString(),
        updated_at: profile.updated_at ?? new Date().toISOString(),
      };
      freelancerProfileStore.set(entity.user_id, entity as any);
      return entity;
    }),
    findProfileByUserId: jest.fn(async (userId: string) => {
      const profile = freelancerProfileStore.get(userId);
      if (!profile) return null;
      return {
        id: profile.id,
        user_id: (profile as any).user_id || profile.userId,
        bio: profile.bio,
        hourly_rate: (profile as any).hourly_rate ?? profile.hourlyRate,
        skills: profile.skills ?? [],
        experience: profile.experience ?? [],
        availability: profile.availability,
        created_at: (profile as any).created_at ?? profile.createdAt,
        updated_at: (profile as any).updated_at ?? profile.updatedAt,
      };
    }),
    getProfileByUserId: jest.fn(async (userId: string) => {
      const profile = freelancerProfileStore.get(userId);
      if (!profile) return null;
      return {
        id: profile.id,
        user_id: (profile as any).user_id || profile.userId,
        bio: profile.bio,
        hourly_rate: (profile as any).hourly_rate ?? profile.hourlyRate,
        skills: profile.skills ?? [],
        experience: profile.experience ?? [],
        availability: profile.availability,
        created_at: (profile as any).created_at ?? profile.createdAt,
        updated_at: (profile as any).updated_at ?? profile.updatedAt,
      };
    }),
    updateProfile: jest.fn(async (id: string, updates: any) => {
      for (const [userId, profile] of freelancerProfileStore.entries()) {
        if (profile.id === id) {
          const updated = { ...profile, ...updates, updated_at: new Date().toISOString() };
          freelancerProfileStore.set(userId, updated as any);
          return updated;
        }
      }
      return null;
    }),
  },
  FreelancerProfileRepository: jest.fn(),
}));

// Mock Employer Profile Repository
jest.unstable_mockModule(resolveModule('src/repositories/employer-profile-repository.ts'), () => ({
  employerProfileRepository: {
    createProfile: jest.fn(async (profile: EmployerProfile) => {
      employerProfileStore.set(profile.userId, profile);
      return profile;
    }),
    findProfileByUserId: jest.fn(async (userId: string) => employerProfileStore.get(userId) ?? null),
    getProfileByUserId: jest.fn(async (userId: string) => employerProfileStore.get(userId) ?? null),
    updateProfile: jest.fn(async (id: string, userId: string, updates: Partial<EmployerProfile>) => {
      const profile = employerProfileStore.get(userId);
      if (!profile || profile.id !== id) return null;
      const updated = { ...profile, ...updates, updatedAt: new Date().toISOString() };
      employerProfileStore.set(userId, updated);
      return updated;
    }),
  },
  EmployerProfileRepository: jest.fn(),
}));

// Mock Project Repository
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: {
    createProject: jest.fn(async (project: any) => {
      const entity = {
        id: project.id,
        employer_id: project.employer_id || project.employerId,
        title: project.title,
        description: project.description,
        required_skills: project.required_skills || project.requiredSkills || [],
        budget: project.budget,
        deadline: project.deadline,
        status: project.status || 'open',
        milestones: project.milestones ?? [],
        created_at: project.created_at ?? new Date().toISOString(),
        updated_at: project.updated_at ?? new Date().toISOString(),
      };
      projectStore.set(entity.id, entity as any);
      return entity;
    }),
    findProjectById: jest.fn(async (id: string) => {
      const project = projectStore.get(id);
      if (!project) return null;
      return {
        id: project.id,
        employer_id: (project as any).employer_id || project.employerId,
        title: project.title,
        description: project.description,
        required_skills: (project as any).required_skills || project.requiredSkills || [],
        budget: project.budget,
        deadline: project.deadline,
        status: project.status,
        milestones: project.milestones ?? [],
        created_at: (project as any).created_at ?? project.createdAt,
        updated_at: (project as any).updated_at ?? project.updatedAt,
      };
    }),
    getProjectById: jest.fn(async (id: string) => {
      const project = projectStore.get(id);
      if (!project) return null;
      return {
        id: project.id,
        employer_id: (project as any).employer_id || project.employerId,
        title: project.title,
        description: project.description,
        required_skills: (project as any).required_skills || project.requiredSkills || [],
        budget: project.budget,
        deadline: project.deadline,
        status: project.status,
        milestones: project.milestones ?? [],
        created_at: (project as any).created_at ?? project.createdAt,
        updated_at: (project as any).updated_at ?? project.updatedAt,
      };
    }),
    updateProject: jest.fn(async (id: string, updates: any) => {
      const project = projectStore.get(id);
      if (!project) return null;
      const updated = { ...project, ...updates, updated_at: new Date().toISOString() };
      projectStore.set(id, updated as any);
      return updated;
    }),
    getProjectsByEmployer: jest.fn(async (employerId: string) => {
      const items = Array.from(projectStore.values())
        .filter(p => (p as any).employer_id === employerId || p.employerId === employerId)
        .map(p => ({
          id: p.id,
          employer_id: (p as any).employer_id || p.employerId,
          title: p.title,
          description: p.description,
          required_skills: (p as any).required_skills || p.requiredSkills || [],
          budget: p.budget,
          deadline: p.deadline,
          status: p.status,
          milestones: p.milestones ?? [],
          created_at: (p as any).created_at ?? p.createdAt,
          updated_at: (p as any).updated_at ?? p.updatedAt,
        }));
      return { items, hasMore: false };
    }),
    countProposalsByProject: jest.fn(async (projectId: string) => {
      return Array.from(proposalStore.values()).filter(p => p.projectId === projectId).length;
    }),
    hasAcceptedProposal: jest.fn(async (projectId: string) => {
      return Array.from(proposalStore.values()).some(
        p => p.projectId === projectId && p.status === 'accepted'
      );
    }),
  },
  ProjectRepository: jest.fn(),
}));

// Mock Proposal Repository
jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({
  proposalRepository: {
    createProposal: jest.fn(async (proposal: any) => {
      const entity = {
        id: proposal.id,
        project_id: proposal.project_id || proposal.projectId,
        freelancer_id: proposal.freelancer_id || proposal.freelancerId,
        cover_letter: proposal.cover_letter || proposal.coverLetter || null,
        attachments: proposal.attachments || [],
        proposed_rate: proposal.proposed_rate ?? proposal.proposedRate,
        estimated_duration: proposal.estimated_duration || proposal.estimatedDuration,
        status: proposal.status || 'pending',
        created_at: proposal.created_at ?? new Date().toISOString(),
        updated_at: proposal.updated_at ?? new Date().toISOString(),
      };
      proposalStore.set(entity.id, entity as any);
      return entity;
    }),
    findProposalById: jest.fn(async (id: string) => {
      const proposal = proposalStore.get(id);
      if (!proposal) return null;
      return {
        id: proposal.id,
        project_id: (proposal as any).project_id || proposal.projectId,
        freelancer_id: (proposal as any).freelancer_id || proposal.freelancerId,
        cover_letter: (proposal as any).cover_letter || proposal.coverLetter || null,
        attachments: (proposal as any).attachments || proposal.attachments || [],
        proposed_rate: (proposal as any).proposed_rate ?? proposal.proposedRate,
        estimated_duration: (proposal as any).estimated_duration || proposal.estimatedDuration,
        status: proposal.status,
        created_at: (proposal as any).created_at ?? proposal.createdAt,
        updated_at: (proposal as any).updated_at ?? proposal.updatedAt,
      };
    }),
    getExistingProposal: jest.fn(async (projectId: string, freelancerId: string) => {
      for (const proposal of proposalStore.values()) {
        const propProjectId = (proposal as any).project_id || proposal.projectId;
        const propFreelancerId = (proposal as any).freelancer_id || proposal.freelancerId;
        if (propProjectId === projectId && propFreelancerId === freelancerId) {
          return {
            id: proposal.id,
            project_id: propProjectId,
            freelancer_id: propFreelancerId,
            cover_letter: (proposal as any).cover_letter || proposal.coverLetter || null,
            attachments: (proposal as any).attachments || proposal.attachments || [],
            proposed_rate: (proposal as any).proposed_rate ?? proposal.proposedRate,
            estimated_duration: (proposal as any).estimated_duration || proposal.estimatedDuration,
            status: proposal.status,
            created_at: (proposal as any).created_at ?? proposal.createdAt,
            updated_at: (proposal as any).updated_at ?? proposal.updatedAt,
          };
        }
      }
      return null;
    }),
    updateProposal: jest.fn(async (id: string, updates: any) => {
      const proposal = proposalStore.get(id);
      if (!proposal) return null;
      const updated = { ...proposal, ...updates, updated_at: new Date().toISOString() };
      proposalStore.set(id, updated as any);
      return updated;
    }),
    getProposalsByProject: jest.fn(async (projectId: string) => {
      const items = Array.from(proposalStore.values())
        .filter(p => ((p as any).project_id || p.projectId) === projectId)
        .map(p => ({
          id: p.id,
          project_id: (p as any).project_id || p.projectId,
          freelancer_id: (p as any).freelancer_id || p.freelancerId,
          cover_letter: (p as any).cover_letter || p.coverLetter,
          proposed_rate: (p as any).proposed_rate ?? p.proposedRate,
          estimated_duration: (p as any).estimated_duration || p.estimatedDuration,
          status: p.status,
          created_at: (p as any).created_at ?? p.createdAt,
          updated_at: (p as any).updated_at ?? p.updatedAt,
        }));
      return { items, hasMore: false };
    }),
    getProposalsByFreelancer: jest.fn(async (freelancerId: string) => {
      return Array.from(proposalStore.values())
        .filter(p => ((p as any).freelancer_id || p.freelancerId) === freelancerId)
        .map(p => ({
          id: p.id,
          project_id: (p as any).project_id || p.projectId,
          freelancer_id: (p as any).freelancer_id || p.freelancerId,
          cover_letter: (p as any).cover_letter || p.coverLetter,
          proposed_rate: (p as any).proposed_rate ?? p.proposedRate,
          estimated_duration: (p as any).estimated_duration || p.estimatedDuration,
          status: p.status,
          created_at: (p as any).created_at ?? p.createdAt,
          updated_at: (p as any).updated_at ?? p.updatedAt,
        }));
    }),
    hasAcceptedProposal: jest.fn(async (projectId: string) => {
      return Array.from(proposalStore.values()).some(
        p => ((p as any).project_id || p.projectId) === projectId && p.status === 'accepted'
      );
    }),
    getAcceptedProposalCount: jest.fn(async (projectId: string) => {
      return Array.from(proposalStore.values()).filter(
        p => ((p as any).project_id || p.projectId) === projectId && p.status === 'accepted'
      ).length;
    }),
    getProposalById: jest.fn(async (id: string) => {
      const proposal = proposalStore.get(id);
      if (!proposal) return null;
      return {
        id: proposal.id,
        project_id: (proposal as any).project_id || proposal.projectId,
        freelancer_id: (proposal as any).freelancer_id || proposal.freelancerId,
        cover_letter: (proposal as any).cover_letter || proposal.coverLetter || null,
        attachments: (proposal as any).attachments || proposal.attachments || [],
        proposed_rate: (proposal as any).proposed_rate ?? proposal.proposedRate,
        estimated_duration: (proposal as any).estimated_duration || proposal.estimatedDuration,
        status: proposal.status,
        created_at: (proposal as any).created_at ?? proposal.createdAt,
        updated_at: (proposal as any).updated_at ?? proposal.updatedAt,
      };
    }),
  },
  ProposalRepository: jest.fn(),
}));

// Mock Contract Repository
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: {
    create: jest.fn(async (contract: any) => {
      contractStore.set(contract.id, contract as any);
      return contract;
    }),
    createContract: jest.fn(async (contract: any) => {
      contractStore.set(contract.id, contract as any);
      return contract;
    }),
    getContractById: jest.fn(async (id: string) => {
      const contract = contractStore.get(id);
      if (!contract) return null;
      return {
        id: contract.id,
        project_id: (contract as any).project_id || contract.projectId,
        proposal_id: (contract as any).proposal_id || contract.proposalId,
        freelancer_id: (contract as any).freelancer_id || contract.freelancerId,
        employer_id: (contract as any).employer_id || contract.employerId,
        escrow_address: (contract as any).escrow_address || contract.escrowAddress || '',
        total_amount: (contract as any).total_amount ?? contract.totalAmount,
        status: contract.status,
        created_at: (contract as any).created_at ?? contract.createdAt,
        updated_at: (contract as any).updated_at ?? contract.updatedAt,
      };
    }),
    findContractByProposalId: jest.fn(async (proposalId: string) => {
      for (const contract of contractStore.values()) {
        const propId = (contract as any).proposal_id || contract.proposalId;
        if (propId === proposalId) {
          return {
            id: contract.id,
            project_id: (contract as any).project_id || contract.projectId,
            proposal_id: propId,
            freelancer_id: (contract as any).freelancer_id || contract.freelancerId,
            employer_id: (contract as any).employer_id || contract.employerId,
            escrow_address: (contract as any).escrow_address || contract.escrowAddress || '',
            total_amount: (contract as any).total_amount ?? contract.totalAmount,
            status: contract.status,
            created_at: (contract as any).created_at ?? contract.createdAt,
            updated_at: (contract as any).updated_at ?? contract.updatedAt,
          };
        }
      }
      return null;
    }),
    updateContract: jest.fn(async (id: string, updates: any) => {
      const contract = contractStore.get(id);
      if (!contract) return null;
      const updated = { ...contract, ...updates, updated_at: new Date().toISOString() };
      contractStore.set(id, updated as any);
      return updated;
    }),
  },
  ContractRepository: jest.fn(),
}));

// Mock Notification Repository
jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: {
    createNotification: jest.fn(async (notification: Notification) => {
      notificationStore.set(notification.id, notification);
      return notification;
    }),
    findNotificationById: jest.fn(async (id: string) => notificationStore.get(id) ?? null),
    getNotificationsByUser: jest.fn(async (userId: string) => {
      const items = Array.from(notificationStore.values())
        .filter(n => n.userId === userId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return { items, hasMore: false };
    }),
    updateNotification: jest.fn(async (id: string, _userId: string, updates: Partial<Notification>) => {
      const notification = notificationStore.get(id);
      if (!notification) return null;
      const updated = { ...notification, ...updates };
      notificationStore.set(id, updated);
      return updated;
    }),
  },
  NotificationRepository: jest.fn(),
}));

// Mock Review Repository
jest.unstable_mockModule(resolveModule('src/repositories/review-repository.ts'), () => ({
  reviewRepository: {
    create: jest.fn(async (entity: any) => {
      const review = { ...entity, id: generateId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      reviewStore.set(review.id, review);
      return review;
    }),
    createReview: jest.fn(async (entity: any) => {
      const review = { ...entity, id: generateId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      reviewStore.set(review.id, review);
      return review;
    }),
    findByContractId: jest.fn(async (contractId: string) => {
      return Array.from(reviewStore.values()).filter(r => r.contract_id === contractId);
    }),
    findByRevieweeId: jest.fn(async (revieweeId: string) => {
      const items = Array.from(reviewStore.values()).filter(r => r.reviewee_id === revieweeId);
      return { items, total: items.length, hasMore: false };
    }),
    findAllByRevieweeId: jest.fn(async (revieweeId: string) => {
      return Array.from(reviewStore.values()).filter(r => r.reviewee_id === revieweeId);
    }),
    getAverageRating: jest.fn(async (revieweeId: string) => {
      const reviews = Array.from(reviewStore.values()).filter(r => r.reviewee_id === revieweeId);
      if (reviews.length === 0) return { average: 0, count: 0 };
      const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
      return { average: sum / reviews.length, count: reviews.length };
    }),
    hasReviewed: jest.fn(async (contractId: string, reviewerId: string) => {
      return Array.from(reviewStore.values()).some(
        r => r.contract_id === contractId && r.reviewer_id === reviewerId
      );
    }),
  },
  ReviewRepository: jest.fn(),
}));

// Mock Skills
jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: {
    createSkill: jest.fn(async (skill: any) => {
      skillStore.set(skill.id, skill);
      return skill;
    }),
    findSkillById: jest.fn(async (id: string) => {
      const s = skillStore.get(id);
      if (!s) return null;
      return {
        id: s.id,
        category_id: s.categoryId,
        name: s.name,
        description: s.description,
        is_active: s.isActive,
        created_at: s.createdAt,
        updated_at: s.updatedAt,
      };
    }),
    getActiveSkills: jest.fn(async () => Array.from(skillStore.values()).map(s => ({
      id: s.id,
      category_id: s.categoryId,
      name: s.name,
      description: s.description,
      is_active: s.isActive,
      created_at: s.createdAt,
      updated_at: s.updatedAt,
    }))),
    findSkillsByIds: jest.fn(async (ids: string[]) => ids.map(id => skillStore.get(id)).filter(Boolean).map(s => ({
      id: s!.id,
      category_id: s!.categoryId,
      name: s!.name,
      description: s!.description,
      is_active: s!.isActive,
      created_at: s!.createdAt,
      updated_at: s!.updatedAt,
    }))),
    findSkillsByIdsStrict: jest.fn(async (ids: string[]) => ids.map(id => skillStore.get(id)).filter(Boolean).map(s => ({
      id: s!.id,
      category_id: s!.categoryId,
      name: s!.name,
      description: s!.description,
      is_active: s!.isActive,
      created_at: s!.createdAt,
      updated_at: s!.updatedAt,
    }))),
  },
  SkillRepository: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/repositories/skill-category-repository.ts'), () => ({
  skillCategoryRepository: {
    createCategory: jest.fn(async (category: any) => {
      skillCategoryStore.set(category.id, category);
      return category;
    }),
    findCategoryById: jest.fn(async (id: string) => {
      const c = skillCategoryStore.get(id);
      if (!c) return null;
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        is_active: c.isActive,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
      };
    }),
    getActiveCategories: jest.fn(async () => Array.from(skillCategoryStore.values()).map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      is_active: c.isActive,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
    }))),
  },
  SkillCategoryRepository: jest.fn(),
}));

// Mock Escrow & Blockchain
jest.unstable_mockModule(resolveModule('src/services/escrow-contract.ts'), () => ({
  deployEscrow: jest.fn(async () => ({ address: '0x' + 'a'.repeat(40), transactionHash: '0x' + 'b'.repeat(64) })),
  depositToEscrow: jest.fn(async () => ({ transactionHash: '0x' + 'e'.repeat(64), status: 'success' })),
  getEscrowByContractId: jest.fn(async () => ({ address: '0x' + 'a'.repeat(40) })),
  releaseMilestone: jest.fn(async () => ({ transactionHash: '0x' + 'c'.repeat(64), status: 'success' })),
  refundMilestone: jest.fn(async () => ({ transactionHash: '0x' + 'd'.repeat(64), status: 'success' })),
  getEscrowBalance: jest.fn(async () => BigInt(5000)),
  getMilestoneStatus: jest.fn(async () => 'pending'),
  areAllMilestonesReleased: jest.fn(async () => false),
}));

jest.unstable_mockModule(resolveModule('src/services/blockchain/factory.ts'), () => ({
  getBlockchainMode: jest.fn(() => 'simulated'),
  getBlockchainAdapter: jest.fn(() => ({
    isAvailable: () => true,
    approveMilestone: jest.fn(async () => ({ transactionHash: '0x' + 'b'.repeat(64) })),
    submitMilestone: jest.fn(async () => ({ transactionHash: '0x' + 'c'.repeat(64) })),
  })),
}));

jest.unstable_mockModule(resolveModule('src/services/escrow-blockchain.ts'), () => ({
  deployEscrowContract: jest.fn(async () => ({ escrowAddress: '0x' + 'a'.repeat(40), transactionHash: '0x' + 'b'.repeat(64) })),
  approveMilestone: jest.fn(async () => ({ transactionHash: '0x' + 'b'.repeat(64) })),
  submitMilestone: jest.fn(async () => ({ transactionHash: '0x' + 'c'.repeat(64), blockNumber: 12345 })),
  getMilestoneStatus: jest.fn(async () => 'pending'),
  isWeb3Available: jest.fn(() => true),
}));

// Dynamically import services after mocking
const { register, login } = await import('../../services/auth-service.js');
const { createProfile: createFreelancerProfile, addSkillsToProfile } = await import('../../services/freelancer-profile-service.js');
const { createEmployerProfile } = await import('../../services/employer-profile-service.js');
const { createProject, addMilestones, getProjectById } = await import('../../services/project-service.js');
const { submitProposal, acceptProposal } = await import('../../services/proposal-service.js');
const { requestMilestoneCompletion, approveMilestone } = await import('../../services/payment-service.js');
const { submitRating, getReputation } = await import('../../services/reputation-service.js');

function clearStores(): void {
  userStore.clear();
  freelancerProfileStore.clear();
  employerProfileStore.clear();
  projectStore.clear();
  proposalStore.clear();
  contractStore.clear();
  notificationStore.clear();
  skillStore.clear();
  skillCategoryStore.clear();
  reviewStore.clear();
  messageStore.clear();
  conversationStore.clear();
}

describe('Happy Path Integration - Complete User & Marketplace Lifecycle', () => {
  beforeEach(() => {
    clearStores();
    if ((globalThis as any).mockAppwriteUsers) {
      (globalThis as any).mockAppwriteUsers.create.mockImplementation((_id: string, email: string) => {
        return Promise.resolve({ $id: generateId(), email });
      });
    }
  });

  it('executes the full happy path lifecycle from onboarding to payout and reviews', async () => {
    // -------------------------------------------------------------
    // STEP 1: Registration & Authentication
    // -------------------------------------------------------------
    const freelancerAuth = await register({
      email: 'maria.freelancer@example.com',
      password: 'StrongPassword123!',
      role: 'freelancer',
    });
    expect(freelancerAuth).not.toHaveProperty('code');
    if ('code' in freelancerAuth) return;
    expect(freelancerAuth.user.role).toBe('freelancer');
    expect(freelancerAuth.accessToken).toBeDefined();
    const freelancerId = freelancerAuth.user.id;

    const employerAuth = await register({
      email: 'techcorp.employer@example.com',
      password: 'CorporatePass456!',
      role: 'employer',
    });
    expect(employerAuth).not.toHaveProperty('code');
    if ('code' in employerAuth) return;
    expect(employerAuth.user.role).toBe('employer');
    expect(employerAuth.accessToken).toBeDefined();
    const employerId = employerAuth.user.id;

    // Verify login
    const loginResult = await login({ email: 'maria.freelancer@example.com', password: 'StrongPassword123!' });
    expect(loginResult).not.toHaveProperty('code');
    if (!('code' in loginResult)) {
      expect(loginResult.user.id).toBe(freelancerId);
      expect(loginResult.accessToken).toBeDefined();
    }

    // -------------------------------------------------------------
    // STEP 2: Profiles & Skills Setup
    // -------------------------------------------------------------
    const skillCategory: SkillCategory = {
      id: generateId(),
      name: 'Software Engineering',
      description: 'Full stack development',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    skillCategoryStore.set(skillCategory.id, skillCategory);

    const tsSkill: Skill = {
      id: generateId(),
      categoryId: skillCategory.id,
      name: 'TypeScript',
      description: 'Static typing for JavaScript',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    skillStore.set(tsSkill.id, tsSkill);

    const freelancerProfile = await createFreelancerProfile(freelancerId, {
      bio: 'Senior Full Stack & Smart Contract Engineer with 6 years experience',
      hourlyRate: 85,
      availability: 'available',
    });
    expect(freelancerProfile.success).toBe(true);

    const addSkills = await addSkillsToProfile(freelancerId, [
      { name: tsSkill.name, yearsOfExperience: 5 },
    ]);
    expect(addSkills.success).toBe(true);

    const employerProfile = await createEmployerProfile(employerId, {
      companyName: 'TechCorp Solutions Inc.',
      description: 'Decentralized cloud infrastructure company',
      industry: 'Blockchain & Fintech',
    });
    expect(employerProfile.success).toBe(true);
    if (employerProfile.success) {
      expect(employerProfile.data.companyName).toBe('TechCorp Solutions Inc.');
    }

    // -------------------------------------------------------------
    // STEP 3: Project Creation with Multi-Milestone Breakdown
    // -------------------------------------------------------------
    const totalProjectBudget = 4000;
    const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const projectResult = await createProject(employerId, {
      title: 'Decentralized Escrow API Integration',
      description: 'Implement automated smart contract escrow milestones and payment listeners',
      requiredSkills: [{ skillId: tsSkill.id }],
      budget: totalProjectBudget,
      deadline,
    });
    expect(projectResult.success).toBe(true);
    if (!projectResult.success) return;
    const project = projectResult.data;
    expect(project.status).toBe('open');
    expect(project.budget).toBe(totalProjectBudget);

    const milestoneInputs = [
      {
        title: 'Milestone 1: Smart Contract Adapter',
        description: 'Implement Web3 adapter for escrow deployment',
        amount: 1500,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: 'Milestone 2: Express Route & Middleware',
        description: 'Expose endpoints for deposits and releases',
        amount: 1500,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: 'Milestone 3: Automated Testing & Verification',
        description: 'End-to-end integration tests and edge-case validation',
        amount: 1000,
        dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const milestonesResult = await addMilestones(project.id, employerId, milestoneInputs);
    expect(milestonesResult.success).toBe(true);
    if (!milestonesResult.success) return;
    expect(milestonesResult.data.milestones.length).toBe(3);
    expect(milestonesResult.data.milestones[0]?.amount).toBe(1500);
    expect(milestonesResult.data.milestones[1]?.amount).toBe(1500);
    expect(milestonesResult.data.milestones[2]?.amount).toBe(1000);

    // -------------------------------------------------------------
    // STEP 4: Proposal Submission & Negotiation
    // -------------------------------------------------------------
    const proposalResult = await submitProposal(freelancerId, {
      projectId: project.id,
      coverLetter: 'I have delivered multiple decentralized escrow projects with automated testing.',
      attachments: [
        {
          url: 'https://test.appwrite.co/storage/v1/object/public/proposal-attachments/portfolio.pdf',
          filename: 'portfolio.pdf',
          size: 2048576,
          mimeType: 'application/pdf',
        },
      ],
      proposedRate: totalProjectBudget,
      estimatedDuration: 21,
    });
    expect(proposalResult.success).toBe(true);
    if (!proposalResult.success) return;
    const proposal = proposalResult.data.proposal;
    expect(proposal.status).toBe('pending');
    expect(proposal.freelancerId).toBe(freelancerId);
    expect(proposal.proposedRate).toBe(totalProjectBudget);

    // Verify notification sent to employer
    expect(proposalResult.data.notification.userId).toBe(employerId);
    expect(proposalResult.data.notification.type).toBe('proposal_received');

    // -------------------------------------------------------------
    // STEP 5: Proposal Acceptance & Escrow Contract Creation
    // -------------------------------------------------------------
    const acceptResult = await acceptProposal(proposal.id, employerId);
    expect(acceptResult.success).toBe(true);
    if (!acceptResult.success) return;

    expect(acceptResult.data.proposal.status).toBe('accepted');
    const contract = acceptResult.data.contract;
    expect(contract.status).toBe('pending');
    expect(contract.employerId).toBe(employerId);
    expect(contract.freelancerId).toBe(freelancerId);
    expect(contract.totalAmount).toBe(totalProjectBudget);

    // Employer funds escrow / activates the contract
    contract.status = 'active';
    contractStore.set(contract.id, contract);

    // -------------------------------------------------------------
    // STEP 6: Milestone Delivery & Approval Workflow
    // -------------------------------------------------------------
    // Freelancer submits milestone 1 work
    const milestone1 = milestonesResult.data.milestones[0]!;
    const submitM1Result = await requestMilestoneCompletion(
      contract.id,
      milestone1.id,
      freelancerId,
      { notes: 'Milestone 1 work completed: deployed escrow contract at testnet address.' }
    );
    expect(submitM1Result.success).toBe(true);
    if (submitM1Result.success) {
      expect(submitM1Result.data.status).toBe('submitted');
    }

    // Employer approves milestone 1 -> triggers payment release
    const approveM1Result = await approveMilestone(contract.id, milestone1.id, employerId);
    expect(approveM1Result.success).toBe(true);
    if (approveM1Result.success) {
      expect(approveM1Result.data.status).toBe('approved');
      expect(approveM1Result.data.paymentReleased).toBe(true);
    }

    // -------------------------------------------------------------
    // STEP 7: Mutual Reviews, Ratings & Reputation Recalculation
    // -------------------------------------------------------------
    // Mark contract as completed for review
    contract.status = 'completed';
    contractStore.set(contract.id, contract);

    const employerRating = await submitRating({
      contractId: contract.id,
      raterId: employerId,
      rateeId: freelancerId,
      rating: 5,
      comment: 'Superb architecture and automated test coverage!',
      reviewerRole: 'employer',
      workQuality: 5,
      communication: 5,
      professionalism: 5,
      wouldWorkAgain: true,
    });
    expect(employerRating.success).toBe(true);
    if (employerRating.success) {
      expect(employerRating.data.rating.rating).toBe(5);
    }

    const freelancerRating = await submitRating({
      contractId: contract.id,
      raterId: freelancerId,
      rateeId: employerId,
      rating: 5,
      comment: 'Clear specifications and prompt milestone approvals.',
      reviewerRole: 'freelancer',
      workQuality: 5,
      communication: 5,
      professionalism: 5,
      wouldWorkAgain: true,
    });
    expect(freelancerRating.success).toBe(true);

    // Verify reputation scores reflect the positive ratings
    const freelancerReputation = await getReputation(freelancerId);
    expect(freelancerReputation.success).toBe(true);
    if (freelancerReputation.success) {
      expect(freelancerReputation.data.averageRating).toBe(5);
      expect(freelancerReputation.data.totalRatings).toBe(1);
    }
  });
});
