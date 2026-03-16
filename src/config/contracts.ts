/**
 * Smart Contract Address Configuration
 * Manages deployed contract addresses for different networks
 */

import { config } from './env.js';

export type NetworkName = 'hardhat' | 'ganache' | 'sepolia' | 'polygon' | 'amoy' | 'mainnet';

export type ContractAddresses = {
  reputation?: string;
  escrow?: string;
  agreement?: string;
  disputeResolution?: string;
  milestoneRegistry?: string;
};

// Contract addresses by network
const contractAddresses: Record<NetworkName, ContractAddresses> = {
  hardhat: {},
  ganache: {},
  sepolia: {},
  polygon: {},
  amoy: {},
  mainnet: {},
};

// Load addresses from environment variables
if (process.env.HARDHAT_REPUTATION_ADDRESS) contractAddresses.hardhat.reputation = process.env.HARDHAT_REPUTATION_ADDRESS;
if (process.env.HARDHAT_ESCROW_ADDRESS) contractAddresses.hardhat.escrow = process.env.HARDHAT_ESCROW_ADDRESS;
if (process.env.HARDHAT_AGREEMENT_ADDRESS) contractAddresses.hardhat.agreement = process.env.HARDHAT_AGREEMENT_ADDRESS;
if (process.env.HARDHAT_DISPUTE_ADDRESS) contractAddresses.hardhat.disputeResolution = process.env.HARDHAT_DISPUTE_ADDRESS;
if (process.env.HARDHAT_MILESTONE_ADDRESS) contractAddresses.hardhat.milestoneRegistry = process.env.HARDHAT_MILESTONE_ADDRESS;

if (process.env.GANACHE_REPUTATION_ADDRESS) contractAddresses.ganache.reputation = process.env.GANACHE_REPUTATION_ADDRESS;
if (process.env.GANACHE_ESCROW_ADDRESS) contractAddresses.ganache.escrow = process.env.GANACHE_ESCROW_ADDRESS;
if (process.env.GANACHE_AGREEMENT_ADDRESS) contractAddresses.ganache.agreement = process.env.GANACHE_AGREEMENT_ADDRESS;
if (process.env.GANACHE_DISPUTE_ADDRESS) contractAddresses.ganache.disputeResolution = process.env.GANACHE_DISPUTE_ADDRESS;
if (process.env.GANACHE_MILESTONE_ADDRESS) contractAddresses.ganache.milestoneRegistry = process.env.GANACHE_MILESTONE_ADDRESS;

if (process.env.SEPOLIA_REPUTATION_ADDRESS) contractAddresses.sepolia.reputation = process.env.SEPOLIA_REPUTATION_ADDRESS;
if (process.env.SEPOLIA_ESCROW_ADDRESS) contractAddresses.sepolia.escrow = process.env.SEPOLIA_ESCROW_ADDRESS;
if (process.env.SEPOLIA_AGREEMENT_ADDRESS) contractAddresses.sepolia.agreement = process.env.SEPOLIA_AGREEMENT_ADDRESS;
if (process.env.SEPOLIA_DISPUTE_ADDRESS) contractAddresses.sepolia.disputeResolution = process.env.SEPOLIA_DISPUTE_ADDRESS;
if (process.env.SEPOLIA_MILESTONE_ADDRESS) contractAddresses.sepolia.milestoneRegistry = process.env.SEPOLIA_MILESTONE_ADDRESS;

if (process.env.POLYGON_REPUTATION_ADDRESS) contractAddresses.polygon.reputation = process.env.POLYGON_REPUTATION_ADDRESS;
if (process.env.POLYGON_ESCROW_ADDRESS) contractAddresses.polygon.escrow = process.env.POLYGON_ESCROW_ADDRESS;
if (process.env.POLYGON_AGREEMENT_ADDRESS) contractAddresses.polygon.agreement = process.env.POLYGON_AGREEMENT_ADDRESS;
if (process.env.POLYGON_DISPUTE_ADDRESS) contractAddresses.polygon.disputeResolution = process.env.POLYGON_DISPUTE_ADDRESS;
if (process.env.POLYGON_MILESTONE_ADDRESS) contractAddresses.polygon.milestoneRegistry = process.env.POLYGON_MILESTONE_ADDRESS;

