/**
 * Contract ABIs
 * Exports compiled contract ABIs for blockchain interaction
 */

import FreelanceReputationArtifact from '../../artifacts/contracts/FreelanceReputation.sol/FreelanceReputation.json' with { type: 'json' };
import FreelanceEscrowArtifact from '../../artifacts/contracts/FreelanceEscrow.sol/FreelanceEscrow.json' with { type: 'json' };
import ContractAgreementArtifact from '../../artifacts/contracts/ContractAgreement.sol/ContractAgreement.json' with { type: 'json' };
import DisputeResolutionArtifact from '../../artifacts/contracts/DisputeResolution.sol/DisputeResolution.json' with { type: 'json' };
import MilestoneRegistryArtifact from '../../artifacts/contracts/MilestoneRegistry.sol/MilestoneRegistry.json' with { type: 'json' };

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
