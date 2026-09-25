import type {
  OnboardingApplicantType,
  StoredOnboardingApplication,
  StoredOnboardingApplicationVehicle,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { slotWindow } from '@auth/installation/domain/installation-order';
import type { JobRow } from '@auth/installation/domain/installation-job.reader';
import type {
  StoredChecklistTick,
  StoredDeviceAssignment,
  StoredInstallationEvidence,
  StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';
import type { StoredInstaller } from '@auth/installation/domain/installer.repository';
import type { JobDevice, JobDeviceLookup } from '@auth/installation/domain/ports/job-device-lookup.port';
import type { StoredSim } from '../../../../../sim.repository';
import { toActionsView, toChecklistView, toCompletionView, toEvidenceView } from './job-execution.views';

export type DeviceIndex = Map<string, JobDevice>;

const CUSTOMER_TYPES: Record<OnboardingApplicantType, string> = {
  fleet_provider: 'Enterprise',
  owner_operator: 'Owner operator',
};

const SIM_ACTIVATION: Record<string, string> = {
  active: 'Activated',
  assigned: 'Activated',
  registered: 'Not activated',
  unassigned: 'Not activated',
  suspended: 'Suspended',
  deactivated: 'Deactivated',
};

const day = (date: Date) => date.toISOString().slice(0, 10);

/** The booking's slot as instants; the client formats them. */
export function scheduledInstants(order: StoredInstallationOrder) {
  const window = slotWindow(order.scheduledDate, order.timeSlot);
  return { scheduledAt: window.start.toISOString(), scheduledUntil: window.end.toISOString() };
}

function schedule(order: StoredInstallationOrder) {
  return { scheduledDate: day(order.scheduledDate), ...scheduledInstants(order) };
}

/**
 * Fleet devices for many jobs, one call per tenant. A tenant fleet could not
 * answer for simply has no devices in the index.
 */
export async function devicesForJobs(
  lookup: JobDeviceLookup,
  jobs: Array<{ tenantId: string; deviceId: string | null }>,
): Promise<DeviceIndex> {
  const byTenant = new Map<string, string[]>();
  for (const job of jobs) {
    if (job.deviceId) byTenant.set(job.tenantId, [...(byTenant.get(job.tenantId) ?? []), job.deviceId]);
  }
  const answers = await Promise.all(
    [...byTenant].map(([tenantId, ids]) => lookup.forTenant(tenantId, ids)),
  );
  return new Map(answers.flatMap((answer) => [...(answer ?? new Map())]));
}

export function toJobListItem(row: JobRow, devices: DeviceIndex) {
  const { order } = row;
  const device = row.firstFleetDeviceId ? devices.get(row.firstFleetDeviceId) : undefined;
  return {
    id: order.id,
    jobNumber: order.orderNumber,
    customer: row.customerName,
    siteContactName: order.siteContactName,
    siteContactPhone: order.siteContactPhone,
    firstVehicle: row.firstVehicle,
    firstDevice: device ? { manufacturer: device.manufacturer, model: device.model } : null,
    location: { city: order.city, state: order.state },
    vehicleCount: row.vehicleCount,
    deviceCount: row.deviceCount,
    ...schedule(order),
    status: order.status,
    completedAt: (order.completedAt ?? order.cancelledAt)?.toISOString() ?? null,
  };
}

/** A dashboard card: an offer, today's job or an upcoming one. */
export function toDashboardJob(row: JobRow) {
  const { order } = row;
  return {
    jobId: order.id,
    jobNumber: order.orderNumber,
    companyName: row.customerName,
    siteContactName: order.siteContactName,
    siteContactPhone: order.siteContactPhone,
    siteContactEmail: row.customerEmail,
    address: order.addressLine,
    city: order.city,
    state: order.state,
    ...scheduledInstants(order),
    status: order.status,
  };
}

function toVehicleView(vehicle: StoredOnboardingApplicationVehicle | undefined) {
  if (!vehicle) return null;
  return {
    registrationNumber: vehicle.registrationNumber,
    vehicleType: vehicle.vehicleType,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    engineNumber: vehicle.engineNumber,
    chassisNumber: vehicle.chassisNumber,
    colour: vehicle.color,
    engineCapacity: vehicle.engineCapacity,
    odometer: vehicle.odometerReading,
  };
}

function toSimView(sim: StoredSim | undefined) {
  if (!sim) return null;
  return {
    iccid: sim.iccid,
    imsi: sim.imsi,
    msisdn: sim.msisdn,
    carrier: sim.carrier,
    activationStatus: SIM_ACTIVATION[sim.status] ?? sim.status,
    network: sim.networkType,
  };
}

export type JobDetailParts = {
  order: StoredInstallationOrder;
  application: StoredOnboardingApplication | null;
  assignments: StoredDeviceAssignment[];
  vehicles: StoredOnboardingApplicationVehicle[];
  devices: DeviceIndex;
  sims: StoredSim[];
  installer: StoredInstaller;
  ticks: StoredChecklistTick[];
  evidence: StoredInstallationEvidence[];
};

function toUnitView(assignment: StoredDeviceAssignment, parts: JobDetailParts) {
  const deviceId = assignment.fleetDeviceId;
  return {
    index: assignment.deviceIndex,
    vehicle: toVehicleView(parts.vehicles.find((v) => v.id === assignment.vehicleId)),
    device: deviceId ? (parts.devices.get(deviceId) ?? null) : null,
    sim: deviceId ? toSimView(parts.sims.find((s) => s.deviceId === deviceId)) : null,
  };
}

function completionOf(parts: JobDetailParts, units: ReturnType<typeof toUnitView>[], checklistCompleted: number) {
  return toCompletionView({
    order: parts.order,
    customer: parts.application?.organizationName ?? '',
    installer: parts.installer.fullName,
    vehicles: units.flatMap((unit) => (unit.vehicle ? [unit.vehicle.registrationNumber] : [])),
    devices: units.flatMap((unit) => (unit.device ? [`${unit.device.manufacturer} ${unit.device.model}`.trim()] : [])),
    checklistCompleted,
    evidenceCount: parts.evidence.length,
  });
}

export function toJobDetail(parts: JobDetailParts) {
  const { order, application } = parts;
  const units = parts.assignments.map((assignment) => toUnitView(assignment, parts));
  const checklist = toChecklistView(parts.ticks);
  return {
    id: order.id,
    jobNumber: order.orderNumber,
    status: order.status,
    customer: {
      customerName: application?.organizationName ?? '',
      customerType: application ? CUSTOMER_TYPES[application.applicantType] : null,
      phone: order.siteContactPhone,
      email: application?.businessEmail ?? null,
      address: `${order.addressLine}, ${order.city}, ${order.state}`,
      ...schedule(order),
    },
    units,
    checklist,
    evidence: parts.evidence.map(toEvidenceView),
    notes: order.installerNotes,
    completion: completionOf(parts, units, checklist.completed),
    actions: toActionsView(order, parts.assignments, checklist.completed),
  };
}
