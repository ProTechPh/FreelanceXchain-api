import { describe, it, expect } from '@jest/globals';
import {
  isApprovedEscrowDeployedBytecode,
  matchesBytecodeTemplate,
  LEGACY_FREELANCE_ESCROW_DEPLOYED_BYTECODE,
} from '../../services/escrow-bytecode-validator.js';
import { FreelanceEscrowDeployedBytecode } from '../../services/contract-abis.js';

describe('escrow-bytecode-validator', () => {
  it('accepts exact template match', () => {
    expect(
      matchesBytecodeTemplate(LEGACY_FREELANCE_ESCROW_DEPLOYED_BYTECODE, LEGACY_FREELANCE_ESCROW_DEPLOYED_BYTECODE)
    ).toBe(true);
  });

  it('accepts deployed bytecode when 32-byte PUSH32 immutable slots are populated with runtime values', () => {
    const populated = LEGACY_FREELANCE_ESCROW_DEPLOYED_BYTECODE.replace(
      /7f(0{64})/gi,
      '7f00000000000000000000000038cd68fb798d8785df40ce6c25f4856f9afaa8a1'
    );
    expect(populated).not.toBe(LEGACY_FREELANCE_ESCROW_DEPLOYED_BYTECODE);
    expect(matchesBytecodeTemplate(populated, LEGACY_FREELANCE_ESCROW_DEPLOYED_BYTECODE)).toBe(true);
  });

  it('accepts legacy frontend deployed bytecode via isApprovedEscrowDeployedBytecode even if artifact bytecode is empty', () => {
    const populatedLegacy = LEGACY_FREELANCE_ESCROW_DEPLOYED_BYTECODE.replace(
      /7f(0{64})/gi,
      '7f0000000000000000000000005787691f2c9fdb075a4c2706fd15ff4fe5a9f393'
    );
    expect(isApprovedEscrowDeployedBytecode(populatedLegacy, FreelanceEscrowDeployedBytecode)).toBe(true);
  });

  it('rejects bytecode whose non-immutable instructions are modified', () => {
    const tampered =
      '0x6040' + LEGACY_FREELANCE_ESCROW_DEPLOYED_BYTECODE.slice(6);
    expect(matchesBytecodeTemplate(tampered, LEGACY_FREELANCE_ESCROW_DEPLOYED_BYTECODE)).toBe(false);
  });

  it('rejects empty or 0x bytecode', () => {
    expect(matchesBytecodeTemplate('0x', LEGACY_FREELANCE_ESCROW_DEPLOYED_BYTECODE)).toBe(false);
    expect(matchesBytecodeTemplate('', LEGACY_FREELANCE_ESCROW_DEPLOYED_BYTECODE)).toBe(false);
  });
});
