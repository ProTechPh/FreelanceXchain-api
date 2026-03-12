# Migration Guide: New Features Implementation

This guide provides step-by-step instructions for deploying the new features to your FreelanceXchain platform.

## Prerequisites

- Access to Supabase dashboard
- Database admin privileges
- Node.js 20+ and pnpm installed
- Existing FreelanceXchain deployment

---

## Step 1: Database Migration

### 1.1 Create New Tables

Execute the following SQL in your Supabase SQL Editor:

```sql
-- 1. Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_message_preview TEXT,
  unread_count_1 INTEGER DEFAULT 0,
  unread_count_2 INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Ensure unique conversation pairs
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_participants 
ON conversations (LEAST(participant1_id, participant2_id), GREATEST(participant1_id, participant2_id));

-- 2. Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  attachments JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  work_quality INTEGER CHECK (work_quality >= 1 AND work_quality <= 5),
  communication INTEGER CHECK (communication >= 1 AND communication <= 5),
  professionalism INTEGER CHECK (professionalism >= 1 AND professionalism <= 5),
  would_work_again BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contract_id, reviewer_id)
);

-- 4. Favorites table
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('project', 'freelancer')),
  target_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, target_type, target_id)
);

-- 5. Portfolio items table
CREATE TABLE IF NOT EXISTS portfolio_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  freelancer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  project_url TEXT,
  images JSONB NOT NULL,
  skills TEXT[],
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. Email preferences table
CREATE TABLE IF NOT EXISTS email_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  proposal_received BOOLEAN DEFAULT TRUE,
  proposal_accepted BOOLEAN DEFAULT TRUE,
  milestone_updates BOOLEAN DEFAULT TRUE,
  payment_notifications BOOLEAN DEFAULT TRUE,
  dispute_notifications BOOLEAN DEFAULT TRUE,
  marketing_emails BOOLEAN DEFAULT FALSE,
  weekly_digest BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 7. Saved searches table
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  search_type VARCHAR(20) NOT NULL CHECK (search_type IN ('project', 'freelancer')),
  filters JSONB NOT NULL,
  notify_on_new BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 8. Transactions table (if not exists)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  milestone_id UUID,
  from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount DECIMAL(20, 2) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  transaction_hash TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 1.2 Create Indexes for Performance

```sql
-- Conversations indexes
CREATE INDEX IF NOT EXISTS idx_conversations_participant1 ON conversations(participant1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_participant2 ON conversations(participant2_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(receiver_id, is_read) WHERE is_read = FALSE;

-- Reviews indexes
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project_id);
CREATE INDEX IF NOT EXISTS idx_reviews_contract ON reviews(contract_id);

-- Favorites indexes
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id, target_type);
CREATE INDEX IF NOT EXISTS idx_favorites_target ON favorites(target_type, target_id);

-- Portfolio indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_freelancer ON portfolio_items(freelancer_id, created_at DESC);

-- Saved searches indexes
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id, search_type);

-- Transactions indexes
CREATE INDEX IF NOT EXISTS idx_transactions_contract ON transactions(contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_from_user ON transactions(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_to_user ON transactions(to_user_id, created_at DESC);
```

### 1.3 Set Up Row Level Security (RLS)

```sql
-- Enable RLS on all new tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Conversations policies
CREATE POLICY "Users can view their own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = participant1_id OR auth.uid() = participant2_id);

CREATE POLICY "Users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = participant1_id OR auth.uid() = participant2_id);

-- Messages policies
CREATE POLICY "Users can view messages in their conversations"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND (conversations.participant1_id = auth.uid() OR conversations.participant2_id = auth.uid())
    )
  );

CREATE POLICY "Users can send messages"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Reviews policies
CREATE POLICY "Anyone can view reviews"
  ON reviews FOR SELECT
  USING (true);

CREATE POLICY "Users can create reviews for their contracts"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

-- Favorites policies
CREATE POLICY "Users can manage their own favorites"
  ON favorites FOR ALL
  USING (auth.uid() = user_id);

-- Portfolio policies
CREATE POLICY "Anyone can view portfolio items"
  ON portfolio_items FOR SELECT
  USING (true);

CREATE POLICY "Freelancers can manage their own portfolio"
  ON portfolio_items FOR ALL
  USING (auth.uid() = freelancer_id);

-- Email preferences policies
CREATE POLICY "Users can manage their own email preferences"
  ON email_preferences FOR ALL
  USING (auth.uid() = user_id);

-- Saved searches policies
CREATE POLICY "Users can manage their own saved searches"
  ON saved_searches FOR ALL
  USING (auth.uid() = user_id);

-- Transactions policies
CREATE POLICY "Users can view their own transactions"
  ON transactions FOR SELECT
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
```

---

## Step 2: Storage Buckets

### 2.1 Create Storage Buckets

In Supabase Dashboard → Storage:

1. Create `portfolio-images` bucket
   - Public: Yes
   - File size limit: 10MB
   - Allowed MIME types: image/jpeg, image/png, image/webp

2. Verify `proposal-attachments` bucket exists (should already exist)

3. Verify `dispute-evidence` bucket exists (should already exist)

### 2.2 Set Storage Policies

```sql
-- Portfolio images policies
CREATE POLICY "Anyone can view portfolio images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'portfolio-images');

CREATE POLICY "Authenticated users can upload portfolio images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'portfolio-images' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can delete their own portfolio images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'portfolio-images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

---

