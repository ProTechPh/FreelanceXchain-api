/**
 * Deploy all contracts to Ganache - Sequential with fresh provider
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:7545";
const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY || "0xed1842eb67bd8bd55b930751dc5b9d92436ec8833a9bd1da5bc08ed3c379f95c";

async function deployContract(name, artifactPath, ...constructorArgs) {
  // Create fresh provider and wallet for each deployment
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  const contract = await factory.deploy(...constructorArgs);
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

  // 1. Deploy ContractAgreement first
  console.log("1. Deploying ContractAgreement...");
  const agreementAddress = await deployContract(
    "ContractAgreement",
    path.join(artifactsDir, "ContractAgreement.sol/ContractAgreement.json")
  );
  deployedContracts.ContractAgreement = agreementAddress;

  // 2. Deploy FreelanceReputation with ContractAgreement address
  console.log("2. Deploying FreelanceReputation...");
  const reputationAddress = await deployContract(
    "FreelanceReputation",
    path.join(artifactsDir, "FreelanceReputation.sol/FreelanceReputation.json"),
    agreementAddress
  );
  deployedContracts.FreelanceReputation = reputationAddress;

  // 3. Deploy DisputeResolution
  console.log("3. Deploying DisputeResolution...");
  const disputeAddress = await deployContract(
    "DisputeResolution",
    path.join(artifactsDir, "DisputeResolution.sol/DisputeResolution.json")
  );
  deployedContracts.DisputeResolution = disputeAddress;

  // 4. Deploy MilestoneRegistry
  console.log("4. Deploying MilestoneRegistry...");
  const milestoneAddress = await deployContract(
    "MilestoneRegistry",
    path.join(artifactsDir, "MilestoneRegistry.sol/MilestoneRegistry.json")
  );
  deployedContracts.MilestoneRegistry = milestoneAddress;

  console.log("\n📝 Note: FreelanceEscrow is deployed per-contract when a new escrow is created.\n");

  // Save deployment info
  const finalProvider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await finalProvider.getNetwork();
  const chainId = network.chainId.toString();
  
  let networkName = "ganache";
  let prefix = "GANACHE";
  if (chainId === "80002" || rpcUrl.toLowerCase().includes("amoy")) {
    networkName = "amoy";
    prefix = "AMOY";
  } else if (chainId === "137" || rpcUrl.toLowerCase().includes("polygon")) {
    networkName = "polygon";
    prefix = "POLYGON";
  } else if (chainId === "11155111" || rpcUrl.toLowerCase().includes("sepolia")) {
    networkName = "sepolia";
    prefix = "SEPOLIA";
  }

  const deploymentInfo = {
    network: networkName,
    chainId: chainId,
    deployer: wallet.address,
    contracts: deployedContracts,
    deployedAt: new Date().toISOString(),
  };

  const deploymentPath = path.join(__dirname, "../deployment.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  // Update .env file with new contract addresses
  const envPath = path.join(__dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf8");
    envContent = envContent.replace(/^BLOCKCHAIN_PRIVATE_KEY=.*$/m, `BLOCKCHAIN_PRIVATE_KEY=${privateKey}`);
    
    function setOrAppendEnv(key, val) {
      const regex = new RegExp(`^${key}=.*$`, "m");
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${val}`);
      } else {
        envContent += `\n${key}=${val}`;
      }
    }

    setOrAppendEnv(`${prefix}_REPUTATION_ADDRESS`, reputationAddress);
    setOrAppendEnv(`${prefix}_AGREEMENT_ADDRESS`, agreementAddress);
    setOrAppendEnv(`${prefix}_DISPUTE_ADDRESS`, disputeAddress);
    setOrAppendEnv(`${prefix}_MILESTONE_ADDRESS`, milestoneAddress);

    fs.writeFileSync(envPath, envContent, "utf8");
    console.log(`📝 Updated .env with new ${prefix} contract addresses.`);
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log(`✅ All contracts deployed successfully to ${networkName.toUpperCase()} (Chain ID: ${chainId})!`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main().catch((error) => {
  console.error("Deployment failed:", error.message);
  process.exit(1);
});
