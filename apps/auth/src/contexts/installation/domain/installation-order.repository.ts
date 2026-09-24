import type {
  InstallationOrderStatus,
  InstallationTimeSlot,
} from './installation-order';

export type StoredInstallationOrder = {
  id: string;
  orderNumber: string;
  applicationId: string;
  tenantId: string;
  scheduledDate: Date;
  timeSlot: InstallationTimeSlot;
  addressLine: string;
  city: string;
  state: string;
  siteContactName: string;
  siteContactPhone: string;
  notes: string | null;
  installerId: string | null;
  status: InstallationOrderStatus;
  /** The status an issue report interrupted, so resolving it can resume there. */
  preExceptionStatus: InstallationOrderStatus | null;
  assignedAt: Date | null;
  acceptedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Which vehicle each paid-for device is fitted to.
 *
 * Devices are identified by their position on the order rather than by serial:
 * the hardware is allocated at provisioning and the applicant schedules before
 * anybody has touched a specific unit. The fleet device is bound later by a
 * platform admin.
 */
export type StoredDeviceAssignment = {
  id: string;
  orderId: string;
  deviceIndex: number;
  vehicleId: string;
  fleetDeviceId: string | null;
  createdAt: Date;
};

export type InstallerJobCount = {
  installerId: string;
  status: InstallationOrderStatus;
  count: number;
};

/** Where the unassigned queue was read up to: the last order of the previous page. */
export type UnassignedCursor = Pick<StoredInstallationOrder, 'scheduledDate' | 'createdAt' | 'id'>;

/** assigned; full: the installer has no room left; taken: the order is no longer unassigned. */
export type AssignmentOutcome = 'assigned' | 'full' | 'taken';

export interface InstallationOrderRepository {
  save(order: StoredInstallationOrder): Promise<void>;
  findById(id: string): Promise<StoredInstallationOrder | null>;
  findByApplicationId(
    applicationId: string,
  ): Promise<StoredInstallationOrder | null>;
  findByTenantId(tenantId: string): Promise<StoredInstallationOrder | null>;
  /** Oldest booking first, then creation, then id; resumes after `after`. */
  findUnassigned(limit: number, after?: UnassignedCursor): Promise<StoredInstallationOrder[]>;
  /**
   * Writes an assignment while the order is still unassigned and its installer
   * has fewer than `maxActiveJobs` active jobs, holding the installer so two
   * writers cannot both take the last place.
   */
  assignIfRoom(order: StoredInstallationOrder, maxActiveJobs: number): Promise<AssignmentOutcome>;
  /** Moves orders in `from` dated before `before` to overdue; returns how many moved. */
  markOverdue(from: readonly InstallationOrderStatus[], before: Date, now: Date): Promise<number>;
  nextOrderNumber(): Promise<string>;

  replaceAssignments(
    orderId: string,
    assignments: StoredDeviceAssignment[],
  ): Promise<void>;
  findAssignments(orderId: string): Promise<StoredDeviceAssignment[]>;
  findAssignmentByFleetDeviceId(fleetDeviceId: string): Promise<StoredDeviceAssignment | null>;
  saveAssignment(assignment: StoredDeviceAssignment): Promise<void>;
  deleteForApplication(applicationId: string): Promise<void>;
  /** Orders per installer and status, in one query. */
  countByInstaller(installerIds: string[]): Promise<InstallerJobCount[]>;
}

export const INSTALLATION_ORDER_REPOSITORY = Symbol(
  'INSTALLATION_ORDER_REPOSITORY',
);
