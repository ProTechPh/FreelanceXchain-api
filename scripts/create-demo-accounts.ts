/**
 * Create demo accounts for all roles — KYC approved with profile details
 * Usage: npx tsx scripts/create-demo-accounts.ts
 */

import { Client, Users, Databases, ID } from 'node-appwrite';
import { config } from '../src/config/env.js';

const client = new Client()
  .setEndpoint(config.appwrite.endpoint)
  .setProject(config.appwrite.projectId)
  .setKey(config.appwrite.apiKey);

const users = new Users(client);
const databases = new Databases(client);

const DATABASE_ID = config.appwrite.databaseId || 'freelancexchain';
const DEMO_PASSWORD = 'Demo@12345';
const DIDIT_WORKFLOW_ID = process.env['DIDIT_WORKFLOW_ID'] || '63d835e4-d2f0-411d-abb7-4a62ad681c28';

// ─── Demo Account Definitions ────────────────────────────────────────────────

const FREELANCERS = [
  {
    email: 'freelancer1@demo.freelancexchain.com',
    name: 'Maria Santos',
    profile: {
      name: 'Maria Santos',
      nationality: 'Filipino',
      bio: 'Full-stack web developer with 5 years of experience in React, Node.js, and blockchain development. Passionate about building decentralized applications.',
      hourly_rate: 35,
      skills: JSON.stringify(['React', 'Node.js', 'Solidity', 'TypeScript', 'PostgreSQL']),
      experience: JSON.stringify([
        { title: 'Senior Web Developer', company: 'TechCorp', years: 3 },
        { title: 'Blockchain Developer', company: 'CryptoStartup', years: 2 },
      ]),
      availability: 'available',
    },
    kyc: { first_name: 'Maria', last_name: 'Santos', nationality: 'Filipino', document_type: 'passport', document_number: 'P1234567A' },
  },
  {
    email: 'freelancer2@demo.freelancexchain.com',
    name: 'Juan dela Cruz',
    profile: {
      name: 'Juan dela Cruz',
      nationality: 'Filipino',
      bio: 'UI/UX designer specializing in Web3 interfaces. Experienced in Figma, Adobe XD, and frontend frameworks.',
      hourly_rate: 28,
      skills: JSON.stringify(['Figma', 'Adobe XD', 'CSS', 'Tailwind', 'React']),
      experience: JSON.stringify([
        { title: 'UI/UX Designer', company: 'DesignHub', years: 4 },
      ]),
      availability: 'available',
    },
    kyc: { first_name: 'Juan', last_name: 'dela Cruz', nationality: 'Filipino', document_type: 'national_id', document_number: 'NID-9876543' },
  },
  {
    email: 'freelancer3@demo.freelancexchain.com',
    name: 'Ana Reyes',
    profile: {
      name: 'Ana Reyes',
      nationality: 'Filipino',
      bio: 'Smart contract auditor and Solidity developer. Previously audited DeFi protocols worth $50M+ TVL.',
      hourly_rate: 50,
      skills: JSON.stringify(['Solidity', 'Rust', 'Smart Contract Auditing', 'Hardhat', 'Foundry']),
      experience: JSON.stringify([
        { title: 'Smart Contract Auditor', company: 'AuditFirm', years: 3 },
        { title: 'Blockchain Developer', company: 'DeFi Protocol', years: 2 },
      ]),
      availability: 'available',
    },
    kyc: { first_name: 'Ana', last_name: 'Reyes', nationality: 'Filipino', document_type: 'passport', document_number: 'P7654321B' },
  },
];

