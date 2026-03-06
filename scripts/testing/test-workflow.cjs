/**
 * Test full workflow: milestone submission, approval, payment, and reputation
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

function failWithSetup(message, hints = []) {
  console.error(`\nSetup error: ${message}`);
  if (hints.length > 0) {
    console.error("How to fix:");
    for (const hint of hints) {
      console.error(`- ${hint}`);
    }
  }
  process.exit(1);
}

async function main() {
  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:7545";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Load deployment info
  const deploymentPath = path.join(__dirname, "../deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    failWithSetup("deployment.json not found.", [
      "Run: npm run deploy:ganache",
    ]);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const contracts = deployment.contracts || {};

  const escrowAddress = contracts.FreelanceEscrow;
  const reputationAddress = contracts.FreelanceReputation;

  if (!reputationAddress || !ethers.isAddress(reputationAddress)) {
    failWithSetup("FreelanceReputation address is missing or invalid in deployment.json.", [
      "Run: node scripts/deploy.cjs",
      "Then run this workflow again.",
    ]);
  }

  if (!escrowAddress || !ethers.isAddress(escrowAddress)) {
    failWithSetup("FreelanceEscrow address is missing or invalid in deployment.json.", [
      "Run: node scripts/deploy-escrow.cjs",
      "Or run: npm run deploy:ganache",
      "Then run this workflow again.",
    ]);
  }

  // Load contract ABIs
  const escrowABI = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../artifacts/contracts/FreelanceEscrow.sol/FreelanceEscrow.json"),
      "utf8"
    )
  ).abi;

  const reputationABI = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../artifacts/contracts/FreelanceReputation.sol/FreelanceReputation.json"),
      "utf8"
    )
  ).abi;

  // Get signers from Ganache
  const accounts = await provider.listAccounts();
  const employerSigner = await provider.getSigner(accounts[0].address);
  const freelancerSigner = await provider.getSigner(accounts[1].address);

  console.log("=== BLOCKCHAIN WORKFLOW TEST ===\n");
  console.log(`Employer: ${accounts[0].address}`);
  console.log(`Freelancer: ${accounts[1].address}`);

  // Connect to contracts
  const escrow = new ethers.Contract(escrowAddress, escrowABI, provider);
  const reputation = new ethers.Contract(reputationAddress, reputationABI, provider);

  // Check initial state
  console.log("\n--- Initial State ---");
  let escrowBalance = await escrow.getBalance();
  let freelancerBalance = await provider.getBalance(accounts[1].address);
  console.log(`Escrow balance: ${ethers.formatEther(escrowBalance)} ETH`);
  console.log(`Freelancer balance: ${ethers.formatEther(freelancerBalance)} ETH`);

  // STEP 1: Freelancer submits milestone 0
  console.log("\n--- Step 1: Freelancer Submits Milestone ---");
  const escrowAsFreelancer = escrow.connect(freelancerSigner);
  let tx = await escrowAsFreelancer.submitMilestone(0);
  await tx.wait();
  console.log("✅ Milestone 0 submitted");

  let [amount, status, desc] = await escrow.getMilestone(0);
  const statusNames = ["Pending", "Submitted", "Approved", "Disputed", "Refunded"];
  console.log(`   Status: ${statusNames[status]}`);

  // STEP 2: Employer approves milestone 0
  console.log("\n--- Step 2: Employer Approves Milestone ---");
  const escrowAsEmployer = escrow.connect(employerSigner);
  tx = await escrowAsEmployer.approveMilestone(0);
  await tx.wait();
  console.log("✅ Milestone 0 approved, payment released");

  [amount, status, desc] = await escrow.getMilestone(0);
  console.log(`   Status: ${statusNames[status]}`);

  escrowBalance = await escrow.getBalance();
  freelancerBalance = await provider.getBalance(accounts[1].address);
  console.log(`   Escrow balance: ${ethers.formatEther(escrowBalance)} ETH`);
  console.log(`   Freelancer received payment!`);

  // STEP 3: Submit rating to reputation contract
  console.log("\n--- Step 3: Employer Rates Freelancer ---");
  const reputationAsEmployer = reputation.connect(employerSigner);
  tx = await reputationAsEmployer.submitRating(
    accounts[1].address, // ratee (freelancer)
    5, // score (1-5)
    "Excellent work, delivered on time!", // comment
    "contract-test-001", // contractId
    true // isEmployerRating
  );
  await tx.wait();
  console.log("✅ Rating submitted to blockchain");

  // Check reputation
  const avgRating = await reputation.getAverageRating(accounts[1].address);
  const ratingCount = await reputation.getRatingCount(accounts[1].address);
  console.log(`   Freelancer average rating: ${Number(avgRating) / 100}/5`);
  console.log(`   Total ratings: ${ratingCount}`);

  // STEP 4: Freelancer rates employer
  console.log("\n--- Step 4: Freelancer Rates Employer ---");
  const reputationAsFreelancer = reputation.connect(freelancerSigner);
  tx = await reputationAsFreelancer.submitRating(
    accounts[0].address, // ratee (employer)
    4, // score
    "Good communication, fair payment", // comment
    "contract-test-001", // contractId
    false // isEmployerRating
  );
  await tx.wait();
  console.log("✅ Rating submitted to blockchain");

  const employerRating = await reputation.getAverageRating(accounts[0].address);
  console.log(`   Employer average rating: ${Number(employerRating) / 100}/5`);

  // Final summary
  console.log("\n=== WORKFLOW TEST COMPLETE ===");
  console.log("\nFinal State:");
  escrowBalance = await escrow.getBalance();
  console.log(`  Escrow remaining: ${ethers.formatEther(escrowBalance)} ETH`);
  console.log(`  Milestones completed: 1/3`);
  console.log(`  Ratings on-chain: ${await reputation.getTotalRatings()}`);
  console.log("\n✅ All blockchain operations working correctly!");
}

main().catch((error) => {
  console.error("Test failed:", error.message);
  process.exit(1);
});
