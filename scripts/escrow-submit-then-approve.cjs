/**
 * escrow-submit-then-approve.cjs — Unblocks a milestone stuck in the
 * "DB says submitted, chain says Pending" mismatch that causes approveMilestone
 * to revert with MilestoneNotSubmitted() (the "missing revert data" case).
 *
 * FreelanceEscrow.submitMilestone is onlyFreelancer, so the submit must be signed by
 * the FREELANCER wallet; approveMilestone must be signed by the EMPLOYER or PLATFORM
 * wallet. The API server wallet cannot perform the on-chain submit for the freelancer.
 *
 * Usage (secrets via env, never on the command line):
 *   $env:FREELANCER_PRIVATE_KEY="..."   # wallet == escrow.freelancer
 *   $env:EMPLOYER_PRIVATE_KEY="..."     # wallet == escrow.employer or escrow.platform
 *   node scripts/escrow-submit-then-approve.cjs <escrowAddress> <milestoneIndex>
 */
const { JsonRpcProvider, Wallet, Contract } = require('ethers');

const RPC_URL = process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:7545';
const [, , ESCROW, INDEX_RAW = '0'] = process.argv;
const INDEX = Number(INDEX_RAW);
const FREELANCER_KEY = process.env.FREELANCER_PRIVATE_KEY || '';
const APPROVER_KEY = process.env.EMPLOYER_PRIVATE_KEY || '';

const MINI_ABI = [
  'function employer() view returns (address)',
  'function freelancer() view returns (address)',
  'function platform() view returns (address)',
  'function isActive() view returns (bool)',
  'function getMilestone(uint256) view returns (uint256,uint256,string)',
  'function submitMilestone(uint256)',
  'function approveMilestone(uint256)',
];
const STATUS_NAMES = ['Pending', 'Submitted', 'Approved', 'Disputed', 'Refunded'];

async function statusLabel(escrow, index) {
  const ms = await escrow.getMilestone(index);
  return STATUS_NAMES[Number(ms[1])] ?? ms[1].toString();
}

(async () => {
  if (!/^0x[a-fA-F0-9]{40}$/.test(ESCROW) || !FREELANCER_KEY || !APPROVER_KEY) {
    console.error('Missing args. Set FREELANCER_PRIVATE_KEY and EMPLOYER_PRIVATE_KEY env vars, then:');
    console.error('node scripts/escrow-submit-then-approve.cjs <escrowAddress> <milestoneIndex>');
    process.exit(1);
  }

  const provider = new JsonRpcProvider(RPC_URL);
  const escrow = new Contract(ESCROW, MINI_ABI, provider);

  const [employer, freelancer, platform, isActive, before] = await Promise.all([
    escrow.employer(), escrow.freelancer(), escrow.platform(), escrow.isActive(), statusLabel(escrow, INDEX),
  ]);
  const freelancerWallet = new Wallet(FREELANCER_KEY, provider);
  const approverWallet = new Wallet(APPROVER_KEY, provider);

  console.log('Escrow      :', ESCROW);
  console.log('Milestone   :', INDEX, '| on-chain status:', before);
  console.log('isActive    :', isActive);
  console.log('freelancer  :', freelancer, '(submit signer:', freelancerWallet.address + ')');
  console.log('employer    :', employer, '| platform:', platform, '(approver signer:', approverWallet.address + ')');

  if (!isActive) {
    console.error('Contract is not active — nothing to do.');
    process.exit(2);
  }
  if (before === 'Submitted') {
    console.log('Milestone already Submitted on-chain; skipping submit.');
  } else {
    if (before !== 'Pending') {
      console.error(`Cannot submit: on-chain status is ${before}.`);
      process.exit(3);
    }
    if (freelancerWallet.address.toLowerCase() !== freelancer.toLowerCase()) {
      console.error('FREELANCER_PRIVATE_KEY does not match escrow.freelancer — submitMilestone would revert OnlyFreelancer.');
      process.exit(3);
    }
    const tx = await escrow.connect(freelancerWallet).submitMilestone(INDEX);
    await tx.wait();
    console.log(`submitMilestone(${INDEX}) tx:`, tx.hash);
  }

  const after = await statusLabel(escrow, INDEX);
  if (after !== 'Submitted') {
    console.error(`Still not Submitted after submit (status: ${after}); not approving.`);
    process.exit(4);
  }

  if (approverWallet.address.toLowerCase() !== employer.toLowerCase() &&
      approverWallet.address.toLowerCase() !== platform.toLowerCase()) {
    console.error('EMPLOYER_PRIVATE_KEY is neither employer nor platform — approveMilestone would revert OnlyEmployer.');
    process.exit(5);
  }
  const tx = await escrow.connect(approverWallet).approveMilestone(INDEX);
  const receipt = await tx.wait();
  console.log(`approveMilestone(${INDEX}) tx:`, tx.hash, '| status:', receipt.status === 1 ? 'success' : 'FAILED');
})();