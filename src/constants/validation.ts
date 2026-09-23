/**
 * Validation Constants
 * Centralizes validation-related magic values
 */

/**
 * File upload constraints
 */
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;        // 100 MB
export const MAX_TOTAL_ATTACHMENT_SIZE_BYTES = 200 * 1024 * 1024;  // 200 MB
export const MAX_FILES_PER_UPLOAD = 20;
export const MAX_FILENAME_LENGTH = 255;

/**
 * Allowed file MIME types
 */
export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/**
 * Password constraints
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
export const PASSWORD_HISTORY_ERROR_PATTERNS = [
  'recent',
  'history',
  'previous',
  'same',
  'current',
] as const;

/**
 * Proposal constraints
 */
export const MIN_PROPOSED_RATE = 1;
export const MAX_PROPOSED_RATE = 1_000_000;
export const MAX_ESTIMATED_DURATION_DAYS = 3650;
export const MAX_REVISIONS_DEFAULT = 5;

/**
 * Budget constraints
 */
export const MIN_MILESTONE_AMOUNT = 0.0001;
export const MAX_CONTRACT_AMOUNT = 1_000_000;
export const BUDGET_TOLERANCE = 0.01;

/**
 * Rush fee constraints
 */
export const MIN_RUSH_FEE_PERCENTAGE = 0.01;
export const MAX_RUSH_FEE_PERCENTAGE = 100;

/**
 * Search pagination
 */
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 1000;

/**
 * Regex patterns for validation
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Character limits
 */
export const MAX_PROJECT_TITLE_LENGTH = 200;
export const MAX_PROJECT_DESCRIPTION_LENGTH = 10000;
export const MAX_PROPOSAL_COVER_LETTER_LENGTH = 5000;
