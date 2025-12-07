# User Manual

## Blockchain-Based Freelance Marketplace

This guide explains how to use the freelance marketplace platform as either a Freelancer or an Employer.

---

## Getting Started

### 1. Registration

Create an account by providing:
- Email address
- Password (minimum 8 characters)
- Role selection: **Freelancer** or **Employer**

After registration, you'll receive authentication tokens to access the platform.

### 2. Login

Use your email and password to log in. You'll receive:
- **Access Token**: Valid for 1 hour, used for API requests
- **Refresh Token**: Valid for 7 days, used to get new access tokens

---

## For Freelancers

### Setting Up Your Profile

1. **Create Profile**
   - Add a professional bio describing your expertise
   - Set your hourly rate
   - Set availability status (available, busy, unavailable)

2. **Add Skills**
   - Browse available skill categories
   - Add relevant skills with years of experience
   - More skills = better matching with projects

3. **Add Work Experience**
   - List previous jobs/projects
   - Include company name, role, and description
   - Add start and end dates

### Finding Projects

1. **Browse Open Projects**
   - View all available projects
   - Filter by skills, budget range, or deadline

2. **AI-Powered Recommendations**
   - Get personalized project recommendations
   - See match scores based on your skills
   - Identify skill gaps for each project

3. **Search Projects**
   - Search by keywords
   - Filter by required skills
   - Sort by budget or deadline

### Submitting Proposals

1. **Write a Proposal**
   - Select a project you're interested in
   - Write a compelling cover letter
   - Propose your rate (can differ from project budget)
   - Estimate completion duration
   - Optionally suggest milestone breakdown

2. **Track Proposals**
   - View all your submitted proposals
   - Check status: pending, accepted, rejected, withdrawn
   - Withdraw proposals if needed

### Working on Contracts

When your proposal is accepted:

1. **Contract Created**
   - A contract is automatically created
   - Employer deposits funds to escrow smart contract
   - Milestones are defined with amounts and deadlines

2. **Complete Milestones**
   - Work on each milestone
   - Submit milestone for review when complete
   - Wait for employer approval

3. **Receive Payment**
   - Upon approval, payment is automatically released
   - ETH transferred directly to your wallet
   - No platform holds your funds

### Handling Disputes

If there's a disagreement:

1. **Raise a Dispute**
   - Dispute a milestone if employer unfairly rejects
   - Provide reason and description

2. **Submit Evidence**
   - Upload screenshots, documents, or links
   - Describe how evidence supports your case

3. **Resolution**
   - Arbiter reviews the case
   - Decision releases funds to appropriate party

### Building Reputation

1. **Receive Ratings**
   - Employers rate you after contract completion
   - Ratings are stored on blockchain (immutable)

2. **View Your Reputation**
   - See average rating (1-5 stars)
   - Read comments from employers
   - View complete work history

---

## For Employers

### Setting Up Your Profile

1. **Create Company Profile**
   - Add company name and description
   - Include website URL
   - Specify industry

### Posting Projects

1. **Create a Project**
   - Write clear title and description
   - Specify required skills
   - Set budget and deadline
   - Define milestones with amounts

2. **Milestone Planning**
   - Break project into phases
   - Assign budget to each milestone
   - Set due dates for deliverables

### Finding Freelancers

1. **Wait for Proposals**
   - Freelancers will submit proposals
   - Receive notifications for new proposals

2. **AI-Powered Recommendations**
   - Get recommended freelancers for your project
   - See match scores and skill alignment
   - Review freelancer profiles and ratings

3. **Search Freelancers**
   - Search by skills
   - Filter by hourly rate
   - Check availability status

### Managing Proposals

1. **Review Proposals**
   - Read cover letters
   - Compare proposed rates
   - Check freelancer profiles and ratings

2. **Accept or Reject**
   - Accept the best proposal
   - Optionally provide feedback on rejections
   - Contract is created upon acceptance

### Managing Contracts

1. **Fund Escrow**
   - Deposit project funds to smart contract
   - Funds are held securely until milestones complete

2. **Review Milestones**
   - Freelancer submits completed work
   - Review deliverables
   - Approve to release payment

3. **Approve or Dispute**
   - Approve if work meets requirements
   - Dispute if there are issues
   - Provide clear feedback

### Rating Freelancers

After contract completion:

1. **Submit Rating**
   - Rate 1-5 stars
   - Write a review comment
   - Rating stored permanently on blockchain

---

## Notifications

Stay informed with notifications for:

- New proposal received (Employer)
- Proposal accepted/rejected (Freelancer)
- Milestone submitted for review (Employer)
- Milestone approved (Freelancer)
- Payment released (Freelancer)
- Dispute created (Both parties)
- Dispute resolved (Both parties)
- New rating received (Both parties)

### Managing Notifications

- View all notifications
- Filter unread only
- Mark as read individually or all at once
- Check unread count

---

## Wallet & Payments

### Connecting Your Wallet

- Provide your Ethereum wallet address during registration
- Used for receiving/sending payments
- Supports any EVM-compatible wallet (MetaMask, etc.)

### How Escrow Works

1. **Employer deposits** full project amount to escrow contract
2. **Funds are locked** until milestones are approved
3. **Upon approval**, funds automatically transfer to freelancer
4. **Disputes** are resolved by designated arbiter
5. **No intermediary** holds your funds - it's all on-chain

### Supported Networks

- Ethereum Mainnet (production)
- Sepolia Testnet (testing)
- Local Ganache (development)

---

## Tips for Success

### For Freelancers

- Keep your profile complete and up-to-date
- Add all relevant skills with accurate experience levels
- Write personalized cover letters for each proposal
- Communicate clearly about deliverables
- Submit milestones on time
- Build your on-chain reputation

### For Employers

- Write detailed project descriptions
- Define clear milestones and expectations
- Respond to proposals promptly
- Provide constructive feedback
- Rate freelancers fairly after completion

---

## Troubleshooting

### Common Issues

**Can't log in?**
- Check email and password
- Use refresh token if access token expired

**Proposal not submitting?**
- Ensure you have a complete freelancer profile
- Check if project is still open

**Payment not received?**
- Verify wallet address is correct
- Check blockchain transaction status
- Ensure milestone was approved

**Dispute not resolved?**
- Submit clear evidence
- Wait for arbiter review
- Contact support if delayed

---

## Support

For technical issues or questions:
- Check API documentation at `/api-docs`
- Review error messages for guidance
- Contact platform administrators
