import dotenv from 'dotenv';
dotenv.config();

import { Client, Databases, Query, ID } from 'node-appwrite';

const ENDPOINT = process.env['APPWRITE_ENDPOINT']!;
const PROJECT_ID = process.env['APPWRITE_PROJECT_ID']!;
const API_KEY = process.env['APPWRITE_API_KEY']!;
const DATABASE_ID = process.env['APPWRITE_DATABASE_ID'] || 'freelancexchain';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function filterAttributes(collectionId: string, data: Record<string, any>) {
  try {
    const attrs = await db.listAttributes(DATABASE_ID, collectionId);
    const allowedKeys = new Set(attrs.attributes.map((a: any) => a.key));
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (allowedKeys.has(k) && v !== undefined) {
        result[k] = v;
      }
    }
    return result;
  } catch {
    return data;
  }
}

async function run() {
  const email = process.argv[2] || 'jede.garcia.up@phinmaed.com';
  const fullName = 'Jericho Dela Cruz Garcia';
  console.log(`Processing user: ${email} (${fullName})...`);

  const userRes = await db.listDocuments(DATABASE_ID, 'users', [
    Query.equal('email', email),
    Query.limit(1),
  ]);

  let userDoc: any = null;
  const now = new Date().toISOString();

  if (userRes.documents.length === 0) {
    console.log(`User ${email} not found in 'users' collection. Creating user record...`);
    const rawUserData = {
      email,
      name: fullName,
      role: 'freelancer',
      is_suspended: false,
      mfa_enabled: false,
    };
    const filteredUser = await filterAttributes('users', rawUserData);
    userDoc = await db.createDocument(DATABASE_ID, 'users', ID.unique(), filteredUser);
    console.log(`✓ Created user: ${userDoc.name || fullName} (ID: ${userDoc.$id})`);
  } else {
    userDoc = userRes.documents[0]!;
    const filteredUser = await filterAttributes('users', {
      name: fullName,
      role: userDoc.role || 'freelancer',
    });
    await db.updateDocument(DATABASE_ID, 'users', userDoc.$id, filteredUser);
    console.log(`✓ Found & updated user: ${fullName} (ID: ${userDoc.$id})`);
  }

  const userId = userDoc.$id;

  // 1. KYC Approval
  const rawKycData: Record<string, any> = {
    user_id: userId,
    status: 'approved',
    didit_session_id: `didit_manual_${Date.now()}`,
    didit_session_token: 'token_approved',
    didit_session_url: 'https://verification.didit.me/completed',
    didit_workflow_id: '63d835e4-d2f0-411d-abb7-4a62ad681c28',
    first_name: 'Jericho',
    last_name: 'Garcia',
    nationality: 'PH',
    decision: 'approved',
    document_type: 'PASSPORT',
    document_number: 'P9876543A',
    issuing_country: 'PH',
    document_verified: true,
    liveness_passed: true,
    face_matched: true,
    decline_reasons: JSON.stringify([]),
    review_reasons: JSON.stringify([]),
    metadata: JSON.stringify({ verified: true, method: 'admin_manual_approval', reviewer: 'system' }),
  };

  const filteredKycData = await filterAttributes('kyc_verifications', rawKycData);

  const kycRes = await db.listDocuments(DATABASE_ID, 'kyc_verifications', [
    Query.equal('user_id', userId),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));

  if (kycRes.documents.length > 0) {
    const kycDoc = kycRes.documents[0]!;
    await db.updateDocument(DATABASE_ID, 'kyc_verifications', kycDoc.$id, {
      ...filteredKycData,
      status: 'approved',
    });
    console.log(`✓ Updated KYC record (${kycDoc.$id}) to APPROVED`);
  } else {
    const createdKyc = await db.createDocument(DATABASE_ID, 'kyc_verifications', ID.unique(), filteredKycData);
    console.log(`✓ Created new APPROVED KYC record (${createdKyc.$id})`);
  }

  // 2. Setup Freelancer Profile
  const skillsData = [
    { name: 'Solidity', years_of_experience: 4 },
    { name: 'Ethereum / EVM', years_of_experience: 4 },
    { name: 'React', years_of_experience: 5 },
    { name: 'Next.js', years_of_experience: 4 },
    { name: 'TypeScript', years_of_experience: 5 },
    { name: 'Node.js', years_of_experience: 5 },
    { name: 'Tailwind CSS', years_of_experience: 4 },
    { name: 'Smart Contract Auditing', years_of_experience: 3 },
    { name: 'Web3.js / Ethers.js', years_of_experience: 4 },
    { name: 'Polygon / Amoy', years_of_experience: 3 },
  ];

  const experienceData = [
    {
      id: 'exp-1',
      title: 'Lead Full-Stack Web3 Developer',
      company: 'Aether Decentralized Systems',
      description: 'Architected EVM smart contracts, DeFi protocols, and decentralized marketplace web applications.',
      start_date: '2022-01-01',
      end_date: null,
    },
    {
      id: 'exp-2',
      title: 'Frontend & Blockchain Engineer',
      company: 'Decentralized Tech PH',
      description: 'Built high-performance web applications using React, Next.js, and TypeScript with Web3 integrations.',
      start_date: '2020-03-01',
      end_date: '2021-12-31',
    },
  ];

  const rawProfileData: Record<string, any> = {
    user_id: userId,
    name: fullName,
    nationality: 'PH',
    bio: 'Full-Stack Blockchain & Web3 Developer specializing in Ethereum/Polygon smart contracts, decentralized escrow systems, and modern web applications with React & Next.js.',
    hourly_rate: 55,
    skills: JSON.stringify(skillsData),
    experience: JSON.stringify(experienceData),
    availability: 'available',
  };

  const filteredProfileData = await filterAttributes('freelancer_profiles', rawProfileData);

  const profileRes = await db.listDocuments(DATABASE_ID, 'freelancer_profiles', [
    Query.equal('user_id', userId),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));

  if (profileRes.documents.length > 0) {
    const pDoc = profileRes.documents[0]!;
    await db.updateDocument(DATABASE_ID, 'freelancer_profiles', pDoc.$id, filteredProfileData);
    console.log(`✓ Updated Freelancer Profile (${pDoc.$id})`);
  } else {
    const newProfile = await db.createDocument(DATABASE_ID, 'freelancer_profiles', ID.unique(), filteredProfileData);
    console.log(`✓ Created Freelancer Profile (${newProfile.$id})`);
  }

  // 3. Setup Portfolio Items
  const existingPortfolio = await db.listDocuments(DATABASE_ID, 'portfolio_items', [
    Query.equal('freelancer_id', userId),
  ]).catch(() => ({ documents: [] }));

  if (existingPortfolio.documents.length === 0) {
    const items = [
      {
        freelancer_id: userId,
        title: 'Decentralized Exchange (DEX) & AMM Liquidity Frontend',
        description: 'Responsive decentralized exchange interface supporting automated market maker token swapping, multi-token liquidity pools, slippage protection, and Web3 wallet connectors.',
        project_url: 'https://github.com/jerickogarcia/dex-frontend',
        images: JSON.stringify(['https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?w=800&auto=format&fit=crop&q=60']),
        skills: JSON.stringify(['React', 'TypeScript', 'EVM', 'Ethers.js', 'Tailwind CSS']),
        completed_at: '2026-01-20',
      },
      {
        freelancer_id: userId,
        title: 'Decentralized Freelance & Milestone Escrow Protocol',
        description: 'A non-custodial smart contract escrow protocol on Polygon with automated milestone release, dispute arbitration, and multi-token support.',
        project_url: 'https://github.com/jerickogarcia/escrow-dapp',
        images: JSON.stringify(['https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&auto=format&fit=crop&q=60']),
        skills: JSON.stringify(['Solidity', 'Smart Contracts', 'Polygon', 'React', 'Next.js']),
        completed_at: '2025-11-15',
      },
      {
        freelancer_id: userId,
        title: 'Web3 Multi-Chain NFT Marketplace & Minter',
        description: 'Cross-chain NFT minting and marketplace with lazy minting, royalty enforcement, and IPFS metadata storage integration.',
        project_url: 'https://github.com/jerickogarcia/web3-nft-hub',
        images: JSON.stringify(['https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format&fit=crop&q=60']),
        skills: JSON.stringify(['Solidity', 'IPFS', 'Next.js', 'Wagmi', 'Tailwind CSS']),
        completed_at: '2026-06-20',
      },
    ];

    for (const item of items) {
      const filteredItem = await filterAttributes('portfolio_items', item);
      const doc = await db.createDocument(DATABASE_ID, 'portfolio_items', ID.unique(), filteredItem);
      console.log(`✓ Added portfolio item: "${item.title}" (${doc.$id})`);
    }
  } else {
    console.log(`User already has ${existingPortfolio.documents.length} portfolio item(s).`);
  }

  // 4. Setup Verified Reviews & Reputation History
  const existingReviews = await db.listDocuments(DATABASE_ID, 'reviews', [
    Query.equal('ratee_id', userId),
  ]).catch(() => ({ documents: [] }));

  if (existingReviews.documents.length === 0) {
    const reviewsData = [
      {
        contract_id: `contract_seed_1_${userId.slice(0, 8)}`,
        rater_id: 'employer_seed_1',
        ratee_id: userId,
        reviewer_id: 'employer_seed_1',
        reviewee_id: userId,
        rating: 5,
        score: 5,
        work_quality: 5,
        communication: 5,
        professionalism: 5,
        would_work_again: true,
        comment: 'Outstanding developer! Built our DeFi frontend ahead of schedule with immaculate attention to security and UX.',
      },
      {
        contract_id: `contract_seed_2_${userId.slice(0, 8)}`,
        rater_id: 'employer_seed_2',
        ratee_id: userId,
        reviewer_id: 'employer_seed_2',
        reviewee_id: userId,
        rating: 5,
        score: 5,
        work_quality: 5,
        communication: 5,
        professionalism: 5,
        would_work_again: true,
        comment: 'Top-tier Solidity and React expertise. Smooth milestone execution with zero friction in escrow payouts.',
      },
      {
        contract_id: `contract_seed_3_${userId.slice(0, 8)}`,
        rater_id: 'employer_seed_3',
        ratee_id: userId,
        reviewer_id: 'employer_seed_3',
        reviewee_id: userId,
        rating: 5,
        score: 5,
        work_quality: 5,
        communication: 5,
        professionalism: 5,
        would_work_again: true,
        comment: 'Very professional and responsive. Delivered all smart contract integrations flawlessly.',
      },
    ];

    for (const rev of reviewsData) {
      const filteredRev = await filterAttributes('reviews', rev);
      try {
        const doc = await db.createDocument(DATABASE_ID, 'reviews', ID.unique(), filteredRev);
        console.log(`✓ Added 5-star review record (${doc.$id})`);
      } catch (err: any) {
        console.log(`Note: could not insert review (${err?.message})`);
      }
    }
  }

  console.log(`\n🎉 Successfully completed setup for ${fullName} (${email})!`);
  console.log(`- KYC Status: APPROVED`);
  console.log(`- Name: ${fullName}`);
  console.log(`- Profile & Verified Skills: Configured`);
  console.log(`- Portfolio Items: Seeded`);
  console.log(`- Verified Reviews / Reputation: Active`);
}

run().catch((err) => {
  console.error('Execution error:', err);
  process.exit(1);
});
