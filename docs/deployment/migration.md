# Migration Guide: New Features Implementation

This guide provides step-by-step instructions for deploying the new features to your FreelanceXchain platform.

## Prerequisites

- Access to Appwrite dashboard
- Database admin privileges
- Node.js 20+ and pnpm installed
- Existing FreelanceXchain deployment

---

## Step 0: Appwrite Schema Migration (re-run `setup-appwrite-db.ts`)

The runtime database is Appwrite, not Postgres. The single source of truth for the
schema is `scripts/setup-appwrite-db.ts` — re-running it is idempotent and applies
any missing collections, attributes, and indexes:

```bash
npx tsx scripts/setup-appwrite-db.ts
```

### 0.1 New attributes (idempotent — safe to re-run)

- **`email_preferences`**: `contract_notifications`, `message_notifications`,
  `review_notifications`, `kyc_notifications` (all `boolean`, default `true`).
  These back the newly-wired transactional emails (contract created, message
  received, review received, KYC approved/rejected). Users can opt out via
  `PATCH /api/email-preferences`; `unsubscribe-all` keeps them enabled since
  they are account-critical.
- **`skill_suggestions`**: `requester_ids` (string array). Anti-spam: the
  suggestion `times_requested` counter now only increments when a *new* user
  requests a skill, so one account cannot inflate popularity by deleting and
  re-creating the same custom skill.
- **`saved_searches`**: `last_notified_at` (string ISO timestamp). Dedup
  watermark for the saved-search notify job — results are surfaced only once.
- **`freelancer_profiles`**: the scheduler's saved-search notify job reads
  freelancer profiles from this collection (`FREELANCER_PROFILES`).

### 0.2 Unique indexes (see `INDEXES` in the script)

- `reviews (contract_id, reviewer_id)` — **unique**. Global backstop for the
  duplicate-review race (BLF-9.1). NOTE: de-duplicate existing rows first or
  creation fails.
- `user_custom_skills (user_id, name)` — **unique**. Anti-spam backstop so two
  racing requests cannot both insert the same custom skill (BLF-skill.1).
- `skill_suggestions (skill_name)` — **unique**. Backstop for the suggestion
  queue dedup (BLF-skill.2).
- `favorites (user_id, target_type, target_id)` — **unique**. Backstop for the
  `addFavorite` check-then-insert race.

---

## Step 1: Database Migration

No Postgres migration is required — the runtime database is **Appwrite**. All
collections, attributes, and indexes are declared in
`scripts/setup-appwrite-db.ts` and applied by re-running it (Step 0). This
covers messaging (`messages`, `conversations`), reviews, favorites, portfolio,
email preferences, saved searches, and transactions.

---

## Step 2: Storage Buckets

### 2.1 Create Storage Buckets

In Appwrite Dashboard → Storage:

1. Create `portfolio-images` bucket
   - Public: Yes
   - File size limit: 10MB
   - Allowed MIME types: image/jpeg, image/png, image/webp

2. Verify `proposal-attachments` bucket exists (should already exist)

3. Verify `dispute-evidence` bucket exists (should already exist)

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
pnpm test
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

No SQL data migration is required. Re-run `npx tsx scripts/setup-appwrite-db.ts`
to apply the schema; any new attributes default appropriately for existing
documents.

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

The OpenAPI spec is served from the checked-in `openapi.json` file. After route changes, update `openapi.json` (the docs are static — there is no code generation script).

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

### 2. Remove Storage Buckets

In Appwrite Dashboard → Storage, delete:

- `portfolio-images`

---

## Troubleshooting

### Issue: "Collection does not exist"

**Solution**: Re-run `npx tsx scripts/setup-appwrite-db.ts` to create missing
collections/attributes, or create the collection in the Appwrite Console.

### Issue: "Permission denied for collection"

**Solution**: Verify the Appwrite API key has the required scopes and that
per-document permissions are set correctly.

### Issue: "File upload fails"

**Solution**:

1. Verify storage buckets exist
2. Check storage policies
3. Verify file size limits
4. Check MIME type restrictions

### Issue: "Health check fails"

**Solution**:

1. Check database connectivity
2. Verify Appwrite credentials
3. Check network/firewall rules

---

## Post-Deployment Checklist

- [ ] Appwrite collections, attributes, and indexes applied (`setup-appwrite-db.ts`)
- [ ] Storage buckets created with correct file-size/MIME limits
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
2. Review Appwrite logs
3. Consult [new-features-implementation.md](../features/new-features-implementation.md)
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

- Appwrite Schema Setup: 10 minutes
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

[← Back to Deployment](README.md)
