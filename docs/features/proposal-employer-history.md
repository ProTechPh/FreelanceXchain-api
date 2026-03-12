# Proposal with Employer History

## Overview

Kapag nagview ng proposal, makikita ng freelancer ang employer's track record para mas informed ang decision nila. This feature provides transparency and helps freelancers assess the reliability of potential employers.

## Feature Details

### What Information is Shown

Kapag mag-view ang freelancer ng proposal, makikita niya ang:

1. **Completed Projects Count** - Ilang projects na ang natapos ng employer
2. **Average Rating** - Average rating ng employer from previous freelancers (0-5 stars)
3. **Review Count** - Total number of reviews received
4. **Company Name** - Employer's company name
5. **Industry** - Employer's industry/sector

### API Endpoint

```
GET /api/proposals/{id}/with-employer-history
```

**Authentication Required:** Yes (Freelancer role only)

**Parameters:**
- `id` (path parameter) - Proposal ID (UUID)

**Response Example:**

```json
{
  "proposal": {
    "id": "proposal-uuid",
    "projectId": "project-uuid",
    "freelancerId": "freelancer-uuid",
    "proposedRate": 5000,
    "estimatedDuration": 30,
    "status": "pending",
    "attachments": [...],
    "createdAt": "2026-03-12T10:00:00Z",
    "updatedAt": "2026-03-12T10:00:00Z"
  },
  "project": {
    "id": "project-uuid",
    "title": "E-commerce Website Development",
    "description": "Build a modern e-commerce platform",
    "employerId": "employer-uuid",
    ...
  },
  "employerHistory": {
    "completedProjectsCount": 15,
    "averageRating": 4.7,
    "reviewCount": 12,
    "companyName": "Tech Solutions Inc.",
    "industry": "Technology"
  }
}
```

### Authorization

- Only the freelancer who submitted the proposal can view employer history
- Employers cannot view their own history through this endpoint
- Admins are not allowed to use this endpoint (freelancer-specific feature)

### Use Cases

1. **Assessing Employer Reliability**
   - Freelancer checks if employer has completed projects before
   - High completion rate = reliable employer

2. **Rating-Based Decision Making**
   - Freelancer sees average rating from previous freelancers
   - Low ratings may indicate payment issues or difficult working conditions

3. **Company Verification**
   - Freelancer verifies company name and industry
   - Helps identify legitimate businesses vs. suspicious accounts

4. **Risk Assessment**
   - New employers (0 completed projects) = higher risk
   - Established employers with good ratings = lower risk

## Implementation Details

### Service Layer

The `getProposalWithEmployerHistory()` function in `proposal-service.ts`:

1. Fetches the proposal by ID
2. Gets the associated project to find the employer
3. Queries all contracts by employer and filters for completed ones
4. Calculates average rating from reviews
5. Fetches employer profile information
6. Returns combined data

### Database Queries

- `contractRepository.getContractsByEmployer()` - Get all employer contracts
- `ReviewRepository.getAverageRating()` - Calculate average rating
- `employerProfileRepository.getProfileByUserId()` - Get employer profile

### Performance Considerations

- Multiple database queries are executed
- Consider caching employer history for frequently viewed proposals
- Rating calculation is done in the repository layer for efficiency

## Security & Privacy

### What's Protected

- Only proposal owner (freelancer) can view employer history
- Employer's personal information is not exposed
- Only aggregated statistics are shown (not individual reviews)

### What's Public

- Completed project count
- Average rating (aggregated)
- Company name and industry (already public in profile)

## Future Enhancements

1. **Detailed Project History**
   - Show list of completed project titles
   - Display project categories/types

2. **Payment Reliability Score**
   - Track on-time payment percentage
   - Show average payment delay

3. **Dispute History**
   - Number of disputes filed
   - Dispute resolution outcomes

4. **Response Time Metrics**
   - Average time to respond to proposals
   - Average time to approve milestones

5. **Caching Layer**
   - Cache employer history for 1 hour
   - Invalidate cache when new reviews are added

## Testing

To test this feature:

```bash
# 1. Create an employer account
# 2. Create and complete some projects
# 3. Get reviews from freelancers
# 4. Submit a proposal as a freelancer
# 5. View proposal with employer history

curl -X GET \
  http://localhost:7860/api/proposals/{proposal-id}/with-employer-history \
  -H "Authorization: Bearer {freelancer-token}"
```

## Related Features

- [Proposal Management](./proposal-management.md)
- [Review System](./review-system.md)
- [Employer Profiles](./employer-profiles.md)
- [Contract Management](./contract-management.md)
