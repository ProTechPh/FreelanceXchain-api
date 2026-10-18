/**
 * Contract Milestone Store
 *
 * Milestones live in one of two places:
 *  - contract-scoped (`contracts.milestone_source = 'contract'`): the terms
 *    negotiated for that freelancer, stored on the contract document. Created by
 *    the negotiation flow, so multi-slot projects never share milestone state.
 *  - project-scoped (legacy, `milestone_source` null/'project'): the project
 *    document's embedded `milestones` array.
 *
 * Callers keep their existing "project view" shape: `loadMilestoneProject`
 * returns the project entity with `milestones` swapped for the contract's when
 * the contract owns them, and `saveMilestones` writes back to whichever
 * document is the source of truth. Array index == escrow milestone index in
 * both modes.
 */
import { contractRepository, type ContractEntity } from '../repositories/contract-repository.js';
import { projectRepository, type ProjectEntity, type MilestoneEntity } from '../repositories/project-repository.js';
import { parseField } from '../utils/index.js';

/** Either a contract entity (snake_case) or a mapped Contract (camelCase). */
export type ContractMilestoneRef = {
  id: string;
  project_id?: string;
  projectId?: string;
  milestone_source?: string | null;
  milestoneSource?: string | null;
};

export function usesContractMilestones(contract: ContractMilestoneRef | null | undefined): boolean {
  if (!contract) return false;
  return (contract.milestone_source ?? contract.milestoneSource) === 'contract';
}

export function readContractMilestones(contract: Pick<ContractEntity, 'milestones'> | null | undefined): MilestoneEntity[] {
  const parsed = parseField<unknown>(contract?.milestones, []);
  return Array.isArray(parsed) ? (parsed as MilestoneEntity[]) : [];
}

function projectIdOf(contract: ContractMilestoneRef): string {
  return (contract.project_id ?? contract.projectId) as string;
}

/**
 * Load the project document with the milestone array that governs this contract.
 * Legacy contracts read the project as-is (identical to findProjectById).
 */
export async function loadMilestoneProject(contract: ContractMilestoneRef): Promise<ProjectEntity | null> {
  const project = await projectRepository.findProjectById(projectIdOf(contract));
  if (!project || !usesContractMilestones(contract)) return project;

  // Always re-read the contract so callers that re-check state get fresh data.
  const fresh = await contractRepository.getContractById(contract.id);
  if (!fresh) return null;
  return { ...project, milestones: readContractMilestones(fresh) };
}

/**
 * Persist the milestone array for this contract and return the updated project view.
 * Legacy contracts write the project document (identical to updateProject).
 */
export async function saveMilestones(
  contract: ContractMilestoneRef,
  projectId: string,
  milestones: MilestoneEntity[],
): Promise<ProjectEntity | null> {
  if (!usesContractMilestones(contract)) {
    return projectRepository.updateProject(projectId, { milestones });
  }

  const updated = await contractRepository.updateContract(contract.id, { milestones });
  if (!updated) return null;
  const project = await projectRepository.findProjectById(projectId);
  if (!project) return null;
  return { ...project, milestones: readContractMilestones(updated) };
}

/**
 * Milestones for many contracts at once, grouped by contract id.
 * Contract-scoped contracts use their own array; legacy ones share the project's.
 */
export async function loadMilestonesForContracts(
  contracts: ContractEntity[],
  loadProject: (projectId: string) => Promise<ProjectEntity | null> = (id) => projectRepository.findProjectById(id),
): Promise<Map<string, MilestoneEntity[]>> {
  const result = new Map<string, MilestoneEntity[]>();
  const projectCache = new Map<string, Promise<ProjectEntity | null>>();

  for (const contract of contracts) {
    if (usesContractMilestones(contract)) {
      result.set(contract.id, readContractMilestones(contract));
      continue;
    }
    let pending = projectCache.get(contract.project_id);
    if (!pending) {
      pending = loadProject(contract.project_id);
      projectCache.set(contract.project_id, pending);
    }
    const project = await pending;
    result.set(contract.id, project?.milestones ?? []);
  }

  return result;
}
