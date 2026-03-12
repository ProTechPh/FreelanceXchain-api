/**
 * Test Data Factory
 * Provides reusable functions to create test data entities
 */

import { generateId } from '../../utils/id.js';
import type { UserEntity } from '../../repositories/user-repository.js';
import type { ProjectEntity, MilestoneEntity } from '../../repositories/project-repository.js';
import type { ProposalEntity } from '../../repositories/proposal-repository.js';
import type { ContractEntity } from '../../repositories/contract-repository.js';
import type { SkillEntity, SkillCategoryEntity } from '../../repositories/skill-repository.js';
import type { DisputeEntity, EvidenceEntity } from '../../repositories/dispute-repository.js';
import type { NotificationEntity } from '../../repositories/notification-repository.js';
import type { FreelancerProfileEntity } from '../../repositories/freelancer-profile-repository.js';
import type { EmployerProfileEntity } from '../../repositories/employer-profile-repository.js';

const now = () => new Date().toISOString();

/**
 * Create a test user entity
 */
export function createTestUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: generateId(),
    email: `test-${generateId()}@example.com`,
    password_hash: 'hashed_password123',
    name: 'Test User',
    role: 'freelancer',
    wallet_address: `0x${generateId().substring(0, 40)}`,
    created_at: now(),
    updated_at: now(),
    ...overrides,
  };
}

/**
 * Create a test project entity
 */
export function createTestProject(overrides: Partial<ProjectEntity> = {}): ProjectEntity {
  return {
    id: generateId(),
    employer_id: generateId(),
    title: 'Test Project',
    description: 'Test project description',
    required_skills: [],
    budget: 1000,
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'open',
    milestones: [],
    tags: [],
    created_at: now(),
    updated_at: now(),
    ...overrides,
  };
}

/**
 * Create a test milestone entity
 */
export function createTestMilestone(overrides: Partial<MilestoneEntity> = {}): MilestoneEntity {
  return {
    id: generateId(),
    title: 'Test Milestone',
    description: 'Test milestone description',
    amount: 500,
    due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
    ...overrides,
  };
}

/**
 * Create a test proposal entity
 */
export function createTestProposal(overrides: Partial<ProposalEntity> = {}): ProposalEntity {
  return {
    id: generateId(),
    project_id: generateId(),
    freelancer_id: generateId(),
    cover_letter: 'Test cover letter',
    proposed_rate: 50,
    estimated_duration: 30,
    status: 'pending',
    attachments: [],
    created_at: now(),
    updated_at: now(),
    ...overrides,
  };
}

/**
 * Create a test contract entity
 */
export function createTestContract(overrides: Partial<ContractEntity> = {}): ContractEntity {
  return {
    id: generateId(),
    project_id: generateId(),
    proposal_id: generateId(),
    freelancer_id: generateId(),
    employer_id: generateId(),
    escrow_address: `0x${generateId().substring(0, 40)}`,
    total_amount: 1000,
    status: 'completed',
    created_at: now(),
    updated_at: now(),
    ...overrides,
  };
}

/**
 * Create a test skill entity
 */
export function createTestSkill(overrides: Partial<SkillEntity> = {}): SkillEntity {
  return {
    id: generateId(),
    category_id: generateId(),
    name: 'Test Skill',
    description: 'Test skill description',
    is_active: true,
    created_at: now(),
    updated_at: now(),
    ...overrides,
  };
}

/**
 * Create a test skill category entity
 */
export function createTestSkillCategory(overrides: Partial<SkillCategoryEntity> = {}): SkillCategoryEntity {
  return {
    id: generateId(),
    name: 'Test Category',
    description: 'Test category description',
    is_active: true,
    created_at: now(),
    updated_at: now(),
    ...overrides,
  };
}

/**
 * Create a test dispute entity
 */
export function createTestDispute(overrides: Partial<DisputeEntity> = {}): DisputeEntity {
  return {
    id: generateId(),
    contract_id: generateId(),
    milestone_id: generateId(),
    initiator_id: generateId(),
    reason: 'Test dispute reason',
    evidence: [],
    status: 'open',
    resolution: null,
    created_at: now(),
    updated_at: now(),
    ...overrides,
  };
}

/**
 * Create a test evidence entity
 */
export function createTestEvidence(overrides: Partial<EvidenceEntity> = {}): EvidenceEntity {
  return {
    id: generateId(),
    submitter_id: generateId(),
    type: 'text',
    content: 'Test evidence content',
    submitted_at: now(),
    ...overrides,
  };
}

/**
 * Create a test notification entity
 */
export function createTestNotification(overrides: Partial<NotificationEntity> = {}): NotificationEntity {
  return {
    id: generateId(),
    user_id: generateId(),
    type: 'message',
    title: 'Test Notification',
    message: 'Test notification message',
    data: {},
    is_read: false,
    created_at: now(),
    updated_at: now(),
    ...overrides,
  };
}

/**
 * Create a test freelancer profile entity
 */
export function createTestFreelancerProfile(overrides: Partial<FreelancerProfileEntity> = {}): FreelancerProfileEntity {
  return {
    id: generateId(),
    user_id: generateId(),
    name: 'Test Freelancer',
    nationality: 'US',
    bio: 'Test freelancer bio',
    hourly_rate: 50,
    skills: [],
    experience: [],
    availability: 'available',
    created_at: now(),
    updated_at: now(),
    ...overrides,
  };
}

/**
 * Create a test employer profile entity
 */
export function createTestEmployerProfile(overrides: Partial<EmployerProfileEntity> = {}): EmployerProfileEntity {
  return {
    id: generateId(),
    user_id: generateId(),
    name: 'Test Employer',
    nationality: 'US',
    company_name: 'Test Company',
    description: 'Test company description',
    industry: 'Technology',
    created_at: now(),
    updated_at: now(),
    ...overrides,
  };
}

/**
 * Create a test payment entity
 */
export function createTestPayment(overrides: Partial<any> = {}): any {
  return {
    id: generateId(),
    contract_id: generateId(),
    milestone_id: null,
    payer_id: generateId(),
    payee_id: generateId(),
    amount: 1000,
    currency: 'ETH',
    tx_hash: '0x' + '1'.repeat(64),
    status: 'completed',
    payment_type: 'escrow_deposit',
    created_at: now(),
    updated_at: now(),
    ...overrides,
  };
}

/**
 * Create a test review entity
 */
export function createTestReview(overrides: Partial<any> = {}): any {
  return {
    id: generateId(),
    contract_id: generateId(),
    reviewer_id: generateId(),
    reviewee_id: generateId(),
    rating: 5,
    comment: 'Great work!',
    reviewer_role: 'employer',
    created_at: now(),
    updated_at: now(),
    ...overrides,
  };
}
