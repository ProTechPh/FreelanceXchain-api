# Service Layer Implementation Checklist

This document provides a checklist and templates for implementing the service layer functions for all new features.

---

## ✅ Implementation Status

### Existing Services (May Need Updates)
- [ ] `src/services/message-service.ts` - Review and update
- [ ] `src/services/review-service.ts` - Review and update
- [ ] `src/services/admin-service.ts` - Review and update
- [ ] `src/services/transaction-service.ts` - Review and update

### New Services (Need Full Implementation)
- [ ] `src/services/analytics-service.ts`
- [ ] `src/services/favorite-service.ts`
- [ ] `src/services/portfolio-service.ts`
- [ ] `src/services/email-preference-service.ts`
- [ ] `src/services/saved-search-service.ts`
- [ ] `src/services/file-service.ts`

---

## 📋 Service Function Requirements

### 1. Message Service (`message-service.ts`)

**Required Functions:**
```typescript
- sendMessage(data: SendMessageInput): Promise<ServiceResult<Message>>
- getConversations(userId: string, options: PaginationOptions): Promise<ServiceResult<PaginatedResult<Conversation>>>
- getConversationMessages(conversationId: string, userId: string, options: PaginationOptions): Promise<ServiceResult<PaginatedResult<Message>>>
- markConversationAsRead(conversationId: string, userId: string): Promise<ServiceResult<void>>
- getUnreadMessageCount(userId: string): Promise<ServiceResult<number>>
```

**Key Logic:**
- Create conversation if doesn't exist
- Update conversation metadata on new message
- Increment unread count for receiver
- Authorization checks (conversation participants only)
- Notification triggers

---

### 2. Review Service (`review-service.ts`)

**Required Functions:**
```typescript
- submitReview(data: SubmitReviewInput): Promise<ServiceResult<Review>>
- getReviewById(reviewId: string): Promise<ServiceResult<Review>>
- getUserReviews(userId: string): Promise<ServiceResult<Review[]>>
- getProjectReviews(projectId: string): Promise<ServiceResult<Review[]>>
- canUserReview(userId: string, contractId: string): Promise<ServiceResult<{ canReview: boolean; reason?: string }>>
```

**Key Logic:**
- Verify contract is completed
- Check user is contract party
- Prevent duplicate reviews
- Calculate aggregate ratings
- Link to blockchain reputation

---

### 3. Admin Service (`admin-service.ts`)

**Required Functions:**
```typescript
- getPlatformStats(): Promise<ServiceResult<PlatformStats>>
- getUserManagement(filters?: UserFilters): Promise<ServiceResult<UserManagementData>>
- suspendUser(userId: string, reason: string): Promise<ServiceResult<User>>
- unsuspendUser(userId: string): Promise<ServiceResult<User>>
- verifyUser(userId: string): Promise<ServiceResult<User>>
- getDisputeManagement(filters?: DisputeFilters): Promise<ServiceResult<DisputeManagementData>>
- getSystemHealth(): Promise<ServiceResult<SystemHealth>>
```

**Key Logic:**
- Aggregate platform metrics
- User status management
- Audit logging for admin actions
- System health checks
- Admin-only authorization

---

### 4. Transaction Service (`transaction-service.ts`)

**Required Functions:**
```typescript
- getUserTransactions(userId: string, options: TransactionOptions): Promise<ServiceResult<PaginatedResult<Transaction>>>
- getTransactionById(transactionId: string, userId: string): Promise<ServiceResult<Transaction>>
- getTransactionsByContract(contractId: string, userId: string): Promise<ServiceResult<Transaction[]>>
- recordTransaction(data: TransactionInput): Promise<ServiceResult<Transaction>>
```

**Key Logic:**
- Record all payment events
- Link to blockchain transactions
- Authorization checks
- Transaction history tracking
- Export formatting

---

### 5. Analytics Service (`analytics-service.ts`) ⚠️ NEW

**Required Functions:**
```typescript
- getFreelancerAnalytics(userId: string, options: DateRangeOptions): Promise<ServiceResult<FreelancerAnalytics>>
- getEmployerAnalytics(userId: string, options: DateRangeOptions): Promise<ServiceResult<EmployerAnalytics>>
- getSkillDemandTrends(): Promise<ServiceResult<SkillTrend[]>>
- getPlatformMetrics(): Promise<ServiceResult<PlatformMetrics>>
```

