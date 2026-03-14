/**
 * Deploy FreelanceEscrow contract for testing milestone payments
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:7545";
  const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY;

  if (!privateKey) {
    console.error("BLOCKCHAIN_PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  console.log(`Connecting to: ${rpcUrl}`);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  // Get additional accounts from Ganache for testing
  const accounts = await provider.listAccounts();
  const freelancerAddress = accounts[1]?.address || wallet.address;
  const arbiterAddress = accounts[2]?.address || wallet.address;

  console.log(`Employer (deployer): ${wallet.address}`);
  console.log(`Freelancer: ${freelancerAddress}`);
  console.log(`Arbiter: ${arbiterAddress}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  // Read compiled contract
  const escrowArtifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../../artifacts/contracts/FreelanceEscrow.sol/FreelanceEscrow.json"),
      "utf8"
    )
  );

  // Milestone setup - 3 milestones totaling 0.05 ETH
  const milestoneAmounts = [
    ethers.parseEther("0.01"),
    ethers.parseEther("0.02"),
    ethers.parseEther("0.02"),
  ];
  const milestoneDescriptions = [
    "Project Setup and Design",
    "Core Development",
    "Testing and Delivery",
  ];
  const totalValue = milestoneAmounts.reduce((a, b) => a + b, 0n);

  console.log(`\nDeploying FreelanceEscrow...`);
  console.log(`Total escrow value: ${ethers.formatEther(totalValue)} ETH`);
  console.log(`Milestones: ${milestoneAmounts.length}`);

  const EscrowFactory = new ethers.ContractFactory(
    escrowArtifact.abi,
    escrowArtifact.bytecode,
    wallet
  );

  const escrow = await EscrowFactory.deploy(
    freelancerAddress,
    arbiterAddress,
    "contract-test-001",
    milestoneAmounts,
    milestoneDescriptions,
    { value: totalValue }
  );

  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`FreelanceEscrow deployed to: ${escrowAddress}`);

  // Test the contract
  console.log("\nTesting escrow contract...");
  const employer = await escrow.employer();
  const freelancer = await escrow.freelancer();
  const escrowBalance = await escrow.getBalance();
  const milestoneCount = await escrow.getMilestoneCount();

  console.log(`Employer: ${employer}`);
  console.log(`Freelancer: ${freelancer}`);
  console.log(`Escrow balance: ${ethers.formatEther(escrowBalance)} ETH`);
  console.log(`Milestone count: ${milestoneCount}`);

  // Get milestone details
  console.log("\nMilestones:");
  for (let i = 0; i < milestoneCount; i++) {
    const [amount, status, description] = await escrow.getMilestone(i);
    const statusNames = ["Pending", "Submitted", "Approved", "Disputed", "Refunded"];
    console.log(`  ${i + 1}. ${description}: ${ethers.formatEther(amount)} ETH (${statusNames[status]})`);
  }

  // Update deployment.json
  let deploymentInfo = {};
  const deploymentPath = path.join(__dirname, "../deployment.json");
  if (fs.existsSync(deploymentPath)) {
    deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  }

  deploymentInfo.contracts = deploymentInfo.contracts || {};
  deploymentInfo.contracts.FreelanceEscrow = escrowAddress;
  deploymentInfo.escrowDetails = {
    employer: employer,
    freelancer: freelancer,
    arbiter: arbiterAddress,
    totalValue: ethers.formatEther(totalValue),
    milestoneCount: Number(milestoneCount),
  };
  deploymentInfo.updatedAt = new Date().toISOString();

  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\n✅ Escrow deployment successful!");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exit(1);
});
