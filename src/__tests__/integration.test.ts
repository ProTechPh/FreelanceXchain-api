/**
 * Integration Tests for Critical Flows
 * Tests end-to-end workflows across multiple services
 * Requirements: All
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { User } from '../models/user';
import { FreelancerProfile } from '../models/freelancer-profile';
import { EmployerProfile } from '../models/employer-profile';
import { Project, Milestone } from '../models/project';
import { Proposal } from '../models/proposal';
import { Contract } from '../models/contract';
import { Dispute } from '../models/dispute';
import { Notification } from '../models/notification';
import { Skill, SkillCategory } from '../models/skill';
import { generateId } from '../utils/id';

// In-memory stores for integration testing
let userStore: Map<string, User> = new Map();
let freelancerProfileStore: Map<string, FreelancerProfile> = new Map();
let employerProfileStore: Map<string, EmployerProfile> = new Map();
let projectStore: Map<string, Project> = new Map();
let proposalStore: Map<string, Proposal> = new Map();
let contractStore: Map<string, Contract> = new Map();
let disputeStore: Map<string, Dispute> = new Map();
let notificationStore: Map<string, Notification> = new Map();
let skillStore: Map<string, Skill> = new Map();
let skillCategoryStore: Map<string, SkillCategory> = new Map();

// Mock all repositories
jest.unstable_mockModule('../repositories/user-repository.js', () => ({
  userRepository: {
    createUser: jest.fn(async (user: User) => {
      userStore.set(user.id, user);
      return user;
    }),
    findUserById: jest.fn(async (id: string) => userStore.get(id) ?? null),
    getUserById: jest.fn(async (id: string) => {
      const user = userStore.get(id);
      if (!user) return null;
      // Return entity format
      return {
        id: user.id,
        email: user.email,
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
  },
  UserRepository: jest.fn(),
}));

jest.unstable_mockModule('../repositories/freelancer-profile-repository.js', () => ({
  freelancerProfileRepository: {
    createProfile: jest.fn(async (profile: any) => {
      // Convert to entity format if needed
      const entity = {
        id: profile.id,
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
      // Return entity format
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
      // Return entity format
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
      // Find by id in all profiles
      for (const [userId, profile] of freelancerProfileStore.entries()) {
        if (profile.id === id) {
          const updated = {
            ...profile,
            ...updates,
            updated_at: new Date().toISOString(),
          };
          freelancerProfileStore.set(userId, updated as any);
          return updated;
        }
      }
      return null;
    }),
  },
  FreelancerProfileRepository: jest.fn(),
}));

jest.unstable_mockModule('../repositories/employer-profile-repository.js', () => ({
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

jest.unstable_mockModule('../repositories/project-repository.js', () => ({
  projectRepository: {
    createProject: jest.fn(async (project: any) => {
      // Convert to entity format if needed
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
      // Return entity format
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
    getProjectById: jest.fn(async (id: string, _employerId?: string) => {
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
      const updated = {
        ...project,
        ...updates,
        updated_at: new Date().toISOString(),
      };
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

jest.unstable_mockModule('../repositories/proposal-repository.js', () => ({
  proposalRepository: {
    createProposal: jest.fn(async (proposal: any) => {
      // Convert to entity format
      const entity = {
        id: proposal.id,
        project_id: proposal.project_id || proposal.projectId,
        freelancer_id: proposal.freelancer_id || proposal.freelancerId,
        cover_letter: proposal.cover_letter || proposal.coverLetter,
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
      // Return entity format
      return {
        id: proposal.id,
        project_id: (proposal as any).project_id || proposal.projectId,
        freelancer_id: (proposal as any).freelancer_id || proposal.freelancerId,
        cover_letter: (proposal as any).cover_letter || proposal.coverLetter,
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
            cover_letter: (proposal as any).cover_letter || proposal.coverLetter,
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
  },
  ProposalRepository: jest.fn(),
}));

jest.unstable_mockModule('../repositories/contract-repository.js', () => ({
  contractRepository: {
    createContract: jest.fn(async (contract: any) => {
      // Store as-is since it's already in entity format
      contractStore.set(contract.id, contract as any);
      return contract;
    }),
    getContractById: jest.fn(async (id: string) => {
      const contract = contractStore.get(id);
      if (!contract) return null;
      // Return entity format
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
    getContractsByFreelancer: jest.fn(async (freelancerId: string) => {
      const items = Array.from(contractStore.values())
        .filter(c => ((c as any).freelancer_id || c.freelancerId) === freelancerId)
        .map(c => ({
          id: c.id,
          project_id: (c as any).project_id || c.projectId,
          proposal_id: (c as any).proposal_id || c.proposalId,
          freelancer_id: (c as any).freelancer_id || c.freelancerId,
          employer_id: (c as any).employer_id || c.employerId,
          escrow_address: (c as any).escrow_address || c.escrowAddress || '',
          total_amount: (c as any).total_amount ?? c.totalAmount,
          status: c.status,
          created_at: (c as any).created_at ?? c.createdAt,
          updated_at: (c as any).updated_at ?? c.updatedAt,
        }));
      return { items, hasMore: false };
    }),
    getContractsByEmployer: jest.fn(async (employerId: string) => {
      const items = Array.from(contractStore.values())
        .filter(c => ((c as any).employer_id || c.employerId) === employerId)
        .map(c => ({
          id: c.id,
          project_id: (c as any).project_id || c.projectId,
          proposal_id: (c as any).proposal_id || c.proposalId,
          freelancer_id: (c as any).freelancer_id || c.freelancerId,
          employer_id: (c as any).employer_id || c.employerId,
          escrow_address: (c as any).escrow_address || c.escrowAddress || '',
          total_amount: (c as any).total_amount ?? c.totalAmount,
          status: c.status,
          created_at: (c as any).created_at ?? c.createdAt,
          updated_at: (c as any).updated_at ?? c.updatedAt,
        }));
      return { items, hasMore: false };
    }),
  },
  ContractRepository: jest.fn(),
}));


jest.unstable_mockModule('../repositories/dispute-repository.js', () => ({
  disputeRepository: {
    createDispute: jest.fn(async (dispute: any) => {
      // Convert to entity format
      const entity = {
        id: dispute.id,
        contract_id: dispute.contract_id || dispute.contractId,
        milestone_id: dispute.milestone_id || dispute.milestoneId,
        initiator_id: dispute.initiator_id || dispute.initiatorId,
        reason: dispute.reason,
        status: dispute.status || 'open',
        evidence: dispute.evidence ?? [],
        resolution: dispute.resolution ?? null,
        created_at: dispute.created_at ?? new Date().toISOString(),
        updated_at: dispute.updated_at ?? new Date().toISOString(),
      };
      disputeStore.set(entity.id, entity as any);
      return entity;
    }),
    findDisputeById: jest.fn(async (id: string) => {
      const dispute = disputeStore.get(id);
      if (!dispute) return null;
      // Return entity format
      return {
        id: dispute.id,
        contract_id: (dispute as any).contract_id || dispute.contractId,
        milestone_id: (dispute as any).milestone_id || dispute.milestoneId,
        initiator_id: (dispute as any).initiator_id || dispute.initiatorId,
        reason: dispute.reason,
        status: dispute.status,
        evidence: dispute.evidence ?? [],
        resolution: dispute.resolution ?? null,
        created_at: (dispute as any).created_at ?? dispute.createdAt,
        updated_at: (dispute as any).updated_at ?? dispute.updatedAt,
      };
    }),
    getDisputeById: jest.fn(async (id: string, contractId?: string) => {
      const dispute = disputeStore.get(id);
      if (!dispute) return null;
      const dispContractId = (dispute as any).contract_id || dispute.contractId;
      if (contractId && dispContractId !== contractId) return null;
      return {
        id: dispute.id,
        contract_id: dispContractId,
        milestone_id: (dispute as any).milestone_id || dispute.milestoneId,
        initiator_id: (dispute as any).initiator_id || dispute.initiatorId,
        reason: dispute.reason,
        status: dispute.status,
        evidence: dispute.evidence ?? [],
        resolution: dispute.resolution ?? null,
        created_at: (dispute as any).created_at ?? dispute.createdAt,
        updated_at: (dispute as any).updated_at ?? dispute.updatedAt,
      };
    }),
    updateDispute: jest.fn(async (id: string, updates: any) => {
      const dispute = disputeStore.get(id);
      if (!dispute) return null;
      const updated = { ...dispute, ...updates, updated_at: new Date().toISOString() };
      disputeStore.set(id, updated as any);
      return updated;
    }),
    getDisputeByMilestone: jest.fn(async (milestoneId: string) => {
      for (const dispute of disputeStore.values()) {
        const dispMilestoneId = (dispute as any).milestone_id || dispute.milestoneId;
        if (dispMilestoneId === milestoneId) {
          return {
            id: dispute.id,
            contract_id: (dispute as any).contract_id || dispute.contractId,
            milestone_id: dispMilestoneId,
            initiator_id: (dispute as any).initiator_id || dispute.initiatorId,
            reason: dispute.reason,
            status: dispute.status,
            evidence: dispute.evidence ?? [],
            resolution: dispute.resolution ?? null,
            created_at: (dispute as any).created_at ?? dispute.createdAt,
            updated_at: (dispute as any).updated_at ?? dispute.updatedAt,
          };
        }
      }
      return null;
    }),
    getAllDisputesByContract: jest.fn(async (contractId: string) => {
      return Array.from(disputeStore.values())
        .filter(d => ((d as any).contract_id || d.contractId) === contractId)
        .map(d => ({
          id: d.id,
          contract_id: (d as any).contract_id || d.contractId,
          milestone_id: (d as any).milestone_id || d.milestoneId,
          initiator_id: (d as any).initiator_id || d.initiatorId,
          reason: d.reason,
          status: d.status,
          evidence: d.evidence ?? [],
          resolution: d.resolution ?? null,
          created_at: (d as any).created_at ?? d.createdAt,
          updated_at: (d as any).updated_at ?? d.updatedAt,
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }),
  },
  DisputeRepository: jest.fn(),
}));

jest.unstable_mockModule('../repositories/notification-repository.js', () => ({
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

jest.unstable_mockModule('../repositories/skill-repository.js', () => ({
  skillRepository: {
    createSkill: jest.fn(async (skill: any) => {
      skillStore.set(skill.id, skill);
      return skill;
    }),
    findSkillById: jest.fn(async (id: string) => {
      const skill = skillStore.get(id);
      if (!skill) return null;
      // Return entity type with snake_case
      return {
        id: skill.id,
        category_id: skill.categoryId,
        name: skill.name,
        description: skill.description,
        is_active: skill.isActive,
        created_at: skill.createdAt,
        updated_at: skill.updatedAt,
      };
    }),
    getActiveSkills: jest.fn(async () => {
      const items = Array.from(skillStore.values())
        .filter(s => s.isActive)
        .map(skill => ({
          id: skill.id,
          category_id: skill.categoryId,
          name: skill.name,
          description: skill.description,
          is_active: skill.isActive,
          created_at: skill.createdAt,
          updated_at: skill.updatedAt,
        }));
      return items;
    }),
    getSkillsByIds: jest.fn(async (ids: string[]) => {
      return ids.map(id => skillStore.get(id))
        .filter((s): s is Skill => s !== undefined)
        .map(skill => ({
          id: skill.id,
          category_id: skill.categoryId,
          name: skill.name,
          description: skill.description,
          is_active: skill.isActive,
          created_at: skill.createdAt,
          updated_at: skill.updatedAt,
        }));
    }),
  },
  SkillRepository: jest.fn(),
}));

jest.unstable_mockModule('../repositories/skill-category-repository.js', () => ({
  skillCategoryRepository: {
    createCategory: jest.fn(async (category: any) => {
      skillCategoryStore.set(category.id, category);
      return category;
    }),
    findCategoryById: jest.fn(async (id: string) => {
      const category = skillCategoryStore.get(id);
      if (!category) return null;
      // Return entity type with snake_case
      return {
        id: category.id,
        name: category.name,
        description: category.description,
        is_active: category.isActive,
        created_at: category.createdAt,
        updated_at: category.updatedAt,
      };
    }),
    getCategoryById: jest.fn(async (id: string) => {
      const category = skillCategoryStore.get(id);
      if (!category) return null;
      return {
        id: category.id,
        name: category.name,
        description: category.description,
        is_active: category.isActive,
        created_at: category.createdAt,
        updated_at: category.updatedAt,
      };
    }),
    getActiveCategories: jest.fn(async () => {
      const items = Array.from(skillCategoryStore.values())
        .filter(c => c.isActive)
        .map(category => ({
          id: category.id,
          name: category.name,
          description: category.description,
          is_active: category.isActive,
          created_at: category.createdAt,
          updated_at: category.updatedAt,
        }));
      return items;
    }),
  },
  SkillCategoryRepository: jest.fn(),
}));

// Mock escrow contract
jest.unstable_mockModule('../services/escrow-contract.js', () => ({
  deployEscrow: jest.fn(async () => ({
    address: '0x' + 'a'.repeat(40),
    transactionHash: '0x' + 'b'.repeat(64),
    blockNumber: 12345,
  })),
  depositToEscrow: jest.fn(async () => ({
    transactionHash: '0x' + 'e'.repeat(64),
    blockNumber: 12344,
    status: 'success',
    gasUsed: BigInt(21000),
    timestamp: Date.now(),
  })),
  getEscrowByContractId: jest.fn(async () => ({
    address: '0x' + 'a'.repeat(40),
  })),
  releaseMilestone: jest.fn(async () => ({
    transactionHash: '0x' + 'c'.repeat(64),
    blockNumber: 12346,
    status: 'success',
    gasUsed: BigInt(21000),
    timestamp: Date.now(),
  })),
  refundMilestone: jest.fn(async () => ({
    transactionHash: '0x' + 'd'.repeat(64),
    blockNumber: 12347,
    status: 'success',
    gasUsed: BigInt(21000),
    timestamp: Date.now(),
  })),
  getEscrowBalance: jest.fn(async () => BigInt(5000)),
  getEscrowState: jest.fn(async () => null),
  getMilestoneStatus: jest.fn(async () => 'pending'),
  areAllMilestonesReleased: jest.fn(async () => false),
  clearEscrows: jest.fn(),
}));

// Mock blockchain client
jest.unstable_mockModule('../services/blockchain-client.js', () => ({
  clearTransactions: jest.fn(),
  generateWalletAddress: jest.fn(() => '0x' + 'e'.repeat(40)),
  confirmTransaction: jest.fn(async () => ({
    id: 'tx-1',
    status: 'confirmed',
    hash: '0x' + 'f'.repeat(64),
    blockNumber: 12345,
  })),
  submitTransaction: jest.fn(async () => ({
    id: 'tx-1',
    status: 'pending',
    hash: '0x' + 'f'.repeat(64),
  })),
  getTransaction: jest.fn(async () => null),
  serializeTransaction: jest.fn(tx => tx),
  deserializeTransaction: jest.fn(tx => tx),
}));

// Mock Supabase client to prevent real network calls
jest.unstable_mockModule('../config/supabase.js', () => ({
  getSupabaseClient: jest.fn(() => ({
    auth: {
      signUp: jest.fn(async ({ email, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) => {
        const userId = generateId();
        const mockUser = {
          id: userId,
          email: email.toLowerCase(),
          user_metadata: options?.data ?? {},
        };
        // Store user in memory for the test
        const now = new Date().toISOString();
        userStore.set(userId, {
          id: userId,
          email: email.toLowerCase(),
          passwordHash: '',
          role: (options?.data?.role as 'freelancer' | 'employer') ?? 'freelancer',
          walletAddress: (options?.data?.wallet_address as string) ?? '',
          createdAt: now,
          updatedAt: now,
        });
        const mockSession = {
          access_token: 'mock-access-token-' + userId,
          refresh_token: 'mock-refresh-token-' + userId,
        };
        return { data: { user: mockUser, session: mockSession }, error: null };
      }),
      signInWithPassword: jest.fn(async () => ({
        data: { user: null, session: null },
        error: { message: 'Not implemented in test' },
      })),
    },
  })),
  TABLES: {
    USERS: 'users',
    FREELANCER_PROFILES: 'freelancer_profiles',
    EMPLOYER_PROFILES: 'employer_profiles',
    PROJECTS: 'projects',
    PROPOSALS: 'proposals',
    CONTRACTS: 'contracts',
    DISPUTES: 'disputes',
    SKILLS: 'skills',
    SKILL_CATEGORIES: 'skill_categories',
    NOTIFICATIONS: 'notifications',
    KYC_VERIFICATIONS: 'kyc_verifications',
    REVIEWS: 'reviews',
    MESSAGES: 'messages',
    PAYMENTS: 'payments',
  },
}));

// Import services after mocking
const { register } = await import('../services/auth-service.js');
const { createProfile: createFreelancerProfile, addSkillsToProfile } = await import('../services/freelancer-profile-service.js');
const { createEmployerProfile } = await import('../services/employer-profile-service.js');
const { createProject, addMilestones } = await import('../services/project-service.js');
const { submitProposal, acceptProposal } = await import('../services/proposal-service.js');
const { requestMilestoneCompletion, approveMilestone, clearDisputes } = await import('../services/payment-service.js');
const { createDispute, submitEvidence, resolveDispute } = await import('../services/dispute-service.js');

// Helper to clear all stores
function clearAllStores(): void {
  userStore.clear();
  freelancerProfileStore.clear();
  employerProfileStore.clear();
  projectStore.clear();
  proposalStore.clear();
  contractStore.clear();
  disputeStore.clear();
  notificationStore.clear();
  skillStore.clear();
  skillCategoryStore.clear();
  clearDisputes();
}

// Helper to create test skill
function createTestSkill(categoryId: string): Skill {
  const now = new Date().toISOString();
  const skill: Skill = {
    id: generateId(),
    categoryId,
    name: 'TypeScript',
    description: 'TypeScript programming',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  skillStore.set(skill.id, skill);
  return skill;
}

// Helper to create test skill category
function createTestSkillCategory(): SkillCategory {
  const now = new Date().toISOString();
  const category: SkillCategory = {
    id: generateId(),
    name: 'Programming',
    description: 'Programming languages',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  skillCategoryStore.set(category.id, category);
  return category;
}


describe('Integration Tests - Critical Flows', () => {
  beforeEach(() => {
    clearAllStores();
  });

  /**
   * Flow 1: Registration → Profile → Project → Proposal → Contract
   * Tests the complete user journey from registration to contract creation
   */
  describe('Flow 1: Registration → Profile → Project → Proposal → Contract', () => {
    it('should complete the full freelancer-employer workflow', async () => {
      // Step 1: Register a freelancer
      const freelancerRegResult = await register({
        email: 'freelancer@test.com',
        password: 'SecurePass123!',
        role: 'freelancer',
      });

      expect(freelancerRegResult).not.toHaveProperty('code');
      if ('code' in freelancerRegResult) return;
      expect(freelancerRegResult.user.role).toBe('freelancer');
      expect(freelancerRegResult.accessToken).toBeDefined();
      const freelancerId = freelancerRegResult.user.id;

      // Step 2: Register an employer
      const employerRegResult = await register({
        email: 'employer@test.com',
        password: 'SecurePass456!',
        role: 'employer',
      });

      expect(employerRegResult).not.toHaveProperty('code');
      if ('code' in employerRegResult) return;
      expect(employerRegResult.user.role).toBe('employer');
      const employerId = employerRegResult.user.id;

      // Step 3: Create freelancer profile
      const category = createTestSkillCategory();
      const skill = createTestSkill(category.id);

      const freelancerProfileResult = await createFreelancerProfile(freelancerId, {
        bio: 'Experienced TypeScript developer',
        hourlyRate: 75,
        availability: 'available',
      });

      expect(freelancerProfileResult.success).toBe(true);
      if (!freelancerProfileResult.success) return;
      expect(freelancerProfileResult.data.userId).toBe(freelancerId);

      // Add skills to profile
      const addSkillsResult = await addSkillsToProfile(freelancerId, [
        { name: skill.name, yearsOfExperience: 5 },
      ]);
      expect(addSkillsResult.success).toBe(true);

      // Step 4: Create employer profile
      const employerProfileResult = await createEmployerProfile(employerId, {
        companyName: 'Tech Corp',
        description: 'A technology company',
        industry: 'Technology',
      });

      expect(employerProfileResult.success).toBe(true);
      if (!employerProfileResult.success) return;
      expect(employerProfileResult.data.userId).toBe(employerId);
      expect(employerProfileResult.data.companyName).toBe('Tech Corp');

      // Step 5: Create a project
      const projectResult = await createProject(employerId, {
        title: 'Build a REST API',
        description: 'Need a TypeScript REST API built',
        requiredSkills: [{ skillId: skill.id }],
        budget: 5000,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(projectResult.success).toBe(true);
      if (!projectResult.success) return;
      const project = projectResult.data;
      expect((project as any).employer_id || (project as any).employerId).toBe(employerId);
      expect(project.status).toBe('open');

      // Step 6: Add milestones to project
      const milestonesResult = await addMilestones(project.id, employerId, [
        { title: 'API Design', description: 'Design the API', amount: 1500, dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
        { title: 'Implementation', description: 'Implement the API', amount: 2500, dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString() },
        { title: 'Testing', description: 'Test the API', amount: 1000, dueDate: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString() },
      ]);

      expect(milestonesResult.success).toBe(true);
      if (milestonesResult.success) {
        expect(milestonesResult.data.milestones.length).toBe(3);
      }

      // Step 7: Freelancer submits a proposal
      const proposalResult = await submitProposal(freelancerId, {
        projectId: project.id,
        coverLetter: 'I am an experienced TypeScript developer and would love to work on this project.',
        proposedRate: 70,
        estimatedDuration: 30,
      });

      expect(proposalResult.success).toBe(true);
      if (!proposalResult.success) return;
      const proposal = proposalResult.data.proposal;
      expect(proposal.freelancerId).toBe(freelancerId);
      expect(proposal.projectId).toBe(project.id);
      expect(proposal.status).toBe('pending');

      // Verify notification was sent to employer
      expect(proposalResult.data.notification.userId).toBe(employerId);
      expect(proposalResult.data.notification.type).toBe('proposal_received');

      // Step 8: Employer accepts the proposal
      const acceptResult = await acceptProposal(proposal.id, employerId);

      expect(acceptResult.success).toBe(true);
      if (!acceptResult.success) return;

      // Verify proposal status updated
      expect(acceptResult.data.proposal.status).toBe('accepted');

      // Verify contract was created
      const contract = acceptResult.data.contract;
      expect(contract.freelancerId).toBe(freelancerId);
      expect(contract.employerId).toBe(employerId);
      expect(contract.projectId).toBe(project.id);
      expect(contract.status).toBe('active');

      // Verify notification was sent to freelancer
      expect(acceptResult.data.notification.userId).toBe(freelancerId);
      expect(acceptResult.data.notification.type).toBe('proposal_accepted');

      // Verify contract exists in store
      expect(contractStore.has(contract.id)).toBe(true);
    });
  });

  /**
   * Flow 2: Milestone Completion → Approval → Payment
   * Tests the payment workflow from milestone completion to payment release
   */
  describe('Flow 2: Milestone Completion → Approval → Payment', () => {
    it('should complete the full milestone payment workflow', async () => {
      // Setup: Create users, project, proposal, and contract
      const freelancerId = generateId();
      const employerId = generateId();

      // Create users in store
      const freelancerUser: User = {
        id: freelancerId,
        email: 'freelancer@test.com',
        passwordHash: 'hash',
        role: 'freelancer',
        walletAddress: '0x' + 'f'.repeat(40),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      userStore.set(freelancerId, freelancerUser);

      const employerUser: User = {
        id: employerId,
        email: 'employer@test.com',
        passwordHash: 'hash',
        role: 'employer',
        walletAddress: '0x' + 'e'.repeat(40),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      userStore.set(employerId, employerUser);

      // Create project with milestones
      const milestone1: Milestone = {
        id: generateId(),
        title: 'Phase 1',
        description: 'First phase',
        amount: 2000,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
      };

      const milestone2: Milestone = {
        id: generateId(),
        title: 'Phase 2',
        description: 'Second phase',
        amount: 3000,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
      };

      const project: Project = {
        id: generateId(),
        employerId,
        title: 'Test Project',
        description: 'A test project',
        requiredSkills: [],
        budget: 5000,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'in_progress',
        milestones: [milestone1, milestone2],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      projectStore.set(project.id, project);

      // Create contract
      const contract: Contract = {
        id: generateId(),
        projectId: project.id,
        proposalId: generateId(),
        freelancerId,
        employerId,
        escrowAddress: '0x' + 'a'.repeat(40),
        totalAmount: 5000,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      contractStore.set(contract.id, contract);

      // Step 1: Freelancer marks milestone 1 as complete
      const completionResult = await requestMilestoneCompletion(
        contract.id,
        milestone1.id,
        freelancerId
      );

      expect(completionResult.success).toBe(true);
      if (completionResult.success) {
        expect(completionResult.data.status).toBe('submitted');
        expect(completionResult.data.notificationSent).toBe(true);
      }

      // Verify milestone status updated
      const updatedProject1 = projectStore.get(project.id);
      const updatedMilestone1 = updatedProject1?.milestones.find(m => m.id === milestone1.id);
      expect(updatedMilestone1?.status).toBe('submitted');

      // Step 2: Employer approves milestone 1
      const approvalResult1 = await approveMilestone(
        contract.id,
        milestone1.id,
        employerId
      );

      expect(approvalResult1.success).toBe(true);
      if (approvalResult1.success) {
        expect(approvalResult1.data.status).toBe('approved');
        expect(approvalResult1.data.paymentReleased).toBe(true);
        expect(approvalResult1.data.contractCompleted).toBe(false); // Still have milestone 2
      }

      // Verify milestone status updated
      const updatedProject2 = projectStore.get(project.id);
      const approvedMilestone1 = updatedProject2?.milestones.find(m => m.id === milestone1.id);
      expect(approvedMilestone1?.status).toBe('approved');

      // Step 3: Freelancer marks milestone 2 as complete
      const completionResult2 = await requestMilestoneCompletion(
        contract.id,
        milestone2.id,
        freelancerId
      );

      expect(completionResult2.success).toBe(true);

      // Step 4: Employer approves milestone 2 (final milestone)
      const approvalResult2 = await approveMilestone(
        contract.id,
        milestone2.id,
        employerId
      );

      expect(approvalResult2.success).toBe(true);
      if (approvalResult2.success) {
        expect(approvalResult2.data.status).toBe('approved');
        expect(approvalResult2.data.paymentReleased).toBe(true);
        expect(approvalResult2.data.contractCompleted).toBe(true); // All milestones done
      }

      // Verify contract is completed
      const finalContract = contractStore.get(contract.id);
      expect(finalContract?.status).toBe('completed');

      // Verify project is completed
      const finalProject = projectStore.get(project.id);
      expect(finalProject?.status).toBe('completed');
    });
  });


  /**
   * Flow 3: Dispute Creation → Evidence → Resolution
   * Tests the dispute resolution workflow
   */
  describe('Flow 3: Dispute Creation → Evidence → Resolution', () => {
    it('should complete the full dispute resolution workflow', async () => {
      // Setup: Create users, project, and contract
      const freelancerId = generateId();
      const employerId = generateId();
      const adminId = generateId();

      // Create users in store
      const freelancerUser: User = {
        id: freelancerId,
        email: 'freelancer@test.com',
        passwordHash: 'hash',
        role: 'freelancer',
        walletAddress: '0x' + 'f'.repeat(40),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      userStore.set(freelancerId, freelancerUser);

      const employerUser: User = {
        id: employerId,
        email: 'employer@test.com',
        passwordHash: 'hash',
        role: 'employer',
        walletAddress: '0x' + 'e'.repeat(40),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      userStore.set(employerId, employerUser);

      userStore.set(adminId, {
        id: adminId,
        email: 'admin@test.com',
        passwordHash: 'hash',
        role: 'admin',
        walletAddress: '0x' + 'a'.repeat(40),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Create project with milestone
      const milestone: Milestone = {
        id: generateId(),
        title: 'Disputed Milestone',
        description: 'A milestone that will be disputed',
        amount: 3000,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'submitted', // Already submitted by freelancer
      };

      const project: Project = {
        id: generateId(),
        employerId,
        title: 'Test Project',
        description: 'A test project',
        requiredSkills: [],
        budget: 3000,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'in_progress',
        milestones: [milestone],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      projectStore.set(project.id, project);

      // Create contract
      const contract: Contract = {
        id: generateId(),
        projectId: project.id,
        proposalId: generateId(),
        freelancerId,
        employerId,
        escrowAddress: '0x' + 'a'.repeat(40),
        totalAmount: 3000,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      contractStore.set(contract.id, contract);

      // Step 1: Employer creates a dispute
      const disputeResult = await createDispute({
        contractId: contract.id,
        milestoneId: milestone.id,
        initiatorId: employerId,
        reason: 'The delivered work does not meet the requirements specified in the project description.',
      });

      expect(disputeResult.success).toBe(true);
      if (!disputeResult.success) return;

      const dispute = disputeResult.data;
      expect(dispute.contractId).toBe(contract.id);
      expect(dispute.milestoneId).toBe(milestone.id);
      expect(dispute.initiatorId).toBe(employerId);
      expect(dispute.status).toBe('open');
      expect(dispute.evidence).toEqual([]);

      // Verify milestone status updated to disputed
      const updatedProject1 = projectStore.get(project.id);
      const disputedMilestone = updatedProject1?.milestones.find(m => m.id === milestone.id);
      expect(disputedMilestone?.status).toBe('disputed');

      // Verify contract status updated to disputed
      const updatedContract1 = contractStore.get(contract.id);
      expect(updatedContract1?.status).toBe('disputed');

      // Step 2: Employer submits evidence
      const employerEvidenceResult = await submitEvidence({
        disputeId: dispute.id,
        submitterId: employerId,
        type: 'text',
        content: 'The API endpoints do not match the specification. See attached screenshots.',
      });

      expect(employerEvidenceResult.success).toBe(true);
      if (employerEvidenceResult.success) {
        expect(employerEvidenceResult.data.evidence.length).toBe(1);
        expect(employerEvidenceResult.data.evidence[0]?.submitterId).toBe(employerId);
        expect(employerEvidenceResult.data.status).toBe('under_review');
      }

      // Step 3: Freelancer submits counter-evidence
      const freelancerEvidenceResult = await submitEvidence({
        disputeId: dispute.id,
        submitterId: freelancerId,
        type: 'link',
        content: 'https://github.com/project/commits - All requirements were implemented as specified.',
      });

      expect(freelancerEvidenceResult.success).toBe(true);
      if (freelancerEvidenceResult.success) {
        expect(freelancerEvidenceResult.data.evidence.length).toBe(2);
        expect(freelancerEvidenceResult.data.evidence[1]?.submitterId).toBe(freelancerId);
      }

      // Step 4: Admin resolves the dispute in favor of freelancer
      const resolveResult = await resolveDispute({
        disputeId: dispute.id,
        decision: 'freelancer_favor',
        reasoning: 'After reviewing the evidence, the freelancer has met all requirements as specified in the original project description.',
        resolvedBy: adminId,
        resolverRole: 'admin',
      });

      expect(resolveResult.success).toBe(true);
      if (resolveResult.success) {
        const resolvedDispute = resolveResult.data;
        expect(resolvedDispute.status).toBe('resolved');
        expect(resolvedDispute.resolution).toBeDefined();
        expect(resolvedDispute.resolution?.decision).toBe('freelancer_favor');
        expect(resolvedDispute.resolution?.resolvedBy).toBe(adminId);
        expect(resolvedDispute.resolution?.reasoning).toContain('freelancer has met all requirements');
      }

      // Verify dispute is stored correctly
      const finalDispute = disputeStore.get(dispute.id);
      expect(finalDispute?.status).toBe('resolved');
      expect(finalDispute?.resolution?.decision).toBe('freelancer_favor');
    });

    it('should handle dispute resolution in favor of employer', async () => {
      // Setup
      const freelancerId = generateId();
      const employerId = generateId();
      const adminId = generateId();

      userStore.set(freelancerId, {
        id: freelancerId,
        email: 'freelancer@test.com',
        passwordHash: 'hash',
        role: 'freelancer',
        walletAddress: '0x' + 'f'.repeat(40),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      userStore.set(employerId, {
        id: employerId,
        email: 'employer@test.com',
        passwordHash: 'hash',
        role: 'employer',
        walletAddress: '0x' + 'e'.repeat(40),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const milestone: Milestone = {
        id: generateId(),
        title: 'Disputed Milestone',
        description: 'A milestone that will be disputed',
        amount: 2000,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'submitted',
      };

      const project: Project = {
        id: generateId(),
        employerId,
        title: 'Test Project',
        description: 'A test project',
        requiredSkills: [],
        budget: 2000,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'in_progress',
        milestones: [milestone],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      projectStore.set(project.id, project);

      const contract: Contract = {
        id: generateId(),
        projectId: project.id,
        proposalId: generateId(),
        freelancerId,
        employerId,
        escrowAddress: '0x' + 'a'.repeat(40),
        totalAmount: 2000,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      contractStore.set(contract.id, contract);

      // Create dispute
      const disputeResult = await createDispute({
        contractId: contract.id,
        milestoneId: milestone.id,
        initiatorId: employerId,
        reason: 'Work was not delivered at all.',
      });

      expect(disputeResult.success).toBe(true);
      if (!disputeResult.success) return;

      // Resolve in favor of employer
      const resolveResult = await resolveDispute({
        disputeId: disputeResult.data.id,
        decision: 'employer_favor',
        reasoning: 'The freelancer failed to deliver any work for this milestone.',
        resolvedBy: adminId,
        resolverRole: 'admin',
      });

      expect(resolveResult.success).toBe(true);
      if (resolveResult.success) {
        expect(resolveResult.data.resolution?.decision).toBe('employer_favor');
      }
    });
  });
});
