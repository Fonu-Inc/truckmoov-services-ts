import type { StoredSim } from './sim.repository';

export const TENANT_HELD_SIM_CAUSES = ['non_payment', 'tenant_manual'];

export function isHeldByTenantSuspension(sim: StoredSim): boolean {
  return TENANT_HELD_SIM_CAUSES.includes(sim.suspensionCause ?? '');
}

export function suspendedSim(sim: StoredSim, reason: string | null): StoredSim {
  return {
    ...sim,
    status: 'suspended',
    suspensionReason: reason,
    suspensionCause: 'asset_manual',
    preSuspensionStatus: sim.preSuspensionStatus ?? sim.status,
    updatedAt: new Date(),
  };
}

export function reactivatedSim(sim: StoredSim, fallbackStatus: string): StoredSim {
  return {
    ...sim,
    status: sim.preSuspensionStatus ?? fallbackStatus,
    suspensionReason: null,
    suspensionCause: null,
    preSuspensionStatus: null,
    updatedAt: new Date(),
  };
}
