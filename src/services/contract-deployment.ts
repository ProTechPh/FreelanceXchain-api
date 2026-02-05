/**
 * Smart Contract Deployment Utility
 * Deploys all smart contracts and manages their addresses
 */

import { ContractFactory } from 'ethers';
import { getWallet, isWeb3Available, getNetworkInfo, getFreshWallet } from './web3-client';
import { setContractAddress, getCurrentNetwork } from '../config/contracts';
import {
  FreelanceReputationABI,
  FreelanceReputationBytecode,
  ContractAgreementABI,
  ContractAgreementBytecode,
  DisputeResolutionABI,
  DisputeResolutionBytecode,
  MilestoneRegistryABI,
  MilestoneRegistryBytecode,
} from './contract-abis';

export type DeploymentResult = {
  contractName: string;
  address: string;
  transactionHash: string;
  blockNumber: number;
  gasUsed: bigint;
};

export type DeploymentSummary = {
  network: string;
  chainId: number;
  deployedContracts: DeploymentResult[];
  totalGasUsed: bigint;
  timestamp: number;
};

/**
 * Deploy Reputation contract
 */
export async function deployReputationContract(): Promise<DeploymentResult> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  console.log('Deploying FreelanceReputation contract...');
  // Use fresh wallet instance to ensure accurate nonce
  const wallet = getFreshWallet();
  
  const factory = new ContractFactory(FreelanceReputationABI, FreelanceReputationBytecode, wallet);

  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();

  if (!deployTx) {
    throw new Error('Deployment transaction not found');
  }

  const receipt = await deployTx.wait();
  if (!receipt) {
    throw new Error('Failed to get deployment receipt');
  }

  // Save address to configuration
  setContractAddress('reputation', address);

  console.log(`✓ FreelanceReputation deployed at: ${address}`);

  return {
    contractName: 'FreelanceReputation',
    address,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
  };
}

/**
 * Deploy Agreement contract
 */
export async function deployAgreementContract(): Promise<DeploymentResult> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  console.log('Deploying ContractAgreement contract...');
  // Use fresh wallet instance to ensure accurate nonce
  const wallet = getFreshWallet();
  
  const factory = new ContractFactory(ContractAgreementABI, ContractAgreementBytecode, wallet);

  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();

  if (!deployTx) {
    throw new Error('Deployment transaction not found');
  }

  const receipt = await deployTx.wait();
  if (!receipt) {
    throw new Error('Failed to get deployment receipt');
  }

  // Save address to configuration
  setContractAddress('agreement', address);

  console.log(`✓ ContractAgreement deployed at: ${address}`);

  return {
    contractName: 'ContractAgreement',
    address,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
  };
}

/**
 * Deploy Dispute Resolution contract
 */
export async function deployDisputeResolutionContract(): Promise<DeploymentResult> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  console.log('Deploying DisputeResolution contract...');
  // Use fresh wallet instance to ensure accurate nonce
  const wallet = getFreshWallet();
  
  const factory = new ContractFactory(DisputeResolutionABI, DisputeResolutionBytecode, wallet);

  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();

  if (!deployTx) {
    throw new Error('Deployment transaction not found');
  }

  const receipt = await deployTx.wait();
  if (!receipt) {
    throw new Error('Failed to get deployment receipt');
  }

  // Save address to configuration
  setContractAddress('disputeResolution', address);

  console.log(`✓ DisputeResolution deployed at: ${address}`);

  return {
    contractName: 'DisputeResolution',
    address,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
  };
}

/**
 * Deploy Milestone Registry contract
 */
export async function deployMilestoneRegistryContract(): Promise<DeploymentResult> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  console.log('Deploying MilestoneRegistry contract...');
  // Use fresh wallet instance to ensure accurate nonce
  const wallet = getFreshWallet();
  
  const factory = new ContractFactory(MilestoneRegistryABI, MilestoneRegistryBytecode, wallet);

  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();

  if (!deployTx) {
    throw new Error('Deployment transaction not found');
  }

  const receipt = await deployTx.wait();
  if (!receipt) {
    throw new Error('Failed to get deployment receipt');
  }

  // Save address to configuration
  setContractAddress('milestoneRegistry', address);

  console.log(`✓ MilestoneRegistry deployed at: ${address}`);

  return {
    contractName: 'MilestoneRegistry',
    address,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
  };
}

/**
 * Deploy all contracts
 */
export async function deployAllContracts(): Promise<DeploymentSummary> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured. Please set BLOCKCHAIN_RPC_URL and BLOCKCHAIN_PRIVATE_KEY');
  }

  const network = await getNetworkInfo();
  console.log(`\n🚀 Deploying contracts to ${network.name} (Chain ID: ${network.chainId})\n`);

  const deployedContracts: DeploymentResult[] = [];
  let totalGasUsed = BigInt(0);

  try {
    // Deploy Reputation contract
    const reputation = await deployReputationContract();
    deployedContracts.push(reputation);
    totalGasUsed += reputation.gasUsed;

    // Deploy Agreement contract
    const agreement = await deployAgreementContract();
    deployedContracts.push(agreement);
    totalGasUsed += agreement.gasUsed;

    // Deploy Dispute Resolution contract
    const dispute = await deployDisputeResolutionContract();
    deployedContracts.push(dispute);
    totalGasUsed += dispute.gasUsed;

    // Deploy Milestone Registry contract
    const milestone = await deployMilestoneRegistryContract();
    deployedContracts.push(milestone);
    totalGasUsed += milestone.gasUsed;

    console.log('\n✅ All contracts deployed successfully!\n');
    console.log('Deployment Summary:');
    console.log('===================');
    deployedContracts.forEach(contract => {
      console.log(`${contract.contractName}: ${contract.address}`);
    });
    console.log(`\nTotal Gas Used: ${totalGasUsed.toString()}`);
    console.log('\n📝 Save these addresses to your .env file:');
    if (deployedContracts[0]) console.log(`${getCurrentNetwork().toUpperCase()}_REPUTATION_ADDRESS=${deployedContracts[0].address}`);
    if (deployedContracts[1]) console.log(`${getCurrentNetwork().toUpperCase()}_AGREEMENT_ADDRESS=${deployedContracts[1].address}`);
    if (deployedContracts[2]) console.log(`${getCurrentNetwork().toUpperCase()}_DISPUTE_ADDRESS=${deployedContracts[2].address}`);
    if (deployedContracts[3]) console.log(`${getCurrentNetwork().toUpperCase()}_MILESTONE_ADDRESS=${deployedContracts[3].address}`);

    return {
      network: network.name,
      chainId: network.chainId,
      deployedContracts,
      totalGasUsed,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    throw error;
  }
}

/**
 * Verify contract deployment
 */
export async function verifyContractDeployment(address: string): Promise<boolean> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  try {
    const wallet = getWallet();
    if (!wallet.provider) {
      throw new Error('Provider not available');
    }
    const code = await wallet.provider.getCode(address);
    return code !== '0x';
  } catch (error) {
    return false;
  }
}
