import type {
  InstallationOrderStatus,
  InstallationTimeSlot,
} from './installation-order';
import type { EvidenceCategory } from './installation-evidence';
import type { InstallerCapability } from './installer';

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
  /** Closed capability catalogue required to carry out this booking. */
  requiredCapabilities?: InstallerCapability[];
  siteContactName: string;
  siteContactPhone: string;
  notes: string | null;
  installerNotes: string | null;
  installerId: string | null;
  status: InstallationOrderStatus;
  /** The status an issue report interrupted, so resolving it can resume there. */
  preExceptionStatus: InstallationOrderStatus | null;
  assignedAt: Date | null;
  acceptedAt: Date | null;
  startedAt: Date | null;
  issueReportedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  reminderSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** What the admin may change on a job. */
export type InstallationOrderDetails = Pick<
  StoredInstallationOrder,
  'scheduledDate' | 'timeSlot' | 'addressLine' | 'city' | 'state' | 'siteContactName' | 'siteContactPhone'
>;

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

export type StoredChecklistTick = {
  orderId: string;
  itemKey: string;
  checkedAt: Date;
  checkedBy: string;
};

export type StoredInstallationEvidence = {
  id: string;
  orderId: string;
  category: EvidenceCategory;
  /** Null on photos taken before evidence was per vehicle; they count for every vehicle. */
  vehicleId: string | null;
  fileKey: string;
  /** sha256 hex */
  fileHash: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: Date;
};

export type StoredOfferRejection = {
  orderId: string;
  installerId: string;
  reason: string;
  rejectedAt: Date;
};

/** The customer's rating of a completed installation; one per order. */
export type StoredInstallationFeedback = {
  orderId: string;
  rating: number;
  comment: string | null;
  submittedAt: Date;
  submittedBy: string;
};

export type InstallerJobCount = {
  installerId: string;
  status: InstallationOrderStatus;
  count: number;
};

/** Where the unassigned queue was read up to: the last order of the previous page. */
export type UnassignedCursor = Pick<StoredInstallationOrder, 'scheduledDate' | 'createdAt' | 'id'>;

/**
 * assigned; full: the installer has no room left; conflict: the installer is
 * already booked in the requested slot; taken: the order is no longer
 * unassigned; declined: the installer rejected this order before.
 */
export type AssignmentOutcome = 'assigned' | 'full' | 'conflict' | 'taken' | 'declined';

export interface InstallationOrderRepository {
  save(order: StoredInstallationOrder): Promise<void>;
  findById(id: string): Promise<StoredInstallationOrder | null>;
  findByApplicationId(
    applicationId: string,
  ): Promise<StoredInstallationOrder | null>;
  findByTenantId(tenantId: string): Promise<StoredInstallationOrder | null>;
  /** The tenant's newest order that is not completed or cancelled. */
  findOpenByTenantId(tenantId: string): Promise<StoredInstallationOrder | null>;
  /** Oldest booking first, then creation, then id; resumes after `after`. */
  findUnassigned(limit: number, after?: UnassignedCursor): Promise<StoredInstallationOrder[]>;
  /**
   * Writes an assignment while the order is still unassigned, its installer never
   * rejected it, has fewer than `maxActiveJobs` active jobs, and has no active
   * booking in the same date/time slot. The installer is held so concurrent
   * workers cannot consume the last place or double-book the slot.
   */
  assignIfRoom(order: StoredInstallationOrder, maxActiveJobs: number): Promise<AssignmentOutcome>;
  /**
   * Hands a rejected offer back: writes the order (unassigned, no installer) and
   * the rejection together, only while it is still assigned to the rejecting installer.
   */
  rejectOffer(order: StoredInstallationOrder, rejection: StoredOfferRejection): Promise<boolean>;
  /** Oldest first. */
  findOfferRejections(orderIds: string[]): Promise<StoredOfferRejection[]>;
  /**
   * Stamps reminder_sent_at on orders in `statuses` booked for `day` that have
   * no reminder yet, and returns them. Each order is claimed by one caller only.
   */
  claimReminders(statuses: readonly InstallationOrderStatus[], day: Date, now: Date): Promise<StoredInstallationOrder[]>;
  /** Moves orders in `from` dated before `before` to overdue; returns the orders this call moved. */
  markOverdue(from: readonly InstallationOrderStatus[], before: Date, now: Date): Promise<StoredInstallationOrder[]>;
  nextOrderNumber(): Promise<string>;
  /**
   * Writes the order's status and step stamps only while it is still `from`,
   * so two concurrent moves cannot both apply. False when the other one won.
   */
  transition(order: StoredInstallationOrder, from: InstallationOrderStatus): Promise<boolean>;
  /**
   * Writes the details, status and step stamps only while the order is still `from`.
   * The reminder stamp is left to the sweep unless `clearReminder` (a reschedule).
   */
  saveDetails(order: StoredInstallationOrder, from: InstallationOrderStatus, options?: { clearReminder?: boolean }): Promise<boolean>;
  saveInstallerNotes(
    orderId: string,
    notes: string | null,
    statuses: readonly InstallationOrderStatus[],
    now: Date,
  ): Promise<boolean>;

  findTicks(orderId: string): Promise<StoredChecklistTick[]>;
  saveTick(tick: StoredChecklistTick): Promise<void>;
  deleteTick(orderId: string, itemKey: string): Promise<void>;
  saveEvidence(evidence: StoredInstallationEvidence): Promise<void>;
  findEvidence(orderId: string): Promise<StoredInstallationEvidence[]>;
  /** False when no such photo is on the order. */
  deleteEvidence(orderId: string, evidenceId: string): Promise<boolean>;

  replaceAssignments(
    orderId: string,
    assignments: StoredDeviceAssignment[],
  ): Promise<void>;
  findAssignments(orderId: string): Promise<StoredDeviceAssignment[]>;
  findAssignmentByFleetDeviceId(fleetDeviceId: string): Promise<StoredDeviceAssignment | null>;
  saveAssignment(assignment: StoredDeviceAssignment): Promise<void>;
  /** The order, its units, ticks, evidence and offer rejections. Evidence files are the caller's to remove first. */
  deleteForApplication(applicationId: string): Promise<void>;
  /** False when the order already has feedback. */
  saveFeedback(feedback: StoredInstallationFeedback): Promise<boolean>;
  findFeedback(orderId: string): Promise<StoredInstallationFeedback | null>;
  /** Orders per installer and status, in one query. */
  countByInstaller(installerIds: string[]): Promise<InstallerJobCount[]>;
}

export const INSTALLATION_ORDER_REPOSITORY = Symbol(
  'INSTALLATION_ORDER_REPOSITORY',
);