if (process.env.AMOY_REPUTATION_ADDRESS) contractAddresses.amoy.reputation = process.env.AMOY_REPUTATION_ADDRESS;
if (process.env.AMOY_ESCROW_ADDRESS) contractAddresses.amoy.escrow = process.env.AMOY_ESCROW_ADDRESS;
if (process.env.AMOY_AGREEMENT_ADDRESS) contractAddresses.amoy.agreement = process.env.AMOY_AGREEMENT_ADDRESS;
if (process.env.AMOY_DISPUTE_ADDRESS) contractAddresses.amoy.disputeResolution = process.env.AMOY_DISPUTE_ADDRESS;
if (process.env.AMOY_MILESTONE_ADDRESS) contractAddresses.amoy.milestoneRegistry = process.env.AMOY_MILESTONE_ADDRESS;

if (process.env.MAINNET_REPUTATION_ADDRESS) contractAddresses.mainnet.reputation = process.env.MAINNET_REPUTATION_ADDRESS;
if (process.env.MAINNET_ESCROW_ADDRESS) contractAddresses.mainnet.escrow = process.env.MAINNET_ESCROW_ADDRESS;
if (process.env.MAINNET_AGREEMENT_ADDRESS) contractAddresses.mainnet.agreement = process.env.MAINNET_AGREEMENT_ADDRESS;
if (process.env.MAINNET_DISPUTE_ADDRESS) contractAddresses.mainnet.disputeResolution = process.env.MAINNET_DISPUTE_ADDRESS;
if (process.env.MAINNET_MILESTONE_ADDRESS) contractAddresses.mainnet.milestoneRegistry = process.env.MAINNET_MILESTONE_ADDRESS;

/**
 * Get current network name from RPC URL
 */
export function getCurrentNetwork(): NetworkName {
  const rpcUrl = config.blockchain.rpcUrl?.toLowerCase() || '';
  
  if (rpcUrl.includes('sepolia')) return 'sepolia';
  if (rpcUrl.includes('polygon-mainnet')) return 'polygon';
  if (rpcUrl.includes('amoy')) return 'amoy';
  if (rpcUrl.includes('127.0.0.1:8545') || rpcUrl.includes('localhost:8545')) return 'ganache';
  if (rpcUrl.includes('127.0.0.1:8545') || rpcUrl.includes('localhost:8545')) return 'hardhat';
  if (rpcUrl.includes('mainnet')) return 'mainnet';
  
  // Default to ganache for local development
  return 'ganache';
}

/**
 * Get contract addresses for current network
 */
export function getContractAddresses(): ContractAddresses {
  const network = getCurrentNetwork();
  return contractAddresses[network];
}

/**
 * Get specific contract address
 */
export function getContractAddress(contractName: keyof ContractAddresses): string | undefined {
  const addresses = getContractAddresses();
  return addresses[contractName];
}

/**
 * Set contract address for current network (used after deployment)
 */
export function setContractAddress(contractName: keyof ContractAddresses, address: string): void {
  const network = getCurrentNetwork();
  contractAddresses[network][contractName] = address;
}

/**
 * Check if all required contracts are deployed
 */
export function areContractsDeployed(): boolean {
  const addresses = getContractAddresses();
  return Boolean(
    addresses.reputation &&
    addresses.escrow &&
    addresses.agreement &&
    addresses.disputeResolution &&
    addresses.milestoneRegistry
  );
}

/**
 * Check if a specific contract is deployed
 */
export function isContractDeployed(contractName: keyof ContractAddresses): boolean {
  const address = getContractAddress(contractName);
  return Boolean(address);
}
