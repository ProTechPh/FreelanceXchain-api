import 'dotenv/config';
import { databases, DATABASE_ID, Query } from '../src/config/appwrite.js';
import { getReputationLeaderboard } from '../src/services/reputation-aggregation-service.js';
import { platformMetricsCache } from '../src/utils/cache.js';
import { redis } from '../src/config/redis.js';

const contractsToSeed = [
  {
    seedId: "contract-1",
    project_id: "project-1",
    proposal_id: "proposal-seed-1",
    freelancer_id: "freelancer-1",
    employer_id: "employer-1",
    escrow_address: "0x38391dF905AbF676Fa737780fC408350bA3f29C2",
    base_amount: 8000,
    rush_fee: 0,
    total_amount: 8000,
    status: "completed",
  },
  {
    seedId: "contract-2",
    project_id: "project-2",
    proposal_id: "proposal-seed-2",
    freelancer_id: "freelancer-1",
    employer_id: "employer-2",
    escrow_address: "0xcE553ee2d1796FE4FB11BC488AB19502C0fa0d1e",
    base_amount: 15000,
    rush_fee: 0,
    total_amount: 15000,
    status: "completed",
  },
  {
    seedId: "contract-3",
    project_id: "project-6",
    proposal_id: "proposal-seed-3",
    freelancer_id: "freelancer-1",
    employer_id: "employer-3",
    escrow_address: "0x6a8a2c3F383bCc478868DFbe5757328c63eC33c2",
    base_amount: 18000,
    rush_fee: 0,
    total_amount: 18000,
    status: "completed",
  },
  {
    seedId: "contract-4",
    project_id: "project-4",
    proposal_id: "proposal-seed-4",
    freelancer_id: "freelancer-2",
    employer_id: "employer-1",
    escrow_address: "0x65540D1Fd8b70D4667ca512ca0D7cCcC15013736",
    base_amount: 6500,
    rush_fee: 0,
    total_amount: 6500,
    status: "completed",
  },
  {
    seedId: "contract-5",
    project_id: "project-5",
    proposal_id: "proposal-seed-5",
    freelancer_id: "freelancer-2",
    employer_id: "employer-2",
    escrow_address: "0x38391dF905AbF676Fa737780fC408350bA3f29C2",
    base_amount: 5500,
    rush_fee: 0,
    total_amount: 5500,
    status: "completed",
  },
  {
    seedId: "contract-6",
    project_id: "project-3",
    proposal_id: "proposal-seed-6",
    freelancer_id: "freelancer-2",
    employer_id: "employer-3",
    escrow_address: "0xcE553ee2d1796FE4FB11BC488AB19502C0fa0d1e",
    base_amount: 12000,
    rush_fee: 0,
    total_amount: 12000,
    status: "completed",
  },
  {
    seedId: "contract-7",
    project_id: "project-1",
    proposal_id: "proposal-seed-7",
    freelancer_id: "freelancer-3",
    employer_id: "employer-1",
    escrow_address: "0x6a8a2c3F383bCc478868DFbe5757328c63eC33c2",
    base_amount: 8000,
    rush_fee: 0,
    total_amount: 8000,
    status: "completed",
  },
  {
    seedId: "contract-8",
    project_id: "project-3",
    proposal_id: "proposal-seed-8",
    freelancer_id: "freelancer-3",
    employer_id: "employer-2",
    escrow_address: "0x65540D1Fd8b70D4667ca512ca0D7cCcC15013736",
    base_amount: 12000,
    rush_fee: 0,
    total_amount: 12000,
    status: "completed",
  },
  {
    seedId: "contract-9",
    project_id: "project-6",
    proposal_id: "proposal-seed-9",
    freelancer_id: "freelancer-3",
    employer_id: "employer-3",
    escrow_address: "0x38391dF905AbF676Fa737780fC408350bA3f29C2",
    base_amount: 18000,
    rush_fee: 0,
    total_amount: 18000,
    status: "completed",
  },
  {
    seedId: "contract-10",
    project_id: "project-2",
    proposal_id: "proposal-seed-10",
    freelancer_id: "freelancer-1",
    employer_id: "employer-1",
    escrow_address: "0xcE553ee2d1796FE4FB11BC488AB19502C0fa0d1e",
    base_amount: 10000,
    rush_fee: 0,
    total_amount: 10000,
    status: "completed",
  },
];

