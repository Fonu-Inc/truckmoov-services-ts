import type { InstallationOrderStatus } from './installation-order';
import type { StoredInstallationOrder } from './installation-order.repository';

export type JobSort = 'scheduled' | 'completion' | 'newest';

export type JobFilters = {
  orderId?: string;
  installerId?: string;
  statuses?: readonly InstallationOrderStatus[];
  /** Contained in the job number, customer, address, city, state or a registration on the job's units. */
  search?: string;
  /** Stored calendar dates: [from, before). */
  scheduledFrom?: Date;
  scheduledBefore?: Date;
  /** Instants on completed_at, falling back to cancelled_at: [from, to). */
  completedFrom?: Date;
  completedBefore?: Date;
  /** Instants on started_at / created_at: [from, to). */
  startedFrom?: Date;
  startedBefore?: Date;
  createdFrom?: Date;
  createdBefore?: Date;
  /** The onboarding application's applicant type. */
  tenantType?: string;
  /** true: an installer is on the job; false: none is. */
  assigned?: boolean;
  sort?: JobSort;
};

export type JobPageRequest = { page: number; limit: number };

/** One job with what its list row shows, read across the onboarding tables. */
export type JobRow = {
  order: StoredInstallationOrder;
  customerName: string;
  /** The application's business email. */
  customerEmail: string | null;
  /** The onboarding application's applicant type, when it still exists. */
  tenantType: string | null;
  firstVehicle: { registrationNumber: string; make: string; model: string } | null;
  firstFleetDeviceId: string | null;
  vehicleCount: number;
  deviceCount: number;
};

/** A fleet device bound to one of an installer's jobs. */
export type DeviceScopeEntry = { tenantId: string; orderId: string; jobNumber: string; deviceId: string };

export type DeviceScopeQuery = {
  /** The installer's sign-in; only an active installer has a scope. */
  userId: string;
  statuses: readonly InstallationOrderStatus[];
  /** Completed jobs count too when completed_at falls in [from, before). */
  completedFrom: Date;
  completedBefore: Date;
};

export type ActivityMeasure = 'completed' | 'inProgress' | 'scheduled';

/** The order field each activity measure counts by month. */
export const ACTIVITY_MEASURES: Record<ActivityMeasure, 'completedAt' | 'startedAt' | 'scheduledDate'> = {
  completed: 'completedAt',
  inProgress: 'startedAt',
  scheduled: 'scheduledDate',
};

/** Instants [from, before), bounding whole Lagos months. */
export type MonthRange = { from: Date; before: Date };

/** month is the Lagos YYYY-MM. */
export type MonthlyCount = { month: string; count: number };

export type JobEventType = 'offered' | 'accepted' | 'started' | 'issue_reported' | 'completed' | 'cancelled';

/** The order stamp each event is read from, in lifecycle order. */
export const JOB_EVENT_STAMPS: Record<JobEventType, keyof StoredInstallationOrder> = {
  offered: 'assignedAt',
  accepted: 'acceptedAt',
  started: 'startedAt',
  issue_reported: 'issueReportedAt',
  completed: 'completedAt',
  cancelled: 'cancelledAt',
};

export type JobEvent = { type: JobEventType; orderId: string; jobNumber: string; occurredAt: Date };

export interface InstallationJobReader {
  list(filters: JobFilters, page: JobPageRequest): Promise<{ items: JobRow[]; total: number }>;
  count(filters: JobFilters): Promise<number>;
  deviceScope(query: DeviceScopeQuery): Promise<DeviceScopeEntry[]>;
  /** The installer's jobs, offers aside, per Lagos month of the measure's stamp, in one grouped query. */
  monthlyActivity(installerId: string, measure: ActivityMeasure, range: MonthRange): Promise<MonthlyCount[]>;
  /** The installer's newest job events, read from the order stamps in one query. Ties: later lifecycle step first. */
  recentEvents(installerId: string, limit: number): Promise<JobEvent[]>;
}

export const INSTALLATION_JOB_READER = Symbol('INSTALLATION_JOB_READER');
