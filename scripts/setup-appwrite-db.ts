/**
 * Appwrite Database Setup Script
 * Creates all collections and attributes for FreelanceXchain
 * 
 * Run: npx tsx scripts/setup-appwrite-db.ts
 *
 * Schema-only (additive, no seeding, no wipes):
 *   npx tsx scripts/setup-appwrite-db.ts --schema-only [--only=col_a,col_b] [--buckets=bucket-a]
 * Creates missing collections, attributes, indexes and buckets only. Existing
 * documents, files, users and seeded records are left untouched.
 * 
 * Requirements:
 * - APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY must be set
 * - APPWRITE_DATABASE_ID (optional, defaults to 'freelancexchain')
 */

import dotenv from 'dotenv';
dotenv.config();

import { Client, Databases, Storage, ID, Permission, Role, Query, DatabasesIndexType, OrderBy, Users } from 'node-appwrite';

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
      { name: 'permissions', type: 'string', size: 2000, required: false, default: '[]' },
    ],
    indexes: [
      { key: 'unique_email', type: DatabasesIndexType.Unique, attributes: ['email'] },
      { key: 'wallet_address', type: DatabasesIndexType.Key, attributes: ['wallet_address'] },
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
      { key: 'is_active_name', type: DatabasesIndexType.Key, attributes: ['is_active', 'name'], orders: [OrderBy.Asc, OrderBy.Asc] },
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
      { key: 'createdAt', type: DatabasesIndexType.Key, attributes: ['$createdAt'], orders: [OrderBy.Desc] },
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
      { name: 'business_type', type: 'string', size: 30, required: false },
      { name: 'tin', type: 'string', size: 20, required: false },
      { name: 'registration_number', type: 'string', size: 50, required: false },
      { name: 'business_address', type: 'string', size: 500, required: false },
      { name: 'business_phone', type: 'string', size: 30, required: false },
      { name: 'business_email', type: 'string', size: 255, required: false },
      { name: 'website', type: 'string', size: 500, required: false },
      { name: 'year_established', type: 'integer', required: false },
    ],
    indexes: [
      { key: 'user_id', type: DatabasesIndexType.Key, attributes: ['user_id'] },
    ],
  },
  {
    id: 'employer_business_documents',
    name: 'Employer Business Documents',
    attributes: [
      { name: 'employer_id', type: 'string', size: 36, required: true },
      { name: 'document_type', type: 'string', size: 30, required: true },
      { name: 'label', type: 'string', size: 255, required: false },
      { name: 'file_id', type: 'string', size: 36, required: true },
      { name: 'file_url', type: 'string', size: 2000, required: true },
      { name: 'file_name', type: 'string', size: 255, required: true },
      { name: 'mime_type', type: 'string', size: 100, required: true },
      { name: 'size', type: 'integer', required: true },
    ],
    indexes: [
      { key: 'employer_id', type: DatabasesIndexType.Key, attributes: ['employer_id'] },
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
      { key: 'employer_id_status', type: DatabasesIndexType.Key, attributes: ['employer_id', 'status'] },
      { key: 'status_createdAt', type: DatabasesIndexType.Key, attributes: ['status', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      // Marketplace search hot paths: keyword (contains on title), budget range,
      // and skills (equal on the required_skill_ids array attribute).
      { key: 'status_title', type: DatabasesIndexType.Key, attributes: ['status', 'title'] },
      { key: 'status_budget', type: DatabasesIndexType.Key, attributes: ['status', 'budget'] },
      { key: 'status_required_skill_ids', type: DatabasesIndexType.Key, attributes: ['status', 'required_skill_ids'] },
      { key: 'createdAt', type: DatabasesIndexType.Key, attributes: ['$createdAt'], orders: [OrderBy.Desc] },
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
      { key: 'freelancer_id_status', type: DatabasesIndexType.Key, attributes: ['freelancer_id', 'status'] },
      { key: 'project_id_freelancer_id', type: DatabasesIndexType.Key, attributes: ['project_id', 'freelancer_id'] },
      { key: 'unique_project_freelancer', type: DatabasesIndexType.Unique, attributes: ['project_id', 'freelancer_id'] },
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
      { key: 'employer_id_status', type: DatabasesIndexType.Key, attributes: ['employer_id', 'status'] },
      { key: 'unique_contract_proposal', type: DatabasesIndexType.Unique, attributes: ['proposal_id'] },
      { key: 'proposal_id', type: DatabasesIndexType.Key, attributes: ['proposal_id'] },
      { key: 'status', type: DatabasesIndexType.Key, attributes: ['status'] },
      { key: 'status_createdAt', type: DatabasesIndexType.Key, attributes: ['status', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'createdAt', type: DatabasesIndexType.Key, attributes: ['$createdAt'], orders: [OrderBy.Desc] },
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
    ],
    indexes: [
      { key: 'contract_id_due_date', type: DatabasesIndexType.Key, attributes: ['contract_id', 'due_date'], orders: [OrderBy.Asc, OrderBy.Asc] },
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
      { key: 'unique_contract_reviewer', type: DatabasesIndexType.Unique, attributes: ['contract_id', 'reviewer_id'] },
      { key: 'createdAt', type: DatabasesIndexType.Key, attributes: ['$createdAt'], orders: [OrderBy.Desc] },
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
      { key: 'createdAt', type: DatabasesIndexType.Key, attributes: ['$createdAt'], orders: [OrderBy.Desc] },
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
      { key: 'payer_id_createdAt', type: DatabasesIndexType.Key, attributes: ['payer_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'payee_id_createdAt', type: DatabasesIndexType.Key, attributes: ['payee_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
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
      { name: 'is_archived', type: 'boolean', required: false, default: false },
    ],
    indexes: [
      { key: 'user_id_is_archived_createdAt', type: DatabasesIndexType.Key, attributes: ['user_id', 'is_archived', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Asc, OrderBy.Desc] },
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
      { name: 'reviewed_at', type: 'string', size: 50, required: false },
      { name: 'completed_at', type: 'string', size: 50, required: false },
      { name: 'expires_at', type: 'string', size: 50, required: false },
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
      { key: 'unique_user_skill', type: DatabasesIndexType.Unique, attributes: ['user_id', 'name'] },
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
      { key: 'unique_suggestion_name', type: DatabasesIndexType.Unique, attributes: ['skill_name'] },
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
      { key: 'actor_id_createdAt', type: DatabasesIndexType.Key, attributes: ['actor_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'action_createdAt', type: DatabasesIndexType.Key, attributes: ['action', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'resource_type_resource_id_createdAt', type: DatabasesIndexType.Key, attributes: ['resource_type', 'resource_id', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Asc, OrderBy.Desc] },
      { key: 'status_createdAt', type: DatabasesIndexType.Key, attributes: ['status', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'createdAt', type: DatabasesIndexType.Key, attributes: ['$createdAt'], orders: [OrderBy.Desc] },
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
      { key: 'contract_id', type: DatabasesIndexType.Key, attributes: ['contract_id'] },
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
    // Attributed to the submitter. Reached only through the server's admin API key.
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
      { key: 'createdAt', type: DatabasesIndexType.Key, attributes: ['$createdAt'], orders: [OrderBy.Desc] },
    ],
  },
  {
    id: 'support_tickets',
    name: 'Support Tickets',
    // A user asking the platform for help, and the admin's reply. Distinct from
    // `disputes` (two users, real money, arbitration) and from `app_ratings`
    // above (one-way feedback nobody answers).
    // Carries a named user's problem report. Reached only through the server's admin API key.
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
      { key: 'user_id_status', type: DatabasesIndexType.Key, attributes: ['user_id', 'status'] },
      { key: 'status_createdAt', type: DatabasesIndexType.Key, attributes: ['status', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'category_createdAt', type: DatabasesIndexType.Key, attributes: ['category', '$createdAt'], orders: [OrderBy.Asc, OrderBy.Desc] },
      { key: 'createdAt', type: DatabasesIndexType.Key, attributes: ['$createdAt'], orders: [OrderBy.Desc] },
    ],
  },
  {
    id: 'subscriptions',
    name: 'Subscriptions',
    // Holds Stripe customer/subscription ids. Reached only through the server's admin API key.
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
      { key: 'plan', type: DatabasesIndexType.Key, attributes: ['plan'] },
      { key: 'status_currentPeriodEnd', type: DatabasesIndexType.Key, attributes: ['status', 'current_period_end'], orders: [OrderBy.Asc, OrderBy.Asc] },
    ],
  },
];

// ─── Database-Level Unique Constraints & Indexes ─────────────────────────────
// All database-level constraints (including unique indexes backing BLF-9.1,
// BLF-skill.1, BLF-skill.2, duplicate proposals, contracts, and favorites)
// are declared directly within each entry in COLLECTIONS above and applied
// via createIndexes().

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
 * Collection Permissions:
 * All collections are configured as server-only (empty permissions []).
 *
 * In our 3-tier architecture (Client -> Express API -> Appwrite), all database
 * operations are mediated by the Express backend using the server's admin API key.
 * By setting permissions to empty ([]), we ensure that no client SDK or unauthorized
 * external actor can read, write, or tamper with collections directly via Appwrite's
 * client endpoints. All business rules, access control, and ownership checks are
 * strictly enforced at the Express API layer.
 */
async function createCollection(colDef: typeof COLLECTIONS[0]): Promise<void> {
  try {
    const existing = await db.getCollection(DATABASE_ID, colDef.id);
    console.log(`  ✓ Collection "${colDef.name}" already exists`);
    // Lockdown guard: if existing collection has client-accessible permissions, lock it down to server-only
    if (existing.$permissions && existing.$permissions.length > 0) {
      console.log(`    🔒 Locking down "${colDef.name}" permissions to server-only...`);
      await db.updateCollection(DATABASE_ID, colDef.id, colDef.name, []);
    }
  } catch {
    console.log(`  Creating collection "${colDef.name}"...`);
    // Server-only collection: empty permissions array disables all direct client-SDK access
    await db.createCollection(DATABASE_ID, colDef.id, colDef.name, []);
    console.log(`  ✓ Collection "${colDef.name}" created (server-only)`);
  }
}

async function createIndexes(colDef: typeof COLLECTIONS[0]): Promise<void> {
  const existingIndexes = new Set<string>();
  const availableAttributes = new Set<string>();

  try {
    const [indexRes, attrRes] = await Promise.all([
      db.listIndexes(DATABASE_ID, colDef.id),
      db.listAttributes(DATABASE_ID, colDef.id),
    ]);
    for (const idx of indexRes.indexes) {
      existingIndexes.add(idx.key);
    }
    for (const attr of attrRes.attributes) {
      availableAttributes.add(attr.key);
    }
    // Include built-in Appwrite system attributes
    availableAttributes.add('$id');
    availableAttributes.add('$createdAt');
    availableAttributes.add('$updatedAt');
    availableAttributes.add('$permissions');
  } catch {
    // If listing fails, proceed to creation
  }

  for (const index of colDef.indexes ?? []) {
    if (existingIndexes.has(index.key)) {
      console.log(`    ⊘ Index "${index.key}" already exists`);
      continue;
    }

    // Guard: check if all attributes required for the index exist in the collection
    if (availableAttributes.size > 0) {
      const missingAttr = index.attributes.find((attrName: string) => !availableAttributes.has(attrName));
      if (missingAttr) {
        console.log(`    ⊘ Index "${index.key}" skipped: attribute "${missingAttr}" is not in collection`);
        continue;
      }
    }

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
      if (e?.code === 409 || e?.message?.includes('already exists')) {
        console.log(`    ⊘ Index "${index.key}" already exists`);
      } else if (e?.message?.includes('array attributes is not currently supported')) {
        console.log(`    ⊘ Index "${index.key}" skipped (Appwrite does not support indexing array attributes)`);
      } else {
        console.error(`    ✗ Failed to create index "${index.key}":`, e?.message || e);
      }
    }
  }
}

async function createAttributes(colDef: typeof COLLECTIONS[0]): Promise<void> {
  const existingAttributes = new Set<string>();

  try {
    const attrRes = await db.listAttributes(DATABASE_ID, colDef.id);
    for (const attr of attrRes.attributes) {
      existingAttributes.add(attr.key);
    }
  } catch {
    // If listing fails, proceed to creation
  }

  for (const attr of colDef.attributes) {
    if (existingAttributes.has(attr.name)) {
      console.log(`    ⊘ Attribute "${attr.name}" already exists`);
      continue;
    }

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
      if (e?.code === 409 || e?.message?.includes('already exists')) {
        console.log(`    ⊘ Attribute "${attr.name}" already exists`);
      } else if (e?.message?.includes('maximum number or size of attributes')) {
        console.warn(`    ⚠️ Attribute "${attr.name}" skipped (collection reached maximum schema row size)`);
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

const BUSINESS_DOCUMENT_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp'];

const BUCKETS_TO_SETUP = [
  { bucketId: 'proposal-attachments', bucketName: 'Proposal Attachments', permissions: [Permission.read(Role.any())], fileSecurity: true, extensions: DOCUMENT_EXTENSIONS },
  { bucketId: 'project-attachments', bucketName: 'Project Attachments', permissions: [Permission.read(Role.any())], fileSecurity: false, extensions: DOCUMENT_EXTENSIONS },
  { bucketId: 'dispute-evidence', bucketName: 'Dispute Evidence', permissions: [], fileSecurity: true, extensions: DOCUMENT_EXTENSIONS },
  { bucketId: 'portfolio-images', bucketName: 'Portfolio Images', permissions: [Permission.read(Role.any())], fileSecurity: false, extensions: IMAGE_EXTENSIONS },
  { bucketId: 'profile-images', bucketName: 'Profile Images', permissions: [Permission.read(Role.any())], fileSecurity: false, extensions: IMAGE_EXTENSIONS },
  { bucketId: 'milestone-deliverables', bucketName: 'Milestone Deliverables', permissions: [], fileSecurity: true, extensions: DOCUMENT_EXTENSIONS },
  { bucketId: 'contract-documents', bucketName: 'Contract Documents', permissions: [Permission.read(Role.any())], fileSecurity: true, extensions: DOCUMENT_EXTENSIONS },
  { bucketId: 'business-documents', bucketName: 'Business Documents', permissions: [], fileSecurity: true, extensions: BUSINESS_DOCUMENT_EXTENSIONS },
];

async function setupStorage(buckets: typeof BUCKETS_TO_SETUP = BUCKETS_TO_SETUP): Promise<void> {
  const storage = new Storage(client);
  const existing = await storage.listBuckets();
  const existingIds = new Set(existing.buckets.map((b) => b.$id));

  for (const b of buckets) {
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
  { seedId: "cat-1", name: "Blockchain", description: "Blockchain and smart contract development skills", is_active: true },
  { seedId: "cat-2", name: "Frontend", description: "Frontend and client-side web development skills", is_active: true },
  { seedId: "cat-3", name: "Backend", description: "Backend, database, and API development skills", is_active: true },
  { seedId: "cat-4", name: "Design", description: "UI/UX, visual design, and branding skills", is_active: true },
  { seedId: "cat-5", name: "Mobile", description: "Mobile application development for iOS and Android", is_active: true },
  { seedId: "cat-6", name: "DevOps & Cloud", description: "Cloud computing, CI/CD, containers, and infrastructure", is_active: true },
  { seedId: "cat-7", name: "AI & Machine Learning", description: "Artificial intelligence, machine learning, and LLM engineering", is_active: true },
  { seedId: "cat-8", name: "Cybersecurity", description: "Information security, penetration testing, and smart contract auditing", is_active: true },
  { seedId: "cat-9", name: "Data & Analytics", description: "Data engineering, analysis, pipelines, and business intelligence", is_active: true },
  { seedId: "cat-10", name: "Quality Assurance", description: "Software testing, automated QA, and test engineering", is_active: true },
  { seedId: "cat-11", name: "Product & Management", description: "Product management, agile project management, and strategy", is_active: true },
  { seedId: "cat-12", name: "Writing & Content", description: "Technical documentation, whitepapers, and content writing", is_active: true },
  { seedId: "cat-13", name: "Soft Skills", description: "Interpersonal, communication, and work-style skills", is_active: true },
  { seedId: "cat-14", name: "Web Development", description: "Full-stack web technology stacks, CMS platforms, and website delivery", is_active: true },
  { seedId: "cat-15", name: "Nuclear Engineering", description: "Nuclear power, radiation protection, and nuclear safety engineering", is_active: true },
  { seedId: "cat-16", name: "Explosives Safety & Disposal", description: "Bomb disposal, blasting engineering, and explosives safety compliance", is_active: true },
];

const skills = [
  // --- Category 1: Blockchain ---
  { seedId: "skill-1", category_id: "cat-1", name: "Solidity", description: "Smart contract development on EVM blockchains", is_active: true },
  { seedId: "skill-2", category_id: "cat-1", name: "Rust", description: "Systems programming and Solana smart contracts", is_active: true },
  { seedId: "skill-3", category_id: "cat-1", name: "Hardhat", description: "Ethereum development and testing environment", is_active: true },
  { seedId: "skill-11", category_id: "cat-1", name: "Foundry", description: "Blazing-fast, portable Ethereum development toolchain", is_active: true },
  { seedId: "skill-12", category_id: "cat-1", name: "Ethereum / EVM", description: "Ethereum virtual machine architecture and protocol", is_active: true },
  { seedId: "skill-13", category_id: "cat-1", name: "Solana", description: "High-performance blockchain development and Anchor framework", is_active: true },
  { seedId: "skill-14", category_id: "cat-1", name: "Web3.js", description: "Ethereum JavaScript API for interacting with nodes", is_active: true },
  { seedId: "skill-15", category_id: "cat-1", name: "Ethers.js", description: "Complete Ethereum library for dApp development", is_active: true },
  { seedId: "skill-16", category_id: "cat-1", name: "Viem / Wagmi", description: "TypeScript-first interfaces for Ethereum and React hooks", is_active: true },
  { seedId: "skill-17", category_id: "cat-1", name: "DeFi Architecture", description: "Decentralized finance protocols, AMMs, and lending pools", is_active: true },
  { seedId: "skill-18", category_id: "cat-1", name: "ERC Standards", description: "ERC-20, ERC-721, and ERC-1155 token implementations", is_active: true },
  { seedId: "skill-19", category_id: "cat-1", name: "The Graph / Subgraphs", description: "Decentralized indexing protocol for querying blockchain data", is_active: true },
  { seedId: "skill-20", category_id: "cat-1", name: "IPFS / Arweave", description: "Decentralized storage solutions for files and metadata", is_active: true },
  { seedId: "skill-21", category_id: "cat-1", name: "Zero-Knowledge Proofs", description: "zk-SNARKs, zk-STARKs, and privacy-preserving primitives", is_active: true },
  { seedId: "skill-22", category_id: "cat-1", name: "Smart Contract Auditing", description: "Vulnerability assessment and security verification of contracts", is_active: true },
  { seedId: "skill-23", category_id: "cat-1", name: "Move", description: "Programming language for Aptos and Sui blockchains", is_active: true },
  { seedId: "skill-24", category_id: "cat-1", name: "Vyper", description: "Pythonic smart contract language for EVM", is_active: true },
  { seedId: "skill-25", category_id: "cat-1", name: "Cross-Chain Protocols", description: "Interoperability, LayerZero, Chainlink CCIP, and bridge architecture", is_active: true },
  { seedId: "skill-26", category_id: "cat-1", name: "Cosmos SDK", description: "Framework for building customized application-specific blockchains", is_active: true },
  { seedId: "skill-27", category_id: "cat-1", name: "Tokenomics Design", description: "Economic models, token distribution, staking, and incentive mechanics", is_active: true },

  // --- Category 2: Frontend ---
  { seedId: "skill-4", category_id: "cat-2", name: "React", description: "Frontend library for building reactive user interfaces", is_active: true },
  { seedId: "skill-5", category_id: "cat-2", name: "TypeScript", description: "Statically typed superset of JavaScript", is_active: true },
  { seedId: "skill-6", category_id: "cat-2", name: "Tailwind CSS", description: "Utility-first CSS framework for modern styling", is_active: true },
  { seedId: "skill-28", category_id: "cat-2", name: "Next.js", description: "React framework for server-rendered and static web apps", is_active: true },
  { seedId: "skill-29", category_id: "cat-2", name: "Vue.js", description: "Progressive JavaScript framework for user interfaces", is_active: true },
  { seedId: "skill-30", category_id: "cat-2", name: "Nuxt.js", description: "Intuitive Vue framework for server-side and fullstack apps", is_active: true },
  { seedId: "skill-31", category_id: "cat-2", name: "Angular", description: "Enterprise-grade TypeScript web application platform", is_active: true },
  { seedId: "skill-32", category_id: "cat-2", name: "Svelte / SvelteKit", description: "Compiler-based reactive framework and web application kit", is_active: true },
  { seedId: "skill-33", category_id: "cat-2", name: "JavaScript (ES6+)", description: "Modern ECMAScript standards and core browser scripting", is_active: true },
  { seedId: "skill-34", category_id: "cat-2", name: "HTML5 / CSS3", description: "Semantic markup, modern styling, Flexbox, and CSS Grid", is_active: true },
  { seedId: "skill-35", category_id: "cat-2", name: "Redux / Zustand", description: "Predictable state management containers for web applications", is_active: true },
  { seedId: "skill-36", category_id: "cat-2", name: "GraphQL Client", description: "Querying and mutating GraphQL APIs in client applications", is_active: true },
  { seedId: "skill-37", category_id: "cat-2", name: "WebSockets", description: "Bidirectional event-driven communication and real-time feeds", is_active: true },
  { seedId: "skill-38", category_id: "cat-2", name: "WebGL / Three.js", description: "3D graphics and interactive visual experiences in the browser", is_active: true },
  { seedId: "skill-39", category_id: "cat-2", name: "Progressive Web Apps", description: "Offline-capable, installable progressive web experiences", is_active: true },
  { seedId: "skill-40", category_id: "cat-2", name: "Web Performance", description: "Core Web Vitals, code splitting, bundling, and lazy loading", is_active: true },
  { seedId: "skill-41", category_id: "cat-2", name: "Responsive Design", description: "Fluid layouts, media queries, and mobile-first engineering", is_active: true },
  { seedId: "skill-42", category_id: "cat-2", name: "Micro-frontends", description: "Modular, independently deployable frontend architectures", is_active: true },

  // --- Category 3: Backend ---
  { seedId: "skill-7", category_id: "cat-3", name: "Node.js", description: "Asynchronous event-driven JavaScript backend runtime", is_active: true },
  { seedId: "skill-8", category_id: "cat-3", name: "Python", description: "Versatile programming language for backends, APIs, and scripts", is_active: true },
  { seedId: "skill-43", category_id: "cat-3", name: "Go (Golang)", description: "High-concurrency, compiled backend systems language", is_active: true },
  { seedId: "skill-44", category_id: "cat-3", name: "Express.js", description: "Fast, unopinionated, minimalist web framework for Node.js", is_active: true },
  { seedId: "skill-45", category_id: "cat-3", name: "NestJS", description: "Progressive TypeScript framework for scalable enterprise backends", is_active: true },
  { seedId: "skill-46", category_id: "cat-3", name: "Fastify", description: "High-performance, low-overhead Node.js web framework", is_active: true },
  { seedId: "skill-47", category_id: "cat-3", name: "Django", description: "Batteries-included high-level Python web framework", is_active: true },
  { seedId: "skill-48", category_id: "cat-3", name: "FastAPI", description: "Modern, fast, asynchronous Python web framework with OpenAPI", is_active: true },
  { seedId: "skill-49", category_id: "cat-3", name: "Ruby on Rails", description: "Convention-over-configuration full-stack web framework", is_active: true },
  { seedId: "skill-50", category_id: "cat-3", name: "Java / Spring Boot", description: "Enterprise Java backend microservices framework", is_active: true },
  { seedId: "skill-51", category_id: "cat-3", name: "C# / .NET Core", description: "Cross-platform high-performance enterprise application framework", is_active: true },
  { seedId: "skill-52", category_id: "cat-3", name: "PostgreSQL", description: "Advanced open-source relational SQL database system", is_active: true },
  { seedId: "skill-53", category_id: "cat-3", name: "MongoDB", description: "Document-oriented NoSQL database system", is_active: true },
  { seedId: "skill-54", category_id: "cat-3", name: "MySQL", description: "Widely adopted relational database management system", is_active: true },
  { seedId: "skill-55", category_id: "cat-3", name: "Redis", description: "In-memory data structure store for caching and pub/sub", is_active: true },
  { seedId: "skill-56", category_id: "cat-3", name: "GraphQL API", description: "Query language and server runtime for flexible APIs", is_active: true },
  { seedId: "skill-57", category_id: "cat-3", name: "RESTful API Design", description: "REST architecture, resource routing, and HTTP API standards", is_active: true },
  { seedId: "skill-58", category_id: "cat-3", name: "gRPC / Protobuf", description: "High-performance RPC framework and serialization system", is_active: true },
  { seedId: "skill-59", category_id: "cat-3", name: "Microservices", description: "Distributed services design, service discovery, and boundaries", is_active: true },
  { seedId: "skill-60", category_id: "cat-3", name: "Message Queues", description: "Event streaming and asynchronous brokers with Kafka and RabbitMQ", is_active: true },

  // --- Category 4: Design ---
  { seedId: "skill-9", category_id: "cat-4", name: "Figma", description: "Collaborative interface design, wireframing, and prototyping tool", is_active: true },
  { seedId: "skill-10", category_id: "cat-4", name: "UI/UX Design", description: "User experience research, wireframing, and interface design", is_active: true },
  { seedId: "skill-61", category_id: "cat-4", name: "Design Systems", description: "Component libraries, design tokens, and style guides", is_active: true },
  { seedId: "skill-62", category_id: "cat-4", name: "User Research", description: "User interviews, persona building, and usability testing", is_active: true },
  { seedId: "skill-63", category_id: "cat-4", name: "Adobe XD", description: "Vector-based experience design tool for web and mobile apps", is_active: true },
  { seedId: "skill-64", category_id: "cat-4", name: "Wireframing & Prototyping", description: "Low and high-fidelity mockups and interactive prototypes", is_active: true },
  { seedId: "skill-65", category_id: "cat-4", name: "Interaction Design", description: "Micro-interactions, animations, and intuitive UI transitions", is_active: true },
  { seedId: "skill-66", category_id: "cat-4", name: "3D Modeling (Blender)", description: "3D asset creation, rendering, and spatial graphics", is_active: true },
  { seedId: "skill-67", category_id: "cat-4", name: "Motion Graphics", description: "Animated vector graphics, video transitions, and visual effects", is_active: true },
  { seedId: "skill-68", category_id: "cat-4", name: "Branding & Identity", description: "Logo design, brand kits, typography, and visual strategy", is_active: true },
  { seedId: "skill-69", category_id: "cat-4", name: "Adobe Illustrator", description: "Vector graphics creation and digital illustration software", is_active: true },
  { seedId: "skill-70", category_id: "cat-4", name: "Adobe Photoshop", description: "Digital image editing, photo manipulation, and graphic creation", is_active: true },

  // --- Category 5: Mobile ---
  { seedId: "skill-71", category_id: "cat-5", name: "React Native", description: "Cross-platform mobile application development using React", is_active: true },
  { seedId: "skill-72", category_id: "cat-5", name: "Flutter", description: "Google UI toolkit for multi-platform apps from a single codebase", is_active: true },
  { seedId: "skill-73", category_id: "cat-5", name: "Swift", description: "Modern programming language for iOS, iPadOS, and macOS apps", is_active: true },
  { seedId: "skill-74", category_id: "cat-5", name: "SwiftUI", description: "Declarative UI framework for Apple platform applications", is_active: true },
  { seedId: "skill-75", category_id: "cat-5", name: "Kotlin", description: "Modern, concise language for Android mobile development", is_active: true },
  { seedId: "skill-76", category_id: "cat-5", name: "Jetpack Compose", description: "Modern declarative UI toolkit for native Android applications", is_active: true },
  { seedId: "skill-77", category_id: "cat-5", name: "Expo", description: "Ecosystem of tools and libraries for universal React Native apps", is_active: true },
  { seedId: "skill-78", category_id: "cat-5", name: "Mobile App Security", description: "Secure storage, certificate pinning, and mobile app protection", is_active: true },
  { seedId: "skill-79", category_id: "cat-5", name: "App Store Publishing", description: "Publishing, certification, and release management on iOS & Android", is_active: true },

  // --- Category 6: DevOps & Cloud ---
  { seedId: "skill-80", category_id: "cat-6", name: "Docker", description: "Containerization platform for packaging and deploying applications", is_active: true },
  { seedId: "skill-81", category_id: "cat-6", name: "Kubernetes", description: "Container orchestration system for automating deployment and scaling", is_active: true },
  { seedId: "skill-82", category_id: "cat-6", name: "AWS", description: "Amazon Web Services cloud architecture and services", is_active: true },
  { seedId: "skill-83", category_id: "cat-6", name: "Google Cloud Platform", description: "GCP cloud computing, storage, and serverless infrastructure", is_active: true },
  { seedId: "skill-84", category_id: "cat-6", name: "Microsoft Azure", description: "Enterprise cloud computing platform and hybrid infrastructure", is_active: true },
  { seedId: "skill-85", category_id: "cat-6", name: "Terraform", description: "Infrastructure as code software tool for cloud provisioning", is_active: true },
  { seedId: "skill-86", category_id: "cat-6", name: "CI/CD Pipelines", description: "Continuous integration and delivery with GitHub Actions and GitLab", is_active: true },
  { seedId: "skill-87", category_id: "cat-6", name: "Linux Administration", description: "Server management, shell scripting, system security, and networking", is_active: true },
  { seedId: "skill-88", category_id: "cat-6", name: "Nginx", description: "Web server, reverse proxy, load balancing, and SSL termination", is_active: true },
  { seedId: "skill-89", category_id: "cat-6", name: "Prometheus & Grafana", description: "Metrics collection, time-series monitoring, and alerting dashboards", is_active: true },
  { seedId: "skill-90", category_id: "cat-6", name: "Serverless Architecture", description: "Event-driven compute using AWS Lambda and Cloudflare Workers", is_active: true },
  { seedId: "skill-91", category_id: "cat-6", name: "Cloudflare & CDN", description: "Edge routing, DDoS mitigation, caching, and CDN optimization", is_active: true },

  // --- Category 7: AI & Machine Learning ---
  { seedId: "skill-92", category_id: "cat-7", name: "PyTorch", description: "Open source machine learning framework for deep learning models", is_active: true },
  { seedId: "skill-93", category_id: "cat-7", name: "TensorFlow", description: "End-to-end open source platform for machine learning", is_active: true },
  { seedId: "skill-94", category_id: "cat-7", name: "Large Language Models", description: "Fine-tuning, integrating, and evaluating large language models", is_active: true },
  { seedId: "skill-95", category_id: "cat-7", name: "LangChain / LlamaIndex", description: "Frameworks for building context-aware generative AI applications", is_active: true },
  { seedId: "skill-96", category_id: "cat-7", name: "Prompt Engineering", description: "Designing optimized instructions and reasoning prompts for LLMs", is_active: true },
  { seedId: "skill-97", category_id: "cat-7", name: "Computer Vision", description: "Image classification, object detection, and OpenCV processing", is_active: true },
  { seedId: "skill-98", category_id: "cat-7", name: "NLP", description: "Text analysis, sentiment classification, tokenization, and embeddings", is_active: true },
  { seedId: "skill-99", category_id: "cat-7", name: "Hugging Face", description: "Pretrained transformer models, datasets, and pipelines", is_active: true },
  { seedId: "skill-100", category_id: "cat-7", name: "Vector Databases", description: "Vector indexing with Pinecone, Chroma, Milvus, and pgvector", is_active: true },
  { seedId: "skill-101", category_id: "cat-7", name: "RAG Systems", description: "Retrieval-Augmented Generation with semantic search and vector stores", is_active: true },
  { seedId: "skill-102", category_id: "cat-7", name: "MLOps", description: "Machine learning lifecycle management, deployment, and model monitoring", is_active: true },

  // --- Category 8: Cybersecurity ---
  { seedId: "skill-103", category_id: "cat-8", name: "Penetration Testing", description: "Ethical hacking, vulnerability exploitation, and security assessments", is_active: true },
  { seedId: "skill-104", category_id: "cat-8", name: "OWASP Security", description: "Web application security standards and vulnerability mitigation", is_active: true },
  { seedId: "skill-105", category_id: "cat-8", name: "Cryptography", description: "Public-key cryptography, hashing algorithms, and zero-knowledge primitives", is_active: true },
  { seedId: "skill-106", category_id: "cat-8", name: "Slither / Mythril", description: "Static and symbolic analysis tools for smart contract security", is_active: true },
  { seedId: "skill-107", category_id: "cat-8", name: "Vulnerability Assessment", description: "Scanning, triage, and remediation of system security weaknesses", is_active: true },
  { seedId: "skill-108", category_id: "cat-8", name: "Network Security", description: "Firewalls, VPNs, IDS/IPS, and packet inspection protocols", is_active: true },
  { seedId: "skill-109", category_id: "cat-8", name: "Auth & Identity (OAuth/MFA)", description: "OAuth 2.0, OpenID Connect, JWT, and multi-factor authentication", is_active: true },
  { seedId: "skill-110", category_id: "cat-8", name: "Threat Modeling", description: "Identifying threat actors, attack vectors, and defensive controls", is_active: true },

  // --- Category 9: Data & Analytics ---
  { seedId: "skill-111", category_id: "cat-9", name: "SQL & Query Optimization", description: "Complex relational queries, indexing, and database optimization", is_active: true },
  { seedId: "skill-112", category_id: "cat-9", name: "Pandas & NumPy", description: "Data manipulation, array computing, and exploratory analysis in Python", is_active: true },
  { seedId: "skill-113", category_id: "cat-9", name: "Apache Spark", description: "Unified analytics engine for large-scale distributed data processing", is_active: true },
  { seedId: "skill-114", category_id: "cat-9", name: "Data Warehousing", description: "Analytical data warehouses with BigQuery and Snowflake", is_active: true },
  { seedId: "skill-115", category_id: "cat-9", name: "ETL / Data Pipelines", description: "Data ingestion, transformation, and pipeline orchestration", is_active: true },
  { seedId: "skill-116", category_id: "cat-9", name: "Power BI / Tableau", description: "Data modeling, interactive dashboard creation, and business KPIs", is_active: true },
  { seedId: "skill-117", category_id: "cat-9", name: "Statistical Modeling", description: "Hypothesis testing, regression analysis, and predictive modeling", is_active: true },

  // --- Category 10: Quality Assurance ---
  { seedId: "skill-118", category_id: "cat-10", name: "Jest / Vitest", description: "JavaScript testing frameworks for unit and integration testing", is_active: true },
  { seedId: "skill-119", category_id: "cat-10", name: "Cypress", description: "Frontend testing tool for web applications running in the browser", is_active: true },
  { seedId: "skill-120", category_id: "cat-10", name: "Playwright", description: "Cross-browser end-to-end automation framework for modern web apps", is_active: true },
  { seedId: "skill-121", category_id: "cat-10", name: "End-to-End Testing", description: "Automated user journey verification across complex multi-step workflows", is_active: true },
  { seedId: "skill-122", category_id: "cat-10", name: "API Testing (Postman)", description: "REST and GraphQL API test automation, assertions, and contracts", is_active: true },
  { seedId: "skill-123", category_id: "cat-10", name: "Performance Testing (k6)", description: "Simulating heavy traffic loads, benchmarking, and identifying bottlenecks", is_active: true },

  // --- Category 11: Product & Management ---
  { seedId: "skill-124", category_id: "cat-11", name: "Agile & Scrum", description: "Agile ceremonies, user stories, retrospectives, and continuous improvement", is_active: true },
  { seedId: "skill-125", category_id: "cat-11", name: "Technical Product Management", description: "Product specification, requirements engineering, and cross-functional leadership", is_active: true },
  { seedId: "skill-126", category_id: "cat-11", name: "JIRA & Linear", description: "Issue tracking, project management, and sprint planning boards", is_active: true },
  { seedId: "skill-127", category_id: "cat-11", name: "Product Roadmapping", description: "Strategic roadmaps, milestone planning, and feature prioritization", is_active: true },
  { seedId: "skill-128", category_id: "cat-11", name: "Stakeholder Management", description: "Communication, alignment, and requirement negotiation with stakeholders", is_active: true },

  // --- Category 12: Writing & Content ---
  { seedId: "skill-129", category_id: "cat-12", name: "Technical Documentation", description: "System architecture docs, developer guides, and onboarding manuals", is_active: true },
  { seedId: "skill-130", category_id: "cat-12", name: "API Documentation", description: "Writing comprehensive, interactive API references using OpenAPI / Swagger", is_active: true },
  { seedId: "skill-131", category_id: "cat-12", name: "Web3 Whitepapers", description: "Architectural whitepapers, tokenomics documentation, and lightpapers", is_active: true },
  { seedId: "skill-132", category_id: "cat-12", name: "Developer Guides", description: "Step-by-step technical tutorials, code walkthroughs, and sample apps", is_active: true },
  { seedId: "skill-133", category_id: "cat-12", name: "Technical Copywriting", description: "Clear, compelling copywriting for technology products and landing pages", is_active: true },
  { seedId: "skill-134", category_id: "cat-13", name: "Communication", description: "Clear written and verbal communication with clients and teammates", is_active: true },
  { seedId: "skill-135", category_id: "cat-13", name: "Teamwork & Collaboration", description: "Working effectively with others toward shared goals", is_active: true },
  { seedId: "skill-136", category_id: "cat-13", name: "Leadership", description: "Guiding people, setting direction, and taking ownership of outcomes", is_active: true },
  { seedId: "skill-137", category_id: "cat-13", name: "Problem Solving", description: "Breaking down issues and finding practical solutions", is_active: true },
  { seedId: "skill-138", category_id: "cat-13", name: "Critical Thinking", description: "Evaluating information objectively to make sound decisions", is_active: true },
  { seedId: "skill-139", category_id: "cat-13", name: "Time Management", description: "Prioritizing work and meeting deadlines reliably", is_active: true },
  { seedId: "skill-140", category_id: "cat-13", name: "Adaptability", description: "Adjusting quickly to new requirements, tools, and environments", is_active: true },
  { seedId: "skill-141", category_id: "cat-13", name: "Attention to Detail", description: "Producing accurate, thorough, and polished work", is_active: true },
  { seedId: "skill-142", category_id: "cat-13", name: "Client Relations", description: "Building trust and managing expectations with clients", is_active: true },
  { seedId: "skill-143", category_id: "cat-13", name: "Conflict Resolution", description: "Handling disagreements calmly and finding common ground", is_active: true },
  { seedId: "skill-144", category_id: "cat-13", name: "Self-Motivation", description: "Working independently and staying productive without supervision", is_active: true },
  { seedId: "skill-145", category_id: "cat-13", name: "Creativity", description: "Bringing original ideas and fresh approaches to problems", is_active: true },
  { seedId: "skill-146", category_id: "cat-14", name: "MERN Stack", description: "MongoDB, Express, React, and Node.js full-stack applications", is_active: true },
  { seedId: "skill-147", category_id: "cat-14", name: "MEAN Stack", description: "MongoDB, Express, Angular, and Node.js full-stack applications", is_active: true },
  { seedId: "skill-148", category_id: "cat-14", name: "LAMP Stack", description: "Linux, Apache, MySQL, and PHP web applications", is_active: true },
  { seedId: "skill-149", category_id: "cat-14", name: "JAMstack", description: "JavaScript, APIs, and prebuilt markup for fast static sites", is_active: true },
  { seedId: "skill-150", category_id: "cat-14", name: "Full-Stack Web Development", description: "Building complete web applications across client, server, and database", is_active: true },
  { seedId: "skill-151", category_id: "cat-14", name: "PHP", description: "Server-side scripting for dynamic websites and web applications", is_active: true },
  { seedId: "skill-152", category_id: "cat-14", name: "Laravel", description: "PHP framework for robust, maintainable web applications", is_active: true },
  { seedId: "skill-153", category_id: "cat-14", name: "WordPress", description: "Theme and plugin development for WordPress sites", is_active: true },
  { seedId: "skill-154", category_id: "cat-14", name: "WooCommerce", description: "E-commerce stores built on WordPress", is_active: true },
  { seedId: "skill-155", category_id: "cat-14", name: "Shopify", description: "Shopify store setup, theme customization, and Liquid templates", is_active: true },
  { seedId: "skill-156", category_id: "cat-14", name: "Webflow", description: "Visual website building and CMS on Webflow", is_active: true },
  { seedId: "skill-157", category_id: "cat-14", name: "Headless CMS (Strapi / Sanity)", description: "Content APIs and editorial workflows with headless CMS platforms", is_active: true },
  { seedId: "skill-158", category_id: "cat-14", name: "Firebase / Supabase", description: "Hosted auth, databases, and storage for web apps", is_active: true },
  { seedId: "skill-159", category_id: "cat-14", name: "Bootstrap", description: "Responsive layouts and components with the Bootstrap framework", is_active: true },
  { seedId: "skill-160", category_id: "cat-14", name: "jQuery", description: "DOM scripting and legacy front-end maintenance with jQuery", is_active: true },
  { seedId: "skill-161", category_id: "cat-14", name: "SEO", description: "Technical and on-page search engine optimization", is_active: true },
  { seedId: "skill-162", category_id: "cat-14", name: "Web Accessibility (WCAG)", description: "Building websites that meet WCAG accessibility standards", is_active: true },
  { seedId: "skill-163", category_id: "cat-14", name: "Web Hosting & Deployment", description: "Domains, hosting, and deploying sites to Vercel, Netlify, or VPS servers", is_active: true },
  { seedId: "skill-164", category_id: "cat-15", name: "Reactor Operations", description: "Safe operation and monitoring of nuclear power reactors", is_active: true },
  { seedId: "skill-165", category_id: "cat-15", name: "Radiation Protection", description: "Dose monitoring, shielding, and ALARA radiation safety practices", is_active: true },
  { seedId: "skill-166", category_id: "cat-15", name: "Nuclear Safety Analysis", description: "Safety cases, probabilistic risk assessment, and accident analysis", is_active: true },
  { seedId: "skill-167", category_id: "cat-15", name: "Health Physics", description: "Radiation measurement and protection of workers and the public", is_active: true },
  { seedId: "skill-168", category_id: "cat-15", name: "Nuclear Licensing & Compliance", description: "Regulatory licensing and IAEA / national regulator compliance", is_active: true },
  { seedId: "skill-169", category_id: "cat-15", name: "Radioactive Waste Management", description: "Safe handling, storage, and disposal of radioactive waste", is_active: true },
  { seedId: "skill-170", category_id: "cat-15", name: "Nuclear Instrumentation & Control", description: "Reactor sensors, instrumentation, and control systems", is_active: true },
  { seedId: "skill-171", category_id: "cat-15", name: "Reactor Physics Simulation", description: "Core physics and neutronics modeling for reactor design", is_active: true },
  { seedId: "skill-172", category_id: "cat-15", name: "Nuclear Decommissioning", description: "Safe dismantling and cleanup of retired nuclear facilities", is_active: true },
  { seedId: "skill-173", category_id: "cat-15", name: "Medical Physics (Nuclear Medicine)", description: "Safe use of radiation in medical imaging and therapy", is_active: true },
  { seedId: "skill-174", category_id: "cat-16", name: "Explosive Ordnance Disposal (EOD)", description: "Locating and safely rendering safe unexploded ordnance", is_active: true },
  { seedId: "skill-175", category_id: "cat-16", name: "Bomb Disposal", description: "Render-safe procedures for suspected explosive devices", is_active: true },
  { seedId: "skill-176", category_id: "cat-16", name: "Bomb Threat Response", description: "Threat assessment, search procedures, and evacuation planning", is_active: true },
  { seedId: "skill-177", category_id: "cat-16", name: "Blasting Engineering", description: "Controlled blast design for mining, quarrying, and construction", is_active: true },
  { seedId: "skill-178", category_id: "cat-16", name: "Controlled Demolition", description: "Planning and supervising the safe demolition of structures", is_active: true },
  { seedId: "skill-179", category_id: "cat-16", name: "Explosives Storage & Transport Compliance", description: "Licensing, magazine storage, and transport regulations for explosives", is_active: true },
  { seedId: "skill-180", category_id: "cat-16", name: "Blast Safety & Risk Assessment", description: "Exclusion zones, vibration, and overpressure monitoring", is_active: true },
  { seedId: "skill-181", category_id: "cat-16", name: "Explosives Detection & Screening", description: "Security screening technology and procedures for explosives", is_active: true },
  { seedId: "skill-182", category_id: "cat-16", name: "Humanitarian Demining", description: "Clearing landmines and explosive remnants of war", is_active: true },
  { seedId: "skill-183", category_id: "cat-16", name: "Post-Blast Investigation", description: "Forensic investigation of explosive incidents", is_active: true },
];

const adminUsers = [
  {
    seedId: "admin-1",
    email: "admin@freelancexchain.com",
    password_hash: "",
    name: "System Administrator",
    role: "admin",
    wallet_address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    is_suspended: false,
    suspension_reason: null,
    mfa_enabled: false,
    permissions: JSON.stringify([
      'kyc:view',
      'kyc:manage',
      'users:view',
      'users:manage',
      'disputes:view',
      'disputes:manage',
      'support:manage',
      'skills:manage',
      'analytics:view',
      'system:view',
      'audit:view',
      'admin:manage',
    ]),
  },
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
      { name: "Leadership", years_of_experience: 4.5, added_manually: false },
      { name: "Attention to Detail", years_of_experience: 4.5, added_manually: false },
    ]),
    experience: JSON.stringify([
      {
        id: "exp-1",
        title: "Senior Smart Contract Developer",
        company: "DeFi Protocol Inc.",
        description: "Led security audits for multiple DeFi protocols",
        start_date: "2022-01-01",
        end_date: null,
        skills: ["Leadership", "Attention to Detail"],
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
      { name: "Communication", years_of_experience: 5.5, added_manually: false },
      { name: "Creativity", years_of_experience: 5.5, added_manually: false },
    ]),
    experience: JSON.stringify([
      {
        id: "exp-2",
        title: "UI/UX Designer",
        company: "CryptoDesign Studio",
        description: "Designed intuitive interfaces for Web3 applications",
        start_date: "2021-06-01",
        end_date: null,
        skills: ["Communication", "Creativity"],
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
      { name: "Teamwork & Collaboration", years_of_experience: 4, added_manually: false },
      { name: "Problem Solving", years_of_experience: 4, added_manually: false },
    ]),
    experience: JSON.stringify([
      {
        id: "exp-3",
        title: "Senior Web Developer",
        company: "TechCorp",
        description: "Full-stack development for enterprise applications",
        start_date: "2023-01-01",
        end_date: null,
        skills: ["Teamwork & Collaboration", "Problem Solving"],
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
    budget: 2.5,
    deadline: futureDate(45),
    is_rush: false,
    rush_fee_percentage: 25,
    status: "open",
    milestones: JSON.stringify([
      { id: "m1", title: "UI Design & Components", description: "Create wireframes and reusable components", amount: 0.5, due_date: futureDate(15), status: "pending" },
      { id: "m2", title: "Core Functionality", description: "Implement token swap and wallet integration", amount: 1.0, due_date: futureDate(30), status: "submitted" },
      { id: "m3", title: "Testing & Deployment", description: "QA testing and production deployment", amount: 1.0, due_date: futureDate(45), status: "pending" },
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
    budget: 4.5,
    deadline: futureDate(30),
    is_rush: true,
    rush_fee_percentage: 50,
    status: "open",
    milestones: JSON.stringify([
      { id: "m4", title: "Initial Assessment", description: "Review contract architecture", amount: 1.5, due_date: futureDate(10), status: "pending" },
      { id: "m5", title: "Deep Analysis", description: "Line-by-line security review", amount: 2.0, due_date: futureDate(20), status: "pending" },
      { id: "m6", title: "Report & Remediation", description: "Final report with fixes", amount: 1.0, due_date: futureDate(30), status: "pending" },
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
    budget: 3.6,
    deadline: futureDate(60),
    is_rush: false,
    rush_fee_percentage: 25,
    status: "open",
    milestones: JSON.stringify([
      { id: "m7", title: "Smart Contracts", description: "NFT and marketplace contracts", amount: 1.2, due_date: futureDate(20), status: "pending" },
      { id: "m8", title: "Backend API", description: "REST API and IPFS integration", amount: 1.2, due_date: futureDate(40), status: "pending" },
      { id: "m9", title: "Frontend UI", description: "Complete marketplace interface", amount: 1.2, due_date: futureDate(60), status: "pending" },
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
    budget: 2.0,
    deadline: futureDate(40),
    is_rush: false,
    rush_fee_percentage: 25,
    status: "open",
    milestones: JSON.stringify([
      { id: "m10", title: "Design System", description: "Create design tokens and components", amount: 0.6, due_date: futureDate(15), status: "pending" },
      { id: "m11", title: "Proposal & Voting UI", description: "Core governance features", amount: 0.8, due_date: futureDate(30), status: "pending" },
      { id: "m12", title: "Treasury & Members", description: "Dashboard analytics", amount: 0.6, due_date: futureDate(40), status: "pending" },
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
    budget: 1.8,
    deadline: futureDate(35),
    is_rush: false,
    rush_fee_percentage: 25,
    status: "open",
    milestones: JSON.stringify([
      { id: "m13", title: "UI Design", description: "Wireframes and visual design", amount: 0.5, due_date: futureDate(10), status: "pending" },
      { id: "m14", title: "Bridge Interface", description: "Network selection and swap UI", amount: 0.8, due_date: futureDate(25), status: "pending" },
      { id: "m15", title: "Transaction Tracking", description: "Status and history views", amount: 0.5, due_date: futureDate(35), status: "pending" },
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
    budget: 5.5,
    deadline: futureDate(75),
    is_rush: false,
    rush_fee_percentage: 25,
    status: "open",
    milestones: JSON.stringify([
      { id: "m16", title: "Strategy Design", description: "Yield optimization algorithms", amount: 1.0, due_date: futureDate(15), status: "pending" },
      { id: "m17", title: "Smart Contracts", description: "Vault and strategy contracts", amount: 2.0, due_date: futureDate(40), status: "pending" },
      { id: "m18", title: "Backend & API", description: "Monitoring and automation", amount: 1.25, due_date: futureDate(60), status: "pending" },
      { id: "m19", title: "Dashboard", description: "Analytics and visualization", amount: 1.25, due_date: futureDate(75), status: "pending" },
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
    status: "completed",
    didit_session_id: "session_fl2_pending",
    didit_session_token: "tok_fl2_pending",
    didit_session_url: "https://verification.didit.me/v/session_fl2_pending",
    didit_workflow_id: "wf_freelance_kyc",
    decision: "review",
    document_type: "NATIONAL_ID",
    document_number: "N7654321B",
    first_name: "Juan",
    last_name: "dela Cruz",
    nationality: "PH",
    document_verified: true,
    liveness_passed: true,
    face_matched: true,
    ip_address: "127.0.0.1",
    metadata: JSON.stringify({ submitted_at: "2026-03-01T09:30:00.000Z", tier: "standard" }),
  },
  {
    seedId: "kyc-admin-pending",
    user_id: "admin-1",
    status: "completed",
    didit_session_id: "session_admin1_pending",
    didit_session_token: "tok_admin1_pending",
    didit_session_url: "https://verification.didit.me/v/session_admin1_pending",
    didit_workflow_id: "wf_admin_kyc",
    decision: "review",
    document_type: "PASSPORT",
    document_number: "A9998887X",
    first_name: "System",
    last_name: "Administrator",
    nationality: "US",
    document_verified: true,
    liveness_passed: true,
    face_matched: true,
    ip_address: "127.0.0.1",
    metadata: JSON.stringify({ submitted_at: "2026-03-02T10:00:00.000Z", tier: "admin" }),
  },
  {
    seedId: "kyc-freelancer-3",
    user_id: "freelancer-3",
    status: "completed",
    didit_session_id: "session_fl3_pending",
    didit_session_token: "tok_fl3_pending",
    didit_session_url: "https://verification.didit.me/v/session_fl3_pending",
    didit_workflow_id: "wf_freelance_kyc",
    decision: "review",
    document_type: "DRIVERS_LICENSE",
    document_number: "D9876543C",
    first_name: "Maria",
    last_name: "Santos",
    nationality: "PH",
    document_verified: true,
    liveness_passed: true,
    face_matched: true,
    ip_address: "127.0.0.1",
    metadata: JSON.stringify({ submitted_at: "2026-03-03T11:15:00.000Z", tier: "standard" }),
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

const contracts = [
  {
    seedId: "contract-1",
    project_id: "project-1",
    proposal_id: "proposal-seed-1",
    freelancer_id: "freelancer-1",
    employer_id: "employer-1",
    escrow_address: "0x38391dF905AbF676Fa737780fC408350bA3f29C2",
    base_amount: 2.5,
    rush_fee: 0,
    total_amount: 2.5,
    status: "active",
  },
  {
    seedId: "contract-2",
    project_id: "project-2",
    proposal_id: "proposal-seed-2",
    freelancer_id: "freelancer-1",
    employer_id: "employer-2",
    escrow_address: "0xcE553ee2d1796FE4FB11BC488AB19502C0fa0d1e",
    base_amount: 4.5,
    rush_fee: 0,
    total_amount: 4.5,
    status: "completed",
  },
  {
    seedId: "contract-3",
    project_id: "project-6",
    proposal_id: "proposal-seed-3",
    freelancer_id: "freelancer-1",
    employer_id: "employer-3",
    escrow_address: "0x6a8a2c3F383bCc478868DFbe5757328c63eC33c2",
    base_amount: 5.5,
    rush_fee: 0,
    total_amount: 5.5,
    status: "completed",
  },
  {
    seedId: "contract-4",
    project_id: "project-4",
    proposal_id: "proposal-seed-4",
    freelancer_id: "freelancer-2",
    employer_id: "employer-1",
    escrow_address: "0x65540D1Fd8b70D4667ca512ca0D7cCcC15013736",
    base_amount: 2.0,
    rush_fee: 0,
    total_amount: 2.0,
    status: "completed",
  },
  {
    seedId: "contract-5",
    project_id: "project-5",
    proposal_id: "proposal-seed-5",
    freelancer_id: "freelancer-2",
    employer_id: "employer-2",
    escrow_address: "0x38391dF905AbF676Fa737780fC408350bA3f29C2",
    base_amount: 1.8,
    rush_fee: 0,
    total_amount: 1.8,
    status: "completed",
  },
  {
    seedId: "contract-6",
    project_id: "project-3",
    proposal_id: "proposal-seed-6",
    freelancer_id: "freelancer-2",
    employer_id: "employer-3",
    escrow_address: "0xcE553ee2d1796FE4FB11BC488AB19502C0fa0d1e",
    base_amount: 3.6,
    rush_fee: 0,
    total_amount: 3.6,
    status: "completed",
  },
  {
    seedId: "contract-7",
    project_id: "project-1",
    proposal_id: "proposal-seed-7",
    freelancer_id: "freelancer-3",
    employer_id: "employer-1",
    escrow_address: "0x6a8a2c3F383bCc478868DFbe5757328c63eC33c2",
    base_amount: 2.5,
    rush_fee: 0,
    total_amount: 2.5,
    status: "completed",
  },
  {
    seedId: "contract-8",
    project_id: "project-3",
    proposal_id: "proposal-seed-8",
    freelancer_id: "freelancer-3",
    employer_id: "employer-2",
    escrow_address: "0x65540D1Fd8b70D4667ca512ca0D7cCcC15013736",
    base_amount: 3.6,
    rush_fee: 0,
    total_amount: 3.6,
    status: "completed",
  },
  {
    seedId: "contract-9",
    project_id: "project-6",
    proposal_id: "proposal-seed-9",
    freelancer_id: "freelancer-3",
    employer_id: "employer-3",
    escrow_address: "0x38391dF905AbF676Fa737780fC408350bA3f29C2",
    base_amount: 5.5,
    rush_fee: 0,
    total_amount: 5.5,
    status: "completed",
  },
  {
    seedId: "contract-10",
    project_id: "project-2",
    proposal_id: "proposal-seed-10",
    freelancer_id: "freelancer-1",
    employer_id: "employer-1",
    escrow_address: "0xcE553ee2d1796FE4FB11BC488AB19502C0fa0d1e",
    base_amount: 3.0,
    rush_fee: 0,
    total_amount: 3.0,
    status: "completed",
  },
];

const reviews = [
  // Reviews for Freelancers
  {
    seedId: "review-fl-1-1",
    contract_id: "contract-1",
    project_id: "project-1",
    reviewer_id: "employer-1",
    reviewee_id: "freelancer-1",
    reviewer_role: "employer",
    rating: 5,
    comment: "Exceptional Solidity engineering and smart contract architecture. Flawless DEX frontend integration.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-fl-1-2",
    contract_id: "contract-2",
    project_id: "project-2",
    reviewer_id: "employer-2",
    reviewee_id: "freelancer-1",
    reviewer_role: "employer",
    rating: 5,
    comment: "Thorough security audit for our lending protocol. Identified edge cases in our contracts before launch.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-fl-1-3",
    contract_id: "contract-3",
    project_id: "project-6",
    reviewer_id: "employer-3",
    reviewee_id: "freelancer-1",
    reviewer_role: "employer",
    rating: 5,
    comment: "Delivered our yield aggregator vault contracts ahead of schedule with complete Foundry test suites.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-fl-1-4",
    contract_id: "contract-10",
    project_id: "project-2",
    reviewer_id: "employer-1",
    reviewee_id: "freelancer-1",
    reviewer_role: "employer",
    rating: 5,
    comment: "Second contract with Ana. Top-tier Web3 developer with impeccable work ethic and technical precision.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },

  {
    seedId: "review-fl-2-1",
    contract_id: "contract-4",
    project_id: "project-4",
    reviewer_id: "employer-1",
    reviewee_id: "freelancer-2",
    reviewer_role: "employer",
    rating: 5,
    comment: "Transformed our DAO governance UX into a sleek, accessible product. Highly proficient in design tokens and Figma.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-fl-2-2",
    contract_id: "contract-5",
    project_id: "project-5",
    reviewer_id: "employer-2",
    reviewee_id: "freelancer-2",
    reviewer_role: "employer",
    rating: 5,
    comment: "Crafted an exceptional cross-chain bridge UI. Fast delivery and responsive mobile designs.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-fl-2-3",
    contract_id: "contract-6",
    project_id: "project-3",
    reviewer_id: "employer-3",
    reviewee_id: "freelancer-2",
    reviewer_role: "employer",
    rating: 4.8,
    comment: "Creative Web3 UI/UX designer. Built comprehensive user flows for our multi-chain NFT marketplace.",
    work_quality: 5,
    communication: 4.8,
    professionalism: 4.8,
    would_work_again: true,
  },

  {
    seedId: "review-fl-3-1",
    contract_id: "contract-7",
    project_id: "project-1",
    reviewer_id: "employer-1",
    reviewee_id: "freelancer-3",
    reviewer_role: "employer",
    rating: 5,
    comment: "Outstanding full-stack Web3 developer. Integrated wallet connectors, indexer APIs, and state management smoothly.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-fl-3-2",
    contract_id: "contract-8",
    project_id: "project-3",
    reviewer_id: "employer-2",
    reviewee_id: "freelancer-3",
    reviewer_role: "employer",
    rating: 4.7,
    comment: "Great technical skills and proactive problem solving on our NFT marketplace backend and IPFS pipelines.",
    work_quality: 4.7,
    communication: 4.7,
    professionalism: 4.8,
    would_work_again: true,
  },
  {
    seedId: "review-fl-3-3",
    contract_id: "contract-9",
    project_id: "project-6",
    reviewer_id: "employer-3",
    reviewee_id: "freelancer-3",
    reviewer_role: "employer",
    rating: 4.8,
    comment: "Built our DeFi monitoring dashboard with high-throughput WebSockets. Reliable and communicative.",
    work_quality: 4.8,
    communication: 4.8,
    professionalism: 4.9,
    would_work_again: true,
  },

  // Reviews for Employers
  {
    seedId: "review-emp-1-1",
    contract_id: "contract-1",
    project_id: "project-1",
    reviewer_id: "freelancer-1",
    reviewee_id: "employer-1",
    reviewer_role: "freelancer",
    rating: 5,
    comment: "Sarah was a pleasure to work with. Clear requirements, prompt communication, and instantaneous escrow release.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-emp-1-2",
    contract_id: "contract-4",
    project_id: "project-4",
    reviewer_id: "freelancer-2",
    reviewee_id: "employer-1",
    reviewer_role: "freelancer",
    rating: 5,
    comment: "TechCorp provides crystal clear design specs and great design review feedback. Highly recommended employer!",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-emp-1-3",
    contract_id: "contract-7",
    project_id: "project-1",
    reviewer_id: "freelancer-3",
    reviewee_id: "employer-1",
    reviewer_role: "freelancer",
    rating: 5,
    comment: "Excellent employer who values engineering best practices and respects developer deadlines.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },

  {
    seedId: "review-emp-2-1",
    contract_id: "contract-2",
    project_id: "project-2",
    reviewer_id: "freelancer-1",
    reviewee_id: "employer-2",
    reviewer_role: "freelancer",
    rating: 5,
    comment: "Mike and the Blockchain.io team are top-tier collaborators. Very technical and decisive.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-emp-2-2",
    contract_id: "contract-5",
    project_id: "project-5",
    reviewer_id: "freelancer-2",
    reviewee_id: "employer-2",
    reviewer_role: "freelancer",
    rating: 5,
    comment: "Great experience working on bridge UI. Milestones were approved immediately upon submission.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-emp-2-3",
    contract_id: "contract-8",
    project_id: "project-3",
    reviewer_id: "freelancer-3",
    reviewee_id: "employer-2",
    reviewer_role: "freelancer",
    rating: 4.8,
    comment: "Collaborative and transparent employer. Look forward to working together on future releases.",
    work_quality: 5,
    communication: 4.8,
    professionalism: 5,
    would_work_again: true,
  },

  {
    seedId: "review-emp-3-1",
    contract_id: "contract-3",
    project_id: "project-6",
    reviewer_id: "freelancer-1",
    reviewee_id: "employer-3",
    reviewer_role: "freelancer",
    rating: 5,
    comment: "Alex provided comprehensive spec docs for the yield aggregator. Prompt payment upon completion.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-emp-3-2",
    contract_id: "contract-6",
    project_id: "project-3",
    reviewer_id: "freelancer-2",
    reviewee_id: "employer-3",
    reviewer_role: "freelancer",
    rating: 4.9,
    comment: "Smooth communication and fast milestone funding. Great Web3 employer.",
    work_quality: 5,
    communication: 4.9,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-emp-3-3",
    contract_id: "contract-9",
    project_id: "project-6",
    reviewer_id: "freelancer-3",
    reviewee_id: "employer-3",
    reviewer_role: "freelancer",
    rating: 4.8,
    comment: "Clear expectations and rapid answers to technical questions. Recommended!",
    work_quality: 4.8,
    communication: 4.8,
    professionalism: 5,
    would_work_again: true,
  },
];

const disputes = [
  {
    seedId: "dispute-1",
    contract_id: "contract-1",
    milestone_id: "m2",
    initiator_id: "employer-1",
    reason: "Deliverable did not pass automated security test suite and smart contract integration tests.",
    evidence: JSON.stringify([
      {
        id: "ev-1",
        submitter_id: "employer-1",
        type: "text",
        content: "Automated vulnerability scan revealed missing access control checks in swap callback.",
        submitted_at: "2026-03-01T10:00:00.000Z",
      },
      {
        id: "ev-1-file",
        submitter_id: "employer-1",
        type: "file",
        content: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1200",
        submitted_at: "2026-03-01T10:05:00.000Z",
      },
    ]),
    status: "under_review",
    resolution: null,
  },
  {
    seedId: "dispute-2",
    contract_id: "contract-4",
    milestone_id: "m1",
    initiator_id: "employer-1",
    reason: "Design tokens and Figma asset export delays affected sprint release schedule.",
    evidence: JSON.stringify([
      {
        id: "ev-2",
        submitter_id: "employer-1",
        type: "text",
        content: "Detailed audit of delayed Figma design token delivery schedule.",
        submitted_at: "2026-02-15T14:30:00.000Z",
      },
    ]),
    status: "resolved",
    resolution: JSON.stringify({
      decision: "split",
      reasoning: "Both parties agreed to an adjusted delivery scope and equal escrow split.",
      resolved_by: "admin-1",
      resolved_at: "2026-02-20T16:00:00.000Z",
    }),
  },
  {
    seedId: "dispute-3",
    contract_id: "contract-1",
    milestone_id: "m1",
    initiator_id: "employer-1",
    reason: "Wireframes and design assets were incomplete and missed the initial milestone deadline.",
    evidence: JSON.stringify([
      {
        id: "ev-3-text",
        submitter_id: "employer-1",
        type: "text",
        content: "Missing mobile responsive mockups for swap modal and liquidity charts.",
        submitted_at: "2026-03-05T09:00:00.000Z",
      },
      {
        id: "ev-3-file",
        submitter_id: "employer-1",
        type: "file",
        content: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200",
        submitted_at: "2026-03-05T09:15:00.000Z",
      },
    ]),
    status: "open",
    resolution: null,
  },
  {
    seedId: "dispute-4",
    contract_id: "contract-5",
    milestone_id: "m1",
    initiator_id: "employer-2",
    reason: "Design tokens and Figma asset export delays affected sprint release schedule.",
    evidence: JSON.stringify([
      {
        id: "ev-4-file",
        submitter_id: "employer-2",
        type: "file",
        content: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200",
        submitted_at: "2026-03-06T11:00:00.000Z",
      },
    ]),
    status: "open",
    resolution: null,
  },
];

const disputeEvidence = [
  {
    seedId: "ev-1",
    dispute_id: "dispute-1",
    submitted_by: "employer-1",
    evidence_type: "text",
    description: "Automated vulnerability scan revealed missing access control checks in swap callback.",
    verified_by: null,
    verified_at: null,
  },
  {
    seedId: "ev-1-file",
    dispute_id: "dispute-1",
    submitted_by: "employer-1",
    evidence_type: "file",
    file_url: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1200",
    description: "Security audit findings report with vulnerability proof of concept.",
    verified_by: null,
    verified_at: null,
  },
  {
    seedId: "ev-2",
    dispute_id: "dispute-2",
    submitted_by: "employer-1",
    evidence_type: "text",
    description: "Detailed audit of delayed Figma design token delivery schedule.",
    verified_by: "admin-1",
    verified_at: "2026-02-18T12:00:00.000Z",
  },
  {
    seedId: "ev-3-file",
    dispute_id: "dispute-3",
    submitted_by: "employer-1",
    evidence_type: "file",
    file_url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200",
    description: "Audit sheet of missing responsive design components.",
    verified_by: null,
    verified_at: null,
  },
  {
    seedId: "ev-4-file",
    dispute_id: "dispute-4",
    submitted_by: "employer-2",
    evidence_type: "file",
    file_url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200",
    description: "Sprint delay impact audit findings.",
    verified_by: null,
    verified_at: null,
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
        try {
          await db.updateDocument(DATABASE_ID, collectionId, documentId, data);
          created++;
        } catch {
          skipped++;
        }
      } else {
        console.error(`      ✗ Failed to create ${documentId}:`, e?.message || e);
      }
    }
  }

  console.log(`      ✓ Created: ${created}, Skipped: ${skipped}`);
}

const DEMO_PASSWORD = process.env['DEMO_USER_PASSWORD'] || 'FreelanceXchain2026!';

/**
 * Ensures Appwrite Auth accounts exist with verified email and known demo password
 * so that users can immediately log in through the Next.js login page during demos.
 */
async function seedAuthUsers(usersList: Array<{ seedId: string; email: string; name: string }>): Promise<void> {
  const usersService = new Users(client);
  console.log(`    🔐 Ensuring Appwrite Auth accounts for ${usersList.length} demo users (Password: ${DEMO_PASSWORD})...`);
  for (const u of usersList) {
    try {
      await usersService.create(u.seedId, u.email, undefined, DEMO_PASSWORD, u.name);
      await usersService.updateEmailVerification(u.seedId, true);
    } catch (e: any) {
      if (e?.code === 409) {
        // User already exists; update password and email verification using their actual ID
        try {
          const list = await usersService.list([Query.equal('email', u.email)]);
          const existing = list.users[0];
          const targetId = existing ? existing.$id : u.seedId;
          await usersService.updatePassword(targetId, DEMO_PASSWORD);
          await usersService.updateEmailVerification(targetId, true);
        } catch (updateErr: any) {
          console.warn(`      ⚠️ Could not update auth user for ${u.email}:`, updateErr?.message || updateErr);
        }
      } else {
        console.warn(`      ⚠️ Could not create auth user for ${u.email}:`, e?.message || e);
      }
    }
  }
  console.log(`      ✓ Demo Auth accounts ready.`);
}

/**
 * Wipes all documents inside a collection.
 * Using pagination to reliably delete in batches of 100.
 */
async function wipeCollectionDocuments(collectionId: string, name: string): Promise<void> {
  let totalDeleted = 0;
  while (true) {
    try {
      const response = await db.listDocuments(DATABASE_ID, collectionId, [Query.limit(100)]);
      if (response.documents.length === 0) break;
      for (const doc of response.documents) {
        try {
          await db.deleteDocument(DATABASE_ID, collectionId, doc.$id);
          totalDeleted++;
        } catch (delErr: any) {
          // ignore individual delete failure
        }
      }
    } catch (listErr: any) {
      if (listErr?.code === 404) break;
      console.warn(`    ⚠️ Could not list documents in "${collectionId}":`, listErr?.message || listErr);
      break;
    }
  }
  if (totalDeleted > 0) {
    console.log(`    ✓ Wiped ${totalDeleted} documents from "${name}" (${collectionId})`);
  }
}

/**
 * Wipes all files from managed storage buckets.
 */
async function wipeStorageBuckets(): Promise<void> {
  const storage = new Storage(client);
  for (const b of BUCKETS_TO_SETUP) {
    let totalDeleted = 0;
    while (true) {
      try {
        const response = await storage.listFiles(b.bucketId, [Query.limit(100)]);
        if (response.files.length === 0) break;
        for (const file of response.files) {
          try {
            await storage.deleteFile(b.bucketId, file.$id);
            totalDeleted++;
          } catch {
            // ignore
          }
        }
      } catch {
        break;
      }
    }
    if (totalDeleted > 0) {
      console.log(`    ✓ Wiped ${totalDeleted} uploaded files from bucket "${b.bucketId}"`);
    }
  }
}

/**
 * Wipes all Appwrite Auth accounts.
 */
async function wipeAuthUsers(): Promise<void> {
  const usersService = new Users(client);
  let totalDeleted = 0;
  while (true) {
    try {
      const response = await usersService.list([Query.limit(100)]);
      if (response.users.length === 0) break;
      for (const u of response.users) {
        try {
          await usersService.delete(u.$id);
          totalDeleted++;
        } catch {
          // ignore
        }
      }
    } catch {
      break;
    }
  }
  if (totalDeleted > 0) {
    console.log(`    ✓ Wiped ${totalDeleted} Appwrite Auth users`);
  }
}

async function listAllDocuments(collectionId: string): Promise<Record<string, any>[]> {
  const all: Record<string, any>[] = [];
  let cursor: string | undefined;
  for (;;) {
    const queries = [Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])];
    const page = await db.listDocuments(DATABASE_ID, collectionId, queries);
    all.push(...page.documents);
    if (page.documents.length < 100) return all;
    cursor = page.documents[page.documents.length - 1]!.$id;
  }
}

/**
 * Adds catalog categories and skills that the database does not have yet.
 * Never updates or deletes, so admin edits to the catalog are kept. Matching
 * is by name, so a category an admin already created is reused.
 */
async function addMissingSkillCatalog(): Promise<void> {
  const nameKey = (name: string) => name.trim().toLowerCase();
  const existingCategories = await listAllDocuments("skill_categories");
  const categoryIdBySeedId = new Map<string, string>();
  let createdCategories = 0;

  for (const { seedId, ...data } of skillCategories) {
    const match = existingCategories.find((doc) => doc.$id === seedId || nameKey(doc.name) === nameKey(data.name));
    if (match) {
      categoryIdBySeedId.set(seedId, match.$id);
      continue;
    }
    await db.createDocument(DATABASE_ID, "skill_categories", seedId, data);
    categoryIdBySeedId.set(seedId, seedId);
    createdCategories++;
    console.log(`      + Category "${data.name}"`);
  }

  const existingSkillNames = new Set((await listAllDocuments("skills")).map((doc) => nameKey(doc.name)));
  const existingSkillIds = new Set<string>();
  let createdSkills = 0;
  for (const { seedId, category_id, ...data } of skills) {
    if (existingSkillNames.has(nameKey(data.name)) || existingSkillIds.has(seedId)) continue;
    const categoryId = categoryIdBySeedId.get(category_id);
    if (!categoryId) continue;
    try {
      await db.createDocument(DATABASE_ID, "skills", seedId, { ...data, category_id: categoryId });
      createdSkills++;
      console.log(`      + Skill "${data.name}"`);
    } catch (e: any) {
      if (e?.code !== 409) throw e;
      existingSkillIds.add(seedId);
      console.log(`      ⊘ Skipped "${data.name}": id ${seedId} is already used`);
    }
  }

  console.log(`    ✓ Added ${createdCategories} categories and ${createdSkills} skills`);
}

async function seedCleanFoundation(): Promise<void> {
  await seedCollection("skill_categories", skillCategories, "Skill Categories");
  await seedCollection("skills", skills, "Skills");
  await seedAuthUsers(adminUsers);
  await seedCollection("users", adminUsers, "Default Administrator");
}

async function seedAllData(): Promise<void> {
  await seedCollection("skill_categories", skillCategories, "Skill Categories");
  await seedCollection("skills", skills, "Skills");
  const allUsers = [...adminUsers, ...employerUsers, ...freelancerUsers];
  await seedAuthUsers(allUsers);
  await seedCollection("users", allUsers, "Users");
  await seedCollection("freelancer_profiles", freelancerProfiles, "Freelancer Profiles");
  await seedCollection("employer_profiles", employerProfiles, "Employer Profiles");
  await seedCollection("kyc_verifications", kycVerifications, "KYC Verifications");
  await seedCollection("portfolio_items", portfolioItems, "Portfolio Items");
  await seedCollection("projects", projects, "Projects");
  await seedCollection("contracts", contracts, "Contracts");
  await seedCollection("reviews", reviews, "Reviews");
  await seedCollection("disputes", disputes, "Disputes");
  await seedCollection("dispute_evidence", disputeEvidence, "Dispute Evidence");
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const WITH_RESET = args.includes("--reset") || args.includes("-r") || args.includes("--wipe");
  const WIPE_ONLY = args.includes("--wipe-only");
  const WIPE_AUTH = args.includes("--wipe-auth");
  const WITH_SEED = (args.includes("--seed") || args.includes("-s")) && !WIPE_ONLY;
  const ADD_MISSING_SKILLS = args.includes("--add-missing-skills");
  const SCHEMA_ONLY = args.includes("--schema-only");
  const listArg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3).split(",").map((v) => v.trim()).filter(Boolean);
  const ONLY_COLLECTIONS = listArg("only");
  const ONLY_BUCKETS = listArg("buckets");

  if (SCHEMA_ONLY && (WITH_RESET || WIPE_ONLY || WIPE_AUTH || WITH_SEED)) {
    console.error("--schema-only cannot be combined with --reset/--wipe/--wipe-only/--wipe-auth/--seed");
    process.exit(1);
  }
  const unknownCollections = (ONLY_COLLECTIONS ?? []).filter((id) => !COLLECTIONS.some((c) => c.id === id));
  const unknownBuckets = (ONLY_BUCKETS ?? []).filter((id) => !BUCKETS_TO_SETUP.some((b) => b.bucketId === id));
  if (unknownCollections.length > 0 || unknownBuckets.length > 0) {
    console.error(`Unknown collection(s): ${unknownCollections.join(", ") || "none"}; unknown bucket(s): ${unknownBuckets.join(", ") || "none"}`);
    process.exit(1);
  }
  const collectionsToSetup = ONLY_COLLECTIONS ? COLLECTIONS.filter((c) => ONLY_COLLECTIONS.includes(c.id)) : COLLECTIONS;
  const bucketsToSetup = ONLY_BUCKETS ? BUCKETS_TO_SETUP.filter((b) => ONLY_BUCKETS.includes(b.bucketId)) : BUCKETS_TO_SETUP;

  console.log("=== FreelanceXchain — Appwrite Setup, Reset & Restore ===\n");
  console.log(`Endpoint:   ${ENDPOINT}`);
  console.log(`Project:    ${PROJECT_ID}`);
  console.log(`Database:   ${DATABASE_ID}`);
  console.log(`Mode:       ${SCHEMA_ONLY ? "SCHEMA ONLY (additive, no seeding)" : ADD_MISSING_SKILLS ? "ADD MISSING SKILLS" : WITH_RESET ? (WIPE_ONLY ? "WIPE ALL (Clean Slate)" : WITH_SEED ? "RESET + SEED DEMO DATA" : "RESET TO CLEAN DEFAULT") : WITH_SEED ? "SETUP + SEED" : "SETUP ONLY"}`);
  if (WITH_SEED) {
    console.log(`Demo Creds: [email: any demo email above, password: ${DEMO_PASSWORD}]`);
  }
  console.log("");

  if (ADD_MISSING_SKILLS) {
    console.log(`Adding catalog categories and skills that are missing (nothing is updated or removed)...`);
    await addMissingSkillCatalog();
    return;
  }

  await ensureDatabase();

  if (WITH_RESET) {
    console.log(`\n🧹 Step 0: Wiping existing documents from all ${COLLECTIONS.length} collections...`);
    for (const colDef of COLLECTIONS) {
      await wipeCollectionDocuments(colDef.id, colDef.name);
    }
    console.log(`🧹 Step 0b: Wiping uploaded files from storage buckets...`);
    await wipeStorageBuckets();

    if (WIPE_AUTH) {
      console.log(`🧹 Step 0c: Wiping Appwrite Auth accounts...`);
      await wipeAuthUsers();
    }
  }

  console.log(`\n1. Creating/Verifying ${collectionsToSetup.length} collections, attributes, and indexes...\n`);
  for (const colDef of collectionsToSetup) {
    console.log(`[${colDef.id}]`);
    await createCollection(colDef);
    await createAttributes(colDef);
    await createIndexes(colDef);
    console.log("");
  }

  console.log(`\n2. Creating/Verifying ${bucketsToSetup.length} storage buckets...\n`);
  await setupStorage(bucketsToSetup);

  if (SCHEMA_ONLY) {
    console.log(`\n3. Schema only: no seed data inserted or updated.`);
  } else if (!WIPE_ONLY) {
    if (WITH_SEED) {
      console.log(`\n3. Seeding full demo sample data (Users, Profiles, Projects, KYC)...`);
      await seedAllData();
    } else {
      console.log(`\n3. Seeding clean foundational data (Skill Categories, Skills & Default Admin)...`);
      await seedCleanFoundation();
    }
  } else {
    console.log(`\n3. Wiped completely clean. No seed data inserted.`);
  }

  console.log(`\n=== Setup complete! Everything is ready and aligned. ===\n`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});

