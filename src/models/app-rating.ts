/**
 * "Rate the app" — feedback about FreelanceXchain itself.
 *
 * Deliberately separate from `Review` in ./review.ts, which is a freelancer
 * rating an employer (or the reverse) on a completed contract. This one has no
 * counterparty: it is a user's opinion of the platform, collected at moments
 * where they have just seen the product work.
 */

/**
 * The moment that prompted the rating.
 *
 * `manual` means the user opened the form themselves from the account menu,
 * which is the one source that bypasses the cooldown — someone who goes
 * looking for the form is never told to come back later.
 */
export const APP_RATING_SOURCES = [
  'contract_completed',
  'milestone_released',
  'proposal_submitted',
  'proposal_accepted',
  'ai_recommendations',
  'ai_proposal_draft',
  'ai_skill_extraction',
  'manual',
] as const;

export type AppRatingSource = typeof APP_RATING_SOURCES[number];

export function isAppRatingSource(value: unknown): value is AppRatingSource {
  return typeof value === 'string' && (APP_RATING_SOURCES as readonly string[]).includes(value);
}

/** Lowest and highest star a submission may carry. */
export const MIN_APP_RATING = 1;
export const MAX_APP_RATING = 5;

/** How long after a rating the same user is left alone. */
export const APP_RATING_COOLDOWN_DAYS = 30;

export type AppRating = {
  id: string;
  userId: string;
  userRole: string;
  rating: number;
  /** Always optional — a star on its own is a complete submission. */
  comment?: string | undefined;
  source: AppRatingSource;
  contextId?: string | undefined;
  appVersion?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export type AppRatingEntity = {
  id: string;
  user_id: string;
  user_role: string;
  rating: number;
  comment?: string | undefined;
  source: string;
  context_id?: string | undefined;
  app_version?: string | undefined;
  created_at: string;
  updated_at: string;
};

/** A row as the admin table shows it: the rating plus who submitted it. */
export type AdminAppRating = AppRating & {
  userName: string;
  userEmail: string;
};

export type AppRatingSourceStat = {
  source: AppRatingSource;
  total: number;
  average: number;
};

export type AppRatingSummary = {
  total: number;
  average: number;
  /** Count per star value, keyed '1'..'5'. */
  histogram: Record<string, number>;
  bySource: AppRatingSourceStat[];
  /** Submissions in the last 30 days. */
  recentTotal: number;
  /** Share of submissions rated 4 or 5, as a percentage 0-100. */
  positivePercentage: number;
};

export type SubmitAppRatingInput = {
  userId: string;
  userRole: string;
  rating: number;
  comment?: string | undefined;
  source: AppRatingSource;
  contextId?: string | undefined;
  appVersion?: string | undefined;
};

export type AppRatingEligibility = {
  shouldPrompt: boolean;
  /** Present when `shouldPrompt` is false, for logging and tests. */
  reason?: string | undefined;
  /** ISO date the cooldown lifts, when one is in effect. */
  nextEligibleAt?: string | undefined;
};
