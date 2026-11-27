import { coveredVehicles } from '@auth/installation/domain/installation-evidence';
import type { ChecklistGate } from '@auth/installation/domain/installation-checklist';
import {
  FleetUnavailableError,
  InstallationJobConflictError,
} from '@auth/installation/domain/installation-job.errors';
import type {
  InstallationOrderRepository,
  StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';
import type { JobDeviceLookup } from '@auth/installation/domain/ports/job-device-lookup.port';
import type { JobKnown } from './installation-job.views';

export type GateReaders = { orders: InstallationOrderRepository; devices: JobDeviceLookup };

async function assertDevicesVerified(readers: GateReaders, order: StoredInstallationOrder): Promise<JobKnown> {
  const units = await readers.orders.findAssignments(order.id);
  const deviceIds = units.flatMap((unit) => (unit.fleetDeviceId ? [unit.fleetDeviceId] : []));
  if (units.length === 0 || deviceIds.length < units.length) {
    throw new InstallationJobConflictError('Every unit needs a bound device before communication can be confirmed');
  }
  const devices = await readers.devices.forTenant(order.tenantId, deviceIds);
  if (!devices) throw new FleetUnavailableError();
  const verified = deviceIds.every((id) => devices.get(id)?.verificationStatus === 'verified');
  if (!verified) {
    throw new InstallationJobConflictError('Every device on this job must be verified before communication can be confirmed');
  }
  return { assignments: units, devices };
}

async function assertEvidence(readers: GateReaders, order: StoredInstallationOrder): Promise<JobKnown> {
  const [evidence, units] = await Promise.all([readers.orders.findEvidence(order.id), readers.orders.findAssignments(order.id)]);
  const vehicleIds = [...new Set(units.map((unit) => unit.vehicleId))];
  const covered = coveredVehicles(evidence, vehicleIds);
  if (covered < vehicleIds.length || evidence.length === 0) {
    throw new InstallationJobConflictError(
      `Upload at least one photo for each vehicle first (${covered} of ${vehicleIds.length} vehicles covered)`,
    );
  }
  return { assignments: units };
}

const GATES: Record<ChecklistGate, (readers: GateReaders, order: StoredInstallationOrder) => Promise<JobKnown>> = {
  device_communicating: assertDevicesVerified,
  evidence: assertEvidence,
};

export async function assertGateOpen(
  readers: GateReaders,
  order: StoredInstallationOrder,
  gate: ChecklistGate | undefined,
): Promise<JobKnown> {
  return gate ? GATES[gate](readers, order) : {};
}