const reviewsToSeed = [
  // Reviews for Freelancers
  {
    seedId: "review-fl-1-1",
    contract_id: "contract-1",
    project_id: "project-1",
    reviewer_id: "employer-1",
    reviewee_id: "freelancer-1",
    reviewer_role: "employer",
    rating: 5,
    comment: "Exceptional Solidity engineering and smart contract architecture. Flawless DEX frontend integration.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-fl-1-2",
    contract_id: "contract-2",
    project_id: "project-2",
    reviewer_id: "employer-2",
    reviewee_id: "freelancer-1",
    reviewer_role: "employer",
    rating: 5,
    comment: "Thorough security audit for our lending protocol. Identified edge cases in our contracts before launch.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-fl-1-3",
    contract_id: "contract-3",
    project_id: "project-6",
    reviewer_id: "employer-3",
    reviewee_id: "freelancer-1",
    reviewer_role: "employer",
    rating: 5,
    comment: "Delivered our yield aggregator vault contracts ahead of schedule with complete Foundry test suites.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-fl-1-4",
    contract_id: "contract-10",
    project_id: "project-2",
    reviewer_id: "employer-1",
    reviewee_id: "freelancer-1",
    reviewer_role: "employer",
    rating: 5,
    comment: "Second contract with Ana. Top-tier Web3 developer with impeccable work ethic and technical precision.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },

  {
    seedId: "review-fl-2-1",
    contract_id: "contract-4",
    project_id: "project-4",
    reviewer_id: "employer-1",
    reviewee_id: "freelancer-2",
    reviewer_role: "employer",
    rating: 5,
    comment: "Transformed our DAO governance UX into a sleek, accessible product. Highly proficient in design tokens and Figma.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-fl-2-2",
    contract_id: "contract-5",
    project_id: "project-5",
    reviewer_id: "employer-2",
    reviewee_id: "freelancer-2",
    reviewer_role: "employer",
    rating: 5,
    comment: "Crafted an exceptional cross-chain bridge UI. Fast delivery and responsive mobile designs.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-fl-2-3",
    contract_id: "contract-6",
    project_id: "project-3",
    reviewer_id: "employer-3",
    reviewee_id: "freelancer-2",
    reviewer_role: "employer",
    rating: 4.8,
    comment: "Creative Web3 UI/UX designer. Built comprehensive user flows for our multi-chain NFT marketplace.",
    work_quality: 5,
    communication: 4.8,
    professionalism: 4.8,
    would_work_again: true,
  },

  {
    seedId: "review-fl-3-1",
    contract_id: "contract-7",
    project_id: "project-1",
    reviewer_id: "employer-1",
    reviewee_id: "freelancer-3",
    reviewer_role: "employer",
    rating: 5,
    comment: "Outstanding full-stack Web3 developer. Integrated wallet connectors, indexer APIs, and state management smoothly.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-fl-3-2",
    contract_id: "contract-8",
    project_id: "project-3",
    reviewer_id: "employer-2",
    reviewee_id: "freelancer-3",
    reviewer_role: "employer",
    rating: 4.7,
    comment: "Great technical skills and proactive problem solving on our NFT marketplace backend and IPFS pipelines.",
    work_quality: 4.7,
    communication: 4.7,
    professionalism: 4.8,
    would_work_again: true,
  },
  {
    seedId: "review-fl-3-3",
    contract_id: "contract-9",
    project_id: "project-6",
    reviewer_id: "employer-3",
    reviewee_id: "freelancer-3",
    reviewer_role: "employer",
    rating: 4.8,
    comment: "Built our DeFi monitoring dashboard with high-throughput WebSockets. Reliable and communicative.",
    work_quality: 4.8,
    communication: 4.8,
    professionalism: 4.9,
    would_work_again: true,
  },

  // 3rd review for existing freelancer Jericko Garcia (6a8e7a6b4f2e626fb528)
  {
    seedId: "review-fl-jericko-3",
    contract_id: "5180ef33-991f-4cf1-b6a6-e7997b8d4135",
    project_id: "996d0978-59f2-46da-8be6-460afed81734",
    reviewer_id: "6a92394d7788e21016b4",
    reviewee_id: "6a8e7a6b4f2e626fb528",
    reviewer_role: "employer",
    rating: 5,
    comment: "Outstanding delivery on the milestones. Exceptional code quality and prompt communication.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },

  // Reviews for Employers
  {
    seedId: "review-emp-1-1",
    contract_id: "contract-1",
    project_id: "project-1",
    reviewer_id: "freelancer-1",
    reviewee_id: "employer-1",
    reviewer_role: "freelancer",
    rating: 5,
    comment: "Sarah was a pleasure to work with. Clear requirements, prompt communication, and instantaneous escrow release.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-emp-1-2",
    contract_id: "contract-4",
    project_id: "project-4",
    reviewer_id: "freelancer-2",
    reviewee_id: "employer-1",
    reviewer_role: "freelancer",
    rating: 5,
    comment: "TechCorp provides crystal clear design specs and great design review feedback. Highly recommended employer!",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-emp-1-3",
    contract_id: "contract-7",
    project_id: "project-1",
    reviewer_id: "freelancer-3",
    reviewee_id: "employer-1",
    reviewer_role: "freelancer",
    rating: 5,
    comment: "Excellent employer who values engineering best practices and respects developer deadlines.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },

  {
    seedId: "review-emp-2-1",
    contract_id: "contract-2",
    project_id: "project-2",
    reviewer_id: "freelancer-1",
    reviewee_id: "employer-2",
    reviewer_role: "freelancer",
    rating: 5,
    comment: "Mike and the Blockchain.io team are top-tier collaborators. Very technical and decisive.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-emp-2-2",
    contract_id: "contract-5",
    project_id: "project-5",
    reviewer_id: "freelancer-2",
    reviewee_id: "employer-2",
    reviewer_role: "freelancer",
    rating: 5,
    comment: "Great experience working on bridge UI. Milestones were approved immediately upon submission.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-emp-2-3",
    contract_id: "contract-8",
    project_id: "project-3",
    reviewer_id: "freelancer-3",
    reviewee_id: "employer-2",
    reviewer_role: "freelancer",
    rating: 4.8,
    comment: "Collaborative and transparent employer. Look forward to working together on future releases.",
    work_quality: 5,
    communication: 4.8,
    professionalism: 5,
    would_work_again: true,
  },

  {
    seedId: "review-emp-3-1",
    contract_id: "contract-3",
    project_id: "project-6",
    reviewer_id: "freelancer-1",
    reviewee_id: "employer-3",
    reviewer_role: "freelancer",
    rating: 5,
    comment: "Alex provided comprehensive spec docs for the yield aggregator. Prompt payment upon completion.",
    work_quality: 5,
    communication: 5,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-emp-3-2",
    contract_id: "contract-6",
    project_id: "project-3",
    reviewer_id: "freelancer-2",
    reviewee_id: "employer-3",
    reviewer_role: "freelancer",
    rating: 4.9,
    comment: "Smooth communication and fast milestone funding. Great Web3 employer.",
    work_quality: 5,
    communication: 4.9,
    professionalism: 5,
    would_work_again: true,
  },
  {
    seedId: "review-emp-3-3",
    contract_id: "contract-9",
    project_id: "project-6",
    reviewer_id: "freelancer-3",
    reviewee_id: "employer-3",
    reviewer_role: "freelancer",
    rating: 4.8,
    comment: "Clear expectations and rapid answers to technical questions. Recommended!",
    work_quality: 4.8,
    communication: 4.8,
    professionalism: 5,
    would_work_again: true,
  },
];

async function seedCollection(collectionId: string, documents: Record<string, unknown>[], name: string): Promise<void> {
  console.log(`📦 Seeding ${name}...`);
  let created = 0;
  let skipped = 0;

  for (const doc of documents) {
    const { seedId, id: docId, ...data } = doc;
    const documentId = (seedId || docId) as string;
    try {
      await databases.createDocument(DATABASE_ID, collectionId, documentId, data);
      created++;
    } catch (e: any) {
      if (e?.code === 409) {
        skipped++;
      } else {
        console.error(`  ✗ Failed to create ${documentId}:`, e?.message || e);
      }
    }
  }

  console.log(`  ✓ Created: ${created}, Skipped (already exist): ${skipped}`);
}

async function main() {
  console.log('=== Seeding Leaderboard Contracts and Reviews ===\n');

  await seedCollection('contracts', contractsToSeed, 'Contracts');
  await seedCollection('reviews', reviewsToSeed, 'Reviews');

  // Invalidate any cached leaderboard entries
  platformMetricsCache.clear();
  try {
    const keys = await redis.keys('*platform-metrics*');
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`Cleared ${keys.length} Redis cache keys for platform-metrics`);
    }
  } catch {
    // Redis might be offline/max clients, LRU was already cleared
  }

  console.log('\n=== Verifying Computed Rankings ===\n');

  const flResult = await getReputationLeaderboard(50, 'freelancer');
  console.log('--- Freelancer Leaderboard ---');
  if (flResult.success && flResult.data.length > 0) {
    console.log(`Found ${flResult.data.length} ranked freelancers:`);
    flResult.data.forEach((entry, idx) => {
      console.log(`  #${idx + 1} | ${entry.userName} (${entry.userId}) | Avg Rating: ${entry.averageRating} | Total Reviews: ${entry.totalRatings} | Ranking Score: ${entry.rankingScore}`);
    });
  } else {
    console.error('Freelancer leaderboard is still empty or failed:', flResult);
  }

  const empResult = await getReputationLeaderboard(50, 'employer');
  console.log('\n--- Employer Leaderboard ---');
  if (empResult.success && empResult.data.length > 0) {
    console.log(`Found ${empResult.data.length} ranked employers:`);
    empResult.data.forEach((entry, idx) => {
      console.log(`  #${idx + 1} | ${entry.userName} (${entry.userId}) | Avg Rating: ${entry.averageRating} | Total Reviews: ${entry.totalRatings} | Ranking Score: ${entry.rankingScore}`);
    });
  } else {
    console.error('Employer leaderboard is still empty or failed:', empResult);
  }

  console.log('\n=== Seed and verification complete! ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to seed leaderboard:', err);
  process.exit(1);
});
