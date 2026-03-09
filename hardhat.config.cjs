require("dotenv").config();

// Check if private key is valid (64 hex chars)
const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY || "";
const isValidPrivateKey = /^[a-fA-F0-9]{64}$/.test(privateKey);
const accounts = isValidPrivateKey ? [privateKey] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainId: 31337,
    },
    ganache: {
      type: "http",
      url: "http://127.0.0.1:7545",
      chainId: 1337,
    },
    sepolia: {
      type: "http",
      url: process.env.BLOCKCHAIN_RPC_URL || "https://sepolia.infura.io/v3/YOUR_PROJECT_ID",
      accounts: accounts,
      chainId: 11155111,
    },
    polygon: {
      type: "http",
      url: process.env.POLYGON_RPC_URL || `https://polygon-mainnet.infura.io/v3/${process.env.POLYGON_API_KEY || ""}`,
      accounts: accounts,
      chainId: 137,
    },
    amoy: {
      type: "http",
      url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts: accounts,
      chainId: 80002,
      gasPrice: 30000000000, // 30 gwei - Amoy default
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
