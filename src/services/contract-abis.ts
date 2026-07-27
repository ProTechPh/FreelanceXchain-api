/**
 * Contract ABIs
 * Exports compiled contract ABIs for blockchain interaction
 */

import { join } from 'node:path';
import { readFileSync } from 'node:fs';

function tryLoadArtifact(contractPath: string): { abi: any; bytecode: string } | null {
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

export const FreelanceReputationABI = FreelanceReputationArtifact?.abi ?? null;
export const FreelanceEscrowABI = FreelanceEscrowArtifact?.abi ?? null;

export const FreelanceEscrowBytecode = FreelanceEscrowArtifact?.bytecode ?? '';