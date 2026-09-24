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
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Which vehicle each paid-for device is fitted to.
 *
 * Devices are identified by their position on the order rather than by serial:
 * the hardware is allocated at provisioning and the applicant schedules before
 * anybody has touched a specific unit.
 */
export type StoredDeviceAssignment = {
  id: string;
  orderId: string;
  deviceIndex: number;
  vehicleId: string;
  createdAt: Date;
};

export type InstallerJobCount = {
  installerId: string;
  status: InstallationOrderStatus;
  count: number;
};

export interface InstallationOrderRepository {
  save(order: StoredInstallationOrder): Promise<void>;
  findById(id: string): Promise<StoredInstallationOrder | null>;
  findByApplicationId(
    applicationId: string,
  ): Promise<StoredInstallationOrder | null>;
  findByTenantId(tenantId: string): Promise<StoredInstallationOrder | null>;

  replaceAssignments(
    orderId: string,
    assignments: StoredDeviceAssignment[],
  ): Promise<void>;
  findAssignments(orderId: string): Promise<StoredDeviceAssignment[]>;
  deleteForApplication(applicationId: string): Promise<void>;
  /** Orders per installer and status, in one query. */
  countByInstaller(installerIds: string[]): Promise<InstallerJobCount[]>;
}

export const INSTALLATION_ORDER_REPOSITORY = Symbol(
  'INSTALLATION_ORDER_REPOSITORY',
);
