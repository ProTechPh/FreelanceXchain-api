/**
 * Seed Script - Populate database with sample data
 * 
 * Run: npx tsx scripts/seed-data.ts
 * 
 * Requirements: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY
 * Optional: APPWRITE_DATABASE_ID (defaults to 'freelancexchain')
 */

import dotenv from 'dotenv';
dotenv.config();

import { Client, Databases, ID, Permission, Role } from 'node-appwrite';

const ENDPOINT = process.env['APPWRITE_ENDPOINT']!;
const PROJECT_ID = process.env['APPWRITE_PROJECT_ID']!;
const API_KEY = process.env['APPWRITE_API_KEY']!;
const DATABASE_ID = process.env['APPWRITE_DATABASE_ID'] || 'freelancexchain';

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error('Missing required env vars: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

// ─── Sample Data ─────────────────────────────────────────────────────────────

const now = () => new Date().toISOString();
const futureDate = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

// Skill categories
const skillCategories = [
  { id: 'cat-1', name: 'Blockchain', description: 'Blockchain development skills', is_active: true },
  { id: 'cat-2', name: 'Frontend', description: 'Frontend development skills', is_active: true },
  { id: 'cat-3', name: 'Backend', description: 'Backend development skills', is_active: true },
  { id: 'cat-4', name: 'Design', description: 'Design and UI/UX skills', is_active: true },
];

// Skills
const skills = [
  { id: 'skill-1', category_id: 'cat-1', name: 'Solidity', description: 'Smart contract development', is_active: true },
  { id: 'skill-2', category_id: 'cat-1', name: 'Rust', description: 'Systems programming', is_active: true },
  { id: 'skill-3', category_id: 'cat-1', name: 'Hardhat', description: 'Ethereum development environment', is_active: true },
  { id: 'skill-4', category_id: 'cat-2', name: 'React', description: 'Frontend library', is_active: true },
  { id: 'skill-5', category_id: 'cat-2', name: 'TypeScript', description: 'Type-safe JavaScript', is_active: true },
  { id: 'skill-6', category_id: 'cat-2', name: 'Tailwind CSS', description: 'Utility-first CSS framework', is_active: true },
  { id: 'skill-7', category_id: 'cat-3', name: 'Node.js', description: 'JavaScript runtime', is_active: true },
  { id: 'skill-8', category_id: 'cat-3', name: 'Python', description: 'Programming language', is_active: true },
  { id: 'skill-9', category_id: 'cat-4', name: 'Figma', description: 'UI/UX design tool', is_active: true },
  { id: 'skill-10', category_id: 'cat-4', name: 'UI/UX Design', description: 'User interface design', is_active: true },
];

// Users (Employers)
const employerUsers = [
  {
    id: 'employer-1',
    email: 'sarah@techcorp.com',
    password_hash: '',
    name: 'Sarah Chen',
    role: 'employer',
    wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8bE28',
    is_suspended: false,
    suspension_reason: null,
    mfa_enabled: false,
  },
  {
    id: 'employer-2',
    email: 'mike@blockchain.io',
    password_hash: '',
    name: 'Mike Johnson',
    role: 'employer',
    wallet_address: '0x8Ba1f109551bD432803012645Hac13652c22BF79',
    is_suspended: false,
    suspension_reason: null,
    mfa_enabled: false,
  },
  {
    id: 'employer-3',
    email: 'alex@defi.finance',
    password_hash: '',
    name: 'Alex Rivera',
    role: 'employer',
    wallet_address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    is_suspended: false,
    suspension_reason: null,
    mfa_enabled: false,
  },
];

// Freelancer Users
const freelancerUsers = [
  {
    id: 'freelancer-1',
    email: 'ana@freelance.com',
    password_hash: '',
    name: 'Ana Reyes',
    role: 'freelancer',
    wallet_address: '0x2546BcD3a805442D0bf58d50f1b29A7e3cf175b9',
    is_suspended: false,
    suspension_reason: null,
    mfa_enabled: false,
  },
  {
    id: 'freelancer-2',
    email: 'juan@web3.dev',
    password_hash: '',
    name: 'Juan dela Cruz',
    role: 'freelancer',
    wallet_address: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    is_suspended: false,
    suspension_reason: null,
    mfa_enabled: false,
  },
  {
    id: 'freelancer-3',
    email: 'maria@fullstack.io',
    password_hash: '',
    name: 'Maria Santos',
    role: 'freelancer',
    wallet_address: '0x617F2E2fD72FD9D5503197092aC168c91465E7f2',
    is_suspended: false,
    suspension_reason: null,
    mfa_enabled: false,
  },
];

// Freelancer Profiles
const freelancerProfiles = [
  {
    id: 'profile-1',
    user_id: 'freelancer-1',
    name: 'Ana Reyes',
    nationality: 'Filipino',
    bio: 'Smart contract auditor and Solidity developer. Previously audited DeFi protocols worth $50M+ TVL.',
    hourly_rate: 50,
    skills: JSON.stringify([
      { name: 'Solidity', years_of_experience: 5 },
      { name: 'Rust', years_of_experience: 3 },
      { name: 'Smart Contract Auditing', years_of_experience: 4 },
      { name: 'Hardhat', years_of_experience: 5 },
    ]),
    experience: JSON.stringify([
      {
        id: 'exp-1',
        title: 'Senior Smart Contract Developer',
        company: 'DeFi Protocol Inc.',
        description: 'Led security audits for multiple DeFi protocols',
        start_date: '2022-01-01',
        end_date: null,
      },
    ]),
    availability: 'available',
  },
  {
    id: 'profile-2',
    user_id: 'freelancer-2',
    name: 'Juan dela Cruz',
    nationality: 'Filipino',
    bio: 'UI/UX designer specializing in Web3 interfaces. Experienced in Figma, Adobe XD, and frontend frameworks.',
    hourly_rate: 28,
    skills: JSON.stringify([
      { name: 'Figma', years_of_experience: 4 },
      { name: 'Adobe XD', years_of_experience: 3 },
      { name: 'CSS', years_of_experience: 5 },
      { name: 'Tailwind', years_of_experience: 4 },
    ]),
    experience: JSON.stringify([
      {
        id: 'exp-2',
        title: 'UI/UX Designer',
        company: 'CryptoDesign Studio',
        description: 'Designed intuitive interfaces for Web3 applications',
        start_date: '2021-06-01',
        end_date: null,
      },
    ]),
    availability: 'available',
  },
  {
    id: 'profile-3',
    user_id: 'freelancer-3',
    name: 'Maria Santos',
    nationality: 'Filipino',
    bio: 'Full-stack web developer with 5 years of experience in React, Node.js, and blockchain development. Passionate about building decentralized applications.',
    hourly_rate: 35,
    skills: JSON.stringify([
      { name: 'React', years_of_experience: 5 },
      { name: 'Node.js', years_of_experience: 5 },
      { name: 'Solidity', years_of_experience: 3 },
      { name: 'TypeScript', years_of_experience: 4 },
      { name: 'PostgreSQL', years_of_experience: 4 },
    ]),
    experience: JSON.stringify([
      {
        id: 'exp-3',
        title: 'Senior Web Developer',
        company: 'TechCorp',
        description: 'Full-stack development for enterprise applications',
        start_date: '2023-01-01',
        end_date: null,
      },
    ]),
    availability: 'available',
  },
];

// Employer Profiles
const employerProfiles = [
  {
    id: 'employer-profile-1',
    user_id: 'employer-1',
    name: 'Sarah Chen',
    nationality: 'Singaporean',
    company_name: 'TechCorp',
    description: 'Leading technology company specializing in blockchain solutions',
    industry: 'Technology',
  },
  {
    id: 'employer-profile-2',
    user_id: 'employer-2',
    name: 'Mike Johnson',
    nationality: 'American',
    company_name: 'Blockchain.io',
    description: 'Innovative blockchain startup focused on DeFi',
    industry: 'Finance',
  },
  {
    id: 'employer-profile-3',
    user_id: 'employer-3',
    name: 'Alex Rivera',
    nationality: 'Filipino',
    company_name: 'DeFi Finance',
    description: 'Decentralized finance platform for the future',
    industry: 'DeFi',
  },
];

// Projects
const projects = [
  {
    id: 'project-1',
    employer_id: 'employer-1',
    title: 'Build a Decentralized Exchange (DEX) Frontend',
    description: 'Looking for an experienced React developer to build a modern, responsive frontend for our DEX. The interface should support token swapping, liquidity pool visualization, and portfolio tracking. Must integrate with Web3 wallets like MetaMask and WalletConnect.',
    required_skills: JSON.stringify([
      { skill_id: 'skill-4', skill_name: 'React', category_id: 'cat-2', years_of_experience: 3 },
      { skill_id: 'skill-5', skill_name: 'TypeScript', category_id: 'cat-2', years_of_experience: 2 },
    ]),
    budget: 8000,
    deadline: futureDate(45),
    is_rush: false,
    rush_fee_percentage: 25,
    status: 'open',
    milestones: JSON.stringify([
      { id: 'm1', title: 'UI Design & Components', description: 'Create wireframes and reusable components', amount: 2000, due_date: futureDate(15), status: 'pending' },
      { id: 'm2', title: 'Core Functionality', description: 'Implement token swap and wallet integration', amount: 3000, due_date: futureDate(30), status: 'pending' },
      { id: 'm3', title: 'Testing & Deployment', description: 'QA testing and production deployment', amount: 3000, due_date: futureDate(45), status: 'pending' },
    ]),
    freelancer_limit: 1,
    tags: JSON.stringify(['DeFi', 'React', 'Web3']),
    attachments: JSON.stringify([]),
  },
  {
    id: 'project-2',
    employer_id: 'employer-2',
    title: 'Smart Contract Audit for DeFi Protocol',
    description: 'Need a thorough security audit of our Solidity smart contracts. The protocol handles over $10M in TVL and includes lending, borrowing, and liquidation mechanisms. Must provide detailed vulnerability report with remediation recommendations.',
    required_skills: JSON.stringify([
      { skill_id: 'skill-1', skill_name: 'Solidity', category_id: 'cat-1', years_of_experience: 4 },
      { skill_id: 'skill-3', skill_name: 'Hardhat', category_id: 'cat-1', years_of_experience: 3 },
    ]),
    budget: 15000,
    deadline: futureDate(30),
    is_rush: true,
    rush_fee_percentage: 50,
    status: 'open',
    milestones: JSON.stringify([
      { id: 'm4', title: 'Initial Assessment', description: 'Review contract architecture', amount: 5000, due_date: futureDate(10), status: 'pending' },
      { id: 'm5', title: 'Deep Analysis', description: 'Line-by-line security review', amount: 7000, due_date: futureDate(20), status: 'pending' },
      { id: 'm6', title: 'Report & Remediation', description: 'Final report with fixes', amount: 3000, due_date: futureDate(30), status: 'pending' },
    ]),
    freelancer_limit: 1,
    tags: JSON.stringify(['Security', 'Audit', 'Solidity']),
    attachments: JSON.stringify([]),
  },
  {
    id: 'project-3',
    employer_id: 'employer-3',
    title: 'NFT Marketplace Development',
    description: 'Build a full-stack NFT marketplace with minting, buying, selling, and auction features. Need both frontend and backend development with IPFS integration for metadata storage. Must support multiple blockchain networks.',
    required_skills: JSON.stringify([
      { skill_id: 'skill-4', skill_name: 'React', category_id: 'cat-2', years_of_experience: 3 },
      { skill_id: 'skill-7', skill_name: 'Node.js', category_id: 'cat-3', years_of_experience: 3 },
      { skill_id: 'skill-1', skill_name: 'Solidity', category_id: 'cat-1', years_of_experience: 2 },
    ]),
    budget: 12000,
    deadline: futureDate(60),
    is_rush: false,
    rush_fee_percentage: 25,
    status: 'open',
    milestones: JSON.stringify([
      { id: 'm7', title: 'Smart Contracts', description: 'NFT and marketplace contracts', amount: 4000, due_date: futureDate(20), status: 'pending' },
      { id: 'm8', title: 'Backend API', description: 'REST API and IPFS integration', amount: 4000, due_date: futureDate(40), status: 'pending' },
      { id: 'm9', title: 'Frontend UI', description: 'Complete marketplace interface', amount: 4000, due_date: futureDate(60), status: 'pending' },
    ]),
    freelancer_limit: 2,
    tags: JSON.stringify(['NFT', 'Marketplace', 'Full-Stack']),
    attachments: JSON.stringify([]),
  },
  {
    id: 'project-4',
    employer_id: 'employer-1',
    title: 'DAO Governance Dashboard',
    description: 'Create a comprehensive governance dashboard for our DAO. Features include proposal creation, voting interface, treasury visualization, and member management. Must be intuitive for non-technical users.',
    required_skills: JSON.stringify([
      { skill_id: 'skill-4', skill_name: 'React', category_id: 'cat-2', years_of_experience: 4 },
      { skill_id: 'skill-9', skill_name: 'Figma', category_id: 'cat-4', years_of_experience: 3 },
      { skill_id: 'skill-10', skill_name: 'UI/UX Design', category_id: 'cat-4', years_of_experience: 3 },
    ]),
    budget: 6500,
    deadline: futureDate(40),
    is_rush: false,
    rush_fee_percentage: 25,
    status: 'open',
    milestones: JSON.stringify([
      { id: 'm10', title: 'Design System', description: 'Create design tokens and components', amount: 2000, due_date: futureDate(15), status: 'pending' },
      { id: 'm11', title: 'Proposal & Voting UI', description: 'Core governance features', amount: 2500, due_date: futureDate(30), status: 'pending' },
      { id: 'm12', title: 'Treasury & Members', description: 'Dashboard analytics', amount: 2000, due_date: futureDate(40), status: 'pending' },
    ]),
    freelancer_limit: 1,
    tags: JSON.stringify(['DAO', 'Governance', 'Dashboard']),
    attachments: JSON.stringify([]),
  },
  {
    id: 'project-5',
    employer_id: 'employer-2',
    title: 'Cross-Chain Bridge UI',
    description: 'Design and develop a user-friendly interface for our cross-chain bridge. Should support multiple networks (Ethereum, Polygon, BSC) with real-time fee estimation and transaction tracking.',
    required_skills: JSON.stringify([
      { skill_id: 'skill-4', skill_name: 'React', category_id: 'cat-2', years_of_experience: 3 },
      { skill_id: 'skill-6', skill_name: 'Tailwind CSS', category_id: 'cat-2', years_of_experience: 2 },
      { skill_id: 'skill-5', skill_name: 'TypeScript', category_id: 'cat-2', years_of_experience: 3 },
    ]),
    budget: 5500,
    deadline: futureDate(35),
    is_rush: false,
    rush_fee_percentage: 25,
    status: 'open',
    milestones: JSON.stringify([
      { id: 'm13', title: 'UI Design', description: 'Wireframes and visual design', amount: 1500, due_date: futureDate(10), status: 'pending' },
      { id: 'm14', title: 'Bridge Interface', description: 'Network selection and swap UI', amount: 2500, due_date: futureDate(25), status: 'pending' },
      { id: 'm15', title: 'Transaction Tracking', description: 'Status and history views', amount: 1500, due_date: futureDate(35), status: 'pending' },
    ]),
    freelancer_limit: 1,
    tags: JSON.stringify(['Bridge', 'Cross-Chain', 'UI']),
    attachments: JSON.stringify([]),
  },
  {
    id: 'project-6',
    employer_id: 'employer-3',
    title: 'DeFi Yield Aggregator',
    description: 'Develop a yield aggregator that automatically moves funds between different DeFi protocols to maximize returns. Need both smart contracts and a monitoring dashboard.',
    required_skills: JSON.stringify([
      { skill_id: 'skill-1', skill_name: 'Solidity', category_id: 'cat-1', years_of_experience: 4 },
      { skill_id: 'skill-7', skill_name: 'Node.js', category_id: 'cat-3', years_of_experience: 3 },
      { skill_id: 'skill-4', skill_name: 'React', category_id: 'cat-2', years_of_experience: 2 },
    ]),
    budget: 18000,
    deadline: futureDate(75),
    is_rush: false,
    rush_fee_percentage: 25,
    status: 'open',
    milestones: JSON.stringify([
      { id: 'm16', title: 'Strategy Design', description: 'Yield optimization algorithms', amount: 4000, due_date: futureDate(15), status: 'pending' },
      { id: 'm17', title: 'Smart Contracts', description: 'Vault and strategy contracts', amount: 6000, due_date: futureDate(40), status: 'pending' },
      { id: 'm18', title: 'Backend & API', description: 'Monitoring and automation', amount: 4000, due_date: futureDate(60), status: 'pending' },
      { id: 'm19', title: 'Dashboard', description: 'Analytics and visualization', amount: 4000, due_date: futureDate(75), status: 'pending' },
    ]),
    freelancer_limit: 2,
    tags: JSON.stringify(['DeFi', 'Yield', 'Aggregator']),
    attachments: JSON.stringify([]),
  },
];

// ─── Seed Functions ──────────────────────────────────────────────────────────

async function seedCollection(collectionId: string, documents: Record<string, unknown>[], name: string) {
  console.log(`\n📦 Seeding ${name}...`);
  let created = 0;
  let skipped = 0;

  for (const doc of documents) {
    const { id: docId, created_at: _ca, updated_at: _ua, ...data } = doc;
    try {
      await db.createDocument(DATABASE_ID, collectionId, docId as string, data);
      created++;
    } catch (e: any) {
      if (e?.code === 409) {
        skipped++;
      } else {
        console.error(`  ✗ Failed to create ${docId}:`, e?.message || e);
      }
    }
  }

  console.log(`  ✓ Created: ${created}, Skipped: ${skipped}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== FreelanceXchain - Data Seeding ===\n');
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Project:  ${PROJECT_ID}`);
  console.log(`Database: ${DATABASE_ID}\n`);

  // Seed skill categories
  await seedCollection('skill_categories', skillCategories, 'Skill Categories');

  // Seed skills
  await seedCollection('skills', skills, 'Skills');

  // Seed users
  await seedCollection('users', [...employerUsers, ...freelancerUsers], 'Users');

  // Seed freelancer profiles
  await seedCollection('freelancer_profiles', freelancerProfiles, 'Freelancer Profiles');

  // Seed employer profiles
  await seedCollection('employer_profiles', employerProfiles, 'Employer Profiles');

  // Seed projects
  await seedCollection('projects', projects, 'Projects');

  console.log('\n=== Seeding complete! ===');
  console.log(`\n📊 Summary:`);
  console.log(`  • ${skillCategories.length} skill categories`);
  console.log(`  • ${skills.length} skills`);
  console.log(`  • ${employerUsers.length + freelancerUsers.length} users`);
  console.log(`  • ${freelancerProfiles.length} freelancer profiles`);
  console.log(`  • ${employerProfiles.length} employer profiles`);
  console.log(`  • ${projects.length} projects`);
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
