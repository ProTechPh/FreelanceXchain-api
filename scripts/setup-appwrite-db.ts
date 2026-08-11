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

import { Client, Databases, ID, Permission, Role, Query } from 'node-appwrite';

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

const COLLECTIONS = [
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
  },
  {
    id: 'skill_categories',
    name: 'Skill Categories',
    attributes: [
      { name: 'name', type: 'string', size: 100, required: true },
      { name: 'description', type: 'string', size: 1000, required: false, default: '' },
      { name: 'is_active', type: 'boolean', required: false, default: true },
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
  },
  {
    id: 'projects',
    name: 'Projects',
    attributes: [
      { name: 'employer_id', type: 'string', size: 36, required: true },
      { name: 'title', type: 'string', size: 255, required: true },
      { name: 'description', type: 'string', size: 50000, required: false, default: '' },
      { name: 'required_skills', type: 'string', size: 50000, required: false, default: '[]' },
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
      { name: 'rejected_by', type: 'string', size: 36, required: false },
      { name: 'rejection_reason', type: 'string', size: 5000, required: false },
      { name: 'transaction_hash', type: 'string', size: 66, required: false },
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
  },
  {
    id: 'blockchain_escrows',
    name: 'Blockchain Escrows',
    attributes: [
      { name: 'contract_id', type: 'string', size: 255, required: true },
      { name: 'employer_address', type: 'string', size: 42, required: true },
      { name: 'freelancer_address', type: 'string', size: 42, required: true },
      { name: 'total_amount', type: 'string', size: 50, required: true },
      { name: 'balance', type: 'string', size: 50, required: false, default: '0' },
      { name: 'deployed_at', type: 'integer', required: true },
      { name: 'deployment_tx_hash', type: 'string', size: 66, required: true },
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

async function createCollection(colDef: typeof COLLECTIONS[0]): Promise<void> {
  try {
    await db.getCollection(DATABASE_ID, colDef.id);
    console.log(`  ✓ Collection "${colDef.name}" already exists`);
  } catch {
    console.log(`  Creating collection "${colDef.name}"...`);
    await db.createCollection(
      DATABASE_ID,
      colDef.id,
      colDef.name,
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    );
    console.log(`  ✓ Collection "${colDef.name}" created`);
  }
}

async function createIndexes(): Promise<void> {
  for (const index of INDEXES) {
    try {
      await db.createIndex(
        DATABASE_ID,
        index.collectionId,
        index.key,
        index.type as 'key' | 'fulltext',
        index.attributes,
        index.indexes
      );
      console.log(`  ✓ Index "${index.key}" created (${index.attributes.join(', ')})`);
    } catch (e: any) {
      if (e?.code === 409) {
        console.log(`  ⊘ Index "${index.key}" already exists`);
      } else {
        console.error(`  ✗ Failed to create index "${index.key}":`, e?.message || e);
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

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== FreelanceXchain — Appwrite Database Setup ===\n');
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Project:  ${PROJECT_ID}`);
  console.log(`Database: ${DATABASE_ID}\n`);

  await ensureDatabase();

  console.log(`\nCreating ${COLLECTIONS.length} collections...\n`);

  for (const colDef of COLLECTIONS) {
    console.log(`[${colDef.id}]`);
    await createCollection(colDef);
    await createAttributes(colDef);
    console.log('');
  }

  console.log(`\nCreating ${INDEXES.length} indexes...\n`);
  await createIndexes();

  console.log('\n=== Setup complete! ===');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
