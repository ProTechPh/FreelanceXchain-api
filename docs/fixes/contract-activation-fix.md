# Contract Activation Fix

## Issue
When an employer accepted a freelancer's proposal, the contract was created with `'pending'` status and remained in that state indefinitely. The contract was never automatically activated, causing confusion for users.

## Root Cause
The `acceptProposal` function in [proposal-service.ts](../../src/services/proposal-service.ts) was:
1. Creating a contract with `'pending'` status (via the `accept_proposal_atomic` RPC)
2. Creating a blockchain agreement
3. **NOT** initializing the escrow or activating the contract

The escrow initialization and contract activation were separate manual steps that required calling the `/api/contracts/:id/fund` endpoint.

## Solution
Modified the `acceptProposal` function to automatically:
1. Create the blockchain agreement (existing behavior)
2. **Initialize the escrow** by calling `initializeContractEscrow`
3. **Activate the contract** by updating its status from `'pending'` to `'active'`

### Changes Made

#### 1. Updated proposal-service.ts
Added automatic escrow initialization and contract activation after creating the blockchain agreement:

```typescript
// Initialize escrow and activate contract
const { initializeContractEscrow } = await import('./payment-service.js');
const escrowResult = await initializeContractEscrow(
  createdContract,
  project,
  employer.wallet_address,
  freelancer.wallet_address
);

if (escrowResult.success) {
  // Update contract status to active
  const updatedContractEntity = await contractRepository.updateContract(createdContract.id, {
    status: 'active',
  });
  if (updatedContractEntity) {
    createdContract.status = 'active';
    createdContract.escrowAddress = escrowResult.data.escrowAddress;
  }
}
```

#### 2. Updated Tests
- Added mocks for `payment-service` and `agreement-contract` services
- Updated mock RPC to create contracts with `'pending'` status (matching real implementation)
- Enhanced test assertions to verify contract status is `'active'` and escrow address is set

## Contract Status Flow

### Before Fix
```
Proposal Accepted → Contract Created (pending) → [Manual Step Required] → Contract Funded (active)
```

### After Fix
```
Proposal Accepted → Contract Created (pending) → Escrow Initialized → Contract Activated (active)
```

## Status Transitions
The contract status follows this state machine:
- `pending` → `active` (when escrow is funded)
- `pending` → `cancelled` (if cancelled before funding)
- `active` → `completed` (when all milestones are completed)
- `active` → `disputed` (when a dispute is raised)
- `active` → `cancelled` (if cancelled after funding)

## Error Handling
If escrow initialization fails:
- The contract remains in `'pending'` status
- Error is logged but doesn't fail the proposal acceptance
- Employer can manually fund the contract later via `/api/contracts/:id/fund`

This graceful degradation ensures that blockchain failures don't prevent the core business logic from completing.

## Testing
All existing tests pass, including:
- Property-based tests for proposal acceptance
- Unit tests for escrow deployment
- Contract status verification

## Related Files
- [src/services/proposal-service.ts](../../src/services/proposal-service.ts)
- [src/services/payment-service.ts](../../src/services/payment-service.ts)
- [src/services/contract-service.ts](../../src/services/contract-service.ts)
- [supabase/migrations/20240321000000_concurrency_rpcs.sql](../../supabase/migrations/20240321000000_concurrency_rpcs.sql)
- [src/__tests__/unit/proposal-service.test.ts](../../src/__tests__/unit/proposal-service.test.ts)
