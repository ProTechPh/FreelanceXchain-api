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

const FreelanceReputationArtifact = require(join(__dirname, '../../artifacts/contracts/FreelanceReputation.sol/FreelanceReputation.json'));
const FreelanceEscrowArtifact = require(join(__dirname, '../../artifacts/contracts/FreelanceEscrow.sol/FreelanceEscrow.json'));
const ContractAgreementArtifact = require(join(__dirname, '../../artifacts/contracts/ContractAgreement.sol/ContractAgreement.json'));
const DisputeResolutionArtifact = require(join(__dirname, '../../artifacts/contracts/DisputeResolution.sol/DisputeResolution.json'));
const MilestoneRegistryArtifact = require(join(__dirname, '../../artifacts/contracts/MilestoneRegistry.sol/MilestoneRegistry.json'));

export const FreelanceReputationABI = FreelanceReputationArtifact.abi;
export const FreelanceEscrowABI = FreelanceEscrowArtifact.abi;
export const ContractAgreementABI = ContractAgreementArtifact.abi;
export const DisputeResolutionABI = DisputeResolutionArtifact.abi;
export const MilestoneRegistryABI = MilestoneRegistryArtifact.abi;

export const FreelanceReputationBytecode = FreelanceReputationArtifact.bytecode;
export const FreelanceEscrowBytecode = FreelanceEscrowArtifact.bytecode;
export const ContractAgreementBytecode = ContractAgreementArtifact.bytecode;
export const DisputeResolutionBytecode = DisputeResolutionArtifact.bytecode;
export const MilestoneRegistryBytecode = MilestoneRegistryArtifact.bytecode;
