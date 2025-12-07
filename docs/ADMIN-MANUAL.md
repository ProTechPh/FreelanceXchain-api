# Administrator Manual

## System Administration Guide

This guide covers system administration, deployment, and maintenance of the Blockchain Freelance Marketplace.

---

## System Requirements

### Server Requirements
- Node.js 18.x or higher
- npm 9.x or higher
- 2GB RAM minimum (4GB recommended)
- 10GB disk space

### External Services
- Azure Cosmos DB account
- Ethereum RPC endpoint (Infura, Alchemy, or self-hosted)
- Google Gemini API key (for AI features)

### Development Tools
- Hardhat (smart contract development)
- Ganache (local blockchain testing)

---

## Deployment Guide

### 1. Environment Setup

Create `.env` file with required variables:

```bash
# Server
PORT=3000
NODE_ENV=production

# Database
COSMOS_ENDPOINT=https://your-account.documents.azure.com:443/
COSMOS_KEY=your-primary-key
COSMOS_DATABASE=freelance-marketplace

# Authentication
JWT_SECRET=your-secure-secret-minimum-32-characters
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# AI Service (LLM)
LLM_API_KEY=your-llm-api-key
LLM_API_URL=https://your-llm-api-endpoint

# Blockchain
BLOCKCHAIN_RPC_URL=https://mainnet.infura.io/v3/your-project-id
BLOCKCHAIN_PRIVATE_KEY=deployer-wallet-private-key
```

### 2. Database Setup

Azure Cosmos DB collections are created automatically on first run. Recommended configuration:

**Partition Keys:**
| Collection | Partition Key |
|------------|---------------|
| users | /id |
| projects | /employerId |
| proposals | /projectId |
| contracts | /id |
| disputes | /contractId |
| notifications | /userId |
| skills | /categoryId |
| skill_categories | /id |

**Indexing Policy:**
- Include all properties for flexibility
- Add composite indexes for common queries
- Exclude large text fields from indexing if not searched

### 3. Smart Contract Deployment

**Deploy to Testnet (Sepolia):**
```bash
# Deploy reputation contract
npm run deploy:reputation

# Deploy escrow contract (for testing)
npm run deploy:escrow
```

**Deploy to Mainnet:**
1. Update `BLOCKCHAIN_RPC_URL` to mainnet endpoint
2. Ensure deployer wallet has sufficient ETH for gas
3. Run deployment scripts
4. Save contract addresses to `deployment.json`

### 4. Application Deployment

**Build and Start:**
```bash
npm install
npm run build
npm start
```

**Using PM2 (recommended for production):**
```bash
npm install -g pm2
pm2 start dist/index.js --name freelance-api
pm2 save
pm2 startup
```

**Docker Deployment:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

---

## Administration Tasks

### User Management

**Roles:**
- `freelancer` - Can create profile, submit proposals, work on contracts
- `employer` - Can create projects, hire freelancers, manage payments
- `admin` - Full system access, dispute resolution, skill management

**Admin Capabilities:**
- Create/manage skill categories and skills
- Resolve disputes as arbiter
- Access all system data
- Monitor platform activity

### Skill Taxonomy Management

**Create Category:**
```bash
POST /api/skills/categories
{
  "name": "Web Development",
  "description": "Frontend and backend web technologies"
}
```

**Create Skill:**
```bash
POST /api/skills
{
  "categoryId": "category-uuid",
  "name": "React.js",
  "description": "JavaScript library for building user interfaces"
}
```

**Deprecate Skill:**
```bash
PUT /api/skills/:id
{
  "isActive": false
}
```

### Dispute Resolution

As an arbiter, you can resolve disputes:

```bash
POST /api/disputes/:id/resolve
{
  "resolution": "in_favor_of_freelancer",
  "notes": "Evidence clearly shows work was completed as specified"
}
```

Resolution options:
- `in_favor_of_freelancer` - Releases milestone payment to freelancer
- `in_favor_of_employer` - Refunds milestone amount to employer

---

## Monitoring & Maintenance

### Health Checks

**API Health:**
```bash
GET /api/health
```

**Database Connection:**
- Monitor Cosmos DB metrics in Azure Portal
- Check RU consumption and throttling

**Blockchain Connection:**
- Verify RPC endpoint availability
- Monitor gas prices for transactions

### Logging

Application logs include:
- Request/response logging (request-logger middleware)
- Error tracking (error-handler middleware)
- Transaction logs for blockchain operations

**Log Levels:**
- `error` - Critical failures
- `warn` - Potential issues
- `info` - General operations
- `debug` - Detailed debugging (development only)

### Performance Monitoring

**Key Metrics:**
- API response times
- Database query latency
- Blockchain transaction confirmation times
- AI matching response times

**Optimization Tips:**
- Enable Cosmos DB indexing for frequently queried fields
- Implement caching for skill taxonomy (rarely changes)
- Use pagination for large result sets
- Monitor and adjust RU allocation based on usage

### Backup & Recovery

**Database Backup:**
- Enable Azure Cosmos DB continuous backup
- Configure point-in-time restore
- Export critical data periodically

**Smart Contract Data:**
- Blockchain data is inherently backed up (distributed)
- Keep deployment addresses and ABIs safe
- Document contract upgrade procedures

---

## Security Checklist

### Application Security
- [ ] JWT secret is strong (32+ characters)
- [ ] Environment variables not committed to git
- [ ] HTTPS enabled in production
- [ ] CORS configured for allowed origins only
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints

### Database Security
- [ ] Cosmos DB firewall configured
- [ ] Connection strings rotated regularly
- [ ] Minimal permissions for application identity
- [ ] Audit logging enabled

### Blockchain Security
- [ ] Private keys stored securely (not in code)
- [ ] Deployer wallet has minimal funds
- [ ] Smart contracts audited before mainnet
- [ ] Reentrancy protection verified

### Infrastructure Security
- [ ] Server firewall configured
- [ ] SSH key authentication only
- [ ] Regular security updates applied
- [ ] Monitoring and alerting configured

---

## Troubleshooting

### Common Issues

**Database Connection Failed:**
- Verify COSMOS_ENDPOINT and COSMOS_KEY
- Check firewall rules in Azure Portal
- Ensure database exists

**Blockchain Transaction Failed:**
- Check wallet balance for gas
- Verify RPC endpoint is responsive
- Check network congestion and gas prices

**AI Matching Not Working:**
- Verify LLM_API_KEY is valid
- Check LLM API quota limits
- System falls back to keyword matching if LLM unavailable

**JWT Token Invalid:**
- Check JWT_SECRET matches between instances
- Verify token hasn't expired
- Ensure clock sync between servers

### Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `COSMOS_CONNECTION_ERROR` | Database unreachable | Check connection string and firewall |
| `BLOCKCHAIN_RPC_ERROR` | RPC endpoint failed | Verify endpoint URL and API key |
| `INSUFFICIENT_GAS` | Not enough ETH for transaction | Fund deployer wallet |
| `CONTRACT_REVERT` | Smart contract rejected transaction | Check contract state and parameters |
| `AI_SERVICE_UNAVAILABLE` | LLM API unreachable | Check API key and quota |

---

## Scaling Considerations

### Horizontal Scaling
- Application is stateless, can run multiple instances
- Use load balancer for distribution
- Cosmos DB handles concurrent connections

### Database Scaling
- Increase RU allocation for higher throughput
- Consider partitioning strategy for large datasets
- Enable autoscale for variable workloads

### Blockchain Scaling
- Consider Layer 2 solutions for high transaction volume
- Batch operations where possible
- Monitor gas costs and optimize contract calls
