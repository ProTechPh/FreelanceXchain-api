/**
 * Deploy all contracts to Ganache - Sequential with fresh provider
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545";
const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY || "0x00ad000e3b3dd62055ba74a187b16a00a86b599a08be5fd4200763b68c380ac7";

async function deployContract(name, artifactPath) {
  // Create fresh provider and wallet for each deployment
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  
  const address = await contract.getAddress();
  console.log(`   ✅ ${name}: ${address}`);
  
  // Small delay to let Ganache sync
  await new Promise(r => setTimeout(r, 500));
  
  return address;
}

async function main() {
  if (!privateKey) {
    console.error("BLOCKCHAIN_PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`Connecting to: ${rpcUrl}`);
  console.log(`Deploying from: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);

  const deployedContracts = {};
  const artifactsDir = path.join(__dirname, "../../artifacts/contracts");

  // Deploy contracts sequentially with fresh providers
  console.log("1. Deploying FreelanceReputation...");
  deployedContracts.FreelanceReputation = await deployContract(
    "FreelanceReputation",
    path.join(artifactsDir, "FreelanceReputation.sol/FreelanceReputation.json")
  );

  console.log("2. Deploying ContractAgreement...");
  deployedContracts.ContractAgreement = await deployContract(
    "ContractAgreement",
    path.join(artifactsDir, "ContractAgreement.sol/ContractAgreement.json")
  );

  console.log("3. Deploying DisputeResolution...");
  deployedContracts.DisputeResolution = await deployContract(
    "DisputeResolution",
    path.join(artifactsDir, "DisputeResolution.sol/DisputeResolution.json")
  );

  console.log("4. Deploying MilestoneRegistry...");
  deployedContracts.MilestoneRegistry = await deployContract(
    "MilestoneRegistry",
    path.join(artifactsDir, "MilestoneRegistry.sol/MilestoneRegistry.json")
  );

  console.log("\n📝 Note: FreelanceEscrow is deployed per-contract when a new escrow is created.\n");

  // Save deployment info
  const finalProvider = new ethers.JsonRpcProvider(rpcUrl);
  const deploymentInfo = {
    network: "ganache",
    chainId: (await finalProvider.getNetwork()).chainId.toString(),
    deployer: wallet.address,
    contracts: deployedContracts,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(__dirname, "../deployment.json"), JSON.stringify(deploymentInfo, null, 2));

  console.log("═══════════════════════════════════════════════════════════");
  console.log("✅ All contracts deployed successfully!");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main().catch((error) => {
  console.error("Deployment failed:", error.message);
  process.exit(1);
});
