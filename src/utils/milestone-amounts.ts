/**
 * Rescale a list of milestone amounts so they sum to `baseAmount + rushFee`,
 * preserving the original proportions. Each non-final milestone is rounded to
 * two decimals and the final milestone absorbs the rounding remainder, so the
 * resulting amounts always sum to exactly `baseAmount + rushFee` (matching the
 * two-decimal precision used for contract amounts).
 *
 * Used by three callers so the escrow ledger, the DB read model, and the
 * on-chain agreement never diverge on what a rush fee is worth:
 *  - rush-upgrade-service: applying an accepted upgrade to the DB milestones
 *  - proposal-service: folding the fee into project milestones at contract
 *    creation for rush proposals (initial rush)
 *  - payment-service: scaling escrow milestone amounts at deployment when the
 *    DB milestones still hold base amounts
 */
export function rescaleMilestoneAmounts(
  amounts: readonly number[],
  baseAmount: number,
  rushFee: number,
): number[] {
  if (amounts.length === 0) {
    return [];
  }

  const newTotal = baseAmount + rushFee;
  const result = [...amounts];

  let allocated = 0;
  for (let i = 0; i < result.length - 1; i++) {
    const newAmount = Math.round((result[i]! * newTotal) / baseAmount * 100) / 100;
    result[i] = newAmount;
    allocated += newAmount;
  }

  const lastIndex = result.length - 1;
  result[lastIndex] = Math.round((newTotal - allocated) * 100) / 100;

  return result;
}
