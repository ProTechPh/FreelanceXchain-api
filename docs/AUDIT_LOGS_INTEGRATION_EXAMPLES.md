# Audit Logs Integration Examples

This document shows how to integrate audit logging into your existing routes and services.

## Example 1: Authentication Routes

```typescript
// src/routes/auth-routes.ts
import { logAuditEvent, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

// Login endpoint
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    // Your existing login logic
    const user = await authService.login(email, password);
    
    // Log successful login
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.LOGIN,
      resourceType: 'user',
      resourceId: user.id,
      payload: {
        email: user.email,
        loginMethod: 'email',
      },
      status: 'success',
    });
    
    res.json({ user, token: user.token });
  } catch (error: any) {
    // Log failed login attempt
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.LOGIN,
      resourceType: 'user',
      payload: {
        email: req.body.email,
        loginMethod: 'email',
      },
      status: 'failure',
      errorMessage: error.message,
    });
    
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Logout endpoint
router.post('/logout', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    // Your existing logout logic
    await authService.logout(userId);
    
    // Log logout
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.LOGOUT,
      resourceType: 'user',
      resourceId: userId,
      status: 'success',
    });
    
    res.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

## Example 2: Contract Routes with Middleware

```typescript
// src/routes/contract-routes.ts
import { auditMiddleware, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

// Create contract - automatic audit logging
router.post(
  '/',
  authenticateToken,
  auditMiddleware(AUDITABLE_ACTIONS.CONTRACT_CREATED, 'contract'),
  async (req: Request, res: Response) => {
    // Your existing contract creation logic
    const contract = await contractService.create(req.body);
    res.json(contract);
  }
);

// Sign contract - manual audit logging with custom payload
router.post('/:id/sign', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;
    
    const contract = await contractService.sign(id, userId);
    
    // Log with detailed information
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.CONTRACT_SIGNED,
      resourceType: 'contract',
      resourceId: id,
      payload: {
        contractAmount: contract.amount,
        signerRole: contract.freelancer_id === userId ? 'freelancer' : 'employer',
        signedAt: new Date().toISOString(),
      },
      status: 'success',
    });
    
    res.json(contract);
  } catch (error: any) {
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.CONTRACT_SIGNED,
      resourceType: 'contract',
      resourceId: req.params.id,
      status: 'failure',
      errorMessage: error.message,
    });
    
    res.status(500).json({ error: error.message });
  }
});
```

## Example 3: Payment Routes

```typescript
// src/routes/payment-routes.ts
import { logAuditEvent, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

// Initiate payment
router.post('/initiate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { contractId, amount } = req.body;
    const userId = (req as any).user.id;
    
    const payment = await paymentService.initiate(contractId, amount, userId);
    
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.PAYMENT_INITIATED,
      resourceType: 'payment',
      resourceId: payment.id,
      payload: {
        contractId,
        amount,
        currency: 'USD',
        paymentMethod: 'blockchain',
      },
      status: 'pending',
    });
    
    res.json(payment);
  } catch (error: any) {
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.PAYMENT_INITIATED,
      resourceType: 'payment',
      payload: req.body,
      status: 'failure',
      errorMessage: error.message,
    });
    
    res.status(500).json({ error: error.message });
  }
});

