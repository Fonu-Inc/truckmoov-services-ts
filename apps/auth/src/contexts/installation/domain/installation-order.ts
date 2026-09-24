import { lagosToday } from '@shared/devices';

export const INSTALLATION_TIME_SLOTS = ['morning', 'afternoon'] as const;
export type InstallationTimeSlot = (typeof INSTALLATION_TIME_SLOTS)[number];

export const INSTALLATION_SLOT_LABELS: Record<InstallationTimeSlot, string> = {
  morning: 'Morning (8:00 – 12:00)',
  afternoon: 'Afternoon (12:00 – 17:00)',
};

export const INSTALLATION_ORDER_STATUSES = [
  'unassigned',
  'assigned',
  'accepted',
  'scheduled',
  'in_progress',
  'overdue',
  'issue_reported',
  'completed',
  'cancelled',
] as const;
export type InstallationOrderStatus =
  (typeof INSTALLATION_ORDER_STATUSES)[number];

/** Where each status may go. Leaving issue_reported also allows its pre_exception_status. */
export const INSTALLATION_ORDER_TRANSITIONS: Record<
  InstallationOrderStatus,
  readonly InstallationOrderStatus[]
> = {
  unassigned: ['assigned', 'cancelled'],
  assigned: ['accepted', 'overdue', 'issue_reported', 'cancelled', 'unassigned'],
  accepted: ['scheduled', 'in_progress', 'overdue', 'issue_reported', 'cancelled'],
  scheduled: ['in_progress', 'overdue', 'issue_reported', 'cancelled'],
  overdue: ['in_progress', 'issue_reported', 'cancelled', 'scheduled'],
  in_progress: ['completed', 'issue_reported', 'cancelled'],
  issue_reported: ['cancelled'],
  completed: [],
  cancelled: [],
};

/** Jobs that count toward an installer's workload. */
export const ACTIVE_JOB_STATUSES: readonly InstallationOrderStatus[] = [
  'assigned',
  'accepted',
  'scheduled',
  'in_progress',
  'overdue',
  'issue_reported',
];

export const TERMINAL_JOB_STATUSES: readonly InstallationOrderStatus[] = [
  'completed',
  'cancelled',
];

/** Statuses the sweep moves to overdue once their date has passed. */
export const OVERDUE_SOURCE_STATUSES: readonly InstallationOrderStatus[] = [
  'assigned',
  'accepted',
  'scheduled',
];

/** Where Start Installation may begin. Resuming after an issue report is the admin's call, not a start. */
export const START_SOURCE_STATUSES: readonly InstallationOrderStatus[] = ['accepted', 'scheduled', 'overdue'];

export const MAX_INSTALLER_NOTES_LENGTH = 2000;

export const OPEN_JOB_STATUSES: readonly InstallationOrderStatus[] = INSTALLATION_ORDER_STATUSES.filter(
  (status) => !TERMINAL_JOB_STATUSES.includes(status),
);

export class InvalidInstallationTransitionError extends Error {
  constructor(from: InstallationOrderStatus, to: InstallationOrderStatus) {
    super(`An installation cannot move from ${from} to ${to}`);
    this.name = 'InvalidInstallationTransitionError';
  }
}

type Transitionable = {
  status: InstallationOrderStatus;
  preExceptionStatus: InstallationOrderStatus | null;
};

export function canTransition(order: Transitionable, next: InstallationOrderStatus): boolean {
  if (INSTALLATION_ORDER_TRANSITIONS[order.status].includes(next)) return true;
  return order.status === 'issue_reported' && order.preExceptionStatus === next;
}

export function assertTransition(order: Transitionable, next: InstallationOrderStatus): void {
  if (!canTransition(order, next)) {
    throw new InvalidInstallationTransitionError(order.status, next);
  }
}

type Stamped = Transitionable & {
  assignedAt: Date | null;
  acceptedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  updatedAt: Date;
};

const STAMPS: Partial<Record<InstallationOrderStatus, keyof Stamped>> = {
  assigned: 'assignedAt',
  accepted: 'acceptedAt',
  in_progress: 'startedAt',
  completed: 'completedAt',
  cancelled: 'cancelledAt',
};

/** The order in its next status, with the moment it got there recorded. */
export function transitionOrder<T extends Stamped>(
  order: T,
  next: InstallationOrderStatus,
  now: Date,
): T {
  assertTransition(order, next);
  const stamp = STAMPS[next];
  return {
    ...order,
    ...(stamp ? { [stamp]: now } : {}),
    status: next,
    preExceptionStatus: next === 'issue_reported' ? order.status : null,
    updatedAt: now,
  };
}

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

export function buildOrderNumber(sequence: number): string {
  return `FL-${String(sequence).padStart(4, '0')}`;
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

/**
 * The Lagos day a booking asks for, kept as UTC midnight like every stored
 * installation date. A bare YYYY-MM-DD is that day; a full timestamp is the
 * Lagos day it falls on.
 */
export function bookingDay(value: unknown): Date {
  const requested = new Date(String(value ?? ''));
  if (Number.isNaN(requested.getTime())) {
    throw new InvalidInstallationDateError('The installation date is not a date');
  }
  return lagosToday(requested);
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

/** The order handed to an installer. */
export function assignOrder<T extends Stamped & { installerId: string | null }>(
  order: T,
  installerId: string,
  now: Date,
): T {
  return { ...transitionOrder(order, 'assigned', now), installerId };
}
