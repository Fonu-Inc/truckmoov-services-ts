import { Inject, Injectable } from '@nestjs/common';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { TOKEN_SERVICE, USER_REPOSITORY } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import {
  INSTALLATION_ORDER_STATUSES,
  TERMINAL_JOB_STATUSES,
  type InstallationOrderStatus,
} from '@auth/installation/domain/installation-order';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
  type StoredDeviceAssignment,
  type StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';
import {
  INSTALLATION_JOB_READER,
  type InstallationJobReader,
  type JobFilters,
  type JobRow,
  type JobSort,
} from '@auth/installation/domain/installation-job.reader';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
  type StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import {
  DeviceAlreadyBoundError,
  FleetDeviceRefusedError,
  FleetUnavailableError,
  InstallationJobClosedError,
  InstallationJobNotFoundError,
} from '@auth/installation/domain/installation-job.errors';
import {
  JOB_DEVICE_LOOKUP,
  type JobDevice,
  type JobDeviceLookup,
} from '@auth/installation/domain/ports/job-device-lookup.port';
import { INSTALLATION_JOB_CONTEXT } from '@auth/installation/domain/installer-support';
import { pairUnitsWithDevices } from '@auth/installation/domain/unit-device-pairing';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { SIM_REPOSITORY, type SimRepository } from '../../../../sim.repository';
import { AccessResolver } from '../../../../access-resolver';
import {
  SUPPORT_TICKET_REPOSITORY,
  ticketDisplayId,
  type StoredSupportTicket,
  type SupportTicketRepository,
} from '../../../../support-ticket.repository';
import { ActivityLogService } from '../../../../activity-log.service';
import { lagosDayBounds, nextCalendarDay } from '@shared/devices';
import { pageOf } from './support/paging';
import { calendarDay } from './installer-jobs.use-cases';
import { devicesForJobs, toFeedbackView, toJobDetail, toJobListItem } from './support/installation-job.views';
import { requireStaff, type Staff } from './support/platform-staff';

export type ListInstallationOrdersQuery = {
  /** Any of these; all when absent. */
  statuses?: InstallationOrderStatus[];
  installerId?: string;
  search?: string;
  tenantType?: string;
  assigned?: boolean;
  /** Inclusive YYYY-MM-DD bounds: scheduled is the booked calendar date, the rest Lagos days (completed covers cancellation). */
  scheduledFrom?: string;
  scheduledTo?: string;
  startedFrom?: string;
  startedTo?: string;
  completedFrom?: string;
  completedTo?: string;
  createdFrom?: string;
  createdTo?: string;
  sort?: JobSort;
  page?: number;
  limit?: number;
};

const storedDay = (field: string, value: string) => new Date(`${calendarDay(field, value)}T00:00:00Z`);
const lagosFrom = (field: string, value?: string) => (value ? lagosDayBounds(calendarDay(field, value)).start : undefined);
const lagosBefore = (field: string, value?: string) => (value ? lagosDayBounds(calendarDay(field, value)).end : undefined);

function adminJobFilters(query: ListInstallationOrdersQuery): JobFilters {
  return {
    installerId: query.installerId,
    search: query.search,
    tenantType: query.tenantType,
    assigned: query.assigned,
    scheduledFrom: query.scheduledFrom ? storedDay('scheduledFrom', query.scheduledFrom) : undefined,
    scheduledBefore: query.scheduledTo ? nextCalendarDay(storedDay('scheduledTo', query.scheduledTo)) : undefined,
    startedFrom: lagosFrom('startedFrom', query.startedFrom),
    startedBefore: lagosBefore('startedTo', query.startedTo),
    completedFrom: lagosFrom('completedFrom', query.completedFrom),
    completedBefore: lagosBefore('completedTo', query.completedTo),
    createdFrom: lagosFrom('createdFrom', query.createdFrom),
    createdBefore: lagosBefore('createdTo', query.createdTo),
    sort: query.sort ?? 'newest',
  };
}

function installerSummary(installer: StoredInstaller | undefined) {
  return installer ? { id: installer.id, code: installer.code, fullName: installer.fullName } : null;
}

function issueSummary(ticket: StoredSupportTicket | undefined) {
  return ticket ? { id: ticket.id, displayId: ticketDisplayId(ticket.ticketNumber) } : null;
}

