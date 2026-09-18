/**
 * Deploy all singleton contracts sequentially to Ganache or Production networks
 * Supported networks: ganache (local demo), amoy (Polygon testnet), polygon (Polygon mainnet), sepolia
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
require("dotenv").config();

// Parse command-line arguments (e.g. --network ganache | amoy | polygon | prod)
const args = process.argv.slice(2);
let networkArg = "ganache";
const networkIdx = args.indexOf("--network");
if (networkIdx !== -1 && args[networkIdx + 1]) {
  networkArg = args[networkIdx + 1].toLowerCase();
} else if (args[0] && !args[0].startsWith("-")) {
  networkArg = args[0].toLowerCase();
}

// Map alias
if (networkArg === "prod" || networkArg === "production") {
  networkArg = "polygon";
} else if (networkArg === "local" || networkArg === "dev") {
  networkArg = "ganache";
}

// Determine RPC URL based on target network or environment
let rpcUrl = process.env.BLOCKCHAIN_RPC_URL;
if (networkArg === "ganache" && (!rpcUrl || rpcUrl.includes("polygon") || rpcUrl.includes("amoy"))) {
  rpcUrl = "http://127.0.0.1:7545";
} else if (networkArg === "amoy") {
  rpcUrl = process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";
} else if (networkArg === "polygon") {
  rpcUrl = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
} else if (networkArg === "sepolia") {
  rpcUrl = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
} else if (!rpcUrl) {
  rpcUrl = "http://127.0.0.1:7545";
}

const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY;

if (!privateKey) {
  console.error("❌ FATAL: BLOCKCHAIN_PRIVATE_KEY environment variable is required in .env");
  process.exit(1);
}

// Verify artifacts exist; compile if missing
const artifactsDir = path.join(__dirname, "../../artifacts/contracts");
const requiredArtifacts = [
  "ContractAgreement.sol/ContractAgreement.json",
  "FreelanceReputation.sol/FreelanceReputation.json",
  "DisputeResolution.sol/DisputeResolution.json",
  "MilestoneRegistry.sol/MilestoneRegistry.json",
];

const missingArtifacts = requiredArtifacts.some(
  (rel) => !fs.existsSync(path.join(artifactsDir, rel))
);

if (missingArtifacts) {
  console.log("⚙️  Contract artifacts missing. Running hardhat compile...");
  try {
    execSync("npx hardhat compile --config hardhat.config.cjs", {
      cwd: path.join(__dirname, "../.."),
      stdio: "inherit",
    });
  } catch (err) {
    console.error("❌ Failed to compile contracts:", err.message);
    process.exit(1);
  }
}

async function deployContract(name, artifactPath, wallet, ...constructorArgs) {
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  const contract = await factory.deploy(...constructorArgs);
  await contract.waitForDeployment();
  
  const address = await contract.getAddress();
  console.log(`   ✅ ${name}: ${address}`);
  
  // Delay between deployments for network sync
  await new Promise((r) => setTimeout(r, 1000));
  
  return address;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`🚀 FreelanceXchain Smart Contract Deployment`);
  console.log(`🎯 Target Network: ${networkArg.toUpperCase()}`);
  console.log(`🌐 RPC URL: ${rpcUrl}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`Deploying from Account: ${wallet.address}`);
  let balance;
  try {
    balance = await provider.getBalance(wallet.address);
    console.log(`Account Balance: ${ethers.formatEther(balance)} ETH/MATIC\n`);
  } catch (e) {
    console.error(`❌ Failed to connect to RPC at ${rpcUrl}:`, e.message);
    process.exit(1);
  }

  if (balance === 0n) {
    console.warn("⚠️  WARNING: Deployer account balance is 0. Deployment will fail if gas is required.");
    if (networkArg === "amoy") {
      console.warn("💡 Tip: Get testnet MATIC from the Polygon Amoy Faucet before deploying.");
    }
  }

  const deployedContracts = {};

  // 1. Deploy ContractAgreement first
  console.log("1. Deploying ContractAgreement...");
  const agreementAddress = await deployContract(
    "ContractAgreement",
    path.join(artifactsDir, "ContractAgreement.sol/ContractAgreement.json"),
    wallet
  );
  deployedContracts.ContractAgreement = agreementAddress;

  // 2. Deploy FreelanceReputation with ContractAgreement address
  console.log("2. Deploying FreelanceReputation...");
  const reputationAddress = await deployContract(
    "FreelanceReputation",
    path.join(artifactsDir, "FreelanceReputation.sol/FreelanceReputation.json"),
    wallet,
    agreementAddress
  );
  deployedContracts.FreelanceReputation = reputationAddress;

  // 3. Deploy DisputeResolution
  console.log("3. Deploying DisputeResolution...");
  const disputeAddress = await deployContract(
    "DisputeResolution",
    path.join(artifactsDir, "DisputeResolution.sol/DisputeResolution.json"),
    wallet
  );
  deployedContracts.DisputeResolution = disputeAddress;

  // 4. Deploy MilestoneRegistry
  console.log("4. Deploying MilestoneRegistry...");
  const milestoneAddress = await deployContract(
    "MilestoneRegistry",
    path.join(artifactsDir, "MilestoneRegistry.sol/MilestoneRegistry.json"),
    wallet
  );
  deployedContracts.MilestoneRegistry = milestoneAddress;

  console.log("\n📝 Note: FreelanceEscrow is deployed per-contract upon project escrow funding.\n");

  // Determine network name & chainId from provider
  const network = await provider.getNetwork();
  const chainId = network.chainId.toString();

  let detectedNetwork = "ganache";
  let prefix = "GANACHE";

  if (chainId === "80002" || rpcUrl.toLowerCase().includes("amoy") || networkArg === "amoy") {
    detectedNetwork = "amoy";
    prefix = "AMOY";
  } else if (chainId === "137" || rpcUrl.toLowerCase().includes("polygon") || networkArg === "polygon") {
    detectedNetwork = "polygon";
    prefix = "POLYGON";
  } else if (chainId === "11155111" || rpcUrl.toLowerCase().includes("sepolia") || networkArg === "sepolia") {
    detectedNetwork = "sepolia";
    prefix = "SEPOLIA";
  } else if (chainId === "31337" || rpcUrl.toLowerCase().includes("8545")) {
    detectedNetwork = "hardhat";
    prefix = "HARDHAT";
  }

  const deploymentInfo = {
    network: detectedNetwork,
    chainId: chainId,
    rpcUrl: rpcUrl,
    deployer: wallet.address,
    contracts: deployedContracts,
    deployedAt: new Date().toISOString(),
  };

  const deploymentPath = path.join(__dirname, "../deployment.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  // Update .env file with new contract addresses and active RPC
  const envPath = path.join(__dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf8");

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
    setOrAppendEnv("BLOCKCHAIN_RPC_URL", rpcUrl);
    setOrAppendEnv("BLOCKCHAIN_MODE", "real");

    fs.writeFileSync(envPath, envContent, "utf8");
    console.log(`📝 Updated .env with new ${prefix} addresses, BLOCKCHAIN_RPC_URL, and BLOCKCHAIN_MODE=real.`);
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log(`✅ All contracts deployed successfully to ${detectedNetwork.toUpperCase()} (Chain ID: ${chainId})!`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error.message);
  process.exit(1);
});
