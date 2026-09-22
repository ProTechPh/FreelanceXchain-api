/**
 * Appwrite Database Setup Script
 * Creates all collections and attributes for FreelanceXchain
 * 
 * Run: npx tsx scripts/setup-appwrite-db.ts
 * 
 * Requirements:
 * - APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY must be set
 * - APPWRITE_DATABASE_ID (optional, defaults to 'freelancexchain')
 */

import dotenv from 'dotenv';
dotenv.config();

import { Client, Databases, Storage, ID, Permission, Role, Query, DatabasesIndexType, OrderBy } from 'node-appwrite';

const ENDPOINT = process.env['APPWRITE_ENDPOINT']!;
const PROJECT_ID = process.env['APPWRITE_PROJECT_ID']!;
const API_KEY = process.env['APPWRITE_API_KEY']!;
const DATABASE_ID = process.env['APPWRITE_DATABASE_ID'] || 'freelancexchain';

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error('Missing required env vars: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

// ─── Collection Definitions ─────────────────────────────────────────────────
// Each collection: { id, name, attributes: [{ name, type, size?, required?, default?, array? }] }

type AttributeDef = {
  name: string;
  type: 'string' | 'integer' | 'double' | 'boolean';
  size?: number;
  required: boolean;
  default?: string | number | boolean;
  array?: boolean;
};

type IndexDef = {
  key: string;
  type: DatabasesIndexType;
  attributes: string[];
  orders?: OrderBy[];
};

type CollectionDef = {
  id: string;
  name: string;
  description?: string;
  attributes: AttributeDef[];
  indexes?: IndexDef[];
};

const COLLECTIONS: CollectionDef[] = [
  {
    id: 'users',
    name: 'Users',
    attributes: [
      { name: 'email', type: 'string', size: 255, required: true },
      { name: 'password_hash', type: 'string', size: 255, required: false, default: '' },
      { name: 'role', type: 'string', size: 20, required: true },
      { name: 'wallet_address', type: 'string', size: 42, required: false, default: '' },
      { name: 'name', type: 'string', size: 255, required: false, default: 'User' },
      { name: 'is_suspended', type: 'boolean', required: false, default: false },
      { name: 'suspension_reason', type: 'string', size: 1000, required: false },
      { name: 'mfa_enabled', type: 'boolean', required: false, default: false },
    ],
    indexes: [
      { key: 'unique_email', type: DatabasesIndexType.Unique, attributes: ['email'] },
      { key: 'role_createdAt', type: DatabasesIndexType.Key, attributes: ['role', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
    ],
  },
  {
    id: 'skill_categories',
    name: 'Skill Categories',
    attributes: [
      { name: 'name', type: 'string', size: 100, required: true },
      { name: 'description', type: 'string', size: 1000, required: false, default: '' },
      { name: 'is_active', type: 'boolean', required: false, default: true },
    ],
    indexes: [
      { key: 'is_active_name', type: DatabasesIndexType.Key, attributes: ['is_active', 'name'], orders: [OrderBy.Asc, OrderBy.Asc] },
    ],
  },
  {
    id: 'skills',
    name: 'Skills',
    attributes: [
      { name: 'category_id', type: 'string', size: 36, required: true },
      { name: 'name', type: 'string', size: 100, required: true },
      { name: 'description', type: 'string', size: 1000, required: false, default: '' },
      { name: 'is_active', type: 'boolean', required: false, default: true },
    ],
    indexes: [
      { key: 'category_id_name', type: DatabasesIndexType.Key, attributes: ['category_id', 'name'], orders: [OrderBy.Asc, OrderBy.Asc] },
      { key: 'category_id_is_active_name', type: DatabasesIndexType.Key, attributes: ['category_id', 'is_active', 'name'], orders: [OrderBy.Asc, OrderBy.Asc, OrderBy.Asc] },
      { key: 'name', type: DatabasesIndexType.Key, attributes: ['name'], orders: [OrderBy.Asc] },
    ],
  },
  {
    id: 'freelancer_profiles',
    name: 'Freelancer Profiles',
    attributes: [
      { name: 'user_id', type: 'string', size: 36, required: true },
      { name: 'name', type: 'string', size: 255, required: false },
      { name: 'nationality', type: 'string', size: 100, required: false },
      { name: 'bio', type: 'string', size: 5000, required: false, default: '' },
      { name: 'hourly_rate', type: 'double', required: false, default: 0 },
      { name: 'skills', type: 'string', size: 10000, required: false, default: '[]' }, // JSON array
      { name: 'experience', type: 'string', size: 50000, required: false, default: '[]' }, // JSON array
      { name: 'availability', type: 'string', size: 20, required: false, default: 'available' },
    ],
    indexes: [
      { key: 'user_id', type: DatabasesIndexType.Key, attributes: ['user_id'] },
      { key: 'availability_createdAt', type: DatabasesIndexType.Key, attributes: ['availability', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
    ],
  },
  {
    id: 'employer_profiles',
    name: 'Employer Profiles',
    attributes: [
      { name: 'user_id', type: 'string', size: 36, required: true },
      { name: 'name', type: 'string', size: 255, required: false },
      { name: 'nationality', type: 'string', size: 100, required: false },
      { name: 'company_name', type: 'string', size: 255, required: false, default: '' },
      { name: 'description', type: 'string', size: 5000, required: false, default: '' },
      { name: 'industry', type: 'string', size: 100, required: false, default: '' },
    ],
    indexes: [
      { key: 'user_id', type: DatabasesIndexType.Key, attributes: ['user_id'] },
    ],
  },
  {
    id: 'projects',
    name: 'Projects',
    attributes: [
      { name: 'employer_id', type: 'string', size: 36, required: true },
      { name: 'title', type: 'string', size: 255, required: true },
      { name: 'description', type: 'string', size: 50000, required: false, default: '' },
      { name: 'required_skills', type: 'string', size: 50000, required: false, default: '[]' },
      { name: 'required_skill_ids', type: 'string', size: 36, required: false, array: true },
      { name: 'budget', type: 'double', required: false, default: 0 },
      { name: 'deadline', type: 'string', size: 30, required: true },
      { name: 'is_rush', type: 'boolean', required: false, default: false },
      { name: 'rush_fee_percentage', type: 'double', required: false, default: 0 },
      { name: 'status', type: 'string', size: 20, required: false, default: 'open' },
      { name: 'milestones', type: 'string', size: 100000, required: false, default: '[]' },
      { name: 'freelancer_limit', type: 'integer', required: false, default: 1 },
      { name: 'tags', type: 'string', size: 5000, required: false, default: '[]' },
      { name: 'attachments', type: 'string', size: 50000, required: false, default: '[]' },
    ],
    indexes: [
      { key: 'employer_id', type: DatabasesIndexType.Key, attributes: ['employer_id'] },
      { key: 'status_createdAt', type: DatabasesIndexType.Key, attributes: ['status', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      // Marketplace search hot paths: keyword (contains on title), budget range,
      // and skills (equal on the required_skill_ids array attribute).
      { key: 'status_title', type: DatabasesIndexType.Key, attributes: ['status', 'title'] },
      { key: 'status_budget', type: DatabasesIndexType.Key, attributes: ['status', 'budget'] },
      { key: 'status_required_skill_ids', type: DatabasesIndexType.Key, attributes: ['status', 'required_skill_ids'] },
    ],
  },
  {
    id: 'proposals',
    name: 'Proposals',
    attributes: [
      { name: 'project_id', type: 'string', size: 36, required: true },
      { name: 'freelancer_id', type: 'string', size: 36, required: true },
      { name: 'cover_letter', type: 'string', size: 10000, required: false },
      { name: 'attachments', type: 'string', size: 50000, required: false, default: '[]' },
      { name: 'proposed_rate', type: 'double', required: true },
      { name: 'estimated_duration', type: 'integer', required: true },
      { name: 'status', type: 'string', size: 20, required: false, default: 'pending' },
    ],
    indexes: [
      { key: 'project_id_createdAt', type: DatabasesIndexType.Key, attributes: ['project_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'freelancer_id_createdAt', type: DatabasesIndexType.Key, attributes: ['freelancer_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'project_id_status', type: DatabasesIndexType.Key, attributes: ['project_id', 'status'] },
      { key: 'project_id_freelancer_id', type: DatabasesIndexType.Key, attributes: ['project_id', 'freelancer_id'] },
    ],
  },
  {
    id: 'contracts',
    name: 'Contracts',
    attributes: [
      { name: 'project_id', type: 'string', size: 36, required: true },
      { name: 'proposal_id', type: 'string', size: 36, required: true },
      { name: 'freelancer_id', type: 'string', size: 36, required: true },
      { name: 'employer_id', type: 'string', size: 36, required: true },
      { name: 'escrow_address', type: 'string', size: 42, required: false, default: '' },
      { name: 'base_amount', type: 'double', required: false, default: 0 },
      { name: 'rush_fee', type: 'double', required: false, default: 0 },
      { name: 'total_amount', type: 'double', required: false, default: 0 },
      { name: 'status', type: 'string', size: 20, required: false, default: 'pending' },
    ],
    indexes: [
      { key: 'freelancer_id_createdAt', type: DatabasesIndexType.Key, attributes: ['freelancer_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'employer_id_createdAt', type: DatabasesIndexType.Key, attributes: ['employer_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'project_id_createdAt', type: DatabasesIndexType.Key, attributes: ['project_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'freelancer_id_status', type: DatabasesIndexType.Key, attributes: ['freelancer_id', 'status'] },
      { key: 'proposal_id', type: DatabasesIndexType.Key, attributes: ['proposal_id'] },
      { key: 'status_createdAt', type: DatabasesIndexType.Key, attributes: ['status', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
    ],
  },
  {
    id: 'milestones',
    name: 'Milestones',
    attributes: [
      { name: 'contract_id', type: 'string', size: 36, required: true },
      { name: 'title', type: 'string', size: 255, required: true },
      { name: 'description', type: 'string', size: 10000, required: false, default: '' },
      { name: 'amount', type: 'double', required: true },
      { name: 'due_date', type: 'string', size: 30, required: true },
      { name: 'status', type: 'string', size: 20, required: false, default: 'pending' },
      { name: 'submitted_at', type: 'string', size: 30, required: false },
      { name: 'approved_at', type: 'string', size: 30, required: false },
      { name: 'rejected_at', type: 'string', size: 30, required: false },
      { name: 'completed_at', type: 'string', size: 30, required: false },
      { name: 'deliverable_files', type: 'string', size: 50000, required: false, default: '[]' },
      { name: 'rejection_reason', type: 'string', size: 5000, required: false },
      { name: 'revision_count', type: 'integer', required: false, default: 0 },
      { name: 'notes', type: 'string', size: 5000, required: false },
    ],
    indexes: [
      { key: 'contract_id_due_date', type: DatabasesIndexType.Key, attributes: ['contract_id', 'due_date'], orders: [OrderBy.Asc, OrderBy.Asc] },
      { key: 'project_id', type: DatabasesIndexType.Key, attributes: ['project_id'] },
    ],
  },
  {
    id: 'reviews',
    name: 'Reviews',
    attributes: [
      { name: 'contract_id', type: 'string', size: 36, required: true },
      { name: 'project_id', type: 'string', size: 36, required: false },
      { name: 'reviewer_id', type: 'string', size: 36, required: true },
      { name: 'reviewee_id', type: 'string', size: 36, required: true },
      { name: 'rating', type: 'double', required: true },
      { name: 'comment', type: 'string', size: 10000, required: false },
      { name: 'reviewer_role', type: 'string', size: 20, required: false },
      { name: 'work_quality', type: 'double', required: false },
      { name: 'communication', type: 'double', required: false },
      { name: 'professionalism', type: 'double', required: false },
      { name: 'would_work_again', type: 'boolean', required: false },
    ],
    indexes: [
      { key: 'contract_id_createdAt', type: DatabasesIndexType.Key, attributes: ['contract_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'reviewee_id_createdAt', type: DatabasesIndexType.Key, attributes: ['reviewee_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'project_id_createdAt', type: DatabasesIndexType.Key, attributes: ['project_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'contract_id_reviewer_id', type: DatabasesIndexType.Key, attributes: ['contract_id', 'reviewer_id'] },
    ],
  },
  {
    id: 'disputes',
    name: 'Disputes',
    attributes: [
      { name: 'contract_id', type: 'string', size: 36, required: true },
      { name: 'milestone_id', type: 'string', size: 36, required: true },
      { name: 'initiator_id', type: 'string', size: 36, required: true },
      { name: 'reason', type: 'string', size: 10000, required: true },
      { name: 'evidence', type: 'string', size: 100000, required: false, default: '[]' },
      { name: 'status', type: 'string', size: 20, required: false, default: 'open' },
      { name: 'resolution', type: 'string', size: 50000, required: false },
    ],
    indexes: [
      { key: 'contract_id_createdAt', type: DatabasesIndexType.Key, attributes: ['contract_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'milestone_id', type: DatabasesIndexType.Key, attributes: ['milestone_id'] },
      { key: 'status_createdAt', type: DatabasesIndexType.Key, attributes: ['status', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'initiator_id_createdAt', type: DatabasesIndexType.Key, attributes: ['initiator_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
    ],
  },
  {
    id: 'dispute_evidence',
    name: 'Dispute Evidence',
    attributes: [
      { name: 'dispute_id', type: 'string', size: 36, required: true },
      { name: 'submitted_by', type: 'string', size: 36, required: true },
      { name: 'evidence_type', type: 'string', size: 20, required: true },
      { name: 'file_url', type: 'string', size: 2000, required: false },
      { name: 'description', type: 'string', size: 10000, required: true },
      { name: 'verified_by', type: 'string', size: 36, required: false },
      { name: 'verified_at', type: 'string', size: 30, required: false },
    ],
    indexes: [
      { key: 'dispute_id_createdAt', type: DatabasesIndexType.Key, attributes: ['dispute_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Asc] },
    ],
  },
  {
    id: 'payments',
    name: 'Payments',
    attributes: [
      { name: 'contract_id', type: 'string', size: 36, required: true },
      { name: 'milestone_id', type: 'string', size: 36, required: false },
      { name: 'payer_id', type: 'string', size: 36, required: true },
      { name: 'payee_id', type: 'string', size: 36, required: true },
      { name: 'amount', type: 'double', required: true },
      { name: 'currency', type: 'string', size: 10, required: false, default: 'ETH' },
      { name: 'tx_hash', type: 'string', size: 66, required: false },
      { name: 'status', type: 'string', size: 20, required: false, default: 'pending' },
      { name: 'payment_type', type: 'string', size: 30, required: true },
    ],
    indexes: [
      { key: 'contract_id_createdAt', type: DatabasesIndexType.Key, attributes: ['contract_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'user_id_createdAt', type: DatabasesIndexType.Key, attributes: ['user_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'unique_tx_hash', type: DatabasesIndexType.Unique, attributes: ['tx_hash'] },
      { key: 'payee_id_status', type: DatabasesIndexType.Key, attributes: ['payee_id', 'status'] },
      { key: 'payer_id_status', type: DatabasesIndexType.Key, attributes: ['payer_id', 'status'] },
    ],
  },
  {
    id: 'conversations',
    name: 'Conversations',
    attributes: [
      { name: 'participant1_id', type: 'string', size: 36, required: true },
      { name: 'participant2_id', type: 'string', size: 36, required: true },
      { name: 'last_message_at', type: 'string', size: 30, required: false },
      { name: 'last_message_preview', type: 'string', size: 255, required: false },
      { name: 'unread_count_1', type: 'integer', required: false, default: 0 },
      { name: 'unread_count_2', type: 'integer', required: false, default: 0 },
    ],
    indexes: [
      { key: 'participant1_id_last_message_at', type: DatabasesIndexType.Key, attributes: ['participant1_id', 'last_message_at'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'participant2_id_last_message_at', type: DatabasesIndexType.Key, attributes: ['participant2_id', 'last_message_at'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'participant1_participant2', type: DatabasesIndexType.Key, attributes: ['participant1_id', 'participant2_id'] },
    ],
  },
  {
    id: 'messages',
    name: 'Messages',
    attributes: [
      { name: 'conversation_id', type: 'string', size: 36, required: true },
      { name: 'sender_id', type: 'string', size: 36, required: true },
      { name: 'receiver_id', type: 'string', size: 36, required: true },
      { name: 'content', type: 'string', size: 50000, required: true },
      { name: 'is_read', type: 'boolean', required: false, default: false },
      { name: 'attachments', type: 'string', size: 50000, required: false, default: '[]' },
    ],
    indexes: [
      { key: 'conversation_id_createdAt', type: DatabasesIndexType.Key, attributes: ['conversation_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'conversation_receiver_read', type: DatabasesIndexType.Key, attributes: ['conversation_id', 'receiver_id', 'is_read'] },
      { key: 'receiver_id_is_read', type: DatabasesIndexType.Key, attributes: ['receiver_id', 'is_read'] },
    ],
  },
  {
    id: 'notifications',
    name: 'Notifications',
    attributes: [
      { name: 'user_id', type: 'string', size: 36, required: true },
      { name: 'type', type: 'string', size: 50, required: true },
      { name: 'title', type: 'string', size: 255, required: true },
      { name: 'message', type: 'string', size: 10000, required: true },
      { name: 'data', type: 'string', size: 50000, required: false, default: '{}' },
      { name: 'is_read', type: 'boolean', required: false, default: false },
    ],
    indexes: [
      { key: 'user_id_is_read_createdAt', type: DatabasesIndexType.Key, attributes: ['user_id', 'is_read', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Asc, OrderBy.Desc] },
      { key: 'user_id_createdAt', type: DatabasesIndexType.Key, attributes: ['user_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'is_read_createdAt', type: DatabasesIndexType.Key, attributes: ['is_read', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
    ],
  },
  {
    id: 'kyc_verifications',
    name: 'KYC Verifications',
    attributes: [
      { name: 'user_id', type: 'string', size: 36, required: true },
      { name: 'status', type: 'string', size: 20, required: false, default: 'pending' },
      { name: 'didit_session_id', type: 'string', size: 255, required: true },
      { name: 'didit_session_token', type: 'string', size: 255, required: false },
      { name: 'didit_session_url', type: 'string', size: 2000, required: false },
      { name: 'didit_workflow_id', type: 'string', size: 255, required: true },
      { name: 'decision', type: 'string', size: 20, required: false },
      { name: 'document_type', type: 'string', size: 50, required: false },
      { name: 'document_number', type: 'string', size: 100, required: false },
      { name: 'first_name', type: 'string', size: 100, required: false },
      { name: 'last_name', type: 'string', size: 100, required: false },
      { name: 'nationality', type: 'string', size: 100, required: false },
      { name: 'document_verified', type: 'boolean', required: false },
      { name: 'liveness_passed', type: 'boolean', required: false },
      { name: 'face_matched', type: 'boolean', required: false },
      { name: 'ip_address', type: 'string', size: 45, required: false },
      { name: 'metadata', type: 'string', size: 100000, required: false },
      { name: 'reviewed_by', type: 'string', size: 36, required: false },
      { name: 'admin_notes', type: 'string', size: 5000, required: false },
    ],
    indexes: [
      { key: 'user_id_createdAt', type: DatabasesIndexType.Key, attributes: ['user_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'didit_session_id', type: DatabasesIndexType.Key, attributes: ['didit_session_id'] },
      { key: 'status_createdAt', type: DatabasesIndexType.Key, attributes: ['status', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'status_createdAt_asc', type: DatabasesIndexType.Key, attributes: ['status', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Asc] },
    ],
  },
  {
    id: 'email_preferences',
    name: 'Email Preferences',
    attributes: [
      { name: 'user_id', type: 'string', size: 36, required: true },
      { name: 'proposal_received', type: 'boolean', required: false, default: true },
      { name: 'proposal_accepted', type: 'boolean', required: false, default: true },
      { name: 'milestone_updates', type: 'boolean', required: false, default: true },
      { name: 'payment_notifications', type: 'boolean', required: false, default: true },
      { name: 'dispute_notifications', type: 'boolean', required: false, default: true },
      { name: 'contract_notifications', type: 'boolean', required: false, default: true },
      { name: 'message_notifications', type: 'boolean', required: false, default: true },
      { name: 'review_notifications', type: 'boolean', required: false, default: true },
      { name: 'kyc_notifications', type: 'boolean', required: false, default: true },
      { name: 'marketing_emails', type: 'boolean', required: false, default: false },
      { name: 'weekly_digest', type: 'boolean', required: false, default: true },
    ],
    indexes: [
      { key: 'user_id', type: DatabasesIndexType.Key, attributes: ['user_id'] },
      { key: 'weekly_digest', type: DatabasesIndexType.Key, attributes: ['weekly_digest'] },
    ],
  },
  {
    id: 'user_preferences',
    name: 'User Preferences',
    attributes: [
      { name: 'user_id', type: 'string', size: 36, required: true },
      { name: 'tour_progress', type: 'string', size: 5000, required: false, default: '{}' }, // JSON object
    ],
    indexes: [
      { key: 'user_id', type: DatabasesIndexType.Unique, attributes: ['user_id'] },
    ],
  },
  {
    id: 'pending_mfa_sessions',
    name: 'Pending MFA Sessions',
    attributes: [
      { name: 'access_token', type: 'string', size: 10000, required: true },
      { name: 'refresh_token', type: 'string', size: 10000, required: true },
      { name: 'user_id', type: 'string', size: 36, required: true },
      { name: 'factor_id', type: 'string', size: 255, required: true },
      { name: 'expires_at', type: 'integer', required: true },
    ],
    indexes: [
      { key: 'user_id_expires_at', type: DatabasesIndexType.Key, attributes: ['user_id', 'expires_at'] },
    ],
  },
  {
    id: 'refund_requests',
    name: 'Refund Requests',
    attributes: [
      { name: 'contract_id', type: 'string', size: 36, required: true },
      { name: 'requested_by', type: 'string', size: 36, required: true },
      { name: 'amount', type: 'double', required: true },
      { name: 'is_partial', type: 'boolean', required: false, default: false },
      { name: 'reason', type: 'string', size: 10000, required: true },
      { name: 'status', type: 'string', size: 20, required: false, default: 'pending' },
      { name: 'approved_by', type: 'string', size: 36, required: false },
      { name: 'approved_at', type: 'string', size: 50, required: false },
      { name: 'rejected_by', type: 'string', size: 36, required: false },
      { name: 'rejected_at', type: 'string', size: 50, required: false },
      { name: 'rejection_reason', type: 'string', size: 5000, required: false },
      { name: 'transaction_hash', type: 'string', size: 66, required: false },
    ],
    indexes: [
      { key: 'contract_id_status', type: DatabasesIndexType.Key, attributes: ['contract_id', 'status'] },
      { key: 'contract_id_createdAt', type: DatabasesIndexType.Key, attributes: ['contract_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
    ],
  },
  {
    id: 'favorites',
    name: 'Favorites',
    attributes: [
      { name: 'user_id', type: 'string', size: 36, required: true },
      { name: 'target_type', type: 'string', size: 20, required: true },
      { name: 'target_id', type: 'string', size: 36, required: true },
    ],
    indexes: [
      { key: 'user_id_target_type_createdAt', type: DatabasesIndexType.Key, attributes: ['user_id', 'target_type', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Asc, OrderBy.Desc] },
      { key: 'unique_user_target', type: DatabasesIndexType.Unique, attributes: ['user_id', 'target_type', 'target_id'] },
    ],
  },
  {
    id: 'portfolio_items',
    name: 'Portfolio Items',
    attributes: [
      { name: 'freelancer_id', type: 'string', size: 36, required: true },
      { name: 'title', type: 'string', size: 255, required: true },
      { name: 'description', type: 'string', size: 10000, required: false, default: '' },
      { name: 'project_url', type: 'string', size: 2000, required: false },
      { name: 'images', type: 'string', size: 50000, required: false, default: '[]' },
      { name: 'skills', type: 'string', size: 5000, required: false, default: '[]' },
      { name: 'completed_at', type: 'string', size: 30, required: false },
    ],
    indexes: [
      { key: 'freelancer_id_createdAt', type: DatabasesIndexType.Key, attributes: ['freelancer_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
    ],
  },
  {
    id: 'saved_searches',
    name: 'Saved Searches',
    attributes: [
      { name: 'user_id', type: 'string', size: 36, required: true },
      { name: 'name', type: 'string', size: 255, required: true },
      { name: 'search_type', type: 'string', size: 20, required: true },
      { name: 'filters', type: 'string', size: 50000, required: false, default: '{}' },
      { name: 'notify_on_new', type: 'boolean', required: false, default: false },
      // Dedup watermark for the saved-search notify job: only matches created
      // after this timestamp trigger a notification, so a search is not
      // re-notified about the same results on every 6-hour run.
      { name: 'last_notified_at', type: 'string', size: 30, required: false },
    ],
    indexes: [
      { key: 'user_id_createdAt', type: DatabasesIndexType.Key, attributes: ['user_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'notify_on_new', type: DatabasesIndexType.Key, attributes: ['notify_on_new'] },
    ],
  },
  {
    id: 'user_custom_skills',
    name: 'User Custom Skills',
    attributes: [
      { name: 'user_id', type: 'string', size: 36, required: true },
      { name: 'name', type: 'string', size: 255, required: true },
      { name: 'description', type: 'string', size: 10000, required: false, default: '' },
      { name: 'years_of_experience', type: 'integer', required: false, default: 0 },
      { name: 'category_name', type: 'string', size: 100, required: false },
      { name: 'is_approved', type: 'boolean', required: false, default: false },
      { name: 'suggested_for_global', type: 'boolean', required: false, default: false },
    ],
    indexes: [
      { key: 'user_id_createdAt', type: DatabasesIndexType.Key, attributes: ['user_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
    ],
  },
  {
    id: 'skill_suggestions',
    name: 'Skill Suggestions',
    attributes: [
      { name: 'user_id', type: 'string', size: 36, required: true },
      { name: 'skill_name', type: 'string', size: 255, required: true },
      { name: 'skill_description', type: 'string', size: 10000, required: false, default: '' },
      { name: 'category_name', type: 'string', size: 100, required: false },
      { name: 'suggested_by', type: 'string', size: 255, required: true },
      { name: 'times_requested', type: 'integer', required: false, default: 1 },
      // Anti-spam (BLF-skill.3): distinct user IDs who requested this suggestion,
      // so times_requested cannot be inflated by one account re-requesting.
      { name: 'requester_ids', type: 'string', size: 36, required: false, array: true },
      { name: 'status', type: 'string', size: 20, required: false, default: 'pending' },
    ],
    indexes: [
      { key: 'status_times_requested', type: DatabasesIndexType.Key, attributes: ['status', 'times_requested'], orders: [OrderBy.Asc, OrderBy.Desc] },
    ],
  },
  {
    id: 'rush_upgrade_requests',
    name: 'Rush Upgrade Requests',
    attributes: [
      { name: 'contract_id', type: 'string', size: 36, required: true },
      { name: 'requested_by', type: 'string', size: 36, required: true },
      { name: 'proposed_percentage', type: 'double', required: true },
      { name: 'counter_percentage', type: 'double', required: false },
      { name: 'status', type: 'string', size: 20, required: false, default: 'pending' },
      { name: 'responded_by', type: 'string', size: 36, required: false },
      { name: 'responded_at', type: 'string', size: 50, required: false },
    ],
    indexes: [
      { key: 'contract_id_createdAt', type: DatabasesIndexType.Key, attributes: ['contract_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'contract_id_status_createdAt', type: DatabasesIndexType.Key, attributes: ['contract_id', 'status', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Asc, OrderBy.Desc] },
    ],
  },
  {
    id: 'audit_log_entries',
    name: 'Audit Log Entries',
    attributes: [
      { name: 'user_id', type: 'string', size: 36, required: false },
      { name: 'actor_id', type: 'string', size: 36, required: false },
      { name: 'action', type: 'string', size: 100, required: true },
      { name: 'resource_type', type: 'string', size: 50, required: true },
      { name: 'resource_id', type: 'string', size: 36, required: false },
      { name: 'payload', type: 'string', size: 100000, required: false, default: '{}' },
      { name: 'ip_address', type: 'string', size: 45, required: false },
      { name: 'user_agent', type: 'string', size: 2000, required: false },
      { name: 'status', type: 'string', size: 20, required: false, default: 'success' },
      { name: 'error_message', type: 'string', size: 5000, required: false },
    ],
    indexes: [
      { key: 'user_id_createdAt', type: DatabasesIndexType.Key, attributes: ['user_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'action_createdAt', type: DatabasesIndexType.Key, attributes: ['action', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'resource_type_resource_id_createdAt', type: DatabasesIndexType.Key, attributes: ['resource_type', 'resource_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Asc, OrderBy.Desc] },
      { key: 'status_createdAt', type: DatabasesIndexType.Key, attributes: ['status', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
    ],
  },
  {
    id: 'blockchain_transactions',
    name: 'Blockchain Transactions',
    attributes: [
      { name: 'type', type: 'string', size: 50, required: true },
      { name: 'from_address', type: 'string', size: 42, required: true },
      { name: 'to_address', type: 'string', size: 42, required: true },
      { name: 'amount', type: 'string', size: 50, required: true },
      { name: 'data', type: 'string', size: 100000, required: false, default: '{}' },
      { name: 'timestamp', type: 'integer', required: true },
      { name: 'status', type: 'string', size: 20, required: false, default: 'pending' },
      { name: 'hash', type: 'string', size: 66, required: true },
      { name: 'block_number', type: 'integer', required: false, default: 0 },
      { name: 'gas_used', type: 'string', size: 50, required: false, default: '0' },
      { name: 'confirm_at', type: 'integer', required: false },
    ],
    indexes: [
      { key: 'unique_hash', type: DatabasesIndexType.Unique, attributes: ['hash'] },
      { key: 'type_timestamp', type: DatabasesIndexType.Key, attributes: ['type', 'timestamp'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'status_timestamp', type: DatabasesIndexType.Key, attributes: ['status', 'timestamp'], orders: [OrderBy.Asc, OrderBy.Desc] },
    ],
  },
  {
    id: 'blockchain_escrows',
    name: 'Blockchain Escrows',
    attributes: [
      { name: 'contract_id', type: 'string', size: 255, required: true },
      { name: 'address', type: 'string', size: 42, required: false, default: '' },
      { name: 'escrow_address', type: 'string', size: 42, required: false, default: '' },
      { name: 'employer_address', type: 'string', size: 42, required: true },
      { name: 'freelancer_address', type: 'string', size: 42, required: true },
      { name: 'total_amount', type: 'string', size: 50, required: true },
      { name: 'balance', type: 'string', size: 50, required: false, default: '0' },
      { name: 'deployed_at', type: 'integer', required: true },
      { name: 'deployment_tx_hash', type: 'string', size: 66, required: true },
    ],
    indexes: [
      { key: 'address', type: DatabasesIndexType.Key, attributes: ['address'] },
      { key: 'escrow_address', type: DatabasesIndexType.Key, attributes: ['escrow_address'] },
    ],
  },
  {
    id: 'blockchain_escrow_milestones',
    name: 'Blockchain Escrow Milestones',
    attributes: [
      { name: 'escrow_address', type: 'string', size: 42, required: true },
      { name: 'milestone_id', type: 'string', size: 36, required: true },
      { name: 'amount', type: 'string', size: 50, required: true },
      { name: 'status', type: 'string', size: 20, required: true },
    ],
    indexes: [
      { key: 'escrow_address', type: DatabasesIndexType.Key, attributes: ['escrow_address'] },
      { key: 'milestone_id', type: DatabasesIndexType.Key, attributes: ['milestone_id'] },
    ],
  },
  {
    id: 'transactions',
    name: 'Transactions',
    attributes: [
      { name: 'contract_id', type: 'string', size: 36, required: false },
      { name: 'milestone_id', type: 'string', size: 36, required: false },
      { name: 'from_user_id', type: 'string', size: 36, required: false },
      { name: 'to_user_id', type: 'string', size: 36, required: false },
      { name: 'amount', type: 'double', required: true },
      { name: 'type', type: 'string', size: 30, required: true },
      { name: 'status', type: 'string', size: 20, required: false, default: 'pending' },
      { name: 'transaction_hash', type: 'string', size: 66, required: false },
      { name: 'metadata', type: 'string', size: 100000, required: false },
    ],
    indexes: [
      { key: 'contract_id_createdAt', type: DatabasesIndexType.Key, attributes: ['contract_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'from_user_id_createdAt', type: DatabasesIndexType.Key, attributes: ['from_user_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'to_user_id_createdAt', type: DatabasesIndexType.Key, attributes: ['to_user_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
    ],
  },
  {
    id: 'emails',
    name: 'Email Inbox',
    attributes: [
      { name: 'message_id', type: 'string', size: 255, required: true },
      { name: 'user_id', type: 'string', size: 36, required: true },
      { name: 'from_address', type: 'string', size: 320, required: true },
      { name: 'to_address', type: 'string', size: 320, required: true },
      { name: 'subject', type: 'string', size: 998, required: true },
      { name: 'text_body', type: 'string', size: 100000, required: false },
      { name: 'html_body', type: 'string', size: 500000, required: false },
      { name: 'attachments', type: 'string', size: 10000, required: false, default: '[]' },
      { name: 'is_read', type: 'boolean', required: false, default: false },
      { name: 'is_starred', type: 'boolean', required: false, default: false },
      { name: 'folder', type: 'string', size: 20, required: true },
      { name: 'in_reply_to', type: 'string', size: 255, required: false },
      { name: 'references', type: 'string', size: 2000, required: false },
      { name: 'received_at', type: 'string', size: 30, required: true },
    ],
    indexes: [
      { key: 'unique_message_id', type: DatabasesIndexType.Unique, attributes: ['message_id'] },
      { key: 'user_id_folder_received_at', type: DatabasesIndexType.Key, attributes: ['user_id', 'folder', 'received_at'], orders: [OrderBy.Asc, OrderBy.Asc, OrderBy.Desc] },
      { key: 'user_id_is_read', type: DatabasesIndexType.Key, attributes: ['user_id', 'is_read'] },
    ],
  },
  {
    id: 'email_delivery_failures',
    name: 'Email Delivery Failures',
    description: 'Inbound emails the API permanently rejected (unknown user / invalid recipient), recorded so ops can see undelivered mail.',
    attributes: [
      { name: 'message_id', type: 'string', size: 255, required: true },
      { name: 'from_address', type: 'string', size: 320, required: true },
      { name: 'to_address', type: 'string', size: 320, required: true },
      { name: 'subject', type: 'string', size: 998, required: true },
      { name: 'failure_code', type: 'string', size: 50, required: true },
      { name: 'failure_message', type: 'string', size: 2000, required: false },
      { name: 'received_at', type: 'string', size: 30, required: true },
    ],
    indexes: [
      { key: 'createdAt', type: DatabasesIndexType.Key, attributes: ['$createdAt'], orders: [OrderBy.Desc] },
    ],
  },
  {
    id: 'blockchain_agreements',
    name: 'Blockchain Agreements',
    attributes: [
      { name: 'contract_id_hash', type: 'string', size: 66, required: true },
      { name: 'terms_hash', type: 'string', size: 66, required: true },
      { name: 'employer_wallet', type: 'string', size: 42, required: true },
      { name: 'freelancer_wallet', type: 'string', size: 42, required: true },
      { name: 'total_amount', type: 'double', required: true },
      { name: 'milestone_count', type: 'integer', required: true },
      { name: 'status', type: 'string', size: 20, required: true },
      { name: 'employer_signed_at', type: 'integer', required: false },
      { name: 'freelancer_signed_at', type: 'integer', required: false },
      { name: 'created_at_ts', type: 'integer', required: true },
      { name: 'transaction_hash', type: 'string', size: 66, required: true },
      { name: 'block_number', type: 'integer', required: true },
    ],
    indexes: [
      { key: 'contract_id_hash', type: DatabasesIndexType.Key, attributes: ['contract_id_hash'] },
      { key: 'employer_wallet', type: DatabasesIndexType.Key, attributes: ['employer_wallet'] },
      { key: 'freelancer_wallet', type: DatabasesIndexType.Key, attributes: ['freelancer_wallet'] },
    ],
  },
  {
    id: 'blockchain_milestones',
    name: 'Blockchain Milestones',
    attributes: [
      { name: 'milestone_id_hash', type: 'string', size: 66, required: true },
      { name: 'contract_id_hash', type: 'string', size: 66, required: true },
      { name: 'work_hash', type: 'string', size: 66, required: true },
      { name: 'freelancer_wallet', type: 'string', size: 42, required: true },
      { name: 'employer_wallet', type: 'string', size: 42, required: true },
      { name: 'amount', type: 'double', required: true },
      { name: 'status', type: 'string', size: 20, required: true },
      { name: 'submitted_at', type: 'integer', required: true },
      { name: 'completed_at', type: 'integer', required: false },
      { name: 'title', type: 'string', size: 255, required: true },
      { name: 'transaction_hash', type: 'string', size: 66, required: true },
      { name: 'block_number', type: 'integer', required: true },
    ],
    indexes: [
      { key: 'milestone_id_hash', type: DatabasesIndexType.Key, attributes: ['milestone_id_hash'] },
      { key: 'contract_id_hash', type: DatabasesIndexType.Key, attributes: ['contract_id_hash'] },
      { key: 'freelancer_wallet', type: DatabasesIndexType.Key, attributes: ['freelancer_wallet'] },
    ],
  },
  {
    id: 'blockchain_dispute_records',
    name: 'Blockchain Dispute Records',
    attributes: [
      { name: 'dispute_id_hash', type: 'string', size: 66, required: true },
      { name: 'contract_id_hash', type: 'string', size: 66, required: true },
      { name: 'milestone_id_hash', type: 'string', size: 66, required: true },
      { name: 'evidence_hash', type: 'string', size: 66, required: false },
      { name: 'initiator_wallet', type: 'string', size: 42, required: true },
      { name: 'freelancer_wallet', type: 'string', size: 42, required: true },
      { name: 'employer_wallet', type: 'string', size: 42, required: true },
      { name: 'arbiter_wallet', type: 'string', size: 42, required: false },
      { name: 'amount', type: 'double', required: true },
      { name: 'outcome', type: 'string', size: 50, required: true },
      { name: 'reasoning', type: 'string', size: 5000, required: false },
      { name: 'created_at_ts', type: 'integer', required: true },
      { name: 'resolved_at', type: 'integer', required: false },
      { name: 'transaction_hash', type: 'string', size: 66, required: true },
      { name: 'block_number', type: 'integer', required: true },
    ],
    indexes: [
      { key: 'dispute_id_hash', type: DatabasesIndexType.Key, attributes: ['dispute_id_hash'] },
      { key: 'contract_id_hash', type: DatabasesIndexType.Key, attributes: ['contract_id_hash'] },
      { key: 'freelancer_wallet', type: DatabasesIndexType.Key, attributes: ['freelancer_wallet'] },
    ],
  },
  {
    id: 'blockchain_ratings',
    name: 'Blockchain Ratings',
    attributes: [
      { name: 'contract_id', type: 'string', size: 36, required: true },
      { name: 'rater_id', type: 'string', size: 36, required: true },
      { name: 'ratee_id', type: 'string', size: 36, required: true },
      { name: 'rating', type: 'double', required: true },
      { name: 'comment', type: 'string', size: 5000, required: false },
      { name: 'timestamp', type: 'integer', required: true },
      { name: 'transaction_hash', type: 'string', size: 66, required: true },
    ],
    indexes: [
      { key: 'ratee_id', type: DatabasesIndexType.Key, attributes: ['ratee_id'] },
      { key: 'rater_id', type: DatabasesIndexType.Key, attributes: ['rater_id'] },
      { key: 'contract_id', type: DatabasesIndexType.Key, attributes: ['contract_id'] },
    ],
  },
  {
    id: 'app_ratings',
    name: 'App Ratings',
    // Feedback about FreelanceXchain itself, not about a counterparty. The
    // `reviews` collection above is the separate freelancer<->employer rating.
    // Attributed to the submitter, so it must NOT inherit the world-readable
    // default — see RESTRICTED_COLLECTIONS in createCollection().
    attributes: [
      { name: 'user_id', type: 'string', size: 36, required: true },
      { name: 'user_role', type: 'string', size: 20, required: true },
      { name: 'rating', type: 'integer', required: true },
      { name: 'comment', type: 'string', size: 2000, required: false },
      // Which moment prompted it; see APP_RATING_SOURCES in src/models/app-rating.ts.
      { name: 'source', type: 'string', size: 40, required: true },
      // The contract/milestone/proposal/project the prompt came from, when there
      // is one. Absent for a rating opened from the account menu.
      { name: 'context_id', type: 'string', size: 36, required: false },
      { name: 'app_version', type: 'string', size: 20, required: false },
    ],
    indexes: [
      { key: 'user_id_createdAt', type: DatabasesIndexType.Key, attributes: ['user_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'source_createdAt', type: DatabasesIndexType.Key, attributes: ['source', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'rating', type: DatabasesIndexType.Key, attributes: ['rating'] },
      { key: 'source_context_id', type: DatabasesIndexType.Key, attributes: ['source', 'context_id'] },
    ],
  },
  {
    id: 'support_tickets',
    name: 'Support Tickets',
    // A user asking the platform for help, and the admin's reply. Distinct from
    // `disputes` (two users, real money, arbitration) and from `app_ratings`
    // above (one-way feedback nobody answers).
    // Carries a named user's problem report, so it must NOT inherit the
    // world-readable default — see RESTRICTED_COLLECTIONS in createCollection().
    attributes: [
      { name: 'user_id', type: 'string', size: 36, required: true },
      // Recorded so the admin queue can show who filed it; never used to gate
      // behaviour — freelancers and employers get the identical flow.
      { name: 'user_role', type: 'string', size: 20, required: true },
      { name: 'subject', type: 'string', size: 200, required: true },
      { name: 'description', type: 'string', size: 4000, required: true },
      // See SUPPORT_TICKET_CATEGORIES in src/models/support-ticket.ts.
      { name: 'category', type: 'string', size: 40, required: true },
      // open | in_progress | resolved | closed
      { name: 'status', type: 'string', size: 20, required: false, default: 'open' },
      // The admin's answer, which the submitter reads. Required by the service
      // when resolving; absent on a ticket that was merely closed.
      { name: 'resolution_note', type: 'string', size: 2000, required: false },
      { name: 'resolved_by', type: 'string', size: 36, required: false },
      { name: 'resolved_at', type: 'string', size: 40, required: false },
    ],
    indexes: [
      { key: 'user_id_createdAt', type: DatabasesIndexType.Key, attributes: ['user_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'status_createdAt', type: DatabasesIndexType.Key, attributes: ['status', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'category_createdAt', type: DatabasesIndexType.Key, attributes: ['category', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
    ],
  },
  {
    id: 'subscriptions',
    name: 'Subscriptions',
    // Holds Stripe customer/subscription ids, so it must NOT inherit the
    // world-readable default applied to every other collection below. See
    // RESTRICTED_COLLECTIONS in createCollection().
    attributes: [
      { name: 'user_id', type: 'string', size: 36, required: true },
      { name: 'stripe_customer_id', type: 'string', size: 64, required: false },
      { name: 'stripe_subscription_id', type: 'string', size: 64, required: false },
      { name: 'stripe_price_id', type: 'string', size: 64, required: false },
      // Entitlement tier, denormalized from the price id: 'free' | 'pro'.
      { name: 'plan', type: 'string', size: 20, required: false, default: 'free' },
      // Mirrors Stripe's subscription.status, plus 'none' for a user who has
      // never subscribed.
      { name: 'status', type: 'string', size: 24, required: false, default: 'none' },
      { name: 'current_period_end', type: 'string', size: 30, required: false },
      { name: 'cancel_at_period_end', type: 'boolean', required: false, default: false },
      // One free trial per account; set when checkout starts with a trial.
      { name: 'trial_used', type: 'boolean', required: false, default: false },
      // Out-of-order guard: Stripe event.created (unix seconds) of the newest
      // event already applied. Older events are skipped, not applied.
      { name: 'last_event_created', type: 'integer', required: false, default: 0 },
      { name: 'last_event_id', type: 'string', size: 64, required: false },
      { name: 'last_event_type', type: 'string', size: 64, required: false },
    ],
    indexes: [
      { key: 'user_id', type: DatabasesIndexType.Unique, attributes: ['user_id'] },
      { key: 'stripe_customer_id', type: DatabasesIndexType.Key, attributes: ['stripe_customer_id'] },
      { key: 'stripe_subscription_id', type: DatabasesIndexType.Key, attributes: ['stripe_subscription_id'] },
      { key: 'status_currentPeriodEnd', type: DatabasesIndexType.Key, attributes: ['status', 'current_period_end'], orders: [OrderBy.Asc, OrderBy.Asc] },
    ],
  },
];

// ─── Index Definitions ───────────────────────────────────────────────────────
// Database-level constraints that cannot be expressed as plain attributes.
// The unique (contract_id, reviewer_id) index backs BLF-9.1: the reputation
// service serializes the duplicate-review check-then-insert with an app-level
// lock, but that lock is per-process — this index is the global backstop that
// makes a double-submit fail even across server instances.
// NOTE: on an existing `reviews` collection that already contains duplicate
// (contract_id, reviewer_id) rows, creation will fail — de-duplicate first.
const INDEXES = [
  {
    collectionId: 'reviews',
    key: 'unique_contract_reviewer',
    type: 'key',
    attributes: ['contract_id', 'reviewer_id'],
    indexes: ['unique'],
  },
  {
    // Anti-spam backstop for custom skills (BLF-skill.1): even if two requests
    // race past the app-level duplicate check, the DB rejects a second
    // (user_id, name) row. NOTE: de-duplicate existing user_custom_skills rows
    // before running on a populated collection.
    collectionId: 'user_custom_skills',
    key: 'unique_user_skill',
    type: 'key',
    attributes: ['user_id', 'name'],
    indexes: ['unique'],
  },
  {
    // Anti-spam backstop for the suggestion queue (BLF-skill.2): two concurrent
    // suggestForGlobal requests with the same skill name can both pass the
    // app-level lookup; this index makes the second create fail at the DB.
    // NOTE: on an existing `skill_suggestions` collection that already contains
    // duplicate skill_name rows, creation will fail — de-duplicate first.
    collectionId: 'skill_suggestions',
    key: 'unique_suggestion_name',
    type: 'key',
    attributes: ['skill_name'],
    indexes: ['unique'],
  },
  {
    // Race backstop for favorites: addFavorite does a check-then-insert, so two
    // concurrent identical requests can both pass the check. This unique
    // (user_id, target_type, target_id) index makes the second insert fail at
    // the DB even across server instances (same pattern as reviews/skills).
    // NOTE: on an existing `favorites` collection that already contains
    // duplicate (user_id, target_type, target_id) rows, creation will fail —
    // de-duplicate first.
    collectionId: 'favorites',
    key: 'unique_user_target',
    type: 'key',
    attributes: ['user_id', 'target_type', 'target_id'],
    indexes: ['unique'],
  },
];

// ─── Setup Functions ────────────────────────────────────────────────────────

async function ensureDatabase(): Promise<void> {
  try {
    await db.get(DATABASE_ID);
    console.log(`✓ Database "${DATABASE_ID}" already exists`);
  } catch {
    console.log(`Creating database "${DATABASE_ID}"...`);
    await db.create(DATABASE_ID, DATABASE_ID);
    console.log(`✓ Database "${DATABASE_ID}" created`);
  }
}

/**
 * Collections that must never be readable by `Role.any()`.
 *
 * The default permissions below are world-readable, which is wrong for billing
 * records (Stripe customer and subscription ids) and equally wrong for app
 * feedback, which carries a named user's opinion of the platform, and for
 * support tickets, which carry a named user's problem report. These
 * collections are reached only through the server's admin API key, so they get
 * an empty permission set — no client-SDK role can touch them at all.
 */
const RESTRICTED_COLLECTIONS = new Set(['subscriptions', 'app_ratings', 'support_tickets']);

async function createCollection(colDef: typeof COLLECTIONS[0]): Promise<void> {
  try {
    await db.getCollection(DATABASE_ID, colDef.id);
    console.log(`  ✓ Collection "${colDef.name}" already exists`);
  } catch {
    console.log(`  Creating collection "${colDef.name}"...`);
    const permissions = RESTRICTED_COLLECTIONS.has(colDef.id)
      ? []
      : [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ];
    await db.createCollection(DATABASE_ID, colDef.id, colDef.name, permissions);
    console.log(
      `  ✓ Collection "${colDef.name}" created${RESTRICTED_COLLECTIONS.has(colDef.id) ? ' (server-only)' : ''}`
    );
  }
}

async function createIndexes(colDef: typeof COLLECTIONS[0]): Promise<void> {
  for (const index of colDef.indexes ?? []) {
    try {
      await db.createIndex(
        DATABASE_ID,
        colDef.id,
        index.key,
        index.type,
        index.attributes,
        index.orders
      );
      console.log(`    ✓ Index "${index.key}" (${index.attributes.join(', ')})`);
    } catch (e: any) {
      if (e?.code === 409) {
        console.log(`    ⊘ Index "${index.key}" already exists`);
      } else {
        console.error(`    ✗ Failed to create index "${index.key}":`, e?.message || e);
      }
    }
  }
}

async function createAttributes(colDef: typeof COLLECTIONS[0]): Promise<void> {
  for (const attr of colDef.attributes) {
    try {
      if (attr.type === 'string') {
        await db.createStringAttribute(
          DATABASE_ID,
          colDef.id,
          attr.name,
          attr.size || 255,
          attr.required ?? false,
          attr.default as string | undefined,
          attr.array ?? false
        );
      } else if (attr.type === 'integer') {
        await db.createIntegerAttribute(
          DATABASE_ID,
          colDef.id,
          attr.name,
          attr.required ?? false,
          undefined,
          undefined,
          attr.default as number | undefined,
          attr.array ?? false
        );
      } else if (attr.type === 'double') {
        await db.createFloatAttribute(
          DATABASE_ID,
          colDef.id,
          attr.name,
          attr.required ?? false,
          undefined,
          undefined,
          attr.default as number | undefined,
          attr.array ?? false
        );
      } else if (attr.type === 'boolean') {
        await db.createBooleanAttribute(
          DATABASE_ID,
          colDef.id,
          attr.name,
          attr.required ?? false,
          attr.default as boolean | undefined,
          attr.array ?? false
        );
      }
      console.log(`    ✓ Attribute "${attr.name}" (${attr.type})`);
    } catch (e: any) {
      if (e?.code === 409) {
        console.log(`    ⊘ Attribute "${attr.name}" already exists`);
      } else {
        console.error(`    ✗ Failed to create attribute "${attr.name}":`, e?.message || e);
      }
    }
  }
}

// ─── Storage Bucket Definitions ─────────────────────────────────────────────

const DOCUMENT_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xlsx', 'pptx', 'txt', 'md', 'csv',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip',
];

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

const BUCKETS_TO_SETUP = [
  { bucketId: 'proposal-attachments', bucketName: 'Proposal Attachments', permissions: [Permission.read(Role.any())], fileSecurity: true, extensions: DOCUMENT_EXTENSIONS },
  { bucketId: 'project-attachments', bucketName: 'Project Attachments', permissions: [Permission.read(Role.any())], fileSecurity: false, extensions: DOCUMENT_EXTENSIONS },
  { bucketId: 'dispute-evidence', bucketName: 'Dispute Evidence', permissions: [], fileSecurity: true, extensions: DOCUMENT_EXTENSIONS },
  { bucketId: 'portfolio-images', bucketName: 'Portfolio Images', permissions: [Permission.read(Role.any())], fileSecurity: false, extensions: IMAGE_EXTENSIONS },
  { bucketId: 'profile-images', bucketName: 'Profile Images', permissions: [Permission.read(Role.any())], fileSecurity: false, extensions: IMAGE_EXTENSIONS },
  { bucketId: 'milestone-deliverables', bucketName: 'Milestone Deliverables', permissions: [], fileSecurity: true, extensions: DOCUMENT_EXTENSIONS },
  { bucketId: 'contract-documents', bucketName: 'Contract Documents', permissions: [Permission.read(Role.any())], fileSecurity: true, extensions: DOCUMENT_EXTENSIONS },
];

async function setupStorage(): Promise<void> {
  const storage = new Storage(client);
  const existing = await storage.listBuckets();
  const existingIds = new Set(existing.buckets.map((b) => b.$id));

  for (const b of BUCKETS_TO_SETUP) {
    if (existingIds.has(b.bucketId)) {
      console.log(`    ✓ Bucket '${b.bucketId}' already exists.`);
    } else {
      console.log(`    Creating bucket '${b.bucketId}' (${b.bucketName})...`);
      try {
        await storage.createBucket(b.bucketId, b.bucketName, b.permissions, b.fileSecurity, true, undefined, b.extensions);
        console.log(`    ✓ Bucket '${b.bucketId}' created successfully.`);
      } catch (err: any) {
        console.error(`    ✗ Error creating bucket '${b.bucketId}':`, err?.message || err);
      }
    }
  }
}

// ─── Demo Seed Data ──────────────────────────────────────────────────────────

const futureDate = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

const skillCategories = [
  { seedId: "cat-1", name: "Blockchain", description: "Blockchain development skills", is_active: true },
  { seedId: "cat-2", name: "Frontend", description: "Frontend development skills", is_active: true },
  { seedId: "cat-3", name: "Backend", description: "Backend development skills", is_active: true },
  { seedId: "cat-4", name: "Design", description: "Design and UI/UX skills", is_active: true },
];

const skills = [
  { seedId: "skill-1", category_id: "cat-1", name: "Solidity", description: "Smart contract development", is_active: true },
  { seedId: "skill-2", category_id: "cat-1", name: "Rust", description: "Systems programming", is_active: true },
  { seedId: "skill-3", category_id: "cat-1", name: "Hardhat", description: "Ethereum development environment", is_active: true },
  { seedId: "skill-4", category_id: "cat-2", name: "React", description: "Frontend library", is_active: true },
  { seedId: "skill-5", category_id: "cat-2", name: "TypeScript", description: "Type-safe JavaScript", is_active: true },
  { seedId: "skill-6", category_id: "cat-2", name: "Tailwind CSS", description: "Utility-first CSS framework", is_active: true },
  { seedId: "skill-7", category_id: "cat-3", name: "Node.js", description: "JavaScript runtime", is_active: true },
  { seedId: "skill-8", category_id: "cat-3", name: "Python", description: "Programming language", is_active: true },
  { seedId: "skill-9", category_id: "cat-4", name: "Figma", description: "UI/UX design tool", is_active: true },
  { seedId: "skill-10", category_id: "cat-4", name: "UI/UX Design", description: "User interface design", is_active: true },
];

const employerUsers = [
  {
    seedId: "employer-1",
    email: "sarah@techcorp.com",
    password_hash: "",
    name: "Sarah Chen",
    role: "employer",
    wallet_address: "0x742d35Cc6634C0532925a3b844Bc9e7595f8bE28",
    is_suspended: false,
    suspension_reason: null,
    mfa_enabled: false,
  },
  {
    seedId: "employer-2",
    email: "mike@blockchain.io",
    password_hash: "",
    name: "Mike Johnson",
    role: "employer",
    wallet_address: "0x8Ba1f109551bD432803012645Hac13652c22BF79",
    is_suspended: false,
    suspension_reason: null,
    mfa_enabled: false,
  },
  {
    seedId: "employer-3",
    email: "alex@defi.finance",
    password_hash: "",
    name: "Alex Rivera",
    role: "employer",
    wallet_address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    is_suspended: false,
    suspension_reason: null,
    mfa_enabled: false,
  },
];

const freelancerUsers = [
  {
    seedId: "freelancer-1",
    email: "ana@freelance.com",
    password_hash: "",
    name: "Ana Reyes",
    role: "freelancer",
    wallet_address: "0x2546BcD3a805442D0bf58d50f1b29A7e3cf175b9",
    is_suspended: false,
    suspension_reason: null,
    mfa_enabled: false,
  },
  {
    seedId: "freelancer-2",
    email: "juan@web3.dev",
    password_hash: "",
    name: "Juan dela Cruz",
    role: "freelancer",
    wallet_address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
    is_suspended: false,
    suspension_reason: null,
    mfa_enabled: false,
  },
  {
    seedId: "freelancer-3",
    email: "maria@fullstack.io",
    password_hash: "",
    name: "Maria Santos",
    role: "freelancer",
    wallet_address: "0x617F2E2fD72FD9D5503197092aC168c91465E7f2",
    is_suspended: false,
    suspension_reason: null,
    mfa_enabled: false,
  },
];

const freelancerProfiles = [
  {
    seedId: "profile-1",
    user_id: "freelancer-1",
    name: "Ana Reyes",
    nationality: "Filipino",
    bio: "Smart contract auditor and Solidity developer. Previously audited DeFi protocols worth $50M+ TVL.",
    hourly_rate: 50,
    skills: JSON.stringify([
      { name: "Solidity", years_of_experience: 5 },
      { name: "Rust", years_of_experience: 3 },
      { name: "Smart Contract Auditing", years_of_experience: 4 },
      { name: "Hardhat", years_of_experience: 5 },
    ]),
    experience: JSON.stringify([
      {
        id: "exp-1",
        title: "Senior Smart Contract Developer",
        company: "DeFi Protocol Inc.",
        description: "Led security audits for multiple DeFi protocols",
        start_date: "2022-01-01",
        end_date: null,
      },
    ]),
    availability: "available",
  },
  {
    seedId: "profile-2",
    user_id: "freelancer-2",
    name: "Juan dela Cruz",
    nationality: "Filipino",
    bio: "UI/UX designer specializing in Web3 interfaces. Experienced in Figma, Adobe XD, and frontend frameworks.",
    hourly_rate: 28,
    skills: JSON.stringify([
      { name: "Figma", years_of_experience: 4 },
      { name: "Adobe XD", years_of_experience: 3 },
      { name: "CSS", years_of_experience: 5 },
      { name: "Tailwind", years_of_experience: 4 },
    ]),
    experience: JSON.stringify([
      {
        id: "exp-2",
        title: "UI/UX Designer",
        company: "CryptoDesign Studio",
        description: "Designed intuitive interfaces for Web3 applications",
        start_date: "2021-06-01",
        end_date: null,
      },
    ]),
    availability: "available",
  },
  {
    seedId: "profile-3",
    user_id: "freelancer-3",
    name: "Maria Santos",
    nationality: "Filipino",
    bio: "Full-stack web developer with 5 years of experience in React, Node.js, and blockchain development. Passionate about building decentralized applications.",
    hourly_rate: 35,
    skills: JSON.stringify([
      { name: "React", years_of_experience: 5 },
      { name: "Node.js", years_of_experience: 5 },
      { name: "Solidity", years_of_experience: 3 },
      { name: "TypeScript", years_of_experience: 4 },
      { name: "PostgreSQL", years_of_experience: 4 },
    ]),
    experience: JSON.stringify([
      {
        id: "exp-3",
        title: "Senior Web Developer",
        company: "TechCorp",
        description: "Full-stack development for enterprise applications",
        start_date: "2023-01-01",
        end_date: null,
      },
    ]),
    availability: "available",
  },
];

const employerProfiles = [
  {
    seedId: "employer-profile-1",
    user_id: "employer-1",
    name: "Sarah Chen",
    nationality: "Singaporean",
    company_name: "TechCorp",
    description: "Leading technology company specializing in blockchain solutions",
    industry: "Technology",
  },
  {
    seedId: "employer-profile-2",
    user_id: "employer-2",
    name: "Mike Johnson",
    nationality: "American",
    company_name: "Blockchain.io",
    description: "Innovative blockchain startup focused on DeFi",
    industry: "Finance",
  },
  {
    seedId: "employer-profile-3",
    user_id: "employer-3",
    name: "Alex Rivera",
    nationality: "Filipino",
    company_name: "DeFi Finance",
    description: "Decentralized finance platform for the future",
    industry: "DeFi",
  },
];

const projects = [
  {
    seedId: "project-1",
    employer_id: "employer-1",
    title: "Build a Decentralized Exchange (DEX) Frontend",
    description: "Looking for an experienced React developer to build a modern, responsive frontend for our DEX. The interface should support token swapping, liquidity pool visualization, and portfolio tracking. Must integrate with Web3 wallets like MetaMask and WalletConnect.",
    required_skills: JSON.stringify([
      { skill_id: "skill-4", skill_name: "React", category_id: "cat-2", years_of_experience: 3 },
      { skill_id: "skill-5", skill_name: "TypeScript", category_id: "cat-2", years_of_experience: 2 },
    ]),
    budget: 8000,
    deadline: futureDate(45),
    is_rush: false,
    rush_fee_percentage: 25,
    status: "open",
    milestones: JSON.stringify([
      { id: "m1", title: "UI Design & Components", description: "Create wireframes and reusable components", amount: 2000, due_date: futureDate(15), status: "pending" },
      { id: "m2", title: "Core Functionality", description: "Implement token swap and wallet integration", amount: 3000, due_date: futureDate(30), status: "pending" },
      { id: "m3", title: "Testing & Deployment", description: "QA testing and production deployment", amount: 3000, due_date: futureDate(45), status: "pending" },
    ]),
    freelancer_limit: 1,
    tags: JSON.stringify(["DeFi", "React", "Web3"]),
    attachments: JSON.stringify([]),
  },
  {
    seedId: "project-2",
    employer_id: "employer-2",
    title: "Smart Contract Audit for DeFi Protocol",
    description: "Need a thorough security audit of our Solidity smart contracts. The protocol handles over $10M in TVL and includes lending, borrowing, and liquidation mechanisms. Must provide detailed vulnerability report with remediation recommendations.",
    required_skills: JSON.stringify([
      { skill_id: "skill-1", skill_name: "Solidity", category_id: "cat-1", years_of_experience: 4 },
      { skill_id: "skill-3", skill_name: "Hardhat", category_id: "cat-1", years_of_experience: 3 },
    ]),
    budget: 15000,
    deadline: futureDate(30),
    is_rush: true,
    rush_fee_percentage: 50,
    status: "open",
    milestones: JSON.stringify([
      { id: "m4", title: "Initial Assessment", description: "Review contract architecture", amount: 5000, due_date: futureDate(10), status: "pending" },
      { id: "m5", title: "Deep Analysis", description: "Line-by-line security review", amount: 7000, due_date: futureDate(20), status: "pending" },
      { id: "m6", title: "Report & Remediation", description: "Final report with fixes", amount: 3000, due_date: futureDate(30), status: "pending" },
    ]),
    freelancer_limit: 1,
    tags: JSON.stringify(["Security", "Audit", "Solidity"]),
    attachments: JSON.stringify([]),
  },
  {
    seedId: "project-3",
    employer_id: "employer-3",
    title: "NFT Marketplace Development",
    description: "Build a full-stack NFT marketplace with minting, buying, selling, and auction features. Need both frontend and backend development with IPFS integration for metadata storage. Must support multiple blockchain networks.",
    required_skills: JSON.stringify([
      { skill_id: "skill-4", skill_name: "React", category_id: "cat-2", years_of_experience: 3 },
      { skill_id: "skill-7", skill_name: "Node.js", category_id: "cat-3", years_of_experience: 3 },
      { skill_id: "skill-1", skill_name: "Solidity", category_id: "cat-1", years_of_experience: 2 },
    ]),
    budget: 12000,
    deadline: futureDate(60),
    is_rush: false,
    rush_fee_percentage: 25,
    status: "open",
    milestones: JSON.stringify([
      { id: "m7", title: "Smart Contracts", description: "NFT and marketplace contracts", amount: 4000, due_date: futureDate(20), status: "pending" },
      { id: "m8", title: "Backend API", description: "REST API and IPFS integration", amount: 4000, due_date: futureDate(40), status: "pending" },
      { id: "m9", title: "Frontend UI", description: "Complete marketplace interface", amount: 4000, due_date: futureDate(60), status: "pending" },
    ]),
    freelancer_limit: 2,
    tags: JSON.stringify(["NFT", "Marketplace", "Full-Stack"]),
    attachments: JSON.stringify([]),
  },
  {
    seedId: "project-4",
    employer_id: "employer-1",
    title: "DAO Governance Dashboard",
    description: "Create a comprehensive governance dashboard for our DAO. Features include proposal creation, voting interface, treasury visualization, and member management. Must be intuitive for non-technical users.",
    required_skills: JSON.stringify([
      { skill_id: "skill-4", skill_name: "React", category_id: "cat-2", years_of_experience: 4 },
      { skill_id: "skill-9", skill_name: "Figma", category_id: "cat-4", years_of_experience: 3 },
      { skill_id: "skill-10", skill_name: "UI/UX Design", category_id: "cat-4", years_of_experience: 3 },
    ]),
    budget: 6500,
    deadline: futureDate(40),
    is_rush: false,
    rush_fee_percentage: 25,
    status: "open",
    milestones: JSON.stringify([
      { id: "m10", title: "Design System", description: "Create design tokens and components", amount: 2000, due_date: futureDate(15), status: "pending" },
      { id: "m11", title: "Proposal & Voting UI", description: "Core governance features", amount: 2500, due_date: futureDate(30), status: "pending" },
      { id: "m12", title: "Treasury & Members", description: "Dashboard analytics", amount: 2000, due_date: futureDate(40), status: "pending" },
    ]),
    freelancer_limit: 1,
    tags: JSON.stringify(["DAO", "Governance", "Dashboard"]),
    attachments: JSON.stringify([]),
  },
  {
    seedId: "project-5",
    employer_id: "employer-2",
    title: "Cross-Chain Bridge UI",
    description: "Design and develop a user-friendly interface for our cross-chain bridge. Should support multiple networks (Ethereum, Polygon, BSC) with real-time fee estimation and transaction tracking.",
    required_skills: JSON.stringify([
      { skill_id: "skill-4", skill_name: "React", category_id: "cat-2", years_of_experience: 3 },
      { skill_id: "skill-6", skill_name: "Tailwind CSS", category_id: "cat-2", years_of_experience: 2 },
      { skill_id: "skill-5", skill_name: "TypeScript", category_id: "cat-2", years_of_experience: 3 },
    ]),
    budget: 5500,
    deadline: futureDate(35),
    is_rush: false,
    rush_fee_percentage: 25,
    status: "open",
    milestones: JSON.stringify([
      { id: "m13", title: "UI Design", description: "Wireframes and visual design", amount: 1500, due_date: futureDate(10), status: "pending" },
      { id: "m14", title: "Bridge Interface", description: "Network selection and swap UI", amount: 2500, due_date: futureDate(25), status: "pending" },
      { id: "m15", title: "Transaction Tracking", description: "Status and history views", amount: 1500, due_date: futureDate(35), status: "pending" },
    ]),
    freelancer_limit: 1,
    tags: JSON.stringify(["Bridge", "Cross-Chain", "UI"]),
    attachments: JSON.stringify([]),
  },
  {
    seedId: "project-6",
    employer_id: "employer-3",
    title: "DeFi Yield Aggregator",
    description: "Develop a yield aggregator that automatically moves funds between different DeFi protocols to maximize returns. Need both smart contracts and a monitoring dashboard.",
    required_skills: JSON.stringify([
      { skill_id: "skill-1", skill_name: "Solidity", category_id: "cat-1", years_of_experience: 4 },
      { skill_id: "skill-7", skill_name: "Node.js", category_id: "cat-3", years_of_experience: 3 },
      { skill_id: "skill-4", skill_name: "React", category_id: "cat-2", years_of_experience: 2 },
    ]),
    budget: 18000,
    deadline: futureDate(75),
    is_rush: false,
    rush_fee_percentage: 25,
    status: "open",
    milestones: JSON.stringify([
      { id: "m16", title: "Strategy Design", description: "Yield optimization algorithms", amount: 4000, due_date: futureDate(15), status: "pending" },
      { id: "m17", title: "Smart Contracts", description: "Vault and strategy contracts", amount: 6000, due_date: futureDate(40), status: "pending" },
      { id: "m18", title: "Backend & API", description: "Monitoring and automation", amount: 4000, due_date: futureDate(60), status: "pending" },
      { id: "m19", title: "Dashboard", description: "Analytics and visualization", amount: 4000, due_date: futureDate(75), status: "pending" },
    ]),
    freelancer_limit: 2,
    tags: JSON.stringify(["DeFi", "Yield", "Aggregator"]),
    attachments: JSON.stringify([]),
  },
];

const kycVerifications = [
  {
    seedId: "kyc-freelancer-1",
    user_id: "freelancer-1",
    status: "approved",
    didit_session_id: "session_fl1_verified",
    didit_session_token: "tok_fl1_seeded",
    didit_session_url: "https://verification.didit.me/v/session_fl1_verified",
    didit_workflow_id: "wf_freelance_kyc",
    decision: "approved",
    document_type: "PASSPORT",
    document_number: "P1234567A",
    first_name: "Ana",
    last_name: "Reyes",
    nationality: "PH",
    document_verified: true,
    liveness_passed: true,
    face_matched: true,
    ip_address: "127.0.0.1",
    metadata: JSON.stringify({ verified_at: "2026-01-15T08:00:00.000Z", tier: "standard" }),
    admin_notes: "Auto-approved demo account for thesis panel evaluation",
  },
  {
    seedId: "kyc-freelancer-2",
    user_id: "freelancer-2",
    status: "approved",
    didit_session_id: "session_fl2_verified",
    didit_session_token: "tok_fl2_seeded",
    didit_session_url: "https://verification.didit.me/v/session_fl2_verified",
    didit_workflow_id: "wf_freelance_kyc",
    decision: "approved",
    document_type: "NATIONAL_ID",
    document_number: "N7654321B",
    first_name: "Juan",
    last_name: "dela Cruz",
    nationality: "PH",
    document_verified: true,
    liveness_passed: true,
    face_matched: true,
    ip_address: "127.0.0.1",
    metadata: JSON.stringify({ verified_at: "2026-01-16T09:30:00.000Z", tier: "standard" }),
    admin_notes: "Auto-approved demo account for thesis panel evaluation",
  },
  {
    seedId: "kyc-freelancer-3",
    user_id: "freelancer-3",
    status: "approved",
    didit_session_id: "session_fl3_verified",
    didit_session_token: "tok_fl3_seeded",
    didit_session_url: "https://verification.didit.me/v/session_fl3_verified",
    didit_workflow_id: "wf_freelance_kyc",
    decision: "approved",
    document_type: "DRIVERS_LICENSE",
    document_number: "D9876543C",
    first_name: "Maria",
    last_name: "Santos",
    nationality: "PH",
    document_verified: true,
    liveness_passed: true,
    face_matched: true,
    ip_address: "127.0.0.1",
    metadata: JSON.stringify({ verified_at: "2026-01-18T10:15:00.000Z", tier: "standard" }),
    admin_notes: "Auto-approved demo account for thesis panel evaluation",
  },
  {
    seedId: "kyc-employer-1",
    user_id: "employer-1",
    status: "approved",
    didit_session_id: "session_emp1_verified",
    didit_session_token: "tok_emp1_seeded",
    didit_session_url: "https://verification.didit.me/v/session_emp1_verified",
    didit_workflow_id: "wf_employer_kyc",
    decision: "approved",
    document_type: "PASSPORT",
    document_number: "E1122334D",
    first_name: "Sarah",
    last_name: "Chen",
    nationality: "SG",
    document_verified: true,
    liveness_passed: true,
    face_matched: true,
    ip_address: "127.0.0.1",
    metadata: JSON.stringify({ verified_at: "2026-01-10T11:00:00.000Z", tier: "business" }),
    admin_notes: "Auto-approved employer demo account",
  },
  {
    seedId: "kyc-employer-2",
    user_id: "employer-2",
    status: "approved",
    didit_session_id: "session_emp2_verified",
    didit_session_token: "tok_emp2_seeded",
    didit_session_url: "https://verification.didit.me/v/session_emp2_verified",
    didit_workflow_id: "wf_employer_kyc",
    decision: "approved",
    document_type: "PASSPORT",
    document_number: "E2233445E",
    first_name: "Mike",
    last_name: "Johnson",
    nationality: "US",
    document_verified: true,
    liveness_passed: true,
    face_matched: true,
    ip_address: "127.0.0.1",
    metadata: JSON.stringify({ verified_at: "2026-01-12T14:20:00.000Z", tier: "business" }),
    admin_notes: "Auto-approved employer demo account",
  },
  {
    seedId: "kyc-employer-3",
    user_id: "employer-3",
    status: "approved",
    didit_session_id: "session_emp3_verified",
    didit_session_token: "tok_emp3_seeded",
    didit_session_url: "https://verification.didit.me/v/session_emp3_verified",
    didit_workflow_id: "wf_employer_kyc",
    decision: "approved",
    document_type: "PASSPORT",
    document_number: "E3344556F",
    first_name: "Alex",
    last_name: "Rivera",
    nationality: "US",
    document_verified: true,
    liveness_passed: true,
    face_matched: true,
    ip_address: "127.0.0.1",
    metadata: JSON.stringify({ verified_at: "2026-01-14T16:45:00.000Z", tier: "business" }),
    admin_notes: "Auto-approved employer demo account",
  },
];

const portfolioItems = [
  {
    seedId: "port-1",
    freelancer_id: "freelancer-1",
    title: "Decentralized Exchange (DEX) & AMM Liquidity Frontend",
    description: "Responsive decentralized exchange interface supporting automated market maker token swapping, multi-token liquidity pools, slippage protection, and Web3 wallet connectors.",
    project_url: "https://github.com/freelancexchain/dex-frontend",
    images: JSON.stringify(["https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?w=800&auto=format&fit=crop&q=60"]),
    skills: JSON.stringify(["React", "TypeScript", "EVM", "Ethers.js", "Tailwind CSS"]),
    completed_at: "2026-01-20",
  },
  {
    seedId: "port-2",
    freelancer_id: "freelancer-1",
    title: "Decentralized Freelance & Milestone Escrow Protocol",
    description: "A non-custodial smart contract escrow protocol on Polygon with automated milestone release, dispute arbitration, and multi-token support.",
    project_url: "https://github.com/freelancexchain/escrow-dapp",
    images: JSON.stringify(["https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&auto=format&fit=crop&q=60"]),
    skills: JSON.stringify(["Solidity", "Smart Contracts", "Polygon", "React", "Next.js"]),
    completed_at: "2025-11-15",
  },
  {
    seedId: "port-3",
    freelancer_id: "freelancer-2",
    title: "Web3 Multi-Chain NFT Marketplace & Minter UI",
    description: "Cross-chain NFT minting and marketplace interface with lazy minting, royalty enforcement, and IPFS metadata storage integration.",
    project_url: "https://github.com/freelancexchain/nft-marketplace-ui",
    images: JSON.stringify(["https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format&fit=crop&q=60"]),
    skills: JSON.stringify(["Figma", "UI/UX Design", "Tailwind CSS", "React"]),
    completed_at: "2026-02-10",
  },
  {
    seedId: "port-4",
    freelancer_id: "freelancer-3",
    title: "Enterprise Web3 Analytics & Subgraph Dashboard",
    description: "Real-time analytics dashboard indexing on-chain events and subgraphs with high-throughput WebSockets.",
    project_url: "https://github.com/freelancexchain/web3-analytics",
    images: JSON.stringify(["https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=60"]),
    skills: JSON.stringify(["Node.js", "TypeScript", "React", "Python"]),
    completed_at: "2026-01-05",
  },
];

async function seedCollection(collectionId: string, documents: Record<string, unknown>[], name: string): Promise<void> {
  console.log(`    📦 Seeding ${name}...`);
  let created = 0;
  let skipped = 0;

  for (const doc of documents) {
    const { seedId, id: docId, created_at: _ca, updated_at: _ua, ...data } = doc;
    const documentId = (seedId || docId) as string;
    try {
      await db.createDocument(DATABASE_ID, collectionId, documentId, data);
      created++;
    } catch (e: any) {
      if (e?.code === 409) {
        skipped++;
      } else {
        console.error(`      ✗ Failed to create ${documentId}:`, e?.message || e);
      }
    }
  }

  console.log(`      ✓ Created: ${created}, Skipped: ${skipped}`);
}

async function seedAllData(): Promise<void> {
  await seedCollection("skill_categories", skillCategories, "Skill Categories");
  await seedCollection("skills", skills, "Skills");
  await seedCollection("users", [...employerUsers, ...freelancerUsers], "Users");
  await seedCollection("freelancer_profiles", freelancerProfiles, "Freelancer Profiles");
  await seedCollection("employer_profiles", employerProfiles, "Employer Profiles");
  await seedCollection("kyc_verifications", kycVerifications, "KYC Verifications");
  await seedCollection("portfolio_items", portfolioItems, "Portfolio Items");
  await seedCollection("projects", projects, "Projects");
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const WITH_SEED = process.argv.includes("--seed") || process.argv.includes("-s");

  console.log("=== FreelanceXchain — Appwrite Setup & Restore ===\n");
  console.log(`Endpoint:  ${ENDPOINT}`);
  console.log(`Project:   ${PROJECT_ID}`);
  console.log(`Database:  ${DATABASE_ID}`);
  console.log(`With Seed: ${WITH_SEED ? "YES (demo seed data will be populated)" : "NO (clean schema and buckets only)"}\n`);

  await ensureDatabase();

  console.log(`\n1. Creating/Verifying ${COLLECTIONS.length} collections...\n`);
  for (const colDef of COLLECTIONS) {
    console.log(`[${colDef.id}]`);
    await createCollection(colDef);
    await createAttributes(colDef);
    await createIndexes(colDef);
    console.log("");
  }

  console.log(`\n2. Creating/Verifying ${BUCKETS_TO_SETUP.length} storage buckets...\n`);
  await setupStorage();

  if (WITH_SEED) {
    console.log(`\n3. Seeding demo sample data...\n`);
    await seedAllData();
  } else {
    console.log(`\n3. Skipping seed data (pass --seed to populate initial demo data).`);
  }

  console.log(`\n=== Setup complete! (Mode: ${WITH_SEED ? "With Seed" : "Clean / Without Seed"}) ===`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});

