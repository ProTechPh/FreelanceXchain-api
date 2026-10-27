/**
 * Contract Signature Service
 *
 * Once terms are locked (`awaiting_signatures`) each party signs twice over the
 * same canonical terms: an adopted drawn/typed e-signature with explicit consent,
 * and an EIP-712 wallet signature that must recover to the party's linked wallet.
 * The freelancer signs first; the employer's signature moves the contract to
 * `awaiting_funding` and starts the funding deadline.
 */
import { getAddress, verifyTypedData } from 'ethers';
import { logger } from '../config/logger.js';
import { getContractSettings } from '../config/contract-settings.js';
import { contractRepository, type ContractEntity } from '../repositories/contract-repository.js';
import { contractSignatureRepository, type ContractSignatureEntity } from '../repositories/contract-signature-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import type { ServiceResult } from '../types/service-result.js';
import { errorResult, successResult } from '../types/service-result.js';
import { withLock } from '../utils/async-lock.js';
import { generateId } from '../utils/id.js';
import { persistAuditEntry } from '../utils/admin-audit.js';
import { mapContractFromEntity, type Contract } from '../utils/entity-mapper.js';
import {
  buildSigningTypedData,
  buildEip712Domain,
  hashTerms,
  parseTermsSnapshot,
  type CanonicalContractTerms,
  type SignerRole,
  type SigningTypedData,
} from '../utils/contract-terms.js';
import {
  LEGAL_TERMS,
  LEGAL_TERMS_HASH,
  LEGAL_TERMS_VERSION,
  SIGNATURE_CONSENT_VERSION,
  SIGNATURE_STATEMENT,
} from '../constants/legal-terms.js';
import { transitionContract } from './contract-state-machine.js';
import { signAgreement } from './agreement-contract.js';
import { notifyContractParty } from './contract-notifications.js';
import { contractTermsLockKey } from './contract-negotiation-service.js';
import { countMeaningfulChars } from '../utils/text-validation.js';

const MAX_SIGNATURE_IMAGE_BYTES = 100 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

/** Statuses in which the locked terms (and signatures) exist. */
const SIGNED_TERMS_STATUSES = ['awaiting_signatures', 'awaiting_funding', 'active', 'completed', 'disputed', 'resolved', 'cancelled'];

