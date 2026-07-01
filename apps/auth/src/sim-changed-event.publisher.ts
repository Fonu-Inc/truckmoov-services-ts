import type { StoredSim } from './sim.repository';

export type SimChangedAction = 'assigned' | 'updated' | 'unassigned' | 'suspended';

export type SimChangedEvent = {
  tenant_id: string;
  sim_id: string;
  iccid: string;
  msisdn: string | null;
  carrier: string;
  plan: string;
  status: string;
  device_id: string;
  device_imei: string | null;
  vehicle_id: string | null;
  data_usage_mb: number;
  data_limit_mb: number;
  expiry_date: string | null;
  action: SimChangedAction;
};

export interface SimChangedEventPublisher {
  publish(event: SimChangedEvent): Promise<void>;
}

export const SIM_CHANGED_EVENT_PUBLISHER = Symbol('SIM_CHANGED_EVENT_PUBLISHER');

export async function emitSimChanged(
  publisher: SimChangedEventPublisher,
  sim: StoredSim,
  action: SimChangedAction,
): Promise<void> {
  if (!sim.deviceId || !sim.tenantId) return;
  try {
    await publisher.publish({
      tenant_id: sim.tenantId,
      sim_id: sim.id,
      iccid: sim.iccid,
      msisdn: sim.msisdn,
      carrier: sim.carrier,
      plan: sim.plan,
      status: sim.status,
      device_id: sim.deviceId,
      device_imei: sim.deviceImei,
      vehicle_id: sim.vehicleId,
      data_usage_mb: sim.dataUsageMb,
      data_limit_mb: sim.dataLimitMb,
      expiry_date: sim.expiryDate ? sim.expiryDate.toISOString() : null,
      action,
    });
  } catch {
    // swallow — SIM propagation is eventually reconciled, not transactional.
  }
}
