import { config } from './env.js';

export type ContractSettings = {
  fundingDeadlineHours: number;
  fundingGraceMinutes: number;
  signingChainId: number;
  maxMilestones: number;
  maxNegotiationRounds: number;
};

const DEFAULTS: ContractSettings = {
  fundingDeadlineHours: 72,
  fundingGraceMinutes: 30,
  signingChainId: 1337,
  maxMilestones: 20,
  maxNegotiationRounds: 30,
};

/** Hiring-flow settings with defaults, tolerant of partial config objects. */
export function getContractSettings(): ContractSettings {
  const overrides = (config as { contracts?: Partial<ContractSettings> }).contracts ?? {};
  return { ...DEFAULTS, ...overrides };
}
