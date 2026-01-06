require("dotenv").config();

// Check if private key is valid (64 hex chars)
const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY || "";
const isValidPrivateKey = /^[a-fA-F0-9]{64}$/.test(privateKey);
const accounts = isValidPrivateKey ? [privateKey] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    ganache: {
      url: "http://127.0.0.1:7545",
      chainId: 1337,
    },
    sepolia: {
      url: process.env.BLOCKCHAIN_RPC_URL || "https://sepolia.infura.io/v3/YOUR_PROJECT_ID",
      accounts: accounts,
      chainId: 11155111,
    },
    polygon: {
      url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY || ""}`,
      accounts: accounts,
      chainId: 137,
    },
    mumbai: {
      url: `https://polygon-mumbai.infura.io/v3/${process.env.INFURA_API_KEY || ""}`,
      accounts: accounts,
      chainId: 80001,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
