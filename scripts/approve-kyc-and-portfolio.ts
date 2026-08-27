import dotenv from 'dotenv';
dotenv.config();

import { Client, Databases, Query, ID } from 'node-appwrite';

const ENDPOINT = process.env['APPWRITE_ENDPOINT']!;
const PROJECT_ID = process.env['APPWRITE_PROJECT_ID']!;
const API_KEY = process.env['APPWRITE_API_KEY']!;
const DATABASE_ID = process.env['APPWRITE_DATABASE_ID'] || 'freelancexchain';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function run() {
  const email = 'jerickogarcia0@gmail.com';
  console.log(`Searching for user: ${email}...`);

  const userRes = await db.listDocuments(DATABASE_ID, 'users', [
    Query.equal('email', email),
    Query.limit(1),
  ]);

  if (userRes.documents.length === 0) {
    console.error(`User with email ${email} not found.`);
    return;
  }

  const userDoc = userRes.documents[0]!;
  const userId = userDoc.$id;
  console.log(`✓ User found: ${userDoc.name || 'User'} (ID: ${userId})`);

  // Inspect kyc_verifications attributes
  const kycAttrs = await db.listAttributes(DATABASE_ID, 'kyc_verifications');
  const allowedKycKeys = new Set(kycAttrs.attributes.map((a: any) => a.key));
  console.log('Allowed KYC attributes:', Array.from(allowedKycKeys));

  const now = new Date().toISOString();
  const rawKycData: Record<string, any> = {
    user_id: userId,
    status: 'approved',
    didit_session_id: `didit_manual_${Date.now()}`,
    didit_session_token: 'token_approved',
    didit_session_url: 'https://verification.didit.me/completed',
    didit_workflow_id: '63d835e4-d2f0-411d-abb7-4a62ad681c28',
    first_name: 'Jericko',
    last_name: 'Garcia',
    nationality: 'PH',
    decision: 'approved',
    document_type: 'PASSPORT',
    document_number: 'P1234567A',
    issuing_country: 'PH',
    document_verified: true,
    liveness_passed: true,
    face_matched: true,
    decline_reasons: JSON.stringify([]),
    review_reasons: JSON.stringify([]),
    metadata: JSON.stringify({ verified: true, method: 'admin_approval' }),
    created_at: now,
    updated_at: now,
  };

  const filteredKycData: Record<string, any> = {};
  for (const [k, v] of Object.entries(rawKycData)) {
    if (allowedKycKeys.has(k)) {
      filteredKycData[k] = v;
    }
  }

  // 1. KYC Approval
  const kycRes = await db.listDocuments(DATABASE_ID, 'kyc_verifications', [
    Query.equal('user_id', userId),
    Query.limit(1),
  ]);

  if (kycRes.documents.length > 0) {
    const kycDoc = kycRes.documents[0]!;
    await db.updateDocument(DATABASE_ID, 'kyc_verifications', kycDoc.$id, {
      ...filteredKycData,
      status: 'approved',
      updated_at: now,
    });
    console.log(`✓ Updated KYC record (${kycDoc.$id}) to APPROVED`);
  } else {
    const createdKyc = await db.createDocument(DATABASE_ID, 'kyc_verifications', ID.unique(), filteredKycData);
    console.log(`✓ Created new approved KYC record (${createdKyc.$id})`);
  }

  // Update user name in 'users'
  await db.updateDocument(DATABASE_ID, 'users', userId, {
    name: 'Jericko Garcia',
  });
  console.log(`✓ Updated name in users table to 'Jericko Garcia'`);

  // 2. Setup Freelancer Profile
  const profileAttrs = await db.listAttributes(DATABASE_ID, 'freelancer_profiles');
  const allowedProfileKeys = new Set(profileAttrs.attributes.map((a: any) => a.key));
  console.log('Allowed Freelancer Profile attributes:', Array.from(allowedProfileKeys));

  const skillsData = [
    { name: 'Solidity', years_of_experience: 4 },
    { name: 'Ethereum / EVM', years_of_experience: 4 },
    { name: 'React', years_of_experience: 5 },
    { name: 'Next.js', years_of_experience: 4 },
    { name: 'TypeScript', years_of_experience: 5 },
    { name: 'Node.js', years_of_experience: 5 },
    { name: 'Smart Contract Auditing', years_of_experience: 3 },
    { name: 'Web3.js / Ethers.js', years_of_experience: 4 },
  ];

  const experienceData = [
    {
      id: 'exp-1',
      title: 'Senior Blockchain & Full-Stack Developer',
      company: 'CryptoX Labs',
      description: 'Architected EVM smart contracts, DeFi protocols, and decentralized marketplace web applications.',
      start_date: '2022-01-01',
      end_date: null,
    },
    {
      id: 'exp-2',
      title: 'Full-Stack Web Developer',
      company: 'Decentralized Tech PH',
      description: 'Built high-performance web applications using React, Next.js, and TypeScript.',
      start_date: '2020-03-01',
      end_date: '2021-12-31',
    },
  ];

  const rawProfileData: Record<string, any> = {
    user_id: userId,
    name: 'Jericko Garcia',
    nationality: 'PH',
    bio: 'Full-Stack Blockchain & Web3 Developer specializing in Ethereum smart contracts, decentralized escrow systems, and modern web applications with React & Next.js.',
    hourly_rate: 45,
    skills: JSON.stringify(skillsData),
    experience: JSON.stringify(experienceData),
    availability: 'available',
    created_at: now,
    updated_at: now,
  };

  const filteredProfileData: Record<string, any> = {};
  for (const [k, v] of Object.entries(rawProfileData)) {
    if (allowedProfileKeys.has(k)) {
      filteredProfileData[k] = v;
    }
  }

  const profileRes = await db.listDocuments(DATABASE_ID, 'freelancer_profiles', [
    Query.equal('user_id', userId),
    Query.limit(1),
  ]);

  if (profileRes.documents.length > 0) {
    const pDoc = profileRes.documents[0]!;
    await db.updateDocument(DATABASE_ID, 'freelancer_profiles', pDoc.$id, {
      ...filteredProfileData,
      updated_at: now,
    });
    console.log(`✓ Updated Freelancer Profile (${pDoc.$id})`);
  } else {
    const newProfile = await db.createDocument(DATABASE_ID, 'freelancer_profiles', ID.unique(), filteredProfileData);
    console.log(`✓ Created Freelancer Profile (${newProfile.$id})`);
  }

  // 3. Setup Portfolio Items
  const portAttrs = await db.listAttributes(DATABASE_ID, 'portfolio_items');
  const allowedPortKeys = new Set(portAttrs.attributes.map((a: any) => a.key));
  console.log('Allowed Portfolio attributes:', Array.from(allowedPortKeys));

  const existingPortfolio = await db.listDocuments(DATABASE_ID, 'portfolio_items', [
    Query.equal('freelancer_id', userId),
  ]);

  if (existingPortfolio.documents.length === 0) {
    const items = [
      {
        freelancer_id: userId,
        title: 'Decentralized Freelance & Milestone Escrow Protocol',
        description: 'A non-custodial smart contract escrow protocol on Polygon with automated milestone release, dispute arbitration, and multi-token support.',
        project_url: 'https://github.com/jerickogarcia/escrow-dapp',
        images: JSON.stringify(['https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&auto=format&fit=crop&q=60']),
        skills: JSON.stringify(['Solidity', 'Smart Contracts', 'Polygon', 'React', 'Next.js']),
        completed_at: '2025-11-15',
        created_at: now,
        updated_at: now,
      },
      {
        freelancer_id: userId,
        title: 'DeFi Automated Liquidity & Staking Platform',
        description: 'High-throughput automated market maker (AMM) with yield farming strategies, audited smart contracts, and real-time analytics dashboard.',
        project_url: 'https://github.com/jerickogarcia/defi-staking-app',
        images: JSON.stringify(['https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?w=800&auto=format&fit=crop&q=60']),
        skills: JSON.stringify(['EVM', 'TypeScript', 'Ethers.js', 'TailwindCSS', 'Node.js']),
        completed_at: '2026-02-10',
        created_at: now,
        updated_at: now,
      },
      {
        freelancer_id: userId,
        title: 'Web3 Multi-Chain NFT Marketplace & Minter',
        description: 'Cross-chain NFT minting and marketplace with lazy minting, royalty enforcement, and IPFS metadata storage integration.',
        project_url: 'https://github.com/jerickogarcia/web3-nft-hub',
        images: JSON.stringify(['https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format&fit=crop&q=60']),
        skills: JSON.stringify(['Solidity', 'IPFS', 'Next.js', 'Wagmi', 'TailwindCSS']),
        completed_at: '2026-06-20',
        created_at: now,
        updated_at: now,
      },
    ];

    for (const item of items) {
      const filteredItem: Record<string, any> = {};
      for (const [k, v] of Object.entries(item)) {
        if (allowedPortKeys.has(k)) filteredItem[k] = v;
      }
      const doc = await db.createDocument(DATABASE_ID, 'portfolio_items', ID.unique(), filteredItem);
      console.log(`✓ Added portfolio item: "${item.title}" (${doc.$id})`);
    }
  } else {
    console.log(`User already has ${existingPortfolio.documents.length} portfolio item(s).`);
  }

  console.log('\n🎉 Successfully Approved KYC, Updated Profile, and Seeded Portfolio Items!');
}

run().catch((err) => {
  console.error('Execution error:', err);
  process.exit(1);
});
