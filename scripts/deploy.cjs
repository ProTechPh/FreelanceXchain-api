/**
 * Simple deployment script using ethers.js directly
 * Works without Hardhat's version-specific dependencies
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  // Connect to Ganache
  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:7545";
  const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY;

  if (!privateKey) {
    console.error("BLOCKCHAIN_PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  console.log(`Connecting to: ${rpcUrl}`);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`Deploying from: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  // Read compiled contract artifacts
  const reputationArtifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../artifacts/contracts/FreelanceReputation.sol/FreelanceReputation.json"),
      "utf8"
    )
  );

  // Deploy FreelanceReputation
  console.log("\nDeploying FreelanceReputation...");
  const ReputationFactory = new ethers.ContractFactory(
    reputationArtifact.abi,
    reputationArtifact.bytecode,
    wallet
  );

  const reputation = await ReputationFactory.deploy();
  await reputation.waitForDeployment();
  const reputationAddress = await reputation.getAddress();
  console.log(`FreelanceReputation deployed to: ${reputationAddress}`);

  // Test the contract
  console.log("\nTesting contract...");
  const owner = await reputation.owner();
  console.log(`Contract owner: ${owner}`);
  const totalRatings = await reputation.getTotalRatings();
  console.log(`Total ratings: ${totalRatings}`);

  // Save deployment info
  const deploymentInfo = {
    network: "ganache",
    chainId: (await provider.getNetwork()).chainId.toString(),
    deployer: wallet.address,
    contracts: {
      FreelanceReputation: reputationAddress,
    },
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(__dirname, "../deployment.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n✅ Deployment successful!");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exit(1);
});
