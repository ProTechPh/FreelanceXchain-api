import { jest, describe, it, expect } from '@jest/globals';
import path from 'node:path';
import { AbiCoder, getAddress } from 'ethers';

// The compiled artifact is resolved from disk at runtime, which is not present
// in the unit-test environment. Supply the one view function the discovery path
// calls so ethers can encode and decode it against the mocked provider.
jest.unstable_mockModule(path.resolve(process.cwd(), 'src/services/contract-abis.ts'), () => ({
  FreelanceEscrowABI: [
    {
      inputs: [],
      name: 'contractId',
      outputs: [{ internalType: 'string', name: '', type: 'string' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
  FreelanceEscrowDeployedBytecode: '',
}));

const {
  isApprovedEscrowDeployedBytecode,
  matchesBytecodeTemplate,
  findExistingOnChainEscrowDeployment,
  LEGACY_FREELANCE_ESCROW_DEPLOYED_BYTECODE,
} = await import('../../services/escrow-bytecode-validator.js');

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
    expect(isApprovedEscrowDeployedBytecode(populatedLegacy, '')).toBe(true);
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

  it('rejects bytecode of a different length', () => {
    expect(matchesBytecodeTemplate('0x6000', LEGACY_FREELANCE_ESCROW_DEPLOYED_BYTECODE)).toBe(false);
  });

  it('compares bytecode case-insensitively', () => {
    const uppercase = `0x${LEGACY_FREELANCE_ESCROW_DEPLOYED_BYTECODE.slice(2).toUpperCase()}`;
    expect(matchesBytecodeTemplate(uppercase, LEGACY_FREELANCE_ESCROW_DEPLOYED_BYTECODE)).toBe(true);
  });

  it('does not mask a PUSH32 zero placeholder that starts on a nibble boundary', () => {
    const template = `0x0${'7f'}${'0'.repeat(64)}`;
    const onChain = `0x0${'7f'}${'1'.repeat(64)}`;
    expect(onChain).toHaveLength(template.length);
    expect(matchesBytecodeTemplate(onChain, template)).toBe(false);
  });

  it('rejects bytecode that matches neither the current nor the legacy template', () => {
    expect(isApprovedEscrowDeployedBytecode('0x6000', '0x6001')).toBe(false);
  });
});

describe('findExistingOnChainEscrowDeployment', () => {
  const employerWallet = '0x1111111111111111111111111111111111111111';
  const escrowAddress = '0x2222222222222222222222222222222222222222';
  const otherAddress = '0x3333333333333333333333333333333333333333';
  const txHash = '0xabc123';

  function encodedContractId(id: string) {
    return AbiCoder.defaultAbiCoder().encode(['string'], [id]);
  }

  function makeProvider(overrides: Record<string, any> = {}) {
    return {
      getBlockNumber: jest.fn<any>().mockResolvedValue(10),
      getBlock: jest.fn<any>().mockResolvedValue({ transactions: [] }),
      getTransaction: jest.fn<any>().mockResolvedValue(null),
      getTransactionReceipt: jest.fn<any>().mockResolvedValue(null),
      getCode: jest.fn<any>().mockResolvedValue('0x'),
      call: jest.fn<any>().mockResolvedValue(encodedContractId('contract-1')),
      ...overrides,
    } as any;
  }

  it('returns null without querying the provider when the contract id is empty', async () => {
    const provider = makeProvider();

    await expect(findExistingOnChainEscrowDeployment(provider, '', employerWallet)).resolves.toBeNull();

    expect(provider.getBlockNumber).not.toHaveBeenCalled();
  });

  it('returns null without querying the provider when the wallet address is malformed', async () => {
    const provider = makeProvider();

    await expect(
      findExistingOnChainEscrowDeployment(provider, 'contract-1', 'not-a-wallet')
    ).resolves.toBeNull();

    expect(provider.getBlockNumber).not.toHaveBeenCalled();
  });

  it('scans at most maxBlocksToScan blocks of history', async () => {
    const provider = makeProvider({
      getBlockNumber: jest.fn<any>().mockResolvedValue(105),
      getBlock: jest.fn<any>().mockResolvedValue({ transactions: [] }),
    });

    await expect(
      findExistingOnChainEscrowDeployment(provider, 'contract-1', employerWallet, 2)
    ).resolves.toBeNull();

    expect(provider.getBlock).toHaveBeenCalledTimes(3);
    expect(provider.getBlock).toHaveBeenNthCalledWith(1, 105);
    expect(provider.getBlock).toHaveBeenNthCalledWith(2, 104);
    expect(provider.getBlock).toHaveBeenNthCalledWith(3, 103);
  });

  it('ignores blocks without transactions and transactions sent to a contract', async () => {
    const provider = makeProvider({
      getBlock: jest.fn<any>().mockResolvedValue({ transactions: [txHash] }),
      getTransaction: jest.fn<any>().mockResolvedValue({ from: employerWallet, to: otherAddress }),
    });

    await expect(
      findExistingOnChainEscrowDeployment(provider, 'contract-1', employerWallet, 0)
    ).resolves.toBeNull();

    expect(provider.getTransaction).toHaveBeenCalledWith(txHash);
    expect(provider.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it('ignores deployments sent by a different wallet', async () => {
    const provider = makeProvider({
      getBlock: jest.fn<any>().mockResolvedValue({ transactions: [txHash] }),
      getTransaction: jest.fn<any>().mockResolvedValue({ from: otherAddress, to: null }),
    });

    await expect(
      findExistingOnChainEscrowDeployment(provider, 'contract-1', employerWallet, 0)
    ).resolves.toBeNull();

    expect(provider.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing receipt', null],
    ['a failed receipt', { status: 0, contractAddress: escrowAddress }],
    ['a receipt without a contract address', { status: 1, contractAddress: null }],
  ])('ignores a deployment with %s', async (_label, receipt) => {
    const provider = makeProvider({
      getBlock: jest.fn<any>().mockResolvedValue({ transactions: [txHash] }),
      getTransaction: jest.fn<any>().mockResolvedValue({ from: employerWallet, to: null }),
      getTransactionReceipt: jest.fn<any>().mockResolvedValue(receipt),
    });

    await expect(
      findExistingOnChainEscrowDeployment(provider, 'contract-1', employerWallet, 0)
    ).resolves.toBeNull();

    expect(provider.getCode).not.toHaveBeenCalled();
  });

  it('ignores an address that has no deployed code', async () => {
    const provider = makeProvider({
      getBlock: jest.fn<any>().mockResolvedValue({ transactions: [txHash] }),
      getTransaction: jest.fn<any>().mockResolvedValue({ from: employerWallet, to: null }),
      getTransactionReceipt: jest
        .fn<any>()
        .mockResolvedValue({ status: 1, contractAddress: escrowAddress }),
      getCode: jest.fn<any>().mockResolvedValue('0x'),
    });

    await expect(
      findExistingOnChainEscrowDeployment(provider, 'contract-1', employerWallet, 0)
    ).resolves.toBeNull();

    expect(provider.call).not.toHaveBeenCalled();
  });

  it('finds an escrow deployment whose on-chain contract id matches', async () => {
    const provider = makeProvider({
      getBlock: jest.fn<any>().mockResolvedValue({ transactions: [txHash] }),
      getTransaction: jest.fn<any>().mockResolvedValue({ from: employerWallet, to: null }),
      getTransactionReceipt: jest
        .fn<any>()
        .mockResolvedValue({ status: 1, contractAddress: escrowAddress }),
      getCode: jest.fn<any>().mockResolvedValue('0x60806040'),
    });

    const result = await findExistingOnChainEscrowDeployment(
      provider,
      'contract-1',
      employerWallet,
      0
    );

    expect(result).toEqual({
      escrowAddress: getAddress(escrowAddress),
      transactionHash: txHash,
    });

    expect(provider.getBlock).toHaveBeenCalledTimes(1);
  });

  it('keeps scanning when a deployment belongs to a different contract id', async () => {
    const provider = makeProvider({
      getBlock: jest.fn<any>().mockResolvedValue({ transactions: [txHash] }),
      getTransaction: jest.fn<any>().mockResolvedValue({ from: employerWallet, to: null }),
      getTransactionReceipt: jest
        .fn<any>()
        .mockResolvedValue({ status: 1, contractAddress: escrowAddress }),
      getCode: jest.fn<any>().mockResolvedValue('0x60806040'),
      call: jest.fn<any>().mockResolvedValue(encodedContractId('another-contract')),
    });

    await expect(
      findExistingOnChainEscrowDeployment(provider, 'contract-1', employerWallet, 0)
    ).resolves.toBeNull();
  });

  it('ignores deployments that do not expose a contractId function', async () => {
    const provider = makeProvider({
      getBlock: jest.fn<any>().mockResolvedValue({ transactions: [txHash] }),
      getTransaction: jest.fn<any>().mockResolvedValue({ from: employerWallet, to: null }),
      getTransactionReceipt: jest
        .fn<any>()
        .mockResolvedValue({ status: 1, contractAddress: escrowAddress }),
      getCode: jest.fn<any>().mockResolvedValue('0x60806040'),
      call: jest.fn<any>().mockRejectedValue(new Error('execution reverted')),
    });

    await expect(
      findExistingOnChainEscrowDeployment(provider, 'contract-1', employerWallet, 0)
    ).resolves.toBeNull();
  });

  it('returns null when the provider cannot read the latest block', async () => {
    const provider = makeProvider({
      getBlockNumber: jest.fn<any>().mockRejectedValue(new Error('RPC unavailable')),
    });

    await expect(
      findExistingOnChainEscrowDeployment(provider, 'contract-1', employerWallet)
    ).resolves.toBeNull();
  });
});
