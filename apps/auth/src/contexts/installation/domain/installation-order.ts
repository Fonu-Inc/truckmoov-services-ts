export const INSTALLATION_TIME_SLOTS = ['morning', 'afternoon'] as const;
export type InstallationTimeSlot = (typeof INSTALLATION_TIME_SLOTS)[number];

export const INSTALLATION_SLOT_LABELS: Record<InstallationTimeSlot, string> = {
  morning: 'Morning (8:00 – 12:00)',
  afternoon: 'Afternoon (12:00 – 17:00)',
};

export const INSTALLATION_ORDER_STATUSES = [
  'scheduled',
  'installer_assigned',
  'completed',
] as const;
export type InstallationOrderStatus =
  (typeof INSTALLATION_ORDER_STATUSES)[number];

/** How far ahead an installation can be booked, and how soon. */
export const MIN_LEAD_TIME_DAYS = 1;
export const MAX_LEAD_TIME_DAYS = 90;

export class InvalidInstallationDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInstallationDateError';
  }
}

export class VehicleAlreadyAssignedError extends Error {
  constructor(registrationNumber: string) {
    super(`${registrationNumber} already has a device assigned to it`);
    this.name = 'VehicleAlreadyAssignedError';
  }
}

export class DeviceAssignmentMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceAssignmentMismatchError';
  }
}

export function buildOrderNumber(sequence: string): string {
  return `FP-INST-${sequence}`;
}

/**
 * A booking has to be far enough out to staff and near enough to mean
 * something. Same-day is refused because an installer cannot be dispatched
 * against a slot that may already have passed.
 */
export function assertSchedulable(date: Date, now: Date = new Date()): void {
  if (Number.isNaN(date.getTime())) {
    throw new InvalidInstallationDateError('The installation date is not a date');
  }

  const days = Math.floor(
    (startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );

  if (days < MIN_LEAD_TIME_DAYS) {
    throw new InvalidInstallationDateError(
      'An installation must be booked at least one day ahead',
    );
  }
  if (days > MAX_LEAD_TIME_DAYS) {
    throw new InvalidInstallationDateError(
      `An installation cannot be booked more than ${MAX_LEAD_TIME_DAYS} days ahead`,
    );
  }
}

export type DeviceAssignmentInput = { deviceIndex: number; vehicleId: string };

/**
 * Every device is fitted to one vehicle, and no vehicle takes two.
 *
 * The count was already bounded when the devices were requested; this is the
 * other half of it, and it is checked here rather than trusted from the screen
 * because a duplicate assignment sends an installer to fit a device with
 * nowhere to go.
 */
export function assertAssignments(
  assignments: DeviceAssignmentInput[],
  deviceCount: number,
  vehicleIds: Set<string>,
): void {
  if (assignments.length !== deviceCount) {
    throw new DeviceAssignmentMismatchError(
      `${deviceCount} device(s) were paid for but ${assignments.length} were assigned`,
    );
  }

  const seenDevices = new Set<number>();
  const seenVehicles = new Set<string>();

  for (const assignment of assignments) {
    if (
      !Number.isInteger(assignment.deviceIndex) ||
      assignment.deviceIndex < 1 ||
      assignment.deviceIndex > deviceCount
    ) {
      throw new DeviceAssignmentMismatchError(
        `Device ${assignment.deviceIndex} is not on this order`,
      );
    }
    if (seenDevices.has(assignment.deviceIndex)) {
      throw new DeviceAssignmentMismatchError(
        `Device ${assignment.deviceIndex} was assigned twice`,
      );
    }
    if (!vehicleIds.has(assignment.vehicleId)) {
      throw new DeviceAssignmentMismatchError(
        'A device was assigned to a vehicle that is not on this application',
      );
    }
    if (seenVehicles.has(assignment.vehicleId)) {
      throw new VehicleAlreadyAssignedError(assignment.vehicleId);
    }

    seenDevices.add(assignment.deviceIndex);
    seenVehicles.add(assignment.vehicleId);
  }
}

function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
