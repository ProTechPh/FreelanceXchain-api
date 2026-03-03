/**
 * Contract ABIs
 * Exports compiled contract ABIs for blockchain interaction
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

function tryLoadArtifact(contractPath: string): { abi: any; bytecode: string } | null {
  try {
    return require(join(__dirname, '../../artifacts/contracts', contractPath));
  } catch {
    console.warn(`[contract-abis] Could not load artifact: ${contractPath}. Smart contract features will be unavailable.`);
    return null;
  }
}

const FreelanceReputationArtifact = tryLoadArtifact('FreelanceReputation.sol/FreelanceReputation.json');
const FreelanceEscrowArtifact = tryLoadArtifact('FreelanceEscrow.sol/FreelanceEscrow.json');
const ContractAgreementArtifact = tryLoadArtifact('ContractAgreement.sol/ContractAgreement.json');
const DisputeResolutionArtifact = tryLoadArtifact('DisputeResolution.sol/DisputeResolution.json');
const MilestoneRegistryArtifact = tryLoadArtifact('MilestoneRegistry.sol/MilestoneRegistry.json');

export const FreelanceReputationABI = FreelanceReputationArtifact?.abi ?? null;
export const FreelanceEscrowABI = FreelanceEscrowArtifact?.abi ?? null;
export const ContractAgreementABI = ContractAgreementArtifact?.abi ?? null;
export const DisputeResolutionABI = DisputeResolutionArtifact?.abi ?? null;
export const MilestoneRegistryABI = MilestoneRegistryArtifact?.abi ?? null;

export const FreelanceReputationBytecode = FreelanceReputationArtifact?.bytecode ?? '';
export const FreelanceEscrowBytecode = FreelanceEscrowArtifact?.bytecode ?? '';
export const ContractAgreementBytecode = ContractAgreementArtifact?.bytecode ?? '';
export const DisputeResolutionBytecode = DisputeResolutionArtifact?.bytecode ?? '';
export const MilestoneRegistryBytecode = MilestoneRegistryArtifact?.bytecode ?? '';