export type ContractSignature = {
  id: string;
  contractId: string;
  signerId: string;
  signerRole: SignerRole;
  termsHash: string;
  signatureType: 'drawn' | 'typed';
  signatureImage: string | null;
  typedName: string | null;
  walletAddress: string;
  walletSignature: string;
  consentVersion: string;
  signedAt: string;
  status: 'valid' | 'voided';
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type SigningPayload = {
  contractId: string;
  status: Contract['status'];
  termsHash: string;
  chainId: number;
  chainIdHex: string;
  terms: CanonicalContractTerms;
  typedData: SigningTypedData | null;
  legal: {
    version: string;
    hash: string;
    clauses: ReadonlyArray<{ title: string; body: string }>;
    statement: string;
    consentVersion: string;
  };
  signatures: ContractSignature[];
  nextSigner: SignerRole | null;
  canSign: boolean;
  projectTitle: string;
};

export type SubmitSignatureInput = {
  termsHash: string;
  signatureType: 'drawn' | 'typed';
  signatureImage?: string | null;
  typedName?: string | null;
  walletAddress: string;
  walletSignature: string;
  consent: boolean;
};

export type SignatureRequestMeta = { ipAddress?: string | null; userAgent?: string | null };

function roleOf(contract: ContractEntity, userId: string): SignerRole | null {
  if (contract.employer_id === userId) return 'employer';
  if (contract.freelancer_id === userId) return 'freelancer';
  return null;
}

export function mapContractSignatureFromEntity(entity: ContractSignatureEntity, viewer: { userId: string; isAdmin: boolean }): ContractSignature {
  const showRequestMeta = viewer.isAdmin || viewer.userId === entity.signer_id;
  return {
    id: entity.id,
    contractId: entity.contract_id,
    signerId: entity.signer_id,
    signerRole: entity.signer_role,
    termsHash: entity.terms_hash,
    signatureType: entity.signature_type,
    signatureImage: entity.signature_image ?? null,
    typedName: entity.typed_name ?? null,
    walletAddress: entity.wallet_address,
    walletSignature: entity.wallet_signature,
    consentVersion: entity.consent_version,
    signedAt: entity.signed_at,
    status: entity.status,
    ...(showRequestMeta ? { ipAddress: entity.ip_address ?? null, userAgent: entity.user_agent ?? null } : {}),
  };
}

/** EIP-712 chainId: the connected network in real mode, the configured id otherwise. */
export async function resolveSigningChainId(): Promise<number> {
  try {
    const { getBlockchainMode } = await import('./blockchain/factory.js');
    if (getBlockchainMode() === 'real') {
      const { getProvider, isWeb3Available } = await import('./web3-client.js');
      if (isWeb3Available()) {
        const network = await getProvider().getNetwork();
        return Number(network.chainId);
      }
    }
  } catch (error) {
    logger.warn('Could not read chainId from provider; using configured signing chain', { error });
  }
  return getContractSettings().signingChainId;
}

function validSignaturesFor(signatures: ContractSignatureEntity[], termsHash: string): ContractSignatureEntity[] {
  return signatures.filter(s => s.status === 'valid' && s.terms_hash === termsHash);
}

function nextSignerOf(contract: ContractEntity, valid: ContractSignatureEntity[]): SignerRole | null {
  if (contract.status !== 'awaiting_signatures') return null;
  if (!valid.some(s => s.signer_role === 'freelancer')) return 'freelancer';
  if (!valid.some(s => s.signer_role === 'employer')) return 'employer';
  return null;
}

/** Locked terms + typed data the caller signs, with existing signatures. */
export async function getSigningPayload(contractId: string, userId: string, userRole?: string): Promise<ServiceResult<SigningPayload>> {
  const contract = await contractRepository.getContractById(contractId);
  if (!contract) return errorResult('NOT_FOUND', 'Contract not found');
  const role = roleOf(contract, userId);
  if (!role && userRole !== 'admin') return errorResult('UNAUTHORIZED', 'Only contract parties can view the signing payload');

  const terms = parseTermsSnapshot(contract.terms_snapshot);
  if (!SIGNED_TERMS_STATUSES.includes(contract.status) || !terms || !contract.terms_hash) {
    return errorResult('TERMS_NOT_LOCKED', 'Contract terms have not been agreed yet');
  }

  const [chainId, signatures, project] = await Promise.all([
    resolveSigningChainId(),
    contractSignatureRepository.listByContract(contractId),
    projectRepository.findProjectById(contract.project_id).catch(() => null),
  ]);
  const valid = validSignaturesFor(signatures, contract.terms_hash);
  const nextSigner = nextSignerOf(contract, valid);

  return successResult({
    contractId,
    status: contract.status,
    termsHash: contract.terms_hash,
    chainId,
    chainIdHex: `0x${chainId.toString(16)}`,
    terms,
    typedData: role ? buildSigningTypedData(terms, role, chainId) : null,
    legal: {
      version: LEGAL_TERMS_VERSION,
      hash: LEGAL_TERMS_HASH,
      clauses: LEGAL_TERMS,
      statement: SIGNATURE_STATEMENT,
      consentVersion: SIGNATURE_CONSENT_VERSION,
    },
    signatures: valid.map(s => mapContractSignatureFromEntity(s, { userId, isAdmin: userRole === 'admin' })),
    nextSigner,
    canSign: !!role && nextSigner === role,
    projectTitle: project?.title ?? '',
  });
}

export async function listSignatures(contractId: string, userId: string, userRole?: string): Promise<ServiceResult<ContractSignature[]>> {
  const contract = await contractRepository.getContractById(contractId);
  if (!contract) return errorResult('NOT_FOUND', 'Contract not found');
  if (!roleOf(contract, userId) && userRole !== 'admin') {
    return errorResult('UNAUTHORIZED', 'Only contract parties can view signatures');
  }
  const signatures = await contractSignatureRepository.listByContract(contractId);
  const isAdmin = userRole === 'admin';
  return successResult(signatures
    .filter(s => s.status === 'valid' && s.terms_hash === contract.terms_hash)
    .map(s => mapContractSignatureFromEntity(s, { userId, isAdmin })));
}

function validateAdoptedSignature(input: SubmitSignatureInput): string | null {
  const typedName = input.typedName?.trim() ?? '';
  if (typedName && (countMeaningfulChars(typedName) < 2 || typedName.length > 120)) {
    return 'Typed name must be between 2 and 120 characters';
  }
  if (input.signatureType === 'typed') {
    return typedName ? null : 'Type your full name to adopt a typed signature';
  }
  if (input.signatureType !== 'drawn') return 'Unsupported signature type';

  const image = input.signatureImage ?? '';
  if (!image.startsWith(PNG_DATA_URL_PREFIX)) return 'Drawn signature must be a PNG image';
  let bytes: Buffer;
  try {
    bytes = Buffer.from(image.slice(PNG_DATA_URL_PREFIX.length), 'base64');
  } catch {
    return 'Drawn signature image is not valid base64';
  }
  if (bytes.length === 0 || bytes.length > MAX_SIGNATURE_IMAGE_BYTES) return 'Drawn signature image must be under 100 KB';
  if (!PNG_MAGIC.every((byte, i) => bytes[i] === byte)) return 'Drawn signature must be a PNG image';
  return null;
}

function recoverWalletSignature(typedData: SigningTypedData, signature: string): string | null {
  try {
    return getAddress(verifyTypedData(typedData.domain, typedData.types, typedData.message, signature));
  } catch {
    return null;
  }
}

type SignatureCheck =
  | { ok: true; terms: CanonicalContractTerms; role: SignerRole; expectedWallet: string; chainId: number; valid: ContractSignatureEntity[] }
  | { ok: false; error: ServiceResult<never> };

async function checkSignatureRequest(contract: ContractEntity, userId: string, input: SubmitSignatureInput): Promise<SignatureCheck> {
  const fail = (code: string, message: string): SignatureCheck => ({ ok: false, error: errorResult(code, message) });

  const role = roleOf(contract, userId);
  if (!role) return fail('UNAUTHORIZED', 'Only contract parties can sign this contract');
  if (contract.status !== 'awaiting_signatures') {
    return fail('INVALID_STATUS', `The contract is not awaiting signatures (current: ${contract.status})`);
  }
  if (input.consent !== true) return fail('CONSENT_REQUIRED', 'You must agree to sign electronically');

  const terms = parseTermsSnapshot(contract.terms_snapshot);
  if (!terms || !contract.terms_hash || hashTerms(terms) !== contract.terms_hash) {
    return fail('TERMS_INTEGRITY_FAILED', 'The locked contract terms could not be verified');
  }
  if (input.termsHash.toLowerCase() !== contract.terms_hash.toLowerCase()) {
    return fail('TERMS_HASH_MISMATCH', 'These terms are out of date. Reload the contract and review the latest terms.');
  }

  const valid = validSignaturesFor(await contractSignatureRepository.listByContract(contract.id), contract.terms_hash);
  if (valid.some(s => s.signer_id === userId)) return fail('ALREADY_SIGNED', 'You have already signed these terms');
  if (role === 'employer' && !valid.some(s => s.signer_role === 'freelancer')) {
    return fail('FREELANCER_SIGNATURE_REQUIRED', 'The freelancer signs first. You can sign once they have.');
  }

  const adoptedError = validateAdoptedSignature(input);
  if (adoptedError) return fail('INVALID_SIGNATURE', adoptedError);

  const user = await userRepository.getUserById(userId);
  const expectedWallet = role === 'employer' ? terms.employerWallet : terms.freelancerWallet;
  if (!user?.wallet_address || getAddress(user.wallet_address) !== getAddress(expectedWallet)) {
    return fail('WALLET_CHANGED', 'Your linked wallet differs from the one in the agreed terms. Request changes to update the terms.');
  }

  const chainId = await resolveSigningChainId();
  const recovered = recoverWalletSignature(buildSigningTypedData(terms, role, chainId), input.walletSignature);
  let submittedWallet: string | null = null;
  try { submittedWallet = getAddress(input.walletAddress); } catch { submittedWallet = null; }
  if (!recovered || recovered !== getAddress(expectedWallet) || submittedWallet !== recovered) {
    return fail('SIGNATURE_INVALID', 'The wallet signature does not match your linked wallet and these terms');
  }

  return { ok: true, terms, role, expectedWallet: recovered, chainId, valid };
}

async function onFullySigned(contract: ContractEntity, projectTitle: string): Promise<ServiceResult<ContractEntity>> {
  const now = new Date();
  const fundingDeadline = new Date(now.getTime() + getContractSettings().fundingDeadlineHours * 60 * 60_000).toISOString();
  const transitioned = await transitionContract(contract.id, {
    from: ['awaiting_signatures'],
    to: 'awaiting_funding',
    actor: 'system',
    patch: { fully_signed_at: now.toISOString(), funding_deadline: fundingDeadline },
  });
  if (!transitioned.ok) return errorResult(transitioned.code, transitioned.message);

  await Promise.all([
    notifyContractParty({
      userId: contract.employer_id,
      role: 'employer',
      contractId: contract.id,
      type: 'contract_awaiting_funding',
      title: 'Contract signed — fund the escrow',
      message: `Both parties signed the contract for "${projectTitle}". Fund the escrow before ${fundingDeadline} to start the work.`,
      data: { fundingDeadline, projectId: contract.project_id },
      email: true,
      projectTitle,
    }),
    notifyContractParty({
      userId: contract.freelancer_id,
      role: 'freelancer',
      contractId: contract.id,
      type: 'contract_signed',
      title: 'Contract fully signed',
      message: `The client signed the contract for "${projectTitle}". Work starts once the escrow is funded.`,
      data: { fundingDeadline, projectId: contract.project_id },
      projectTitle,
    }),
  ]);
  return successResult(transitioned.contract);
}

export async function submitSignature(
  contractId: string,
  userId: string,
  input: SubmitSignatureInput,
  meta: SignatureRequestMeta = {},
): Promise<ServiceResult<{ contract: Contract; signature: ContractSignature }>> {
  return withLock(contractTermsLockKey(contractId), async () => {
    const contract = await contractRepository.getContractById(contractId);
    if (!contract) return errorResult('NOT_FOUND', 'Contract not found');

    const check = await checkSignatureRequest(contract, userId, input);
    if (!check.ok) return check.error;
    const { role, expectedWallet, chainId } = check;

    const signedAt = new Date().toISOString();
    const signature = await contractSignatureRepository.createSignature({
      id: generateId(),
      contract_id: contractId,
      signer_id: userId,
      signer_role: role,
      terms_hash: contract.terms_hash!,
      signature_type: input.signatureType,
      signature_image: input.signatureType === 'drawn' ? input.signatureImage ?? null : null,
      typed_name: input.typedName?.trim() || null,
      wallet_address: expectedWallet,
      wallet_signature: input.walletSignature,
      eip712_domain: JSON.stringify(buildEip712Domain(chainId)),
      consent_version: SIGNATURE_CONSENT_VERSION,
      signed_at: signedAt,
      ip_address: meta.ipAddress?.slice(0, 64) ?? null,
      user_agent: meta.userAgent?.slice(0, 512) ?? null,
      status: 'valid',
    });

    try {
      await signAgreement(contractId, expectedWallet);
    } catch (error) {
      logger.debug('Agreement ledger signature skipped', { contractId, error });
    }

    await persistAuditEntry({
      user_id: role === 'employer' ? contract.freelancer_id : contract.employer_id,
      actor_id: userId,
      action: 'contract.signed',
      resource_type: 'contract',
      resource_id: contractId,
      payload: { signerRole: role, termsHash: contract.terms_hash, signatureType: input.signatureType, walletAddress: expectedWallet, chainId },
      ip_address: meta.ipAddress ?? null,
      user_agent: meta.userAgent ?? null,
      status: 'success',
      error_message: null,
    });

    const project = await projectRepository.findProjectById(contract.project_id).catch(() => null);
    const projectTitle = project?.title ?? 'your project';
    let current = contract;
    if (role === 'employer') {
      const funded = await onFullySigned(contract, projectTitle);
      if (!funded.success) return funded;
      current = funded.data;
    } else {
      await notifyContractParty({
        userId: contract.employer_id,
        role: 'employer',
        contractId,
        type: 'contract_signed',
        title: 'Freelancer signed — your signature is next',
        message: `The freelancer signed the contract for "${projectTitle}". Sign it to move on to funding.`,
        data: { projectId: contract.project_id },
        email: true,
        projectTitle,
      });
    }

    return successResult({
      contract: mapContractFromEntity(current),
      signature: mapContractSignatureFromEntity(signature, { userId, isAdmin: false }),
    });
  });
}
