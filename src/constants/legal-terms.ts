/**
 * Versioned legal clauses every signed contract binds to.
 * The hash of this text is embedded in the EIP-712 terms both parties sign,
 * so changing a clause requires bumping LEGAL_TERMS_VERSION.
 */
import { id as keccakUtf8 } from 'ethers';

export const LEGAL_TERMS_VERSION = 'fxc-legal-v1';

export const LEGAL_TERMS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'Confidentiality & NDA',
    body: 'Both Client and Contractor agree to keep all technical specifications, code, mockups, trade secrets, and non-public business information confidential. No proprietary materials may be disclosed to third parties without prior written consent.',
  },
  {
    title: 'Intellectual Property (IP) Transfer',
    body: 'Upon approval of final milestone deliverable and complete release of agreed escrow funds, all intellectual property rights, copyrights, and title in the deliverable are irrevocably transferred to the Client.',
  },
  {
    title: 'Escrow Settlement',
    body: 'Payments are held securely in non-custodial smart contracts and disbursed strictly upon Client milestone acceptance or formal arbitration ruling under the platform dispute mechanism.',
  },
];

export const LEGAL_TERMS_HASH = keccakUtf8(JSON.stringify(LEGAL_TERMS));

/** Consent statement shown next to the signature and embedded in the signed message. */
export const SIGNATURE_CONSENT_VERSION = 'fxc-esign-v1';
export const SIGNATURE_STATEMENT =
  'I have reviewed these contract terms and agree to be legally bound by them. My electronic signature and wallet signature have the same effect as a handwritten signature.';