const EMPLOYERS = [
  {
    email: 'employer1@demo.freelancexchain.com',
    name: 'TechVentures Inc.',
    profile: {
      name: 'TechVentures Inc.',
      nationality: 'Filipino',
      company_name: 'TechVentures Inc.',
      description: 'A leading tech company building Web3 solutions for the Philippine market. We hire top Filipino freelancers for blockchain projects.',
      industry: 'Technology',
    },
    kyc: { first_name: 'Carlos', last_name: 'Garcia', nationality: 'Filipino', document_type: 'passport', document_number: 'P1122334C' },
  },
  {
    email: 'employer2@demo.freelancexchain.com',
    name: 'BlockBuild PH',
    profile: {
      name: 'BlockBuild PH',
      nationality: 'Filipino',
      company_name: 'BlockBuild PH',
      description: 'Blockchain development studio specializing in DeFi and NFT platforms. Looking for talented developers and designers.',
      industry: 'Blockchain',
    },
    kyc: { first_name: 'Miguel', last_name: 'Torres', nationality: 'Filipino', document_type: 'national_id', document_number: 'NID-5566778' },
  },
  {
    email: 'employer3@demo.freelancexchain.com',
    name: 'CryptoPay Solutions',
    profile: {
      name: 'CryptoPay Solutions',
      nationality: 'Filipino',
      company_name: 'CryptoPay Solutions',
      description: 'Payment gateway provider enabling crypto payments for businesses. We need freelancers for integration and frontend work.',
      industry: 'Fintech',
    },
    kyc: { first_name: 'Elena', last_name: 'Cruz', nationality: 'Filipino', document_type: 'passport', document_number: 'P9988776D' },
  },
];

const ADMINS = [
  {
    email: 'admin1@demo.freelancexchain.com',
    name: 'Admin One',
    kyc: { first_name: 'Admin', last_name: 'One', nationality: 'Filipino', document_type: 'passport', document_number: 'A0000001' },
  },
  {
    email: 'admin2@demo.freelancexchain.com',
    name: 'Admin Two',
    kyc: { first_name: 'Admin', last_name: 'Two', nationality: 'Filipino', document_type: 'passport', document_number: 'A0000002' },
  },
  {
    email: 'admin3@demo.freelancexchain.com',
    name: 'Admin Three',
    kyc: { first_name: 'Admin', last_name: 'Three', nationality: 'Filipino', document_type: 'passport', document_number: 'A0000003' },
  },
];

// ─── Helper Functions ────────────────────────────────────────────────────────

async function createAppwriteUser(email: string, name: string): Promise<string | null> {
  try {
    const user = await users.create(ID.unique(), email, undefined, DEMO_PASSWORD, name);
    return user.$id;
  } catch (error: any) {
    if (error.code === 409) {
      // Already exists — try to find it
      try {
        const list = await users.list([], email);
        if (list.users.length > 0) {
          return list.users[0].$id;
        }
      } catch {}
      console.log(`  ⏭️  Appwrite user already exists but couldn't retrieve: ${email}`);
      return null;
    }
    throw error;
  }
}

async function createUserDocument(userId: string, email: string, role: string, name: string): Promise<boolean> {
  try {
    await databases.createDocument(DATABASE_ID, 'users', userId, {
      email: email.toLowerCase(),
      password_hash: '',
      role,
      wallet_address: '',
      name,
      is_suspended: false,
      mfa_enabled: false,
    });
    return true;
  } catch (error: any) {
    if (error.code === 409) {
      console.log(`  ⏭️  User document already exists: ${email}`);
      return true;
    }
    console.error(`  ❌ Failed to create user document: ${error.message}`);
    return false;
  }
}

async function createKycRecord(userId: string, kycData: any): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    await databases.createDocument(DATABASE_ID, 'kyc_verifications', ID.unique(), {
      user_id: userId,
      status: 'approved',
      didit_session_id: `demo-session-${userId.slice(0, 8)}`,
      didit_session_token: null,
      didit_session_url: null,
      didit_workflow_id: DIDIT_WORKFLOW_ID,
      decision: 'approved',
      document_type: kycData.document_type,
      document_number: kycData.document_number,
      first_name: kycData.first_name,
      last_name: kycData.last_name,
      nationality: kycData.nationality,
      document_verified: true,
      liveness_passed: true,
      face_matched: true,
      ip_address: '127.0.0.1',
      metadata: JSON.stringify({ demo: true }),
    });
    return true;
  } catch (error: any) {
    console.error(`  ❌ Failed to create KYC record: ${error.message}`);
    return false;
  }
}

