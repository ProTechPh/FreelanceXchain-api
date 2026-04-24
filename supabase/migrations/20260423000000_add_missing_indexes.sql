-- Add missing indexes for commonly queried columns
-- These indexes address performance gaps identified in the codebase audit

-- Projects: tags array for filtering (GIN index)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_tags ON projects USING GIN (tags);

-- Projects: updated_at for sorting and timestamp-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_updated_at ON projects (updated_at DESC);

-- Contracts: proposal_id used in findOne lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contracts_proposal_id ON contracts (proposal_id);

-- Payments: milestone_id for payment-by-milestone lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_milestone_id ON payments (milestone_id);

-- Messages: composite index for unread message count queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_receiver_unread ON messages (receiver_id, is_read) WHERE is_read = false;

-- Reviews: reviewer_id index (reviewee_id already indexed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reviews_reviewer_id ON reviews (reviewer_id);