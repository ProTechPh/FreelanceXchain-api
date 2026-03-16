#!/usr/bin/env tsx
/**
 * Deploy Smart Contracts Script
 * Deploys all FreelanceXchain smart contracts to the configured network
 * 
 * Usage:
 *   pnpm tsx scripts/deploy-contracts.ts
 * 
 * Make sure to set BLOCKCHAIN_RPC_URL and BLOCKCHAIN_PRIVATE_KEY in .env
 */

import { deployAllContracts } from '../../src/services/contract-deployment.js';
import { isWeb3Available, getWalletInfo } from '../../src/services/web3-client.js';
import { getCurrentNetwork } from '../../src/config/contracts.js';

async function main() {
  console.log('🔗 FreelanceXchain Smart Contract Deployment\n');

  // Check Web3 configuration
  if (!isWeb3Available()) {
    console.error('❌ Error: Web3 is not configured');
    console.error('Please set BLOCKCHAIN_RPC_URL and BLOCKCHAIN_PRIVATE_KEY in your .env file');
    process.exit(1);
  }

  try {
    // Display wallet info
    const walletInfo = await getWalletInfo();
    console.log('📍 Network:', getCurrentNetwork());
    console.log('👛 Deployer Address:', walletInfo.address);
    console.log('💰 Balance:', (Number(walletInfo.balance) / 1e18).toFixed(4), 'ETH');
    console.log('🔗 Chain ID:', walletInfo.chainId);
    console.log('');

    // Check if wallet has sufficient balance
    if (walletInfo.balance < BigInt(1e17)) { // 0.1 ETH
      console.warn('⚠️  Warning: Low balance. You may need more ETH for deployment.');
      console.log('');
    }

    // Deploy contracts
    const summary = await deployAllContracts();

    // Display summary
    console.log('\n📊 Deployment Complete!');
    console.log('=======================');
    console.log(`Network: ${summary.network}`);
    console.log(`Chain ID: ${summary.chainId}`);
    console.log(`Total Gas Used: ${summary.totalGasUsed.toString()}`);
    console.log(`Timestamp: ${new Date(summary.timestamp).toISOString()}`);
    console.log('');
    console.log('✅ All contracts are ready to use!');

  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
