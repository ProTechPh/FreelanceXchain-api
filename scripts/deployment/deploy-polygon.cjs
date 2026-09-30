/**
 * FreelanceXchain — Production Polygon Deployment Script
 * Deploys singleton contracts to Polygon Mainnet using POL.
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com";
const PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY || "51c730eb55fac6653d214e0d6d039dc3277532331f3a5337f4d31fefb3da61d7";

const artifactsDir = path.join(__dirname, "../../artifacts/contracts");

function getArtifact(contractName, fileName) {
  const filePath = path.join(artifactsDir, `${fileName || contractName}.sol/${contractName}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Artifact not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function getGasOverrides(provider) {
  const feeData = await provider.getFeeData();
  const minPriority = ethers.parseUnits("35", "gwei");
  const priorityFee = feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas > minPriority
    ? feeData.maxPriorityFeePerGas
    : minPriority;
  const maxFee = (feeData.maxFeePerGas || ethers.parseUnits("250", "gwei")) + ethers.parseUnits("30", "gwei");
  return {
    maxPriorityFeePerGas: priorityFee,
    maxFeePerGas: maxFee,
  };
}

async function deployContract(name, artifact, wallet, ...args) {
  console.log(`\nDeploying ${name}...`);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const overrides = await getGasOverrides(wallet.provider);
  console.log(`  Gas settings: maxPriorityFee=${ethers.formatUnits(overrides.maxPriorityFeePerGas, "gwei")} Gwei, maxFee=${ethers.formatUnits(overrides.maxFeePerGas, "gwei")} Gwei`);

  const contract = await factory.deploy(...args, overrides);
  const deployTx = contract.deploymentTransaction();
  console.log(`  Transaction broadcasted: ${deployTx.hash}`);
  console.log(`  Waiting for on-chain confirmation...`);

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`  ✅ ${name} deployed at: ${address}`);
  console.log(`  🔗 PolygonScan: https://polygonscan.com/address/${address}`);

  // Small delay for nonce synchronization
  await new Promise((r) => setTimeout(r, 3000));
  return address;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("🚀 DEPLOYING FREELANCEXCHAIN CONTRACTS TO POLYGON MAINNET");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`🌐 RPC URL: ${RPC_URL}`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Deployer Address: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Deployer Balance: ${ethers.formatEther(balance)} POL\n`);

  if (balance < ethers.parseEther("0.1")) {
    throw new Error("Insufficient POL balance for gas fees!");
  }

  const deployed = {};

  // 1. ContractAgreement
  const agreementArtifact = getArtifact("ContractAgreement");
  deployed.ContractAgreement = await deployContract("ContractAgreement", agreementArtifact, wallet);

  // 2. FreelanceReputation (depends on ContractAgreement address)
  const reputationArtifact = getArtifact("FreelanceReputation");
  deployed.FreelanceReputation = await deployContract(
    "FreelanceReputation",
    reputationArtifact,
    wallet,
    deployed.ContractAgreement
  );

  // 3. DisputeResolution
  const disputeArtifact = getArtifact("DisputeResolution");
  deployed.DisputeResolution = await deployContract("DisputeResolution", disputeArtifact, wallet);

  // 4. MilestoneRegistry
  const milestoneArtifact = getArtifact("MilestoneRegistry");
  deployed.MilestoneRegistry = await deployContract("MilestoneRegistry", milestoneArtifact, wallet);

  // Save deployment info
  const deploymentInfo = {
    network: "polygon",
    chainId: "137",
    rpcUrl: RPC_URL,
    deployer: wallet.address,
    contracts: deployed,
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "../deployment-polygon.json");
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("🎉 ALL CONTRACTS SUCCESSFULLY DEPLOYED TO POLYGON MAINNET!");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Update .env with new Polygon addresses in the production block
  const envPath = path.join(__dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    let env = fs.readFileSync(envPath, "utf8");

    // Replace commented or active POLYGON addresses
    env = env.replace(
      /# POLYGON_REPUTATION_ADDRESS=.*|POLYGON_REPUTATION_ADDRESS=.*/,
      `# POLYGON_REPUTATION_ADDRESS=${deployed.FreelanceReputation}`
    );
    env = env.replace(
      /# POLYGON_AGREEMENT_ADDRESS=.*|POLYGON_AGREEMENT_ADDRESS=.*/,
      `# POLYGON_AGREEMENT_ADDRESS=${deployed.ContractAgreement}`
    );
    env = env.replace(
      /# POLYGON_DISPUTE_ADDRESS=.*|POLYGON_DISPUTE_ADDRESS=.*/,
      `# POLYGON_DISPUTE_ADDRESS=${deployed.DisputeResolution}`
    );
    env = env.replace(
      /# POLYGON_MILESTONE_ADDRESS=.*|POLYGON_MILESTONE_ADDRESS=.*/,
      `# POLYGON_MILESTONE_ADDRESS=${deployed.MilestoneRegistry}`
    );
    // Also update deployer private key in commented prod block
    env = env.replace(
      /# BLOCKCHAIN_PRIVATE_KEY=.*|BLOCKCHAIN_PRIVATE_KEY=.*/,
      (match) => match.startsWith("#") ? `# BLOCKCHAIN_PRIVATE_KEY=${PRIVATE_KEY}` : match
    );

    fs.writeFileSync(envPath, env, "utf8");
    console.log("\n📝 Updated .env with new POLYGON contract addresses.");
  }
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err.message);
  process.exit(1);
});
