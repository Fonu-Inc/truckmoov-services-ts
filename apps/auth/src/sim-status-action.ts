import type { StoredSim } from './sim.repository';
import { reactivatedSim, suspendedSim } from './sim-suspension';

export const SIM_STATUS_ACTIONS = ['activate', 'suspend', 'reinstate'] as const;
export type SimStatusAction = (typeof SIM_STATUS_ACTIONS)[number];

export const NETWORK_NOT_TOLD = 'the mobile network has not been told';

export type SimStatusDecision = { sim: StoredSim } | { skipReason: string };

export function decideSimStatus(sim: StoredSim, action: SimStatusAction): SimStatusDecision {
  if (action === 'suspend') return decideSuspend(sim);
  if (action === 'reinstate') return decideReinstate(sim);
  return decideActivate(sim);
}

function decideSuspend(sim: StoredSim): SimStatusDecision {
  if (sim.status === 'suspended') return { skipReason: 'Already suspended' };
  if (sim.status === 'deactivated') return { skipReason: 'Deactivated SIMs cannot be suspended' };
  if (!sim.tenantId) return { skipReason: 'Not assigned to a tenant' };
  return { sim: suspendedSim(sim, null) };
}

function decideReinstate(sim: StoredSim): SimStatusDecision {
  if (sim.status !== 'suspended') return { skipReason: 'Not suspended' };
  return { sim: reactivatedSim(sim, sim.tenantId ? 'assigned' : 'active') };
}

function decideActivate(sim: StoredSim): SimStatusDecision {
  if (sim.status === 'active') return { skipReason: 'Already active' };
  if (!sim.tenantId) return { skipReason: 'Assign to a tenant first' };
  const base = sim.status === 'suspended' ? reactivatedSim(sim, 'active') : { ...sim, updatedAt: new Date() };
  return { sim: { ...base, status: 'active', activationDate: sim.activationDate ?? new Date() } };
}

export function simStatusVerb(action: SimStatusAction): string {
  if (action === 'suspend') return 'suspended';
  return action === 'reinstate' ? 'reinstated' : 'activated';
}