**Key Logic:**
```typescript
// FreelancerAnalytics
{
  totalEarnings: number;
  projectsCompleted: number;
  averageRating: number;
  earningsByMonth: { month: string; amount: number }[];
  topSkills: { skill: string; projectCount: number }[];
  proposalAcceptanceRate: number;
}

// EmployerAnalytics
{
  totalSpent: number;
  projectsPosted: number;
  projectsCompleted: number;
  averageProjectBudget: number;
  spendingByMonth: { month: string; amount: number }[];
  topHiredSkills: { skill: string; hireCount: number }[];
}

// SkillTrend
{
  skillId: string;
  skillName: string;
  demandLevel: 'high' | 'medium' | 'low';
  projectCount: number;
  averageBudget: number;
  growthRate: number;
}

// PlatformMetrics
{
  totalUsers: number;
  totalProjects: number;
  totalContracts: number;
  totalTransactionVolume: number;
  activeUsers: number;
  completionRate: number;
}
```

---

### 6. Favorite Service (`favorite-service.ts`) ⚠️ NEW

**Required Functions:**
```typescript
- addFavorite(userId: string, targetType: 'project' | 'freelancer', targetId: string): Promise<ServiceResult<Favorite>>
- removeFavorite(userId: string, targetType: 'project' | 'freelancer', targetId: string): Promise<ServiceResult<void>>
- getUserFavorites(userId: string, targetType?: 'project' | 'freelancer'): Promise<ServiceResult<Favorite[]>>
- isFavorited(userId: string, targetType: 'project' | 'freelancer', targetId: string): Promise<ServiceResult<boolean>>
```

**Key Logic:**
```typescript
// Add favorite
- Check if already favorited (prevent duplicates)
- Verify target exists
- Create favorite record
- Return favorite with target details

// Get favorites
- Fetch user's favorites
- Join with target tables (projects/users)
- Include target details in response
- Filter by target type if specified
```

---

### 7. Portfolio Service (`portfolio-service.ts`) ⚠️ NEW

**Required Functions:**
```typescript
- createPortfolioItem(freelancerId: string, data: PortfolioItemInput): Promise<ServiceResult<PortfolioItem>>
- updatePortfolioItem(portfolioId: string, userId: string, updates: Partial<PortfolioItemInput>): Promise<ServiceResult<PortfolioItem>>
- deletePortfolioItem(portfolioId: string, userId: string): Promise<ServiceResult<void>>
- getFreelancerPortfolio(freelancerId: string): Promise<ServiceResult<PortfolioItem[]>>
- getPortfolioItem(portfolioId: string): Promise<ServiceResult<PortfolioItem>>
```

**Key Logic:**
```typescript
// Create portfolio item
- Validate image URLs
- Verify skills exist
- Store portfolio item
- Return with full details

// Delete portfolio item
- Verify ownership
- Delete from database
- Clean up images from storage
- Return success

// Get portfolio
- Fetch all items for freelancer
- Order by created_at DESC
- Include image URLs
- Public access (no auth required)
```

---

### 8. Email Preference Service (`email-preference-service.ts`) ⚠️ NEW

**Required Functions:**
```typescript
- getEmailPreferences(userId: string): Promise<ServiceResult<EmailPreference>>
- updateEmailPreferences(userId: string, preferences: Partial<EmailPreference>): Promise<ServiceResult<EmailPreference>>
- unsubscribeAll(userId: string): Promise<ServiceResult<void>>
- shouldSendEmail(userId: string, emailType: EmailType): Promise<boolean>
```

**Key Logic:**
```typescript
// Get preferences
- Fetch user preferences
- Create default if doesn't exist
- Return preferences

// Update preferences
- Validate preference keys
- Update only provided fields
- Return updated preferences

// Unsubscribe all
- Set all email flags to false
- Keep only critical notifications
- Return success

// Should send email (helper)
- Check user preferences
- Return boolean for email type
- Used by notification service
```

---

### 9. Saved Search Service (`saved-search-service.ts`) ⚠️ NEW

**Required Functions:**
```typescript
- createSavedSearch(userId: string, data: SavedSearchInput): Promise<ServiceResult<SavedSearch>>
- getUserSavedSearches(userId: string, searchType?: 'project' | 'freelancer'): Promise<ServiceResult<SavedSearch[]>>
- updateSavedSearch(searchId: string, userId: string, updates: Partial<SavedSearchInput>): Promise<ServiceResult<SavedSearch>>
- deleteSavedSearch(searchId: string, userId: string): Promise<ServiceResult<void>>
- executeSavedSearch(searchId: string, userId: string): Promise<ServiceResult<any>>
```

