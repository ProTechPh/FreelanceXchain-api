/**
 * escrow-inspector.cjs — Diagnose "missing revert data" / CALL_EXCEPTION on FreelanceEscrow.
 * Replays the failing call via eth_call (which returns revert data that estimateGas hides)
 * and decodes the custom-error selector. Also dumps the escrow's on-chain state.
 * Usage: node scripts/escrow-inspector.cjs <escrowAddress> [signer] [calldata]
 * (default calldata = approveMilestone(0))
 */
const { JsonRpcProvider, Contract } = require('ethers');

const RPC_URL = process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:7545';
const DEFAULT_CALLDATA = '0xc438b40f' + '00'.repeat(32); // approveMilestone(0)
const [, , ESCROW = '', SIGNER = '', CALLDATA = DEFAULT_CALLDATA] = process.argv;

const ABI = [
  'function employer() view returns (address)',
  'function freelancer() view returns (address)',
  'function arbiter() view returns (address)',
  'function platform() view returns (address)',
  'function isActive() view returns (bool)',
  'function totalAmount() view returns (uint256)',
  'function releasedAmount() view returns (uint256)',
  'function refundedAmount() view returns (uint256)',
  'function getMilestoneCount() view returns (uint256)',
  'function getMilestone(uint256) view returns (uint256,uint256,string)',
  'function getBalance() view returns (uint256)',
  'function contractId() view returns (string)',
];
const STATUS_NAMES = ['Pending', 'Submitted', 'Approved', 'Disputed', 'Refunded'];

(async () => {
  if (!/^0x[a-fA-F0-9]{40}$/.test(ESCROW)) {
    console.error('Usage: node scripts/escrow-inspector.cjs <escrowAddress> [signer] [calldata]');
    process.exit(1);
  }
  const provider = new JsonRpcProvider(RPC_URL);
  const code = await provider.getCode(ESCROW);
  if (code === '0x') {
    console.error(`No contract code at ${ESCROW} on ${RPC_URL} — wrong address or wrong network.`);
    process.exit(2);
  }

  const escrow = new Contract(ESCROW, ABI, provider);
  const [employer, freelancer, arbiter, platform, isActive, total, released, refunded, count, balance, contractId] =
    await Promise.all([
      escrow.employer(), escrow.freelancer(), escrow.arbiter(), escrow.platform(), escrow.isActive(),
      escrow.totalAmount(), escrow.releasedAmount(), escrow.refundedAmount(), escrow.getMilestoneCount(),
      escrow.getBalance(), escrow.contractId(),
    ]);

  console.log('=== FreelanceEscrow state ===');
  console.log(JSON.stringify({
    escrow: ESCROW, employer, freelancer, arbiter, platform, isActive,
    totalAmount: total.toString(), releasedAmount: released.toString(), refundedAmount: refunded.toString(),
    milestoneCount: count.toString(), balance: balance.toString(), contractId,
    signerIsEmployer: SIGNER && SIGNER.toLowerCase() === employer.toLowerCase(),
    signerIsPlatform: SIGNER && SIGNER.toLowerCase() === platform.toLowerCase(),
    signerIsFreelancer: SIGNER && SIGNER.toLowerCase() === freelancer.toLowerCase(),
  }, null, 2));

  for (let i = 0; i < count; i++) {
    try {
      const ms = await escrow.getMilestone(i);
      console.log(`milestone[${i}] =`, JSON.stringify({
        amount: ms[0].toString(), status: STATUS_NAMES[Number(ms[1])] ?? ms[1].toString(), description: ms[2],
      }));
    } catch (err) {
      console.log(`getMilestone(${i}) error:`, err.shortMessage || err.message);
    }
  }

  console.log('\n=== Simulated call ===');
  console.log('calldata:', CALLDATA);
  try {
    const result = await provider.call({ to: ESCROW, ...(SIGNER ? { from: SIGNER } : {}), data: CALLDATA });
    console.log('transaction would SUCCEED; eth_call returned:', result);
  } catch (err) {
    const rawData = err.data ?? err.error?.data ?? err.error?.data?.data;
    const selector = typeof rawData === 'string' && rawData.startsWith('0x') ? rawData : null;
    console.log('transaction REVERTS. ethers message:', err.shortMessage || err.message);
    if (selector) {
      const sig = decodeSelector(selector.slice(0, 10));
      console.log(`revert selector: ${selector.slice(0, 10)}`);
      console.log(`==> custom error: ${sig ? `${sig.name}() — guard: ${sig.guard}` : 'unknown (not in FreelanceEscrow)'}`);
    } else {
      console.log('No revert data returned by the node — the exact "missing revert data" case ethers reports.');
    }
  }
})();

/* Keccak256-name lookup for FreelanceEscrow custom errors (mirrors contracts/FreelanceEscrow.sol). */
function decodeSelector(selector) {
  const { id } = require('ethers');
  const guards = {
    'InvalidFreelancerAddress()': 'constructor', 'InvalidArbiterAddress()': 'constructor',
    'InvalidPlatformAddress()': 'constructor', 'ArbiterCannotBeEmployer()': 'constructor',
    'ArbiterCannotBeFreelancer()': 'constructor', 'MustHaveAtLeastOneMilestone()': 'constructor',
    'AmountsDescriptionsMismatch()': 'constructor', 'MilestoneAmountMustBePositive()': 'constructor',
    'InsufficientFunds()': 'constructor', 'ExcessRefundFailed()': 'constructor/deposit',
    'OnlyEmployer()': 'approveMilestone/refundMilestone/cancelContract',
    'OnlyFreelancer()': 'submitMilestone', 'OnlyArbiter()': 'resolveDispute', 'OnlyParties()': 'disputeMilestone',
    'ContractNotActive()': 'all state-changing functions while !isActive',
    'ReentrantCall()': 'nonReentrant guard',
    'InvalidMilestoneIndex()': 'index >= milestones.length',
    'MilestoneNotPending()': 'submitMilestone: milestone must be Pending',
    'MilestoneNotSubmitted()': 'approveMilestone/disputeMilestone: milestone must be Submitted',
    'MilestoneNotDisputed()': 'resolveDispute: milestone must be Disputed',
    'TransferFailed()': 'freelancer ETH transfer failed (approve)',
    'RefundFailed()': 'employer ETH transfer failed (refund/cancel)',
    'CannotCancelSubmittedOrDisputed()': 'cancelContract loop guard',
    'InvalidResolutionBps()': 'resolveDispute: freelancerBps > 10000',
    'NothingToWithdraw()': 'withdraw: pendingWithdrawals == 0',
  };
  for (const [sig, guard] of Object.entries(guards)) {
    if (id(sig).slice(0, 10) === selector) return { name: sig.replace('()', ''), guard };
  }
  return null;
}