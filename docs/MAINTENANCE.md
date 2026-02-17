# FreelanceXchain API - Maintenance Runbook

This document provides centralized maintenance procedures, schedules, and operational guidelines for the FreelanceXchain API platform.

## Table of Contents

1. [Maintenance Schedule](#maintenance-schedule)
2. [Routine Maintenance Tasks](#routine-maintenance-tasks)
3. [Security Maintenance](#security-maintenance)
4. [Database Maintenance](#database-maintenance)
5. [Blockchain Maintenance](#blockchain-maintenance)
6. [Monitoring & Alerting](#monitoring--alerting)
7. [Backup & Recovery](#backup--recovery)
8. [Incident Response](#incident-response)
9. [Performance Optimization](#performance-optimization)
10. [Documentation Updates](#documentation-updates)

---

## Maintenance Schedule

### Daily Tasks
- ✅ **Automated**: Dependency vulnerability scanning (via Dependabot)
- ✅ **Automated**: Log rotation and archival
- 📋 **Manual**: Review error logs for critical issues
- 📋 **Manual**: Monitor API response times and error rates

### Weekly Tasks
- ✅ **Automated**: Dependency updates (Mondays 9:00 AM via Dependabot)
- 📋 **Manual**: Review and merge Dependabot PRs
- 📋 **Manual**: Check database performance metrics
- 📋 **Manual**: Review blockchain transaction success rates

### Monthly Tasks
- 📋 **Security audit**: Run `npm run security:audit` and review findings
- 📋 **Database optimization**: Analyze slow queries and update indexes
- 📋 **Log analysis**: Review patterns and identify optimization opportunities
- 📋 **Backup verification**: Test backup restoration procedures
- 📋 **Documentation review**: Update outdated documentation

### Quarterly Tasks
- 📋 **Threat model review**: Update `docs/IAS.md` and `docs/SECURITY_IMPLEMENTATION.md`
- 📋 **Security assessment**: Comprehensive OWASP Top 10 validation
- 📋 **Performance audit**: Load testing and optimization
- 📋 **Dependency cleanup**: Remove unused dependencies
- 📋 **API documentation**: Update Swagger/OpenAPI specs

### Annual Tasks
- 📋 **Security penetration testing**: Third-party security audit
- 📋 **Disaster recovery drill**: Full system recovery test
- 📋 **Architecture review**: Evaluate system design and scalability
- 📋 **Compliance review**: Verify regulatory compliance (GDPR, etc.)

---

## Routine Maintenance Tasks

### Dependency Management

#### Automated Updates (Dependabot)
**Schedule**: Weekly (Mondays 9:00 AM)  
**Configuration**: `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
```

**Procedure**:
1. Dependabot creates PRs for dependency updates
2. Review PR for breaking changes
3. Check CI/CD pipeline passes all tests
4. Merge if tests pass and no breaking changes
5. Deploy to staging for validation
6. Deploy to production after validation

#### Manual Dependency Updates
**When**: Critical security patches or major version upgrades

```bash
# Check for outdated dependencies
npm outdated

# Update specific package
npm update <package-name>

# Update all dependencies (use with caution)
npm update

# Audit for vulnerabilities
npm audit

# Fix vulnerabilities automatically
npm audit fix

# Force fix (may introduce breaking changes)
npm audit fix --force
```

### Log Management

#### Log Rotation
**Automated**: Daily at midnight  
**Retention**: 30 days for application logs, 90 days for security logs

**Manual Log Review**:
```bash
# View recent errors
grep "ERROR" logs/app.log | tail -n 100

# Search by correlation ID
grep "correlationId: <id>" logs/app.log

# View authentication failures
grep "authentication failed" logs/security.log
```

#### Log Analysis
**Schedule**: Weekly  
**Procedure**:
1. Review error frequency and patterns
2. Identify recurring issues
3. Create tickets for persistent problems
4. Update monitoring alerts if needed

---

## Security Maintenance

### Security Audits

#### Automated Vulnerability Scanning
**Schedule**: Daily (via Dependabot)  
**Command**: `npm run security:audit`

```bash
# Run security audit
npm audit

# Generate detailed report
npm audit --json > security-audit.json

# Check for high/critical vulnerabilities only
npm audit --audit-level=high
```

#### Manual Security Review
**Schedule**: Monthly  
**Checklist**:
- [ ] Review authentication logs for suspicious activity
- [ ] Check rate limiting effectiveness
- [ ] Verify CORS configuration
- [ ] Review API key usage and rotation
- [ ] Validate RLS policies in database
- [ ] Check for exposed secrets in logs
- [ ] Review error messages for information disclosure

### Threat Model Updates

**Schedule**: Quarterly (Next review: May 18, 2026)  
**Documents to Update**:
- `docs/IAS.md` - STRIDE analysis
- `docs/SECURITY_IMPLEMENTATION.md` - Security controls
- `docs/IAS-Checklist.md` - Compliance checklist

**Procedure**:
1. Review recent security incidents and vulnerabilities
2. Assess new features for security implications
3. Update STRIDE threat analysis
4. Review and update mitigation strategies
5. Update security implementation documentation
6. Schedule next review (90 days from current)

**Calendar Reminder**: Set recurring quarterly reminder in team calendar

### Password & Key Rotation

#### JWT Secret Rotation
**Schedule**: Every 6 months or after security incident  
**Procedure**:
1. Generate new JWT secret: `openssl rand -base64 32`
2. Update `JWT_SECRET` in environment variables
3. Deploy to all environments
4. Invalidate all existing tokens (users must re-login)
5. Monitor for authentication issues

#### Blockchain Private Key Management
**Schedule**: Review annually, rotate if compromised  
**Procedure**:
1. Generate new wallet address
2. Transfer funds from old wallet to new wallet
3. Update `BLOCKCHAIN_PRIVATE_KEY` in environment
4. Update contract ownership if necessary
5. Securely destroy old private key

#### API Key Rotation
**Schedule**: Every 6 months  
**Procedure**:
1. Generate new API keys for external services
2. Update environment variables
3. Test integration with new keys
4. Deploy to production
5. Revoke old API keys after validation period

---

## Database Maintenance

### Database Optimization

#### Index Maintenance
**Schedule**: Monthly  
**Procedure**:

```sql
-- Analyze table statistics
ANALYZE;

-- Reindex specific table
REINDEX TABLE users;

-- Reindex all tables (during maintenance window)
REINDEX DATABASE freelancexchain;

-- Check for missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
ORDER BY abs(correlation) DESC;
```

#### Vacuum Operations
**Schedule**: Weekly (automated by PostgreSQL)  
**Manual Vacuum** (if needed):

```sql
-- Vacuum specific table
VACUUM ANALYZE users;

-- Full vacuum (requires maintenance window)
VACUUM FULL ANALYZE;

-- Check for bloat
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Migration Management

#### Running Migrations
```bash
# Check migration status
npm run db:migrate:status

# Run pending migrations
npm run db:migrate

# Rollback last migration
npm run db:migrate:rollback

# Create new migration
npm run db:migrate:create <migration-name>
```

#### Migration Best Practices
1. Always test migrations in staging first
2. Create rollback plan before production deployment
3. Backup database before running migrations
4. Run migrations during low-traffic periods
5. Monitor application logs during and after migration

### Data Cleanup

#### Archived Data Cleanup
**Schedule**: Quarterly  
**Procedure**:

```sql
-- Archive old notifications (older than 90 days)
DELETE FROM notifications 
WHERE created_at < NOW() - INTERVAL '90 days' 
AND is_read = true;

-- Archive completed contracts (older than 1 year)
-- Move to archive table instead of deleting
INSERT INTO contracts_archive 
SELECT * FROM contracts 
WHERE status = 'completed' 
AND updated_at < NOW() - INTERVAL '1 year';

-- Clean up expired sessions
DELETE FROM sessions 
WHERE expires_at < NOW();
```

---

## Blockchain Maintenance

### Smart Contract Monitoring

#### Contract Health Checks
**Schedule**: Daily  
**Procedure**:

```bash
# Check contract deployment status
npm run blockchain:status

# Verify contract addresses
npm run blockchain:verify

# Check wallet balances
npm run blockchain:balance
```

#### Transaction Monitoring
**Schedule**: Continuous (automated alerts)  
**Metrics to Monitor**:
- Transaction success rate (target: >99%)
- Average gas costs
- Transaction confirmation times
- Failed transaction patterns

### Gas Optimization

**Schedule**: Monthly review  
**Procedure**:
1. Analyze gas usage patterns
2. Identify high-cost operations
3. Optimize contract interactions
4. Update gas price strategies
5. Consider batch operations for efficiency

### Contract Upgrades

**Procedure**:
1. Test new contract version on testnet
2. Audit contract changes
3. Create deployment plan with rollback strategy
4. Schedule maintenance window
5. Deploy to mainnet
6. Verify deployment
7. Update contract addresses in configuration
8. Monitor for issues

---

## Monitoring & Alerting

### Application Monitoring

#### Key Metrics
- **Response Time**: P50, P95, P99 latency
- **Error Rate**: 4xx and 5xx responses
- **Throughput**: Requests per second
- **Availability**: Uptime percentage

#### Alert Thresholds
- 🔴 **Critical**: Error rate >5%, P99 latency >5s, Downtime >1min
- 🟡 **Warning**: Error rate >2%, P99 latency >3s, CPU >80%

### Database Monitoring

#### Key Metrics
- **Connection Pool**: Active/idle connections
- **Query Performance**: Slow query count (>1s)
- **Disk Usage**: Database size and growth rate
- **Replication Lag**: For read replicas

### Blockchain Monitoring

#### Key Metrics
- **Transaction Success Rate**: Target >99%
- **Gas Prices**: Monitor for spikes
- **Wallet Balance**: Alert if balance <threshold
- **Contract Events**: Monitor for unexpected events

---

## Backup & Recovery

### Backup Strategy

#### Database Backups
**Schedule**: 
- Full backup: Daily at 2:00 AM UTC
- Incremental backup: Every 6 hours
- Retention: 30 days

**Supabase Automated Backups**:
- Point-in-time recovery available
- Backup retention based on plan tier

**Manual Backup**:
```bash
# Create database backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
psql $DATABASE_URL < backup_20260218_020000.sql
```

#### Configuration Backups
**Schedule**: After each configuration change  
**Items to Backup**:
- Environment variables (encrypted)
- Smart contract ABIs and addresses
- API keys and secrets (in secure vault)
- Infrastructure as Code (IaC) configurations

### Recovery Procedures

#### Database Recovery
**RTO (Recovery Time Objective)**: 1 hour  
**RPO (Recovery Point Objective)**: 6 hours

**Procedure**:
1. Identify backup point for recovery
2. Stop application to prevent data corruption
3. Restore database from backup
4. Verify data integrity
5. Run any necessary migrations
6. Restart application
7. Validate functionality
8. Monitor for issues

#### Application Recovery
**Procedure**:
1. Identify root cause of failure
2. Roll back to last known good version if needed
3. Restore configuration from backup
4. Restart services
5. Verify health checks pass
6. Monitor logs and metrics

---

## Incident Response

### Incident Classification

#### Severity Levels
- **P0 (Critical)**: Complete service outage, data breach, security incident
- **P1 (High)**: Major feature unavailable, significant performance degradation
- **P2 (Medium)**: Minor feature issues, moderate performance impact
- **P3 (Low)**: Cosmetic issues, minimal user impact

### Response Procedures

#### P0 - Critical Incident
**Response Time**: Immediate  
**Procedure**:
1. **Alert**: Page on-call engineer immediately
2. **Assess**: Determine scope and impact
3. **Communicate**: Notify stakeholders and users
4. **Mitigate**: Implement immediate fix or rollback
5. **Resolve**: Deploy permanent fix
6. **Post-Mortem**: Conduct incident review within 48 hours

#### P1 - High Priority
**Response Time**: Within 1 hour  
**Procedure**:
1. Assign incident owner
2. Investigate root cause
3. Implement fix or workaround
4. Deploy to production
5. Monitor for resolution
6. Document incident and resolution

### Post-Incident Review

**Schedule**: Within 48 hours of P0/P1 incidents  
**Template**:
1. **Incident Summary**: What happened?
2. **Timeline**: Detailed event timeline
3. **Root Cause**: Why did it happen?
4. **Impact**: Who/what was affected?
5. **Resolution**: How was it fixed?
6. **Action Items**: Prevent recurrence
7. **Lessons Learned**: What did we learn?

---

## Performance Optimization

### Performance Monitoring

#### Key Performance Indicators
- API response time (target: P95 <500ms)
- Database query time (target: <100ms)
- Blockchain transaction time (target: <30s)
- Memory usage (target: <80%)
- CPU usage (target: <70%)

### Optimization Procedures

#### API Performance
**Schedule**: Monthly review  
**Procedure**:
1. Identify slow endpoints using request logs
2. Analyze database queries for N+1 problems
3. Implement caching for frequently accessed data
4. Optimize serialization and data transformation
5. Consider pagination for large result sets

#### Database Performance
**Schedule**: Monthly review  
**Procedure**:
1. Identify slow queries using `pg_stat_statements`
2. Add missing indexes
3. Optimize query structure
4. Consider materialized views for complex queries
5. Review connection pool settings

#### Caching Strategy
**Implementation**:
- Cache frequently accessed data (user profiles, skills)
- Use Redis for distributed caching
- Set appropriate TTL values
- Implement cache invalidation strategy

---

## Documentation Updates

### Documentation Maintenance

**Schedule**: Monthly review  
**Procedure**:
1. Review recent code changes
2. Update API documentation (Swagger/OpenAPI)
3. Update troubleshooting guides with new issues
4. Verify all links are working
5. Update version numbers and dates
6. Review for accuracy and completeness

### Documentation Checklist
- [ ] API endpoint documentation up to date
- [ ] Environment variable documentation current
- [ ] Deployment procedures accurate
- [ ] Troubleshooting guides comprehensive
- [ ] Architecture diagrams reflect current state
- [ ] Security documentation current
- [ ] All links functional

---

## Maintenance Contacts

### On-Call Rotation
- **Primary**: [Team Lead]
- **Secondary**: [Senior Developer]
- **Escalation**: [Engineering Manager]

### External Contacts
- **Supabase Support**: support@supabase.io
- **Blockchain RPC Provider**: [Provider Support]
- **Security Incidents**: security@freelancexchain.com

---

## Maintenance Windows

### Scheduled Maintenance
**Schedule**: First Sunday of each month, 2:00 AM - 4:00 AM UTC  
**Purpose**: Database maintenance, system updates, infrastructure changes

**Procedure**:
1. Announce maintenance window 7 days in advance
2. Create maintenance plan with rollback strategy
3. Enable maintenance mode
4. Perform maintenance tasks
5. Verify system functionality
6. Disable maintenance mode
7. Monitor for issues

### Emergency Maintenance
**Trigger**: Critical security patch, major system failure  
**Procedure**:
1. Assess urgency and impact
2. Notify stakeholders immediately
3. Implement fix with minimal downtime
4. Communicate status updates
5. Conduct post-incident review

---

## Maintenance Logs

### Log Template
```
Date: YYYY-MM-DD
Type: [Routine/Emergency/Security]
Performed By: [Name]
Duration: [Start - End]
Tasks Completed:
- Task 1
- Task 2
Issues Encountered:
- Issue 1 (Resolution: ...)
Next Actions:
- Action 1
```

### Log Location
- Maintenance logs: `logs/maintenance/`
- Incident reports: `logs/incidents/`
- Performance reports: `logs/performance/`

---

**Last Updated**: February 18, 2026  
**Next Scheduled Review**: May 18, 2026  
**Maintained By**: FreelanceXchain DevOps Team
