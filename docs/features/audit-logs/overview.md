# Audit Logs Documentation

## Overview

The audit logs system tracks all important actions in the FreelanceXchain platform for compliance, security, and debugging purposes. Every significant user action, system event, and data modification is recorded with full context.

**Users can view their own audit logs** through the `/api/audit-logs/me` endpoint for security monitoring and activity tracking. See [User Guide](guide.md) for the complete user guide.

## Features

- **Comprehensive Logging**: Tracks authentication, contracts, payments, disputes, KYC, and more
- **Immutable Records**: Audit logs cannot be modified or deleted once created
- **Rich Context**: Captures user ID, IP address, user agent, timestamps, and custom payload data
- **Flexible Querying**: Search by user, action, resource, date range, or status
- **Reporting**: Generate audit reports for users or system-wide analytics
- **Row-Level Security**: Users can only view their own logs; admins can view all

## Database Schema

```sql
CREATE TABLE audit_log_entries (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    actor_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    payload JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    status TEXT DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Auditable Actions

### Authentication
- `user_login` - User login attempt
- `user_logout` - User logout
- `user_signup` - New user registration
- `user_password_change` - Password change

### User Management
- `user_created` - User account created
- `user_updated` - User profile updated
- `user_deleted` - User account deleted

### Contracts
- `contract_created` - New contract created
- `contract_signed` - Contract signed by party
- `contract_updated` - Contract terms updated
- `contract_cancelled` - Contract cancelled

### Payments
- `payment_initiated` - Payment started
- `payment_completed` - Payment successful
- `payment_failed` - Payment failed
- `payment_refunded` - Payment refunded

### Disputes
- `dispute_created` - New dispute opened
- `dispute_resolved` - Dispute resolved
- `dispute_escalated` - Dispute escalated

### KYC
- `kyc_submitted` - KYC verification submitted
- `kyc_approved` - KYC verification approved
- `kyc_rejected` - KYC verification rejected

## Usage

### Manual Logging

```typescript
import { logAuditEvent, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

// In your route handler
await logAuditEvent(req, {
  action: AUDITABLE_ACTIONS.CONTRACT_SIGNED,
  resourceType: 'contract',
  resourceId: contractId,
  payload: {
    contractAmount: 1000,
    signerRole: 'freelancer',
  },
  status: 'success',
});
```

### Automatic Logging with Middleware

```typescript
import { auditMiddleware, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

// Apply to specific routes
router.post(
  '/contracts/:id/sign',
  authenticateToken,
  auditMiddleware(AUDITABLE_ACTIONS.CONTRACT_SIGNED, 'contract'),
  signContractHandler
);
```

### Database Triggers (Optional)

Uncomment triggers in the migration file to automatically log all INSERT/UPDATE/DELETE operations on specific tables:

```sql
-- Enable automatic auditing for contracts table
DROP TRIGGER IF EXISTS audit_contracts ON contracts;
CREATE TRIGGER audit_contracts
    AFTER INSERT OR UPDATE OR DELETE ON contracts
    FOR EACH ROW EXECUTE FUNCTION log_table_changes();
```

## API Endpoints

### Get Current User's Audit Logs (USER ACCESSIBLE)
```
GET /api/audit-logs/me?limit=100
Authorization: Bearer <token>
```

**This endpoint is accessible to ALL authenticated users** - users can view their own activity logs for security monitoring and compliance purposes.

**Response:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "user_id": "user-uuid",
      "action": "user_login",
      "resource_type": "auth",
      "status": "success",
      "created_at": "2024-02-19T10:30:00Z",
      "ip_address": "192.168.1.1",
      "payload": { ... }
    }
  ]
}
```

### Get User Audit Logs (Admin Only)
```
GET /api/audit-logs/user/:userId?limit=100
Authorization: Bearer <admin-token>
```

### Get Resource Audit Logs (Admin Only)
```
GET /api/audit-logs/resource/:resourceType/:resourceId
Authorization: Bearer <admin-token>
```

### Get Audit Logs by Action (Admin Only)
```
GET /api/audit-logs/action/:action?limit=100
Authorization: Bearer <admin-token>
```

### Get Failed Actions (Admin Only)
```
GET /api/audit-logs/failed?limit=100
Authorization: Bearer <admin-token>
```

### Get Audit Logs by Date Range (Admin Only)
```
GET /api/audit-logs/range?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <admin-token>
```

### Generate User Audit Report (Admin Only)
```
GET /api/audit-logs/report/user/:userId?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <admin-token>
```

Response:
```json
{
  "totalActions": 150,
  "successfulActions": 145,
  "failedActions": 5,
  "actionBreakdown": {
    "user_login": 50,
    "contract_created": 20,
    "payment_completed": 75
  },
  "logs": [...]
}
```

### Generate System Audit Report (Admin Only)
```
GET /api/audit-logs/report/system?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <admin-token>
```

Response:
```json
{
  "totalActions": 5000,
  "successfulActions": 4850,
  "failedActions": 150,
  "actionBreakdown": {...},
  "resourceBreakdown": {...},
  "topUsers": [
    { "userId": "uuid-1", "count": 250 },
    { "userId": "uuid-2", "count": 200 }
  ]
}
```

## Security

### Row-Level Security (RLS)

The audit logs table has RLS enabled with the following policies:

1. **Users can view their own logs**: Users can only see audit logs where `user_id` matches their authenticated user ID
2. **Admins can view all logs**: Users with `role = 'admin'` can view all audit logs
3. **Service role can insert**: Only the service role can create new audit logs
4. **Immutable logs**: No one can update or delete audit logs

### Best Practices

1. **Never log sensitive data**: Don't include passwords, tokens, or PII in the payload
2. **Use service role for logging**: Audit logging should use the service role to bypass RLS
3. **Monitor failed actions**: Regularly review failed actions for security incidents
4. **Set retention policies**: Consider archiving old logs to manage database size
5. **Encrypt at rest**: Ensure your Supabase project has encryption enabled

## Compliance

This audit logging system helps meet compliance requirements for:

- **GDPR**: Track data access and modifications
- **SOC 2**: Demonstrate security controls and monitoring
- **PCI DSS**: Log payment-related activities
- **HIPAA**: Track access to sensitive information (if applicable)

## Performance Considerations

1. **Indexes**: The migration includes indexes on commonly queried columns
2. **Async logging**: Audit logging is non-blocking and won't slow down requests
3. **Batch queries**: Use date range queries with limits to avoid large result sets
4. **Archival**: Consider moving old logs to cold storage after 1-2 years

## Troubleshooting

### Logs not appearing
- Check that the service role is being used for logging
- Verify RLS policies are correctly configured
- Check application logs for audit logging errors

### Performance issues
- Add indexes for frequently queried columns
- Reduce the date range in queries
- Consider pagination for large result sets

### Missing context data
- Ensure middleware is properly extracting user info from requests
- Verify IP address and user agent are being captured correctly

## Future Enhancements

- [ ] Export audit logs to external systems (S3, CloudWatch, etc.)
- [ ] Real-time audit log streaming via WebSocket
- [ ] Advanced analytics and anomaly detection
- [ ] Automated compliance report generation
- [ ] Integration with SIEM tools