## Step 3: Application Deployment

### 3.1 Install Dependencies

```bash
cd /path/to/freelancexchain-api
pnpm install
```

### 3.2 Build Application

```bash
pnpm run build
```

### 3.3 Run Tests

```bash
pnpm run test
```

### 3.4 Deploy

```bash
# For production
pnpm run prod

# Or with PM2
pm2 restart freelancexchain-api

# Or with Docker
docker build -t freelancexchain-api:latest .
docker-compose up -d
```

---

## Step 4: Verification

### 4.1 Health Check

```bash
curl https://your-api-domain.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.45,
  "services": {
    "database": "ok",
    "api": "ok"
  }
}
```

### 4.2 Test New Endpoints

```bash
# Get CSRF token
curl -X GET https://your-api-domain.com/api/auth/csrf-token \
  -H "Cookie: your-session-cookie"

# Test messaging
curl -X POST https://your-api-domain.com/api/messages/send \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  -d '{"receiverId":"uuid","content":"Hello"}'

# Test favorites
curl -X POST https://your-api-domain.com/api/favorites \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  -d '{"targetType":"project","targetId":"uuid"}'

# Test analytics
curl -X GET https://your-api-domain.com/api/analytics/platform \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Step 5: Data Migration (Optional)

### 5.1 Create Default Email Preferences for Existing Users

```sql
INSERT INTO email_preferences (user_id)
SELECT id FROM users
WHERE id NOT IN (SELECT user_id FROM email_preferences);
```

### 5.2 Migrate Existing Transaction Data

If you have transaction data in other tables, migrate it:

```sql
-- Example: Migrate from payment logs
INSERT INTO transactions (contract_id, from_user_id, to_user_id, amount, type, status, transaction_hash, created_at)
SELECT 
  contract_id,
  employer_id as from_user_id,
  freelancer_id as to_user_id,
  amount,
  'milestone_payment' as type,
  'completed' as status,
  blockchain_tx_hash as transaction_hash,
  created_at
FROM milestone_payments
WHERE NOT EXISTS (
  SELECT 1 FROM transactions t 
  WHERE t.contract_id = milestone_payments.contract_id
);
```

---

## Step 6: Monitoring Setup

### 6.1 Configure Health Check Monitoring

Add to your monitoring system (e.g., Uptime Robot, Pingdom):

- Endpoint: `https://your-api-domain.com/api/health`
- Interval: 5 minutes
- Expected status: 200
- Alert on: status !== 200

### 6.2 Set Up Log Aggregation

Ensure logs are being collected for:
- Message sending/receiving
- Review submissions
- Admin actions
- Transaction records
- File uploads/deletions

---

## Step 7: Documentation Update

### 7.1 Update API Documentation

```bash
pnpm run openapi:generate
```

### 7.2 Verify Swagger UI

Visit: `https://your-api-domain.com/api-docs`

Verify all new endpoints are documented.

---

## Rollback Plan

If issues occur, rollback steps:

### 1. Revert Application

```bash
git revert HEAD
pnpm run build
pm2 restart freelancexchain-api
```

### 2. Drop New Tables (if needed)

```sql
DROP TABLE IF EXISTS saved_searches CASCADE;
DROP TABLE IF EXISTS email_preferences CASCADE;
DROP TABLE IF EXISTS portfolio_items CASCADE;
DROP TABLE IF EXISTS favorites CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
```

### 3. Remove Storage Buckets

In Supabase Dashboard → Storage, delete:
- `portfolio-images`

---

## Troubleshooting

### Issue: "Table does not exist"

**Solution**: Ensure all SQL migration scripts ran successfully. Check Supabase logs.

### Issue: "Permission denied for table"

**Solution**: Verify RLS policies are correctly set up. Check user authentication.

### Issue: "File upload fails"

**Solution**: 
1. Verify storage buckets exist
2. Check storage policies
3. Verify file size limits
4. Check MIME type restrictions

### Issue: "Health check fails"

**Solution**:
1. Check database connectivity
2. Verify Supabase credentials
3. Check network/firewall rules

---

## Post-Deployment Checklist

- [ ] All database tables created
- [ ] All indexes created
- [ ] RLS policies enabled and tested
- [ ] Storage buckets created
- [ ] Storage policies set
- [ ] Application deployed
- [ ] Health checks passing
- [ ] API documentation updated
- [ ] Monitoring configured
- [ ] Team notified of new features
- [ ] User documentation updated

---

## Support

For issues or questions:
1. Check application logs
2. Review Supabase logs
3. Consult NEW_FEATURES_IMPLEMENTATION.md
4. Contact development team

---

## Next Steps

After successful deployment:

1. **User Communication**: Announce new features to users
2. **Training**: Train support team on new features
3. **Monitoring**: Watch metrics for first 48 hours
4. **Feedback**: Collect user feedback
5. **Iteration**: Plan improvements based on usage data

---

## Estimated Timeline

- Database Migration: 30 minutes
- Storage Setup: 15 minutes
- Application Deployment: 30 minutes
- Verification: 30 minutes
- **Total**: ~2 hours

---

## Success Criteria

✅ All health checks passing  
✅ No database errors in logs  
✅ Users can send messages  
✅ Users can create favorites  
✅ Portfolio uploads working  
✅ Analytics data displaying  
✅ Admin dashboard accessible  
✅ Email preferences saving  
✅ Saved searches executing  

---

**Migration completed successfully!** 🎉