async function createFreelancerProfile(userId: string, profile: any): Promise<boolean> {
  try {
    await databases.createDocument(DATABASE_ID, 'freelancer_profiles', ID.unique(), {
      user_id: userId,
      ...profile,
    });
    return true;
  } catch (error: any) {
    console.error(`  ❌ Failed to create freelancer profile: ${error.message}`);
    return false;
  }
}

async function createEmployerProfile(userId: string, profile: any): Promise<boolean> {
  try {
    await databases.createDocument(DATABASE_ID, 'employer_profiles', ID.unique(), {
      user_id: userId,
      ...profile,
    });
    return true;
  } catch (error: any) {
    console.error(`  ❌ Failed to create employer profile: ${error.message}`);
    return false;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Creating demo accounts...\n');
  console.log(`Password for all accounts: ${DEMO_PASSWORD}\n`);

  // Create freelancers
  console.log('═══ FREELANCERS ═══');
  for (const f of FREELANCERS) {
    console.log(`\n▶ ${f.email}`);
    const userId = await createAppwriteUser(f.email, f.name);
    if (!userId) continue;

    const dbOk = await createUserDocument(userId, f.email, 'freelancer', f.name);
    if (!dbOk) continue;

    await createKycRecord(userId, f.kyc);
    await createFreelancerProfile(userId, f.profile);
    console.log(`  ✅ Done — ${f.name} (KYC approved + profile)`);
  }

  // Create employers
  console.log('\n═══ EMPLOYERS ═══');
  for (const e of EMPLOYERS) {
    console.log(`\n▶ ${e.email}`);
    const userId = await createAppwriteUser(e.email, e.name);
    if (!userId) continue;

    const dbOk = await createUserDocument(userId, e.email, 'employer', e.name);
    if (!dbOk) continue;

    await createKycRecord(userId, e.kyc);
    await createEmployerProfile(userId, e.profile);
    console.log(`  ✅ Done — ${e.name} (KYC approved + profile)`);
  }

  // Create admins
  console.log('\n═══ ADMINS ═══');
  for (const a of ADMINS) {
    console.log(`\n▶ ${a.email}`);
    const userId = await createAppwriteUser(a.email, a.name);
    if (!userId) continue;

    const dbOk = await createUserDocument(userId, a.email, 'admin', a.name);
    if (!dbOk) continue;

    await createKycRecord(userId, a.kyc);
    console.log(`  ✅ Done — ${a.name} (KYC approved)`);
  }

  console.log('\n✨ All demo accounts created!\n');
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  LOGIN CREDENTIALS                                              │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log('│  Password (all accounts): Demo@12345                            │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log('│  FREELANCERS:                                                   │');
  console.log('│    freelancer1@demo.freelancexchain.com  (Maria Santos)         │');
  console.log('│    freelancer2@demo.freelancexchain.com  (Juan dela Cruz)       │');
  console.log('│    freelancer3@demo.freelancexchain.com  (Ana Reyes)            │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log('│  EMPLOYERS:                                                     │');
  console.log('│    employer1@demo.freelancexchain.com   (TechVentures Inc.)     │');
  console.log('│    employer2@demo.freelancexchain.com   (BlockBuild PH)         │');
  console.log('│    employer3@demo.freelancexchain.com   (CryptoPay Solutions)   │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log('│  ADMINS:                                                        │');
  console.log('│    admin1@demo.freelancexchain.com      (Admin One)             │');
  console.log('│    admin2@demo.freelancexchain.com      (Admin Two)             │');
  console.log('│    admin3@demo.freelancexchain.com      (Admin Three)           │');
  console.log('└─────────────────────────────────────────────────────────────────┘');

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
