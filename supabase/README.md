# Supabase Database

Database schema, migrations, and SQL utilities for the FreelanceXchain platform.

## 📁 Structure

```
supabase/
├── schema.sql           # Complete database schema
├── seed-skills.sql      # Skill categories and skills seed data
├── migrations/          # Database migration files
└── snippets/           # SQL code snippets (currently empty)
```

## 📋 Core Files

### schema.sql
Complete database schema including:
- **Tables:** Users, projects, proposals, contracts, payments, disputes, etc.
- **Row Level Security (RLS):** Security policies for data access
- **Functions:** Database functions and stored procedures
- **Triggers:** Automated database actions
- **Indexes:** Performance optimization indexes

**Usage:**
```bash
# Apply schema to new database
psql -h your-db-host -U postgres -d your-database -f supabase/schema.sql

# Or via Supabase CLI
supabase db reset
```

### seed-skills.sql
Seed data for skill categories and skills:
- Pre-defined skill categories (Development, Design, Marketing, etc.)
- Common skills for each category
- Skill relationships and metadata

**Usage:**
```bash
# Load seed data
psql -h your-db-host -U postgres -d your-database -f supabase/seed-skills.sql

# Or via Supabase CLI
supabase db seed
```

## 🔄 Migrations

Database migrations are stored in `migrations/` directory with timestamp-based naming:

### Migration Files

- **003_didit_kyc_verifications.sql** - KYC verification integration with Didit
- **004_audit_logs.sql** - Audit logging system tables and triggers
- **004_remove_auto_user_creation_trigger.sql** - Remove automatic user creation
- **005_persistent_blockchain_stores.sql** - Blockchain data persistence
- **20240321000000_concurrency_rpcs.sql** - Concurrency handling for RPCs
- **20240322000000_cancel_contract_rpc.sql** - Contract cancellation RPC
- **20240323000000_milestone_revision_rpc.sql** - Milestone revision functionality
- **20260218000000_add_proposal_attachments.sql** - Proposal file attachments

### Running Migrations

**Using Supabase CLI:**
```bash
# Apply all pending migrations
supabase db push

# Create new migration
supabase migration new migration_name

# Reset database and apply all migrations
supabase db reset
```

**Manual Application:**
```bash
# Apply specific migration
psql -h your-db-host -U postgres -d your-database -f supabase/migrations/003_didit_kyc_verifications.sql
```

## 🗄️ Database Schema Overview

### Core Tables

#### Users & Profiles
- `users` - User accounts and authentication
- `freelancer_profiles` - Freelancer-specific data
- `employer_profiles` - Employer/client-specific data

#### Projects & Work
- `projects` - Project listings
- `proposals` - Freelancer proposals for projects
- `contracts` - Accepted contracts between parties
- `milestones` - Project milestones and deliverables

#### Payments & Transactions
- `payments` - Payment records
- `escrow_transactions` - Blockchain escrow tracking

#### Communication
- `messages` - Direct messaging between users
- `notifications` - System notifications

#### Reputation & Reviews
- `reviews` - User ratings and reviews
- `reputation_scores` - Calculated reputation data

#### Security & Compliance
- `kyc_verifications` - KYC verification records
- `audit_logs` - System audit trail

#### Skills & Matching
- `skills` - Available skills
- `skill_categories` - Skill categorization
- `user_skills` - User skill associations

#### Disputes
- `disputes` - Dispute records
- `dispute_evidence` - Evidence submissions

## 🔒 Row Level Security (RLS)

All tables implement Row Level Security policies:

- **Users can only access their own data**
- **Public data is accessible to authenticated users**
- **Admin roles have elevated permissions**
- **Service role bypasses RLS for backend operations**

### Example RLS Policies

```sql
-- Users can read their own profile
CREATE POLICY "Users can view own profile"
ON users FOR SELECT
USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON users FOR UPDATE
USING (auth.uid() = id);
```

## 🔧 Database Functions

### Remote Procedure Calls (RPCs)

Custom database functions for complex operations:

- **Concurrency RPCs** - Handle concurrent updates safely
- **Cancel Contract RPC** - Contract cancellation with validation
- **Milestone Revision RPC** - Update milestone details
- **Reputation Calculation** - Calculate user reputation scores

### Usage Example

```typescript
// Call RPC from backend
const { data, error } = await supabase
  .rpc('cancel_contract', { contract_id: '123' });
```

## 🚀 Setup & Configuration

### Initial Setup

1. **Create Supabase Project**
   ```bash
   # Initialize Supabase
   supabase init
   ```

2. **Link to Project**
   ```bash
   supabase link --project-ref your-project-ref
   ```

3. **Apply Schema**
   ```bash
   supabase db reset
   ```

4. **Load Seed Data**
   ```bash
   psql -h your-db-host -U postgres -d your-database -f supabase/seed-skills.sql
   ```

### Environment Variables

Configure in `.env`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:password@host:5432/database
```

## 📊 Database Maintenance

### Backup

```bash
# Backup entire database
pg_dump -h your-db-host -U postgres -d your-database > backup.sql

# Backup specific table
pg_dump -h your-db-host -U postgres -d your-database -t users > users_backup.sql
```

### Restore

```bash
# Restore from backup
psql -h your-db-host -U postgres -d your-database < backup.sql
```

### Performance Monitoring

```sql
-- Check slow queries
SELECT * FROM pg_stat_statements 
ORDER BY total_exec_time DESC 
LIMIT 10;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## 🧪 Testing

### Test Database Setup

```bash
# Create test database
createdb freelancexchain_test

# Apply schema to test database
psql -d freelancexchain_test -f supabase/schema.sql

# Run tests
pnpm test
```

## 📚 Related Documentation

- [Database Schema Design](../docs/architecture/database-overview.md) - Detailed schema documentation
- [Data Models & ORM Mapping](../docs/architecture/models-overview.md) - ORM configuration
- [Security Implementation](../docs/security/overview.md) - Database security
- [Developer Setup Guide](../docs/getting-started/setup.md) - Initial setup

## 🛠️ Development Workflow

### Creating New Migrations

1. **Create migration file**
   ```bash
   supabase migration new add_new_feature
   ```

2. **Write SQL changes**
   ```sql
   -- Add new column
   ALTER TABLE users ADD COLUMN new_field TEXT;
   
   -- Create index
   CREATE INDEX idx_users_new_field ON users(new_field);
   ```

3. **Test migration**
   ```bash
   supabase db reset
   pnpm test
   ```

4. **Commit migration**
   ```bash
   git add supabase/migrations/
   git commit -m "Add new feature migration"
   ```

### Best Practices

- **Always use migrations** - Never modify schema.sql directly in production
- **Test migrations locally** - Use `supabase db reset` to test from scratch
- **Write reversible migrations** - Include rollback steps when possible
- **Document changes** - Add comments explaining complex migrations
- **Version control** - Commit all migration files
- **Backup before major changes** - Always backup production data

## 🆘 Troubleshooting

**Migration fails with "relation already exists"**
- Check if migration was already applied
- Use `supabase db reset` to start fresh locally

**RLS policies blocking queries**
- Verify user authentication
- Check policy conditions
- Use service role key for admin operations

**Slow queries**
- Add appropriate indexes
- Analyze query execution plan with `EXPLAIN ANALYZE`
- Consider materialized views for complex queries

**Connection issues**
- Verify DATABASE_URL is correct
- Check firewall and network settings
- Ensure database is running and accessible

## 📄 License

Database schema and migrations are part of the FreelanceXchain platform.