/** Platform admin's view of every installation job, and binding a fleet device to each unit. */
@Injectable()
export class ManageInstallationOrdersUseCases {
  constructor(
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(INSTALLATION_JOB_READER) private readonly jobs: InstallationJobReader,
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(JOB_DEVICE_LOOKUP) private readonly devices: JobDeviceLookup,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AccessResolver) private readonly access: AccessResolver,
    @Inject(ActivityLogService) private readonly activity: ActivityLogService,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly tickets: SupportTicketRepository,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY) private readonly applications: OnboardingApplicationRepository,
    @Inject(SIM_REPOSITORY) private readonly sims: SimRepository,
  ) {}

  async list(accessToken: string, query: ListInstallationOrdersQuery) {
    await this.staff(accessToken, 'admin.installations.read');
    const { page, limit } = pageOf(query);
    const filters = adminJobFilters(query);
    // Tab badges: the same filters with the status left out.
    const [found, ...counts] = await Promise.all([
      this.jobs.list({ ...filters, statuses: query.statuses?.length ? query.statuses : undefined }, { page, limit }),
      ...INSTALLATION_ORDER_STATUSES.map((status) => this.jobs.count({ ...filters, statuses: [status] })),
    ]);
    const countsByStatus = Object.fromEntries(INSTALLATION_ORDER_STATUSES.map((status, i) => [status, counts[i]]));
    return { items: await this.items(found.items), page, limit, total: found.total, countsByStatus };
  }

  /** One job with its units, checklist and evidence, plus every installer who rejected the offer. */
  async detail(accessToken: string, orderId: string) {
    await this.staff(accessToken, 'admin.installations.read');
    const [row] = (await this.jobs.list({ orderId }, { page: 1, limit: 1 })).items;
    if (!row) throw new InstallationJobNotFoundError();
    const order = row.order;

    const [application, assignments, vehicles, ticks, evidence, rejections, feedback] = await Promise.all([
      this.applications.findById(order.applicationId),
      this.orders.findAssignments(order.id),
      this.applications.findVehiclesByApplicationId(order.applicationId),
      this.orders.findTicks(order.id),
      this.orders.findEvidence(order.id),
      this.orders.findOfferRejections([order.id]),
      this.orders.findFeedback(order.id),
    ]);
    const deviceIds = assignments.flatMap((assignment) => (assignment.fleetDeviceId ? [assignment.fleetDeviceId] : []));
    const [devices, sims, installers] = await Promise.all([
      devicesForJobs(this.devices, deviceIds.map((deviceId) => ({ tenantId: order.tenantId, deviceId }))),
      this.sims.findByDeviceIds(deviceIds),
      this.installersById([...new Set([order.installerId, ...rejections.map((r) => r.installerId)])].filter((id): id is string => !!id)),
    ]);

    const detail = toJobDetail({
      order,
      application,
      assignments,
      vehicles,
      devices,
      sims: sims.filter((sim) => sim.tenantId === order.tenantId),
      installer: installers.get(order.installerId ?? '') ?? null,
      ticks,
      evidence,
    });

    return {
      ...detail,
      offerRejections: rejections.map((rejection) => ({
        installerId: rejection.installerId,
        installerName: installers.get(rejection.installerId)?.fullName ?? null,
        reason: rejection.reason,
        rejectedAt: rejection.rejectedAt.toISOString(),
      })),
      feedback: toFeedbackView(feedback),
    };
  }

  /** The fleet device fitted as this unit. Fleet must say the order's own tenant holds it. */
  async bindUnitDevice(accessToken: string, orderId: string, deviceIndex: number, fleetDeviceId: string) {
    const staff = await this.staff(accessToken, 'admin.installations.manage');
    const order = await this.openOrder(orderId);
    const unit = await this.unit(order, deviceIndex);
    await this.assertDeviceFree(unit, fleetDeviceId);
    const device = await this.tenantDevice(order, fleetDeviceId);

    const bound = { ...unit, fleetDeviceId };
    await this.orders.saveAssignment(bound);
    await this.audit(staff, order, bound);
    return { index: bound.deviceIndex, vehicleId: bound.vehicleId, device };
  }

  /**
   * Fits the customer's free fleet devices to the unbound units of its open job, so nobody
   * binds each by hand. `assigned` limits it to devices just given to the tenant. A
   * device it cannot place is left for the manual bind.
   */
  async autoBindUnits(tenantId: string, actor: Staff | null, assigned?: string[]) {
    const order = await this.orders.findOpenByTenantId(tenantId);
    if (!order) return [];
    const units = await this.orders.findAssignments(order.id);
    if (units.every((unit) => unit.fleetDeviceId)) return [];

    const held = assigned ? await this.devices.forTenant(tenantId, assigned) : null;
    const candidates = assigned ? assigned.filter((id) => held?.has(id)) : await this.devices.unfittedForTenant(tenantId);
    const free: string[] = [];
    for (const id of candidates ?? []) {
      if (!(await this.orders.findAssignmentByFleetDeviceId(id))) free.push(id);
    }

    const bound: StoredDeviceAssignment[] = [];
    for (const unit of pairUnitsWithDevices(units, free)) {
      try {
        await this.orders.saveAssignment(unit);
      } catch (error) {
        // Another bind took this device first; the rest still fit.
        if (error instanceof DeviceAlreadyBoundError) continue;
        throw error;
      }
      bound.push(unit);
      await this.audit(actor, order, unit);
    }
    return bound.map((unit) => ({ orderNumber: order.orderNumber, deviceIndex: unit.deviceIndex, deviceId: unit.fleetDeviceId }));
  }

  private staff(accessToken: string, permission: 'admin.installations.read' | 'admin.installations.manage'): Promise<Staff> {
    return requireStaff({ tokens: this.tokens, access: this.access, users: this.users }, accessToken, permission);
  }

  private async items(rows: JobRow[]) {
    const orders = rows.map((row) => row.order);
    const [devices, installers, issues] = await Promise.all([
      devicesForJobs(this.devices, rows.map((row) => ({ tenantId: row.order.tenantId, deviceId: row.firstFleetDeviceId }))),
      this.installersById(orders.flatMap((order) => (order.installerId ? [order.installerId] : []))),
      this.latestIssues(orders),
    ]);
    return rows.map((row) => ({
      ...toJobListItem(row, devices),
      tenantId: row.order.tenantId,
      installer: installerSummary(installers.get(row.order.installerId ?? '')),
      issueTicket: issueSummary(issues.get(row.order.id)),
    }));
  }

  private async installersById(installerIds: string[]): Promise<Map<string, StoredInstaller>> {
    const ids = [...new Set(installerIds)];
    const found = await Promise.all(ids.map((id) => this.installers.findById(id)));
    return new Map(found.flatMap((installer) => (installer ? [[installer.id, installer] as const] : [])));
  }

  /** The newest issue report on each job waiting in issue_reported, in one query. */
  private async latestIssues(orders: StoredInstallationOrder[]): Promise<Map<string, StoredSupportTicket>> {
    const ids = orders.filter((order) => order.status === 'issue_reported').map((order) => order.id);
    const latest = new Map<string, StoredSupportTicket>();
    for (const ticket of await this.tickets.findByRelatedOrders(ids, INSTALLATION_JOB_CONTEXT)) {
      if (ticket.relatedOrderId && !latest.has(ticket.relatedOrderId)) latest.set(ticket.relatedOrderId, ticket);
    }
    return latest;
  }

  private async openOrder(orderId: string): Promise<StoredInstallationOrder> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new InstallationJobNotFoundError();
    if (TERMINAL_JOB_STATUSES.includes(order.status)) throw new InstallationJobClosedError();
    return order;
  }

  private async unit(order: StoredInstallationOrder, deviceIndex: number): Promise<StoredDeviceAssignment> {
    const unit = (await this.orders.findAssignments(order.id)).find((a) => a.deviceIndex === deviceIndex);
    if (!unit) throw new InstallationJobNotFoundError(`Unit ${deviceIndex} is not on this installation`);
    return unit;
  }

  private async assertDeviceFree(unit: StoredDeviceAssignment, fleetDeviceId: string): Promise<void> {
    const holder = await this.orders.findAssignmentByFleetDeviceId(fleetDeviceId);
    if (holder && holder.id !== unit.id) throw new DeviceAlreadyBoundError();
  }

  private async tenantDevice(order: StoredInstallationOrder, fleetDeviceId: string): Promise<JobDevice> {
    const devices = await this.devices.forTenant(order.tenantId, [fleetDeviceId]);
    if (!devices) throw new FleetUnavailableError();
    const device = devices.get(fleetDeviceId);
    if (!device) throw new FleetDeviceRefusedError("This device is not in the customer's fleet");
    return device;
  }

  private async audit(staff: Staff | null, order: StoredInstallationOrder, unit: StoredDeviceAssignment): Promise<void> {
    await this.activity.record({
      tenantId: SYSTEM_TENANT_ID,
      service: 'auth',
      action: 'system.installation.unit_bound',
      entityType: 'installation_order',
      entityId: order.id,
      summary: `Device bound to unit ${unit.deviceIndex} of ${order.orderNumber}${staff ? '' : ' automatically'}`,
      actorId: staff?.id,
      actorRole: staff?.role,
      actorEmail: staff?.email,
      metadata: { orderTenantId: order.tenantId, deviceIndex: unit.deviceIndex, fleetDeviceId: unit.fleetDeviceId },
    });
  }
}