// Payment webhook (from blockchain)
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const { paymentId, status, transactionHash } = req.body;
    
    const payment = await paymentService.updateStatus(paymentId, status);
    
    const action = status === 'completed' 
      ? AUDITABLE_ACTIONS.PAYMENT_COMPLETED 
      : AUDITABLE_ACTIONS.PAYMENT_FAILED;
    
    await logAuditEvent(req, {
      action,
      resourceType: 'payment',
      resourceId: paymentId,
      payload: {
        transactionHash,
        blockchainStatus: status,
        webhookReceived: new Date().toISOString(),
      },
      status: status === 'completed' ? 'success' : 'failure',
    });
    
    res.json({ received: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

## Example 4: KYC Routes

```typescript
// src/routes/didit-kyc-routes.ts
import { logAuditEvent, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

// Submit KYC
router.post('/submit', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const kycData = req.body;
    
    const verification = await kycService.submit(userId, kycData);
    
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.KYC_SUBMITTED,
      resourceType: 'kyc_verification',
      resourceId: verification.id,
      payload: {
        verificationType: kycData.type,
        documentsSubmitted: kycData.documents?.length || 0,
      },
      status: 'pending',
    });
    
    res.json(verification);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin approve KYC
router.post('/:id/approve', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).user.id;
    
    const verification = await kycService.approve(id, adminId);
    
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.KYC_APPROVED,
      resourceType: 'kyc_verification',
      resourceId: id,
      payload: {
        approvedBy: adminId,
        userId: verification.user_id,
      },
      status: 'success',
    });
    
    res.json(verification);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

## Example 5: Dispute Routes

```typescript
// src/routes/dispute-routes.ts
import { logAuditEvent, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

// Create dispute
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { contractId, reason, description } = req.body;
    
    const dispute = await disputeService.create({
      contractId,
      raisedBy: userId,
      reason,
      description,
    });
    
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.DISPUTE_CREATED,
      resourceType: 'dispute',
      resourceId: dispute.id,
      payload: {
        contractId,
        reason,
        raisedBy: userId,
      },
      status: 'success',
    });
    
    res.json(dispute);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Resolve dispute
router.post('/:id/resolve', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolution, winner } = req.body;
    const adminId = (req as any).user.id;
    
    const dispute = await disputeService.resolve(id, resolution, winner, adminId);
    
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.DISPUTE_RESOLVED,
      resourceType: 'dispute',
      resourceId: id,
      payload: {
        resolution,
        winner,
        resolvedBy: adminId,
        contractId: dispute.contract_id,
      },
      status: 'success',
    });
    
    res.json(dispute);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

## Example 6: Service Layer Integration

```typescript
// src/services/contract-service.ts
import { AuditLogRepository } from '../repositories/audit-log-repository.js';

export class ContractService {
  private auditLogRepo: AuditLogRepository;
  
  constructor() {
    this.auditLogRepo = new AuditLogRepository();
  }
  
  async updateContractStatus(contractId: string, status: string, userId: string): Promise<Contract> {
    try {
      const contract = await this.contractRepo.update(contractId, { status });
      
      // Log the status change
      await this.auditLogRepo.logAction({
        user_id: userId,
        action: 'contract_status_changed',
        resource_type: 'contract',
        resource_id: contractId,
        payload: {
          oldStatus: contract.status,
          newStatus: status,
        },
        status: 'success',
      });
      
      return contract;
    } catch (error) {
      // Log the failure
      await this.auditLogRepo.logAction({
        user_id: userId,
        action: 'contract_status_changed',
        resource_type: 'contract',
        resource_id: contractId,
        payload: {
          attemptedStatus: status,
        },
        status: 'failure',
        error_message: (error as Error).message,
      });
      
      throw error;
    }
  }
}
```

## Example 7: Background Job Logging

```typescript
// src/jobs/payment-processor.ts
import { AuditLogRepository } from '../repositories/audit-log-repository.js';

export class PaymentProcessor {
  private auditLogRepo: AuditLogRepository;
  
  constructor() {
    this.auditLogRepo = new AuditLogRepository();
  }
  
  async processScheduledPayments(): Promise<void> {
    const pendingPayments = await this.paymentRepo.getPending();
    
    for (const payment of pendingPayments) {
      try {
        await this.processPayment(payment);
        
        await this.auditLogRepo.logAction({
          user_id: payment.user_id,
          actor_id: 'system:payment-processor',
          action: 'payment_processed_automatically',
          resource_type: 'payment',
          resource_id: payment.id,
          payload: {
            amount: payment.amount,
            scheduledAt: payment.scheduled_at,
            processedAt: new Date().toISOString(),
          },
          status: 'success',
        });
      } catch (error) {
        await this.auditLogRepo.logAction({
          user_id: payment.user_id,
          actor_id: 'system:payment-processor',
          action: 'payment_processed_automatically',
          resource_type: 'payment',
          resource_id: payment.id,
          payload: {
            amount: payment.amount,
            scheduledAt: payment.scheduled_at,
          },
          status: 'failure',
          error_message: (error as Error).message,
        });
      }
    }
  }
}
```

## Best Practices

1. **Always log both success and failure**: Capture both outcomes for complete audit trail
2. **Include relevant context**: Add meaningful data to the payload field
3. **Use consistent action names**: Use the AUDITABLE_ACTIONS constants
4. **Don't log sensitive data**: Never include passwords, tokens, or full credit card numbers
5. **Log at the right level**: Use middleware for simple CRUD, manual logging for complex operations
6. **Handle errors gracefully**: Don't let audit logging failures break your application
7. **Use descriptive resource types**: Make it easy to filter and search logs later
8. **Include actor information**: Track who performed the action (user, admin, system)
