/**
 * Contract ABIs
 * Exports compiled contract ABIs for blockchain interaction
 */

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { InterfaceAbi } from 'ethers';

function tryLoadArtifact(contractPath: string): { abi: InterfaceAbi; bytecode: string } | null {
  try {
    const artifactPath = join(process.cwd(), 'artifacts/contracts', contractPath);
    const content = readFileSync(artifactPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    console.warn(`[contract-abis] Could not load artifact: ${contractPath}. Smart contract features will be unavailable.`);
    return null;
  }
}

const FreelanceReputationArtifact = tryLoadArtifact('FreelanceReputation.sol/FreelanceReputation.json');
const FreelanceEscrowArtifact = tryLoadArtifact('FreelanceEscrow.sol/FreelanceEscrow.json');

// Fall back to an empty ABI (not null) so consumers can pass it to ethers' non-null InterfaceAbi params.
// When artifacts are missing, method calls fail at resolution time instead of contract construction.
export const FreelanceReputationABI: InterfaceAbi = FreelanceReputationArtifact?.abi ?? [];
export const FreelanceEscrowABI: InterfaceAbi = FreelanceEscrowArtifact?.abi ?? [];

export const FreelanceEscrowBytecode = FreelanceEscrowArtifact?.bytecode ?? '';