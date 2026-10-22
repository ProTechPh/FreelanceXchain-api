import { describe, it, expect } from '@jest/globals';
import { Wallet, verifyTypedData, TypedDataEncoder } from 'ethers';
import {
  validateOfferTerms,
  seedOfferFromTemplate,
  computeOfferTotals,
  computeRushFee,
  hashOfferTerms,
  normalizeDate,
  floorUnits,
  minimumBaseUnits,
  ethToWei,
  hasAtMostDecimals,
  buildCanonicalTerms,
  hashTerms,
  buildSigningTypedData,
  parseTermsSnapshot,
  CONTRACT_TERMS_SCHEMA,
  type NormalizedOfferTerms,
} from '../../utils/contract-terms.js';
import { LEGAL_TERMS_HASH, LEGAL_TERMS_VERSION } from '../../constants/legal-terms.js';

const now = new Date('2026-10-19T12:00:00.000Z');

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    baseAmount: 1.5,
    additionalPay: 0.5,
    isRush: false,
    deadline: '2026-12-31',
    milestones: [
      { title: 'Design', description: 'Mockups', amount: 1, dueDate: '2026-11-15' },
      { title: 'Build', amount: 1, dueDate: '2026-12-31' },
    ],
    ...overrides,
  };
}

describe('contract-terms', () => {
  describe('money helpers', () => {
    it('computes rush fee on base only, rounded to cents', () => {
      expect(computeRushFee(1.5, true, 25)).toBe(0.375);
      expect(computeRushFee(1.5, false, 25)).toBe(0);
      expect(computeRushFee(1.5, true, 0)).toBe(0);
    });

    it('computes totals as base + additional + rush', () => {
      expect(computeOfferTotals({ baseAmount: 1, additionalPay: 0.2, isRush: true, rushFeePercentage: 10 }))
        .toEqual({ rushFee: 0.1, totalAmount: 1.3 });
      expect(computeOfferTotals({ baseAmount: 0.1, isRush: false })).toEqual({ rushFee: 0, totalAmount: 0.1 });
    });

    it('detects decimals and converts to wei without float noise', () => {
      expect(hasAtMostDecimals(0.1534)).toBe(true);
      expect(hasAtMostDecimals(0.15345)).toBe(false);
      expect(hasAtMostDecimals(1.25, 2)).toBe(true);
      expect(ethToWei(0.3)).toBe(300000000000000000n);
    });

    it('normalizes dates', () => {
      expect(normalizeDate('2026-11-01T10:00:00Z')).toBe('2026-11-01');
      expect(normalizeDate('2026-02-30')).toBeNull();
      expect(normalizeDate('nope')).toBeNull();
      expect(normalizeDate(undefined)).toBeNull();
    });
  });

  describe('validateOfferTerms', () => {
    it('accepts valid terms and recomputes totals', () => {
      const result = validateOfferTerms(validInput() as any, { floor: 1.5, now });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.terms.totalAmount).toBe(2);
        expect(result.terms.milestones[0]).toEqual({ title: 'Design', description: 'Mockups', amount: 1, dueDate: '2026-11-15' });
        expect(result.terms.milestones[1]!.description).toBe('');
      }
    });

    it('lets the base go down to half the proposed rate and no lower', () => {
      const belowRate = validateOfferTerms(validInput({ baseAmount: 1.49, additionalPay: 0.51 }) as any, { floor: 1.5, now });
      expect(belowRate.ok).toBe(true);
      const atHalf = validateOfferTerms(validInput({ baseAmount: 0.75, additionalPay: 1.25 }) as any, { floor: 1.5, now });
      expect(atHalf.ok).toBe(true);
      const belowHalf = validateOfferTerms(validInput({ baseAmount: 0.7499, additionalPay: 1.2501 }) as any, { floor: 1.5, now });
      expect(belowHalf.ok).toBe(false);
      if (!belowHalf.ok) {
        expect(belowHalf.code).toBe('FLOOR_VIOLATION');
        expect(belowHalf.message).toBe("The base amount cannot go below half of the freelancer's proposed rate (0.75 ETH)");
        expect(belowHalf.errors).toEqual([{ field: 'baseAmount', message: 'Must be at least 0.75' }]);
      }
    });

    it('rejects milestones that do not sum to the total', () => {
      const result = validateOfferTerms(validInput({ additionalPay: 0 }) as any, { floor: 1, now });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('AMOUNT_MISMATCH');
    });

    it('includes the rush fee in the total', () => {
      const result = validateOfferTerms(validInput({
        isRush: true,
        rushFeePercentage: 10,
        additionalPay: 0,
        milestones: [{ title: 'All', amount: 1.65, dueDate: '2026-12-01' }],
      }) as any, { floor: 1.5, now });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.terms.rushFee).toBe(0.15);
    });

    it('collects field errors', () => {
      const result = validateOfferTerms({
        baseAmount: 1.23456,
        additionalPay: -1,
        isRush: true,
        rushFeePercentage: 150,
        deadline: '2020-01-01',
        milestones: [
          { title: '', amount: 0, dueDate: 'bad' },
          { title: 'x'.repeat(300), description: 'd'.repeat(2001), amount: 2_000_000, dueDate: '2020-01-01' },
        ],
      } as any, { floor: 1, now, maxMilestones: 1 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('VALIDATION_ERROR');
        const fields = result.errors.map(e => e.field);
        expect(fields).toEqual(expect.arrayContaining([
          'baseAmount', 'additionalPay', 'rushFeePercentage', 'deadline', 'milestones',
          'milestones[0].title', 'milestones[0].amount', 'milestones[0].dueDate',
          'milestones[1].title', 'milestones[1].description', 'milestones[1].amount', 'milestones[1].dueDate',
        ]));
      }
    });

    it('rejects non-numeric money, rush percentage precision, missing milestones', () => {
      const r1 = validateOfferTerms({ baseAmount: 'x', isRush: true, rushFeePercentage: 1.234, deadline: 'bad', milestones: [] } as any, { floor: 1, now });
      expect(r1.ok).toBe(false);
      if (!r1.ok) expect(r1.errors.map(e => e.field)).toEqual(expect.arrayContaining(['baseAmount', 'rushFeePercentage', 'deadline', 'milestones']));
    });

    it('rejects due dates after the deadline or out of order', () => {
      const result = validateOfferTerms(validInput({
        milestones: [
          { title: 'A', amount: 1, dueDate: '2026-12-15' },
          { title: 'B', amount: 1, dueDate: '2027-01-15' },
          { title: 'C', amount: 0, dueDate: '2026-11-01' },
        ],
      }) as any, { floor: 1, now });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some(e => e.message.includes('after the contract deadline'))).toBe(true);
        expect(result.errors.some(e => e.message.includes('chronological'))).toBe(true);
      }
    });

    it('rejects totals above the maximum', () => {
      const result = validateOfferTerms(validInput({
        baseAmount: 900000,
        additionalPay: 900000,
        milestones: [{ title: 'A', amount: 900000, dueDate: '2026-12-01' }, { title: 'B', amount: 900000, dueDate: '2026-12-01' }],
      }) as any, { floor: 1, now });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain('Total must not exceed');
    });
  });

  describe('minimumBaseUnits', () => {
    it('is half the proposed rate, rounded up to the contract precision', () => {
      expect(minimumBaseUnits(1.5)).toBe(7500);
      expect(minimumBaseUnits(0.1534)).toBe(767);
      expect(minimumBaseUnits(0.1535)).toBe(768);
      expect(minimumBaseUnits(0.0001)).toBe(1);
    });
  });

  describe('fractional proposed rates', () => {
    it('keeps 4-decimal rates as the exact floor', () => {
      expect(floorUnits(0.1534)).toBe(1534);
      expect(floorUnits(0.15)).toBe(1500);
      const below = validateOfferTerms(validInput({ baseAmount: 0.0766, additionalPay: 1.9234 }) as any, { floor: 0.1534, now });
      expect(below.ok).toBe(false);
      if (!below.ok) {
        expect(below.code).toBe('FLOOR_VIOLATION');
        expect(below.message).toContain('0.0767 ETH');
      }
      expect(validateOfferTerms(validInput({ baseAmount: 0.0767, additionalPay: 1.9233 }) as any, { floor: 0.1534, now }).ok).toBe(true);
      expect(floorUnits(0.15345)).toBe(1535);
    });

    it('seeds offers from a fractional rate that pass validation', () => {
      const seed = seedOfferFromTemplate({ milestones: [], deadline: '2026-12-31' }, { proposed_rate: 0.1534 }, now);
      expect(seed.baseAmount).toBe(0.1534);
      expect(validateOfferTerms(seed, { floor: 0.1534, now }).ok).toBe(true);
    });
  });

  describe('seedOfferFromTemplate', () => {
    it('rescales project milestones to the proposal total with rush fee and clamps dates', () => {
      const seed = seedOfferFromTemplate(
        {
          milestones: [
            { title: 'A', amount: 1, due_date: '2026-01-01' },
            { title: 'B', amount: 2, dueDate: '2027-06-01', description: 'desc' },
          ],
          deadline: '2026-12-31',
          is_rush: true,
          rush_fee_percentage: 25,
        },
        { proposed_rate: 1.5 },
        now,
      );
      expect(seed.totalAmount).toBe(1.875);
      expect(seed.milestones.map(m => m.amount)).toEqual([0.625, 1.25]);
      expect(seed.milestones[0]!.dueDate).toBe('2026-10-19');
      expect(seed.milestones[1]!.dueDate).toBe('2026-12-31');
      expect(validateOfferTerms(seed, { floor: 1.5, now }).ok).toBe(true);
    });

    it('creates a single milestone and a duration-based deadline when the template is empty or expired', () => {
      const seed = seedOfferFromTemplate({ milestones: [], deadline: '2020-01-01' }, { proposed_rate: 2, estimated_duration: 10 }, now);
      expect(seed.deadline).toBe('2026-10-29');
      expect(seed.milestones).toHaveLength(1);
      expect(seed.milestones[0]!.amount).toBe(2);
      expect(seed.isRush).toBe(false);
      expect(validateOfferTerms(seed, { floor: 2, now }).ok).toBe(true);
    });

    it('splits evenly when template amounts are zero and names untitled milestones', () => {
      const seed = seedOfferFromTemplate({ milestones: [{ amount: 0 }, { amount: 0 }, { amount: 0 }] as any }, { proposed_rate: 1 });
      expect(seed.milestones.map(m => m.amount)).toEqual([0.3333, 0.3333, 0.3334]);
      expect(seed.milestones[0]!.title).toBe('Milestone 1');
    });
  });

  describe('hashing and EIP-712', () => {
    const terms: NormalizedOfferTerms = {
      baseAmount: 1.5, additionalPay: 0.5, isRush: true, rushFeePercentage: 10, rushFee: 0.15, totalAmount: 2.15,
      deadline: '2026-12-31',
      milestones: [{ title: 'A', description: 'first', amount: 2.15, dueDate: '2026-12-01' }],
    };
    const employerWallet = '0x1111111111111111111111111111111111111111';
    const freelancerWallet = '0x2222222222222222222222222222222222222222';
    const canonical = buildCanonicalTerms({
      contractId: 'c1', projectId: 'p1', proposalId: 'pr1', offerId: 'o1',
      employerId: 'e1', freelancerId: 'f1', employerWallet, freelancerWallet, terms,
    });

    it('hashes offers deterministically', () => {
      expect(hashOfferTerms(terms)).toBe(hashOfferTerms({ ...terms, milestones: [...terms.milestones] }));
      expect(hashOfferTerms(terms)).not.toBe(hashOfferTerms({ ...terms, baseAmount: 1.6 }));
    });

    it('builds canonical terms with wei amounts and legal hash', () => {
      expect(canonical.schema).toBe(CONTRACT_TERMS_SCHEMA);
      expect(canonical.totalAmountWei).toBe('2150000000000000000');
      expect(canonical.rushFeeBps).toBe(1000);
      expect(canonical.legalTermsHash).toBe(LEGAL_TERMS_HASH);
      expect(canonical.legalTermsVersion).toBe(LEGAL_TERMS_VERSION);
      expect(canonical.milestones[0]!.index).toBe(0);
    });

    it('produces a stable terms hash (fixed vector)', () => {
      const again = buildCanonicalTerms({
        contractId: 'c1', projectId: 'p1', proposalId: 'pr1', offerId: 'o1',
        employerId: 'e1', freelancerId: 'f1', employerWallet: employerWallet.toUpperCase().replace('0X', '0x'), freelancerWallet, terms,
      });
      expect(hashTerms(again)).toBe(hashTerms(canonical));
      expect(hashTerms(canonical)).toMatch(/^0x[0-9a-f]{64}$/);
      expect(hashTerms({ ...canonical, deadline: '2027-01-01' })).not.toBe(hashTerms(canonical));
    });

    it('signs and verifies typed data with a real wallet', async () => {
      const wallet = Wallet.createRandom();
      const ownTerms = buildCanonicalTerms({
        contractId: 'c1', projectId: 'p1', proposalId: 'pr1', offerId: 'o1',
        employerId: 'e1', freelancerId: 'f1', employerWallet, freelancerWallet: wallet.address, terms,
      });
      const typed = buildSigningTypedData(ownTerms, 'freelancer', 1337);
      expect(TypedDataEncoder.from(typed.types).primaryType).toBe('SignContract');
      expect(typed.message.termsHash).toBe(hashTerms(ownTerms));
      const signature = await wallet.signTypedData(typed.domain, typed.types, typed.message);
      expect(verifyTypedData(typed.domain, typed.types, typed.message, signature)).toBe(wallet.address);
    });

    it('parses stored snapshots', () => {
      expect(parseTermsSnapshot(JSON.stringify(canonical))).toEqual(canonical);
      expect(parseTermsSnapshot(canonical)).toBe(canonical);
      expect(parseTermsSnapshot('{bad')).toBeNull();
      expect(parseTermsSnapshot(null)).toBeNull();
      expect(parseTermsSnapshot({ schema: 'other' })).toBeNull();
    });
  });
});