**Key Logic:**
```typescript
// Create saved search
- Validate filters
- Store search with filters
- Return saved search

// Execute saved search
- Fetch saved search
- Verify ownership
- Apply filters to search service
- Return search results

// Notification logic (background job)
- Find searches with notifyOnNew = true
- Execute searches
- Compare with last results
- Send notifications for new matches
```

---

### 10. File Service (`file-service.ts`) ⚠️ NEW

**Required Functions:**
```typescript
- getUserFiles(userId: string, bucket?: string): Promise<ServiceResult<FileInfo[]>>
- deleteFile(userId: string, bucket: string, path: string): Promise<ServiceResult<void>>
- getFileQuota(userId: string): Promise<ServiceResult<FileQuota>>
```

**Key Logic:**
```typescript
// Get user files
- List files from Supabase Storage
- Filter by user folder
- Filter by bucket if specified
- Return file metadata

// Delete file
- Verify file ownership (path contains userId)
- Delete from Supabase Storage
- Return success

// Get file quota
- Calculate total file size for user
- Get quota limit from config
- Return usage and limit

// FileQuota type
{
  used: number;      // bytes used
  limit: number;     // bytes limit
  percentage: number; // usage percentage
  files: number;     // file count
}
```

---

## 🔧 Implementation Template

### Standard Service Function Pattern

```typescript
import { supabase } from '../config/supabase.js';
import { logger } from '../config/logger.js';

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export async function exampleFunction(
  param: string
): Promise<ServiceResult<ReturnType>> {
  try {
    // 1. Validate input
    if (!param) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Parameter is required',
        },
      };
    }

    // 2. Authorization check (if needed)
    // Verify user has permission

    // 3. Business logic
    const { data, error } = await supabase
      .from('table_name')
      .select('*')
      .eq('field', param)
      .single();

    if (error) {
      logger.error('Database error', { error, param });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch data',
        },
      };
    }

    if (!data) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
        },
      };
    }

    // 4. Transform data (if needed)
    const result = transformData(data);

    // 5. Return success
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    logger.error('Unexpected error', { error, param });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}
```

---

## 🧪 Testing Template

### Unit Test Pattern

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { exampleFunction } from '../example-service.js';

describe('ExampleService', () => {
  describe('exampleFunction', () => {
    it('should return data when valid input provided', async () => {
      const result = await exampleFunction('valid-id');
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should return error when invalid input provided', async () => {
      const result = await exampleFunction('');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return NOT_FOUND when resource does not exist', async () => {
      const result = await exampleFunction('non-existent-id');
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });
  });
});
```

---

## 📝 Implementation Priority

### High Priority (Week 1)
1. ✅ Favorite Service - Simple CRUD
2. ✅ Email Preference Service - Simple CRUD
3. ✅ File Service - Storage operations

### Medium Priority (Week 2)
4. ✅ Portfolio Service - With file handling
5. ✅ Saved Search Service - With search integration
6. ✅ Transaction Service - With blockchain integration

### Lower Priority (Week 3)
7. ✅ Analytics Service - Complex aggregations
8. ✅ Review Service - With reputation integration
9. ✅ Message Service - With real-time features
10. ✅ Admin Service - With audit logging

---

## ✅ Completion Checklist

For each service:
- [ ] All functions implemented
- [ ] Input validation added
- [ ] Authorization checks added
- [ ] Error handling implemented
- [ ] Logging added
- [ ] Unit tests written
- [ ] Integration tests written
- [ ] Documentation updated
- [ ] Code reviewed
- [ ] Deployed to staging

---

## 🚀 Quick Start

1. **Choose a service** from the priority list
2. **Create the file** in `src/services/`
3. **Copy the template** from above
4. **Implement functions** one by one
5. **Write tests** as you go
6. **Test locally** before committing
7. **Create PR** for review

---

## 📞 Need Help?

- Check existing services for patterns
- Review `src/services/project-service.ts` for complex examples
- Review `src/services/auth-service.ts` for auth patterns
- Consult team for architecture questions

---

**Let's build these services!** 💪
